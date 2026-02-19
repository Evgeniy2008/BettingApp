import * as cheerio from "cheerio";
import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import path from "node:path";
import type { W54Outcome } from "./w54Snapshot";

export type W54DetailPageResult = {
  matchId?: string;
  lineId?: string;
  home?: string;
  away?: string;
  league?: string;
  outcomes: W54Outcome[];
  meta: {
    parsedAt: string;
    url: string;
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
 * Parses a detail page HTML (e.g., /line/26730210/) to extract all available odds.
 * Uses Puppeteer to render JavaScript content since the site is a SPA.
 */
export async function parseW54DetailPageFromUrl(
  url: string
): Promise<W54DetailPageResult> {
  // Ensure URL is absolute
  const baseUrl = url.startsWith("http") ? url : `https://w54rjjmb.com${url}`;
  
  // Add timestamp to prevent caching
  const urlWithCacheBuster = baseUrl.includes('?') 
    ? `${baseUrl}&_t=${Date.now()}`
    : `${baseUrl}?_t=${Date.now()}`;
  
  console.log(`[DEBUG] Fetching detail page from: ${urlWithCacheBuster}`);
  
  let browser;
  try {
    // Use Puppeteer to render JavaScript content
    console.log(`[DEBUG] Launching Puppeteer browser...`);
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    console.log(`[DEBUG] Browser launched successfully`);
    
    const page = await browser.newPage();
    
    // Set user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    // Disable caching
    await page.setCacheEnabled(false);
    
    // Navigate to the page
    console.log(`[DEBUG] Navigating to: ${urlWithCacheBuster}`);
    try {
      await page.goto(urlWithCacheBuster, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      console.log(`[DEBUG] Page loaded successfully`);
    } catch (navError: any) {
      console.error(`[DEBUG] Navigation error:`, navError?.message || navError);
      throw new Error(`Failed to navigate to page: ${navError?.message || String(navError)}`);
    }
    
    // Wait for outcomes to load - try multiple selectors
    console.log(`[DEBUG] Waiting for outcomes to load...`);
    let outcomesFound = false;
    
    // Try different selectors that might indicate content is loaded
    const selectors = [
      'button[data-outcome-odd]',
      '[class*="Group_group"]',
      '[class*="Outcome_root"]',
      '[class*="OutcomesGroups"]',
      'button[class*="Outcome"]'
    ];
    
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        console.log(`[DEBUG] Found outcomes using selector: ${selector}`);
        outcomesFound = true;
        break;
      } catch (e) {
        // Continue to next selector
      }
    }
    
    if (!outcomesFound) {
      console.warn(`[DEBUG] No outcomes selector found, waiting additional time...`);
    }
    
    // Additional wait for content to fully render (React might need more time)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get the rendered HTML
    const html = await page.content();
    console.log(`[DEBUG] HTML received, length: ${html.length} characters`);
    
    // Count outcomes in HTML for debugging
    const outcomeCount = (html.match(/data-outcome-odd/g) || []).length;
    console.log(`[DEBUG] Found ${outcomeCount} data-outcome-odd attributes in HTML`);
    
    // Optional: save HTML for debugging (uncomment if needed)
    // const debugPath = path.join(process.cwd(), 'debug_detail_page.html');
    // await fs.writeFile(debugPath, html);
    // console.log(`[DEBUG] HTML saved to: ${debugPath}`);
    
    return parseW54DetailPageHtml(html, baseUrl);
  } catch (error: any) {
    console.error(`[DEBUG] Error in parseW54DetailPageFromUrl:`, error);
    console.error(`[DEBUG] Error stack:`, error?.stack);
    throw new Error(`Failed to parse detail page: ${error?.message || String(error)}`);
  } finally {
    if (browser) {
      try {
        await browser.close();
        console.log(`[DEBUG] Browser closed`);
      } catch (closeError) {
        console.error(`[DEBUG] Error closing browser:`, closeError);
      }
    }
  }
}

/**
 * Parses HTML string from detail page.
 * Same approach as parseW54SnapshotHtml - just parse the HTML with cheerio.
 */
export function parseW54DetailPageHtml(
  html: string,
  url: string
): W54DetailPageResult {
  const $ = cheerio.load(html);
  const outcomes: W54Outcome[] = [];

  console.log(`[DEBUG] Parsing HTML from URL: ${url}`);
  console.log(`[DEBUG] HTML length: ${html.length} characters`);

  // Extract match info
  const matchId = $("button[data-match-id]").first().attr("data-match-id") || undefined;
  const lineId = $("button[data-line-id]").first().attr("data-line-id") || undefined;
  
  console.log(`[DEBUG] matchId: ${matchId}, lineId: ${lineId}`);

  // Extract teams - try multiple selectors
  let home: string | undefined;
  let away: string | undefined;
  
  // First try to find teams in MatchInfo block (TeamInfo_title)
  const $teamInfo = $("[class*='TeamInfo_title']");
  console.log(`[DEBUG] TeamInfo_title elements found: ${$teamInfo.length}`);
  
  if ($teamInfo.length >= 2) {
    const teamTitles = $teamInfo.toArray().map((el) => {
      const text = textTrim($(el).text());
      console.log(`[DEBUG] Team title found: "${text}"`);
      return text;
    }).filter(Boolean);
    
    if (teamTitles.length >= 2) {
      home = teamTitles[0];
      away = teamTitles[1];
      console.log(`[DEBUG] Teams extracted: ${home} vs ${away}`);
    }
  }
  
  // Try to find teams in DefaultLine_teamsWrap or other structures
  if (!home || !away) {
    const $teamsWrap = $("[class*='DefaultLine_teamsWrap'], [class*='MatchInfo_teams'], [class*='teamsWrap']");
    if ($teamsWrap.length > 0) {
      const teams = $teamsWrap.find("div").toArray().map((n) => textTrim($(n).text())).filter(Boolean);
      if (teams.length >= 2) {
        home = teams[0];
        away = teams[1];
      }
    }
  }
  
  // Fallback: try to find in title or header
  if (!home || !away) {
    const titleText = $("h1, h2, [class*='title']").first().text();
    const match = titleText.match(/(.+?)\s+(?:vs|–|-)\s+(.+)/i);
    if (match) {
      home = textTrim(match[1]);
      away = textTrim(match[2]);
    }
  }

  // Extract league from breadcrumbs or other sources
  const league = textTrim($("[class*='BreadCrumbs'] button").last().text()) || 
                 textTrim($("[class*='league'], [class*='League'], [class*='LinesGroup_title']").first().text()) || 
                 undefined;

  // Parse outcomes from detail page structure
  // Try multiple ways to find the outcomes structure
  console.log(`[DEBUG] ===== Looking for outcomes structure =====`);
  console.log(`[DEBUG] OutcomesGroups_groupsWrapper: ${$("[class*='OutcomesGroups_groupsWrapper']").length}`);
  console.log(`[DEBUG] OutcomesGroups_groupsColumn: ${$("[class*='OutcomesGroups_groupsColumn']").length}`);
  console.log(`[DEBUG] match_info: ${$("[id='match_info']").length}`);
  console.log(`[DEBUG] Group_group: ${$("[class*='Group_group']").length}`);
  console.log(`[DEBUG] Group_group__UArsk: ${$("[class*='Group_group__UArsk']").length}`);
  console.log(`[DEBUG] Buttons with data-outcome-odd: ${$("button[data-outcome-odd]").length}`);
  console.log(`[DEBUG] Buttons with class Group_outcome: ${$("button[class*='Group_outcome']").length}`);
  console.log(`[DEBUG] Buttons with class Outcome_root: ${$("button[class*='Outcome_root']").length}`);
  
  // Try to find all groups - search in multiple places
  let $groups = $("[class*='Group_group']");
  
  // If no groups found, try to find in wrapper
  if ($groups.length === 0) {
    const $outcomesWrapper = $("[class*='OutcomesGroups_groupsWrapper'], [class*='OutcomesGroups_groupsColumn'], [id='match_info']");
    $groups = $outcomesWrapper.find("[class*='Group_group']");
  }
  
  console.log(`[DEBUG] Total groups found: ${$groups.length}`);
  
  // Also check if we can find buttons directly
  const $allOutcomeButtons = $("button[data-outcome-odd]");
  console.log(`[DEBUG] Total buttons with data-outcome-odd: ${$allOutcomeButtons.length}`);
  
  if ($allOutcomeButtons.length > 0) {
    console.log(`[DEBUG] First button sample:`);
    const $firstBtn = $allOutcomeButtons.first();
    console.log(`[DEBUG]   - data-outcome-odd: ${$firstBtn.attr("data-outcome-odd")}`);
    console.log(`[DEBUG]   - classes: ${$firstBtn.attr("class")}`);
    console.log(`[DEBUG]   - text: ${textTrim($firstBtn.text())}`);
    const $title = $firstBtn.find("[class*='Outcome_title']");
    console.log(`[DEBUG]   - Outcome_title found: ${$title.length}, text: "${textTrim($title.text())}"`);
  }
  
  // First, try to parse from groups if found
  if ($groups.length > 0) {
    console.log(`[DEBUG] Parsing from ${$groups.length} groups...`);
    $groups.each((_groupIdx, groupEl) => {
      const $group = $(groupEl);
      
      // Get group title (e.g., "Фора", "Тотал", etc.)
      const groupTitle = textTrim($group.find("[class*='Group_title']").first().text());
      console.log(`[DEBUG] Group ${_groupIdx + 1}: "${groupTitle}"`);
      
      // Find all outcome buttons in this group
      const $buttons = $group.find("button[data-outcome-odd]");
      console.log(`[DEBUG]   Found ${$buttons.length} buttons in this group`);
      
      $buttons.each((_btnIdx, btnEl) => {
        const $btn = $(btnEl);
        
        // Get odd from data-outcome-odd attribute
        const oddStr = String($btn.attr("data-outcome-odd") || "");
        const odd = parseOddFromText(oddStr);
        
        if (!odd) {
          console.log(`[DEBUG]   Button ${_btnIdx + 1}: no odd found`);
          return;
        }
        
        // Get label from Outcome_title
        const $title = $btn.find("[class*='Outcome_title']");
        let label = textTrim($title.text());
        
        // If no title found, try button text
        if (!label) {
          label = textTrim($btn.text());
        }
        
        if (!label) {
          console.log(`[DEBUG]   Button ${_btnIdx + 1}: no label found`);
          return;
        }
        
        console.log(`[DEBUG]   Button ${_btnIdx + 1}: "${label}" = ${odd}`);
        
        // Try to extract value from label (e.g., "Фора 1 (+1.5)" -> "1.5", "Тотал (2.5)" -> "2.5")
        let value: string | number | undefined;
        const valueMatch = label.match(/[\(]?([+-]?\d+(?:\.\d+)?)[\)]?/);
        if (valueMatch) {
          value = valueMatch[1];
        }
        
        // Determine type based on group title and label
        let type: "1x2" | "total" | "fora" | undefined;
        let finalLabel = label;
        
        // Check group title first
        const groupTitleLower = groupTitle.toLowerCase();
        
        // 1X2 outcomes
        if (groupTitleLower.includes("исход") || groupTitleLower.includes("1x2") || 
            label.match(/^(П1|П2|1|X|2|Ничья|1X|12|X2)$/i)) {
          type = "1x2";
          if (label.match(/^П1|1$/i)) finalLabel = "1";
          else if (label.match(/^X|Ничья$/i)) finalLabel = "X";
          else if (label.match(/^П2|2$/i)) finalLabel = "2";
        }
        // Totals
        else if (groupTitleLower.includes("тотал") || label.match(/тотал|больше|меньше|over|under/i)) {
          type = "total";
          if (label.match(/больше|over|б/i)) {
            finalLabel = value ? `Тотал Б (${value})` : "Тотал Б";
          } else if (label.match(/меньше|under|м/i)) {
            finalLabel = value ? `Тотал М (${value})` : "Тотал М";
          }
        }
        // Foras
        else if (groupTitleLower.includes("фора") || label.match(/фора|handicap/i)) {
          type = "fora";
          if (label.match(/фора\s*1|1\s*\(/i)) {
            finalLabel = value ? `Фора 1 (${value})` : "Фора 1";
          } else if (label.match(/фора\s*2|2\s*\(/i)) {
            finalLabel = value ? `Фора 2 (${value})` : "Фора 2";
          }
        }
        
        // If type not determined, keep original label
        outcomes.push({
          label: finalLabel || label,
          odd,
          type: type || undefined,
          value: value
        });
      });
    });
  }
  
  // If no outcomes found from groups, try to find all buttons directly
  if (outcomes.length === 0) {
    console.log(`[DEBUG] No outcomes from groups, trying direct button search...`);
    
    // Try multiple selectors
    let $allButtons = $("button[data-outcome-odd]");
    console.log(`[DEBUG] Found ${$allButtons.length} buttons with data-outcome-odd`);
    
    // Also try by class
    if ($allButtons.length === 0) {
      $allButtons = $("button[class*='Outcome_root'], button[class*='Group_outcome']");
      console.log(`[DEBUG] Found ${$allButtons.length} buttons by class`);
    }
    
    // Try to find any button with odd value
    if ($allButtons.length === 0) {
      $allButtons = $("button").filter((_i, el) => {
        const $el = $(el);
        const odd = $el.attr("data-outcome-odd");
        const oddText = $el.find("[class*='Outcome_odd']").text();
        return !!(odd || parseOddFromText(oddText));
      });
      console.log(`[DEBUG] Found ${$allButtons.length} buttons with odd values`);
    }
    
    $allButtons.each((_btnIdx, btnEl) => {
      const $btn = $(btnEl);
      
      // Get odd from data-outcome-odd attribute
      const oddStr = String($btn.attr("data-outcome-odd") || "");
      const odd = parseOddFromText(oddStr);
      
      if (!odd) return;
      
      // Get label from Outcome_title
      const $title = $btn.find("[class*='Outcome_title']");
      let label = textTrim($title.text());
      
      // If no title found, try button text
      if (!label) {
        label = textTrim($btn.text());
      }
      
      if (!label) return;
      
      // Try to find parent group for context
      const $parentGroup = $btn.closest("[class*='Group_group']");
      const groupTitle = textTrim($parentGroup.find("[class*='Group_title']").first().text());
      
      // Try to extract value from label
      let value: string | number | undefined;
      const valueMatch = label.match(/[\(]?([+-]?\d+(?:\.\d+)?)[\)]?/);
      if (valueMatch) {
        value = valueMatch[1];
      }
      
      // Determine type based on group title and label
      let type: "1x2" | "total" | "fora" | undefined;
      let finalLabel = label;
      
      const groupTitleLower = groupTitle.toLowerCase();
      
      // 1X2 outcomes
      if (groupTitleLower.includes("исход") || groupTitleLower.includes("1x2") || 
          label.match(/^(П1|П2|1|X|2|Ничья|1X|12|X2)$/i)) {
        type = "1x2";
        if (label.match(/^П1|1$/i)) finalLabel = "1";
        else if (label.match(/^X|Ничья$/i)) finalLabel = "X";
        else if (label.match(/^П2|2$/i)) finalLabel = "2";
      }
      // Totals
      else if (groupTitleLower.includes("тотал") || label.match(/тотал|больше|меньше|over|under/i)) {
        type = "total";
        if (label.match(/больше|over|б/i)) {
          finalLabel = value ? `Тотал Б (${value})` : "Тотал Б";
        } else if (label.match(/меньше|under|м/i)) {
          finalLabel = value ? `Тотал М (${value})` : "Тотал М";
        }
      }
      // Foras
      else if (groupTitleLower.includes("фора") || label.match(/фора|handicap/i)) {
        type = "fora";
        if (label.match(/фора\s*1|1\s*\(/i)) {
          finalLabel = value ? `Фора 1 (${value})` : "Фора 1";
        } else if (label.match(/фора\s*2|2\s*\(/i)) {
          finalLabel = value ? `Фора 2 (${value})` : "Фора 2";
        }
      }
      
      outcomes.push({
        label: finalLabel || label,
        odd,
        type: type || undefined,
        value: value
      });
    });
  }
  
  // Fallback: try to parse buttons with data-outcome-odd (newer structure)
  // Check if we already have this outcome to avoid duplicates
  const existingOutcomes = new Set(outcomes.map(o => `${o.label}_${o.odd}`));
  
  $("button[data-outcome-odd]").each((_btnIdx, btnEl) => {
      const $btn = $(btnEl);
      const oddStr = String($btn.attr("data-outcome-odd") || "");
      const odd = parseOddFromText(oddStr);
      
      if (!odd) return;
      
      const $title = $btn.find("[class*='Outcome_title']");
      const label = textTrim($title.text() || $btn.text());
      
      if (!label) return;
      
      // Try to extract value
      let value: string | number | undefined;
      const valueMatch = label.match(/[\(]?([+-]?\d+(?:\.\d+)?)[\)]?/);
      if (valueMatch) {
        value = valueMatch[1];
      }
      
      // Determine type from label
      let type: "1x2" | "total" | "fora" | undefined;
      if (label.match(/^(П1|П2|1|X|2|Ничья)$/i)) {
        type = "1x2";
      } else if (label.match(/тотал|больше|меньше/i)) {
        type = "total";
      } else if (label.match(/фора/i)) {
        type = "fora";
      }
      
      const outcomeKey = `${label}_${odd}`;
      if (!existingOutcomes.has(outcomeKey)) {
        outcomes.push({
          label,
          odd,
          type: type || undefined,
          value: value
        });
        existingOutcomes.add(outcomeKey);
      }
    });
  
  // Additional fallback: try to find buttons by class and extract odd from Outcome_odd div
  $("button[class*='Outcome_root'], button[class*='Group_outcome']").each((_btnIdx, btnEl) => {
    const $btn = $(btnEl);
    
    // Try to get odd from data-outcome-odd first
    let oddStr = String($btn.attr("data-outcome-odd") || "");
    let odd: number | undefined;
    
    if (oddStr) {
      odd = parseOddFromText(oddStr);
    } else {
      // Try to get odd from Outcome_odd div
      const $oddDiv = $btn.find("[class*='Outcome_odd']");
      if ($oddDiv.length > 0) {
        odd = parseOddFromText($oddDiv.text());
      }
    }
    
    if (!odd) return;
    
    // Get label from Outcome_title
    const $title = $btn.find("[class*='Outcome_title']");
    const label = textTrim($title.text() || $btn.text());
    
    if (!label) return;
    
    // Try to extract value
    let value: string | number | undefined;
    const valueMatch = label.match(/[\(]?([+-]?\d+(?:\.\d+)?)[\)]?/);
    if (valueMatch) {
      value = valueMatch[1];
    }
    
    // Determine type from label
    let type: "1x2" | "total" | "fora" | undefined;
    if (label.match(/^(П1|П2|1|X|2|Ничья)$/i)) {
      type = "1x2";
    } else if (label.match(/тотал|больше|меньше/i)) {
      type = "total";
    } else if (label.match(/фора/i)) {
      type = "fora";
    }
    
    const outcomeKey = `${label}_${odd}`;
    if (!existingOutcomes.has(outcomeKey)) {
      outcomes.push({
        label,
        odd,
        type: type || undefined,
        value: value
      });
      existingOutcomes.add(outcomeKey);
    }
  });
  
  // Fallback: try old structure with data-outcome-alias
  $("button[data-outcome-alias][data-odd]").each((_btnIdx, btnEl) => {
    const $btn = $(btnEl);
    const alias = String($btn.attr("data-outcome-alias") || "").toLowerCase();
    const odd = parseOddFromText(String($btn.attr("data-odd") || $btn.text()));
    
    if (!odd) return;
    
    const label = textTrim($btn.text()) || alias;
    
    let type: "1x2" | "total" | "fora" | undefined;
    if (alias === "1" || alias === "x" || alias === "2") {
      type = "1x2";
    } else if (alias.includes("total")) {
      type = "total";
    } else if (alias.includes("fora")) {
      type = "fora";
    }
    
    const outcomeKey = `${label}_${odd}`;
    if (!existingOutcomes.has(outcomeKey)) {
      outcomes.push({
        label,
        odd,
        type: type || undefined,
        value: undefined
      });
      existingOutcomes.add(outcomeKey);
    }
  });

  console.log(`[DEBUG] Total outcomes parsed: ${outcomes.length}`);
  if (outcomes.length > 0) {
    console.log(`[DEBUG] First 5 outcomes:`, outcomes.slice(0, 5).map(o => `${o.label}: ${o.odd}`));
  } else {
    console.warn(`[DEBUG] WARNING: No outcomes found! HTML might not be fully loaded.`);
  }
  
  return {
    matchId,
    lineId,
    home,
    away,
    league,
    outcomes,
    meta: {
      parsedAt: new Date().toISOString(),
      url
    }
  };
}
