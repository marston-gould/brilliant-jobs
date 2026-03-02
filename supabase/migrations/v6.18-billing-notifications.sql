-- v6.18 Session 14: Billing + Payments Notifications
-- pg_cron schedule for subscription expiring reminders
-- Run daily at 15:00 UTC (10:00 AM ET) to check for expiring subscriptions

-- Schedule: billing-expiring-check (daily)
SELECT cron.schedule(
  'billing-expiring-check',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/billing-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"source": "cron", "action": "expiring_check"}'::jsonb
  );
  $$
);

-- Verify all 9 billing notification templates exist (seeded by Pod 1 v6.11)
-- This is a check query — should return 9 rows
SELECT notification_type, channel, status
FROM notification_templates
WHERE notification_type IN (
  'subscription_confirm',
  'credit_purchase_receipt',
  'payment_failed',
  'payment_recovered',
  'plan_change_confirm',
  'subscription_cancelled',
  'invoice_generated',
  'refund_processed',
  'subscription_expiring'
)
AND status = 'production'
ORDER BY notification_type;

-- Verify all 9 admin_notification_config rows exist
SELECT notification_type, enabled, cadence
FROM admin_notification_config
WHERE notification_type IN (
  'subscription_confirm',
  'credit_purchase_receipt',
  'payment_failed',
  'payment_recovered',
  'plan_change_confirm',
  'subscription_cancelled',
  'invoice_generated',
  'refund_processed',
  'subscription_expiring'
)
ORDER BY notification_type;
