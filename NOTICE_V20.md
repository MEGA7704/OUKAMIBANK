# ASSOCIATION OUKAMI DE DIABO — Compte entreprise V20 (étape sécurisée)

## Livré
- Une ligne Compte entreprise automatique apparaît dans **Comptes** (page 1 et filtre Tous). Elle est protégée : pas de blocage, pas de suppression, accès Détails.
- API authentifiée `/api/enterprise-balance-v20`, réservée à l'administrateur de l'institution courante.
- Affichage explicite de la formule S = Cr + Rb + Aa - D et des composantes vérifiables / manquantes.
- Le solde historique du registre (approvisionnements moins décaissements) est désigné comme **historique, non V20**.
- Aucune nouvelle migration ; aucun changement automatique aux écritures existantes.

## Pas encore livré (important)
- Affectation des crédits à chaque approvisionnement et calcul de la disponibilité source par source.
- Ventilation vérifiée des remboursements entre capital, intérêt, pénalités et frais.
- Registre des revenus classifiés et reconnus, exclusions des annulations.
- Recalcul officiel automatique et mise à jour de `accounts.balance` pour le Compte entreprise.
- Comptabilisation et synchronisation transactionnelles des crédits, des échéances et des annulations.

**Par sécurité, aucun calcul officiel V20 n'est affiché tant que ces trois sources de données ne sont pas opérationnelles.**
Les approvisionnements et décaissements historiques restent dans le registre existant, avec ses protections D1.

## Validation
- `npm test` : 47 tests existants réussis.
- Vérification de syntaxe de `public/_worker.js` et `public/app.js`.
- Tests d'intégration D1 de la formule V20 complète NON effectués (composantes indisponibles).
