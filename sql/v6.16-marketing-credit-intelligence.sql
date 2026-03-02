-- v6.16-marketing-credit-intelligence.sql
-- Pod 2 Session 12: Marketing, Upgrade Prompts + Credit Intelligence
-- Admin Config + Template Seeds + Cron Schedules

-- ═══════════════════════════════════════════════
-- 1. ADMIN NOTIFICATION CONFIG — 9 Marketing/Upgrade/Credit Types
-- ═══════════════════════════════════════════════
INSERT INTO admin_notification_config (
  notification_type, category, enabled, cadence, channel_override,
  frequency_cap_count, frequency_cap_period, cohort_id, classification, notes
) VALUES
  -- usage_upgrade_prompt: event-driven at feature limit
  ('usage_upgrade_prompt', 'upgrade', true, 'event_driven', null,
   1, '7_days', 'default', 'marketing', 'Triggered at 80% of free tier limit. Free tier only. Max 1/week.'),

  -- credit_cost_comparison: monthly billing analysis
  ('credit_cost_comparison', 'upgrade', true, 'monthly', null,
   1, '30_days', 'default', 'marketing', 'Monthly savings math: current spend vs next tier cost. Free/Starter.'),

  -- credit_burn_rate_alert: event-driven projection
  ('credit_burn_rate_alert', 'credits', true, 'event_driven', null,
   1, '30_days', 'default', 'product', 'Projects credit exhaustion before billing cycle. Max 1/cycle.'),

  -- credit_low_balance: threshold alert
  ('credit_low_balance', 'credits', true, 'event_driven', null,
   1, '7_days', 'default', 'product', 'Triggered at <10% or <20 credits remaining.'),

  -- credit_exhausted: zero balance
  ('credit_exhausted', 'credits', true, 'event_driven', null,
   1, 'per_event', 'default', 'product', 'Zero balance: paused features list + recovery options.'),

  -- upgrade_roi_summary: monthly for 60+ day accounts
  ('upgrade_roi_summary', 'upgrade', true, 'monthly', null,
   1, '30_days', 'default', 'marketing', 'Personalized value summary + missed opportunities. Free/Starter.'),

  -- price_lock_warning: 3-email sequence (14/7/1 day)
  ('price_lock_warning', 'upgrade', true, 'sequence', null,
   3, 'per_event', 'default', 'marketing', '3-email countdown: 14d/7d/1d before price increase. Free tier.'),

  -- promo_trial: campaign-based
  ('promo_trial', 'promotional', true, 'campaign', null,
   1, '90_days', 'default', 'marketing', 'Free Pro trial (3/7/14/30 days). No credit card. Campaign-triggered.'),

  -- promo_feature_preview: campaign-based
  ('promo_feature_preview', 'promotional', true, 'campaign', null,
   1, '30_days', 'default', 'marketing', 'Limited-time feature unlock. Campaign-triggered. Conversion tracking.')

ON CONFLICT (notification_type, cohort_id) DO UPDATE SET
  category = EXCLUDED.category,
  classification = EXCLUDED.classification,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ═══════════════════════════════════════════════
-- 2. NOTIFICATION TEMPLATES — 9 Marketing/Upgrade/Credit Types
-- ═══════════════════════════════════════════════
INSERT INTO notification_templates (
  notification_type, channel, cohort_id, version, status, is_production,
  subject_line, preheader, theme, variables, notes,
  cta_primary_text, cta_primary_url,
  cta_secondary_text, cta_secondary_url,
  created_by, promoted_by, promoted_at
) VALUES
  ('usage_upgrade_prompt', 'email', 'default', '1.0.0', 'production', true,
   'You''re getting close — unlock unlimited with Pro',
   'You''ve used {{percent_used}}% of your free limit',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"percent_used","description":"Usage percentage","example":"85"},{"name":"feature_name","description":"Feature at limit","example":"saved filters"}]',
   'Pod 2 Session 12 — usage limit upgrade prompt',
   'Upgrade to Pro', '{{pricing_url}}',
   'See What''s Included', '{{pricing_url}}#compare',
   'pod2-session12', 'pod2-session12', now()),

  ('credit_cost_comparison', 'email', 'default', '1.0.0', 'production', true,
   'You''d save ${{savings}}/mo by upgrading — here''s the math',
   'Your credit spend vs plan comparison',
   'dark',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"current_spend","description":"Monthly credit spend","example":"25"},{"name":"next_plan","description":"Recommended plan","example":"Pro"},{"name":"next_plan_cost","description":"Plan cost","example":"40"},{"name":"savings","description":"Monthly savings","example":"15"}]',
   'Pod 2 Session 12 — credit cost vs plan comparison (dark theme)',
   'Upgrade & Save', '{{pricing_url}}',
   'View Full Comparison', '{{pricing_url}}#compare',
   'pod2-session12', 'pod2-session12', now()),

  ('credit_burn_rate_alert', 'email', 'default', '1.0.0', 'production', true,
   'Heads up: at current pace, your credits run out by {{projected_date}}',
   'Your credit usage projection',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"billing.credits_remaining","description":"Credits left","example":"47"},{"name":"avg_daily_burn","description":"Avg daily use","example":"3.2"},{"name":"projected_date","description":"Exhaustion date","example":"March 15"},{"name":"days_remaining","description":"Days left","example":"8"}]',
   'Pod 2 Session 12 — credit burn rate warning',
   'Top Up Credits', '{{dashboard_url}}#settings',
   'Manage Usage', '{{dashboard_url}}#settings',
   'pod2-session12', 'pod2-session12', now()),

  ('credit_low_balance', 'email', 'default', '1.0.0', 'production', true,
   'Low credits: {{remaining}} left — top up to keep features running',
   'Your credit balance is running low',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"billing.credits_remaining","description":"Credits remaining","example":"15"},{"name":"coverage","description":"What credits cover","example":"~2 SMS alerts or 1 AI resume score"}]',
   'Pod 2 Session 12 — low credit balance alert',
   'Top Up Credits', '{{dashboard_url}}#settings',
   'Upgrade for More', '{{pricing_url}}',
   'pod2-session12', 'pod2-session12', now()),

  ('credit_exhausted', 'email', 'default', '1.0.0', 'production', true,
   'Your credits have run out — some features are paused',
   'Credit-powered features are paused until you top up',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"paused_features","description":"Paused features list","example":"SMS alerts, AI scoring, auto-apply"},{"name":"next_billing_date","description":"Next billing date","example":"April 1"}]',
   'Pod 2 Session 12 — credit exhausted notification',
   'Top Up Now', '{{dashboard_url}}#settings',
   'Upgrade Plan', '{{pricing_url}}',
   'pod2-session12', 'pod2-session12', now()),

  ('upgrade_roi_summary', 'email', 'default', '1.0.0', 'production', true,
   'Your Brilliant Jobs month: {{actions_taken}} actions, {{value_statement}}',
   'Monthly value summary + what you''re missing',
   'dark',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"stats.applications_count","description":"Apps submitted","example":"23"},{"name":"stats.matches_found","description":"Matches","example":"47"},{"name":"missed_auto_apply_count","description":"Missed auto-applies","example":"3"}]',
   'Pod 2 Session 12 — upgrade ROI summary (dark theme)',
   'See What You''re Missing', '{{pricing_url}}',
   'I''m Good For Now', null,
   'pod2-session12', 'pod2-session12', now()),

  ('price_lock_warning', 'email', 'default', '1.0.0', 'production', true,
   'Lock in ${{current_price}}/mo before prices increase on {{increase_date}}',
   'Prices are going up — lock in your rate',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"current_price","description":"Current price","example":"29"},{"name":"new_price","description":"New price","example":"39"},{"name":"increase_date","description":"Increase date","example":"April 1"},{"name":"annual_savings","description":"Annual savings","example":"120"}]',
   'Pod 2 Session 12 — price lock warning (3-email sequence)',
   'Lock In Current Price', '{{pricing_url}}',
   'Compare Plans', '{{pricing_url}}#compare',
   'pod2-session12', 'pod2-session12', now()),

  ('promo_trial', 'email', 'default', '1.0.0', 'production', true,
   'Try Pro free for {{trial_days}} days — no credit card needed',
   'Unlock all Pro features for free',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"trial_days","description":"Trial duration","example":"7"},{"name":"promo_code","description":"Promo code","example":"SPRING26"}]',
   'Pod 2 Session 12 — promotional trial offer',
   'Start Free Trial', '{{pricing_url}}?promo={{promo_code}}',
   'See Pro Features', '{{pricing_url}}#features',
   'pod2-session12', 'pod2-session12', now()),

  ('promo_feature_preview', 'email', 'default', '1.0.0', 'production', true,
   'Exclusive preview: try {{feature_name}} for free this week',
   'Limited-time access to a Pro feature',
   'white',
   '[{"name":"user.first_name","description":"User name","example":"Marston"},{"name":"feature_name","description":"Feature name","example":"AI Resume Scoring"},{"name":"feature_duration","description":"Access duration","example":"7 days"}]',
   'Pod 2 Session 12 — feature preview access',
   'Try {{feature_name}}', '{{dashboard_url}}',
   'Learn More', '{{feature_url}}',
   'pod2-session12', 'pod2-session12', now())

ON CONFLICT (notification_type, channel, cohort_id, version) DO NOTHING;

-- ═══════════════════════════════════════════════
-- 3. NOTIFICATION PREFERENCE DEFAULTS — Marketing/Upgrade/Credit Types
-- ═══════════════════════════════════════════════
INSERT INTO notification_preference_defaults (
  notification_type, tier, region, email_default, sms_default, in_app_default
) VALUES
  -- Marketing types: US ON, EU OFF (GDPR)
  ('usage_upgrade_prompt', 'free', 'us', true, false, true),
  ('usage_upgrade_prompt', 'free', 'eu', false, false, true),

  ('credit_cost_comparison', 'free', 'us', true, false, true),
  ('credit_cost_comparison', 'free', 'eu', false, false, true),
  ('credit_cost_comparison', 'starter', 'us', true, false, true),
  ('credit_cost_comparison', 'starter', 'eu', false, false, true),

  ('upgrade_roi_summary', 'free', 'us', true, false, false),
  ('upgrade_roi_summary', 'free', 'eu', false, false, false),
  ('upgrade_roi_summary', 'starter', 'us', true, false, false),
  ('upgrade_roi_summary', 'starter', 'eu', false, false, false),

  ('price_lock_warning', 'free', 'us', true, false, false),
  ('price_lock_warning', 'free', 'eu', false, false, false),

  ('promo_trial', 'free', 'us', true, false, false),
  ('promo_trial', 'free', 'eu', false, false, false),

  ('promo_feature_preview', 'free', 'us', true, false, false),
  ('promo_feature_preview', 'free', 'eu', false, false, false),

  -- Product types: ALL ON regardless of region
  ('credit_burn_rate_alert', 'starter', 'us', true, false, true),
  ('credit_burn_rate_alert', 'starter', 'eu', true, false, true),
  ('credit_burn_rate_alert', 'pro', 'us', true, false, true),
  ('credit_burn_rate_alert', 'pro', 'eu', true, false, true),

  ('credit_low_balance', 'free', 'us', true, false, true),
  ('credit_low_balance', 'free', 'eu', true, false, true),
  ('credit_low_balance', 'starter', 'us', true, false, true),
  ('credit_low_balance', 'starter', 'eu', true, false, true),
  ('credit_low_balance', 'pro', 'us', true, false, true),
  ('credit_low_balance', 'pro', 'eu', true, false, true),

  ('credit_exhausted', 'free', 'us', true, false, true),
  ('credit_exhausted', 'free', 'eu', true, false, true),
  ('credit_exhausted', 'starter', 'us', true, false, true),
  ('credit_exhausted', 'starter', 'eu', true, false, true),
  ('credit_exhausted', 'pro', 'us', true, false, true),
  ('credit_exhausted', 'pro', 'eu', true, false, true)

ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════
-- 4. CRON SCHEDULES for Marketing/Credit Intelligence
-- ═══════════════════════════════════════════════

-- Monthly ROI summary — 1st of month at 10:00 AM ET (14:00 UTC)
SELECT cron.schedule(
  'marketing-roi-summary',
  '0 14 1 * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/marketing-campaign',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"cron_roi_summary"}'::jsonb
  );$$
);

-- Monthly credit cost comparison — 1st of month at 11:00 AM ET (15:00 UTC)
SELECT cron.schedule(
  'marketing-credit-comparison',
  '0 15 1 * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/marketing-campaign',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"cron_credit_comparison"}'::jsonb
  );$$
);

-- Daily credit burn rate check at 8:00 AM ET (12:00 UTC)
SELECT cron.schedule(
  'marketing-credit-burn-check',
  '0 12 * * *',
  $$SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/marketing-campaign',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || current_setting('app.settings.service_role_key')),
    body := '{"type":"credit_burn_check"}'::jsonb
  );$$
);
