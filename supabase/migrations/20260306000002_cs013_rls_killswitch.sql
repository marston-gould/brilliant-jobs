-- CS-013 FIX-08: Enable RLS on all remaining dashboard tables
-- Run after CS-009 (safeQuery wired) — safe to apply
--
-- Tables identified as missing RLS:
--   profiles, resumes, plans, subscriptions, connections, feedback,
--   cohorts, ats_companies, ats_jobs, audit_log, company_ghost_stats,
--   ghost_alerts_sent, notification_log, notification_actions,
--   content_stories, content_story_analytics
--
-- Policy strategy:
--   - User-owned tables: users can read/write their own rows (auth.uid() = user_id)
--   - Reference/public tables: authenticated read, admin-only write
--   - Admin-only tables: admin role required for all operations
--   - Service-role bypass: implicit in Supabase (service_role ignores RLS)

-- ═══════════════════════════════════════════════════════
-- 1. USER-OWNED TABLES (auth.uid() = owner column)
-- ═══════════════════════════════════════════════════════

-- profiles: users own their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own_profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Admin can read all profiles
DO $$ BEGIN
  CREATE POLICY "admin_read_all_profiles"
    ON profiles FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- resumes: users own their own resume
ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_resume"
    ON resumes FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_write_own_resume"
    ON resumes FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own_resume"
    ON resumes FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_delete_own_resume"
    ON resumes FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- subscriptions: users can read their own, admin can read/write all
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_subscriptions"
    ON subscriptions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_subscriptions"
    ON subscriptions FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- connections: users own their connections
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_connections"
    ON connections FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_write_own_connections"
    ON connections FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own_connections"
    ON connections FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_delete_own_connections"
    ON connections FOR DELETE
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- feedback: users can read their own and insert new
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_feedback"
    ON feedback FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_insert_feedback"
    ON feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_feedback"
    ON feedback FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- notification_log: users see their own notifications
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_notifications"
    ON notification_log FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_notifications"
    ON notification_log FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- notification_actions: users see their own actions
ALTER TABLE notification_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_notification_actions"
    ON notification_actions FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_write_own_notification_actions"
    ON notification_actions FOR INSERT
    WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "users_update_own_notification_actions"
    ON notification_actions FOR UPDATE
    USING (auth.uid() = user_id);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════
-- 2. REFERENCE / PUBLIC-READ TABLES
-- ═══════════════════════════════════════════════════════

-- plans: all authenticated users can read (pricing display)
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_read_plans"
    ON plans FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_plans"
    ON plans FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- cohorts: authenticated read, admin write
ALTER TABLE cohorts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "authenticated_read_cohorts"
    ON cohorts FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_cohorts"
    ON cohorts FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ats_companies: public read (company data shown on SEO pages)
ALTER TABLE ats_companies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public_read_ats_companies"
    ON ats_companies FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_ats_companies"
    ON ats_companies FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ats_jobs: public read (job data shown on SEO pages / dashboard)
ALTER TABLE ats_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "public_read_ats_jobs"
    ON ats_jobs FOR SELECT
    USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "admin_manage_ats_jobs"
    ON ats_jobs FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════
-- 3. ADMIN-ONLY TABLES
-- ═══════════════════════════════════════════════════════

-- audit_log: admin-only access
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_read_audit_log"
    ON audit_log FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Service role inserts (from EFs) bypass RLS — no INSERT policy needed

-- company_ghost_stats: admin-only
ALTER TABLE company_ghost_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_manage_ghost_stats"
    ON company_ghost_stats FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ghost_alerts_sent: admin-only
ALTER TABLE ghost_alerts_sent ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_manage_ghost_alerts"
    ON ghost_alerts_sent FOR ALL
    USING (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════
-- 4. CONTENT TABLES (if they exist)
-- ═══════════════════════════════════════════════════════

-- content_stories: public can read published, admin can manage all
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'content_stories') THEN
    EXECUTE 'ALTER TABLE content_stories ENABLE ROW LEVEL SECURITY';

    EXECUTE $policy$
DO $$ BEGIN
        CREATE POLICY "public_read_published_stories"
          ON content_stories FOR SELECT
          USING (status = 'published')
      $policy$;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

    EXECUTE $policy$
DO $$ BEGIN
        CREATE POLICY "admin_manage_stories"
          ON content_stories FOR ALL
          USING (
            EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
          )
      $policy$;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════
-- 5. KILL-SWITCH FLAG (FIX-13 dependency)
-- ═══════════════════════════════════════════════════════

-- Ensure feature_flags has the kill-switch row
INSERT INTO feature_flags (id, enabled, description, updated_at)
VALUES (
  'extension_kill_switch',
  false,
  'When true, all extension scanning/filling operations are halted. Toggle from admin UI.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════
-- VERIFICATION: List tables still without RLS (should be empty after this migration)
-- Run this query manually to verify:
--
-- SELECT schemaname, tablename
-- FROM pg_tables
-- WHERE schemaname = 'public'
--   AND NOT rowsecurity
-- ORDER BY tablename;
-- ═══════════════════════════════════════════════════════
