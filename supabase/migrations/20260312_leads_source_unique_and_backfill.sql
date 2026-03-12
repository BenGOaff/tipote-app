-- Unique constraint so quiz + page leads can upsert into the unified leads table
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_source_unique
  ON leads(user_id, source, source_id, email);

-- Backfill existing quiz_leads into the unified leads table
INSERT INTO leads (user_id, email, first_name, last_name, phone, source, source_id, source_name, quiz_answers, quiz_result_title, created_at)
SELECT
  q.user_id,
  ql.email,
  ql.first_name,
  ql.last_name,
  ql.phone,
  'quiz',
  ql.quiz_id,
  q.title,
  ql.answers,
  qr.title,
  ql.created_at
FROM quiz_leads ql
JOIN quizzes q ON q.id = ql.quiz_id
LEFT JOIN quiz_results qr ON qr.id = ql.result_id
ON CONFLICT (user_id, source, source_id, email) DO NOTHING;

-- Backfill existing page_leads into the unified leads table
INSERT INTO leads (user_id, email, first_name, phone, source, source_id, source_name, meta, created_at)
SELECT
  pl.user_id,
  pl.email,
  pl.first_name,
  pl.phone,
  'landing_page',
  pl.page_id,
  hp.title,
  jsonb_build_object(
    'utm_source', pl.utm_source,
    'utm_medium', pl.utm_medium,
    'utm_campaign', pl.utm_campaign,
    'referrer', pl.referrer
  ),
  pl.created_at
FROM page_leads pl
JOIN hosted_pages hp ON hp.id = pl.page_id
ON CONFLICT (user_id, source, source_id, email) DO NOTHING;
