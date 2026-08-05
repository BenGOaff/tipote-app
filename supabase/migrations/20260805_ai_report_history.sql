-- 20260805_ai_report_history.sql (Tipote)
--
-- CE QUE NOS IA ONT CONSEILLÉ, ET QUAND.
--
-- -- POURQUOI -----------------------------------------------------------
--
-- `quizzes.ai_insights` est ÉCRASÉ à chaque génération, et
-- `user_insight_reports` a `user_id` en clé primaire, donc pareil. Il
-- n'existe nulle part de trace de ce qu'un rapport a dit la fois d'avant.
--
-- Le 4 août 2026, Jocelyne nous a dit avoir suivi les conseils du robot
-- pendant trois semaines. Pour savoir ce qu'il lui avait réellement
-- conseillé, il a fallu reconstituer à partir de ses messages et d'une
-- relecture du prompt : une journée entière, et une conclusion incertaine.
-- Une ligne d'historique aurait tranché en trente secondes.
--
-- C'est aussi ce qui permet de répondre à la question qui compte quand on
-- corrige un prompt : est-ce que ça a changé quelque chose pour les gens
-- à qui on parlait avant ?
--
-- -- CE QU'ON GARDE, ET CE QU'ON NE GARDE PAS --------------------------
--
-- Le rapport tel qu'il a été RENDU, avec le modèle et les compteurs au
-- moment de la génération. Pas les données brutes qui l'ont produit :
-- elles sont déjà en base, elles pèsent lourd, et ce n'est pas la
-- question à laquelle cette table doit répondre.
--
-- Le rapport porte du texte écrit par une IA sur le quiz de quelqu'un.
-- Il ne contient ni email de visiteur ni réponse individuelle, mais il
-- reste des données personnelles au sens où il parle de SON activité :
-- RLS stricte, chacun ne lit que les siennes, et l'écriture passe
-- uniquement par le service role.

CREATE TABLE IF NOT EXISTS public.ai_report_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'quiz' : le rapport d'UN quiz ou sondage. 'account' : le rapport
  -- global du portefeuille. Deux natures, une seule table : elles ont la
  -- même durée de vie et on les relit ensemble quand on retrace une
  -- conversation.
  scope        TEXT NOT NULL CHECK (scope IN ('quiz', 'account')),
  -- NULL quand scope = 'account'. ON DELETE CASCADE : supprimer un quiz
  -- doit rester possible (cf. le drame du bouton Supprimer, 3 août), et
  -- garder l'historique d'un quiz effacé n'aurait aucun usage.
  quiz_id      UUID REFERENCES public.quizzes(id) ON DELETE CASCADE,
  report       JSONB NOT NULL,
  model        TEXT,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_report_history IS
  'Historique des rapports produits par nos IA (analyse d''un quiz, analyse globale). quizzes.ai_insights et user_insight_reports ne gardent que le DERNIER : sans cette table, on ne peut pas savoir ce qui a ete conseille a quelqu''un il y a trois semaines.';

-- Les deux lectures qu'on fait vraiment : l'historique d'un quiz, et
-- tout ce qu'on a dit a quelqu'un.
CREATE INDEX IF NOT EXISTS ai_report_history_quiz_idx
  ON public.ai_report_history (quiz_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS ai_report_history_user_idx
  ON public.ai_report_history (user_id, generated_at DESC);

ALTER TABLE public.ai_report_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own report history" ON public.ai_report_history;
CREATE POLICY "own report history" ON public.ai_report_history
  FOR SELECT USING (auth.uid() = user_id);
-- Aucune policy d'ecriture : l'insertion passe par le service role, et
-- personne ne peut modifier ni effacer une ligne d'historique depuis le
-- client. Un historique qu'on peut reecrire ne sert a rien.

NOTIFY pgrst, 'reload schema';
