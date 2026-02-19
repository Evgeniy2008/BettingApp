// PHP API для системы выплат
const PHP_API_BASE = "/api";
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

async function showConfirm(title, text, confirmText = 'Да', cancelText = 'Нет') {
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
  
  // Показываем skeleton перед загрузкой
  showWithdrawalsHistorySkeleton();
  
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
  
  if (balanceEl) balanceEl.textContent = `$${currentUser.balance.toFixed(2)}`;
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
      : (currentUser.telegram_id ? `ID: ${currentUser.telegram_id}` : 'Гость');
  }
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
      const address = data.wallets.usdt || 'Не настроен';
      
      if (usdtEl) usdtEl.textContent = address;
      
      // Настраиваем кнопку копирования
      if (copyBtn) {
        if (address && address !== 'Не настроен') {
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
              if (addressToCopy && addressToCopy !== 'не настроен' && addressToCopy !== 'Не настроен') {
                copyToClipboard(addressToCopy, this);
              } else {
                showError('Ошибка', 'Адрес не загружен');
              }
            };
          } else {
            // Если нет родителя, устанавливаем напрямую
            copyBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              const addressToCopy = originalAddress;
              if (addressToCopy && addressToCopy !== 'не настроен') {
                copyToClipboard(addressToCopy, this);
              } else {
                alert('Адрес не загружен');
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
    if (usdtEl) usdtEl.textContent = 'Ошибка загрузки';
  }
}

function copyToClipboard(text, button) {
  // Очищаем текст от лишних пробелов
  const cleanText = String(text || '').trim();
  
  if (!cleanText || cleanText === 'Не настроен' || cleanText === 'НЕ НАСТРОЕН' || 
      cleanText === 'Ошибка загрузки' || cleanText === 'ОШИБКА ЗАГРУЗКИ' || 
      cleanText === 'Загрузка...') {
    showError('Ошибка', 'Адрес недоступен для копирования');
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
      showError('Ошибка копирования', 'Не удалось скопировать адрес. Скопируйте вручную: ' + text);
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    alert('Не удалось скопировать адрес. Скопируйте вручную: ' + text);
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
      showSuccess('Заявка отправлена', 'Заявка на пополнение отправлена! Ожидайте подтверждения администратора.');
      closeDepositModal();
      loadUser();
      loadWalletHistory();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
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
      const address = data.wallets.usdt || 'Не настроен';
      // Сохраняем оригинальный адрес (в нижнем регистре для копирования)
      const originalAddress = address && address !== 'Не настроен' ? address.toLowerCase().trim() : null;
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
              if (addressToCopy && addressToCopy !== 'не настроен' && addressToCopy !== 'Не настроен') {
                copyToClipboard(addressToCopy, this);
              } else {
                showError('Ошибка', 'Адрес не загружен');
              }
            };
          } else {
            // Если нет родителя, устанавливаем напрямую
            copyBtn.onclick = function(e) {
              e.preventDefault();
              e.stopPropagation();
              const addressToCopy = originalAddress;
              if (addressToCopy && addressToCopy !== 'не настроен') {
                copyToClipboard(addressToCopy, this);
              } else {
                alert('Адрес не загружен');
              }
            };
          }
        } else {
          copyBtn.style.display = 'none';
        }
      }
    } else {
      addressEl.textContent = 'НЕ НАСТРОЕН';
      if (copyBtn) copyBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('Failed to load wallet address:', err);
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
      showSuccess('Заявка отправлена', 'Заявка на вывод отправлена! Ожидайте подтверждения администратора.');
      closeWithdrawalModal();
      loadUser();
      loadWalletHistory();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
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
    titleEl.textContent = 'История пополнений';
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
      showHistoryModal('История пополнений', data.deposits, 'deposit');
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
    titleEl.textContent = 'История выводов';
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
      showHistoryModal('История выводов', data.withdrawals, 'withdrawal');
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
    showWarning('Ошибка', 'Введите корректную сумму');
    return;
  }
  
  if (currentUser && requestedLimit <= currentUser.credit_limit) {
    showWarning('Ошибка', 'Новый лимит должен быть больше текущего');
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
      showSuccess('Запрос отправлен', 'Запрос на увеличение кредита отправлен! Ожидайте подтверждения администратора.');
      closeCreditRequestModal();
      loadUser();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    alert('Ошибка отправки запроса: ' + err.message);
  }
}

async function payDebt() {
  if (!currentUser || !currentUser.current_debt || currentUser.current_debt <= 0) {
    showError('Ошибка', 'У вас нет долга для погашения');
    return;
  }
  
  if (currentUser.balance < currentUser.current_debt) {
    showError('Недостаточно средств', `Для погашения долга нужно $${currentUser.current_debt.toFixed(2)}, у вас на балансе $${currentUser.balance.toFixed(2)}`);
    return;
  }
  
  const confirmed = await showConfirm(
    'Погасить долг?',
    `Вы уверены, что хотите погасить долг $${currentUser.current_debt.toFixed(2)}? С баланса будет списано $${currentUser.current_debt.toFixed(2)}.`,
    'Погасить',
    'Отмена'
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
      await showSuccess('Долг погашен', `Долг $${data.debt_paid.toFixed(2)} успешно погашен. Новый баланс: $${data.new_balance.toFixed(2)}`);
      loadUser();
    } else {
      showError('Ошибка', data.error || 'Неизвестная ошибка');
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка погашения долга: ' + err.message);
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
        showInfo('Информация', 'У вас нет запросов на увеличение кредита');
        return;
      }
      
      const latestRequest = requests[0];
      const statusMap = {
        'pending': 'Ожидание',
        'approved': 'Подтверждено',
        'rejected': 'Отклонено'
      };
      
      let message = `Запрошенный лимит: $${latestRequest.requested_limit.toFixed(2)}\n`;
      message += `Статус: ${statusMap[latestRequest.status] || latestRequest.status}\n`;
      if (latestRequest.admin_notes) {
        message += `Примечание: ${latestRequest.admin_notes}\n`;
      }
      message += `Дата: ${new Date(latestRequest.created_at).toLocaleString('ru-RU')}`;
      
      showInfo('Статус запроса', message);
    } else {
      showError('Ошибка', 'Ошибка загрузки статуса: ' + (data.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    showError('Ошибка', 'Ошибка загрузки статуса: ' + err.message);
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
    if (!hash) { showWarning('Ошибка', 'Введите хэш транзакции'); return; }
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
    if (!wallet) { showWarning('Ошибка', 'Введите адрес кошелька'); return; }
    if (currentUser && currentUser.balance < amount) { showError('Ошибка', 'Недостаточно средств на балансе'); return; }
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
