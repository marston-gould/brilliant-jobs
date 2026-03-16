-- AIS-F12: Resume A/B Testing tables
CREATE TABLE IF NOT EXISTS resume_ab_tests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_name           text NOT NULL,
  filter_id           uuid,
  variant_a_resume_id uuid NOT NULL,
  variant_b_resume_id uuid NOT NULL,
  status              text NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','completed')),
  winner_id           uuid,              -- null until declared
  min_sample_size     integer NOT NULL DEFAULT 20,
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);

CREATE TABLE IF NOT EXISTS resume_ab_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id           uuid NOT NULL REFERENCES resume_ab_tests(id) ON DELETE CASCADE,
  job_id            text,
  variant           text NOT NULL CHECK (variant IN ('a','b')),
  resume_id         uuid NOT NULL,
  applied_at        timestamptz NOT NULL DEFAULT now(),
  response_received boolean NOT NULL DEFAULT false,
  response_at       timestamptz,
  outcome           text CHECK (outcome IN ('no_response','rejected','interview','offer',NULL)),
  days_to_response  integer
);

CREATE INDEX IF NOT EXISTS idx_resume_ab_tests_user ON resume_ab_tests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resume_ab_results_test ON resume_ab_results (test_id, variant);
CREATE INDEX IF NOT EXISTS idx_resume_ab_results_user_job ON resume_ab_results (test_id, job_id) WHERE job_id IS NOT NULL;

ALTER TABLE resume_ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_ab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_ab_tests" ON resume_ab_tests
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_ab_results" ON resume_ab_results
  FOR ALL USING (EXISTS (SELECT 1 FROM resume_ab_tests t WHERE t.id = test_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM resume_ab_tests t WHERE t.id = test_id AND t.user_id = auth.uid()));
CREATE POLICY "service_role_full_ab_tests" ON resume_ab_tests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_ab_results" ON resume_ab_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);
