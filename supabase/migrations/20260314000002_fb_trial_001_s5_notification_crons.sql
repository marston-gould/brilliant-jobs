-- Migration: 20260314000002_fb_trial_001_s5_notification_crons.sql
-- Session: FB-TRIAL-001-S5 — Trial Notifications
-- Part 3: pg_cron schedules for send-trial-notifications + weekly-digest-expired
-- Part 4: notification_templates seeds for all 9 trial/referral/sample notification types
--
-- Dependencies:
--   user_activity_log (v6.51), profiles trial columns (v8.48), trial_referrals (20260314000001)
--   notification_templates table (pre-existing)

-- ══════════════════════════════════════════════════════════════
-- PART 3: pg_cron schedules
-- ══════════════════════════════════════════════════════════════

-- trial-expiry-notifications: daily at 9AM UTC
-- Sends countdown emails at 5-day, 3-day, 1-day marks
SELECT cron.schedule(
  'trial-expiry-notifications',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-trial-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"trial_expiring"}'::jsonb
  );
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;

-- expired-nudge-notifications: daily at 9AM UTC
-- "Your trial has expired" email for users who just transitioned
SELECT cron.schedule(
  'expired-nudge-notifications',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-trial-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"expired_nudge"}'::jsonb
  );
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;

-- expired-nudge-30d: daily at 10AM UTC
-- 30-day post-expiry re-engagement email
SELECT cron.schedule(
  'expired-nudge-30d',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-trial-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"expired_nudge_30d"}'::jsonb
  );
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;

-- sample-reminder-notifications: daily at 10AM UTC
-- Day 10 post-expiry nudge for users who haven't used their samples
SELECT cron.schedule(
  'sample-reminder-notifications',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-trial-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"action":"sample_reminder"}'::jsonb
  );
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;

-- weekly-digest-expired: Mondays at 8AM UTC
-- Weekly digest for expired_free users with matching job counts
SELECT cron.schedule(
  'weekly-digest-expired',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/weekly-digest-expired',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
) ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command;

-- ══════════════════════════════════════════════════════════════
-- PART 4: Notification templates
-- 9 template IDs for trial/sample/referral lifecycle emails
-- Schema: notification_type, channel, subject_line, html_body, sms_body, active
-- ══════════════════════════════════════════════════════════════

INSERT INTO notification_templates (notification_type, channel, subject_line, html_body, active)
VALUES

-- ── Trial expiring — 5 days ──
('trial_expiring_5d', 'email',
 'Your trial ends in 5 days',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>5 days left in your trial</h2><p>Your Brilliant Jobs trial expires on <strong>{{expires_date}}</strong>.</p><p>Upgrade now to keep access to AI job matching, resume scoring, auto-apply, and saved filters — everything you need to land faster.</p><a href="{{upgrade_url}}" class="cta">Upgrade Now</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Trial expiring — 3 days ──
('trial_expiring_3d', 'email',
 'Trial ends in 3 days — keep your access',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#3b82f6;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>3 days left in your trial</h2><p>Your trial expires on <strong>{{expires_date}}</strong>. Don''t lose your saved filters, pipeline, and resume matches.</p><p>Upgrade to Pro and keep everything exactly as-is.</p><a href="{{upgrade_url}}" class="cta">Upgrade Now</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Trial expiring — 1 day ──
('trial_expiring_1d', 'email',
 'Last chance — trial ends tomorrow',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #e24b4a;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#e24b4a;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#e24b4a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Trial ends tomorrow</h2><p>Your Brilliant Jobs trial expires tomorrow (<strong>{{expires_date}}</strong>). After that you''ll be on the free plan — no AI chat, no resume scoring, no auto-apply.</p><p>Upgrade in 30 seconds to keep uninterrupted access.</p><a href="{{upgrade_url}}" class="cta">Upgrade Now</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Trial expired ──
('trial_expired', 'email',
 'Your trial has ended — free samples still waiting',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.pill{display:inline-block;background:#1e2235;border:1px solid #2a2d35;border-radius:6px;padding:4px 10px;font-size:12px;color:#94a3b8;margin:2px;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Your trial has ended</h2><p>Your free trial is over — but you still have <strong>1 free use of each Pro feature</strong> waiting for you. No subscription needed to try them.</p><div style="margin:16px 0;"><span class="pill">AI Job Chat</span><span class="pill">Resume Scoring</span><span class="pill">Auto-Apply</span><span class="pill">SMS Alerts</span></div><p>Browse jobs anytime. Use your free samples whenever you''re ready.</p><a href="{{upgrade_url}}" class="cta">Upgrade to Pro</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Trial expired 30-day re-engagement ──
('trial_expired_30d', 'email',
 'Still tracking {{filter_count}} job filters for you',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Still tracking jobs for you</h2><p>It''s been 30 days since your trial ended. Your {{filter_count}} saved filter{{filter_count|pluralize:"","s"}} are still active — new matching jobs are being found every day.</p><p>Upgrade to Pro to see them, get alerts, and auto-apply before your competition does.</p><a href="{{upgrade_url}}" class="cta">Upgrade to Pro</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Referral signup notify (to referrer) ──
('referral_signup_notify', 'email',
 '{{referred_name}} signed up via your link',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Your referral signed up! 🎉</h2><p><strong>{{referred_name}}</strong> just created a Brilliant Jobs account using your referral link.</p><p>You''ll both receive a <strong>free week of Pro</strong> when they subscribe.</p><a href="{{upgrade_url}}" class="cta">View Referral Status</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Referral converted — referrer gets coupon confirmation ──
('referral_converted_referrer', 'email',
 '{{referred_name}} subscribed — your free week is applied',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #22c55e;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#22c55e;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.cta{display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Referral reward earned! 🎉</h2><p><strong>{{referred_name}}</strong> just subscribed to Brilliant Jobs Pro.</p><p>Your referral reward — <strong>1 free week</strong> — has been applied to your account and will offset your next billing cycle.</p><a href="{{reward_url}}" class="cta">View Your Account</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Referral converted — referred gets bonus week confirmation ──
('referral_converted_referred', 'email',
 'Welcome to Pro — your bonus week is active',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #6366f1;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#6366f1;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.pill{display:inline-block;background:#1e2235;border:1px solid #2a2d35;border-radius:6px;padding:4px 10px;font-size:12px;color:#94a3b8;margin:2px;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>Welcome to Brilliant Jobs Pro!</h2><p>You subscribed via a referral link — your first week is on us as a thank you.</p><div style="margin:16px 0;"><span class="pill">AI Job Chat</span><span class="pill">Resume Scoring</span><span class="pill">Auto-Apply</span><span class="pill">SMS Alerts</span><span class="pill">Saved Filters</span></div><p>All Pro features are now unlocked. Let''s find you a job.</p><a href="{{dashboard_url}}" class="cta">Go to Dashboard</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true),

-- ── Sample reminder (day 10 post-expiry, no samples used) ──
('sample_used_reminder', 'email',
 'Your free Pro samples are still waiting',
 '<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:0;background:#0e1117;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;color:#e2e8f0;}.wrap{max-width:520px;margin:40px auto;padding:0 20px;}.card{background:#1a1d27;border:1px solid #2a2d35;border-radius:12px;padding:32px;}h2{margin:0 0 12px;font-size:20px;color:#f0f1f3;font-weight:600;}p{margin:0 0 16px;font-size:14px;line-height:1.6;color:#94a3b8;}.feature-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #2a2d35;font-size:13px;color:#94a3b8;}.cta{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600;margin-top:8px;}.footer{margin-top:24px;font-size:11px;color:#475569;text-align:center;}</style></head><body><div class="wrap"><div class="card"><h2>You haven''t used your free samples yet</h2><p>You have <strong>1 free use of every Pro feature</strong> — no subscription needed. Try them anytime:</p><div class="feature-row">🤖 AI job search chat</div><div class="feature-row">📊 Resume scoring + gap analysis</div><div class="feature-row">🚀 Auto-apply a job</div><div class="feature-row">📱 SMS job alert</div><a href="{{dashboard_url}}" class="cta">Try It Now — Free</a></div><div class="footer">Brilliant Jobs · <a href="https://brilliantjobs.app/unsubscribe" style="color:#475569;">Unsubscribe</a></div></div></body></html>',
 true)

ON CONFLICT (notification_type, channel) DO UPDATE
  SET subject_line = EXCLUDED.subject_line,
      html_body = EXCLUDED.html_body,
      active = EXCLUDED.active;

-- ── SMS bodies for trial_expiring_1d (high urgency = worth SMS) ──
INSERT INTO notification_templates (notification_type, channel, sms_body, active)
VALUES
  ('trial_expiring_1d', 'sms',
   'BrilliantJobs: Your trial ends tomorrow. Upgrade now to keep access: https://brilliantjobs.app/upgrade',
   true),
  ('trial_expired', 'sms',
   'BrilliantJobs: Trial ended. You still have 1 free use of each Pro feature waiting. Try one: https://brilliantjobs.app',
   true),
  ('referral_converted_referrer', 'sms',
   'BrilliantJobs: Your referral subscribed! Free week applied to your account: https://brilliantjobs.app/billing',
   true)
ON CONFLICT (notification_type, channel) DO UPDATE
  SET sms_body = EXCLUDED.sms_body, active = EXCLUDED.active;

-- ══════════════════════════════════════════════════════════════
-- Index: speed up dedup lookups in notification_log for trial types
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_notif_log_user_type_created
  ON notification_log (user_id, notification_type, created_at DESC);

COMMENT ON INDEX idx_notif_log_user_type_created IS
  'FB-TRIAL-001-S5: speeds up dedup guard in send-trial-notifications';
