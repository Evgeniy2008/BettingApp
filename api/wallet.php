<?php
require_once 'config.php';

// Получение кошельков для пополнения
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $db = getDB();
    
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = ?");
    
    $wallets = [];
    
    $stmt->execute(['deposit_wallet_usdt']);
    $usdt = $stmt->fetch();
    if ($usdt) $wallets['usdt'] = $usdt['setting_value'];
    
    sendJSON([
        'success' => true,
        'wallets' => $wallets
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
