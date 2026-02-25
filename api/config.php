<?php
// Конфигурация базы данных
define('DB_HOST', 'localhost');
define('DB_NAME', 'u743896667_root');
define('DB_USER', 'u743896667_root');
define('DB_PASS', 'Godzila#9145');
define('DB_CHARSET', 'utf8mb4');

// Настройки безопасности
define('SESSION_LIFETIME', 86400); // 24 часа
define('ADMIN_SESSION_LIFETIME', 86400); // 24 часа

// Подключение к базе данных
function getDB() {
    static $pdo = null;
    
    if ($pdo === null) {
        try {
            $dsn = "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=" . DB_CHARSET;
            $options = [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ];
            $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['error' => 'Database connection failed']);
            exit;
        }
    }
    
    return $pdo;
}

// Функция для генерации UUID
function generateUUID() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// Функция для генерации токена сессии
function generateToken($length = 32) {
    return bin2hex(random_bytes($length));
}

// Функция для отправки JSON ответа
function sendJSON($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Функция для получения данных из запроса
function getRequestData() {
    $data = json_decode(file_get_contents('php://input'), true);
    return $data ?: [];
}

// Функция для проверки авторизации пользователя
function checkUserAuth() {
    $sessionToken = $_COOKIE['session_token'] ?? null;
    
    if (!$sessionToken) {
        sendJSON(['error' => 'Unauthorized'], 401);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM users WHERE session_token = ?");
    $stmt->execute([$sessionToken]);
    $user = $stmt->fetch();
    
    if (!$user) {
        sendJSON(['error' => 'Invalid session'], 401);
    }
    
    return $user;
}

// Функция для проверки авторизации админа
function checkAdminAuth() {
    // Проверяем cookie
    $sessionToken = $_COOKIE['admin_token'] ?? null;
    
    // Если нет в cookie, проверяем заголовок Authorization
    if (!$sessionToken) {
        $headers = getallheaders();
        $authHeader = $headers['Authorization'] ?? '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $sessionToken = $matches[1];
        }
    }
    
    if (!$sessionToken) {
        sendJSON(['error' => 'Unauthorized'], 401);
    }
    
    $db = getDB();
    $stmt = $db->prepare("SELECT * FROM admin_sessions WHERE token = ? AND expires_at > NOW()");
    $stmt->execute([$sessionToken]);
    $session = $stmt->fetch();
    
    if (!$session) {
        sendJSON(['error' => 'Invalid or expired session'], 401);
    }
    
    return true;
}

// CORS заголовки
// Для локальной разработки разрешаем все
$allowedOrigin = $_SERVER['HTTP_ORIGIN'] ?? '*';
if ($allowedOrigin && $allowedOrigin !== '*') {
    header("Access-Control-Allow-Origin: $allowedOrigin");
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
