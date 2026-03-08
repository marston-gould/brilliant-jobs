-- SA-020: CrewAI Agents 4–5 — Cost Guardian + User Support
-- ADR-05: CrewAI Architecture
-- Depends on: v6.24-crewai-agent-framework.sql (SA-010), v6.26-agent-graduation.sql (SA-012)
--
-- Creates:
--   1. vendor_cost_budgets table — per-vendor monthly budget + throttle thresholds
--   2. canny_sync_log table — mirrors Canny support requests for triage
--   3. agent_config rows for cost-guardian and user-support
--   4. api_consumers entries for both agents
--   5. agent_credentials links
--   6. pg_cron schedules (cost-guardian hourly, user-support every 15min)
--   7. fn_cost_guardian_summary() — CrewAI-friendly cost health function
--   8. fn_user_support_summary() — triage queue summary for admin panel

-- ============================================================
-- 1. VENDOR COST BUDGETS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendor_cost_budgets (
  vendor          TEXT PRIMARY KEY,  -- e.g. 'anthropic', 'supabase', 'vercel', 'resend', 'posthog', 'cloudflare', 'github'
  display_name    TEXT NOT NULL,
  monthly_budget  NUMERIC(10,2) NOT NULL DEFAULT 0,   -- USD ceiling
  warn_pct        INTEGER NOT NULL DEFAULT 80,        -- warn when spend reaches this % of budget
  throttle_pct    INTEGER NOT NULL DEFAULT 95,        -- throttle when spend reaches this %
  hard_stop_pct   INTEGER NOT NULL DEFAULT 100,       -- kill switch at this %
  track_via       TEXT NOT NULL DEFAULT 'manual',     -- 'vault_api' | 'manual' | 'stripe_webhook'
  api_endpoint    TEXT,                               -- optional vendor API for automated pull
  notes           TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vendor_cost_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read vendor_cost_budgets"
  ON public.vendor_cost_budgets FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin insert vendor_cost_budgets"
  ON public.vendor_cost_budgets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin update vendor_cost_budgets"
  ON public.vendor_cost_budgets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed known vendors with conservative defaults
INSERT INTO public.vendor_cost_budgets
  (vendor, display_name, monthly_budget, warn_pct, throttle_pct, hard_stop_pct, track_via, notes)
VALUES
  ('anthropic',   'Anthropic API',         150.00, 80, 95, 100, 'vault_api',       'LLM enrichment + scoring. Throttle = skip CC enrichment first.'),
  ('supabase',    'Supabase',               50.00, 80, 95, 100, 'manual',          'Compute + storage + egress. Manual pull from billing dashboard.'),
  ('vercel',      'Vercel',                 30.00, 80, 95, 100, 'manual',          'Serverless + bandwidth. Manual pull from billing dashboard.'),
  ('resend',      'Resend',                 20.00, 80, 95, 100, 'vault_api',       'Transactional email. Resend API has /domains/stats.'),
  ('posthog',     'PostHog',                25.00, 80, 95, 100, 'manual',          'Analytics + session replay. Manual pull from usage page.'),
  ('cloudflare',  'Cloudflare',             10.00, 80, 95, 100, 'manual',          'DNS + WAF + CDN. Manual pull.'),
  ('github',      'GitHub',                 10.00, 80, 95, 100, 'manual',          'Actions minutes. Manual pull.'),
  ('canny',       'Canny',                  30.00, 80, 95, 100, 'manual',          'User feedback + changelog. Manual pull.')
ON CONFLICT (vendor) DO NOTHING;

-- ============================================================
-- 2. CANNY SYNC LOG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.canny_sync_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  canny_post_id   TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  author_email    TEXT,
  author_name     TEXT,
  board_name      TEXT,
  status          TEXT NOT NULL DEFAULT 'open',       -- open | under_review | planned | in_progress | complete | closed
  votes           INTEGER NOT NULL DEFAULT 0,
  category        TEXT,                               -- classified by agent: bug | feature_request | billing | account | general
  triage_priority TEXT NOT NULL DEFAULT 'unset',     -- unset | low | medium | high | urgent
  triage_notes    TEXT,                               -- agent-generated triage reasoning
  triage_at       TIMESTAMPTZ,
  agent_suggested_response TEXT,                      -- draft response for Marston to review/send
  marston_reviewed BOOLEAN NOT NULL DEFAULT false,
  created_at_canny TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.canny_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read canny_sync_log"
  ON public.canny_sync_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin all canny_sync_log"
  ON public.canny_sync_log FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_canny_sync_triage_priority ON public.canny_sync_log(triage_priority, synced_at DESC);
CREATE INDEX IF NOT EXISTS idx_canny_sync_status ON public.canny_sync_log(status);
CREATE INDEX IF NOT EXISTS idx_canny_sync_reviewed ON public.canny_sync_log(marston_reviewed) WHERE marston_reviewed = false;

-- ============================================================
-- 3. COST GUARDIAN SUMMARY FUNCTION (for CrewAI orchestrator)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_cost_guardian_summary()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'generated_at', now(),
    'current_month', to_char(now(), 'YYYY-MM'),
    'vendor_status', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'vendor',          b.vendor,
          'display_name',    b.display_name,
          'budget',          b.monthly_budget,
          'spent',           COALESCE(monthly_spent.amount, 0),
          'spent_pct',       CASE WHEN b.monthly_budget > 0
                               THEN ROUND(COALESCE(monthly_spent.amount, 0) / b.monthly_budget * 100, 1)
                               ELSE 0 END,
          'warn_pct',        b.warn_pct,
          'throttle_pct',    b.throttle_pct,
          'hard_stop_pct',   b.hard_stop_pct,
          'status',          CASE
                               WHEN b.monthly_budget = 0 THEN 'no_budget'
                               WHEN COALESCE(monthly_spent.amount, 0) / NULLIF(b.monthly_budget, 0) * 100 >= b.hard_stop_pct THEN 'hard_stop'
                               WHEN COALESCE(monthly_spent.amount, 0) / NULLIF(b.monthly_budget, 0) * 100 >= b.throttle_pct THEN 'throttle'
                               WHEN COALESCE(monthly_spent.amount, 0) / NULLIF(b.monthly_budget, 0) * 100 >= b.warn_pct THEN 'warn'
                               ELSE 'ok'
                             END
        ) ORDER BY b.vendor
      )
      FROM public.vendor_cost_budgets b
      LEFT JOIN (
        SELECT vendor, SUM(amount) AS amount
        FROM public.vendor_cost_log
        WHERE month = to_char(now(), 'YYYY-MM')
        GROUP BY vendor
      ) monthly_spent USING (vendor)
    ),
    'total_budget',  (SELECT SUM(monthly_budget) FROM public.vendor_cost_budgets),
    'total_spent',   (SELECT COALESCE(SUM(amount), 0) FROM public.vendor_cost_log WHERE month = to_char(now(), 'YYYY-MM')),
    'alerts',        (
      SELECT jsonb_agg(
        jsonb_build_object('vendor', b.vendor, 'spent_pct',
          ROUND(COALESCE(ms.amount, 0) / NULLIF(b.monthly_budget, 0) * 100, 1))
      )
      FROM public.vendor_cost_budgets b
      LEFT JOIN (
        SELECT vendor, SUM(amount) AS amount FROM public.vendor_cost_log
        WHERE month = to_char(now(), 'YYYY-MM') GROUP BY vendor
      ) ms USING (vendor)
      WHERE b.monthly_budget > 0
        AND COALESCE(ms.amount, 0) / NULLIF(b.monthly_budget, 0) * 100 >= b.warn_pct
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_cost_guardian_summary() TO service_role;

-- ============================================================
-- 4. USER SUPPORT SUMMARY FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_user_support_summary()
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'generated_at',        now(),
    'total_open',          (SELECT COUNT(*) FROM public.canny_sync_log WHERE status = 'open'),
    'unreviewed_by_marston',(SELECT COUNT(*) FROM public.canny_sync_log WHERE marston_reviewed = false),
    'awaiting_triage',     (SELECT COUNT(*) FROM public.canny_sync_log WHERE triage_priority = 'unset'),
    'urgent',              (SELECT COUNT(*) FROM public.canny_sync_log WHERE triage_priority = 'urgent' AND marston_reviewed = false),
    'high',                (SELECT COUNT(*) FROM public.canny_sync_log WHERE triage_priority = 'high' AND marston_reviewed = false),
    'by_category',         (
      SELECT jsonb_object_agg(COALESCE(category, 'uncategorized'), cnt)
      FROM (SELECT category, COUNT(*) AS cnt FROM public.canny_sync_log WHERE status = 'open' GROUP BY category) t
    ),
    'recent_urgent',       (
      SELECT jsonb_agg(
        jsonb_build_object('id', id, 'title', title, 'votes', votes, 'triage_priority', triage_priority, 'category', category)
        ORDER BY votes DESC, synced_at DESC
      )
      FROM public.canny_sync_log
      WHERE triage_priority IN ('urgent', 'high') AND marston_reviewed = false
      LIMIT 10
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.fn_user_support_summary() TO service_role;

-- ============================================================
-- 5. AGENT CONFIG: COST GUARDIAN (Agent 4)
-- ============================================================
INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit, schedule_cron)
VALUES (
  'cost-guardian',
  'Cost Guardian Agent',
  'Monitors spend across all 12+ vendor services against monthly budgets. Alerts when spend approaches warn/throttle/hard-stop thresholds. Logs recommended actions. In observe mode: logs findings only, never throttles automatically.',
  'cost_guardian',
  'observe',
  true,
  jsonb_build_object(
    'checks', jsonb_build_array(
      'budget_status',         -- vendor_cost_budgets vs vendor_cost_log comparison
      'spend_velocity',        -- month-to-date run rate projection
      'anthropic_token_rate',  -- high-cost AI calls vs budget
      'anomaly_detection'      -- day-over-day spend spike detection
    ),
    'velocity_projection_days', 30,  -- Project full-month spend from MTD
    'spike_threshold_pct', 200,      -- Alert if today spend > 2x yesterday
    'lookback_days', 7,              -- Velocity window
    'ai_calls_per_check', 0          -- No AI calls in observe mode
  ),
  '{"requests_per_min": 2, "ai_calls_per_hour": 0}'::jsonb,
  '0 * * * *'  -- Every hour on the hour
)
ON CONFLICT (id) DO NOTHING;

-- Register API consumer
INSERT INTO api_consumers (name, description, api_key_hash, rate_limit_override)
VALUES (
  'crewai-cost-guardian',
  'CrewAI Cost Guardian Agent — observe mode',
  encode(sha256('crewai-agent-cost-guardian-key-placeholder'::bytea), 'hex'),
  '{"requests_per_min": 2, "ai_calls_per_hour": 0}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_credentials (agent_id, api_key_hash, consumer_name, rate_tier)
VALUES (
  'cost-guardian',
  encode(sha256('crewai-agent-cost-guardian-key-placeholder'::bytea), 'hex'),
  'crewai-cost-guardian',
  'agent'
)
ON CONFLICT (agent_id) DO NOTHING;

-- pg_cron: run cost-guardian every hour
SELECT cron.schedule(
  'cost-guardian-hourly',
  '0 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/crewai-cost-guardian',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb,
    body := '{"action": "check"}'::jsonb
  )$$
);

-- ============================================================
-- 6. AGENT CONFIG: USER SUPPORT (Agent 5)
-- ============================================================
INSERT INTO agent_config (id, display_name, description, agent_type, trust_level, enabled, config, rate_limit, schedule_cron)
VALUES (
  'user-support',
  'User Support Agent',
  'Syncs Canny support requests and triages Tier 1 tickets. Classifies by category (bug/feature/billing/account), assigns priority, drafts suggested responses. All responses require Marston review before sending — agent never sends directly.',
  'user_support',
  'observe',
  true,
  jsonb_build_object(
    'checks', jsonb_build_array(
      'canny_sync',       -- Pull latest posts from Canny API
      'triage',           -- Classify + prioritize new/unreviewed items
      'draft_responses'   -- Generate suggested responses for high-priority items
    ),
    'canny_board_ids',       jsonb_build_array('general', 'bugs', 'features'),
    'triage_ai_enabled',     true,          -- Use Claude for triage + draft responses
    'ai_calls_per_run',      10,            -- Max Anthropic calls per execution
    'draft_for_priority',    jsonb_build_array('urgent', 'high'),  -- Only draft for these priorities
    'max_items_per_run',     25,            -- Cap to avoid runaway costs
    'sync_since_days',       7              -- How far back to sync on first run
  ),
  '{"requests_per_min": 5, "ai_calls_per_hour": 20}'::jsonb,
  '*/15 * * * *'  -- Every 15 minutes
)
ON CONFLICT (id) DO NOTHING;

-- Register API consumer
INSERT INTO api_consumers (name, description, api_key_hash, rate_limit_override)
VALUES (
  'crewai-user-support',
  'CrewAI User Support Agent — observe mode (triage + draft, Marston reviews before send)',
  encode(sha256('crewai-agent-user-support-key-placeholder'::bytea), 'hex'),
  '{"requests_per_min": 5, "ai_calls_per_hour": 20}'::jsonb
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO agent_credentials (agent_id, api_key_hash, consumer_name, rate_tier)
VALUES (
  'user-support',
  encode(sha256('crewai-agent-user-support-key-placeholder'::bytea), 'hex'),
  'crewai-user-support',
  'agent'
)
ON CONFLICT (agent_id) DO NOTHING;

-- pg_cron: run user-support every 15 minutes
SELECT cron.schedule(
  'user-support-15min',
  '*/15 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/crewai-user-support',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb,
    body := '{"action": "sync_and_triage"}'::jsonb
  )$$
);

-- agent_action_log: record migration
INSERT INTO agent_action_log (agent_id, action_type, action_data, severity, executed)
VALUES (
  'system',
  'migration_applied',
  jsonb_build_object(
    'migration', 'v6.29-crewai-agents-4-5.sql',
    'agents_created', jsonb_build_array('cost-guardian', 'user-support'),
    'tables_created', jsonb_build_array('vendor_cost_budgets', 'canny_sync_log'),
    'functions_created', jsonb_build_array('fn_cost_guardian_summary', 'fn_user_support_summary'),
    'cron_schedules', jsonb_build_array('cost-guardian-hourly', 'user-support-15min')
  ),
  'ok',
  false
);
