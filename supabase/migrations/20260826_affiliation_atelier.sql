-- 20260826_affiliation_atelier.sql
--
-- L'ATELIER REJOINT NOTRE SYSTÈME D'AFFILIATION.
--
-- Béné, 26 août 2026 : "je veux notre propre système d'affiliation pour
-- l'atelier comme pour tiquiz."
--
-- Jusqu'ici l'Atelier avait SON registre (`profiles.sio_affiliate_id`
-- dans sa base) et ne lisait que `?sa=`. Ses ventes ne pouvaient donc
-- pas entrer dans la table centrale, et un affilié inscrit chez nous
-- sans compte Systeme.io n'était payé sur RIEN.
--
-- La seule chose qui bloque côté base, c'est cette contrainte : elle
-- n'accepte que deux applications. Une commission Atelier serait
-- REFUSÉE par Postgres, donc perdue en silence dans le webhook.
--
-- Aucune ligne existante ne bouge : on élargit, on ne réécrit pas.

alter table public.affiliate_commissions
  drop constraint if exists affiliate_commissions_source_app_check;

alter table public.affiliate_commissions
  add constraint affiliate_commissions_source_app_check
  check (source_app in ('tipote', 'tiquiz', 'atelier'));

-- Le taux négocié à la main existe déjà par produit (20260819), et sa
-- colonne `product` n'a pas de contrainte : 'atelier' y passe déjà.
-- Rien à faire de ce côté.

notify pgrst, 'reload schema';
