# ASSOCIATION OUKAMI DE DIABO — Intégration contrôlée de GLOBAL BANK

## Sources
- Application source : `globalbankci-main2-(1).zip`, fournie par l'utilisateur.
- Application de destination : `ASSOCIATION_OUKAMI_COMPTE_ENTREPRISE_V20_PROTEGE.zip`.

## Impératifs non négociables
1. Conserver la connexion OUKAMI, le hachage des mots de passe, les rôles, la séparation des institutions, les sessions, le Super Admin et les protections D1.
2. Ne jamais copier la base D1, les secrets ou l'authentification de GLOBAL BANK.
3. Ne pas lancer deux moteurs d'écritures bancaires parallèles : un seul registre officiel et une seule transaction atomique par opération.
4. Conserver tous les historiques, annulations et soldes ; sauvegarde et migration progressive avant une mise en service.

## Modules présents dans OUKAMI
- Tableau de bord, Clients, Comptes, Mouvements, Compte entreprise protégé, Rapports, Paramètres, administration et agents (avec limites détaillées dans les notices d'origine).

## Fonctions de GLOBAL BANK à migrer et relier
| Domaine | Implémentation à effectuer avant activation financière |
| --- | --- |
| Crédits | Attribution d'un approvisionnement, réserve transactionnelle de capital, décaissement, échéancier versionné, ventilation paiements capital/intérêts/frais, suivi des retards |
| Compte entreprise V20 | Calcul D1 atomique de Cr + Rb + Aa - D, vérification d'allocation de chaque source, prise en compte annulations et soldes d'ouverture |
| Revenus | Nomenclature officielle des types de mouvements, provenance sans duplication, correction auditée |
| Dépôts à terme | Placement effectif, contrat, échéance, intérêt et règlement tracés |
| Mouvements | Gestion contrôlée des frais, remboursements et annulations, idempotence |
| Exercices | Périodes de gestion, clôture, réouverture autorisée, soldes d'ouverture |
| Documents | Rapports de crédit, contrats, reçus et impressions A4 cohérents avec le registre |
| Autorisations | Matrice de permissions GLOBAL BANK transposée aux rôles OUKAMI côté serveur |

## Livraison de ce ZIP
- Ajout de `lib/global-bank-formules-v20.mjs` : **formules pures testables**, basées sur des écritures déjà ventilées/classifiées/validées.
- Ajout de `tests/global-bank-formules-v20-reference.test.mjs` : cas V20 et cas limites.
- Aucun changement des opérations financières en production, aucune migration ni modification des données.
- Le calcul V20 **n'est pas connecté aux API d'écriture OUKAMI** : l'utiliser comme solde officiel sans tables complémentaires serait faux.

## Plan d'intégration sans régression
1. D'abord schéma D1 et migrations additives (crédits, échéanciers, affectations et ventilation de remboursement, classification des revenus).
2. Puis écritures atomiques et tests multi-institution/concours d'accès/idempotence.
3. Ensuite raccorder les fonctions V20 aux agrégations officielles D1 et à la liste Comptes.
4. Enfin reprendre la navigation et l'ensemble des formulaires GLOBAL BANK en préservant les API sécurisées OUKAMI.
5. Tester sur D1 de préproduction avant tout déploiement réel.

**Cette archive est une base préparatoire, pas l'intégration complète demandée.**
