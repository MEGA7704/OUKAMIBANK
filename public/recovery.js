document.querySelector('#recover').addEventListener('submit', async ev => {
 ev.preventDefault();
 const form=ev.currentTarget,btn=form.querySelector('button'),msg=document.querySelector('#result');
 const secret=form.elements.token.value, password=form.elements.password.value;
 if(password!==form.elements.confirmation.value){msg.textContent='Les mots de passe ne correspondent pas.';return;}
 btn.disabled=true;msg.textContent='Traitement en cours…';
 try{
  const response=await fetch('/api/admin/recover',{method:'POST',headers:{'content-type':'application/json','x-mega-recovery-token':secret},body:JSON.stringify({new_password:password}),credentials:'omit',cache:'no-store'});
  const result=await response.json();
  msg.textContent=result.ok?'Mot de passe réinitialisé. Supprimez maintenant SUPER_ADMIN_RECOVERY_TOKEN dans Cloudflare, redéployez, puis connectez-vous.':`Erreur : ${result.error||'Échec de récupération'}`;
  if(result.ok)form.reset();
 }catch{msg.textContent='Connexion au serveur impossible.'}finally{btn.disabled=false}
});