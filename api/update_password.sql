-- Обновление пароля администратора на простой (без шифрования)
-- Пароль по умолчанию: admin123

UPDATE admin_settings SET setting_value = 'admin123' WHERE setting_key = 'admin_password';
