<?php
require_once 'config.php';

// Создание заявки на пополнение
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = checkUserAuth();
    $data = getRequestData();
    
    $amount = floatval($data['amount'] ?? 0);
    $transactionHash = trim($data['transaction_hash'] ?? '');
    $currency = strtoupper(trim($data['currency'] ?? 'USDT'));
    
    if ($amount <= 0) {
        sendJSON(['error' => 'Amount must be greater than 0'], 400);
    }
    
    if (empty($transactionHash)) {
        sendJSON(['error' => 'Transaction hash is required'], 400);
    }
    
    // Проверяем, что валюта валидна
    if ($currency !== 'USDT') {
        sendJSON(['error' => 'Invalid currency. Only USDT is allowed'], 400);
    }
    
    // Проверяем, что кошелек для этой валюты настроен
    $db = getDB();
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = ?");
    $stmt->execute(['deposit_wallet_' . strtolower($currency)]);
    $wallet = $stmt->fetch();
    
    if (!$wallet || empty($wallet['setting_value']) || $wallet['setting_value'] === 'Не настроен') {
        sendJSON(['error' => 'Wallet for ' . $currency . ' is not configured'], 400);
    }
    
    // Проверяем, нет ли уже заявки с таким хэшем
    $stmt = $db->prepare("SELECT id FROM deposits WHERE transaction_hash = ?");
    $stmt->execute([$transactionHash]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'Transaction hash already exists'], 400);
    }
    
    try {
        $stmt = $db->prepare("INSERT INTO deposits (user_id, amount, transaction_hash, currency, status) VALUES (?, ?, ?, ?, 'pending')");
        $stmt->execute([$user['id'], $amount, $transactionHash, $currency]);
        $depositId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'deposit' => [
                'id' => $depositId,
                'amount' => $amount,
                'transaction_hash' => $transactionHash,
                'currency' => $currency,
                'status' => 'pending'
            ]
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create deposit request'], 500);
    }
}

// Получение истории пополнений пользователя
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = checkUserAuth();
    $db = getDB();
    
    $stmt = $db->prepare("SELECT * FROM deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
    $stmt->execute([$user['id']]);
    $deposits = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'deposits' => array_map(function($d) {
            return [
                'id' => $d['id'],
                'amount' => floatval($d['amount']),
                'transaction_hash' => $d['transaction_hash'],
                'currency' => $d['currency'] ?? 'USDT',
                'status' => $d['status'],
                'created_at' => $d['created_at']
            ];
        }, $deposits)
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
