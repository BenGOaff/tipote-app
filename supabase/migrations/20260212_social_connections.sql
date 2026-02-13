-- =============================================================
-- Table: social_connections
-- Stocke les tokens OAuth des comptes sociaux connectés par user
-- =============================================================

CREATE TABLE IF NOT EXISTS social_connections (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL CHECK (platform IN ('linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads')),

  -- Identifiant + nom sur la plateforme (ex: LinkedIn person URN, display name)
  platform_user_id   TEXT,
  platform_username  TEXT,

  -- Tokens chiffrés (AES-256-GCM côté serveur Node.js)
  access_token_encrypted   TEXT NOT NULL,
  refresh_token_encrypted  TEXT,
  token_expires_at         TIMESTAMPTZ,

  -- Scopes accordés (pour vérification future)
  scopes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un seul compte par plateforme par projet par user
  UNIQUE(user_id, project_id, platform)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_social_connections_user
  ON social_connections(user_id, project_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE social_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
  ON social_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own connections"
  ON social_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own connections"
  ON social_connections FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own connections"
  ON social_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- Accès service_role (pour les appels n8n via supabaseAdmin)
-- Le service_role bypass RLS par défaut, pas besoin de policy.
-- ============================================================
