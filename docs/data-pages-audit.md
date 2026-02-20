# Data Pages Audit & Gap Analysis

**From:** Pod 1 (Growth) — CPO
**Date:** February 20, 2026
**Scope:** All public data/SEO pages (excluding index, terms, privacy)
**Status:** Audit complete, action items prioritized

---

## Pages Audited

| Page | URL | Charts | Live Data | Signup CTA | Last Updated Signal |
|------|-----|--------|-----------|------------|---------------------|
| Data Lab (hub) | `/data-lab` | 0 (cards only) | No — hardcoded | Weak (FAQ only) | Feb 18 static |
| Salary Data | `/salary-data` | 4 | No — hardcoded | **None** | Feb 18 static |
| Hiring Trends | `/hiring-trends` | 4 | No — hardcoded | **None** | Feb 18 static |
| Jobs by Industry | `/jobs-by-industry` | 4 | No — hardcoded | **None** | Feb 18 static |
| Career Level Data | `/career-level-data` | 4 | No — hardcoded | **None** | Feb 18 static |
| Market Dynamics | `/market-dynamics` | 3 (heatmaps + map) | **Yes — live Supabase** | **None** | **None** |
| Help | `/help` | 0 | No | No | N/A |

### Chart Inventory

**salary-data.html** — 4 charts:
- C1: Salary Bands — Distribution of Listed Salaries (bar)
- C2: Remote Premium — Salary Percentiles by Work Arrangement (grouped bar)
- C3: Department Compensation — Salary Ranges by Department with SD (dot-in-pill)
- C4: Salary Ladder — Average Salary by Career Level (bar)

**hiring-trends.html** — 4 charts:
- C1: Cumulative Growth — Cumulative Job Listings Over Time (area)
- C2: Weekly Velocity — New Jobs Discovered Per Week (bar)
- C3: Top Employers — Companies With Most Open Positions (horizontal bar)
- C4: Listing Duration — Days Open Before Closing (bar)

**jobs-by-industry.html** — 4 charts:
- C1: Job Volume — Open Positions by Industry (horizontal bar)
- C2: Compensation — Average Salary by Industry (horizontal bar)
- C3: Functional Areas — Jobs by Department (treemap)
- C4: Work Arrangement — Remote vs On-Site vs Hybrid (donut)

**career-level-data.html** — 4 charts:
- C1: Level Distribution — Job Postings by Seniority (funnel)
- C2: Salary Ladder — Average Salary by Level (bar)
- C3: Work Arrangement — Remote vs On-Site vs Hybrid (donut)
- C4: Remote Premium — Salary by Work Arrangement (grouped bar)

**market-dynamics.html** — 3 charts:
- C1: Heatmap — Where are companies hiring, by sector? (animated heatmap)
- C2: Heatmap — What levels are companies hiring for? (animated heatmap)
- C3: Choropleth — Where are the open jobs across the U.S.? (state map)

---

## Critical Gaps (P0 — Fix Now)

### 1. Zero conversion path on 5 of 6 data pages

**Problem:** Someone finds the salary data page via Google, sees great charts, and has no way to sign up. No CTA, no link to the landing page, no "see this for your search" prompt. These pages are SEO traffic magnets with no funnel.

**Fix:** Add a bottom CTA section to every data page. One line of copy + signup button. Match the dark theme. Examples:

- salary-data: "See salary data filtered to your job search — create a free account"
- hiring-trends: "Get notified when companies you care about post new jobs"
- jobs-by-industry: "Filter jobs by your industry and see what's hiring now"
- career-level-data: "Find jobs at your level with salary data included"
- market-dynamics: "Track hiring shifts in real time with a free account"

Also add a persistent nav link back to the landing page (logo/brand in header should link to `/`).

**Effort:** 0.5 day
**Impact:** Direct conversion from organic/SEO traffic. Currently 100% of data page visitors have no conversion path.

### 2. market-dynamics.html exposes anon key and queries ats_jobs directly

**Problem:** market-dynamics.html contains the raw Supabase anon key and runs `SELECT * FROM ats_jobs LIMIT 10000` via the REST API. This is the same pattern that was locked down on the landing page with `get_landing_stats()`. After the CORS/RLS lockdown (which blocks anon reads on ats_jobs), this page is either already broken or has an RLS gap.

**Security concern:** Even if RLS blocks it, the anon key is exposed in client-side JS on a public page. The other 4 data pages don't have this issue because they use hardcoded data.

**Fix:** Replace the direct Supabase REST calls with a SECURITY DEFINER RPC function (similar to `get_landing_stats()`). The RPC returns only the aggregated data the heatmaps and map need — no raw job data exposed. Remove the anon key from the page source.

**Effort:** 0.5 day (RPC function + update page JS)
**Impact:** Security fix. May already be causing the page to fail for visitors.

---

## Important Gaps (P1 — Before Launch)

### 3. All data except market-dynamics is hardcoded mock data

**Problem:** Five pages show "Last updated: February 18, 2026" but the numbers never change. The charts are populated from hardcoded JS arrays, not live database queries. A page claiming daily updates with frozen data will lose credibility with both users and search engines. Google's helpful content guidelines penalize stale "freshness theater."

**Fix:** Build Supabase RPC functions to power each chart. The roadmap already lists the needed RPCs:

| RPC | Powers |
|-----|--------|
| `get_salary_distribution()` | salary-data C1 (salary bands) |
| `get_salary_by_arrangement()` | salary-data C2 (remote premium) |
| `get_salary_by_department()` | salary-data C3 (dept compensation) |
| `get_salary_by_level()` | salary-data C4 + career-level C2 (salary ladder) |
| `get_jobs_timeline()` | hiring-trends C1 (cumulative growth) |
| `get_weekly_velocity()` | hiring-trends C2 (weekly new jobs) |
| `get_top_companies()` | hiring-trends C3 (top employers) |
| `get_listing_lifespan()` | hiring-trends C4 (days open) |
| `get_jobs_by_industry()` | jobs-by-industry C1+C2 (volume + salary) |
| `get_jobs_by_department()` | jobs-by-industry C3 (functional areas) |
| `get_remote_breakdown()` | jobs-by-industry C4 + career-level C3 (work arrangement) |
| `get_jobs_by_level()` | career-level C1 (seniority funnel) |
| `get_hub_stats()` | data-lab stat cards |

All RPCs should be SECURITY DEFINER functions returning only aggregated data. Cache results with daily refresh (similar to landing page stats caching pattern — localStorage with TTL).

**Effort:** 2–3 dev days (RPCs + update all 5 pages to fetch live data)
**Impact:** Data credibility, SEO freshness signals, accurate numbers. Currently the pages show data from Feb 18 indefinitely.

**Roadmap ref:** `Supabase RPC for chart data` (Phase 11, todo)

### 4. No data source transparency on 3 pages

**Problem:** `/hiring-trends`, `/career-level-data`, and `/market-dynamics` don't explain where the data comes from. The hub and salary pages do (in FAQ). For SEO credibility and AI citation, every data page should have a methodology note.

**Fix:** Add a one-sentence methodology footer to each page:

> "Data from [N]+ job listings across [N]+ company career pages on 5 ATS platforms (Greenhouse, Lever, Ashby, Workable, Recruitee). Updated daily."

Use live counts if RPCs are available (from gap #3), or hardcode current numbers as interim.

**Effort:** 0.5 day
**Impact:** Trust signal for users, journalists, AI systems citing the data. E-E-A-T signal for Google.

---

## Medium Gaps (P2 — Post-Launch Sprint)

### 5. No geographic data page

**Problem:** You have location data on 73.8% of jobs (210K/285K). You have a U.S. state map on market-dynamics. But there's no dedicated page answering "Where are the jobs?" broken down by state, metro, or region. This is a high-value SEO keyword cluster: "jobs by state 2026", "best cities for tech jobs", "remote jobs by location."

**Fix:** Build `/jobs-by-location` with:
- U.S. state choropleth (port from market-dynamics, make it the hero chart)
- Top 20 metros by job count (horizontal bar)
- Salary by region (bar or map overlay)
- Remote % by state (could be a second map view)

Requires: `get_jobs_by_state()` and `get_jobs_by_metro()` RPCs. Location data already exists in `loc_state` and `loc_city` columns.

**Effort:** 1–2 dev days
**Impact:** New SEO keyword cluster, fills obvious content gap (every competitor has location data)

**Roadmap ref:** `Interactive jobs/capita metro map` + `Metro comparison pages` (Phase 11, todo)

### 6. Dynamic "last updated" timestamp on market-dynamics

**Problem:** market-dynamics is the only page pulling live data, but it doesn't show when the data was last refreshed. Every other data page has a static "Last updated" line.

**Fix:** Query the most recent `updated_at` from the data and display it. Or use a simpler approach — show today's date since the data refreshes continuously via the 10-min cron cycle.

**Effort:** 0.5 day (trivial if done alongside gap #2 RPC work)
**Impact:** Freshness signal, consistency with other pages

### 7. Mobile chart readability

**Problem:** Charts use `rotate:35` on x-axis labels. On mobile, 9 career levels or 15 industries on a bar chart are unreadable — labels overlap or truncate. The career-level salary ladder screenshot showed this clearly.

**Fix:** Add responsive chart configs: switch to horizontal bars on mobile (< 640px) where the y-axis labels have more room. Or reduce label count on mobile (show top 8 instead of 15 industries). ECharts supports media queries in option configs.

**Effort:** 1 day (across all 5 chart pages)
**Impact:** Mobile usability. If 50%+ of SEO traffic is mobile, half your audience sees broken charts.

---

## Future Gaps (P3 — Roadmap Items)

### 8. Programmatic company SEO pages

Individual company pages (`/company/amazon`) with job count, departments hiring, salary ranges, growth trend, ghost rate. Scales to thousands of pages. Requires RPCs + template engine.

**Roadmap ref:** `Programmatic company SEO pages` (Phase 11, todo)
**Effort:** 2–3 dev days for template + first batch
**Dependency:** RPC infrastructure from gap #3

### 9. Comparison tools / interactive elements

No page lets you compare (industry vs. industry, level vs. level, metro vs. metro). Even a simple toggle ("Tech vs. Finance salary comparison") would add engagement and SEO value. Related: `Metro comparison pages` in roadmap.

**Effort:** 2–3 dev days
**Dependency:** Live data RPCs

### 10. Company ghost rate reports

SEO pages showing employer hiring accountability scores. Requires application outcome data that doesn't exist yet.

**Roadmap ref:** `Public company ghost rate reports` (Phase 11, todo)
**Dependency:** Application volume from users (post-launch data collection)

---

## Summary — Action Priority Matrix

| Priority | Gap | Effort | When | Owner |
|----------|-----|--------|------|-------|
| **P0** | Signup CTA on all data pages | 0.5 day | Now | Pod 2 |
| **P0** | Fix market-dynamics security (anon key + direct query) | 0.5 day | Now | Pod 2 |
| **P1** | Supabase RPCs for live chart data (all pages) | 2–3 days | Before launch | Pod 2 |
| **P1** | Data source/methodology note on 3 pages | 0.5 day | Before launch | Pod 2 |
| **P2** | Geographic data page (`/jobs-by-location`) | 1–2 days | Post-launch sprint 1 | Pod 2 |
| **P2** | Dynamic "last updated" on market-dynamics | 0.5 day | With RPC work | Pod 2 |
| **P2** | Mobile chart responsiveness | 1 day | Post-launch sprint 1 | Pod 2 |
| **P3** | Company SEO page template | 2–3 days | Post-launch | Pod 2 |
| **P3** | Comparison tools | 2–3 days | Post-launch | Pod 1 design + Pod 2 |
| **P3** | Ghost rate reports | TBD | Post-launch (data dependent) | Pod 1 + Pod 2 |

**Total pre-launch effort for P0+P1:** ~4 dev days
**Total post-launch effort for P2:** ~3 dev days

---

*This audit was produced by Pod 1 (Growth). Pod 2 has authority on RPC architecture and security remediation approach.*
