-- Добавление поля currency в таблицу deposits
-- Если поле уже существует, выполните команду вручную через ALTER TABLE

ALTER TABLE deposits ADD COLUMN currency VARCHAR(10) DEFAULT 'USDT' AFTER transaction_hash;
