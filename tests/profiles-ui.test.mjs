import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('access choices visible, client reserved safely',()=>{for(const v of ['admin','agent','client'])assert.match(html,new RegExp('value="'+v+'"'));assert.match(html,/value="client" disabled/)});
test('server validates role vs login access',()=>{assert.match(worker,/ACCESS_PROFILE_MISMATCH/);assert.match(worker,/body.access==='agent'/);assert.match(worker,/body.access==='admin'/)});
test('password toggles and explicit module scope',()=>{assert.match(app,/toggle-password/);assert.match(app,/Module non encore opérationnel/)});
