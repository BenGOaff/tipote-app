-- 20260902_generateurs_contenus.sql
--
-- LES CONTENUS GÉNÉRÉS SE RETROUVENT (Béné, 2 septembre 2026).
--
-- "Il faut aussi que les users retrouvent leurs créations dans
-- 'générateurs' : ajoute une étape avec le choix -> 'mes contenus
-- générés' > 3 blocs pour classer les 3 types de contenus générés OU
-- 'générer de nouveaux contenus' > 3 générateurs."
--
-- Jusqu'ici, un contenu généré vivait dans l'onglet du navigateur et
-- nulle part ailleurs : un rafraîchissement, et le travail (payé en
-- crédits côté Tipote) était perdu. La créatrice n'avait aucun moyen de
-- savoir qu'elle avait déjà écrit la séquence de ce profil là.
--
-- -- UNE LIGNE PAR LIVRAISON, PAS PAR MORCEAU -------------------------
--
-- Une séquence de cinq emails est UN contenu, pas cinq. Découper en
-- cinq lignes obligerait chaque lecteur à les recoller dans le bon
-- ordre, et le premier qui oublie le tri affiche l'email 4 en premier.
-- Les morceaux vivent donc dans `pieces` (JSONB), dans l'ordre où ils
-- ont été écrits.
--
-- -- ON ÉCRIT AU FUR ET À MESURE, PAS À LA FIN ------------------------
--
-- Une génération de huit morceaux dure une minute et demie. Enregistrer
-- seulement à la fin perdrait tout si la personne ferme l'onglet au
-- septième, c'est à dire au moment où elle a déjà tout payé. La ligne
-- est créée au premier morceau et complétée ensuite (`updated_at`).
--
-- -- LE PROJET EST GARDÉ, MÊME SI LE QUIZ DISPARAÎT -------------------
--
-- `quiz_id` est en ON DELETE SET NULL, et le TITRE du quiz est recopié
-- dans `quiz_titre`. Un quiz supprimé ne doit pas emporter les emails
-- qu'on a écrits pour lui : ils ont peut-être déjà été programmés dans
-- Systeme.io, et les relire est le seul moyen de savoir ce qui part.
-- C'est la règle de la facture émise (24 août) : la pièce est figée,
-- elle ne se relit pas dans la source.

create table if not exists public.generateur_contenus (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  project_id   uuid,
  quiz_id      uuid references public.quizzes(id) on delete set null,
  quiz_titre   text not null default '',
  generateur   text not null,
  titre        text not null default '',
  profil_index integer,
  profil_titre text not null default '',
  pieces       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Le tri de la bibliothèque : le plus récent en premier, par personne.
create index if not exists generateur_contenus_user_idx
  on public.generateur_contenus (user_id, created_at desc);

-- Les trois blocs de classement de l'écran "Mes contenus générés".
create index if not exists generateur_contenus_type_idx
  on public.generateur_contenus (user_id, generateur, created_at desc);

alter table public.generateur_contenus enable row level security;

-- Aucune policy : rien ne passe par la clé anon. Les routes lisent et
-- écrivent avec la clé de service, APRÈS avoir vérifié la session, et
-- filtrent sur `user_id`. Une policy permissive ouvrirait les contenus
-- d'une créatrice à une autre, et c'est son travail.

notify pgrst, 'reload schema';
