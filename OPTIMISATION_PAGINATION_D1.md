# Pagination D1 des mouvements

- Nouvelle route authentifiée `/api/moves/page` : page, limit (10-100), q, account_id.
- Filtrage par banque et droits de rôle, jointure comptes et clients.
- La page Historique des opérations appelle cette route à l’ouverture et affiche 25 mouvements par page.
- Recherche et pagination effectuées côté D1.
- Les mouvements nécessaires aux calculs financiers continuent à être chargés par l’ancienne route `/api/me` (limite existante de 1500) : la séparation complète des calculs financiers et de l’historique reste à réaliser.
- Les autres sections ne sont pas encore intégralement chargées à la demande.
- Ne pas utiliser la pagination de l’historique comme source des rapports ou des soldes.
- Tester sur un environnement de préproduction : connexion, rôles, recherche, pagination, impression, soldes, rapports, création et correction d’opérations.
- Aucune donnée client incluse, aucune migration obligatoire.
