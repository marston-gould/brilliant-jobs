-- v9.36-resume-builder.sql
-- RESUME-BUILDER-001-S1: resumes table, RLS, Storage bucket policies
-- Phase 1: Upload, Parse, Store

-- ─── Table ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.resumes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label               text NOT NULL DEFAULT 'My Resume',
  template_id         text NOT NULL DEFAULT 'modern' CHECK (template_id IN ('classic','modern','minimal')),
  parsed_json         jsonb,
  original_file_url   text,
  generated_docx_url  text,
  generated_pdf_url   text,
  target_job_id       uuid REFERENCES public.ats_jobs(id) ON DELETE SET NULL,
  target_filter_id    uuid REFERENCES public.saved_filters(id) ON DELETE SET NULL,
  match_score         int CHECK (match_score >= 0 AND match_score <= 100),
  keyword_gaps        jsonb,
  is_primary          boolean NOT NULL DEFAULT false,
  ats_warnings        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_user_primary ON public.resumes(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_resumes_target_job ON public.resumes(target_job_id) WHERE target_job_id IS NOT NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.fn_resumes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resumes_updated_at ON public.resumes;
CREATE TRIGGER trg_resumes_updated_at
  BEFORE UPDATE ON public.resumes
  FOR EACH ROW EXECUTE FUNCTION public.fn_resumes_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resumes_select_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_insert_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_update_own" ON public.resumes;
DROP POLICY IF EXISTS "resumes_delete_own" ON public.resumes;

CREATE POLICY "resumes_select_own" ON public.resumes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "resumes_insert_own" ON public.resumes
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "resumes_update_own" ON public.resumes
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "resumes_delete_own" ON public.resumes
  FOR DELETE USING (user_id = auth.uid());

-- ─── Plan limits helper ───────────────────────────────────────────────────────
-- Free: 1, Starter: 3, Pro: 10
-- Called by resume-parse EF before inserting

CREATE OR REPLACE FUNCTION public.fn_resume_count_for_user(p_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::int FROM public.resumes WHERE user_id = p_user_id;
$$;

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- Bucket "resumes" must be created via Supabase dashboard or API.
-- Path-based RLS: resumes/{user_id}/*

-- Storage policies (requires storage schema — safe to run if already configured)
DO $$
BEGIN
  -- Insert policy: authenticated users can upload to their own folder
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies
    WHERE bucket_id = 'resumes' AND name = 'resumes_upload_own'
  ) THEN
    INSERT INTO storage.policies (name, bucket_id, operation, definition)
    VALUES (
      'resumes_upload_own',
      'resumes',
      'INSERT',
      '(auth.uid()::text = (storage.foldername(name))[1])'
    );
  END IF;

  -- Select policy: authenticated users can read their own files
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies
    WHERE bucket_id = 'resumes' AND name = 'resumes_read_own'
  ) THEN
    INSERT INTO storage.policies (name, bucket_id, operation, definition)
    VALUES (
      'resumes_read_own',
      'resumes',
      'SELECT',
      '(auth.uid()::text = (storage.foldername(name))[1])'
    );
  END IF;

  -- Delete policy: authenticated users can delete their own files
  IF NOT EXISTS (
    SELECT 1 FROM storage.policies
    WHERE bucket_id = 'resumes' AND name = 'resumes_delete_own'
  ) THEN
    INSERT INTO storage.policies (name, bucket_id, operation, definition)
    VALUES (
      'resumes_delete_own',
      'resumes',
      'DELETE',
      '(auth.uid()::text = (storage.foldername(name))[1])'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Storage schema may not expose policies table directly; skip silently
  RAISE NOTICE 'Storage policy setup skipped: %', SQLERRM;
END;
$$;
