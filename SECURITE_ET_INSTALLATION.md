# ASSOCIATION OUKAMI DE DIABO — Entreprise + administrateur sécurisé

Dans **Super Admin → Entreprises → + Nouvelle entreprise**, remplir entreprise, nom administrateur principal et e-mail. Une seule opération D1 `db.batch` crée les deux enregistrements ; si la création du compte échoue, l'entreprise n'est pas créée. Le rôle `admin` est rattaché à `institution_id`.

Le mot de passe temporaire est généré par le serveur, transmis **uniquement** dans la réponse authentifiée du Super Admin et affiché une fois dans un champ masqué. Il ne s'affiche jamais dans Mon compte, dans la liste des membres ni dans les journaux. La réponse API ne doit pas être enregistrée dans des logs reverse-proxy. Le nouveau compte doit changer son mot de passe à la première connexion.

**Aucun mot de passe Super Admin n'est fourni ni exposé par cette fonctionnalité.** Ne pas partager de mot de passe ni de jeton de récupération.

Déployer les fichiers du ZIP à la racine du dépôt GitHub. Liaisons Cloudflare : DB → mega_bank_db ; CACHE → mega_bank_kv. Pas de migration SQL supplémentaire. Ce patch ne modifie pas les anciens comptes et ne supprime pas les données D1. Les validations locales ne constituent pas un audit indépendant de sécurité bancaire.
