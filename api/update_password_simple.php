<?php
// Скрипт для обновления пароля на простой (без шифрования)
require_once 'config.php';

$newPassword = 'admin123'; // Новый простой пароль

try {
    $db = getDB();
    $stmt = $db->prepare("UPDATE admin_settings SET setting_value = ? WHERE setting_key = 'admin_password'");
    $stmt->execute([$newPassword]);
    
    echo "✓ Пароль успешно обновлен!\n";
    echo "Новый пароль: $newPassword\n";
    echo "\nТеперь вы можете войти в админку с этим паролем.\n";
} catch (Exception $e) {
    echo "✗ Ошибка: " . $e->getMessage() . "\n";
}
