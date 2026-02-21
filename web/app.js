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
  betsFilter: "all" // Filter for bets page: all, pending, active, won, lost, cancelled
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
      (l) => `
      <button class="league-item ${
        state.activeLeagueId === l.id ? "league-item-active" : ""
      }" data-league="${l.id}">
        <div class="league-main">
          ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
            <span class="league-flag" style="display:none;">${l.country || "🏳️"}</span>` : 
            `<span class="league-flag">${l.country || "🏳️"}</span>`}
          <span class="league-name">${l.name}</span>
        </div>
        ${l.count > 0 ? `<span class="pill">${l.count}</span>` : ""}
      </button>
    `
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
  const outcomes = match.allOutcomes || [];
  
  // Group outcomes by type
  const outcome1X2 = outcomes.find((o) => o.label === "1" && o.type === "1x2");
  const outcomeX = outcomes.find((o) => o.label === "X" && o.type === "1x2");
  const outcome2 = outcomes.find((o) => o.label === "2" && o.type === "1x2");
  const totalOver = outcomes.find((o) => o.type === "total" && (o.label === "Тотал Б" || o.label.includes("Total O") || o.label.includes("Over")));
  const totalValue = totalOver?.value || outcomes.find((o) => o.type === "total")?.value || "";
  const totalUnder = outcomes.find((o) => o.type === "total" && (o.label === "Тотал М" || o.label.includes("Total U") || o.label.includes("Under")));
  const fora1 = outcomes.find((o) => o.type === "fora" && (o.label === "Фора 1" || o.label.includes("Handicap 1")));
  const foraValue = fora1?.value || outcomes.find((o) => o.type === "fora")?.value || "";
  const fora2 = outcomes.find((o) => o.type === "fora" && (o.label === "Фора 2" || o.label.includes("Handicap 2")));

  const isLive = match.isLive || false;
  const liveBadge = isLive ? '<span class="live-badge">LIVE</span>' : '';
  const scoreDisplay = isLive && match.score 
    ? `<div class="match-score">${match.score.home} : ${match.score.away}</div>` 
    : '';
  const liveTimeDisplay = isLive && match.liveTime 
    ? `<span class="live-time-highlight">${match.liveTime}${match.livePeriod ? ' • ' + match.livePeriod : ''}</span>` 
    : `<span class="pill">${match.time || "TBD"}</span>`;

  const homeLogoHtml = match.homeLogo 
    ? `<img src="${match.homeLogo}" alt="${match.home}" class="team-logo" onerror="this.style.display='none';">` 
    : '';
  const awayLogoHtml = match.awayLogo 
    ? `<img src="${match.awayLogo}" alt="${match.away}" class="team-logo" onerror="this.style.display='none';">` 
    : '';

  return `
    <div class="match-row ${isLive ? 'match-row-live' : ''}" data-match-id="${match.id}">
      <div class="match-info">
        <div class="match-league">${liveBadge} ${match.leagueName}</div>
        <div class="match-title">
          ${homeLogoHtml}
          <span class="team-name">${match.home}</span>
          <span style="opacity:.7">vs</span>
          <span class="team-name">${match.away}</span>
          ${awayLogoHtml}
        </div>
        ${scoreDisplay}
        <div class="match-time">
          ${liveTimeDisplay}
        </div>
      </div>
      <div class="match-actions">
        <button class="go-to-all-bets-btn" data-match-id="${match.id}">Go to all bets</button>
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
  
  // Map outcomeKey to display label for mobile
  const labelMap = {
    "1": "1",
    "X": "X",
    "2": "2",
    "total_over": "O",
    "total_under": "U",
    "fora_one": "1",
    "fora_two": "2"
  };
  const mobileLabel = labelMap[outcomeKey] || label;
  
  return `
    <div class="outcome-wrapper">
      <div class="outcome-label-mobile">${mobileLabel}</div>
      <button
        class="outcome-cell outcome-btn ${active ? "outcome-btn-active" : ""}"
        data-match-id="${match.id}"
        data-outcome-key="${outcomeKey}"
        data-odd="${odd}"
        ${value ? `data-value="${value}"` : ""}
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
  // Handle odds clicks - this should stop propagation to prevent modal opening
  document
    .getElementById("matches-list")
    .addEventListener("click", (e) => {
      // First try to handle odds click
      // Check if clicking on outcome button first
      if (e.target.closest(".outcome-btn, .outcome-cell")) {
        const handled = handleOddsClick(e);
        // If odds were clicked, don't open modal
        if (handled) return;
      }
      
      // Otherwise, check if we should open match detail modal
      // Don't open modal if clicking on action button
      if (e.target.closest(".go-to-all-bets-btn, .match-actions, .match-actions-mobile")) {
        return;
      }
      
      // On mobile, don't open modal on match row click - only via button
      if (isMobile()) {
        return;
      }
      
      // On desktop, clicking match row opens detail modal
      const matchRow = e.target.closest(".match-row");
      if (!matchRow) return;
      
      const matchId = matchRow.getAttribute("data-match-id");
      const match = matches.find((m) => m.id === matchId);
      if (!match || !match.matchId) return;
      
      loadMatchDetail(match.matchId, match);
    });
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

}

// Modal functions (defined outside init to be accessible globally)
function closeModal() {
  const modal = document.getElementById("match-detail-modal");
  if (modal) modal.style.display = "none";
}

function openModal() {
  const modal = document.getElementById("match-detail-modal");
  if (modal) modal.style.display = "flex";
}

async function loadMatchDetail(fixtureIdOrMatch, match) {
  
  const modal = document.getElementById("match-detail-modal");
  const modalTitle = document.getElementById("modal-match-title");
  const modalBody = document.getElementById("modal-body");
  
  // Handle both cases: fixtureId as first param or match object
  let fixtureId;
  let matchObj;
  
  if (typeof fixtureIdOrMatch === 'string' || typeof fixtureIdOrMatch === 'number') {
    // First param is fixtureId
    fixtureId = String(fixtureIdOrMatch);
    matchObj = match;
  } else {
    // First param is match object (backward compatibility)
    matchObj = fixtureIdOrMatch;
    fixtureId = matchObj.matchId;
  }
  
  if (!matchObj) {
    matchObj = matches.find(m => m.matchId === fixtureId || m.id === fixtureId);
  }
  
  // Log fixture_id when clicking on match
  console.log('Match clicked - fixture_id:', fixtureId);
  
  // Set title with logos
  const home = matchObj?.home || 'Home';
  const away = matchObj?.away || 'Away';
  const homeLogo = matchObj?.homeLogo || null;
  const awayLogo = matchObj?.awayLogo || null;
  
  const homeLogoHtml = homeLogo ? `<img src="${homeLogo}" alt="${home}" class="team-logo" onerror="this.style.display='none';">` : '';
  const awayLogoHtml = awayLogo ? `<img src="${awayLogo}" alt="${away}" class="team-logo" onerror="this.style.display='none';">` : '';
  
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
      <div class="skeleton-group">
        <div class="skeleton-title"></div>
        <div class="skeleton-grid">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      </div>
    </div>
  `;
  openModal();
  
  try {
    // Use PHP API to get match details and odds
    if (!fixtureId) {
      modalBody.innerHTML = '<div class="loading">Match ID not found</div>';
      return;
    }
    
    const res = await fetch(`${PHP_API_BASE}/match-detail.php?fixture=${fixtureId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    
    const data = await res.json();
    
    if (!data.ok || !data.odds || data.odds.length === 0) {
      modalBody.innerHTML = '<div class="loading">Odds not found</div>';
      return;
    }
    
    // Render odds as they come from API - grouped by bookmaker and bet type
    let html = '<div class="detail-outcomes">';
    
    // Group by bookmaker
    data.odds.forEach(bookmaker => {
      if (!bookmaker.bets || !Array.isArray(bookmaker.bets) || bookmaker.bets.length === 0) return;
      
      const bookmakerName = bookmaker.name || 'Unknown Bookmaker';
      html += `<div class="detail-bookmaker-group">`;
      html += `<div class="detail-bookmaker-title">${bookmakerName}</div>`;
      
      // Group bets by bet name
      const betsByType = {};
      bookmaker.bets.forEach(bet => {
        if (!bet.values || !Array.isArray(bet.values) || bet.values.length === 0) return;
        
        const betName = bet.name || 'Unknown Bet';
        if (!betsByType[betName]) {
          betsByType[betName] = [];
        }
        betsByType[betName].push(bet);
      });
      
      // Render each bet type
      Object.keys(betsByType).forEach(betName => {
        html += `<div class="detail-bet-group">`;
        html += `<div class="detail-bet-title">${betName}</div>`;
        html += `<div class="detail-outcomes-grid">`;
        
        betsByType[betName].forEach(bet => {
          bet.values.forEach(value => {
            const label = value.value;
            const odd = parseFloat(value.odd);
            
            if (isNaN(odd) || odd <= 0) return;
            
            // Create unique identifier for this outcome
            const outcomeId = `${fixtureId}_${bookmaker.id}_${bet.id}_${label}_${odd}`;
            const matchId = matchObj?.id || fixtureId;
            
            // Check if this outcome is in slip
            const isActive = state.slip.some(s => {
              return s.outcomeId === outcomeId || 
                     (s.matchId === matchId && 
                      s.bookmakerId === String(bookmaker.id) && 
                      s.betId === String(bet.id) && 
                      s.value === label &&
                      Math.abs(s.odd - odd) < 0.01);
            });
            
            html += `
              <button class="detail-outcome-item detail-outcome-btn ${isActive ? "detail-outcome-btn-active" : ""}" 
                      data-match-id="${matchId}"
                      data-fixture-id="${fixtureId}"
                      data-bookmaker-id="${bookmaker.id}"
                      data-bookmaker-name="${bookmakerName}"
                      data-bet-id="${bet.id}"
                      data-bet-name="${betName}"
                      data-value="${label}"
                      data-odd="${odd}"
                      data-outcome-id="${outcomeId}">
                <div class="detail-outcome-label">${label}</div>
                <div class="detail-outcome-value">${formatOdd(odd)}</div>
              </button>
            `;
          });
        });
        
        html += `</div></div>`;
      });
      
      html += `</div>`;
    });
    
    html += '</div>';
    modalBody.innerHTML = html;
    
    // Add click handlers for bet buttons in modal
    modalBody.querySelectorAll('.detail-outcome-btn').forEach(btn => {
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
          home: matchObj.home || home,
          away: matchObj.away || away,
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
        
        // Close modal and open betslip after selecting coefficient
        closeModal();
        
        // Open betslip on mobile when adding bet (after a short delay to allow UI to update)
        if (isMobile()) {
          setTimeout(() => openBetslipMobile(), 150);
        } else {
          // On desktop, ensure betslip is visible (it should already be visible in sidebar)
          // Switch to sportsbook tab to show betslip
          if (state.activeTab !== 'sportsbook') {
            switchTab('sportsbook');
          }
        }
      });
    });
  } catch (err) {
    modalBody.innerHTML = `<div class="loading" style="color:rgba(248,113,113,0.9);">Loading error: ${err.message}</div>`;
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
    const goToBetsBtn = e.target.closest('.go-to-all-bets-btn');
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

