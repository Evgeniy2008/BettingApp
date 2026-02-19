<?php
require_once 'config.php';

// Создание запроса на увеличение кредитного лимита
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $user = checkUserAuth();
    $data = getRequestData();
    
    $requestedLimit = floatval($data['requested_limit'] ?? 0);
    
    if ($requestedLimit <= 0) {
        sendJSON(['error' => 'Requested limit must be greater than 0'], 400);
    }
    
    // Проверяем текущий лимит пользователя
    $db = getDB();
    $stmt = $db->prepare("SELECT credit_limit FROM users WHERE id = ?");
    $stmt->execute([$user['id']]);
    $userData = $stmt->fetch();
    
    if (!$userData) {
        sendJSON(['error' => 'User not found'], 404);
    }
    
    $currentLimit = floatval($userData['credit_limit']);
    
    if ($requestedLimit <= $currentLimit) {
        sendJSON(['error' => 'Requested limit must be greater than current limit'], 400);
    }
    
    // Проверяем, нет ли уже активного запроса
    $stmt = $db->prepare("SELECT id FROM credit_requests WHERE user_id = ? AND status = 'pending'");
    $stmt->execute([$user['id']]);
    if ($stmt->fetch()) {
        sendJSON(['error' => 'You already have a pending credit request'], 400);
    }
    
    try {
        $stmt = $db->prepare("INSERT INTO credit_requests (user_id, requested_limit, status) VALUES (?, ?, 'pending')");
        $stmt->execute([$user['id'], $requestedLimit]);
        $requestId = $db->lastInsertId();
        
        sendJSON([
            'success' => true,
            'request' => [
                'id' => $requestId,
                'requested_limit' => $requestedLimit,
                'status' => 'pending'
            ]
        ]);
    } catch (PDOException $e) {
        sendJSON(['error' => 'Failed to create credit request'], 500);
    }
}

// Получение истории запросов пользователя
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = checkUserAuth();
    $db = getDB();
    
    $stmt = $db->prepare("SELECT * FROM credit_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 50");
    $stmt->execute([$user['id']]);
    $requests = $stmt->fetchAll();
    
    sendJSON([
        'success' => true,
        'requests' => array_map(function($r) {
            return [
                'id' => $r['id'],
                'requested_limit' => floatval($r['requested_limit']),
                'status' => $r['status'],
                'admin_notes' => $r['admin_notes'],
                'created_at' => $r['created_at'],
                'updated_at' => $r['updated_at']
            ];
        }, $requests)
    ]);
}

sendJSON(['error' => 'Invalid request'], 400);
