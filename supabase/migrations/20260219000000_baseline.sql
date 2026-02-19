-- =============================================================
-- B9: Baseline Migration — Brilliant Jobs Schema
-- Date: 2026-02-19
-- Purpose: Documents the complete schema state after Phase A
-- WARNING: This is a BASELINE — do not run on the production database.
--          It exists for documentation and new environment setup.
-- =============================================================

-- Phase A items already applied to production:
-- A1: RLS on ats_jobs (migration 001)
-- A2: RLS on all 20 tables + 6 gap-fill policies
-- A3: role + plan columns on profiles
-- A4: audit_log table
-- A5: Idempotency keys on notification tables
-- A9: Security headers (vercel.json, not SQL)
-- A10: DOMPurify (dashboard.html, not SQL)
-- A11: plans + subscriptions tables
-- A12: check_feature() RPC
-- A13: PostHog (dashboard.html, not SQL)

-- Phase B items applied:
-- B10: 7 missing indexes

-- ─── PLANS TABLE ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  price_monthly_cents int,
  price_yearly_cents int,
  max_filters int DEFAULT 1,
  max_resumes int DEFAULT 1,
  boolean_operators boolean DEFAULT false,
  sms_notifications boolean DEFAULT false,
  auto_apply boolean DEFAULT false,
  api_access boolean DEFAULT false,
  max_api_calls_daily int DEFAULT 0,
  network_intelligence boolean DEFAULT false,
  resume_grading boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

INSERT INTO plans (id, name, price_monthly_cents, price_yearly_cents, max_filters, max_resumes, boolean_operators, sms_notifications, auto_apply, api_access, max_api_calls_daily, network_intelligence, resume_grading) VALUES
  ('free', 'Free', 0, 0, 1, 1, false, false, false, false, 0, false, false),
  ('pro', 'Pro', 1999, 19990, 10, 5, true, true, true, false, 0, true, true),
  ('enterprise', 'Enterprise', 4999, 49990, 999, 99, true, true, true, true, 10000, true, true)
ON CONFLICT (id) DO NOTHING;

-- ─── SUBSCRIPTIONS TABLE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  plan_id text REFERENCES plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ─── AUDIT LOG TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users,
  action text NOT NULL,
  resource_type text,
  resource_id text,
  details jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- ─── PROFILES ADDITIONS (A3) ──────────────────────────────
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role text DEFAULT 'user' CHECK (role IN ('user', 'admin', 'service'));
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));

-- ─── NOTIFICATION IDEMPOTENCY (A5) ────────────────────────
-- ALTER TABLE notification_log ADD COLUMN IF NOT EXISTS idempotency_key text;
-- ALTER TABLE notification_actions ADD CONSTRAINT unique_user_job_action UNIQUE (user_id, job_id, action_type);

-- ─── HELPER FUNCTIONS ──────────────────────────────────────
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION check_feature(p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_plan plans;
  v_count int;
  v_limit int;
  v_allowed boolean;
  v_reason text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Not authenticated');
  END IF;

  SELECT p.* INTO v_plan FROM plans p
  JOIN subscriptions s ON s.plan_id = p.id
  WHERE s.user_id = v_user_id AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT p.* INTO v_plan FROM plans p
    JOIN profiles pr ON pr.plan = p.id
    WHERE pr.id = v_user_id;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'free';
  END IF;

  CASE p_feature
    WHEN 'create_filter' THEN
      SELECT COALESCE(jsonb_array_length(user_data->'saved_filters'), 0) INTO v_count
      FROM profiles WHERE id = v_user_id;
      v_limit := v_plan.max_filters;
      v_allowed := v_count < v_limit;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Filter limit reached (' || v_count || '/' || v_limit || '). Upgrade for more.' END;
    WHEN 'upload_resume' THEN
      SELECT count(*) INTO v_count FROM resumes WHERE user_id = v_user_id;
      v_limit := v_plan.max_resumes;
      v_allowed := v_count < v_limit;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Resume limit reached (' || v_count || '/' || v_limit || '). Upgrade for more.' END;
    WHEN 'boolean_operators' THEN
      v_allowed := v_plan.boolean_operators;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Boolean operators require Pro plan' END;
    WHEN 'sms_notifications' THEN
      v_allowed := v_plan.sms_notifications;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'SMS notifications require Pro plan' END;
    WHEN 'auto_apply' THEN
      v_allowed := v_plan.auto_apply;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Auto-apply requires Pro plan' END;
    WHEN 'api_access' THEN
      v_allowed := v_plan.api_access;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'API access requires Enterprise plan' END;
    WHEN 'network_intelligence' THEN
      v_allowed := v_plan.network_intelligence;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Network intelligence requires Pro plan' END;
    WHEN 'resume_grading' THEN
      v_allowed := v_plan.resume_grading;
      v_reason := CASE WHEN v_allowed THEN NULL ELSE 'Resume grading requires Pro plan' END;
    ELSE
      v_allowed := false;
      v_reason := 'Unknown feature: ' || p_feature;
  END CASE;

  RETURN jsonb_build_object(
    'allowed', v_allowed,
    'plan', v_plan.id,
    'feature', p_feature,
    'reason', v_reason,
    'current', v_count,
    'limit', v_limit,
    'upgrade', NOT v_allowed
  );
END;
$$;

-- ─── B10 INDEXES ───────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ats_jobs_location_structured ON ats_jobs (loc_country, loc_state, loc_city) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_ats_jobs_source_status ON ats_jobs (ats_source, status);
CREATE INDEX IF NOT EXISTS idx_connections_user_company ON connections (user_id, parsed_company);
CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes (user_id);
CREATE INDEX IF NOT EXISTS idx_companies_refresh_active ON ats_companies (last_checked ASC NULLS FIRST, source) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_status ON notification_log (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles (plan);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log (resource_type, resource_id);

-- ─── RLS POLICIES (reference only — all applied live) ──────
-- See ROADMAP.md Sprint 1 (A1/A2) for full policy listing
-- 20 tables, 38+ policies, all RLS enabled
