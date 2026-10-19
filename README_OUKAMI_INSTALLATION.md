# ASSOCIATION OUKAMI DE DIABO — Installation

Projet Cloudflare Pages (GitHub), nouveau projet `association-oukami-diabo`. Les ressources D1 et KV ne doivent pas être partagées avec l’ancien déploiement.

## Liaison Cloudflare
D1 : binding `DB`, base `assouka_d1`, ID `5c052733-18c5-4748-b754-ad4e8ce185c2`.
KV : binding `KV`, namespace `assouka_kv`, ID `763b3f6ecc494dae94f7d28c084e067b`.

## Secrets OBLIGATOIRES (Cloudflare > Pages > Settings > Variables and Secrets)
- `SUPER_ADMIN_LOGIN` = `mega@services.local`
- `SUPER_ADMIN_PASSWORD` = choisir un mot de passe robuste **uniquement dans Cloudflare** ; absent du ZIP.
- `OUKAMI_ADMIN_PASSWORD` = choisir un autre mot de passe robuste **uniquement dans Cloudflare** ; initialise la banque OUKAMI avec identifiant `admin@oukami.local` à la première requête.
- `SUPER_ADMIN_SESSION_VERSION` = `1` (variable normale, déjà configurée).

Ne placez aucun mot de passe en clair dans GitHub, HTML, JavaScript client ni `wrangler.toml`. Les anciens clients et mouvements ne sont pas automatiquement transférés : la base D1 est nouvelle.

## Comptes
- Super Admin : `mega@services.local` / secret Cloudflare.
- Administrateur de l'association : `admin@oukami.local` / secret `OUKAMI_ADMIN_PASSWORD` (choisissez-le avant la première connexion).
- Agents : créés par l'administrateur via les utilisateurs et permissions existants.
- Clients : l'administrateur utilise le bouton **Accès clients** pour leur attribuer un mot de passe ; connexion client avec numéro de compte, identifiant client ou téléphone (si unique). Clients en lecture seule, avec isolation des informations côté serveur.

La page publique de création de banque et l'API `/api/register` sont désactivées. L'interface publique est une page de connexion unique. Les anciens fichiers de présentation non utilisés dans `public/assets` peuvent être supprimés si désiré.

## Important
Ne jamais utiliser le même projet Cloudflare que l'ancien GLOBAL BANK pour ce nouveau service. Prévoir des sauvegardes D1 régulières et tester les autorisations de chaque profil avant l'ouverture aux membres.
