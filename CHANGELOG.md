# Changelog

## v2.44 — 2026-02-15
- **Keyword extraction**: Strip HTML artifacts (e.g., `/li /ul`, `mdash /span`) from bigrams/trigrams via `KW_HTML_JUNK` blocklist and improved tokenizer
- **Tuning page**: Fix dropdown clipping — removed `overflow:hidden` from `.tuning-card` so company/location typeahead dropdowns render fully
- **Resume CTAs**: Solid filled buttons (Download blue, Rename gray, Archive amber, Delete red) with white text. No more pill-style or text links
- **Resume downloads**: IndexedDB file store (`bj_resume_files`) — file blobs saved on upload, Download button retrieves and triggers browser download
- **Application toggles**: Fixed notification settings toggles stretching full-width — `.toggle-switch` no longer inherits `flex:1` from label rule
- **Setup page dots**: Unified `.setup-dot` CSS class for GDrive and Gmail dots, consistent with Extension's `.ext-dot`. All three sections aligned

## v2.43 — 2026-02-15
- **Pipeline**: "Day Applied" column (shows date, replaces "Days to Apply"); "Days In Stage" column with stage-aware timing
- **Pipeline staleness dots**: Yellow/red indicators per stage (Saved 5/7d, Applied/Responded/Interview 7/14d)
- **Resumes**: Removed "Create by Level" button from upload zone

## v2.42 — 2026-02-15
- **Setup page**: Three independent card sections (Extension, GDrive, Gmail) with status dots in headers
- **GDrive dot**: Added initial gray background color

## v2.41 — 2026-02-15
- **"How this works →"** CTAs replace ? icon buttons on all page headers
- **Pipeline stage headings**: All standardized to `var(--text)` (black) — no more per-stage colors
- **Resume actions**: Changed from pill buttons to text links (later upgraded to solid CTAs in v2.44)
- **Coverage alert**: Neutral background with colored filter pills

## v2.40 — 2026-02-15
- **Pipeline redesign**: Table-based collapsible stages replacing kanban cards
- **Resume picker**: Popup on every apply action
- **Filter level assignment**: Per-filter level checkboxes with overlap detection popup
- **Resume page**: Filter-grouped layout with colored number badges
- **Per-page help icons**: Contextual help panels with numbered steps
- **Viewport overflow fix**: Body `overflow:hidden`, `.main` scrolls within viewport
- **Sticky resume stat boxes**: Pinned at top of Resumes page
- **"How Resumes Work" removed**: Explainer section removed
- **Roadmap**: Per-phase collapsible chevrons with phase names
- **Security P18**: 10 new items (RLS audit, API key scoping, etc.)

## v2.26 — 2026-02-14
- P4 keyword extraction and resume-to-JD matching
- Resume keyword display with tier-1/tier-2 chips
- Keyword insights panel with Skills, 2-Word, 3-Word tabs

## Earlier versions
See roadmap.html for full feature history across P0–P18.
