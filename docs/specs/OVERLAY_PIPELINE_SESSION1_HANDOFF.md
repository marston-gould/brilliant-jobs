# Overlay Pipeline — Session 1 Handoff
## Pipeline Table Migration + Backfill
**Version:** v6.95  
**Date:** 2026-03-04  
**Session:** 1 of 10  
**Category:** PREREQUISITE  
**Status:** ✅ COMPLETE — deployed to production

---

## What Was Built

Session 1 of the 10-session Unified Extension Overlay Pipeline plan. This session creates the foundational database infrastructure that all subsequent sessions depend on.

### Deliverables

| Deliverable | Status |
|---|---|
| `pipeline` table with full 32-column schema | ✅ Deployed |
| `pipeline_entry_source` enum | ✅ Deployed |
| `pipeline_stage` enum | ✅ Deployed |
| UNIQUE constraint `(user_id, source_url)` | ✅ Deployed |
| 6 indexes on pipeline table | ✅ Deployed |
| `updated_at` trigger | ✅ Deployed |
| RLS policies (user CRUD + admin read) | ✅ Deployed |
| `overlay_analytics` table + indexes + RLS | ✅ Deployed |
| Backfill from `pending_applications` | ✅ 2 rows migrated |
| `js/pipeline-migration.js` module | ✅ Committed |
| Migration SQL in `supabase/migrations/` | ✅ Committed |

---

## Pipeline Table Schema

```sql
pipeline (
  id                    uuid PK
  user_id               uuid NOT NULL → auth.users
  source_url            text NOT NULL          -- canonical job URL, dedup key
  source_platform       text                   -- 'greenhouse', 'lever', etc.
  job_title             text
  company_name          text
  location              text
  salary_raw            text
  salary_min            integer
  salary_max            integer
  description_snippet   text
  job_id_ref            text                   -- ats_jobs.greenhouse_id link
  ats_source_ref        text                   -- ats_jobs.ats_source link
  stage                 pipeline_stage         -- saved|applied|phone_screen|interview|offer|rejected|withdrawn|posting_closed
  stage_changed_at      timestamptz
  entry_source          pipeline_entry_source  -- manual|auto_apply|overlay|gmail_detected|calendar_detected|import
  activity_log          jsonb[]                -- append-only event log
  resume_id             uuid → resumes
  match_score           integer
  match_label           text
  fraud_score           integer
  fraud_label           text
  ai_content_score      numeric(4,3)
  ai_content_label      text
  applied_at            timestamptz
  confirmation_detected boolean
  confirmation_pattern  text
  approval_mode         text
  migration_version     integer
  legacy_pa_id          uuid                   -- reference to pending_applications.id
  created_at            timestamptz
  updated_at            timestamptz
)
UNIQUE (user_id, source_url)
```

### Stage Enum Values
`saved` → `applied` → `phone_screen` → `interview` → `offer` → `rejected` / `withdrawn` / `posting_closed`

### Entry Source Enum Values
`manual` | `auto_apply` | `overlay` | `gmail_detected` | `calendar_detected` | `import`

---

## overlay_analytics Table

Lightweight funnel log for toolbar interactions.

```sql
overlay_analytics (
  id              uuid PK
  user_id         uuid → auth.users
  session_id      text
  source_platform text
  action_type     text NOT NULL  -- button_click|result_viewed|upgrade_prompted|save_completed
  url_hash        text           -- hashed URL for privacy
  tier            text
  meta            jsonb
  created_at      timestamptz
)
```

---

## localStorage Migration Module

`js/pipeline-migration.js` — runs on first dashboard load after auth init.

**Trigger point:** Call `PipelineMigration.run(supabaseClient, userId)` in `js/app.js` after session initialization.

**Behavior:**
- Reads `bj_pipeline` array from localStorage
- Normalizes each entry to pipeline table shape
- Upserts via PostgREST with `onConflict: 'user_id,source_url'` (ignore duplicates)
- Sets `bj_pipeline_migration_v1 = 'done'` flag on completion
- Clears `bj_pipeline`, `bj_applied_dates`, `bj_pipeline_meta` from localStorage on zero-error run
- Does NOT re-run if flag is already set

**Wire-up needed in Session 2:** Add to `js/app.js` post-auth block:
```javascript
// After session init, before PostHog events:
if (typeof PipelineMigration !== 'undefined' && !PipelineMigration.hasRun()) {
  PipelineMigration.run(window._sb, session.user.id).catch(function(e) {
    console.warn('[BJ] pipeline-migration failed:', e);
  });
}
```

---

## Backfill Results

| Source | Rows | Outcome |
|---|---|---|
| `pending_applications` | 2 | Migrated → `pipeline` (entry_source='auto_apply', stage='saved') |

Both rows had `status='pending'` → mapped to `stage='saved'`.

---

## Files Committed (v6.95)

| File | Change |
|---|---|
| `supabase/migrations/20260304_unified_pipeline.sql` | New — full migration SQL |
| `js/pipeline-migration.js` | New — localStorage migration module |
| `js/version.js` | Bumped to v6.95 |
| `js/app.js` | Console log updated to v6.95 |
| `dashboard.html` | Version comment + cache-bust params updated to v6.95 |
| `index.html` | Version updated to v6.95 |
| `CHANGELOG.md` | v6.95 entry added |
| `roadmap.html` | Overlay Pipeline S1 card added |

---

## Dependency Chain (Reminder)

```
Session 1 (this) ✅ → Session 2 (Dashboard Pipeline Rewrite) → Session 3 (AutoTracker)
                   → Session 4 (Toolbar Shell) [can start now]
                   → Session 9 (Gmail/Calendar) [can start now]
```

Sessions 4 and 9 are unblocked by Session 1 completing. Session 2 must complete before Session 3 or Sessions 5-8 can ship to prod.

---

## Risks / Notes for Session 2

1. `user_pipeline` table still exists — Session 2 must decide whether to redirect reads/writes or deprecate it. Recommend: dashboard Session 2 writes ONLY to new `pipeline` table; `user_pipeline` deprecated after validation.
2. The localStorage migration module (`pipeline-migration.js`) needs to be added to `dashboard.html` script includes and wired in `app.js` — Session 2 scope.
3. `bj_pipeline` localStorage key format may vary across users on different dashboard versions — `normalizeEntry()` handles common variants but real-world testing in Session 2 QA is required.

---

## Verification

```sql
-- Confirm tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('pipeline', 'overlay_analytics');

-- Confirm backfill
SELECT entry_source, stage, COUNT(*) FROM pipeline GROUP BY 1, 2;

-- Confirm indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'pipeline';

-- Confirm RLS
SELECT policyname FROM pg_policies WHERE tablename = 'pipeline';
```

---

*Session 1 of 10 complete. Next: Session 2 — Dashboard Pipeline JS Rewrite (4–5 days).*
