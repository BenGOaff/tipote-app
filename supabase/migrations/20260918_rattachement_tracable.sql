-- supabase/migrations/20260918_rattachement_tracable.sql
--
-- D'OÙ VIENT CE RATTACHEMENT, ET QUI L'A DÉCIDÉ.
--
-- Béné, 18 septembre 2026 : "je dois tout savoir sur tout, de façon
-- fiable et sécurisée", "je dois être sûre que untel est envoyé par
-- untel et que untel a envoyé telle et telle et telle personne".
--
-- -- CE QUI MANQUAIT -----------------------------------------------------
--
-- `affiliate_conversions` disait QUI et QUAND, jamais COMMENT. Or les
-- quatre chemins n'ont pas la même force de preuve, et c'est exactement
-- ce qu'elle a besoin de distinguer le jour où un affilié conteste :
--
--   * `clic`        : le visiteur a cliqué sur le lien, cookie posé ;
--   * `inscription` : il a créé un compte gratuit sur le lien ;
--   * `vente`       : il a acheté, et la vente portait le code ;
--   * `import_sio`  : repris d'un ancien tunnel Systeme.io ;
--   * `manuel`      : BÉNÉ l'a décidé, parce qu'un affilié a prouvé que
--                     le lien n'avait pas fonctionné.
--
-- Sans cette colonne, un rattachement manuel est indiscernable d'un clic
-- réel. Le jour d'un litige entre deux affiliés sur le même client, il
-- n'y a plus rien à opposer à personne.
--
-- -- ET UN GESTE MANUEL SE SIGNE ----------------------------------------
--
-- `decide_par` et `note` ne sont pas du confort : ils sont la PIÈCE. Un
-- rattachement à vie décidé à la main sans trace de qui l'a décidé ni
-- pourquoi est un geste qu'on ne peut pas expliquer six mois plus tard,
-- et il porte de l'argent (40 % de chaque échéance, pour toujours).
--
-- -- ON NE TOUCHE À AUCUNE LIGNE EXISTANTE ------------------------------
--
-- Les colonnes arrivent avec un défaut `NULL`, pas avec une valeur
-- inventée. Une conversion d'avant aujourd'hui n'a pas d'origine
-- connue, et écrire `clic` dessus serait une affirmation que personne
-- n'a mesurée. L'écran lit `null` comme "origine inconnue, ligne
-- antérieure au 18 septembre 2026", ce qui est la vérité.

alter table public.affiliate_conversions
  add column if not exists origine text;

alter table public.affiliate_conversions
  add column if not exists decide_par text;

alter table public.affiliate_conversions
  add column if not exists note text;

-- Retrouver tous les gestes manuels d'un coup, pour les relire.
create index if not exists idx_aff_conv_origine
  on public.affiliate_conversions (origine)
  where origine is not null;

comment on column public.affiliate_conversions.origine is
  'clic | inscription | vente | import_sio | manuel. NULL = ligne anterieure au 18 septembre 2026, origine non mesuree.';
comment on column public.affiliate_conversions.decide_par is
  'Sur un rattachement manuel : l''adresse admin qui l''a decide. La piece du geste.';
comment on column public.affiliate_conversions.note is
  'Sur un rattachement manuel : la raison, dans les mots de celle qui decide.';

notify pgrst, 'reload schema';
