-- Quatre abonnements, durée gérée par le Super Admin; pas de réinitialisation des banques existantes.
CREATE INDEX IF NOT EXISTS idx_banks_subscription ON banks(subscription,status,subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_bank_auth ON users(bank_id,status,auth_version);
CREATE INDEX IF NOT EXISTS idx_moves_bank_date ON moves(bank_id,created_at);
