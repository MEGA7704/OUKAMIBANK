import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8');
test('double-entry guard and immutable transaction table',()=>{assert.match(sql,/CREATE TRIGGER IF NOT EXISTS transaction_apply/);assert.match(sql,/INSUFFICIENT_FUNDS/);assert.match(sql,/IMMUTABLE_LEDGER/)});
test('tenant constraints exist',()=>{assert.match(sql,/UNIQUE\(institution_id,operation_key,leg\)/);assert.match(sql,/CREATE TABLE IF NOT EXISTS institutions/)});
