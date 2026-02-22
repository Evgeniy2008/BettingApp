// API endpoint - автоматически определяет окружение
// В production использует Render URL или текущий домен, в dev - localhost:3000
const isProduction = window.location.protocol === 'https:' || 
                     !window.location.hostname.includes('localhost') && 
                     !window.location.hostname.includes('127.0.0.1');

// Настройка URL для Node.js API
// Вариант 1: Если используете Render - укажите URL вашего Render сервиса
// const RENDER_API_URL = "https://betsbot-xxxx.onrender.com"; // Замените на ваш URL!

// Вариант 2: Если используете прокси через PHP (api/proxy.php)
// const RENDER_API_URL = window.location.origin + "/api/proxy.php?path=api";

// Вариант 3: Если Node.js на том же домене через Nginx
// const RENDER_API_URL = window.location.origin;

// По умолчанию используем текущий домен (для Nginx прокси)
// Если используете Render напрямую, раскомментируйте и укажите URL выше
const RENDER_API_URL = window.location.origin; // Измените на ваш Render URL если нужно!

const API_BASE = isProduction 
  ? "http://localhost:3000"  // Production: Render или прокси
  : "http://localhost:3000"; // Development: локальный Node.js сервер

// PHP API endpoint for bets and wallet
var PHP_API_BASE = window.location.origin.replace(/:\d+$/, '') + (window.location.port ? '' : '/api');

// Source URL for parsing matches
// Matches are parsed from: https://w54rjjmb.com/sport?lc=1&from_left_menu=&ss=all
// This is the main sports page with all leagues and matches
// The endpoint /api/w54/live fetches and parses this page

// Option to force using snapshot file instead of live parsing
// Set to true to use ParseInfoNew.html snapshot, false to use live parsing
const USE_SNAPSHOT = false; // Change to true to force snapshot mode
const SNAPSHOT_FILE = "ParseInfoNew.html";

let leagues = [{ id: "all", country: "🌐", name: "All leagues" }];
let matches = []; // Global matches array - will be updated on each load

// Show skeleton loading for matches
function showMatchesSkeleton() {
  const root = document.getElementById("matches-list");
  if (!root) return;
  
  const skeletonRows = Array(5).fill(0).map(() => `
    <div class="match-row-skeleton">
      <div class="match-info-skeleton">
        <div class="skeleton-line skeleton-line-short"></div>
        <div class="skeleton-line skeleton-line-medium"></div>
        <div class="skeleton-line skeleton-line-short"></div>
      </div>
      <div class="match-odds-skeleton">
        ${Array(9).fill(0).map(() => '<div class="skeleton-odd"></div>').join('')}
      </div>
    </div>
  `).join('');
  
  root.innerHTML = `
    <div class="matches-table">
      <div class="matches-container">
        ${skeletonRows}
      </div>
    </div>
  `;
}

// Load matches from PHP API (API Sports)
async function loadMatches(forceRefresh = false) {
  // Show skeleton while loading
  showMatchesSkeleton();
  
  const loadStartTime = Date.now();
  console.log(`[App] Loading matches at ${new Date().toISOString()}${forceRefresh ? ' (FORCE REFRESH - NO CACHE)' : ''}`);
  
  try {
    // Use PHP API to get matches from API Sports
    // Single request for faster loading - get today's matches (includes live)
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const cacheBuster = forceRefresh ? `&_t=${timestamp}&_r=${random}` : '';
    
    // Single request for today's matches (faster than multiple requests)
    const today = new Date().toISOString().split('T')[0];
    const url = `${PHP_API_BASE}/matches.php?date=${today}${cacheBuster}`;
    console.log(`[App] Fetching matches from: ${url}`);
    
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    
    if (!data.matches || !Array.isArray(data.matches)) {
      throw new Error('Invalid response format');
    }
    
    console.log(`[App] Received ${data.matches.length} matches from PHP API`);
    
    if (!data.matches || !Array.isArray(data.matches) || data.matches.length === 0) {
      // Show error message to user
      const root = document.getElementById("matches-list");
      if (root) {
        root.innerHTML = '<div class="subcard"><div class="label" style="color:rgba(248,113,113,0.9);">Failed to load matches. Check browser console (F12).</div></div>';
      }
      return;
    }

    // Group by league (if available) or create virtual leagues from match data
    const leagueMap = new Map();
    leagueMap.set("all", { id: "all", country: "🌐", name: "All leagues", count: 0 });

    // Log raw data before processing
    console.log(`[App] Processing ${data.matches.length} matches from PHP API`);
    console.log(`[App] Sample raw match:`, data.matches[0]);
    
    // Clear previous matches and create new array
    const newMatches = data.matches.map((m, idx) => {
      // PHP API returns leagueName, but we also need leagueId
      const leagueId = m.league || m.leagueName || "all";
      const leagueName = m.leagueName || m.league || "Unknown League";

      if (!leagueMap.has(leagueId)) {
        leagueMap.set(leagueId, {
          id: leagueId,
          country: "🏳️",
          name: leagueName,
          logo: m.leagueLogo || null,
          count: 0
        });
      }
      leagueMap.get(leagueId).count++;
      if (leagueId !== "all") {
        leagueMap.get("all").count++;
      }

      // Convert API format to UI format
      const outcomes = m.outcomes || [];
      // Find 1X2 outcomes
      const homeWin = outcomes.find((o) => o.label === "1" && o.type === "1x2")?.odd || 0;
      const draw = outcomes.find((o) => o.label === "X" && o.type === "1x2")?.odd || 0;
      const awayWin = outcomes.find((o) => o.label === "2" && o.type === "1x2")?.odd || 0;
      
      // Store all outcomes (including totals, foras) for future use
      const allOutcomes = outcomes;

      // Convert time to user's local timezone
      let timeStr = "TBD";
      if (m.startDateTimeISO) {
        try {
          const matchDate = new Date(m.startDateTimeISO);
          if (!isNaN(matchDate.getTime())) {
            // Format: DD.MM HH:mm in user's local timezone
            const day = String(matchDate.getDate()).padStart(2, '0');
            const month = String(matchDate.getMonth() + 1).padStart(2, '0');
            const hours = String(matchDate.getHours()).padStart(2, '0');
            const minutes = String(matchDate.getMinutes()).padStart(2, '0');
            timeStr = `${day}.${month} ${hours}:${minutes}`;
          }
        } catch (e) {
          // Fallback to original format if conversion fails
          timeStr = m.startTime
            ? `${m.startDate || ""} ${m.startTime}`.trim()
            : "TBD";
        }
      } else if (m.startTime) {
        // Fallback to original format if ISO date not available
        timeStr = `${m.startDate || ""} ${m.startTime}`.trim();
      }

      const matchObj = {
        id: m.matchId || `m${idx}`,
        matchId: m.matchId,
        lineId: m.lineId,
        detailUrl: m.detailUrl, // Store detail page URL
        leagueId: leagueId,
        leagueName: leagueName,
        leagueLogo: m.leagueLogo || null,
        time: timeStr,
        home: m.home || "",
        away: m.away || "",
        homeLogo: m.homeLogo || null,
        awayLogo: m.awayLogo || null,
        odds: { homeWin, draw, awayWin },
        allOutcomes: allOutcomes, // Store all bet types for future expansion
        isLive: m.isLive || false,
        liveTime: m.liveTime,
        livePeriod: m.livePeriod,
        score: m.score
      };
      
      // Debug: log first few matches to check isLive status
      if (idx < 5) {
        console.log(`[Process] Match ${idx + 1}: ${matchObj.home} vs ${matchObj.away}, isLive=${matchObj.isLive}, raw isLive=${m.isLive}`);
      }
      
      // Debug logging
      
      return matchObj;
    });
    
    // Replace global matches array with new data
    matches = newMatches;
    
    // Log processed data
    console.log(`[App] Processed ${matches.length} matches`);
    const liveMatches = matches.filter(m => m.isLive).length;
    const nonLiveMatches = matches.filter(m => !m.isLive).length;
    console.log(`[App] LIVE matches: ${liveMatches}, Non-LIVE matches: ${nonLiveMatches}`);
    console.log(`[App] Sample processed match:`, matches[0]);
    
    // Log a few examples of both types
    const liveExamples = matches.filter(m => m.isLive).slice(0, 2);
    const nonLiveExamples = matches.filter(m => !m.isLive).slice(0, 2);
    if (liveExamples.length > 0) {
      console.log(`[App] LIVE examples:`, liveExamples.map(m => `${m.home} vs ${m.away}`));
    }
    if (nonLiveExamples.length > 0) {
      console.log(`[App] Non-LIVE examples:`, nonLiveExamples.map(m => `${m.home} vs ${m.away}`));
    } else {
      console.warn(`[App] ⚠️ No non-LIVE matches found! All matches are marked as LIVE.`);
    }
    
    // Log summary
    const matchesWithUrl = matches.filter(m => m.detailUrl).length;
    console.log(`[App] Matches with detailUrl: ${matchesWithUrl}`);

    // Sort leagues by match count (descending), but keep "all" first
    leagues = Array.from(leagueMap.values()).sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return b.count - a.count;
    });
    
    const loadTime = Date.now() - loadStartTime;
    console.log(`[App] Loaded ${matches.length} matches in ${loadTime}ms`);
    if (matches.length > 0) {
      console.log(`[App] First 3 matches:`, matches.slice(0, 3).map(m => `${m.home} vs ${m.away} (${m.matchId || 'no-id'})`));
    }
    
    // Reset pagination to first page when new data is loaded
    state.currentPage = 1;
    
    // Store timestamp of last update
    window.lastUpdateTime = new Date().toISOString();
    
    // Force re-render
    renderLeagues();
    renderMatches();
  } catch (err) {
    // Show error to user
    console.error('[App] Error loading matches:', err);
    const root = document.getElementById("matches-list");
    if (root) {
      root.innerHTML = `<div class="subcard"><div class="label" style="color:rgba(248,113,113,0.9);">Loading error: ${err.message}. Make sure PHP API is accessible at ${PHP_API_BASE}</div></div>`;
    }
    renderLeagues();
    renderMatches();
  }
}

const state = {
  activeTab: "sportsbook",
  activeLeagueId: "all",
  slip: [],
  stake: 0,
  currentPage: 1,
  matchesPerPage: 20,
  searchQuery: "",
  betsFilter: "all", // Filter for bets page: all, pending, active, won, lost, cancelled
  favorites: (function() {
    try {
      return {
        leagues: JSON.parse(localStorage.getItem('favoriteLeagues') || '[]'),
        matches: JSON.parse(localStorage.getItem('favoriteMatches') || '[]')
      };
    } catch (e) {
      console.error('Error loading favorites from localStorage:', e);
      return {
        leagues: [],
        matches: []
      };
    }
  })(),
  favoriteTab: "leagues" // Current tab in favorites page
};

function formatOdd(n) {
  // Return number as string without rounding - preserve full precision
  return String(n);
}

function renderLeagues() {
  const root = document.getElementById("leagues-list");
  const search = document.getElementById("search-input");
  const q = (search.value || "").trim().toLowerCase();

  const filtered = leagues.filter((l) =>
    l.name.toLowerCase().includes(q)
  );

  root.innerHTML = filtered
    .map(
      (l) => {
        const isFavorite = state.favorites.leagues.includes(l.id);
        return `
        <button class="league-item ${
          state.activeLeagueId === l.id ? "league-item-active" : ""
        }" data-league="${l.id}">
          <div class="league-main">
            ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
              <span class="league-flag" style="display:none;">${l.country || "🏳️"}</span>` : 
              `<span class="league-flag">${l.country || "🏳️"}</span>`}
            <span class="league-name">${l.name}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${l.count > 0 ? `<span class="pill">${l.count}</span>` : ""}
            <button class="favorite-btn ${isFavorite ? 'favorite-btn-active' : ''}" data-favorite-type="league" data-favorite-id="${l.id}" onclick="event.stopPropagation(); toggleFavorite('league', '${l.id}');">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
              </svg>
            </button>
          </div>
        </button>
      `;
      }
    )
    .join("");
}

function renderMatches() {
  const root = document.getElementById("matches-list");
  
  console.log(`[Render] Total matches: ${matches.length}`);
  const liveCount = matches.filter(m => m.isLive).length;
  const nonLiveCount = matches.filter(m => !m.isLive).length;
  console.log(`[Render] LIVE: ${liveCount}, Non-LIVE: ${nonLiveCount}`);
  
  let ms =
    state.activeLeagueId === "all"
      ? matches
      : matches.filter((m) => m.leagueId === state.activeLeagueId);

  console.log(`[Render] After league filter (${state.activeLeagueId}): ${ms.length} matches`);

  // Apply search filter
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.trim().toLowerCase();
    const queryWords = query.split(/\s+/).filter(w => w.length > 0);
    const beforeSearch = ms.length;
    ms = ms.filter((m) => {
      const home = (m.home || "").toLowerCase();
      const away = (m.away || "").toLowerCase();
      const league = (m.leagueName || "").toLowerCase();
      
      // Simple search: check if all query words appear in any field
      const allWordsMatch = queryWords.every(qw => 
        home.includes(qw) || away.includes(qw) || league.includes(qw)
      );
      
      return allWordsMatch;
    });
    console.log(`[Render] After search filter: ${ms.length} matches (was ${beforeSearch})`);
  }

  // Sort: LIVE matches first, then regular matches
  const beforeSort = ms.length;
  ms.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return 0;
  });
  console.log(`[Render] After sort: ${ms.length} matches`);
  console.log(`[Render] First 5 matches:`, ms.slice(0, 5).map(m => `${m.home} vs ${m.away} (LIVE: ${m.isLive})`));

  // Update content subtitle
  const subtitleEl = document.querySelector(".content-subtitle");
  if (subtitleEl) {
    const activeLeague = leagues.find((l) => l.id === state.activeLeagueId);
    if (activeLeague && state.activeLeagueId !== "all") {
      subtitleEl.textContent = `${activeLeague.name} • Live • Today`;
    } else {
      subtitleEl.textContent = "Football • All leagues • Live • Today";
    }
  }

  // Pagination
  const totalPages = Math.ceil(ms.length / state.matchesPerPage);
  const startIdx = (state.currentPage - 1) * state.matchesPerPage;
  const endIdx = startIdx + state.matchesPerPage;
  const paginatedMatches = ms.slice(startIdx, endIdx);
  
  console.log(`[Render] Pagination: page ${state.currentPage}/${totalPages}, showing ${paginatedMatches.length} matches (${startIdx}-${endIdx} of ${ms.length})`);
  console.log(`[Render] Paginated matches:`, paginatedMatches.map(m => `${m.home} vs ${m.away} (LIVE: ${m.isLive})`));

  root.innerHTML = `
    <div class="matches-table">
      <div class="matches-container">
        ${paginatedMatches
          .map((m) => renderMatchRow(m))
          .join("")}
      </div>
    </div>
    ${totalPages > 1 ? `
      <div class="pagination">
        <button class="pagination-btn" ${state.currentPage === 1 ? "disabled" : ""} data-page="${state.currentPage - 1}">←</button>
        <span class="pagination-info">${state.currentPage} / ${totalPages}</span>
        <button class="pagination-btn" ${state.currentPage === totalPages ? "disabled" : ""} data-page="${state.currentPage + 1}">→</button>
      </div>
    ` : ""}
  `;
}

function renderMatchRow(match) {
  // Use outcomes from API - same data structure as in match detail modal
  // PHP API already selects best (highest) odds from all bookmakers
  const outcomes = match.allOutcomes || match.outcomes || [];
  
  // Find best odds for 1X2 - PHP already filtered to best odds, but ensure we get the highest
  // Filter all 1X2 outcomes and select the best (highest odd) for each outcome type
  const outcomes1X2 = outcomes.filter((o) => o.type === "1x2");
  
  // Find best (highest) odd for each: Home (1), Draw (X), Away (2)
  let outcome1X2 = null;
  let outcomeX = null;
  let outcome2 = null;
  
  outcomes1X2.forEach((o) => {
    const label = String(o.label || '').trim();
    const odd = parseFloat(o.odd) || 0;
    
    // Match Home/1
    if ((label === "1" || label === "Home") && odd > 0) {
      if (!outcome1X2 || odd > outcome1X2.odd) {
        outcome1X2 = { ...o, label: "1", odd: odd };
      }
    }
    // Match Draw/X
    else if ((label === "X" || label === "Draw") && odd > 0) {
      if (!outcomeX || odd > outcomeX.odd) {
        outcomeX = { ...o, label: "X", odd: odd };
      }
    }
    // Match Away/2
    else if ((label === "2" || label === "Away") && odd > 0) {
      if (!outcome2 || odd > outcome2.odd) {
        outcome2 = { ...o, label: "2", odd: odd };
      }
    }
  });
  
  // Find best total over/under (most common: 2.5)
  const totalOver = outcomes
    .filter((o) => o.type === "total" && (o.label === "Тотал Б" || o.label.includes("Total O") || o.label.includes("Over")))
    .sort((a, b) => {
      const aVal = parseFloat(a.value || 0);
      const bVal = parseFloat(b.value || 0);
      if (Math.abs(aVal - 2.5) < Math.abs(bVal - 2.5)) return -1;
      if (Math.abs(aVal - 2.5) > Math.abs(bVal - 2.5)) return 1;
      return b.odd - a.odd;
    })[0];
  const totalValue = totalOver?.value || "";
  const totalUnder = outcomes
    .filter((o) => o.type === "total" && (o.label === "Тотал М" || o.label.includes("Total U") || o.label.includes("Under")) && o.value === totalValue)
    .sort((a, b) => b.odd - a.odd)[0];
  
  // Find best fora (most common: 0 or closest to 0)
  const fora1 = outcomes
    .filter((o) => o.type === "fora" && (o.label === "Фора 1" || o.label.includes("Handicap 1")))
    .sort((a, b) => {
      const aVal = Math.abs(parseFloat(a.value || 0));
      const bVal = Math.abs(parseFloat(b.value || 0));
      if (aVal !== bVal) return aVal - bVal;
      return b.odd - a.odd;
    })[0];
  const foraValue = fora1?.value || "";
  const fora2 = outcomes
    .filter((o) => o.type === "fora" && (o.label === "Фора 2" || o.label.includes("Handicap 2")) && o.value === foraValue)
    .sort((a, b) => b.odd - a.odd)[0];

  const isLive = match.isLive || false;
  const isMatchFavorite = isFavorite('match', match.id);
  
  const homeLogoHtml = match.homeLogo 
    ? `<img src="${match.homeLogo}" alt="${match.home}" class="team-logo-digital" onerror="this.style.display='none';">` 
    : '<div class="team-logo-placeholder"></div>';
  const awayLogoHtml = match.awayLogo 
    ? `<img src="${match.awayLogo}" alt="${match.away}" class="team-logo-digital" onerror="this.style.display='none';">` 
    : '<div class="team-logo-placeholder"></div>';

  const scoreDisplay = isLive && match.score 
    ? `<div class="match-score-digital">
        <span class="score-value">${match.score.home}</span>
        <span class="score-separator">:</span>
        <span class="score-value">${match.score.away}</span>
      </div>` 
    : '';
  
  const liveTimeDisplay = isLive && match.liveTime 
    ? `<div class="live-time-digital">
        <span class="live-dot"></span>
        <span class="live-text">${match.liveTime}${match.livePeriod ? ' • ' + match.livePeriod : ''}</span>
      </div>` 
    : `<div class="match-time-digital">${match.time || "TBD"}</div>`;

  // Render only three main odds: Home, Draw, Away (1, X, 2)
  // Use the same data structure as in match detail modal
  const oddsButtons = [];
  
  // Add 1X2 odds only (Home, Draw, Away)
  if (outcome1X2 && outcome1X2.odd > 0) {
    oddsButtons.push(renderOutcomeButton(match, "1", outcome1X2.odd, outcome1X2.label || "1"));
  }
  if (outcomeX && outcomeX.odd > 0) {
    oddsButtons.push(renderOutcomeButton(match, "X", outcomeX.odd, outcomeX.label || "X"));
  }
  if (outcome2 && outcome2.odd > 0) {
    oddsButtons.push(renderOutcomeButton(match, "2", outcome2.odd, outcome2.label || "2"));
  }
  
  const oddsRow = `
    <div class="match-odds-digital">
      <div class="odds-buttons-inline">
        ${oddsButtons.join('')}
      </div>
    </div>
  `;
  
  return `
    <div class="match-card-digital ${isLive ? 'match-card-live' : ''}" data-match-id="${match.id}">
      <div class="match-card-header">
        <div class="match-league-digital">
          ${isLive ? '<span class="live-badge-digital"><span class="live-pulse"></span>LIVE</span>' : ''}
          <span class="league-name-digital">${match.leagueName}</span>
        </div>
        <button class="favorite-btn-digital ${isMatchFavorite ? 'favorite-btn-active' : ''}" 
                onclick="event.stopPropagation(); toggleFavorite('match', '${match.id}');">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="${isMatchFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </div>
      
      <div class="match-teams-digital">
        <div class="team-digital team-home">
          ${homeLogoHtml}
          <div class="team-name-digital">${match.home}</div>
        </div>
        <div class="match-vs-digital">
          ${scoreDisplay || '<span class="vs-text">VS</span>'}
        </div>
        <div class="team-digital team-away">
          ${awayLogoHtml}
          <div class="team-name-digital">${match.away}</div>
        </div>
      </div>
      
      <div class="match-time-digital-wrapper">
        ${liveTimeDisplay}
      </div>
      
      ${oddsRow}
      
      <div class="match-actions-digital">
        <button class="go-to-all-bets-btn-digital" data-match-id="${match.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Все ставки
        </button>
      </div>
    </div>
  `;
}

function renderOutcomeButton(match, outcomeKey, odd, displayLabel = null, value = null) {
  if (!odd || odd === 0) {
    return `<div class="outcome-wrapper">
      <div class="outcome-label-mobile"></div>
      <div class="outcome-cell outcome-cell-empty">—</div>
    </div>`;
  }
  
  const label = displayLabel || outcomeKey;
  const normalizedValue = value ? String(value).trim() : null;
  const active = state.slip.some(
    (s) => {
      if (s.matchId !== match.id || s.outcomeKey !== outcomeKey) return false;
      // For outcomes with value (totals, foras), must match value exactly
      if (normalizedValue) {
        const sValue = s.value ? String(s.value).trim() : null;
        return sValue === normalizedValue;
      }
      // For outcomes without value (1X2), must not have value
      return !s.value;
    }
  );
  
  // Map outcomeKey to display label for mobile (short version)
  const labelMap = {
    "1": "1",
    "X": "X",
    "2": "2",
    "total_over": "Б",
    "total_under": "М",
    "fora_one": "1",
    "fora_two": "2"
  };
  const mobileLabel = labelMap[outcomeKey] || label.substring(0, 1);
  
  // Use original label from API (displayLabel parameter)
  const buttonLabel = displayLabel || label;
  
  return `
    <div class="outcome-wrapper">
      <div class="outcome-label-mobile">${mobileLabel}</div>
      <button
        class="outcome-cell outcome-btn ${active ? "outcome-btn-active" : ""}"
        data-match-id="${match.id}"
        data-outcome-key="${outcomeKey}"
        data-odd="${odd}"
        ${value ? `data-value="${value}"` : ""}
        data-label="${buttonLabel}"
        title="${buttonLabel}${value ? ` (${value})` : ''}"
      >
        <div class="outcome-value">${formatOdd(odd)}</div>
      </button>
    </div>
  `;
}

function renderOutcomeValue(value) {
  if (!value || value === "0") {
    return `<div class="outcome-wrapper">
      <div class="outcome-label-mobile"></div>
      <div class="outcome-cell outcome-cell-value">—</div>
    </div>`;
  }
  return `<div class="outcome-wrapper">
    <div class="outcome-label-mobile"></div>
    <div class="outcome-cell outcome-cell-value">${value}</div>
  </div>`;
}

function renderOddButton(match, label, odd) {
  const active = state.slip.some(
    (s) => s.matchId === match.id && s.label === label
  );
  return `
    <button
      class="odd-btn ${active ? "odd-btn-active" : ""}"
      data-match-id="${match.id}"
      data-label="${label}"
      data-odd="${odd}"
    >
      <div class="odd-label">${label}</div>
      <div class="odd-value">${formatOdd(odd)}</div>
    </button>
  `;
}

// Check if mobile device
function isMobile() {
  return window.innerWidth <= 768;
}

// Open betslip on mobile
function openBetslipMobile() {
  if (!isMobile()) return;
  const betslip = document.querySelector('.betslip');
  const overlay = document.getElementById('betslip-overlay');
  const closeBtn = document.getElementById("betslip-close-btn");
  
  if (!betslip) {
    console.warn('[Betslip] BetSlip element not found when trying to open');
    return;
  }
  
  betslip.classList.add('betslip-open');
  if (overlay) {
    overlay.style.display = 'block';
    setTimeout(() => overlay.classList.add('active'), 10);
  }
  document.body.style.overflow = 'hidden';
  if (closeBtn) closeBtn.style.display = 'block';
  
  // Убеждаемся, что betslip может получать клики и имеет яркий фон
  betslip.style.pointerEvents = 'all';
  betslip.style.background = '#16181f';
  betslip.style.display = 'flex';
  betslip.style.flexDirection = 'column';
  
  // Update bottom nav active state
  updateBottomNavActive();
}

// Close betslip on mobile
function closeBetslipMobile() {
  if (!isMobile()) return;
  const betslip = document.querySelector('.betslip');
  const overlay = document.getElementById('betslip-overlay');
  const closeBtn = document.getElementById("betslip-close-btn");
  if (betslip && overlay) {
    betslip.classList.remove('betslip-open');
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
      document.body.style.overflow = '';
      if (closeBtn) closeBtn.style.display = 'none';
      // Update bottom nav active state after animation
      updateBottomNavActive();
    }, 300);
  }
}

// Toggle betslip visibility on mobile
function toggleBetslipMobile() {
  if (!isMobile()) return;
  const betslip = document.querySelector('.betslip');
  if (!betslip) {
    console.warn('[Betslip] BetSlip element not found');
    return;
  }
  
  if (betslip.classList.contains('betslip-open')) {
    closeBetslipMobile();
  } else {
    openBetslipMobile();
  }
  // Update bottom nav active state
  updateBottomNavActive();
}

function renderSlip() {
  const root = document.getElementById("slip-items");
  const slip = state.slip;
  const slipCount = document.getElementById("slip-count");
  const floatCount = document.getElementById("betslip-float-count");
  const bottomNavBetslipCount = document.getElementById("bottom-nav-betslip-count");
  
  slipCount.textContent = slip.length.toString();
  if (floatCount) {
    floatCount.textContent = slip.length.toString();
    // Show/hide float button based on slip count on mobile
    const floatBtn = document.getElementById("betslip-float-btn");
    if (floatBtn && isMobile()) {
      floatBtn.style.display = 'flex';
      floatBtn.classList.remove('hidden');
    }
  }
  
  // Update bottom nav betslip count
  if (bottomNavBetslipCount) {
    const count = slip.length;
    bottomNavBetslipCount.textContent = count.toString();
    // Find the circle element
    const circle = document.getElementById('bottom-nav-betslip-circle');
    if (circle) {
      if (count === 0) {
        circle.style.display = 'none';
        bottomNavBetslipCount.style.visibility = 'hidden';
      } else {
        circle.style.display = 'block';
        bottomNavBetslipCount.style.visibility = 'visible';
      }
    }
  }

  if (!slip.length) {
    root.innerHTML =
      '<div class="subcard"><div class="label">Select outcomes in the line to add them to your betslip.</div></div>';
  } else {
    root.innerHTML = slip
      .map(
        (s) => `
      <div class="slip-item" data-match-id="${s.matchId}">
        <div class="slip-main">
          <div class="slip-league">${s.leagueName}</div>
          <div class="slip-title">${s.home} – ${s.away}</div>
          <div class="slip-meta">
            <span class="pill" style="border-color:rgba(248,113,113,.7);color:#f97373;">${
              s.label || s.outcomeKey
            }</span>
            <span class="odd-value">${formatOdd(s.odd)}</span>
          </div>
        </div>
        <button class="slip-remove" title="Remove" aria-label="Remove bet">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `
      )
      .join("");
  }

  const totalOdds = slip.reduce((acc, s) => acc * s.odd, 1);
  document.getElementById("total-odds").textContent =
    slip.length === 0 ? "—" : formatOdd(totalOdds);

  const possibleWinEl = document.getElementById("possible-win");
  if (!state.stake || !slip.length) {
    possibleWinEl.textContent = "$0.00";
  } else {
    const win = state.stake * totalOdds;
    possibleWinEl.textContent = "$" + win.toFixed(2);
  }

  const placeBtn = document.getElementById("place-bet-btn");
  placeBtn.disabled = !slip.length || !state.stake;
}

function setStake(amount) {
  state.stake = amount;
  const input = document.getElementById("stake-input");
  input.value = amount ? String(amount) : "";
  renderSlip();
}

function handleLeagueClick(e) {
  const btn = e.target.closest("[data-league]");
  if (!btn) return;
  const id = btn.getAttribute("data-league");
  state.activeLeagueId = id || "all";
  state.currentPage = 1; // Reset to first page when changing league
  renderLeagues(); // This will update active state
  renderMatches(); // This will update subtitle
}

function handleOddsClick(e) {
  const btn = e.target.closest(".odd-btn, .outcome-btn");
  if (!btn) return false;
  
  // Prevent event from bubbling to overlay or other handlers
  e.stopPropagation();
  e.preventDefault();
  
  const matchId = btn.getAttribute("data-match-id");
  const outcomeKey = btn.getAttribute("data-outcome-key");
  const label = btn.getAttribute("data-label") || outcomeKey;
  const odd = Number(btn.getAttribute("data-odd"));
  const value = btn.getAttribute("data-value"); // Get value for totals/foras
  const match = matches.find((m) => m.id === matchId);
  if (!match || !odd) return false;

  // Map outcomeKey to display label
  const labelMap = {
    "1": "П1",
    "X": "X",
    "2": "П2",
    "total_over": "Тотал Б",
    "total_under": "Тотал М",
    "fora_one": "Фора 1",
    "fora_two": "Фора 2"
  };
  let displayLabel = labelMap[outcomeKey] || label;
  
  // Add value to label for totals and foras if present
  if (value && (outcomeKey.includes("total") || outcomeKey.includes("fora"))) {
    displayLabel = `${displayLabel} (${value})`;
  }

  // Normalize value to string for comparison
  const normalizedValue = value ? String(value).trim() : null;
  
  // Check if it's the exact same outcome (with same value if applicable)
  const existingSameOutcomeIdx = state.slip.findIndex(
    (s) => {
      if (s.matchId !== matchId || s.outcomeKey !== outcomeKey) return false;
      // For outcomes with value (totals, foras), must match value exactly
      if (normalizedValue) {
        const sValue = s.value ? String(s.value).trim() : null;
        return sValue === normalizedValue;
      }
      // For outcomes without value (1X2), must not have value
      return !s.value;
    }
  );
  
  // Check if there's already ANY bet on this match (different outcome)
  const existingMatchIdx = state.slip.findIndex((s) => s.matchId === matchId);
  
  const next = {
    matchId: match.id,
    outcomeKey,
    label: displayLabel,
    odd,
    home: match.home,
    away: match.away,
    leagueName: match.leagueName,
    value: normalizedValue || undefined
  };
  
  // If clicking the same exact outcome, toggle it off
  if (existingSameOutcomeIdx >= 0) {
    state.slip.splice(existingSameOutcomeIdx, 1);
  } 
  // If there's already a bet on this match (different outcome), replace it
  else if (existingMatchIdx >= 0) {
    state.slip.splice(existingMatchIdx, 1, next);
  }
  // Otherwise, add the new bet
  else {
    state.slip.unshift(next);
  }
  renderMatches();
  renderSlip();
  
  // Open betslip on mobile when clicking on odds (after a short delay to allow UI to update)
  if (isMobile()) {
    setTimeout(() => openBetslipMobile(), 150);
  }
  
  return true; // Indicate that odds click was handled
}

function handleSlipClick(e) {
  const btn = e.target.closest(".slip-remove");
  if (!btn) return;
  const item = btn.closest(".slip-item");
  if (!item) return;
  const matchId = item.getAttribute("data-match-id");
  state.slip = state.slip.filter((s) => s.matchId !== matchId);
  renderMatches();
  renderSlip();
}

function setupTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      if (!tabName) return;
      switchTab(tabName);
    });
  });
}

function switchTab(tabName) {
  if (!tabName) return;
  state.activeTab = tabName;
  
  // Update top tabs
  document
    .querySelectorAll(".tab")
    .forEach((t) => {
      if (t.getAttribute("data-tab") === tabName) {
        t.classList.add("tab-active");
      } else {
        t.classList.remove("tab-active");
      }
    });

  // Update bottom nav
  document
    .querySelectorAll(".bottom-nav-item")
    .forEach((item) => {
      const navName = item.getAttribute("data-nav");
      if (navName === tabName) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

  // Update pages
  document
    .querySelectorAll("main.layout, main.page")
    .forEach((page) => {
      const pageName = page.getAttribute("data-page");
      if (!pageName) return;
      if (pageName === tabName) {
        page.classList.remove("page-hidden");
      } else {
        page.classList.add("page-hidden");
      }
    });
  
  // Load bets when switching to bets tab
  if (tabName === "bets") {
    loadBets();
    // Also check and settle bets when switching to bets tab
    checkAndSettleBets();
  }
  
  // Load favorites when switching to favorites tab
  if (tabName === "favorites") {
    if (state.favoriteTab === "leagues") {
      renderFavoritesLeagues();
    } else {
      renderFavoritesMatches();
    }
  }
  
  // Close betslip on mobile when switching tabs (except when opening betslip or if betslip is being toggled)
  if (isMobile() && tabName !== 'betslip' && tabName !== 'sportsbook') {
    closeBetslipMobile();
  }
}

function setupBottomNav() {
  const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
  
  bottomNavItems.forEach((item) => {
    item.addEventListener("click", (e) => {
      const navName = item.getAttribute("data-nav");
      if (!navName) return;
      
      // Check for special action attribute
      const action = item.getAttribute("data-action");
      
      if (navName === "search") {
        // Focus on search input
        const searchInput = document.getElementById("search-input");
        if (searchInput) {
          searchInput.focus();
          // Also switch to sportsbook tab if not already there
          if (state.activeTab !== "sportsbook") {
            switchTab("sportsbook");
          }
        }
      } else if (action === "live" || (navName === "sportsbook" && action === "live")) {
        // Live button - switch to sportsbook and force refresh
        switchTab("sportsbook");
        // Force reload matches without cache
        loadMatches(true);
      } else if (navName === "betslip") {
        // Toggle betslip on mobile
        if (isMobile()) {
          // Prevent default tab switching behavior
          e.preventDefault();
          e.stopPropagation();
          
          // Don't switch tabs, just toggle betslip
          toggleBetslipMobile();
          
          // Update active state after a short delay to ensure betslip state is updated
          setTimeout(() => {
            updateBottomNavActive();
          }, 150);
        } else {
          // On desktop, just switch to sportsbook (betslip is always visible)
          switchTab("sportsbook");
        }
      } else {
        // Regular tab switch
        switchTab(navName);
      }
    });
  });
  
  // Update active state on load
  updateBottomNavActive();
}

function updateBottomNavActive() {
  const bottomNavItems = document.querySelectorAll(".bottom-nav-item");
  bottomNavItems.forEach((item) => {
    const navName = item.getAttribute("data-nav");
    const action = item.getAttribute("data-action");
    
    // Special handling for Live button - active when on sportsbook
    if (action === "live") {
      if (state.activeTab === "sportsbook") {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    } else if (navName === state.activeTab) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
    
    // Special handling for betslip - check if it's open
    if (navName === "betslip" && isMobile()) {
      const betslip = document.querySelector('.betslip');
      if (betslip && betslip.classList.contains('betslip-open')) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    }
  });
}

// Global bets array
let bets = [];

// Load bets from API
async function loadBets() {
  try {
    const status = state.betsFilter !== 'all' ? `&status=${state.betsFilter}` : '';
    const response = await fetch(`${PHP_API_BASE}/bets.php?${status}`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    if (data.success && data.bets) {
      bets = data.bets;
      console.log(`[App] Loaded ${bets.length} bets from API`);
    } else {
      bets = [];
    }
    
    // Automatically check and settle bets
    await checkAndSettleBets();
  } catch (error) {
    console.error('[App] Error loading bets:', error);
    bets = [];
  }
  
  renderBets();
}

// Check and settle bets automatically
async function checkAndSettleBets() {
  try {
    console.log('[SettleBets] Checking for finished bets...');
    const response = await fetch(`${PHP_API_BASE}/settle-bets.php`, {
      method: 'GET',
      credentials: 'include'
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SettleBets] HTTP Error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('[SettleBets] Response:', data);
    
    // Log match statuses from API for debugging
    if (data.debug && data.debug.length > 0) {
      console.log('[SettleBets] Match statuses from API:');
      data.debug.forEach((info, index) => {
        console.log(`  [${index + 1}] Bet ID: ${info.bet_id}, Fixture ID: ${info.fixture_id}`);
        console.log(`      Status (long): "${info.status_long}"`);
        console.log(`      Status (short): "${info.status_short}"`);
        console.log(`      Is Finished: ${info.is_finished}`);
        if (info.bet_data) {
          console.log(`      Bet Data:`, info.bet_data);
        }
        if (info.calculation_result !== undefined) {
          console.log(`      Calculation Result: ${info.calculation_result}`);
        }
        if (info.calculation_error) {
          console.error(`      Calculation Error: ${info.calculation_error}`);
        }
        if (info.update_error) {
          console.error(`      Update Error: ${info.update_error}`);
        }
        if (info.raw_status) {
          console.log(`      Raw status object:`, info.raw_status);
        }
      });
    }
    
    if (data.success) {
      if (data.settled > 0) {
        console.log(`[SettleBets] ${data.settled} bet(s) settled successfully`);
        // Reload bets to show updated status if on bets tab
        if (state.activeTab === 'bets') {
          await loadBets();
        }
        // Update balance if bets were won - reload user data
        if (typeof loadUser === 'function') {
          await loadUser();
        } else if (typeof updateProfileBalance === 'function') {
          updateProfileBalance();
        }
      } else {
        console.log('[SettleBets] No bets to settle');
        if (data.debug && data.debug.length > 0) {
          console.log('[SettleBets] Check the match statuses above to see why bets are not being settled');
        }
      }
      if (data.errors && data.errors.length > 0) {
        console.error('[SettleBets] Errors:', data.errors);
      }
    } else {
      console.error('[SettleBets] Failed:', data.error);
    }
  } catch (error) {
    console.error('[SettleBets] Error:', error);
  }
}

// Test data for bets (will be replaced with API call later) - DEPRECATED, use bets array
const testBets = [
  {
    id: "BET-001",
    status: "pending",
    match: { home: "Manchester United", away: "Liverpool", league: "Premier League" },
    outcome: { label: "1", odd: 2.5, type: "1x2" },
    stake: 50.00,
    potentialWin: 125.00,
    createdAt: "2024-02-19 15:30:00"
  },
  {
    id: "BET-002",
    status: "active",
    match: { home: "Barcelona", away: "Real Madrid", league: "La Liga" },
    outcome: { label: "X", odd: 3.2, type: "1x2" },
    stake: 30.00,
    potentialWin: 96.00,
    createdAt: "2024-02-19 18:00:00"
  },
  {
    id: "BET-003",
    status: "won",
    match: { home: "Bayern Munich", away: "Dortmund", league: "Bundesliga" },
    outcome: { label: "2", odd: 2.1, type: "1x2" },
    stake: 100.00,
    potentialWin: 210.00,
    winAmount: 210.00,
    createdAt: "2024-02-18 20:00:00",
    settledAt: "2024-02-18 22:00:00"
  },
  {
    id: "BET-004",
    status: "lost",
    match: { home: "PSG", away: "Marseille", league: "Ligue 1" },
    outcome: { label: "1", odd: 1.8, type: "1x2" },
    stake: 75.00,
    potentialWin: 135.00,
    createdAt: "2024-02-17 19:30:00",
    settledAt: "2024-02-17 21:30:00"
  },
  {
    id: "BET-005",
    status: "won",
    match: { home: "Chelsea", away: "Arsenal", league: "Premier League" },
    outcome: { label: "Total Over", odd: 1.9, type: "total", value: "2.5" },
    stake: 60.00,
    potentialWin: 114.00,
    winAmount: 114.00,
    createdAt: "2024-02-16 16:00:00",
    settledAt: "2024-02-16 18:00:00"
  },
  {
    id: "BET-006",
    status: "cancelled",
    match: { home: "Juventus", away: "Inter Milan", league: "Serie A" },
    outcome: { label: "1", odd: 2.3, type: "1x2" },
    stake: 40.00,
    potentialWin: 92.00,
    createdAt: "2024-02-15 17:00:00",
    cancelledAt: "2024-02-15 17:30:00"
  },
  {
    id: "BET-007",
    status: "active",
    match: { home: "Atletico Madrid", away: "Sevilla", league: "La Liga" },
    outcome: { label: "Handicap +1", odd: 1.7, type: "fora", value: "+1" },
    stake: 45.00,
    potentialWin: 76.50,
    createdAt: "2024-02-19 19:00:00"
  },
  {
    id: "BET-008",
    status: "pending",
    match: { home: "Napoli", away: "Roma", league: "Serie A" },
    outcome: { label: "2", odd: 2.8, type: "1x2" },
    stake: 35.00,
    potentialWin: 98.00,
    createdAt: "2024-02-19 20:15:00"
  }
];

function formatBetOutcomeLabel(outcome) {
  if (outcome.type === "1x2") {
    return outcome.label;
  } else if (outcome.type === "total") {
    return `Total ${outcome.label === "Total Over" ? "Over" : "Under"} ${outcome.value || ""}`;
  } else if (outcome.type === "fora") {
    return `Handicap ${outcome.value || ""}`;
  }
  return outcome.label || "Unknown";
}

function formatDate(dateString) {
  if (!dateString) return "N/A";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

function renderBets() {
  const betsList = document.getElementById("bets-list");
  const betsEmpty = document.getElementById("bets-empty");
  
  if (!betsList) return;
  
  // Use real bets data from API
  let filteredBets = bets;
  if (state.betsFilter !== "all") {
    filteredBets = bets.filter(bet => bet.status === state.betsFilter);
  }
  
  // Sort by date (newest first)
  filteredBets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  if (filteredBets.length === 0) {
    betsList.style.display = "none";
    if (betsEmpty) betsEmpty.style.display = "block";
    return;
  }
  
  betsList.style.display = "flex";
  if (betsEmpty) betsEmpty.style.display = "none";
  
  betsList.innerHTML = filteredBets.map(bet => {
    const statusClass = `status-${bet.status}`;
    const outcomeLabel = formatBetOutcomeLabel(bet.outcome);
    
    let amountClass = "";
    let amountText = `$${Number(bet.stake).toFixed(2)}`;
    if (bet.status === "won" && bet.winAmount) {
      amountClass = "amount-won";
      amountText = `+$${Number(bet.winAmount).toFixed(2)}`;
    } else if (bet.status === "lost") {
      amountClass = "amount-lost";
      amountText = `-$${Number(bet.stake).toFixed(2)}`;
    } else if (bet.status === "cancelled") {
      amountText = `$${Number(bet.stake).toFixed(2)} (refunded)`;
    }
    
    // Формируем HTML для всех матчей (для экспресс-ставок)
    let matchesHtml = '';
    if (bet.isExpress && bet.matches && bet.matches.length > 0) {
      matchesHtml = bet.matches.map((match, idx) => `
        <div class="bet-card-match-item ${idx > 0 ? 'bet-card-match-item-express' : ''}">
          <div class="bet-card-match-teams">
            <span class="bet-card-team">${match.home}</span>
            <span class="bet-card-vs">vs</span>
            <span class="bet-card-team">${match.away}</span>
          </div>
          <div class="bet-card-match-info">
            <span class="bet-card-league">${match.league || ''}</span>
            <span class="bet-card-match-outcome">${match.outcome.label} @ ${formatOdd(match.outcome.odd)}</span>
          </div>
        </div>
      `).join('');
    } else {
      matchesHtml = `
        <div class="bet-card-match">
          <div class="bet-card-match-teams">
            <span class="bet-card-team">${bet.match.home}</span>
            <span class="bet-card-vs">vs</span>
            <span class="bet-card-team">${bet.match.away}</span>
          </div>
          <div class="bet-card-league">${bet.match.league || ''}</div>
        </div>
      `;
    }
    
    return `
      <div class="bet-card ${bet.isExpress ? 'bet-card-express' : ''}">
        <div class="bet-card-header">
          <div class="bet-card-id">
            ${bet.id}
            ${bet.isExpress ? '<span class="bet-card-express-badge">Express</span>' : ''}
          </div>
          <div class="bet-card-status ${statusClass}">${bet.status}</div>
        </div>
        ${matchesHtml}
        ${!bet.isExpress ? `
        <div class="bet-card-outcome">
          <span class="bet-card-outcome-label">Bet:</span>
          <span class="bet-card-outcome-value">${outcomeLabel} @ ${formatOdd(bet.outcome.odd)}</span>
        </div>
        ` : ''}
        <div class="bet-card-details">
          <div class="bet-card-detail-item">
            <div class="bet-card-detail-label">Stake</div>
            <div class="bet-card-detail-value">$${Number(bet.stake).toFixed(2)}</div>
          </div>
          <div class="bet-card-detail-item">
            <div class="bet-card-detail-label">${bet.status === "won" ? "Won" : bet.status === "lost" ? "Lost" : "Potential Win"}</div>
            <div class="bet-card-detail-value ${bet.status === "won" ? "amount-won" : bet.status === "lost" ? "amount-lost" : ""}">
              ${bet.status === "won" && bet.winAmount ? `$${Number(bet.winAmount).toFixed(2)}` : bet.status === "lost" ? "$0.00" : `$${Number(bet.potentialWin).toFixed(2)}`}
            </div>
          </div>
        </div>
        <div class="bet-card-footer">
          <span>${formatDate(bet.createdAt)}</span>
          <span class="bet-card-amount ${amountClass}">${amountText}</span>
        </div>
      </div>
    `;
  }).join("");
}

function setupBetsFilters() {
  const filterButtons = document.querySelectorAll(".bet-filter-btn");
  
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const status = btn.getAttribute("data-status");
      if (!status) return;
      
      // Update active filter
      filterButtons.forEach(b => b.classList.remove("bet-filter-active"));
      btn.classList.add("bet-filter-active");
      
      // Update state and reload bets
      state.betsFilter = status;
      loadBets();
    });
  });
}

// Favorites functionality
function toggleFavorite(type, id) {
  // Map type to correct key
  const keyMap = {
    'league': 'leagues',
    'match': 'matches'
  };
  
  const key = keyMap[type] || (type + 's');
  const favorites = state.favorites[key];
  
  if (!Array.isArray(favorites)) {
    state.favorites[key] = [];
  }
  
  const index = state.favorites[key].indexOf(id);
  
  if (index > -1) {
    state.favorites[key].splice(index, 1);
  } else {
    state.favorites[key].push(id);
  }
  
  // Save to localStorage
  const storageKey = type === 'match' ? 'favoriteMatches' : 'favoriteLeagues';
  localStorage.setItem(storageKey, JSON.stringify(state.favorites[key]));
  
  // Re-render
  if (type === 'league') {
    renderLeagues();
    if (state.activeTab === 'favorites' && state.favoriteTab === 'leagues') {
      renderFavoritesLeagues();
    }
  } else if (type === 'match') {
    renderMatches();
    if (state.activeTab === 'favorites' && state.favoriteTab === 'matches') {
      renderFavoritesMatches();
    }
  }
}

function isFavorite(type, id) {
  if (!state.favorites) {
    return false;
  }
  
  // Map type to correct key
  const keyMap = {
    'league': 'leagues',
    'match': 'matches'
  };
  
  const key = keyMap[type] || (type + 's');
  const favoritesArray = state.favorites[key];
  
  if (!Array.isArray(favoritesArray)) {
    return false;
  }
  
  return favoritesArray.includes(id);
}

function renderFavoritesLeagues() {
  const root = document.getElementById("favorites-leagues-list");
  if (!root) return;
  
  const favoriteLeagues = leagues.filter(l => state.favorites.leagues.includes(l.id));
  
  if (favoriteLeagues.length === 0) {
    root.innerHTML = '';
    document.getElementById("favorites-empty").style.display = 'block';
    return;
  }
  
  document.getElementById("favorites-empty").style.display = 'none';
  
  root.innerHTML = favoriteLeagues.map(l => `
    <div class="favorite-item">
      <div class="favorite-item-main">
        ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo" onerror="this.style.display='none';">` : ''}
        <div>
          <div class="favorite-item-name">${l.name}</div>
          <div class="favorite-item-meta">${l.count || 0} matches</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px; align-items: center;">
        <button class="favorite-btn favorite-btn-active" onclick="toggleFavorite('league', '${l.id}');">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
        <button class="go-to-all-bets-btn" onclick="state.activeLeagueId = '${l.id}'; switchTab('sportsbook'); renderLeagues(); renderMatches();">View</button>
      </div>
    </div>
  `).join('');
}

function renderFavoritesMatches() {
  const root = document.getElementById("favorites-matches-list");
  if (!root) return;
  
  const favoriteMatches = matches.filter(m => state.favorites.matches.includes(m.id));
  
  if (favoriteMatches.length === 0) {
    root.innerHTML = '';
    document.getElementById("favorites-empty").style.display = 'block';
    return;
  }
  
  document.getElementById("favorites-empty").style.display = 'none';
  
  root.innerHTML = favoriteMatches.map(m => {
    const isLive = m.isLive || false;
    const liveBadge = isLive ? '<span class="live-badge">LIVE</span>' : '';
    return `
      <div class="favorite-item">
        <div class="favorite-item-main">
          <div>
            <div class="favorite-item-name">${m.home} vs ${m.away}</div>
            <div class="favorite-item-meta">${m.leagueName} ${liveBadge}</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; align-items: center;">
          <button class="favorite-btn favorite-btn-active" onclick="toggleFavorite('match', '${m.id}');">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
          <button class="go-to-all-bets-btn" onclick="loadMatchDetail('${m.matchId}', ${JSON.stringify(m).replace(/"/g, '&quot;')});">View</button>
        </div>
      </div>
    `;
  }).join('');
}

// Leagues search modal
function openLeaguesSearchModal() {
  const modal = document.getElementById("leagues-search-modal");
  if (!modal) return;
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Render popular leagues first
  renderLeaguesModal();
  
  // Focus search input
  setTimeout(() => {
    const searchInput = document.getElementById("leagues-modal-search");
    if (searchInput) searchInput.focus();
  }, 100);
}

function closeLeaguesSearchModal() {
  const modal = document.getElementById("leagues-search-modal");
  if (!modal) return;
  
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function renderLeaguesModal() {
  const root = document.getElementById("leagues-modal-list");
  if (!root) return;
  
  const searchInput = document.getElementById("leagues-modal-search");
  const searchQuery = (searchInput?.value || "").trim().toLowerCase();
  
  // Popular leagues (top leagues by match count)
  const popularLeagues = [...leagues]
    .filter(l => l.id !== 'all')
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 20);
  
  // Filter by search query
  const filtered = searchQuery 
    ? popularLeagues.filter(l => l.name.toLowerCase().includes(searchQuery))
    : popularLeagues;
  
  // Group by country for better organization
  const grouped = {};
  filtered.forEach(l => {
    const country = l.country || 'Other';
    if (!grouped[country]) grouped[country] = [];
    grouped[country].push(l);
  });
  
  // Popular countries first
  const popularCountries = ['🇬🇧', '🇪🇸', '🇮🇹', '🇩🇪', '🇫🇷', '🇳🇱', '🇵🇹', '🇷🇺'];
  const sortedCountries = Object.keys(grouped).sort((a, b) => {
    const aIndex = popularCountries.indexOf(a);
    const bIndex = popularCountries.indexOf(b);
    if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
  
  if (filtered.length === 0) {
    root.innerHTML = '<div class="bets-empty"><div class="bets-empty-text">No leagues found</div></div>';
    return;
  }
  
  root.innerHTML = sortedCountries.map(country => {
    const countryLeagues = grouped[country];
    return `
      <div class="leagues-modal-group">
        <div class="leagues-modal-group-title">${country}</div>
        ${countryLeagues.map(l => {
          const isFavorite = state.favorites.leagues.includes(l.id);
          return `
            <button class="leagues-modal-item ${state.activeLeagueId === l.id ? 'leagues-modal-item-active' : ''}" 
                    onclick="state.activeLeagueId = '${l.id}'; switchTab('sportsbook'); closeLeaguesSearchModal(); renderLeagues(); renderMatches();">
              <div class="leagues-modal-item-main">
                ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo" onerror="this.style.display='none';">` : ''}
                <span class="leagues-modal-item-name">${l.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                ${l.count > 0 ? `<span class="pill">${l.count}</span>` : ''}
                <button class="favorite-btn ${isFavorite ? 'favorite-btn-active' : ''}" 
                        onclick="event.stopPropagation(); toggleFavorite('league', '${l.id}'); renderLeaguesModal();">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                  </svg>
                </button>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }).join('');
}

// Expose toggleFavorite globally
window.toggleFavorite = toggleFavorite;

function init() {
  renderLeagues();
  renderMatches();
  renderSlip();
  setupTabs();
  setupBottomNav();
  setupBetsFilters();
  // Don't load bets on init, only when user switches to bets tab
  // Set initial active state for bottom nav
  updateBottomNavActive();

  document
    .getElementById("leagues-list")
    .addEventListener("click", handleLeagueClick);
  document
    .querySelector(".sidebar")
    .addEventListener("click", handleLeagueClick);
  
  // Leagues search modal handlers
  const leaguesSearchBtn = document.getElementById("leagues-search-btn");
  const leaguesSearchModal = document.getElementById("leagues-search-modal");
  const leaguesSearchModalClose = document.getElementById("leagues-search-modal-close");
  const leaguesModalSearch = document.getElementById("leagues-modal-search");
  
  if (leaguesSearchBtn) {
    leaguesSearchBtn.addEventListener("click", openLeaguesSearchModal);
  }
  
  if (leaguesSearchModalClose) {
    leaguesSearchModalClose.addEventListener("click", closeLeaguesSearchModal);
  }
  
  if (leaguesSearchModal) {
    const overlay = leaguesSearchModal.querySelector(".modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", closeLeaguesSearchModal);
    }
  }
  
  if (leaguesModalSearch) {
    leaguesModalSearch.addEventListener("input", renderLeaguesModal);
  }
  
  // Favorites tab handlers
  const favoriteTabBtns = document.querySelectorAll(".favorite-tab-btn");
  favoriteTabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-favorite-type");
      if (!type) return;
      
      favoriteTabBtns.forEach(b => b.classList.remove("favorite-tab-active"));
      btn.classList.add("favorite-tab-active");
      
      state.favoriteTab = type;
      
      if (type === "leagues") {
        document.getElementById("favorites-leagues-list").style.display = "block";
        document.getElementById("favorites-matches-list").style.display = "none";
        renderFavoritesLeagues();
      } else {
        document.getElementById("favorites-leagues-list").style.display = "none";
        document.getElementById("favorites-matches-list").style.display = "block";
        renderFavoritesMatches();
      }
    });
  });
  
  // Close modal on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const leaguesModal = document.getElementById("leagues-search-modal");
      if (leaguesModal && leaguesModal.style.display !== "none") {
        closeLeaguesSearchModal();
      }
      const detailPage = document.getElementById("match-detail-page");
      if (detailPage && detailPage.style.display !== "none") {
        closeMatchDetailPage();
      }
    }
  });
  
  // Back button handler for match detail page
  const matchDetailBackBtn = document.getElementById("match-detail-back-btn");
  if (matchDetailBackBtn) {
    matchDetailBackBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMatchDetailPage();
    });
  }
  // Handle odds clicks and match card clicks
  const matchesListEl = document.getElementById("matches-list");
  if (matchesListEl) {
    matchesListEl.addEventListener("click", (e) => {
      // First try to handle odds click
      // Check if clicking on outcome button first
      if (e.target.closest(".outcome-btn, .outcome-cell")) {
        const handled = handleOddsClick(e);
        // If odds were clicked, don't open modal
        if (handled) return;
      }
      
      // Don't open modal if clicking on action button, favorite button, or other interactive elements
      if (e.target.closest(".go-to-all-bets-btn, .go-to-all-bets-btn-digital, .match-actions, .match-actions-mobile, .favorite-btn-digital, .favorite-btn-match, .odds-group, .odds-buttons")) {
        return;
      }
      
      // Find match card (both old and new format)
      const matchCard = e.target.closest(".match-card-digital, .match-row");
      if (!matchCard) return;
      
      const matchId = matchCard.getAttribute("data-match-id");
      const match = matches.find((m) => m.id === matchId);
      if (!match || !match.matchId) return;
      
      // Open match detail modal
      loadMatchDetail(match.matchId, match);
    });
  }
  document.getElementById("slip-items").addEventListener("click", handleSlipClick);

  document.getElementById("search-input").addEventListener("input", () => {
    renderLeagues();
  });

  // Matches search handlers
  const matchesSearchInput = document.getElementById("matches-search-input");
  const matchesSearchClear = document.getElementById("matches-search-clear");

  matchesSearchInput.addEventListener("input", (e) => {
    state.searchQuery = e.target.value;
    state.currentPage = 1; // Reset to first page when searching
    renderMatches();
    
    // Show/hide clear button
    if (state.searchQuery.trim()) {
      matchesSearchClear.style.display = "flex";
    } else {
      matchesSearchClear.style.display = "none";
    }
  });

  matchesSearchClear.addEventListener("click", () => {
    matchesSearchInput.value = "";
    state.searchQuery = "";
    state.currentPage = 1;
    matchesSearchClear.style.display = "none";
    renderMatches();
    matchesSearchInput.focus();
  });

  // Pagination handlers
  document.addEventListener("click", (e) => {
    const paginationBtn = e.target.closest(".pagination-btn");
    if (!paginationBtn || paginationBtn.disabled) return;
    const page = Number(paginationBtn.getAttribute("data-page"));
    if (page > 0) {
      state.currentPage = page;
      renderMatches();
      // Scroll to top of matches
      document.getElementById("matches-list").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  document.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const amount = Number(btn.getAttribute("data-amount") || "0");
      setStake(amount);
    });
  });

  document.getElementById("stake-input").addEventListener("input", (e) => {
    const value = Number(e.target.value || "0");
    state.stake = value > 0 ? value : 0;
    renderSlip();
  });

  document.getElementById("place-bet-btn").addEventListener("click", async () => {
    if (!state.slip.length || !state.stake) return;
    
    const placeBtn = document.getElementById("place-bet-btn");
    placeBtn.disabled = true;
    placeBtn.textContent = "Placing bet...";
    
    try {
      const response = await fetch(`${PHP_API_BASE}/bets.php`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          slip: state.slip,
          stake: state.stake
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to place bet');
      }
      
      // Успешно создана ставка
      if (typeof Swal !== 'undefined') {
        await Swal.fire({
          title: 'Success!',
          text: `Bet placed successfully! Bet ID: ${data.bets[0].id}`,
          icon: 'success',
          confirmButtonText: 'OK',
          confirmButtonColor: '#22c55e'
        });
      } else {
        alert(`Bet placed successfully! Bet ID: ${data.bets[0].id}`);
      }
      
      // Обновляем баланс сразу после создания ставки
      if (data.newBalance !== undefined) {
        // Update currentUser if it exists
        if (typeof currentUser !== 'undefined' && currentUser) {
          currentUser.balance = parseFloat(data.newBalance);
        }
        
        // Update balance in UI immediately
        const balanceText = `$${parseFloat(data.newBalance).toFixed(2)}`;
        const balanceElMobile = document.getElementById('profile-balance-mobile');
        const balanceElDesktop = document.getElementById('profile-balance-desktop');
        
        if (balanceElMobile) {
          balanceElMobile.textContent = balanceText;
        }
        if (balanceElDesktop) {
          balanceElDesktop.textContent = balanceText;
        }
        
        // Also update wallet balance if exists
        const walletBalanceEl = document.getElementById('wallet-balance');
        if (walletBalanceEl) {
          walletBalanceEl.textContent = balanceText;
        }
        
        // Call updateProfileBalance if function exists
        if (typeof updateProfileBalance === 'function') {
          updateProfileBalance();
        }
      }
      
      // Очищаем betslip
      state.slip = [];
      state.stake = 0;
      renderMatches();
      renderSlip();
      
      // Обновляем список ставок, если мы на странице ставок
      if (state.activeTab === 'bets') {
        await loadBets();
      }
      
    } catch (error) {
      console.error('Error placing bet:', error);
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Error',
          text: error.message || 'Failed to place bet',
          icon: 'error',
          confirmButtonText: 'OK',
          confirmButtonColor: '#ef4444'
        });
      } else {
        alert('Error: ' + (error.message || 'Failed to place bet'));
      }
    } finally {
      placeBtn.disabled = false;
      placeBtn.textContent = "Place bet";
    }
  });

  document.getElementById("clear-slip-btn").addEventListener("click", () => {
    state.slip = [];
    renderMatches();
    renderSlip();
  });

  // Match detail modal handlers
  const modal = document.getElementById("match-detail-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");
  const modalOverlay = modal.querySelector(".modal-overlay");

  modalCloseBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", closeModal);

  // Close modal on Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display !== "none") {
      closeModal();
    }
  });

  // Handle window resize - restore betslip if switching to mobile
  window.addEventListener("resize", () => {
    const modal = document.getElementById("match-detail-modal");
    if (modal && modal.style.display !== "none") {
      if (window.innerWidth <= 768) {
        // If switched to mobile, restore betslip
        const betslip = document.querySelector('.betslip');
        const modalBetslipContainer = document.getElementById("modal-betslip-container");
        if (betslip && modalBetslipContainer && betslip.parentElement === modalBetslipContainer) {
          const originalParent = betslip?.dataset?.originalParent;
          if (originalParent) {
            try {
              const parent = document.querySelector(originalParent);
              if (parent) {
                parent.appendChild(betslip);
                betslip.classList.remove('modal-betslip');
                betslip.style.display = betslip.dataset.originalDisplay || '';
              }
            } catch (e) {
              console.error('[Modal] Error restoring betslip on resize:', e);
            }
          }
        }
      } else {
        // If switched to desktop, move betslip to modal if modal is open
        openModal();
      }
    }
  });

}

// Modal functions (defined outside init to be accessible globally)
function closeModal() {
  const modal = document.getElementById("match-detail-modal");
  if (modal) modal.style.display = "none";
  
  // Restore betslip to original position only on desktop
  if (window.innerWidth > 768) {
    const betslip = document.querySelector('.betslip');
    const modalBetslipContainer = document.getElementById("modal-betslip-container");
    const originalParent = betslip?.dataset?.originalParent;
    
    if (betslip && modalBetslipContainer && betslip.parentElement === modalBetslipContainer && originalParent) {
      try {
        const parent = document.querySelector(originalParent);
        if (parent) {
          parent.appendChild(betslip);
          betslip.classList.remove('modal-betslip');
          betslip.style.display = betslip.dataset.originalDisplay || '';
          betslip.style.width = '';
          betslip.style.height = '';
          betslip.style.position = '';
          betslip.style.top = '';
          betslip.style.right = '';
          betslip.style.zIndex = '';
          betslip.style.flexDirection = '';
        } else {
          // Fallback: try to find layout
          const layout = document.querySelector('.layout');
          if (layout) {
            layout.appendChild(betslip);
            betslip.classList.remove('modal-betslip');
            betslip.style.display = betslip.dataset.originalDisplay || '';
          }
        }
      } catch (e) {
        console.error('[Modal] Error restoring betslip:', e);
        // Fallback: try to find layout
        const layout = document.querySelector('.layout');
        if (layout && betslip) {
          layout.appendChild(betslip);
          betslip.classList.remove('modal-betslip');
          betslip.style.display = betslip.dataset.originalDisplay || '';
        }
      }
    }
  }
}

function openModal() {
  const modal = document.getElementById("match-detail-modal");
  if (modal) modal.style.display = "flex";
  
  // Move betslip into modal only on desktop
  if (window.innerWidth > 768) {
    const betslip = document.querySelector('.betslip');
    const modalBetslipContainer = document.getElementById("modal-betslip-container");
    
    if (betslip && modalBetslipContainer && betslip.parentElement !== modalBetslipContainer) {
      // Store original parent element reference
      if (!betslip.dataset.originalParent) {
        const originalParent = betslip.parentElement;
        if (originalParent) {
          // Use class name for layout
          if (originalParent.classList.contains('layout')) {
            betslip.dataset.originalParent = '.layout';
          } else {
            // Try other selectors
            let selector = '';
            if (originalParent.id) {
              selector = `#${originalParent.id}`;
            } else if (originalParent.className) {
              const classes = originalParent.className.split(' ').filter(c => c && c !== 'betslip').join('.');
              if (classes) {
                selector = `.${classes}`;
              }
            }
            
            if (!selector) {
              selector = originalParent.tagName.toLowerCase();
            }
            
            betslip.dataset.originalParent = selector;
          }
          betslip.dataset.originalDisplay = betslip.style.display || '';
        }
      }
      
      // Move betslip to modal
      modalBetslipContainer.appendChild(betslip);
      betslip.classList.add('modal-betslip');
      betslip.style.display = 'flex';
      betslip.style.flexDirection = 'column';
    }
  }
}

// Close match detail page function (global)
function closeMatchDetailPage() {
  const detailPage = document.getElementById("match-detail-page");
  const mainLayout = document.querySelector('.layout');
  
  if (detailPage) {
    detailPage.style.display = 'none';
  }
  if (mainLayout) {
    mainLayout.style.display = 'flex';
  }
  
  // Restore sidebar and betslip visibility
  const sidebar = document.querySelector('.sidebar');
  const betslip = document.querySelector('.betslip');
  if (sidebar) {
    sidebar.style.display = '';
  }
  if (betslip) {
    betslip.style.display = '';
  }
}

// Expose globally
window.closeMatchDetailPage = closeMatchDetailPage;

async function loadMatchDetail(fixtureIdOrMatch, match) {
  console.log('[Match Detail] Starting loadMatchDetail', { fixtureIdOrMatch, match });
  
  // Use modal instead of separate page
  const modal = document.getElementById("match-detail-modal");
  const modalTitle = document.getElementById("modal-match-title");
  const modalBody = document.getElementById("modal-body");
  
  // Check if elements exist
  if (!modal || !modalTitle || !modalBody) {
    console.error('[Match Detail] Modal elements not found!', { 
      modal: !!modal, 
      modalTitle: !!modalTitle, 
      modalBody: !!modalBody 
    });
    return;
  }
  
  // Handle both cases: fixtureId as first param or match object
  let fixtureId;
  let matchObj;
  
  if (typeof fixtureIdOrMatch === 'string' || typeof fixtureIdOrMatch === 'number') {
    fixtureId = String(fixtureIdOrMatch);
    matchObj = match;
  } else {
    matchObj = fixtureIdOrMatch;
    fixtureId = matchObj?.matchId;
  }
  
  if (!matchObj) {
    matchObj = matches.find(m => m.matchId === fixtureId || m.id === fixtureId);
  }
  
  if (!matchObj) {
    console.error('[Match Detail] Match not found for fixtureId:', fixtureId);
    alert('Матч не найден');
    return;
  }
  
  console.log('[Match Detail] Match found:', { fixtureId, matchObj });
  
  // Build match header with logos and score
  const home = matchObj?.home || 'Home';
  const away = matchObj?.away || 'Away';
  const homeLogo = matchObj?.homeLogo || null;
  const awayLogo = matchObj?.awayLogo || null;
  const isLive = matchObj?.isLive || false;
  const score = matchObj?.score || null;
  const liveTime = matchObj?.liveTime || null;
  const livePeriod = matchObj?.livePeriod || null;
  const leagueName = matchObj?.leagueName || '';
  
  const homeLogoHtml = homeLogo ? `<img src="${homeLogo}" alt="${home}" class="team-logo" onerror="this.style.display='none';">` : '';
  const awayLogoHtml = awayLogo ? `<img src="${awayLogo}" alt="${away}" class="team-logo" onerror="this.style.display='none';">` : '';
  
  // Set title with logos (simple format as before)
  modalTitle.innerHTML = `${homeLogoHtml}<span class="team-name">${home}</span> <span style="opacity:.7">vs</span> <span class="team-name">${away}</span>${awayLogoHtml}`;
  
  // Show skeleton loading
  modalBody.innerHTML = `
    <div class="skeleton-loading">
      <div class="skeleton-group">
        <div class="skeleton-title"></div>
        <div class="skeleton-grid">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      </div>
      <div class="skeleton-group">
        <div class="skeleton-title"></div>
        <div class="skeleton-grid">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      </div>
    </div>
  `;
  
  // Open modal
  openModal();
  
  try {
    // Use PHP API to get match details and odds
    if (!fixtureId) {
      modalBody.innerHTML = '<div class="loading" style="padding: 40px; text-align: center; color: rgba(248, 113, 113, 0.9);">ID матча не найден</div>';
      return;
    }
    
    console.log('[Match Detail] Fetching odds for fixture:', fixtureId);
    const url = `${PHP_API_BASE}/match-detail.php?fixture=${fixtureId}`;
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('[Match Detail] Data received, odds count:', data.odds?.length || 0);
    
    if (!data.ok || !data.odds || data.odds.length === 0) {
      modalBody.innerHTML = '<div class="loading" style="padding: 40px; text-align: center; color: rgba(232, 232, 234, 0.7);">Коэффициенты не найдены</div>';
      return;
    }
    
    // Render odds as blocks - grouped by bet type (not by bookmaker)
    // Group all bets by type across all bookmakers
    const allBetsByType = {};
    
    data.odds.forEach(bookmaker => {
      if (!bookmaker.bets || !Array.isArray(bookmaker.bets) || bookmaker.bets.length === 0) return;
      
      bookmaker.bets.forEach(bet => {
        if (!bet.values || !Array.isArray(bet.values) || bet.values.length === 0) return;
        
        const betName = bet.name || 'Unknown Bet';
        if (!allBetsByType[betName]) {
          allBetsByType[betName] = [];
        }
        
        // Add bookmaker info to each bet value
        bet.values.forEach(value => {
          allBetsByType[betName].push({
            ...value,
            bookmakerId: bookmaker.id,
            bookmakerName: bookmaker.name || 'Unknown',
            betId: bet.id
          });
        });
      });
    });
    
    // Render each bet type as a block
    let html = '<div class="match-detail-odds-blocks">';
    
    Object.keys(allBetsByType).forEach(betName => {
      const betValues = allBetsByType[betName];
      
      // For each bet type, find best odds (highest) for each unique outcome
      const bestOdds = {};
      betValues.forEach(item => {
        const label = item.value;
        const odd = parseFloat(item.odd);
        if (isNaN(odd) || odd <= 0) return;
        
        const key = label;
        if (!bestOdds[key] || odd > bestOdds[key].odd) {
          bestOdds[key] = {
            label,
            odd,
            bookmakerId: item.bookmakerId,
            bookmakerName: item.bookmakerName,
            betId: item.betId
          };
        }
      });
      
      html += `<div class="match-detail-odds-block">`;
      html += `<div class="match-detail-odds-block-title">${betName}</div>`;
      html += `<div class="match-detail-odds-block-content">`;
      
      Object.values(bestOdds).forEach(item => {
        const outcomeId = `${fixtureId}_${item.bookmakerId}_${item.betId}_${item.label}_${item.odd}`;
        const matchId = matchObj?.id || fixtureId;
        
        // Check if this outcome is in slip
        const isActive = state.slip.some(s => {
          return s.outcomeId === outcomeId || 
                 (s.matchId === matchId && 
                  s.bookmakerId === String(item.bookmakerId) && 
                  s.betId === String(item.betId) && 
                  s.value === item.label &&
                  Math.abs(s.odd - item.odd) < 0.01);
        });
        
        html += `
          <button class="match-detail-odds-btn ${isActive ? "match-detail-odds-btn-active" : ""}" 
                  data-match-id="${matchId}"
                  data-fixture-id="${fixtureId}"
                  data-bookmaker-id="${item.bookmakerId}"
                  data-bookmaker-name="${item.bookmakerName}"
                  data-bet-id="${item.betId}"
                  data-bet-name="${betName}"
                  data-value="${item.label}"
                  data-odd="${item.odd}"
                  data-outcome-id="${outcomeId}">
            <span class="match-detail-odds-btn-label">${item.label}</span>
            <span class="match-detail-odds-btn-value">${formatOdd(item.odd)}</span>
          </button>
        `;
      });
      
      html += `</div></div>`;
    });
    
    html += '</div>';
    
    modalBody.innerHTML = html;
    console.log('[Match Detail] Content set, buttons count:', modalBody.querySelectorAll('.match-detail-odds-btn').length);
    
    // Add click handlers for bet buttons
    const oddsButtons = modalBody.querySelectorAll('.match-detail-odds-btn');
    console.log('[Match Detail] Found', oddsButtons.length, 'odds buttons');
    
    oddsButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = btn.getAttribute('data-match-id');
        const fixtureId = btn.getAttribute('data-fixture-id');
        const bookmakerId = btn.getAttribute('data-bookmaker-id');
        const bookmakerName = btn.getAttribute('data-bookmaker-name');
        const betId = btn.getAttribute('data-bet-id');
        const betName = btn.getAttribute('data-bet-name');
        const value = btn.getAttribute('data-value');
        const odd = Number(btn.getAttribute('data-odd'));
        const outcomeId = btn.getAttribute('data-outcome-id');
        
        // Log fixture_id and bet_id when clicking on bet
        console.log('Bet clicked - fixture_id:', fixtureId, 'bet_id:', betId);
        
        if (!matchId || !outcomeId || !odd) return;
        
        const matchObj = matches.find((m) => m.id === matchId);
        if (!matchObj) return;
        
        // Check if it's the exact same outcome
        const existingSameOutcomeIdx = state.slip.findIndex(
          (s) => s.outcomeId === outcomeId || 
                 (s.matchId === matchId && 
                  s.bookmakerId === bookmakerId && 
                  s.betId === betId && 
                  s.value === value &&
                  Math.abs(s.odd - odd) < 0.01)
        );
        
        // Check if there's already ANY bet on this match (different outcome)
        const existingMatchIdx = state.slip.findIndex((s) => s.matchId === matchId);
        
        const next = {
          matchId: matchObj.id,
          fixtureId: fixtureId || matchObj.matchId,
          bookmakerId: String(bookmakerId),
          bookmakerName: bookmakerName,
          betId: String(betId),
          betName: betName,
          value: value,
          odd: odd,
          outcomeId: outcomeId,
          home: matchObj.home || 'Home',
          away: matchObj.away || 'Away',
          leagueName: matchObj.leagueName || 'Unknown League',
          // For display
          label: `${bookmakerName} - ${betName}: ${value}`,
          outcomeKey: `api_${bookmakerId}_${betId}_${value}`
        };
        
        // If clicking the same exact outcome, toggle it off
        if (existingSameOutcomeIdx >= 0) {
          state.slip.splice(existingSameOutcomeIdx, 1);
        } 
        // If there's already a bet on this match (different outcome), replace it
        else if (existingMatchIdx >= 0) {
          state.slip.splice(existingMatchIdx, 1, next);
        }
        // Otherwise, add the new bet
        else {
          state.slip.unshift(next);
        }
        
        renderMatches();
        renderSlip();
        
        // On mobile: close modal and open betslip
        if (isMobile()) {
          closeModal();
          setTimeout(() => {
            openBetslipMobile();
          }, 200);
        } else {
          // On desktop: reload modal to reflect changes
          loadMatchDetail(fixtureId, matchObj);
        }
      });
    });
    
  } catch (error) {
    console.error('[Match Detail] Error loading match detail:', error);
    modalBody.innerHTML = `<div class="loading" style="padding: 40px; text-align: center; color: rgba(248, 113, 113, 0.9);">Ошибка загрузки: ${error.message}</div>`;
  }
}

// Initialize Telegram Web App
function initTelegramWebApp() {
  if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    // Set theme colors
    tg.setHeaderColor('#181a20');
    tg.setBackgroundColor('#111317');
    
    // Enable closing confirmation
    tg.enableClosingConfirmation();
    
    // Set main button if needed
    // tg.MainButton.setText('Place bet');
    // tg.MainButton.show();
  }
}

window.addEventListener("DOMContentLoaded", () => {
  initTelegramWebApp();
  init();
  // Load matches only on initial page load
  loadMatches(true);
  // Check and settle bets on page load
  checkAndSettleBets();
  
  // Set up periodic check for settled bets (every 30 seconds)
  setInterval(() => {
    checkAndSettleBets();
  }, 30000); // Check every 30 seconds
  
  // Setup mobile betslip handlers
  const floatBtn = document.getElementById("betslip-float-btn");
  const overlay = document.getElementById("betslip-overlay");
  const betslip = document.querySelector('.betslip');
  const closeBtn = document.getElementById("betslip-close-btn");
  
  if (floatBtn) {
    floatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggleBetslipMobile();
    });
    
    floatBtn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
  }
  
  // Обрабатываем клики на document для закрытия betslip при клике вне его
  document.addEventListener('click', (e) => {
    if (!isMobile()) return;
    
    const betslip = document.querySelector('.betslip.betslip-open');
    if (!betslip) return;
    
    // Если клик был внутри betslip или на плавающей кнопке, не закрываем
    if (betslip.contains(e.target) || 
        e.target.closest('#betslip-float-btn') ||
        e.target.closest('.betslip-close-btn')) {
      return;
    }
    
    // Если клик был вне betslip, закрываем его
    closeBetslipMobile();
  });
  
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeBetslipMobile();
    });
    
    closeBtn.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
  }
  
  // Предотвращаем закрытие betslip при клике внутри него
  if (betslip) {
    betslip.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    betslip.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    betslip.addEventListener('touchstart', (e) => {
      e.stopPropagation();
    });
  }
  
  // Handle "Go to all bets" button clicks (works on both mobile and desktop)
  document.addEventListener('click', (e) => {
    const goToBetsBtn = e.target.closest('.go-to-all-bets-btn, .go-to-all-bets-btn-digital');
    if (!goToBetsBtn) return;
    
    e.stopPropagation();
    e.preventDefault();
    
    const matchId = goToBetsBtn.getAttribute('data-match-id');
    const match = matches.find((m) => m.id === matchId);
    if (!match || !match.matchId) return;
    
    loadMatchDetail(match.matchId, match);
  });
  
  // Handle profile icon click
  const profileIconBtn = document.getElementById('profile-icon-btn');
  const profileIconBtnDesktop = document.getElementById('profile-icon-btn-desktop');
  
  // Handle profile icon click (mobile)
  if (profileIconBtn) {
    profileIconBtn.addEventListener('click', () => {
      switchTab('profile');
    });
  }
  
  // Handle profile icon click (desktop)
  if (profileIconBtnDesktop) {
    profileIconBtnDesktop.addEventListener('click', () => {
      switchTab('profile');
    });
  }
  if (profileIconBtn) {
    profileIconBtn.addEventListener('click', () => {
      const profileTab = document.querySelector('[data-tab="profile"]');
      if (profileTab) {
        profileTab.click();
      }
    });
  }
  
  // Update profile balance in header
  function updateProfileBalance() {
    if (typeof currentUser !== 'undefined' && currentUser) {
      const balanceText = `$${currentUser.balance.toFixed(2)}`;
      const balanceElMobile = document.getElementById('profile-balance-mobile');
      const balanceElDesktop = document.getElementById('profile-balance-desktop');
      if (balanceElMobile && currentUser.balance !== undefined) {
        balanceElMobile.textContent = balanceText;
      }
      if (balanceElDesktop && currentUser.balance !== undefined) {
        balanceElDesktop.textContent = balanceText;
      }
    }
  }
  
  // Expose updateProfileBalance globally so wallet.js can call it
  window.updateProfileBalance = updateProfileBalance;
  
  // Call update when user data is loaded (if wallet.js is loaded)
  if (typeof window.updateUserUI === 'function') {
    const originalUpdateUserUI = window.updateUserUI;
    window.updateUserUI = function() {
      originalUpdateUserUI();
      updateProfileBalance();
    };
  }
  
  // Initial update after a delay to allow wallet.js to load
  setTimeout(updateProfileBalance, 500);
  
  // Also listen for custom event from wallet.js
  window.addEventListener('userUpdated', () => {
    updateProfileBalance();
  });
  
  // Show float button on mobile on load
  if (isMobile()) {
    const floatBtn = document.getElementById("betslip-float-btn");
    if (floatBtn) {
      floatBtn.style.display = 'flex';
      floatBtn.classList.remove('hidden');
    }
  } else {
    const floatBtn = document.getElementById("betslip-float-btn");
    if (floatBtn) {
      floatBtn.style.display = 'none';
    }
  }
  
  // Handle window resize
  window.addEventListener('resize', () => {
    const floatBtn = document.getElementById("betslip-float-btn");
    if (!isMobile()) {
      closeBetslipMobile();
      if (floatBtn) floatBtn.classList.add('hidden');
      if (betslip) {
        betslip.style.display = '';
        betslip.classList.remove('betslip-open');
      }
    } else {
      if (floatBtn && (state.slip.length > 0 || document.querySelector('.betslip.betslip-open'))) {
        floatBtn.classList.remove('hidden');
      }
    }
  });
});

