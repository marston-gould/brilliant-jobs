-- v6.13 Seed: Community & Feedback notification templates
-- Pod 1 Session 13: Batch 10b (Community/Feedback) copy delivery
-- Date: 2026-03-01
-- Canny Integration: bug_report_thankyou, bug_resolved, feature_request_thankyou,
--   feature_request_accepted, feature_request_shipped, monthly_product_update

-- ════════════════════════════════════════════════════
-- COMMUNITY & FEEDBACK TEMPLATES (6) — White theme
-- bug_report_thankyou, bug_resolved: Product classification
-- feature_request_*: Product classification
-- monthly_product_update: Marketing classification (unsubscribe required)
-- ════════════════════════════════════════════════════

INSERT INTO notification_templates (type, channel, cohort, version, status, theme, subject, preheader, category, variables)
VALUES
  ('bug_report_thankyou', 'email', 'default', '1.0.0', 'production', 'white',
   'Bug confirmed{{#bug_id}} (#{{bug_id}}){{/bug_id}} — thank you, {{first_name}}',
   'We''ve confirmed your report and rewarded your account',
   'community',
   '{"firstName": "string", "bugTitle": "string", "bugId": "string", "severity": "string", "rewardCredits": "number", "rewardTrial": "string", "cannyUrl": "string"}'::jsonb),

  ('bug_resolved', 'email', 'default', '1.0.0', 'production', 'white',
   'Fixed{{#bug_id}} (#{{bug_id}}){{/bug_id}}: {{bug_title}}',
   'Your bug report has been resolved — see what changed',
   'community',
   '{"firstName": "string", "bugTitle": "string", "bugId": "string", "fixSummary": "string", "releasedIn": "string", "cannyUrl": "string"}'::jsonb),

  ('feature_request_thankyou', 'email', 'default', '1.0.0', 'production', 'white',
   'Feature request received{{#feature_id}} (#{{feature_id}}){{/feature_id}} — we''re listening',
   'Your idea is on our radar — here''s what happens next',
   'community',
   '{"firstName": "string", "featureTitle": "string", "featureId": "string", "cannyUrl": "string"}'::jsonb),

  ('feature_request_accepted', 'email', 'default', '1.0.0', 'production', 'white',
   'Your feature request is on the roadmap{{#feature_id}} (#{{feature_id}}){{/feature_id}}',
   'We''re building what you asked for',
   'community',
   '{"firstName": "string", "featureTitle": "string", "featureId": "string", "estimatedTimeline": "string", "cannyUrl": "string"}'::jsonb),

  ('feature_request_shipped', 'email', 'default', '1.0.0', 'production', 'white',
   'Shipped: {{feature_title}}{{#feature_id}} (#{{feature_id}}){{/feature_id}} is live',
   'A feature you requested is now available',
   'community',
   '{"firstName": "string", "featureTitle": "string", "featureId": "string", "featureDescription": "string", "howToAccess": "string", "cannyUrl": "string"}'::jsonb),

  ('monthly_product_update', 'email', 'default', '1.0.0', 'production', 'white',
   '{{month_label}} product update — here''s what''s new',
   'Features shipped, bugs fixed, and what''s coming next',
   'community',
   '{"firstName": "string", "monthLabel": "string", "featuresShipped": "array", "bugsFixed": "number", "comingNext": "array", "platformStats": "object", "changelogUrl": "string"}'::jsonb)
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- ADMIN NOTIFICATION CONFIG (6 rows)
-- ════════════════════════════════════════════════════

INSERT INTO admin_notification_config (type, enabled, classification, frequency_cap, frequency_window, channels, priority, description)
VALUES
  ('bug_report_thankyou', true, 'product', NULL, NULL, '{"email"}'::text[], 'medium',
   'Confirmation + reward when admin confirms a bug report. Triggered by Canny webhook on status change.'),

  ('bug_resolved', true, 'product', NULL, NULL, '{"email"}'::text[], 'medium',
   'Notification when a reported bug is fixed and shipped. Triggered by Canny webhook on status change to "complete".'),

  ('feature_request_thankyou', true, 'product', NULL, NULL, '{"email"}'::text[], 'low',
   'Acknowledgment when a feature request is submitted via Canny. Triggered on post creation webhook.'),

  ('feature_request_accepted', true, 'product', NULL, NULL, '{"email"}'::text[], 'medium',
   'Notification when feature request status changes to "planned" in Canny. Triggered by Canny webhook.'),

  ('feature_request_shipped', true, 'product', NULL, NULL, '{"email"}'::text[], 'medium',
   'Celebration notification when a feature request is marked "complete" in Canny. Triggered by Canny webhook.'),

  ('monthly_product_update', true, 'marketing', 1, 'monthly', '{"email"}'::text[], 'low',
   'Monthly editorial digest: features shipped, bugs fixed, roadmap preview. Curated via admin console, auto-pulls from Canny changelog. Requires unsubscribe link (marketing).')
ON CONFLICT DO NOTHING;

-- ════════════════════════════════════════════════════
-- NOTIFICATION PREFERENCE DEFAULTS
-- 6 types × 3 tiers × 2 regions = 36 rows
-- Bug/feature lifecycle: Product — all tiers/regions default ON
-- monthly_product_update: Marketing — US ON, EU OFF (GDPR)
-- ════════════════════════════════════════════════════

INSERT INTO notification_preference_defaults (type, tier, region, default_enabled, default_frequency, classification)
VALUES
  -- bug_report_thankyou: Product — always on (user reported the bug)
  ('bug_report_thankyou', 'free', 'us', true, 'realtime', 'product'),
  ('bug_report_thankyou', 'starter', 'us', true, 'realtime', 'product'),
  ('bug_report_thankyou', 'pro', 'us', true, 'realtime', 'product'),
  ('bug_report_thankyou', 'free', 'eu', true, 'realtime', 'product'),
  ('bug_report_thankyou', 'starter', 'eu', true, 'realtime', 'product'),
  ('bug_report_thankyou', 'pro', 'eu', true, 'realtime', 'product'),

  -- bug_resolved: Product — always on
  ('bug_resolved', 'free', 'us', true, 'realtime', 'product'),
  ('bug_resolved', 'starter', 'us', true, 'realtime', 'product'),
  ('bug_resolved', 'pro', 'us', true, 'realtime', 'product'),
  ('bug_resolved', 'free', 'eu', true, 'realtime', 'product'),
  ('bug_resolved', 'starter', 'eu', true, 'realtime', 'product'),
  ('bug_resolved', 'pro', 'eu', true, 'realtime', 'product'),

  -- feature_request_thankyou: Product — always on
  ('feature_request_thankyou', 'free', 'us', true, 'realtime', 'product'),
  ('feature_request_thankyou', 'starter', 'us', true, 'realtime', 'product'),
  ('feature_request_thankyou', 'pro', 'us', true, 'realtime', 'product'),
  ('feature_request_thankyou', 'free', 'eu', true, 'realtime', 'product'),
  ('feature_request_thankyou', 'starter', 'eu', true, 'realtime', 'product'),
  ('feature_request_thankyou', 'pro', 'eu', true, 'realtime', 'product'),

  -- feature_request_accepted: Product — always on
  ('feature_request_accepted', 'free', 'us', true, 'realtime', 'product'),
  ('feature_request_accepted', 'starter', 'us', true, 'realtime', 'product'),
  ('feature_request_accepted', 'pro', 'us', true, 'realtime', 'product'),
  ('feature_request_accepted', 'free', 'eu', true, 'realtime', 'product'),
  ('feature_request_accepted', 'starter', 'eu', true, 'realtime', 'product'),
  ('feature_request_accepted', 'pro', 'eu', true, 'realtime', 'product'),

  -- feature_request_shipped: Product — always on
  ('feature_request_shipped', 'free', 'us', true, 'realtime', 'product'),
  ('feature_request_shipped', 'starter', 'us', true, 'realtime', 'product'),
  ('feature_request_shipped', 'pro', 'us', true, 'realtime', 'product'),
  ('feature_request_shipped', 'free', 'eu', true, 'realtime', 'product'),
  ('feature_request_shipped', 'starter', 'eu', true, 'realtime', 'product'),
  ('feature_request_shipped', 'pro', 'eu', true, 'realtime', 'product'),

  -- monthly_product_update: Marketing — US ON, EU OFF (GDPR double opt-in)
  ('monthly_product_update', 'free', 'us', true, 'monthly', 'marketing'),
  ('monthly_product_update', 'starter', 'us', true, 'monthly', 'marketing'),
  ('monthly_product_update', 'pro', 'us', true, 'monthly', 'marketing'),
  ('monthly_product_update', 'free', 'eu', false, 'monthly', 'marketing'),
  ('monthly_product_update', 'starter', 'eu', false, 'monthly', 'marketing'),
  ('monthly_product_update', 'pro', 'eu', false, 'monthly', 'marketing')
ON CONFLICT DO NOTHING;
