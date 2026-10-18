# ASSOCIATION OUKAMI DE DIABO — Rapports V1

## Installation
1. Sauvegarder la base Cloudflare D1 `mega_bank_db`.
2. Exécuter `migrations/0007_reports_obligations.sql` dans la console D1 (après les migrations 0001–0006).
3. Publier les fichiers du ZIP sur GitHub puis vérifier les trois sous-sections via `/reports`.

## Fonctionnalités livrées
- Navigation entre trois rapports sans recharger l'application.
- Obligations mensuelles : enregistrement, modification, désactivation logique, poids relatif au total des montants fixes, impression.
- Résumé des comptes par type : décompte des comptes, somme des dépôts/retraits sur une période, détails des mouvements avec pagination SQL de 20 lignes.
- Contrôles de session, institution, rôle et CSRF des écritures. Journalisation des modifications d'obligations.

## Limites impératives
- Le registre `transactions` existant ne contient que DEPOSIT, WITHDRAWAL, TRANSFER_IN et TRANSFER_OUT. **Aucun bénéfice ou revenu bancaire n'est calculé à partir de ces opérations.** Le rapport Revenus explique donc l'absence de source comptable officielle.
- Les bases des obligations « bénéfice général » et « produit/service » ne peuvent pas encore être calculées : seuls leurs montants fixes et leur pourcentage du total des obligations sont présentés.
- La colonne « Solde » du résumé n'affiche pas une valeur fictive : les soldes à date, dettes de crédit et dépôts à terme requièrent un registre temporel dédié. Les montants versés/retirés affichés sont exclusivement les dépôts/retraits documentés par le schéma existant.
- Les exercices financiers, leur statut de clôture, les rapports de crédit détaillés, les revenus reconnus, et le calcul net des bénéfices exigent des tables et règles supplémentaires.
- L'impression navigateur affiche le rapport ouvert, pas l'historique complet paginé.

Tester sur une base de démonstration avant déploiement en production. Ne jamais saisir des fonds réels pour vérifier une interface non validée en production.
