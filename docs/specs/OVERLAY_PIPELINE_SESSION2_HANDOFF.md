# Overlay Pipeline — Session 2 Handoff
## Dashboard Pipeline JS Wiring + localStorage Migration
**Version:** v6.96
**Date:** 2026-03-04
**Session:** 2 of 10
**Category:** PREREQUISITE (unblocks Sessions 3, 5–8)
**Status:** ✅ COMPLETE — deployed to production

---

## What Was Built

Session 2 wires the pipeline-migration module into the dashboard, fixes a deploy artifact from Session 1, and adds dual-write support to the new `pipeline` table from the existing `savePipelineEntry()` function. The existing `user_pipeline` table remains the primary read surface — zero regression risk.

### Deliverables

| Deliverable | Status |
|---|---|
| `pipeline-migration.js` — fix CHANGELOG append bug from S1 | ✅ Fixed |
| `js/pipeline.js` — `loadNewPipelineFromSupabase()` | ✅ Deployed |
| `js/pipeline.js` — `saveToNewPipeline()` with activity_log append | ✅ Deployed |
| `js/pipeline.js` — `getNewPipelineEntry(sourceUrl)` lookup helper | ✅ Deployed |
| `js/pipeline.js` — `initPipeline()` loads both tables on init | ✅ Deployed |
| `js/pipeline.js` — `savePipelineEntry()` dual-writes to `pipeline` table | ✅ Deployed |
| `js/app.js` — console log updated to v6.96 | ✅ Deployed |
| `js/app.js` — `PipelineMigration.run()` wired post-auth | ✅ Deployed |
| `dashboard.html` — `pipeline-migration.js` script include added | ✅ Deployed |
| All cache-bust params bumped to v6.96 | ✅ Deployed |
| Git tag v6.96 | ✅ Tagged |
| Vercel deploy triggered + verified | ✅ Live |

---

## Architecture

### Dual-Write Strategy

All pipeline writes go to **both** tables in parallel:

```
savePipelineEntry(jobId, meta)
  ├─ upsert → user_pipeline (existing, keyed by job_id)  ← primary read surface
  └─ saveToNewPipeline()    → pipeline (new, keyed by source_url) ← overlay surface
```

The `pipeline` table write is non-blocking — errors are caught and logged as warnings. Zero impact to existing dashboard functionality.

### New Functions in pipeline.js

#### `loadNewPipelineFromSupabase()`
- Loads all rows from `pipeline` table for current user
- Populates `_newPipelineCache` keyed by `source_url`
- Called non-blocking from `initPipeline()` on dashboard load

#### `saveToNewPipeline(entry)`
- Upserts to `pipeline` table on `(user_id, source_url)` conflict
- Appends to `activity_log` on every write (preserves history)
- Updates `stage_changed_at` on every call
- Accepts: `source_url`, `job_title`, `company_name`, `stage`, `entry_source`, `job_id_ref`, `ats_source_ref`, `match_score`, `applied_at`, `_activity_action`

#### `getNewPipelineEntry(sourceUrl)`
- Synchronous lookup from `_newPipelineCache`
- Used by overlay toolbar (Sessions 4+) to check if job is already saved

### localStorage Migration Wire-Up

`PipelineMigration.run()` is called in `js/app.js` immediately after `initPipeline()`:

```javascript
// After initPipeline():
if (typeof PipelineMigration !== 'undefined' && !PipelineMigration.hasRun()) {
  PipelineMigration.run(window._sb || sb, currentUser.id).catch(function(e) {
    console.warn('[BJ] pipeline-migration failed:', e);
  });
}
```

On first load: reads `bj_pipeline` localStorage array → normalizes → upserts to `pipeline` table → sets `bj_pipeline_migration_v1 = 'done'` flag → clears localStorage keys on zero-error run.

---

## Bug Fixed: pipeline-migration.js CHANGELOG Append

Session 1 deployed `pipeline-migration.js` with the entire v6.95 CHANGELOG entry accidentally appended after the closing `})();`. This would have caused a JS parse error in production, breaking the migration module entirely. Fixed in this session — clean module confirmed live.

---

## Files Changed (v6.96)

| File | Change |
|---|---|
| `js/pipeline-migration.js` | Fixed: stripped accidental CHANGELOG append |
| `js/pipeline.js` | Added: `loadNewPipelineFromSupabase()`, `saveToNewPipeline()`, `getNewPipelineEntry()`, dual-write in `savePipelineEntry()`, `initPipeline()` updated |
| `js/app.js` | Console log → v6.96; `PipelineMigration.run()` wired post-auth |
| `js/version.js` | v6.95 → v6.96 |
| `dashboard.html` | Added `pipeline-migration.js` script tag; all `?v=` params → v6.96 |
| `index.html` | Version → v6.96 |
| `CHANGELOG.md` | v6.96 entry added |
| `roadmap.html` | Overlay Pipeline S1 + S2 cards added |

---

## Dependency Chain (Updated)

```
Session 1 ✅ → Session 2 (this) ✅ → Session 3 (AutoTracker rewrite)
                                   → Session 5 (Save to Pipeline EF) [unblocked]
                                   → Session 6 (Compare to CV)       [unblocked]
                                   → Session 7 (Fraud/AI scores)     [unblocked]
Session 4 (Toolbar Shell) — was unblocked by S1, still unblocked
Session 9 (Gmail/Calendar) — still unblocked
```

Sessions 4 and 9 remain parallelizable. Session 3 (AutoTracker) can now proceed as next in sequence.

---

## Notes for Session 3 (AutoTracker)

1. `saveToNewPipeline()` is the write function to call from `autoTracker.js` background context — it accepts `source_url` as the dedup key
2. The `entry_source` field should be `'auto_apply'` for autoTracker writes
3. Dedup behavior: if `source_url` already exists (user manually saved via overlay), `saveToNewPipeline()` will advance the stage and append to `activity_log` rather than create a duplicate row
4. Background context note: `saveToNewPipeline()` lives in the dashboard JS scope. The extension's autoTracker must relay writes through `background.js → apply-on-notification Edge Function` which should call the `pipeline-write` Edge Function (Session 5 scope)

---

## Verification

```javascript
// In browser console after dashboard loads:
// 1. Check version
console.log(BJ_VERSION); // → 'v6.96'

// 2. Check migration module loaded
typeof PipelineMigration; // → 'object'
PipelineMigration.hasRun(); // → true (if already ran) or false

// 3. Check new pipeline cache
Object.keys(_newPipelineCache).length; // → number of pipeline rows

// 4. Check dual-write fires on next save action
// Move any job in pipeline — check Supabase pipeline table for new/updated row
```

```sql
-- Verify new pipeline table receiving dual-writes
SELECT source_url, stage, entry_source, updated_at
FROM pipeline
WHERE user_id = auth.uid()
ORDER BY updated_at DESC
LIMIT 10;
```

---

*Session 2 of 10 complete. Next: Session 3 — AutoTracker → Unified Pipeline (autoTracker.js rewrite to write to pipeline table via background.js relay).*
