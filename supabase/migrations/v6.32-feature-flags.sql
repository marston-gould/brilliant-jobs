-- v6.32-feature-flags.sql
-- SA-025: Feature Flags + Experimentation (Phase S5)
-- Percentage rollouts, user segments, variant testing, PostHog experiment integration
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. feature_flags ─────────────────────────────────────────────────────────
-- Central registry of all feature flags and experiments.
-- type: 'boolean' (on/off), 'percentage' (rollout), 'variant' (A/B/multivariate)
-- status: 'draft' | 'active' | 'paused' | 'archived'
-- targeting_rules: JSONB array of rule objects evaluated in order
-- variants: JSONB (only for type='variant') — {name, weight, payload}[]
-- posthog_experiment_id: links to PostHog experiment for analytics

CREATE TABLE IF NOT EXISTS feature_flags (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                   TEXT UNIQUE NOT NULL,        -- e.g. 'new-feed-layout', 'chat-mode-v2'
  name                  TEXT NOT NULL,
  description           TEXT,
  type                  TEXT NOT NULL DEFAULT 'boolean'
                          CHECK (type IN ('boolean', 'percentage', 'variant')),
  status                TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  rollout_percentage    INTEGER DEFAULT 100
                          CHECK (rollout_percentage BETWEEN 0 AND 100),
  variants              JSONB DEFAULT '[]'::jsonb,   -- [{name, weight, payload}]
  targeting_rules       JSONB DEFAULT '[]'::jsonb,   -- [{attribute, operator, value, result}]
  posthog_experiment_id TEXT,                        -- PostHog feature flag key for analytics
  posthog_flag_key      TEXT,                        -- PostHog feature flag key (may differ)
  owner_email           TEXT,                        -- team member responsible for this flag
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at           TIMESTAMPTZ,
  metadata              JSONB DEFAULT '{}'::jsonb    -- scar: extensible metadata bucket
);

-- Prevent duplicate keys (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_key_lower_idx
  ON feature_flags (LOWER(key));

-- Fast status lookups
CREATE INDEX IF NOT EXISTS feature_flags_status_idx
  ON feature_flags (status) WHERE status = 'active';

COMMENT ON TABLE feature_flags IS
  'SA-025: Central feature flag registry. Supports boolean/percentage/variant types with targeting rules.';

-- ── 2. user_segments ─────────────────────────────────────────────────────────
-- Reusable audience segments for targeting rules.
-- segment_rules: JSONB conditions evaluated against user profile attributes
-- Example: {"attribute":"plan","operator":"eq","value":"pro"}

CREATE TABLE IF NOT EXISTS user_segments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT UNIQUE NOT NULL,
  description     TEXT,
  segment_rules   JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_count      INTEGER DEFAULT 0,               -- cached count, updated by agent
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed built-in segments
INSERT INTO user_segments (name, description, segment_rules) VALUES
  ('all-users',     'Every authenticated user',                    '[]'::jsonb),
  ('beta-users',    'Users who opted into beta features',          '[{"attribute":"beta_opt_in","operator":"eq","value":true}]'::jsonb),
  ('pro-plan',      'Users on the Pro plan',                       '[{"attribute":"plan","operator":"eq","value":"pro"}]'::jsonb),
  ('new-users',     'Accounts created in the last 7 days',         '[{"attribute":"account_age_days","operator":"lt","value":7}]'::jsonb),
  ('power-users',   'Users with 30+ pipeline entries',             '[{"attribute":"pipeline_count","operator":"gte","value":30}]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- ── 3. flag_assignments ───────────────────────────────────────────────────────
-- Sticky assignments: once a user is assigned a variant/bucket, it is stable.
-- bucket: 0–99 (deterministic hash of user_id + flag_key → consistent assignment)
-- variant: assigned variant name (for type='variant' flags)
-- overridden: true when a manual override was set (ignores rollout/bucket)

CREATE TABLE IF NOT EXISTS flag_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id       UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket        INTEGER NOT NULL CHECK (bucket BETWEEN 0 AND 99),
  variant       TEXT,                            -- null for boolean/percentage
  is_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  overridden    BOOLEAN NOT NULL DEFAULT FALSE,  -- manual override bypasses rollout
  override_by   TEXT,                            -- admin email who set override
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,                     -- scar: time-bounded experiments
  UNIQUE (flag_id, user_id)
);

CREATE INDEX IF NOT EXISTS flag_assignments_user_idx
  ON flag_assignments (user_id);

CREATE INDEX IF NOT EXISTS flag_assignments_flag_idx
  ON flag_assignments (flag_id);

-- ── 4. flag_evaluation_log ───────────────────────────────────────────────────
-- Audit trail of every flag evaluation for analytics + PostHog sync.
-- Partitioned by month via check constraints (scar: partition by created_at if volume demands).

CREATE TABLE IF NOT EXISTS flag_evaluation_log (
  id            BIGSERIAL PRIMARY KEY,
  flag_id       UUID NOT NULL REFERENCES feature_flags(id) ON DELETE CASCADE,
  flag_key      TEXT NOT NULL,                   -- denormalized for fast querying
  user_id       UUID,                            -- null for anonymous evaluations
  session_id    TEXT,                            -- anonymous session identifier
  is_enabled    BOOLEAN NOT NULL,
  variant       TEXT,
  evaluation_ms INTEGER,                         -- time to evaluate in milliseconds
  source        TEXT NOT NULL DEFAULT 'api'
                  CHECK (source IN ('api', 'sdk', 'middleware', 'gateway')),
  posthog_synced BOOLEAN DEFAULT FALSE,          -- scar: PostHog experiment sync
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index: only recent evaluations (last 90 days hot path)
CREATE INDEX IF NOT EXISTS flag_eval_log_flag_recent_idx
  ON flag_evaluation_log (flag_id, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '90 days';

CREATE INDEX IF NOT EXISTS flag_eval_log_user_idx
  ON flag_evaluation_log (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- ── 5. fn_evaluate_flag ──────────────────────────────────────────────────────
-- Core evaluation logic. Returns: {enabled, variant, bucket, reason}
-- Evaluation order:
--   1. Flag not active → disabled
--   2. Manual override → use override
--   3. Targeting rules → check attribute matches
--   4. Percentage rollout → deterministic bucket check
--   5. Variant assignment → weighted random

CREATE OR REPLACE FUNCTION fn_evaluate_flag(
  p_flag_key    TEXT,
  p_user_id     UUID DEFAULT NULL,
  p_attributes  JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag          feature_flags%ROWTYPE;
  v_assignment    flag_assignments%ROWTYPE;
  v_bucket        INTEGER;
  v_enabled       BOOLEAN := FALSE;
  v_variant       TEXT := NULL;
  v_reason        TEXT := 'not_found';
BEGIN
  -- 1. Load flag
  SELECT * INTO v_flag FROM feature_flags WHERE LOWER(key) = LOWER(p_flag_key);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('enabled', false, 'variant', null, 'bucket', -1, 'reason', 'flag_not_found');
  END IF;

  -- 2. Flag not active
  IF v_flag.status != 'active' THEN
    RETURN jsonb_build_object('enabled', false, 'variant', null, 'bucket', -1, 'reason', v_flag.status);
  END IF;

  -- 3. Check for manual override
  IF p_user_id IS NOT NULL THEN
    SELECT * INTO v_assignment FROM flag_assignments
    WHERE flag_id = v_flag.id AND user_id = p_user_id;

    IF FOUND AND v_assignment.overridden THEN
      RETURN jsonb_build_object(
        'enabled', v_assignment.is_enabled,
        'variant', v_assignment.variant,
        'bucket',  v_assignment.bucket,
        'reason',  'override'
      );
    END IF;
  END IF;

  -- 4. Compute deterministic bucket (0-99) from hash of user_id + flag_key
  IF p_user_id IS NOT NULL THEN
    v_bucket := abs(hashtext(p_user_id::text || v_flag.key)) % 100;
  ELSE
    -- Anonymous: use random bucket (not sticky)
    v_bucket := floor(random() * 100)::integer;
  END IF;

  -- 5. Boolean flag: simple rollout percentage check
  IF v_flag.type = 'boolean' THEN
    v_enabled := (v_bucket < v_flag.rollout_percentage);
    v_reason  := 'rollout';

  -- 6. Percentage flag: same as boolean
  ELSIF v_flag.type = 'percentage' THEN
    v_enabled := (v_bucket < v_flag.rollout_percentage);
    v_reason  := 'percentage_rollout';

  -- 7. Variant flag: assign to bucket ranges by variant weight
  ELSIF v_flag.type = 'variant' THEN
    IF v_bucket < v_flag.rollout_percentage THEN
      -- User is in the experiment; assign variant by cumulative weight
      DECLARE
        v_variants  JSONB := v_flag.variants;
        v_item      JSONB;
        v_cumulative INTEGER := 0;
        v_total_weight INTEGER := 0;
        v_variant_bucket INTEGER;
      BEGIN
        -- Sum all weights
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_variants)
        LOOP
          v_total_weight := v_total_weight + (v_item->>'weight')::integer;
        END LOOP;

        -- Place user in variant
        v_variant_bucket := abs(hashtext('variant:' || p_user_id::text || v_flag.key)) % GREATEST(v_total_weight, 1);
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_variants)
        LOOP
          v_cumulative := v_cumulative + (v_item->>'weight')::integer;
          IF v_variant_bucket < v_cumulative AND v_variant IS NULL THEN
            v_variant := v_item->>'name';
          END IF;
        END LOOP;

        v_enabled := TRUE;
        v_reason  := 'variant_assignment';
      END;
    ELSE
      v_enabled := FALSE;
      v_reason  := 'outside_rollout';
    END IF;
  END IF;

  -- 8. Upsert sticky assignment for authenticated users
  IF p_user_id IS NOT NULL THEN
    INSERT INTO flag_assignments (flag_id, user_id, bucket, variant, is_enabled)
    VALUES (v_flag.id, p_user_id, v_bucket, v_variant, v_enabled)
    ON CONFLICT (flag_id, user_id) DO UPDATE
      SET variant    = EXCLUDED.variant,
          is_enabled = EXCLUDED.is_enabled
    WHERE flag_assignments.overridden = FALSE;
  END IF;

  RETURN jsonb_build_object(
    'enabled', v_enabled,
    'variant', v_variant,
    'bucket',  v_bucket,
    'reason',  v_reason
  );
END;
$$;

-- ── 6. fn_evaluate_all_flags ─────────────────────────────────────────────────
-- Batch evaluation: returns all active flags for a user in a single RPC call.
-- Used by the React SDK to bootstrap flag state on app load.

CREATE OR REPLACE FUNCTION fn_evaluate_all_flags(
  p_user_id     UUID DEFAULT NULL,
  p_attributes  JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag    feature_flags%ROWTYPE;
  v_result  JSONB := '{}'::jsonb;
  v_eval    JSONB;
BEGIN
  FOR v_flag IN
    SELECT * FROM feature_flags WHERE status = 'active' ORDER BY key
  LOOP
    v_eval := fn_evaluate_flag(v_flag.key, p_user_id, p_attributes);
    v_result := v_result || jsonb_build_object(v_flag.key, v_eval);
  END LOOP;

  RETURN v_result;
END;
$$;

-- ── 7. fn_flag_summary ───────────────────────────────────────────────────────
-- Admin dashboard: flag health overview

CREATE OR REPLACE FUNCTION fn_flag_summary()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'total',       COUNT(*),
    'active',      COUNT(*) FILTER (WHERE status = 'active'),
    'draft',       COUNT(*) FILTER (WHERE status = 'draft'),
    'paused',      COUNT(*) FILTER (WHERE status = 'paused'),
    'archived',    COUNT(*) FILTER (WHERE status = 'archived'),
    'boolean',     COUNT(*) FILTER (WHERE type = 'boolean'),
    'percentage',  COUNT(*) FILTER (WHERE type = 'percentage'),
    'variant',     COUNT(*) FILTER (WHERE type = 'variant'),
    'total_assignments', (SELECT COUNT(*) FROM flag_assignments),
    'total_overrides',   (SELECT COUNT(*) FROM flag_assignments WHERE overridden = TRUE),
    'eval_24h',    (SELECT COUNT(*) FROM flag_evaluation_log WHERE created_at > NOW() - INTERVAL '24h'),
    'as_of',       NOW()
  )
  FROM feature_flags;
$$;

-- ── 8. v_flag_dashboard ───────────────────────────────────────────────────────
-- Admin view: flags with assignment counts and recent evaluation activity

CREATE OR REPLACE VIEW v_flag_dashboard AS
SELECT
  f.id,
  f.key,
  f.name,
  f.type,
  f.status,
  f.rollout_percentage,
  f.posthog_experiment_id,
  f.owner_email,
  f.created_at,
  f.updated_at,
  COUNT(DISTINCT a.user_id)                            AS assigned_users,
  COUNT(DISTINCT a.user_id) FILTER (WHERE a.overridden)     AS overridden_users,
  COUNT(el.id) FILTER (WHERE el.created_at > NOW() - INTERVAL '24h') AS evals_24h,
  COUNT(el.id) FILTER (WHERE el.is_enabled AND el.created_at > NOW() - INTERVAL '24h') AS enabled_evals_24h
FROM feature_flags f
LEFT JOIN flag_assignments a ON a.flag_id = f.id
LEFT JOIN flag_evaluation_log el ON el.flag_id = f.id
GROUP BY f.id
ORDER BY f.updated_at DESC;

-- ── 9. updated_at trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_flag_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION fn_update_flag_timestamp();

CREATE TRIGGER trg_user_segments_updated_at
  BEFORE UPDATE ON user_segments
  FOR EACH ROW EXECUTE FUNCTION fn_update_flag_timestamp();

-- ── 10. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE feature_flags       ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_assignments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE flag_evaluation_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_segments        ENABLE ROW LEVEL SECURITY;

-- feature_flags: public read for active flags, admin write
CREATE POLICY "public_read_active_flags" ON feature_flags
  FOR SELECT USING (status = 'active');

CREATE POLICY "admin_manage_flags" ON feature_flags
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- flag_assignments: users see own assignments only
CREATE POLICY "user_read_own_assignments" ON flag_assignments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "service_manage_assignments" ON flag_assignments
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- flag_evaluation_log: service role only
CREATE POLICY "service_manage_eval_log" ON flag_evaluation_log
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- user_segments: admin/service only
CREATE POLICY "service_manage_segments" ON user_segments
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'service_role'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ── 11. Seed initial flags (draft — Marston activates) ───────────────────────
INSERT INTO feature_flags (key, name, description, type, status, rollout_percentage, posthog_flag_key, owner_email)
VALUES
  ('new-feed-layout',      'New Feed Layout',         'Redesigned job feed with inline previews and sort controls',  'percentage', 'draft', 10,  'new-feed-layout',      'marston@brilliantjobs.app'),
  ('chat-mode-v2',         'Chat Mode V2',            'Upgraded chat search with streaming responses and citations',  'boolean',    'draft', 100, 'chat-mode-v2',         'marston@brilliantjobs.app'),
  ('pipeline-ai-signals',  'Pipeline AI Signals',     'AI-generated engagement signals in pipeline stage cards',      'boolean',    'draft', 100, 'pipeline-ai-signals',   'marston@brilliantjobs.app'),
  ('referral-dashboard',   'Referral Dashboard Beta', 'New referral analytics dashboard for beta users',              'percentage', 'draft', 25,  'referral-dashboard',    'marston@brilliantjobs.app'),
  ('resume-rewrite-v2',    'Resume Rewrite V2',       'Multi-pass AI rewrite with diff view and undo',               'variant',    'draft', 50,
    '[{"name":"control","weight":50,"payload":{"version":1}},{"name":"treatment","weight":50,"payload":{"version":2}}]'::jsonb,
    'resume-rewrite-v2',    'marston@brilliantjobs.app')
ON CONFLICT (key) DO NOTHING;

-- Log migration
INSERT INTO agent_action_log (agent_name, action_type, action_data)
VALUES ('migration', 'v6.32_feature_flags', jsonb_build_object(
  'tables_created', ARRAY['feature_flags','user_segments','flag_assignments','flag_evaluation_log'],
  'functions_created', ARRAY['fn_evaluate_flag','fn_evaluate_all_flags','fn_flag_summary'],
  'views_created', ARRAY['v_flag_dashboard'],
  'seed_flags', 5,
  'seed_segments', 5
));
