-- Appliquer UNE SEULE FOIS sur mega_bank_db APRES sauvegarde.
-- Vérifier PRAGMA table_info(accounts); pour éviter toute réexécution des ALTER.
CREATE TABLE IF NOT EXISTS account_types (
 id TEXT PRIMARY KEY,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 label TEXT NOT NULL,
 base_kind TEXT NOT NULL DEFAULT 'CURRENT' CHECK(base_kind='CURRENT'),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(institution_id,label)
);
CREATE UNIQUE INDEX IF NOT EXISTS account_types_unique_label ON account_types(institution_id,lower(label));
CREATE INDEX IF NOT EXISTS account_types_institution ON account_types(institution_id,active);
ALTER TABLE accounts ADD COLUMN account_type_id TEXT REFERENCES account_types(id);
ALTER TABLE accounts ADD COLUMN block_reason TEXT;
