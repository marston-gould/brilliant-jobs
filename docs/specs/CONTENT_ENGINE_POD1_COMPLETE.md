# Content Engine — Pod 1 Deliverables: COMPLETE

**Date:** February 25, 2026
**Status:** All Pod 1 blockers delivered. Pod 2 fully unblocked across all 4 phases.

---

## Document Index

| Doc | Location | Contents |
|-----|----------|----------|
| Keyword Validation | `docs/CONTENT_ENGINE_KEYWORD_VALIDATION.md` | 120 keywords validated, page priority list (23 pages, 4 tiers), city pair list (10 metros), refresh cadence by page type |
| Editorial Rules | `docs/CONTENT_ENGINE_EDITORIAL_RULES.md` | Style guide, anomaly detection (10 rules with thresholds + min samples), story scoring formula, category balance rules, 10 story templates, Claude generation prompt |
| College Outcomes | `docs/CONTENT_ENGINE_COLLEGE_OUTCOMES.md` | `/college-major-outcomes` page spec, NY Fed as recurring data source + ingestion logic, 5 crossover editorial templates (Templates 11-15), major-to-keyword mapping table |
| Distribution Specs | `docs/CONTENT_ENGINE_DISTRIBUTION_SPECS.md` | Blog design (`/blog` index + `/blog/{slug}`), merchandising rules (index, Data Lab, dashboard), dashboard insight card spec (HTML, CSS, filter matching, dismiss logic), embed brand guidelines (attribution bar, CORS, sizing), parameter priority list, comparison pair list |

---

## Pod 1 Blocker Checklist

### Phase 1 — Evergreen Page Infrastructure
- [x] DataForSEO keyword validation (120 keywords, 1.2M+ monthly volume)
- [x] Page priority list (23 pages, 4 tiers by build order)
- [x] City pair priority list (10 metro comparisons)
- [x] Refresh cadence per page type (weekly/biweekly/monthly)

### Phase 2 — Editorial Engine Core
- [x] Editorial style guide (voice, structure, headline formulas)
- [x] Anomaly detection thresholds (all 10 rules, min sample sizes, absolute floors, dedup windows)
- [x] Story scoring calibration (5-factor formula, publication threshold ≥60)
- [x] Category balance rules (max 3/category/week, min 3 categories/week, no back-to-back)
- [x] Story templates (10 core + 5 NY Fed crossover = 15 total)
- [x] Claude system prompt for `generate-story` Edge Function

### Phase 3 — Distribution
- [x] Blog design spec (index layout, story page layout, card component, RSS, SEO)
- [x] Merchandising placement rules (index "Market Pulse" 3 cards, Data Lab "Trending" 5 cards)
- [x] Dashboard insight card format spec (HTML, CSS, filter-aware matching, dismiss behavior, key stat extraction)
- [x] Embeddable chart brand guidelines (attribution bar, CORS, sizing, embed code generator)

### Phase 4 — Scale & Automation
- [x] Refresh cadence (delivered in Phase 1 doc)
- [x] Parameter priority list for batch page generation (10 role trends, 4 remote roles, 8 salary pages)
- [x] Comparison pair priority list (5 comparison pages)

### Bonus — Economic Data Integration
- [x] NY Fed College Labor Market as recurring source (ingestion spec, 369 indicators, pg_cron schedule)
- [x] `/college-major-outcomes` evergreen page spec (table, 4 charts, FAQ, BJ cross-reference)
- [x] Major-to-keyword mapping table (`major_keyword_mapping`)
- [x] 5 editorial templates for NY Fed × BJ crossover stories

---

## Key Numbers for Pod 2 Reference

| Metric | Value |
|--------|-------|
| Total keywords validated | 120 |
| Combined monthly search volume | 1,201,800 |
| Evergreen pages specified | 23 |
| Story templates | 15 |
| Anomaly detection rules | 10 |
| Editorial categories | 6 |
| Economic indicators (NY Fed) | 369 |
| Dashboard card CSS tokens | 6 category colors |
| Embed attribution bar height | 32px |
| Blog cards per page load | 10 |
| Dashboard insight cards shown | 2 |
| Index merchandising cards | 3 |
| Data Lab merchandising cards | 5 |

---

## Pod 2 Build Sequence (Recommended)

Based on the dependency graph across all 4 phases:

1. **Database first:** `content_stories`, `anomaly_baseline`, `editorial_calendar`, `economic_indicators`, `major_keyword_mapping` tables
2. **Detection EF:** `detect-editorial-insights` (runs anomaly rules, writes candidates)
3. **Generation EF:** `generate-story` (takes candidate, produces story via Claude API)
4. **Blog pages:** `/blog` index + `/blog/{slug}` (renders published stories)
5. **Merchandising:** Index "Market Pulse", Data Lab "Trending", Dashboard cards
6. **Evergreen pages:** Start with Tier 1 (Jobs by Location, Remote Hub, Ghost Jobs, Salary Explorer)
7. **Batch pages:** Role trends, remote roles, salary by role (template engine)
8. **Embeds:** `/embed/{chart-type}` route + attribution bar + code generator
9. **Economic ingestion:** NY Fed source + `/college-major-outcomes` page
10. **Scale:** pg_cron scheduling, refresh cadence automation, parameter expansion
