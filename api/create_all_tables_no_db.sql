-- =====================================================
-- SQL ДЛЯ СОЗДАНИЯ ВСЕХ ТАБЛИЦ (БЕЗ СОЗДАНИЯ БД)
-- =====================================================
-- Используйте этот файл, если база данных уже создана
-- Убедитесь, что вы выбрали нужную БД: USE betsbot_db;
-- =====================================================

-- =====================================================
-- ТАБЛИЦА ПОЛЬЗОВАТЕЛЕЙ
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    telegram_id VARCHAR(255) NULL UNIQUE,
    telegram_username VARCHAR(255) NULL,
    session_token VARCHAR(64) UNIQUE NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    credit_limit DECIMAL(15, 2) DEFAULT 0.00,
    current_debt DECIMAL(15, 2) DEFAULT 0.00,
    total_staked DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_session_token (session_token),
    INDEX idx_telegram_id (telegram_id),
    INDEX idx_telegram_username (telegram_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА ЗАЯВОК НА ПОПОЛНЕНИЕ
-- =====================================================
CREATE TABLE IF NOT EXISTS deposits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    transaction_hash VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USDT',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА ЗАЯВОК НА ВЫВОД
-- =====================================================
CREATE TABLE IF NOT EXISTS withdrawals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    wallet_address VARCHAR(255) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USDT',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА СТАВОК
-- =====================================================
CREATE TABLE IF NOT EXISTS bets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    bet_id VARCHAR(50) UNIQUE NOT NULL,
    user_id INT NOT NULL,
    match_id VARCHAR(100) NOT NULL,
    fixture_id VARCHAR(100) NULL,
    line_id VARCHAR(100) NULL,
    match_home VARCHAR(255) NOT NULL,
    match_away VARCHAR(255) NOT NULL,
    match_league VARCHAR(255) NULL,
    outcome_key VARCHAR(50) NOT NULL,
    outcome_label VARCHAR(255) NOT NULL,
    outcome_type VARCHAR(50) NULL,
    outcome_value VARCHAR(50) NULL,
    odd DECIMAL(10, 3) NOT NULL,
    stake DECIMAL(15, 2) NOT NULL,
    potential_win DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'active', 'won', 'lost', 'cancelled', 'refunded') DEFAULT 'pending',
    win_amount DECIMAL(15, 2) NULL,
    settled_at TIMESTAMP NULL,
    cancelled_at TIMESTAMP NULL,
    admin_notes TEXT NULL,
    bet_details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_bet_id (bet_id),
    INDEX idx_status (status),
    INDEX idx_match_id (match_id),
    INDEX idx_fixture_id (fixture_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА НАСТРОЕК АДМИНКИ
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА СЕССИЙ АДМИНА
-- =====================================================
CREATE TABLE IF NOT EXISTS admin_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (token),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================
-- ТАБЛИЦА ЗАПРОСОВ НА УВЕЛИЧЕНИЕ КРЕДИТНОГО ЛИМИТА
-- =====================================================
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

-- =====================================================
-- НАЧАЛЬНЫЕ ДАННЫЕ
-- =====================================================

-- Настройки админки
-- Пароль по умолчанию: admin123
-- ВАЖНО: Измените пароль после первого входа!
INSERT INTO admin_settings (setting_key, setting_value) VALUES
('admin_password', 'admin123'),
('deposit_wallet_usdt', '')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- =====================================================
-- ГОТОВО!
-- =====================================================
-- Все таблицы созданы
-- =====================================================
