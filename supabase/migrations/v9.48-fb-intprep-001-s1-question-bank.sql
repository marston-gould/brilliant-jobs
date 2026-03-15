-- FB-INTPREP-001-S1: Interview Question Bank — Schema
-- Spec: FB-INTPREP-001_InterviewPrep.docx §3.3, §10 Phase 1

-- ════════════════════════════════════════════════════════════════
-- 1. interview_questions table
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interview_questions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text     text NOT NULL,
  category          text NOT NULL CHECK (category IN ('behavioral', 'technical', 'situational', 'case_study')),
  difficulty        text NOT NULL CHECK (difficulty IN ('standard', 'advanced')),
  role_cluster      text NOT NULL,
  department        text,
  level             text,
  skill_tags        text[],
  source_cluster_size int NOT NULL DEFAULT 0,
  generated_at      timestamptz NOT NULL DEFAULT now(),
  model_version     text NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE interview_questions IS 'FB-INTPREP-001: Interview question bank generated from JD clusters via Claude';
COMMENT ON COLUMN interview_questions.role_cluster IS 'Normalized role family e.g. "Software Engineer", "Product Manager"';
COMMENT ON COLUMN interview_questions.category IS 'behavioral | technical | situational | case_study';
COMMENT ON COLUMN interview_questions.difficulty IS 'standard | advanced';
COMMENT ON COLUMN interview_questions.source_cluster_size IS 'Number of JDs in the cluster that generated this question';
COMMENT ON COLUMN interview_questions.skill_tags IS 'Array of relevant skills e.g. {"python","system design"}';

-- ════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ════════════════════════════════════════════════════════════════

CREATE INDEX idx_iq_role_cluster ON interview_questions (role_cluster);
CREATE INDEX idx_iq_category ON interview_questions (category);
CREATE INDEX idx_iq_difficulty ON interview_questions (difficulty);
CREATE INDEX idx_iq_department ON interview_questions (department) WHERE department IS NOT NULL;
CREATE INDEX idx_iq_level ON interview_questions (level) WHERE level IS NOT NULL;
CREATE INDEX idx_iq_skill_tags ON interview_questions USING GIN (skill_tags) WHERE skill_tags IS NOT NULL;
CREATE INDEX idx_iq_generated_at ON interview_questions (generated_at DESC);

-- Full-text search on question text for keyword search
ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS question_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', question_text)) STORED;
CREATE INDEX idx_iq_question_tsv ON interview_questions USING GIN (question_tsv);

-- ════════════════════════════════════════════════════════════════
-- 3. RLS
-- ════════════════════════════════════════════════════════════════

ALTER TABLE interview_questions ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read questions (browsing the bank)
CREATE POLICY "interview_questions_read" ON interview_questions
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can write (batch generation EF)
CREATE POLICY "interview_questions_service_write" ON interview_questions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ════════════════════════════════════════════════════════════════
-- 4. Helper view: distinct role clusters with question counts
-- ════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW v_interview_question_clusters AS
SELECT
  role_cluster,
  department,
  level,
  count(*) AS question_count,
  count(*) FILTER (WHERE category = 'behavioral') AS behavioral_count,
  count(*) FILTER (WHERE category = 'technical') AS technical_count,
  count(*) FILTER (WHERE category = 'situational') AS situational_count,
  count(*) FILTER (WHERE category = 'case_study') AS case_study_count,
  max(generated_at) AS last_generated_at,
  max(source_cluster_size) AS cluster_size
FROM interview_questions
GROUP BY role_cluster, department, level
ORDER BY question_count DESC;

GRANT SELECT ON v_interview_question_clusters TO authenticated;
GRANT SELECT ON v_interview_question_clusters TO service_role;

-- ════════════════════════════════════════════════════════════════
-- 5. GRANTs
-- ════════════════════════════════════════════════════════════════

GRANT SELECT ON interview_questions TO authenticated;
GRANT ALL ON interview_questions TO service_role;
