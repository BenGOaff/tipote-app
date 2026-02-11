/*
  ETAPE 3 : Backfill project_id sur toutes les lignes existantes
  Associe chaque ligne au projet default de son user.

  Tu peux lancer tout ce bloc d'un coup.
  Si une table n'existe pas, l'UPDATE echouera mais ne cassera rien
  (lance-les un par un si tu preferes).
*/

UPDATE public.business_profiles bp
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = bp.user_id AND p.is_default = true AND bp.project_id IS NULL;

UPDATE public.business_plan bp
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = bp.user_id AND p.is_default = true AND bp.project_id IS NULL;

UPDATE public.personas pe
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = pe.user_id AND p.is_default = true AND pe.project_id IS NULL;

UPDATE public.competitor_analyses ca
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = ca.user_id AND p.is_default = true AND ca.project_id IS NULL;

UPDATE public.onboarding_facts of2
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = of2.user_id AND p.is_default = true AND of2.project_id IS NULL;

UPDATE public.onboarding_sessions os
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = os.user_id AND p.is_default = true AND os.project_id IS NULL;

UPDATE public.coach_messages cm
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = cm.user_id AND p.is_default = true AND cm.project_id IS NULL;

UPDATE public.content_item ci
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = ci.user_id AND p.is_default = true AND ci.project_id IS NULL;

UPDATE public.project_tasks pt
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = pt.user_id AND p.is_default = true AND pt.project_id IS NULL;

UPDATE public.quizzes q
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = q.user_id AND p.is_default = true AND q.project_id IS NULL;

UPDATE public.offer_pyramids op
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = op.user_id AND p.is_default = true AND op.project_id IS NULL;

UPDATE public.strategies s
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = s.user_id AND p.is_default = true AND s.project_id IS NULL;

UPDATE public.metrics m
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = m.user_id AND p.is_default = true AND m.project_id IS NULL;

UPDATE public.analytics_metrics am
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = am.user_id AND p.is_default = true AND am.project_id IS NULL;

UPDATE public.user_pepites up
SET project_id = p.id
FROM public.projects p
WHERE p.user_id = up.user_id AND p.is_default = true AND up.project_id IS NULL;
