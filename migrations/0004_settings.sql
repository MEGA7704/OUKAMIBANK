-- MEGA BANK Paramètres : extension non destructive. Appliquer UNE FOIS sur mega_bank_db.
CREATE TABLE IF NOT EXISTS bank_profiles (
 institution_id TEXT PRIMARY KEY REFERENCES institutions(id),
 slogan TEXT NOT NULL DEFAULT '',responsible TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '',city TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT 'Côte d’Ivoire',currency TEXT NOT NULL DEFAULT 'FCFA',
 primary_color TEXT NOT NULL DEFAULT '#174d40',secondary_color TEXT NOT NULL DEFAULT '#b59150',
 footer_text TEXT NOT NULL DEFAULT '',legal_notice TEXT NOT NULL DEFAULT '',logo_data TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bank_membership_terms (
 institution_id TEXT PRIMARY KEY REFERENCES institutions(id),body TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS users_bank_role ON users(institution_id,role,active);
