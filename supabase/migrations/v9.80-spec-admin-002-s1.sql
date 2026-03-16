-- =============================================================
-- SPEC-ADMIN-002-S1: Admin Control Panel — Foundation Schema
-- admin_audit_log, prompt_templates, filter_config, cohort is_archived
-- =============================================================

-- ─── admin_audit_log (§8) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  action      text        NOT NULL,              -- 'user.cohort.reassign', 'cohort.create', etc.
  target_type text        NOT NULL,              -- 'user' | 'cohort' | 'content' | 'filter' | 'prompt' | 'billing'
  target_id   uuid,
  before      jsonb,                             -- snapshot before mutation
  after       jsonb,                             -- snapshot after mutation
  reason      text,                              -- required for destructive actions
  ip_address  inet,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target  ON admin_audit_log (target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON admin_audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log (created_at DESC);

-- RLS: SELECT for admin only. No INSERT/UPDATE/DELETE except service_role.
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_admin_read ON admin_audit_log;
CREATE POLICY audit_log_admin_read ON admin_audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
  );
-- service_role bypasses RLS
GRANT SELECT ON admin_audit_log TO authenticated;
GRANT ALL ON admin_audit_log TO service_role;

COMMENT ON TABLE admin_audit_log IS
  'SPEC-ADMIN-002 §8: Immutable audit trail. Written by service_role via EFs. No direct admin writes.';


-- ─── prompt_templates (§7.2) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prompt_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        UNIQUE NOT NULL,       -- 'job_scorer_system', 'resume_rewrite_user'
  feature      text        NOT NULL,              -- 'job_scoring' | 'resume_rewrite' | etc.
  role         text        NOT NULL DEFAULT 'user' CHECK (role IN ('system','user','assistant')),
  template     text        NOT NULL,              -- prompt text with {{variable}} placeholders
  model        text,                              -- overrides EF default when set
  max_tokens   integer     CHECK (max_tokens > 0),
  temperature  float       CHECK (temperature >= 0 AND temperature <= 1),
  version      integer     NOT NULL DEFAULT 1,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by   uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_feature ON prompt_templates (feature, is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_name    ON prompt_templates (name);

CREATE OR REPLACE FUNCTION fn_prompt_templates_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_prompt_templates_updated ON prompt_templates;
CREATE TRIGGER trg_prompt_templates_updated
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW EXECUTE FUNCTION fn_prompt_templates_updated_at();

ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prompt_templates_admin_all ON prompt_templates;
CREATE POLICY prompt_templates_admin_all ON prompt_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
DROP POLICY IF EXISTS prompt_templates_read ON prompt_templates;
CREATE POLICY prompt_templates_read ON prompt_templates
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON prompt_templates TO authenticated;
GRANT ALL ON prompt_templates TO service_role;

COMMENT ON TABLE prompt_templates IS
  'SPEC-ADMIN-002 §7.2: AI prompt templates editable by admin. EFs read active version at runtime.';


-- ─── filter_config (§7.1) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS filter_config (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key           text        UNIQUE NOT NULL,      -- 'salary_range', 'job_type', etc.
  label         text        NOT NULL,
  type          text        NOT NULL CHECK (type IN ('range','select','toggle','multi-select')),
  options       jsonb,                            -- [{value, label}] for select/multi-select
  default_value jsonb,
  weight        float       NOT NULL DEFAULT 1.0 CHECK (weight >= 0),
  is_active     boolean     NOT NULL DEFAULT true,
  sort_order    integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_filter_config_active ON filter_config (is_active, sort_order);

CREATE OR REPLACE FUNCTION fn_filter_config_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_filter_config_updated ON filter_config;
CREATE TRIGGER trg_filter_config_updated
  BEFORE UPDATE ON filter_config
  FOR EACH ROW EXECUTE FUNCTION fn_filter_config_updated_at();

ALTER TABLE filter_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS filter_config_admin_all ON filter_config;
CREATE POLICY filter_config_admin_all ON filter_config FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin')));
DROP POLICY IF EXISTS filter_config_read ON filter_config;
CREATE POLICY filter_config_read ON filter_config
  FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT ON filter_config TO authenticated;
GRANT ALL ON filter_config TO service_role;

COMMENT ON TABLE filter_config IS
  'SPEC-ADMIN-002 §7.1: Job feed filter definitions, admin-editable without code deploy.';


-- ─── cohort_tiers: is_archived column (§4.3) ─────────────────────────────────
ALTER TABLE cohort_tiers
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cohort_tiers_archived ON cohort_tiers (is_archived);

COMMENT ON COLUMN cohort_tiers.is_archived IS
  'SPEC-ADMIN-002 §4.3: Soft-delete. Archived cohorts hidden from list by default.';


-- ─── Admin EF rate limit seed ─────────────────────────────────────────────────
-- Ensure ef_rate_limits table exists (may be from prior migration)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ef_rate_limits') THEN
    INSERT INTO ef_rate_limits (function_name, max_calls_per_minute)
    VALUES
      ('admin-user-manager',   100),
      ('admin-cohort-manager', 100),
      ('admin-credit-action',  100)
    ON CONFLICT (function_name) DO NOTHING;
  END IF;
END; $$;

