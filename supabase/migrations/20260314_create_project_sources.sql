-- Project Sources: permet aux utilisateurs d'ajouter du contexte (texte libre, PDF, DOCX)
-- qui sera injecté dans TOUS les prompts de génération de contenu.

CREATE TABLE IF NOT EXISTS project_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('text', 'pdf', 'docx')),
  title TEXT NOT NULL,
  content_text TEXT NOT NULL,
  original_filename TEXT,
  file_size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE project_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own sources"
  ON project_sources FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_project_sources_user_project
  ON project_sources(user_id, project_id);
