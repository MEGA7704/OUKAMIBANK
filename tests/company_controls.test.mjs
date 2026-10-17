import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('creation accepts chosen password and does not force change',()=>{
 assert.match(api,/String\(body\.admin_password\|\|''\)/);
 assert.match(api,/temporaryPassword\.length<12/);
 assert.match(api,/1,0\)'\)\.bind\(adminId/);
 assert.match(api,/force_password_change:false/);
 assert.doesNotMatch(api,/temporary_password:temporaryPassword/);
 assert.match(ui,/Mot de passe initial/);
});
test('company edit/delete require superadmin and confirmation',()=>{
 assert.match(api,/u\.role==='superadmin'&&p==='\/api\/admin\/institutions\/edit'/);
 assert.match(api,/u\.role==='superadmin'&&p==='\/api\/admin\/institutions\/delete'/);
 assert.match(api,/body\.confirm!== 'SUPPRIMER'/);
 assert.match(api,/INSTITUTION_HAS_DATA/);
 assert.match(ui,/data-action="delete"/);
 assert.match(ui,/data-action="edit"/);
});
