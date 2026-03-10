-- ============================================================
-- SUPPORT / HELP CENTER
-- Tables: support_categories, support_articles
-- ============================================================

-- 1) Categories
CREATE TABLE IF NOT EXISTS support_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  icon        TEXT NOT NULL DEFAULT 'HelpCircle',
  sort_order  INT NOT NULL DEFAULT 0,
  -- Multilingual titles & descriptions (JSONB keyed by locale)
  title       JSONB NOT NULL DEFAULT '{}',  -- {"fr":"...", "en":"...", ...}
  description JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Articles
CREATE TABLE IF NOT EXISTS support_articles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   UUID NOT NULL REFERENCES support_categories(id) ON DELETE CASCADE,
  slug          TEXT NOT NULL UNIQUE,
  sort_order    INT NOT NULL DEFAULT 0,
  -- Multilingual content
  title         JSONB NOT NULL DEFAULT '{}',
  content       JSONB NOT NULL DEFAULT '{}',  -- markdown per locale
  -- Related articles (array of article slugs)
  related_slugs TEXT[] NOT NULL DEFAULT '{}',
  -- SEO & meta
  tags          TEXT[] NOT NULL DEFAULT '{}',
  -- Visibility
  published     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_support_articles_category ON support_articles(category_id);
CREATE INDEX idx_support_articles_tags ON support_articles USING GIN(tags);
CREATE INDEX idx_support_articles_published ON support_articles(published) WHERE published = true;

-- RLS — public read, admin write
ALTER TABLE support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_articles ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "support_categories_read" ON support_categories FOR SELECT USING (true);
CREATE POLICY "support_articles_read"   ON support_articles   FOR SELECT USING (true);

-- Only service_role can write (admin API uses service role key)
CREATE POLICY "support_categories_admin_insert" ON support_categories FOR INSERT WITH CHECK (false);
CREATE POLICY "support_categories_admin_update" ON support_categories FOR UPDATE USING (false);
CREATE POLICY "support_categories_admin_delete" ON support_categories FOR DELETE USING (false);
CREATE POLICY "support_articles_admin_insert"   ON support_articles   FOR INSERT WITH CHECK (false);
CREATE POLICY "support_articles_admin_update"   ON support_articles   FOR UPDATE USING (false);
CREATE POLICY "support_articles_admin_delete"   ON support_articles   FOR DELETE USING (false);
