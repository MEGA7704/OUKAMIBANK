import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('bank admin creation requires superadmin and active institution',()=>{
 assert.match(worker,/p==='\/api\/admin\/bank-admins'&&u\.role==='superadmin'&&method==='POST'/);
 assert.match(worker,/SELECT id FROM institutions WHERE id=\? AND active=1/);
 assert.match(worker,/role,password_hash,password_salt,password_iterations,active,force_password_change\) VALUES\(\?,\?,\?,\?,\?,\?,\?,\?,1,1\)/);
});
test('generated password is random, never stored in audit and returned once',()=>{
 assert.match(worker,/const initialPassword=hex\(crypto\.getRandomValues\(new Uint8Array\(24\)\)\)/);
 assert.match(worker,/BANK_ADMIN_CREATED',uid/);
 assert.match(worker,/temporary_password:initialPassword/);
 assert.doesNotMatch(worker,/audit\(db,u,'BANK_ADMIN_CREATED',initialPassword/);
});
test('frontend generates admin without requesting a user-chosen password',()=>{
 assert.match(app,/Créer un administrateur bancaire/);
 assert.match(app,/api\('admin\/bank-admins'/);
 assert.match(app,/oneTimePassword/);
 assert.match(app,/skipDefault:true/);
});
