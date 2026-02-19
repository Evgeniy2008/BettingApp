const users = [
  {
    id: "u1",
    tg: "@player_one",
    createdAt: "2026-02-12",
    balance: 0,
    creditLimit: 250,
    totalStaked: 185
  },
  {
    id: "u2",
    tg: "@highroller",
    createdAt: "2026-02-01",
    balance: 0,
    creditLimit: 1000,
    totalStaked: 1720
  },
  {
    id: "u3",
    tg: "@newbie",
    createdAt: "2026-02-18",
    balance: 0,
    creditLimit: 50,
    totalStaked: 10
  }
];

const payouts = [
  {
    id: "p1",
    userId: "u2",
    userTg: "@highroller",
    amount: 220,
    currency: "USDT",
    address: "TXvQ...demo...p9",
    status: "pending",
    createdAt: "2026-02-19 13:04"
  },
  {
    id: "p2",
    userId: "u1",
    userTg: "@player_one",
    amount: 45,
    currency: "BTC",
    address: "bc1q...demo...9k",
    status: "pending",
    createdAt: "2026-02-19 10:20"
  }
];

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.getAttribute("data-tab");
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("tab-active"));
      tab.classList.add("tab-active");

      document.querySelectorAll(".page").forEach((page) => {
        const pn = page.getAttribute("data-page");
        page.classList.toggle("page-hidden", pn !== name);
      });
    });
  });
}

function renderDashboard() {
  document.getElementById("stat-users").textContent = String(users.length);
  const totalStaked = users.reduce((acc, u) => acc + u.totalStaked, 0);
  document.getElementById("stat-staked").textContent = "€" + totalStaked;
  const pending = payouts.filter((p) => p.status === "pending").length;
  document.getElementById("stat-pending").textContent = String(pending);
}

function renderUsers(filter) {
  const root = document.getElementById("users-table");
  const q = (filter || "").trim().toLowerCase();
  const list = users.filter(
    (u) => !q || u.tg.toLowerCase().includes(q) || u.id.toLowerCase().includes(q)
  );

  const header = `
    <div class="table-header">
      <div>ID</div>
      <div>Telegram</div>
      <div>Created</div>
      <div style="text-align:right">Total staked</div>
      <div style="text-align:right">Credit limit</div>
      <div></div>
      <div></div>
    </div>
  `;

  const rows = list
    .map(
      (u) => `
      <div class="table-row" data-user-id="${u.id}">
        <div class="mono">${u.id}</div>
        <div>${u.tg}</div>
        <div>${u.createdAt}</div>
        <div style="text-align:right">€${u.totalStaked}</div>
        <div style="text-align:right">€<span class="user-limit">${u.creditLimit}</span></div>
        <div style="text-align:right">
          <button class="small-btn" data-edit="${u.id}">Edit</button>
        </div>
        <div></div>
      </div>
    `
    )
    .join("");

  root.innerHTML = header + rows;
}

function renderPayouts(filter) {
  const root = document.getElementById("payouts-table");
  const q = (filter || "").trim().toLowerCase();
  const list = payouts.filter(
    (p) =>
      !q ||
      p.userTg.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.currency.toLowerCase().includes(q)
  );

  const header = `
    <div class="table-header">
      <div>ID</div>
      <div>User</div>
      <div style="text-align:right">Amount</div>
      <div>Currency</div>
      <div>Address</div>
      <div>Status</div>
      <div style="text-align:right">Action</div>
    </div>
  `;

  const rows = list
    .map((p) => {
      const badgeClass =
        p.status === "pending"
          ? "badge badge-pending"
          : p.status === "approved"
          ? "badge badge-approved"
          : "badge badge-rejected";
      return `
      <div class="table-row" data-payout-id="${p.id}">
        <div class="mono">${p.id}</div>
        <div>${p.userTg}</div>
        <div style="text-align:right">€${p.amount}</div>
        <div>${p.currency}</div>
        <div class="mono">${p.address}</div>
        <div><span class="${badgeClass}">${p.status}</span></div>
        <div style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
          <button class="small-btn" data-reject="${p.id}" ${
            p.status !== "pending" ? "disabled" : ""
          }>Reject</button>
          <button class="small-btn primary" data-approve="${p.id}" ${
            p.status !== "pending" ? "disabled" : ""
          }>Approve</button>
        </div>
      </div>
    `;
    })
    .join("");

  root.innerHTML = header + rows;

  const pending = payouts.filter((p) => p.status === "pending").length;
  const approved = payouts.filter((p) => p.status === "approved").length;
  const rejected = payouts.filter((p) => p.status === "rejected").length;

  document.getElementById("pstat-pending").textContent = String(pending);
  document.getElementById("pstat-approved").textContent = String(approved);
  document.getElementById("pstat-rejected").textContent = String(rejected);
}

function initUsers() {
  renderUsers("");
  document
    .getElementById("users-search")
    .addEventListener("input", (e) => renderUsers(e.target.value));

  document.getElementById("users-table").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-edit]");
    if (!btn) return;
    const id = btn.getAttribute("data-edit");
    const user = users.find((u) => u.id === id);
    if (!user) return;

    const value = prompt(
      `Новый кредитный лимит для ${user.tg} (сейчас €${user.creditLimit})`,
      String(user.creditLimit)
    );
    if (!value) return;
    const num = Number(value);
    if (Number.isNaN(num) || num < 0) return;
    user.creditLimit = num;
    renderUsers(document.getElementById("users-search").value);
  });
}

function initPayouts() {
  renderPayouts("");
  document
    .getElementById("payouts-search")
    .addEventListener("input", (e) => renderPayouts(e.target.value));

  document.getElementById("payouts-table").addEventListener("click", (e) => {
    const approve = e.target.closest("[data-approve]");
    const reject = e.target.closest("[data-reject]");
    if (!approve && !reject) return;
    const id = (approve || reject).getAttribute(
      approve ? "data-approve" : "data-reject"
    );
    const payout = payouts.find((p) => p.id === id);
    if (!payout || payout.status !== "pending") return;

    payout.status = approve ? "approved" : "rejected";
    renderPayouts(document.getElementById("payouts-search").value);
  });
}

function init() {
  initTabs();
  renderDashboard();
  initUsers();
  initPayouts();
}

window.addEventListener("DOMContentLoaded", init);

