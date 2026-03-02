-- v6.15-referral-notification-system.sql
-- Pod 2 Session 11: Referral Notification Lifecycle Infrastructure
-- Schema + Admin Config + Template Seeds + Cron Schedules

-- ═══════════════════════════════════════════════
-- 1. REFERRAL MILESTONE REWARDS TABLE
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS referral_milestone_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_count int NOT NULL UNIQUE,
  reward_type text NOT NULL DEFAULT 'credits',         -- credits | trial_extension | feature_unlock | pro_month
  reward_value int NOT NULL DEFAULT 0,                  -- credit amount or days
  reward_description text NOT NULL,
  bonus_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed milestone rewards
INSERT INTO referral_milestone_rewards (milestone_count, reward_type, reward_value, reward_description) VALUES
  (3,  'credits', 25,  '25 bonus credits for 3 referrals'),
  (5,  'credits', 50,  '50 bonus credits for 5 referrals'),
  (10, 'trial_extension', 30, '1 month Pro trial for 10 referrals'),
  (25, 'pro_month', 30, '1 month free Pro for 25 referrals'),
  (50, 'pro_month', 90, '3 months free Pro for 50 referrals')
ON CONFLICT (milestone_count) DO NOTHING;

-- ═══════════════════════════════════════════════
-- 2. MARKETING CAMPAIGN LOG TABLE
-- ═══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketing_campaign_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_type text NOT NULL,
  cohort_id text DEFAULT 'default',
  total_eligible int DEFAULT 0,
  total_sent int DEFAULT 0,
  total_suppressed int DEFAULT 0,
  metadata jsonb DEFAULT '{}',
  executed_by text DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_log_type ON marketing_campaign_log (campaign_type, created_at DESC);

-- ═══════════════════════════════════════════════
-- 3. ADMIN NOTIFICATION CONFIG — 9 Referral Types
-- ═══════════════════════════════════════════════
INSERT INTO admin_notification_config (
  notification_type, category, enabled, cadence, channel_override,
  frequency_cap_count, frequency_cap_period, cohort_id, classification, notes
) VALUES
  -- referral_invite: event-driven + periodic prompt
  ('referral_invite', 'referral', true, 'event_driven', null,
   2, '30_days', 'default', 'marketing', 'Periodic referral invite with unique link and social sharing'),

  -- referral_sent_confirmation: per referral sent
  ('referral_sent_confirmation', 'referral', true, 'realtime', null,
   null, null, 'default', 'product', 'Confirmation after referral link shared or email sent'),

  -- referral_status_update: per status change
  ('referral_status_update', 'referral', true, 'realtime', null,
   5, '1_day', 'default', 'product', 'Status updates to referrer: clicked, signed up, activated'),

  -- referral_nudge_referee: 3/7/14 day sequence to REFEREE
  ('referral_nudge_referee', 'referral', true, 'sequence', null,
   2, 'per_referral', 'default', 'marketing', 'Nudge to referee for incomplete signups. Max 2 per referral.'),

  -- referral_conversion: event-driven on activation
  ('referral_conversion', 'referral', true, 'realtime', null,
   null, null, 'default', 'product', 'Reward earned notification on referee activation'),

  -- referral_reward_earned: per reward application
  ('referral_reward_earned', 'referral', true, 'realtime', null,
   null, null, 'default', 'product', 'Credits/trial/feature unlock applied confirmation'),

  -- referral_expiring_reward: 7-day and 1-day warnings
  ('referral_expiring_reward', 'referral', true, 'scheduled', null,
   2, 'per_reward', 'default', 'product', '7d + 1d warnings for time-limited rewards'),

  -- referral_milestone: per milestone (3/5/10/25/50)
  ('referral_milestone', 'referral', true, 'event_driven', null,
   1, 'per_milestone', 'default', 'product', 'Milestone celebration + bonus reward notification'),

  -- referral_periodic_summary: monthly
  ('referral_periodic_summary', 'referral', true, 'monthly', null,
   1, '30_days', 'default', 'marketing', 'Monthly referral pipeline funnel summary')

ON CONFLICT (notification_type, cohort_id) DO UPDATE SET
  category = EXCLUDED.category,
  classification = EXCLUDED.classification,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ═══════════════════════════════════════════════
-- 4. NOTIFICATION TEMPLATES — 9 Referral Types (default cohort, email channel)
-- ═══════════════════════════════════════════════
INSERT INTO notification_templates (
  notification_type, channel, cohort_id, version, status, is_production,
  subject_line, preheader, theme, variables, notes,
  cta_primary_text, cta_primary_url,
  cta_secondary_text, cta_secondary_url,
  created_by, promoted_by, promoted_at
) VALUES
  ('referral_invite', 'email', 'default', '1.0.0', 'production', true,
   'Share Brilliant Jobs — give friends smarter job search',
   'You and your friend both earn rewards',
   'white',
   '[{"name":"user.first_name","description":"Referrer name","example":"Marston"},{"name":"referral.code","description":"Unique referral code","example":"BJ-MG-7X2K"},{"name":"referral.reward","description":"Referrer reward","example":"50 credits"}]',
   'Pod 2 Session 11 — referral invite template',
   'Copy Referral Link', '{{action_url}}',
   'Share on LinkedIn', '{{linkedin_share_url}}',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_sent_confirmation', 'email', 'default', '1.0.0', 'production', true,
   'Referral sent! Here''s what happens next',
   'We''ll notify you at each step',
   'white',
   '[{"name":"user.first_name","description":"Referrer name","example":"Marston"},{"name":"referral.stats.sent","description":"Total sent","example":"3"},{"name":"referral.stats.converted","description":"Total converted","example":"1"}]',
   'Pod 2 Session 11 — referral sent confirmation',
   'Send Another', '{{action_url}}',
   'View Referral Dashboard', '{{dashboard_url}}#settings',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_status_update', 'email', 'default', '1.0.0', 'production', true,
   'Your referral is making progress — {{referee_name}} just {{action}}',
   'Track your referral progress',
   'white',
   '[{"name":"user.first_name","description":"Referrer name","example":"Marston"},{"name":"referee_name","description":"Referee name or Someone","example":"Alex"},{"name":"action","description":"What they did","example":"signed up"}]',
   'Pod 2 Session 11 — referral status update',
   'View Referral Status', '{{action_url}}',
   'Send Reminder', '{{reminder_url}}',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_nudge_referee', 'email', 'default', '1.0.0', 'production', true,
   '{{referrer_name}} thinks you''d love Brilliant Jobs — pick up where you left off',
   'Your friend shared something with you',
   'white',
   '[{"name":"referrer_name","description":"Who referred them","example":"Marston"},{"name":"referral.code","description":"Referral code","example":"BJ-MG-7X2K"},{"name":"referral.reward","description":"Friend reward","example":"7 days free Pro"}]',
   'Pod 2 Session 11 — nudge to incomplete referee',
   'Continue Setup', '{{signup_url}}',
   null, null,
   'pod2-session11', 'pod2-session11', now()),

  ('referral_conversion', 'email', 'default', '1.0.0', 'production', true,
   'Your referral just activated! You earned {{reward}}',
   'Your reward has been applied',
   'white',
   '[{"name":"user.first_name","description":"Referrer name","example":"Marston"},{"name":"reward","description":"What they earned","example":"50 credits"},{"name":"referral.stats.converted","description":"Total converted","example":"3"}]',
   'Pod 2 Session 11 — referral converted + reward',
   'View Referral Dashboard', '{{dashboard_url}}#settings',
   'Invite More', '{{referral_url}}',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_reward_earned', 'email', 'default', '1.0.0', 'production', true,
   'Reward applied: {{reward_description}}',
   'Your account has been updated',
   'white',
   '[{"name":"user.first_name","description":"Referrer name","example":"Marston"},{"name":"reward_description","description":"Reward detail","example":"50 credits added"},{"name":"billing.credits_remaining","description":"New balance","example":"147"}]',
   'Pod 2 Session 11 — reward application confirmation',
   'View Account', '{{dashboard_url}}#settings',
   'Invite More Friends', '{{referral_url}}',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_expiring_reward', 'email', 'default', '1.0.0', 'production', true,
   'Your {{reward_name}} expires in {{days_remaining}} days',
   'Don''t lose your reward',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"reward_name","description":"Reward name","example":"Pro trial extension"},{"name":"days_remaining","description":"Days left","example":"7"}]',
   'Pod 2 Session 11 — expiring reward warning (7d + 1d)',
   'Upgrade to Keep', '{{pricing_url}}',
   'Let It Expire', null,
   'pod2-session11', 'pod2-session11', now()),

  ('referral_milestone', 'email', 'default', '1.0.0', 'production', true,
   'Milestone: {{milestone}} referrals! You''ve earned {{total_reward}}',
   'You hit a referral milestone!',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"milestone","description":"Milestone count","example":"10"},{"name":"total_reward","description":"Total earned","example":"250 credits"},{"name":"next_milestone","description":"Next milestone","example":"25"}]',
   'Pod 2 Session 11 — milestone celebration',
   'View Referral Dashboard', '{{dashboard_url}}#settings',
   'Share Again', '{{referral_url}}',
   'pod2-session11', 'pod2-session11', now()),

  ('referral_periodic_summary', 'email', 'default', '1.0.0', 'production', true,
   'Referral update: {{pending}} pending, {{converted}} converted this month',
   'Your monthly referral report',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"stats.total_sent","description":"Total sent","example":"12"},{"name":"stats.total_activated","description":"Total activated","example":"5"},{"name":"pending","description":"Pending count","example":"3"},{"name":"converted","description":"Converted this month","example":"2"}]',
   'Pod 2 Session 11 — monthly referral summary',
   'Nudge Pending Referrals', '{{action_url}}',
   'Invite More', '{{referral_url}}',
   'pod2-session11', 'pod2-session11', now())

ON CONFLICT (notification_type, channel, cohort_id, version) DO NOTHING;

-- ═══════════════════════════════════════════════
-- 5. NOTIFICATION PREFERENCE DEFAULTS — Referral Types
-- ═══════════════════════════════════════════════
INSERT INTO notification_preference_defaults (
  notification_type, tier, region, email_default, sms_default, in_app_default
) VALUES
  -- referral_invite (marketing)
  ('referral_invite', 'free', 'us', true, false, true),
  ('referral_invite', 'free', 'eu', false, false, true),
  ('referral_invite', 'starter', 'us', true, false, true),
  ('referral_invite', 'starter', 'eu', false, false, true),
  ('referral_invite', 'pro', 'us', true, false, true),
  ('referral_invite', 'pro', 'eu', false, false, true),

  -- referral_nudge_referee (marketing — sent to referee)
  ('referral_nudge_referee', 'free', 'us', true, false, false),
  ('referral_nudge_referee', 'free', 'eu', false, false, false),
  ('referral_nudge_referee', 'starter', 'us', true, false, false),
  ('referral_nudge_referee', 'starter', 'eu', false, false, false),
  ('referral_nudge_referee', 'pro', 'us', true, false, false),
  ('referral_nudge_referee', 'pro', 'eu', false, false, false),

  -- referral_periodic_summary (marketing)
  ('referral_periodic_summary', 'free', 'us', true, false, false),
  ('referral_periodic_summary', 'free', 'eu', false, false, false),
  ('referral_periodic_summary', 'starter', 'us', true, false, false),
  ('referral_periodic_summary', 'starter', 'eu', false, false, false),
  ('referral_periodic_summary', 'pro', 'us', true, false, false),
  ('referral_periodic_summary', 'pro', 'eu', false, false, false),

  -- Product notifications (all default ON)
  ('referral_sent_confirmation', 'free', 'us', true, false, true),
  ('referral_sent_confirmation', 'free', 'eu', true, false, true),
  ('referral_sent_confirmation', 'starter', 'us', true, false, true),
  ('referral_sent_confirmation', 'starter', 'eu', true, false, true),
  ('referral_sent_confirmation', 'pro', 'us', true, false, true),
  ('referral_sent_confirmation', 'pro', 'eu', true, false, true),

  ('referral_status_update', 'free', 'us', true, false, true),
  ('referral_status_update', 'free', 'eu', true, false, true),
  ('referral_status_update', 'starter', 'us', true, false, true),
  ('referral_status_update', 'starter', 'eu', true, false, true),
  ('referral_status_update', 'pro', 'us', true, false, true),
  ('referral_status_update', 'pro', 'eu', true, false, true),

  ('referral_conversion', 'free', 'us', true, false, true),
  ('referral_conversion', 'free', 'eu', true, false, true),
  ('referral_conversion', 'starter', 'us', true, false, true),
  ('referral_conversion', 'starter', 'eu', true, false, true),
  ('referral_conversion', 'pro', 'us', true, false, true),
  ('referral_conversion', 'pro', 'eu', true, false, true),

  ('referral_reward_earned', 'free', 'us', true, false, true),
  ('referral_reward_earned', 'free', 'eu', true, false, true),
  ('referral_reward_earned', 'starter', 'us', true, false, true),
  ('referral_reward_earned', 'starter', 'eu', true, false, true),
  ('referral_reward_earned', 'pro', 'us', true, false, true),
  ('referral_reward_earned', 'pro', 'eu', true, false, true),

  ('referral_expiring_reward', 'free', 'us', true, false, true),
  ('referral_expiring_reward', 'free', 'eu', true, false, true),
  ('referral_expiring_reward', 'starter', 'us', true, false, true),
  ('referral_expiring_reward', 'starter', 'eu', true, false, true),
  ('referral_expiring_reward', 'pro', 'us', true, false, true),
  ('referral_expiring_reward', 'pro', 'eu', true, false, true),

  ('referral_milestone', 'free', 'us', true, false, true),
  ('referral_milestone', 'free', 'eu', true, false, true),
  ('referral_milestone', 'starter', 'us', true, false, true),
  ('referral_milestone', 'starter', 'eu', true, false, true),
  ('referral_milestone', 'pro', 'us', true, false, true),
  ('referral_milestone', 'pro', 'eu', true, false, true)

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════
-- 6. CRON SCHEDULES for Referral Lifecycle
-- ═══════════════════════════════════════════════
-- Note: These use pg_cron. Run via Supabase Dashboard > SQL Editor or supabase CLI.

-- Daily nudge check at 10:00 AM ET (14:00 UTC)
SELECT cron.schedule(
  'referral-nudge-check',
  '0 14 * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/referral-lifecycle',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"nudge_check"}'::jsonb
  );$$
);

-- Daily expiring reward check at 9:00 AM ET (13:00 UTC)
SELECT cron.schedule(
  'referral-expiring-check',
  '0 13 * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/referral-lifecycle',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"expiring_check"}'::jsonb
  );$$
);

-- Monthly periodic summary — 1st of month at 9:00 AM ET (13:00 UTC)
SELECT cron.schedule(
  'referral-periodic-summary',
  '0 13 1 * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/referral-lifecycle',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"periodic_summary"}'::jsonb
  );$$
);
