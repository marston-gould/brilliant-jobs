-- 20260323000008: Mark salary_regex_backfill migration as applied
-- The extract_salary_from_text function was created in a prior run
-- but the migration record wasn't written due to statement timeout.
-- This ensures schema_migrations is consistent.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260323000007', 'salary_regex_backfill', ARRAY['-- applied via prior run'])
ON CONFLICT (version) DO NOTHING;
