<?php
/**
 * Прокси для Node.js API на Render
 * Использование: /api/proxy.php?path=api/w54/live
 * 
 * Этот файл позволяет обращаться к Render API через ваш домен Hostinger,
 * что решает проблемы с CORS и упрощает настройку.
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// URL вашего Render сервиса (замените на ваш!)
$renderUrl = 'https://betsbot-xxxx.onrender.com';

// Получаем путь из параметра path
$path = $_GET['path'] ?? '';

// Удаляем path из query string, чтобы не передавать его в Render
$queryParams = $_GET;
unset($queryParams['path']);
$queryString = http_build_query($queryParams);

// Формируем полный URL
$url = rtrim($renderUrl, '/') . '/' . ltrim($path, '/');
if ($queryString) {
    $url .= '?' . $queryString;
}

// Настройки curl
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60); // Таймаут 60 секунд для долгих запросов
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

// Передаем заголовки от клиента
$headers = [];
if (isset($_SERVER['HTTP_ACCEPT'])) {
    $headers[] = 'Accept: ' . $_SERVER['HTTP_ACCEPT'];
}
if (isset($_SERVER['HTTP_CONTENT_TYPE'])) {
    $headers[] = 'Content-Type: ' . $_SERVER['HTTP_CONTENT_TYPE'];
}
if (!empty($headers)) {
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
}

// Если это POST запрос, передаем данные
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $postData = file_get_contents('php://input');
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
}

// Выполняем запрос
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Обработка ошибок
if ($error) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Proxy error: ' . $error
    ]);
    exit;
}

// Возвращаем ответ
http_response_code($httpCode);
echo $response;
