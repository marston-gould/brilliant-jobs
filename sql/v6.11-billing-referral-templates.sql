-- v6.11 Seed: Billing + Referral notification templates and admin config
-- Pod 1 Session: Batch 8 (Referral) + Batch 9 (Billing) copy delivery
-- Date: 2026-03-01

-- ════════════════════════════════════════════════════
-- REFERRAL TEMPLATES (9) — White theme, Product type
-- ════════════════════════════════════════════════════

INSERT INTO notification_templates (type, channel, cohort, version, status, theme, subject, preheader, category, variables)
VALUES
  ('referral_invite', 'email', 'default', '1.0.0', 'production', 'white',
   'Share Brilliant Jobs, earn {{referrer_reward}}',
   'Know someone in the job market?',
   'referral',
   '{"firstName": "string", "referralLink": "string", "referrerReward": "string", "refereeReward": "string"}'::jsonb),

  ('referral_sent_confirmation', 'email', 'default', '1.0.0', 'production', 'white',
   'Referral sent to {{referee_name}}',
   'Your invite is on its way',
   'referral',
   '{"firstName": "string", "refereeName": "string", "referralsSent": "number", "activeReferrals": "number"}'::jsonb),

  ('referral_status_update', 'email', 'default', '1.0.0', 'production', 'white',
   '{{referee_name}} {{status_action}}',
   'Progress on your referral',
   'referral',
   '{"firstName": "string", "refereeName": "string", "status": "string", "statusDescription": "string"}'::jsonb),

  ('referral_nudge_referee', 'email', 'default', '1.0.0', 'production', 'white',
   '{{referrer_name}} invited you to Brilliant Jobs — your {{referee_reward}} is waiting',
   'Get AI-powered job search intelligence',
   'referral',
   '{"referrerName": "string", "refereeName": "string", "refereeReward": "string", "referralLink": "string"}'::jsonb),

  ('referral_conversion', 'email', 'default', '1.0.0', 'production', 'white',
   'You earned {{reward_amount}} — {{referee_name}} just activated',
   'Your referral paid off',
   'referral',
   '{"firstName": "string", "refereeName": "string", "rewardType": "string", "rewardAmount": "string", "totalEarned": "string"}'::jsonb),

  ('referral_reward_earned', 'email', 'default', '1.0.0', 'production', 'white',
   'Your referral reward is live',
   'Credits added to your account',
   'referral',
   '{"firstName": "string", "rewardDescription": "string", "rewardExpiry": "string", "newBalance": "string"}'::jsonb),

  ('referral_expiring_reward', 'email', 'default', '1.0.0', 'production', 'white',
   '{{reward_description}} expires in {{days_left}} days',
   'Use your credits before they expire',
   'referral',
   '{"firstName": "string", "rewardDescription": "string", "daysLeft": "number", "usageSummary": "string"}'::jsonb),

  ('referral_milestone', 'email', 'default', '1.0.0', 'production', 'white',
   'Milestone reached: {{milestone}} referrals',
   'Bonus reward unlocked',
   'referral',
   '{"firstName": "string", "milestone": "number", "bonusReward": "string", "nextMilestone": "number", "leaderboardPosition": "number"}'::jsonb),

  ('referral_periodic_summary', 'email', 'default', '1.0.0', 'production', 'white',
   'Your referral recap — {{activated}} converted this month',
   'Monthly referral performance',
   'referral',
   '{"firstName": "string", "totalSent": "number", "totalClicked": "number", "totalSignedUp": "number", "totalActivated": "number", "lifetimeEarnings": "string", "referralLink": "string"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- BILLING TEMPLATES (8) — White theme, Required Transactional
-- ALWAYS ON — user cannot disable
-- ════════════════════════════════════════════════════

INSERT INTO notification_templates (type, channel, cohort, version, status, theme, subject, preheader, category, variables)
VALUES
  ('subscription_confirm', 'email', 'default', '1.0.0', 'production', 'white',
   'Welcome to {{plan_name}} — subscription confirmed',
   'Your Pro features are active',
   'billing',
   '{"firstName": "string", "planName": "string", "amount": "string", "billingPeriod": "string", "nextRenewal": "string", "paymentMethod": "string", "receiptUrl": "string", "isNewSubscription": "boolean"}'::jsonb),

  ('credit_purchase_receipt', 'email', 'default', '1.0.0', 'production', 'white',
   '{{credits_added}} credits added to your account',
   'Purchase receipt',
   'billing',
   '{"firstName": "string", "creditsAdded": "number", "amount": "string", "newBalance": "number", "perCreditCost": "string", "paymentMethod": "string", "receiptUrl": "string"}'::jsonb),

  ('payment_failed', 'email', 'default', '1.0.0', 'production', 'white',
   'Payment failed for your {{plan_name}} subscription',
   'Please update your payment method',
   'billing',
   '{"firstName": "string", "amount": "string", "planName": "string", "attemptNumber": "number", "gracePeriodEnd": "string", "updatePaymentUrl": "string"}'::jsonb),

  ('payment_recovered', 'email', 'default', '1.0.0', 'production', 'white',
   'Payment successful — {{plan_name}} access restored',
   'All good — your account is active',
   'billing',
   '{"firstName": "string", "amount": "string", "planName": "string"}'::jsonb),

  ('plan_change_confirm', 'email', 'default', '1.0.0', 'production', 'white',
   'Plan changed: {{old_plan}} → {{new_plan}}',
   'Your plan update is confirmed',
   'billing',
   '{"firstName": "string", "oldPlan": "string", "newPlan": "string", "effectiveDate": "string", "proratedCredit": "string", "featuresGained": "array", "featuresLost": "array"}'::jsonb),

  ('subscription_cancelled', 'email', 'default', '1.0.0', 'production', 'white',
   '{{plan_name}} cancelled — access until {{access_until}}',
   'Your data is safe — nothing gets deleted',
   'billing',
   '{"firstName": "string", "planName": "string", "accessUntil": "string", "winBackDiscount": "string", "reactivateUrl": "string", "surveyUrl": "string"}'::jsonb),

  ('invoice_generated', 'email', 'default', '1.0.0', 'production', 'white',
   'Invoice for {{period}} — {{amount}}',
   'Your invoice is ready',
   'billing',
   '{"firstName": "string", "invoiceNumber": "string", "amount": "string", "period": "string", "lineItems": "array", "pdfUrl": "string"}'::jsonb),

  ('refund_processed', 'email', 'default', '1.0.0', 'production', 'white',
   'Refund of {{refund_amount}} processed',
   'Allow 5-10 business days',
   'billing',
   '{"firstName": "string", "refundAmount": "string", "reason": "string", "originalTransaction": "string", "timelineNote": "string"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- ADMIN NOTIFICATION CONFIG — Referral (9) + Billing (8)
-- ════════════════════════════════════════════════════

INSERT INTO admin_notification_config (type, cohort, enabled, cadence, channel_override, classification, frequency_cap_count, frequency_cap_window)
VALUES
  -- Referral configs (Product classification, user-configurable)
  ('referral_invite', 'default', true, 'event_driven', null, 'product', 1, '7 days'),
  ('referral_sent_confirmation', 'default', true, 'real_time', null, 'product', null, null),
  ('referral_status_update', 'default', true, 'real_time', null, 'product', 5, '1 day'),
  ('referral_nudge_referee', 'default', true, 'event_driven', null, 'marketing', 3, '30 days'),
  ('referral_conversion', 'default', true, 'real_time', null, 'product', null, null),
  ('referral_reward_earned', 'default', true, 'real_time', null, 'product', null, null),
  ('referral_expiring_reward', 'default', true, 'event_driven', null, 'product', 2, '7 days'),
  ('referral_milestone', 'default', true, 'event_driven', null, 'product', null, null),
  ('referral_periodic_summary', 'default', true, 'monthly', null, 'product', 1, '30 days'),

  -- Billing configs (Required transactional, ALWAYS ON, user cannot disable)
  ('subscription_confirm', 'default', true, 'real_time', 'email', 'required_transactional', null, null),
  ('credit_purchase_receipt', 'default', true, 'real_time', 'email', 'required_transactional', null, null),
  ('payment_failed', 'default', true, 'event_driven', 'email', 'required_transactional', 4, '14 days'),
  ('payment_recovered', 'default', true, 'real_time', 'email', 'required_transactional', null, null),
  ('plan_change_confirm', 'default', true, 'real_time', 'email', 'required_transactional', null, null),
  ('subscription_cancelled', 'default', true, 'real_time', 'email', 'required_transactional', null, null),
  ('invoice_generated', 'default', true, 'monthly', 'email', 'required_transactional', 1, '30 days'),
  ('refund_processed', 'default', true, 'real_time', 'email', 'required_transactional', null, null)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCE DEFAULTS MATRIX
-- Sets default on/off per tier × region for these 17 new types
-- ════════════════════════════════════════════════════

-- Billing: ALWAYS ON for all tiers/regions (required transactional)
-- No entries needed — required_transactional bypasses preference checks

-- Referral defaults: ON for Pro/Starter, marketing-gated for Free
-- EU: marketing opt-in defaults OFF (GDPR)
-- US: marketing opt-in defaults ON (CAN-SPAM with clear opt-out)

INSERT INTO notification_preference_defaults (type, tier, region, default_enabled, default_frequency, default_channel)
VALUES
  -- Referral defaults — US
  ('referral_invite', 'free', 'us', true, 'weekly', 'email'),
  ('referral_invite', 'starter', 'us', true, 'weekly', 'email'),
  ('referral_invite', 'pro', 'us', true, 'weekly', 'email'),
  ('referral_sent_confirmation', 'free', 'us', true, 'real_time', 'email'),
  ('referral_sent_confirmation', 'starter', 'us', true, 'real_time', 'email'),
  ('referral_sent_confirmation', 'pro', 'us', true, 'real_time', 'email'),
  ('referral_status_update', 'free', 'us', true, 'real_time', 'email'),
  ('referral_status_update', 'starter', 'us', true, 'real_time', 'email'),
  ('referral_status_update', 'pro', 'us', true, 'real_time', 'email'),
  ('referral_nudge_referee', 'free', 'us', true, 'event_driven', 'email'),
  ('referral_nudge_referee', 'starter', 'us', true, 'event_driven', 'email'),
  ('referral_nudge_referee', 'pro', 'us', true, 'event_driven', 'email'),
  ('referral_conversion', 'free', 'us', true, 'real_time', 'email'),
  ('referral_conversion', 'starter', 'us', true, 'real_time', 'email'),
  ('referral_conversion', 'pro', 'us', true, 'real_time', 'email'),
  ('referral_reward_earned', 'free', 'us', true, 'real_time', 'email'),
  ('referral_reward_earned', 'starter', 'us', true, 'real_time', 'email'),
  ('referral_reward_earned', 'pro', 'us', true, 'real_time', 'email'),
  ('referral_expiring_reward', 'free', 'us', true, 'event_driven', 'email'),
  ('referral_expiring_reward', 'starter', 'us', true, 'event_driven', 'email'),
  ('referral_expiring_reward', 'pro', 'us', true, 'event_driven', 'email'),
  ('referral_milestone', 'free', 'us', true, 'event_driven', 'email'),
  ('referral_milestone', 'starter', 'us', true, 'event_driven', 'email'),
  ('referral_milestone', 'pro', 'us', true, 'event_driven', 'email'),
  ('referral_periodic_summary', 'free', 'us', true, 'monthly', 'email'),
  ('referral_periodic_summary', 'starter', 'us', true, 'monthly', 'email'),
  ('referral_periodic_summary', 'pro', 'us', true, 'monthly', 'email'),

  -- Referral defaults — EU (marketing-gated: nudge_referee defaults OFF)
  ('referral_invite', 'free', 'eu', true, 'weekly', 'email'),
  ('referral_invite', 'starter', 'eu', true, 'weekly', 'email'),
  ('referral_invite', 'pro', 'eu', true, 'weekly', 'email'),
  ('referral_sent_confirmation', 'free', 'eu', true, 'real_time', 'email'),
  ('referral_sent_confirmation', 'starter', 'eu', true, 'real_time', 'email'),
  ('referral_sent_confirmation', 'pro', 'eu', true, 'real_time', 'email'),
  ('referral_status_update', 'free', 'eu', true, 'real_time', 'email'),
  ('referral_status_update', 'starter', 'eu', true, 'real_time', 'email'),
  ('referral_status_update', 'pro', 'eu', true, 'real_time', 'email'),
  ('referral_nudge_referee', 'free', 'eu', false, 'event_driven', 'email'),
  ('referral_nudge_referee', 'starter', 'eu', false, 'event_driven', 'email'),
  ('referral_nudge_referee', 'pro', 'eu', false, 'event_driven', 'email'),
  ('referral_conversion', 'free', 'eu', true, 'real_time', 'email'),
  ('referral_conversion', 'starter', 'eu', true, 'real_time', 'email'),
  ('referral_conversion', 'pro', 'eu', true, 'real_time', 'email'),
  ('referral_reward_earned', 'free', 'eu', true, 'real_time', 'email'),
  ('referral_reward_earned', 'starter', 'eu', true, 'real_time', 'email'),
  ('referral_reward_earned', 'pro', 'eu', true, 'real_time', 'email'),
  ('referral_expiring_reward', 'free', 'eu', true, 'event_driven', 'email'),
  ('referral_expiring_reward', 'starter', 'eu', true, 'event_driven', 'email'),
  ('referral_expiring_reward', 'pro', 'eu', true, 'event_driven', 'email'),
  ('referral_milestone', 'free', 'eu', true, 'event_driven', 'email'),
  ('referral_milestone', 'starter', 'eu', true, 'event_driven', 'email'),
  ('referral_milestone', 'pro', 'eu', true, 'event_driven', 'email'),
  ('referral_periodic_summary', 'free', 'eu', true, 'monthly', 'email'),
  ('referral_periodic_summary', 'starter', 'eu', true, 'monthly', 'email'),
  ('referral_periodic_summary', 'pro', 'eu', true, 'monthly', 'email')
ON CONFLICT DO NOTHING;
