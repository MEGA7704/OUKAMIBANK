# MEGA BANK — Compte entreprise et formulaires Comptes

## Installation D1

1. Sauvegardez la base D1 de production `mega_bank_db`.
2. Vérifiez que les migrations 0001 à 0005 ont déjà été appliquées.
3. Exécutez **une seule fois** `migrations/0006_enterprise_account.sql` dans la Console D1.
4. Déployez le contenu de ce ZIP dans GitHub et attendez le déploiement Pages.
5. Vérifiez la section **Compte entreprise** avec des données de test.

La migration crée `enterprise_treasury`, `enterprise_treasury_entries` et `account_contract_drafts`. Elle ne supprime ni ne modifie les comptes, clients ou mouvements existants. Elle n'est pas destinée à être rejouée après une modification de schéma.

## Compte entreprise automatique

L'administrateur de chaque institution accède à **Compte entreprise**. Le compte est une ressource de trésorerie **distincte des comptes clients**. Deux opérations sont autorisées : approvisionnement et décaissement. Les montants sont en FCFA entiers positifs. Un identifiant d'opération unique et les contraintes SQL limitent les doubles écritures. Le déclencheur garantit que le solde ne passe pas sous zéro et que l'insertion d'une écriture et la variation de solde sont atomiques.

Ce compte n'est pas la formule métier « capital crédit remboursé + revenus » tant que la comptabilisation des crédits et revenus n'est pas disponible. Il reflète uniquement les approvisionnements et décaissements qui y sont enregistrés.

## Formulaires d'ouverture

Les nouveaux formulaires proposent standard, crédit et dépôt à terme, avec frais, taux, durée et calculs prévisionnels pour crédits et placements. Ils enregistrent les conditions dans `account_contract_drafts` comme **DRAFT**, sans mouvement financier automatique. Aucun intérêt, mensualité, frais, mise à disposition du crédit ou dépôt à terme n'est encaissé/payé par ces seules créations.

Les documents de crédit, échéanciers, affectations d'approvisionnements et contrats complets de GLOBAL BANK demandent un développement et une validation comptable ultérieurs. N'utilisez pas cette version pour une vraie activité bancaire tant que les flux ne sont pas qualifiés et testés.
