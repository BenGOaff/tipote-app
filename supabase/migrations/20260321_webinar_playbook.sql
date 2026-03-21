-- Add playbook columns to webinars table
ALTER TABLE webinars
  ADD COLUMN IF NOT EXISTS playbook_progress JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS playbook_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN webinars.playbook_progress IS 'Checklist progress per phase, e.g. {"phase1_theme":true,"phase2_script":true}';
COMMENT ON COLUMN webinars.playbook_data IS 'AI-generated playbook content: titles, chosen title, program, bonus ideas, etc.';
