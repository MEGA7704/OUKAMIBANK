-- À appliquer UNE SEULE FOIS à une base MEGA BANK existante.
-- Ne supprime aucune donnée.
ALTER TABLE clients ADD COLUMN details_json TEXT;
