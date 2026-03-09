-- FB-PAYL-S2: Dashboard UI — Notification Templates + Stripe Config
-- Migration: v6.47-fb-payl-002-dashboard-ui
-- Session: FB-PAYL-S2
-- Depends on: v6.46-fb-payl-001-foundation (payl_enrollments, payl_referrals)

-- ─── 1. Seed 7 PAYL notification templates ───
INSERT INTO notification_templates (notification_type, channel, subject, body, category, is_active)
VALUES
  -- payl_activated: PAYL enrollment confirmed (email only)
  ('payl_activated', 'email',
   'You''re in! Pro features are now unlocked',
   '<h2>Welcome to Pay After You Land</h2><p>Your Pro features are now active. You have {{days_remaining}} days in your PAYL window.</p><p><strong>Next step:</strong> Share your referral link with 3 friends to keep your access.</p><p>Your referral link: <a href="{{referral_url}}">{{referral_url}}</a></p><p>Referral progress: {{referrals_qualified}}/3 qualified</p>',
   'payl', true),

  -- payl_referral_progress: Referral qualified milestone (email + SMS)
  ('payl_referral_progress', 'email',
   '{{referrals_qualified}} of 3 referrals qualified!',
   '<h2>Referral Progress Update</h2><p>Great news — you now have <strong>{{referrals_qualified}} of 3</strong> qualified referrals.</p>{{#if all_qualified}}<p>🎯 All 3 referrals qualified! Your PAYL access is fully secured.</p>{{else}}<p>Keep sharing: <a href="{{referral_url}}">{{referral_url}}</a></p>{{/if}}<p>Days remaining in PAYL window: {{days_remaining}}</p>',
   'payl', true),
  ('payl_referral_progress', 'sms',
   'BrilliantJobs: {{referrals_qualified}}/3 referrals qualified! {{#if all_qualified}}All set!{{else}}Share {{referral_url}}{{/if}}',
   NULL, 'payl', true),

  -- payl_referral_revoked: Referral downgraded (email only)
  ('payl_referral_revoked', 'email',
   'Referral credit update',
   '<h2>Referral Update</h2><p>One of your referrals has been revoked (reason: {{revoke_reason}}). Your qualified referral count is now {{referrals_qualified}}/3.</p><p>Keep sharing to maintain your Pro access: <a href="{{referral_url}}">{{referral_url}}</a></p>',
   'payl', true),

  -- payl_employment_nudge: Periodic check-in (email + SMS)
  ('payl_employment_nudge', 'email',
   'Have you landed a new role?',
   '<h2>Quick Check-In</h2><p>Hi {{display_name}},</p><p>It''s been {{days_since_activation}} days since you activated Pay After You Land. Have you secured a new position?</p><p><a href="{{report_employment_url}}">Yes, I got the job!</a> — We''ll transition you to a standard Pro subscription.</p><p><a href="{{dismiss_url}}">Still looking</a> — We''ll check in again in {{next_nudge_days}} days.</p>{{#if is_final_warning}}<p><strong>Note:</strong> Your PAYL window expires in {{days_remaining}} days. After that, your account will revert to Free unless you convert to Pro.</p>{{/if}}',
   'payl', true),
  ('payl_employment_nudge', 'sms',
   'BrilliantJobs: Landed a job? Tap to report: {{report_employment_url}} ({{days_remaining}}d left in PAYL)',
   NULL, 'payl', true),

  -- payl_expiring_soon: 15 days before window expires (email + SMS)
  ('payl_expiring_soon', 'email',
   'Your PAYL window expires in {{days_remaining}} days',
   '<h2>PAYL Window Expiring Soon</h2><p>Your Pay After You Land access expires in <strong>{{days_remaining}} days</strong>.</p>{{#if can_extend}}<p>You have {{referrals_qualified}} qualified referrals (4+ needed for a 90-day extension). Share your link to extend: <a href="{{referral_url}}">{{referral_url}}</a></p>{{/if}}<p><strong>Options:</strong></p><ul><li><a href="{{report_employment_url}}">Report employment</a> — transition to paid Pro</li><li><a href="{{upgrade_url}}">Upgrade to Pro now</a> — keep all your features</li><li>Do nothing — your account will revert to Free on {{expiry_date}}</li></ul>',
   'payl', true),
  ('payl_expiring_soon', 'sms',
   'BrilliantJobs: PAYL expires in {{days_remaining}}d. Upgrade or report employment: {{upgrade_url}}',
   NULL, 'payl', true),

  -- payl_expired: Window expired, downgraded to Free (email only)
  ('payl_expired', 'email',
   'Your PAYL access has ended',
   '<h2>PAYL Window Expired</h2><p>Your Pay After You Land window has ended and your account has been moved to the Free tier.</p><p>Your saved filters, resumes, and pipeline data are preserved. <a href="{{upgrade_url}}">Upgrade to Pro</a> to restore full access.</p>',
   'payl', true),

  -- payl_converted: Successfully converted to paid Pro (email only)
  ('payl_converted', 'email',
   'Welcome to Pro — your subscription is active',
   '<h2>You''re Now a Pro Subscriber</h2><p>Congratulations on landing your new role! Your Pro subscription is now active at {{price}}/mo.</p><p>Your card ending in {{card_last4}} will be charged on {{next_billing_date}}.</p><p>All your filters, resumes, and pipeline data remain exactly as they were.</p>',
   'payl', true)
ON CONFLICT DO NOTHING;

-- ─── 2. Add PAYL-specific notification overrides row if needed ───
-- (Allows users to control PAYL notification preferences)
INSERT INTO notification_categories (category, label, description, default_email, default_sms, default_push)
VALUES ('payl', 'Pay After You Land', 'Enrollment, referral progress, and employment check-ins', true, true, false)
ON CONFLICT DO NOTHING;

-- ─── 3. PAYL enrollment status tracking view (for admin analytics) ───
CREATE OR REPLACE VIEW v_payl_analytics AS
SELECT
  COUNT(*) FILTER (WHERE pe.status = 'pending_pdf') AS pending_pdf,
  COUNT(*) FILTER (WHERE pe.status = 'pending_referrals') AS pending_referrals,
  COUNT(*) FILTER (WHERE pe.status = 'active') AS active,
  COUNT(*) FILTER (WHERE pe.status = 'converted') AS converted,
  COUNT(*) FILTER (WHERE pe.status = 'expired') AS expired,
  COUNT(*) FILTER (WHERE pe.status = 'revoked') AS revoked,
  COUNT(*) AS total_enrollments,
  -- Referral metrics
  (SELECT COUNT(*) FROM payl_referrals WHERE status = 'qualified') AS total_qualified_referrals,
  (SELECT COUNT(*) FROM payl_referrals WHERE status = 'signed_up') AS pending_referrals_count,
  (SELECT COUNT(DISTINCT payl_enrollment_id) FROM payl_referrals WHERE status = 'revoked') AS enrollments_with_revocations,
  -- Conversion metrics
  ROUND(
    COUNT(*) FILTER (WHERE pe.status = 'converted')::numeric /
    NULLIF(COUNT(*) FILTER (WHERE pe.status IN ('active', 'converted', 'expired')), 0) * 100, 1
  ) AS conversion_rate_pct,
  -- Avg days to activation
  ROUND(
    AVG(EXTRACT(EPOCH FROM (pe.activated_at - pe.created_at)) / 86400)
    FILTER (WHERE pe.activated_at IS NOT NULL), 1
  ) AS avg_days_to_activation,
  -- Avg days to conversion
  ROUND(
    AVG(EXTRACT(EPOCH FROM (pe.converted_at - pe.activated_at)) / 86400)
    FILTER (WHERE pe.converted_at IS NOT NULL), 1
  ) AS avg_days_to_conversion
FROM payl_enrollments pe;

-- ─── 4. PAYL enrollment funnel view (daily cohorts for admin charts) ───
CREATE OR REPLACE VIEW v_payl_daily_funnel AS
SELECT
  DATE(pe.created_at) AS cohort_date,
  COUNT(*) AS enrollments_started,
  COUNT(*) FILTER (WHERE pe.linkedin_pdf_hash IS NOT NULL) AS pdf_uploaded,
  COUNT(*) FILTER (WHERE pe.status NOT IN ('pending_pdf', 'pending_referrals')) AS activated,
  COUNT(*) FILTER (WHERE pe.referrals_qualified >= 3) AS fully_referred,
  COUNT(*) FILTER (WHERE pe.status = 'converted') AS converted,
  COUNT(*) FILTER (WHERE pe.status = 'expired') AS expired
FROM payl_enrollments pe
GROUP BY DATE(pe.created_at)
ORDER BY cohort_date DESC;

-- ─── 5. Function: PAYL admin summary (for admin panel) ───
CREATE OR REPLACE FUNCTION fn_payl_admin_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'overview', (SELECT row_to_json(v) FROM v_payl_analytics v),
    'daily_funnel', (
      SELECT COALESCE(jsonb_agg(row_to_json(f)), '[]'::jsonb)
      FROM (SELECT * FROM v_payl_daily_funnel LIMIT 30) f
    ),
    'recent_enrollments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', pe.user_id,
        'status', pe.status,
        'referrals_qualified', pe.referrals_qualified,
        'created_at', pe.created_at,
        'activated_at', pe.activated_at,
        'expires_at', pe.expires_at,
        'days_remaining', CASE
          WHEN pe.expires_at IS NOT NULL THEN
            GREATEST(0, EXTRACT(EPOCH FROM (pe.expires_at - NOW())) / 86400)::int
          ELSE NULL
        END
      )), '[]'::jsonb)
      FROM (
        SELECT * FROM payl_enrollments
        ORDER BY created_at DESC
        LIMIT 20
      ) pe
    ),
    'referral_leaderboard', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'user_id', pe.user_id,
        'referral_code', pe.referral_code,
        'referrals_qualified', pe.referrals_qualified,
        'total_referrals', (SELECT COUNT(*) FROM payl_referrals pr WHERE pr.payl_enrollment_id = pe.id)
      )), '[]'::jsonb)
      FROM (
        SELECT * FROM payl_enrollments
        WHERE referrals_qualified > 0
        ORDER BY referrals_qualified DESC
        LIMIT 10
      ) pe
    ),
    'anti_gaming_flags', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'referral_id', pr.id,
        'enrollment_id', pr.payl_enrollment_id,
        'status', pr.status,
        'revoke_reason', pr.revoke_reason,
        'signup_ip', pr.signup_ip,
        'revoked_at', pr.revoked_at
      )), '[]'::jsonb)
      FROM (
        SELECT * FROM payl_referrals
        WHERE status = 'revoked'
        ORDER BY revoked_at DESC NULLS LAST
        LIMIT 20
      ) pr
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ─── 6. Grant access ───
GRANT SELECT ON v_payl_analytics TO authenticated;
GRANT SELECT ON v_payl_daily_funnel TO authenticated;
GRANT EXECUTE ON FUNCTION fn_payl_admin_summary() TO service_role;
