import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import * as cheerio from "cheerio";
import puppeteer from "puppeteer";

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
  // Add timestamp and random to prevent caching
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const urlWithCacheBuster = url.includes('?') 
    ? `${url}&_t=${timestamp}&_r=${random}`
    : `${url}?_t=${timestamp}&_r=${random}`;
  
  console.log(`[Parser] Fetching matches from URL: ${urlWithCacheBuster}`);
  console.log(`[Parser] Timestamp: ${new Date(timestamp).toISOString()}`);
  const fetchStart = Date.now();
  
  // Add unique request ID to completely bypass any cache
  const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const res = await fetch(urlWithCacheBuster, {
    method: 'GET',
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0, private",
      "Pragma": "no-cache",
      "Expires": "0",
      "If-Modified-Since": "0",
      "If-None-Match": "*",
      "X-Request-ID": requestId,
      "X-Request-Time": Date.now().toString(),
      "X-No-Cache": "1",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1"
    },
    cache: "no-store", // Prevent browser/Node.js fetch cache
    redirect: "follow"
  });
  
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  
  const html = await res.text();
  const fetchTime = Date.now() - fetchStart;
  
  // Log first 200 chars of HTML to verify we're getting fresh content
  const htmlPreview = html.substring(0, 200).replace(/\s+/g, ' ');
  console.log(`[Parser] Fetched ${html.length} bytes in ${fetchTime}ms from ${url}`);
  console.log(`[Parser] HTML preview: ${htmlPreview}...`);
  
  const result = parseW54SnapshotHtml(html, url);
  console.log(`[Parser] Parsed ${result.matches.length} matches from ${url}`);
  
  // Log first few match IDs to verify they're different
  if (result.matches.length > 0) {
    const firstMatches = result.matches.slice(0, 3).map(m => `${m.home} vs ${m.away} (${m.matchId || 'no-id'})`);
    console.log(`[Parser] First 3 matches: ${firstMatches.join('; ')}`);
  }
  
  return result;
}

/**
 * Parses HTML from URL using Puppeteer (for JavaScript-rendered content).
 */
export async function parseW54SnapshotHtmlFromUrlWithPuppeteer(
  url: string
): Promise<W54SnapshotResult> {
  // Add multiple cache-busting parameters to prevent caching
  const timestamp = Date.now();
  const random1 = Math.random().toString(36).substring(7);
  const random2 = Math.random().toString(36).substring(7);
  const random3 = Math.random().toString(36).substring(7);
  const separator = url.includes('?') ? '&' : '?';
  const urlWithCacheBuster = `${url}${separator}_t=${timestamp}&_r=${random1}&_n=${random2}&_c=${random3}&_v=${Date.now()}`;
  
  console.log(`[Parser] Fetching matches with Puppeteer from URL: ${urlWithCacheBuster}`);
  console.log(`[Parser] Timestamp: ${new Date(timestamp).toISOString()}`);
  
  let browser;
  let context;
  let uniqueUserDataDir: string | undefined;
  try {
    // Launch browser with aggressive cache-disabling flags
    // Use userDataDir with unique temp directory to prevent any cache persistence
    const tempDir = os.tmpdir();
    uniqueUserDataDir = path.join(tempDir, `puppeteer-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: uniqueUserDataDir, // Unique temp directory for each request
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-cache',
        '--disable-application-cache',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-extensions',
        '--disable-features=TranslateUI',
        '--disable-hang-monitor',
        '--disable-ipc-flooding-protection',
        '--disable-notifications',
        '--disable-offer-store-unmasked-wallet-cards',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-renderer-backgrounding',
        '--disable-sync',
        '--disable-translate',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--enable-automation',
        '--password-store=basic',
        '--use-mock-keychain',
        '--aggressive-cache-discard',
        '--disable-background-downloads',
        '--disable-plugins-discovery',
        '--disable-preconnect',
        '--disable-remote-fonts',
        '--disk-cache-size=0',
        '--media-cache-size=0',
        '--v8-cache-options=off'
      ]
    });
    
    // Use incognito context for complete isolation - NO cache sharing
    context = await browser.createIncognitoBrowserContext();
    const page = await context.newPage();
    
    // Use unique User-Agent for each request
    const userAgentVersion = Math.floor(Math.random() * 50) + 120;
    await page.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${userAgentVersion}.0.0.0 Safari/537.36`
    );
    
    // Disable all caching completely
    await page.setCacheEnabled(false);
    
    // Add unique request ID with more randomness
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(7)}-${Math.random().toString(36).substring(7)}`;
    const requestTime = Date.now().toString();
    
    // Enable CDP session for cache control
    const client = await page.target().createCDPSession();
    
    // Aggressively disable all caching
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Network.enable');
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');
    
    // Set extra headers to prevent caching
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0, private, no-transform',
      'Pragma': 'no-cache',
      'Expires': '0',
      'If-Modified-Since': '0',
      'If-None-Match': '*',
      'X-Request-ID': requestId,
      'X-Request-Time': requestTime,
      'X-No-Cache': '1',
      'X-Cache-Control': 'no-cache',
      'X-Pragma': 'no-cache'
    });
    
    // Intercept and modify ALL requests to add aggressive cache-busting
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const headers = request.headers();
      
      // Add cache-busting to all headers
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0, private, no-transform';
      headers['Pragma'] = 'no-cache';
      headers['Expires'] = '0';
      headers['If-Modified-Since'] = '0';
      headers['If-None-Match'] = '*';
      headers['X-Request-ID'] = requestId;
      headers['X-No-Cache'] = '1';
      headers['X-Cache-Control'] = 'no-cache';
      
      // Modify URL to add cache-busting if it's the main request
      let url = request.url();
      if (!url.includes('_t=') && !url.includes('_r=')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}_t=${Date.now()}&_r=${Math.random().toString(36).substring(7)}&_n=${Math.random().toString(36).substring(7)}`;
      }
      
      request.continue({ headers, url });
    });
    
    console.log(`[Parser] Navigating to: ${urlWithCacheBuster}`);
    
    // Clear all storage before navigation
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        // Clear IndexedDB
        if ('indexedDB' in window) {
          indexedDB.databases().then(databases => {
            databases.forEach(db => {
              if (db.name) {
                indexedDB.deleteDatabase(db.name);
              }
            });
          });
        }
      } catch (e) {
        console.warn('Storage clear error:', e);
      }
    });
    
    // Navigate with no cache
    console.log(`[Parser] First navigation to: ${urlWithCacheBuster}`);
    await page.goto(urlWithCacheBuster, {
      waitUntil: 'networkidle2',
      timeout: 60000, // Increased timeout to 60 seconds
      cache: false // Additional cache prevention
    });
    
    // Wait 5 seconds after first navigation to ensure page is fully loaded
    console.log(`[Parser] Waiting 5 seconds after first navigation for page to fully load...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Clear cache after first navigation
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');
    
    // Clear storage again after navigation
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
    });
    
    // Force reload to bypass any cached content
    console.log(`[Parser] Force reloading page to bypass cache...`);
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait 5 seconds after first reload
    console.log(`[Parser] Waiting 5 seconds after first reload for page to fully load...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Clear cache again after reload
    await client.send('Network.clearBrowserCache');
    await client.send('Network.clearBrowserCookies');
    
    // Second reload for extra safety
    console.log(`[Parser] Second reload for fresh data...`);
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait 5 seconds after second reload
    console.log(`[Parser] Waiting 5 seconds after second reload for page to fully load...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Clear cache one more time
    await client.send('Network.clearBrowserCache');
    
    // Wait for matches to load with increased timeout
    try {
      await page.waitForSelector('table[class*="LinesGroup_group"], tr[class*="DefaultLine_line"]', { timeout: 20000 });
      console.log(`[Parser] Match selectors found`);
    } catch {
      console.warn(`[Parser] Match selectors not found, continuing anyway...`);
    }
    
    // Additional wait for React to render and ensure fresh data (5 seconds)
    console.log(`[Parser] Final wait 5 seconds for React to fully render content...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Force evaluate to get fresh content - get HTML directly from DOM
    const html = await page.evaluate(() => {
      // Clear any cached data in memory
      if (window.location) {
        window.location.reload = window.location.reload;
      }
      return document.documentElement.outerHTML;
    });
    console.log(`[Parser] Got ${html.length} bytes of HTML from Puppeteer`);
    
    // Log a sample of HTML to verify it's fresh
    const htmlSample = html.substring(0, 500).replace(/\s+/g, ' ');
    console.log(`[Parser] HTML sample: ${htmlSample}...`);
    
    // Close context and browser to ensure no cache persists
    await context.close();
    await browser.close();
    
    // Clean up temp directory
    try {
      if (uniqueUserDataDir && fsSync.existsSync(uniqueUserDataDir)) {
        fsSync.rmSync(uniqueUserDataDir, { recursive: true, force: true });
        console.log(`[Parser] Cleaned up temp directory: ${uniqueUserDataDir}`);
      }
    } catch (cleanupErr) {
      console.warn(`[Parser] Could not clean up temp directory: ${cleanupErr}`);
    }
    
    const result = parseW54SnapshotHtml(html, url);
    console.log(`[Parser] Parsed ${result.matches.length} matches using Puppeteer`);
    
    if (result.matches.length > 0) {
      const firstMatches = result.matches.slice(0, 3).map(m => `${m.home} vs ${m.away} (${m.matchId || 'no-id'})`);
      console.log(`[Parser] First 3 matches: ${firstMatches.join('; ')}`);
    }
    
    return result;
  } catch (e: any) {
    // Ensure cleanup even on error
    if (context) {
      try {
        await context.close();
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    // Clean up temp directory on error
    try {
      if (uniqueUserDataDir && fsSync.existsSync(uniqueUserDataDir)) {
        fsSync.rmSync(uniqueUserDataDir, { recursive: true, force: true });
      }
    } catch {}
    throw e;
  }
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
  let $tables = $("table[class*='LinesGroup_group']");
  console.log(`[DEBUG] Found ${$tables.length} tables with LinesGroup_group`);
  
  // Also check for other possible containers
  const $allTables = $("table");
  const $divGroups = $("div[class*='LinesGroup'], div[class*='Group']");
  console.log(`[DEBUG] Total tables in HTML: ${$allTables.length}`);
  console.log(`[DEBUG] Divs with Group classes: ${$divGroups.length}`);
  
  // If no tables found with LinesGroup_group, try to find any tables
  if ($tables.length === 0) {
    console.log(`[DEBUG] No LinesGroup_group tables found, trying all tables...`);
    $tables = $allTables;
    console.log(`[DEBUG] Found ${$tables.length} total tables`);
    
    // Log ALL tables to see their structure
    $tables.each((idx, table) => {
      const $table = $(table);
      const classes = $table.attr('class') || '';
      const rows = $table.find('tr').length;
      const hasDefaultLineCells = $table.find("td[class*='DefaultLine_cell']").length;
      const hasMatchRows = $table.find("tr[class*='DefaultLine_line'], tr[class*='Line']").length;
      const hasMatchIds = $table.find("[data-match-id]").length;
      console.log(`[DEBUG] Table ${idx + 1}: classes="${classes.substring(0, 100)}", rows=${rows}, DefaultLine_cell=${hasDefaultLineCells}, match rows=${hasMatchRows}, match-ids=${hasMatchIds}`);
    });
  } else {
    // Log found tables with LinesGroup_group
    console.log(`[DEBUG] Found ${$tables.length} tables with LinesGroup_group`);
    $tables.each((idx, table) => {
      const $table = $(table);
      const classes = $table.attr('class') || '';
      const rows = $table.find('tr').length;
      const hasDefaultLineCells = $table.find("td[class*='DefaultLine_cell']").length;
      console.log(`[DEBUG] Table ${idx + 1}: rows=${rows}, DefaultLine_cell=${hasDefaultLineCells}`);
    });
  }
  
  $tables.each((_tableIdx, tableEl) => {
    const $table = $(tableEl);
    
    // Find league title in header row
    const $headerRow = $table.find("tr[class*='LinesGroup_header']").first();
    const $titleH2 = $headerRow.find("h2[class*='LinesGroup_title']");
    const titleButtons = $titleH2.find("button[class*='LinesGroup_titleLink'], button").toArray();
    const leagueParts = titleButtons.map((btn: any) => textTrim($(btn).text())).filter(Boolean);
    const league = leagueParts.length > 0 ? leagueParts.join(". ") : undefined;

    // Find all match rows (not header) - try multiple selectors to catch all matches
    // NEW STRUCTURE: Look for rows with DefaultLine_cell first (more reliable)
    let $matchRows = $table.find("tr").filter((_i, row) => {
      const $row = $(row);
      // Skip header rows
      if ($row.hasClass("LinesGroup_header")) return false;
      // Check if row has DefaultLine_cell (new structure indicator)
      const hasCells = $row.find("td[class*='DefaultLine_cell']").length > 0;
      return hasCells;
    });
    
    // If no matches found with DefaultLine_cell, try DefaultLine_line (old structure)
    if ($matchRows.length === 0) {
      $matchRows = $table.find("tr[class*='DefaultLine_line']").filter((_i, row) => {
        const $row = $(row);
        return !$row.hasClass("LinesGroup_header");
      });
    }
    
    // If still no matches, try to find all tr elements that contain match data
    if ($matchRows.length === 0) {
      console.log(`[DEBUG] No DefaultLine_cell/DefaultLine_line rows found in table ${_tableIdx + 1}, trying alternative selectors...`);
      const allRows = $table.find("tr");
      console.log(`[DEBUG] Total rows in table: ${allRows.length}`);
      
      $matchRows = $table.find("tr").filter((_i, row) => {
        const $row = $(row);
        // Skip header rows
        if ($row.hasClass("LinesGroup_header")) return false;
        // Check if row has teams or match data
        const hasTeams = $row.find("div[class*='DefaultLine_teamsWrap'], div[class*='teamsWrap'], [class*='team']").length > 0;
        const hasOutcomes = $row.find("button[data-outcome-alias], button[data-odd], button[class*='outcome']").length > 0;
        const hasMatchId = $row.find("button[data-match-id], [data-match-id]").length > 0;
        // Also check for cells with multiple td elements (likely a match row)
        const hasMultipleCells = $row.find("td").length >= 3;
        return hasTeams || hasOutcomes || hasMatchId || hasMultipleCells;
      });
      console.log(`[DEBUG] Found ${$matchRows.length} alternative match rows in table ${_tableIdx + 1}`);
      
      // If still no rows, try even broader search - all rows with td
      if ($matchRows.length === 0 && allRows.length > 1) {
        console.log(`[DEBUG] Still no rows found, trying to parse all non-header rows with td...`);
        $matchRows = allRows.filter((_i, row) => {
          const $row = $(row);
          return !$row.hasClass("LinesGroup_header") && $row.find("td").length >= 2;
        });
        console.log(`[DEBUG] Found ${$matchRows.length} rows after broad search`);
      }
    }
    
    console.log(`[DEBUG] Found ${$matchRows.length} match rows in table ${_tableIdx + 1} (league: ${league || 'unknown'})`);
    
    // Count LIVE vs non-LIVE in this table
    let liveInTable = 0;
    let nonLiveInTable = 0;
    $matchRows.each((_rowIdx, rowEl) => {
      const $row = $(rowEl);
      const hasLiveClass = $row.hasClass("DefaultLine_highlighted");
      const hasLiveLabel = $row.find("[class*='DefaultLine_liveLabel']").length > 0;
      const hasScoreWrap = $row.find("[class*='DefaultLine_scoreWrap']").length > 0;
      if (hasLiveClass || hasLiveLabel || hasScoreWrap) {
        liveInTable++;
      } else {
        nonLiveInTable++;
      }
    });
    console.log(`[DEBUG] Table ${_tableIdx + 1} breakdown: ${liveInTable} LIVE, ${nonLiveInTable} non-LIVE rows`);

    $matchRows.each((_rowIdx, rowEl) => {
      const $row = $(rowEl);

      // Check if this is a LIVE match - use reliable indicators only
      // Be more strict: LIVE matches should have actual score or live time displayed
      const hasLiveClass = $row.hasClass("DefaultLine_highlighted");
      const hasLiveLabel = $row.find("[class*='DefaultLine_liveLabel'], [class*='liveLabel']").length > 0;
      const $scoreWrap = $row.find("[class*='DefaultLine_scoreWrap'], [class*='scoreWrap']");
      const hasScoreWrap = $scoreWrap.length > 0;
      
      // Check if score wrap actually contains score numbers (not just empty)
      let hasActualScore = false;
      if (hasScoreWrap) {
        const scoreTexts = $scoreWrap.find("[class*='DefaultLine_score'], [class*='score']").toArray();
        if (scoreTexts.length >= 2) {
          const homeScoreText = textTrim($(scoreTexts[0]).text());
          const awayScoreText = textTrim($(scoreTexts[1]).text());
          const homeScore = parseInt(homeScoreText);
          const awayScore = parseInt(awayScoreText);
          // Score exists if both are valid numbers (even 0-0 is a valid score)
          hasActualScore = !isNaN(homeScore) && !isNaN(awayScore) && homeScoreText !== '' && awayScoreText !== '';
        }
      }
      
      // Check for live time indicators (e.g., "45'", "2-й тайм", "Перерыв")
      const matchInfoText = $row.find("[class*='DefaultLine_matchInfo'], [class*='matchInfo']").text();
      const hasLiveTime = matchInfoText.match(/\d+'|тайм|половина|Перерыв/i);
      
      // Only mark as live if we have clear indicators:
      // 1. Live class OR
      // 2. Live label OR  
      // 3. Score wrap with actual score numbers (not just empty elements) OR
      // 4. Live time indicators in match info
      const isLive = hasLiveClass || hasLiveLabel || (hasScoreWrap && hasActualScore) || !!hasLiveTime;

      // Extract teams - try multiple selectors
      let teams = $row
        .find("div[class*='DefaultLine_teamsWrap'] > div")
        .toArray()
        .map((n) => textTrim($(n).text()))
        .filter(Boolean);
      
      // If no teams found, try alternative selectors
      if (teams.length < 2) {
        teams = $row
          .find("div[class*='teamsWrap'] > div, [class*='team'], [class*='Team']")
          .toArray()
          .map((n) => textTrim($(n).text()))
          .filter(Boolean);
      }
      
      // Try even more alternative selectors if still no teams
      if (teams.length < 2) {
        // Look for text in cells that might contain team names
        const $cells = $row.find("td");
        $cells.each((_i, cell) => {
          const text = textTrim($(cell).text());
          // Skip if text looks like a time, date, or odd
          if (text && !text.match(/^\d+[':]?$/) && !text.match(/^\d+\.\d+$/) && !text.match(/^\d{1,2}\.\d{1,2}$/)) {
            if (text.length > 2 && text.length < 50) {
              teams.push(text);
            }
          }
        });
        teams = teams.filter(Boolean).slice(0, 2); // Take only first 2
      }
      
      if (teams.length < 2) {
        console.warn(`[DEBUG] Skipping row: not enough teams found (found ${teams.length})`);
        return;
      }
      
      console.log(`[DEBUG] Parsing match: ${teams[0]} vs ${teams[1]}, isLive: ${isLive} (hasLiveClass: ${hasLiveClass}, hasLiveLabel: ${hasLiveLabel}, hasScoreWrap: ${hasScoreWrap}, hasActualScore: ${hasActualScore}, hasLiveTime: ${!!hasLiveTime})`);

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
        
        // Skip cancelled/disabled outcomes
        const isDisabled = $btn.hasClass("OutcomeItem_disabled") || 
                          $btn.hasClass("disabled") || 
                          $btn.prop("disabled") ||
                          $btn.attr("disabled") !== undefined;
        
        const dataOdd = String($btn.attr("data-odd") || "");
        const buttonText = textTrim($btn.text());
        
        // Skip if disabled, empty odd, or shows "-" (cancelled)
        if (isDisabled || !dataOdd || dataOdd === "" || buttonText === "-" || buttonText === "") {
          return;
        }
        
        const alias = String($btn.attr("data-outcome-alias") || "").toLowerCase();
        const odd = parseOddFromText(dataOdd || buttonText);
        
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
  
  // If we found very few matches, try searching in div containers as well
  // (maybe non-LIVE matches are in divs, not tables)
  if (matches.length < 50) {
    console.log(`[DEBUG] Found only ${matches.length} matches, trying to search in div containers...`);
    const $divContainers = $("div[class*='LinesGroup'], div[class*='Group']");
    console.log(`[DEBUG] Found ${$divContainers.length} div containers with Group classes`);
    
    // Try to find match rows in divs
    $divContainers.each((_divIdx, divEl) => {
      const $div = $(divEl);
      const $divRows = $div.find("tr, div[class*='Line'], div[class*='line']");
      
      if ($divRows.length > 0) {
        console.log(`[DEBUG] Div container ${_divIdx + 1}: found ${$divRows.length} potential match rows`);
        // Process similar to table rows
        $divRows.each((_rowIdx, rowEl) => {
          const $row = $(rowEl);
          
          // Check if this looks like a match row
          const hasCells = $row.find("td[class*='DefaultLine_cell']").length > 0;
          const hasMatchId = $row.find("[data-match-id]").length > 0;
          const hasTeams = $row.find("div[class*='team'], div[class*='Team']").length > 0;
          
          if (hasCells || hasMatchId || hasTeams) {
            // This might be a match row - try to parse it
            // (similar logic to table parsing, but simplified)
            const matchId = $row.find("[data-match-id]").first().attr("data-match-id");
            if (matchId) {
              // Check if we already have this match
              const existing = matches.find(m => m.matchId === matchId);
              if (!existing) {
                console.log(`[DEBUG] Found potential match in div container: matchId=${matchId}`);
                // Could add parsing logic here if needed
              }
            }
          }
        });
      }
    });
  }
  
  console.log(`[DEBUG] Total matches found before deduplication: ${matches.length}`);
  
  // Log breakdown by LIVE status
  const liveMatches = matches.filter(m => m.isLive).length;
  const nonLiveMatches = matches.filter(m => !m.isLive).length;
  console.log(`[DEBUG] Matches breakdown: ${liveMatches} LIVE, ${nonLiveMatches} non-LIVE`);
  
  // If we only found LIVE matches, warn about potential issue
  if (nonLiveMatches === 0 && matches.length > 0) {
    console.warn(`[DEBUG] ⚠️ WARNING: Only LIVE matches found (${liveMatches}). This might indicate:`);
    console.warn(`[DEBUG]   1. All matches on page are actually LIVE`);
    console.warn(`[DEBUG]   2. Non-LIVE matches are in different structure/containers`);
    console.warn(`[DEBUG]   3. Parser is only finding LIVE section`);
    console.warn(`[DEBUG] Total tables processed: ${$tables.length}`);
    console.warn(`[DEBUG] Total rows processed: ${matches.length}`);
  }
  
  // Log summary of what was found
  if (matches.length === 0) {
    console.warn(`[DEBUG] ⚠️ No matches found! This might indicate a structure change.`);
    console.warn(`[DEBUG] HTML length: ${html.length}`);
    console.warn(`[DEBUG] Tables found: ${$tables.length}`);
    const allRows = $("tr").length;
    console.warn(`[DEBUG] Total <tr> elements: ${allRows}`);
    const allButtons = $("button[data-outcome-alias], button[data-odd]").length;
    console.warn(`[DEBUG] Total outcome buttons: ${allButtons}`);
  }
  
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

/**
 * Updates ParseInfoNew.html with the MainLayout element from the live page.
 * Fetches the page using Puppeteer, extracts the element, and saves it to the file.
 */
export async function updateParseInfoNewFromLive(): Promise<string> {
  const url = "https://w54rjjmb.com/sport?lc=1&ss=all";
  const targetClasses = "MainLayout_root__rqxHz MainLayout_withLeftSide__OMWDb MainLayout_withRightSide__Hpdej";
  
  console.log(`[Update] Fetching MainLayout element from ${url}`);
  
  let browser;
  let uniqueUserDataDir: string | undefined;
  
  try {
    // Launch browser with unique temp directory (same approach as working function)
    const tempDir = os.tmpdir();
    uniqueUserDataDir = path.join(tempDir, `puppeteer-update-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    
    browser = await puppeteer.launch({
      headless: true,
      userDataDir: uniqueUserDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-cache',
        '--disable-application-cache',
      ]
    });
    
    // Use newPage directly instead of incognito context
    const page = await browser.newPage();
    
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    await page.setCacheEnabled(false);
    
    // Navigate to the page
    console.log(`[Update] Navigating to ${url}`);
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    
    // Switch language to English by clicking on UI elements
    console.log(`[Update] Switching language to English...`);
    try {
      // Wait for language switcher button to appear
      await page.waitForSelector('.CurrentLocale_switchButton__17blA', { timeout: 10000 });
      
      // Click on language switcher button to open dropdown
      console.log(`[Update] Clicking language switcher button...`);
      await page.click('.CurrentLocale_switchButton__17blA');
      
      // Wait for dropdown menu to appear (no delay, just wait for selector)
      await page.waitForSelector('.LocalesList_list__rbZ9E', { timeout: 5000 });
      
      // Find and click on EN button in the dropdown
      console.log(`[Update] Clicking EN language button...`);
      const enButtonClicked = await page.evaluate(() => {
        // Find all language buttons
        const buttons = document.querySelectorAll('.LocalesList_button__jtSPe');
        for (const btn of buttons) {
          const textSpan = btn.querySelector('.LocalesList_buttonText__pZAAv');
          const text = textSpan ? textSpan.textContent || '' : '';
          // Look for button with "EN" text (first one in the list)
          if (text.trim() === 'EN') {
            (btn as HTMLElement).click();
            return true;
          }
        }
        return false;
      });
      
      if (!enButtonClicked) {
        console.warn(`[Update] EN button not found in dropdown`);
      } else {
        // Wait 1 second for language to change
        console.log(`[Update] Waiting 1 second for language to change...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log(`[Update] Language switched to English successfully`);
      }
    } catch (err) {
      console.warn(`[Update] Failed to switch language via UI, continuing with default language:`, err);
    }
    
    // Wait for the MainLayout element to appear
    console.log(`[Update] Waiting for MainLayout element...`);
    try {
      // Wait for element with at least the root class
      await page.waitForSelector('.MainLayout_root__rqxHz', { timeout: 30000 });
    } catch (err) {
      console.warn(`[Update] Element not found with waitForSelector, continuing...`);
    }
    
    // Scroll down to load all content (lazy loading / infinite scroll) - no delays, maximum speed
    console.log(`[Update] Scrolling page to load all content...`);
    let previousHeight = 0;
    let currentHeight = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 50; // Increased since we're scrolling very fast
    let noChangeCount = 0; // Count consecutive times with no height change
    
    do {
      previousHeight = currentHeight;
      
      // Scroll to bottom
      currentHeight = await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      });
      
      // Smart wait: wait for height to change with minimal timeout
      try {
        await page.waitForFunction(
          (prevHeight) => document.body.scrollHeight > prevHeight,
          { timeout: 200, polling: 50 },
          previousHeight
        );
      } catch {
        // Timeout is expected if no new content loads
      }
      
      // Get current height after potential load
      currentHeight = await page.evaluate(() => document.body.scrollHeight);
      
      scrollAttempts++;
      
      if (currentHeight === previousHeight) {
        noChangeCount++;
        // If height didn't change 2 times in a row, we're done
        if (noChangeCount >= 2) {
          console.log(`[Update] No more content loading after ${scrollAttempts} attempts`);
          break;
        }
        // No delay - continue immediately
      } else {
        noChangeCount = 0; // Reset counter when content loads
        console.log(`[Update] Scroll ${scrollAttempts}: loaded more content (height: ${currentHeight})`);
      }
    } while (scrollAttempts < maxScrollAttempts);
    
    // Scroll back to top - no delay
    await page.evaluate(() => window.scrollTo(0, 0));
    
    console.log(`[Update] Finished scrolling in ${scrollAttempts} attempts`);
    
    // Extract the MainLayout element's HTML
    // Try multiple selector strategies
    const elementHtml = await page.evaluate((classes) => {
      const classList = classes.split(' ').filter(c => c.trim());
      
      // Strategy 1: Try to find element with all classes using querySelector
      // Build selector like: .MainLayout_root__rqxHz.MainLayout_withLeftSide__OMWDb.MainLayout_withRightSide__Hpdej
      const selector = classList.map(cls => `.${cls}`).join('');
      let element = document.querySelector(selector);
      
      if (element) {
        return element.outerHTML;
      }
      
      // Strategy 2: Find element that has all classes by checking each element
      // Start with elements that have the root class (more efficient)
      const rootClass = classList[0];
      const rootElements = document.querySelectorAll(`.${rootClass}`);
      
      for (const el of rootElements) {
        let hasAllClasses = true;
        for (const cls of classList) {
          if (!el.classList.contains(cls)) {
            hasAllClasses = false;
            break;
          }
        }
        if (hasAllClasses) {
          return el.outerHTML;
        }
      }
      
      // Strategy 3: If no element has all classes, find one with at least 2 classes
      for (const el of rootElements) {
        let matchCount = 0;
        for (const cls of classList) {
          if (el.classList.contains(cls)) {
            matchCount++;
          }
        }
        if (matchCount >= 2) {
          return el.outerHTML;
        }
      }
      
      // Strategy 4: Fallback - return first element with root class
      if (rootElements.length > 0) {
        return rootElements[0].outerHTML;
      }
      
      return null;
    }, targetClasses);
    
    if (!elementHtml) {
      throw new Error(`MainLayout element with classes "${targetClasses}" not found on the page`);
    }
    
    console.log(`[Update] Extracted MainLayout element (${elementHtml.length} bytes)`);
    
    // Find ParseInfoNew.html file path
    // The file should be in the project root (same level as bot folder)
    // When running from bot folder, go up one level
    const fileCandidates = [
      path.resolve(process.cwd(), "..", "ParseInfoNew.html"), // From bot/ folder
      path.resolve(process.cwd(), "ParseInfoNew.html"), // If already in root
      path.resolve(process.cwd(), "..", "..", "ParseInfoNew.html") // Fallback
    ];
    
    let filePath: string | undefined;
    for (const candidate of fileCandidates) {
      try {
        // Check if directory exists and is writable
        const dir = path.dirname(candidate);
        await fs.access(dir);
        filePath = candidate;
        console.log(`[Update] Will save to ${filePath}`);
        break;
      } catch {
        // Try next candidate
      }
    }
    
    if (!filePath) {
      // Use the first candidate (one level up from bot folder)
      filePath = fileCandidates[0];
      const dir = path.dirname(filePath);
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`[Update] Created directory ${dir}`);
      } catch (err) {
        console.warn(`[Update] Could not create directory ${dir}:`, err);
      }
    }
    
    // Save the element HTML to ParseInfoNew.html
    await fs.writeFile(filePath, elementHtml, "utf8");
    console.log(`[Update] Saved MainLayout element to ${filePath}`);
    
    // Cleanup
    await page.close();
    await browser.close();
    
    // Clean up temp directory
    try {
      if (uniqueUserDataDir && fsSync.existsSync(uniqueUserDataDir)) {
        fsSync.rmSync(uniqueUserDataDir, { recursive: true, force: true });
      }
    } catch (cleanupErr) {
      console.warn(`[Update] Could not clean up temp directory: ${cleanupErr}`);
    }
    
    return filePath;
  } catch (e: any) {
    // Ensure cleanup even on error
    if (context) {
      try {
        await context.close();
      } catch {}
    }
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
    try {
      if (uniqueUserDataDir && fsSync.existsSync(uniqueUserDataDir)) {
        fsSync.rmSync(uniqueUserDataDir, { recursive: true, force: true });
      }
    } catch {}
    
    console.error(`[Update] Error updating ParseInfoNew.html:`, e);
    throw e;
  }
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

