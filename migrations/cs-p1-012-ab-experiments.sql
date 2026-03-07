-- CS-P1-012 (TS1-4): A/B testing framework for drip campaigns
-- Supports subject line, body variant, and send-time experiments
-- Integrates with existing notification_templates + PostHog

-- ═══════════════════════════════════════════════════
-- 1. ab_experiments — Experiment definitions
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ab_experiments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  notification_type TEXT NOT NULL,  -- e.g. 'onboarding_welcome', 're_engagement_14d'
  channel TEXT NOT NULL DEFAULT 'email',  -- 'email' | 'sms'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  -- Variant definitions: JSONB array of { variant_id, weight, subject_override?, template_version? }
  -- Example: [{"variant_id":"control","weight":50},{"variant_id":"b","weight":50,"subject_override":"New subject"}]
  variants JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Targeting: which users are eligible
  target_cohort TEXT DEFAULT 'all',  -- 'all', or cohort_id
  target_tiers TEXT[] DEFAULT ARRAY['free','starter','pro'],
  -- Metrics
  metric_primary TEXT NOT NULL DEFAULT 'open_rate',  -- 'open_rate' | 'click_rate' | 'conversion'
  metric_secondary TEXT DEFAULT 'click_rate',
  -- Lifecycle
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  min_sample_size INT DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup during send path
CREATE INDEX IF NOT EXISTS idx_ab_experiments_active 
  ON ab_experiments (notification_type, channel, status) 
  WHERE status = 'active';

-- ═══════════════════════════════════════════════════
-- 2. ab_assignments — User-to-variant assignments (sticky)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ab_assignments (
  experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  variant_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  -- Outcome tracking
  email_sent BOOLEAN DEFAULT false,
  email_opened BOOLEAN DEFAULT false,
  email_clicked BOOLEAN DEFAULT false,
  converted BOOLEAN DEFAULT false,
  conversion_at TIMESTAMPTZ,
  PRIMARY KEY (experiment_id, user_id)
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_ab_assignments_user 
  ON ab_assignments (user_id, experiment_id);

-- ═══════════════════════════════════════════════════
-- 3. ab_results — Aggregated experiment results (materialized by cron)
-- ═══════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS ab_results (
  experiment_id UUID NOT NULL REFERENCES ab_experiments(id) ON DELETE CASCADE,
  variant_id TEXT NOT NULL,
  total_sent INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_clicked INT DEFAULT 0,
  total_converted INT DEFAULT 0,
  open_rate NUMERIC(5,4) DEFAULT 0,
  click_rate NUMERIC(5,4) DEFAULT 0,
  conversion_rate NUMERIC(5,4) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (experiment_id, variant_id)
);

-- ═══════════════════════════════════════════════════
-- 4. RLS Policies
-- ═══════════════════════════════════════════════════
ALTER TABLE ab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_results ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (edge functions)
CREATE POLICY "service_role_ab_experiments" ON ab_experiments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ab_assignments" ON ab_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_ab_results" ON ab_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can see their own assignments (for debugging/transparency)
CREATE POLICY "user_own_assignments" ON ab_assignments
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════
-- 5. Cron: aggregate ab_results every hour
-- ═══════════════════════════════════════════════════
SELECT cron.schedule(
  'aggregate-ab-results',
  '0 * * * *',  -- hourly
  $$
  INSERT INTO ab_results (experiment_id, variant_id, total_sent, total_opened, total_clicked, total_converted, open_rate, click_rate, conversion_rate, updated_at)
  SELECT
    a.experiment_id,
    a.variant_id,
    COUNT(*) FILTER (WHERE a.email_sent) AS total_sent,
    COUNT(*) FILTER (WHERE a.email_opened) AS total_opened,
    COUNT(*) FILTER (WHERE a.email_clicked) AS total_clicked,
    COUNT(*) FILTER (WHERE a.converted) AS total_converted,
    CASE WHEN COUNT(*) FILTER (WHERE a.email_sent) > 0
      THEN COUNT(*) FILTER (WHERE a.email_opened)::numeric / COUNT(*) FILTER (WHERE a.email_sent)
      ELSE 0 END,
    CASE WHEN COUNT(*) FILTER (WHERE a.email_sent) > 0
      THEN COUNT(*) FILTER (WHERE a.email_clicked)::numeric / COUNT(*) FILTER (WHERE a.email_sent)
      ELSE 0 END,
    CASE WHEN COUNT(*) FILTER (WHERE a.email_sent) > 0
      THEN COUNT(*) FILTER (WHERE a.converted)::numeric / COUNT(*) FILTER (WHERE a.email_sent)
      ELSE 0 END,
    now()
  FROM ab_assignments a
  JOIN ab_experiments e ON e.id = a.experiment_id
  WHERE e.status = 'active'
  GROUP BY a.experiment_id, a.variant_id
  ON CONFLICT (experiment_id, variant_id) DO UPDATE SET
    total_sent = EXCLUDED.total_sent,
    total_opened = EXCLUDED.total_opened,
    total_clicked = EXCLUDED.total_clicked,
    total_converted = EXCLUDED.total_converted,
    open_rate = EXCLUDED.open_rate,
    click_rate = EXCLUDED.click_rate,
    conversion_rate = EXCLUDED.conversion_rate,
    updated_at = now();
  $$
);

-- ═══════════════════════════════════════════════════
-- 6. Seed initial experiments for drip campaigns
-- ═══════════════════════════════════════════════════
INSERT INTO ab_experiments (name, notification_type, channel, status, variants, metric_primary, min_sample_size)
VALUES
  ('Onboarding Welcome Subject Test', 'onboarding_welcome', 'email', 'draft',
   '[{"variant_id":"control","weight":50},{"variant_id":"b","weight":50,"subject_override":"Your job search just got smarter"}]'::jsonb,
   'open_rate', 200),
  ('Re-engagement 14d Subject Test', 're_engagement_14d', 'email', 'draft',
   '[{"variant_id":"control","weight":50},{"variant_id":"b","weight":50,"subject_override":"We found 12 new matches while you were away"}]'::jsonb,
   'click_rate', 200),
  ('Re-engagement 30d Urgency Test', 're_engagement_30d', 'email', 'draft',
   '[{"variant_id":"control","weight":50},{"variant_id":"b","weight":50,"subject_override":"Your saved searches are still running — see results"}]'::jsonb,
   'click_rate', 200)
ON CONFLICT DO NOTHING;
