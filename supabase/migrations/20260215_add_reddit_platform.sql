-- Add 'reddit' to the platform CHECK constraint
-- (Run only once — idempotent ALTER)

DO $$
BEGIN
  ALTER TABLE social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_check;
  ALTER TABLE social_connections
    ADD CONSTRAINT social_connections_platform_check
    CHECK (platform IN ('linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'reddit'));
END $$;
