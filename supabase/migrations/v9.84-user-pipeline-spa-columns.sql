-- ============================================================
-- v9.84 — user_pipeline: add SPA-required columns
-- Missing: stage_changed_at, tracking_mode, status_note
-- These are written by usePipeline.ts but didn't exist in
-- the original user_pipeline schema (ghost_phase1).
-- ============================================================

ALTER TABLE user_pipeline
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS tracking_mode text DEFAULT 'auto'
    CHECK (tracking_mode IN ('auto', 'muted', NULL)),
  ADD COLUMN IF NOT EXISTS status_note text;

-- Backfill stage_changed_at from most-recent stage timestamp
UPDATE user_pipeline
SET stage_changed_at = GREATEST(
  COALESCE(archived_at, '1970-01-01'),
  COALESCE(rejected_at, '1970-01-01'),
  COALESCE(hired_at, '1970-01-01'),
  COALESCE(offer_at, '1970-01-01'),
  COALESCE(interview_at, '1970-01-01'),
  COALESCE(responded_at, '1970-01-01'),
  COALESCE(applied_at, '1970-01-01'),
  COALESCE(saved_at, created_at, now())
)
WHERE stage_changed_at IS NULL OR stage_changed_at = created_at;

-- Index for staleness queries
CREATE INDEX IF NOT EXISTS idx_pipeline_user_stage_changed
  ON user_pipeline (user_id, stage_changed_at DESC);
