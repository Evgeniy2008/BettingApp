const leagues = [
  { id: "int-afc-u23", country: "🌏", name: "AFC U23 Asian Cup" },
  { id: "al-1", country: "🇦🇱", name: "Albania - Kategoria e Pare" },
  { id: "al-2", country: "🇦🇱", name: "Albania - Kategoria Superiore" },
  { id: "dz-1", country: "🇩🇿", name: "Algeria - Ligue 1" },
  { id: "ar-cup", country: "🇦🇷", name: "Argentina - Copa Argentina" },
  { id: "au-aleague", country: "🇦🇺", name: "Australia - A-League" },
  { id: "at-bundes", country: "🇦🇹", name: "Austria - Bundesliga" },
  { id: "az-prem", country: "🇦🇿", name: "Azerbaijan - Premier League" }
];

const matches = [
  {
    id: "m1",
    leagueId: "at-bundes",
    leagueName: "Austria - Bundesliga",
    time: "Сегодня, 20:30",
    home: "Rapid Wien",
    away: "Sturm Graz",
    odds: { homeWin: 2.25, draw: 3.2, awayWin: 3.05 }
  },
  {
    id: "m2",
    leagueId: "au-aleague",
    leagueName: "Australia - A-League",
    time: "Сегодня, 12:10",
    home: "Sydney FC",
    away: "Melbourne City",
    odds: { homeWin: 2.05, draw: 3.55, awayWin: 3.3 }
  },
  {
    id: "m3",
    leagueId: "dz-1",
    leagueName: "Algeria - Ligue 1",
    time: "LIVE",
    home: "CR Belouizdad",
    away: "USM Alger",
    odds: { homeWin: 2.9, draw: 2.85, awayWin: 2.65 }
  },
  {
    id: "m4",
    leagueId: "ar-cup",
    leagueName: "Argentina - Copa Argentina",
    time: "Завтра, 01:00",
    home: "Lanús",
    away: "Belgrano",
    odds: { homeWin: 2.55, draw: 3.0, awayWin: 2.95 }
  }
];

const state = {
  activeTab: "sportsbook",
  activeLeagueId: "all",
  slip: [],
  stake: 0
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
      </button>
    `
    )
    .join("");

  document.getElementById("all-matches-count").textContent = matches.length;
}

function renderMatches() {
  const root = document.getElementById("matches-list");
  const ms =
    state.activeLeagueId === "all"
      ? matches
      : matches.filter((m) => m.leagueId === state.activeLeagueId);

  root.innerHTML = ms
    .map(
      (m) => `
      <div class="match" data-match-id="${m.id}">
        <div class="match-info">
          <div class="match-league">${m.leagueName}</div>
          <div class="match-title">${m.home} <span style="opacity:.7">vs</span> ${
        m.away
      }</div>
          <div class="match-time">
            <span class="pill" style="${
              m.time === "LIVE"
                ? "border-color:rgba(248,113,113,.7);color:#f97373;"
                : ""
            }">${m.time}</span>
          </div>
        </div>
        <div class="odds">
          ${renderOddButton(m, "1", m.odds.homeWin)}
          ${renderOddButton(m, "X", m.odds.draw)}
          ${renderOddButton(m, "2", m.odds.awayWin)}
        </div>
      </div>
    `
    )
    .join("");
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
              s.label
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
  document
    .querySelectorAll(".league-item")
    .forEach((it) => it.classList.remove("league-item-active"));
  btn.classList.add("league-item-active");
  renderMatches();
}

function handleOddsClick(e) {
  const btn = e.target.closest(".odd-btn");
  if (!btn) return;
  const matchId = btn.getAttribute("data-match-id");
  const label = btn.getAttribute("data-label");
  const odd = Number(btn.getAttribute("data-odd"));
  const match = matches.find((m) => m.id === matchId);
  if (!match || !label) return;

  const existingIdx = state.slip.findIndex((s) => s.matchId === matchId);
  const next = {
    matchId: match.id,
    label,
    odd,
    home: match.home,
    away: match.away,
    leagueName: match.leagueName
  };
  if (existingIdx >= 0) {
    state.slip[existingIdx] = next;
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

window.addEventListener("DOMContentLoaded", init);

