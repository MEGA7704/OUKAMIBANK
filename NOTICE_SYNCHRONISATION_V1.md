# ASSOCIATION OUKAMI DE DIABO — synchronisation financière V1

## Livré

- Ajout de `GET /api/financial/overview` : synthèse intermodules, lecture seule, réservée aux administrateurs et auditeurs de l'institution authentifiée.
- Agrégations SQL côté D1 pour clients actifs, comptes actifs, soldes clients, dépôts/retraits historiques, total des mouvements, trésorerie du compte entreprise, engagements mensuels fixes et nombre de contrats de comptes en brouillon.
- Tableau de bord administrateur enrichi : trésorerie entreprise, obligations mensuelles fixes, dossiers en préparation. Aucun calcul en additionnant ces montants.
- Les modules et données existants sont préservés. Pas de migration supplémentaire pour la nouvelle API si les migrations 0001 à 0007 ont déjà été appliquées.

## Vérifications avant mise en service

Vérifier dans D1 la présence des tables `enterprise_treasury`, `account_contract_drafts` et `monthly_obligations`. Si une table manque, appliquer la migration correspondante (0006 ou 0007) sur une copie/sauvegarde avant déploiement.

## Non activé — ne pas utiliser comme opérations bancaires complètes

- Déblocage automatique des contrats de crédit/placement et affectation des approvisionnements aux crédits.
- Échéanciers, paiements crédit et pénalités, classification officielle des revenus, écritures comptables correspondantes.
- Sélection d'exercice et consolidation comptable des obligations par période.

Le tableau de bord et les rapports ne peuvent pas remplacer un grand-livre comptable audité. Tests locaux et SQL de structure ne garantissent pas l'intégration sur la D1 distante.
