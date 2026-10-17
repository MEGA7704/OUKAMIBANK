# MEGA BANK — corrections de la gestion

- Modification de client : tolérance pour les anciennes fiches créées avant le formulaire détaillé ; les champs existants restent modifiables.
- Comptes : Rapport ouvre une consultation/impression des 200 derniers mouvements ; il est explicitement non exhaustif. Supprimer ne fonctionne que pour un compte sans mouvement et à solde nul.
- Mouvements : Modifier permet d'ajouter une note au journal d'audit, sans altérer une écriture financière validée. Supprimer crée une contrepassation atomique et motivée sans effacer les mouvements originaux ; si l'opération inverse n'est pas possible, elle est refusée.
- Colonnes : alignement vertical et actions centrées.

Aucune migration D1 supplémentaire par rapport à la version précédente. Préserver et sauvegarder la base existante. Cette archive n'a pas été validée sur Cloudflare en production : procéder à un test dans un environnement isolé avant toute utilisation bancaire réelle.
