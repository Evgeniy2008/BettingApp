const PHP_API_BASE = "/api";

let isAuthenticated = false;

// Функции для показа уведомлений через SweetAlert2
function showAlert(title, text, icon = 'info') {
  return Swal.fire({
    title: title,
    text: text,
    icon: icon,
    confirmButtonText: 'OK',
    confirmButtonColor: '#22c55e'
  });
}

function showSuccess(title, text) {
  return showAlert(title, text, 'success');
}

function showError(title, text) {
  return showAlert(title, text, 'error');
}

function showWarning(title, text) {
  return showAlert(title, text, 'warning');
}

async function showPrompt(title, text, defaultValue = '') {
  const result = await Swal.fire({
    title: title,
    text: text,
    input: 'text',
    inputValue: defaultValue,
    showCancelButton: true,
    confirmButtonText: 'OK',
    cancelButtonText: 'Отмена',
    confirmButtonColor: '#22c55e',
    cancelButtonColor: '#ef4444'
  });
  return result.isConfirmed ? result.value : null;
}

// Получение токена для запросов
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // Пробуем получить токен из localStorage
  const token = localStorage.getItem('admin_token');
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
  }
  
  return headers;
}

// Check authentication on load
async function checkAuth() {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=stats`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    
    if (response.ok) {
      isAuthenticated = true;
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('admin-tabs').style.display = 'flex';
      init();
    } else {
      showLogin();
    }
  } catch (err) {
    showLogin();
  }
}

function showLogin() {
  isAuthenticated = false;
  document.getElementById('login-modal').style.display = 'flex';
  document.getElementById('admin-tabs').style.display = 'none';
}

async function login() {
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  
  if (!password) {
    errorEl.textContent = 'Введите пароль';
    errorEl.style.display = 'block';
    return;
  }
  
  // Показываем загрузку
  const btnLogin = document.getElementById('btn-login');
  const originalText = btnLogin.textContent;
  btnLogin.disabled = true;
  btnLogin.textContent = 'Вход...';
  errorEl.style.display = 'none';
  
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    console.log('Login response:', data); // Отладка
    
    if (data.success) {
      // Сохраняем токен в localStorage на случай проблем с cookies
      if (data.token) {
        localStorage.setItem('admin_token', data.token);
      }
      
      isAuthenticated = true;
      document.getElementById('login-modal').style.display = 'none';
      document.getElementById('admin-tabs').style.display = 'flex';
      document.getElementById('login-password').value = '';
      errorEl.style.display = 'none';
      init();
    } else {
      errorEl.textContent = data.error || 'Неверный пароль';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err); // Отладка
    errorEl.textContent = 'Ошибка подключения: ' + err.message;
    errorEl.style.display = 'block';
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = originalText;
  }
}

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
      
      // Load data when switching tabs
      if (name === 'dashboard') {
        loadDashboard();
      } else if (name === 'users') {
        loadUsers();
      } else if (name === 'deposits') {
        loadDeposits();
      } else if (name === 'payouts') {
        loadPayouts();
      } else if (name === 'credits') {
        loadCreditRequests();
      } else if (name === 'settings') {
        loadSettings();
      }
    });
  });
}

async function loadDashboard() {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=stats`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      document.getElementById("stat-users").textContent = String(data.stats.users);
      document.getElementById("stat-staked").textContent = data.stats.total_staked.toFixed(2);
      document.getElementById("stat-pending").textContent = String(data.stats.pending_withdrawals + data.stats.pending_deposits);
    }
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

async function loadUsers() {
  try {
    const search = document.getElementById("users-search")?.value || '';
    const url = `${PHP_API_BASE}/admin.php?action=users${search ? '&search=' + encodeURIComponent(search) : ''}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      renderUsers(data.users);
    }
  } catch (err) {
    console.error('Failed to load users:', err);
  }
}

function renderUsers(users) {
  const root = document.getElementById("users-table");
  if (!root) return;

  const header = `
    <div class="table-header">
      <div>ID</div>
      <div>Telegram</div>
      <div>Created</div>
      <div style="text-align:right">Balance</div>
      <div style="text-align:right">Total staked</div>
      <div style="text-align:right">Credit limit</div>
      <div></div>
      <div></div>
    </div>
  `;

  const rows = users
    .map(
      (u) => `
      <div class="table-row" data-user-id="${u.id}">
        <div class="mono">${u.id}</div>
        <div>${u.telegram_username || 'N/A'}</div>
        <div>${new Date(u.created_at).toLocaleDateString('ru-RU')}</div>
        <div style="text-align:right">${u.balance.toFixed(2)}</div>
        <div style="text-align:right">${u.total_staked.toFixed(2)}</div>
        <div style="text-align:right"><span class="user-limit">${u.credit_limit.toFixed(2)}</span></div>
        <div style="text-align:right">
          <button class="small-btn" data-edit="${u.id}">Edit</button>
        </div>
        <div></div>
      </div>
    `
    )
    .join("");

  root.innerHTML = header + rows;
  
  // Add edit handlers
  root.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const userId = parseInt(btn.getAttribute("data-edit"));
      const user = users.find(u => u.id === userId);
      if (!user) return;

      const value = await showPrompt(
        'Изменить кредитный лимит',
        `Новый кредитный лимит для ${user.telegram_username} (сейчас ${user.credit_limit.toFixed(2)})`,
        String(user.credit_limit)
      );
      if (!value) return;
      const num = parseFloat(value);
      if (Number.isNaN(num) || num < 0) {
        showError('Ошибка', 'Неверное значение');
        return;
      }
      
      updateUserLimit(userId, num);
    });
  });
}

async function updateUserLimit(userId, creditLimit) {
  try {
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=update-limit`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ user_id: userId, credit_limit: creditLimit }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      loadUsers();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка обновления: ' + err.message);
  }
}

async function loadDeposits() {
  try {
    const search = document.getElementById("deposits-search")?.value || '';
    const url = `${PHP_API_BASE}/admin.php?action=deposits${search ? '&search=' + encodeURIComponent(search) : ''}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      renderDeposits(data.deposits);
    }
  } catch (err) {
    console.error('Failed to load deposits:', err);
  }
}

function renderDeposits(deposits) {
  const root = document.getElementById("deposits-table");
  if (!root) return;

  const header = `
    <div class="table-header">
      <div>ID</div>
      <div>User</div>
      <div style="text-align:right">Amount</div>
      <div>Currency</div>
      <div>Hash</div>
      <div>Status</div>
      <div style="text-align:right">Action</div>
    </div>
  `;

  const rows = deposits
    .map((d) => {
      const badgeClass =
        d.status === "pending"
          ? "badge badge-pending"
          : d.status === "approved"
          ? "badge badge-approved"
          : "badge badge-rejected";
      return `
      <div class="table-row" data-deposit-id="${d.id}">
        <div class="mono">${d.id}</div>
        <div>${d.user_tg}</div>
        <div style="text-align:right">${d.amount.toFixed(2)}</div>
        <div>${d.currency || 'USDT'}</div>
        <div class="mono" style="font-size: 10px;">${d.transaction_hash}</div>
        <div><span class="${badgeClass}">${d.status}</span></div>
        <div style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
          <button class="small-btn" data-reject-deposit="${d.id}" ${
            d.status !== "pending" ? "disabled" : ""
          }>Reject</button>
          <button class="small-btn primary" data-approve-deposit="${d.id}" ${
            d.status !== "pending" ? "disabled" : ""
          }>Approve</button>
        </div>
      </div>
    `;
    })
    .join("");

  root.innerHTML = header + rows;

  const pending = deposits.filter((d) => d.status === "pending").length;
  const approved = deposits.filter((d) => d.status === "approved").length;
  const rejected = deposits.filter((d) => d.status === "rejected").length;

  document.getElementById("dstat-pending").textContent = String(pending);
  document.getElementById("dstat-approved").textContent = String(approved);
  document.getElementById("dstat-rejected").textContent = String(rejected);
  
  // Add handlers
  root.querySelectorAll("[data-approve-deposit]").forEach(btn => {
    btn.addEventListener('click', () => {
      const depositId = parseInt(btn.getAttribute("data-approve-deposit"));
      processDeposit(depositId, 'approve');
    });
  });
  
  root.querySelectorAll("[data-reject-deposit]").forEach(btn => {
    btn.addEventListener('click', () => {
      const depositId = parseInt(btn.getAttribute("data-reject-deposit"));
      processDeposit(depositId, 'reject');
    });
  });
}

async function processDeposit(depositId, action) {
  try {
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=process-deposit`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ deposit_id: depositId, action }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      loadDeposits();
      loadDashboard();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка обработки: ' + err.message);
  }
}

async function loadPayouts() {
  try {
    const search = document.getElementById("payouts-search")?.value || '';
    const url = `${PHP_API_BASE}/admin.php?action=withdrawals${search ? '&search=' + encodeURIComponent(search) : ''}`;
    const response = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      renderPayouts(data.withdrawals);
    }
  } catch (err) {
    console.error('Failed to load payouts:', err);
  }
}

function renderPayouts(payouts) {
  const root = document.getElementById("payouts-table");
  if (!root) return;

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

  const rows = payouts
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
        <div>${p.user_tg}</div>
        <div style="text-align:right">${p.amount.toFixed(2)}</div>
        <div>${p.currency}</div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="mono" style="font-size: 10px; flex:1;">${p.wallet_address}</span>
          <button class="small-btn" data-copy-wallet="${p.id}" title="Копировать адрес" style="padding: 4px 8px; font-size: 10px; min-width: auto;">📋</button>
        </div>
        <div><span class="${badgeClass}">${p.status}</span></div>
        <div style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
          <button class="small-btn" data-reject-payout="${p.id}" ${
            p.status !== "pending" ? "disabled" : ""
          }>Reject</button>
          <button class="small-btn primary" data-approve-payout="${p.id}" ${
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
  
  // Add handlers
  root.querySelectorAll("[data-approve-payout]").forEach(btn => {
    btn.addEventListener('click', () => {
      const payoutId = parseInt(btn.getAttribute("data-approve-payout"));
      processPayout(payoutId, 'approve');
    });
  });
  
  root.querySelectorAll("[data-reject-payout]").forEach(btn => {
    btn.addEventListener('click', () => {
      const payoutId = parseInt(btn.getAttribute("data-reject-payout"));
      processPayout(payoutId, 'reject');
    });
  });
  
  // Add copy wallet handlers
  root.querySelectorAll("[data-copy-wallet]").forEach(btn => {
    btn.addEventListener('click', () => {
      const payoutId = parseInt(btn.getAttribute("data-copy-wallet"));
      const payout = payouts.find(p => p.id === payoutId);
      if (payout && payout.wallet_address) {
        copyWalletAddress(payout.wallet_address, btn);
      }
    });
  });
}

function copyWalletAddress(address, button) {
  const cleanAddress = String(address || '').trim();
  
  if (!cleanAddress) {
    showError('Ошибка', 'Адрес кошелька недоступен');
    return;
  }
  
  // Пробуем использовать современный API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanAddress).then(() => {
      const originalText = button.textContent;
      button.textContent = '✓';
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 2000);
      showSuccess('Скопировано', 'Адрес кошелька скопирован в буфер обмена');
    }).catch((err) => {
      console.error('Clipboard API failed:', err);
      fallbackCopyWallet(cleanAddress, button);
    });
  } else {
    fallbackCopyWallet(cleanAddress, button);
  }
}

function fallbackCopyWallet(text, button) {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (successful) {
      const originalText = button.textContent;
      button.textContent = '✓';
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 2000);
      showSuccess('Скопировано', 'Адрес кошелька скопирован в буфер обмена');
    } else {
      showError('Ошибка', 'Не удалось скопировать адрес. Скопируйте вручную: ' + text);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showError('Ошибка', 'Не удалось скопировать адрес. Скопируйте вручную: ' + text);
  }
}

async function processPayout(payoutId, action) {
  try {
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=process-withdrawal`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ withdrawal_id: payoutId, action }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      loadPayouts();
      loadDashboard();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка обработки: ' + err.message);
  }
}

async function loadCreditRequests() {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=credit-requests`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (!data.success) {
      console.error('Failed to load credit requests:', data.error);
      return;
    }
    
    const requests = data.requests || [];
    const root = document.getElementById("credits-table");
    if (!root) return;
    
    const header = `
      <div class="table-header">
        <div>ID</div>
        <div>User</div>
        <div style="text-align:right">Current Limit</div>
        <div style="text-align:right">Current Debt</div>
        <div style="text-align:right">Requested</div>
        <div>Status</div>
        <div style="text-align:right">Actions</div>
      </div>
    `;
    
    const rows = requests
      .map((r) => {
        const badgeClass =
          r.status === "pending"
            ? "badge badge-pending"
            : r.status === "approved"
            ? "badge badge-approved"
            : "badge badge-rejected";
        return `
      <div class="table-row" data-credit-id="${r.id}">
        <div class="mono">${r.id}</div>
        <div>${r.telegram_username}</div>
        <div style="text-align:right">${r.current_limit.toFixed(2)}</div>
        <div style="text-align:right">${r.current_debt.toFixed(2)}</div>
        <div style="text-align:right">${r.requested_limit.toFixed(2)}</div>
        <div><span class="${badgeClass}">${r.status}</span></div>
        <div style="text-align:right; display:flex; gap:4px; justify-content:flex-end;">
          <button class="small-btn" data-reject-credit="${r.id}" ${
            r.status !== "pending" ? "disabled" : ""
          }>Reject</button>
          <button class="small-btn primary" data-approve-credit="${r.id}" ${
            r.status !== "pending" ? "disabled" : ""
          }>Approve</button>
        </div>
      </div>
    `;
      })
      .join("");
    
    root.innerHTML = header + rows;
    
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    
    document.getElementById("cstat-pending").textContent = String(pending);
    document.getElementById("cstat-approved").textContent = String(approved);
    document.getElementById("cstat-rejected").textContent = String(rejected);
    
    // Add handlers
    root.querySelectorAll("[data-approve-credit]").forEach(btn => {
      btn.addEventListener('click', () => {
        const requestId = parseInt(btn.getAttribute("data-approve-credit"));
        processCreditRequest(requestId, 'approve');
      });
    });
    
    root.querySelectorAll("[data-reject-credit]").forEach(btn => {
      btn.addEventListener('click', () => {
        const requestId = parseInt(btn.getAttribute("data-reject-credit"));
        processCreditRequest(requestId, 'reject');
      });
    });
  } catch (err) {
    console.error('Failed to load credit requests:', err);
  }
}

async function processCreditRequest(requestId, action) {
  try {
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=process-credit-request`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ request_id: requestId, action, notes: '' }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      loadCreditRequests();
      loadUsers();
      loadDashboard();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка обработки: ' + err.message);
  }
}

async function loadSettings() {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=wallets`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success && data.wallets) {
      document.getElementById('wallet-usdt').value = data.wallets.usdt || '';
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveWallets() {
  try {
    const usdtInput = document.getElementById('wallet-usdt');
    if (!usdtInput) {
      showError('Ошибка', 'Поле кошелька не найдено');
      return;
    }
    
    const usdt = usdtInput.value.trim();
    
    if (!usdt) {
      showWarning('Ошибка', 'Введите адрес кошелька USDT');
      return;
    }
    
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=update-wallets`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ usdt }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      showSuccess('Успешно', 'Кошелек USDT сохранен');
      // Перезагружаем настройки для подтверждения
      loadSettings();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка сохранения: ' + err.message);
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  
  if (!oldPassword || !newPassword) {
    showWarning('Ошибка', 'Заполните все поля');
    return;
  }
  
  if (newPassword.length < 1) {
    showWarning('Ошибка', 'Пароль не может быть пустым');
    return;
  }
  
  try {
    const headers = getAuthHeaders();
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=change-password`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      showSuccess('Успешно', 'Пароль изменен');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    alert('Ошибка изменения пароля: ' + err.message);
  }
}

function init() {
  if (!isAuthenticated) return;
  
  initTabs();
  loadDashboard();
  loadUsers();
  loadDeposits();
  loadPayouts();
  loadSettings();
  
  // Search handlers
  const usersSearch = document.getElementById("users-search");
  if (usersSearch) {
    let timeout;
    usersSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadUsers, 300);
    });
  }
  
  const depositsSearch = document.getElementById("deposits-search");
  if (depositsSearch) {
    let timeout;
    depositsSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadDeposits, 300);
    });
  }
  
  const payoutsSearch = document.getElementById("payouts-search");
  if (payoutsSearch) {
    let timeout;
    payoutsSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadPayouts, 300);
    });
  }
  
  // Settings handlers
  const btnSaveWallets = document.getElementById('btn-save-wallets');
  if (btnSaveWallets) {
    btnSaveWallets.addEventListener('click', saveWallets);
  }
  
  const btnChangePassword = document.getElementById('btn-change-password');
  if (btnChangePassword) {
    btnChangePassword.addEventListener('click', changePassword);
  }
}

// Login handler
const btnLogin = document.getElementById('btn-login');
if (btnLogin) {
  btnLogin.addEventListener('click', login);
}

const loginPassword = document.getElementById('login-password');
if (loginPassword) {
  loginPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      login();
    }
  });
}

window.addEventListener("DOMContentLoaded", () => {
  checkAuth();
});
