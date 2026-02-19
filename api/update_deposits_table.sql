-- Добавление поля currency в таблицу deposits
-- Если поле уже существует, эта команда выдаст ошибку, но это нормально
ALTER TABLE deposits ADD COLUMN currency VARCHAR(10) DEFAULT 'USDT' AFTER transaction_hash;

-- Обновление пароля на простой (без шифрования)
UPDATE admin_settings SET setting_value = 'admin123' WHERE setting_key = 'admin_password';
