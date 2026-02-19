<?php
require_once 'config.php';

// Создание заявки на вывод
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = checkUserAuth();
    $data = getRequestData();
    
    $amount = floatval($data['amount'] ?? 0);
    $walletAddress = trim($data['wallet_address'] ?? '');
    $currency = trim($data['currency'] ?? 'USDT');
    
    if ($amount <= 0) {
        sendJSON(['error' => 'Amount must be greater than 0'], 400);
    }
    
    if (empty($walletAddress)) {
        sendJSON(['error' => 'Wallet address is required'], 400);
    }
    
    // Проверяем баланс
    $db = getDB();
    $stmt = $db->prepare("SELECT balance FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $userData = $stmt->fetch();
    
    if (floatval($userData['balance']) < $amount) {
        sendJSON(['error' => 'Insufficient balance'], 400);
    }
    
    try {
        $stmt = $db->prepare("INSERT INTO withdrawals (user_id, amount, wallet_address, currency, status) VALUES (?, ?, ?, ?, 'pending')");
        $stmt->execute([$user['id'], $amount, $walletAddress, $currency]);
        $withdrawalId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'withdrawal' => [
                'id' => $withdrawalId,
                'amount' => $amount,
                'wallet_address' => $walletAddress,
                'currency' => $currency,
                'status' => 'pending'
            ]
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create withdrawal request'], 500);
    }
}

// Получение истории выводов пользователя
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = checkUserAuth();
    $db = getDB();
    
    $stmt = $db->prepare("SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
    $stmt->execute([$user['id']]);
    $withdrawals = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'withdrawals' => array_map(function($w) {
            return [
                'id' => $w['id'],
                'amount' => floatval($w['amount']),
                'wallet_address' => $w['wallet_address'],
                'currency' => $w['currency'],
                'status' => $w['status'],
                'created_at' => $w['created_at']
            ];
        }, $withdrawals)
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
