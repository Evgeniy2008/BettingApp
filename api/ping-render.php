<?php
/**
 * Скрипт для "пробуждения" Render сервиса
 * Используйте этот файл в Cron Job на Hostinger, чтобы Render не "засыпал"
 * 
 * Настройка Cron Job в hPanel:
 * - Путь: /api/ping-render.php
 * - Частота: каждые 10 минут (*/10 * * * *)
 */

// URL вашего Render сервиса (замените на ваш!)
$renderUrl = 'https://betsbot-xxxx.onrender.com/health';

// Выполняем запрос
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $renderUrl);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Логирование (опционально)
$logFile = __DIR__ . '/ping-render.log';
$logMessage = date('Y-m-d H:i:s') . " - HTTP $httpCode";
if ($error) {
    $logMessage .= " - Error: $error";
} else {
    $logMessage .= " - OK";
}
$logMessage .= "\n";

// Записываем в лог (первые 1000 строк, чтобы не переполнять)
if (file_exists($logFile)) {
    $lines = file($logFile);
    if (count($lines) > 1000) {
        $lines = array_slice($lines, -900); // Оставляем последние 900 строк
    }
    file_put_contents($logFile, implode('', $lines) . $logMessage);
} else {
    file_put_contents($logFile, $logMessage);
}

// Возвращаем результат
if ($httpCode === 200) {
    echo "OK - Render service is awake\n";
} else {
    echo "Warning - HTTP $httpCode\n";
}
