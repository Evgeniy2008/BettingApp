<?php
// Скрипт для исправления пароля в базе данных
require_once 'config.php';

$password = 'Admin@2024!Secure#Pass';
$hash = password_hash($password, PASSWORD_DEFAULT);

try {
    $db = getDB();
    $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'admin_password'");
    $stmt->execute([$hash]);
    
    echo "✓ Пароль успешно обновлен в базе данных!\n";
    echo "Пароль: $password\n";
    echo "Хэш: $hash\n\n";
    
    // Проверка
    $stmt = $db->prepare("SELECT setting_value FROM admin_settings WHERE setting_key = 'admin_password'");
    $stmt->execute();
    $result = $stmt->fetch();
    
    if ($result && password_verify($password, $result['setting_value'])) {
        echo "✓ Проверка: пароль работает правильно!\n";
    } else {
        echo "✗ Ошибка проверки!\n";
    }
} catch (Exception $e) {
    echo "✗ Ошибка: " . $e->getMessage() . "\n";
}
