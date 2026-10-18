-- Ajouter après 0001–0006. Ne supprime aucune écriture financière.
CREATE TABLE IF NOT EXISTS monthly_obligations (
 id TEXT PRIMARY KEY,
 institution_id TEXT NOT NULL REFERENCES institutions(id),
 label TEXT NOT NULL,
 basis TEXT NOT NULL CHECK(basis IN ('GENERAL','SERVICE')),
 service_code TEXT NOT NULL DEFAULT '',
 amount INTEGER NOT NULL CHECK(amount>=0),
 active INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS monthly_obligations_bank ON monthly_obligations(institution_id,active);
