<?php
require_once 'config.php';

// Admin login
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
        // If password doesn't exist in DB, create it (simple password without encryption)
        $defaultPassword = 'admin123';
        $stmt = $db->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('admin_password', ?) ON DUPLICATE KEY UPDATE setting_value = ?");
        $stmt->execute([$defaultPassword, $defaultPassword]);
        $result = ['setting_value' => $defaultPassword];
    }
    
    // Simple password comparison without encryption
    if ($password !== $result['setting_value']) {
        sendJSON(['error' => 'Invalid password'], 401);
    }
    
    // Create session
    $token = generateToken(32);
    $expiresAt = date('Y-m-d H:i:s', time() + ADMIN_SESSION_LIFETIME);
    
    $stmt = $db->prepare("INSERT INTO admin_sessions (token, expires_at) VALUES (?, ?)");
    $stmt->execute([$token, $expiresAt]);
    
    // Set cookie with correct parameters
    $cookieSet = setcookie('admin_token', $token, [
        'expires' => time() + ADMIN_SESSION_LIFETIME,
        'path' => '/',
        'domain' => '',
        'secure' => false,
        'httponly' => true,
        'samesite' => 'Lax'
    ]);
    
    // Also send token in response in case of cookie issues
    sendJSON([
        'success' => true, 
        'token' => $token,
        'cookie_set' => $cookieSet
    ]);
}

// Change password
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
    
    // Simple password comparison without encryption
    if (!$result || $oldPassword !== $result['setting_value']) {
        sendJSON(['error' => 'Invalid old password'], 401);
    }
    
    // Save new password without encryption
    $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'admin_password'");
    $stmt->execute([$newPassword]);
    
    sendJSON(['success' => true]);
}

// Get statistics
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

// Get users
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

// Update user credit limit
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

// Get deposit requests
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

// Approve/reject deposit
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
    
    // Get request
    $stmt = $db->prepare("SELECT * FROM deposits WHERE id = ? AND status = 'pending'");
    $stmt->execute([$depositId]);
    $deposit = $stmt->fetch();
    
    if (!$deposit) {
        sendJSON(['error' => 'Deposit not found or already processed'], 404);
    }
    
    $status = $action === 'approve' ? 'approved' : 'rejected';
    
    // Update status
    $stmt = $db->prepare("UPDATE deposits SET status = ?, admin_notes = ? WHERE id = ?");
    $stmt->execute([$status, $notes, $depositId]);
    
    // If approved, add balance and pay off credit
    if ($action === 'approve') {
        // Get user's current debt
        $stmt = $db->prepare("SELECT current_debt FROM users WHERE id = ?");
        $stmt->execute([$deposit['user_id']]);
        $userData = $stmt->fetch();
        $currentDebt = floatval($userData['current_debt'] ?? 0);
        $depositAmount = floatval($deposit['amount']);
        
        // If there's debt, pay it off
        if ($currentDebt > 0) {
            if ($depositAmount >= $currentDebt) {
                // Fully pay off debt, remainder goes to balance
                $remainingAmount = $depositAmount - $currentDebt;
                $stmt = $db->prepare("UPDATE users SET balance = balance + ?, current_debt = 0 WHERE id = ?");
                $stmt->execute([$remainingAmount, $deposit['user_id']]);
            } else {
                // Partially pay off debt
                $newDebt = $currentDebt - $depositAmount;
                $stmt = $db->prepare("UPDATE users SET current_debt = ? WHERE id = ?");
                $stmt->execute([$newDebt, $deposit['user_id']]);
            }
        } else {
            // No debt, just add to balance
            $stmt = $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
            $stmt->execute([$depositAmount, $deposit['user_id']]);
        }
    }
    
    sendJSON(['success' => true]);
}

// Get withdrawal requests
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

// Approve/reject withdrawal
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
    
    // Get request
    $stmt = $db->prepare("SELECT * FROM withdrawals WHERE id = ? AND status = 'pending'");
    $stmt->execute([$withdrawalId]);
    $withdrawal = $stmt->fetch();
    
    if (!$withdrawal) {
        sendJSON(['error' => 'Withdrawal not found or already processed'], 404);
    }
    
    $status = $action === 'approve' ? 'approved' : 'rejected';
    
    $db->beginTransaction();
    try {
        // Update status
        $stmt = $db->prepare("UPDATE withdrawals SET status = ?, admin_notes = ? WHERE id = ?");
        $stmt->execute([$status, $notes, $withdrawalId]);
        
        if ($action === 'approve') {
            // On approval, deduct amount from user balance
            $withdrawalAmount = floatval($withdrawal['amount']);
            
            // Check user balance
            $stmt = $db->prepare("SELECT balance FROM users WHERE id = ?");
            $stmt->execute([$withdrawal['user_id']]);
            $userData = $stmt->fetch();
            
            if (!$userData) {
                throw new Exception('User not found');
            }
            
            $currentBalance = floatval($userData['balance']);
            
            if ($currentBalance < $withdrawalAmount) {
                $db->rollBack();
                sendJSON(['error' => 'Insufficient user balance'], 400);
                return;
            }
            
            // Deduct amount from balance
            $stmt = $db->prepare("UPDATE users SET balance = balance - ? WHERE id = ?");
            $stmt->execute([$withdrawalAmount, $withdrawal['user_id']]);
        }
        // If rejected, don't touch balance (it wasn't deducted when request was created)
        
        $db->commit();
        sendJSON(['success' => true]);
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to process withdrawal: ' . $e->getMessage()], 500);
    }
}

// Get/update wallets
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'wallets') {
    checkAdminAuth();
    $db = getDB();
    
    $wallets = [];
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = ?");
    
    $stmt->execute(['deposit_wallet_usdt']);
    $usdt = $stmt->fetch();
    if ($usdt) $wallets['usdt'] = $usdt['setting_value'];
    
    sendJSON(['success' => true, 'wallets' => $wallets]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update-wallets') {
    checkAdminAuth();
    $data = getRequestData();
    
    $db = getDB();
    
    if (isset($data['usdt'])) {
        $usdtValue = trim($data['usdt']);
        // Use INSERT ... ON DUPLICATE KEY UPDATE to ensure update
        $stmt = $db->prepare("INSERT INTO admin_settings (setting_key, setting_value) VALUES ('deposit_wallet_usdt', ?) ON DUPLICATE KEY UPDATE setting_value = ?");
        $stmt->execute([$usdtValue, $usdtValue]);
        
        // Check that update was successful
        $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'deposit_wallet_usdt'");
        $stmt->execute();
        $result = $stmt->fetch();
        
        if (!$result || $result['setting_value'] !== $usdtValue) {
            sendJSON(['error' => 'Failed to update wallet address'], 500);
            return;
        }
    }
    
    sendJSON(['success' => true]);
}

// Get credit increase requests
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'credit-requests') {
    checkAdminAuth();
    $db = getDB();
    
    $status = $_GET['status'] ?? '';
    $query = "SELECT cr.*, u.telegram_username, u.telegram_id, u.credit_limit as current_limit, u.current_debt 
              FROM credit_requests cr 
              LEFT JOIN users u ON cr.user_id = u.id WHERE 1=1";
    $params = [];
    
    if (!empty($status) && in_array($status, ['pending', 'approved', 'rejected'])) {
        $query .= " AND cr.status = ?";
        $params[] = $status;
    }
    
    $query .= " ORDER BY cr.created_at DESC LIMIT 100";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $requests = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'requests' => array_map(function($r) {
            return [
                'id' => $r['id'],
                'user_id' => $r['user_id'],
                'telegram_username' => $r['telegram_username'] ? '@' . $r['telegram_username'] : 'N/A',
                'telegram_id' => $r['telegram_id'],
                'current_limit' => floatval($r['current_limit']),
                'current_debt' => floatval($r['current_debt'] ?? 0),
                'requested_limit' => floatval($r['requested_limit']),
                'status' => $r['status'],
                'admin_notes' => $r['admin_notes'],
                'created_at' => $r['created_at'],
                'updated_at' => $r['updated_at']
            ];
        }, $requests)
    ]);
}

// Approve/reject credit request
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'process-credit-request') {
    checkAdminAuth();
    $data = getRequestData();
    
    $requestId = intval($data['request_id'] ?? 0);
    $action = $data['action'] ?? ''; // 'approve' or 'reject'
    $notes = trim($data['notes'] ?? '');
    
    if ($requestId <= 0 || !in_array($action, ['approve', 'reject'])) {
        sendJSON(['error' => 'Invalid parameters'], 400);
    }
    
    $db = getDB();
    
    // Get request
    $stmt = $db->prepare("SELECT * FROM credit_requests WHERE id = ? AND status = 'pending'");
    $stmt->execute([$requestId]);
    $request = $stmt->fetch();
    
    if (!$request) {
        sendJSON(['error' => 'Credit request not found or already processed'], 404);
    }
    
    $status = $action === 'approve' ? 'approved' : 'rejected';
    
    // Update status
    $stmt = $db->prepare("UPDATE credit_requests SET status = ?, admin_notes = ? WHERE id = ?");
    $stmt->execute([$status, $notes, $requestId]);
    
    // If approved, update user credit limit
    if ($action === 'approve') {
        $stmt = $db->prepare("UPDATE users SET credit_limit = ? WHERE id = ?");
        $stmt->execute([$request['requested_limit'], $request['user_id']]);
    }
    
    sendJSON(['success' => true]);
}

// ========== BET MANAGEMENT ==========

// Get list of bets
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'bets') {
    checkAdminAuth();
    $db = getDB();
    
    $search = $_GET['search'] ?? '';
    $status = $_GET['status'] ?? '';
    $userId = $_GET['user_id'] ?? '';
    
    $query = "SELECT b.*, u.telegram_username, u.telegram_id, u.id as user_db_id 
              FROM bets b 
              LEFT JOIN users u ON b.user_id = u.id WHERE 1=1";
    $params = [];
    
    if (!empty($search)) {
        $query .= " AND (b.bet_id LIKE ? OR b.match_home LIKE ? OR b.match_away LIKE ? OR u.telegram_username LIKE ?)";
        $searchParam = "%$search%";
        $params = [$searchParam, $searchParam, $searchParam, $searchParam];
    }
    
    if (!empty($status) && in_array($status, ['pending', 'active', 'won', 'lost', 'cancelled', 'refunded'])) {
        $query .= " AND b.status = ?";
        $params[] = $status;
    }
    
    if (!empty($userId)) {
        $query .= " AND b.user_id = ?";
        $params[] = intval($userId);
    }
    
    $query .= " ORDER BY b.created_at DESC LIMIT 200";
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $bets = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'bets' => array_map(function($b) {
            return [
                'id' => $b['id'],
                'bet_id' => $b['bet_id'],
                'user_id' => $b['user_id'],
                'user_tg' => $b['telegram_username'] ? '@' . $b['telegram_username'] : ($b['telegram_id'] ? 'ID: ' . $b['telegram_id'] : 'N/A'),
                'match' => [
                    'id' => $b['match_id'],
                    'line_id' => $b['line_id'],
                    'home' => $b['match_home'],
                    'away' => $b['match_away'],
                    'league' => $b['match_league']
                ],
                'outcome' => [
                    'key' => $b['outcome_key'],
                    'label' => $b['outcome_label'],
                    'type' => $b['outcome_type'],
                    'value' => $b['outcome_value'],
                    'odd' => floatval($b['odd'])
                ],
                'stake' => floatval($b['stake']),
                'potential_win' => floatval($b['potential_win']),
                'win_amount' => $b['win_amount'] ? floatval($b['win_amount']) : null,
                'status' => $b['status'],
                'admin_notes' => $b['admin_notes'],
                'bet_details' => $b['bet_details'], // Include bet_details for express bets
                'created_at' => $b['created_at'],
                'settled_at' => $b['settled_at'],
                'cancelled_at' => $b['cancelled_at']
            ];
        }, $bets)
    ]);
}

// Get detailed bet information
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['action']) && $_GET['action'] === 'bet-detail') {
    checkAdminAuth();
    $betId = $_GET['bet_id'] ?? '';
    
    if (empty($betId)) {
        sendJSON(['error' => 'Bet ID is required'], 400);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT b.*, u.telegram_username, u.telegram_id, u.balance, u.total_staked 
                          FROM bets b 
                          LEFT JOIN users u ON b.user_id = u.id 
                          WHERE b.bet_id = ?");
    $stmt->execute([$betId]);
    $bet = $stmt->fetch();
    
    if (!$bet) {
        sendJSON(['error' => 'Bet not found'], 404);
    }
    
    sendJSON([
        'success' => true,
        'bet' => [
            'id' => $bet['id'],
            'bet_id' => $bet['bet_id'],
            'user' => [
                'id' => $bet['user_id'],
                'telegram_username' => $bet['telegram_username'],
                'telegram_id' => $bet['telegram_id'],
                'balance' => floatval($bet['balance']),
                'total_staked' => floatval($bet['total_staked'])
            ],
            'match' => [
                'id' => $bet['match_id'],
                'line_id' => $bet['line_id'],
                'home' => $bet['match_home'],
                'away' => $bet['match_away'],
                'league' => $bet['match_league']
            ],
            'outcome' => [
                'key' => $bet['outcome_key'],
                'label' => $bet['outcome_label'],
                'type' => $bet['outcome_type'],
                'value' => $bet['outcome_value'],
                'odd' => floatval($bet['odd'])
            ],
            'stake' => floatval($bet['stake']),
            'potential_win' => floatval($bet['potential_win']),
            'win_amount' => $bet['win_amount'] ? floatval($bet['win_amount']) : null,
            'status' => $bet['status'],
            'admin_notes' => $bet['admin_notes'],
            'bet_details' => $bet['bet_details'], // Include bet_details for express bets
            'created_at' => $bet['created_at'],
            'settled_at' => $bet['settled_at'],
            'cancelled_at' => $bet['cancelled_at'],
            'updated_at' => $bet['updated_at']
        ]
    ]);
}

// Change bet status
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'update-bet-status') {
    checkAdminAuth();
    $data = getRequestData();
    
    $betId = $data['bet_id'] ?? '';
    $newStatus = $data['status'] ?? '';
    $winAmount = isset($data['win_amount']) ? floatval($data['win_amount']) : null;
    $notes = trim($data['notes'] ?? '');
    
    if (empty($betId) || empty($newStatus)) {
        sendJSON(['error' => 'Bet ID and status are required'], 400);
    }
    
    if (!in_array($newStatus, ['pending', 'active', 'won', 'lost', 'cancelled', 'refunded'])) {
        sendJSON(['error' => 'Invalid status'], 400);
    }
    
    $db = getDB();
    
    try {
        $db->beginTransaction();
        
        // Get current bet
        $stmt = $db->prepare("SELECT * FROM bets WHERE bet_id = ?");
        $stmt->execute([$betId]);
        $bet = $stmt->fetch();
        
        if (!$bet) {
            $db->rollBack();
            sendJSON(['error' => 'Bet not found'], 404);
        }
        
        $oldStatus = $bet['status'];
        $userId = $bet['user_id'];
        $stake = floatval($bet['stake']);
        
        // Update bet status
        $updateFields = ['status = ?'];
        $updateParams = [$newStatus];
        
        if ($newStatus === 'won') {
            // If win_amount is not specified, use potential_win (full win amount)
            if ($winAmount === null) {
                $winAmount = floatval($bet['potential_win']);
            }
            $updateFields[] = 'win_amount = ?';
            $updateFields[] = 'settled_at = NOW()';
            $updateParams[] = $winAmount;
        } elseif (in_array($newStatus, ['lost'])) {
            $updateFields[] = 'settled_at = NOW()';
        } elseif ($newStatus === 'cancelled' || $newStatus === 'refunded') {
            $updateFields[] = 'cancelled_at = NOW()';
        }
        
        if (!empty($notes)) {
            $updateFields[] = 'admin_notes = ?';
            $updateParams[] = $notes;
        }
        
        $updateParams[] = $betId;
        $stmt = $db->prepare("UPDATE bets SET " . implode(', ', $updateFields) . " WHERE bet_id = ?");
        $stmt->execute($updateParams);
        
        // Handle balance changes based on status
        if ($oldStatus !== $newStatus) {
            // If bet was won/lost/cancelled and is changing to another status - rollback changes
            if (in_array($oldStatus, ['won', 'lost', 'cancelled', 'refunded'])) {
                if ($oldStatus === 'won' && $bet['win_amount']) {
                    // Deduct winnings (return balance to state before win)
                    $stmt = $db->prepare("UPDATE users SET balance = balance - ? WHERE id = ?");
                    $stmt->execute([floatval($bet['win_amount']), $userId]);
                } elseif ($oldStatus === 'cancelled' || $oldStatus === 'refunded') {
                    // Deduct refund (return balance to state before refund)
                    $stmt = $db->prepare("UPDATE users SET balance = balance - ? WHERE id = ?");
                    $stmt->execute([$stake, $userId]);
                }
            }
            
            // Apply new status
            if ($newStatus === 'won') {
                // If win_amount is not specified, use potential_win (full win amount)
                if ($winAmount === null) {
                    $winAmount = floatval($bet['potential_win']);
                }
                // Add full win amount (stake was already deducted when bet was created)
                $stmt = $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
                $stmt->execute([$winAmount, $userId]);
            } elseif ($newStatus === 'cancelled' || $newStatus === 'refunded') {
                // Refund stake (stake was deducted when bet was created)
                $stmt = $db->prepare("UPDATE users SET balance = balance + ? WHERE id = ?");
                $stmt->execute([$stake, $userId]);
            }
            // For 'lost' status do nothing - stake was already deducted when bet was created
        }
        
        $db->commit();
        sendJSON(['success' => true]);
        
    } catch (Exception $e) {
        $db->rollBack();
        sendJSON(['error' => 'Failed to update bet: ' . $e->getMessage()], 500);
    }
}

sendJSON(['error' => 'Invalid request'], 400);
