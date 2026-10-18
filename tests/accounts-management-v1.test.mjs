import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../migrations/0005_accounts_management.sql',import.meta.url),'utf8');

test('account queries scoped to authenticated institution',()=>{
 assert.match(worker,/WHERE a\.institution_id=\?'\+filter\+match/);
 assert.match(worker,/WHERE id=\? AND institution_id=\? AND active=1/);
});
test('account status changes require administrator and reason',()=>{
 assert.match(worker,/p\.endsWith\('\/status'\).*method==='POST'/);
 assert.match(worker,/BLOCK_REASON_REQUIRED/);
 assert.match(worker,/u\.role!=='admin'/);
});
test('no direct balance manipulation in new features',()=>{
 const section=worker.split('// Gestion des types par institution')[1].split("if(p==='/api/accounts'&&method==='POST')")[0];
 assert.doesNotMatch(section,/UPDATE accounts SET balance/);
});
test('pagination limit 15 and database filtering',()=>{
 assert.match(worker,/LIMIT 16 OFFSET \?/);
 assert.match(worker,/results\.slice\(0,15\)/);
 assert.match(app,/loadAccountDirectory/);
});
test('migration retains accounts without destructive changes',()=>{
 assert.match(migration,/ALTER TABLE accounts ADD COLUMN account_type_id/);
 assert.match(migration,/ALTER TABLE accounts ADD COLUMN block_reason/);
 assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM accounts/i);
});
