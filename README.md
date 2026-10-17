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
2. Dans Cloudflare Pages, créer un nouveau projet et relier ce dépôt. Configurer `DB` comme D1 et `CACHE` comme KV (identifiants déjà déclarés dans `wrangler.toml`). Attention : la base et le KV déclarés doivent être réservés à MEGA BANK.
3. Appliquer `migrations/0001_initial.sql` sur la base D1 : `npx wrangler d1 execute mega_bank_db --remote --file=migrations/0001_initial.sql` (après vérification de la base cible). **Ne jamais appliquer cette migration sur une base contenant les données d'un autre projet.**
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


## Configuration fournie — 16 octobre 2026

Le fichier `wrangler.toml` utilise `mega_bank_db` (D1) et `mega_bank_kv` (KV), avec liaisons `DB` et `CACHE`. La présence des identifiants ne prouve pas que les bindings ont été appliqués dans Cloudflare Pages. Vérifier dans les paramètres du projet, pour chaque environnement.

**Initialisation sur la nouvelle D1 vide uniquement** : `npx wrangler d1 execute mega_bank_db --remote --file=migrations/0001_initial.sql`. Ensuite créer le Super Admin avec `scripts/bootstrap-admin.mjs` suivant les instructions ci-dessus. Ne pas stocker le mot de passe ou le SQL généré dans GitHub. Tester `/api/setup-status` après déploiement.


## NOUVEAU : Initialisation guidée du Super Admin MEGA BANK

Compte unique à créer : **mega@services.local**. Le mot de passe est choisi au moment de l'installation ; il ne figure ni dans le ZIP ni sur GitHub.

1. Installer Node.js et décompresser le ZIP. Ouvrir un terminal dans le dossier contenant `wrangler.toml`.
2. Exécuter `npm install` puis `npx wrangler login` (autoriser votre compte Cloudflare).
3. Sur la **nouvelle base dédiée uniquement**, lancer `npx wrangler d1 execute mega_bank_db --remote --file=migrations/0001_initial.sql` (à faire une fois, après vérification de la base).
4. Exécuter **`node scripts/bootstrap-admin.mjs --apply`**. Le programme demande un mot de passe fort deux fois sans l'afficher, puis demande de confirmer le nom de la base D1 `mega_bank_db` avant d'y envoyer un SQL paramétré par l'adresse et le hachage.
5. Redéployer, ouvrir `/api/setup-status` : la réponse devrait contenir `ready:true`. Connectez-vous avec `mega@services.local` et le mot de passe défini ci-dessus. Un changement de mot de passe est exigé à la première connexion.

**Alternative sans injection directe** : `node scripts/bootstrap-admin.mjs --sql` affiche le SQL pour la console D1 ; conserver cette sortie strictement privée. Si le compte existe déjà, le script ne le remplace pas : utiliser une procédure de réinitialisation autorisée, jamais une suppression arbitraire.

**Sécurité et limites** : ce script nécessite un terminal interactif et une session Cloudflare autorisée ; il n'intègre pas de mot de passe prédéfini. Il ne peut pas initialiser Cloudflare à distance depuis un navigateur. La plateforme reste un socle partiel non homologué pour la banque réelle.


## Initialisation automatique du Super Admin (sans terminal)

Après avoir appliqué la migration D1 (les tables doivent exister), rendez-vous dans **Cloudflare Pages > Paramètres > Variables et secrets**, pour l'environnement de production :

- `SUPER_ADMIN_EMAIL` : texte, valeur `mega@services.local`
- `SUPER_ADMIN_INITIAL_PASSWORD` : **secret**, mot de passe unique et robuste (12 à 256 caractères)

Vérifiez les liaisons `DB` (D1 `mega_bank_db`) et `CACHE` (KV `mega_bank_kv`). Redéployez le projet pour appliquer ces valeurs. Ouvrez `/api/setup-status` : la création du premier Super Admin est automatiquement tentée uniquement s'il n'existe aucun compte `superadmin`. Connectez-vous avec l'adresse et le secret définis. Le logiciel exige un changement de mot de passe à la première connexion. **Une fois le compte créé, supprimez immédiatement `SUPER_ADMIN_INITIAL_PASSWORD` des secrets Cloudflare et redéployez.**

Le serveur ne renvoie jamais le secret ni le hash du mot de passe au navigateur. La création n'écrase aucun compte existant et n'est pas déclenchée lorsque les secrets sont manquants. Une requête GET `/api/setup-status` réalise le bootstrap initial une seule fois : n'utilisez ce mécanisme que pour la mise en service, avec une adresse et un mot de passe choisis par l'administrateur. La création nécessite une migration D1 préalable. Ne pas utiliser sur une base de données d'un autre projet.

## Correction ciblée — démarrage du Super Admin et messages de diagnostic

Le déploiement peut réussir alors que l'initialisation D1 échoue. Ce correctif contrôle le schéma et crée le premier compte uniquement si la table `users` est entièrement vide. La route `/api/setup-status` renvoie maintenant un état explicite : `MISSING_ADMIN_EMAIL`, `INVALID_ADMIN_EMAIL`, `MISSING_OR_INVALID_ADMIN_SECRET`, `ADMIN_CREATED` ou `ADMIN_BOOTSTRAP_DATABASE_ERROR` / `ADMIN_BOOTSTRAP_CRYPTO_ERROR` / `ADMIN_BOOTSTRAP_RUNTIME_ERROR`. Le détail interne n'est affiché que dans les logs serveur sous `MEGA_BOOTSTRAP_FAILURE` et n'est jamais communiqué au navigateur.

**Instructions :** publier ce nouveau contenu complet à la racine du dépôt GitHub, vérifier dans Cloudflare Pages (Production) les liaisons `DB`/`CACHE` et les secrets `SUPER_ADMIN_EMAIL=mega@services.local`, `SUPER_ADMIN_INITIAL_PASSWORD` de type Secret. Déployer puis ouvrir `https://VOTRE_DOMAINE/api/setup-status`. En cas d'erreur, copier le JSON **sans aucun secret**. En cas de `ready:true`, tester la connexion, changer le mot de passe, supprimer `SUPER_ADMIN_INITIAL_PASSWORD` et redéployer.

**Limitations :** 6 tests locaux, dont un test de l'API de bootstrap avec une base D1 simulée ; aucun test d'intégration n'a été exécuté contre votre D1 distante ni contre l'environnement réel Cloudflare. Si les secrets de votre tableau de bord Cloudflare ne sont pas injectés à l'exécution, la réponse l'indiquera sans planter. N'exécutez pas une migration déjà appliquée et ne supprimez pas la table `users`.


## Correction ADMIN_BOOTSTRAP_CRYPTO_ERROR (17 octobre 2026)

Cloudflare Workers limite PBKDF2 via `crypto.subtle.deriveBits()` à 100 000 itérations. La version précédente demandait 310 000 et échouait pendant la création du Super Admin. `public/_worker.js` utilise désormais `pbkdf2Sync` de `node:crypto`, pris en charge par Workers avec `nodejs_compat`, pour conserver 310 000 itérations PBKDF2-SHA256 sans changer le schéma ni invalider les hashes compatibles existants. La configuration `wrangler.toml` active le flag.

Déployer les fichiers modifiés sur GitHub, conserver les bindings `DB` et `CACHE`, ainsi que les secrets `SUPER_ADMIN_EMAIL` et `SUPER_ADMIN_INITIAL_PASSWORD` jusqu'à la création réussie de l'administrateur. Consulter `/api/setup-status`, puis se connecter. Après changement du mot de passe, supprimer `SUPER_ADMIN_INITIAL_PASSWORD` et redéployer. Ne pas relancer la migration si les tables D1 existent déjà.

Cette version n'a pas été testée sur le compte Cloudflare distant et doit être validée en environnement de test avant des opérations financières réelles.


## Correctif Cloudflare Workers PBKDF2
Les nouveaux mots de passe utilisent PBKDF2-SHA256 avec 100 000 itérations, compatible avec `crypto.subtle` en production Cloudflare Workers. L'itération est sauvegardée dans `users.password_iterations` ; les anciennes empreintes ne sont pas réécrites. Ce ZIP ne remplace pas la validation des fonctions bancaires en production.


## Réinitialisation du Super Admin sans CMD ni Node.js (octobre 2026)

Ne supprimez pas le compte existant. Si `/api/setup-status` affiche `admin_exists: true` mais `/api/login` répond `INVALID_CREDENTIALS` :

1. Dans **Cloudflare Pages > Paramètres > Variables et secrets (Production)**, ajoutez un **nouveau secret** `SUPER_ADMIN_RECOVERY_TOKEN`, de **32 caractères aléatoires minimum**, différent du mot de passe de connexion et de `SUPER_ADMIN_INITIAL_PASSWORD`. Exemple de génération sûre : gestionnaire de mots de passe avec génération aléatoire. Ne publiez pas ce jeton dans GitHub ni dans une conversation.
2. Publiez la version de ce ZIP par GitHub et assurez-vous que le secret est disponible en production.
3. Ouvrez `https://VOTRE-SITE.pages.dev/recovery.html`, saisissez le jeton et un **nouveau mot de passe personnel** de 12 caractères minimum puis confirmez. Le navigateur transmet le jeton uniquement via un en-tête HTTPS, jamais dans une URL.
4. La réponse `PASSWORD_RESET_SUCCESS` confirme la mise à jour. Le nouveau mot de passe est haché PBKDF2-SHA256 (100 000 itérations et sel aléatoire) avant insertion dans D1. Les sessions existantes sont supprimées et un changement de mot de passe après connexion est demandé. La réutilisation du même jeton renvoie `RECOVERY_TOKEN_ALREADY_USED`.
5. **Supprimez immédiatement `SUPER_ADMIN_RECOVERY_TOKEN` de Cloudflare et redéployez**, puis connectez-vous à `mega@services.local` avec le nouveau mot de passe. Changez à nouveau le mot de passe à la demande de l'application. Supprimez aussi `SUPER_ADMIN_INITIAL_PASSWORD` après confirmation d'accès.

Cette opération ne modifie pas les tables financières, les comptes clients ni les transactions. Elle s'appuie sur la table `audit_logs` existante : aucune migration SQL supplémentaire. Le jeton est marqué utilisé par une clé unique et une transaction D1 atomique. L'API refuse les récupérations si le secret n'est pas configuré, si le compte est absent ou inactif, ou si le jeton est déjà utilisé. Utilisez un jeton suffisamment aléatoire et supprimez-le immédiatement après l'opération.

**Limites** : le fonctionnement sur l'instance Cloudflare du client doit être validé après déploiement. Les tests locaux ne prouvent pas à eux seuls que les bindings/secrets distants sont corrects.
