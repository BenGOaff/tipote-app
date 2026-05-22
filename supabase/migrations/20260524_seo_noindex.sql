-- 20260524_seo_noindex.sql
--
-- Toggle "masquer aux moteurs de recherche" (cf. Systeme.io UX) sur
-- les 3 tables qui exposent du contenu public sur Tipote :
--   - quizzes (route /q/[quizId])
--   - popquizzes (route /pq/[popquizId])
--   - hosted_pages (route /p/[slug] — pages capture, sales, showcase, linkinbio)
--
-- Quand seo_noindex=true :
--   - generateMetadata émet `<meta name="robots" content="noindex,nofollow">`
--   - sitemap.xml exclut la row
--   - llms.txt exclut la row
--
-- Default false = comportement actuel (indexable) — aucune régression.

alter table public.quizzes
  add column if not exists seo_noindex boolean not null default false;

alter table public.popquizzes
  add column if not exists seo_noindex boolean not null default false;

alter table public.hosted_pages
  add column if not exists seo_noindex boolean not null default false;

notify pgrst, 'reload schema';
