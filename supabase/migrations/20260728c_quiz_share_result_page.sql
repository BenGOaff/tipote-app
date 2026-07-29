-- Partage du profil obtenu (retour Jocelyne 28 juillet 2026 : "sur FB,
-- mon partage montre le quiz, mais pas le profil que j'ai obtenu").
-- Quand active, le partage depuis l'ecran de resultat utilise une URL
-- ?rp=<resultId> dont l'apercu social (og:title + visuel genere) met en
-- avant le profil obtenu par le visiteur.
-- NULL = active (defaut choisi par Bene), false = partage du quiz seul.
alter table public.quizzes
  add column if not exists share_result_page boolean;

notify pgrst, 'reload schema';
