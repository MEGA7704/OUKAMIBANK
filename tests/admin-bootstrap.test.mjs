import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const x=readFileSync(new URL('../scripts/bootstrap-admin.mjs',import.meta.url),'utf8');
test('superadmin email fixed and dedicated database',()=>{assert.match(x,/mega@services\.local/);assert.match(x,/mega_bank_db/)});
test('password is entered at runtime and SQL avoids replacing users',()=>{assert.match(x,/async function secret/);assert.match(x,/WHERE NOT EXISTS/);assert.doesNotMatch(x,/Kf02071987@/)});
