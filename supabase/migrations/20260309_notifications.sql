-- Notifications table
-- Supports: auto notifications, admin broadcasts, per-user messages
-- Tabs: unread / all / archived

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Content
  type        TEXT NOT NULL DEFAULT 'info',
    -- auto types: post_published, content_reminder, strategy_progress, stats_reminder
    -- admin types: admin_broadcast, admin_personal
  title       TEXT NOT NULL,
  body        TEXT,
  icon        TEXT,              -- optional emoji or icon name
  action_url  TEXT,              -- optional deep-link
  action_label TEXT,             -- optional CTA label

  -- State
  read_at     TIMESTAMPTZ,      -- NULL = unread
  archived_at TIMESTAMPTZ,      -- NULL = not archived

  -- Meta
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications (user_id, read_at)
  WHERE read_at IS NULL;

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY notifications_select ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY notifications_update ON notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (admin) can insert for any user
CREATE POLICY notifications_insert_service ON notifications
  FOR INSERT WITH CHECK (true);

-- Service role can delete
CREATE POLICY notifications_delete_service ON notifications
  FOR DELETE USING (true);
