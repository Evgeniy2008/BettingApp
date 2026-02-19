// API endpoint (adjust port if needed)
const API_BASE = "http://localhost:3001";

let leagues = [{ id: "all", country: "🌐", name: "All leagues" }];
let matches = [];

// Load matches from live site or snapshot
async function loadMatches() {
  try {
    // Try live first
    let res = await fetch(`${API_BASE}/api/w54/live`);
    let data = await res.json();
    
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

      return {
        id: m.matchId || `m${idx}`,
        matchId: m.matchId,
        lineId: m.lineId,
        leagueId: leagueId,
        leagueName: leagueName,
        time: timeStr,
        home: m.home || "",
        away: m.away || "",
        odds: { homeWin, draw, awayWin },
        allOutcomes: allOutcomes // Store all bet types for future expansion
      };
    });

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
    ms = ms.filter((m) => {
      const home = (m.home || "").toLowerCase();
      const away = (m.away || "").toLowerCase();
      const league = (m.leagueName || "").toLowerCase();
      return home.includes(query) || away.includes(query) || league.includes(query);
    });
  }

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

  return `
    <div class="match-row" data-match-id="${match.id}">
      <div class="match-info">
        <div class="match-league">${match.leagueName}</div>
        <div class="match-title">${match.home} <span style="opacity:.7">vs</span> ${match.away}</div>
        <div class="match-time">
          <span class="pill" style="${
            match.time === "LIVE"
              ? "border-color:rgba(248,113,113,.7);color:#f97373;"
              : ""
          }">${match.time}</span>
        </div>
      </div>
      <div class="match-odds-row">
        ${renderOutcomeButton(match, "1", outcome1X2?.odd)}
        ${renderOutcomeButton(match, "X", outcomeX?.odd)}
        ${renderOutcomeButton(match, "2", outcome2?.odd)}
        ${renderOutcomeButton(match, "total_over", totalOver?.odd, "Б")}
        ${renderOutcomeValue(totalValue)}
        ${renderOutcomeButton(match, "total_under", totalUnder?.odd, "М")}
        ${renderOutcomeButton(match, "fora_one", fora1?.odd, "1")}
        ${renderOutcomeValue(foraValue)}
        ${renderOutcomeButton(match, "fora_two", fora2?.odd, "2")}
      </div>
    </div>
  `;
}

function renderOutcomeButton(match, outcomeKey, odd, displayLabel = null) {
  if (!odd || odd === 0) {
    return `<div class="outcome-cell outcome-cell-empty">—</div>`;
  }
  
  const label = displayLabel || outcomeKey;
  const active = state.slip.some(
    (s) => s.matchId === match.id && s.outcomeKey === outcomeKey
  );
  
  return `
    <button
      class="outcome-cell outcome-btn ${active ? "outcome-btn-active" : ""}"
      data-match-id="${match.id}"
      data-outcome-key="${outcomeKey}"
      data-odd="${odd}"
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
  if (!btn) return;
  const matchId = btn.getAttribute("data-match-id");
  const outcomeKey = btn.getAttribute("data-outcome-key");
  const label = btn.getAttribute("data-label") || outcomeKey;
  const odd = Number(btn.getAttribute("data-odd"));
  const match = matches.find((m) => m.id === matchId);
  if (!match || !odd) return;

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
  const displayLabel = labelMap[outcomeKey] || label;

  const existingIdx = state.slip.findIndex(
    (s) => s.matchId === matchId && s.outcomeKey === outcomeKey
  );
  const next = {
    matchId: match.id,
    outcomeKey,
    label: displayLabel,
    odd,
    home: match.home,
    away: match.away,
    leagueName: match.leagueName
  };
  if (existingIdx >= 0) {
    state.slip.splice(existingIdx, 1); // Remove if clicking same
  } else {
    state.slip.unshift(next);
  }
  renderMatches();
  renderSlip();
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
  document
    .getElementById("matches-list")
    .addEventListener("click", handleOddsClick);
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
}

window.addEventListener("DOMContentLoaded", () => {
  init();
  loadMatches();
});

