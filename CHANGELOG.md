## v5.88 — Multi-Model Template Validation (2026-02-28)

- **Item #14 complete (Pod 1)**: Created multi-model template validation specification for the Content Engine. Defines 6 validation layers: structure, data fidelity, voice, volumetrics, entity density, and deduplication.
- **Validation architecture**: Model-agnostic, deterministic checks (regex + math) that run in Edge Function runtime. No LLM-in-the-loop for validation.
- **Data fidelity rules (DF-1 through DF-6)**: Cross-references every number in generated content against source `story_data` context. Catches hallucinated statistics, reversed comparisons, and false superlatives.
- **Voice validation**: Programmatic enforcement of Brand Voice Brief — detects meta-commentary, excessive hedging, banned vocabulary, and missing number-first ledes.
- **Retry logic**: Failed content gets up to 2 retries with rejection reasons appended to generation prompt. Hard-fail (data fidelity) vs soft-fail (voice) severity levels.
- **Database additions**: `validation_score`, `validation_result` (jsonb), `retry_count`, `model_used`, `generation_latency_ms` columns for `content_stories` table.
- **Deliverable**: `docs/CONTENT_ENGINE_MULTI_MODEL_VALIDATION.md` committed to repo.
- **Version surfaces**: version.js v5.88, index.html v5.88, dashboard.html v5.88 (comment + cache-bust ?v=5.88), CHANGELOG.md updated.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.87 — Version Discipline Sync (2026-02-28)

- **Pod 1 version discipline pass**: Synchronized all version surfaces per DEPLOYMENT_PROCESS.md requirements.
- **version.js**: v5.83 → v5.87 (single source of truth).
- **index.html HTML comment**: v5.81 → v5.87.
- **dashboard.html HTML comment**: v5.80 → v5.87.
- **dashboard.html cache-bust params**: ?v=5.78 → ?v=5.87 (JS bundle + CSS).
- **CHANGELOG.md**: Added v5.84–v5.87 entries to close version gap.
- All 6 Data Lab + pricing + roadmap pages use .bj-version / #rm-version (auto-populated by version.js) — no manual update needed.
- All version increments follow VERSION_METHODOLOGY.docx in the repository.

## v5.86 — AI-Friendly Content Blocks (2026-02-28)

- **Item #13 complete**: Added 10 AI-friendly content blocks across all 6 Data Lab pages + hub page. Semantic `<section class="ai-block">` wrappers with `data-ai-*` attributes (topic, summary, source, updated, metric, scope) for LLM extraction, search enrichment, and freshness signals. Zero visual impact via invisible pseudo-elements.
- **AI blocks by page**: salary-data (2), hiring-trends (2), career-level-data (1), jobs-by-industry (2), market-dynamics (2), data-lab hub (1).
- **Version surfaces**: version.js v5.86, CHANGELOG.md updated.

## v5.85 — Quotable Insight Statements (2026-02-28)

- **Item #11 complete**: Added 10 quotable insight statements across all 6 Data Lab pages + hub page. Semantically marked up `<figure>`/`<blockquote>`/`<figcaption>` elements for AI/LLM citation, social sharing, and featured snippets.
- **Version surfaces**: version.js v5.85, CHANGELOG.md updated.

## v5.84 — Client-Side Aggregation Confirmation (2026-02-28)

- **Item #10 confirmed**: Client-side aggregation on Data Lab pages verified as already complete. No additional implementation needed.
- **Version surfaces**: version.js v5.84, CHANGELOG.md updated.

## v5.83 — Pod 2 Content Strategy Sprint (2026-02-28)

- **Item #1 complete**: Added tier-aligned CTAs (Free/Starter $20/Pro $40) to all 6 Data Lab pages with "Start Free" + "See Plans" buttons linking to dashboard signup and pricing page.
- **Item #2 complete**: Fixed market-dynamics anon key exposure — migrated from direct REST API calls (`/rest/v1/table`) to RPC-based pattern (`/rest/v1/rpc/get_*`). Created 3 new Supabase RPC wrappers: `get_mv_industry_dept_week()`, `get_mv_dept_level_week()`, `get_mv_state_week()`. Reduces API surface area to defined function signatures.
- **Item #3 complete**: Added methodology footer to data-lab.html hub page (was the only Data Lab page missing it). Describes data sources, ATS platforms, refresh cycles, and classification methodology.
- **Item #6 complete**: Added FAQPage schema to market-dynamics.html (was the only Data Lab page missing it). 4 questions aligned to entity extraction cluster 5 recommendations: geographic shifts, labor market data, state-level openings, regional industry shifts.
- **Item #17 complete**: Added mobile chart responsiveness CSS to all 6 Data Lab pages. Charts now use `min-height` with auto sizing below 640px, stat grids switch to 2-column layout, and chart cards gain horizontal scroll for overflow.
- **Version surfaces**: version.js v5.83, CHANGELOG.md updated.
- **Database**: 3 new RPC functions created (get_mv_industry_dept_week, get_mv_dept_level_week, get_mv_state_week) with anon EXECUTE grants.

## v5.82 — DataForSEO Entity Extraction for Data Lab (2026-02-28)

- **Item #5 complete**: Ran DataForSEO Keywords Data API (Search Volume + Keywords for Keywords) across 6 Data Lab keyword clusters.
- **50 keywords analyzed**: Search volume, competition, CPC data for salary-data, hiring-trends, career-level-data, jobs-by-industry, market-dynamics, and data-lab hub pages.
- **Key findings**: career-level-data has highest volume cluster (2,400/mo for "[role] salary entry level" patterns). "Salary transparency" (1,600/mo) is the anchor for salary-data page. "Hiring velocity" (480/mo) validates hiring-trends H1. "Labor market data" (480/mo) is the real anchor for market-dynamics, not "market dynamics."
- **FAQ schema recommendations**: 4 questions per page, prioritized by volume. Feeds directly into Item #6 (Pod 2).
- **Entity overlap map**: Cross-linking strategy between salary-data ↔ career-level-data, salary-data ↔ jobs-by-industry, hiring-trends ↔ market-dynamics.
- **Zero-volume keywords flagged**: 8 target keywords return zero volume — reframe recommendations included.
- **Deliverable**: docs/entity-extraction-results.md committed to repo.
- **Version surfaces**: version.js v5.82.

## v5.81 — Content Strategy Persona Alignment (2026-02-28)

- **Fiorelli AI Content Framework audit**: Applied persona-driven copy, direct-answer H2s, and entity strategy across all Data Lab pages.
- **salary-data.html**: Title → "Job Market Salary Data 2026", H1 → "What Companies Are Actually Paying in 2026", persona-aligned intro, direct-answer H2s.
- **hiring-trends.html**: Title updated, H1 → "How Fast Is the Market Moving Right Now?", persona-aligned intro, 3 direct-answer H2s.
- **career-level-data.html**: Title → "Where You Fit in the Market", H1 updated, persona-aligned intro, direct-answer H2.
- **jobs-by-industry.html**: Title → "Which Sectors Are Hiring & What They Pay", H1 updated, persona-aligned intro, 2 direct-answer H2s.
- **market-dynamics.html**: H1 → "Where the Jobs Are Moving", persona-aligned intro, 5 direct-answer H2s.
- **data-lab.html**: H1 → "Market Intelligence Lab", persona-aligned intro.
- **index.html**: Schema offers updated from "free during beta" to Free/Starter($20)/Pro($40) tiers. Social proof bar gains Data Lab methodology link.
- **Pod 1 deliverables**: Brand Voice Brief, Agent Definition, Volumetric Specs created for Content Engine handoff.
- **Version surfaces**: version.js v5.81, index.html v5.81.

## v5.80 — FCD Roadmap Update (2026-02-28)

- **Phase 66 added**: FCD Pipeline Cleanup (v5.78) — 2 done cards (cleanup deploy + Supabase infra).
- **Phase 67 added**: FCD Data Loading — 3 todo cards (run filter, upload data, activate cron).
- **Card flipped**: FCD pipeline Step 3 cron → done (job 63 created, disabled).
- **Version surfaces**: version.js v5.80, dashboard.html v5.80, index.html v5.80.

## v5.79 — FCD Enrichment Complete + Roadmap Update (2026-02-28)
- **FCD backfill complete**: 28,898/39,123 companies enriched with industry (73.9%), 24,956 with locality (63.8%)
- **US companies with jobs**: 78.8% industry coverage, 76.1% locality coverage
- **5-strategy matching**: exact name, LinkedIn slug→ATS slug, domain, unsquished slug (v1+v3 local scripts)
- **145 false-match records cleaned**: bananeiras/quadra locality clusters NULLed
- **Roadmap cards flipped**: Industry enrichment pass (done), FCD Step 2 (progress), Enrich unmatched boards (done), AI pilot (done), AI backfill (progress)
- **Blockers removed**: Jobs by Location page, Multi-dimensional insight stories now unblocked
- **JD AI enrichment**: 82.4% complete (93,289/113,179 jobs), cron running autonomously
- Handoff doc: fcd-enrichment-pipeline-handoff.docx for ongoing automated pipeline


## v5.78 — FCD Pipeline Cleanup (2026-02-28)

- **Deleted superseded PDL scripts**: Removed `scripts/filter-pdl.py`, `scripts/upload-pdl-filtered.sh`, and `supabase/functions/enrich-pdl-batch/` directory — all replaced by FCD equivalents in v5.76/v5.77.
- **Roadmap PDL→FCD rename**: Updated 6 remaining PDL references in roadmap.html (Steps 1-3 descriptions, Phase 22 card, Phase 59 card) to reference filter-fcd.py, enrich-fcd-batch, and fcd-enrichment bucket.
- **Version surfaces**: version.js v5.78, dashboard.html v5.78, index.html v5.78, CHANGELOG.md.

## v5.77 — FCD Enrichment Pipeline Production Deploy (2026-02-28)

- **FCD pipeline merged to dev**: filter-fcd.py (streams 10 GB FCD, filters by non-null industry, extracts linkedin_slug + domain), upload-fcd-filtered.sh (targets fcd-enrichment bucket), enrich-fcd-batch Edge Function (5 matching strategies: exact name, LinkedIn slug, domain, unsquished slug, Jaccard overlap). Writes 8 fields to NULL columns only.
- **Edge Function live**: Deployed enrich-fcd-batch with --no-verify-jwt. Processes max 200 boards/run within 140s wall time. Logs strategy breakdown to audit_log.
- **pg_cron job**: Old job #62 to be unscheduled. New enrich-fcd-batch job configured for weekly Sunday 3 AM UTC (DISABLED pending manual testing).

## v5.76 — Extension Update Notification + Roadmap Cleanup (2026-02-28)

- **REQUIRED_EXTENSION_VERSION bumped** from 2.11.0 → 2.17.0 in js/app.js (was stale since v5.75 ATS handler expansion)
- **Extension update flow verified**: Nav dot amber on version mismatch, Setup page shows update banner with installed vs required version, download CTA triggers /api/build-extension
- **Roadmap line 572**: Extension update notification marked done
- **Roadmap line 575**: ATS API key scraping marked done — 224 keys scraped (203 embed_js + 21 iframe), schema ready with api_key_encrypted/api_key_source/api_key_scraped_at columns, discover-boards integration pending coverage expansion

## v5.75 — Expand ATS Handler Coverage (2026-02-28)

- **4 new ATS fill handlers**: iCIMS (`*.icims.com`), Taleo/Oracle (`*.taleo.net`), SmartRecruiters (`jobs.smartrecruiters.com`), Avature (`*.avature.net`) — ~200-280 lines each following established handler pattern
- **contentScript.js router**: Added detection entries for all 4 platforms (hostname matching), JD extraction selectors, title selectors, company name selectors
- **manifest.json**: Added 5 new host_permissions + content_scripts matches for the 4 ATS domains. Extension version bumped to 2.17.0
- **Handler capabilities**: Text input fill, select/custom dropdown fill, radio/checkbox fill, resume upload, cover letter upload, smart question mapping (authorization, visa, salary, etc.)
- **Supported ATS platforms now: 13** — Greenhouse (legacy + React), Lever, Ashby, Workable, Recruitee, LinkedIn Easy Apply, Indeed, Workday, iCIMS, Taleo, SmartRecruiters, Avature, plus Generic fallback
- **Version surfaces**: version.js v5.75, dashboard.html v5.75, index.html v5.75, cache-bust params v5.75, CHANGELOG.md

## v5.74 — Location Normalization v2 (2026-02-28)

- **normalize_locations_v2 RPC** — New PostgreSQL function that composes `location_normalized` from structured fields (`loc_city`, `loc_state`, `loc_country`, `is_remote`)
- **+162,067 jobs normalized** — Coverage jumped from 41.4% → 92.2% (132K → 294K of 319K open jobs)
- **Per-ATS results:** Workable 100%, Recruitee 100%, USAJobs 100% (was 0%), Lever 92.8%, Ashby 90.2%, Greenhouse 89.1%
- **8-pass normalization strategy:** Remote (no city), Remote (with city/state), US structured, Non-US structured, US state-only, Country-only, USAJobs direct, Pattern matching
- **Remaining gaps (~25K):** Company-specific labels, multi-location strings without structured data, ambiguous city-only entries — requires geocoding API or AI extraction for future pass

## v5.73 — 2026-02-28
- **Dynamic SEO counts**: Created `get_seo_stats()` Supabase RPC (SECURITY DEFINER) returning live open_jobs, companies, active_boards, with_salary, salary_pct counts. Created `js/seo-stats.js` — shared hydrator that calls the RPC on page load, replaces hardcoded count text with live data via `.seo-jobs-k`, `.seo-jobs-full`, `.seo-companies-k`, `.seo-salary-count`, `.seo-salary-pct` class selectors. Results cached in sessionStorage (30 min TTL). Hardcoded values remain as SSR/SEO fallback for crawlers that do not execute JS.
- **FCD rename**: Renamed all "PDL" references across roadmap, methodology text, and phase names to "Free Company Dataset" (FCD). The data source is the free_company_dataset.json file (10 GB, company name/industry/size/location structure — no ATS URLs). Matching uses company name fuzzy logic against ats_companies.
- **6 SEO pages updated**: data-lab, career-level-data, hiring-trends, jobs-by-industry, market-dynamics, salary-data — all now include `seo-stats.js` and use dynamic count spans.
- **Version surfaces**: version.js v5.73, dashboard.html v5.73, index.html v5.73, CHANGELOG.md, roadmap.html Phase 62.

## v5.72 — 2026-02-28
- **SEO count accuracy sweep #2**: Updated job counts from 320K+→315K+ across 7 SEO pages — data-lab, career-level-data, hiring-trends, jobs-by-industry, market-dynamics, salary-data, and index.html structured data. Actual open jobs: 317,834 (down from 320,053 in v5.66 due to normal job closures).
- **Salary data count update**: Updated from 40K→49K salary-listed jobs (actual 49,876, 16% of total — up from 13% in v5.66). Updated salary-data.html methodology text.
- **Roadmap backfill**: Added missing roadmap entries for v5.67–v5.72 (Phases 57–61). Six versions of documentation gap closed. Phase names added.
- **Version surfaces**: version.js v5.72, dashboard.html comment + cache-bust v5.72, index.html comment v5.72, CHANGELOG.md updated.

## v5.71 — 2026-02-28
- **Version discipline fix**: Corrected stale v5.68 references in dashboard.html (HTML comment, JS cache-bust, CSS cache-bust) and index.html (HTML comment) to v5.71. Added missing v5.70 CHANGELOG entry. All version surfaces now aligned: js/version.js, dashboard.html comment, dashboard.html cache-busts, index.html comment, CHANGELOG.md.

## v5.70 — 2026-02-28
- **PDL pipeline Step 1: filter script + Edge Function**: Built filter-pdl.py (Python local streamer for 10 GB PDL dataset, ~100 MB RAM, extracts ATS-matching companies). Built enrich-pdl-batch Edge Function (3-strategy matching: LinkedIn URL, website domain, corroborated name; 200 boards/run; conditional upsert — only fills NULLs). Added pg_cron Job 62 (weekly Sun 3AM UTC, DISABLED awaiting Step 2 data upload). Schema-validated against live ats_companies (slug/source PK). Disabled legacy manual enrichment cron.

## v5.69 — 2026-02-28
- **Install instructions page**: Created /install with 7-step guide for Chrome extension installation — download, unzip, Developer mode, Load unpacked, pin, troubleshooting, and update workflow. Consistent with help.html styling (light theme, step-based layout, Outfit + JetBrains Mono fonts).
- **Roadmap hygiene: 3 completed cards marked done**: "Location normalization for non-GH platforms" (v5.60+v5.67+v5.68, 78.6%→90.1%), "Salary parsing for non-GH platforms" (v5.61, Lever+Recruitee), "Install instructions page" (this version).
- **Roadmap status**: 828 done, 124 todo, 5 in progress.

## v5.68 — 2026-02-27
- **Multi-ATS location normalization — Lever/Ashby/GH remaining gaps**: Normalized 12,562 additional jobs across Greenhouse, Lever, and Ashby platforms. Coverage: 86.2%→90.1% (275,845→288,407 jobs with loc_country).
- **Indian state matching**: Recognized 30+ Indian states/territories (Karnataka, Maharashtra, Tamil Nadu, etc.) across all platforms.
- **UK county/region matching**: Recognized 60+ UK counties (Greater London, West Midlands, Hampshire, etc.) for City-County patterns.
- **Country-prefix reversal**: Resolved "Country, City" reversed format ("New Zealand, Auckland", "India, Ahmedabad") across 40+ countries.
- **US state patterns**: Matched "State - City" (Lever) and "City, ST" (GH) patterns for all 50 US states.
- **Canadian province, Australian state, Brazilian state matching**: Province names, abbreviations, state codes.
- **Country-dash-City patterns**: Resolved "India - Bengaluru", "Malaysia - Kuala Lumpur", "Hungary - Budapest" across 50+ countries.
- **Ashby coded formats**: Parsed US-CA-Menlo Park, AU-Sydney, GB-London ISO-style and "City, ST - US" convention.
- **Remote pattern normalization**: Resolved 20+ remote variants across all platforms.
- **Known city resolution**: Mapped 120+ unambiguous world cities to their countries.
- **Emoji flag, German region, Mexican state matching**: Extended pattern coverage.
- **Remaining gaps**: GH 20,178, Lever 6,559, Ashby 4,907 — mostly company-specific labels, multi-location semicolons, and ambiguous city names.

## v5.67 — 2026-02-27
- **GH location normalization — US states**: Normalized 536 Greenhouse jobs with "State, United States" patterns (all 50 states + DC). Sets loc_state, loc_country, loc_display. Created `normalize_gh_us_states()` RPC.
- **GH location normalization — 65+ countries**: Normalized country-only strings (Canada, Brazil, Germany, etc.) across Greenhouse, Lever, Ashby, Workable. Handles exact match, case variants, whitespace, (Remote)/(Hybrid) suffixes.
- **Multi-ATS remote pattern normalization**: Resolved US-remote variants ("Remote", "US - Remote", "Remote (US)", "USA - Remote", etc.) and international remote patterns across all platforms.
- **City-level pattern matching**: Normalized São Paulo/SP, Belo Horizonte/MG, Mexico City, Hong Kong, Sofia, Budapest, Dublin/IE, Auckland/NZ, Washington D.C., Bay Area patterns.
- **Coverage improvement**: Location coverage 251,444→286,529 (78.6%→89.5%). 35,085 jobs gained location data. Remaining 33,519 jobs need geocoding API or are multi-location strings.

# Changelog

## BLOCKERS
- **Resend domain verification**: `brilliantjobs.app` domain not verified in Resend. DNS records (SPF, DKIM, DMARC) are all present and resolving correctly in Cloudflare DNS. DKIM verified, SPF shows failed in Resend. Resend dashboard throwing server-side error (Next.js SSR crash) — cannot access /domains page. Google OAuth redirect loops to accounts.youtube.com/accounts/SetSID. API key is send-only (cannot manage domains via API). **Need**: Either fix Resend dashboard access (try incognito with only brilliantjobsapp@gmail.com signed in), create a full-access API key, or contact support@resend.com. Once verified, all notification emails unlock.
- **SEO redirect (Item 3)**: `http://brilliantjobs.app` and `http://www.brilliantjobs.app` return 308 to `https://vercel.com/` instead of `https://brilliantjobs.app`. Requires manual fix in Vercel Dashboard (domain config) + Cloudflare DNS (ensure DNS-only mode). See Pod 2 Handoff doc for exact steps. Cloudflare API token lacks DNS edit permissions — needs manual dashboard access.

## v5.56 — 2026-02-27
- **On-Page Status Overlay (Competitive Gap Item #3)**: Floating bottom-right widget showing real-time fill progress during autofill
  - New module `extension/inject-overlay.js`: animated overlay with progress bar, per-field status, success/error states
  - Auto-dismisses after completion (5s success, 8s error), click-to-dismiss
  - Wired into `contentScript.js` `handleFillRequest()` — shows progress, field results, final state
  - Matches FastApply/OwlApply floating overlay UX
- **Cover Letter Generation (Competitive Gap Item #4)**: AI-powered cover letter pipeline via Edge Function
  - New Edge Function `supabase/functions/generate-cover-letter/index.ts`
  - Claude Haiku for cost efficiency (~$0.001 per letter), 350-word max
  - Accepts JD + resume + profile, generates tailored cover letter
  - Rate limited (20 AI calls/day shared with score-resume), telemetry to `cover_letter_generations` table
  - Tone options: formal, conversational, default; emphasis keywords
- **Fill Metrics & Feedback Loop (Competitive Gap Item #5)**: Per-platform fill tracking + PostHog events + AI answer ratings
  - New module `extension/utils/fillMetrics.js`: tracks fill success/failure rates per ATS platform
  - PostHog event capture from extension (`extension_fill_completed`, `extension_ai_feedback`, overlay events)
  - Supabase persistence to `extension_fill_metrics` table with local buffer fallback
  - Thumbs up/down on AI answers feeding quality table
  - Wired into `contentScript.js` — auto-reports after every fill
- Extension version: 2.16.0
- Dashboard version: v5.56, bundle rebuilt, cache-bust updated
- `manifest.json`: Added `web_accessible_resources` for dynamic handler/overlay/metrics imports

## v5.55 — 2026-02-27
- **Generic/Universal Form Handler (Competitive Gap Item #1)**: DOM heuristic-based form filler that works on any ATS not covered by a dedicated handler
  - New module `extension/handlers/generic.js`: label/input association, name attribute pattern matching, placeholder text analysis, fuzzy-match approach
  - Falls back to `aiAnswerer.js` for unrecognized custom questions
  - Updated `extension/contentScript.js`: generic fallback routing when `detectATS()` finds no named handler but `_hasApplicationForm()` returns true
  - Doubles effective ATS coverage from 8 named platforms to 8 + any unknown site
- **Manifest Host Permissions Fix (Competitive Gap Item #2)**: Content scripts now auto-inject on all ATS pages on page load
  - `manifest.json`: added all known ATS domains to `host_permissions` + `content_scripts` auto-inject entry + `optional_host_permissions` for unknown/generic sites
  - `background.js`: `injectContentScriptIfNeeded()` via `chrome.scripting.executeScript` for dynamic injection, `INJECTED_TABS` tracking, SPA fallback, tab cleanup
  - Matches FastApply/Huntr/OwlApply auto-inject behavior while preserving narrow-permission security model
- Extension version: 2.15.0
- Dashboard version: v5.55, bundle rebuilt, cache-bust updated

## v5.54 — 2026-02-27
- **Indeed Anti-Bot Hardening (Item #6)**: Three-layer hardening for Indeed form filling
  - Randomized delays with log-normal distribution
  - Fingerprint masking: canvas noise, WebGL variation, navigator shimming
  - Request pattern variation: field order shuffling, revisit simulation, tab-away events
  - Extension version: 2.14.0

## v5.53 — 2026-02-27
- **Workday My Experience Auto-Fill (Item #5)**: Full multi-section employment + education history filling on Workday's "My Experience" page
  - New module `extension/handlers/workday-experience.js`: specialized handler for the My Experience wizard step
  - Work experience: fills job title, company, location, description for each entry from `profile.experience[]`
  - Education: fills school, degree, field of study, GPA for each entry from `profile.education[]`
  - Skills: tag-style skill input with autocomplete detection, adds up to 10 skills
  - "Add Another" button detection: dynamically adds entry containers when profile has more entries than visible on page
  - "I currently work here" checkbox: auto-checked when entry has no end date or end date is "Present"
  - 4-strategy Workday date picker:
    1. Direct month/year display field filling via data-automation-id
    2. Date section widget detection (combined month/year containers)
    3. Calendar popup navigation (arrow-based, up to 60 months in either direction)
    4. Fallback to standard date/month/text inputs
  - Searchable dropdown handling: character-by-character typing triggers autocomplete for company, school, degree fields
  - Date parsing from LinkedIn profile format ("Jan 2020", "January 2020", "2020", "Jan 2020 - Present")
  - Integrated into main `workday.js` fill loop — routes to specialized handler when page title matches "My Experience"
  - Extension version: 2.13.0 (unchanged — extension-side module, no manifest change needed)

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
