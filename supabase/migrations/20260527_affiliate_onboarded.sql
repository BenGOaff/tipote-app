-- 20260527_affiliate_onboarded.sql
--
-- Tracking de la completion du tutoriel guidé affilié. Le tour est
-- affiché au premier login (onboarded_at IS NULL), et masqué après.
-- L'affilié peut relancer le tour manuellement depuis Support (qui
-- reset onboarded_at à NULL).

alter table affiliates
  add column if not exists onboarded_at timestamptz;

comment on column affiliates.onboarded_at is
  'Timestamp de fin du tutoriel guidé affilié. NULL = jamais terminé, '
  'le tour s''affiche au prochain login. Reset possible via le bouton '
  '"Refaire le tour" dans /support.';

notify pgrst, 'reload schema';
