// PHP API для системы выплат
// Use existing PHP_API_BASE if defined in app.js, otherwise use default
if (typeof PHP_API_BASE === 'undefined') {
  var PHP_API_BASE = "/api";
}
let currentUser = null;

// Функция для показа уведомлений через SweetAlert2
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

async function showConfirm(title, text, confirmText = 'Yes', cancelText = 'No') {
  const result = await Swal.fire({
    title: title,
    text: text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    confirmButtonColor: '#22c55e',
    cancelButtonColor: '#ef4444'
  });
  return result.isConfirmed;
}

// Функции для показа skeleton loading
function showBalanceSkeleton() {
  const balanceEl = document.getElementById('wallet-balance');
  const creditLimitEl = document.getElementById('wallet-credit-limit');
  if (balanceEl) balanceEl.innerHTML = '<div class="skeleton-value"></div>';
  if (creditLimitEl) creditLimitEl.innerHTML = '<div class="skeleton-value"></div>';
}

function showWalletsSkeleton() {
  const usdtEl = document.getElementById('wallet-usdt');
  if (usdtEl) usdtEl.innerHTML = '<div class="skeleton-wallet-address"></div>';
}

function showDepositsHistorySkeleton() {
  const el = document.getElementById('wallet-deposits-history');
  if (!el) return;
  el.innerHTML = Array(3).fill(0).map(() => `
    <div class="skeleton-history-item">
      <div class="skeleton-history-content">
        <div class="skeleton-history-line"></div>
        <div class="skeleton-history-line"></div>
        <div class="skeleton-history-line"></div>
      </div>
      <div class="skeleton-history-badge"></div>
    </div>
  `).join('');
}

function showWithdrawalsHistorySkeleton() {
  const el = document.getElementById('wallet-withdrawals-history');
  if (!el) return;
  el.innerHTML = Array(3).fill(0).map(() => `
    <div class="skeleton-history-item">
      <div class="skeleton-history-content">
        <div class="skeleton-history-line"></div>
        <div class="skeleton-history-line"></div>
        <div class="skeleton-history-line"></div>
      </div>
      <div class="skeleton-history-badge"></div>
    </div>
  `).join('');
}

// Инициализация пользователя
async function initUser() {
  // Показываем skeleton для баланса и кошельков перед загрузкой
  showBalanceSkeleton();
  showWalletsSkeleton();
  
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
      // Dispatch event for app.js to update profile balance
      window.dispatchEvent(new CustomEvent('userUpdated'));
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
  
  // Показываем skeleton перед загрузкой
  showDepositsHistorySkeleton();
  
  try {
    const response = await fetch(`${PHP_API_BASE}/deposits.php`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Error: ' + errorMsg + '</div>';
      return;
    }
    
    renderWalletDeposits(data.deposits);
  } catch (err) {
    console.error('Failed to load deposits:', err);
    el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Loading error: ' + err.message + '</div>';
  }
}

async function loadWalletWithdrawals() {
  const el = document.getElementById('wallet-withdrawals-history');
  if (!el) return;
  
  // Показываем skeleton перед загрузкой
  showWithdrawalsHistorySkeleton();
  
  try {
    const response = await fetch(`${PHP_API_BASE}/withdrawals.php`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      const errorMsg = data.error || `HTTP ${response.status}`;
      el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Error: ' + errorMsg + '</div>';
      return;
    }
    
    renderWalletWithdrawals(data.withdrawals);
  } catch (err) {
    console.error('Failed to load withdrawals:', err);
    el.innerHTML = '<div class="label" style="color: rgba(248,113,113,0.9);">Loading error: ' + err.message + '</div>';
  }
}

function renderWalletDeposits(deposits) {
  const el = document.getElementById('wallet-deposits-history');
  if (!el) return;
  
  if (!deposits || deposits.length === 0) {
    el.innerHTML = '<div class="label" style="color: rgba(232, 232, 234, 0.5);">History is empty</div>';
    return;
  }
  
  const statusMap = {
    'pending': { text: 'Pending', class: 'badge badge-pending' },
    'approved': { text: 'Approved', class: 'badge badge-approved' },
    'rejected': { text: 'Rejected', class: 'badge badge-rejected' }
  };
  
  el.innerHTML = deposits.slice(0, 5).map(item => {
    const status = statusMap[item.status] || { text: item.status, class: '' };
    const hash = item.transaction_hash || '';
    const hashDisplay = hash.length > 15 ? hash.substring(0, 15) + '...' : hash;
    return `
      <div style="padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">$${item.amount.toFixed(2)} ${item.currency || 'USDT'}</div>
          <div class="mono" style="font-size: 11px; color: rgba(232, 232, 234, 0.6); margin-top: 4px; word-break: break-all;">${hashDisplay}</div>
          <div style="font-size: 11px; color: rgba(232, 232, 234, 0.5); margin-top: 4px;">${new Date(item.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <span class="${status.class}" style="font-size: 11px; padding: 4px 8px; flex-shrink: 0; white-space: nowrap;">${status.text}</span>
      </div>
    `;
  }).join('');
}

function renderWalletWithdrawals(withdrawals) {
  const el = document.getElementById('wallet-withdrawals-history');
  if (!el) return;
  
  if (!withdrawals || withdrawals.length === 0) {
    el.innerHTML = '<div class="label" style="color: rgba(232, 232, 234, 0.5);">History is empty</div>';
    return;
  }
  
  const statusMap = {
    'pending': { text: 'Pending', class: 'badge badge-pending' },
    'approved': { text: 'Approved', class: 'badge badge-approved' },
    'rejected': { text: 'Rejected', class: 'badge badge-rejected' }
  };
  
  el.innerHTML = withdrawals.slice(0, 5).map(item => {
    const status = statusMap[item.status] || { text: item.status, class: '' };
    const wallet = item.wallet_address || '';
    const walletDisplay = wallet.length > 15 ? wallet.substring(0, 15) + '...' : wallet;
    return `
      <div style="padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 4px;">$${item.amount.toFixed(2)} ${item.currency || 'USDT'}</div>
          <div class="mono" style="font-size: 11px; color: rgba(232, 232, 234, 0.6); margin-top: 4px; word-break: break-all;">${walletDisplay}</div>
          <div style="font-size: 11px; color: rgba(232, 232, 234, 0.5); margin-top: 4px;">${new Date(item.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <span class="${status.class}" style="font-size: 11px; padding: 4px 8px; flex-shrink: 0; white-space: nowrap;">${status.text}</span>
      </div>
    `;
  }).join('');
}

async function loadUser() {
  // Показываем skeleton для баланса перед загрузкой
  showBalanceSkeleton();
  
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
  const debtContainer = document.getElementById('wallet-debt-container');
  const currentDebtEl = document.getElementById('wallet-current-debt');
  
  // Mobile balance
  const profileBalanceMobile = document.getElementById('profile-balance-mobile');
  // Desktop balance
  const profileBalanceDesktop = document.getElementById('profile-balance-desktop');
  
  const balanceText = `$${currentUser.balance.toFixed(2)}`;
  
  if (balanceEl) balanceEl.textContent = balanceText;
  if (profileBalanceMobile) profileBalanceMobile.textContent = balanceText;
  if (profileBalanceDesktop) profileBalanceDesktop.textContent = balanceText;
  
  if (creditLimitEl) creditLimitEl.textContent = `$${currentUser.credit_limit.toFixed(2)}`;
  
  // Показываем кредитный долг, если он есть
  const currentDebt = currentUser.current_debt || 0;
  const btnPayDebt = document.getElementById('btn-pay-debt');
  if (debtContainer && currentDebtEl) {
    if (currentDebt > 0) {
      debtContainer.style.display = 'block';
      currentDebtEl.textContent = `$${currentDebt.toFixed(2)}`;
      
      // Показываем кнопку "Погасить сейчас" только если баланса хватает
      if (btnPayDebt) {
        if (currentUser.balance >= currentDebt) {
          btnPayDebt.style.display = 'block';
          btnPayDebt.disabled = false;
        } else {
          btnPayDebt.style.display = 'none';
        }
      }
    } else {
      debtContainer.style.display = 'none';
      if (btnPayDebt) btnPayDebt.style.display = 'none';
    }
  }
  
  if (profileUsernameEl) {
    profileUsernameEl.textContent = currentUser.telegram_username 
      ? `@${currentUser.telegram_username}` 
      : (currentUser.telegram_id ? `ID: ${currentUser.telegram_id}` : 'Guest');
  }
  
  // Dispatch event for app.js to update profile balance
  window.dispatchEvent(new CustomEvent('userUpdated'));
}

async function loadWallets() {
  // Показываем skeleton перед загрузкой
  showWalletsSkeleton();
  
  try {
    const response = await fetch(`${PHP_API_BASE}/wallet.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success && data.wallets) {
      const usdtEl = document.getElementById('wallet-usdt');
      const copyBtn = document.getElementById('copy-main-wallet');
      const address = data.wallets.usdt || 'Not configured';
      
      if (usdtEl) usdtEl.textContent = address;
      
      // Настраиваем кнопку копирования
      if (copyBtn) {
        if (address && address !== 'Not configured') {
          copyBtn.style.display = 'inline-block';
          // Сохраняем оригинальный адрес в data-атрибут (в нижнем регистре)
          const originalAddress = address.toLowerCase().trim();
          copyBtn.setAttribute('data-wallet-address', originalAddress);
          // Удаляем старые обработчики и устанавливаем новый
          copyBtn.onclick = null;
          // Удаляем все обработчики через клонирование
          if (copyBtn.parentNode) {
            const newBtn = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newBtn, copyBtn);
            // Устанавливаем обработчик на новую кнопку
            newBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              let addressToCopy = this.getAttribute('data-wallet-address');
              if (!addressToCopy) {
                addressToCopy = originalAddress;
              }
              console.log('Copying address:', addressToCopy); // Отладка
              if (addressToCopy && addressToCopy !== 'not configured' && addressToCopy !== 'Not configured') {
                copyToClipboard(addressToCopy, this);
              } else {
                showError('Error', 'Address not loaded');
              }
            };
          } else {
            // Если нет родителя, устанавливаем напрямую
            copyBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              const addressToCopy = originalAddress;
              if (addressToCopy && addressToCopy !== 'not configured') {
                copyToClipboard(addressToCopy, this);
              } else {
                alert('Address not loaded');
              }
            };
          }
        } else {
          copyBtn.style.display = 'none';
        }
      }
    }
  } catch (err) {
    console.error('Failed to load wallets:', err);
    const usdtEl = document.getElementById('wallet-usdt');
    if (usdtEl) usdtEl.textContent = 'Loading error';
  }
}

function copyToClipboard(text, button) {
  // Очищаем текст от лишних пробелов
  const cleanText = String(text || '').trim();
  
  if (!cleanText || cleanText === 'Not configured' || cleanText === 'NOT CONFIGURED' || 
      cleanText === 'Loading error' || cleanText === 'LOADING ERROR' || 
      cleanText === 'Loading...') {
    showError('Error', 'Address is not available for copying');
    return;
  }
  
  // Пробуем использовать современный API
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cleanText).then(() => {
      const originalText = button.textContent;
      button.textContent = 'Скопировано!';
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 2000);
    }).catch((err) => {
      console.error('Clipboard API failed:', err);
      // Fallback для старых браузеров
      fallbackCopy(cleanText, button);
    });
  } else {
    // Fallback для старых браузеров
    fallbackCopy(cleanText, button);
  }
}

function fallbackCopy(text, button) {
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
      button.textContent = 'Скопировано!';
      button.style.color = '#22c55e';
      setTimeout(() => {
        button.textContent = originalText;
        button.style.color = '';
      }, 2000);
    } else {
      showError('Copy Error', 'Failed to copy address. Copy manually: ' + text);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    alert('Failed to copy address. Copy manually: ' + text);
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
      showSuccess('Request Sent', 'Deposit request sent! Wait for administrator confirmation.');
      closeDepositModal();
      loadUser();
      loadWalletHistory();
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка отправки заявки: ' + err.message);
  }
}

async function updateDepositWalletAddress() {
  const addressEl = document.getElementById('deposit-wallet-address');
  const copyBtn = document.getElementById('copy-wallet-address');
  
  if (!addressEl) return;
  
  try {
    const response = await fetch(`${PHP_API_BASE}/wallet.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success && data.wallets) {
      const address = data.wallets.usdt || 'Not configured';
      // Save original address (lowercase for copying)
      const originalAddress = address && address !== 'Not configured' ? address.toLowerCase().trim() : null;
      addressEl.textContent = address.toUpperCase();
      
      // Настраиваем кнопку копирования
      if (copyBtn) {
        if (originalAddress) {
          copyBtn.style.display = 'inline-block';
          // Сохраняем оригинальный адрес в data-атрибут
          copyBtn.setAttribute('data-wallet-address', originalAddress);
          // Удаляем старые обработчики и устанавливаем новый
          copyBtn.onclick = null;
          // Удаляем все обработчики через клонирование
          if (copyBtn.parentNode) {
            const newBtn = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newBtn, copyBtn);
            // Устанавливаем обработчик на новую кнопку
            newBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              let addressToCopy = this.getAttribute('data-wallet-address');
              if (!addressToCopy) {
                addressToCopy = originalAddress;
              }
              console.log('Copying address:', addressToCopy); // Отладка
              if (addressToCopy && addressToCopy !== 'not configured' && addressToCopy !== 'Not configured') {
                copyToClipboard(addressToCopy, this);
              } else {
                showError('Error', 'Address not loaded');
              }
            };
          } else {
            // Если нет родителя, устанавливаем напрямую
            copyBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              const addressToCopy = originalAddress;
              if (addressToCopy && addressToCopy !== 'not configured') {
                copyToClipboard(addressToCopy, this);
              } else {
                alert('Address not loaded');
              }
            };
          }
        } else {
          copyBtn.style.display = 'none';
        }
      }
    } else {
      addressEl.textContent = 'NOT CONFIGURED';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load wallet address:', err);
    addressEl.textContent = 'LOADING ERROR';
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
      showSuccess('Request Sent', 'Withdrawal request sent! Wait for administrator confirmation.');
      closeWithdrawalModal();
      loadUser();
      loadWalletHistory();
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка отправки заявки: ' + err.message);
  }
}

async function loadDepositHistory() {
  // Показываем модальное окно с skeleton
  const modal = document.getElementById('history-modal');
  const titleEl = document.getElementById('history-modal-title');
  const bodyEl = document.getElementById('history-modal-body');
  if (modal && titleEl && bodyEl) {
    titleEl.textContent = 'Deposit History';
    bodyEl.innerHTML = Array(5).fill(0).map(() => `
      <div class="skeleton-history-item">
        <div class="skeleton-history-content">
          <div class="skeleton-history-line"></div>
          <div class="skeleton-history-line"></div>
          <div class="skeleton-history-line"></div>
        </div>
        <div class="skeleton-history-badge"></div>
      </div>
    `).join('');
    modal.style.display = 'flex';
  }
  
  try {
    const response = await fetch(`${PHP_API_BASE}/deposits.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      showHistoryModal('Deposit History', data.deposits, 'deposit');
    } else {
      if (bodyEl) {
        bodyEl.innerHTML = '<div class="subcard"><div class="label" style="color: rgba(248,113,113,0.9);">Ошибка: ' + (data.error || 'Неизвестная ошибка') + '</div></div>';
      }
    }
  } catch (err) {
    console.error('Failed to load deposit history:', err);
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="subcard"><div class="label" style="color: rgba(248,113,113,0.9);">Ошибка загрузки: ' + err.message + '</div></div>';
    }
  }
}

async function loadWithdrawalHistory() {
  // Показываем модальное окно с skeleton
  const modal = document.getElementById('history-modal');
  const titleEl = document.getElementById('history-modal-title');
  const bodyEl = document.getElementById('history-modal-body');
  if (modal && titleEl && bodyEl) {
    titleEl.textContent = 'Withdrawal History';
    bodyEl.innerHTML = Array(5).fill(0).map(() => `
      <div class="skeleton-history-item">
        <div class="skeleton-history-content">
          <div class="skeleton-history-line"></div>
          <div class="skeleton-history-line"></div>
          <div class="skeleton-history-line"></div>
        </div>
        <div class="skeleton-history-badge"></div>
      </div>
    `).join('');
    modal.style.display = 'flex';
  }
  
  try {
    const response = await fetch(`${PHP_API_BASE}/withdrawals.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    if (data.success) {
      showHistoryModal('Withdrawal History', data.withdrawals, 'withdrawal');
    } else {
      if (bodyEl) {
        bodyEl.innerHTML = '<div class="subcard"><div class="label" style="color: rgba(248,113,113,0.9);">Ошибка: ' + (data.error || 'Неизвестная ошибка') + '</div></div>';
      }
    }
  } catch (err) {
    console.error('Failed to load withdrawal history:', err);
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="subcard"><div class="label" style="color: rgba(248,113,113,0.9);">Ошибка загрузки: ' + err.message + '</div></div>';
    }
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
      return `<div class="subcard mt"><div style="display: flex; justify-content: space-between; align-items: center;"><div><div class="label">Amount: $${item.amount.toFixed(2)} ${type === 'deposit' ? '(' + (item.currency || 'USDT') + ')' : ''}</div>${type === 'deposit' ? `<div class="mono" style="font-size: 10px; margin-top: 4px;">${item.transaction_hash}</div>` : `<div class="mono" style="font-size: 10px; margin-top: 4px;">${item.wallet_address} (${item.currency})</div>`}<div class="label" style="margin-top: 4px; font-size: 10px;">${new Date(item.created_at).toLocaleString('en-US')}</div></div><span class="${status.class}">${status.text}</span></div></div>`;
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

// Функции для кредитования
function openCreditRequestModal() {
  const modal = document.getElementById('credit-request-modal');
  const currentLimitEl = document.getElementById('current-credit-limit');
  if (modal && currentUser) {
    if (currentLimitEl) currentLimitEl.textContent = `$${currentUser.credit_limit.toFixed(2)}`;
    modal.style.display = 'flex';
  }
}

function closeCreditRequestModal() {
  const modal = document.getElementById('credit-request-modal');
  if (modal) {
    modal.style.display = 'none';
    const requestedLimitEl = document.getElementById('requested-credit-limit');
    if (requestedLimitEl) requestedLimitEl.value = '';
  }
}

async function submitCreditRequest() {
  const requestedLimit = parseFloat(document.getElementById('requested-credit-limit').value);
  
  if (!requestedLimit || requestedLimit <= 0) {
    showWarning('Error', 'Enter a valid amount');
    return;
  }
  
  if (currentUser && requestedLimit <= currentUser.credit_limit) {
    showWarning('Error', 'New limit must be greater than current limit');
    return;
  }
  
  try {
    const response = await fetch(`${PHP_API_BASE}/credit_requests.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requested_limit: requestedLimit }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      showSuccess('Request Sent', 'Credit limit increase request sent! Wait for administrator confirmation.');
      closeCreditRequestModal();
      loadUser();
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    alert('Request sending error: ' + err.message);
  }
}

async function payDebt() {
  if (!currentUser || !currentUser.current_debt || currentUser.current_debt <= 0) {
    showError('Error', 'You have no debt to pay off');
    return;
  }
  
  if (currentUser.balance < currentUser.current_debt) {
    showError('Insufficient Funds', `To pay off debt you need $${currentUser.current_debt.toFixed(2)}, your balance is $${currentUser.balance.toFixed(2)}`);
    return;
  }
  
  const confirmed = await showConfirm(
    'Pay Off Debt?',
    `Are you sure you want to pay off debt $${currentUser.current_debt.toFixed(2)}? $${currentUser.current_debt.toFixed(2)} will be deducted from your balance.`,
    'Pay Off',
    'Cancel'
  );
  
  if (!confirmed) return;
  
  try {
    const response = await fetch(`${PHP_API_BASE}/pay_debt.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      await showSuccess('Debt Paid Off', `Debt $${data.debt_paid.toFixed(2)} successfully paid off. New balance: $${data.new_balance.toFixed(2)}`);
      loadUser();
    } else {
      showError('Error', data.error || 'Unknown error');
    }
  } catch (err) {
    showError('Error', 'Debt payment error: ' + err.message);
  }
}

async function showCreditStatus() {
  try {
    const response = await fetch(`${PHP_API_BASE}/credit_requests.php`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (data.success) {
      const requests = data.requests || [];
      if (requests.length === 0) {
        showInfo('Information', 'You have no credit limit increase requests');
        return;
      }
      
      const latestRequest = requests[0];
      const statusMap = {
        'pending': 'Pending',
        'approved': 'Approved',
        'rejected': 'Rejected'
      };
      
      let message = `Requested limit: $${latestRequest.requested_limit.toFixed(2)}\n`;
      message += `Status: ${statusMap[latestRequest.status] || latestRequest.status}\n`;
      if (latestRequest.admin_notes) {
        message += `Note: ${latestRequest.admin_notes}\n`;
      }
      message += `Date: ${new Date(latestRequest.created_at).toLocaleString('en-US')}`;
      
      showInfo('Request Status', message);
    } else {
      showError('Error', 'Status loading error: ' + (data.error || 'Unknown error'));
    }
  } catch (err) {
    showError('Error', 'Status loading error: ' + err.message);
  }
}

function showInfo(title, text) {
  return showAlert(title, text, 'info');
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
    if (!amount || amount <= 0) { showWarning('Ошибка', 'Введите корректную сумму'); return; }
    if (!hash) { showWarning('Error', 'Enter transaction hash'); return; }
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
    if (!amount || amount <= 0) { showWarning('Ошибка', 'Введите корректную сумму'); return; }
    if (!wallet) { showWarning('Error', 'Enter wallet address'); return; }
    if (currentUser && currentUser.balance < amount) { showError('Error', 'Insufficient balance'); return; }
    submitWithdrawal(amount, wallet, currency);
  });
  if (historyModalClose) historyModalClose.addEventListener('click', closeHistoryModal);
  
  // Обработчики для кредитования
  const btnRequestLimit = document.getElementById('btn-request-limit');
  const btnCreditStatus = document.getElementById('btn-credit-status');
  const btnPayDebt = document.getElementById('btn-pay-debt');
  const creditRequestModal = document.getElementById('credit-request-modal');
  const creditRequestModalClose = document.getElementById('credit-request-modal-close');
  const creditRequestCancel = document.getElementById('credit-request-cancel');
  const creditRequestSubmit = document.getElementById('credit-request-submit');
  
  if (btnRequestLimit) btnRequestLimit.addEventListener('click', openCreditRequestModal);
  if (btnCreditStatus) btnCreditStatus.addEventListener('click', showCreditStatus);
  if (btnPayDebt) btnPayDebt.addEventListener('click', payDebt);
  if (creditRequestModalClose) creditRequestModalClose.addEventListener('click', closeCreditRequestModal);
  if (creditRequestCancel) creditRequestCancel.addEventListener('click', closeCreditRequestModal);
  if (creditRequestSubmit) creditRequestSubmit.addEventListener('click', submitCreditRequest);
  if (creditRequestModal) creditRequestModal.querySelector('.modal-overlay')?.addEventListener('click', closeCreditRequestModal);
  
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
          // Показываем skeleton для баланса и кошельков, если они еще не загружены
          const balanceEl = document.getElementById('wallet-balance');
          if (balanceEl && (!balanceEl.textContent || balanceEl.textContent === '$0.00' || balanceEl.querySelector('.skeleton-value'))) {
            showBalanceSkeleton();
            showWalletsSkeleton();
            loadUser();
            loadWallets();
          }
          loadWalletHistory();
        }
      }, 100);
    });
  });
});
