-- Index facultatifs : appliquer après sauvegarde, séparément du déploiement.
CREATE INDEX IF NOT EXISTS idx_clients_bank_created ON clients(bank_id,created_at);
CREATE INDEX IF NOT EXISTS idx_accounts_bank_created ON accounts(bank_id,created_at);
CREATE INDEX IF NOT EXISTS idx_moves_bank_created ON moves(bank_id,created_at);
CREATE INDEX IF NOT EXISTS idx_moves_bank_account_created ON moves(bank_id,account_id,created_at);
CREATE INDEX IF NOT EXISTS idx_logs_bank_created ON logs(bank_id,created_at);
