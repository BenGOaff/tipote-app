-- 20260911_commissions_a_compenser.sql
--
-- UNE COMMISSION DÉJÀ VERSÉE QU'UN REMBOURSEMENT ANNULE SE VOIT DANS
-- L'ADMIN, PLUS SEULEMENT DANS `pm2 logs`.
--
-- Audit du 11 septembre 2026 : quand un remboursement ou un impayé
-- arrive APRÈS le versement, `annulerCommissionsDeLaVente` rend
-- `trop-tard` et écrit une ligne dans le journal du processus. Rien en
-- base : la seule trace d'un argent parti à tort vivait dans un
-- journal que personne ne relit. C'est un cas pour un humain (compenser
-- sur le lot suivant, ou écrire à l'affilié), donc il doit être sur un
-- écran, avec un bouton « réglé » quand il l'a été.
--
-- On n'ÉCRIT PAS `cancelled` sur la ligne : elle est `paid`, dans un lot,
-- avec une autofacture remise à un comptable. Une pièce émise ne bouge
-- pas. On pose à côté ce qu'il reste à récupérer.

alter table public.affiliate_commissions
  add column if not exists a_compenser_cents integer not null default 0,
  add column if not exists a_compenser_depuis timestamptz,
  add column if not exists a_compenser_motif text,
  add column if not exists a_compenser_regle_le timestamptz;

create index if not exists affiliate_commissions_a_compenser_idx
  on public.affiliate_commissions (a_compenser_depuis)
  where a_compenser_cents > 0 and a_compenser_regle_le is null;

notify pgrst, 'reload schema';
