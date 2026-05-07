-- Migration: project visual identity (multi-project UX)
--
-- Adds 3 optional columns to `projects` so an Elite user juggling
-- several projects (e.g. one for affiliation software, one for the
-- health niche) can recognise instantly which one is active:
--   - accent_color : hex code applied to the project pill in header,
--                    sidebar marker, and editor focus rings
--   - icon_emoji   : single emoji shown next to the project name
--   - use_branding_logo : if true, fall back to the project's
--                         business_profile.brand_logo_url instead of
--                         the emoji (handy when the user has already
--                         set up branding for the project)
--
-- Strictly additive — no existing row is affected. Projects without
-- any styling fall back to a neutral pill, exactly like today.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS accent_color TEXT,
  ADD COLUMN IF NOT EXISTS icon_emoji TEXT,
  ADD COLUMN IF NOT EXISTS use_branding_logo BOOLEAN NOT NULL DEFAULT FALSE;

-- Light validation: hex colors only when set (#RRGGBB or #RGB), and
-- single grapheme for the emoji. Keeps the UI safe without forcing
-- an enum so we can extend the palette later.
ALTER TABLE projects
  ADD CONSTRAINT projects_accent_color_format
    CHECK (accent_color IS NULL OR accent_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'),
  ADD CONSTRAINT projects_icon_emoji_length
    CHECK (icon_emoji IS NULL OR char_length(icon_emoji) BETWEEN 1 AND 8);
