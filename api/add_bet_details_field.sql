-- Добавление поля bet_details для хранения деталей экспресс-ставок
-- MySQL не поддерживает IF NOT EXISTS в ALTER TABLE, поэтому используем процедуру
DELIMITER $$

DROP PROCEDURE IF EXISTS AddBetDetailsColumn$$

CREATE PROCEDURE AddBetDetailsColumn()
BEGIN
    DECLARE column_exists INT DEFAULT 0;
    
    SELECT COUNT(*) INTO column_exists
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'bets'
      AND COLUMN_NAME = 'bet_details';
    
    IF column_exists = 0 THEN
        ALTER TABLE bets ADD COLUMN bet_details JSON NULL AFTER admin_notes;
    END IF;
END$$

DELIMITER ;

CALL AddBetDetailsColumn();

DROP PROCEDURE IF EXISTS AddBetDetailsColumn;
