# Brilliant Jobs — Jobs Feed Specification
**Version:** 1.0  
**Last Updated:** 2026-03-23  
**Owner:** Taylor  
**Status:** AUTHORITATIVE — read this before touching any feed code

---

## 1. PURPOSE

This document is the single source of truth for the Jobs Feed page. Every feature, every data flow, every conflict resolution rule, every test case is defined here. No feature is built, changed, or declared done without this document being consulted and updated.

---

## 2. ARCHITECTURE PRINCIPLES

1. **Supabase is the only source of truth.** No localStorage. No client-side state that isn't derived from a Supabase query.
2. **One search function.** All job queries go through the `search_jobs` Postgres RPC. Nothing else queries `ats_jobs` for feed results.
3. **Client renders. Postgres computes.** Filtering, sorting, deduplication, pagination — all in Postgres. Client formats and displays.
4. **One implementation per feature.** If a function exists, it exists in one place. Duplicates are deleted.
5. **Explicit inputs.** Every function takes its dependencies as arguments. No hidden state reads.

---

## 3. DATA OWNERSHIP

| Data | Table | Column | Written By | Read By |
|---|---|---|---|---|
| Saved filters | `user_filters` | `filter_data` (jsonb) | Filter save handler | `search_jobs` RPC |
| Global rules | `profiles` | `user_data->'tuning'` | Tuning page | `search_jobs` RPC |
| Hidden jobs | `hidden_jobs` | `job_id` | Hide handler | `search_jobs` RPC |
| Pipeline saves | `user_pipeline` | `job_id`, `stage` | Save handler | Session load |
| Applied jobs | `user_pipeline` | `applied_at` | Apply handler | Session load |
| Job data | `ats_jobs` | all | Ingestion pipeline | `search_jobs` RPC |
| Trust scores | `ats_jobs` | `ai_label` | Background scorer | `search_jobs` RPC |
| AI scores | `ats_jobs` | `ai_content_score` | Background scorer | `search_jobs` RPC |
| Checked filter IDs | React state | `Set<uuid>` | Filter toggle | `search_jobs` call |
| Current page | React state | `number` | Pagination handler | `search_jobs` call |
| Sort | React state | `{field, asc}` | Sort handler | `search_jobs` call |

**localStorage keys — ALL DELETED. None used.**

---

## 4. THE SEARCH_JOBS RPC

### 4.1 Signature
```sql
search_jobs(
  p_user_id      uuid,
  p_filter_ids   uuid[],    -- empty array = unfiltered feed
  p_page         integer,   -- 0-based
  p_page_size    integer,   -- default 50
  p_sort_field   text,      -- 'created_at' | 'salary_max' | 'company_name' | 'title'
  p_sort_asc     boolean    -- false = descending (default for created_at)
)
```

### 4.2 Execution Order
1. Load tuning from `profiles.user_data->'tuning'` for `p_user_id`
2. Load hidden job IDs from `hidden_jobs` for `p_user_id`
3. Load `filter_data` from `user_filters` for each ID in `p_filter_ids`
4. For each filter: build subquery applying all criteria (see Section 6)
5. Apply global rules from tuning to each subquery (see Section 5)
6. UNION all subqueries
7. Deduplicate by `greenhouse_id`, collecting `matched_filter_ids[]`
8. Exclude hidden jobs
9. Apply sort
10. Return total count + page slice

### 4.3 Output Schema
```sql
greenhouse_id       text
title               text
company_name        text
location            text
loc_country         text
loc_state           text
loc_city            text
is_remote           boolean
salary_min          integer
salary_max          integer
salary_currency     text
salary_rate         text
created_at          timestamptz
apply_url           text
ats_source          text
extracted_seniority text
extracted_skills    text[]
is_staffing_agency  boolean
ai_label            text        -- null if unscored
ai_content_score    real        -- null if unscored
matched_filter_ids  uuid[]      -- which filters matched this job
total_count         bigint      -- total across all pages
```

---

## 5. GLOBAL RULES

Global rules are stored in `profiles.user_data->'tuning'` and apply to **every search** regardless of which filters are active. They are a base layer applied before any filter criteria.

### 5.1 Rule Definitions

| Rule | Field in tuning | Type | Behavior |
|---|---|---|---|
| US Only | `usOnly` | boolean | Restrict to `loc_country = 'US'` OR `is_remote = true` |
| Exclude Staffing | `excludeStaffing` | boolean | Exclude `is_staffing_agency = true` |
| Exclude Hourly | `excludeHourly` | boolean | Exclude `salary_rate = 'hourly'` |
| Company Excludes | `companyExcludes` | text[] | Exclude any job where `company_name ILIKE` any value |
| Title Excludes | `titleExcludes` | text[] | Exclude any job where `title ILIKE` any value |
| Location Excludes | `locationExcludes` | text[] | Exclude any job where `location ILIKE` any value |
| Industry Excludes | `industryExcludes` | text[] | Exclude any job where `industry ILIKE` any value |
| Level Match | `levelMatch` | boolean | Only show jobs matching user's target levels |
| Target Levels | `levels` | text[] | Which seniority levels to match (when levelMatch=true) |

### 5.2 Global Rule Conflict Resolution

**Global rule always wins over filter value when the global rule is more restrictive.**

| Conflict | Resolution |
|---|---|
| `usOnly = true` AND filter `where` includes Canada | Canada jobs excluded. US Only is a hard exclusion. User sees US/remote results only. No error shown — filter just produces fewer results. |
| `companyExcludes` contains "Google" AND filter `who` includes "Google" | Google excluded. Global block takes precedence. |
| `titleExcludes` contains "manager" AND filter `what` includes "manager" | Manager jobs excluded. Global block takes precedence. |
| `excludeStaffing = true` AND filter targets a staffing company | Staffing company excluded. |
| `levelMatch = true` AND filter has no level criteria | Level match still applied from `levels` list. |

**UI responsibility:** When a global rule conflicts with an active filter, show a warning indicator on the affected filter pill. Example: "organic usa remote 2" with Canada in `where` while `usOnly = true` — the `where` pill shows a ⚠️ icon with tooltip "Overridden by Global Rule: US Only."

---

## 6. FILTER SYSTEM

### 6.1 Filter Data Schema (Canonical)
All filters stored in `user_filters.filter_data` must conform to this format. Legacy formats are normalized on read.

```json
{
  "whatPills":     [{ "type": "keyword", "values": ["seo"] }],
  "whatNotPills":  [{ "type": "not",     "values": ["paid"] }],
  "wherePills":    [{ "type": "where",   "values": ["united states"] }],
  "whereNotPills": [{ "type": "not",     "values": ["new york"] }],
  "whoPills":      [{ "type": "who",     "values": ["google"] }],
  "whoNotPills":   [{ "type": "not",     "values": ["staffing"] }],
  "whenPills":     [{ "type": "when",    "values": ["last 14 days"] }],
  "payPills":      [{ "type": "pay",     "min": "130000", "max": "", "values": ["$130k+"] }],
  "levelPills":    [{ "type": "level",   "values": ["senior"] }],
  "skillsPills":   [{ "type": "skill",   "values": ["python"] }],
  "deptPills":     [{ "type": "dept",    "values": ["engineering"] }],
  "jdPills":       [{ "type": "jd",      "values": ["series b"] }],
  "includeRemote": true,
  "includeNoSalary": true,
  "_filterColor": "#6366f1",
  "_filterNum": "1"
}
```

### 6.2 Filter Field Behavior

**WHAT (title keywords)**
- Multiple values = OR logic: "seo" OR "organic search"
- Applied as: `title ILIKE '%seo%' OR title ILIKE '%organic search%'`
- Across multiple active filters = each filter's WHAT is self-contained

**WHAT NOT (title exclusions)**
- Multiple values = AND logic: NOT "paid" AND NOT "ads"
- Applied as: `title NOT ILIKE '%paid%' AND title NOT ILIKE '%ads%'`

**WHERE (location)**
- "united states" triggers full US logic: `loc_country = 'US'` OR state-level matching OR remote
- Other values: `location ILIKE '%value%'`
- Multiple values = OR logic

**WHERE NOT (location exclusions)**
- Multiple values = AND exclusion: NOT London AND NOT UK
- Applied as: `location NOT ILIKE '%london%' AND location NOT ILIKE '%uk%'`

**WHO (company include)**
- Multiple values = OR logic
- Applied as: `company_name ILIKE '%google%' OR company_name ILIKE '%meta%'`

**WHO NOT (company exclusion)**
- Multiple values = AND exclusion

**WHEN (date range)**
- Applied to `created_at` (when job was first posted)
- Values: "any time" (no filter), "today", "last 3 days", "last 7 days", "last 14 days", "last 30 days"
- Applied as: `created_at >= now() - interval`

**HOW MUCH (salary)**
- Min: `salary_max >= min_value` (job's max salary meets user's minimum)
- Max: `salary_min <= max_value` (job's min salary is within user's maximum)
- `includeNoSalary = true`: also include jobs where `salary_max IS NULL`

**SKILLS**
- Matched against `extracted_skills` array column
- Multiple values = OR logic

**LEVEL**
- Matched against `extracted_seniority` column
- Falls back to title keyword matching via user's `levelHierarchy` from tuning

**DEPT**
- Matched against `extracted_department` column

**JD CONTAINS**
- Full text search against `content_tsv`

**INCLUDE REMOTE**
- When checked: include jobs where `is_remote = true` regardless of location filter

**INCLUDE WITHOUT SALARY**
- When checked: include jobs where `salary_max IS NULL`

### 6.3 Filter Field Conflict Resolution

**Same field, same value in both include and exclude:**

| Conflict | Resolution |
|---|---|
| WHAT = "manager" AND WHAT NOT = "manager" | Exclude wins. No manager jobs shown. Show ⚠️ on the include pill. |
| WHERE = "united states" AND WHERE NOT = "united states" | Exclude wins. No US jobs. Show ⚠️. |
| WHO = "google" AND WHO NOT = "google" | Exclude wins. No Google jobs. Show ⚠️. |
| HOW MUCH min > max | Invalid state. Show validation error inline. Prevent search until resolved. |
| HOW MUCH max < min | Same as above. |
| Same term in WHAT of two different active filters | Fine — OR logic across filters, job appears once. |
| WHEN = "today" but no jobs today | Returns zero results. No error. Show "No jobs found" empty state. |

**Across Global Rules and Filters:**
Global rules always win. See Section 5.2.

### 6.4 Multiple Active Filters

When multiple saved searches are checked:
- Each filter runs as a separate subquery in `search_jobs`
- Results are UNIONed and deduplicated by `greenhouse_id`
- Each job carries `matched_filter_ids[]` indicating which filters matched it
- Sort and pagination apply to the merged result set
- Total count reflects deduplicated total

---

## 7. SORT

### 7.1 Sort Fields

| Label | DB Column | Default Direction |
|---|---|---|
| Days | `created_at` | Descending (newest first) |
| Salary | `salary_max` | Descending (highest first) |
| Company | `company_name` | Ascending (A-Z) |
| Title | `title` | Ascending (A-Z) |
| Level | `extracted_seniority` | Client-side only — not DB sort |
| Match | match score | Client-side only — not DB sort |

### 7.2 Default Sort
`created_at DESC` — newest jobs first. Always.

### 7.3 Sort Behavior
- One active sort at a time. Clicking a sort column replaces the current sort.
- Clicking the active sort column toggles direction.
- Sort applies server-side in `search_jobs`. Client does not re-sort.

---

## 8. PAGINATION

- Page size: 50 jobs per page
- 0-based page index
- `search_jobs` returns `total_count` with every response
- Client displays "Showing X–Y of Z jobs"
- Page change calls `search_jobs` immediately (no debounce)
- Navigating back to feed from another page restores last page from React state (not localStorage, not re-query if state still exists in memory)

---

## 9. REACTIVITY & PERFORMANCE

### 9.1 Debounce Strategy
| Action | Debounce | Reason |
|---|---|---|
| Filter check/uncheck | 500ms | User may check multiple filters rapidly |
| Filter builder value change | 500ms | User may be mid-typing |
| Page change | None | Explicit action, execute immediately |
| Sort change | None | Explicit action, execute immediately |
| Job save/hide/apply | None | Write actions, execute immediately |

### 9.2 Background Processing
These happen after results render. They do not block the UI.

| Process | Trigger | Writes to |
|---|---|---|
| Trust/AI scoring | Job card first rendered, score null | `ats_jobs.ai_label`, `ats_jobs.ai_content_score` |
| Score once per job | Stored permanently | All future users see cached score |

### 9.3 Session Caching
These are loaded once per session and held in React state. Not re-fetched unless user triggers a save/delete.

| Data | Loaded when | Held in |
|---|---|---|
| All user filters | Session start | React state |
| Tuning/global rules | Session start | React state |
| Pipeline job IDs | Session start | React state (`Set<string>`) |
| Applied job IDs | Session start | React state (`Set<string>`) |

---

## 10. TEST CASES

### 10.1 Single Filter Tests

| Test | Setup | Expected Result |
|---|---|---|
| WHAT single term | what = "seo" | All results contain "seo" in title |
| WHAT multiple terms | what = "seo", "organic search" | Results contain "seo" OR "organic search" in title |
| WHAT NOT single term | whatNot = "paid" | No results contain "paid" in title |
| WHAT NOT multiple terms | whatNot = "paid", "ads" | No results contain "paid" OR "ads" in title |
| WHAT + WHAT NOT same term | what = "manager", whatNot = "manager" | Zero results. ⚠️ shown on include pill |
| WHERE = united states | where = "united states" | Only US or remote jobs |
| WHERE + includeRemote | where = "new york", includeRemote = true | New York jobs + all remote jobs |
| WHERE NOT | whereNot = "london" | No London jobs |
| WHO include | who = "google" | Only Google jobs |
| WHO exclude | whoNot = "staffing" | No jobs with "staffing" in company name |
| WHEN = today | when = "today" | Only jobs posted today (created_at >= midnight today) |
| WHEN = last 7 days | when = "last 7 days" | Jobs from last 7 days only |
| HOW MUCH min only | payMin = 130000 | Only jobs with salary_max >= 130000 OR salary_max null (if includeNoSalary) |
| HOW MUCH max only | payMax = 150000 | Only jobs with salary_min <= 150000 |
| HOW MUCH min > max | payMin = 200000, payMax = 100000 | Validation error. No search. |
| HOW MUCH max < min | payMax = 50000, payMin = 100000 | Validation error. No search. |
| LEVEL = senior | level = "senior" | Only jobs tagged senior |
| SKILLS = python | skills = "python" | Only jobs with python in extracted_skills |
| includeNoSalary = false | | Zero salary_max null jobs in results |

### 10.2 Multiple Filter Tests

| Test | Setup | Expected Result |
|---|---|---|
| Two filters, overlapping results | filter A: "seo", filter B: "marketing" | SEO + marketing jobs, no duplicates |
| Two filters, no overlap | filter A: "nurse", filter B: "blockchain" | Both result sets merged, deduplicated |
| Filter A: US only, Filter B: no location | Combined results from both | Filter B results include non-US jobs — each filter is independent |
| Three filters active | A + B + C | Results from all three, deduplicated, correct total count |
| Filter with zero results + filter with results | A returns 0, B returns 50 | 50 results shown, no error |
| All filters unchecked | no filters checked | Unfiltered feed — all open jobs, sorted by created_at DESC |

### 10.3 Global Rules Tests

| Test | Setup | Expected Result |
|---|---|---|
| usOnly = true | Global: usOnly on | Only US/remote jobs. Non-US always excluded. |
| usOnly = true + filter where = Canada | Global: usOnly, Filter: Canada | Zero Canada results. ⚠️ on Canada where pill. |
| companyExcludes = ["staffing corp"] | Global exclude, filter has no company | "Staffing Corp" never appears |
| companyExcludes = ["google"] + filter who = "google" | Conflict | Zero Google results. ⚠️ on Google who pill. |
| titleExcludes = ["intern"] + filter what = "intern" | Conflict | Zero intern results. ⚠️ on intern what pill. |
| excludeStaffing = true | Global: exclude staffing | is_staffing_agency = true jobs never appear |
| locationExcludes = ["remote - india"] | Global: exclude location | No India remote jobs |
| levelMatch = true, levels = ["director"] | Global: level match | Only director-level jobs |

### 10.4 Sort Tests

| Test | Setup | Expected Result |
|---|---|---|
| Default sort | No sort selected | created_at DESC — newest job first |
| Sort by Days | Click Days | created_at DESC. First job has highest created_at. Verify against DB. |
| Sort by Days ascending | Click Days twice | created_at ASC — oldest job first |
| Sort by Salary | Click Salary | salary_max DESC — highest salary first |
| Sort by Company | Click Company | company_name ASC — A before Z |
| Sort with active filter | Filter active, sort by salary | Filtered results sorted by salary |

### 10.5 Pagination Tests

| Test | Setup | Expected Result |
|---|---|---|
| Page 2 shows different jobs | Go to page 2 | Different 50 jobs than page 1. No overlap. |
| Page count correct | 150 results | 3 pages shown |
| Last page | Go to last page | Fewer than 50 jobs, no Next button |
| Navigate away and back | Go to Pipeline, return | Same page, same results, no re-query |
| Filter change resets to page 1 | On page 3, check new filter | Returns to page 1 with new results |

### 10.6 Pipeline / Save Tests

| Test | Setup | Expected Result |
|---|---|---|
| Save a job | Click Pipeline on a job | Button shows Pipeline ✓. |
| Verify DB write | After save | Row in `user_pipeline` with stage='saved', job_title, company_name, job_url, ats_source |
| Appears in My Applications | After save | Job visible in Applications page under Saved |
| Reload feed | After save, reload | Job still shows Pipeline ✓ |
| Save same job twice | Click Pipeline twice | One row in DB. No duplicate. No error. |
| Unsave | Click Pipeline ✓ to toggle off | Row deleted from `user_pipeline`. Button returns to Pipeline. |

### 10.7 Hide Tests

| Test | Setup | Expected Result |
|---|---|---|
| Hide a job | Click X on job | Job disappears immediately |
| Verify DB write | After hide | Row in `hidden_jobs` |
| Reload feed | After hide | Job does not reappear |
| Hidden job excluded from all filters | Hide job, change filter | Job never appears regardless of filter |

---

## 11. CONFLICT RESOLUTION RULES — SUMMARY

In priority order, highest wins:

1. **Validation errors** — invalid HOW MUCH range blocks search entirely
2. **Global rules** — always override filter values
3. **Exclude pills** — exclude beats include when same term in both
4. **Include pills** — positive filter criteria
5. **Default feed** — when no filters active

---

## 12. OPEN ITEMS (Not Yet Designed)

These features are catalogued but not yet specified. Do not build until specified here.

- **System Counts (Feature 1):** Definition of each counter, query source, update frequency
- **Merchandising Blocks (Feature 2):** Content rules, rotation logic, trigger conditions
- **Filters From Resumes (Feature 4):** Resume parsing, field mapping, save flow
- **Chat/Guided (Feature 6):** Prompt structure, Claude API integration, filter mapping
- **JD Enrichment (Feature 11):** Company industry source, ghost rate join
- **Filter/JD Matching (Feature 12):** Scoring algorithm, display
- **Trust/AI Scoring (Feature 9):** Score-once trigger, background job design
- **Browse Modals (Feature 6B):** Company index, skills index — materialized table design
- **Color Schemes (Feature 14):** Full color assignment rules

---

## 13. CHANGE LOG

| Date | Version | Author | Change |
|---|---|---|---|
| 2026-03-23 | 1.0 | Taylor | Initial specification |

