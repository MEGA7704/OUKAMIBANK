import test from 'node:test';
import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import worker from '../public/_worker.js';
test('Worker crypto bootstrapping uses exact PBKDF2-SHA256 100000-iteration hash',async()=>{
 const users=[];
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this},async all(){if(sql.includes('sqlite_master'))return {results:['institutions','users','sessions','plans','clients','accounts','transactions','audit_logs'].map(name=>({name}))};if(sql.includes('table_info(users)'))return {results:['password_hash','password_salt','password_iterations','active','role','institution_id','force_password_change'].map(name=>({name}))};throw Error(sql)},async first(){if(sql.includes('COUNT(*) AS n'))return {n:users.length};throw Error(sql)},async run(){if(sql.includes('INSERT INTO users')){users.push({email:args[1],password_hash:args[2],password_salt:args[3],iterations:args[4]});return {meta:{changes:1}}}throw Error(sql)}}}};
 const pass='CorrectHorseBatteryForTesting123!';
 const r=await (await worker.fetch(new Request('https://example.com/api/setup-status'),{DB,SUPER_ADMIN_EMAIL:'mega@services.local',SUPER_ADMIN_INITIAL_PASSWORD:pass})).json();
 assert.equal(r.ready,true);assert.equal(r.bootstrap,'ADMIN_CREATED');assert.equal(users.length,1);
 assert.equal(users[0].iterations,100000);
 assert.equal(users[0].password_hash,pbkdf2Sync(pass,Buffer.from(users[0].password_salt,'hex'),100000,32,'sha256').toString('hex'));
});
