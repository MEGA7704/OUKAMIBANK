import { pbkdf2Sync } from 'node:crypto';
const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...h}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const rand=()=>crypto.randomUUID();
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
// WebCrypto on Cloudflare Workers enforces a PBKDF2 iteration ceiling of 100,000.
// Store the iteration count per user. Older records above that limit can still be
// verified through node:crypto, but new records use the Workers-compatible value.
const NEW_PASSWORD_ITERATIONS=100000;
const pbkdf=async(pass,salt,iter)=>{
 if(!/^(?:[0-9a-f]{2}){16,}$/i.test(salt)||!Number.isInteger(iter)||iter<100000||iter>1000000)throw Error('INVALID_HASH_PARAMETERS');
 if(iter>100000)return pbkdf2Sync(pass,Buffer.from(salt,'hex'),iter,32,'sha256').toString('hex');
 const saltBytes=Uint8Array.from(salt.match(/.{2}/g),v=>parseInt(v,16));
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),{name:'PBKDF2'},false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:iter,hash:'SHA-256'},key,256));
};
const eq=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
const cookie=(value,max=28800)=>`mega_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${max}`;
const cookies=req=>Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=').slice(0,2)).filter(x=>x.length===2));
const csp="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const allowedOrigin=req=>{let origin=req.headers.get('origin');return !origin||origin===new URL(req.url).origin};
const money=v=>Number.isSafeInteger(v)&&v>0&&v<=1000000000000;
const roles={clients:['admin','teller','auditor'],accounts:['admin','teller','auditor'],transactions:['admin','teller','auditor']};
const writable=(u,area)=>u.role==='admin'||(u.role==='teller'&&area!=='institutions');
const within=(x,max=160)=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
async function actor(req,db){const token=cookies(req).mega_session;if(!token||!/^[0-9a-f-]{36}$/.test(token))return null;const idh=await hash(token);const row=await db.prepare(`SELECT s.csrf_hash,s.expires_at,u.id,u.institution_id,u.email,u.display_name,u.role,u.active,u.force_password_change,i.active AS institution_active FROM sessions s JOIN users u ON s.user_id=u.id LEFT JOIN institutions i ON i.id=u.institution_id WHERE s.id_hash=?`).bind(idh).first();if(!row||!row.active||row.institution_id&&!row.institution_active||Date.parse(row.expires_at)<=Date.now())return null;return row}
async function audit(db,u,action,detail){await db.prepare('INSERT INTO audit_logs(id,user_id,institution_id,action,detail) VALUES(?,?,?,?,?)').bind(rand(),u?.id||null,u?.institution_id||null,action,detail||'').run()}
const id=()=>rand();
// Bootstrap is restricted to a completely empty user table. Never repair or reset an existing administrator here.
async function ensureInitialSuperAdmin(db,env){
 const email=String(env.SUPER_ADMIN_EMAIL||'').trim().toLowerCase();
 const password=env.SUPER_ADMIN_INITIAL_PASSWORD;
 const existing=await db.prepare('SELECT COUNT(*) AS n FROM users').first();
 if(Number(existing?.n)>0)return {state:'EXISTING_USERS'};
 if(!email)return {state:'MISSING_ADMIN_EMAIL'};
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {state:'INVALID_ADMIN_EMAIL'};
 if(typeof password!=='string'||password.length<12||password.length>256)return {state:'MISSING_OR_INVALID_ADMIN_SECRET'};
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 const ph=await pbkdf(password,salt,NEW_PASSWORD_ITERATIONS);
 const result=await db.prepare("INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) SELECT ?,NULL,?,'Super Administrateur','superadmin',?,?,?,1,1 WHERE NOT EXISTS (SELECT 1 FROM users)")
  .bind(id(),email,ph,salt,NEW_PASSWORD_ITERATIONS).run();
 return {state:result.meta?.changes===1?'ADMIN_CREATED':'ADMIN_NOT_INSERTED'};
}
async function adminSetupStatus(db,env){
 const required=['institutions','users','sessions','plans','clients','accounts','transactions','audit_logs'];
 const found=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
 const names=new Set((found.results||[]).map(x=>x.name));
 const missing=required.filter(x=>!names.has(x));
 if(missing.length)return {ready:false,error:'DATABASE_SCHEMA_MISSING',missing_tables:missing};
 const columns=await db.prepare('PRAGMA table_info(users)').all();
 const cols=new Set((columns.results||[]).map(x=>x.name));
 const missingColumns=['password_hash','password_salt','password_iterations','active','role','institution_id','force_password_change'].filter(x=>!cols.has(x));
 if(missingColumns.length)return {ready:false,error:'DATABASE_SCHEMA_INCOMPATIBLE',missing_columns:missingColumns};
 const existing=await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='superadmin'").first();
 if(Number(existing?.n)>0)return {ready:true,admin_exists:true};
 let status;
 try{status=await ensureInitialSuperAdmin(db,env)}catch(err){
   console.error('MEGA_BOOTSTRAP_FAILURE',err);
   const message=String(err?.message||err);
   const error=/SQLITE|D1_ERROR|constraint|FOREIGN KEY|no such /i.test(message)?'ADMIN_BOOTSTRAP_DATABASE_ERROR':/PBKDF|crypto|deriveBits|operation/i.test(message)?'ADMIN_BOOTSTRAP_CRYPTO_ERROR':'ADMIN_BOOTSTRAP_RUNTIME_ERROR';
   return {ready:false,error,stage:'bootstrap_insert',hint:'Consulter les logs runtime Cloudflare (MEGA_BOOTSTRAP_FAILURE). Aucun secret nest retourne.'};
 }
 const check=await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='superadmin' AND active=1").first();
 if(Number(check?.n)>0)return {ready:true,admin_exists:true,bootstrap:status.state};
 return {ready:false,error:'SUPERADMIN_NOT_INITIALIZED',bootstrap:status.state};
}
async function route(req,env){const db=env.DB;if(!db)return json({error:'D1_NOT_CONFIGURED'},503);const url=new URL(req.url),p=url.pathname,method=req.method;let body={};if(method==='POST'||method==='PATCH'||method==='PUT'){if(Number(req.headers.get('content-length')||0)>100000)return json({error:'BODY_TOO_LARGE'},413);try{body=await req.json()}catch{return json({error:'INVALID_JSON'},400)}}
if(p==='/api/setup-status'&&method==='GET')return json(await adminSetupStatus(db,env));
// Emergency administrator recovery: separate high-entropy one-use token, never the bootstrap password.
// A deterministic audit_logs primary key makes token reuse fail atomically in D1.batch.
if(p==='/api/admin/recover'&&method==='POST'){
 const configured=env.SUPER_ADMIN_RECOVERY_TOKEN;
 if(typeof configured!=='string'||configured.length<32||configured.length>512)return json({error:'RECOVERY_NOT_CONFIGURED'},503);
 const supplied=req.headers.get('x-mega-recovery-token')||'';
 const newPassword=body?.new_password;
 const email=String(env.SUPER_ADMIN_EMAIL||'mega@services.local').trim().toLowerCase();
 const clientIp=(req.headers.get('cf-connecting-ip')||'unknown').slice(0,128);
 const throttle='admin-recovery:'+await hash(clientIp);
 const failures=Number(await env.CACHE?.get(throttle)||0);
 if(failures>=5)return json({error:'RECOVERY_RATE_LIMITED'},429);
 const allowed=typeof newPassword==='string'&&newPassword.length>=12&&newPassword.length<=256
  &&supplied.length===configured.length&&eq(await hash(supplied),await hash(configured));
 if(!allowed){await env.CACHE?.put(throttle,String(failures+1),{expirationTtl:900});return json({error:'RECOVERY_DENIED'},403)}
 const admin=await db.prepare("SELECT id FROM users WHERE email=? AND role='superadmin' AND active=1").bind(email).first();
 if(!admin)return json({error:'RECOVERY_DENIED'},403);
 const marker=await hash('MEGA_BANK_RECOVERY_V1:'+supplied);
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 const digest=await pbkdf(newPassword,salt,NEW_PASSWORD_ITERATIONS);
 try{
  // D1 batch is transactional; duplicate marker => all statements rolled back.
  await db.batch([
   db.prepare("INSERT INTO audit_logs(id,user_id,institution_id,action,detail) VALUES(?,?,NULL,'SUPERADMIN_PASSWORD_RECOVERED','one-time recovery')").bind(marker,admin.id),
   db.prepare("UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,force_password_change=0,session_version=session_version+1 WHERE id=? AND role='superadmin' AND active=1").bind(digest,salt,NEW_PASSWORD_ITERATIONS,admin.id),
   db.prepare('DELETE FROM sessions WHERE user_id=?').bind(admin.id)
  ]);
 }catch(e){
  if(/UNIQUE|constraint|PRIMARY KEY/i.test(String(e?.message||e)))return json({error:'RECOVERY_TOKEN_ALREADY_USED'},409);
  console.error('MEGA_RECOVERY_DATABASE_FAILURE',e);return json({error:'RECOVERY_DATABASE_ERROR'},503);
 }
 await env.CACHE?.delete(throttle);
 return json({ok:true,code:'PASSWORD_RESET_SUCCESS',next:'REMOVE_RECOVERY_SECRET_AND_REDEPLOY'},200);
}
if(p==='/api/login'&&method==='POST'){
 const setup=await adminSetupStatus(db,env);if(!setup.ready)return json(setup,503);
 const email=String(body.email||'').trim().toLowerCase(),pw=String(body.password||'');if(!email||pw.length>256||!['admin','agent','client'].includes(body.access))return json({error:'INVALID_CREDENTIALS'},401);
 const ip=(req.headers.get('cf-connecting-ip')||'unknown').slice(0,128);const key='login:'+await hash(ip+'|'+email);let attempts=Number(await env.CACHE?.get(key)||0);if(attempts>=8)return json({error:'TOO_MANY_ATTEMPTS'},429);
 const u=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();const valid=u&&u.active&&typeof u.password_salt==='string'&&/^(?:[0-9a-f]{2})+$/i.test(u.password_salt)&&Number.isInteger(u.password_iterations)&&u.password_iterations>=100000&&typeof u.password_hash==='string'&&eq(await pbkdf(pw,u.password_salt,u.password_iterations),u.password_hash);if(valid&&!((body.access==='admin'&&['superadmin','admin'].includes(u.role))||(body.access==='agent'&&['teller','auditor'].includes(u.role))||(body.access==='client'&&u.role==='client')))return json({error:'ACCESS_PROFILE_MISMATCH'},403);
 if(!valid){await env.CACHE?.put(key,String(attempts+1),{expirationTtl:900});return json({error:'INVALID_CREDENTIALS'},401)}
 if(u.institution_id){const inst=await db.prepare('SELECT active FROM institutions WHERE id=?').bind(u.institution_id).first();if(!inst?.active)return json({error:'INSTITUTION_SUSPENDED'},403)}
 await env.CACHE?.delete(key);const token=rand(),csrf=rand();await db.prepare(`INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)`).bind(await hash(token),u.id,await hash(csrf),new Date(Date.now()+28800000).toISOString()).run();await audit(db,u,'LOGIN','');return json({ok:true,csrf,force_password_change:!!u.force_password_change},200,{'set-cookie':cookie(token)});
}
if(p==='/api/logout'&&method==='POST'){const token=cookies(req).mega_session;if(token)await db.prepare('DELETE FROM sessions WHERE id_hash=?').bind(await hash(token)).run();return json({ok:true},200,{'set-cookie':cookie('',0)})}
const u=await actor(req,db);if(!u)return json({error:'UNAUTHORIZED'},401);
if(method!=='GET'&&method!=='HEAD') {const token=req.headers.get('x-csrf-token');if(!token||!eq(await hash(token),u.csrf_hash))return json({error:'CSRF_INVALID'},403)}
if(p==='/api/me'&&method==='GET')return json({user:{id:u.id,name:u.display_name,email:u.email,role:u.role,institution_id:u.institution_id},force_password_change:!!u.force_password_change});
if(p==='/api/password'&&method==='POST') {if(!within(body.current,256)||!within(body.next,256)||body.next.length<12)return json({error:'PASSWORD_REQUIREMENTS'},400);const old=await db.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(u.id).first();if(!eq(await pbkdf(body.current,old.password_salt,old.password_iterations),old.password_hash))return json({error:'BAD_CURRENT_PASSWORD'},403);const salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await pbkdf(body.next,salt,NEW_PASSWORD_ITERATIONS);await db.batch([db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,session_version=session_version+1,force_password_change=0 WHERE id=?').bind(ph,salt,NEW_PASSWORD_ITERATIONS,u.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id)]);await audit(db,u,'PASSWORD_CHANGED','');return json({ok:true},200,{'set-cookie':cookie('',0)})}
if(u.force_password_change)return json({error:'CHANGE_PASSWORD_REQUIRED'},403);
// Banque : Paramètres indépendants par institution.
if(p.startsWith('/api/settings/') && u.institution_id && ['admin','teller','auditor'].includes(u.role)){
 const bank=u.institution_id, administrator=u.role==='admin';
 if(p==='/api/settings/profile'&&method==='GET'){
  const institution=await db.prepare('SELECT id,name,created_at FROM institutions WHERE id=?').bind(bank).first();
  const profile=await db.prepare('SELECT * FROM bank_profiles WHERE institution_id=?').bind(bank).first();
  return json({institution,profile:profile||{}});
 }
 if(p==='/api/settings/profile'&&method==='POST'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const keys=['slogan','responsible','phone','email','address','city','country','currency','primary_color','secondary_color','footer_text','legal_notice','logo_data'];
  const vals=keys.map(k=>String(body[k]||'').trim());
  if(!within(body.name,160)||vals.some((v,i)=>v.length>(keys[i]==='logo_data'?70000:keys[i]==='legal_notice'?3000:400)))return json({error:'INVALID_PROFILE'},400);
  if(!/^#[0-9a-fA-F]{6}$/.test(body.primary_color)||!/^#[0-9a-fA-F]{6}$/.test(body.secondary_color))return json({error:'INVALID_COLOR'},400);
  if(body.logo_data&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.logo_data))return json({error:'INVALID_LOGO'},400);
  await db.batch([
   db.prepare('UPDATE institutions SET name=? WHERE id=?').bind(String(body.name).trim(),bank),
   db.prepare(`INSERT INTO bank_profiles(institution_id,${keys.join(',')},updated_at) VALUES(${Array(keys.length+1).fill('?').join(',')},CURRENT_TIMESTAMP) ON CONFLICT(institution_id) DO UPDATE SET ${keys.map(k=>k+'=excluded.'+k).join(',')},updated_at=CURRENT_TIMESTAMP`).bind(bank,...vals)
  ]);
  await audit(db,u,'BANK_PROFILE_UPDATED',bank);return json({ok:true});
 }
 if(p==='/api/settings/subscription'&&method==='GET'){
  const subscription=await db.prepare('SELECT s.plan_code,s.start_at,s.end_at,s.created_by,p.price,p.duration_days FROM subscriptions s JOIN plans p ON p.code=s.plan_code WHERE s.institution_id=? ORDER BY s.rowid DESC LIMIT 1').bind(bank).first();
  const institution=await db.prepare('SELECT name,created_at FROM institutions WHERE id=?').bind(bank).first();
  const plans=await db.prepare('SELECT code,price,duration_days FROM plans ORDER BY price').all();
  return json({subscription,institution,plans:plans.results});
 }
 if(p==='/api/settings/users'&&method==='GET'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const rows=await db.prepare('SELECT id,display_name,email,role,active,created_at FROM users WHERE institution_id=? ORDER BY created_at DESC LIMIT 200').bind(bank).all();return json({items:rows.results});
 }
 if(p==='/api/settings/users'&&method==='POST'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim(),password=String(body.password||''),role=String(body.role||'');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!within(name,160)||password.length<12||password.length>256||!['teller','auditor'].includes(role))return json({error:'INVALID_USER'},400);
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await pbkdf(password,salt,NEW_PASSWORD_ITERATIONS);
  try{await db.prepare('INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) VALUES(?,?,?,?,?,?,?,?,1,0)').bind(id(),bank,email,name,role,digest,salt,NEW_PASSWORD_ITERATIONS).run()}catch(e){if(/UNIQUE/i.test(String(e)))return json({error:'EMAIL_ALREADY_USED'},409);throw e}
  await audit(db,u,'AGENT_CREATED',email);return json({ok:true},201);
 }
 if(p==='/api/settings/users/status'&&method==='POST'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const target=await db.prepare("SELECT id,active FROM users WHERE id=? AND institution_id=? AND role IN ('teller','auditor')").bind(body.id,bank).first();if(!target)return json({error:'AGENT_NOT_FOUND'},404);
  await db.batch([db.prepare('UPDATE users SET active=?,session_version=session_version+1 WHERE id=? AND institution_id=?').bind(body.active?1:0,target.id,bank),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);
  await audit(db,u,'AGENT_STATUS_CHANGED',target.id);return json({ok:true});
 }
 if(p==='/api/settings/users/reset'&&method==='POST'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const target=await db.prepare("SELECT id FROM users WHERE id=? AND institution_id=? AND role IN ('teller','auditor')").bind(body.id,bank).first();
  if(!target)return json({error:'AGENT_NOT_FOUND'},404);
  const current=String(body.admin_password||''),next=String(body.next_password||'');
  if(current.length>256||next.length<12||next.length>256)return json({error:'PASSWORD_REQUIREMENTS'},400);
  const own=await db.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(u.id).first();
  if(!eq(await pbkdf(current,own.password_salt,own.password_iterations),own.password_hash))return json({error:'BAD_CURRENT_PASSWORD'},403);
  const salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await pbkdf(next,salt,NEW_PASSWORD_ITERATIONS);
  await db.batch([db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,session_version=session_version+1 WHERE id=? AND institution_id=?').bind(digest,salt,NEW_PASSWORD_ITERATIONS,target.id,bank),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(target.id)]);
  await audit(db,u,'AGENT_PASSWORD_RESET',target.id);return json({ok:true});
 }
 if(p==='/api/settings/terms'&&method==='GET'){
  const r=await db.prepare('SELECT body,updated_at FROM bank_membership_terms WHERE institution_id=?').bind(bank).first();return json({body:r?.body||'',updated_at:r?.updated_at||null});
 }
 if(p==='/api/settings/terms'&&method==='POST'){
  if(!administrator)return json({error:'FORBIDDEN'},403);
  const text=String(body.body||'');if(text.length>30000)return json({error:'DOCUMENT_TOO_LONG'},413);
  await db.prepare('INSERT INTO bank_membership_terms(institution_id,body) VALUES(?,?) ON CONFLICT(institution_id) DO UPDATE SET body=excluded.body,updated_at=CURRENT_TIMESTAMP').bind(bank,text).run();
  await audit(db,u,'TERMS_UPDATED',bank);return json({ok:true});
 }
 return json({error:'NOT_FOUND'},404);
}
// Rapports OUKAMI : revenus non disponibles sans écritures classées officiellement.
if(p.startsWith('/api/reports/') && u.institution_id && ['admin','auditor'].includes(u.role)){
 const bank=u.institution_id;
 const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x));
 if(p==='/api/reports/revenues'&&method==='GET'){
  return json({available:false,reason:'Les transactions actuelles ne comportent pas de classification de revenu bancaire. Aucun bénéfice ne peut être déduit des dépôts et retraits.',categories:[],total:0});
 }
 if(p==='/api/reports/obligations'&&method==='GET'){
  const r=await db.prepare('SELECT id,label,basis,service_code,amount,created_at FROM monthly_obligations WHERE institution_id=? AND active=1 ORDER BY label,id').bind(bank).all();
  return json({items:r.results,total:r.results.reduce((s,x)=>s+x.amount,0)});
 }
 if(p==='/api/reports/obligations'&&method==='POST'){
  if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
  const label=String(body.label||'').trim(),basis=String(body.basis||''),amount=Number(body.amount),service=String(body.service_code||'').trim();
  if(!label||label.length>150||!['GENERAL','SERVICE'].includes(basis)||!Number.isSafeInteger(amount)||amount<0||amount>1e12||service.length>120||basis==='SERVICE'&&!service)return json({error:'INVALID_OBLIGATION'},400);
  if(body.id){const existing=await db.prepare('SELECT id FROM monthly_obligations WHERE institution_id=? AND id=? AND active=1').bind(bank,body.id).first();if(!existing)return json({error:'NOT_FOUND'},404);
   await db.prepare('UPDATE monthly_obligations SET label=?,basis=?,service_code=?,amount=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND institution_id=?').bind(label,basis,service,amount,body.id,bank).run();await audit(db,u,'OBLIGATION_UPDATED',body.id);
  }else{const key=id();await db.prepare('INSERT INTO monthly_obligations(id,institution_id,label,basis,service_code,amount) VALUES(?,?,?,?,?,?)').bind(key,bank,label,basis,service,amount).run();await audit(db,u,'OBLIGATION_CREATED',key)}
  return json({ok:true});
 }
 if(p==='/api/reports/obligations/delete'&&method==='POST'){
  if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
  const item=await db.prepare('SELECT id FROM monthly_obligations WHERE id=? AND institution_id=? AND active=1').bind(body.id,bank).first();if(!item)return json({error:'NOT_FOUND'},404);
  await db.prepare('UPDATE monthly_obligations SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND institution_id=?').bind(item.id,bank).run();await audit(db,u,'OBLIGATION_DEACTIVATED',item.id);return json({ok:true});
 }
 if(p==='/api/reports/accounts-summary'&&method==='GET'){
  const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
  if(!validDate(from)||!validDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return json({error:'INVALID_DATE_RANGE'},400);
  const results=await db.prepare(`SELECT a.kind,COUNT(DISTINCT a.id) account_count,
   COALESCE(SUM(CASE WHEN t.kind='DEPOSIT' THEN t.amount ELSE 0 END),0) deposits,
   COALESCE(SUM(CASE WHEN t.kind='WITHDRAWAL' THEN t.amount ELSE 0 END),0) withdrawals
   FROM accounts a LEFT JOIN transactions t ON t.account_id=a.id AND t.institution_id=a.institution_id AND t.created_at>=? AND t.created_at<?
   WHERE a.institution_id=? GROUP BY a.kind ORDER BY a.kind`).bind(from+' 00:00:00',to+' 23:59:59.999',bank).all();
  // COUNT DISTINCT avoids counting the same account once per transaction.
  return json({items:results.results,from,to,notice:'Totaux dépôt/retrait sur la période ; les comptes CREDIT et TERM nécessitent leurs registres contractuels pour afficher une dette ou un placement.'});
 }
 if(p==='/api/reports/accounts-detail'&&method==='GET'){
  const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'',kind=url.searchParams.get('kind')||'';
  const page=Math.min(10000,Math.max(1,Number(url.searchParams.get('page')||1)));
  if(!validDate(from)||!validDate(to)||from>to||!['CURRENT','SAVINGS','DEPOSIT','CREDIT','TERM','COLLECTION'].includes(kind))return json({error:'INVALID_FILTER'},400);
  const r=await db.prepare(`SELECT t.reference,t.created_at,t.kind,t.description,t.amount,a.number,c.name client
   FROM transactions t JOIN accounts a ON a.id=t.account_id AND a.institution_id=t.institution_id JOIN clients c ON c.id=a.client_id AND c.institution_id=t.institution_id
   WHERE t.institution_id=? AND a.kind=? AND t.created_at>=? AND t.created_at<? ORDER BY t.created_at DESC,t.id DESC LIMIT 21 OFFSET ?`)
   .bind(bank,kind,from+' 00:00:00',to+' 23:59:59.999',(page-1)*20).all();return json({items:r.results.slice(0,20),has_more:r.results.length>20,page});
 }
 return json({error:'NOT_FOUND'},404);
}
if(p==='/api/dashboard'&&method==='GET'){
 if(u.role==='superadmin'){const [x,m,plans]=await db.batch([db.prepare('SELECT COUNT(*) total FROM institutions'),db.prepare('SELECT COUNT(*) total FROM users WHERE role<>?').bind('superadmin'),db.prepare(`SELECT s.plan_code,COUNT(*) n FROM subscriptions s JOIN (SELECT institution_id,MAX(rowid) rid FROM subscriptions GROUP BY institution_id) latest ON latest.rid=s.rowid GROUP BY s.plan_code`)]);const stats={institutions:x.results[0].total,members:m.results[0].total,FREE:0,STANDARD:0,BUSINESS:0,ULTIMATE:0};for(const row of plans.results)if(Object.hasOwn(stats,row.plan_code))stats[row.plan_code]=row.n;stats.no_plan=Math.max(0,stats.institutions-(stats.FREE+stats.STANDARD+stats.BUSINESS+stats.ULTIMATE));return json(stats)}
 const [c,a,b,t]=await db.batch([db.prepare('SELECT COUNT(*) n FROM clients WHERE institution_id=?').bind(u.institution_id),db.prepare('SELECT COUNT(*) n,COALESCE(SUM(balance),0) total FROM accounts WHERE institution_id=? AND status=?').bind(u.institution_id,'ACTIVE'),db.prepare('SELECT COALESCE(SUM(CASE WHEN delta>0 THEN amount ELSE 0 END),0) deposits,COALESCE(SUM(CASE WHEN delta<0 THEN amount ELSE 0 END),0) withdrawals FROM transactions WHERE institution_id=?').bind(u.institution_id),db.prepare('SELECT COUNT(*) n FROM transactions WHERE institution_id=?').bind(u.institution_id)]);
 return json({clients:c.results[0].n,accounts:a.results[0].n,balance:a.results[0].total,deposits:b.results[0].deposits,withdrawals:b.results[0].withdrawals,movements:t.results[0].n});
}
if((p==='/api/bank/insights'||p==='/api/bank/report')&&method==='GET'){
 if(!u.institution_id||u.role==='superadmin'||!['admin','teller','auditor'].includes(u.role))return json({error:'FORBIDDEN'},403);
 const ins=await db.prepare('SELECT name FROM institutions WHERE id=?').bind(u.institution_id).first();
 if(p==='/api/bank/report'){
  const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return json({error:'INVALID_DATE_RANGE'},400);
  const r=await db.prepare(`SELECT COUNT(*) movements,COALESCE(SUM(CASE WHEN kind='DEPOSIT' THEN amount ELSE 0 END),0) deposits,COALESCE(SUM(CASE WHEN kind='WITHDRAWAL' THEN amount ELSE 0 END),0) withdrawals,COALESCE(SUM(CASE WHEN kind='TRANSFER_OUT' THEN amount ELSE 0 END),0) transfers FROM transactions WHERE institution_id=? AND created_at>=? AND created_at<?`).bind(u.institution_id,from+' 00:00:00',to+' 23:59:59.999').first();
  return json({...r,institution:ins?.name||'',from,to});
 }
 const [b,t,m]=await db.batch([
  db.prepare(`SELECT COALESCE(SUM(balance),0) balance FROM accounts WHERE institution_id=? AND status='ACTIVE'`).bind(u.institution_id),
  db.prepare(`SELECT COUNT(*) movements,COALESCE(SUM(CASE WHEN kind='DEPOSIT' THEN amount ELSE 0 END),0) deposits,COALESCE(SUM(CASE WHEN kind='WITHDRAWAL' THEN amount ELSE 0 END),0) withdrawals FROM transactions WHERE institution_id=?`).bind(u.institution_id),
  db.prepare(`SELECT substr(created_at,1,7) month,COUNT(*) movements,COALESCE(SUM(CASE WHEN kind='DEPOSIT' THEN amount ELSE 0 END),0) deposits,COALESCE(SUM(CASE WHEN kind='WITHDRAWAL' THEN amount ELSE 0 END),0) withdrawals FROM transactions WHERE institution_id=? AND created_at>=datetime('now','-12 months') GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 12`).bind(u.institution_id)]);
 return json({institution:ins?.name||'',balance:b.results[0].balance,...t.results[0],months:m.results});
}
if(p==='/api/clients'&&method==='GET'){if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);const page=Math.min(100,Math.max(1,Number(url.searchParams.get('page')||1))),q=String(url.searchParams.get('q')||'').slice(0,80);const rows=await db.prepare('SELECT id,number,kind,name,phone,active,block_reason,created_at FROM clients WHERE institution_id=? AND (name LIKE ? OR number LIKE ? OR phone LIKE ?) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?').bind(u.institution_id,...Array(3).fill('%'+q+'%'),(page-1)*20).all();return json({items:rows.results.slice(0,20),has_more:rows.results.length>20,page})}
if(p==='/api/clients'&&method==='POST'){
 if(!writable(u,'clients')||!u.institution_id)return json({error:'FORBIDDEN'},403);
 if(!['PERSON','COMPANY'].includes(body.kind))return json({error:'INVALID_CLIENT_TYPE'},400);
 const person=['last_name','first_name','birth_date','birth_place','sex','profession','identity_type','identity_number','phone','whatsapp','commune','neighborhood','emergency_name','emergency_phone','emergency_relation'];
 const company=['company_name','acronym','legal_form','activity','registration','tax_number','creation_date','city','company_commune','company_neighborhood','headquarters','company_phone','company_whatsapp','company_email','representative_last','representative_first','representative_role','representative_phone','representative_id_type','representative_id_number'];
 const required=body.kind==='PERSON'?['last_name','first_name','birth_date','birth_place','sex','identity_type','identity_number','phone','commune','neighborhood','emergency_name','emergency_phone','emergency_relation']:['company_name','legal_form','company_phone','representative_last','representative_phone','representative_id_type','representative_id_number'];
 const keys=body.kind==='PERSON'?person:company;
 if(required.some(k=>typeof body[k]!=='string'||!body[k].trim()||body[k].length>180)||keys.some(k=>body[k]!=null&&(typeof body[k]!=='string'||body[k].length>180)))return json({error:'INVALID_CLIENT_FIELDS'},400);
 if(body.kind==='PERSON'&&(!['Masculin','Féminin'].includes(body.sex)||!['CNI','Passeport','Attestation','Autre'].includes(body.identity_type)))return json({error:'INVALID_CLIENT_FIELDS'},400);
 if(body.kind==='COMPANY'&&!['CNI','Passeport','Attestation','Autre'].includes(body.representative_id_type))return json({error:'INVALID_CLIENT_FIELDS'},400);
 const details=Object.fromEntries(keys.map(k=>[k,String(body[k]||'').trim()]));
 const name=body.kind==='PERSON'?`${details.last_name} ${details.first_name}`:details.company_name;
 const phone=body.kind==='PERSON'?details.phone:details.company_phone;
 const key=id(),no='CL-'+key.slice(0,8).toUpperCase();
 await db.prepare('INSERT INTO clients(id,institution_id,number,kind,name,phone,details_json) VALUES(?,?,?,?,?,?,?)').bind(key,u.institution_id,no,body.kind,name,phone,JSON.stringify(details)).run();
 await audit(db,u,'CLIENT_CREATED',key);return json({ok:true,id:key,number:no},201)
}
function nameForClient(d,kind){return kind==='PERSON'?String(d.last_name||'').trim():String(d.company_name||'').trim()}
if(p.startsWith('/api/clients/') && ['GET','PUT','DELETE'].includes(method)){
 const clientId=decodeURIComponent(p.slice('/api/clients/'.length));
 if(!clientId||clientId.includes('/'))return json({error:'INVALID_CLIENT_ID'},400);
 const client=await db.prepare('SELECT id,kind,name,phone,active,details_json FROM clients WHERE id=? AND institution_id=?').bind(clientId,u.institution_id).first();
 if(!client)return json({error:'CLIENT_NOT_FOUND'},404);
 if(method==='GET')return json({client:{...client,details:JSON.parse(client.details_json||'{}')}});
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 if(method==='DELETE'){
  const linked=await db.prepare('SELECT COUNT(*) n FROM accounts WHERE client_id=? AND institution_id=?').bind(clientId,u.institution_id).first();
  if(Number(linked.n)>0)return json({error:'CLIENT_HAS_ACCOUNTS',hint:'Le client possède des comptes : bloquez-le pour conserver son historique financier.'},409);
  await db.prepare('DELETE FROM clients WHERE id=? AND institution_id=? AND NOT EXISTS (SELECT 1 FROM accounts WHERE client_id=?)').bind(clientId,u.institution_id,clientId).run();
  await audit(db,u,'CLIENT_DELETED',clientId);return json({ok:true});
 }
 if(body.action==='block'){
  if(!within(body.reason,500))return json({error:'BLOCK_REASON_REQUIRED'},400);
  await db.prepare('UPDATE clients SET active=0,block_reason=? WHERE id=? AND institution_id=?').bind(body.reason.trim(),clientId,u.institution_id).run();
  await audit(db,u,'CLIENT_BLOCKED',clientId);return json({ok:true});
 }
 if(body.action==='unblock'){
  await db.prepare('UPDATE clients SET active=1,block_reason=NULL WHERE id=? AND institution_id=?').bind(clientId,u.institution_id).run();
  await audit(db,u,'CLIENT_UNBLOCKED',clientId);return json({ok:true});
 }
 if(body.action==='edit'){
  const current=JSON.parse(client.details_json||'{}');const keys=client.kind==='PERSON'?['last_name','first_name','birth_date','birth_place','sex','profession','identity_type','identity_number','phone','whatsapp','commune','neighborhood','emergency_name','emergency_phone','emergency_relation']:['company_name','acronym','legal_form','activity','registration','tax_number','creation_date','city','company_commune','company_neighborhood','headquarters','company_phone','company_whatsapp','company_email','representative_last','representative_first','representative_role','representative_phone','representative_id_type','representative_id_number'];
  const next={...current};for(const key of keys){if(body[key]!==undefined){if(typeof body[key]!=='string'||body[key].length>180)return json({error:'INVALID_CLIENT_FIELDS'},400);next[key]=body[key].trim()}}
  const mandatory=client.kind==='PERSON'?['last_name','first_name','birth_date','birth_place','sex','identity_type','identity_number','phone','commune','neighborhood','emergency_name','emergency_phone','emergency_relation']:['company_name','legal_form','company_phone','representative_last','representative_phone','representative_id_type','representative_id_number'];
  // Legacy clients can have only name/phone; editing must not demand fields never collected.
  const legacy=!Object.keys(current).length || !current[mandatory[1]];
  if(!legacy && mandatory.some(k=>!next[k]))return json({error:'INVALID_CLIENT_FIELDS',missing:mandatory.filter(k=>!next[k])},400);
  if(!nameForClient(next,client.kind))return json({error:'INVALID_CLIENT_FIELDS'},400);
  const name=client.kind==='PERSON'?`${next.last_name||''} ${next.first_name||''}`.trim():next.company_name;
  const phone=client.kind==='PERSON'?next.phone:next.company_phone;
  await db.prepare('UPDATE clients SET name=?,phone=?,details_json=? WHERE id=? AND institution_id=?').bind(name,phone,JSON.stringify(next),clientId,u.institution_id).run();
  await audit(db,u,'CLIENT_UPDATED',clientId);return json({ok:true});
 }
 return json({error:'INVALID_ACTION'},400);
}
// Gestion des types par institution, sans changement des écritures historiques.
if(p==='/api/account-types'&&method==='GET'){
 if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);
 const rows=await db.prepare('SELECT id,label,base_kind,active FROM account_types WHERE institution_id=? ORDER BY label').bind(u.institution_id).all();
 return json({items:rows.results});
}
if(p==='/api/account-types'&&method==='POST'){
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 const label=String(body.label||'').trim();if(label.length<3||label.length>70)return json({error:'INVALID_ACCOUNT_TYPE_NAME'},400);
 const exists=await db.prepare('SELECT id FROM account_types WHERE institution_id=? AND lower(label)=lower(?)').bind(u.institution_id,label).first();
 if(exists)return json({error:'TYPE_ALREADY_EXISTS'},409);
 const key=id();await db.prepare("INSERT INTO account_types(id,institution_id,label,base_kind) VALUES(?,?,?,'CURRENT')").bind(key,u.institution_id,label).run();
 await audit(db,u,'ACCOUNT_TYPE_CREATED',key);return json({ok:true,id:key},201);
}
if(p.startsWith('/api/account-types/')&&method==='DELETE'){
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 const typeId=decodeURIComponent(p.slice('/api/account-types/'.length));
 const target=await db.prepare('SELECT id FROM account_types WHERE id=? AND institution_id=? AND active=1').bind(typeId,u.institution_id).first();
 if(!target)return json({error:'ACCOUNT_TYPE_NOT_FOUND'},404);
 // Le type disparaît des choix mais reste en base pour préserver les comptes existants.
 await db.prepare('UPDATE account_types SET active=0 WHERE id=? AND institution_id=?').bind(typeId,u.institution_id).run();
 await audit(db,u,'ACCOUNT_TYPE_ARCHIVED',typeId);return json({ok:true});
}
if(p.startsWith('/api/accounts/')&&p.endsWith('/status')&&method==='POST'){
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 const accountId=decodeURIComponent(p.slice('/api/accounts/'.length,-'/status'.length));
 const a=await db.prepare('SELECT id,number,status FROM accounts WHERE id=? AND institution_id=?').bind(accountId,u.institution_id).first();
 if(!a)return json({error:'ACCOUNT_NOT_FOUND'},404);
 const action=body.action;
 if(!['block','unblock'].includes(action))return json({error:'INVALID_ACTION'},400);
 if(action==='block'){
  if(a.status==='CLOSED')return json({error:'CLOSED_ACCOUNT'},409);
  const reason=String(body.reason||'').trim();if(reason.length<5||reason.length>500)return json({error:'BLOCK_REASON_REQUIRED'},400);
  await db.prepare("UPDATE accounts SET status='BLOCKED',block_reason=? WHERE id=? AND institution_id=? AND status!='CLOSED'").bind(reason,accountId,u.institution_id).run();
  await audit(db,u,'ACCOUNT_BLOCKED',accountId+': '+reason.slice(0,160));
 }else{
  if(a.status!=='BLOCKED')return json({error:'ACCOUNT_NOT_BLOCKED'},409);
  await db.prepare("UPDATE accounts SET status='ACTIVE',block_reason=NULL WHERE id=? AND institution_id=? AND status='BLOCKED'").bind(accountId,u.institution_id).run();
  await audit(db,u,'ACCOUNT_UNBLOCKED',accountId);
 }
 return json({ok:true});
}
// Compte entreprise indépendant : approvisionnement / décaissement uniquement.
if(p==='/api/enterprise-treasury'&&method==='GET'){
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 const bank=u.institution_id;
 const [summary,entries]=await db.batch([
  db.prepare('SELECT balance FROM enterprise_treasury WHERE institution_id=?').bind(bank),
  db.prepare('SELECT id,kind,amount,balance_after,description,created_at FROM enterprise_treasury_entries WHERE institution_id=? ORDER BY created_at DESC,id DESC LIMIT 30').bind(bank)
 ]);
 return json({balance:Number(summary.results[0]?.balance||0),entries:entries.results});
}
if(p==='/api/enterprise-treasury'&&method==='POST'){
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 if(!['SUPPLY','DISBURSEMENT'].includes(body.kind)||!money(body.amount)||!within(body.operation_key,100)||typeof body.description!=='string'||body.description.length>500)return json({error:'INVALID_ENTERPRISE_OPERATION'},400);
 const bank=u.institution_id;
 const previous=await db.prepare('SELECT id FROM enterprise_treasury_entries WHERE institution_id=? AND operation_key=?').bind(bank,body.operation_key).first();
 if(previous)return json({ok:true,duplicate:true});
 // Compute a candidate after-balance; trigger enforces the actual balance atomically.
 const record=await db.prepare('SELECT balance FROM enterprise_treasury WHERE institution_id=?').bind(bank).first();
 const balance=Number(record?.balance||0), next=balance+(body.kind==='SUPPLY'?body.amount:-body.amount);
 if(!Number.isSafeInteger(next)||next<0)return json({error:'INSUFFICIENT_ENTERPRISE_FUNDS'},409);
 try{
  await db.prepare('INSERT INTO enterprise_treasury_entries(id,institution_id,operation_key,kind,amount,balance_after,description,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id(),bank,body.operation_key,body.kind,body.amount,next,body.description.trim(),u.id).run();
 }catch(e){
  if(await db.prepare('SELECT id FROM enterprise_treasury_entries WHERE institution_id=? AND operation_key=?').bind(bank,body.operation_key).first())return json({ok:true,duplicate:true});
  const err=String(e);
  if(/INSUFFICIENT_ENTERPRISE_FUNDS|INVALID_ENTERPRISE_BALANCE/.test(err))return json({error:'BALANCE_CHANGED_RETRY'},409);
  return json({error:'ENTERPRISE_OPERATION_FAILED'},409);
 }
 await audit(db,u,'ENTERPRISE_'+body.kind,body.operation_key);
 return json({ok:true},201);
}
if(p==='/api/accounts'&&method==='GET'){
 if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);
 const page=Math.min(10000,Math.max(1,Number(url.searchParams.get('page')||1)));
 const search=String(url.searchParams.get('q')||'').trim().slice(0,100);
 const kind=String(url.searchParams.get('kind')||'').trim().slice(0,80);
 const filter=kind?' AND (a.kind=? OR a.account_type_id=?)':'';
 const match=search?' AND (lower(a.number) LIKE ? OR lower(c.name) LIKE ?)':'';
 const args=[u.institution_id,...(kind?[kind,kind]:[]),...(search?['%'+search.toLowerCase()+'%','%'+search.toLowerCase()+'%']:[])];
 const base=' FROM accounts a JOIN clients c ON c.id=a.client_id LEFT JOIN account_types t ON t.id=a.account_type_id WHERE a.institution_id=?'+filter+match;
 const [rows,total]=await db.batch([
  db.prepare('SELECT a.id,a.number,a.kind,a.balance,a.status,a.block_reason,COALESCE(t.label,a.kind) type_label,c.name client'+base+' ORDER BY a.created_at DESC,a.id DESC LIMIT 16 OFFSET ?').bind(...args,(page-1)*15),
  db.prepare('SELECT COUNT(*) n'+base).bind(...args)
 ]);
 return json({items:rows.results.slice(0,15),has_more:rows.results.length>15,page,total:Number(total.results[0]?.n||0)});
}
if(p==='/api/accounts'&&method==='POST'){if(u.role!=='admin')return json({error:'FORBIDDEN'},403);if(!['CURRENT','SAVINGS','DEPOSIT','CREDIT','TERM','COLLECTION'].includes(body.kind))return json({error:'INVALID_ACCOUNT_TYPE'},400);let customId=null;if(body.account_type_id){const t=await db.prepare('SELECT id,base_kind FROM account_types WHERE id=? AND institution_id=? AND active=1').bind(body.account_type_id,u.institution_id).first();if(!t||t.base_kind!==body.kind)return json({error:'INVALID_CUSTOM_ACCOUNT_TYPE'},400);customId=t.id;}const client=await db.prepare('SELECT id FROM clients WHERE id=? AND institution_id=? AND active=1').bind(body.client_id,u.institution_id).first();if(!client)return json({error:'CLIENT_NOT_FOUND'},404);const key=id(),no='MB-'+key.slice(0,12).toUpperCase();const terms=body.terms||{};
const amountKeys=body.kind==='CREDIT'?['principal','application_fee','book_fee']:body.kind==='TERM'?['principal','application_fee']:['initial_deposit','opening_fee','book_fee'];
const allowedKeys=[...amountKeys,'annual_rate','rate','months','start_date','credit_type','funding_reference','penalty_rate','bonus_rate'];
if(typeof terms!=='object'||Array.isArray(terms)||!terms||Object.keys(terms).some(k=>!allowedKeys.includes(k)))return json({error:'INVALID_ACCOUNT_TERMS'},400);
for(const k of amountKeys){const v=Number(terms[k]||0);if(!Number.isSafeInteger(v)||v<0||v>1000000000000)return json({error:'INVALID_ACCOUNT_TERMS'},400)}
for(const k of ['annual_rate','rate','bonus_rate','penalty_rate'])if(terms[k]!==undefined&&(!Number.isFinite(Number(terms[k]))||Number(terms[k])<0||Number(terms[k])>100))return json({error:'INVALID_ACCOUNT_RATE'},400);
if(['CREDIT','TERM'].includes(body.kind)&&(!money(Number(terms.principal))||!Number.isInteger(Number(terms.months))||Number(terms.months)<1||Number(terms.months)>600))return json({error:'INVALID_CONTRACT_TERMS'},400);
if(terms.start_date&&!/^\d{4}-\d{2}-\d{2}$/.test(terms.start_date))return json({error:'INVALID_CONTRACT_DATE'},400);
// Les conditions sont des brouillons. Aucun décaissement ni frais ni dépôt n'est comptabilisé ici.
await db.batch([db.prepare('INSERT INTO accounts(id,institution_id,client_id,number,kind,account_type_id) VALUES(?,?,?,?,?,?)').bind(key,u.institution_id,body.client_id,no,body.kind,customId),db.prepare('INSERT INTO account_contract_drafts(account_id,institution_id,kind,terms_json) VALUES(?,?,?,?)').bind(key,u.institution_id,body.kind,JSON.stringify(terms))]);await audit(db,u,'ACCOUNT_DRAFT_CREATED',key);return json({ok:true,id:key,number:no,draft:true},201)}
if(p.startsWith('/api/accounts/') && ['GET','DELETE'].includes(method)){
 const accountId=decodeURIComponent(p.slice('/api/accounts/'.length));
 const a=await db.prepare('SELECT a.id,a.number,a.kind,a.balance,a.status,a.block_reason,COALESCE(t.label,a.kind) type_label,c.name client FROM accounts a JOIN clients c ON c.id=a.client_id LEFT JOIN account_types t ON t.id=a.account_type_id WHERE a.id=? AND a.institution_id=?').bind(accountId,u.institution_id).first();
 if(!a)return json({error:'ACCOUNT_NOT_FOUND'},404);
 if(method==='GET'){
  const t=await db.prepare('SELECT reference,kind,amount,delta,description,created_at FROM transactions WHERE account_id=? AND institution_id=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(accountId,u.institution_id).all();
  return json({account:a,transactions:t.results});
 }
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 const linked=await db.prepare('SELECT COUNT(*) n FROM transactions WHERE account_id=? AND institution_id=?').bind(accountId,u.institution_id).first();
 if(linked.n>0||a.balance!==0)return json({error:'ACCOUNT_HAS_FINANCIAL_HISTORY',hint:'Un compte mouvementé ne peut être supprimé : clôturez-le selon la procédure réglementaire.'},409);
 await db.prepare('DELETE FROM accounts WHERE id=? AND institution_id=? AND NOT EXISTS (SELECT 1 FROM transactions WHERE account_id=?) AND balance=0').bind(accountId,u.institution_id,accountId).run();
 await audit(db,u,'ACCOUNT_DELETED',accountId);return json({ok:true});
}
if(p.startsWith('/api/transactions/') && ['GET','PUT','DELETE'].includes(method)){
 const txId=decodeURIComponent(p.slice('/api/transactions/'.length));
 const tx=await db.prepare('SELECT t.*,a.number account FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.id=? AND t.institution_id=?').bind(txId,u.institution_id).first();
 if(!tx)return json({error:'TRANSACTION_NOT_FOUND'},404);
 if(method==='GET')return json({transaction:tx});
 if(u.role!=='admin')return json({error:'FORBIDDEN'},403);
 if(method==='PUT'){
  // Immutable financial ledger: corrections to amount, dates and accounts are prohibited.
  // Notes are stored in an append-only audit rather than changing the signed movement.
  if(!within(body.reason,400))return json({error:'CORRECTION_REASON_REQUIRED'},400);
  await audit(db,u,'TRANSACTION_CORRECTION_NOTE',tx.reference+' : '+body.reason.trim());
  return json({ok:true,message:'Note de correction ajoutée au journal. Le mouvement initial reste inchangé.'});
 }
 // A posted movement cannot be deleted. Record a motivated reversal in a separate operation.
 if(!within(body.reason,400))return json({error:'REVERSAL_REASON_REQUIRED'},400);
 if(tx.operation_key.startsWith('REV-'))return json({error:'REVERSAL_NOT_REVERSIBLE'},409);
 const original=await db.prepare('SELECT id,account_id,amount,delta,kind,leg FROM transactions WHERE institution_id=? AND operation_key=? ORDER BY leg').bind(u.institution_id,tx.operation_key).all();
 const reversalKey='REV-'+tx.operation_key;
 if(await db.prepare('SELECT id FROM transactions WHERE institution_id=? AND operation_key=?').bind(u.institution_id,reversalKey).first())return json({error:'ALREADY_REVERSED'},409);
 const reverseKind={DEPOSIT:'WITHDRAWAL',WITHDRAWAL:'DEPOSIT',TRANSFER_IN:'TRANSFER_OUT',TRANSFER_OUT:'TRANSFER_IN'};
 const ref='RV-'+id().slice(0,12).toUpperCase();
 const desc='Contrepassation '+tx.reference+' : '+body.reason.trim();
 // Insert credits before debits to accommodate transfer reversals, D1 batch is atomic.
 const stmts=[...original.results].sort((a,b)=>a.delta-b.delta).map((t,i)=>db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id(),u.institution_id,reversalKey,i+1,t.account_id,reverseKind[t.kind],t.amount,-t.delta,ref,desc,u.id));
 try{await db.batch(stmts)}catch(e){return json({error:'REVERSAL_REJECTED',hint:'Contrepassation impossible (solde insuffisant, compte ou client bloqué). Aucun mouvement partiel enregistré.'},409)}
 await audit(db,u,'TRANSACTION_REVERSED',tx.reference+' => '+ref);return json({ok:true,reference:ref});
}
if(p==='/api/transactions'&&method==='GET'){
 if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);
 const page=Math.min(1000,Math.max(1,Number(url.searchParams.get('page')||1)));
 const q=(url.searchParams.get('q')||'').trim().slice(0,100);
 const where="t.institution_id=?"+(q?" AND (t.reference LIKE ? OR a.number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR t.kind LIKE ? OR t.description LIKE ? OR t.created_at LIKE ? OR CAST(t.amount AS TEXT) LIKE ?)":'');
 const params=[u.institution_id,...(q?Array(8).fill('%'+q+'%'):[])];
 const base=' FROM transactions t JOIN accounts a ON a.id=t.account_id JOIN clients c ON c.id=a.client_id WHERE '+where;
 const count=await db.prepare('SELECT COUNT(*) AS total'+base).bind(...params).first();
 const rows=await db.prepare('SELECT t.id,t.reference,t.kind,t.amount,t.delta,t.created_at,t.description,a.number account,c.name client'+base+' ORDER BY t.created_at DESC,t.id DESC LIMIT 21 OFFSET ?').bind(...params,(page-1)*20).all();
 return json({items:rows.results.slice(0,20),has_more:rows.results.length>20,page,total:count.total});
}
if(p==='/api/transactions'&&method==='POST'){
 if(!writable(u,'transactions'))return json({error:'FORBIDDEN'},403);if(!['DEPOSIT','WITHDRAWAL','TRANSFER'].includes(body.kind)||!money(body.amount)||!within(body.operation_key,100))return json({error:'INVALID_TRANSACTION'},400);
 const source=await db.prepare('SELECT a.id FROM accounts a JOIN clients c ON c.id=a.client_id WHERE a.id=? AND a.institution_id=? AND a.status=? AND c.active=1').bind(body.account_id,u.institution_id,'ACTIVE').first();if(!source)return json({error:'ACCOUNT_NOT_FOUND'},404);
 const op=body.operation_key,ref='TX-'+id().slice(0,12).toUpperCase(),newid=id();const dup=await db.prepare('SELECT reference FROM transactions WHERE institution_id=? AND operation_key=? LIMIT 1').bind(u.institution_id,op).first();if(dup)return json({ok:true,reference:dup.reference,duplicate:true});
 const amt=body.amount,kind=body.kind,desc=String(body.description||'').slice(0,300);
 const commands=[];
 if(kind==='TRANSFER'){if(body.destination_id===body.account_id)return json({error:'SAME_ACCOUNT'},400);const dest=await db.prepare('SELECT a.id FROM accounts a JOIN clients c ON c.id=a.client_id WHERE a.id=? AND a.institution_id=? AND a.status=? AND c.active=1').bind(body.destination_id,u.institution_id,'ACTIVE').first();if(!dest)return json({error:'DESTINATION_NOT_FOUND'},404);commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(newid,u.institution_id,op,1,source.id,'TRANSFER_OUT',amt,-amt,ref,desc,u.id));commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id(),u.institution_id,op,2,dest.id,'TRANSFER_IN',amt,amt,ref,desc,u.id))}
 else commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(newid,u.institution_id,op,1,source.id,kind,amt,kind==='DEPOSIT'?amt:-amt,ref,desc,u.id));
 try{await db.batch(commands)}catch(e){const duplicate=await db.prepare('SELECT reference FROM transactions WHERE institution_id=? AND operation_key=? LIMIT 1').bind(u.institution_id,op).first();if(duplicate)return json({ok:true,reference:duplicate.reference,duplicate:true});return json({error:String(e).includes('INSUFFICIENT_FUNDS')?'INSUFFICIENT_FUNDS':'TRANSACTION_REJECTED'},409)}
 await audit(db,u,'TRANSACTION_POSTED',ref);return json({ok:true,reference:ref},201)
}
if(p==='/api/admin/institutions'&&u.role==='superadmin'){
 if(method==='GET'){const r=await db.prepare("SELECT i.id,i.name,i.active,i.created_at,(SELECT u.email FROM users u WHERE u.institution_id=i.id AND u.role='admin' ORDER BY u.created_at ASC LIMIT 1) admin_email,(SELECT u.display_name FROM users u WHERE u.institution_id=i.id AND u.role='admin' ORDER BY u.created_at ASC LIMIT 1) admin_name,(SELECT s.plan_code FROM subscriptions s WHERE s.institution_id=i.id ORDER BY s.rowid DESC LIMIT 1) plan_code,(SELECT s.end_at FROM subscriptions s WHERE s.institution_id=i.id ORDER BY s.rowid DESC LIMIT 1) end_at FROM institutions i ORDER BY i.created_at DESC LIMIT 100").all();return json({items:r.results})}
 if(method==='POST'){if(!within(body.name))return json({error:'INVALID_NAME'},400);const key=id();await db.prepare('INSERT INTO institutions(id,name) VALUES(?,?)').bind(key,body.name.trim()).run();await audit(db,u,'INSTITUTION_CREATED',key);return json({ok:true,id:key},201)}
}
// Create institution and its first administrator atomically: neither may exist alone.
// The temporary password is returned only in the authenticated Super Admin response,
// never logged, persisted in plaintext, put into a URL, or exposed to the new administrator.
if(p==='/api/admin/institutions-with-admin'&&method==='POST'){
 if(u.role!=='superadmin')return json({error:'FORBIDDEN'},403);
 const institutionName=String(body.institution_name||'').trim();
 const adminName=String(body.admin_name||'').trim();
 const email=String(body.admin_email||'').trim().toLowerCase();
 if(!within(institutionName,160)||!within(adminName,160)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160)return json({error:'INVALID_COMPANY_OR_ADMIN'},400);
 const existing=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
 if(existing)return json({error:'EMAIL_ALREADY_USED'},409);
 const institutionId=id(),adminId=id();
 const temporaryPassword=String(body.admin_password||'');
 if(temporaryPassword.length<12||temporaryPassword.length>256)return json({error:'PASSWORD_REQUIREMENTS'},400);
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 const digest=await pbkdf(temporaryPassword,salt,NEW_PASSWORD_ITERATIONS);
 try{
  await db.batch([
   db.prepare('INSERT INTO institutions(id,name) VALUES(?,?)').bind(institutionId,institutionName),
   db.prepare('INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) VALUES(?,?,?,?,?,?,?,?,1,0)').bind(adminId,institutionId,email,adminName,'admin',digest,salt,NEW_PASSWORD_ITERATIONS)
  ]);
 }catch(err){if(/UNIQUE|constraint/i.test(String(err)))return json({error:'EMAIL_ALREADY_USED_OR_COMPANY_CONFLICT'},409);throw err}
 try{await audit(db,u,'INSTITUTION_AND_ADMIN_CREATED',institutionId)}catch(err){console.error('COMPANY_ADMIN_AUDIT_FAILED')}
 return json({ok:true,institution_id:institutionId,admin_id:adminId,admin_email:email,force_password_change:false},201,{'cache-control':'no-store'});
}
// Only the Super Admin may edit an institution or permanently delete an empty one.
// Refuse destructive deletion if any financial/operational records exist.
if(u.role==='superadmin'&&p==='/api/admin/institutions/edit'&&method==='POST'){
 const institutionId=String(body.institution_id||'');const name=String(body.name||'').trim();
 const email=String(body.admin_email||'').trim().toLowerCase();const adminName=String(body.admin_name||'').trim();const password=String(body.new_password||'');
 if(!within(institutionId,100)||!within(name,160)||!within(adminName,160)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160||(password&&(password.length<12||password.length>256)))return json({error:'INVALID_COMPANY_DETAILS'},400);
 const inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(institutionId).first();if(!inst)return json({error:'INSTITUTION_NOT_FOUND'},404);
 const admin=await db.prepare("SELECT id FROM users WHERE institution_id=? AND role='admin' ORDER BY created_at ASC LIMIT 1").bind(institutionId).first();if(!admin)return json({error:'COMPANY_ADMIN_NOT_FOUND'},409);
 const conflict=await db.prepare('SELECT id FROM users WHERE email=? AND id<>?').bind(email,admin.id).first();if(conflict)return json({error:'EMAIL_ALREADY_USED'},409);
 const commands=[db.prepare('UPDATE institutions SET name=? WHERE id=?').bind(name,institutionId),db.prepare("UPDATE users SET email=?,display_name=? WHERE id=? AND institution_id=? AND role='admin'").bind(email,adminName,admin.id,institutionId)];
 if(password){const salt=hex(crypto.getRandomValues(new Uint8Array(16))),digest=await pbkdf(password,salt,NEW_PASSWORD_ITERATIONS);commands.push(db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,force_password_change=0,session_version=session_version+1 WHERE id=? AND institution_id=?').bind(digest,salt,NEW_PASSWORD_ITERATIONS,admin.id,institutionId));commands.push(db.prepare('DELETE FROM sessions WHERE user_id=?').bind(admin.id))}
 await db.batch(commands);await audit(db,u,password?'INSTITUTION_ADMIN_CREDENTIALS_UPDATED':'INSTITUTION_UPDATED',institutionId);
 return json({ok:true,password_changed:!!password},200,{'cache-control':'no-store'});
}
if(u.role==='superadmin'&&p==='/api/admin/institutions/delete'&&method==='POST'){
 const institutionId=String(body.institution_id||'');
 if(!within(institutionId,100)||body.confirm!== 'SUPPRIMER')return json({error:'DELETION_CONFIRMATION_REQUIRED'},400);
 const inst=await db.prepare('SELECT id,name FROM institutions WHERE id=?').bind(institutionId).first();
 if(!inst)return json({error:'INSTITUTION_NOT_FOUND'},404);
 const [clients,accounts,transactions,messages]=await db.batch([
  db.prepare('SELECT COUNT(*) n FROM clients WHERE institution_id=?').bind(institutionId),
  db.prepare('SELECT COUNT(*) n FROM accounts WHERE institution_id=?').bind(institutionId),
  db.prepare('SELECT COUNT(*) n FROM transactions WHERE institution_id=?').bind(institutionId),
  db.prepare('SELECT COUNT(*) n FROM support_messages WHERE institution_id=?').bind(institutionId)
 ]);
 if([clients,accounts,transactions,messages].some(r=>Number(r.results[0].n)>0))return json({error:'INSTITUTION_HAS_DATA',hint:'Désactivez cette entreprise. La suppression définitive est interdite tant que des données bancaires existent.'},409);
 // Do not remove audit history; retain immutable records without sensitive details.
 await db.batch([
  db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE institution_id=?)').bind(institutionId),
  db.prepare('DELETE FROM subscriptions WHERE institution_id=?').bind(institutionId),
  db.prepare('DELETE FROM users WHERE institution_id=?').bind(institutionId),
  db.prepare('DELETE FROM institutions WHERE id=?').bind(institutionId)
 ]);
 await audit(db,u,'EMPTY_INSTITUTION_DELETED',institutionId);return json({ok:true});
}
// Super Admin read-only views and authorized institution status change.
if(u.role==='superadmin'&&p==='/api/admin/members'&&method==='GET'){const r=await db.prepare('SELECT u.id,u.email,u.display_name,u.role,u.active,i.name institution_name FROM users u LEFT JOIN institutions i ON i.id=u.institution_id ORDER BY u.created_at DESC LIMIT 200').all();return json({items:r.results})}
if(u.role==='superadmin'&&p==='/api/admin/subscription-list'&&method==='GET'){const r=await db.prepare('SELECT i.name,s.plan_code,s.start_at,s.end_at FROM subscriptions s JOIN institutions i ON i.id=s.institution_id ORDER BY s.rowid DESC LIMIT 100').all();return json({items:r.results})}
if(u.role==='superadmin'&&p==='/api/admin/journal'&&method==='GET'){const r=await db.prepare('SELECT a.action,a.created_at,u.email user_email FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100').all();return json({items:r.results})}
if(u.role==='superadmin'&&p==='/api/admin/institutions/status'&&method==='POST'){if(typeof body.active!=='boolean'||typeof body.institution_id!=='string')return json({error:'INVALID_STATUS'},400);const inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(body.institution_id).first();if(!inst)return json({error:'NOT_FOUND'},404);await db.prepare('UPDATE institutions SET active=? WHERE id=?').bind(body.active?1:0,inst.id).run();await audit(db,u,body.active?'INSTITUTION_ENABLED':'INSTITUTION_DISABLED',inst.id);return json({ok:true})}
// A bank administrator is created only by the Super Admin. The password is generated
// with a cryptographic RNG, shown once in the response and never written to audit logs.
if(p==='/api/admin/bank-admins'&&u.role==='superadmin'&&method==='POST'){
 const email=String(body.email||'').trim().toLowerCase();
 const name=String(body.name||'').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160||!within(name,160))return json({error:'INVALID_ADMIN_DETAILS'},400);
 const inst=await db.prepare('SELECT id FROM institutions WHERE id=? AND active=1').bind(body.institution_id).first();
 if(!inst)return json({error:'INSTITUTION_NOT_FOUND_OR_INACTIVE'},404);
 const exists=await db.prepare('SELECT id FROM users WHERE email=?').bind(email).first();
 if(exists)return json({error:'EMAIL_ALREADY_USED'},409);
 // Random 24-byte secret: URL-safe characters; no predictable or reusable password.
 const initialPassword=hex(crypto.getRandomValues(new Uint8Array(24)));
 const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
 const digest=await pbkdf(initialPassword,salt,NEW_PASSWORD_ITERATIONS);
 const uid=id();
 try{
  await db.prepare('INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) VALUES(?,?,?,?,?,?,?,?,1,1)').bind(uid,inst.id,email,name,'admin',digest,salt,NEW_PASSWORD_ITERATIONS).run();
 }catch(e){if(/UNIQUE|constraint/i.test(String(e)))return json({error:'EMAIL_ALREADY_USED'},409);throw e}
 // Non-secret log, without persisting the temporary password.
 try{await audit(db,u,'BANK_ADMIN_CREATED',uid)}catch(err){console.error('BANK_ADMIN_AUDIT_FAILED',err)}
 return json({ok:true,id:uid,email,temporary_password:initialPassword,force_password_change:true},201);
}
if(p==='/api/admin/users'&&u.role==='superadmin'&&method==='POST'){
 if(!within(body.email)||!within(body.name)||!within(body.password,256)||body.password.length<12||!['admin','teller','auditor'].includes(body.role))return json({error:'INVALID_USER'},400);
 const inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(body.institution_id).first();if(!inst)return json({error:'INSTITUTION_NOT_FOUND'},404);let salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await pbkdf(body.password,salt,NEW_PASSWORD_ITERATIONS);let key=id();await db.prepare('INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations) VALUES(?,?,?,?,?,?,?,?)').bind(key,inst.id,body.email.trim().toLowerCase(),body.name.trim(),body.role,ph,salt,NEW_PASSWORD_ITERATIONS).run();await audit(db,u,'USER_CREATED',key);return json({ok:true,id:key},201)
}
if(p==='/api/admin/subscriptions'&&u.role==='superadmin'&&method==='POST'){
 const plan=await db.prepare('SELECT * FROM plans WHERE code=?').bind(body.plan_code).first(),inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(body.institution_id).first();if(!plan||!inst)return json({error:'INVALID_SUBSCRIPTION'},400);let end=new Date(Date.now()+plan.duration_days*86400000).toISOString();await db.prepare('INSERT INTO subscriptions(id,institution_id,plan_code,start_at,end_at,created_by) VALUES(?,?,?,?,?,?)').bind(id(),inst.id,plan.code,new Date().toISOString(),end,u.id).run();await audit(db,u,'SUBSCRIPTION_GRANTED',inst.id+':'+plan.code);return json({ok:true,expires_at:end},201)
}
return json({error:'NOT_FOUND'},404)}
export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname.startsWith('/api/')){if(!allowedOrigin(req))return json({error:'BAD_ORIGIN'},403);try{return await route(req,env)}catch(e){console.error('request failure',e);const msg=String(e?.message||e||'');
 if(/no such table/i.test(msg))return json({error:'DATABASE_SCHEMA_MISSING',hint:'Appliquer la migration SQL sur la nouvelle base D1, puis initialiser le Super Admin.'},503);
 if(/no such column|has no column named/i.test(msg))return json({error:'DATABASE_SCHEMA_INCOMPATIBLE',hint:'La base D1 liee ne correspond pas au schema MEGA BANK. Ne pas modifier une base d’un autre projet.'},503);
 return json({error:'SERVER_ERROR',hint:'Consulter les logs Cloudflare Pages/Workers et verifier DB, CACHE, migration et compte admin.'},500)}}let response=await env.ASSETS.fetch(req);let h=new Headers(response.headers);h.set('content-security-policy',csp);h.set('x-frame-options','DENY');h.set('referrer-policy','no-referrer');h.set('x-content-type-options','nosniff');return new Response(response.body,{status:response.status,headers:h})}};
