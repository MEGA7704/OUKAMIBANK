PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS institutions(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,institution_id TEXT REFERENCES institutions(id),email TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('superadmin','admin','teller','auditor')),password_hash TEXT NOT NULL,password_salt TEXT NOT NULL,password_iterations INTEGER NOT NULL DEFAULT 310000,active INTEGER NOT NULL DEFAULT 1,session_version INTEGER NOT NULL DEFAULT 1,force_password_change INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(id_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf_hash TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS plans(code TEXT PRIMARY KEY,price INTEGER NOT NULL,duration_days INTEGER NOT NULL);
INSERT OR IGNORE INTO plans(code,price,duration_days) VALUES('FREE',0,10),('STANDARD',20000,30),('BUSINESS',200000,365),('ULTIMATE',600000,30);
CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY,institution_id TEXT NOT NULL REFERENCES institutions(id),plan_code TEXT NOT NULL REFERENCES plans(code),start_at TEXT NOT NULL,end_at TEXT NOT NULL,created_by TEXT REFERENCES users(id));
CREATE INDEX IF NOT EXISTS subs_institution ON subscriptions(institution_id,start_at);
CREATE TABLE IF NOT EXISTS clients(id TEXT PRIMARY KEY,institution_id TEXT NOT NULL REFERENCES institutions(id),number TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('PERSON','COMPANY')),name TEXT NOT NULL,phone TEXT,identity_ref TEXT,details_json TEXT,block_reason TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(institution_id,number));
CREATE INDEX IF NOT EXISTS clients_inst ON clients(institution_id,created_at);
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,institution_id TEXT NOT NULL REFERENCES institutions(id),client_id TEXT NOT NULL REFERENCES clients(id),number TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('CURRENT','SAVINGS','DEPOSIT','CREDIT','TERM','COLLECTION')),balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','BLOCKED','CLOSED')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(institution_id,number));
CREATE INDEX IF NOT EXISTS accounts_inst ON accounts(institution_id,client_id);
CREATE TABLE IF NOT EXISTS transactions(id TEXT PRIMARY KEY,institution_id TEXT NOT NULL REFERENCES institutions(id),operation_key TEXT NOT NULL,leg INTEGER NOT NULL DEFAULT 1,account_id TEXT NOT NULL REFERENCES accounts(id),kind TEXT NOT NULL CHECK(kind IN ('DEPOSIT','WITHDRAWAL','TRANSFER_IN','TRANSFER_OUT')),amount INTEGER NOT NULL CHECK(amount > 0),delta INTEGER NOT NULL CHECK(delta != 0),reference TEXT NOT NULL,description TEXT,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(institution_id,operation_key,leg));
CREATE INDEX IF NOT EXISTS tx_inst_date ON transactions(institution_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS tx_account_date ON transactions(account_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS transaction_apply BEFORE INSERT ON transactions BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM accounts WHERE id=NEW.account_id AND institution_id=NEW.institution_id AND status='ACTIVE') != 1 THEN RAISE(ABORT,'ACCOUNT_NOT_ACTIVE') END;
 SELECT CASE WHEN (NEW.kind IN ('DEPOSIT','TRANSFER_IN') AND NEW.delta!=NEW.amount) OR (NEW.kind IN ('WITHDRAWAL','TRANSFER_OUT') AND NEW.delta!=-NEW.amount) THEN RAISE(ABORT,'INVALID_DELTA') END;
 UPDATE accounts SET balance=balance+NEW.delta WHERE id=NEW.account_id AND institution_id=NEW.institution_id AND balance+NEW.delta>=0;
 SELECT CASE WHEN changes()!=1 THEN RAISE(ABORT,'INSUFFICIENT_FUNDS') END;
END;
CREATE TRIGGER IF NOT EXISTS transaction_immutable_update BEFORE UPDATE ON transactions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
CREATE TRIGGER IF NOT EXISTS transaction_immutable_delete BEFORE DELETE ON transactions BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
CREATE TABLE IF NOT EXISTS audit_logs(id TEXT PRIMARY KEY,user_id TEXT, institution_id TEXT,action TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS audit_inst_date ON audit_logs(institution_id,created_at DESC);
CREATE TABLE IF NOT EXISTS support_messages(id TEXT PRIMARY KEY,institution_id TEXT,created_by TEXT,body TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TRIGGER IF NOT EXISTS transaction_client_active BEFORE INSERT ON transactions BEGIN SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM accounts a JOIN clients c ON c.id=a.client_id WHERE a.id=NEW.account_id AND a.institution_id=NEW.institution_id AND c.active=1) THEN RAISE(ABORT,'CLIENT_BLOCKED') END; END;
