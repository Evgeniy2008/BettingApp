-- SQL запрос для создания таблицы чата поддержки
-- Выполните этот запрос в вашей базе данных MySQL

CREATE TABLE IF NOT EXISTS support_chat (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    admin_id INT NULL,
    message TEXT NOT NULL,
    is_from_user BOOLEAN NOT NULL DEFAULT TRUE,
    is_ai_response BOOLEAN NOT NULL DEFAULT FALSE,
    is_operator_connected BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    INDEX idx_operator_connected (is_operator_connected)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Проверка создания таблицы
SELECT 'Table support_chat created successfully' AS status;
