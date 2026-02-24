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

// Gemini API configuration
// Replace with your actual Gemini API key
define('GEMINI_API_KEY', 'AIzaSyC1_fRb6ssO2EXfAgw-VwbnTVqg3YHeupY');
define('GEMINI_API_URL', 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent');

/**
 * Makes a request to Gemini API
 */
function geminiRequest($message, $history = []) {
    if (GEMINI_API_KEY === 'AIzaSyC1_fRb6ssO2EXfAgw-VwbnTVqg3YHeupY') {
        return null; // API not configured
    }
    
    $url = GEMINI_API_URL . '?key=' . GEMINI_API_KEY;
    
    // Build conversation context
    $contents = [];
    
    // Add system prompt
    $systemPrompt = "You are a helpful support assistant for a sports betting platform. You can help users with:
- Withdrawals: Explain how to withdraw money, processing times, minimum amounts
- Deposits: Explain how to deposit money, accepted methods, processing times
- Placing bets: Explain how to place bets, bet types, odds
- Credit system: Explain credit limits, credit debt, how to request credit increases
- General questions: Answer questions about the platform

Be friendly, concise, and helpful. If you don't know something, suggest contacting support directly.";
    
    $contents[] = [
        'role' => 'user',
        'parts' => [['text' => $systemPrompt]]
    ];
    
    // Add conversation history
    foreach ($history as $msg) {
        $role = $msg['isUser'] ? 'user' : 'model';
        $contents[] = [
            'role' => $role,
            'parts' => [['text' => $msg['text']]]
        ];
    }
    
    // Add current message
    $contents[] = [
        'role' => 'user',
        'parts' => [['text' => $message]]
    ];
    
    $data = [
        'contents' => $contents
    ];
    
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    
    if ($error) {
        throw new Exception('API request failed: ' . $error);
    }
    
    if ($httpCode !== 200) {
        $errorData = json_decode($response, true);
        $errorMsg = isset($errorData['error']) ? json_encode($errorData['error']) : 'HTTP ' . $httpCode;
        throw new Exception('API returned HTTP ' . $httpCode . ': ' . $errorMsg);
    }
    
    $data = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        throw new Exception('Invalid JSON response: ' . json_last_error_msg());
    }
    
    // Extract response text
    if (isset($data['candidates'][0]['content']['parts'][0]['text'])) {
        return $data['candidates'][0]['content']['parts'][0]['text'];
    }
    
    throw new Exception('No response text in API response');
}

// GET: Get chat history
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $sessionToken = $_COOKIE['session_token'] ?? null;
        if (!$sessionToken) {
            sendJSON([
                'ok' => false,
                'error' => 'Unauthorized'
            ], 401);
        }
        
        $db = getDB();
        $stmt = $db->prepare("SELECT id FROM users WHERE session_token = ?");
        $stmt->execute([$sessionToken]);
        $user = $stmt->fetch();
        
        if (!$user) {
            sendJSON([
                'ok' => false,
                'error' => 'Invalid session'
            ], 401);
        }
        
        $userId = $user['id'];
        
        // Get chat history
        $stmt = $db->prepare("
            SELECT id, message, is_from_user, is_ai_response, is_operator_connected, created_at
            FROM support_chat
            WHERE user_id = ?
            ORDER BY created_at ASC
        ");
        $stmt->execute([$userId]);
        $messages = $stmt->fetchAll();
        
        sendJSON([
            'ok' => true,
            'messages' => $messages
        ]);
        
    } catch (Exception $e) {
        http_response_code(500);
        sendJSON([
            'ok' => false,
            'error' => $e->getMessage()
        ]);
    }
    exit;
}

// POST: Send message
try {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['message']) || empty(trim($input['message']))) {
        sendJSON([
            'ok' => false,
            'error' => 'Message is required'
        ], 400);
    }
    
    $message = trim($input['message']);
    $action = $input['action'] ?? 'send'; // 'send' or 'connect_operator'
    $isAiResponse = isset($input['is_ai_response']) && $input['is_ai_response'] === true;
    $skipAi = isset($input['skip_ai']) && $input['skip_ai'] === true; // Skip AI processing for quick questions
    
    // Get user
    $sessionToken = $_COOKIE['session_token'] ?? null;
    if (!$sessionToken) {
        sendJSON([
            'ok' => false,
            'error' => 'Unauthorized'
        ], 401);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT id FROM users WHERE session_token = ?");
    $stmt->execute([$sessionToken]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON([
            'ok' => false,
            'error' => 'Invalid session'
        ], 401);
    }
    
    $userId = $user['id'];
    
    // Check if operator is connected
    $stmt = $db->prepare("
        SELECT COUNT(*) as count FROM support_chat 
        WHERE user_id = ? AND is_operator_connected = 1
        ORDER BY created_at DESC LIMIT 1
    ");
    $stmt->execute([$userId]);
    $operatorCheck = $stmt->fetch();
    $isOperatorConnected = ($operatorCheck['count'] > 0);
    
    // If this is an AI response (predefined answer), save it directly
    if ($isAiResponse) {
        $stmt = $db->prepare("
            INSERT INTO support_chat (user_id, message, is_from_user, is_ai_response, is_operator_connected)
            VALUES (?, ?, 0, 1, 0)
        ");
        $stmt->execute([$userId, $message]);
        
        $messageId = $db->lastInsertId();
        
        sendJSON([
            'ok' => true,
            'response' => $message,
            'operator_connected' => false,
            'message_id' => $messageId
        ]);
        exit;
    }
    
    // Save user message
    $stmt = $db->prepare("
        INSERT INTO support_chat (user_id, message, is_from_user, is_ai_response, is_operator_connected)
        VALUES (?, ?, 1, 0, ?)
    ");
    $stmt->execute([$userId, $message, $isOperatorConnected ? 1 : 0]);
    
    // If skip_ai flag is set (for quick questions), just save message and return
    // The predefined answer will be saved separately by the frontend
    if ($skipAi) {
        sendJSON([
            'ok' => true,
            'response' => '', // No response needed, frontend will show predefined answer
            'operator_connected' => false
        ]);
        exit;
    }
    
    // If operator is connected, just save message (operator will respond via admin)
    if ($isOperatorConnected || $action === 'connect_operator') {
        if ($action === 'connect_operator' && !$isOperatorConnected) {
            // Mark that operator is now connected
            $stmt = $db->prepare("
                UPDATE support_chat 
                SET is_operator_connected = 1 
                WHERE user_id = ? AND is_from_user = 1
            ");
            $stmt->execute([$userId]);
        }
        
        sendJSON([
            'ok' => true,
            'response' => 'Your message has been sent to support. An operator will respond shortly.',
            'operator_connected' => true
        ]);
        exit;
    }
    
    // Get chat history for AI
    $stmt = $db->prepare("
        SELECT message, is_from_user, is_ai_response
        FROM support_chat
        WHERE user_id = ? AND is_operator_connected = 0
        ORDER BY created_at ASC
        LIMIT 20
    ");
    $stmt->execute([$userId]);
    $historyRows = $stmt->fetchAll();
    
    $history = [];
    foreach ($historyRows as $row) {
        $history[] = [
            'text' => $row['message'],
            'isUser' => (bool)$row['is_from_user']
        ];
    }
    
    // Try to get AI response
    $aiResponse = null;
    $isAiResponseFlag = false;
    
    try {
        $aiResponse = geminiRequest($message, $history);
        $isAiResponseFlag = true;
    } catch (Exception $e) {
        // If AI fails, suggest connecting to operator
        $aiResponse = "I'm having trouble processing your request. Would you like to connect with a support operator?";
    }
    
    // If AI response is null (API not configured), suggest operator
    if ($aiResponse === null) {
        $aiResponse = "I'm here to help! However, the AI assistant is not yet configured. Would you like to connect with a support operator?";
    }
    
    // Save AI response
    $stmt = $db->prepare("
        INSERT INTO support_chat (user_id, message, is_from_user, is_ai_response, is_operator_connected)
        VALUES (?, ?, 0, ?, 0)
    ");
    $stmt->execute([$userId, $aiResponse, $isAiResponseFlag ? 1 : 0]);
    
    sendJSON([
        'ok' => true,
        'response' => $aiResponse,
        'operator_connected' => false
    ]);

} catch (Exception $e) {
    http_response_code(500);
    sendJSON([
        'ok' => false,
        'error' => $e->getMessage()
    ]);
}
?>
