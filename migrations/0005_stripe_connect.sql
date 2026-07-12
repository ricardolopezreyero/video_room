ALTER TABLE users ADD COLUMN stripe_connect_account_id TEXT;
ALTER TABLE users ADD COLUMN stripe_connect_payouts_enabled INTEGER NOT NULL DEFAULT 0;
