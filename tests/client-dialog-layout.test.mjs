import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync(new URL('../public/app.js', import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css', import.meta.url),'utf8');
test('large client form enabled only for client inscription',()=>{assert.match(js,/classList\.toggle\('client-registration-modal',title==='Inscription d’un nouveau client'\)/)});
test('responsive grid and no horizontal overflow',()=>{assert.match(css,/#modal\.client-registration-modal #fields\s*\{[^}]*overflow-x:hidden/s);assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:940px\)/);assert.match(css,/@media\(max-width:580px\)/)});
test('all identity fields kept in original form',()=>{for(const x of ['last_name','first_name','birth_date','identity_number','emergency_relation','company_name','registration','representative_id_number'])assert.ok(js.includes(x),x)});
