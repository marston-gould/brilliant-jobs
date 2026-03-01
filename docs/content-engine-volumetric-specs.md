# Content Engine — Volumetric Specifications
## Word Budgets by Page Template

**Document:** Volumetric Specs for Content Engine Templates
**Owner:** Pod 1 (Growth)
**Date:** February 28, 2026
**Roadmap:** Phase 11 (Content & SEO) — Gap V1

---

## Purpose

Without volumetric planning, AI produces rushed conclusions, bloated introductions, and unbalanced depth (Fiorelli Framework). These specs define word budgets per section (±10% tolerance) for every Content Engine page template.

---

## Metro Comparison Pages

**Total:** 800–1,200 words

| Section | Budget | Notes |
|---------|--------|-------|
| Page intro | 50–75w | Direct-answer statement + context |
| City A overview | 200w | Market size, top employers, salary median |
| City B overview | 200w | Same structure as City A for balance |
| Comparison table | 200w | HTML table with 6–8 comparison dimensions |
| Salary differential analysis | 150w | Remote premium, cost-of-living adjustment |
| Recommendation | 100w | "If you're [persona], City A/B is better because..." |
| FAQ section | 150w | 3 city-specific questions with schema markup |

**Constraints:**
- Each H2 opens with a direct-answer statement
- Both cities must receive equal depth (±10% word count)
- Must include at least one quotable comparison statement
- Entity requirements: both city names, state names, "cost of living," "job market," metro-specific employers

---

## Company SEO Pages

**Total:** 600–900 words

| Section | Budget | Notes |
|---------|--------|-------|
| Company overview | 150w | From ref_companies + ats_companies data only |
| Current openings summary | 200w | Count, top departments, salary range |
| Salary data | 150w | Median, range, comparison to market |
| Hiring trends | 150w | Velocity, growth/decline, seasonal patterns |
| Ghost rate (when available) | 100w | Response time, listing lifespan |

**Constraints:**
- No hallucinated company descriptions — use only data from ats_jobs and ref_companies
- Knowledge Graph entity linking via Google KG Search API
- Organization schema with sameAs links
- If ghost data unavailable, omit section (don't pad other sections)

---

## Single-Parameter Trend Pages

**Total:** 500–800 words

| Section | Budget | Notes |
|---------|--------|-------|
| Trend summary | 150w | Lead with the headline finding |
| Data analysis | 300w | Charts, tables, specific numbers |
| Implications for job seekers | 150w | The "so what" — actionable advice |

**Constraints:**
- Must include at least one AI-extractable summary statement
- No meta-commentary openers

---

## Editorial Intelligence Stories

### Daily Stories
**Total:** 300–500 words

| Section | Budget | Notes |
|---------|--------|-------|
| Headline insight | 50w | Lead sentence with the key finding |
| Data context | 150–250w | Supporting evidence, comparisons |
| Job seeker implication | 75–100w | What this means for your search |
| Quotable statement | 25–50w | Styled callout for social/AI extraction |

### Weekly Deep Dives
**Total:** 800–1,200 words

| Section | Budget | Notes |
|---------|--------|-------|
| Executive summary | 100w | 2–3 sentence overview |
| Primary analysis | 400–500w | Main trend with supporting data |
| Secondary findings | 200–300w | 2–3 related insights |
| Market outlook | 100–150w | Forward-looking implications |
| Methodology note | 50–75w | Data source, coverage, freshness |

**Constraints:**
- Two-stage approval gate: story proposal → admin approval → full generation
- Must include at least one quotable data statement per story
- No meta-commentary ("In this analysis, we examine...")
- Agent definition from docs/content-engine-agent-definition.md
- Brand voice from docs/brand-voice-brief.md

---

## Implementation Notes

These volumetric specs should be included in the Content Engine template configuration. The word budgets serve as constraints in the AI generation prompts — include them as explicit instructions (e.g., "The City A overview section should be approximately 200 words").

All version increments must follow VERSION_METHODOLOGY.docx in the repository.
