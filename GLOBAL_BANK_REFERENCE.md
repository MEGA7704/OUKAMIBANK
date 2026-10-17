# Adaptation de GLOBAL BANK vers MEGA BANK

Le fichier globalbankci-main2-(1).zip a été examiné comme **référence d’interface et de spécifications**, pas utilisé comme source de vérité bancaire. Son code et ses bases sont distincts.

## Disponible dans cette itération
- Espace Administrateur bancaire conservé, navigation enrichie (Gestion financière, Crédits, Rapports).
- Gestion financière : synthèse des soldes et mouvements, agrégation SQL D1 par mois.
- Rapports filtrables par date, construits côté serveur avec un accès strict à l’entreprise connectée et une option d’impression.
- Raccourcis de navigation depuis le tableau de bord.
- Conservation des fonctions préexistantes clients, comptes et mouvements et du Super Admin.

## Non encore réalisé / à ne pas présenter comme prêt
Crédits et échéanciers, frais et revenus comptables, charges, obligations mensuelles, comptes d’agents avancés, import/export complet, relevés PDF réglementaires, espace client : requièrent schéma D1, règles métiers, validations et tests supplémentaires. Le menu Crédits affiche explicitement cet état au lieu de proposer un bouton fictif.

Ne jamais importer le SQL ni le JavaScript de GLOBAL BANK en production sur mega_bank_db. Aucune migration n'est nécessaire pour ces vues en lecture seule.
