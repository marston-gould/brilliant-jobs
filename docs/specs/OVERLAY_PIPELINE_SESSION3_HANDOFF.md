# Overlay Pipeline — Session 3 Handoff
## AutoTracker → Unified Pipeline Dual-Write
**Version:** v6.97  
**Date:** 2026-03-04  
**Session:** 3 of 10  
**Status:** ✅ COMPLETE — deployed to production

---

## What Was Built

Session 3 wires the extension's autoTracker.js to dual-write application events to the new unified pipeline table. Every auto-apply submission detection and confirmation now writes to both `pending_applications` (unchanged) and the new `pipeline` table. The pipeline write is non-blocking — errors are caught and logged as warnings with zero impact to existing flows.

## New Function: _writeToNewPipeline(url, info, status, token, userId)

- Checks for existing pipeline row by `(user_id, source_url)`
- If exists: appends to `activity_log`; advances stage `saved → applied` on `submitted_confirmed` only
- If not exists: inserts with `entry_source='auto_apply'`, `job_id_ref`, `ats_source_ref` from `extractJobMeta(url)`
- Non-blocking — errors are `console.warn` only

## Stage Logic

| autoTracker Status | pipeline Stage | Condition |
|---|---|---|
| submitted_unconfirmed | saved | New row only |
| submitted_confirmed | applied | New row OR advance from saved |
| submitted_confirmed + existing applied | applied (no change) | Log append only |

## Files Changed (v6.97)

| File | Change |
|---|---|
| extension/utils/autoTracker.js | v3.9.0 → v3.10.0; _writeToNewPipeline() added |
| js/version.js | v6.96 → v6.97 |
| js/app.js | Console log → v6.97 |
| dashboard.html | All ?v= params → v6.97 |
| index.html | Version → v6.97 |
| CHANGELOG.md | v6.97 entry added |
| roadmap.html | S3 complete, version refs → v6.97 |

## Dependency Chain (Updated)

```
Session 1 ✅ → Session 2 ✅ → Session 3 (this) ✅ → Session 4 (Toolbar Shell)
                                                  → Session 5 (pipeline-write Edge Function)
                                                  → Session 6 (Compare to CV)
                                                  → Session 7 (Fraud/AI scores)
Session 9 (Gmail/Calendar) — still parallelizable
```

## Verification

```bash
curl -s https://brilliantjobs.app/js/version.js
# Expected: var BJ_VERSION = 'v6.97'; ✅ CONFIRMED
```

```sql
SELECT source_url, stage, entry_source, activity_log, updated_at
FROM pipeline
WHERE user_id = auth.uid() AND entry_source = 'auto_apply'
ORDER BY updated_at DESC LIMIT 10;
```

*Session 3 of 10 complete. Next: Session 4 — Toolbar Shell*
