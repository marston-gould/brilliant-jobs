# Overlay Pipeline — Session 8 Handoff

**Version: v7.02** | Date: 2026-03-04 | Session: 8 of 10 | Status: COMPLETE

## What Was Built

Session 8 delivers the Save/Apply CTA + Stage Picker.

### CTA State Machine
- **Unsaved job**: single full-radius "Save Job" button → writes `stage=saved` via pipeline-write EF → transitions to split-button
- **Saved job**: split button (`✓ [Stage]` + `▾` chevron) → opens stage dropdown above toolbar

### Stage Picker
- Stages: Saved (rank 1) → Applied (rank 2) → Interview (rank 3) → Offer (rank 4)
- Forward-only: stages below current rank are disabled
- All writes via pipeline-write EF (S5) — no new EF

## Files Changed
- `extension/toolbar-overlay.js` v1.3.0
- `js/version.js` → v7.02
- `js/app.js` console → v7.02
- `dashboard.html` ?v= → v7.02
- `index.html` → v7.02
- `CHANGELOG.md` v7.02 entry
- `roadmap.html` S3–S10 cards added

## Verification
```
curl -s https://brilliantjobs.app/js/version.js
→ var BJ_VERSION = 'v7.02'; ✅ CONFIRMED
```

## Next: Session 9
overlay_analytics instrumentation, Analytics sub-page, cross-browser QA.
