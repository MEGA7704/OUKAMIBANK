import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../public/_worker.js';
import { pbkdf2Sync } from 'node:crypto';
function fakeDB(){
 const state={user:{id:'admin-1',email:'mega@services.local',role:'superadmin',active:1},markers:new Set(),sessions:2};
 return {state,prepare(sql){let args=[];return {bind(...x){args=x;return this},get sql(){return sql},get args(){return args},async first(){if(sql.startsWith('SELECT id FROM users'))return state.user.email===args[0]?{id:state.user.id}:null;throw Error('unexpected query')}}},async batch(statements){
  assert.equal(statements.length,3);
  const marker=statements[0].args[0];
  if(state.markers.has(marker))throw Error('UNIQUE constraint failed: audit_logs.id');
  state.markers.add(marker);
  const fields=statements[1].args;
  state.user.digest=fields[0];state.user.salt=fields[1];state.user.iterations=fields[2];state.user.force_password_change=0;state.sessions=0;
  return [{meta:{changes:1}},{meta:{changes:1}},{meta:{changes:2}}];
 }};
}
const base='https://mega-bank.example/api/admin/recover';
const token='test-only-high-entropy-token-for-tests-ABCD1234';
function request(secret=token,password='NewPasswordForTestingOnly!'){
 return new Request(base,{method:'POST',headers:{'content-type':'application/json','x-mega-recovery-token':secret,origin:'https://mega-bank.example'},body:JSON.stringify({new_password:password})});
}
test('recovery changes only admin hash, clears sessions, and is single use',async()=>{
 const DB=fakeDB(),CACHE={async get(){return null},async put(){},async delete(){}};
 const env={DB,CACHE,SUPER_ADMIN_RECOVERY_TOKEN:token,SUPER_ADMIN_EMAIL:'mega@services.local'};
 const reply=await worker.fetch(request(),env);assert.equal(reply.status,200);assert.equal((await reply.json()).code,'PASSWORD_RESET_SUCCESS');
 const a=DB.state.user;
 assert.equal(a.iterations,100000);assert.equal(a.force_password_change,0);assert.equal(DB.state.sessions,0);
 assert.equal(a.digest,pbkdf2Sync('NewPasswordForTestingOnly!',Buffer.from(a.salt,'hex'),100000,32,'sha256').toString('hex'));
 const again=await worker.fetch(request(),env);assert.equal(again.status,409);
 assert.equal((await again.json()).error,'RECOVERY_TOKEN_ALREADY_USED');
});
test('recovery refuses missing token, weak password and missing secret',async()=>{
 const DB=fakeDB(),CACHE={async get(){return null},async put(){},async delete(){}};
 const env={DB,CACHE,SUPER_ADMIN_RECOVERY_TOKEN:token,SUPER_ADMIN_EMAIL:'mega@services.local'};
 let response=await worker.fetch(request('wrong token'),env);assert.equal(response.status,403);
 response=await worker.fetch(request(token,'abc'),env);assert.equal(response.status,403);
 response=await worker.fetch(request(token,'GoodPassword!123'),{DB,CACHE});assert.equal(response.status,503);
 assert.equal(DB.state.markers.size,0);
});
