// MEGA BANK — provisionnement explicite du Super Admin, sans mot de passe stocké.
// node scripts/bootstrap-admin.mjs --apply  (remote DB, requires Wrangler login)
// node scripts/bootstrap-admin.mjs --sql    (writes SQL to stdout; keep private)
import { webcrypto as crypto } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import readline from 'node:readline';
const EMAIL='mega@services.local', DB='mega_bank_db';
const mode=process.argv[2];
if (!['--apply','--sql'].includes(mode)) { console.error('Usage : node scripts/bootstrap-admin.mjs --apply | --sql'); process.exit(2) }
if (!process.stdin.isTTY) { console.error('Lancez ce script dans un terminal interactif de confiance.'); process.exit(2) }
const ask=(q)=>new Promise(resolve=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout});rl.question(q,a=>{rl.close();resolve(a)})});
async function secret(prompt){
  if(!process.stdin.isTTY||!process.stdin.setRawMode)throw new Error('Terminal interactif nécessaire');
  process.stdout.write(prompt);process.stdin.setRawMode(true);process.stdin.resume();
  return await new Promise((resolve,reject)=>{let s='';const finish=(e)=>{process.stdin.removeListener('data',onData);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');e?reject(e):resolve(s)};function onData(data){for(const c of data.toString('utf8')){if(c==='\u0003'){finish(new Error('Annulé'));return}if(c==='\r'||c==='\n'){finish();return}if(c==='\u007f'||c==='\b'){s=s.slice(0,-1)}else s+=c}}process.stdin.on('data',onData)})
}
let password='',verify='';
try{password=await secret('Nouveau mot de passe Super Admin (au moins 12 caractères, non affiché) : ');verify=await secret('Confirmer : ')}catch(e){console.error(e.message);process.exit(1)}
if(password!==verify || password.length<12 || password.length>256){console.error('Mot de passe invalide ou confirmations différentes.');process.exit(1)}
const salt=Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const ph=Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(salt,'hex'),iterations:310000,hash:'SHA-256'},key,256)).toString('hex');password='';verify='';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const sql=`INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,active,force_password_change) SELECT ${quote(crypto.randomUUID())},NULL,${quote(EMAIL)},'Super Administrateur','superadmin',${quote(ph)},${quote(salt)},310000,1,1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE email=${quote(EMAIL)});\n`;
if(mode==='--sql'){console.log('-- PRIVÉ : ne jamais publier ce SQL dans GitHub !\n'+sql);process.exit(0)}
console.log(`Base cible : ${DB} (production distante) ; compte : ${EMAIL}`);
const confirm=await ask(`Tapez exactement ${DB} pour confirmer : `);
if(confirm!==DB){console.error('Annulé : confirmation incorrecte.');process.exit(1)}
const dir=mkdtempSync(join(tmpdir(),'mega-bank-bootstrap-'));
try{const path=join(dir,'admin.sql');writeFileSync(path,sql,{mode:0o600});const r=spawnSync('npx',['--yes','wrangler','d1','execute',DB,'--remote','--file',path],{stdio:'inherit',shell:false,cwd:process.cwd()});if(r.error)throw r.error;if(r.status!==0)process.exitCode=1;else console.log('Instruction envoyée. Vérifiez /api/setup-status ; si le compte existait déjà, aucune modification n’a été effectuée.')}finally{rmSync(dir,{recursive:true,force:true})}
