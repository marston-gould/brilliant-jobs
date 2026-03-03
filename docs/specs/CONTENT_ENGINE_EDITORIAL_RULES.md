# Content Engine — Editorial Style Guide, Anomaly Thresholds & Category Rules

**From:** Pod 1 (Growth)
**Date:** February 25, 2026
**Purpose:** Unblock Pod 2 Phase 2 (Editorial Engine Core)
**Delivers:** Editorial style guide, finalized anomaly thresholds, story scoring calibration, category balance rules, story templates for all 10 story types

---

## 1. Editorial Style Guide

### Voice

Brilliant Jobs editorial content reads like a sharp market analyst who respects the reader's time. Not a press release. Not a blog post trying to sell something. The tone is: "Here's what's happening in the job market right now, backed by data we're watching in real time."

### Principles

1. **Lead with the number.** Every story opens with a specific data point, not a preamble. "Software engineer postings jumped 18% this week" — not "In an interesting development in the tech hiring landscape..."
2. **Context over hype.** A 10% spike means nothing without baseline. Always include the comparison period and the absolute numbers. "Remote marketing roles up 12% week-over-week (2,340 → 2,621 open positions)."
3. **One insight per story.** Each piece makes exactly one point. If there are two interesting findings, that's two stories.
4. **Show the chart.** Every story includes one inline ECharts visualization. The chart should be readable without the text and the text should be readable without the chart.
5. **No speculation.** We report what our data shows. We don't predict layoffs, recessions, or hiring booms. "Our data shows X" — never "This means Y is about to happen."
6. **Attribution in every piece.** Footer: "Source: Brilliant Jobs — real-time data from [N]+ open positions across [N]+ company career pages." Use live counts.

### Structure (200-400 words)

```
HEADLINE: [Number] + [What changed] + [For whom/where]
  Example: "Remote Product Manager Roles Up 15% — Now 34% of All PM Postings"

LEDE (1-2 sentences): The finding, stated plainly with the key number.
  Example: "Remote product manager positions increased 15% week-over-week, 
  reaching 1,420 open roles. Remote now accounts for 34% of all product 
  management postings tracked by Brilliant Jobs."

BODY (2-3 paragraphs):
  P1: The data in detail — what changed, by how much, over what period.
       Include absolute numbers, not just percentages.
  P2: Context — how this compares to the broader trend. Is this an 
       acceleration, a reversal, or a continuation? Reference the 
       relevant evergreen page.
  P3: What it means for job seekers — one actionable sentence. 
       "If you're targeting PM roles, expanding your search to include 
       remote positions significantly widens your options."

CHART: One inline ECharts visualization showing the trend.

FOOTER:
  Source: Brilliant Jobs — real-time data from {total_jobs}+ open 
  positions across {total_companies}+ company career pages.
  [Explore the full data →] (link to relevant evergreen page)
  [Sign up free →] (signup CTA)
```

### Headline Formulas

Use these patterns. They're optimized for scanning and social sharing.

| Pattern | Example |
|---------|---------|
| [Number] + [Direction] + [Subject] | "Software Engineer Postings Up 18% This Week" |
| [Subject] + [Milestone] | "Brilliant Jobs Now Tracking 200,000 Open Positions" |
| [City A] + Overtakes + [City B] | "Austin Surpasses Denver in New Tech Postings" |
| [Company] + [Action] + [Scale] | "Stripe Doubles Hiring — 47 New Roles This Week" |
| [Record/First] + [What] | "Record Salary Posted: $385K for Staff ML Engineer in SF" |
| [Subject] + [Duration] + [Trend] | "Marketing Hiring Slows for 4th Consecutive Week" |

### What We Never Do

- Never editorialize about whether a trend is "good" or "bad" for the economy
- Never name individual job seekers or applicants
- Never present salary data without noting it's based on posted ranges, not actual compensation
- Never use "breaking" or "exclusive" — we're a data source, not a newsroom
- Never round numbers in misleading ways ($87,400 median is not "nearly $90K")
- Never use exclamation points in headlines or body text

### Social Snippet Rules (og:description)

50-80 characters. The number + the finding, nothing else.
- "Remote PM roles up 15% — now 34% of all PM postings"
- "Austin passes Denver in tech hiring volume"
- "Record $385K salary posted for Staff ML Engineer"

### Meta Description Rules

120-155 characters. The finding + the data source + a reason to click.
- "Remote product manager positions jumped 15% this week, reaching 1,420 open roles. See the full trend from Brilliant Jobs' real-time ATS data."

---

## 2. Finalized Anomaly Thresholds

These are the exact values Pod 2 implements in the `detect-editorial-insights` Edge Function.

| # | Rule | Signal | Threshold | Min Sample Size | Dedup Window |
|---|------|--------|-----------|---------------:|-------------|
| 1 | **Volume spike (keyword)** | WoW job count by title keyword | **±10%** AND absolute change ≥ 20 jobs | 50 jobs in baseline week | 7 days same keyword |
| 2 | **Volume spike (location)** | WoW job count by city/state | **±15%** AND absolute change ≥ 15 jobs | 30 jobs in baseline week | 7 days same location |
| 3 | **Salary shift** | Rolling 30d median salary vs. prior 30d, by role | **±5%** AND absolute change ≥ $3,000 | 100 salary data points per period | 14 days same role |
| 4 | **Remote shift** | Remote % of new postings by role or industry | **±5 percentage points** | 200 total postings for that role/industry | 14 days same dimension |
| 5 | **Company surge** | Current week postings vs. 30-day weekly average | **2x or more** AND absolute ≥ 10 new jobs | 5 jobs in 30-day baseline | 14 days same company |
| 6 | **Metro crossover** | City A overtakes City B in weekly job volume for a role/all | **Rank change in top 20** | Both cities ≥ 50 jobs | 30 days same pair |
| 7 | **New entrant** | Company with 0 jobs in prior 30 days, now has jobs | **≥ 5 open positions** | N/A | 30 days same company |
| 8 | **Platform milestone** | Total open jobs crosses round number | **Every 50K** (150K, 200K, 250K, etc.) | N/A | One-time per milestone |
| 9 | **Salary record** | Max salary_max for a role or role+location exceeds prior max | **New all-time high** AND ≥ $150K (filter noise) | 500+ total postings for that role | 30 days same role+location |
| 10 | **Drought** | Role or location with consecutive weekly declines | **4+ consecutive weeks declining** AND total decline ≥ 15% from peak | 50 jobs at peak | 60 days same dimension |

### Threshold Rationale

- **Min sample sizes** prevent noisy signals from small data. A 50% spike in a keyword with 4 jobs is noise. A 10% spike in a keyword with 500 jobs is a story.
- **Absolute change floors** (±20 jobs, ±$3K salary) prevent percentage-based false positives on small bases.
- **Dedup windows** prevent the same story from regenerating daily. A salary shift detected on Monday shouldn't fire again on Tuesday with 0.1% additional change.
- **Salary record minimum ($150K)** filters out entry-level records that aren't interesting. Nobody shares "Record $48K salary posted for Junior QA Tester."

### Threshold Tuning Process

These thresholds are starting points. After the first 30 days of editorial engine operation:
- If the queue is flooded (>10 stories/day above threshold): raise thresholds by 25%
- If the queue is dry (<1 story/day): lower thresholds by 25%
- If one category dominates (>60% of stories): raise that category's thresholds or lower others
- Marston reviews queue daily for first 30 days before any auto-approve is enabled

---

## 3. Story Scoring Calibration

### Scoring Formula

Each detected anomaly receives a score from 0-100:

```
score = (magnitude_score × 0.30) + (breadth_score × 0.25) + (novelty_score × 0.20) + (recency_score × 0.15) + (shareability_score × 0.10)
```

### Factor Scoring (each 0-100)

**Magnitude (30%)**
| % Change | Score |
|----------|-------|
| At threshold (minimum) | 30 |
| 1.5x threshold | 50 |
| 2x threshold | 70 |
| 3x+ threshold | 90 |
| Record/milestone | 100 |

Example: Volume spike threshold is ±10%. A 10% spike scores 30. A 20% spike (2x threshold) scores 70.

**Breadth (25%)**
| Scope | Score |
|-------|-------|
| Single company | 20 |
| Single city or single role | 40 |
| Single industry or multi-company | 60 |
| Multi-city or multi-role | 80 |
| Platform-wide | 100 |

**Novelty (20%)**
| Pattern History | Score |
|-----------------|-------|
| Same pattern reported in last 30 days | 10 |
| Same pattern reported 31-90 days ago | 40 |
| Same pattern reported 91-180 days ago | 70 |
| Never reported before / first occurrence | 100 |

Check against `content_stories` table: has a story with the same `story_type` AND overlapping entities been published within the window?

**Recency (15%)**
| Data Age | Score |
|----------|-------|
| Today's data | 100 |
| This week's data | 80 |
| This month's data | 50 |
| Older than 30 days | 20 |

Most stories will score 80-100 here since the engine runs daily on fresh data.

**Shareability (10%)**

Static bonuses by category:
| Category | Bonus | Why |
|----------|-------|-----|
| salary | 80 | People always share salary data |
| company (named) | 70 | Brand names drive clicks |
| remote | 70 | Remote work is polarizing — high engagement |
| location | 50 | Relevant to specific audiences |
| trend/volume | 40 | Interesting but less viral |
| milestone | 90 | Achievement moments are inherently shareable |

### Publication Threshold

- **Score ≥ 60:** Enters publication queue (status = 'pending')
- **Score < 60:** Logged to content_stories with status = 'rejected' (kept for analysis, never surfaced)
- **Score ≥ 85:** Eligible for auto-approve (disabled for first 30 days — all stories require Marston's manual approval)

### Max Stories Per Day

**2 stories per day published.** If the queue has 5 eligible stories, publish the top 2 by score, hold the rest for subsequent days. This prevents content fatigue and ensures each story gets attention on the blog and social.

---

## 4. Category Balance Rules

### Categories

| Category Key | Covers | Color (admin calendar) |
|-------------|--------|----------------------|
| `salary` | Salary shifts, records, comparisons | Green |
| `location` | Metro crossovers, geographic shifts, city comparisons | Blue |
| `remote` | Remote % shifts, remote vs. office trends | Purple |
| `company` | Company surges, new entrants | Orange |
| `trend` | Volume spikes/droughts by role or industry, hiring trends | Teal |
| `milestone` | Platform milestones (job count, company count) | Gold |

### Balance Rules

| Rule | Value | Enforcement |
|------|-------|-------------|
| Max stories per category per week | **3** | If a category hits 3 published stories in the current Mon-Sun week, suppress additional stories from that category until next week (hold in queue with status = 'held_balance') |
| Min categories per week | **3 different categories** | If by Thursday only 1-2 categories have published, boost the score of underrepresented categories by +15 points for Friday-Sunday generation |
| No same-category back-to-back | **Enforced** | If today's story is `salary`, tomorrow's first story must be a different category. Second story of the day is exempt. |
| Milestone stories bypass balance | **Always publish** | Milestone stories (platform-wide achievements) are rare and always newsworthy. They don't count toward category limits. |

### Weekly Publication Calendar (Default)

This is the category *preference* for each day, not a hard requirement. If the highest-scoring story on Monday is a company surge instead of salary, publish the company surge.

| Day | Preferred Category | Rationale |
|-----|-------------------|-----------|
| Monday | salary | Start the week with compensation data — high engagement, sets the tone |
| Tuesday | location | Geographic insights for mid-week planning |
| Wednesday | remote | Remote work trends — high social sharing mid-week |
| Thursday | company | Company-level stories — good for LinkedIn sharing on a business day |
| Friday | trend | Hiring trend wrap-up — "this week in the job market" feel |
| Saturday | (skip or overflow) | Low engagement day — only publish if queue is deep |
| Sunday | (skip or overflow) | Same as Saturday |

---

## 5. Story Templates

Pod 2 uses these templates in the `generate-editorial-content` Edge Function. Each template is a Claude system prompt fragment injected alongside the style guide.

### Template 1: Volume Spike (Keyword)

```
Story type: volume_spike_keyword
Data provided: {keyword, current_week_count, prior_week_count, pct_change, 
  top_companies[], salary_median, remote_pct}

Write a 200-300 word article about this hiring volume change.
Headline formula: "{Keyword} Hiring {Up/Down} {X}% This Week"
Include: absolute numbers (not just %), top 3 companies driving the change, 
  salary context, remote availability.
Chart: Weekly volume bar chart (last 8 weeks) with the current week highlighted.
Link to: /trends/{keyword-slug}
```

### Template 2: Volume Spike (Location)

```
Story type: volume_spike_location
Data provided: {city, state, current_week_count, prior_week_count, pct_change, 
  top_roles[], top_companies[], salary_median}

Write a 200-300 word article about this geographic hiring shift.
Headline formula: "{City} Job Market {Surging/Cooling} — {X}% Change This Week"
Include: absolute numbers, what roles are driving it, salary context,
  comparison to national average.
Chart: Weekly volume for this city (last 8 weeks).
Link to: /jobs-by-location
```

### Template 3: Salary Shift

```
Story type: salary_shift
Data provided: {role, current_median, prior_median, pct_change, 
  sample_size, top_paying_companies[], remote_premium_if_applicable}

Write a 200-300 word article about this salary movement.
Headline formula: "{Role} Salaries {Rising/Falling} — Now Averaging ${X}"
Include: dollar amounts not just %, sample size for credibility, 
  note this is based on posted salary ranges.
Chart: Monthly median salary line chart (last 6 months).
Link to: /salary/{role-slug}
```

### Template 4: Remote Shift

```
Story type: remote_shift
Data provided: {dimension (role or industry), current_remote_pct, 
  prior_remote_pct, pp_change, total_postings, remote_count}

Write a 200-300 word article about this remote work trend.
Headline formula: "Remote {Role/Industry} Positions {Expanding/Contracting} to {X}%"
Include: percentage points change, absolute counts, 
  comparison to platform-wide remote average.
Chart: Remote % trend line (last 12 weeks).
Link to: /remote-work-data
```

### Template 5: Company Surge

```
Story type: company_surge
Data provided: {company_name, current_week_count, avg_weekly_count, 
  multiplier, top_roles[], departments[], locations[]}

Write a 200-300 word article about this company's hiring activity.
Headline formula: "{Company} {Doubles/Triples} Hiring — {X} New Roles This Week"
Include: what roles they're hiring for, where, whether remote is available.
  Do NOT speculate about why they're hiring.
Chart: Company weekly posting volume (last 8 weeks).
Link to: /company/{company-slug} (when available) or signup CTA
```

### Template 6: Metro Crossover

```
Story type: metro_crossover
Data provided: {city_a, city_b, city_a_count, city_b_count, 
  role_or_all, prior_ranking, salary_comparison}

Write a 200-300 word article about this geographic ranking change.
Headline formula: "{City A} Surpasses {City B} in {Role/Tech} Job Postings"
Include: both cities' numbers, how long City B held the lead,
  salary comparison between the two.
Chart: Dual-line chart showing both cities' weekly volume (last 12 weeks).
Link to: /jobs-{city-a}-vs-{city-b}
```

### Template 7: New Entrant

```
Story type: new_entrant
Data provided: {company_name, job_count, roles[], locations[], 
  industry, salary_range_if_available}

Write a 150-250 word article about this company entering the hiring market.
Headline formula: "{Company} Enters the {Role/Industry} Hiring Market with {X} Openings"
Include: what they're hiring for, where, salary range if available.
  Keep it factual — no speculation about growth or funding.
Chart: None (not enough historical data). Use a stat card instead.
Link to: signup CTA
```

### Template 8: Platform Milestone

```
Story type: milestone
Data provided: {milestone_type, milestone_value, prior_milestone_date, 
  growth_rate, total_companies, top_ats_sources[]}

Write a 150-200 word article about this platform achievement.
Headline formula: "Brilliant Jobs Now Tracking {X} Open Positions Across {Y} Companies"
Include: growth rate since last milestone, data source breadth (5 ATS platforms),
  what this means for job seekers (more options, better matching).
Chart: Cumulative job volume line chart (all time).
Link to: /data-lab (hub page)
```

### Template 9: Salary Record

```
Story type: salary_record
Data provided: {role, location_if_applicable, salary_max, 
  prior_record, company_if_available, median_for_context}

Write a 150-250 word article about this record salary posting.
Headline formula: "Record Salary Posted: ${X} for {Role} in {City}"
Include: the median salary for this role for context (this is an outlier),
  note this is a posted range maximum, not guaranteed compensation.
Chart: Salary distribution histogram for this role with the record marked.
Link to: /salary/{role-slug}
```

### Template 10: Drought

```
Story type: drought
Data provided: {dimension (role or location), consecutive_weeks, 
  peak_count, current_count, total_decline_pct}

Write a 200-300 word article about this sustained hiring decline.
Headline formula: "{Role/Location} Hiring Slows for {N}th Consecutive Week"
Include: peak-to-current decline in absolute and %, 
  what this looks like relative to the broader market.
  Do NOT frame as doom — present as useful intelligence for job seekers.
Chart: Weekly volume trend (last 12 weeks) with declining period highlighted.
Link to: /trends/{slug} or /jobs-by-location
```

---

## 6. Claude System Prompt for Story Generation

This is the full system prompt passed to the `generate-editorial-content` Edge Function:

```
You are the editorial engine for Brilliant Jobs, a job search intelligence platform. You write short, data-driven articles about the job market based on real-time data from ATS career pages.

STYLE RULES:
- Lead with the number. First sentence contains the key data point.
- 200-400 words maximum. One insight per story.
- Use specific numbers: "2,340 open positions" not "thousands of positions."
- Always include both percentage change AND absolute numbers.
- When reporting salary data, note it is based on posted salary ranges.
- Never speculate about causes, predictions, or economic implications.
- Never use exclamation points, "breaking," or "exclusive."
- Never round misleadingly ($87,400 is not "nearly $90K").
- End with one actionable sentence for job seekers.

REQUIRED OUTPUT (JSON):
{
  "headline": "string (max 80 chars)",
  "lede": "string (1-2 sentences, the finding stated plainly)",
  "body_html": "string (HTML, 2-3 paragraphs, no <h1> tags)",
  "chart_config": { ECharts option object for the inline chart },
  "meta_description": "string (120-155 chars)",
  "social_snippet": "string (50-80 chars)",
  "tags": ["string array of category tags"],
  "evergreen_link": "string (URL of related standing page, or null)"
}

Respond with valid JSON only. No markdown fences, no preamble.
```

---

## What This Document Delivers

- ✅ Editorial style guide (voice, structure, headline formulas, rules)
- ✅ Finalized anomaly thresholds for all 10 detection rules (with min sample sizes, absolute floors, dedup windows)
- ✅ Story scoring calibration (factor scoring tables, publication threshold, max per day)
- ✅ Category balance rules (max per category, min variety, no back-to-back, calendar preferences)
- ✅ Story templates for all 10 story types (with data schemas, headline formulas, chart types, link targets)
- ✅ Claude system prompt for the generation Edge Function

## What Pod 1 Still Owes

- ❌ Blog design spec (Phase 3 blocker)
- ❌ Merchandising placement rules — where on index, Data Lab, dashboard (Phase 3 blocker)
- ❌ Dashboard insight card format spec (Phase 3 blocker)
- ❌ Brand guidelines for embeddable charts (Phase 3 blocker)
- ❌ Parameter priority list for single-trend batch generation (Phase 4 blocker — derivable from keyword validation)
