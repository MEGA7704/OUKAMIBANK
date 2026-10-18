-- Appliquer après 0001 à 0005, une seule fois; sauvegarder D1 au préalable.
-- Compte entreprise distinct des comptes de clients : pas de client fictif ni d'écriture client.
CREATE TABLE IF NOT EXISTS enterprise_treasury (
 institution_id TEXT PRIMARY KEY REFERENCES institutions(id),
 balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS enterprise_treasury_entries (
 id TEXT PRIMARY KEY,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 operation_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('SUPPLY','DISBURSEMENT')),
 amount INTEGER NOT NULL CHECK(amount > 0),
 balance_after INTEGER NOT NULL CHECK(balance_after >= 0),
 description TEXT NOT NULL DEFAULT '',
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(institution_id,operation_key)
);
CREATE INDEX IF NOT EXISTS enterprise_treasury_entries_bank_date ON enterprise_treasury_entries(institution_id,created_at DESC);
-- La mise à jour du solde et l'écriture forment UNE opération SQLite atomique.
CREATE TRIGGER IF NOT EXISTS enterprise_entry_apply BEFORE INSERT ON enterprise_treasury_entries
BEGIN
 SELECT CASE WHEN (SELECT active FROM institutions WHERE id=NEW.institution_id)!=1 THEN RAISE(ABORT,'INSTITUTION_INACTIVE') END;
 INSERT OR IGNORE INTO enterprise_treasury(institution_id,balance) VALUES(NEW.institution_id,0);
 UPDATE enterprise_treasury SET balance=balance + CASE WHEN NEW.kind='SUPPLY' THEN NEW.amount ELSE -NEW.amount END
 WHERE institution_id=NEW.institution_id AND balance + CASE WHEN NEW.kind='SUPPLY' THEN NEW.amount ELSE -NEW.amount END >= 0;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'INSUFFICIENT_ENTERPRISE_FUNDS') END;
 SELECT CASE WHEN NEW.balance_after != (SELECT balance FROM enterprise_treasury WHERE institution_id=NEW.institution_id) THEN RAISE(ABORT,'INVALID_ENTERPRISE_BALANCE') END;
END;
CREATE TRIGGER IF NOT EXISTS enterprise_entry_immutable_update BEFORE UPDATE ON enterprise_treasury_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ENTERPRISE_LEDGER'); END;
CREATE TRIGGER IF NOT EXISTS enterprise_entry_immutable_delete BEFORE DELETE ON enterprise_treasury_entries BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ENTERPRISE_LEDGER'); END;

-- Conditions contractuelles, distinctes des écritures. Les contrats sont enregistrés en préparation.
CREATE TABLE IF NOT EXISTS account_contract_drafts (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id),
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 kind TEXT NOT NULL CHECK(kind IN ('CREDIT','TERM','CURRENT','SAVINGS','DEPOSIT','COLLECTION')),
 terms_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status='DRAFT'),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS account_contract_drafts_bank ON account_contract_drafts(institution_id,kind);
