-- Add fixture_id column to bets table if it doesn't exist
-- Note: MySQL doesn't support IF NOT EXISTS in ALTER TABLE, so run this only if column doesn't exist
-- Check first: SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'bets' AND COLUMN_NAME = 'fixture_id';

ALTER TABLE bets 
ADD COLUMN fixture_id VARCHAR(100) NULL AFTER match_id;

-- Add index for faster lookups
CREATE INDEX idx_fixture_id ON bets(fixture_id);
