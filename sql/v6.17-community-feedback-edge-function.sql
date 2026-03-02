-- v6.17 Seed: Community & Feedback Edge Function support
-- Pod 2 Session 13: Community, Feedback + Canny Integration
-- Date: 2026-03-01
--
-- entitlement_grants table created via Management API (already live)
-- This seed adds the pg_cron schedule for monthly product update

-- ════════════════════════════════════════════════════
-- pg_cron: Monthly Product Update (1st of month, 9:00 AM ET)
-- ════════════════════════════════════════════════════

SELECT cron.schedule(
  'monthly-product-update',
  '0 14 1 * *',  -- 9:00 AM ET = 14:00 UTC on 1st of month
  $$
  SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/community-feedback',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'type', 'monthly_update',
      'features_shipped', '[]'::jsonb,
      'bugs_fixed', 0,
      'coming_next', '[]'::jsonb,
      'platform_stats', '{}'::jsonb
    )
  );
  $$
);
