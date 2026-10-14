# OUKAMI BANK — installation des données

**Déjà préparé :** 54 clients, 54 comptes, 846 opérations. Les références clients/comptes ont été vérifiées ; les identifiants restent inchangés. Le fichier Excel est conservé comme référence et n'est pas réimporté.

## Déploiement
1. Déployer le dossier du projet sur Cloudflare Pages comme d'habitude.
2. La base D1 `oukami_d1` doit être liée à l'application et contenir la banque `BANK-MQQOPM94-0F0F991A` avec ses accès existants.
3. Sur Windows, double-cliquer sur `import_oukami_prive/INSTALLER_IMPORT_WINDOWS.bat` depuis un PC disposant de Node.js et d'un accès Cloudflare autorisé. La procédure sauvegarde la base avant import et demande une authentification Cloudflare si nécessaire.
4. Ouvrir OUKAMI BANK et vérifier les clients, comptes et mouvements.

**Attention :** aucune connexion à votre compte Cloudflare n'est possible depuis le ZIP. Le déploiement GitHub seul ne charge pas les données dans D1. Ne pas placer le dossier `import_oukami_prive` dans `public/`, ni publier ce dossier dans un dépôt public : il contient des données personnelles et des mots de passe clients hérités. Ne pas réutiliser ces mots de passe sans sécurisation.

Le script SQL vérifie l'existence de la banque et emploie `INSERT OR IGNORE` pour ne pas écraser les données déjà présentes. L'exécution a été testée localement sur le schéma fourni, pas sur votre D1 de production.
