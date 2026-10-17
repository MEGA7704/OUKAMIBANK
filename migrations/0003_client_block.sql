ALTER TABLE clients ADD COLUMN block_reason TEXT;
CREATE TRIGGER IF NOT EXISTS transaction_client_active BEFORE INSERT ON transactions BEGIN
 SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts a JOIN clients c ON c.id=a.client_id WHERE a.id=NEW.account_id AND a.institution_id=NEW.institution_id AND c.active=1) THEN RAISE(ABORT,'CLIENT_BLOCKED') END;
END;
