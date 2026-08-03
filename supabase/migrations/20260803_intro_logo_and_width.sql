-- 20260803_intro_logo_and_width.sql
--
-- LOGO INDÉPENDANT + LARGEUR DU BLOC D'ACCUEIL (retours Béné, 3 août 2026).
--
-- 1. "Si je centre mon titre à gauche, il centre aussi le logo : on doit
--    pouvoir centrer, aligner à gauche ou à droite le logo indépendamment
--    du titre ET on doit aussi pouvoir l'agrandir et le rétrécir comme
--    pour les gif et les images."
--
--    En calant le logo sur le titre (correctif de la veille), on avait
--    réglé un décalage et créé une contrainte. Un logo n'est pas un bloc
--    de texte : beaucoup de marques le veulent centré au dessus d'un
--    titre aligné à gauche.
--
-- 2. "Pourquoi la case du sous titre est plus courte que celle du titre ??"
--
--    Le sous-titre portait un `max-w-xl` écrit en dur sous un conteneur
--    `max-w-2xl` : 36rem contre 42rem. Invisible tant que tout était
--    centré, flagrant dès l'alignement à gauche. La borne passe sur le
--    CONTENEUR COMMUN, réglable au curseur.
--
-- CE QUI GARANTIT QUE RIEN NE BOUGE POUR LES QUIZ EXISTANTS :
-- les trois colonnes sont NULL par défaut, et le code traite NULL comme
-- "comportement d'avant" (logo aligné sur le titre, taille `max-h-16`,
-- bloc de texte pleine largeur). Cf. lib/quiz/introLayout.ts.

alter table public.quizzes
  -- 'auto' (ou NULL) = le logo suit le titre, comme avant ce réglage.
  -- 'left' | 'center' | 'right' = la créatrice a décidé pour lui seul.
  add column if not exists brand_logo_align  text,
  -- Largeur du logo en % du bloc de contenu (10 à 100).
  -- NULL = taille historique (max-h-16 w-auto), donc aucun quiz ne bouge.
  add column if not exists brand_logo_width  integer,
  -- Largeur du bloc titre + sous-titre en % (50 à 99).
  -- NULL = pleine largeur. Le titre et le sous-titre vivent dans le MEME
  -- conteneur, donc ils partagent cette largeur par construction : il n'y
  -- a plus de borne propre à l'un des deux qui puisse les désaligner.
  add column if not exists intro_text_width  integer;

comment on column public.quizzes.brand_logo_align is
  'Alignement du logo sur l''écran d''accueil : auto (suit le titre, défaut) | left | center | right.';
comment on column public.quizzes.brand_logo_width is
  'Largeur du logo en % du bloc de contenu (10-100). NULL = taille historique max-h-16.';
comment on column public.quizzes.intro_text_width is
  'Largeur du bloc titre + sous-titre en % (50-99). NULL = pleine largeur. Portée par le conteneur commun, jamais par un des deux champs.';

-- Valeurs libres côté app, mais on ferme la porte aux valeurs inventées :
-- un alignement inconnu donnerait un écran d'accueil imprévisible.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'quizzes_brand_logo_align_check'
  ) then
    alter table public.quizzes
      add constraint quizzes_brand_logo_align_check
      check (brand_logo_align is null or brand_logo_align in ('auto', 'left', 'center', 'right'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'quizzes_brand_logo_width_check'
  ) then
    alter table public.quizzes
      add constraint quizzes_brand_logo_width_check
      check (brand_logo_width is null or (brand_logo_width between 10 and 100));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'quizzes_intro_text_width_check'
  ) then
    alter table public.quizzes
      add constraint quizzes_intro_text_width_check
      check (intro_text_width is null or (intro_text_width between 50 and 100));
  end if;
end $$;

notify pgrst, 'reload schema';
