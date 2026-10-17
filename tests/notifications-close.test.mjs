import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
test('bouton fermer notification a un identifiant dédié',()=>{assert.match(html, /id="noticeClose"/);assert.doesNotMatch(html, /onclick\s*=/i);});
test('clic fermer appelle dialog.close via JS externe compatible CSP',()=>{assert.match(js,/\$\('#noticeClose'\)\.addEventListener\('click'/);assert.match(js,/if\(dialog\.open\)dialog\.close\(\)/);assert.match(worker,/script-src 'self'/);});
