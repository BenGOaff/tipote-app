-- 20260803_result_four_beats.sql
--
-- LA PAGE DE RÉSULTAT EN 4 TEMPS (demande Béné, 3 août 2026).
--
-- L'Atelier enseigne "vendre avec un quiz" en 4 temps : le miroir, la
-- cause, le chemin, le pont. Tiquiz ne le disait nulle part, donc les
-- pages de résultat générées ne suivaient pas la méthode que les élèves
-- viennent d'apprendre. Ce n'est pas un manque de fonctionnalité, c'est
-- un décalage entre ce qu'on enseigne et ce que l'outil produit.
--
-- CE QUI EXISTE DÉJÀ ET QU'ON NE TOUCHE PAS. Trois des quatre temps sont
-- déjà en base depuis le premier jour, sous d'autres noms :
--
--   le miroir -> quiz_results.title + quiz_results.description
--   la cause  -> quiz_results.insight    (+ insight_heading)
--   le chemin -> quiz_results.projection (+ projection_heading)
--
-- Il ne manquait que LE PONT : le texte court qui relie ce que le
-- visiteur vient de lire à l'offre, juste avant le bouton. Aujourd'hui
-- il n'y a que `cta_text`, qui est le LIBELLÉ du bouton (3 à 6 mots) et
-- ne peut pas porter de bénéfices.
--
-- RÈGLE ABSOLUE : AUCUN QUIZ EXISTANT NE BOUGE.
-- `quizzes.result_layout` vaut 'classic' par défaut, ce qui rend la page
-- exactement comme aujourd'hui, au pixel près. Seuls les quiz générés à
-- partir de maintenant naissent en 'beats', et une créatrice peut basculer
-- un ancien quiz depuis l'éditeur si elle le décide.

alter table public.quiz_results
  -- Le pont : "voilà ce que tu peux faire maintenant", avec les bénéfices.
  add column if not exists bridge         text,
  -- Titre du pont pour CE profil. NULL/vide = titre commun du quiz.
  add column if not exists bridge_heading text,
  -- Image PAR TEMPS. Une créatrice doit pouvoir illustrer un temps, ou
  -- remplacer son texte par un visuel (demande Béné). JSONB plutôt que 12
  -- colonnes : la forme est { "<temps>": { url, width, mode } } avec
  -- <temps> dans mirror | cause | path | bridge, width en % (25 à 100) et
  -- mode "with" (image ET texte) ou "only" (image À LA PLACE du texte).
  -- Sanitizé côté serveur (lib/quiz/resultBeats.ts), jamais écrit brut.
  add column if not exists beat_media     jsonb;

comment on column public.quiz_results.bridge is
  'Le pont : texte court qui relie le résultat à l''offre, juste avant le CTA. NULL = bloc absent (tous les quiz d''avant le 3 août 2026).';
comment on column public.quiz_results.bridge_heading is
  'Titre du bloc pont pour CE profil. NULL/vide = quizzes.result_bridge_heading.';
comment on column public.quiz_results.beat_media is
  'Image par temps : { mirror|cause|path|bridge: { url, width, mode } }. mode = with | only.';

alter table public.quizzes
  -- Titre commun du bloc pont (comme result_insight_heading / _projection).
  add column if not exists result_bridge_heading text,
  add column if not exists show_result_bridge    boolean not null default true,
  -- 'classic' = la page telle qu'elle est depuis toujours.
  -- 'beats'   = les 4 temps, visuellement séparés.
  -- Le DEFAULT est ce qui garantit qu'aucun quiz existant ne change.
  add column if not exists result_layout         text not null default 'classic';

comment on column public.quizzes.result_layout is
  'Mise en page de la page de résultat : classic (historique, défaut) ou beats (les 4 temps de l''Atelier). Les quiz générés par l''IA naissent en beats.';

-- Valeur libre côté app, mais on ferme la porte aux valeurs inventées :
-- un layout inconnu ferait un écran vide chez le visiteur.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quizzes_result_layout_check'
  ) then
    alter table public.quizzes
      add constraint quizzes_result_layout_check
      check (result_layout in ('classic', 'beats'));
  end if;
end $$;

notify pgrst, 'reload schema';
