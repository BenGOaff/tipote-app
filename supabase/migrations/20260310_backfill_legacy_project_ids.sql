-- Migration: backfill project_id for ALL legacy data
-- The original migration (20260218) only linked business_profiles.
-- Beta/elite users who had data before multi-project still have
-- social_connections, automations, content, tasks, etc. with project_id=NULL.
-- This causes data to "disappear" when they create a second project.

DO $$
DECLARE
  rec RECORD;
BEGIN
  -- For each user who has a default project, link all orphan rows
  FOR rec IN
    SELECT p.id AS project_id, p.user_id
    FROM projects p
    WHERE p.is_default = true
  LOOP

    -- social_connections (OAuth tokens)
    UPDATE social_connections
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- social_automations (comment-to-DM automations)
    UPDATE social_automations
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- content_item (posts, articles, videos)
    UPDATE content_item
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- project_tasks (tasks)
    UPDATE project_tasks
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- hosted_pages (landing pages)
    UPDATE hosted_pages
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- auto_comment_logs (automation logs)
    UPDATE auto_comment_logs
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- offer_metrics (analytics)
    UPDATE offer_metrics
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- toast_widgets
    UPDATE toast_widgets
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- notifications
    UPDATE notifications
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

    -- business_profiles (catch any remaining)
    UPDATE business_profiles
    SET project_id = rec.project_id
    WHERE user_id = rec.user_id
      AND project_id IS NULL;

  END LOOP;
END;
$$;
