import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const worker=readFileSync(new URL('../public/_worker.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
test('shared financial overview has institution-scoped aggregate queries and role guard',()=>{
 assert.match(worker,/p==='\/api\/financial\/overview'/);
 assert.match(worker,/\['admin','auditor'\]\.includes\(u\.role\)/);
 assert.match(worker,/monthly_obligations WHERE institution_id=\?/);
 assert.match(worker,/enterprise_treasury WHERE institution_id=\?/);
 assert.match(worker,/account_contract_drafts WHERE institution_id=\?/);
});
test('dashboard consumes overview without turning cash and client balances into revenue',()=>{
 assert.match(ui,/api\('financial\/overview'\)/);
 assert.match(ui,/Trésorerie entreprise/);
 assert.match(ui,/Ils ne sont pas additionnés pour former un bénéfice/);
 assert.match(worker,/revenue_classification_available:false/);
});
