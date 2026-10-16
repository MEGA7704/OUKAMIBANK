// Usage: node scripts/bootstrap-admin.mjs <email> <password> [name]
// Print SQL for D1. Run only in a trusted terminal; do not commit generated SQL.
import {webcrypto as crypto} from 'node:crypto';
const [email,password,name='Super Administrateur']=process.argv.slice(2);
if(!email||!password||password.length<12){console.error('Usage: node scripts/bootstrap-admin.mjs <email> <password>=12+ chars [display name]');process.exit(1)}
const salt=Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('hex');
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const ph=Buffer.from(await crypto.subtle.deriveBits({name:'PBKDF2',salt:Buffer.from(salt,'hex'),iterations:310000,hash:'SHA-256'},key,256)).toString('hex');
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
console.log(`INSERT INTO users(id,institution_id,email,display_name,role,password_hash,password_salt,password_iterations,force_password_change) VALUES (${quote(crypto.randomUUID())},NULL,${quote(email.toLowerCase())},${quote(name)},'superadmin',${quote(ph)},${quote(salt)},310000,1);`);
