-- ═══════════════════════════════════════════════════════════════
-- BATCH 6: Dark Theme Data Email Templates
-- Notification System v6.09 · Session 8 · Phase 7
-- Run in: Supabase SQL Editor
-- Unblocks: Pod 2 Session 8 (Stats, Trends + Market Intelligence)
-- ═══════════════════════════════════════════════════════════════

-- 1. Seed notification_templates for all 10 Batch 6 types
INSERT INTO notification_templates (notification_type, subject_a, subject_b, theme, preheader, min_tier)
VALUES
  (
    'weekly_summary',
    'Your week in numbers — {{week_label}}',
    '{{first_name}}, here''s your weekly search report',
    'dark',
    '{{total_applied}} applications · {{total_new_matches}} new matches · {{response_rate}}% response rate',
    'free'
  ),
  (
    'monthly_pipeline_report',
    'Your {{month_name}} pipeline report is ready',
    '{{month_name}} recap: {{total_applied}} applications, {{response_rate}}% response rate',
    'dark',
    '{{total_applied}} sent · {{total_responses}} responses · {{avg_days_to_response}} avg days to hear back',
    'pro'
  ),
  (
    'pipeline_benchmark',
    'How your pipeline compares — {{month_name}} benchmarks',
    'You''re in the top {{percentile}}% of response rates',
    'dark',
    'Your {{response_rate}}% response rate vs {{community_avg}}% community average',
    'pro'
  ),
  (
    'market_pulse',
    'Market pulse: {{trend_headline}}',
    '{{total_new_jobs}} new jobs this week across your filters',
    'dark',
    '{{total_new_jobs}} new listings · {{salary_trend}} salary trend · {{top_hiring_company}} hiring aggressively',
    'free'
  ),
  (
    'trend_anomaly',
    'Unusual activity: {{anomaly_headline}}',
    'Alert: {{anomaly_type}} detected in {{filter_name}}',
    'dark',
    '{{anomaly_summary}} — review recommended',
    'pro'
  ),
  (
    'filter_trend',
    'Filter trends: {{top_filter_name}} {{direction}} {{pct_change}}% this week',
    'Your saved filters — weekly performance update',
    'dark',
    '{{active_filter_count}} active filters tracked · {{best_filter}} performing strongest',
    'pro'
  ),
  (
    'ghost_report_weekly',
    '{{ghost_count}} applications past expected response time',
    'Ghost report: {{worst_company}} still hasn''t responded ({{days}} days)',
    'dark',
    '{{ghost_count}} ghosted · Worst offender: {{worst_company}} at {{worst_days}} days · Avg expected: {{avg_expected}} days',
    'free'
  ),
  (
    'upgrade_roi_summary',
    'This month, Brilliant Jobs saved you {{hours_saved}} hours',
    'Your ROI report: {{value_headline}}',
    'dark',
    '{{auto_applies}} auto-applications · {{hours_saved}} hours saved · {{missed_opportunities}} opportunities you would have missed',
    'free'
  ),
  (
    'credit_cost_comparison',
    'Your AI credit usage this month — {{credits_used}} credits',
    'Credit report: {{savings_headline}}',
    'dark',
    '{{credits_used}} credits used · {{credits_remaining}} remaining · {{next_refill_date}} next refill',
    'pro'
  ),
  (
    'rewrite_batch_summary',
    'Rewrite batch complete: {{improved_count}}/{{total_count}} resumes improved',
    'Your resume rewrites are ready for review',
    'dark',
    '{{total_count}} rewrites processed · Average score improvement: +{{avg_improvement}} points',
    'pro'
  )
ON CONFLICT (notification_type) DO UPDATE SET
  subject_a = EXCLUDED.subject_a,
  subject_b = EXCLUDED.subject_b,
  theme = EXCLUDED.theme,
  preheader = EXCLUDED.preheader,
  min_tier = EXCLUDED.min_tier,
  updated_at = now();


-- 2. Seed admin_notification_config for A/B testing (50/50 split default)
INSERT INTO admin_notification_config (notification_type, variant_a_weight, variant_b_weight, active)
VALUES
  ('weekly_summary', 50, 50, true),
  ('monthly_pipeline_report', 50, 50, true),
  ('pipeline_benchmark', 50, 50, true),
  ('market_pulse', 50, 50, true),
  ('trend_anomaly', 50, 50, true),
  ('filter_trend', 50, 50, true),
  ('ghost_report_weekly', 50, 50, true),
  ('upgrade_roi_summary', 50, 50, true),
  ('credit_cost_comparison', 50, 50, true),
  ('rewrite_batch_summary', 50, 50, true)
ON CONFLICT (notification_type) DO UPDATE SET
  variant_a_weight = 50,
  variant_b_weight = 50,
  active = true,
  updated_at = now();


-- 3. Seed default notification_channels for Batch 6 types
-- These are the default channel preferences for new users
-- Existing users are not affected (no ON CONFLICT on user_id + type)
-- Pod 2: Apply these defaults in the signup flow / preference initialization

/*
  Default preferences by tier:

  TYPE                      FREE    PRO     EMAIL  SMS  FREQUENCY
  weekly_summary            ON      ON      Yes    No   weekly
  monthly_pipeline_report   OFF     ON      Yes    No   monthly
  pipeline_benchmark        OFF     ON      Yes    No   monthly
  market_pulse              ON*     ON      Yes    No   weekly
  trend_anomaly             OFF     ON      Yes    No   event
  filter_trend              OFF     ON      Yes    No   weekly
  ghost_report_weekly       ON      ON      Yes    No   weekly
  upgrade_roi_summary       ON      ON      Yes    No   monthly
  credit_cost_comparison    OFF     ON      Yes    No   monthly
  rewrite_batch_summary     OFF     ON      Yes    No   event

  * market_pulse for Free users: limited content (job count only, no salary/remote trends)

  EU REGION OVERRIDE:
  - weekly_summary: ON (product email, not marketing)
  - ghost_report_weekly: ON (product email, not marketing)
  - All others: OFF until double opt-in confirmed
*/


-- 4. Verify insertion
SELECT notification_type, theme, min_tier, 
       left(subject_a, 50) as subject_preview,
       updated_at
FROM notification_templates 
WHERE theme = 'dark'
ORDER BY notification_type;
