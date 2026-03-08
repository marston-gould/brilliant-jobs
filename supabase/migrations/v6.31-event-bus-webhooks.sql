-- ─────────────────────────────────────────────────────────────────────────────
-- v6.31 — SA-024: Platform Event Bus + Webhook Delivery System
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates the platform event bus backbone:
--   platform_events        — immutable event log (append-only)
--   webhook_subscriptions  — registered webhook endpoints per consumer
--   webhook_delivery_log   — delivery attempts + retry state machine
--   api_consumers upgrade  — adds webhook columns to existing table
--
-- Event taxonomy:
--   job.*           job.published, job.enriched, job.dedup_complete, job.batch_ingested
--   user.*          user.signup, user.tier_changed, user.deleted
--   pipeline.*      pipeline.stage_changed, pipeline.ghost_detected, pipeline.signal_confirmed
--   agent.*         agent.action_taken, agent.graduated, agent.alert_fired
--   billing.*       billing.subscription_changed, billing.checkout_initiated, billing.credit_added
--   referral.*      referral.converted, referral.fraud_flagged
--   system.*        system.health_check, system.error_spike
--
-- Hook points (H-01 activated in SA-024):
--   H-01: Gateway middleware slot for post-response event dispatch
--   H-02: fn_publish_event() callable from any Edge Function
--
-- Scar points:
--   S-03: GatewayContext.eventBus field (activated — previously just typed)
--   S-04: webhook_subscriptions.event_filters JSONB (content-based filtering, future)
--   S-05: platform_events.routing_key (topic-based fan-out, future)
--
-- Retry schedule: 1min → 5min → 30min → 2h → 8h → abandoned (5 attempts max)
--
-- ADR: docs/scaling/adr-03-gateway.md (SA-024 section)
-- Session: SA-024 | Phase S5 | 2026-03-07
-- Pair: Backend + Lead Platform Eng + Forward-Looking Dev
-- Reviewer: Chief Architect
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. platform_events — immutable event log ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         TEXT        UNIQUE NOT NULL,       -- evt_<nanoid>
  event_type       TEXT        NOT NULL,              -- e.g. "job.published"
  event_version    TEXT        NOT NULL DEFAULT '1.0',
  source           TEXT        NOT NULL,              -- originating EF name
  payload          JSONB       NOT NULL DEFAULT '{}',
  metadata         JSONB       NOT NULL DEFAULT '{}', -- correlation_id, user_id, etc.
  idempotency_key  TEXT,                              -- dedup duplicate publishes
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only: no updates or deletes on event log
CREATE OR REPLACE RULE platform_events_no_update AS
  ON UPDATE TO public.platform_events DO INSTEAD NOTHING;

CREATE OR REPLACE RULE platform_events_no_delete AS
  ON DELETE TO public.platform_events DO INSTEAD NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_platform_events_event_type
  ON public.platform_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_events_source
  ON public.platform_events (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_events_idempotency
  ON public.platform_events (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_events_created_at
  ON public.platform_events (created_at DESC);

-- RLS
ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_events_public_read ON public.platform_events
  FOR SELECT USING (true);

CREATE POLICY platform_events_service_insert ON public.platform_events
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE public.platform_events IS
  'SA-024: Immutable platform event log. Append-only. All system events flow through here.';

-- ── 2. webhook_subscriptions ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_subscriptions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  TEXT        UNIQUE NOT NULL,       -- sub_<nanoid>
  consumer_id      TEXT        REFERENCES public.api_consumers(consumer_id) ON DELETE CASCADE,
  webhook_url      TEXT        NOT NULL,
  webhook_secret   TEXT        NOT NULL,              -- HMAC-SHA256 signing key (stored hashed in metadata)
  event_types      TEXT[]      NOT NULL DEFAULT '{}', -- empty array = subscribe to ALL events
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  -- SCAR S-04: content-based filter (e.g. payload->>'source' = 'common_crawl')
  event_filters    JSONB       NOT NULL DEFAULT '{}',
  failure_count    INT         NOT NULL DEFAULT 0,    -- consecutive failures; auto-disable at 50
  last_success_at  TIMESTAMPTZ,
  last_failure_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_subs_consumer
  ON public.webhook_subscriptions (consumer_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_webhook_subs_event_types
  ON public.webhook_subscriptions USING GIN (event_types) WHERE is_active = true;

ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_subs_service_all ON public.webhook_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY webhook_subs_admin_read ON public.webhook_subscriptions
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE public.webhook_subscriptions IS
  'SA-024: Registered webhook endpoints. Consumer subscribes to event types for HMAC-signed delivery.';

-- ── 3. webhook_delivery_log ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_delivery_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      TEXT        UNIQUE NOT NULL,       -- del_<nanoid>
  event_id         TEXT        NOT NULL REFERENCES public.platform_events(event_id),
  subscription_id  TEXT        NOT NULL REFERENCES public.webhook_subscriptions(subscription_id),
  attempt_number   INT         NOT NULL DEFAULT 1,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'delivered', 'failed', 'retrying', 'abandoned')),
  http_status      INT,
  response_body    TEXT,
  error_message    TEXT,
  duration_ms      INT,
  next_retry_at    TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for queue processing
CREATE INDEX IF NOT EXISTS idx_delivery_log_queue
  ON public.webhook_delivery_log (status, next_retry_at)
  WHERE status IN ('pending', 'retrying');

CREATE INDEX IF NOT EXISTS idx_delivery_log_event
  ON public.webhook_delivery_log (event_id, status);

CREATE INDEX IF NOT EXISTS idx_delivery_log_subscription
  ON public.webhook_delivery_log (subscription_id, created_at DESC);

ALTER TABLE public.webhook_delivery_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY delivery_log_service_all ON public.webhook_delivery_log
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY delivery_log_admin_read ON public.webhook_delivery_log
  FOR SELECT USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE public.webhook_delivery_log IS
  'SA-024: Webhook delivery attempt log. State machine: pending → delivered | failed → retrying → abandoned.';

-- ── 4. api_consumers upgrade — add webhook columns ────────────────────────────

ALTER TABLE public.api_consumers
  ADD COLUMN IF NOT EXISTS webhook_url         TEXT,
  ADD COLUMN IF NOT EXISTS webhook_events      TEXT[]  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS webhook_enabled     BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.api_consumers.webhook_url IS
  'SA-024: Primary webhook endpoint for this consumer. Separate detailed subscriptions in webhook_subscriptions.';
COMMENT ON COLUMN public.api_consumers.webhook_events IS
  'SA-024: Event types this consumer receives on their primary webhook_url.';
COMMENT ON COLUMN public.api_consumers.webhook_enabled IS
  'SA-024: Master switch for webhook delivery to this consumer.';

-- ── 5. fn_publish_event — core publish function ───────────────────────────────
-- Called by EFs to emit events. Returns event_id or NULL on dedup hit.

CREATE OR REPLACE FUNCTION public.fn_publish_event(
  p_event_type      TEXT,
  p_source          TEXT,
  p_payload         JSONB    DEFAULT '{}',
  p_metadata        JSONB    DEFAULT '{}',
  p_idempotency_key TEXT     DEFAULT NULL,
  p_event_version   TEXT     DEFAULT '1.0'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id  TEXT;
  v_existing  TEXT;
BEGIN
  -- Dedup check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT event_id INTO v_existing
    FROM public.platform_events
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF v_existing IS NOT NULL THEN
      RETURN v_existing; -- idempotent: return existing event_id
    END IF;
  END IF;

  -- Generate event_id: evt_ + 20-char nanoid-style
  v_event_id := 'evt_' || encode(gen_random_bytes(12), 'hex');

  INSERT INTO public.platform_events (
    event_id, event_type, event_version, source,
    payload, metadata, idempotency_key
  ) VALUES (
    v_event_id, p_event_type, p_event_version, p_source,
    p_payload, p_metadata, p_idempotency_key
  );

  -- Queue webhook deliveries
  PERFORM public.fn_queue_webhook_deliveries(v_event_id, p_event_type);

  RETURN v_event_id;
END;
$$;

-- ── 6. fn_queue_webhook_deliveries ───────────────────────────────────────────
-- Finds matching subscriptions and creates pending delivery records.

CREATE OR REPLACE FUNCTION public.fn_queue_webhook_deliveries(
  p_event_id   TEXT,
  p_event_type TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  v_sub   RECORD;
  v_del_id TEXT;
BEGIN
  FOR v_sub IN
    SELECT subscription_id
    FROM public.webhook_subscriptions
    WHERE is_active = true
      AND failure_count < 50
      AND (
        cardinality(event_types) = 0  -- empty = all events
        OR p_event_type = ANY(event_types)
        -- SCAR S-05: routing_key fan-out handled here in future
      )
  LOOP
    v_del_id := 'del_' || encode(gen_random_bytes(12), 'hex');

    INSERT INTO public.webhook_delivery_log (
      delivery_id, event_id, subscription_id,
      status, attempt_number, next_retry_at
    ) VALUES (
      v_del_id, p_event_id, v_sub.subscription_id,
      'pending', 1, NOW()
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── 7. fn_webhook_delivery_summary — CrewAI + admin visibility ────────────────

CREATE OR REPLACE FUNCTION public.fn_webhook_delivery_summary()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'subscriptions', jsonb_build_object(
      'total',    COUNT(*) FILTER (WHERE TRUE),
      'active',   COUNT(*) FILTER (WHERE is_active),
      'disabled', COUNT(*) FILTER (WHERE NOT is_active)
    ),
    'deliveries_24h', (
      SELECT jsonb_build_object(
        'total',     COUNT(*),
        'delivered', COUNT(*) FILTER (WHERE status = 'delivered'),
        'failed',    COUNT(*) FILTER (WHERE status = 'failed'),
        'retrying',  COUNT(*) FILTER (WHERE status = 'retrying'),
        'abandoned', COUNT(*) FILTER (WHERE status = 'abandoned'),
        'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
        'success_rate', ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'delivered') /
          NULLIF(COUNT(*) FILTER (WHERE status IN ('delivered','failed','abandoned')), 0),
          1
        )
      )
      FROM public.webhook_delivery_log
      WHERE created_at > NOW() - INTERVAL '24 hours'
    ),
    'events_24h', (
      SELECT jsonb_build_object(
        'total', COUNT(*),
        'by_type', jsonb_object_agg(event_type, cnt)
      )
      FROM (
        SELECT event_type, COUNT(*) AS cnt
        FROM public.platform_events
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY event_type
        ORDER BY cnt DESC
        LIMIT 20
      ) t
    ),
    'generated_at', NOW()
  )
  FROM public.webhook_subscriptions;
$$;

-- ── 8. fn_mark_subscription_failure — track consecutive failures ──────────────

CREATE OR REPLACE FUNCTION public.fn_mark_subscription_failure(
  p_subscription_id TEXT,
  p_success         BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.webhook_subscriptions
    SET failure_count = 0,
        last_success_at = NOW(),
        updated_at = NOW()
    WHERE subscription_id = p_subscription_id;
  ELSE
    UPDATE public.webhook_subscriptions
    SET failure_count    = failure_count + 1,
        last_failure_at  = NOW(),
        is_active        = (failure_count + 1 < 50), -- auto-disable at 50 failures
        updated_at       = NOW()
    WHERE subscription_id = p_subscription_id;
  END IF;
END;
$$;

-- ── 9. v_event_bus_dashboard — admin monitoring view ─────────────────────────

CREATE OR REPLACE VIEW public.v_event_bus_dashboard AS
SELECT
  ws.subscription_id,
  ws.consumer_id,
  LEFT(ws.webhook_url, 80)   AS webhook_url_preview,
  ws.event_types,
  ws.is_active,
  ws.failure_count,
  ws.last_success_at,
  ws.last_failure_at,
  ws.created_at              AS subscribed_at,
  -- delivery stats (7 days)
  COALESCE(d.total_7d, 0)    AS deliveries_7d,
  COALESCE(d.delivered_7d, 0) AS delivered_7d,
  COALESCE(d.failed_7d, 0)   AS failed_7d,
  COALESCE(d.abandoned_7d, 0) AS abandoned_7d
FROM public.webhook_subscriptions ws
LEFT JOIN (
  SELECT
    subscription_id,
    COUNT(*)                                 AS total_7d,
    COUNT(*) FILTER (WHERE status = 'delivered') AS delivered_7d,
    COUNT(*) FILTER (WHERE status = 'failed')    AS failed_7d,
    COUNT(*) FILTER (WHERE status = 'abandoned') AS abandoned_7d
  FROM public.webhook_delivery_log
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY subscription_id
) d ON d.subscription_id = ws.subscription_id;

COMMENT ON VIEW public.v_event_bus_dashboard IS
  'SA-024: Admin view of webhook subscriptions + delivery health metrics.';

-- ── 10. pg_cron: process pending deliveries every minute ─────────────────────

SELECT cron.schedule(
  'sa024-process-webhook-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := (
        SELECT 'https://' || (SELECT value FROM public.app_config WHERE key = 'supabase_project_ref') || '.supabase.co/functions/v1/event-bus'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
      ),
      body := '{"action":"process_queue","limit":50}'::jsonb
    );
  $$
);

SELECT cron.schedule(
  'sa024-cleanup-delivered-events',
  '0 3 * * *',
  $$
    -- Retain delivered deliveries for 30 days; abandoned for 90 days
    DELETE FROM public.webhook_delivery_log
    WHERE (status = 'delivered' AND delivered_at < NOW() - INTERVAL '30 days')
       OR (status = 'abandoned' AND updated_at  < NOW() - INTERVAL '90 days');
  $$
);

-- ── 11. agent_action_log: migration event ────────────────────────────────────

INSERT INTO public.agent_action_log (agent_id, action_type, action_data, executed)
VALUES (
  'system',
  'migration',
  jsonb_build_object(
    'migration', 'v6.31-event-bus-webhooks',
    'created_tables', ARRAY['platform_events', 'webhook_subscriptions', 'webhook_delivery_log'],
    'altered_tables', ARRAY['api_consumers'],
    'functions', ARRAY[
      'fn_publish_event', 'fn_queue_webhook_deliveries',
      'fn_webhook_delivery_summary', 'fn_mark_subscription_failure'
    ],
    'views', ARRAY['v_event_bus_dashboard'],
    'cron_jobs', ARRAY['sa024-process-webhook-queue', 'sa024-cleanup-delivered-events'],
    'hook_points_activated', ARRAY['H-01', 'H-02'],
    'scar_points_activated', ARRAY['S-03', 'S-04', 'S-05'],
    'session', 'SA-024',
    'phase', 'S5',
    'note', 'Platform event bus + HMAC-signed webhook delivery. Retry schedule: 1m/5m/30m/2h/8h.'
  ),
  false
)
ON CONFLICT DO NOTHING;

COMMIT;
