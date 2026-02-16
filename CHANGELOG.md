# Changelog

## BLOCKERS
- **Resend domain verification**: `brilliantjobs.app` domain not verified in Resend. DNS records (SPF, DKIM, DMARC) are all present and resolving correctly in Cloudflare DNS. DKIM verified, SPF shows failed in Resend. Resend dashboard throwing server-side error (Next.js SSR crash) — cannot access /domains page. Google OAuth redirect loops to accounts.youtube.com/accounts/SetSID. API key is send-only (cannot manage domains via API). **Need**: Either fix Resend dashboard access (try incognito with only brilliantjobsapp@gmail.com signed in), create a full-access API key, or contact support@resend.com. Once verified, all notification emails unlock.

## v2.60 — 2026-02-16
- **CRITICAL FIX — Resume scoring data path**: `toggleResumeFilter()` saves assignments to `resume.filterIds[]` (array of filter names on the resume object), but all scoring code checked `filter.resumeId` (a property on the filter object that was **never set**). This meant readiness analysis, feed match scores, and auto-analysis all silently found zero assignments and produced no scores. Fixed all three code paths: `initReadinessPanel`, `runReadinessAnalysis`, and `computeJobMatchScore` now read from `resume.filterIds`.
- **Feed match scoring fix**: `computeJobMatchScore()` was taking first 40 tokens from a `Set` in insertion order (document order = arbitrary). Now frequency-ranks terms within each JD — most-repeated skill terms score highest. This makes match scores meaningful.
- **Cache invalidation**: `toggleResumeFilter` now clears readiness cache and feed match scores when filter assignment changes, triggering fresh re-analysis.
- **Resend API key**: Set as Supabase Edge Function secret (`RESEND_API_KEY`). Confirmed working via test email through sandbox domain (`onboarding@resend.dev`). Blocked on domain verification (see BLOCKERS above).

## v2.59 — 2026-02-15
- **Resume readiness overhaul**: Auto-run analysis on Resumes page load (24h cache TTL, background refresh when stale)
- **Letter grades**: A+ through F scale on resume cards and feed Match column (replaces raw percentage). Grade scale: A+(90+), A(80+), B+(70+), B(60+), C+(50+), C(40+), D(30+), F(<30)
- **Inline insights**: "View insights ▸" expands directly on each resume card showing missing terms, covered terms, missing phrases, and level fit. No more scrolling to separate Readiness panel
- **Filter corpus caching**: `filterCorpusCache` stores ngram results per filter during analysis for reuse

## v2.58 — 2026-02-15
- **Notification system (P5)**: Full Applications page UI — notification preference matrix, phone verification section, escalation rules with timeout slider, per-filter overrides, notification history log
- **8 Edge Functions deployed**: send-notification, apply-on-notification, handle-notification-response, escalation-checker, daily-digest, weekly-summary, account-lifecycle, auth-hook
- **6 pg_cron schedules**: escalation checker (15min), daily digest (8am ET), weekly summary (Mon 8am ET), ghost scanner (daily), inactivity checker (daily), listing closer (daily)
- **18 email templates**: Shared template library in `_shared/email-templates.ts`
- **Pulsing nav dots**: CSS animation + `checkNavPulses()` on dashboard load

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
