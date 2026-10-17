import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const worker=readFileSync('public/_worker.js','utf8'),ui=readFileSync('public/app.js','utf8');
test('atomic institution+admin route',()=>{assert.match(worker,/institutions-with-admin/);assert.match(worker,/await db\.batch\(\[/);assert.match(worker,/u\.role!==\'superadmin\'/)});
test('company creation includes admin fields',()=>{assert.match(ui,/institution_name/);assert.match(ui,/admin_email/);assert.match(ui,/institutions-with-admin/)});
test('passwords not serialized in HTML attributes',()=>{assert.match(ui,/oneTimePassword'\)\.value=r\.temporary_password/);assert.doesNotMatch(ui,/value="'\+esc\(result\.temporary_password\)/)});
test('profile response excludes password fields',()=>{assert.match(worker,/if\(p===\'\/api\/me\'/);assert.doesNotMatch(worker,/user:\{[^}]*password_hash/)});
