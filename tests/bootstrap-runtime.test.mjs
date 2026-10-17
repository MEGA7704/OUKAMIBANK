import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../public/_worker.js';
const makeDB=()=>{
 const users=[];
 const names=['institutions','users','sessions','plans','clients','accounts','transactions','audit_logs'];
 return {users,prepare(sql){let values=[];return {bind(...args){values=args;return this},async all(){if(sql.includes('sqlite_master'))return {results:names.map(name=>({name}))};if(sql.includes('table_info(users)'))return {results:['password_hash','password_salt','password_iterations','active','role','institution_id','force_password_change'].map(name=>({name}))};throw Error('Unknown all: '+sql)},async first(){if(sql.includes('role=\'superadmin\''))return {n:users.filter(x=>x.role==='superadmin'&&(!sql.includes('AND active')||x.active)).length};if(sql.includes('COUNT(*) AS n FROM users'))return {n:users.length};throw Error('Unknown first: '+sql)},async run(){if(sql.includes('INSERT INTO users(')){if(users.length===0){users.push({role:'superadmin',active:1,email:values[1],hash:values[2],salt:values[3]});return {meta:{changes:1}}}return {meta:{changes:0}}}throw Error('Unknown run: '+sql)}}}};
};
test('first status initializes admin; second status cannot reset it',async()=>{
 const DB=makeDB();const env={DB,SUPER_ADMIN_EMAIL:'mega@services.local',SUPER_ADMIN_INITIAL_PASSWORD:'Test-only-secret-12345'};
 const url='https://example.pages.dev/api/setup-status';
 const a=await (await worker.fetch(new Request(url),env)).json();
 assert.equal(a.ready,true);assert.equal(a.bootstrap,'ADMIN_CREATED');
 assert.equal(DB.users[0].email,'mega@services.local');assert.match(DB.users[0].hash,/^[0-9a-f]{64}$/);
 const hash=DB.users[0].hash;
 const b=await (await worker.fetch(new Request(url),{...env,SUPER_ADMIN_INITIAL_PASSWORD:'other-secret-password'})).json();
 assert.equal(b.ready,true);assert.equal(DB.users.length,1);assert.equal(DB.users[0].hash,hash);
});
test('missing secret gives explicit error, not SERVER_ERROR',async()=>{
 const DB=makeDB(); const response=await (await worker.fetch(new Request('https://example.pages.dev/api/setup-status'),{DB,SUPER_ADMIN_EMAIL:'mega@services.local'})).json();
 assert.equal(response.error,'SUPERADMIN_NOT_INITIALIZED');assert.equal(response.bootstrap,'MISSING_OR_INVALID_ADMIN_SECRET');assert.equal(DB.users.length,0);
});
