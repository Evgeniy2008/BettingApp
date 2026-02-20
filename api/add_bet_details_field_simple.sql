-- Простая версия: добавление поля bet_details (если колонка уже существует, будет ошибка, но это нормально)
-- Выполните этот скрипт только если таблица bets уже создана БЕЗ поля bet_details

ALTER TABLE bets ADD COLUMN bet_details JSON NULL AFTER admin_notes;
