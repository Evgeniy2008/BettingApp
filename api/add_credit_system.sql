-- Обновление базы данных для системы кредитования
USE betsbot_db;

-- Добавляем поле для отслеживания текущего долга пользователя
-- Проверяем, существует ли колонка, и добавляем только если её нет
SET @dbname = DATABASE();
SET @tablename = 'users';
SET @columnname = 'current_debt';
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  'SELECT 1',
  CONCAT('ALTER TABLE ', @tablename, ' ADD COLUMN ', @columnname, ' DECIMAL(15, 2) DEFAULT 0.00 AFTER credit_limit')
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Создаем таблицу для запросов на увеличение кредитного лимита
CREATE TABLE IF NOT EXISTS credit_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    requested_limit DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Удаляем BTC и ETH из начальных настроек (оставляем только USDT)
DELETE FROM admin_settings WHERE setting_key IN ('deposit_wallet_btc', 'deposit_wallet_eth');

-- Обновляем кредитный лимит по умолчанию для новых пользователей (если нужно обновить существующих, раскомментируйте следующую строку)
-- UPDATE users SET credit_limit = 0.00 WHERE credit_limit = 250.00;
