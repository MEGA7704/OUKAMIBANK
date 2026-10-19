/**
 * Formules de référence du moteur GLOBAL BANK V20.
 * Fonctions pures et indépendantes de D1 : elles ne modifient aucun solde officiel.
 * Les montants sont des entiers FCFA et chaque entrée doit provenir d'une écriture validée.
 */
function money(n,name){ if(!Number.isSafeInteger(n)||n<0) throw new TypeError(`${name}: montant entier FCFA positif ou nul requis`); return n; }
function sumStrict(values,name){if(!Array.isArray(values))throw new TypeError(`${name}: liste requise`);return values.reduce((a,n)=>{money(n,name); const s=a+n;if(!Number.isSafeInteger(s))throw new RangeError('Dépassement financier');return s},0)}
export function computeCreditRepaidPrincipalTotal(credits){
 if(!Array.isArray(credits))throw new TypeError('Liste crédits requise');
 return sumStrict(credits.map((c,i)=>{ const capital=money(c.capitalAccorde,`crédit ${i}`);const remboursements=sumStrict((c.paiements||[]).filter(p=>p.valide&&!p.annule).map(p=>money(p.capitalRembourse,`paiement ${i}`)),`paiement ${i}`);return Math.min(capital,remboursements)}),'capital remboursé');
}
export function computeTotalRevenueBank(mouvements){
 if(!Array.isArray(mouvements))throw new TypeError('Liste mouvements requise');
 return sumStrict(mouvements.filter(m=>m.valide&&!m.annule&&m.classification==='REVENU_BANQUE'&&!m.compteDeuxFois).map(m=>money(m.montant,'revenu')),'revenus');
}
export function computeCompanyActiveApprovisionnementBalanceTotal(approvisionnements){
 if(!Array.isArray(approvisionnements))throw new TypeError('Liste approvisionnements requise');
 return sumStrict(approvisionnements.filter(a=>a.valide&&!a.annule).map(a=>{let montant=money(a.montant,'approvisionnement');let capitalAffecte=sumStrict((a.creditAffectations||[]).filter(x=>x.valide&&!x.annule).map(x=>money(x.capitalAccorde,'affectation')),'affectations');if(capitalAffecte>montant)throw new RangeError('APPROVISIONNEMENT_SURUTILISE');return montant-capitalAffecte}),'approvisionnements actifs');
}
export function computeCompanyDecaissementTotal(decaissements){
 if(!Array.isArray(decaissements))throw new TypeError('Liste décaissements requise');
 return sumStrict(decaissements.filter(d=>d.valide&&!d.annule).map(d=>money(d.montant,'décaissement')),'décaissements');
}
export function computeCompanyOfficialBalance({credits,revenus,approvisionnements,decaissements}){
 const Cr=computeCreditRepaidPrincipalTotal(credits),Rb=computeTotalRevenueBank(revenus),Aa=computeCompanyActiveApprovisionnementBalanceTotal(approvisionnements),D=computeCompanyDecaissementTotal(decaissements);
 const s=Cr+Rb+Aa-D;if(!Number.isSafeInteger(s))throw new RangeError('Dépassement financier');return {capitalRembourse:Cr,revenusBancaires:Rb,approvisionnementsActifs:Aa,decaissements:D,solde:s};
}
/** A appeler UNIQUEMENT côté serveur après transaction validée, avec lecture complète et cohérente D1. */
export async function updateCompanyAccountStoredBalance({chargeEcrituresValidees,mettreAJourSolde}){
 if(typeof chargeEcrituresValidees!=='function'||typeof mettreAJourSolde!=='function')throw new TypeError('Adaptateurs serveur requis');
 const ecritures=await chargeEcrituresValidees();const calcul=computeCompanyOfficialBalance(ecritures);if(calcul.solde<0)throw new RangeError('SOLDE_ENTREPRISE_NEGATIF');await mettreAJourSolde(calcul.solde);return calcul;
}
