-- ═══════════════════════════════════════════════════════════
-- CS-012: Admin Visibility — Cron Panel + Biz-Ops Tables
-- AD-FIX-06: Cron health view for admin panel
-- AD-FIX-08: Biz-ops tables (paid_spend_log, social_post_log, vendor_cost_log)
-- ═══════════════════════════════════════════════════════════

-- ─── AD-FIX-06: Cron Health View ───────────────────────────
-- Joins cron.job with latest run from cron.job_run_details
-- Accessible from public schema via Supabase JS client
CREATE OR REPLACE VIEW public.v_cron_health AS
SELECT
  j.jobid,
  j.jobname,
  j.schedule,
  j.command,
  j.active,
  r.runid        AS last_runid,
  r.status       AS last_status,
  r.return_message AS last_message,
  r.start_time   AS last_start,
  r.end_time     AS last_end,
  EXTRACT(EPOCH FROM (r.end_time - r.start_time)) AS last_duration_s,
  CASE
    WHEN j.active = false THEN 'disabled'
    WHEN r.status IS NULL THEN 'unknown'
    WHEN r.status = 'succeeded' AND r.end_time > NOW() - INTERVAL '25 hours' THEN 'green'
    WHEN r.status = 'succeeded' AND r.end_time > NOW() - INTERVAL '49 hours' THEN 'amber'
    WHEN r.status = 'failed' THEN 'red'
    ELSE 'amber'
  END AS health
FROM cron.job j
LEFT JOIN LATERAL (
  SELECT runid, status, return_message, start_time, end_time
  FROM cron.job_run_details d
  WHERE d.jobid = j.jobid
  ORDER BY d.start_time DESC
  LIMIT 1
) r ON true
ORDER BY
  CASE
    WHEN r.status = 'failed' THEN 0
    WHEN j.active = false THEN 2
    ELSE 1
  END,
  j.jobname;

-- Grant access to authenticated (admin check is in app layer)
GRANT SELECT ON public.v_cron_health TO authenticated;

-- ─── AD-FIX-08: Biz-Ops Tables ────────────────────────────

-- Paid Spend Log
CREATE TABLE IF NOT EXISTS public.paid_spend_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date       DATE NOT NULL,
  platform   TEXT NOT NULL,
  amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes      TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.paid_spend_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin read paid_spend_log"
    ON public.paid_spend_log FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin insert paid_spend_log"
    ON public.paid_spend_log FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin delete paid_spend_log"
    ON public.paid_spend_log FOR DELETE
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Social Post Log
CREATE TABLE IF NOT EXISTS public.social_post_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date        DATE NOT NULL,
  platform    TEXT NOT NULL,
  engagements INTEGER DEFAULT 0,
  notes       TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.social_post_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin read social_post_log"
    ON public.social_post_log FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin insert social_post_log"
    ON public.social_post_log FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin delete social_post_log"
    ON public.social_post_log FOR DELETE
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Vendor Cost Log
CREATE TABLE IF NOT EXISTS public.vendor_cost_log (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month      TEXT NOT NULL,  -- YYYY-MM format
  vendor     TEXT NOT NULL,
  amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes      TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.vendor_cost_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Admin read vendor_cost_log"
    ON public.vendor_cost_log FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin insert vendor_cost_log"
    ON public.vendor_cost_log FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Admin delete vendor_cost_log"
    ON public.vendor_cost_log FOR DELETE
    USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_paid_spend_log_date ON public.paid_spend_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_social_post_log_date ON public.social_post_log(date DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_cost_log_month ON public.vendor_cost_log(month DESC);
