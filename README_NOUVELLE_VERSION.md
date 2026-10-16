# OUKAMI — Cloudflare Pages / GitHub

Bindings requis : **DB** → `oukami_d1` (`001c173e-694b-434d-a8fc-8c5fa2351438`) ; **KV** → `OUKAMI_KV` (`25eac34d165240bfbd8c1bcd14c2954d`).

Configurer dans Cloudflare Pages le secret **SUPER_ADMIN_PASSWORD** (valeur initiale communiquée séparément par le propriétaire), et `SUPER_ADMIN_LOGIN=mega@services.local`, `SUPER_ADMIN_SESSION_VERSION=1`. **Ne jamais committer un mot de passe.** Le changer immédiatement à la première utilisation.

Connecter le dépôt GitHub au projet Pages; racine du dépôt, dossier de sortie `public`, commande build `npm run build` ; appliquer les migrations D1 avec `npm run db:migrate:remote` après sauvegarde préalable. Authentification dans `public/_worker.js`. Les routes d'écriture authentifiées attendent `x-csrf-token` obtenu via `/api/csrf`.

Offres : FREE 10j gratuit, STANDARD 30j 20 000 FCFA, BUSINESS 365j 200 000 FCFA, ULTIMATE 30j 600 000 FCFA. Paiement Wave est un lien de redirection, **pas une confirmation de paiement** ; seul le Super Admin active le plan après vérification. Ne pas appliquer de modifications SQL manuelles aux abonnements.

**Limites :** Vérifier en préproduction les flux métier financiers et le maintien des données historiques. Les protections IP stockées en KV restent sujettes aux limitations de cohérence/compétition de KV et ne remplacent pas un WAF Cloudflare. La migration complète des anciens mots de passe vers une table distincte n'est pas réalisée : les champs `pass` demeurent dans des tables D1 dédiées dont le serveur doit restreindre l'accès.
