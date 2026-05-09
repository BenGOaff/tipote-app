-- Personnalisation de la page publique d'un popquiz (Mai 2026)
--
-- Quand un user partage le lien direct `/pq/<id>` ou utilise l'embed
-- iframe, il doit pouvoir transformer la simple vidéo en vraie page
-- de présentation : titre, sous-titre, fond coloré ou en gradient,
-- bordure, ombre, bouton play stylisé, vignette custom.
--
-- Toutes les colonnes ont un default qui produit un rendu PROPRE et
-- minimaliste (pas de bordure noire moche, fond transparent → la
-- vidéo occupe tout l'écran et reste responsive). L'user n'a rien
-- à configurer pour avoir un rendu correct ; il customise s'il veut.

ALTER TABLE public.popquizzes
  -- Affichage en haut de la page publique (pas l'admin du popquiz)
  ADD COLUMN IF NOT EXISTS display_title TEXT,
  ADD COLUMN IF NOT EXISTS display_subtitle TEXT,

  -- Style de fond de la page :
  --   'transparent' : pas de fond (défaut, propre)
  --   'solid'       : couleur unie (bg_color)
  --   'gradient'    : dégradé linéaire (bg_color → bg_color_2)
  ADD COLUMN IF NOT EXISTS bg_style TEXT NOT NULL DEFAULT 'transparent',
  ADD COLUMN IF NOT EXISTS bg_color TEXT,
  ADD COLUMN IF NOT EXISTS bg_color_2 TEXT,

  -- Bordure autour du player (0 = pas de bordure, valeur défaut propre)
  ADD COLUMN IF NOT EXISTS border_width SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS border_color TEXT,

  -- Ombre portée :
  --   'none' (défaut) | 'soft' | 'medium' | 'strong'
  ADD COLUMN IF NOT EXISTS shadow_intensity TEXT NOT NULL DEFAULT 'none',

  -- Bouton play overlay
  ADD COLUMN IF NOT EXISTS play_button_color TEXT,
  -- 'circle' (défaut) | 'rounded' | 'square'
  ADD COLUMN IF NOT EXISTS play_button_shape TEXT NOT NULL DEFAULT 'circle',

  -- Si false, on cache le logo + lien site du créateur sur la page
  -- publique (pour un rendu épuré de type "produit fini"). Le footer
  -- "via Tiquiz" reste indépendant.
  ADD COLUMN IF NOT EXISTS show_creator_branding BOOLEAN NOT NULL DEFAULT TRUE;

-- Garde-fous valeurs autorisées
ALTER TABLE public.popquizzes
  ADD CONSTRAINT popquizzes_bg_style_check
    CHECK (bg_style IN ('transparent', 'solid', 'gradient')),
  ADD CONSTRAINT popquizzes_shadow_intensity_check
    CHECK (shadow_intensity IN ('none', 'soft', 'medium', 'strong')),
  ADD CONSTRAINT popquizzes_play_button_shape_check
    CHECK (play_button_shape IN ('circle', 'rounded', 'square')),
  ADD CONSTRAINT popquizzes_border_width_check
    CHECK (border_width >= 0 AND border_width <= 16);

COMMENT ON COLUMN public.popquizzes.display_title IS
  'Titre affiché en haut de la page publique (peut différer du title interne).';
COMMENT ON COLUMN public.popquizzes.bg_style IS
  'Type de fond de la page publique : transparent (défaut, propre) / solid / gradient.';
COMMENT ON COLUMN public.popquizzes.show_creator_branding IS
  'Si false, masque le logo + lien site du créateur sur la page publique. Le footer "via Tiquiz" reste indépendant.';
