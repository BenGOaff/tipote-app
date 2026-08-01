-- 20260801_question_identity.sql (Tipote, module quiz)
--
-- Identité stable des questions dans les statistiques. Port exact du
-- chantier Tiquiz : les deux modules quiz sont jumeaux, une correction ici
-- doit exister là-bas, et réciproquement.
--
-- Le problème (retour Adeline, 1er août 2026) : les événements de tracking
-- ne connaissent la question que par sa POSITION (`question_index`).
-- Supprimer ou insérer une question au milieu décale toutes les positions
-- suivantes, et l'historique se retrouve attribué à la mauvaise question.
-- Le pansement précédent (recaler sur le nombre de questions actuel)
-- supprimait la question fantôme mais ne pouvait rien réaligner.
--
-- La vraie correction tient en trois pièces :
--   1. `quiz_questions.id` devient DURABLE : la sauvegarde d'un quiz
--      conserve l'identifiant de chaque question au lieu de tout supprimer
--      puis réinsérer (cf. PATCH /api/quiz/[quizId]).
--   2. Les événements portent `question_id` en plus de l'index, et les
--      réponses des leads aussi (`quiz_leads.answers[].question_id`).
--   3. Les agrégats traduisent `question_id` en position ACTUELLE, et ne
--      retombent sur l'index que pour l'historique antérieur.
--
-- Compatibilité : `question_id` est nullable. Les lignes déjà écrites
-- continuent d'être lues par leur index, exactement comme avant. Aucune
-- donnée n'est réécrite ni perdue.

alter table public.quiz_question_events
  add column if not exists question_id uuid;

create index if not exists idx_qqe_quiz_question_id
  on public.quiz_question_events (quiz_id, question_id);

-- ── Funnel d'un quiz ───────────────────────────────────────────────
-- Renvoie, par position ACTUELLE : views (sessions ayant atteint la
-- question, monotone) et answers (sessions distinctes ayant répondu).
--
-- Ligne spéciale `question_index = -1` : nombre de questions distinctes
-- présentes dans l'historique mais absentes du quiz d'aujourd'hui.
-- L'interface s'en sert pour dire honnêtement "1 question a été supprimée
-- depuis", au lieu de faire disparaître des chiffres sans explication.
create or replace function quiz_question_funnel_detail(
  p_quiz_id uuid,
  p_since timestamptz default null
)
returns table(question_index int, views bigint, answers bigint)
language sql
stable
as $$
  with live as (
    select id, (row_number() over (order by sort_order, id) - 1)::int as pos
    from quiz_questions
    where quiz_id = p_quiz_id
  ),
  live_count as (select count(*)::int as cnt from live),
  raw as (
    select
      e.question_id,
      e.question_index,
      e.session_id,
      e.event,
      case
        -- Événement récent : on suit l'identité, donc les réordonnancements.
        when e.question_id is not null then l.pos
        -- Événement historique : la position vaut ce qu'elle vaut, on la
        -- garde tant qu'elle désigne une question qui existe encore.
        when e.question_index < (select cnt from live_count) then e.question_index
        else null
      end as pos
    from quiz_question_events e
    left join live l on l.id = e.question_id
    where e.quiz_id = p_quiz_id
      and e.event in ('view', 'answer')
      and (p_since is null or e.created_at >= p_since)
  ),
  evs as (select * from raw where pos is not null),
  session_max as (
    select session_id, max(pos) as max_q
    from evs where event = 'view' group by session_id
  ),
  maxdist as (
    select max_q, count(*) as c from session_max group by max_q
  ),
  ans as (
    select pos, count(distinct session_id) as a
    from evs where event = 'answer' group by pos
  ),
  qs as (select distinct pos from evs),
  removed as (
    select count(distinct coalesce(question_id::text, 'idx:' || question_index))::bigint as n
    from raw where pos is null
  )
  select
    qs.pos as question_index,
    coalesce((select sum(c) from maxdist m where m.max_q >= qs.pos), 0)::bigint as views,
    coalesce((select a from ans where ans.pos = qs.pos), 0)::bigint as answers
  from qs
  union all
  select -1, (select n from removed), 0::bigint
  where (select n from removed) > 0
  order by 1;
$$;

notify pgrst, 'reload schema';
