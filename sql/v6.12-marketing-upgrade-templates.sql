-- v6.12 Seed: Marketing, Upgrade Prompts + Credit Intelligence notification templates
-- Pod 1 Session: Batch 10a (Marketing/Upgrade) copy delivery
-- Date: 2026-03-01

-- ════════════════════════════════════════════════════
-- MARKETING/UPGRADE TEMPLATES (5) — White theme, Marketing type
-- ════════════════════════════════════════════════════

INSERT INTO notification_templates (type, channel, cohort, version, status, theme, subject, preheader, category, variables)
VALUES
  ('usage_upgrade_prompt', 'email', 'default', '1.0.0', 'production', 'white',
   'You''ve hit your {{limit_type}} limit — unlock more with {{recommended_plan}}',
   'Your account needs more room to grow',
   'upgrade',
   '{"firstName": "string", "currentPlan": "string", "limitType": "string", "currentUsage": "number", "limitMax": "number", "featureBlocked": "string", "recommendedPlan": "string", "recommendedPrice": "string"}'::jsonb),

  ('credit_burn_rate_alert', 'email', 'default', '1.0.0', 'production', 'white',
   'Credit alert: {{credits_remaining}} credits left — ~{{days_until_exhaust}} days at current pace',
   'Your credits are running faster than expected',
   'upgrade',
   '{"firstName": "string", "creditsRemaining": "number", "burnRatePerDay": "number", "projectedExhaustDate": "string", "daysUntilExhaust": "number", "currentPlan": "string"}'::jsonb),

  ('price_lock_warning', 'email', 'default', '1.0.0', 'production', 'white',
   'Pricing update: {{current_plan}} changes on {{effective_date}}',
   'Lock in your current rate before it goes up',
   'upgrade',
   '{"firstName": "string", "variant": "string", "currentPrice": "string", "newPrice": "string", "effectiveDate": "string", "currentPlan": "string", "savingsAmount": "string", "savingsPercent": "string"}'::jsonb),

  ('promo_trial', 'email', 'default', '1.0.0', 'production', 'white',
   'Try {{trial_plan}} free for {{trial_days}} days — no card required',
   'You''ve earned a free look at premium features',
   'promotional',
   '{"firstName": "string", "trialPlan": "string", "trialDays": "number", "featuresIncluded": "array", "expiryDate": "string", "activationUrl": "string"}'::jsonb),

  ('promo_feature_preview', 'email', 'default', '1.0.0', 'production', 'white',
   'Early access: {{feature_name}} is yours for {{preview_days}} days',
   'You''re getting a first look at something new',
   'promotional',
   '{"firstName": "string", "featureName": "string", "featureDescription": "string", "previewDays": "number", "previewExpiryDate": "string", "requiredPlan": "string"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- ADMIN NOTIFICATION CONFIG (5 rows)
-- ════════════════════════════════════════════════════

INSERT INTO admin_notification_config (type, enabled, classification, frequency_cap, frequency_window, channels, priority, description)
VALUES
  ('usage_upgrade_prompt', true, 'marketing', 1, 'weekly', '{"email"}'::text[], 'medium',
   'Limit warning + upgrade pitch. Fires when user hits plan limit (filters, credits, features).'),

  ('credit_burn_rate_alert', true, 'marketing', 1, 'weekly', '{"email"}'::text[], 'medium',
   'Credit burn rate intelligence. Fires when projected exhaust date is within 7 days.'),

  ('price_lock_warning', true, 'marketing', 3, 'monthly', '{"email"}'::text[], 'high',
   '3-email sequence (14d/7d/1d before price change). Fires per variant on schedule.'),

  ('promo_trial', true, 'marketing', 1, 'monthly', '{"email"}'::text[], 'low',
   'Trial offer for qualified free users. Fires when eligibility criteria met.'),

  ('promo_feature_preview', true, 'marketing', 1, 'monthly', '{"email"}'::text[], 'low',
   'Feature preview access. Fires when admin selects recipients for early access.')
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCE DEFAULTS (5 types × 3 tiers × 2 regions = 30 rows)
-- Marketing classification: US defaults ON, EU defaults OFF (GDPR double opt-in required)
-- ════════════════════════════════════════════════════

INSERT INTO notification_preference_defaults (type, tier, region, enabled_default, frequency_default, channel_default)
VALUES
  -- usage_upgrade_prompt: US ON, EU OFF
  ('usage_upgrade_prompt', 'free', 'us', true, 'event_driven', 'email'),
  ('usage_upgrade_prompt', 'starter', 'us', true, 'event_driven', 'email'),
  ('usage_upgrade_prompt', 'pro', 'us', false, 'event_driven', 'email'),
  ('usage_upgrade_prompt', 'free', 'eu', false, 'event_driven', 'email'),
  ('usage_upgrade_prompt', 'starter', 'eu', false, 'event_driven', 'email'),
  ('usage_upgrade_prompt', 'pro', 'eu', false, 'event_driven', 'email'),

  -- credit_burn_rate_alert: US ON for paid tiers, EU OFF
  ('credit_burn_rate_alert', 'free', 'us', false, 'event_driven', 'email'),
  ('credit_burn_rate_alert', 'starter', 'us', true, 'event_driven', 'email'),
  ('credit_burn_rate_alert', 'pro', 'us', true, 'event_driven', 'email'),
  ('credit_burn_rate_alert', 'free', 'eu', false, 'event_driven', 'email'),
  ('credit_burn_rate_alert', 'starter', 'eu', false, 'event_driven', 'email'),
  ('credit_burn_rate_alert', 'pro', 'eu', false, 'event_driven', 'email'),

  -- price_lock_warning: US ON all tiers, EU OFF
  ('price_lock_warning', 'free', 'us', true, 'event_driven', 'email'),
  ('price_lock_warning', 'starter', 'us', true, 'event_driven', 'email'),
  ('price_lock_warning', 'pro', 'us', true, 'event_driven', 'email'),
  ('price_lock_warning', 'free', 'eu', false, 'event_driven', 'email'),
  ('price_lock_warning', 'starter', 'eu', false, 'event_driven', 'email'),
  ('price_lock_warning', 'pro', 'eu', false, 'event_driven', 'email'),

  -- promo_trial: US ON for free only, EU OFF
  ('promo_trial', 'free', 'us', true, 'event_driven', 'email'),
  ('promo_trial', 'starter', 'us', false, 'event_driven', 'email'),
  ('promo_trial', 'pro', 'us', false, 'event_driven', 'email'),
  ('promo_trial', 'free', 'eu', false, 'event_driven', 'email'),
  ('promo_trial', 'starter', 'eu', false, 'event_driven', 'email'),
  ('promo_trial', 'pro', 'eu', false, 'event_driven', 'email'),

  -- promo_feature_preview: US ON all tiers, EU OFF
  ('promo_feature_preview', 'free', 'us', true, 'event_driven', 'email'),
  ('promo_feature_preview', 'starter', 'us', true, 'event_driven', 'email'),
  ('promo_feature_preview', 'pro', 'us', true, 'event_driven', 'email'),
  ('promo_feature_preview', 'free', 'eu', false, 'event_driven', 'email'),
  ('promo_feature_preview', 'starter', 'eu', false, 'event_driven', 'email'),
  ('promo_feature_preview', 'pro', 'eu', false, 'event_driven', 'email')
ON CONFLICT DO NOTHING;
