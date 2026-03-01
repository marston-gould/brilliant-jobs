-- ============================================================================
-- v6.10 — Session 10: Data Aggregation Edge Functions
-- Run in Supabase SQL Editor (service role)
-- Idempotent — safe to re-run
-- ============================================================================

-- ============================================================
-- 1. Ensure saved_filters table exists (needed by filter trends + anomaly detector)
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for per-user lookups
CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id);

-- RLS
ALTER TABLE saved_filters ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'saved_filters' AND policyname = 'Users manage own filters') THEN
    EXECUTE 'CREATE POLICY "Users manage own filters" ON saved_filters FOR ALL USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- 2. Ensure credit_transactions table exists (needed by credit cost comparison)
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  feature text NOT NULL,
  credits_used int NOT NULL DEFAULT 1,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_date
  ON credit_transactions(user_id, created_at);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'credit_transactions' AND policyname = 'Users read own credits') THEN
    EXECUTE 'CREATE POLICY "Users read own credits" ON credit_transactions FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- 3. Ensure resume_rewrites table exists (needed by rewrite batch summary)
-- ============================================================
CREATE TABLE IF NOT EXISTS resume_rewrites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  batch_id text,
  filter_name text,
  resume_name text,
  original_score int,
  rewritten_score int,
  credits_used int DEFAULT 1,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resume_rewrites_user_date
  ON resume_rewrites(user_id, created_at);

ALTER TABLE resume_rewrites ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'resume_rewrites' AND policyname = 'Users read own rewrites') THEN
    EXECUTE 'CREATE POLICY "Users read own rewrites" ON resume_rewrites FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ============================================================
-- 4. Add credits_remaining to profiles if not present
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'credits_remaining'
  ) THEN
    ALTER TABLE profiles ADD COLUMN credits_remaining int DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- 5. pg_cron schedules for new Edge Functions
-- ============================================================

-- Monthly report: 1st of every month at 8am ET (13:00 UTC)
-- (Only create if not already scheduled)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'monthly-report'
  ) THEN
    PERFORM cron.schedule(
      'monthly-report',
      '0 13 1 * *',
      $$
      SELECT net.http_post(
        url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/monthly-report',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
      $$
    );
  END IF;
END $$;

-- Trend anomaly detector: daily at 6am UTC
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'trend-anomaly-detector'
  ) THEN
    PERFORM cron.schedule(
      'trend-anomaly-detector',
      '0 6 * * *',
      $$
      SELECT net.http_post(
        url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/trend-anomaly-detector',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
        ),
        body := '{}'::jsonb
      );
      $$
    );
  END IF;
END $$;

-- Note: weekly-summary already has a pg_cron schedule (Mon 8am ET).
-- No change needed — the extended EF will be deployed in-place.

-- ============================================================
-- 6. Seed notification_templates for new types (idempotent)
-- ============================================================
INSERT INTO notification_templates (type, name, description, category, default_email, default_sms)
VALUES
  ('monthly_pipeline_report', 'Monthly Pipeline Report', 'Monthly MoM pipeline performance summary', 'data', true, false),
  ('pipeline_benchmark', 'Pipeline Benchmark', 'How your pipeline compares to the community', 'data', true, false),
  ('market_stats', 'Market Pulse', 'Weekly market intelligence and hiring trends', 'data', true, false),
  ('trend_anomaly', 'Trend Anomaly', 'Alerts when job volume deviates significantly from baseline', 'data', true, false),
  ('filter_trend', 'Filter Trends', 'Weekly performance breakdown per saved filter', 'data', true, false),
  ('ghost_report', 'Ghost Report', 'Weekly summary of ghosted applications', 'data', true, false),
  ('upgrade_roi_summary', 'Upgrade ROI Summary', 'Monthly value/opportunity summary (tier-gated)', 'data', true, false),
  ('credit_cost_comparison', 'Credit Usage Report', 'Monthly AI credit usage and plan comparison', 'data', true, false),
  ('rewrite_batch_summary', 'Rewrite Batch Summary', 'Summary of resume rewrite batch results', 'data', true, false)
ON CONFLICT (type) DO NOTHING;

-- Seed admin_notification_config for new types
INSERT INTO admin_notification_config (notification_type, enabled, a_b_weight_a, a_b_weight_b, notes)
VALUES
  ('monthly_pipeline_report', true, 50, 50, 'Monthly report — 1st of month'),
  ('pipeline_benchmark', true, 50, 50, 'Monthly benchmark — 1st of month'),
  ('market_stats', true, 50, 50, 'Weekly market pulse — Monday'),
  ('trend_anomaly', true, 50, 50, 'Daily anomaly scan — 6am UTC'),
  ('filter_trend', true, 50, 50, 'Weekly filter trends — Monday'),
  ('ghost_report', true, 50, 50, 'Weekly ghost report — Monday'),
  ('upgrade_roi_summary', true, 50, 50, 'Monthly ROI — tier-gated'),
  ('credit_cost_comparison', true, 50, 50, 'Monthly credit report'),
  ('rewrite_batch_summary', true, 50, 50, 'On batch completion')
ON CONFLICT (notification_type) DO NOTHING;

-- ============================================================
-- 7. Rollback SQL (save for reference, do not run)
-- ============================================================
-- SELECT cron.unschedule('monthly-report');
-- SELECT cron.unschedule('trend-anomaly-detector');
-- DELETE FROM notification_templates WHERE type IN ('monthly_pipeline_report','pipeline_benchmark','market_stats','trend_anomaly','filter_trend','ghost_report','upgrade_roi_summary','credit_cost_comparison','rewrite_batch_summary');
-- DELETE FROM admin_notification_config WHERE notification_type IN ('monthly_pipeline_report','pipeline_benchmark','market_stats','trend_anomaly','filter_trend','ghost_report','upgrade_roi_summary','credit_cost_comparison','rewrite_batch_summary');

-- ============================================================
-- Done. v6.10 migration complete.
-- ============================================================
