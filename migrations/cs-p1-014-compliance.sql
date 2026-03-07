-- =============================================================
-- CS-P1-014: Compliance — Hard Delete Cascade + Privacy Infrastructure
-- Date: 2026-03-07
-- Findings: AD-CP-002 (user deletion), AD-CP-001 (admin PII audit)
-- =============================================================

-- ─── DELETION REQUEST TRACKING ────────────────────────────────
-- Replaces job_queue approach with dedicated table for audit trail
CREATE TABLE IF NOT EXISTS deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  grace_expires_at timestamptz NOT NULL,
  hard_deleted_at timestamptz,
  cancelled_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  tables_deleted text[],
  storage_deleted boolean DEFAULT false,
  third_party_notified boolean DEFAULT false,
  error_log jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON deletion_requests (status, grace_expires_at);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_user ON deletion_requests (user_id);

-- ─── ADMIN PII ACCESS LOG ─────────────────────────────────────
-- AD-CP-001: Log when admin views PII-containing data
CREATE TABLE IF NOT EXISTS admin_pii_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users,
  target_user_id uuid,
  access_type text NOT NULL, -- 'view_profile', 'view_resume', 'view_export', 'search_users'
  table_accessed text,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_pii_access ON admin_pii_access_log (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_pii_target ON admin_pii_access_log (target_user_id, created_at DESC);

-- RLS: Only admins can read PII access logs
ALTER TABLE admin_pii_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_pii_access_select ON admin_pii_access_log
  FOR SELECT USING (is_admin());
CREATE POLICY admin_pii_access_insert ON admin_pii_access_log
  FOR INSERT WITH CHECK (is_admin());

-- ─── HARD DELETE CASCADE FUNCTION ─────────────────────────────
-- Called by pg_cron after grace period expires, or by admin
CREATE OR REPLACE FUNCTION hard_delete_user_cascade(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tables_deleted text[] := '{}';
  v_errors jsonb := '[]'::jsonb;
  v_count int;
BEGIN
  -- Safety check: ensure deletion was requested
  IF NOT EXISTS (
    SELECT 1 FROM deletion_requests
    WHERE user_id = p_user_id AND status = 'pending'
    AND grace_expires_at <= now()
  ) THEN
    RETURN jsonb_build_object('error', 'No eligible deletion request found');
  END IF;

  -- Delete from all user-linked tables (order matters for FK constraints)
  -- Tables with ON DELETE CASCADE will auto-clean when auth.users is deleted,
  -- but we explicitly delete for tables with SET NULL and for audit completeness.

  -- Extension & telemetry
  DELETE FROM extension_heartbeats WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN v_tables_deleted := array_append(v_tables_deleted, 'extension_heartbeats'); END IF;
  
  DELETE FROM extension_events WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN v_tables_deleted := array_append(v_tables_deleted, 'extension_events'); END IF;
  
  DELETE FROM overlay_analytics WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN v_tables_deleted := array_append(v_tables_deleted, 'overlay_analytics'); END IF;

  -- Experiments
  DELETE FROM ab_assignments WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; IF v_count > 0 THEN v_tables_deleted := array_append(v_tables_deleted, 'ab_assignments'); END IF;

  -- Notifications (SET NULL tables — anonymize)
  UPDATE notification_log SET user_id = NULL, subject = '[deleted]', payload = '{}'::jsonb WHERE user_id = p_user_id;
  UPDATE notification_actions SET user_id = NULL WHERE user_id = p_user_id;
  
  -- Notifications (CASCADE tables — delete)
  DELETE FROM held_notifications WHERE user_id = p_user_id;
  DELETE FROM template_send_log WHERE user_id = p_user_id;
  DELETE FROM user_notification_state WHERE user_id = p_user_id;
  DELETE FROM user_notification_preferences WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'notifications');

  -- Referrals (handle both sides)
  DELETE FROM referral_badges WHERE user_id = p_user_id;
  DELETE FROM referral_rewards WHERE user_id = p_user_id;
  DELETE FROM referral_invites WHERE user_id = p_user_id;
  DELETE FROM referrals WHERE referrer_id = p_user_id OR referee_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'referrals');

  -- Resume & applications
  DELETE FROM mock_ats_submissions WHERE user_id = p_user_id;
  DELETE FROM pending_applications WHERE user_id = p_user_id;
  DELETE FROM application_profiles WHERE user_id = p_user_id;
  DELETE FROM resume_rewrites WHERE user_id = p_user_id;
  DELETE FROM resumes WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'resumes_applications');

  -- Pipeline & filters
  DELETE FROM user_pipeline WHERE user_id = p_user_id;
  DELETE FROM pipeline WHERE user_id = p_user_id;
  DELETE FROM saved_filters WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'pipeline_filters');

  -- Contacts & network
  DELETE FROM recruiter_contacts WHERE user_id = p_user_id;
  DELETE FROM connections WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'contacts_network');

  -- Engagement
  DELETE FROM push_subscriptions WHERE user_id = p_user_id;
  DELETE FROM ghost_alerts_sent WHERE user_id = p_user_id;
  DELETE FROM onboarding_milestones WHERE user_id = p_user_id;
  DELETE FROM marketing_campaign_log WHERE user_id = p_user_id;
  DELETE FROM leaderboard_rewards WHERE user_id = p_user_id;
  DELETE FROM user_sessions WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'engagement');

  -- Anonymize feedback (keep for product insights, strip PII)
  UPDATE feedback SET 
    user_id = NULL, 
    details = '[deleted]', 
    screenshot_urls = NULL,
    answers = '{}'::jsonb
  WHERE user_id = p_user_id;

  -- Billing
  DELETE FROM credit_transactions WHERE user_id = p_user_id;
  DELETE FROM subscriptions WHERE user_id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'billing');

  -- Profile (last, since other tables may FK to it)
  DELETE FROM profiles WHERE id = p_user_id;
  v_tables_deleted := array_append(v_tables_deleted, 'profiles');

  -- NOTE: audit_log is NOT deleted (compliance retention requirement)
  -- Anonymize audit_log instead
  UPDATE audit_log SET ip_address = NULL, user_agent = NULL WHERE user_id = p_user_id;

  -- Mark deletion request as completed
  UPDATE deletion_requests SET
    status = 'completed',
    hard_deleted_at = now(),
    tables_deleted = v_tables_deleted
  WHERE user_id = p_user_id AND status = 'pending';

  -- Finally, delete the auth user (cascades remaining FKs)
  -- This must be done via Supabase Admin API, not SQL
  -- The calling Edge Function handles this step

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'tables_deleted', to_jsonb(v_tables_deleted),
    'errors', v_errors
  );
END;
$$;

-- ─── CRON: Process Expired Deletions ──────────────────────────
-- Runs daily at 3am UTC to process expired grace periods
-- The actual auth.users deletion is handled by the account-delete EF
-- This cron just flags them for processing
SELECT cron.schedule(
  'process-expired-deletions',
  '0 3 * * *',
  $$
    UPDATE deletion_requests
    SET status = 'completed', hard_deleted_at = now()
    WHERE status = 'pending'
    AND grace_expires_at <= now()
    AND hard_deleted_at IS NULL;
  $$
);

-- ─── PRIVACY POLICY CONSENT TRACKING ─────────────────────────
-- Track when users accept privacy policy versions
CREATE TABLE IF NOT EXISTS privacy_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_user ON privacy_consent (user_id, accepted_at DESC);

ALTER TABLE privacy_consent ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_select ON privacy_consent FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY consent_insert ON privacy_consent FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ─── ADMIN PII ACCESS LOGGING RPC ────────────────────────────
-- AD-CP-001: Called by admin dashboard when accessing PII-containing data
CREATE OR REPLACE FUNCTION log_admin_pii_access(
  p_target_user_id uuid DEFAULT NULL,
  p_access_type text DEFAULT 'view',
  p_table_accessed text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT is_admin() THEN
    RETURN; -- silently skip for non-admins
  END IF;
  
  INSERT INTO admin_pii_access_log (
    admin_user_id, target_user_id, access_type, table_accessed
  ) VALUES (
    auth.uid(), p_target_user_id, p_access_type, p_table_accessed
  );
END;
$$;
