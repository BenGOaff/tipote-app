-- Retour Jocelyne 28 juillet 2026 : le titre de l'ecran bonus ("Avant de
-- decouvrir tes resultats...") etait code en dur et tutoyait le visiteur
-- meme quand le createur a choisi le vouvoiement. On le rend editable
-- par quiz, comme capture_heading. NULL = defaut localise du viewer
-- (qui respecte address_form).
alter table public.quizzes
  add column if not exists bonus_heading text;

notify pgrst, 'reload schema';
