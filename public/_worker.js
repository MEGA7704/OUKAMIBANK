const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...h}});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const rand=()=>crypto.randomUUID();
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
const pbkdf=async(pass,salt,iter)=>{let key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Uint8Array.from(salt.match(/../g).map(x=>parseInt(x,16))),iterations:iter,hash:'SHA-256'},key,256));};
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
 const ph=await pbkdf(password,salt,310000);
 const result=await db.prepare("INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) SELECT ?,NULL,?,'Super Administrateur','superadmin',?,?,310000,1,1 WHERE NOT EXISTS (SELECT 1 FROM users)")
  .bind(id(),email,ph,salt).run();
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
async function route(req,env){const db=env.DB;if(!db)return json({error:'D1_NOT_CONFIGURED'},503);const url=new URL(req.url),p=url.pathname,method=req.method;let body={};if(method==='POST'||method==='PATCH'){if(Number(req.headers.get('content-length')||0)>100000)return json({error:'BODY_TOO_LARGE'},413);try{body=await req.json()}catch{return json({error:'INVALID_JSON'},400)}}
if(p==='/api/setup-status'&&method==='GET')return json(await adminSetupStatus(db,env));
if(p==='/api/login'&&method==='POST'){
 const setup=await adminSetupStatus(db,env);if(!setup.ready)return json(setup,503);
 const email=String(body.email||'').trim().toLowerCase(),pw=String(body.password||'');if(!email||pw.length>256)return json({error:'INVALID_CREDENTIALS'},401);
 const ip=(req.headers.get('cf-connecting-ip')||'unknown').slice(0,128);const key='login:'+await hash(ip+'|'+email);let attempts=Number(await env.CACHE?.get(key)||0);if(attempts>=8)return json({error:'TOO_MANY_ATTEMPTS'},429);
 const u=await db.prepare('SELECT * FROM users WHERE email=?').bind(email).first();const valid=u&&u.active&&typeof u.password_salt==='string'&&/^(?:[0-9a-f]{2})+$/i.test(u.password_salt)&&Number.isInteger(u.password_iterations)&&u.password_iterations>=100000&&typeof u.password_hash==='string'&&eq(await pbkdf(pw,u.password_salt,u.password_iterations),u.password_hash);if(!valid){await env.CACHE?.put(key,String(attempts+1),{expirationTtl:900});return json({error:'INVALID_CREDENTIALS'},401)}
 if(u.institution_id){const inst=await db.prepare('SELECT active FROM institutions WHERE id=?').bind(u.institution_id).first();if(!inst?.active)return json({error:'INSTITUTION_SUSPENDED'},403)}
 await env.CACHE?.delete(key);const token=rand(),csrf=rand();await db.prepare(`INSERT INTO sessions(id_hash,user_id,csrf_hash,expires_at) VALUES(?,?,?,?)`).bind(await hash(token),u.id,await hash(csrf),new Date(Date.now()+28800000).toISOString()).run();await audit(db,u,'LOGIN','');return json({ok:true,csrf,force_password_change:!!u.force_password_change},200,{'set-cookie':cookie(token)});
}
if(p==='/api/logout'&&method==='POST'){const token=cookies(req).mega_session;if(token)await db.prepare('DELETE FROM sessions WHERE id_hash=?').bind(await hash(token)).run();return json({ok:true},200,{'set-cookie':cookie('',0)})}
const u=await actor(req,db);if(!u)return json({error:'UNAUTHORIZED'},401);
if(method!=='GET'&&method!=='HEAD') {const token=req.headers.get('x-csrf-token');if(!token||!eq(await hash(token),u.csrf_hash))return json({error:'CSRF_INVALID'},403)}
if(p==='/api/me'&&method==='GET')return json({user:{id:u.id,name:u.display_name,email:u.email,role:u.role,institution_id:u.institution_id},force_password_change:!!u.force_password_change});
if(p==='/api/password'&&method==='POST') {if(!within(body.current,256)||!within(body.next,256)||body.next.length<12)return json({error:'PASSWORD_REQUIREMENTS'},400);const old=await db.prepare('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?').bind(u.id).first();if(!eq(await pbkdf(body.current,old.password_salt,old.password_iterations),old.password_hash))return json({error:'BAD_CURRENT_PASSWORD'},403);const salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await pbkdf(body.next,salt,310000);await db.batch([db.prepare('UPDATE users SET password_hash=?,password_salt=?,password_iterations=310000,session_version=session_version+1,force_password_change=0 WHERE id=?').bind(ph,salt,u.id),db.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id)]);await audit(db,u,'PASSWORD_CHANGED','');return json({ok:true},200,{'set-cookie':cookie('',0)})}
if(u.force_password_change)return json({error:'CHANGE_PASSWORD_REQUIRED'},403);
if(p==='/api/dashboard'&&method==='GET'){
 if(u.role==='superadmin'){const x=await db.prepare('SELECT COUNT(*) total FROM institutions').first();return json({institutions:x.total})}
 const [c,a,b,t]=await db.batch([db.prepare('SELECT COUNT(*) n FROM clients WHERE institution_id=?').bind(u.institution_id),db.prepare('SELECT COUNT(*) n,COALESCE(SUM(balance),0) total FROM accounts WHERE institution_id=? AND status=?').bind(u.institution_id,'ACTIVE'),db.prepare('SELECT COALESCE(SUM(CASE WHEN delta>0 THEN amount ELSE 0 END),0) deposits,COALESCE(SUM(CASE WHEN delta<0 THEN amount ELSE 0 END),0) withdrawals FROM transactions WHERE institution_id=?').bind(u.institution_id),db.prepare('SELECT COUNT(*) n FROM transactions WHERE institution_id=?').bind(u.institution_id)]);
 return json({clients:c.results[0].n,accounts:a.results[0].n,balance:a.results[0].total,deposits:b.results[0].deposits,withdrawals:b.results[0].withdrawals,movements:t.results[0].n});
}
if(p==='/api/clients'&&method==='GET'){if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);const page=Math.min(100,Math.max(1,Number(url.searchParams.get('page')||1))),q=String(url.searchParams.get('q')||'').slice(0,80);const rows=await db.prepare('SELECT id,number,kind,name,phone,active,created_at FROM clients WHERE institution_id=? AND (name LIKE ? OR number LIKE ? OR phone LIKE ?) ORDER BY created_at DESC,id DESC LIMIT 21 OFFSET ?').bind(u.institution_id,...Array(3).fill('%'+q+'%'),(page-1)*20).all();return json({items:rows.results.slice(0,20),has_more:rows.results.length>20,page})}
if(p==='/api/clients'&&method==='POST'){if(!writable(u,'clients')||!u.institution_id)return json({error:'FORBIDDEN'},403);if(!within(body.name)||!['PERSON','COMPANY'].includes(body.kind)||body.phone&&typeof body.phone!=='string')return json({error:'INVALID_CLIENT'},400);const key=id(),no='CL-'+key.slice(0,8).toUpperCase();await db.prepare('INSERT INTO clients(id,institution_id,number,kind,name,phone) VALUES(?,?,?,?,?,?)').bind(key,u.institution_id,no,body.kind,body.name.trim(),String(body.phone||'').slice(0,40)).run();await audit(db,u,'CLIENT_CREATED',key);return json({ok:true,id:key,number:no},201)}
if(p==='/api/accounts'&&method==='GET'){if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);const page=Math.min(100,Math.max(1,Number(url.searchParams.get('page')||1)));const rows=await db.prepare('SELECT a.id,a.number,a.kind,a.balance,a.status,c.name client FROM accounts a JOIN clients c ON c.id=a.client_id WHERE a.institution_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT 21 OFFSET ?').bind(u.institution_id,(page-1)*20).all();return json({items:rows.results.slice(0,20),has_more:rows.results.length>20,page})}
if(p==='/api/accounts'&&method==='POST'){if(u.role!=='admin')return json({error:'FORBIDDEN'},403);if(!['CURRENT','SAVINGS','DEPOSIT','CREDIT','TERM','COLLECTION'].includes(body.kind))return json({error:'INVALID_ACCOUNT_TYPE'},400);const client=await db.prepare('SELECT id FROM clients WHERE id=? AND institution_id=? AND active=1').bind(body.client_id,u.institution_id).first();if(!client)return json({error:'CLIENT_NOT_FOUND'},404);const key=id(),no='MB-'+key.slice(0,12).toUpperCase();await db.prepare('INSERT INTO accounts(id,institution_id,client_id,number,kind) VALUES(?,?,?,?,?)').bind(key,u.institution_id,body.client_id,no,body.kind).run();await audit(db,u,'ACCOUNT_CREATED',key);return json({ok:true,id:key,number:no},201)}
if(p==='/api/transactions'&&method==='GET'){if(u.role==='superadmin')return json({error:'FORBIDDEN'},403);const page=Math.min(1000,Math.max(1,Number(url.searchParams.get('page')||1)));const rows=await db.prepare('SELECT t.id,t.reference,t.kind,t.amount,t.delta,t.created_at,a.number account FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE t.institution_id=? ORDER BY t.created_at DESC,t.id DESC LIMIT 21 OFFSET ?').bind(u.institution_id,(page-1)*20).all();return json({items:rows.results.slice(0,20),has_more:rows.results.length>20,page})}
if(p==='/api/transactions'&&method==='POST'){
 if(!writable(u,'transactions'))return json({error:'FORBIDDEN'},403);if(!['DEPOSIT','WITHDRAWAL','TRANSFER'].includes(body.kind)||!money(body.amount)||!within(body.operation_key,100))return json({error:'INVALID_TRANSACTION'},400);
 const source=await db.prepare('SELECT id FROM accounts WHERE id=? AND institution_id=? AND status=?').bind(body.account_id,u.institution_id,'ACTIVE').first();if(!source)return json({error:'ACCOUNT_NOT_FOUND'},404);
 const op=body.operation_key,ref='TX-'+id().slice(0,12).toUpperCase(),newid=id();const dup=await db.prepare('SELECT reference FROM transactions WHERE institution_id=? AND operation_key=? LIMIT 1').bind(u.institution_id,op).first();if(dup)return json({ok:true,reference:dup.reference,duplicate:true});
 const amt=body.amount,kind=body.kind,desc=String(body.description||'').slice(0,300);
 const commands=[];
 if(kind==='TRANSFER'){if(body.destination_id===body.account_id)return json({error:'SAME_ACCOUNT'},400);const dest=await db.prepare('SELECT id FROM accounts WHERE id=? AND institution_id=? AND status=?').bind(body.destination_id,u.institution_id,'ACTIVE').first();if(!dest)return json({error:'DESTINATION_NOT_FOUND'},404);commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(newid,u.institution_id,op,1,source.id,'TRANSFER_OUT',amt,-amt,ref,desc,u.id));commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id(),u.institution_id,op,2,dest.id,'TRANSFER_IN',amt,amt,ref,desc,u.id))}
 else commands.push(db.prepare('INSERT INTO transactions(id,institution_id,operation_key,leg,account_id,kind,amount,delta,reference,description,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(newid,u.institution_id,op,1,source.id,kind,amt,kind==='DEPOSIT'?amt:-amt,ref,desc,u.id));
 try{await db.batch(commands)}catch(e){const duplicate=await db.prepare('SELECT reference FROM transactions WHERE institution_id=? AND operation_key=? LIMIT 1').bind(u.institution_id,op).first();if(duplicate)return json({ok:true,reference:duplicate.reference,duplicate:true});return json({error:String(e).includes('INSUFFICIENT_FUNDS')?'INSUFFICIENT_FUNDS':'TRANSACTION_REJECTED'},409)}
 await audit(db,u,'TRANSACTION_POSTED',ref);return json({ok:true,reference:ref},201)
}
if(p==='/api/admin/institutions'&&u.role==='superadmin'){
 if(method==='GET'){const r=await db.prepare('SELECT id,name,active,created_at FROM institutions ORDER BY created_at DESC LIMIT 100').all();return json({items:r.results})}
 if(method==='POST'){if(!within(body.name))return json({error:'INVALID_NAME'},400);const key=id();await db.prepare('INSERT INTO institutions(id,name) VALUES(?,?)').bind(key,body.name.trim()).run();await audit(db,u,'INSTITUTION_CREATED',key);return json({ok:true,id:key},201)}
}
if(p==='/api/admin/users'&&u.role==='superadmin'&&method==='POST'){
 if(!within(body.email)||!within(body.name)||!within(body.password,256)||body.password.length<12||!['admin','teller','auditor'].includes(body.role))return json({error:'INVALID_USER'},400);
 const inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(body.institution_id).first();if(!inst)return json({error:'INSTITUTION_NOT_FOUND'},404);let salt=hex(crypto.getRandomValues(new Uint8Array(16))),ph=await pbkdf(body.password,salt,310000);let key=id();await db.prepare('INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt) VALUES(?,?,?,?,?,?,?)').bind(key,inst.id,body.email.trim().toLowerCase(),body.name.trim(),body.role,ph,salt).run();await audit(db,u,'USER_CREATED',key);return json({ok:true,id:key},201)
}
if(p==='/api/admin/subscriptions'&&u.role==='superadmin'&&method==='POST'){
 const plan=await db.prepare('SELECT * FROM plans WHERE code=?').bind(body.plan_code).first(),inst=await db.prepare('SELECT id FROM institutions WHERE id=?').bind(body.institution_id).first();if(!plan||!inst)return json({error:'INVALID_SUBSCRIPTION'},400);let end=new Date(Date.now()+plan.duration_days*86400000).toISOString();await db.prepare('INSERT INTO subscriptions(id,institution_id,plan_code,start_at,end_at,created_by) VALUES(?,?,?,?,?,?)').bind(id(),inst.id,plan.code,new Date().toISOString(),end,u.id).run();await audit(db,u,'SUBSCRIPTION_GRANTED',inst.id+':'+plan.code);return json({ok:true,expires_at:end},201)
}
return json({error:'NOT_FOUND'},404)}
export default {async fetch(req,env){const url=new URL(req.url);if(url.pathname.startsWith('/api/')){if(!allowedOrigin(req))return json({error:'BAD_ORIGIN'},403);try{return await route(req,env)}catch(e){console.error('request failure',e);const msg=String(e?.message||e||'');
 if(/no such table/i.test(msg))return json({error:'DATABASE_SCHEMA_MISSING',hint:'Appliquer la migration SQL sur la nouvelle base D1, puis initialiser le Super Admin.'},503);
 if(/no such column|has no column named/i.test(msg))return json({error:'DATABASE_SCHEMA_INCOMPATIBLE',hint:'La base D1 liee ne correspond pas au schema MEGA BANK. Ne pas modifier une base d’un autre projet.'},503);
 return json({error:'SERVER_ERROR',hint:'Consulter les logs Cloudflare Pages/Workers et verifier DB, CACHE, migration et compte admin.'},500)}}let response=await env.ASSETS.fetch(req);let h=new Headers(response.headers);h.set('content-security-policy',csp);h.set('x-frame-options','DENY');h.set('referrer-policy','no-referrer');h.set('x-content-type-options','nosniff');return new Response(response.body,{status:response.status,headers:h})}};
