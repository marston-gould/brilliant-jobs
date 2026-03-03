# Content Engine — Keyword Validation & Page Priority List

**From:** Pod 1 (Growth)
**Date:** February 25, 2026
**Purpose:** Unblock Pod 2 Phase 1 (Evergreen Page Infrastructure)
**Method:** DataForSEO Google Ads Search Volume API, 120 keywords across 8 categories, US market (location_code 2840)
**Cost:** ~$0.20 (4 bulk API calls × ~$0.05 each)

---

## Key Findings

**Total addressable keyword volume: 1.2M+ monthly searches across 120 keywords.**

Salary queries dominate (510K score), followed by role/industry (181K), job search (109K), and remote (80K). Location keywords have lower individual volume but massive long-tail potential across cities. Ghost/accountability keywords (10.8K combined for "ghost jobs" + "job ghosting") are low-competition blue ocean — zero competition index, unique to our positioning.

---

## Page Priority List — Ordered by Build Sequence

### TIER 1: Build Immediately (Phase 1 — Template Engine First Pages)

These have validated demand, low-to-moderate competition, and map directly to data we already have.

| # | Page | URL Pattern | Target Keywords | Combined Volume | Comp | Why Now |
|---|------|-------------|-----------------|---------------:|------|---------|
| 1 | **Jobs by Location** | `/jobs-by-location` | tech jobs near me, average salary by state, best cities for tech jobs, best cities for remote workers | 10,860 | Low | 74% location coverage, choropleth already built on market-dynamics |
| 2 | **Remote Work Hub** | `/remote-work-data` | remote work statistics (6.6K), remote work trends (2.9K), how many jobs are remote (480) | 9,980 | Very low | We have loc_type data on every job, this is a unique data angle |
| 3 | **Ghost Jobs / Employer Accountability** | `/ghost-jobs` | ghost jobs (5.4K), job ghosting (5.4K) | 10,800 | **Zero** | No competition. Core brand differentiator. Even before full ghost data, we can publish educational + our methodology |
| 4 | **Salary Explorer** | `/salary-data` (exists) | software engineer salary (201K), product manager salary (33K), data scientist salary (22K), marketing manager salary (18K) | 274,300 | Low (1-7) | Page exists but needs live RPCs and role-specific drill-downs |

### TIER 2: Build with Template Engine (Phase 1, after template ships)

| # | Page | URL Pattern | Target Keywords | Combined Volume | Comp |
|---|------|-------------|-----------------|---------------:|------|
| 5 | **Role trend pages** (batch) | `/trends/software-engineer`, `/trends/product-manager`, etc. | software engineer jobs (49.5K), product manager jobs (12.1K), data engineer jobs (14.8K) | 76,400+ | Low-Med |
| 6 | **Remote role pages** (batch) | `/remote/software-engineer`, `/remote/data-analyst`, etc. | remote software engineer jobs (27.1K), remote data analyst jobs (18.1K), remote product manager jobs (4.4K), marketing jobs remote (18.1K) | 67,600 | Low |
| 7 | **Salary by role pages** (batch) | `/salary/ux-designer`, `/salary/devops-engineer`, etc. | UX designer salary (8.1K), ML engineer salary (4.4K), devops salary (2.9K), principal engineer salary (1.9K) | 17,300+ | Very low |
| 8 | **Industry pages** (batch) | `/industry/cybersecurity`, `/industry/healthcare`, `/industry/ai`, `/industry/fintech` | cybersecurity jobs (90.5K), healthcare jobs (22.2K), ai jobs (18.1K), fintech jobs (3.6K), startup jobs (8.1K) | 142,500 | Med |

### TIER 3: Metro Comparisons (Phase 1, after location page)

| # | City Pair | URL | Why This Pair | Est. Volume |
|---|-----------|-----|---------------|------------:|
| 9 | SF vs Austin | `/jobs-sf-vs-austin` | Tech migration narrative, both in our data | ~500 (long-tail) |
| 10 | NYC vs Austin | `/jobs-nyc-vs-austin` | Cost-of-living comparison story | ~300 |
| 11 | Denver vs Austin | `/jobs-denver-vs-austin` | Competing tech hubs | ~200 |
| 12 | Seattle vs SF | `/jobs-seattle-vs-sf` | West coast tech corridor | ~300 |
| 13 | NYC vs SF | `/jobs-nyc-vs-sf` | Biggest tech markets | ~400 |
| 14 | Austin vs Raleigh | `/jobs-austin-vs-raleigh` | Emerging vs established | ~100 |
| 15 | Atlanta vs Dallas | `/jobs-atlanta-vs-dallas` | Southeast/South tech growth | ~100 |
| 16 | Denver vs Seattle | `/jobs-denver-vs-seattle` | Mid-tier tech hubs | ~200 |
| 17 | LA vs NYC | `/jobs-la-vs-nyc` | Mega-market comparison | ~300 |
| 18 | Miami vs Austin | `/jobs-miami-vs-austin` | Sunbelt tech | ~100 |

**Note:** Metro comparison individual volumes are low, but these are long-tail pages that compound over time and generate editorial stories when rankings shift. The template cost is near-zero once the engine exists.

### TIER 4: Build for Phase 2+ (Editorial Engine content targets)

| # | Page Type | Target Keywords | Volume | Notes |
|---|-----------|-----------------|-------:|-------|
| 19 | Tech layoffs tracker | tech layoffs (14.8K), layoffs tracker (720) | 15,520 | Needs economic_context table (Phase 4). High shareability. |
| 20 | Job market overview | job market (27.1K), job market right now (5.4K), tech job market (2.4K) | 34,900 | Editorial content + standing page combo. Refresh weekly. |
| 21 | ATS education hub | applicant tracking system (12.1K), ats friendly resume (9.9K), how to beat ats (210) | 22,210 | Content marketing play — educate users, convert to signups. |
| 22 | Salary negotiation guide | salary negotiation (4.4K), salary ranges (3.6K), salary transparency (1.6K) | 9,600 | Evergreen content, links to salary data pages. |
| 23 | Career change hub | career change (8.1K) | 8,100 | Content + tool play. Lower priority — not our core differentiation. |

---

## Keywords We Should NOT Target (Too Competitive or Off-Brand)

| Keyword | Volume | Comp | Why Skip |
|---------|-------:|------|----------|
| salary calculator | 201,000 | 1 | Dominated by Glassdoor/Payscale/Indeed. We'd need a tool, not a page. Revisit post-launch. |
| linkedin job search | 74,000 | 2 | Branded query — users want LinkedIn, not us. |
| best job boards / best job search sites | 22,200 | 74 | Very high competition. Listicle territory. We'd be one entry, not the page. |
| jobs hiring now | 33,100 | 46 | Generic, transactional. Indeed/LinkedIn dominate. |
| how to find a job | 8,100 | 60 | Too broad, high competition. |
| resume tips / resume optimization | 5,990 | 46-68 | Competitive, not our core. Resume scoring is a feature, not a content play. |

---

## City Pair Priority List (Metro Comparisons)

Ordered by estimated demand + narrative strength:

1. **SF vs Austin** — tech migration, remote work, cost of living
2. **NYC vs SF** — biggest markets, salary comparison
3. **NYC vs Austin** — East coast vs. sunbelt
4. **Seattle vs SF** — West coast tech corridor
5. **Denver vs Austin** — competing mid-tier hubs
6. **LA vs NYC** — mega-market comparison
7. **Atlanta vs Dallas** — Southeast/South growth
8. **Denver vs Seattle** — mountain west vs. pacific northwest
9. **Austin vs Raleigh** — emerging hubs
10. **Miami vs Austin** — sunbelt tech

---

## Refresh Cadence Recommendations (Phase 4 Blocker)

| Page Type | Refresh | Rationale |
|-----------|---------|-----------|
| Role trend pages | Weekly | Job volume changes meaningfully week-to-week |
| Salary pages | Biweekly | Salary medians are more stable |
| Location pages | Weekly | Geographic mix shifts with new postings |
| Metro comparisons | Weekly | Rankings can shift, triggers editorial stories |
| Remote work hub | Weekly | Remote % is a key metric users track |
| Ghost jobs page | Monthly (until pipeline data) | Educational content doesn't need frequent refresh |
| Industry pages | Weekly | Industry mix changes with hiring cycles |

---

## What Pod 1 Still Owes

This document delivers:
- ✅ Keyword-validated page priority list
- ✅ City pair priority list (10 pairs, ordered)
- ✅ Refresh cadence per page type

Still outstanding:
- ❌ Editorial style guide + anomaly thresholds + category rules (Phase 2 blocker)
- ❌ Blog design spec (Phase 3 blocker)
- ❌ Merchandising placement rules (Phase 3 blocker)
- ❌ Dashboard insight card format spec (Phase 3 blocker)
- ❌ Brand guidelines for embeds (Phase 3 blocker)
- ❌ Parameter priority list for single-trend batch generation (Phase 4 blocker)
- ❌ Comparison pair priority list (Phase 4 blocker — partially addressed by metro pairs above)
