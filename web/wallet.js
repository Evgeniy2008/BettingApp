// PHP API для системы выплат
const PHP_API_BASE = "/api";
let currentUser = null;

// Инициализация пользователя
async function initUser() {
  try {
    let telegramData = {};
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      const user = tg.initDataUnsafe?.user;
      if (user) {
        telegramData = {
          telegram_id: String(user.id),
          telegram_username: user.username || null
        };
      }
    }
    
    const response = await fetch(`${PHP_API_BASE}/auth.php?action=init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(telegramData),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success && data.user) {
      currentUser = data.user;
      updateUserUI();
      loadWallets();
      loadWalletHistory();
    } else {
      console.error('Failed to init user:', data.error || 'Unknown error');
      // Все равно пытаемся загрузить историю, возможно пользователь уже авторизован
      loadWalletHistory();
    }
  } catch (err) {
    console.error('Failed to init user:', err);
    // Все равно пытаемся загрузить историю, возможно пользователь уже авторизован
    loadWalletHistory();
  }
}

async function loadWalletHistory() {
  await Promise.all([loadWalletDeposits(), loadWalletWithdrawals()]);
}

async function loadWalletDeposits() {
  const el = document.getElementById('wallet-deposits-history');
  if (!el) return;
  
  try {
    const response = await fetch(`${PHP_API_BASE}/deposits.php`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Ошибка: ' + errorMsg + '</div>';
      return;
    }
    
    renderWalletDeposits(data.deposits);
  } catch (err) {
    console.error('Failed to load deposits:', err);
    el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Ошибка загрузки: ' + err.message + '</div>';
  }
}

async function loadWalletWithdrawals() {
  const el = document.getElementById('wallet-withdrawals-history');
  if (!el) return;
  
  try {
    const response = await fetch(`${PHP_API_BASE}/withdrawals.php`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Ошибка: ' + errorMsg + '</div>';
      return;
    }
    
    renderWalletWithdrawals(data.withdrawals);
  } catch (err) {
    console.error('Failed to load withdrawals:', err);
    el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Ошибка загрузки: ' + err.message + '</div>';
  }
}

function renderWalletDeposits(deposits) {
  const el = document.getElementById('wallet-deposits-history');
  if (!el) return;
  
  if (!deposits || deposits.length === 0) {
    el.innerHTML = '<div class="label" style="color: rgba(232, 232, 234, 0.5);">История пуста</div>';
    return;
  }
  
  const statusMap = {
    'pending': { text: 'Ожидание', class: 'badge badge-pending' },
    'approved': { text: 'Подтверждено', class: 'badge badge-approved' },
    'rejected': { text: 'Отклонено', class: 'badge badge-rejected' }
  };
  
  el.innerHTML = deposits.slice(0, 5).map(item => {
    const status = statusMap[item.status] || { text: item.status, class: '' };
    return `
      <div style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <div style="font-size: 12px; font-weight: 600;">${item.amount.toFixed(2)} ${item.currency || 'USDT'}</div>
          <div class="mono" style="font-size: 10px; color: rgba(232, 232, 234, 0.6); margin-top: 2px;">${item.transaction_hash.substring(0, 20)}...</div>
          <div style="font-size: 10px; color: rgba(232, 232, 234, 0.5); margin-top: 2px;">${new Date(item.created_at).toLocaleDateString('ru-RU')}</div>
        </div>
        <span class="${status.class}" style="font-size: 10px; padding: 4px 8px;">${status.text}</span>
      </div>
    `;
  }).join('');
}

function renderWalletWithdrawals(withdrawals) {
  const el = document.getElementById('wallet-withdrawals-history');
  if (!el) return;
  
  if (!withdrawals || withdrawals.length === 0) {
    el.innerHTML = '<div class="label" style="color: rgba(232, 232, 234, 0.5);">История пуста</div>';
    return;
  }
  
  const statusMap = {
    'pending': { text: 'Ожидание', class: 'badge badge-pending' },
    'approved': { text: 'Подтверждено', class: 'badge badge-approved' },
    'rejected': { text: 'Отклонено', class: 'badge badge-rejected' }
  };
  
  el.innerHTML = withdrawals.slice(0, 5).map(item => {
    const status = statusMap[item.status] || { text: item.status, class: '' };
    return `
      <div style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: center;">
        <div style="flex: 1;">
          <div style="font-size: 12px; font-weight: 600;">${item.amount.toFixed(2)} ${item.currency || 'USDT'}</div>
          <div class="mono" style="font-size: 10px; color: rgba(232, 232, 234, 0.6); margin-top: 2px;">${item.wallet_address.substring(0, 20)}...</div>
          <div style="font-size: 10px; color: rgba(232, 232, 234, 0.5); margin-top: 2px;">${new Date(item.created_at).toLocaleDateString('ru-RU')}</div>
        </div>
        <span class="${status.class}" style="font-size: 10px; padding: 4px 8px;">${status.text}</span>
      </div>
    `;
  }).join('');
}

async function loadUser() {
  try {
    const response = await fetch(`${PHP_API_BASE}/auth.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success && data.user) {
      currentUser = data.user;
      updateUserUI();
    }
  } catch (err) {
    console.error('Failed to load user:', err);
  }
}

function updateUserUI() {
  if (!currentUser) return;
  const balanceEl = document.getElementById('wallet-balance');
  const creditLimitEl = document.getElementById('wallet-credit-limit');
  const profileUsernameEl = document.getElementById('profile-username');
  if (balanceEl) balanceEl.textContent = `$${currentUser.balance.toFixed(2)}`;
  if (creditLimitEl) creditLimitEl.textContent = `$${currentUser.credit_limit.toFixed(2)}`;
  if (profileUsernameEl) {
    profileUsernameEl.textContent = currentUser.telegram_username 
      ? `@${currentUser.telegram_username}` 
      : (currentUser.telegram_id ? `ID: ${currentUser.telegram_id}` : 'Гость');
  }
}

async function loadWallets() {
  try {
    const response = await fetch(`${PHP_API_BASE}/wallet.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success && data.wallets) {
      const usdtEl = document.getElementById('wallet-usdt');
      const btcEl = document.getElementById('wallet-btc');
      const ethEl = document.getElementById('wallet-eth');
      if (usdtEl) usdtEl.textContent = data.wallets.usdt || 'Не настроен';
      if (btcEl) btcEl.textContent = data.wallets.btc || 'Не настроен';
      if (ethEl) ethEl.textContent = data.wallets.eth || 'Не настроен';
    }
  } catch (err) {
    console.error('Failed to load wallets:', err);
  }
}

async function submitDeposit(amount, transactionHash, currency) {
  try {
    const response = await fetch(`${PHP_API_BASE}/deposits.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, transaction_hash: transactionHash, currency }),
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      alert('Заявка на пополнение отправлена! Ожидайте подтверждения администратора.');
      closeDepositModal();
      loadUser();
      loadWalletHistory();
    } else {
      alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    alert('Ошибка отправки заявки: ' + err.message);
  }
}

async function updateDepositWalletAddress() {
  const currency = document.getElementById('deposit-currency').value.toLowerCase();
  const addressEl = document.getElementById('deposit-wallet-address');
  const copyBtn = document.getElementById('copy-wallet-address');
  
  if (!addressEl) return;
  
  try {
    const response = await fetch(`${PHP_API_BASE}/wallet.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success && data.wallets) {
      const address = data.wallets[currency] || 'Не настроен';
      addressEl.textContent = address.toUpperCase();
      
      // Показываем/скрываем кнопку копирования
      if (copyBtn) {
        if (address && address !== 'Не настроен') {
          copyBtn.style.display = 'inline-block';
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(address).then(() => {
              const originalText = copyBtn.textContent;
              copyBtn.textContent = 'Скопировано!';
              setTimeout(() => {
                copyBtn.textContent = originalText;
              }, 2000);
            }).catch(() => {
              // Fallback для старых браузеров
              const textarea = document.createElement('textarea');
              textarea.value = address;
              textarea.style.position = 'fixed';
              textarea.style.opacity = '0';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              const originalText = copyBtn.textContent;
              copyBtn.textContent = 'Скопировано!';
              setTimeout(() => {
                copyBtn.textContent = originalText;
              }, 2000);
            });
          };
        } else {
          copyBtn.style.display = 'none';
        }
      }
    } else {
      addressEl.textContent = 'НЕ НАСТРОЕН';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  } catch (err) {
    addressEl.textContent = 'ОШИБКА ЗАГРУЗКИ';
    if (copyBtn) copyBtn.style.display = 'none';
  }
}

async function submitWithdrawal(amount, walletAddress, currency) {
  try {
    const response = await fetch(`${PHP_API_BASE}/withdrawals.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, wallet_address: walletAddress, currency }),
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      alert('Заявка на вывод отправлена! Ожидайте подтверждения администратора.');
      closeWithdrawalModal();
      loadUser();
      loadWalletHistory();
    } else {
      alert('Ошибка: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    alert('Ошибка отправки заявки: ' + err.message);
  }
}

async function loadDepositHistory() {
  try {
    const response = await fetch(`${PHP_API_BASE}/deposits.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      showHistoryModal('История пополнений', data.deposits, 'deposit');
    }
  } catch (err) {
    alert('Ошибка загрузки истории: ' + err.message);
  }
}

async function loadWithdrawalHistory() {
  try {
    const response = await fetch(`${PHP_API_BASE}/withdrawals.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      showHistoryModal('История выводов', data.withdrawals, 'withdrawal');
    }
  } catch (err) {
    alert('Ошибка загрузки истории: ' + err.message);
  }
}

function showHistoryModal(title, items, type) {
  const modal = document.getElementById('history-modal');
  const titleEl = document.getElementById('history-modal-title');
  const bodyEl = document.getElementById('history-modal-body');
  if (!modal || !titleEl || !bodyEl) return;
  titleEl.textContent = title;
  if (!items || items.length === 0) {
    bodyEl.innerHTML = '<div class="subcard"><div class="label">История пуста</div></div>';
  } else {
    const statusMap = {
      'pending': { text: 'Ожидание', class: 'badge badge-pending' },
      'approved': { text: 'Подтверждено', class: 'badge badge-approved' },
      'rejected': { text: 'Отклонено', class: 'badge badge-rejected' }
    };
    bodyEl.innerHTML = items.map(item => {
      const status = statusMap[item.status] || { text: item.status, class: '' };
      return `<div class="subcard mt"><div style="display: flex; justify-content: space-between; align-items: center;"><div><div class="label">Сумма: $${item.amount.toFixed(2)} ${type === 'deposit' ? '(' + (item.currency || 'USDT') + ')' : ''}</div>${type === 'deposit' ? `<div class="mono" style="font-size: 10px; margin-top: 4px;">${item.transaction_hash}</div>` : `<div class="mono" style="font-size: 10px; margin-top: 4px;">${item.wallet_address} (${item.currency})</div>`}<div class="label" style="margin-top: 4px; font-size: 10px;">${new Date(item.created_at).toLocaleString('ru-RU')}</div></div><span class="${status.class}">${status.text}</span></div></div>`;
    }).join('');
  }
  modal.style.display = 'flex';
}

function openDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) {
    modal.style.display = 'flex';
    updateDepositWalletAddress();
  }
}

function closeDepositModal() {
  const modal = document.getElementById('deposit-modal');
  if (modal) {
    modal.style.display = 'none';
    const amountEl = document.getElementById('deposit-amount');
    const hashEl = document.getElementById('deposit-hash');
    const currencyEl = document.getElementById('deposit-currency');
    if (amountEl) amountEl.value = '';
    if (hashEl) hashEl.value = '';
    if (currencyEl) currencyEl.value = 'USDT';
  }
}

function openWithdrawalModal() {
  const modal = document.getElementById('withdrawal-modal');
  if (modal) modal.style.display = 'flex';
}

function closeWithdrawalModal() {
  const modal = document.getElementById('withdrawal-modal');
  if (modal) {
    modal.style.display = 'none';
    const amountEl = document.getElementById('withdrawal-amount');
    const walletEl = document.getElementById('withdrawal-wallet');
    const currencyEl = document.getElementById('withdrawal-currency');
    if (amountEl) amountEl.value = '';
    if (walletEl) walletEl.value = '';
    if (currencyEl) currencyEl.value = 'USDT';
  }
}

function closeHistoryModal() {
  const modal = document.getElementById('history-modal');
  if (modal) modal.style.display = 'none';
}

// Инициализация обработчиков
document.addEventListener('DOMContentLoaded', () => {
  initUser();
  
  const btnDeposit = document.getElementById('btn-deposit');
  const btnDepositHistory = document.getElementById('btn-deposit-history');
  const btnWithdrawal = document.getElementById('btn-withdrawal');
  const btnWithdrawalHistory = document.getElementById('btn-withdrawal-history');
  const depositModalClose = document.getElementById('deposit-modal-close');
  const depositCancel = document.getElementById('deposit-cancel');
  const depositSubmit = document.getElementById('deposit-submit');
  const withdrawalModalClose = document.getElementById('withdrawal-modal-close');
  const withdrawalCancel = document.getElementById('withdrawal-cancel');
  const withdrawalSubmit = document.getElementById('withdrawal-submit');
  const historyModalClose = document.getElementById('history-modal-close');
  
  if (btnDeposit) btnDeposit.addEventListener('click', openDepositModal);
  if (btnDepositHistory) btnDepositHistory.addEventListener('click', loadDepositHistory);
  if (btnWithdrawal) btnWithdrawal.addEventListener('click', openWithdrawalModal);
  if (btnWithdrawalHistory) btnWithdrawalHistory.addEventListener('click', loadWithdrawalHistory);
  if (depositModalClose) depositModalClose.addEventListener('click', closeDepositModal);
  if (depositCancel) depositCancel.addEventListener('click', closeDepositModal);
  if (depositSubmit) depositSubmit.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('deposit-amount').value);
    const hash = document.getElementById('deposit-hash').value.trim();
    const currency = document.getElementById('deposit-currency').value;
    if (!amount || amount <= 0) { alert('Введите корректную сумму'); return; }
    if (!hash) { alert('Введите хэш транзакции'); return; }
    submitDeposit(amount, hash, currency);
  });
  
  // Обновление адреса кошелька при смене валюты
  const depositCurrency = document.getElementById('deposit-currency');
  if (depositCurrency) {
    depositCurrency.addEventListener('change', updateDepositWalletAddress);
  }
  if (withdrawalModalClose) withdrawalModalClose.addEventListener('click', closeWithdrawalModal);
  if (withdrawalCancel) withdrawalCancel.addEventListener('click', closeWithdrawalModal);
  if (withdrawalSubmit) withdrawalSubmit.addEventListener('click', () => {
    const amount = parseFloat(document.getElementById('withdrawal-amount').value);
    const wallet = document.getElementById('withdrawal-wallet').value.trim();
    const currency = document.getElementById('withdrawal-currency').value;
    if (!amount || amount <= 0) { alert('Введите корректную сумму'); return; }
    if (!wallet) { alert('Введите адрес кошелька'); return; }
    if (currentUser && currentUser.balance < amount) { alert('Недостаточно средств на балансе'); return; }
    submitWithdrawal(amount, wallet, currency);
  });
  if (historyModalClose) historyModalClose.addEventListener('click', closeHistoryModal);
  
  const depositModal = document.getElementById('deposit-modal');
  const withdrawalModal = document.getElementById('withdrawal-modal');
  const historyModal = document.getElementById('history-modal');
  if (depositModal) depositModal.querySelector('.modal-overlay')?.addEventListener('click', closeDepositModal);
  if (withdrawalModal) withdrawalModal.querySelector('.modal-overlay')?.addEventListener('click', closeWithdrawalModal);
  if (historyModal) historyModal.querySelector('.modal-overlay')?.addEventListener('click', closeHistoryModal);
  
  // Загружаем историю при переключении на вкладку кошелька
  const walletTabs = document.querySelectorAll('.tab[data-tab="wallet"]');
  walletTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Небольшая задержка, чтобы страница успела стать видимой
      setTimeout(() => {
        const walletPage = document.querySelector('main[data-page="wallet"]');
        if (walletPage && !walletPage.classList.contains('page-hidden')) {
          loadWalletHistory();
        }
      }, 100);
    });
  });
});
