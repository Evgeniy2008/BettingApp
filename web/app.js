// API endpoint (adjust port if needed)
const API_BASE = "http://localhost:3000";

// Source URL for parsing matches
// Matches are parsed from: https://w54rjjmb.com/sport?lc=1&ss=all
// This is the main sports page with all leagues and matches
// The endpoint /api/w54/live fetches and parses this page

let leagues = [{ id: "all", country: "🌐", name: "All leagues" }];
let matches = [];

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
      <div class="matches-header">
        <div class="matches-header-info">Матч</div>
        <div class="matches-header-odds">
          <span>П1</span>
          <span>X</span>
          <span>П2</span>
          <span>Б</span>
          <span>Тотал</span>
          <span>М</span>
          <span>1</span>
          <span>Фора</span>
          <span>2</span>
        </div>
      </div>
      <div class="matches-container">
        ${skeletonRows}
      </div>
    </div>
  `;
}

// Load matches from live site or snapshot
async function loadMatches() {
  // Show skeleton while loading
  showMatchesSkeleton();
  
  try {
    // Try live first
    let res;
    let data;
    
    try {
      res = await fetch(`${API_BASE}/api/w54/live`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      data = await res.json();
    } catch (fetchErr) {
      // If fetch fails (network error, CORS, etc.), try snapshot
      console.warn("Failed to fetch live data, trying snapshot:", fetchErr);
      
      try {
        res = await fetch(`${API_BASE}/api/w54/snapshot?file=Parseinfo.html`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        data = await res.json();
      } catch (snapshotErr) {
        // If both fail, show helpful error message
        const isNetworkError = fetchErr.message.includes('Failed to fetch') || 
                               fetchErr.message.includes('NetworkError') ||
                               fetchErr.message.includes('Network request failed') ||
                               fetchErr.name === 'TypeError';
        
        const errorMsg = isNetworkError
          ? `Не удалось подключиться к API на ${API_BASE}. Убедитесь, что сервер запущен. Запустите сервер командой: npm start (в папке bot)`
          : `Ошибка загрузки данных: ${fetchErr.message}`;
        
        throw new Error(errorMsg);
      }
    }
    
    // If live returns 0 matches, fallback to snapshot
    if (!data.matches || !Array.isArray(data.matches) || data.matches.length === 0) {
      console.log("Live site returned no matches, trying snapshot...");
      res = await fetch(`${API_BASE}/api/w54/snapshot?file=Parseinfo.html`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }
    
    if (!data.matches || !Array.isArray(data.matches) || data.matches.length === 0) {
      console.warn("No matches found in snapshot either:", data);
      // Show error message to user
      const root = document.getElementById("matches-list");
      if (root) {
        root.innerHTML = '<div class="subcard"><div class="label" style="color:rgba(248,113,113,0.9);">Не удалось загрузить матчи. Проверьте консоль браузера (F12).</div></div>';
      }
      return;
    }

    // Group by league (if available) or create virtual leagues from match data
    const leagueMap = new Map();
    leagueMap.set("all", { id: "all", country: "🌐", name: "All leagues", count: 0 });

    matches = data.matches.map((m, idx) => {
      const leagueId = m.league || "all";
      const leagueName = m.league || "Unknown League";

      if (!leagueMap.has(leagueId)) {
        leagueMap.set(leagueId, {
          id: leagueId,
          country: "🏳️",
          name: leagueName,
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

      const timeStr = m.startTime
        ? `${m.startDate || ""} ${m.startTime}`.trim()
        : "TBD";

      const matchObj = {
        id: m.matchId || `m${idx}`,
        matchId: m.matchId,
        lineId: m.lineId,
        detailUrl: m.detailUrl, // Store detail page URL
        leagueId: leagueId,
        leagueName: leagueName,
        time: timeStr,
        home: m.home || "",
        away: m.away || "",
        odds: { homeWin, draw, awayWin },
        allOutcomes: allOutcomes, // Store all bet types for future expansion
        isLive: m.isLive || false,
        liveTime: m.liveTime,
        livePeriod: m.livePeriod,
        score: m.score
      };
      
      // Debug logging
      console.log(`[DEBUG] Match loaded: ${matchObj.home} vs ${matchObj.away}, detailUrl: ${matchObj.detailUrl || 'MISSING'}`);
      
      return matchObj;
    });
    
    // Log summary
    const matchesWithUrl = matches.filter(m => m.detailUrl).length;
    console.log(`[DEBUG] Total matches: ${matches.length}, matches with detailUrl: ${matchesWithUrl}`);

    // Sort leagues by match count (descending), but keep "all" first
    leagues = Array.from(leagueMap.values()).sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return b.count - a.count;
    });
    
    renderLeagues();
    renderMatches();
    console.log(`Loaded ${matches.length} matches from ${leagues.length - 1} leagues`);
  } catch (err) {
    console.error("Failed to load matches:", err);
    // Show error to user
    const root = document.getElementById("matches-list");
    if (root) {
      root.innerHTML = `<div class="subcard"><div class="label" style="color:rgba(248,113,113,0.9);">Ошибка загрузки: ${err.message}. Убедитесь, что API запущен на ${API_BASE}</div></div>`;
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
  searchQuery: ""
};

function formatOdd(n) {
  return n.toFixed(2);
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
          <span class="league-flag">${l.country || "🏳️"}</span>
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
  let ms =
    state.activeLeagueId === "all"
      ? matches
      : matches.filter((m) => m.leagueId === state.activeLeagueId);

  // Apply search filter
  if (state.searchQuery.trim()) {
    const query = state.searchQuery.trim().toLowerCase();
    const queryWords = query.split(/\s+/).filter(w => w.length > 0);
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
  }

  // Sort: LIVE matches first, then regular matches
  ms.sort((a, b) => {
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return 0;
  });

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

  root.innerHTML = `
    <div class="matches-table">
      <div class="matches-header">
        <div class="matches-header-info">Матч</div>
        <div class="matches-header-odds">
          <span>П1</span>
          <span>X</span>
          <span>П2</span>
          <span>Б</span>
          <span>Тотал</span>
          <span>М</span>
          <span>1</span>
          <span>Фора</span>
          <span>2</span>
        </div>
      </div>
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
  const totalOver = outcomes.find((o) => o.type === "total" && o.label === "Тотал Б");
  const totalValue = totalOver?.value || outcomes.find((o) => o.type === "total")?.value || "";
  const totalUnder = outcomes.find((o) => o.type === "total" && o.label === "Тотал М");
  const fora1 = outcomes.find((o) => o.type === "fora" && o.label === "Фора 1");
  const foraValue = fora1?.value || outcomes.find((o) => o.type === "fora")?.value || "";
  const fora2 = outcomes.find((o) => o.type === "fora" && o.label === "Фора 2");

  const isLive = match.isLive || false;
  const liveBadge = isLive ? '<span class="live-badge">LIVE</span>' : '';
  const scoreDisplay = isLive && match.score 
    ? `<div class="match-score">${match.score.home} : ${match.score.away}</div>` 
    : '';
  const liveTimeDisplay = isLive && match.liveTime 
    ? `<span class="live-time-highlight">${match.liveTime}${match.livePeriod ? ' • ' + match.livePeriod : ''}</span>` 
    : `<span class="pill">${match.time || "TBD"}</span>`;

  return `
    <div class="match-row ${isLive ? 'match-row-live' : ''}" data-match-id="${match.id}">
      <div class="match-info">
        <div class="match-league">${liveBadge} ${match.leagueName}</div>
        <div class="match-title">${match.home} <span style="opacity:.7">vs</span> ${match.away}</div>
        ${scoreDisplay}
        <div class="match-time">
          ${liveTimeDisplay}
        </div>
      </div>
      <div class="match-odds-row">
        ${renderOutcomeButton(match, "1", outcome1X2?.odd)}
        ${renderOutcomeButton(match, "X", outcomeX?.odd)}
        ${renderOutcomeButton(match, "2", outcome2?.odd)}
        ${renderOutcomeButton(match, "total_over", totalOver?.odd, "Б", totalValue)}
        ${renderOutcomeValue(totalValue)}
        ${renderOutcomeButton(match, "total_under", totalUnder?.odd, "М", totalValue)}
        ${renderOutcomeButton(match, "fora_one", fora1?.odd, "1", foraValue)}
        ${renderOutcomeValue(foraValue)}
        ${renderOutcomeButton(match, "fora_two", fora2?.odd, "2", foraValue)}
      </div>
    </div>
  `;
}

function renderOutcomeButton(match, outcomeKey, odd, displayLabel = null, value = null) {
  if (!odd || odd === 0) {
    return `<div class="outcome-cell outcome-cell-empty">—</div>`;
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
  
  return `
    <button
      class="outcome-cell outcome-btn ${active ? "outcome-btn-active" : ""}"
      data-match-id="${match.id}"
      data-outcome-key="${outcomeKey}"
      data-odd="${odd}"
      ${value ? `data-value="${value}"` : ""}
    >
      <div class="outcome-value">${formatOdd(odd)}</div>
    </button>
  `;
}

function renderOutcomeValue(value) {
  if (!value || value === "0") {
    return `<div class="outcome-cell outcome-cell-value">—</div>`;
  }
  return `<div class="outcome-cell outcome-cell-value">${value}</div>`;
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

function renderSlip() {
  const root = document.getElementById("slip-items");
  const slip = state.slip;
  const slipCount = document.getElementById("slip-count");
  slipCount.textContent = slip.length.toString();

  if (!slip.length) {
    root.innerHTML =
      '<div class="subcard"><div class="label">Выберите исходы в линии, чтобы добавить их в купон.</div></div>';
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
        <button class="slip-remove" title="Удалить">×</button>
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
    possibleWinEl.textContent = "€0.00";
  } else {
    const win = state.stake * totalOdds;
    possibleWinEl.textContent = "€" + win.toFixed(2);
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
  // Otherwise, add the new bet (allow multiple bets on same match)
  else {
    state.slip.unshift(next);
  }
  renderMatches();
  renderSlip();
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
      state.activeTab = tabName;
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("tab-active"));
      tab.classList.add("tab-active");

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
    });
  });
}

function init() {
  renderLeagues();
  renderMatches();
  renderSlip();
  setupTabs();

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
      const handled = handleOddsClick(e);
      // If odds were clicked, don't open modal
      if (handled) return;
      
      // Otherwise, check if we should open match detail modal
      if (e.target.closest(".outcome-btn, .outcome-cell, .match-odds-row")) {
        return;
      }
      
      const matchRow = e.target.closest(".match-row");
      if (!matchRow) return;
      
      const matchId = matchRow.getAttribute("data-match-id");
      const match = matches.find((m) => m.id === matchId);
      if (!match || !match.detailUrl) return;
      
      loadMatchDetail(match.detailUrl, match);
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

  document.getElementById("place-bet-btn").addEventListener("click", () => {
    if (!state.slip.length || !state.stake) return;
    alert("Демо: ставка отправлена (пока без backend).");
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

async function loadMatchDetail(detailUrl, match) {
  console.log(`[DEBUG] loadMatchDetail called for: ${match.home} vs ${match.away}`);
  console.log(`[DEBUG] detailUrl: ${detailUrl}`);
  
  const modal = document.getElementById("match-detail-modal");
  const modalTitle = document.getElementById("modal-match-title");
  const modalBody = document.getElementById("modal-body");
  
  // Set title
  modalTitle.textContent = `${match.home} vs ${match.away}`;
  
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
    // Ensure URL is absolute
    const url = detailUrl.startsWith("http") 
      ? detailUrl 
      : `https://w54rjjmb.com${detailUrl}`;
    
    console.log(`[DEBUG] Fetching detail page: ${url}`);
    console.log(`[DEBUG] API endpoint: ${API_BASE}/api/w54/detail?url=${encodeURIComponent(url)}`);
    
    const res = await fetch(`${API_BASE}/api/w54/detail?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    
    const data = await res.json();
    
    console.log(`[DEBUG] Detail page response:`, data);
    console.log(`[DEBUG] Outcomes count: ${data.outcomes?.length || 0}`);
    
    if (!data.outcomes || data.outcomes.length === 0) {
      console.warn(`[DEBUG] No outcomes found for match: ${match.home} vs ${match.away}`);
      modalBody.innerHTML = '<div class="loading">Коэффициенты не найдены</div>';
      return;
    }
    
    // Group outcomes by type
    const grouped = {
      "1x2": [],
      "total": [],
      "fora": [],
      "other": []
    };
    
    data.outcomes.forEach((outcome) => {
      const type = outcome.type || "other";
      if (grouped[type]) {
        grouped[type].push(outcome);
      } else {
        grouped.other.push(outcome);
      }
    });
    
    // Render grouped outcomes
    let html = '<div class="detail-outcomes">';
    
    // 1X2 outcomes
    if (grouped["1x2"].length > 0) {
      html += '<div class="detail-outcome-group">';
      html += '<div class="detail-outcome-group-title">Исход матча (1X2)</div>';
      html += '<div class="detail-outcomes-grid">';
      grouped["1x2"].forEach((outcome) => {
        const outcomeKey = outcome.label === "1" ? "1" : outcome.label === "X" ? "X" : "2";
        const isActive = state.slip.some(
          (s) => s.matchId === match.id && 
                 s.outcomeKey === outcomeKey && 
                 !s.value // 1X2 outcomes don't have value
        );
        html += `
          <button class="detail-outcome-item detail-outcome-btn ${isActive ? "detail-outcome-btn-active" : ""}" 
                  data-match-id="${match.id}" 
                  data-outcome-key="${outcomeKey}" 
                  data-odd="${outcome.odd}"
                  data-label="${outcome.label}">
            <div class="detail-outcome-label">${outcome.label}</div>
            <div class="detail-outcome-value">${formatOdd(outcome.odd)}</div>
          </button>
        `;
      });
      html += '</div></div>';
    }
    
    // Totals
    if (grouped["total"].length > 0) {
      // Group by value
      const totalsByValue = {};
      grouped["total"].forEach((outcome) => {
        const value = outcome.value || "?";
        if (!totalsByValue[value]) totalsByValue[value] = [];
        totalsByValue[value].push(outcome);
      });
      
      Object.keys(totalsByValue).forEach((value) => {
        html += '<div class="detail-outcome-group">';
        html += `<div class="detail-outcome-group-title">Тотал ${value}</div>`;
        html += '<div class="detail-outcomes-grid">';
        totalsByValue[value].forEach((outcome) => {
          const outcomeKey = outcome.label.includes("Б") || outcome.label.includes("больше") || outcome.label.includes("over") 
            ? "total_over" 
            : "total_under";
          const normalizedValue = value ? String(value).trim() : null;
          const isActive = state.slip.some(
            (s) => {
              if (s.matchId !== match.id || s.outcomeKey !== outcomeKey) return false;
              if (normalizedValue) {
                const sValue = s.value ? String(s.value).trim() : null;
                return sValue === normalizedValue;
              }
              return !s.value;
            }
          );
          html += `
            <button class="detail-outcome-item detail-outcome-btn ${isActive ? "detail-outcome-btn-active" : ""}" 
                    data-match-id="${match.id}" 
                    data-outcome-key="${outcomeKey}" 
                    data-odd="${outcome.odd}"
                    data-label="${outcome.label}"
                    data-value="${value}">
              <div class="detail-outcome-label">${outcome.label}</div>
              <div class="detail-outcome-value">${formatOdd(outcome.odd)}</div>
            </button>
          `;
        });
        html += '</div></div>';
      });
    }
    
    // Foras
    if (grouped["fora"].length > 0) {
      // Group by value
      const forasByValue = {};
      grouped["fora"].forEach((outcome) => {
        const value = outcome.value || "?";
        if (!forasByValue[value]) forasByValue[value] = [];
        forasByValue[value].push(outcome);
      });
      
      Object.keys(forasByValue).forEach((value) => {
        html += '<div class="detail-outcome-group">';
        html += `<div class="detail-outcome-group-title">Фора ${value}</div>`;
        html += '<div class="detail-outcomes-grid">';
        forasByValue[value].forEach((outcome) => {
          const outcomeKey = outcome.label.includes("1") || outcome.label.includes("Фора 1")
            ? "fora_one" 
            : "fora_two";
          const normalizedValue = value ? String(value).trim() : null;
          const isActive = state.slip.some(
            (s) => {
              if (s.matchId !== match.id || s.outcomeKey !== outcomeKey) return false;
              if (normalizedValue) {
                const sValue = s.value ? String(s.value).trim() : null;
                return sValue === normalizedValue;
              }
              return !s.value;
            }
          );
          html += `
            <button class="detail-outcome-item detail-outcome-btn ${isActive ? "detail-outcome-btn-active" : ""}" 
                    data-match-id="${match.id}" 
                    data-outcome-key="${outcomeKey}" 
                    data-odd="${outcome.odd}"
                    data-label="${outcome.label}"
                    data-value="${value}">
              <div class="detail-outcome-label">${outcome.label}</div>
              <div class="detail-outcome-value">${formatOdd(outcome.odd)}</div>
            </button>
          `;
        });
        html += '</div></div>';
      });
    }
    
    // Other outcomes
    if (grouped["other"].length > 0) {
      html += '<div class="detail-outcome-group">';
      html += '<div class="detail-outcome-group-title">Другие ставки</div>';
      html += '<div class="detail-outcomes-grid">';
      grouped["other"].forEach((outcome, idx) => {
        const outcomeKey = `other_${idx}`;
        const isActive = state.slip.some(
          (s) => s.matchId === match.id && s.outcomeKey === outcomeKey
        );
        html += `
          <button class="detail-outcome-item detail-outcome-btn ${isActive ? "detail-outcome-btn-active" : ""}" 
                  data-match-id="${match.id}" 
                  data-outcome-key="${outcomeKey}" 
                  data-odd="${outcome.odd}"
                  data-label="${outcome.label || "—"}">
            <div class="detail-outcome-label">${outcome.label || "—"}</div>
            <div class="detail-outcome-value">${formatOdd(outcome.odd)}</div>
            ${outcome.value ? `<div class="detail-outcome-param">${outcome.value}</div>` : ""}
          </button>
        `;
      });
      html += '</div></div>';
    }
    
    html += '</div>';
    modalBody.innerHTML = html;
    
    // Add click handlers for bet buttons in modal
    modalBody.querySelectorAll('.detail-outcome-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const matchId = btn.getAttribute('data-match-id');
        const outcomeKey = btn.getAttribute('data-outcome-key');
        const label = btn.getAttribute('data-label');
        const odd = Number(btn.getAttribute('data-odd'));
        const value = btn.getAttribute('data-value');
        
        if (!matchId || !outcomeKey || !odd) return;
        
        const matchObj = matches.find((m) => m.id === matchId);
        if (!matchObj) return;
        
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
        
        const next = {
          matchId: matchObj.id,
          outcomeKey,
          label: label || outcomeKey,
          odd,
          home: matchObj.home,
          away: matchObj.away,
          leagueName: matchObj.leagueName,
          value: normalizedValue || undefined
        };
        
        // If clicking the same exact outcome, toggle it off
        if (existingSameOutcomeIdx >= 0) {
          state.slip.splice(existingSameOutcomeIdx, 1);
        } 
        // Otherwise, add the new bet (allow multiple bets on same match)
        else {
          state.slip.unshift(next);
        }
        
        renderMatches();
        renderSlip();
        
        // Update active states in modal without re-rendering
        modalBody.querySelectorAll('.detail-outcome-btn').forEach(btn => {
          const btnMatchId = btn.getAttribute('data-match-id');
          const btnOutcomeKey = btn.getAttribute('data-outcome-key');
          const btnValue = btn.getAttribute('data-value');
          const normalizedBtnValue = btnValue ? String(btnValue).trim() : null;
          
          const isActive = state.slip.some(
            (s) => {
              if (s.matchId !== btnMatchId || s.outcomeKey !== btnOutcomeKey) return false;
              // For outcomes with value (totals, foras), must match value exactly
              if (normalizedBtnValue) {
                const sValue = s.value ? String(s.value).trim() : null;
                return sValue === normalizedBtnValue;
              }
              // For outcomes without value (1X2), must not have value
              return !s.value;
            }
          );
          if (isActive) {
            btn.classList.add('detail-outcome-btn-active');
          } else {
            btn.classList.remove('detail-outcome-btn-active');
          }
        });
      });
    });
  } catch (err) {
    console.error("Failed to load match detail:", err);
    modalBody.innerHTML = `<div class="loading" style="color:rgba(248,113,113,0.9);">Ошибка загрузки: ${err.message}</div>`;
  }
}

window.addEventListener("DOMContentLoaded", () => {
  init();
  loadMatches();
});

