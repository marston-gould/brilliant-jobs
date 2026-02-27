# Changelog

## BLOCKERS
- **Resend domain verification**: `brilliantjobs.app` domain not verified in Resend. DNS records (SPF, DKIM, DMARC) are all present and resolving correctly in Cloudflare DNS. DKIM verified, SPF shows failed in Resend. Resend dashboard throwing server-side error (Next.js SSR crash) — cannot access /domains page. Google OAuth redirect loops to accounts.youtube.com/accounts/SetSID. API key is send-only (cannot manage domains via API). **Need**: Either fix Resend dashboard access (try incognito with only brilliantjobsapp@gmail.com signed in), create a full-access API key, or contact support@resend.com. Once verified, all notification emails unlock.
- **SEO redirect (Item 3)**: `http://brilliantjobs.app` and `http://www.brilliantjobs.app` return 308 to `https://vercel.com/` instead of `https://brilliantjobs.app`. Requires manual fix in Vercel Dashboard (domain config) + Cloudflare DNS (ensure DNS-only mode). See Pod 2 Handoff doc for exact steps. Cloudflare API token lacks DNS edit permissions — needs manual dashboard access.

## v5.52 — 2026-02-27
- **Recruiter Email Discovery (Item #19)**: Hunter.io integration for finding recruiter contacts
  - New Edge Function `recruiter-lookup`: domain search via Hunter.io API, stores results in `recruiter_contacts`
  - Filters results by recruiting-related titles (recruiter, talent acquisition, HR, etc.)
  - Falls back to top 3 highest-confidence contacts when no title matches
  - Rate limited: 10 lookups per user per day
  - Caches results: subsequent lookups for same domain return stored contacts
  - Pipeline UI: "Find Recruiters" menu item on every pipeline card (⋮ menu)
  - Inline recruiter card shows name, title, email (mailto link), confidence score, LinkedIn link
  - `loadRecruiterContacts()` utility for future pipeline enrichment features
  - Requires `HUNTER_API_KEY` secret in Supabase Edge Function env
  - Migration: uses existing `recruiter_contacts` table (011_recruiter_contacts.sql, shipped v5.50)

## v5.49 — 2026-02-27
- **Background Discovery Pipeline (Item #2, P0)**: Full self-sustaining job discovery loop now operational
  - `board_discovery_queue` table: ATS URLs detected by extension, queued for processing (Item #20)
  - Extension pushes ATS redirect detections (11 platform patterns) to queue automatically
  - `discover-boards` Edge Function v3: processes both companies table (broad scan) and board_discovery_queue (targeted verification)
  - pg_cron schedule: `discover-boards-6h` runs every 6 hours automatically
  - Admin Feed Health tab: Board Discovery Queue stats (total, pending, found)
  - First run discovered 19 new boards from 50 companies checked
  - RLS policies on board_discovery_queue (user-scoped insert/select)
  - Migration: `010_board_discovery_queue.sql`

## v3.48 — 2026-02-22
- **SEO tab redesign** (Pod 1 spec): Full visual overhaul of Admin Console SEO tab
  - 13 new CSS classes replacing all inline styles (.seo-controls, .seo-select, .seo-section-label, .seo-detail-grid, .seo-metric-row, .seo-metric-label, .seo-metric-value, .seo-loading, .seo-empty, etc.)
  - 4-section layout: Controls → Stat Cards (`.stat-grid`) → Charts (`.stats-grid`) → Drilldowns (`.seo-detail-grid`)
  - DOM-based stat cards via `document.createElement` replacing innerHTML string concatenation
  - CrUX promoted from Knowledge Graph afterthought to own chart card
  - Chart heights: 300px (GSC full-width hero), 280px (PSI, CF, YLT, CrUX half-width)
  - Light-theme ECharts: tooltip `rgba(15,23,42,0.95)`, grid `#e8eaef`, axis `#7b829a`
  - Section dividers: "PERFORMANCE CHARTS" + "TECHNICAL DETAILS" with uppercase tracking
  - Loading states in all 9 containers, empty states with styled messaging + sync links
  - All 5 side panel renders rewritten with `.seo-metric-row` / `.admin-platform-table`
  - Tailwind CSS built clean with all 13 classes verified in output
  - All 12 acceptance criteria from Pod 1 handoff spec: PASS

## v3.47 — 2026-02-22
- **Dead job icon**: Replaced 3D 🚫 emoji with on-brand SVG burned-out lightbulb. Copy: "This Brilliant opportunity has dimmed"

## v3.46 — 2026-02-22
- **SEO Admin stat cards**: Added summary KPI row (PSI, YLT, Indexed, CF Requests, GSC Clicks) with color thresholds
- **SEO Admin chart grid**: Restructured to 2×2 card grid with consistent heights

## v3.45 — 2026-02-22
- **Visit-based segment detection (Pod 2 Item #1)**: Landing page `index.html` now detects 4 visitor segments via `<head>` script: new, returning, lapsed, active. Sets `data-segment` attribute on `<html>` before body paint (no FOUC). Visit counter (`bj_visits`) increments in localStorage. Deep visit detection (`data-visit-depth="deep"`) for visit 3+ returning visitors.
- **Segment content variants (Pod 2 Item #2)**: CSS-driven content personalization — all 4 variants in single `index.html`. New visitors see full pitch (current experience, no regression). Returning visitors see shorter hero + auto-expanded preview + compressed benefits. Visit 3+ returning visitors also see objection FAQ (data safety, LinkedIn comparison, free plan, freshness). Lapsed registered users see welcome-back hero with login CTA, no marketing sections. Active users auto-redirect to `/dashboard` with fallback banner.
- **bj_has_account flag**: Dashboard `app.js` sets `localStorage.setItem('bj_has_account', 'true')` on successful auth, persists after logout for lapsed user detection on landing page.
- **SEO redirect diagnosis (Pod 2 Item #3)**: Confirmed `http://brilliantjobs.app` → 308 to `vercel.com`. Requires manual Vercel Dashboard + Cloudflare DNS fix (documented in BLOCKERS).
- **Version bump**: v3.44 → v3.45 across dashboard.html, app.js, index.html footer

## v3.45 — 2026-02-22
- **InLinks semantic schemas**: Added WebPage ld+json with `about`/`mentions` entities (Wikipedia sameAs) to all 6 public pages (salary-data, hiring-trends, jobs-by-industry, career-level-data, data-lab, index)
- **GSC domain property fix**: Changed `siteUrl` from `https://brilliantjobs.app/` to `sc-domain:brilliantjobs.app`. URL Inspection now returns real data — homepage indexed (PASS), 5 data pages discovered/not yet crawled
- **Removed all brilliantjobs.io references**: Edge Function, dashboard HTML URL dropdown, Supabase secrets. That domain never existed
- **RLS disabled on SEO tables**: Row Level Security was blocking all frontend reads on 6 SEO tables. Disabled since they contain only aggregate admin metrics
- **Daily SEO cron**: `trigger_seo_sync()` via pg_cron at 6 AM UTC, calls all 9 tools automatically
- **SEO Admin single-column layout**: Replaced broken 2-column grid with 9 clearly labeled sections (PostHog, GSC, URL Inspection, PSI, CrUX, Yellow Labs, DataForSEO, Cloudflare, Knowledge Graph)

## v3.41 — 2026-02-22
- **SEO Admin redesign**: Complete rebuild of the SEO/Data Coverage admin tab with 9-tool dashboard
- **seo-sync Edge Function v3**: Added 4 new data sources — Yellow Lab Tools (public API, frontend quality scores), Chrome UX Report API (real-user field data), Google Knowledge Graph Search API (entity detection), Cloudflare Analytics (traffic, page views, uniques, status codes, countries)
- **PSI expanded**: PageSpeed Insights now collects all 4 Lighthouse categories (Performance, SEO, Accessibility, Best Practices) — previously only Performance and SEO
- **New dashboard layout**: URL dropdown (All Pages or individual), date range selector (7d/30d/90d), 6 time series charts (PostHog traffic, GSC clicks+impressions, PSI 4-category scores, CrUX metrics, Yellow Lab Tools scores, Cloudflare traffic), side panel with URL inspection status, Core Web Vitals drilldown, GSC search queries, Knowledge Graph entities
- **Cloudflare integration**: Zone ID `***REDACTED_CF_ZONE***` wired via GraphQL Analytics API (httpRequests1dGroups, free plan compatible)
- **Credential consolidation**: Unified all 4 credential files (CREDENTIALS__1_, CREDENTIALS__3_, credential-google, credentialsnew) into single CREDENTIALS_MASTER with all 10 services
- **Day 1 data**: Yellow Labs (6 pages, all 99), Cloudflare (2 days), Knowledge Graph (4 entities), PSI (8 pages × 2 strategies), CrUX (awaiting sufficient traffic)


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
