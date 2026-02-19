import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

export type W54Outcome = {
  label?: string;
  odd?: number;
  type?: "1x2" | "total" | "fora"; // тип ставки
  value?: string | number; // значение для тотала/форы (например, "3.5", "-1.5")
};

export type W54Match = {
  matchId?: string;
  lineId?: string;
  detailUrl?: string; // URL to detail page (e.g., "/line/26730210/")
  league?: string;
  startTime?: string; // e.g. "19:45"
  startDate?: string; // e.g. "19.02"
  home?: string;
  away?: string;
  isLive?: boolean; // LIVE match indicator
  liveTime?: string; // e.g. "52'"
  livePeriod?: string; // e.g. "2-й тайм"
  score?: { home: number; away: number }; // Current score for LIVE matches
  outcomes?: W54Outcome[];
};

export type W54SnapshotResult = {
  source: "snapshot" | "live";
  matches: W54Match[];
  meta: {
    parsedAt: string;
    file: string;
    matchCount: number;
  };
};

function textTrim(s: string | null | undefined) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function parseOddFromText(s: string) {
  const m = s.replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Parses the provided snapshot HTML (your Parseinfo.html dump).
 * Note: the site uses CSS-module classnames, so we rely on stable prefixes like "DefaultLine_".
 */
/**
 * Parses HTML from a live URL (fetches and parses).
 */
export async function parseW54SnapshotHtmlFromUrl(
  url: string
): Promise<W54SnapshotResult> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const html = await res.text();
  return parseW54SnapshotHtml(html, url);
}

/**
 * Parses HTML string (from file or URL response).
 */
function parseW54SnapshotHtml(html: string, source: string): W54SnapshotResult {
  const $ = cheerio.load(html);
  const matches: W54Match[] = [];

  console.log(`[DEBUG] Starting to parse HTML, length: ${html.length}`);
  
  // Parse tables with structure: <table class="LinesGroup_group__oLThE">
  // First row is header with league title, rest are matches
  const $tables = $("table[class*='LinesGroup_group']");
  console.log(`[DEBUG] Found ${$tables.length} tables with LinesGroup_group`);
  
  $tables.each((_tableIdx, tableEl) => {
    const $table = $(tableEl);
    
    // Find league title in header row
    const $headerRow = $table.find("tr[class*='LinesGroup_header']").first();
    const $titleH2 = $headerRow.find("h2[class*='LinesGroup_title']");
    const titleButtons = $titleH2.find("button[class*='LinesGroup_titleLink'], button").toArray();
    const leagueParts = titleButtons.map((btn: any) => textTrim($(btn).text())).filter(Boolean);
    const league = leagueParts.length > 0 ? leagueParts.join(". ") : undefined;

    // Find all match rows (not header) - try multiple selectors to catch all matches
    let $matchRows = $table.find("tr[class*='DefaultLine_line']").filter((_i, row) => {
      const $row = $(row);
      return !$row.hasClass("LinesGroup_header");
    });
    
    // If no matches found with DefaultLine_line, try to find all tr elements that contain match data
    if ($matchRows.length === 0) {
      $matchRows = $table.find("tr").filter((_i, row) => {
        const $row = $(row);
        // Skip header rows
        if ($row.hasClass("LinesGroup_header")) return false;
        // Check if row has teams or match data
        const hasTeams = $row.find("div[class*='DefaultLine_teamsWrap'], div[class*='teamsWrap']").length > 0;
        const hasOutcomes = $row.find("button[data-outcome-alias], button[data-odd]").length > 0;
        return hasTeams || hasOutcomes;
      });
    }
    
    console.log(`[DEBUG] Found ${$matchRows.length} match rows in table ${_tableIdx + 1}`);

    $matchRows.each((_rowIdx, rowEl) => {
      const $row = $(rowEl);

      // Check if this is a LIVE match - use reliable indicators only
      const hasLiveClass = $row.hasClass("DefaultLine_highlighted");
      const hasLiveLabel = $row.find("[class*='DefaultLine_liveLabel']").length > 0;
      const hasScoreWrap = $row.find("[class*='DefaultLine_scoreWrap']").length > 0;
      
      // Only mark as live if we have clear indicators (class, label, or score wrap)
      const isLive = hasLiveClass || hasLiveLabel || hasScoreWrap;

      // Extract teams - try multiple selectors
      let teams = $row
        .find("div[class*='DefaultLine_teamsWrap'] > div")
        .toArray()
        .map((n) => textTrim($(n).text()))
        .filter(Boolean);
      
      // If no teams found, try alternative selectors
      if (teams.length < 2) {
        teams = $row
          .find("div[class*='teamsWrap'] > div, [class*='team']")
          .toArray()
          .map((n) => textTrim($(n).text()))
          .filter(Boolean);
      }
      
      if (teams.length < 2) {
        console.warn(`[DEBUG] Skipping row: not enough teams found (found ${teams.length})`);
        return;
      }
      
      console.log(`[DEBUG] Parsing match: ${teams[0]} vs ${teams[1]}, isLive: ${isLive}`);

      // Extract time and date (for non-LIVE matches)
      let time = textTrim($row.find(".auto_center_match_time").first().text());
      const date = textTrim($row.find(".auto_center_match_date").first().text());

      // For LIVE matches, extract live time and period
      let liveTime: string | undefined;
      let livePeriod: string | undefined;
      let score: { home: number; away: number } | undefined;

      if (isLive) {
        // Extract live time (e.g. "52'")
        const $matchInfo = $row.find("[class*='DefaultLine_matchInfo']");
        $matchInfo.each((_i, el) => {
          const text = textTrim($(el).text());
          if (text.includes("'") || text.match(/\d+/)) {
            if (!liveTime && text.match(/\d+'?/)) {
              liveTime = text;
            } else if (!livePeriod && (text.includes("тайм") || text.includes("половина"))) {
              livePeriod = text;
            }
          }
        });

        // Extract score
        const $scoreWrap = $row.find("[class*='DefaultLine_scoreWrap']");
        if ($scoreWrap.length > 0) {
          const scoreTexts = $scoreWrap.find("[class*='DefaultLine_score']").toArray();
          if (scoreTexts.length >= 2) {
            const homeScore = parseInt(textTrim($(scoreTexts[0]).text())) || 0;
            const awayScore = parseInt(textTrim($(scoreTexts[1]).text())) || 0;
            score = { home: homeScore, away: awayScore };
          }
        }
      }

      // Extract match/line IDs
      const firstBtn = $row.find("button[data-match-id][data-line-id]").first();
      const matchId = String(firstBtn.attr("data-match-id") || "");
      const lineId = String(firstBtn.attr("data-line-id") || "");

      // Extract detail page URL from <a class="DefaultLine_lineLink__...">
      // Try multiple selectors to find the link
      let $link = $row.find("a[class*='DefaultLine_lineLink']").first();
      if ($link.length === 0) {
        // Try finding link by href pattern
        $link = $row.find("a[href^='/line/']").first();
      }
      const detailUrl = $link.length > 0 ? String($link.attr("href") || "") : undefined;
      
      // Debug logging
      if (detailUrl) {
        console.log(`[DEBUG] Match: ${teams[0]} vs ${teams[1]}, detailUrl: ${detailUrl}`);
      } else {
        console.warn(`[DEBUG] No detailUrl found for match: ${teams[0]} vs ${teams[1]}`);
      }

      // First pass: extract values from title buttons (they may be disabled)
      let totalValue: string | undefined;
      let foraValue: string | undefined;
      
      $row.find("button[data-outcome-alias]").each((_btnIdx, btnEl) => {
        const $btn = $(btnEl);
        const alias = String($btn.attr("data-outcome-alias") || "").toLowerCase();
        
        if (alias === "total_title") {
          const text = textTrim($btn.find("span.OutcomeItem_odd__nnQ0F").text() || $btn.text());
          if (text) totalValue = text;
        } else if (alias === "fora_title") {
          const text = textTrim($btn.find("span.OutcomeItem_odd__nnQ0F").text() || $btn.text());
          if (text) foraValue = text;
        }
      });

      // Second pass: parse all outcome buttons with odds
      const outcomes: W54Outcome[] = [];

      $row.find("button[data-outcome-alias][data-odd]").each((_btnIdx, btnEl) => {
        const $btn = $(btnEl);
        const alias = String($btn.attr("data-outcome-alias") || "").toLowerCase();
        const odd = parseOddFromText(String($btn.attr("data-odd") || $btn.text()));
        
        if (!odd) return;

        // Main outcomes (1X2)
        if (alias === "1" || alias === "x" || alias === "2") {
          outcomes.push({
            label: alias.toUpperCase(),
            odd,
            type: "1x2"
          });
        }
        // Totals
        else if (alias === "total_over") {
          outcomes.push({
            label: "Тотал Б",
            odd,
            type: "total",
            value: totalValue
          });
        } else if (alias === "total_under") {
          outcomes.push({
            label: "Тотал М",
            odd,
            type: "total",
            value: totalValue
          });
        }
        // Foras
        else if (alias === "fora_one") {
          outcomes.push({
            label: "Фора 1",
            odd,
            type: "fora",
            value: foraValue
          });
        } else if (alias === "fora_two") {
          outcomes.push({
            label: "Фора 2",
            odd,
            type: "fora",
            value: foraValue
          });
        }
      });

      // Add match even if no outcomes found on main page - outcomes can be fetched from detail page
      const has1X2 = outcomes.some((o) => o.type === "1x2");
      if (!has1X2) {
        console.warn(`[DEBUG] Match ${teams[0]} vs ${teams[1]}: no 1X2 outcomes on main page (found ${outcomes.length} outcomes), but will add anyway - can fetch from detail page`);
      }
      
      console.log(`[DEBUG] Adding match: ${teams[0]} vs ${teams[1]}, outcomes: ${outcomes.length}, isLive: ${isLive}`);

      const key = matchId || `${teams[0]}__${teams[1]}__${time}__${date}`;

      matches.push({
        matchId: matchId || undefined,
        lineId: lineId || undefined,
        detailUrl: detailUrl || undefined,
        league: league,
        startTime: time || undefined,
        startDate: date || undefined,
        home: teams[0],
        away: teams[1],
        isLive: isLive || undefined,
        liveTime: liveTime || undefined,
        livePeriod: livePeriod || undefined,
        score: score || undefined,
        outcomes
      });
    });
  });

  console.log(`[DEBUG] Total matches found before deduplication: ${matches.length}`);
  
  // De-dup by matchId or home+away+time
  const unique: W54Match[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    const key = m.matchId || `${m.home || ""}__${m.away || ""}__${m.startTime || ""}__${m.startDate || ""}`;
    if (seen.has(key)) {
      console.log(`[DEBUG] Skipping duplicate match: ${m.home} vs ${m.away}`);
      continue;
    }
    seen.add(key);
    unique.push(m);
  }

  const liveCount = unique.filter(m => m.isLive).length;
  const regularCount = unique.length - liveCount;
  console.log(`[DEBUG] Final matches: ${unique.length} total (${liveCount} live, ${regularCount} regular)`);

  return {
    source: "live",
    matches: unique,
    meta: {
      parsedAt: new Date().toISOString(),
      file: source,
      matchCount: unique.length
    }
  };
}

export async function parseW54SnapshotHtmlFromFile(
  filePath: string
): Promise<W54SnapshotResult> {
  const fileCandidates = path.isAbsolute(filePath)
    ? [filePath]
    : [
        path.resolve(process.cwd(), filePath),
        path.resolve(process.cwd(), "..", filePath),
        path.resolve(process.cwd(), "..", "..", filePath)
      ];

  let abs: string | undefined;
  let html: string | undefined;
  let lastErr: unknown;
  for (const c of fileCandidates) {
    try {
      html = await fs.readFile(c, "utf8");
      abs = c;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!html || !abs) throw lastErr;
  return parseW54SnapshotHtml(html, abs);
}

