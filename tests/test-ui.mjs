import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
const js=readFileSync('public/app.js','utf8'),css=readFileSync('public/styles.css','utf8');
test('auth hidden CSS',()=>assert.match(css,/\.auth\[hidden\].*display:none !important/s));
test('change required routes to profile',()=>assert.match(js,/if\(requirePasswordChange\)p='profile'/));
test('initial password change screen is visible',()=>assert.match(js,/password-required-notice/));
test('password endpoint invoked',()=>assert.match(js,/api\('password'/));
