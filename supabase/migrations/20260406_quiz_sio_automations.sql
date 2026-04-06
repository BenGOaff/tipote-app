-- =============================================================
-- Add SIO course enrollment + community membership fields to quiz_results
-- Follows the same pattern as sio_tag_name
-- =============================================================

-- Course auto-enrollment: when user gets this result, enroll in SIO course
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS sio_course_id TEXT;

-- Community auto-access: when user gets this result, add to SIO community
ALTER TABLE quiz_results ADD COLUMN IF NOT EXISTS sio_community_id TEXT;
