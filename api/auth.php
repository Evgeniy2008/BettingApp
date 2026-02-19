<?php
require_once 'config.php';

// Автоматическое создание или получение пользователя
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_GET['action']) && $_GET['action'] === 'init') {
    $sessionToken = $_COOKIE['session_token'] ?? null;
    
    // Если есть токен, проверяем пользователя
    if ($sessionToken) {
        $db = getDB();
        $stmt = $db->prepare("SELECT * FROM users WHERE session_token = ?");
        $stmt->execute([$sessionToken]);
        $user = $stmt->fetch();
        
        if ($user) {
            // Обновляем telegram данные если есть
            $data = getRequestData();
            if (isset($data['telegram_id']) || isset($data['telegram_username'])) {
                $telegramId = $data['telegram_id'] ?? $user['telegram_id'];
                $telegramUsername = $data['telegram_username'] ?? $user['telegram_username'];
                
                $stmt = $db->prepare("UPDATE users SET telegram_id = ?, telegram_username = ? WHERE id = ?");
                $stmt->execute([$telegramId, $telegramUsername, $user['id']]);
                
                $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
                $stmt->execute([$user['id']]);
                $user = $stmt->fetch();
            }
            
            sendJSON([
                'success' => true,
                'user' => [
                    'id' => $user['id'],
                    'telegram_id' => $user['telegram_id'],
                    'telegram_username' => $user['telegram_username'],
                    'balance' => floatval($user['balance']),
                    'credit_limit' => floatval($user['credit_limit']),
                    'total_staked' => floatval($user['total_staked'])
                ]
            ]);
        }
    }
    
    // Создаем нового пользователя
    $db = getDB();
    $newToken = generateToken(32);
    $data = getRequestData();
    
    $telegramId = $data['telegram_id'] ?? null;
    $telegramUsername = $data['telegram_username'] ?? null;
    
    try {
        $stmt = $db->prepare("INSERT INTO users (telegram_id, telegram_username, session_token) VALUES (?, ?, ?)");
        $stmt->execute([$telegramId, $telegramUsername, $newToken]);
        $userId = $db->lastInsertId();
        
        // Устанавливаем cookie
        setcookie('session_token', $newToken, time() + SESSION_LIFETIME, '/', '', false, true);
        
        $stmt = $db->prepare("SELECT * FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        sendJSON([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'telegram_id' => $user['telegram_id'],
                'telegram_username' => $user['telegram_username'],
                'balance' => floatval($user['balance']),
                'credit_limit' => floatval($user['credit_limit']),
                'total_staked' => floatval($user['total_staked'])
            ]
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create user'], 500);
    }
}

// Получение текущего пользователя
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = checkUserAuth();
    sendJSON([
        'success' => true,
        'user' => [
            'id' => $user['id'],
            'telegram_id' => $user['telegram_id'],
            'telegram_username' => $user['telegram_username'],
            'balance' => floatval($user['balance']),
            'credit_limit' => floatval($user['credit_limit']),
            'total_staked' => floatval($user['total_staked'])
        ]
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
