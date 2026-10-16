# OUKAMI2 — GitHub + Cloudflare Pages

## Ressources Cloudflare
- Nom du projet Pages: `oukami2`
- D1 binding: `DB`, base `oukami2_d1`, ID `e065681b-4cb0-4afa-88d8-3263298492bf`
- KV binding: `KV`, namespace `oukami2kv`, ID `9467009dd39643b48a75a71fabcfa218`
- Super Admin: `mega@services.local`

## Installation
1. Importer les fichiers de ce dossier à la racine d'un dépôt GitHub privé.
2. Sur Cloudflare, vérifier que la nouvelle base D1 et le namespace KV appartiennent au même compte.
3. Créer le projet Pages `oukami2` et le lier au dépôt GitHub; dossier de sortie `public`.
4. Configurer un secret Cloudflare Pages `SUPER_ADMIN_PASSWORD` avec le mot de passe initial transmis séparément. Ne jamais le committer dans GitHub.
5. Appliquer les migrations D1 **uniquement sur la nouvelle base**: `npx wrangler d1 migrations apply oukami2_d1 --remote`. Vérifier les migrations avant l'application.
6. Déployer et contrôler `/api/login`, `/api/csrf`, `/api/load`, `/api/save` et les rôles.
7. Changer immédiatement le mot de passe initial; gérer la variable `SUPER_ADMIN_SESSION_VERSION` pour invalider les anciennes sessions Super Admin.

## Avertissement de données
Changer le binding vers une base D1 vide ne transfère aucune donnée depuis l'ancienne base. Une migration/export autorisée et vérifiée est nécessaire si vous souhaitez retrouver les clients et mouvements historiques.

## Fonctionnalités conservées
Connexion côté Worker, navigation interne par URL, menus selon rôle, plans Free/Standard/Business/Ultimate et liens Wave.

## Vérification avant production
Une recette avec comptes de test et contrôle des écritures bancaires réelles reste indispensable. Ne pas utiliser comme plateforme bancaire en production sans audit.
