<?php
// Скрипт для проверки и генерации хэша пароля

$password = 'Admin@2024!Secure#Pass';
$hash = password_hash($password, PASSWORD_DEFAULT);

echo "Пароль: $password\n";
echo "Хэш: $hash\n\n";

// Проверка
if (password_verify($password, $hash)) {
    echo "✓ Хэш правильный, пароль проверяется успешно\n";
} else {
    echo "✗ Ошибка проверки пароля\n";
}

// Проверка существующего хэша из БД
$dbHash = '$2y$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
echo "\nПроверка хэша из БД:\n";
if (password_verify($password, $dbHash)) {
    echo "✓ Существующий хэш правильный\n";
} else {
    echo "✗ Существующий хэш НЕПРАВИЛЬНЫЙ, нужен новый\n";
    echo "Новый хэш для БД: $hash\n";
}
