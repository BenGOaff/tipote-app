-- 20260825_recompense_affilies.sql
--
-- RÉCOMPENSER UN AFFILIÉ QUI AMÈNE DU MONDE, ET LE LAISSER CHOISIR.
--
-- Béné, 25 août 2026 : "il a 10 affiliés abonnés, son abonnement baisse
-- de 10 %, il en a 20 il gagne 20 %, il en a 100 ben il paye plus rien ?"
-- Puis : "on pourra laisser le choix à l'affilié : soit réduire le prix
-- de son abonnement, soit augmenter ses commissions. C'est lui qui
-- choisit quand il remplit son profil et il peut switcher quand il veut
-- (ce sera pris en compte pour le mois suivant)."
--
-- UN SEUL DES DEUX, JAMAIS LES DEUX : c'est la même récompense versée de
-- deux façons, et les cumuler paierait deux fois le même mérite.
--
-- LE DÉFAUT EST 'commissions', et c'est le seul défaut sûr. Beaucoup
-- d'affiliés n'ont AUCUN abonnement Tiquiz : une remise sur un abonnement
-- qui n'existe pas ne leur donnerait rien, et ils ne verraient jamais
-- qu'ils avaient un choix à faire. La commission concerne tout le monde.
--
-- LES TROIS COLONNES DE MESURE SONT UN INSTANTANÉ, PAS UN CALCUL. Elles
-- portent ce que le recalcul mensuel a trouvé, avec sa date. Recalculer
-- à l'affichage donnerait un chiffre qui bouge sous les yeux de
-- l'affilié entre deux pages, alors que ce qui compte c'est ce qui est
-- EN VIGUEUR ce mois-ci (règle de la facture émise, 24 août).

alter table affiliates
  add column if not exists recompense_choix text not null default 'commissions',
  -- Le nombre de filleuls PAYANTS trouvé au dernier recalcul.
  add column if not exists recompense_filleuls int not null default 0,
  -- Ce qui est en vigueur : une remise d'abonnement OU un taux de
  -- commission, selon le choix. Les deux sont stockés pour que l'écran
  -- puisse montrer ce que l'autre choix aurait donné.
  add column if not exists recompense_remise_pct int not null default 0,
  add column if not exists recompense_commission_pct int not null default 40,
  add column if not exists recompense_calculee_le timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'affiliates_recompense_choix_check') then
    alter table affiliates
      add constraint affiliates_recompense_choix_check
      check (recompense_choix in ('commissions', 'abonnement'));
  end if;
  -- Des bornes en BASE, pas seulement dans le code : ces deux nombres
  -- décident de ce qu'on encaisse et de ce qu'on verse.
  if not exists (select 1 from pg_constraint where conname = 'affiliates_recompense_bornes_check') then
    alter table affiliates
      add constraint affiliates_recompense_bornes_check
      check (
        recompense_remise_pct between 0 and 100
        and recompense_commission_pct between 0 and 70
        and recompense_filleuls >= 0
      );
  end if;
end $$;

comment on column affiliates.recompense_choix is
  'commissions = cinq points de commission de plus par marche de 10 filleuls, la marche s''ouvrant au premier (plafond 70). abonnement = une remise sur SON abonnement, par marches de 10 filleuls (100 filleuls = offert). Exclusif : jamais les deux.';
comment on column affiliates.recompense_calculee_le is
  'Date du dernier recalcul mensuel. Un changement de choix ne prend effet qu''au recalcul suivant, comme annonce a l''affilie.';

notify pgrst, 'reload schema';
