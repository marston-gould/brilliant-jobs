-- FB-CHAT-002 Addendum A: Drop dead is_us_job column
-- Investigation: feed uses loc_country + FA-009 4-tier smart filter, NOT is_us_job.
-- 476,337 open jobs all had is_us_job=NULL. No EF or JS ever wrote to or read from it.
-- Contentful job (greenhouse_id 7593409) confirmed visible via loc_country=US.
-- Applied to production 2026-03-16.

ALTER TABLE ats_jobs DROP COLUMN IF EXISTS is_us_job;
