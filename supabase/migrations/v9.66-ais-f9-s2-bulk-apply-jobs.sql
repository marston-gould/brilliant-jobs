-- AIS-F9-S2: bulk_apply_jobs table
-- Stores queued bulk apply jobs with per-job status tracking.

CREATE TABLE IF NOT EXISTS bulk_apply_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id          text NOT NULL,
  job_title       text,
  company_name    text,
  job_url         text,
  resume_id       uuid,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','submitted','failed','skipped')),
  result_detail   jsonb,
  credits_charged numeric(5,2) DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bulk_apply_jobs_user ON bulk_apply_jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bulk_apply_jobs_status ON bulk_apply_jobs (user_id, status) WHERE status IN ('queued','processing');

ALTER TABLE bulk_apply_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_bulk_apply_jobs" ON bulk_apply_jobs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "service_role_full_bulk_apply_jobs" ON bulk_apply_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fn_bulk_apply_jobs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_bulk_apply_jobs_updated_at ON bulk_apply_jobs;
CREATE TRIGGER trg_bulk_apply_jobs_updated_at
  BEFORE UPDATE ON bulk_apply_jobs
  FOR EACH ROW EXECUTE FUNCTION fn_bulk_apply_jobs_updated_at();
