const PHP_API_BASE = "/api";

let isAuthenticated = false;

// Functions for showing notifications via SweetAlert2
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
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#22c55e',
    cancelButtonColor: '#ef4444'
  });
  return result.isConfirmed ? result.value : null;
}

// Get token for requests
function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  // Try to get token from localStorage
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
    errorEl.textContent = 'Enter password';
    errorEl.style.display = 'block';
    return;
  }
  
  // Show loading
  const btnLogin = document.getElementById('btn-login');
  const originalText = btnLogin.textContent;
  btnLogin.disabled = true;
  btnLogin.textContent = 'Logging in...';
  errorEl.style.display = 'none';
  
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
      credentials: 'include'
    });
    
    const data = await response.json();
    
    console.log('Login response:', data); // Debug
    
    if (data.success) {
      // Save token to localStorage in case of cookie issues
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
      errorEl.textContent = data.error || 'Invalid password';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    console.error('Login error:', err); // Debug
    errorEl.textContent = 'Connection error: ' + err.message;
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
      } else if (name === 'bets') {
        loadBets();
      } else if (name === 'credits') {
        loadCreditRequests();
      } else if (name === 'settings') {
        loadSettings();
      } else if (name === 'support') {
        initSupportChat();
        // Stop polling when leaving support tab
        if (chatPollInterval) {
          clearInterval(chatPollInterval);
          chatPollInterval = null;
        }
        selectedUserId = null;
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
        <div>${new Date(u.created_at).toLocaleDateString('en-US')}</div>
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
        'Change Credit Limit',
        `New credit limit for ${user.telegram_username} (current: ${user.credit_limit.toFixed(2)})`,
        String(user.credit_limit)
      );
      if (!value) return;
      const num = parseFloat(value);
      if (Number.isNaN(num) || num < 0) {
        showError('Error', 'Invalid value');
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
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Update error: ' + err.message);
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
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Processing error: ' + err.message);
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
          <button class="small-btn" data-copy-wallet="${p.id}" title="Copy address" style="padding: 4px 8px; font-size: 10px; min-width: auto;">📋</button>
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
    showError('Error', 'Wallet address unavailable');
    return;
  }
  
  // Try to use modern API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanAddress).then(() => {
      const originalText = button.textContent;
      button.textContent = '✓';
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 2000);
      showSuccess('Copied', 'Wallet address copied to clipboard');
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
      showSuccess('Copied', 'Wallet address copied to clipboard');
    } else {
      showError('Error', 'Failed to copy address. Copy manually: ' + text);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showError('Error', 'Failed to copy address. Copy manually: ' + text);
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
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Processing error: ' + err.message);
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
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Processing error: ' + err.message);
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
      showError('Error', 'Wallet field not found');
      return;
    }
    
    const usdt = usdtInput.value.trim();
    
    if (!usdt) {
      showWarning('Error', 'Enter USDT wallet address');
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
      showSuccess('Success', 'USDT wallet saved');
      // Reload settings for confirmation
      loadSettings();
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Save error: ' + err.message);
  }
}

async function changePassword() {
  const oldPassword = document.getElementById('old-password').value;
  const newPassword = document.getElementById('new-password').value;
  
  if (!oldPassword || !newPassword) {
    showWarning('Error', 'Fill in all fields');
    return;
  }
  
  if (newPassword.length < 1) {
    showWarning('Error', 'Password cannot be empty');
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
      showSuccess('Success', 'Password changed');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    alert('Password change error: ' + err.message);
  }
}

async function loadBets() {
  try {
    const search = document.getElementById("bets-search")?.value || '';
    const status = document.getElementById("bets-status-filter")?.value || '';
    let url = `${PHP_API_BASE}/admin.php?action=bets`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    if (status) url += `&status=${encodeURIComponent(status)}`;
    
    const response = await fetch(url, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (data.success) {
      renderBets(data.bets);
      updateBetsStats(data.bets);
    }
  } catch (err) {
    console.error('Failed to load bets:', err);
  }
}

function renderBets(bets) {
  const root = document.getElementById("bets-table");
  if (!root) return;

  const header = `
    <div class="table-header">
      <div>Bet ID</div>
      <div>User</div>
      <div>Match(es)</div>
      <div>Outcome</div>
      <div style="text-align:right">Stake</div>
      <div style="text-align:right">Potential Win</div>
      <div>Status</div>
      <div style="text-align:right">Actions</div>
    </div>
  `;

  const rows = bets
    .map((bet) => {
      const statusClass = `status-${bet.status}`;
      
      // Check if bet is express
      const isExpress = bet.bet_details && typeof bet.bet_details === 'string' 
        ? JSON.parse(bet.bet_details).length > 1
        : (bet.bet_details && Array.isArray(bet.bet_details) && bet.bet_details.length > 1);
      
      let matchText = `${bet.match.home} vs ${bet.match.away}`;
      let outcomeText = `${bet.outcome.label} @ ${bet.outcome.odd}`;
      
      // If express, show number of matches
      if (isExpress) {
        const betDetails = typeof bet.bet_details === 'string' 
          ? JSON.parse(bet.bet_details) 
          : bet.bet_details;
        const matchCount = betDetails ? betDetails.length : 1;
        matchText = `Express (${matchCount} matches)`;
        outcomeText = `Total: ${bet.outcome.odd.toFixed(2)}`;
      }
      
      return `
        <div class="table-row ${isExpress ? 'table-row-express' : ''}" data-bet-id="${bet.bet_id}">
          <div class="mono" style="font-size: 9px;">${bet.bet_id}${isExpress ? ' <span style="color: #fbbf24;">EX</span>' : ''}</div>
          <div style="font-size: 10px;">${bet.user_tg || 'N/A'}</div>
          <div style="font-size: 9px;" title="${matchText}">${matchText}</div>
          <div style="font-size: 9px;">${outcomeText}</div>
          <div style="text-align:right; font-weight: 600; font-size: 10px;">${bet.stake.toFixed(2)}</div>
          <div style="text-align:right; font-weight: 600; color: #22c55e; font-size: 10px;">${bet.potential_win.toFixed(2)}</div>
          <div><span class="status-badge ${statusClass}" style="font-size: 9px; padding: 2px 6px;">${bet.status}</span></div>
          <div style="text-align:right; display: flex; gap: 2px; justify-content: flex-end; flex-wrap: wrap;">
            <button class="small-btn" data-view="${bet.bet_id}" style="font-size: 9px; padding: 4px 8px;">View</button>
            <button class="small-btn primary" data-edit="${bet.bet_id}" style="font-size: 9px; padding: 4px 8px;">Edit</button>
          </div>
        </div>
      `;
    })
    .join("");

  root.innerHTML = header + rows;

  // Event handlers
  root.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const betId = e.target.getAttribute('data-view');
      showBetDetail(betId);
    });
  });

  root.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const betId = e.target.getAttribute('data-edit');
      editBetStatus(betId);
    });
  });
}

function updateBetsStats(bets) {
  const total = bets.length;
  const pending = bets.filter(b => b.status === 'pending').length;
  const active = bets.filter(b => b.status === 'active').length;
  
  document.getElementById("bstat-total").textContent = String(total);
  document.getElementById("bstat-pending").textContent = String(pending);
  document.getElementById("bstat-active").textContent = String(active);
}

async function showBetDetail(betId) {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=bet-detail&bet_id=${encodeURIComponent(betId)}`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (!data.success) {
      showError('Error', data.error || 'Failed to load bet details');
      return;
    }
    
    const bet = data.bet;
    
    // Check if bet is express
    let betDetails = null;
    let isExpress = false;
    if (bet.bet_details) {
      try {
        betDetails = typeof bet.bet_details === 'string' ? JSON.parse(bet.bet_details) : bet.bet_details;
        isExpress = Array.isArray(betDetails) && betDetails.length > 1;
      } catch (e) {
        console.error('Error parsing bet_details:', e);
      }
    }
    
    // Build HTML for all matches from express
    let matchesHtml = '';
    if (isExpress && betDetails) {
      matchesHtml = '<hr><h4 style="color: #fbbf24; margin-top: 16px;">Express Bet - All Matches:</h4>';
      betDetails.forEach((item, idx) => {
        matchesHtml += `
          <div style="background: rgba(251, 191, 36, 0.1); border-left: 3px solid #fbbf24; padding: 10px; margin: 8px 0; border-radius: 6px;">
            <p style="margin: 4px 0;"><strong>Match ${idx + 1}:</strong> ${item.home || ''} vs ${item.away || ''}</p>
            <p style="margin: 4px 0; font-size: 12px; color: rgba(232, 232, 234, 0.7);">League: ${item.leagueName || 'N/A'}</p>
            <p style="margin: 4px 0; font-size: 12px;"><strong>Bet:</strong> ${item.label || item.outcomeKey || ''} @ ${item.odd || ''}</p>
          </div>
        `;
      });
    }
    
    const details = `
      <div style="text-align: left;">
        <h3>Bet Details ${isExpress ? '<span style="color: #fbbf24; font-size: 14px;">(EXPRESS)</span>' : ''}</h3>
        <p><strong>Bet ID:</strong> <span class="mono">${bet.bet_id}</span></p>
        <p><strong>User:</strong> ${bet.user.telegram_username || bet.user.telegram_id || 'N/A'} (ID: ${bet.user.id})</p>
        <p><strong>Balance:</strong> <span style="color: #22c55e; font-weight: 600;">$${bet.user.balance.toFixed(2)}</span></p>
        <p><strong>Total Staked:</strong> $${bet.user.total_staked.toFixed(2)}</p>
        <hr>
        ${!isExpress ? `
        <p><strong>Match:</strong> ${bet.match.home} vs ${bet.match.away}</p>
        <p><strong>League:</strong> ${bet.match.league || 'N/A'}</p>
        <p><strong>Match ID:</strong> ${bet.match.id}</p>
        <hr>
        ` : ''}
        <p><strong>Outcome:</strong> ${bet.outcome.label}</p>
        <p><strong>Type:</strong> ${bet.outcome.type || 'N/A'}</p>
        ${bet.outcome.value ? `<p><strong>Value:</strong> ${bet.outcome.value}</p>` : ''}
        <p><strong>Total Odd:</strong> <span style="color: #fbbf24; font-weight: 600;">${bet.outcome.odd}</span></p>
        ${matchesHtml}
        <hr>
        <p><strong>Stake:</strong> <span style="color: #3b82f6; font-weight: 600;">$${bet.stake.toFixed(2)}</span></p>
        <p><strong>Potential Win:</strong> <span style="color: #22c55e; font-weight: 600;">$${bet.potential_win.toFixed(2)}</span></p>
        <p><strong>Status:</strong> <span class="status-badge status-${bet.status}">${bet.status}</span></p>
        ${bet.win_amount ? `<p><strong>Win Amount:</strong> <span style="color: #22c55e; font-weight: 600;">$${bet.win_amount.toFixed(2)}</span></p>` : ''}
        <p><strong>Created:</strong> ${new Date(bet.created_at).toLocaleString()}</p>
        ${bet.settled_at ? `<p><strong>Settled:</strong> ${new Date(bet.settled_at).toLocaleString()}</p>` : ''}
        ${bet.cancelled_at ? `<p><strong>Cancelled:</strong> ${new Date(bet.cancelled_at).toLocaleString()}</p>` : ''}
        ${bet.admin_notes ? `<p><strong>Admin Notes:</strong> ${bet.admin_notes}</p>` : ''}
      </div>
    `;
    
    Swal.fire({
      title: 'Bet Details',
      html: details,
      width: '600px',
      confirmButtonText: 'Close',
      confirmButtonColor: '#22c55e'
    });
  } catch (err) {
    showError('Error', 'Loading error: ' + err.message);
  }
}

async function editBetStatus(betId) {
  try {
    // Load current bet data
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=bet-detail&bet_id=${encodeURIComponent(betId)}`, {
      credentials: 'include',
      headers: getAuthHeaders()
    });
    const data = await response.json();
    
    if (!data.success) {
      showError('Error', data.error || 'Failed to load bet');
      return;
    }
    
    const bet = data.bet;
    
    const result = await Swal.fire({
      title: 'Update Bet Status',
      html: `
        <div style="text-align: left;">
          <label>Status:</label>
          <select id="swal-status" class="swal2-input">
            <option value="pending" ${bet.status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="active" ${bet.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="won" ${bet.status === 'won' ? 'selected' : ''}>Won</option>
            <option value="lost" ${bet.status === 'lost' ? 'selected' : ''}>Lost</option>
            <option value="cancelled" ${bet.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            <option value="refunded" ${bet.status === 'refunded' ? 'selected' : ''}>Refunded</option>
          </select>
          <label style="margin-top: 10px;">Win Amount (if won):</label>
          <input type="number" id="swal-win-amount" class="swal2-input" step="0.01" value="${bet.win_amount || bet.potential_win}" />
          <label style="margin-top: 10px;">Admin Notes:</label>
          <textarea id="swal-notes" class="swal2-textarea" placeholder="Optional notes...">${bet.admin_notes || ''}</textarea>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Update',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#22c55e',
      cancelButtonColor: '#ef4444',
      didOpen: () => {
        const statusSelect = document.getElementById('swal-status');
        const winAmountInput = document.getElementById('swal-win-amount');
        
        statusSelect.addEventListener('change', () => {
          if (statusSelect.value === 'won') {
            winAmountInput.style.display = 'block';
            winAmountInput.previousElementSibling.style.display = 'block';
          } else {
            winAmountInput.style.display = 'none';
            winAmountInput.previousElementSibling.style.display = 'none';
          }
        });
        
        if (statusSelect.value !== 'won') {
          winAmountInput.style.display = 'none';
          winAmountInput.previousElementSibling.style.display = 'none';
        }
      },
      preConfirm: () => {
        const status = document.getElementById('swal-status').value;
        const winAmount = document.getElementById('swal-win-amount').value;
        const notes = document.getElementById('swal-notes').value;
        
        return {
          status,
          win_amount: status === 'won' ? parseFloat(winAmount) : null,
          notes: notes.trim()
        };
      }
    });
    
    if (result.isConfirmed) {
      await updateBetStatus(betId, result.value);
    }
  } catch (err) {
    showError('Error', 'Error: ' + err.message);
  }
}

async function updateBetStatus(betId, data) {
  try {
    const response = await fetch(`${PHP_API_BASE}/admin.php?action=update-bet-status`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        bet_id: betId,
        status: data.status,
        win_amount: data.win_amount,
        notes: data.notes
      }),
      credentials: 'include'
    });
    
    const result = await response.json();
    if (result.success) {
      showSuccess('Success', 'Bet status updated');
      loadBets();
      loadDashboard();
    } else {
      showError('Error', result.error || 'Failed to update status');
    }
  } catch (err) {
    showError('Error', 'Update error: ' + err.message);
  }
}

let selectedUserId = null;
let chatPollInterval = null;
let lastAdminMessageId = 0;

function init() {
  if (!isAuthenticated) return;
  
  initTabs();
  loadDashboard();
  loadUsers();
  loadDeposits();
  loadPayouts();
  loadSettings();
  initSupportChat();
  
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
  
  const betsSearch = document.getElementById("bets-search");
  if (betsSearch) {
    let timeout;
    betsSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadBets, 300);
    });
  }
  
  const betsStatusFilter = document.getElementById("bets-status-filter");
  
  // Support chat handlers
  const supportUsersSearch = document.getElementById("support-users-search");
  if (supportUsersSearch) {
    let timeout;
    supportUsersSearch.addEventListener("input", () => {
      clearTimeout(timeout);
      timeout = setTimeout(loadSupportUsers, 300);
    });
  }
  
  const supportChatInput = document.getElementById("support-chat-input");
  const supportChatSend = document.getElementById("support-chat-send");
  
  if (supportChatSend) {
    supportChatSend.addEventListener("click", sendSupportMessage);
  }
  
  if (supportChatInput) {
    supportChatInput.addEventListener("keypress", (e) => {
      if (e.key === 'Enter') {
        sendSupportMessage();
      }
    });
  }
  if (betsStatusFilter) {
    betsStatusFilter.addEventListener("change", () => {
      loadBets();
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

// Support Chat Functions
function initSupportChat() {
  loadSupportUsers();
  
  // Search handler
  const searchInput = document.getElementById('support-users-search');
  searchInput?.addEventListener('input', () => {
    loadSupportUsers();
  });
  
  // Send message handler
  const sendBtn = document.getElementById('support-chat-send');
  const chatInput = document.getElementById('support-chat-input');
  
  sendBtn?.addEventListener('click', sendSupportMessage);
  chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendSupportMessage();
    }
  });
}

async function loadSupportUsers() {
  const usersList = document.getElementById('support-users-list');
  if (!usersList) return;
  
  try {
    const res = await fetch(`${PHP_API_BASE}/chat-admin.php`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    const data = await res.json();
    
    if (data.ok && data.users) {
      const searchQuery = (document.getElementById('support-users-search')?.value || '').toLowerCase();
      const filteredUsers = data.users.filter(user => {
        if (!searchQuery) return true;
        const username = (user.telegram_username || '').toLowerCase();
        const userId = String(user.id || '');
        return username.includes(searchQuery) || userId.includes(searchQuery);
      });
      
      if (filteredUsers.length === 0) {
        usersList.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(232, 232, 234, 0.5);">No users found</div>';
        return;
      }
      
      usersList.innerHTML = filteredUsers.map(user => {
        const isSelected = selectedUserId === user.id;
        const hasOperatorChat = user.has_operator_chat > 0;
        const lastMessage = user.last_message_at ? new Date(user.last_message_at).toLocaleString() : 'No messages';
        const username = user.telegram_username || `User #${user.id}`;
        
        return `
          <div class="admin-chat-user-item ${isSelected ? 'admin-chat-user-item-selected' : ''}" 
               data-user-id="${user.id}" 
               onclick="selectSupportUser(${user.id}, '${username.replace(/'/g, "\\'")}')">
            <div class="admin-chat-user-item-avatar">
              ${username.charAt(0).toUpperCase()}
            </div>
            <div class="admin-chat-user-item-content">
              <div class="admin-chat-user-item-header">
                <div class="admin-chat-user-item-name">${username}</div>
                ${hasOperatorChat ? '<span class="admin-chat-user-item-badge">Active</span>' : ''}
              </div>
              <div class="admin-chat-user-item-meta">
                <span>ID: ${user.id}</span>
                <span>•</span>
                <span>${lastMessage}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      usersList.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(232, 232, 234, 0.5);">No users with chat history</div>';
    }
  } catch (error) {
    console.error('Error loading support users:', error);
    usersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #f97373;">Error loading users</div>';
  }
}

async function selectSupportUser(userId, username) {
  selectedUserId = userId;
  
  // Update UI - highlight selected user
  document.querySelectorAll('.admin-chat-user-item').forEach(item => {
    const itemUserId = parseInt(item.getAttribute('data-user-id'));
    if (itemUserId === userId) {
      item.classList.add('admin-chat-user-item-selected');
    } else {
      item.classList.remove('admin-chat-user-item-selected');
    }
  });
  
  // Update header
  const headerTitle = document.getElementById('support-chat-user-name');
  const headerUserId = document.getElementById('support-chat-user-id');
  const headerStatus = document.getElementById('support-chat-status');
  const backBtn = document.getElementById('support-chat-back');
  const inputWrapper = document.getElementById('support-chat-input-wrapper');
  
  if (headerTitle) {
    headerTitle.textContent = username || `User #${userId}`;
  }
  if (headerUserId) {
    headerUserId.textContent = `ID: ${userId}`;
    headerUserId.style.display = 'block';
  }
  if (headerStatus) {
    headerStatus.style.display = 'inline-flex';
    headerStatus.textContent = 'Admin';
  }
  if (backBtn) backBtn.style.display = 'flex';
  if (inputWrapper) inputWrapper.style.display = 'block';
  
  // Load messages
  await loadChatMessages(userId, true);
  
  // Start polling for new messages (live updates)
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
  }
  chatPollInterval = setInterval(() => {
    if (selectedUserId) {
      loadChatMessages(selectedUserId, false); // Smart update
    }
  }, 2000); // Poll every 2 seconds for live updates
}

// Function to go back to users list
function backToUsersList() {
  selectedUserId = null;
  const headerTitle = document.getElementById('support-chat-user-name');
  const headerUserId = document.getElementById('support-chat-user-id');
  const headerStatus = document.getElementById('support-chat-status');
  const backBtn = document.getElementById('support-chat-back');
  const inputWrapper = document.getElementById('support-chat-input-wrapper');
  const messagesContainer = document.getElementById('support-chat-messages');
  
  if (headerTitle) headerTitle.textContent = 'Select a user to start chatting';
  if (headerUserId) headerUserId.style.display = 'none';
  if (headerStatus) headerStatus.style.display = 'none';
  if (backBtn) backBtn.style.display = 'none';
  if (inputWrapper) inputWrapper.style.display = 'none';
  if (messagesContainer) {
    messagesContainer.innerHTML = '<div class="admin-chat-empty-state"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.3; margin-bottom: 12px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><div>Select a user from the list to view messages</div></div>';
  }
  
  // Clear selection
  document.querySelectorAll('.admin-chat-user-item').forEach(item => {
    item.classList.remove('admin-chat-user-item-selected');
  });
  
  if (chatPollInterval) {
    clearInterval(chatPollInterval);
    chatPollInterval = null;
  }
}

async function loadChatMessages(userId, forceReload = false) {
  const messagesContainer = document.getElementById('support-chat-messages');
  if (!messagesContainer) return;
  
  try {
    const res = await fetch(`${PHP_API_BASE}/chat-admin.php?user_id=${userId}`, {
      method: 'GET',
      headers: getAuthHeaders()
    });
    
    const data = await res.json();
    
    if (data.ok && data.messages) {
      const currentMessageCount = messagesContainer.children.length;
      
      // If force reload or no messages, reload all
      if (forceReload || currentMessageCount === 0 || currentMessageCount === 1) {
        messagesContainer.innerHTML = '';
        lastAdminMessageId = 0;
        
        data.messages.forEach(msg => {
          const isUser = msg.is_from_user === 1 || msg.is_from_user === true;
          const isOperator = msg.is_operator_connected === 1 || msg.is_operator_connected === true;
          const time = new Date(msg.created_at).toLocaleTimeString();
          
          // Admin messages (operator) should be on the right, green
          // User messages should be on the left
          const isAdminMessage = !isUser; // Admin = not from user
          
          const messageDiv = document.createElement('div');
          messageDiv.className = `admin-chat-message ${isAdminMessage ? 'admin-chat-message-admin' : 'admin-chat-message-user'}`;
          messageDiv.innerHTML = `
            <div class="admin-chat-message-bubble">
              <div class="admin-chat-message-text">${escapeHtml(msg.message)}</div>
              <div class="admin-chat-message-time">${time}</div>
            </div>
          `;
          messagesContainer.appendChild(messageDiv);
          
          if (msg.id > lastAdminMessageId) {
            lastAdminMessageId = msg.id;
          }
        });
      } else {
        // Smart update: only add new messages
        const newMessages = data.messages.filter(msg => msg.id > lastAdminMessageId);
        newMessages.forEach(msg => {
          const isUser = msg.is_from_user === 1 || msg.is_from_user === true;
          const isOperator = msg.is_operator_connected === 1 || msg.is_operator_connected === true;
          const time = new Date(msg.created_at).toLocaleTimeString();
          
          // Admin messages (operator) should be on the right, green
          // User messages should be on the left
          const isAdminMessage = !isUser; // Admin = not from user
          
          const messageDiv = document.createElement('div');
          messageDiv.className = `admin-chat-message ${isAdminMessage ? 'admin-chat-message-admin' : 'admin-chat-message-user'} admin-chat-message-new`;
          messageDiv.innerHTML = `
            <div class="admin-chat-message-bubble">
              <div class="admin-chat-message-text">${escapeHtml(msg.message)}</div>
              <div class="admin-chat-message-time">${time}</div>
            </div>
          `;
          messagesContainer.appendChild(messageDiv);
          
          if (msg.id > lastAdminMessageId) {
            lastAdminMessageId = msg.id;
          }
        });
      }
      
      // Scroll to bottom
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  } catch (error) {
    console.error('Error loading chat messages:', error);
    if (forceReload) {
      messagesContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #f97373;">Error loading messages</div>';
    }
  }
}

async function sendSupportMessage() {
  if (!selectedUserId) {
    showError('Error', 'Please select a user first');
    return;
  }
  
  const input = document.getElementById('support-chat-input');
  if (!input) return;
  
  const message = input.value.trim();
  if (!message) return;
  
  // Add message to UI immediately for better UX
  const messagesContainer = document.getElementById('support-chat-messages');
  if (messagesContainer && messagesContainer.children.length > 0 && messagesContainer.children[0].textContent.includes('Select a user')) {
    messagesContainer.innerHTML = '';
  }
  
  const time = new Date().toLocaleTimeString();
  const messageDiv = document.createElement('div');
  messageDiv.style.cssText = 'max-width: 70%; align-self: flex-start; margin-bottom: 12px; opacity: 0.7;';
  messageDiv.innerHTML = `
    <div style="padding: 10px 14px; border-radius: 12px; 
                background: rgba(59, 130, 246, 0.2); 
                color: #e8e8ea; 
                border: 1px solid rgba(59, 130, 246, 0.3);">
      <div style="margin-bottom: 4px; word-wrap: break-word;">${escapeHtml(message)}</div>
      <div style="font-size: 10px; opacity: 0.7;">${time} (sending...)</div>
    </div>
  `;
  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
  
  try {
    const res = await fetch(`${PHP_API_BASE}/chat-admin.php`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        user_id: selectedUserId,
        message: message
      })
    });
    
    const data = await res.json();
    
    if (data.ok) {
      input.value = '';
      // Remove temporary message and reload to get actual message with ID
      messageDiv.remove();
      await loadChatMessages(selectedUserId, false);
    } else {
      messageDiv.remove();
      showError('Error', data.error || 'Failed to send message');
    }
  } catch (error) {
    console.error('Error sending message:', error);
    messageDiv.remove();
    showError('Error', 'Failed to send message');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Expose function globally
window.selectSupportUser = selectSupportUser;

window.addEventListener("DOMContentLoaded", () => {
  checkAuth();
});
