-- v8.48: Credit Tier Model
-- Free: 1 lifetime use per paid feature
-- Starter: 100 credits/month included, $0.15 PAYG
-- Pro: 300 credits/month included, $0.10 PAYG

-- ─── 1. ADD STARTER PLAN ──────────────────────────────────────────────────
INSERT INTO plans (id, name, price_monthly_cents, price_yearly_cents, max_filters, max_resumes, boolean_operators, sms_notifications, auto_apply, api_access, max_api_calls_daily, network_intelligence, resume_grading)
VALUES ('starter', 'Starter', 2000, 20000, 10, 5, true, true, false, false, 0, false, true)
ON CONFLICT (id) DO UPDATE SET
  name                 = EXCLUDED.name,
  price_monthly_cents  = EXCLUDED.price_monthly_cents,
  price_yearly_cents   = EXCLUDED.price_yearly_cents,
  max_filters          = EXCLUDED.max_filters,
  max_resumes          = EXCLUDED.max_resumes,
  boolean_operators    = EXCLUDED.boolean_operators,
  sms_notifications    = EXCLUDED.sms_notifications,
  resume_grading       = EXCLUDED.resume_grading;

-- ─── 2. FREE TIER LIFETIME USAGE TRACKING ────────────────────────────────
CREATE TABLE IF NOT EXISTS free_tier_feature_usage (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  feature    text NOT NULL,
  used_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, feature)
);

CREATE INDEX IF NOT EXISTS idx_ftfu_user_feature ON free_tier_feature_usage (user_id, feature);

ALTER TABLE free_tier_feature_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "free_tier_usage_user_read" ON free_tier_feature_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "free_tier_usage_service_all" ON free_tier_feature_usage
  FOR ALL USING (auth.role() = 'service_role');

-- ─── 3. UPDATE check_entitlement TO HANDLE FREE LIFETIME USES ─────────────
CREATE OR REPLACE FUNCTION check_entitlement(
  p_user_id    uuid,
  p_feature    text,
  p_usage_count int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan          plans%ROWTYPE;
  v_sub           subscriptions%ROWTYPE;
  v_allowed       boolean := false;
  v_reason        text    := null;
  v_limit         int     := 0;
  v_count         int     := p_usage_count;
  v_free_used     boolean := false;
  v_plan_id       text;
BEGIN
  -- Get subscription (default free)
  SELECT * INTO v_sub FROM subscriptions WHERE user_id = p_user_id AND status = 'active' LIMIT 1;
  v_plan_id := COALESCE(v_sub.plan_id, 'free');

  SELECT * INTO v_plan FROM plans WHERE id = v_plan_id;
  IF NOT FOUND THEN
    SELECT * INTO v_plan FROM plans WHERE id = 'free';
  END IF;

  -- Route by feature
  CASE p_feature

    WHEN 'filters' THEN
      v_limit   := v_plan.max_filters;
      v_allowed := v_plan.max_filters IS NULL OR v_count < v_plan.max_filters;
      v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Saved filter limit reached (' || v_plan.max_filters || '). Upgrade for more.' END;

    WHEN 'resumes' THEN
      v_limit   := v_plan.max_resumes;
      v_allowed := v_plan.max_resumes IS NULL OR v_count < v_plan.max_resumes;
      v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Resume limit reached (' || v_plan.max_resumes || '). Upgrade for more.' END;

    WHEN 'resume_grading' THEN
      IF v_plan_id = 'free' THEN
        -- 1 lifetime use
        SELECT EXISTS(SELECT 1 FROM free_tier_feature_usage WHERE user_id = p_user_id AND feature = 'resume_grading')
          INTO v_free_used;
        v_allowed := NOT v_free_used;
        v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Free plan includes 1 resume score. Upgrade to Starter or Pro for unlimited.' END;
        v_limit   := 1;
        v_count   := CASE WHEN v_free_used THEN 1 ELSE 0 END;
      ELSE
        v_allowed := v_plan.resume_grading;
        v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Resume grading requires Starter or Pro plan.' END;
      END IF;

    WHEN 'ai_rewrite' THEN
      IF v_plan_id = 'free' THEN
        SELECT EXISTS(SELECT 1 FROM free_tier_feature_usage WHERE user_id = p_user_id AND feature = 'ai_rewrite')
          INTO v_free_used;
        v_allowed := NOT v_free_used;
        v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Free plan includes 1 AI rewrite. Upgrade to Starter or Pro for unlimited.' END;
        v_limit   := 1;
        v_count   := CASE WHEN v_free_used THEN 1 ELSE 0 END;
      ELSE
        v_allowed := v_plan.resume_grading; -- reuse resume_grading flag for now
        v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'AI rewrite requires Starter or Pro plan.' END;
      END IF;

    WHEN 'auto_apply' THEN
      v_allowed := v_plan.auto_apply;
      v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Auto-apply requires Pro plan.' END;

    WHEN 'api_access' THEN
      v_allowed := v_plan.api_access;
      v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'API access requires Enterprise plan.' END;

    WHEN 'network_intelligence' THEN
      v_allowed := v_plan.network_intelligence;
      v_reason  := CASE WHEN v_allowed THEN NULL ELSE 'Network intelligence requires Pro plan.' END;

    ELSE
      v_allowed := false;
      v_reason  := 'Unknown feature: ' || p_feature;
  END CASE;

  RETURN jsonb_build_object(
    'allowed',  v_allowed,
    'plan',     v_plan_id,
    'feature',  p_feature,
    'reason',   v_reason,
    'current',  v_count,
    'limit',    v_limit,
    'upgrade',  NOT v_allowed,
    'free_lifetime', (v_plan_id = 'free')
  );
END;
$$;

-- ─── 4. FUNCTION: record free-tier use (called by EFs after successful use) ──
CREATE OR REPLACE FUNCTION record_free_tier_use(p_user_id uuid, p_feature text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO free_tier_feature_usage (user_id, feature)
  VALUES (p_user_id, p_feature)
  ON CONFLICT (user_id, feature) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION check_entitlement(uuid, text, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION record_free_tier_use(uuid, text) TO service_role;
