-- 20260825_avantages_affilies.sql
--
-- UN CODE D'AFFILIÉ PORTE UN AVANTAGE, PAS SEULEMENT UN POURCENTAGE.
--
-- Béné, 25 août 2026 : "sur Tiquiz je veux pouvoir proposer : un
-- pourcentage sur le premier mois après le mois gratuit ; un pourcentage
-- à vie ; un pourcentage ponctuel sur une durée précise (genre décembre
-- à -40%) ; un pourcentage selon l'abonnement (mensuel, plus, annuel) ;
-- deux mois gratis au lieu d'un."
--
-- Cinq demandes, et elles se rangent en DEUX natures d'avantage :
--   - une REMISE en pourcentage, qui porte sur une durée (la première
--     échéance, N mois, ou toujours) et qui peut varier selon le palier ;
--   - des JOURS OFFERTS, qui ne sont pas une remise du tout : ils
--     rallongent l'essai gratuit, donc ils ne se calculent pas sur un
--     prix et ne peuvent pas se cumuler avec la remise.
--
-- La nature est une COLONNE (`kind`), jamais une déduction sur les
-- champs remplis. Deviner "il y a des jours donc c'est un essai"
-- marcherait aujourd'hui et casserait à la première ligne mal saisie,
-- sur un objet qui décide de ce qu'un client paie.
--
-- Tout est ADDITIF et porte un défaut qui reproduit exactement le
-- comportement d'avant : un code existant est une remise de 20 % sur la
-- première échéance, et il le reste sans qu'on y touche.

alter table affiliate_discount_codes
  -- 'percent' = une remise. 'free_days' = des jours d'essai en plus.
  add column if not exists kind text not null default 'percent',
  -- Sur quoi porte la remise. 'once' = la première échéance PAYÉE (un
  -- essai gratuit ne consomme pas la remise, cf. lib/checkout).
  add column if not exists duration text not null default 'once',
  -- Le nombre de mois quand duration = 'months'.
  add column if not exists duration_months int,
  -- Les jours offerts quand kind = 'free_days' (60 = deux mois).
  add column if not exists free_days int,
  -- Une remise DIFFÉRENTE selon le palier : {"monthly":20,"yearly":30}.
  -- Un palier absent retombe sur `percent_off`.
  add column if not exists percent_by_product jsonb,
  -- Le début d'une campagne ("décembre à -40%"). NULL = tout de suite.
  add column if not exists starts_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'affiliate_discount_kind_check') then
    alter table affiliate_discount_codes
      add constraint affiliate_discount_kind_check
      check (kind in ('percent', 'free_days'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'affiliate_discount_duration_check') then
    alter table affiliate_discount_codes
      add constraint affiliate_discount_duration_check
      check (duration in ('once', 'forever', 'months'));
  end if;
  -- Une remise sur N mois sans N est une remise qu'on ne sait pas
  -- appliquer : la base refuse plutôt que de laisser le code décider.
  if not exists (select 1 from pg_constraint where conname = 'affiliate_discount_months_check') then
    alter table affiliate_discount_codes
      add constraint affiliate_discount_months_check
      check (duration <> 'months' or (duration_months is not null and duration_months between 1 and 36));
  end if;
  -- Des jours offerts sans jours, pareil. 365 est la borne de PayPal.
  if not exists (select 1 from pg_constraint where conname = 'affiliate_discount_days_check') then
    alter table affiliate_discount_codes
      add constraint affiliate_discount_days_check
      check (kind <> 'free_days' or (free_days is not null and free_days between 1 and 365));
  end if;
end $$;

comment on column affiliate_discount_codes.kind is
  'percent = remise en pourcentage. free_days = jours d''essai gratuit en plus (ne se cumule jamais avec une remise).';
comment on column affiliate_discount_codes.duration is
  'once = la premiere echeance PAYEE. months = duration_months echeances. forever = toutes.';
comment on column affiliate_discount_codes.percent_by_product is
  'Remise par palier, ex {"monthly":20,"yearly":30}. Un palier absent retombe sur percent_off.';

notify pgrst, 'reload schema';
