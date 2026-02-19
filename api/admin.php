<?php
require_once 'config.php';

// Вход в админку
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'login') {
    $data = getRequestData();
    $password = $data['password'] ?? '';
    
    if (empty($password)) {
        sendJSON(['error' => 'Password is required'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password'");
    $stmt->execute();
    $result = $stmt->fetch();
    
    if (!$result) {
        // Если пароля нет в БД, создаем его (простой пароль без шифрования)
        $defaultPassword = 'admin123';
        $stmt = $db->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('admin_password', ?) ON DUPLICATE KEY UPDATE setting_value = ?");
        $stmt->execute([$defaultPassword, $defaultPassword]);
        $result = ['setting_value' => $defaultPassword];
    }
    
    // Простое сравнение паролей без шифрования
    if ($password !== $result['setting_value']) {
        sendJSON(['error' => 'Invalid password'], 401);
    }
    
    // Создаем сессию
    $token = generateToken(32);
    $expiresAt = date('Y-m-d H:i:s', time() + ADMIN_SESSION_LIFETIME);
    
    $stmt = $db->prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)");
    $stmt->execute([$token, $expiresAt]);
    
    // Устанавливаем cookie с правильными параметрами
    $cookieSet = setcookie('admin_token', $token, [
        'expires' => time() + ADMIN_SESSION_LIFETIME,
        'path' => '/',
        'domain' => '',
        'secure' => false,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    
    // Также отправляем токен в ответе на случай проблем с cookies
    sendJSON([
        'success' => true, 
        'token' => $token,
        'cookie_set' => $cookieSet
    ]);
}

// Изменение пароля
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'change-password') {
    checkAdminAuth();
    $data = getRequestData();
    
    $oldPassword = $data['old_password'] ?? '';
    $newPassword = $data['new_password'] ?? '';
    
    if (empty($oldPassword) || empty($newPassword)) {
        sendJSON(['error' => 'Both passwords are required'], 400);
    }
    
    if (strlen($newPassword) < 8) {
        sendJSON(['error' => 'New password must be at least 8 characters'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password'");
    $stmt->execute();
    $result = $stmt->fetch();
    
    // Простое сравнение паролей без шифрования
    if (!$result || $oldPassword !== $result['setting_value']) {
        sendJSON(['error' => 'Invalid old password'], 401);
    }
    
    // Сохраняем новый пароль без шифрования
    $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'admin_password'");
    $stmt->execute([$newPassword]);
    
    sendJSON(['success' => true]);
}

// Получение статистики
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'stats') {
    checkAdminAuth();
    $db = getDB();
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM users");
    $usersCount = $stmt->fetch()['count'];
    
    $stmt = $db->query("SELECT SUM(total_staked) as total FROM users");
    $totalStaked = floatval($stmt->fetch()['total'] ?? 0);
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'");
    $pendingWithdrawals = $stmt->fetch()['count'];
    
    $stmt = $db->query("SELECT COUNT(*) as count FROM deposits WHERE status = 'pending'");
    $pendingDeposits = $stmt->fetch()['count'];
    
    sendJSON([
        'success' => true,
        'stats' => [
            'users' => intval($usersCount),
            'total_staked' => $totalStaked,
            'pending_withdrawals' => intval($pendingWithdrawals),
            'pending_deposits' => intval($pendingDeposits)
        ]
    ]);
}

// Получение пользователей
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'users') {
    checkAdminAuth();
    $db = getDB();
    
    $search = $_GET['search'] ?? '';
    $query = "SELECT * FROM users WHERE 1=1";
    $params = [];
    
    if (!empty($search)) {
        $query .= " AND (telegram_username LIKE ? OR telegram_id LIKE ? OR id LIKE ?)";
        $searchParam = "%$search%";
        $params = [$searchParam, $searchParam, $searchParam];
    }
    
    $query .= " ORDER BY created_at DESC LIMIT 100";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'users' => array_map(function($u) {
            return [
                'id' => $u['id'],
                'telegram_id' => $u['telegram_id'],
                'telegram_username' => $u['telegram_username'] ? '@' . $u['telegram_username'] : 'N/A',
                'balance' => floatval($u['balance']),
                'credit_limit' => floatval($u['credit_limit']),
                'total_staked' => floatval($u['total_staked']),
                'created_at' => $u['created_at']
            ];
        }, $users)
    ]);
}

// Обновление кредитного лимита пользователя
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update-limit') {
    checkAdminAuth();
    $data = getRequestData();
    
    $userId = intval($data['user_id'] ?? 0);
    $creditLimit = floatval($data['credit_limit'] ?? 0);
    
    if ($userId <= 0 || $creditLimit < 0) {
        sendJSON(['error' => 'Invalid parameters'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("UPDATE users SET credit_limit = ? WHERE id = ?");
    $stmt->execute([$creditLimit, $userId]);
    
    sendJSON(['success' => true]);
}

// Получение заявок на пополнение
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'deposits') {
    checkAdminAuth();
    $db = getDB();
    
    $search = $_GET['search'] ?? '';
    $query = "SELECT d.*, u.telegram_username, u.telegram_id FROM deposits d 
              LEFT JOIN users u ON d.user_id = u.id WHERE 1=1";
    $params = [];
    
    if (!empty($search)) {
        $query .= " AND (d.transaction_hash LIKE ? OR u.telegram_username LIKE ? OR d.id LIKE ?)";
        $searchParam = "%$search%";
        $params = [$searchParam, $searchParam, $searchParam];
    }
    
    $query .= " ORDER BY d.created_at DESC LIMIT 100";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $deposits = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'deposits' => array_map(function($d) {
            return [
                'id' => $d['id'],
                'user_id' => $d['user_id'],
                'user_tg' => $d['telegram_username'] ? '@' . $d['telegram_username'] : ($d['telegram_id'] ? 'ID: ' . $d['telegram_id'] : 'N/A'),
                'amount' => floatval($d['amount']),
                'transaction_hash' => $d['transaction_hash'],
                'currency' => $d['currency'] ?? 'USDT',
                'status' => $d['status'],
                'admin_notes' => $d['admin_notes'],
                'created_at' => $d['created_at']
            ];
        }, $deposits)
    ]);
}

// Подтверждение/отклонение пополнения
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'process-deposit') {
    checkAdminAuth();
    $data = getRequestData();
    
    $depositId = intval($data['deposit_id'] ?? 0);
    $action = $data['action'] ?? ''; // 'approve' or 'reject'
    $notes = trim($data['notes'] ?? '');
    
    if ($depositId <= 0 || !in_array($action, ['approve', 'reject'])) {
        sendJSON(['error' => 'Invalid parameters'], 400);
    }
    
    $db = getDB();
    
    // Получаем заявку
    $stmt = $db->prepare("SELECT * FROM deposits WHERE id = ? AND status = 'pending'");
    $stmt->execute([$depositId]);
    $deposit = $stmt->fetch();
    
    if (!$deposit) {
        sendJSON(['error' => 'Deposit not found or already processed'], 404);
    }
    
    $status = $action === 'approve' ? 'approved' : 'rejected';
    
    // Обновляем статус
    $stmt = $db->prepare("UPDATE deposits SET status = ?, admin_notes = ? WHERE id = ?");
    $stmt->execute([$status, $notes, $depositId]);
    
    // Если подтверждено, добавляем баланс
    if ($action === 'approve') {
        $stmt = $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
        $stmt->execute([$deposit['amount'], $deposit['user_id']]);
    }
    
    sendJSON(['success' => true]);
}

// Получение заявок на вывод
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'withdrawals') {
    checkAdminAuth();
    $db = getDB();
    
    $search = $_GET['search'] ?? '';
    $query = "SELECT w.*, u.telegram_username, u.telegram_id FROM withdrawals w 
              LEFT JOIN users u ON w.user_id = u.id WHERE 1=1";
    $params = [];
    
    if (!empty($search)) {
        $query .= " AND (w.wallet_address LIKE ? OR u.telegram_username LIKE ? OR w.id LIKE ?)";
        $searchParam = "%$search%";
        $params = [$searchParam, $searchParam, $searchParam];
    }
    
    $query .= " ORDER BY w.created_at DESC LIMIT 100";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $withdrawals = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'withdrawals' => array_map(function($w) {
            return [
                'id' => $w['id'],
                'user_id' => $w['user_id'],
                'user_tg' => $w['telegram_username'] ? '@' . $w['telegram_username'] : ($w['telegram_id'] ? 'ID: ' . $w['telegram_id'] : 'N/A'),
                'amount' => floatval($w['amount']),
                'wallet_address' => $w['wallet_address'],
                'currency' => $w['currency'],
                'status' => $w['status'],
                'admin_notes' => $w['admin_notes'],
                'created_at' => $w['created_at']
            ];
        }, $withdrawals)
    ]);
}

// Подтверждение/отклонение вывода
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'process-withdrawal') {
    checkAdminAuth();
    $data = getRequestData();
    
    $withdrawalId = intval($data['withdrawal_id'] ?? 0);
    $action = $data['action'] ?? ''; // 'approve' or 'reject'
    $notes = trim($data['notes'] ?? '');
    
    if ($withdrawalId <= 0 || !in_array($action, ['approve', 'reject'])) {
        sendJSON(['error' => 'Invalid parameters'], 400);
    }
    
    $db = getDB();
    
    // Получаем заявку
    $stmt = $db->prepare("SELECT * FROM withdrawals WHERE id = ? AND status = 'pending'");
    $stmt->execute([$withdrawalId]);
    $withdrawal = $stmt->fetch();
    
    if (!$withdrawal) {
        sendJSON(['error' => 'Withdrawal not found or already processed'], 404);
    }
    
    $status = $action === 'approve' ? 'approved' : 'rejected';
    
    // Обновляем статус
    $stmt = $db->prepare("UPDATE withdrawals SET status = ?, admin_notes = ? WHERE id = ?");
    $stmt->execute([$status, $notes, $withdrawalId]);
    
    // Если отклонено, возвращаем баланс
    if ($action === 'reject') {
        $stmt = $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
        $stmt->execute([$withdrawal['amount'], $withdrawal['user_id']]);
    }
    // Если подтверждено, баланс уже был списан при создании заявки
    
    sendJSON(['success' => true]);
}

// Получение/обновление кошельков
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'wallets') {
    checkAdminAuth();
    $db = getDB();
    
    $wallets = [];
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = ?");
    
    $stmt->execute(['deposit_wallet_usdt']);
    $usdt = $stmt->fetch();
    if ($usdt) $wallets['usdt'] = $usdt['setting_value'];
    
    $stmt->execute(['deposit_wallet_btc']);
    $btc = $stmt->fetch();
    if ($btc) $wallets['btc'] = $btc['setting_value'];
    
    $stmt->execute(['deposit_wallet_eth']);
    $eth = $stmt->fetch();
    if ($eth) $wallets['eth'] = $eth['setting_value'];
    
    sendJSON(['success' => true, 'wallets' => $wallets]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update-wallets') {
    checkAdminAuth();
    $data = getRequestData();
    
    $db = getDB();
    
    if (isset($data['usdt'])) {
        $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'deposit_wallet_usdt'");
        $stmt->execute([trim($data['usdt'])]);
    }
    
    if (isset($data['btc'])) {
        $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'deposit_wallet_btc'");
        $stmt->execute([trim($data['btc'])]);
    }
    
    if (isset($data['eth'])) {
        $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'deposit_wallet_eth'");
        $stmt->execute([trim($data['eth'])]);
    }
    
    sendJSON(['success' => true]);
}

sendJSON(['error' => 'Invalid request'], 400);
