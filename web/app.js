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
let allMatchesForLeagues = []; // All matches for extracting leagues (without odds filtering)

// Cache for odds check results (to avoid checking same match multiple times)
const oddsCheckCache = new Map();

// Top leagues list for prioritization
const TOP_LEAGUES = [
  'premier league', 'premiership', 'англия премьер', 'английская премьер',
  'la liga', 'испания ла лига', 'испанская лига',
  'serie a', 'италия серия а', 'итальянская серия',
  'bundesliga', 'германия бундеслига', 'немецкая бундеслига',
  'ligue 1', 'франция лига 1', 'французская лига',
  'champions league', 'лига чемпионов', 'uefa champions',
  'europa league', 'лига европы', 'uefa europa'
];

// Check if a league is a top league
function isTopLeague(leagueName) {
  if (!leagueName) return false;
  const name = leagueName.toLowerCase();
  return TOP_LEAGUES.some(top => name.includes(top));
}

// Show skeleton loading for matches
function showMatchesSkeleton() {
  const root = document.getElementById("matches-list");
  if (!root) return;
  
  const skeletonRows = Array(10).fill(0).map(() => `
    <div class="match-card-digital match-card-skeleton">
      <div class="match-card-header">
        <div class="match-league-digital">
          <div class="skeleton-line skeleton-line-short" style="width: 120px; height: 16px; margin-bottom: 8px;"></div>
        </div>
        <div class="skeleton-odd" style="width: 36px; height: 36px; border-radius: 10px;"></div>
      </div>
      <div class="match-teams-digital">
        <div class="team-digital team-home">
          <div class="skeleton-odd" style="width: 40px; height: 40px; border-radius: 50%;"></div>
          <div class="skeleton-line skeleton-line-medium" style="width: 100px; height: 18px;"></div>
        </div>
        <div class="match-vs-digital">
          <div class="skeleton-line skeleton-line-short" style="width: 30px; height: 14px;"></div>
        </div>
        <div class="team-digital team-away">
          <div class="skeleton-line skeleton-line-medium" style="width: 100px; height: 18px;"></div>
          <div class="skeleton-odd" style="width: 40px; height: 40px; border-radius: 50%;"></div>
        </div>
      </div>
      <div class="match-odds-digital">
        <div class="odds-buttons-inline">
          ${Array(3).fill(0).map(() => '<div class="skeleton-odd" style="width: 70px; height: 40px; border-radius: 8px;"></div>').join('')}
        </div>
      </div>
    </div>
  `).join('');
  
  root.innerHTML = `
    <div class="matches-loading-container">
      <div class="loading-spinner-wrapper">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading matches...</div>
      </div>
      <div class="matches-container-digital">
        ${skeletonRows}
      </div>
    </div>
  `;
}

// Load matches from PHP API (API Sports)
async function loadMatches(forceRefresh = false) {
  // Preserve current matchType before loading
  const preservedMatchType = state.matchType || 'prematch';
  
  // Show skeleton while loading
  showMatchesSkeleton();
  
  const loadStartTime = Date.now();
  console.log(`[App] Loading matches at ${new Date().toISOString()}${forceRefresh ? ' (FORCE REFRESH - NO CACHE)' : ''}, preserving matchType: ${preservedMatchType}`);
  
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

    // Sort leagues: "all" first, then top leagues, then by match count
    leagues = Array.from(leagueMap.values()).sort((a, b) => {
      // "all" always first
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      
      const aName = (a.name || '').toLowerCase();
      const bName = (b.name || '').toLowerCase();
      
      // Check if league is in top leagues
      const aIsTop = isTopLeague(a.name);
      const bIsTop = isTopLeague(b.name);
      
      // Top leagues come first
      if (aIsTop && !bIsTop) return -1;
      if (!aIsTop && bIsTop) return 1;
      
      // If both are top or both are not, sort by match count
      return b.count - a.count;
    });
    
    const loadTime = Date.now() - loadStartTime;
    console.log(`[App] Loaded ${matches.length} matches in ${loadTime}ms`);
    if (matches.length > 0) {
      console.log(`[App] First 3 matches:`, matches.slice(0, 3).map(m => `${m.home} vs ${m.away} (${m.matchId || 'no-id'})`));
    }
    
    // Reset pagination to first page when new data is loaded (but preserve matchType)
    state.currentPage = 1;
    
    // Restore preserved matchType (in case it was somehow reset)
    if (preservedMatchType && state.matchType !== preservedMatchType) {
      console.log(`[App] Restoring matchType from ${state.matchType} to ${preservedMatchType}`);
      state.matchType = preservedMatchType;
    }
    
    // Clear odds check cache when new matches are loaded
    oddsCheckCache.clear();
    
    // Store timestamp of last update
    window.lastUpdateTime = new Date().toISOString();
    
    // Load all matches for leagues extraction (after main matches are loaded)
    loadAllMatchesForLeagues();
    
    // Force re-render - preserve current matchType
    renderLeagues();
    // Only re-render if we're on sportsbook tab, and preserve matchType
    if (state.activeTab === 'sportsbook') {
      // Preserve matchType - don't reset it
      renderMatches();
      // Update tabs to reflect current matchType
      updateMatchTypeTabs();
    }
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

// Load Premier League (id=39) from API
async function loadPremierLeague() {
  try {
    console.log('[App] Loading Premier League (id=39) from API...');
    const url = `${PHP_API_BASE}/leagues.php?id=39&country=england`;
    
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      console.warn('[App] Failed to load Premier League:', res.status);
      return null;
    }
    
    const data = await res.json();
    
    // Handle both formats: {ok: true, leagues: [...]} and {response: [...]}
    let leaguesArray = [];
    if (data && data.ok && data.leagues && Array.isArray(data.leagues)) {
      leaguesArray = data.leagues;
    } else if (data && data.response && Array.isArray(data.response)) {
      leaguesArray = data.response;
    }
    
    if (leaguesArray.length > 0) {
      // Find Premier League (id: 39)
      const leagueData = leaguesArray.find(l => l.league && l.league.id === 39) || leaguesArray[0];
      const league = leagueData.league;
      const country = leagueData.country;
      
      // Format name as "England. Premier League"
      const leagueName = country && country.name 
        ? `${country.name}. ${league.name}`
        : league.name;
      
      const premierLeague = {
        id: String(league.id), // Use API id as string
        country: country?.flag || "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
        name: leagueName,
        logo: league.logo || null,
        count: 0, // Will be updated when counting matches
        apiId: league.id,
        isPremierLeague: true
      };
      
      console.log('[App] Premier League loaded:', premierLeague);
      return premierLeague;
    }
    
    console.warn('[App] Premier League not found in response');
    return null;
  } catch (err) {
    console.warn('[App] Error loading Premier League:', err);
    return null;
  }
}

// Load all matches (without odds filtering) to extract all leagues
async function loadAllMatchesForLeagues() {
  try {
    console.log('[App] Loading all matches for leagues extraction...');
    
    // First, load Premier League (id=39) separately
    const premierLeague = await loadPremierLeague();
    
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    const url = `${PHP_API_BASE}/matches.php?date=${today}&_t=${timestamp}&_r=${random}`;
    
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      console.warn('[App] Failed to load all matches for leagues:', res.status);
      return;
    }
    
    const data = await res.json();
    
    if (!data.matches || !Array.isArray(data.matches)) {
      console.warn('[App] Invalid response format for all matches');
      return;
    }
    
    console.log(`[App] Received ${data.matches.length} all matches for leagues extraction`);
    
    // Store all matches for leagues extraction
    allMatchesForLeagues = data.matches;
    
    // Extract all leagues from all matches
    const leagueMap = new Map();
    leagueMap.set("all", { id: "all", country: "🌐", name: "All leagues", count: 0 });
    
    // Add Premier League first if loaded (use apiId as key to avoid conflicts)
    if (premierLeague) {
      // Use apiId as the key to ensure it's unique
      const premierLeagueKey = String(premierLeague.apiId);
      leagueMap.set(premierLeagueKey, premierLeague);
      console.log('[App] Added Premier League to leagueMap with key:', premierLeagueKey, premierLeague);
    }
    
    data.matches.forEach((m) => {
      const leagueId = m.league || m.leagueName || "all";
      const leagueName = m.leagueName || m.league || "Unknown League";
      
      // Check if this match belongs to Premier League (by id or name)
      const isPremierLeagueMatch = premierLeague && (
        leagueId === String(premierLeague.apiId) || 
        leagueId === premierLeague.id ||
        (leagueName && leagueName.toLowerCase().includes('premier league') && 
         !leagueName.toLowerCase().includes('championship') &&
         !leagueName.toLowerCase().includes('league one') &&
         !leagueName.toLowerCase().includes('league two'))
      );
      
      if (isPremierLeagueMatch && premierLeague) {
        // Add to Premier League count
        const premierLeagueKey = String(premierLeague.apiId);
        if (leagueMap.has(premierLeagueKey)) {
          leagueMap.get(premierLeagueKey).count++;
        }
        // Also increment "all" count
        if (leagueMap.has("all")) {
          leagueMap.get("all").count++;
        }
        return;
      }
      
      // Skip if this league ID already exists as Premier League
      if (premierLeague && (leagueId === String(premierLeague.apiId) || leagueId === premierLeague.id)) {
        return;
      }
      
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
    });
    
    console.log('[App] Premier League in leagueMap:', premierLeague ? leagueMap.get(String(premierLeague.apiId)) : 'not found');
    
    // Sort leagues: "all" first, then priority leagues, then top leagues, then by match count
    const priorityLeagues = [
      'England. Premier League',
      'Germany. Bundesliga',
      'Spain. La Liga',
      'Italy. Serie A'
    ];
    
    leagues = Array.from(leagueMap.values()).sort((a, b) => {
      // "all" always first
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      
      // Special case: Premier League (loaded separately with isPremierLeague flag) must be absolutely first
      const aIsPremierLeague = a.isPremierLeague || a.apiId === 39 || (a.id === '39' || a.id === 39);
      const bIsPremierLeague = b.isPremierLeague || b.apiId === 39 || (b.id === '39' || b.id === 39);
      
      if (aIsPremierLeague && !bIsPremierLeague) return -1;
      if (!aIsPremierLeague && bIsPremierLeague) return 1;
      
      // Check if league is in priority leagues - exact match first
      const aExactIndex = priorityLeagues.findIndex(pl => a.name === pl);
      const bExactIndex = priorityLeagues.findIndex(pl => b.name === pl);
      const aFlexibleIndex = priorityLeagues.findIndex(pl => a.name.includes(pl) || pl.includes(a.name));
      const bFlexibleIndex = priorityLeagues.findIndex(pl => b.name.includes(pl) || pl.includes(b.name));
      
      const aIsPriority = aExactIndex !== -1 || aFlexibleIndex !== -1;
      const bIsPriority = bExactIndex !== -1 || bFlexibleIndex !== -1;
      
      // Priority leagues come first (in order)
      if (aIsPriority && !bIsPriority) return -1;
      if (!aIsPriority && bIsPriority) return 1;
      
      if (aIsPriority && bIsPriority) {
        // Exact matches come before flexible matches
        if (aExactIndex !== -1 && bExactIndex !== -1) {
          return aExactIndex - bExactIndex;
        }
        if (aExactIndex !== -1) return -1; // a is exact, b is flexible
        if (bExactIndex !== -1) return 1;  // b is exact, a is flexible
        // Both are flexible, sort by index
        if (aFlexibleIndex !== -1 && bFlexibleIndex !== -1) {
          return aFlexibleIndex - bFlexibleIndex;
        }
      }
      
      // Check if league is in top leagues
      const aIsTop = isTopLeague(a.name);
      const bIsTop = isTopLeague(b.name);
      
      // Top leagues come after priority leagues
      if (aIsTop && !bIsTop) return -1;
      if (!aIsTop && bIsTop) return 1;
      
      // If both are top or both are not, sort by match count
      return b.count - a.count;
    });
    
    console.log(`[App] Extracted ${leagues.length} leagues from all matches`);
    
    // Update leagues filter if modal is open
    const modal = document.getElementById("search-filters-modal");
    if (modal && modal.style.display !== 'none') {
      renderLeaguesFilter();
    }
    
    // Update search filter button
    updateSearchFilterButton();
  } catch (err) {
    console.warn('[App] Error loading all matches for leagues:', err);
  }
}

const state = {
  activeTab: "sportsbook",
  activeLeagueId: "all",
  matchType: "prematch", // "prematch" or "live"
  slip: [],
  stake: 0,
  currentPage: 1,
  matchesPerPage: 10,
  searchQuery: "",
  selectedLeagueIds: [], // Array of selected league IDs for filtering
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
  // This function is no longer needed as we removed the sidebar
  // But keeping it for compatibility with other parts of the code
}

// Convert percentage to odds: odds = 100 / percentage
function percentToOdds(percentStr) {
  if (!percentStr || typeof percentStr !== 'string') return null;
  const percent = parseFloat(percentStr.replace('%', ''));
  if (isNaN(percent) || percent <= 0) return null;
  const odds = 100 / percent;
  return Math.round(odds * 100) / 100; // Round to 2 decimal places
}

// Check if match has odds available (using predictions API)
async function checkMatchHasOdds(match) {
  if (!match.matchId && !match.id) {
    return false;
  }
  
  const fixtureId = match.matchId || match.id;
  
  // Check cache first
  if (oddsCheckCache.has(fixtureId)) {
    return oddsCheckCache.get(fixtureId);
  }
  
  try {
    const url = `${PHP_API_BASE}/predictions.php?fixture=${fixtureId}`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      oddsCheckCache.set(fixtureId, false);
      return false;
    }
    
    const data = await res.json();
    // Check if predictions data exists and has percent data
    const hasOdds = data.ok && 
                    data.response && 
                    Array.isArray(data.response) && 
                    data.response.length > 0 &&
                    data.response[0].predictions &&
                    data.response[0].predictions.percent;
    oddsCheckCache.set(fixtureId, hasOdds);
    return hasOdds;
  } catch (error) {
    console.warn(`[Render] Error checking odds for match ${fixtureId}:`, error);
    oddsCheckCache.set(fixtureId, false);
    return false;
  }
}

// Get match odds (Home, Draw, Away) from Predictions API
async function getMatchOdds(match) {
  if (!match.matchId && !match.id) {
    return null;
  }
  
  const fixtureId = match.matchId || match.id;
  
  try {
    const url = `${PHP_API_BASE}/predictions.php?fixture=${fixtureId}`;
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
        'Pragma': 'no-cache'
      }
    });
    
    if (!res.ok) {
      return null;
    }
    
    const data = await res.json();
    if (!data.ok || !data.response || !Array.isArray(data.response) || data.response.length === 0) {
      return null;
    }
    
    const prediction = data.response[0];
    if (!prediction.predictions || !prediction.predictions.percent) {
      return null;
    }
    
    // Convert percentages to odds: odds = 100 / percentage
    const percent = prediction.predictions.percent;
    const homeOdd = percentToOdds(percent.home);
    const drawOdd = percentToOdds(percent.draw);
    const awayOdd = percentToOdds(percent.away);
    
    if (homeOdd && drawOdd && awayOdd) {
      return {
        hasOdds: true,
        home: homeOdd,
        draw: drawOdd,
        away: awayOdd,
        prediction: prediction.predictions // Store full prediction data for reference
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`[Render] Error getting odds for match ${fixtureId}:`, error);
    return null;
  }
}

// Filter matches to get only those with odds and load their odds data
async function filterMatchesWithOdds(matches, targetCount) {
  const matchesWithOdds = [];
  // Check all provided matches to find enough with odds
  const maxChecks = matches.length;
  
  console.log(`[Render] Filtering matches: checking up to ${maxChecks} matches to find ${targetCount} with odds`);
  
  // Check matches in batches for better performance
  const batchSize = 5;
  let checkedCount = 0;
  
  for (let i = 0; i < matches.length && matchesWithOdds.length < targetCount; i += batchSize) {
    const batch = matches.slice(i, i + batchSize);
    const batchPromises = batch.map(async (match) => {
      checkedCount++;
      
      // First, try to get odds from predictions API
      const oddsData = await getMatchOdds(match);
      if (oddsData && oddsData.hasOdds) {
        // Add odds data to match object
        match.loadedOdds = {
          home: oddsData.home,
          draw: oddsData.draw,
          away: oddsData.away
        };
        return match;
      }
      
      // If predictions API doesn't have odds, check if match has original odds
      // Use original odds if available (from parsing)
      if (match.odds && (match.odds.homeWin > 0 || match.odds.draw > 0 || match.odds.awayWin > 0)) {
        match.loadedOdds = {
          home: match.odds.homeWin || 0,
          draw: match.odds.draw || 0,
          away: match.odds.awayWin || 0
        };
        return match;
      }
      
      // Also check allOutcomes for 1x2 odds
      if (match.allOutcomes && Array.isArray(match.allOutcomes)) {
        const homeWin = match.allOutcomes.find((o) => o.label === "1" && o.type === "1x2")?.odd || 0;
        const draw = match.allOutcomes.find((o) => o.label === "X" && o.type === "1x2")?.odd || 0;
        const awayWin = match.allOutcomes.find((o) => o.label === "2" && o.type === "1x2")?.odd || 0;
        
        if (homeWin > 0 || draw > 0 || awayWin > 0) {
          match.loadedOdds = {
            home: homeWin,
            draw: draw,
            away: awayWin
          };
          return match;
        }
      }
      
      return null;
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      if (result && matchesWithOdds.length < targetCount) {
        matchesWithOdds.push(result);
      }
    }
    
    // If we found enough matches, stop checking
    if (matchesWithOdds.length >= targetCount) {
      break;
    }
  }
  
  console.log(`[Render] Filtered ${matchesWithOdds.length} matches with odds (checked ${checkedCount} matches)`);
  return matchesWithOdds;
}

async function renderMatches() {
  const root = document.getElementById("matches-list");
  
  // Don't render if not on sportsbook tab
  if (state.activeTab !== 'sportsbook') {
    return;
  }
  
  console.log(`[Render] Total matches: ${matches.length}, matchType: ${state.matchType}`);
  const liveCount = matches.filter(m => m.isLive).length;
  const nonLiveCount = matches.filter(m => !m.isLive).length;
  console.log(`[Render] LIVE: ${liveCount}, Non-LIVE: ${nonLiveCount}`);
  
  // Apply match type filter FIRST (prematch or live) - preserve matchType
  let ms = matches;
  if (state.matchType === "live") {
    ms = matches.filter((m) => m.isLive === true);
    console.log(`[Render] Filtered by match type (live): ${ms.length} matches`);
    
    // If no live matches found but we're in live mode, show empty state instead of switching
    if (ms.length === 0) {
      root.innerHTML = `
        <div class="matches-empty">
          <div class="matches-empty-icon">⚽</div>
          <div class="matches-empty-title">No matches</div>
          <div class="matches-empty-text">There are no live matches available at the moment</div>
        </div>
      `;
      return;
    }
  } else {
    ms = matches.filter((m) => m.isLive !== true);
    console.log(`[Render] Filtered by match type (prematch): ${ms.length} matches`);
  }

  // Apply league filter
  if (state.selectedLeagueIds.length > 0) {
    console.log('[Render] Filtering by selected league IDs:', state.selectedLeagueIds);
    console.log('[Render] Sample match leagueIds before filter:', ms.slice(0, 5).map(m => ({ id: m.id, leagueId: m.leagueId, leagueName: m.leagueName })));
    
    ms = ms.filter((m) => {
      // Direct match by leagueId
      if (state.selectedLeagueIds.includes(m.leagueId)) {
        return true;
      }
      
      // Also check by league info (for Premier League with apiId=39)
      const matchLeagueInfo = leagues.find(l => l.id === m.leagueId || String(l.apiId) === String(m.leagueId));
      
      if (matchLeagueInfo || m.leagueId === '39' || String(m.leagueId) === '39') {
        for (const selectedId of state.selectedLeagueIds) {
          const selectedLeagueInfo = leagues.find(l => l.id === selectedId);
          
          if (selectedLeagueInfo) {
            // Match by apiId (for Premier League)
            const matchApiId = matchLeagueInfo?.apiId || (m.leagueId === '39' || String(m.leagueId) === '39' ? 39 : null);
            if (matchApiId && selectedLeagueInfo.apiId && matchApiId === selectedLeagueInfo.apiId) {
              return true;
            }
            // Match by isPremierLeague flag
            if (matchLeagueInfo?.isPremierLeague && selectedLeagueInfo.isPremierLeague) {
              return true;
            }
            // Match by league name (for Premier League)
            if (m.leagueName && m.leagueName.toLowerCase().includes('premier league') && 
                m.leagueName.toLowerCase().includes('england') &&
                selectedLeagueInfo.name && selectedLeagueInfo.name.toLowerCase().includes('premier league') &&
                selectedLeagueInfo.name.toLowerCase().includes('england')) {
              return true;
            }
          } else if (selectedId === '39' || String(selectedId) === '39') {
            // If selected ID is '39' and match leagueId is also '39' or match is Premier League
            if (m.leagueId === '39' || String(m.leagueId) === '39' ||
                (m.leagueName && m.leagueName.toLowerCase().includes('premier league') && 
                 m.leagueName.toLowerCase().includes('england'))) {
              return true;
            }
          }
        }
      }
      
      return false;
    });
    
    console.log(`[Render] Filtered by selected leagues (${state.selectedLeagueIds.length}): ${ms.length} matches`);
    console.log('[Render] Sample match leagueIds after filter:', ms.slice(0, 5).map(m => ({ id: m.id, leagueId: m.leagueId, leagueName: m.leagueName })));
  } else if (state.activeLeagueId !== "all") {
    ms = ms.filter((m) => m.leagueId === state.activeLeagueId);
    console.log(`[Render] Filtered by active league (${state.activeLeagueId}): ${ms.length} matches`);
  }

  console.log(`[Render] After league filter: ${ms.length} matches`);

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
  
  // Now check odds ONLY for filtered matches (after league and search filters)

  // Sort: LIVE matches first, then top league matches, then regular matches
  const beforeSort = ms.length;
  ms.sort((a, b) => {
    // First: LIVE matches come before non-LIVE
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    
    // Second: Within same LIVE status, top league matches come first
    const aIsTop = isTopLeague(a.leagueName);
    const bIsTop = isTopLeague(b.leagueName);
    
    if (aIsTop && !bIsTop) return -1;
    if (!aIsTop && bIsTop) return 1;
    
    return 0;
  });
  console.log(`[Render] After sort: ${ms.length} matches`);
  console.log(`[Render] First 5 matches:`, ms.slice(0, 5).map(m => `${m.home} vs ${m.away} (LIVE: ${m.isLive})`));

  // Update content subtitle with selected league and search query
  const subtitleEl = document.querySelector(".content-subtitle");
  if (subtitleEl) {
    let subtitleParts = ["Football"];
    
    // Add league info
    if (state.selectedLeagueIds.length > 0) {
      const selectedLeagues = state.selectedLeagueIds
        .map(id => leagues.find(l => l.id === id))
        .filter(l => l)
        .map(l => l.name);
      
      if (selectedLeagues.length > 0) {
        if (selectedLeagues.length === 1) {
          subtitleParts.push(selectedLeagues[0]);
        } else {
          subtitleParts.push(`${selectedLeagues.length} leagues`);
        }
      }
    } else if (state.activeLeagueId !== "all") {
      const activeLeague = leagues.find((l) => l.id === state.activeLeagueId);
      if (activeLeague) {
        subtitleParts.push(activeLeague.name);
      }
    } else {
      subtitleParts.push("All leagues");
    }
    
    // Add search query if exists
    if (state.searchQuery.trim()) {
      subtitleParts.push(`"${state.searchQuery.trim()}"`);
    }
    
    subtitleParts.push("Live • Today");
    
    subtitleEl.textContent = subtitleParts.join(" • ");
  }

  // Show loading indicator while filtering matches with odds
  if (ms.length > 0) {
    root.innerHTML = `
      <div class="matches-loading-container">
        <div class="loading-spinner-wrapper">
          <div class="loading-spinner"></div>
          <div class="loading-text">Checking odds for filtered matches...</div>
        </div>
      </div>
    `;
  }
  
  // Check odds ONLY for matches that passed league and search filters
  // This is the key change: we filter by league/search first, then check odds
  let filteredMatches = [];
  
  if (ms.length === 0) {
    // No matches after filtering
    filteredMatches = [];
    console.log(`[Render] No matches after league/search filtering`);
  } else {
    // Check odds for all filtered matches (or a reasonable subset for pagination)
    if (state.currentPage === 1) {
      // For first page, check matches from the beginning until we find enough with odds
      let startCheckIdx = 0;
      let endCheckIdx = Math.min(ms.length, state.matchesPerPage * 5);
      let matchesToCheck = ms.slice(startCheckIdx, endCheckIdx);
      
      filteredMatches = await filterMatchesWithOdds(matchesToCheck, state.matchesPerPage);
      
      // If we didn't find enough, check more matches
      while (filteredMatches.length < state.matchesPerPage && endCheckIdx < ms.length) {
        startCheckIdx = endCheckIdx;
        endCheckIdx = Math.min(ms.length, endCheckIdx + state.matchesPerPage * 2);
        const additionalMatches = ms.slice(startCheckIdx, endCheckIdx);
        const additionalFiltered = await filterMatchesWithOdds(additionalMatches, state.matchesPerPage - filteredMatches.length);
        filteredMatches = filteredMatches.concat(additionalFiltered);
      }
      
      console.log(`[Render] Page ${state.currentPage}: found ${filteredMatches.length} matches with odds from ${ms.length} filtered matches (checked up to index ${endCheckIdx})`);
    } else {
      // For other pages, check matches in the page range
      const startCheckIdx = (state.currentPage - 1) * state.matchesPerPage;
      const endCheckIdx = Math.min(ms.length, startCheckIdx + (state.matchesPerPage * 3));
      const matchesToCheck = ms.slice(startCheckIdx, endCheckIdx);
      
      filteredMatches = await filterMatchesWithOdds(matchesToCheck, state.matchesPerPage);
      console.log(`[Render] Page ${state.currentPage}: found ${filteredMatches.length} matches with odds from ${matchesToCheck.length} checked (out of ${ms.length} filtered matches)`);
    }
  }

  // Pagination - use filtered matches for current page
  const totalPages = Math.ceil(ms.length / state.matchesPerPage); // Total pages based on all matches
  const paginatedMatches = filteredMatches.slice(0, state.matchesPerPage); // Take first 10 from filtered
  
  console.log(`[Render] Pagination: page ${state.currentPage}/${totalPages}, showing ${paginatedMatches.length} matches (of ${filteredMatches.length} filtered, from ${ms.length} total)`);
  console.log(`[Render] Paginated matches:`, paginatedMatches.map(m => `${m.home} vs ${m.away} (LIVE: ${m.isLive})`));

  // Show "No matches" message if no matches found
  if (paginatedMatches.length === 0) {
    root.innerHTML = `
      <div class="matches-empty">
        <div class="matches-empty-icon">⚽</div>
        <div class="matches-empty-title">No matches</div>
        <div class="matches-empty-text">There are no matches available in this section</div>
      </div>
    `;
    return;
  }

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
  // Use loaded odds from API if available (from filterMatchesWithOdds)
  // Otherwise fall back to outcomes from match data
  let homeOdd = null;
  let drawOdd = null;
  let awayOdd = null;
  
  if (match.loadedOdds) {
    // Use odds loaded from API
    homeOdd = match.loadedOdds.home;
    drawOdd = match.loadedOdds.draw;
    awayOdd = match.loadedOdds.away;
  } else {
    // Fallback to outcomes from match data
    const outcomes = match.allOutcomes || match.outcomes || [];
    const outcomes1X2 = outcomes.filter((o) => o.type === "1x2");
    
    outcomes1X2.forEach((o) => {
      const label = String(o.label || '').trim();
      const odd = parseFloat(o.odd) || 0;
      
      if (odd > 0) {
        if (label === "1" || label === "Home") {
          if (!homeOdd || odd > homeOdd) homeOdd = odd;
        } else if (label === "X" || label === "Draw") {
          if (!drawOdd || odd > drawOdd) drawOdd = odd;
        } else if (label === "2" || label === "Away") {
          if (!awayOdd || odd > awayOdd) awayOdd = odd;
        }
      }
    });
  }
  
  // Create outcome objects for rendering
  const outcome1X2 = homeOdd ? { label: "1", odd: homeOdd } : null;
  const outcomeX = drawOdd ? { label: "X", odd: drawOdd } : null;
  const outcome2 = awayOdd ? { label: "2", odd: awayOdd } : null;
  
  // Keep outcomes for totals and foras (if needed)
  const outcomes = match.allOutcomes || match.outcomes || [];
  
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
  const matchIdForFavorite = match.id || match.matchId || '';
  const isMatchFavorite = isFavorite('match', matchIdForFavorite);
  
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
    : '';
  
  const matchTimeDisplay = !isLive || !match.liveTime
    ? `<div class="match-time-digital">${match.time || "TBD"}</div>`
    : '';

  // Render only three main odds: Home, Draw, Away (1, X, 2)
  // Use loaded odds with proper labels
  const oddsButtons = [];
  
  // Add 1X2 odds with proper labels - always show all three (1, X, 2) even if some are missing
  const oddsRow = `
    <div class="match-odds-digital">
      <div class="odds-buttons-inline odds-buttons-full-width">
        ${renderOutcomeButton(match, "1", homeOdd, "Home")}
        ${renderOutcomeButton(match, "X", drawOdd, "Draw")}
        ${renderOutcomeButton(match, "2", awayOdd, "Away")}
      </div>
    </div>
  `;
  
  return `
    <div class="match-card-digital ${isLive ? 'match-card-live' : ''}" data-match-id="${match.id}">
      <div class="match-card-header">
        <div class="match-league-digital">
          ${isLive ? '<span class="live-badge-digital"><span class="live-pulse"></span>LIVE</span>' : ''}
          <span class="league-name-digital">${match.leagueName}</span>
          <button class="favorite-btn-inline ${isMatchFavorite ? 'favorite-btn-active' : ''}" 
                  data-favorite-type="match" 
                  data-favorite-id="${matchIdForFavorite}"
                  type="button"
                  aria-label="Add to favorites">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="${isMatchFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="match-teams-digital">
        <div class="team-digital team-home">
          ${homeLogoHtml}
          <div class="team-name-digital">${match.home}</div>
        </div>
        <div class="match-vs-digital">
          ${isLive && match.liveTime ? liveTimeDisplay : ''}
          ${scoreDisplay || '<span class="vs-text">VS</span>'}
        </div>
        <div class="team-digital team-away">
          ${awayLogoHtml}
          <div class="team-name-digital">${match.away}</div>
        </div>
      </div>
      
      ${matchTimeDisplay ? `<div class="match-time-digital-wrapper">${matchTimeDisplay}</div>` : ''}
      
      ${oddsRow}
      
      <div class="match-actions-digital">
        <button class="go-to-all-bets-btn-digital" data-match-id="${match.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          All bets
        </button>
      </div>
    </div>
  `;
}

function renderOutcomeButton(match, outcomeKey, odd, displayLabel = null, value = null) {
  // Add label text for 1X2 outcomes
  let labelText = '';
  if (outcomeKey === '1') {
    labelText = '<div class="outcome-label-text">1</div>';
  } else if (outcomeKey === 'X') {
    labelText = '<div class="outcome-label-text">Draw</div>';
  } else if (outcomeKey === '2') {
    labelText = '<div class="outcome-label-text">2</div>';
  }
  
  if (!odd || odd === 0) {
    return `<div class="outcome-wrapper">
      <div class="outcome-label-mobile"></div>
      <div class="outcome-cell outcome-cell-empty">
        ${labelText}
        <div class="outcome-value">—</div>
      </div>
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
        ${labelText}
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
  
  // Make sure betslip is visible even if parent main is hidden
  // Force betslip to be visible and positioned correctly
  // Move betslip to body if it's inside a hidden parent
  const parentMain = betslip.closest('main.layout, main.page');
  if (parentMain && parentMain.classList.contains('page-hidden')) {
    // Move betslip to body temporarily so it's not affected by parent's display:none
    document.body.appendChild(betslip);
  }
  
  betslip.style.position = 'fixed';
  betslip.style.zIndex = '9999'; // High z-index, but below bottom-nav (10000)
  betslip.style.display = 'flex';
  betslip.style.flexDirection = 'column';
  betslip.style.visibility = 'visible';
  betslip.style.opacity = '1';
  betslip.style.bottom = '0';
  betslip.style.left = '0';
  betslip.style.right = '0';
  betslip.style.top = 'auto';
  
  betslip.classList.add('betslip-open');
  if (overlay) {
    overlay.style.display = 'block';
    overlay.style.position = 'fixed';
    overlay.style.zIndex = '9998'; // Just below betslip
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    setTimeout(() => overlay.classList.add('active'), 10);
  }
  document.body.style.overflow = 'hidden';
  if (closeBtn) closeBtn.style.display = 'block';
  
  // Убеждаемся, что betslip может получать клики и имеет яркий фон
  betslip.style.pointerEvents = 'all';
  betslip.style.background = '#16181f';
  
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
      
      // Move betslip back to original position if it was moved to body
      const originalParent = document.querySelector('main.layout[data-page="sportsbook"]');
      if (originalParent && betslip.parentElement === document.body) {
        originalParent.appendChild(betslip);
      }
      
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

// Open betslip on desktop
function openBetslipDesktop() {
  if (isMobile()) return;
  const betslip = document.querySelector('.betslip');
  const closeBtn = document.getElementById('betslip-close-btn-desktop');
  if (!betslip) return;
  
  // Show betslip
  betslip.classList.add('betslip-open-desktop');
  if (closeBtn) closeBtn.style.display = 'flex';
  
  updateBetslipFloatButton();
}

// Close betslip on desktop
function closeBetslipDesktop() {
  if (isMobile()) return;
  const betslip = document.querySelector('.betslip');
  const closeBtn = document.getElementById('betslip-close-btn-desktop');
  if (!betslip) return;
  
  // Hide betslip
  betslip.classList.remove('betslip-open-desktop');
  if (closeBtn) closeBtn.style.display = 'none';
  
  updateBetslipFloatButton();
}

// Toggle betslip on desktop
function toggleBetslipDesktop() {
  if (isMobile()) return;
  const betslip = document.querySelector('.betslip');
  if (!betslip) return;
  
  if (betslip.classList.contains('betslip-open-desktop')) {
    closeBetslipDesktop();
  } else {
    openBetslipDesktop();
  }
}

// Update betslip float button visibility and count
function updateBetslipFloatButton() {
  const floatBtn = document.getElementById('betslip-float-btn');
  const floatCount = document.getElementById('betslip-float-count');
  if (!floatBtn || !floatCount) return;
  
  const count = state.slip.length;
  floatCount.textContent = count > 0 ? count : '';
  
  // Show button if there are bets or betslip is open on desktop
  if (isMobile()) {
    // On mobile, show button if there are bets
    if (count > 0) {
      floatBtn.classList.remove('hidden');
    } else {
      floatBtn.classList.add('hidden');
    }
  } else {
    // On desktop, always show button
    floatBtn.classList.remove('hidden');
  }
}

function renderSlip() {
  const root = document.getElementById("slip-items");
  const slip = state.slip;
  const slipCount = document.getElementById("slip-count");
  const floatCount = document.getElementById("betslip-float-count");
  const bottomNavBetslipCount = document.getElementById("bottom-nav-betslip-count");
  
  slipCount.textContent = slip.length.toString();
  updateBetslipFloatButton();
  
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
  state.stake = amount ? Math.round(amount * 100) / 100 : 0; // Round to 2 decimal places
  const input = document.getElementById("stake-input");
  input.value = state.stake > 0 ? state.stake.toFixed(2) : "";
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
  // Don't re-render matches, only update slip
  renderSlip();
  
    // Open betslip on mobile when clicking on odds (after a short delay to allow UI to update)
  if (isMobile()) {
    setTimeout(() => openBetslipMobile(), 150);
  } else {
    // On desktop, open betslip when clicking on odds
    openBetslipDesktop();
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
  // Don't re-render matches, only update slip
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
  
  // Update match type tabs visibility when switching to sportsbook
  if (tabName === "sportsbook") {
    updateMatchTypeTabs();
  }
  
  // Don't close betslip on mobile when switching tabs - betslip should work from any page
  // Only close if explicitly needed (not when toggling betslip)
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
        // Open search filters modal
        openSearchFiltersModal();
        // Also switch to sportsbook tab if not already there
        if (state.activeTab !== "sportsbook") {
          switchTab("sportsbook");
        }
      } else if (navName === "betslip") {
        // Toggle betslip on mobile - works from any page
        if (isMobile()) {
          // Prevent default tab switching behavior
          e.preventDefault();
          e.stopPropagation();
          
          // Don't switch tabs, just toggle betslip (works from any page)
          toggleBetslipMobile();
          
          // Update active state after a short delay to ensure betslip state is updated
          setTimeout(() => {
            updateBottomNavActive();
          }, 150);
        } else {
          // On desktop, just switch to sportsbook (betslip is always visible)
          switchTab("sportsbook");
        }
      } else if (navName === "sportsbook") {
        // When clicking home, close all modals and stay on current category
        if (isMobile()) {
          // Close all modals
          closeSearchFiltersModal();
          closeLeaguesSearchModal();
          const matchDetailModal = document.getElementById("match-detail-modal");
          if (matchDetailModal) matchDetailModal.style.display = 'none';
          const depositModal = document.getElementById("deposit-modal");
          if (depositModal) depositModal.style.display = 'none';
          const withdrawalModal = document.getElementById("withdrawal-modal");
          if (withdrawalModal) withdrawalModal.style.display = 'none';
          const historyModal = document.getElementById("history-modal");
          if (historyModal) historyModal.style.display = 'none';
          const creditRequestModal = document.getElementById("credit-request-modal");
          if (creditRequestModal) creditRequestModal.style.display = 'none';
          document.body.style.overflow = '';
        }
        // Switch to sportsbook (stays on current category/match type)
        switchTab("sportsbook");
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
    
    // Special handling for LIVE button (sportsbook) - active when on sportsbook
    if (navName === "sportsbook") {
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

// Favorites functionality - simplified: just update localStorage and button state
function toggleFavorite(type, id) {
  if (!id) {
    return;
  }
  
  // Convert id to string for consistency
  const idStr = String(id);
  
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
  
  const index = state.favorites[key].indexOf(idStr);
  const wasFavorite = index > -1;
  
  if (wasFavorite) {
    state.favorites[key].splice(index, 1);
  } else {
    state.favorites[key].push(idStr);
  }
  
  // Save to localStorage immediately
  const storageKey = type === 'match' ? 'favoriteMatches' : 'favoriteLeagues';
  localStorage.setItem(storageKey, JSON.stringify(state.favorites[key]));
  
  // Update button state directly in DOM (fast, no re-render needed)
  if (type === 'match') {
    const buttons = document.querySelectorAll(`[data-favorite-type="match"][data-favorite-id="${idStr}"]`);
    buttons.forEach(button => {
      if (button) {
        if (wasFavorite) {
          button.classList.remove('favorite-btn-active');
          const svg = button.querySelector('svg');
          if (svg) svg.setAttribute('fill', 'none');
        } else {
          button.classList.add('favorite-btn-active');
          const svg = button.querySelector('svg');
          if (svg) svg.setAttribute('fill', 'currentColor');
        }
      }
    });
    
    // Update favorites page if it's open
    if (state.activeTab === 'favorites' && state.favoriteTab === 'matches') {
      renderFavoritesMatches();
    }
  } else if (type === 'league') {
    const button = document.querySelector(`[data-favorite-type="league"][data-favorite-id="${idStr}"]`);
    if (button) {
      if (wasFavorite) {
        button.classList.remove('favorite-btn-active');
        const svg = button.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'none');
      } else {
        button.classList.add('favorite-btn-active');
        const svg = button.querySelector('svg');
        if (svg) svg.setAttribute('fill', 'currentColor');
      }
    }
    
    // Update favorites page if it's open
    if (state.activeTab === 'favorites' && state.favoriteTab === 'leagues') {
      renderFavoritesLeagues();
    }
  }
}

function isFavorite(type, id) {
  if (!state.favorites || !id) {
    return false;
  }
  
  // Convert id to string for consistency
  const idStr = String(id);
  
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
  
  // Check if id is in favorites (convert all to strings for comparison)
  return favoritesArray.map(f => String(f)).includes(idStr);
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
        <button class="go-to-all-bets-btn" onclick="state.activeLeagueId = '${l.id}'; state.selectedLeagueIds = []; state.searchQuery = ''; updateSearchFilterButton(); switchTab('sportsbook'); renderLeagues(); renderMatches();">View</button>
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
                    onclick="state.activeLeagueId = '${l.id}'; state.selectedLeagueIds = []; state.searchQuery = ''; updateSearchFilterButton(); switchTab('sportsbook'); closeLeaguesSearchModal(); renderLeagues(); renderMatches();">
              <div class="leagues-modal-item-main">
                ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo" onerror="this.style.display='none';">` : ''}
                <span class="leagues-modal-item-name">${l.name}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
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

// Update match type tabs active state
function updateMatchTypeTabs() {
  const prematchTab = document.getElementById('prematch-tab');
  const liveTab = document.getElementById('live-tab');
  
  if (prematchTab) {
    if (state.matchType === 'prematch') {
      prematchTab.classList.add('match-type-tab-active');
    } else {
      prematchTab.classList.remove('match-type-tab-active');
    }
  }
  
  if (liveTab) {
    if (state.matchType === 'live') {
      liveTab.classList.add('match-type-tab-active');
    } else {
      liveTab.classList.remove('match-type-tab-active');
    }
  }
  
  // Update fixed live button visibility - always visible
  const fixedLiveBtn = document.getElementById('fixed-live-btn');
  if (fixedLiveBtn) {
    fixedLiveBtn.style.display = 'flex';
  }
}

// Update search filter button text to show active filters
function updateSearchFilterButton() {
  const btn = document.getElementById("search-filter-btn");
  if (!btn) return;
  
  const span = btn.querySelector("span");
  if (!span) return;
  
  const hasFilters = state.selectedLeagueIds.length > 0 || state.searchQuery.trim().length > 0;
  
  if (hasFilters) {
    let filterText = [];
    if (state.selectedLeagueIds.length > 0) {
      filterText.push(`${state.selectedLeagueIds.length} league${state.selectedLeagueIds.length > 1 ? 's' : ''}`);
    }
    if (state.searchQuery.trim()) {
      filterText.push(`"${state.searchQuery.trim()}"`);
    }
    span.textContent = `Search & Filters (${filterText.join(', ')})`;
  } else {
    span.textContent = "Search & Filters";
  }
}

// Search & Filters Modal functions
function openSearchFiltersModal() {
  const modal = document.getElementById("search-filters-modal");
  if (!modal) return;
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  
  // Render leagues filter
  renderLeaguesFilter();
  
  // Set current search query if exists
  const searchInput = document.getElementById("search-matches-input");
  if (searchInput && state.searchQuery) {
    searchInput.value = state.searchQuery;
    const clearBtn = document.getElementById("search-matches-clear");
    if (clearBtn) clearBtn.style.display = "flex";
  }
  
  // Focus search input
  setTimeout(() => {
    if (searchInput) searchInput.focus();
  }, 100);
}

function closeSearchFiltersModal() {
  const modal = document.getElementById("search-filters-modal");
  if (!modal) return;
  
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function renderLeaguesFilter() {
  const root = document.getElementById("leagues-filter-list");
  if (!root) return;
  
  const searchInput = document.getElementById("leagues-filter-search");
  const searchQuery = (searchInput?.value || "").trim().toLowerCase();
  
  // Priority leagues that should always be first
  // Find exact "England. Premier League" first, then others
  const priorityLeagues = [
    { exact: 'England. Premier League', search: ['england', 'premier league'] },
    { exact: 'Germany. Bundesliga', search: ['germany', 'bundesliga'] },
    { exact: 'Spain. La Liga', search: ['spain', 'la liga'] },
    { exact: 'Italy. Serie A', search: ['italy', 'serie a'] }
  ];
  
  // Helper function to normalize league name for comparison
  function normalizeLeagueName(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }
  
  // Helper function to check if league matches priority
  function isPriorityLeague(leagueName, priority) {
    const normalized = normalizeLeagueName(leagueName);
    const normalizedExact = normalizeLeagueName(priority.exact);
    
    // First check exact match (normalized)
    if (normalized === normalizedExact) {
      return true;
    }
    // Then check if it contains exact name
    if (normalized.includes(normalizedExact) || normalizedExact.includes(normalized)) {
      return true;
    }
    // Then check flexible matching
    return priority.search.every(term => normalized.includes(term.toLowerCase()));
  }
  
  // Helper function to get priority index with exact match priority
  function getPriorityIndex(leagueName) {
    const normalized = normalizeLeagueName(leagueName);
    
    // First check for exact matches (normalized)
    const exactIndex = priorityLeagues.findIndex(pl => {
      const normalizedExact = normalizeLeagueName(pl.exact);
      return normalized === normalizedExact || 
             normalized.includes(normalizedExact) || 
             normalizedExact.includes(normalized);
    });
    if (exactIndex !== -1) {
      return exactIndex;
    }
    // Then check flexible matches
    return priorityLeagues.findIndex(pl => {
      const normalizedExact = normalizeLeagueName(pl.exact);
      if (normalized === normalizedExact) return true;
      return pl.search.every(term => normalized.includes(term.toLowerCase()));
    });
  }
  
  // Get all leagues except 'all'
  let filtered = leagues.filter(l => l.id !== 'all');
  
  // Filter by search query
  if (searchQuery) {
    filtered = filtered.filter(l => l.name.toLowerCase().includes(searchQuery));
  }
  
  // Find the exact "Premier League" from England (id=39 or name contains "Premier League" and country is England)
  // This is the league with API id=39: "Premier League" from "England"
  const englandPremierLeague = filtered.find(l => {
    const normalized = normalizeLeagueName(l.name);
    // Check for exact "Premier League" (without country prefix)
    if (normalized === 'premier league') {
      return true;
    }
    // Check for "England. Premier League" format
    const target = normalizeLeagueName('England. Premier League');
    if (normalized === target || normalized.includes(target) || target.includes(normalized)) {
      return true;
    }
    // Check if it's "Premier League" and might be from England (check if id is 39 or contains premier league)
    if (normalized.includes('premier league') && (l.id === '39' || l.id === 39 || String(l.id).includes('39'))) {
      return true;
    }
    // Also check if name is exactly "Premier League" (most common case)
    return normalized === 'premier league';
  });
  
  // Sort leagues: priority leagues first, then top leagues, then by match count
  filtered.sort((a, b) => {
    // Special case: Premier League (loaded separately with isPremierLeague flag) must be absolutely first
    const aIsPremierLeague = a.isPremierLeague || a.apiId === 39 || (a.id === '39' || a.id === 39) ||
                            (englandPremierLeague && a.id === englandPremierLeague.id);
    const bIsPremierLeague = b.isPremierLeague || b.apiId === 39 || (b.id === '39' || b.id === 39) ||
                            (englandPremierLeague && b.id === englandPremierLeague.id);
    
    if (aIsPremierLeague && !bIsPremierLeague) return -1;
    if (!aIsPremierLeague && bIsPremierLeague) return 1;
    
    // Check if league is in priority leagues (with exact match priority)
    const aPriorityIndex = getPriorityIndex(a.name);
    const bPriorityIndex = getPriorityIndex(b.name);
    const aIsPriority = aPriorityIndex !== -1;
    const bIsPriority = bPriorityIndex !== -1;
    
    // Priority leagues come first (in order)
    if (aIsPriority && !bIsPriority) return -1;
    if (!aIsPriority && bIsPriority) return 1;
    
    if (aIsPriority && bIsPriority) {
      // Sort priority leagues by their order in priorityLeagues array
      // Exact matches come before flexible matches
      return aPriorityIndex - bPriorityIndex;
    }
    
    // Check if league is in top leagues
    const aIsTop = isTopLeague(a.name);
    const bIsTop = isTopLeague(b.name);
    
    // Top leagues come after priority leagues
    if (aIsTop && !bIsTop) return -1;
    if (!aIsTop && bIsTop) return 1;
    
    // If both are top or both are not, sort by match count
    return (b.count || 0) - (a.count || 0);
  });
  
  if (filtered.length === 0) {
    root.innerHTML = '<div class="bets-empty"><div class="bets-empty-text">No leagues found</div></div>';
    return;
  }
  
  root.innerHTML = filtered.map(l => {
    const isSelected = state.selectedLeagueIds.includes(l.id);
    const isFavorite = state.favorites.leagues.includes(l.id);
    return `
      <label class="league-filter-item ${isSelected ? 'league-filter-item-selected' : ''}">
        <input type="checkbox" value="${l.id}" ${isSelected ? 'checked' : ''} class="league-filter-checkbox">
        <div class="league-filter-item-content">
          ${l.logo ? `<img src="${l.logo}" alt="${l.name}" class="league-logo-small" onerror="this.style.display='none';">` : ''}
          <span class="league-filter-item-name">${l.name}</span>
        </div>
        <button class="favorite-btn-small ${isFavorite ? 'favorite-btn-active' : ''}" 
                data-favorite-type="league" 
                data-favorite-id="${l.id}"
                onclick="event.stopPropagation(); toggleFavorite('league', '${l.id}'); renderLeaguesFilter();"
                type="button"
                aria-label="Add to favorites">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
      </label>
    `;
  }).join('');
}

// Load matches for a specific league via fixtures API
async function loadMatchesByLeague(leagueId) {
  try {
    console.log('[App] ===== Loading matches for league =====');
    console.log('[App] League ID:', leagueId);
    console.log('[App] Available leagues:', leagues.map(l => ({ id: l.id, name: l.name, apiId: l.apiId })));
    
    // Find league info to get apiId
    const leagueInfo = leagues.find(l => l.id === leagueId || String(l.apiId) === String(leagueId));
    console.log('[App] Found league info:', leagueInfo);
    
    const apiId = leagueInfo?.apiId || leagueId;
    console.log('[App] Using API ID:', apiId);
    
    // Check if this is Premier League (id=39)
    const isPremierLeague = String(apiId) === '39' || String(leagueId) === '39' || 
                           (leagueInfo && (leagueInfo.isPremierLeague === true || 
                            (leagueInfo.name && leagueInfo.name.toLowerCase().includes('premier league') && 
                             leagueInfo.name.toLowerCase().includes('england'))));
    
    console.log('[App] Is Premier League?', isPremierLeague);
    
    if (isPremierLeague) {
      // Try multiple date ranges to get more matches
      const today = new Date();
      const dates = [];
      
      // Get matches for today and next 7 days
      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
      }
      
      console.log('[App] Fetching Premier League matches for dates:', dates);
      
      let allMatches = [];
      
      // Fetch matches for each date
      for (const date of dates) {
        const url = `${PHP_API_BASE}/fixtures.php?league=39&season=2025&date=${date}`;
        console.log('[App] Fetching from URL:', url);
        
        try {
          const res = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
              'Pragma': 'no-cache'
            }
          });
          
          console.log('[App] Response status:', res.status, res.statusText);
          
          if (!res.ok) {
            console.warn('[App] Failed to load fixtures for date', date, ':', res.status);
            continue;
          }
          
          const data = await res.json();
          console.log('[App] Response data for', date, ':', data);
          
          if (data.ok && data.matches && Array.isArray(data.matches)) {
            console.log(`[App] Found ${data.matches.length} matches for date ${date}`);
            allMatches = allMatches.concat(data.matches);
          } else {
            console.log('[App] No matches or invalid format for date', date);
          }
        } catch (err) {
          console.error('[App] Error fetching for date', date, ':', err);
        }
      }
      
      console.log(`[App] Total matches loaded: ${allMatches.length}`);
      console.log('[App] Matches data:', allMatches);
      
      if (allMatches.length === 0) {
        console.warn('[App] No matches found for Premier League');
        return [];
      }
      
      // Find Premier League in leagues array to get correct leagueId
      const premierLeagueInList = leagues.find(l => 
        l.apiId === 39 || 
        String(l.apiId) === '39' || 
        l.isPremierLeague === true ||
        (l.name && l.name.toLowerCase().includes('premier league') && l.name.toLowerCase().includes('england'))
      );
      
      console.log('[App] Premier League in leagues array:', premierLeagueInList);
      const correctLeagueId = premierLeagueInList ? premierLeagueInList.id : '39';
      console.log('[App] Using leagueId for converted matches:', correctLeagueId);
      
      // Convert fixtures format to match format
      const convertedMatches = allMatches.map((m, idx) => {
        const leagueName = m.leagueName || m.league || "Unknown League";
        
        // Convert time to user's local timezone
        let timeStr = "TBD";
        if (m.startDateTimeISO) {
          try {
            const matchDate = new Date(m.startDateTimeISO);
            if (!isNaN(matchDate.getTime())) {
              const day = String(matchDate.getDate()).padStart(2, '0');
              const month = String(matchDate.getMonth() + 1).padStart(2, '0');
              const hours = String(matchDate.getHours()).padStart(2, '0');
              const minutes = String(matchDate.getMinutes()).padStart(2, '0');
              timeStr = `${day}.${month} ${hours}:${minutes}`;
            }
          } catch (e) {
            timeStr = m.startTime ? `${m.startDate || ""} ${m.startTime}`.trim() : "TBD";
          }
        } else if (m.startTime) {
          timeStr = `${m.startDate || ""} ${m.startTime}`.trim();
        }
        
        return {
          id: m.matchId || `m${idx}`,
          matchId: m.matchId,
          lineId: m.lineId || m.matchId,
          detailUrl: null,
          leagueId: correctLeagueId, // Use ID from leagues array, not API league ID
          leagueName: leagueName,
          leagueLogo: m.leagueLogo || null,
          time: timeStr,
          home: m.home || "",
          away: m.away || "",
          homeLogo: m.homeLogo || null,
          awayLogo: m.awayLogo || null,
          odds: { homeWin: 0, draw: 0, awayWin: 0 },
          allOutcomes: [],
          isLive: m.isLive || false,
          liveTime: m.liveTime,
          livePeriod: m.livePeriod,
          score: m.score
        };
      });
      
      console.log('[App] Converted matches:', convertedMatches);
      return convertedMatches;
    }
    
    console.log('[App] Not Premier League, returning empty array');
    return [];
  } catch (err) {
    console.error('[App] Error loading matches by league:', err);
    console.error('[App] Error stack:', err.stack);
    return [];
  }
}

async function applySearchFilters() {
  console.log('[App] ===== applySearchFilters called =====');
  
  // Get search query
  const searchInput = document.getElementById("search-matches-input");
  if (searchInput) {
    state.searchQuery = searchInput.value.trim();
  }
  
  // Get selected leagues
  const checkboxes = document.querySelectorAll('.league-filter-checkbox:checked');
  state.selectedLeagueIds = Array.from(checkboxes).map(cb => cb.value);
  
  console.log('[App] Selected league IDs:', state.selectedLeagueIds);
  console.log('[App] Current matches count:', matches.length);
  
  // Reset activeLeagueId if leagues are selected via filter
  if (state.selectedLeagueIds.length > 0) {
    state.activeLeagueId = "all"; // Clear active league when using filter
    
    // Check if Premier League (id=39) is selected
    // Premier League can be identified by apiId=39 or isPremierLeague flag
    for (const selectedId of state.selectedLeagueIds) {
      console.log('[App] Checking league ID:', selectedId);
      const leagueInfo = leagues.find(l => l.id === selectedId || String(l.apiId) === String(selectedId));
      console.log('[App] League info found:', leagueInfo);
      
      // Check if this is Premier League
      const isPremierLeague = leagueInfo && (
        String(leagueInfo.apiId) === '39' || 
        selectedId === '39' ||
        leagueInfo.isPremierLeague === true ||
        (leagueInfo.name && leagueInfo.name.toLowerCase().includes('premier league') && 
         leagueInfo.name.toLowerCase().includes('england'))
      );
      
      console.log('[App] Is Premier League?', isPremierLeague);
      
      if (isPremierLeague) {
        console.log('[App] ===== Premier League detected, loading matches from fixtures API =====');
        // Load matches from fixtures API for Premier League
        const premierLeagueMatches = await loadMatchesByLeague(selectedId);
        console.log('[App] Premier League matches loaded:', premierLeagueMatches.length);
        console.log('[App] Premier League matches data:', premierLeagueMatches);
        
        if (premierLeagueMatches.length > 0) {
          console.log('[App] Processing Premier League matches...');
          
          // Create a map of existing matches by matchId
          const existingMatchesMap = new Map();
          matches.forEach(m => {
            if (m.matchId) {
              existingMatchesMap.set(m.matchId, m);
            }
          });
          
          // Update or add Premier League matches
          let updatedCount = 0;
          let addedCount = 0;
          
          premierLeagueMatches.forEach(newMatch => {
            if (!newMatch.matchId) return;
            
            const existingMatch = existingMatchesMap.get(newMatch.matchId);
            if (existingMatch) {
              // Update existing match with correct leagueId
              existingMatch.leagueId = newMatch.leagueId;
              existingMatch.leagueName = newMatch.leagueName;
              existingMatch.leagueLogo = newMatch.leagueLogo;
              existingMatch.isLive = newMatch.isLive;
              existingMatch.liveTime = newMatch.liveTime;
              existingMatch.livePeriod = newMatch.livePeriod;
              existingMatch.score = newMatch.score;
              existingMatch.time = newMatch.time;
              updatedCount++;
            } else {
              // Add new match
              matches.push(newMatch);
              existingMatchesMap.set(newMatch.matchId, newMatch);
              addedCount++;
            }
          });
          
          console.log(`[App] ===== Updated ${updatedCount} and added ${addedCount} Premier League matches =====`);
          console.log('[App] Total matches now:', matches.length);
          console.log('[App] Sample Premier League match:', premierLeagueMatches[0]);
        } else {
          console.warn('[App] ===== No Premier League matches found from fixtures API =====');
        }
        break; // Only load once
      }
    }
  }
  
  // Reset to first page
  state.currentPage = 1;
  
  // Update filter button text
  updateSearchFilterButton();
  
  // Close modal
  closeSearchFiltersModal();
  
  // Re-render matches (this will update subtitle)
  console.log('[App] Rendering matches, total count:', matches.length);
  renderMatches();
}

function resetSearchFilters() {
  state.searchQuery = "";
  state.selectedLeagueIds = [];
  state.currentPage = 1;
  
  const searchInput = document.getElementById("search-matches-input");
  if (searchInput) searchInput.value = "";
  
  const clearBtn = document.getElementById("search-matches-clear");
  if (clearBtn) clearBtn.style.display = "none";
  
  // Uncheck all checkboxes
  const checkboxes = document.querySelectorAll('.league-filter-checkbox');
  checkboxes.forEach(cb => cb.checked = false);
  
  // Update filter button text
  updateSearchFilterButton();
  
  // Re-render leagues filter
  renderLeaguesFilter();
  
  // Re-render matches
  renderMatches();
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
  // Update search filter button
  updateSearchFilterButton();
  // Update match type tabs
  updateMatchTypeTabs();

  // Match type tabs handlers (Pre Match / Live)
  const prematchTab = document.getElementById('prematch-tab');
  const liveTab = document.getElementById('live-tab');
  
  if (prematchTab) {
    prematchTab.addEventListener('click', () => {
      state.matchType = 'prematch';
      state.currentPage = 1;
      updateMatchTypeTabs();
      renderMatches();
    });
  }
  
  if (liveTab) {
    liveTab.addEventListener('click', () => {
      state.matchType = 'live';
      state.currentPage = 1;
      updateMatchTypeTabs();
      renderMatches();
    });
  }
  
  // Fixed Live button handler
  const fixedLiveBtn = document.getElementById('fixed-live-btn');
  if (fixedLiveBtn) {
    fixedLiveBtn.addEventListener('click', () => {
      // Switch to sportsbook tab first if not already there
      if (state.activeTab !== 'sportsbook') {
        switchTab('sportsbook');
        // Wait a bit for tab switch to complete, then set live
        setTimeout(() => {
          state.matchType = 'live';
          state.currentPage = 1;
          updateMatchTypeTabs();
          renderMatches();
          // Scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
      } else {
        // Already on sportsbook, just switch to live
        state.matchType = 'live';
        state.currentPage = 1;
        updateMatchTypeTabs();
        renderMatches();
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // Removed sidebar handlers as sidebar is no longer present
  
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
      const searchFiltersModal = document.getElementById("search-filters-modal");
      if (searchFiltersModal && searchFiltersModal.style.display !== "none") {
        closeSearchFiltersModal();
        return;
      }
      const leaguesModal = document.getElementById("leagues-search-modal");
      if (leaguesModal && leaguesModal.style.display !== "none") {
        closeLeaguesSearchModal();
        return;
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
      // Check if clicking on favorite button - handle it directly
      const favoriteBtn = e.target.closest(".favorite-btn-digital, .favorite-btn-match, .favorite-btn, .favorite-btn-inline");
      if (favoriteBtn) {
        e.stopPropagation();
        e.preventDefault();
        
        // Get data attributes
        let favoriteType = favoriteBtn.getAttribute("data-favorite-type");
        let favoriteId = favoriteBtn.getAttribute("data-favorite-id");
        
        // Fallback: try to get from parent match card
        if (!favoriteId || !favoriteType) {
          const matchCard = favoriteBtn.closest(".match-card-digital, .match-row");
          if (matchCard) {
            const matchId = matchCard.getAttribute("data-match-id");
            if (matchId) {
              favoriteType = favoriteType || 'match';
              favoriteId = favoriteId || matchId;
            }
          }
        }
        
        if (favoriteType && favoriteId && typeof window.toggleFavorite === 'function') {
          window.toggleFavorite(favoriteType, favoriteId);
        }
        return;
      }
      
      // First try to handle odds click
      // Check if clicking on outcome button first
      if (e.target.closest(".outcome-btn, .outcome-cell")) {
        const handled = handleOddsClick(e);
        // If odds were clicked, don't open modal
        if (handled) return;
      }
      
      // Don't open modal if clicking on action button or other interactive elements
      if (e.target.closest(".go-to-all-bets-btn, .go-to-all-bets-btn-digital, .match-actions, .match-actions-mobile, .odds-group, .odds-buttons")) {
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

  // Search & Filters Modal handlers
  const searchFilterBtn = document.getElementById("search-filter-btn");
  const searchFiltersModal = document.getElementById("search-filters-modal");
  const searchFiltersModalClose = document.getElementById("search-filters-modal-close");
  const searchFiltersApply = document.getElementById("search-filters-apply");
  const searchFiltersReset = document.getElementById("search-filters-reset");
  const leaguesFilterSearch = document.getElementById("leagues-filter-search");
  const searchMatchesInput = document.getElementById("search-matches-input");
  const searchMatchesClear = document.getElementById("search-matches-clear");
  
  if (searchFilterBtn) {
    searchFilterBtn.addEventListener("click", openSearchFiltersModal);
  }
  
  if (searchFiltersModalClose) {
    searchFiltersModalClose.addEventListener("click", closeSearchFiltersModal);
  }
  
  if (searchFiltersModal) {
    const overlay = searchFiltersModal.querySelector(".modal-overlay");
    if (overlay) {
      overlay.addEventListener("click", closeSearchFiltersModal);
    }
  }
  
  if (searchFiltersApply) {
    searchFiltersApply.addEventListener("click", applySearchFilters);
  }
  
  if (searchFiltersReset) {
    searchFiltersReset.addEventListener("click", resetSearchFilters);
  }
  
  if (leaguesFilterSearch) {
    leaguesFilterSearch.addEventListener("input", renderLeaguesFilter);
  }
  
  if (searchMatchesInput) {
    searchMatchesInput.addEventListener("input", (e) => {
      const query = e.target.value.trim();
      if (query) {
        if (searchMatchesClear) searchMatchesClear.style.display = "flex";
      } else {
        if (searchMatchesClear) searchMatchesClear.style.display = "none";
      }
    });
  }
  
  if (searchMatchesClear) {
    searchMatchesClear.addEventListener("click", () => {
      if (searchMatchesInput) {
        searchMatchesInput.value = "";
        if (searchMatchesClear) searchMatchesClear.style.display = "none";
        if (searchMatchesInput) searchMatchesInput.focus();
      }
    });
  }

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
    state.stake = value > 0 ? Math.round(value * 100) / 100 : 0; // Round to 2 decimal places
    e.target.value = state.stake > 0 ? state.stake.toFixed(2) : "";
    renderSlip();
  });
  
  document.getElementById("stake-input").addEventListener("blur", (e) => {
    const value = Number(e.target.value || "0");
    state.stake = value > 0 ? Math.round(value * 100) / 100 : 0; // Round to 2 decimal places
    e.target.value = state.stake > 0 ? state.stake.toFixed(2) : "";
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
      betslip.style.height = '100%';
      betslip.style.maxHeight = '100%';
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
    
    console.log('[Match Detail] Fetching predictions for fixture:', fixtureId);
    const url = `${PHP_API_BASE}/predictions.php?fixture=${fixtureId}`;
    
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const data = await res.json();
    console.log('[Match Detail] Predictions data received');
    
    if (!data.ok || !data.response || !Array.isArray(data.response) || data.response.length === 0) {
      modalBody.innerHTML = '<div class="loading" style="padding: 40px; text-align: center; color: rgba(232, 232, 234, 0.7);">Прогнозы не найдены</div>';
      return;
    }
    
    const prediction = data.response[0];
    if (!prediction.predictions) {
      modalBody.innerHTML = '<div class="loading" style="padding: 40px; text-align: center; color: rgba(232, 232, 234, 0.7);">Прогнозы не найдены</div>';
      return;
    }
    
    const pred = prediction.predictions;
    const matchId = matchObj?.id || fixtureId;
    
    let html = '<div class="match-detail-odds-blocks">';
    
    // 1. 1X2 (Main Result)
    if (pred.percent) {
      const homeOdd = percentToOdds(pred.percent.home);
      const drawOdd = percentToOdds(pred.percent.draw);
      const awayOdd = percentToOdds(pred.percent.away);
      
      if (homeOdd && drawOdd && awayOdd) {
        html += `<div class="match-detail-odds-block">`;
        html += `<div class="match-detail-odds-block-title">1X2</div>`;
        html += `<div class="match-detail-odds-block-content">`;
        
        const outcomes = [
          { label: '1', odd: homeOdd, value: 'Home', percent: pred.percent.home },
          { label: 'X', odd: drawOdd, value: 'Draw', percent: pred.percent.draw },
          { label: '2', odd: awayOdd, value: 'Away', percent: pred.percent.away }
        ];
        
        outcomes.forEach(item => {
          const outcomeId = `${fixtureId}_1x2_${item.value}_${item.odd}`;
          const isActive = state.slip.some(s => {
            return s.outcomeId === outcomeId || 
                   (s.matchId === matchId && 
                    s.betName === '1X2' && 
                    s.value === item.value &&
                    Math.abs(s.odd - item.odd) < 0.01);
          });
          
          html += `
            <button class="match-detail-odds-btn ${isActive ? "match-detail-odds-btn-active" : ""}" 
                    data-match-id="${matchId}"
                    data-fixture-id="${fixtureId}"
                    data-bookmaker-id="predictions"
                    data-bookmaker-name="Predictions"
                    data-bet-id="1x2"
                    data-bet-name="1X2"
                    data-value="${item.value}"
                    data-odd="${item.odd}"
                    data-outcome-id="${outcomeId}">
              <span class="match-detail-odds-btn-label">${item.label}</span>
              <span class="match-detail-odds-btn-value">${formatOdd(item.odd)}</span>
              <span style="font-size: 11px; opacity: 0.7; margin-top: 2px;">${item.percent}</span>
            </button>
          `;
        });
        
        html += `</div></div>`;
      }
    }
    
    // 2. Double Chance (Win or Draw)
    if (pred.win_or_draw !== null && pred.win_or_draw !== undefined) {
      html += `<div class="match-detail-odds-block">`;
      html += `<div class="match-detail-odds-block-title">Double Chance</div>`;
      html += `<div class="match-detail-odds-block-content">`;
      
      if (pred.winner) {
        const winnerName = pred.winner.name || 'Winner';
        const winnerComment = pred.winner.comment || '';
        const winnerPercent = pred.percent ? (pred.winner.id === prediction.teams?.home?.id ? pred.percent.home : pred.percent.away) : null;
        const winnerOdd = winnerPercent ? percentToOdds(winnerPercent) : null;
        
        if (winnerOdd) {
          const outcomeId = `${fixtureId}_double_chance_winner_${winnerOdd}`;
          const isActive = state.slip.some(s => s.outcomeId === outcomeId);
          
          html += `
            <button class="match-detail-odds-btn ${isActive ? "match-detail-odds-btn-active" : ""}" 
                    data-match-id="${matchId}"
                    data-fixture-id="${fixtureId}"
                    data-bookmaker-id="predictions"
                    data-bet-id="double_chance"
                    data-bet-name="Double Chance"
                    data-value="Win or Draw"
                    data-odd="${winnerOdd}"
                    data-outcome-id="${outcomeId}">
              <span class="match-detail-odds-btn-label">${winnerName} ${winnerComment}</span>
              <span class="match-detail-odds-btn-value">${formatOdd(winnerOdd)}</span>
            </button>
          `;
        } else {
          html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
        }
      } else {
        html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
      }
      
      html += `</div></div>`;
    }
    
    // 3. Goals Prediction
    html += `<div class="match-detail-odds-block">`;
    html += `<div class="match-detail-odds-block-title">Goals Prediction</div>`;
    html += `<div class="match-detail-odds-block-content">`;
    
    if (pred.goals && (pred.goals.home || pred.goals.away)) {
      if (pred.goals.home) {
        html += `<div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 4px;">Home</div>
          <div style="font-size: 16px; color: rgba(248,113,113,0.9); font-weight: 600;">${pred.goals.home}</div>
        </div>`;
      } else {
        html += `<div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
          <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 4px;">Home</div>
          <div style="font-size: 14px; color: rgba(232,232,234,0.5);">No information</div>
        </div>`;
      }
      
      if (pred.goals.away) {
        html += `<div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px;">
          <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 4px;">Away</div>
          <div style="font-size: 16px; color: rgba(248,113,113,0.9); font-weight: 600;">${pred.goals.away}</div>
        </div>`;
      } else {
        html += `<div style="padding: 8px; background: rgba(255,255,255,0.03); border-radius: 8px;">
          <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 4px;">Away</div>
          <div style="font-size: 14px; color: rgba(232,232,234,0.5);">No information</div>
        </div>`;
      }
    } else {
      html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
    }
    
    html += `</div></div>`;
    
    // 4. Comparison Statistics
    html += `<div class="match-detail-odds-block">`;
    html += `<div class="match-detail-odds-block-title">Team Comparison</div>`;
    html += `<div class="match-detail-odds-block-content">`;
    
    if (prediction.comparison) {
      const comparisons = [
        { key: 'form', label: 'Form' },
        { key: 'att', label: 'Attack' },
        { key: 'def', label: 'Defense' },
        { key: 'goals', label: 'Goals' },
        { key: 'h2h', label: 'H2H' },
        { key: 'total', label: 'Total' }
      ];
      
      let hasAnyComparison = false;
      comparisons.forEach(comp => {
        if (prediction.comparison[comp.key]) {
          hasAnyComparison = true;
          const homePercent = prediction.comparison[comp.key].home || '0%';
          const awayPercent = prediction.comparison[comp.key].away || '0%';
          
          html += `<div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
            <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 8px;">${comp.label}</div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="flex: 1; text-align: left;">
                <div style="font-size: 14px; color: rgba(248,113,113,0.9); font-weight: 600;">${homePercent}</div>
                <div style="font-size: 11px; color: rgba(232,232,234,0.5);">Home</div>
              </div>
              <div style="flex: 1; text-align: right;">
                <div style="font-size: 14px; color: rgba(248,113,113,0.9); font-weight: 600;">${awayPercent}</div>
                <div style="font-size: 11px; color: rgba(232,232,234,0.5);">Away</div>
              </div>
            </div>
          </div>`;
        }
      });
      
      if (!hasAnyComparison) {
        html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
      }
    } else {
      html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
    }
    
    html += `</div></div>`;
    
    // 5. Under/Over Statistics (from teams data)
    html += `<div class="match-detail-odds-block">`;
    html += `<div class="match-detail-odds-block-title">Under/Over Statistics</div>`;
    html += `<div class="match-detail-odds-block-content">`;
    
    if (prediction.teams?.home?.league?.under_over || prediction.teams?.away?.league?.under_over) {
      const totals = ['0.5', '1.5', '2.5', '3.5'];
      let hasAnyTotal = false;
      
      totals.forEach(total => {
        const homeData = prediction.teams?.home?.league?.under_over?.[total];
        const awayData = prediction.teams?.away?.league?.under_over?.[total];
        
        if (homeData || awayData) {
          hasAnyTotal = true;
          html += `<div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; margin-bottom: 8px;">
            <div style="font-size: 12px; color: rgba(232,232,234,0.6); margin-bottom: 8px;">Total ${total}</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <div style="font-size: 11px; color: rgba(232,232,234,0.5); margin-bottom: 4px;">Home</div>
                <div style="font-size: 12px; color: rgba(232,232,234,0.8);">
                  ${homeData ? `Over: ${homeData.over || 0} | Under: ${homeData.under || 0}` : 'No information'}
                </div>
              </div>
              <div>
                <div style="font-size: 11px; color: rgba(232,232,234,0.5); margin-bottom: 4px;">Away</div>
                <div style="font-size: 12px; color: rgba(232,232,234,0.8);">
                  ${awayData ? `Over: ${awayData.over || 0} | Under: ${awayData.under || 0}` : 'No information'}
                </div>
              </div>
            </div>
          </div>`;
        }
      });
      
      if (!hasAnyTotal) {
        html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
      }
    } else {
      html += `<div style="padding: 12px; text-align: center; color: rgba(232,232,234,0.5);">No information</div>`;
    }
    
    html += `</div></div>`;
    
    // 6. Prediction Advice
    if (pred.advice) {
      html += `<div class="match-detail-prediction-advice" style="padding: 20px; margin-top: 20px; background: rgba(255, 255, 255, 0.05); border-radius: 12px;">
        <div style="font-size: 14px; color: rgba(232, 232, 234, 0.7); margin-bottom: 8px;">Прогноз:</div>
        <div style="font-size: 16px; color: rgba(248, 113, 113, 0.9); font-weight: 600;">${pred.advice}</div>
      </div>`;
    }
    
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
        
        // Only update slip, don't reload matches
        renderSlip();
        
        // Update button active state without reloading modal
        btn.classList.toggle('match-detail-odds-btn-active', existingSameOutcomeIdx < 0);
        
        // On mobile: close modal and open betslip
        if (isMobile()) {
          closeModal();
          setTimeout(() => {
            openBetslipMobile();
          }, 200);
        }
        // On desktop: close modal and open betslip
        else {
          closeModal();
          // Open betslip on desktop if not already open
          if (!document.querySelector('.betslip.betslip-open-desktop')) {
            openBetslipDesktop();
          }
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
      if (isMobile()) {
        toggleBetslipMobile();
      } else {
        toggleBetslipDesktop();
      }
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
  
  // Desktop close button
  const closeBtnDesktop = document.getElementById('betslip-close-btn-desktop');
  if (closeBtnDesktop) {
    closeBtnDesktop.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeBetslipDesktop();
    });
  }
  
  // Desktop overlay click to close
  // Close betslip on desktop when clicking outside (but not on the float button)
  if (!isMobile()) {
    document.addEventListener('click', (e) => {
      const betslip = document.querySelector('.betslip.betslip-open-desktop');
      if (!betslip) return;
      
      // Don't close if clicking inside betslip or on float button
      if (betslip.contains(e.target) || 
          e.target.closest('#betslip-float-btn') ||
          e.target.closest('.betslip-close-btn-desktop')) {
        return;
      }
      
      // Close betslip when clicking outside
      closeBetslipDesktop();
    });
  }
  
  // Close betslip on Escape key (desktop)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !isMobile()) {
      const betslip = document.querySelector('.betslip.betslip-open-desktop');
      if (betslip) {
        closeBetslipDesktop();
      }
    }
  });
  
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
  
  // Show float button on load
  updateBetslipFloatButton();
  
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

