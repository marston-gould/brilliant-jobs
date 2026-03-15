-- ============================================================
-- v9.41 Migration: LP-RESTRUCTURE-S1
-- Landing Page Restructure Session 1
-- Creates landing_sections table + RLS + seed data
-- ============================================================

-- 1. landing_sections table
CREATE TABLE IF NOT EXISTS landing_sections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order      integer NOT NULL DEFAULT 0,
  is_visible      boolean NOT NULL DEFAULT false,
  archived_at     timestamptz,
  title           text NOT NULL DEFAULT '',
  subtitle        text NOT NULL DEFAULT '',
  body_text       text NOT NULL DEFAULT '',
  image_url       text NOT NULL DEFAULT '',
  image_alt       text NOT NULL DEFAULT '',
  cta_text        text,
  cta_url         text,
  orientation     text NOT NULL DEFAULT 'auto'
                    CHECK (orientation IN ('auto', 'image-left', 'image-right')),
  segment         text NOT NULL DEFAULT 'all'
                    CHECK (segment IN ('all', 'new', 'returning', 'lapsed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 2. updated_at trigger
CREATE OR REPLACE FUNCTION fn_landing_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_landing_sections_updated_at ON landing_sections;
CREATE TRIGGER trg_landing_sections_updated_at
  BEFORE UPDATE ON landing_sections
  FOR EACH ROW EXECUTE FUNCTION fn_landing_sections_updated_at();

-- 3. RLS
ALTER TABLE landing_sections ENABLE ROW LEVEL SECURITY;

-- Public SELECT (landing page is unauthenticated)
DROP POLICY IF EXISTS "landing_sections_public_read" ON landing_sections;
CREATE POLICY "landing_sections_public_read"
  ON landing_sections FOR SELECT
  USING (true);

-- Admin write: INSERT/UPDATE/DELETE require role = 'admin' on profiles
DROP POLICY IF EXISTS "landing_sections_admin_write" ON landing_sections;
CREATE POLICY "landing_sections_admin_write"
  ON landing_sections FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- 4. Index for fast visible ordered fetch
CREATE INDEX IF NOT EXISTS idx_landing_sections_visible_sort
  ON landing_sections (sort_order ASC)
  WHERE is_visible = true AND archived_at IS NULL;

-- 5. Seed data — 4 initial sections (is_visible = false = draft, Pod 1 activates)
INSERT INTO landing_sections
  (sort_order, is_visible, title, subtitle, body_text, image_url, image_alt, cta_text, cta_url, orientation, segment)
VALUES
  (
    1, false,
    'Every Job. Not Just the Ones on LinkedIn.',
    'The Sourcing Advantage',
    'We scan 39,000+ company career pages directly — Greenhouse, Lever, Workday, iCIMS, and dozens more. Most jobs never make it to LinkedIn or Indeed. We find them the moment they post.',
    '',
    'Brilliant Jobs job feed showing jobs from company career pages',
    'See jobs in your field',
    '#lp-preview',
    'auto',
    'all'
  ),
  (
    2, false,
    'Your Resume Score Before You Apply.',
    'AI-Powered Match Analysis',
    'Upload your resume and get an instant ATS match score for any job. See exactly which keywords are missing, which skills you already have, and how to close the gap — before you hit Apply.',
    '',
    'Resume match score analysis showing keyword gaps',
    'Try resume scoring',
    '/app#resumes',
    'auto',
    'all'
  ),
  (
    3, false,
    'One-Click Applications. Real ATS Submissions.',
    'Automated Apply',
    'Our Chrome extension fills and submits ATS forms for you — Greenhouse, Lever, Workday, and 50+ platforms. Not a fake "Easy Apply" — your resume goes directly into the employer''s ATS.',
    '',
    'Chrome extension auto-filling a Greenhouse application form',
    'Get the extension',
    'https://chrome.google.com/webstore',
    'auto',
    'all'
  ),
  (
    4, false,
    'Know Where Every Application Stands.',
    'Application Pipeline',
    'Every application tracked automatically. Gmail signals detect interview invites, rejections, and offers. Your pipeline updates itself — no manual logging required.',
    '',
    'Application pipeline showing stages from applied to offer',
    'See how it works',
    '/app#applications',
    'auto',
    'all'
  )
ON CONFLICT DO NOTHING;
