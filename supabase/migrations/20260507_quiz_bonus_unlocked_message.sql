-- Custom message shown to a visitor who unlocked the share bonus.
--
-- Default flow ships an i18n string ("Bonus unlocked! Check your inbox.")
-- which assumes the bonus is delivered via email. JB use case (2026-05-07):
-- he ran out of Systeme.io tags and wants the visitor to receive the
-- bonus inline as a discount code — no email round-trip. So we let the
-- creator override the unlock message per quiz with whatever copy fits
-- their delivery method ("Bonus unlocked! Your discount code is IMAGELYS20.").
--
-- Optional column. NULL = use the i18n default for the viewer locale.

ALTER TABLE quizzes
  ADD COLUMN IF NOT EXISTS bonus_unlocked_message TEXT;

COMMENT ON COLUMN quizzes.bonus_unlocked_message IS
  'Optional creator-defined message shown after bonus unlock. NULL falls back to the locale default in PublicQuizClient.';
