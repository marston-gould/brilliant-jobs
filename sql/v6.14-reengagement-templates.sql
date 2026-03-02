-- v6.14 Seed: Re-engagement notification templates
-- Pod 1 Session 15: Re-engagement/Escalation copy delivery
-- Date: 2026-03-01
-- Marketing classification: All 3 variants require unsubscribe link
-- Escalation: 14d → 30d → 60d inactivity thresholds
-- Suppression: Stops immediately on any login event (auth session)

-- ════════════════════════════════════════════════════
-- RE-ENGAGEMENT TEMPLATES (3) — White theme
-- inactive_reengagement_14d: Marketing classification
-- inactive_reengagement_30d: Marketing classification
-- inactive_reengagement_60d: Marketing classification (terminal — no further emails)
-- ════════════════════════════════════════════════════

INSERT INTO notification_templates (type, channel, cohort, version, status, theme, subject, preheader, category, variables)
VALUES
  ('inactive_reengagement_14d', 'email', 'default', '1.0.0', 'production', 'white',
   '{{missed_job_count}} new jobs matched while you were away, {{first_name}}',
   'Your filters found new opportunities — see what you''ve missed',
   'retention',
   '{"firstName": "string", "missedJobCount": "number", "topCompanies": "array", "filterNames": "array", "lastLoginDate": "string"}'::jsonb),

  ('inactive_reengagement_30d', 'email', 'default', '1.0.0', 'production', 'white',
   '{{first_name}}, {{missed_job_count}} jobs came and went — {{closed_job_count}} already closed',
   'A month away is a long time in this market',
   'retention',
   '{"firstName": "string", "missedJobCount": "number", "closedJobCount": "number", "topCompanies": "array", "filterNames": "array", "avgSalaryRange": "string", "lastLoginDate": "string"}'::jsonb),

  ('inactive_reengagement_60d', 'email', 'default', '1.0.0', 'production', 'white',
   '{{first_name}}, {{missed_job_count}} jobs have passed — is it time to come back?',
   'Two months is a long pause — we wanted to check in one last time',
   'retention',
   '{"firstName": "string", "missedJobCount": "number", "closedJobCount": "number", "newCompaniesCount": "number", "marketTrend": "string", "filterNames": "array", "lastLoginDate": "string"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- ADMIN NOTIFICATION CONFIG (3 rows)
-- ════════════════════════════════════════════════════

INSERT INTO admin_notification_config (type, enabled, classification, frequency_cap, frequency_window, channels, priority, description)
VALUES
  ('inactive_reengagement_14d', true, 'marketing', 1, 'sequence', '{email}'::text[], 'low',
   'First re-engagement email at 14 days of inactivity. FOMO-driven with missed job counts and top companies. Suppressed immediately on any login event. Marketing classification — requires unsubscribe link.'),

  ('inactive_reengagement_30d', true, 'marketing', 1, 'sequence', '{email}'::text[], 'low',
   'Second re-engagement email at 30 days of inactivity. Escalated urgency: missed + closed job counts, salary data, time-sensitivity framing. Suppressed immediately on any login event. Marketing classification — requires unsubscribe link.'),

  ('inactive_reengagement_60d', true, 'marketing', 1, 'sequence', '{email}'::text[], 'low',
   'Terminal re-engagement email at 60 days of inactivity. Final check-in with 60-day snapshot (matched, closed, new companies, market trend). Explicitly states this is the last email. No further re-engagement emails sent after this. Suppressed immediately on any login event. Marketing classification — requires unsubscribe link.')
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCE DEFAULTS
-- 3 types × 3 tiers × 2 regions = 18 rows
-- Marketing classification: US defaults ON, EU defaults OFF (GDPR)
-- ════════════════════════════════════════════════════

INSERT INTO notification_preference_defaults (type, tier, region, default_enabled, default_frequency, classification)
VALUES
  -- inactive_reengagement_14d: Marketing — US ON, EU OFF
  ('inactive_reengagement_14d', 'free', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_14d', 'starter', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_14d', 'pro', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_14d', 'free', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_14d', 'starter', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_14d', 'pro', 'eu', false, 'sequence', 'marketing'),

  -- inactive_reengagement_30d: Marketing — US ON, EU OFF
  ('inactive_reengagement_30d', 'free', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_30d', 'starter', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_30d', 'pro', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_30d', 'free', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_30d', 'starter', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_30d', 'pro', 'eu', false, 'sequence', 'marketing'),

  -- inactive_reengagement_60d: Marketing — US ON, EU OFF
  ('inactive_reengagement_60d', 'free', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_60d', 'starter', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_60d', 'pro', 'us', true, 'sequence', 'marketing'),
  ('inactive_reengagement_60d', 'free', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_60d', 'starter', 'eu', false, 'sequence', 'marketing'),
  ('inactive_reengagement_60d', 'pro', 'eu', false, 'sequence', 'marketing')
ON CONFLICT DO NOTHING;
