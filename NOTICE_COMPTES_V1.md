# MEGA BANK — COMPTES V1

## Fonctions ajoutées
- Barre de recherche par numéro ou titulaire, filtre par type et pagination SQL de 15 résultats.
- Gestion de types de compte personnalisés par institution (base comptable `CURRENT`).
- Création de compte personnalisable sans montant initial (les écritures financières restent séparées).
- Blocage/déblocage motivé enregistré dans D1 et dans l'audit. Le trigger existant refuse les mouvements sur un compte non actif.
- Affichage amélioré de la liste et de ses actions.

## Installation
1. Sauvegarder `mega_bank_db`.
2. Appliquer une seule fois `migrations/0005_accounts_management.sql` dans D1.
3. Déployer tous les fichiers.
4. Vérifier `/api/setup-status`, l'ouverture de la liste, la création d'un type et le blocage sur une BASE DE TEST.

## Limites explicites
Le schéma bancaire de départ ne dispose pas encore d'une comptabilité prête à traiter les frais d'ouverture, les primes, les prêts, les échéanciers et dépôts à terme rémunérés. Ces opérations ne sont PAS activées dans cette livraison. L'ouverture d'un compte CREDIT ou TERM n'enregistre qu'un compte de catégorie correspondante, sans crédit accordé ni dépôt à terme financier.
Les rapports de crédit, contrats, archivage des comptes mouvementés, vérification du mot de passe administrateur pour les suppressions et l'archivage groupé restent à développer.
NE PAS utiliser cette version pour des opérations bancaires réelles sans audit indépendant.
