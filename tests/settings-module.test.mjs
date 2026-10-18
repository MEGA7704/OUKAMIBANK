import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const sql=readFileSync(new URL('../migrations/0004_settings.sql',import.meta.url),'utf8');
test('settings bank profile and terms are tenant scoped',()=>{
 assert.match(worker,/bank=u\.institution_id/);
 assert.match(worker,/FROM bank_profiles WHERE institution_id=\?/);
 assert.match(worker,/FROM bank_membership_terms WHERE institution_id=\?/);
 assert.match(worker,/ON CONFLICT\(institution_id\)/);
});
test('agent reset only permits subordinate roles and checks administrator secret',()=>{
 assert.match(worker,/role IN \('teller','auditor'\)/);
 assert.match(worker,/BAD_CURRENT_PASSWORD/);
 assert.match(worker,/DELETE FROM sessions WHERE user_id=\?/);
});
test('all five settings tabs are present',()=>{
 for(const x of ['Profil banque','Mon abonnement','Demandes de mot de passe oublié','Gestion des utilisateurs','Conditions générales d’adhésion'])assert.ok(app.includes(x));
});
test('settings migration does not drop financial records',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS bank_profiles/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS bank_membership_terms/);
 assert.doesNotMatch(sql,/\bDROP\b|DELETE FROM accounts|DELETE FROM transactions/);
});
