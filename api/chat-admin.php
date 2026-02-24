<?php
require_once 'config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Check admin auth
checkAdminAuth();

// GET: Get chat conversations or messages for a user
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $db = getDB();
        $userId = $_GET['user_id'] ?? null;
        
        if ($userId) {
            // Get messages for specific user
            $stmt = $db->prepare("
                SELECT sc.id, sc.user_id, sc.message, sc.is_from_user, sc.is_ai_response, 
                       sc.is_operator_connected, sc.created_at, u.telegram_username
                FROM support_chat sc
                LEFT JOIN users u ON sc.user_id = u.id
                WHERE sc.user_id = ?
                ORDER BY sc.created_at ASC
            ");
            $stmt->execute([$userId]);
            $messages = $stmt->fetchAll();
            
            sendJSON([
                'ok' => true,
                'messages' => $messages
            ]);
        } else {
            // Get all users with active chats
            $stmt = $db->prepare("
                SELECT DISTINCT u.id, u.telegram_username, u.telegram_id,
                       (SELECT COUNT(*) FROM support_chat WHERE user_id = u.id AND is_operator_connected = 1) as has_operator_chat,
                       (SELECT MAX(created_at) FROM support_chat WHERE user_id = u.id) as last_message_at
                FROM users u
                INNER JOIN support_chat sc ON u.id = sc.user_id
                ORDER BY last_message_at DESC
            ");
            $stmt->execute();
            $users = $stmt->fetchAll();
            
            sendJSON([
                'ok' => true,
                'users' => $users
            ]);
        }
        
    } catch (Exception $e) {
        http_response_code(500);
        sendJSON([
            'ok' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}

// POST: Send message from operator
try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['user_id']) || !isset($input['message']) || empty(trim($input['message']))) {
        sendJSON([
            'ok' => false,
            'error' => 'User ID and message are required'
        ], 400);
    }
    
    $userId = intval($input['user_id']);
    $message = trim($input['message']);
    
    $db = getDB();
    
    // Save operator message
    $stmt = $db->prepare("
        INSERT INTO support_chat (user_id, admin_id, message, is_from_user, is_ai_response, is_operator_connected)
        VALUES (?, NULL, ?, 0, 0, 1)
    ");
    $stmt->execute([$userId, $message]);
    
    sendJSON([
        'ok' => true,
        'message' => 'Message sent successfully'
    ]);

} catch (Exception $e) {
    http_response_code(500);
    sendJSON([
        'ok' => false,
        'error' => $e->getMessage()
    ]);
}
?>
