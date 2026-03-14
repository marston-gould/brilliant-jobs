-- ============================================================
-- Migration: Apply Workflow Tables (D1 + D3)
-- pending_applications + mock_ats_submissions
-- v4.84 — February 25, 2026
-- ============================================================

-- ─── D1: pending_applications ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.pending_applications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id              TEXT NOT NULL,
  filter_id           INTEGER,
  resume_id           UUID,
  rewritten_resume_id UUID,
  original_score      INTEGER,
  rewritten_score     INTEGER,
  score_result        JSONB,
  rewrite_summary     TEXT,
  rewrite_confidence  NUMERIC(3,2),
  status              TEXT NOT NULL DEFAULT 'pending',
  approval_mode       TEXT NOT NULL,
  notified_via        TEXT[],
  notified_at         TIMESTAMPTZ,
  escalated_at        TIMESTAMPTZ,
  responded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  job_title           TEXT,
  company_name        TEXT,
  job_url             TEXT,
  idempotency_key     TEXT UNIQUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_user_status
  ON public.pending_applications(user_id, status);

CREATE INDEX IF NOT EXISTS idx_pending_expires
  ON public.pending_applications(expires_at)
  WHERE status = 'pending';

-- Status constraint
DO $$ BEGIN
  ALTER TABLE public.pending_applications
    ADD CONSTRAINT chk_pending_status
    CHECK (status IN ('pending','approved','submitted','skipped','expired','failed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Approval mode constraint
DO $$ BEGIN
  ALTER TABLE public.pending_applications
    ADD CONSTRAINT chk_approval_mode
    CHECK (approval_mode IN ('manual','auto_no_approval','auto_with_approval','rewrite_review'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE public.pending_applications ENABLE ROW LEVEL SECURITY;

-- Users CRUD own rows
DROP POLICY IF EXISTS "pending_select" ON public.pending_applications;
DO $$ BEGIN
  CREATE POLICY pending_select ON public.pending_applications
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "pending_insert" ON public.pending_applications;
DO $$ BEGIN
  CREATE POLICY pending_insert ON public.pending_applications
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "pending_update" ON public.pending_applications;
DO $$ BEGIN
  CREATE POLICY pending_update ON public.pending_applications
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "pending_delete" ON public.pending_applications;
DO $$ BEGIN
  CREATE POLICY pending_delete ON public.pending_applications
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin reads all
DROP POLICY IF EXISTS "pending_admin_select" ON public.pending_applications;
DO $$ BEGIN
  CREATE POLICY pending_admin_select ON public.pending_applications
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── D3: mock_ats_submissions ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.mock_ats_submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  job_id            TEXT NOT NULL,
  ats_source        TEXT NOT NULL,
  payload           JSONB NOT NULL,
  response_type     TEXT NOT NULL,
  response_body     JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key   TEXT UNIQUE
);

-- Response type constraint
DO $$ BEGIN
  ALTER TABLE public.mock_ats_submissions
    ADD CONSTRAINT chk_response_type
    CHECK (response_type IN ('success','rejected','timeout'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ATS source constraint
DO $$ BEGIN
  ALTER TABLE public.mock_ats_submissions
    ADD CONSTRAINT chk_ats_source
    CHECK (ats_source IN ('greenhouse','lever','ashby','workable','recruitee','usajobs'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enable RLS
ALTER TABLE public.mock_ats_submissions ENABLE ROW LEVEL SECURITY;

-- Users read own rows
DROP POLICY IF EXISTS "mock_ats_select" ON public.mock_ats_submissions;
DO $$ BEGIN
  CREATE POLICY mock_ats_select ON public.mock_ats_submissions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS "mock_ats_insert" ON public.mock_ats_submissions;
DO $$ BEGIN
  CREATE POLICY mock_ats_insert ON public.mock_ats_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Admin reads all
DROP POLICY IF EXISTS "mock_ats_admin_select" ON public.mock_ats_submissions;
DO $$ BEGIN
  CREATE POLICY mock_ats_admin_select ON public.mock_ats_submissions
    FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
