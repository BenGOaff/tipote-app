-- Add facebook_messenger as allowed platform in social_connections
-- Used for per-user Messenger tokens (via Tipote ter app) for DM automations

ALTER TABLE social_connections DROP CONSTRAINT IF EXISTS social_connections_platform_check;

ALTER TABLE social_connections ADD CONSTRAINT social_connections_platform_check
  CHECK (platform IN ('linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'threads', 'facebook_messenger', 'pinterest'));
