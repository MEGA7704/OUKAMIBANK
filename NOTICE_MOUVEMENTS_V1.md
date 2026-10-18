# MEGA BANK — Évolution Mouvements V1

Fonctionnalités de cette livraison : recherche SQL côté serveur par référence, compte, titulaire, contact, date, nature, description et montant ; compteur de résultats filtrés ; historique paginé (20 lignes) ; signe des mouvements selon leur delta enregistré ; impression de la page courante ; conservation de dépôts, retraits, virements et contrepassations existants. Aucune migration D1 supplémentaire.

## Limites assumées
- L'impression ne couvre que la page actuellement affichée (20 lignes) et ne constitue pas un relevé comptable exhaustif.
- Aucun nouveau modèle comptable n'a été ajouté : approvisionnements, décaissements, crédit et remboursement, frais et pénalités nécessitent la définition et la vérification de leurs écritures.
- L'action « Supprimer » reste une contrepassation motivée sans suppression physique.
- Les recherches par date sont textuelles ; les filtres avancés par dates, utilisateurs ou exercices et les reçus personnalisés sont à développer.
- Le fonctionnement dans Cloudflare Pages/D1 doit être testé sur un environnement de préproduction avant emploi financier réel.

## Installation
Déployez le contenu du ZIP via GitHub sur votre projet existant. Les bindings D1 `DB` et KV `CACHE` sont conservés. N'exécutez aucune nouvelle migration pour cette évolution ; conservez les migrations antérieures si elles n'ont pas déjà été appliquées.
