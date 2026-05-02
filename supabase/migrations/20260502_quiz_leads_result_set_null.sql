-- ════════════════════════════════════════════
-- TIPOTE — quiz_leads result_title snapshot + FK ON DELETE SET NULL
-- ════════════════════════════════════════════
--
-- Mirror of tiquiz migration 030 (Gwenn DELETE_FAILED bug). The Tipote
-- quiz API has the same destructive-delete pattern on quiz_results,
-- the same FK constraint, and therefore the same risk of failing
-- saves on quizzes that already have leads.
--
-- Two changes, both idempotent and safe on populated tables:
--
--   1. ADD COLUMN IF NOT EXISTS quiz_leads.result_title TEXT
--      Snapshot column populated at lead capture (and now backfilled
--      from the result row whenever a result is about to be deleted).
--      Lets the leads dashboard keep showing the outcome name even
--      after the underlying quiz_results row is gone.
--      No-op if Tipote already had this column from an older
--      migration. New rows default to NULL and are populated by
--      either the lead-capture endpoint or the on-delete backfill
--      in app/api/quiz/[quizId]/route.ts.
--
--   2. Switch the FK quiz_leads.result_id → quiz_results(id) from the
--      default NO ACTION to ON DELETE SET NULL.
--      The previous behaviour rejected any DELETE on quiz_results
--      while a lead pointed at it — that's how the Tipote quiz API
--      was failing with DELETE_FAILED whenever a creator with
--      existing leads tried to edit their results. SET NULL makes
--      the operation atomic at the DB level: result row removed,
--      lead row preserved, result_id becomes NULL in the same
--      transaction as the delete. Lead is never lost.

ALTER TABLE quiz_leads
  ADD COLUMN IF NOT EXISTS result_title TEXT;

ALTER TABLE quiz_leads
  DROP CONSTRAINT IF EXISTS quiz_leads_result_id_fkey;

ALTER TABLE quiz_leads
  ADD CONSTRAINT quiz_leads_result_id_fkey
    FOREIGN KEY (result_id)
    REFERENCES quiz_results(id)
    ON DELETE SET NULL;
