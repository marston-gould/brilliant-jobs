# Content Engine — College Major Outcomes: Page Spec + Data Source Integration

**From:** Pod 1 (Growth)
**Date:** February 25, 2026
**Purpose:** (1) Evergreen page spec for `/college-major-outcomes`, (2) Editorial story templates that cross-reference NY Fed data with BJ ATS data, (3) Add NY Fed College Labor Market as a recurring economic data source
**Reference model:** https://www.newyorkfed.org/research/college-labor-market

---

## 1. Why This Matters

The NY Fed College Labor Market interactive is one of the most-cited data sources in employment journalism. CNBC, NBC, WSJ, and dozens of outlets write stories every time it updates (February annually for wages/outcomes, quarterly for unemployment). It tracks 73 college majors across unemployment, underemployment, early/mid-career wages, and graduate degree attainment.

**Our angle:** The NY Fed tells you what happened *after* people graduated. We tell you what's happening *right now* in the job market. The NY Fed says "Computer Science unemployment is 7.0%." We say "Meanwhile, we're tracking 12,400 open software engineer positions across 2,100 companies paying a median of $145K." That's the story nobody else can tell — backward-looking government survey data overlaid with real-time ATS hiring data.

This creates a new category of editorial content with extremely high citation value, because we're the only source combining both datasets.

---

## 2. Evergreen Page Spec: `/college-major-outcomes`

### Page Type
Program 1 (Evergreen SEO). Standing page at permanent URL. Refreshes annually when NY Fed updates (February).

### Target Keywords
- "college major employment outcomes" (validate via DataForSEO)
- "best college major for jobs"
- "college major salary comparison"
- "highest paying college majors"
- "college major unemployment rate"
- "is [major] a good degree"
- "computer science unemployment rate"
- "nursing job outlook"
- "engineering salary by major"

### Data Source
NY Fed College Labor Market dataset (4 sheets):
- **outcomes by major**: 73 majors × 5 metrics (unemployment rate, underemployment rate, early career median wage, mid-career median wage, share with graduate degree)
- **unemployed**: Monthly time series since 1990, 4 cohorts (young workers, all workers, recent graduates, college graduates)
- **underemployed**: Monthly time series since 1990, 2 cohorts
- **wages**: Annual time series since 1990, bachelor's p25/median/p75 + high school median

### Page Layout

**Hero Section**
- Title: "College Major Outcomes: Employment, Salary & Underemployment Data"
- Subtitle: "73 majors ranked by employment rate, salary, and career trajectory — sourced from the Federal Reserve Bank of New York, cross-referenced with real-time hiring data from Brilliant Jobs"
- Last updated: February 2026 (NY Fed update cycle)

**Section 1: Interactive Major Comparison Table**
Sortable table showing all 73 majors with columns:
| Major | Unemployment | Underemployment | Early Career Salary | Mid-Career Salary | Grad Degree % | BJ Open Jobs* |
*BJ Open Jobs = live count from our ats_jobs matching that major's typical roles. This is our unique value-add.

Default sort: by Early Career Salary descending.
Click any column header to re-sort.
Click any major row to expand with detail view.

**Section 2: Key Findings (4 stat cards)**
- Highest paying early career: Computer Engineering ($90,000)
- Lowest unemployment: Special Education (0.7%)
- Highest underemployment: Criminal Justice (65.8%)
- Biggest salary jump early→mid: Chemical Engineering (+59%, $85K→$135K)

**Section 3: Charts (4 charts)**

Chart 1: **Salary by Major Category** (horizontal bar)
Group majors into categories (Engineering, Business, STEM, Arts, Education, Health, Social Science) and show average early + mid career salary per group. This is the hero chart.

Chart 2: **Unemployment vs. Salary Scatter** 
X-axis: unemployment rate. Y-axis: early career salary. Each dot = a major. Hover for detail. This shows the tradeoff — Engineering majors cluster in high-salary/moderate-unemployment, Education clusters in low-salary/low-unemployment.

Chart 3: **The Underemployment Problem** (horizontal bar, sorted)
Top 15 most underemployed majors. Shows what % of graduates end up in jobs that don't require a degree. Criminal Justice at 65.8% is the standout.

Chart 4: **College Premium Over Time** (line chart, from wages sheet)
Bachelor's median vs. High School median since 1990. Shows the wage gap growing over 35 years. Currently: $60K vs $40K.

**Section 4: BJ Cross-Reference (Our Unique Value)**
"What does the current job market look like for these majors?"
For the top 10 most-searched majors, show a card with:
- NY Fed data: unemployment rate, early career salary
- BJ live data: open positions count, median posted salary, remote %, top hiring companies
- Delta: "Posted salaries are {X}% above/below the NY Fed's reported median"

This requires an RPC that maps college majors → job title keywords in our ats_jobs table.

**Section 5: FAQ (JSON-LD schema)**
- "What college major has the highest salary?" → Chemical Engineering at $135K mid-career
- "What college major has the lowest unemployment?" → Special Education at 0.7%
- "Is computer science still a good major?" → CS unemployment is 7.0%, but early career salary is $87K (4th highest) and mid-career reaches $120K
- "What is underemployment?" → Working in a job that doesn't require a bachelor's degree
- "Where does this data come from?" → Federal Reserve Bank of New York, American Community Survey. Updated February 2026.

**Section 6: Source Attribution + CTA**
"Data: Federal Reserve Bank of New York College Labor Market series, updated February 2026. Real-time job market data from Brilliant Jobs — [N]+ open positions across [N]+ companies. [Explore your field →]"

### Major-to-Job-Title Mapping (for BJ cross-reference)

Pod 2 needs this mapping to query ats_jobs for live counts per major:

| Major Category | BJ Title Keywords (ILIKE) |
|---------------|--------------------------|
| Computer Science | software engineer, developer, programmer, full stack, backend, frontend |
| Computer Engineering | hardware engineer, embedded, firmware, systems engineer |
| Nursing | nurse, RN, nursing, NP |
| Finance | financial analyst, investment, portfolio, banking |
| Economics | economist, economic analyst, data analyst, quantitative |
| Marketing | marketing manager, marketing coordinator, brand, growth |
| Accounting | accountant, auditor, CPA, bookkeeper |
| Mechanical Engineering | mechanical engineer, manufacturing engineer |
| Electrical Engineering | electrical engineer, EE, power systems |
| Civil Engineering | civil engineer, structural engineer, construction |
| Biology | biologist, research scientist, lab technician, biotech |
| Psychology | therapist, counselor, psychologist, behavioral |
| Business Management | business analyst, operations manager, project manager |
| Communications | communications specialist, PR, public relations |
| Education (all) | teacher, educator, instructor, tutor |

This mapping lives in a new table or config so Pod 2 can extend it:

```sql
CREATE TABLE major_keyword_mapping (
  major_category  text PRIMARY KEY,
  title_keywords  text[] NOT NULL  -- array of ILIKE patterns
);
```

### Effort Estimate
- Page template + charts: 2 days Pod 2 (uses existing template engine)
- Major-to-keyword mapping + RPC: 0.5 day Pod 2
- Data ingestion (see Section 3): part of economic ingestion EF
- Content + copy: 0.5 day Pod 1 (FAQ, descriptions, section copy)

---

## 3. NY Fed as Recurring Economic Data Source

Add to the `ingest-structured-economic` Edge Function spec (Content_Engine_Pod2_Handoff Phase 4.5):

### Source Details

| Field | Value |
|-------|-------|
| Source name | `nyfed_college_labor` |
| URL | `https://www.newyorkfed.org/research/college-labor-market` |
| Data download | `https://www.newyorkfed.org/medialibrary/Research/Interactives/Data/college-labor-market/College-labor-data` (xlsx) |
| Update frequency | Quarterly (unemployment), Annually (wages, outcomes by major) |
| Update months | Feb, May, Aug, Nov (unemployment); Feb (wages + outcomes) |
| Format | Excel (.xlsx), 4 sheets |
| Cost | Free, no API key needed |

### Ingestion Logic

Add to `ingest-structured-economic` Edge Function:

```javascript
// NY Fed College Labor Market — quarterly
async function ingestNYFedCollegeLaborData() {
  // Download Excel file
  const response = await fetch(
    'https://www.newyorkfed.org/medialibrary/Research/Interactives/Data/college-labor-market/College-labor-data'
  );
  const buffer = await response.arrayBuffer();
  
  // Parse with SheetJS (already available in Edge Functions)
  // Sheet 1: "outcomes by major" → economic_indicators rows
  // Sheet 2: "unemployed" → economic_indicators time series
  // Sheet 3: "wages" → economic_indicators time series
  
  // Upsert to economic_indicators:
  // source = 'nyfed_college_labor'
  // series_id = 'outcomes_{major_slug}_{metric}' 
  //   e.g. 'outcomes_computer_science_unemployment'
  // OR for time series:
  // series_id = 'unemployment_recent_graduates'
  // series_id = 'wages_bachelors_median'
}
```

### Indicators to Track

**From outcomes by major (73 rows × 5 metrics = 365 indicators):**
- `nyfed_college_labor` / `outcomes_{major}_unemployment` 
- `nyfed_college_labor` / `outcomes_{major}_underemployment`
- `nyfed_college_labor` / `outcomes_{major}_wage_early`
- `nyfed_college_labor` / `outcomes_{major}_wage_mid`
- `nyfed_college_labor` / `outcomes_{major}_grad_degree_pct`

**From time series (4 series):**
- `nyfed_college_labor` / `unemployment_recent_graduates` (quarterly)
- `nyfed_college_labor` / `unemployment_college_graduates` (quarterly)
- `nyfed_college_labor` / `wages_bachelors_median` (annual)
- `nyfed_college_labor` / `wages_hs_median` (annual)

### pg_cron Schedule
- Check for updated file: 1st of Feb, May, Aug, Nov
- Parse and upsert: if file's "Updated" date > last fetched_at

---

## 4. Editorial Story Templates (NY Fed × BJ Crossover)

These are high-value stories that combine NY Fed data with our ATS data. Add to the `detect-editorial-insights` rule set.

### Template 11: NY Fed Update Story (Quarterly)

```
Story type: nyfed_quarterly_update
Trigger: New NY Fed data detected (updated date changed)
Data provided: {latest_unemployment_recent_grads, prior_quarter, 
  yoy_change, bj_total_open_jobs, bj_median_salary}

Headline: "Recent Graduate Unemployment {Rises/Falls} to {X}% — 
  Meanwhile, {Y}K Positions Open on ATS Career Pages"
Structure: NY Fed finding → BJ live data comparison → what it means
Chart: Dual-axis: NY Fed unemployment line + BJ job volume bars
```

### Template 12: Major Spotlight (Monthly, Rotating)

```
Story type: major_spotlight
Trigger: Monthly rotation through top 10 most-searched majors
Data provided: {major, nyfed_unemployment, nyfed_underemployment, 
  nyfed_early_salary, nyfed_mid_salary, bj_open_jobs, bj_median_salary, 
  bj_remote_pct, bj_top_companies[]}

Headline: "{Major} Grads: {X}% Unemployment, But {Y} Open Positions 
  Paying ${Z} Right Now"
Structure: NY Fed backward-looking → BJ real-time → reconciliation
Chart: Split view — NY Fed metrics on left, BJ live metrics on right
Link to: /college-major-outcomes#{major-slug}
```

### Template 13: Salary Divergence (When Notable)

```
Story type: salary_divergence_nyfed
Trigger: BJ median posted salary for a major's typical roles diverges 
  from NY Fed reported median by >15%
Data provided: {major, nyfed_median, bj_median, pct_divergence, 
  sample_size, explanation_hint}

Headline: "Posted {Role} Salaries {X}% {Above/Below} the NY Fed's 
  Reported Median — Here's What's Happening"
Structure: The gap → possible explanations (different time periods, 
  posted vs actual, experience level mix) → actionable insight
Chart: Bar comparison: NY Fed median vs BJ posted median for top 10 majors
Link to: /salary/{role-slug}
```

### Template 14: College Premium Story (Annual)

```
Story type: college_premium_annual
Trigger: New annual wages data in February
Data provided: {bachelors_median, hs_median, premium_pct, 
  premium_change_yoy, historical_premium[]}

Headline: "The College Wage Premium in {Year}: Bachelor's Grads Earn 
  {X}% More Than High School Grads"
Structure: Current premium → historical trend → what our ATS data 
  shows about degree requirements in postings
Chart: 35-year line chart of BA median vs HS median
Link to: /college-major-outcomes
```

### Template 15: Underemployment × Hiring Reality

```
Story type: underemployment_vs_hiring
Trigger: Quarterly, paired with NY Fed update
Data provided: {top5_underemployed_majors[], bj_matching_jobs_counts[], 
  bj_salary_medians[]}

Headline: "{X}% of {Major} Grads Are Underemployed — But We Found 
  {Y} Matching Jobs Paying ${Z}"
Structure: The underemployment problem → what BJ data shows is 
  actually available → the gap may be a search problem, not a job problem
Chart: Paired bars — underemployment rate vs. open job count per major
Link to: /college-major-outcomes
```

### Scoring Adjustments for NY Fed Stories

These stories score higher because they combine authoritative external data with proprietary data:

| Factor | Adjustment |
|--------|-----------|
| Novelty | +20 bonus (unique cross-reference nobody else can do) |
| Shareability | +15 bonus (college major content is inherently viral) |
| Breadth | Score as "platform-wide" (100) since it spans all majors |

Expected score range: 75-95 (most will auto-qualify for publication queue).

---

## 5. Key Data Points for Pod 1 Reference

### Headline-Ready Findings (from February 2026 data)

**Salary:**
- Computer Engineering is the highest-paying early career major ($90K)
- Chemical Engineering leads mid-career ($135K)
- Special Education is the lowest-paying mid-career ($56K) — but has 0.7% unemployment
- The college wage premium is $20K (BA $60K vs HS $40K median)

**Employment:**
- Overall recent graduate unemployment: 4.2%
- Computer Science: 7.0% unemployment (well above average) BUT $87K early career salary
- Computer Engineering: 7.8% unemployment (highest among engineering)
- Special Education: 0.7% (lowest of any major)
- Nursing: 2.1% unemployment, 12.8% underemployment (lowest underemployment)

**Underemployment (working jobs that don't require a degree):**
- Criminal Justice: 65.8% underemployed (worst)
- Performing Arts: 63.9%
- Fine Arts: 58.9%
- Nursing: 12.8% (best)
- Aerospace Engineering: 14.7%

**The CS/CE paradox (great editorial hook):**
Computer Science and Computer Engineering have the highest unemployment among all engineering fields (7.0% and 7.8%) — yet they also pay the most ($87K-$90K early career). This is the tension our editorial content should exploit: "High risk, high reward — and here's what the current hiring market actually looks like."

---

## What This Document Delivers

- ✅ Evergreen page spec for `/college-major-outcomes` (layout, charts, FAQ, major-to-keyword mapping)
- ✅ NY Fed added as recurring economic data source with ingestion logic
- ✅ 5 new editorial story templates (Templates 11-15) for NY Fed × BJ crossover content
- ✅ Scoring adjustments for cross-reference stories
- ✅ Headline-ready findings from February 2026 data

## Pod 2 Action Items

1. Add `major_keyword_mapping` table
2. Add NY Fed ingestion to `ingest-structured-economic` Edge Function
3. Build `/college-major-outcomes` page using template engine
4. Add Templates 11-15 to `detect-editorial-insights` rule set
5. RPC: `get_jobs_by_major(major_category text)` returns live counts + salary from ats_jobs
