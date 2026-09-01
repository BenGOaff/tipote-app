-- 20260901_cta_par_profil.sql
--
-- LE BOUTON DE LA PAGE DE RÉSULTAT VIENT DU PROFIL (Béné, 25 août 2026).
--
-- "On vire le CTA par défaut : il faut remplir pour chaque profil point
-- barre. Si rien = pas de CTA."
--
-- CETTE MIGRATION NE CHANGE RIEN POUR AUCUN VISITEUR. C'est même
-- exactement son but : elle recopie, dans chaque profil, le bouton que
-- ce profil AFFICHE DÉJÀ grâce au repli. Sans elle, retirer le repli
-- ferait disparaître le bouton de tout quiz en ligne dont les profils
-- n'ont pas leur propre adresse. Sur la page qui vend.
--
-- Le repli portait l'ADRESSE autant que le libellé, et c'est l'adresse
-- qui décide si le bouton existe :
--     resultProfile?.cta_url  || quiz.cta_url
--     resultProfile?.cta_text || quiz.cta_text
--
-- ⚠️ ORDRE DE DÉPLOIEMENT : cette migration s'applique AVANT le code.
-- Dans l'autre sens, les quiz concernés perdent leur bouton le temps que
-- le SQL passe.
--
-- ELLE NE PEUT PAS ÉCRASER DU TRAVAIL, et c'est la demande explicite de
-- Béné ("fais attention à ne pas réécrire un CTA qui a été créé
-- directement dans l'éditeur du quiz") :
--   - chaque champ est traité SÉPARÉMENT, et seulement s'il est VIDE ;
--   - un profil qui a déjà son adresse garde la sienne, même si son
--     libellé est vide (et réciproquement) ;
--   - `quizzes.cta_text` / `cta_url` ne sont ni vidés ni supprimés : la
--     valeur d'origine reste lisible, et les SONDAGES continuent de s'en
--     servir (ils n'ont pas de profil, c'est leur seul bouton).
--
-- Elle est IDEMPOTENTE : relancée, elle ne trouve plus rien à remplir.

update quiz_results r
set
  cta_url = case
    when coalesce(nullif(btrim(r.cta_url), ''), '') = '' then q.cta_url
    else r.cta_url
  end,
  cta_text = case
    when coalesce(nullif(btrim(r.cta_text), ''), '') = '' then q.cta_text
    else r.cta_text
  end
from quizzes q
where r.quiz_id = q.id
  -- Un sondage n'a pas de profil : rien à recopier, et son CTA de quiz
  -- reste le sien.
  and q.mode <> 'survey'
  -- Rien à reprendre si le quiz n'a pas de bouton par défaut.
  and coalesce(nullif(btrim(q.cta_url), ''), '') <> ''
  -- Au moins un des deux champs du profil est vide.
  and (
    coalesce(nullif(btrim(r.cta_url), ''), '') = ''
    or coalesce(nullif(btrim(r.cta_text), ''), '') = ''
  );

notify pgrst, 'reload schema';
