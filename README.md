# MEGA BANK — nouveau socle Cloudflare/GitHub

**Statut : socle fonctionnel partiel / non homologué pour la production bancaire.** Projet créé de zéro à partir du cahier des charges fourni, sans code provenant des anciens projets.

## Inclus réellement
- Interface en français : connexion, tableau de bord SQL agrégé, clients, comptes et dépôt/retrait/virement entre comptes, administration initiale des institutions/utilisateurs/abonnements, changement de mot de passe.
- Backend Cloudflare Pages `_worker.js`, session D1 + cookie HttpOnly/Secure/SameSite=Lax, jeton CSRF, PBKDF2, contrôle des rôles, données filtrées par institution, audit et limitation élémentaire des tentatives via KV.
- Écritures financières validées par trigger SQL. Les virements utilisent `D1.batch` transactionnel. Idempotence par operation_key; historique paginé en SQL, initialisation manuelle sûre de l'administrateur.

## Non implémenté / NON conforme à la totalité du cahier des charges
Crédits et échéanciers, pénalités, comptabilité en partie double, gestion avancée des utilisateurs et de leurs statuts, MFA, révocation administrateur multi-utilisateurs, espace client, PDF, import/export complet, messagerie, rapprochement bancaire, moteur de facturation, paiement Wave vérifié, activation conditionnelle des licences, frais, obligations mensuelles, documents et conformité BCEAO. La table `plans` stocke les tarifs mais **ne bloque pas encore l'accès** selon l'abonnement. Le journal financier simple présent ici **n'est pas une comptabilité à partie double**. Les tests livrés ne démontrent pas la sécurité ni la résistance aux accès concurrents en production.

## Installer
1. Pousser ce dossier dans un **nouveau** dépôt GitHub (sans mélanger les anciens projets).
2. Dans Cloudflare Pages, créer un nouveau projet et relier ce dépôt. Configurer `DB` comme D1 et `CACHE` comme KV (identifiants déjà déclarés dans `wrangler.toml`). Attention : les noms/IDs fournis sont déjà ceux de ressources existantes ; pour une isolation réellement indépendante, créez de **nouvelles ressources** et remplacez leurs identifiants dans wrangler.toml.
3. Appliquer `migrations/0001_initial.sql` sur la base D1 : `npx wrangler d1 execute oukami2_d1 --remote --file=migrations/0001_initial.sql` (après vérification de la base cible). **Ne jamais appliquer cette migration sur une base contenant les données d'un autre projet.**
4. Sur votre terminal de confiance, générer l'instruction de création du superadmin : `node scripts/bootstrap-admin.mjs mega@services.local 'CHOISIR_UN_MOT_DE_PASSE_FORT'` puis exécuter le SQL produit dans D1. Le mot de passe initial du cahier des charges n'est volontairement pas intégré au dépôt ; changez-le dès la première connexion.
5. Déployer depuis GitHub / Cloudflare Pages. L'administrateur doit créer une institution, puis un administrateur bancaire pour celle-ci.
6. Exécuter `npm test` pour des tests structurels minimaux. Prévoir une suite d'intégration, sécurité, audit et charge avant toute mise en service réelle.

## Limites techniques
- Chaque opération financière est écrite avec un idempotency key UUID, et le trigger D1 empêche un solde négatif. Le registre des transactions est immuable, mais ne gère pas encore les contrepassations réglementées.
- Les comptes sont créés avec solde zéro. Aucun navigateur ne peut modifier directement un solde via l'API.
- La pagination clients/comptes limitée aux 100 premières pages et transactions aux 1000 premières pages : nécessaire d'ajouter une pagination par curseur stable pour très grands volumes.
- Un seul compte par opération, 20 éléments par liste; les sélecteurs de popups affichent au plus 20 comptes/clients, nécessitant une recherche paginée pour un grand établissement.
- Le changement de mot de passe supprime toutes les sessions dans D1; les opérations du superadmin demandent une implémentation complète des procédures d'approbation et de révocation.
- Le choix du montant fixe en FCFA utilise des entiers Javascript bornés, mais les calculs d'intérêts et de conversions de devises ne sont pas développés.

## À faire avant usage réel
Créer des ressources Cloudflare dédiées, activer MFA, permissions métier exhaustives, validations réglementaires, tests de concurrence/idempotence, audit externe sécurité, sauvegardes et stratégie de restauration, protection des données et contrôle financier en partie double.


## Diagnostic de connexion (correction SERVER_ERROR)

Le message `SERVER_ERROR` est une réponse générique : il ne prouve **pas** que le mot de passe est faux. Le projet exige un schéma MEGA BANK initialisé et un Super Admin créé dans **la même base D1 que celle reliée au projet Pages**.

1. Créer idéalement une **nouvelle base D1 dédiée** et un **KV dédié**, sans réutiliser une base d'un autre projet, puis adapter leurs identifiants dans `wrangler.toml`.
2. Dans Cloudflare Pages → Settings → Bindings, lier la nouvelle base sous le nom exact `DB` et le KV sous `CACHE`, pour la production et pour les environnements de prévisualisation concernés. Relancer le déploiement.
3. Vérifier `https://VOTRE-SITE.pages.dev/api/setup-status`. Réponse `DATABASE_SCHEMA_MISSING` : exécuter le script `migrations/0001_initial.sql` sur **cette nouvelle base** depuis le tableau de bord D1 ou Wrangler : `npx wrangler d1 execute NOM_BASE_DEDIEE --remote --file=migrations/0001_initial.sql`. Ne lancez pas cette commande sur une base existante contenant des données d'un autre logiciel.
4. Réponse `SUPERADMIN_NOT_INITIALIZED` : générer localement, hors GitHub, un SQL d'initialisation par `node scripts/bootstrap-admin.mjs mega@services.local 'VOTRE_MOT_DE_PASSE_LONG_ET_UNIQUE'`, puis exécuter le SQL sur cette base D1. Le compte affiché sur la capture d'écran ne constitue **pas** automatiquement un compte existant dans D1.
5. Réponse `{"ready":true}` : retenter la connexion. Si un `SERVER_ERROR` persiste, consulter Cloudflare → Workers & Pages → votre projet → Logs, puis contrôler les erreurs de déploiement et les liaisons des environnements.

La route `/api/setup-status` ne divulgue aucun utilisateur ni identifiant financier et ne modifie aucune donnée. Ne pas exposer les logs contenant des secrets. Cette correction ne configure pas vos ressources Cloudflare à distance.
