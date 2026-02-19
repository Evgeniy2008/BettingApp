<?php
require_once 'config.php';

// Погашение кредитного долга
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = checkUserAuth();
    $db = getDB();
    
    // Получаем текущий долг пользователя
    $stmt = $db->prepare("SELECT current_debt, balance FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $userData = $stmt->fetch();
    
    if (!$userData) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $currentDebt = floatval($userData['current_debt'] ?? 0);
    $balance = floatval($userData['balance'] ?? 0);
    
    if ($currentDebt <= 0) {
        sendJSON(['error' => 'No debt to pay'], 400);
    }
    
    if ($balance < $currentDebt) {
        sendJSON(['error' => 'Insufficient balance to pay debt'], 400);
    }
    
    try {
        // Погашаем долг полностью
        $stmt = $db->prepare("UPDATE users SET balance = balance - ?, current_debt = 0 WHERE id = ?");
        $stmt->execute([$currentDebt, $user['id']]);
        
        sendJSON([
            'success' => true,
            'debt_paid' => $currentDebt,
            'new_balance' => $balance - $currentDebt
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to pay debt'], 500);
    }
}

sendJSON(['error' => 'Invalid request'], 400);
