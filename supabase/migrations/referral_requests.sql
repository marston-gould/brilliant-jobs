-- Migration: referral_requests table
-- v7.06 — Referral Outreach Part 1 (data model for Part 2)
-- Run via Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS referral_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id text NOT NULL,
  company_name text,
  job_title text,
  contact_name text,
  contact_channel text CHECK (contact_channel IN ('linkedin', 'email')),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'pending', 'declined')),
  referral_link text,
  notes text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_requests_user_id_idx ON referral_requests(user_id);
CREATE INDEX IF NOT EXISTS referral_requests_job_id_idx ON referral_requests(job_id);

ALTER TABLE referral_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'referral_requests'
    AND policyname = 'Users can manage their own referral requests'
  ) THEN
    CREATE POLICY "Users can manage their own referral requests"
      ON referral_requests FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION update_referral_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_requests_updated_at ON referral_requests;
CREATE TRIGGER trg_referral_requests_updated_at
  BEFORE UPDATE ON referral_requests
  FOR EACH ROW EXECUTE FUNCTION update_referral_requests_updated_at();
