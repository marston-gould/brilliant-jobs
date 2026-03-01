-- Migration: Add validation + approval gate columns to content_stories
-- Item #15: Approval gates for editorial pipeline
-- v5.89 — February 28, 2026
-- 
-- All columns are nullable with defaults — backward-compatible, additive only.
-- Existing rows unaffected. No breaking changes.

-- Validation columns (from CONTENT_ENGINE_MULTI_MODEL_VALIDATION.md spec)
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS validation_score integer;
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS validation_result jsonb;
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS model_used text;
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS generation_latency_ms integer;

-- Approval gate columns
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE content_stories ADD COLUMN IF NOT EXISTS review_notes text;

-- Index for the editorial review queue (pending_review stories ordered by score)
CREATE INDEX IF NOT EXISTS idx_content_stories_review_queue 
  ON content_stories (status, score DESC) 
  WHERE status IN ('pending_review', 'validation_failed_final');

-- Index for validation failures needing retry
CREATE INDEX IF NOT EXISTS idx_content_stories_retry_queue
  ON content_stories (status, retry_count)
  WHERE status = 'validation_failed' AND retry_count < 2;

-- Comment for documentation
COMMENT ON COLUMN content_stories.validation_score IS 'Percentage score from 6-layer validation gate (0-100)';
COMMENT ON COLUMN content_stories.validation_result IS 'Full validation result JSON: checks[], hard_fails[], soft_fails[], warnings[]';
COMMENT ON COLUMN content_stories.retry_count IS 'Number of generation retry attempts after validation failure (max 2)';
COMMENT ON COLUMN content_stories.model_used IS 'LLM model identifier used for generation';
COMMENT ON COLUMN content_stories.generation_latency_ms IS 'Time from API call to response in milliseconds';
COMMENT ON COLUMN content_stories.reviewed_by IS 'User ID of editorial reviewer who approved/rejected';
COMMENT ON COLUMN content_stories.reviewed_at IS 'Timestamp of editorial review decision';
COMMENT ON COLUMN content_stories.review_notes IS 'Reviewer notes on approval or rejection reason';

-- Rollback SQL (for reference, do not run):
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS validation_score;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS validation_result;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS retry_count;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS model_used;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS generation_latency_ms;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS reviewed_by;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS reviewed_at;
-- ALTER TABLE content_stories DROP COLUMN IF EXISTS review_notes;
-- DROP INDEX IF EXISTS idx_content_stories_review_queue;
-- DROP INDEX IF EXISTS idx_content_stories_retry_queue;
