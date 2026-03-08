-- ============================================================================
-- v6.38 — Deployment Command Center & Rollback Management (BI-05)
-- ============================================================================
-- Tables:
--   - rollback_events: track rollback initiations, status, and outcomes
--   - deploy_approvals: approval workflow for production deploys
-- Views:
--   - v_command_center_summary: unified status from all BI tables
--   - v_rollback_history: rollback timeline with deploy context
-- Functions:
--   - fn_command_center_data: aggregates all BI views for admin dashboard
--   - fn_initiate_rollback: creates rollback event + H-02 event bus
-- RLS: admin read, service write on both tables
-- Hooks: H-02 event bus for rollback notifications
-- Scars: S-12 metadata JSONB on both tables for future extensibility
-- ============================================================================

-- ── Table: rollback_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rollback_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_id       UUID REFERENCES public.deploy_events(id) ON DELETE SET NULL,
  surface         TEXT NOT NULL CHECK (surface IN ('dashboard','landing','admin','extension','edge-functions','database','infrastructure')),
  initiated_by    TEXT NOT NULL DEFAULT 'system',
  reason          TEXT NOT NULL DEFAULT '',
  rollback_to_sha TEXT,
  rollback_to_tag TEXT,
  status          TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated','in_progress','completed','failed','cancelled')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  duration_ms     INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER * 1000
      ELSE NULL
    END
  ) STORED,
  notes           TEXT,
  scar_meta       JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rollback_events IS 'BI-05: Tracks rollback initiations, progress, and outcomes';
COMMENT ON COLUMN public.rollback_events.scar_meta IS 'S-12: Reserved for future rollback metadata extensions';

-- ── Table: deploy_approvals ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deploy_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deploy_id       UUID REFERENCES public.deploy_events(id) ON DELETE CASCADE,
  surface         TEXT NOT NULL CHECK (surface IN ('dashboard','landing','admin','extension','edge-functions','database','infrastructure')),
  requested_by    TEXT NOT NULL,
  approved_by     TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','auto_approved')),
  request_reason  TEXT,
  reject_reason   TEXT,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  scar_meta       JSONB DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.deploy_approvals IS 'BI-05: Deployment approval workflow tracking';
COMMENT ON COLUMN public.deploy_approvals.scar_meta IS 'S-12: Reserved for future approval policy extensions';

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_rollback_events_surface ON public.rollback_events(surface);
CREATE INDEX IF NOT EXISTS idx_rollback_events_status ON public.rollback_events(status);
CREATE INDEX IF NOT EXISTS idx_rollback_events_started_at ON public.rollback_events(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rollback_events_deploy_id ON public.rollback_events(deploy_id);

CREATE INDEX IF NOT EXISTS idx_deploy_approvals_status ON public.deploy_approvals(status);
CREATE INDEX IF NOT EXISTS idx_deploy_approvals_surface ON public.deploy_approvals(surface);
CREATE INDEX IF NOT EXISTS idx_deploy_approvals_requested_at ON public.deploy_approvals(requested_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.rollback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deploy_approvals ENABLE ROW LEVEL SECURITY;

-- Admin read
CREATE POLICY "rollback_events_admin_read" ON public.rollback_events
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "rollback_events_service_write" ON public.rollback_events
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "deploy_approvals_admin_read" ON public.deploy_approvals
  FOR SELECT USING (
    auth.role() = 'service_role' OR
    (auth.role() = 'authenticated' AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    ))
  );

CREATE POLICY "deploy_approvals_service_write" ON public.deploy_approvals
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── View: v_command_center_summary ──────────────────────────────────────────
-- Unified status pulling from all BI tables for the command center dashboard

CREATE OR REPLACE VIEW public.v_command_center_summary AS
WITH health AS (
  SELECT * FROM public.fn_deployment_health_score()
),
active_alerts AS (
  SELECT
    COUNT(*) FILTER (WHERE status = 'active') AS total_active,
    COUNT(*) FILTER (WHERE status = 'active' AND severity = 'critical') AS critical_count,
    COUNT(*) FILTER (WHERE status = 'active' AND severity = 'warning') AS warning_count,
    COUNT(*) FILTER (WHERE status = 'active' AND severity = 'info') AS info_count
  FROM public.deploy_alert_history
  WHERE status IN ('active','acknowledged')
),
drift AS (
  SELECT
    COUNT(*) FILTER (WHERE has_drift = TRUE) AS drift_count,
    COUNT(*) AS total_surfaces
  FROM public.v_environment_drift
),
recent_deploys AS (
  SELECT
    COUNT(*) AS deploy_count_24h,
    COUNT(*) FILTER (WHERE status = 'success') AS success_24h,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_24h
  FROM public.deploy_events
  WHERE created_at > now() - INTERVAL '24 hours'
),
pending_approvals AS (
  SELECT COUNT(*) AS pending_count
  FROM public.deploy_approvals
  WHERE status = 'pending' AND (expires_at IS NULL OR expires_at > now())
),
recent_rollbacks AS (
  SELECT
    COUNT(*) AS rollback_count_7d,
    COUNT(*) FILTER (WHERE status = 'completed') AS rollback_success_7d,
    COUNT(*) FILTER (WHERE status = 'failed') AS rollback_failed_7d
  FROM public.rollback_events
  WHERE started_at > now() - INTERVAL '7 days'
)
SELECT
  h.score AS health_score,
  h.grade AS health_grade,
  aa.total_active AS active_alerts,
  aa.critical_count AS critical_alerts,
  aa.warning_count AS warning_alerts,
  aa.info_count AS info_alerts,
  d.drift_count,
  d.total_surfaces,
  rd.deploy_count_24h,
  rd.success_24h AS deploy_success_24h,
  rd.failed_24h AS deploy_failed_24h,
  pa.pending_count AS pending_approvals,
  rr.rollback_count_7d,
  rr.rollback_success_7d,
  rr.rollback_failed_7d
FROM health h
CROSS JOIN active_alerts aa
CROSS JOIN drift d
CROSS JOIN recent_deploys rd
CROSS JOIN pending_approvals pa
CROSS JOIN recent_rollbacks rr;

-- ── View: v_rollback_history ────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_rollback_history AS
SELECT
  r.id,
  r.deploy_id,
  r.surface,
  r.initiated_by,
  r.reason,
  r.rollback_to_sha,
  r.rollback_to_tag,
  r.status,
  r.started_at,
  r.completed_at,
  r.duration_ms,
  r.notes,
  d.git_sha AS original_sha,
  d.git_tag AS original_tag,
  d.surface AS deploy_surface,
  d.status AS deploy_status
FROM public.rollback_events r
LEFT JOIN public.deploy_events d ON r.deploy_id = d.id
ORDER BY r.started_at DESC;

-- ── Function: fn_command_center_data ────────────────────────────────────────
-- Returns all data needed for the command center admin dashboard in one call

CREATE OR REPLACE FUNCTION public.fn_command_center_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary JSONB;
  v_rollbacks JSONB;
  v_approvals JSONB;
  v_activity JSONB;
BEGIN
  -- 1. Command center summary
  SELECT to_jsonb(s) INTO v_summary
  FROM public.v_command_center_summary s;

  -- 2. Recent rollbacks (last 20)
  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::JSONB) INTO v_rollbacks
  FROM (
    SELECT * FROM public.v_rollback_history LIMIT 20
  ) r;

  -- 3. Pending approvals
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.requested_at DESC), '[]'::JSONB) INTO v_approvals
  FROM (
    SELECT
      da.*,
      de.git_sha,
      de.git_tag,
      de.surface AS deploy_surface
    FROM public.deploy_approvals da
    LEFT JOIN public.deploy_events de ON da.deploy_id = de.id
    WHERE da.status = 'pending'
      AND (da.expires_at IS NULL OR da.expires_at > now())
    ORDER BY da.requested_at DESC
    LIMIT 20
  ) a;

  -- 4. Unified activity stream (last 30 events across deploys, alerts, rollbacks)
  SELECT COALESCE(jsonb_agg(to_jsonb(evt) ORDER BY evt.event_time DESC), '[]'::JSONB) INTO v_activity
  FROM (
    -- Recent deploys
    (SELECT
      'deploy' AS event_type,
      id AS event_id,
      surface,
      status AS event_status,
      COALESCE(git_tag, git_sha, '') AS event_detail,
      created_at AS event_time
    FROM public.deploy_events
    WHERE created_at > now() - INTERVAL '7 days'
    ORDER BY created_at DESC
    LIMIT 10)

    UNION ALL

    -- Recent alerts
    (SELECT
      'alert' AS event_type,
      dah.id AS event_id,
      COALESCE(dar.surfaces[1], 'all') AS surface,
      dah.status AS event_status,
      COALESCE(dar.rule_name, '') AS event_detail,
      dah.fired_at AS event_time
    FROM public.deploy_alert_history dah
    LEFT JOIN public.deploy_alert_rules dar ON dah.rule_id = dar.id
    WHERE dah.fired_at > now() - INTERVAL '7 days'
    ORDER BY dah.fired_at DESC
    LIMIT 10)

    UNION ALL

    -- Recent rollbacks
    (SELECT
      'rollback' AS event_type,
      id AS event_id,
      surface,
      status AS event_status,
      COALESCE(reason, '') AS event_detail,
      started_at AS event_time
    FROM public.rollback_events
    WHERE started_at > now() - INTERVAL '7 days'
    ORDER BY started_at DESC
    LIMIT 10)

    ORDER BY event_time DESC
    LIMIT 30
  ) evt;

  RETURN jsonb_build_object(
    'summary', COALESCE(v_summary, '{}'::JSONB),
    'rollbacks', v_rollbacks,
    'approvals', v_approvals,
    'activity', v_activity
  );
END;
$$;

COMMENT ON FUNCTION public.fn_command_center_data IS 'BI-05: Aggregates all BI views into single command center response';

-- ── Function: fn_initiate_rollback ──────────────────────────────────────────
-- Creates a rollback event and fires H-02 event bus notification

CREATE OR REPLACE FUNCTION public.fn_initiate_rollback(
  p_surface TEXT,
  p_deploy_id UUID DEFAULT NULL,
  p_rollback_to_sha TEXT DEFAULT NULL,
  p_rollback_to_tag TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT '',
  p_initiated_by TEXT DEFAULT 'admin'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rollback_id UUID;
  v_result JSONB;
BEGIN
  -- Validate surface
  IF p_surface NOT IN ('dashboard','landing','admin','extension','edge-functions','database','infrastructure') THEN
    RETURN jsonb_build_object('error', 'Invalid surface: ' || p_surface);
  END IF;

  -- Insert rollback event
  INSERT INTO public.rollback_events (
    deploy_id, surface, initiated_by, reason,
    rollback_to_sha, rollback_to_tag, status
  )
  VALUES (
    p_deploy_id, p_surface, p_initiated_by, p_reason,
    p_rollback_to_sha, p_rollback_to_tag, 'initiated'
  )
  RETURNING id INTO v_rollback_id;

  -- H-02: Publish to event bus for rollback notification
  BEGIN
    PERFORM fn_publish_event(
      'rollback.initiated',
      jsonb_build_object(
        'rollback_id', v_rollback_id,
        'surface', p_surface,
        'reason', p_reason,
        'initiated_by', p_initiated_by,
        'rollback_to_sha', p_rollback_to_sha,
        'rollback_to_tag', p_rollback_to_tag
      )
    );
  EXCEPTION WHEN OTHERS THEN
    -- H-02 failure is non-fatal — log but continue
    RAISE NOTICE 'H-02 event bus publish failed for rollback %: %', v_rollback_id, SQLERRM;
  END;

  SELECT to_jsonb(r) INTO v_result
  FROM public.rollback_events r
  WHERE r.id = v_rollback_id;

  RETURN jsonb_build_object('ok', TRUE, 'rollback', v_result);
END;
$$;

COMMENT ON FUNCTION public.fn_initiate_rollback IS 'BI-05: Creates rollback event + H-02 event bus notification';

-- ── pg_cron: Expire stale approvals ─────────────────────────────────────────
-- Runs hourly to expire pending approvals past their expires_at

SELECT cron.schedule(
  'bi05-expire-approvals',
  '0 * * * *',
  $$UPDATE public.deploy_approvals SET status = 'expired', resolved_at = now() WHERE status = 'pending' AND expires_at < now();$$
);

-- ── pg_cron: Cleanup old rollback events (>90 days) ─────────────────────────

SELECT cron.schedule(
  'bi05-cleanup-rollbacks',
  '0 3 * * 0',
  $$DELETE FROM public.rollback_events WHERE created_at < now() - INTERVAL '90 days';$$
);

-- ============================================================================
-- End v6.38
-- ============================================================================
