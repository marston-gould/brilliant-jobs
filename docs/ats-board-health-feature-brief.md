# Feature Brief: ATS Board Health Metrics (Admin Panel)

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 19, 2026
**Priority:** P1 — Operational visibility (launch-critical)
**Target:** v2.68 (ship alongside Stats page)

---

## CPO Decision

We have ~10,000 boards in `ats_companies` across 5 ATS platforms, and we're adding new ones regularly. But we currently have no centralized view of board health — how many are identified, how many are actually returning jobs, and how many are dead (4xx responses). This is operational blindness. When boards go dead, our job count drops silently. When we add new boards, we can't confirm they're producing data without querying the database manually.

This needs to be visible in the admin panel before launch. It doesn't need to be pretty — it needs to be accurate and glanceable.

---

## User Story

**As** the platform operator (Marston),
**I want to** see at a glance how many ATS feeds are identified, how many are actively producing jobs, and how many are returning errors,
**So that** I can monitor data pipeline health, catch dead boards quickly, and verify that newly added boards are working.

---

## Required Metrics

### Snapshot Metrics (current state)

Three headline numbers, always visible in the admin panel:

| Metric | Definition | Source |
|--------|-----------|--------|
| **Total Identified Feeds** | Count of all rows in `ats_companies` | `SELECT COUNT(*) FROM ats_companies` |
| **Feeds With Jobs** | Count of boards where `job_count > 0` (or that have at least 1 matching row in `ats_jobs` with `status != 'closed'`) | `SELECT COUNT(*) FROM ats_companies WHERE job_count > 0` |
| **Feeds Returning 4xx** | Count of boards where last refresh returned a 4xx HTTP status (dead, removed, or access denied) | Requires tracking `last_http_status` on `ats_companies` — see Data Requirements |
| **Total Jobs** | Count of all open (non-closed) jobs in `ats_jobs` | `SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed'` |

### Delta Metrics (change over time)

These track pipeline growth and churn. Essential for knowing whether the data asset is healthy.

| Metric | Definition | Time Windows |
|--------|-----------|-------------|
| **Companies Added** | New rows inserted into `ats_companies` within the period | 24h, 7d, 30d |
| **Companies Lost** | Boards that transitioned to 4xx status (were healthy, now dead) within the period | 24h, 7d, 30d |
| **Net Company Change** | Added minus Lost | 24h, 7d, 30d |
| **Jobs Added** | New rows inserted into `ats_jobs` (by `first_seen_at`) within the period | 24h, 7d, 30d |
| **Jobs Lost** | Jobs marked as closed/disappeared within the period | 24h, 7d, 30d |
| **Net Job Change** | Added minus Lost | 24h, 7d, 30d |

Display format for deltas — green up arrow for positive, red down arrow for negative:

```
┌──────────────────┐ ┌──────────────────┐
│      9,992       │ │     135,247      │
│   Total Feeds    │ │    Total Jobs    │
│  ▲ +47 / ▼ -12  │ │ ▲ +2,341 / ▼ -890│
│    (last 7d)     │ │    (last 7d)     │
└──────────────────┘ └──────────────────┘
```

### Derived Metrics (computed from snapshot + deltas)

| Metric | Definition |
|--------|-----------|
| **Feed Health %** | `(Feeds With Jobs / Total Identified) * 100` — overall pipeline health indicator |
| **Feeds Never Scraped** | Boards with `NULL` job_count and no `last_checked` timestamp — newly added, not yet in the refresh cycle |
| **Feeds With 0 Jobs** | `job_count = 0` but NOT 4xx — board is live but company has no open roles (normal, not an error) |
| **Churn Rate** | `Companies Lost / Total Feeds * 100` over 30d — if this exceeds 5%, something is wrong |
| **Job Turnover Rate** | `Jobs Lost / Total Jobs * 100` over 7d — natural rate for job postings closing; spikes indicate scraper issues |

### Delta Metrics (Change Over Time)

The health snapshot tells you where you are. The delta metrics tell you where you're heading. These should be visible alongside the headline numbers, covering configurable time periods (24h, 7d, 30d).

**Board Deltas:**

| Metric | Definition | Source |
|--------|-----------|--------|
| **Boards Added** | New rows inserted into `ats_companies` in the period | `created_at >= [period_start]` (requires `created_at` column — see Data Requirements) |
| **Boards Lost** | Boards that transitioned from healthy (200) to dead (4xx) in the period | `last_http_status BETWEEN 400 AND 499 AND last_refresh_at >= [period_start]` cross-referenced against a previous healthy state |

**Job Deltas:**

| Metric | Definition | Source |
|--------|-----------|--------|
| **Jobs Added** | New rows inserted into `ats_jobs` in the period | `first_seen_at >= [period_start]` (column already exists) |
| **Jobs Lost** | Jobs marked closed or disappeared in the period | Requires `closed_at` or `last_seen_at` timestamp — see Data Requirements |

**Display format:** Each headline stat card gets a small delta badge beneath the number:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    9,992     │ │    7,234     │ │     238      │
│ Total Feeds  │ │  With Jobs   │ │  4xx Errors  │
│  +47 / -3    │ │  +41 / -8    │ │  +5 / -2     │
│   (7 days)   │ │   (7 days)   │ │   (7 days)   │
└──────────────┘ └──────────────┘ └──────────────┘

┌──────────────┐ ┌──────────────┐
│   293,412    │ │   +4,218     │
│  Total Jobs  │ │  Net Change  │
│ +5,102 / -884│ │   (7 days)   │
│   (7 days)   │ │              │
└──────────────┘ └──────────────┘
```

Green for positive net change, red for negative, amber for flat. The delta numbers themselves are always shown as `+added / -lost` so the operator can see both churn and growth, not just the net.

### Period Selector

A simple toggle above the stat cards: **24h | 7d | 30d**. Defaults to 7d. All delta metrics recalculate on toggle. Persists selection in localStorage (`bj_admin_period`).

### Breakdown by Platform

The platform table also gets delta columns:

| Platform | Total | +Added | -Lost | With Jobs | 4xx | Jobs | +New | -Closed |
|----------|-------|--------|-------|-----------|-----|------|------|---------|
| Greenhouse | 3,830 | +12 | -1 | 3,102 | 41 | 116K | +2.1K | -340 |
| Lever | 1,154 | +8 | -0 | 987 | 22 | 10.5K | +890 | -120 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

The expanded platform table above replaces the simple breakdown — it shows snapshot counts plus the delta columns for the selected period.

---

## Data Requirements

### Current `ats_companies` Schema (relevant columns)

Based on project knowledge, `ats_companies` currently has:
- `slug` — board identifier
- `source` — ATS platform (greenhouse, lever, ashby, workable, recruitee)
- `job_count` — last known job count (updated by board validation script)
- `last_checked` — timestamp of last validation

### What's Missing

**For health snapshot:**

The "Feeds Returning 4xx" metric requires knowing the HTTP response status from the last refresh attempt. Two options:

**Option A: Add `last_http_status` column to `ats_companies` (recommended)**
- `ALTER TABLE ats_companies ADD COLUMN last_http_status INT;`
- `refresh-jobs` Edge Function updates this column on every board refresh
- 200 = healthy, 404/410 = dead board, 403 = access denied, NULL = never attempted
- Simple, queryable, no additional tables

**Option B: Add `last_error` text column**
- More flexible — stores error messages, not just codes
- But harder to aggregate (need to parse text for counts)

**For delta tracking:**

The delta metrics require knowing *when* things happened. Several columns are needed:

| Column | Table | Purpose | Status |
|--------|-------|---------|--------|
| `created_at` | `ats_companies` | When a board was first added | **May not exist** — check schema. If missing, add with `DEFAULT NOW()` |
| `last_http_status` | `ats_companies` | HTTP status from last refresh | **Missing** — add |
| `last_refresh_at` | `ats_companies` | When last refresh was attempted | **Missing** — add |
| `first_seen_at` | `ats_jobs` | When a job was first discovered | **Exists** — already used for C1 timeline chart |
| `closed_at` | `ats_jobs` | When a job was marked closed/disappeared | **May not exist** — check schema. Currently jobs are "marked as closed" but unclear if timestamp is recorded |
| `status` | `ats_jobs` | Job status (open/closed) | **Likely exists** — referenced in project knowledge |

**Critical check for Pod 2:** Verify whether `ats_companies.created_at` and `ats_jobs.closed_at` exist. If `closed_at` doesn't exist, the "Jobs Lost" delta requires either:
- Adding `closed_at TIMESTAMPTZ` and backfilling from existing closed jobs
- Or using `updated_at` as a proxy (less accurate — any update triggers it, not just closure)

### Migration

```sql
-- Migration: Board health tracking + delta support

-- Health snapshot columns
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS last_http_status INT;
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ;

-- Delta tracking: ensure created_at exists
ALTER TABLE ats_companies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Job closure tracking (if not already present)
ALTER TABLE ats_jobs ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Indexes for admin health queries
CREATE INDEX IF NOT EXISTS idx_ats_companies_health 
  ON ats_companies (source, last_http_status, job_count);
CREATE INDEX IF NOT EXISTS idx_ats_companies_created
  ON ats_companies (created_at);
CREATE INDEX IF NOT EXISTS idx_ats_jobs_closed
  ON ats_jobs (closed_at) WHERE closed_at IS NOT NULL;

-- Backfill: mark 238 known dead boards from Feb 16 validation
-- (Pod 2 to confirm exact slug list)
```

### Edge Function Update (`refresh-jobs`)

**Board status tracking** — on each board refresh attempt:
```javascript
// After attempting to fetch a board's job feed
const { status } = response;
await supabase
  .from('ats_companies')
  .update({ 
    last_http_status: status, 
    last_refresh_at: new Date().toISOString() 
  })
  .eq('slug', board.slug)
  .eq('source', board.source);
```

**Job closure tracking** — when marking disappeared jobs as closed:
```javascript
// Existing logic marks disappeared jobs as closed
// Add: set closed_at timestamp when transitioning to closed
await supabase
  .from('ats_jobs')
  .update({ 
    status: 'closed',
    closed_at: new Date().toISOString()
  })
  .in('greenhouse_id', disappearedIds)
  .eq('ats_source', board.source)
  .is('closed_at', null);  // Only set once — don't overwrite on subsequent cycles
```

Both changes happen in the existing refresh cycle — no new Edge Functions needed.

---

## Admin Panel Placement

### Where It Lives

The admin panel isn't formally defined yet in the project knowledge. Two options:

**Option A: Dedicated admin page (recommended)**
A new page in the dashboard, visible only to admin users (role check against `profiles.role` or a simple email allowlist). Contains board health metrics plus any other operational dashboards we'll need (user counts, job refresh status, notification delivery rates, etc.).

**Option B: Existing Settings or Stats page**
Embed the board health metrics in an admin-only section of an existing page. Less work, but mixes operational monitoring with user-facing features.

**Recommendation:** Option A if the admin page is on the near-term roadmap anyway. Option B if this needs to ship in 1 day. Either way, the metrics themselves are the same — just the container differs.

### UI Treatment

Five stat cards at the top with delta indicators (same visual pattern as Stats page stat cards). Each card shows the current number plus added/lost for the selected period:

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│    9,992     │ │    7,234     │ │     238      │ │   293,412    │ │   +4,218     │
│ Total Feeds  │ │  With Jobs   │ │  4xx Errors  │ │  Total Jobs  │ │  Net Jobs    │
│ ▲+47  ▼-12  │ │ ▲+41  ▼-8   │ │ ▲+5   ▼-2   │ │▲+5,102 ▼-884│ │   (7 days)   │
│   (7 days)   │ │   (7 days)   │ │   (7 days)   │ │   (7 days)   │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

Color coding: green ▲ for adds, red ▼ for losses. Net change card is green if positive, red if negative, amber if flat.

Period toggle above the cards: **24h | 7d | 30d** (default 7d).

---

## Acceptance Criteria

### Health Snapshot
- [ ] Total Identified Feeds count displays correctly (matches `SELECT COUNT(*) FROM ats_companies`)
- [ ] Feeds With Jobs count displays correctly (boards with `job_count > 0`)
- [ ] Feeds Returning 4xx count displays correctly (boards with `last_http_status` between 400–499)
- [ ] Total Jobs count displays correctly (matches open jobs in `ats_jobs`)
- [ ] All numbers update on page load (or admin panel load)
- [ ] Platform breakdown table shows per-source counts for all 5 platforms

### Delta Tracking
- [ ] Period selector toggles between 24h / 7d / 30d
- [ ] Boards Added shows count of `ats_companies` rows with `created_at` in selected period
- [ ] Boards Lost shows count of boards that transitioned to 4xx in selected period
- [ ] Jobs Added shows count of `ats_jobs` rows with `first_seen_at` in selected period
- [ ] Jobs Lost shows count of `ats_jobs` rows with `closed_at` in selected period
- [ ] Delta badges show `+added / -lost` format beneath each stat card
- [ ] Green/red/amber color coding on net change (positive/negative/flat)
- [ ] Platform breakdown table includes delta columns (+Added, -Lost for both boards and jobs)
- [ ] Period selection persists in localStorage (`bj_admin_period`)

### Database
- [ ] `last_http_status` column added to `ats_companies`
- [ ] `last_refresh_at` column added to `ats_companies`
- [ ] `created_at` column exists on `ats_companies` (add if missing)
- [ ] `closed_at` column exists on `ats_jobs` (add if missing)
- [ ] Indexes created for efficient health + delta queries
- [ ] 238 known dead boards backfilled with appropriate 4xx status

### Edge Function
- [ ] `refresh-jobs` updates `last_http_status` and `last_refresh_at` on every board refresh attempt
- [ ] `refresh-jobs` sets `closed_at` timestamp when marking jobs as closed
- [ ] `closed_at` only set once per job (idempotent — doesn't overwrite on subsequent cycles)
- [ ] Both successful (200) and failed (4xx, 5xx) responses are recorded
- [ ] Timeout/network errors recorded as a distinguishable status (e.g., `last_http_status = 0`)

### Admin Access
- [ ] Board health metrics visible only to admin users
- [ ] Non-admin users cannot access the admin view

---

## Success Criteria

This isn't a user-facing feature — success is operational:
- Marston can check board health and pipeline deltas in < 5 seconds without querying the database
- Dead boards are identifiable within one refresh cycle (~33 hours) of going down
- New boards added to `ats_companies` show "never scraped" status until first refresh
- Platform-level breakdown enables quick identification of ATS-wide issues (e.g., "Lever API changed, all Lever boards returning 403")
- A sudden spike in "Jobs Lost" or "Companies Lost" triggers investigation before users notice data quality drops
- After adding a batch of new companies, Marston can confirm they're being picked up by checking the 24h "Companies Added" count

---

## Build Order

1. **Migration** — add `last_http_status`, `last_refresh_at`, `created_at` (if missing) to `ats_companies` + `closed_at` (if missing) to `ats_jobs` + indexes
2. **Edge Function update** — record HTTP status on board refresh + `closed_at` on job closure
3. **Backfill** — mark known dead boards with 4xx status; backfill `closed_at` for already-closed jobs if possible
4. **Admin query layer** — Supabase RPC or client queries returning snapshot metrics + delta counts for a given period
5. **UI: stat cards** — 5 cards (Total Feeds, With Jobs, 4xx, Total Jobs, Net Job Change) with delta badges
6. **UI: period selector** — 24h / 7d / 30d toggle
7. **UI: platform breakdown table** — per-source counts with delta columns

**Estimated effort:** 2–3 dev days. The migration + Edge Function update is < 1 day. The admin UI with delta calculations is 1–2 days depending on admin page scaffolding.

---

## Constraints

- **No new Edge Functions** — update the existing `refresh-jobs` function
- **Admin-only** — these metrics are not user-facing
- **Dark theme** — match existing dashboard aesthetic if building an admin page
- **Lightweight query** — the health metrics query should be fast (< 200ms). The index on `(source, last_http_status, job_count)` covers this.

---

## Open Questions for Pod 2

1. **Admin page:** Does one exist already, or is this the first admin-only feature? If first, what's the access control mechanism — role column in `profiles`, email allowlist, or feature flag?
2. **Backfill accuracy:** The Feb 16 validation identified 238 dead boards. Are those slug+source pairs documented somewhere for the backfill query, or does Pod 2 need to re-run the validation script?
3. **Timeout handling:** When `refresh-jobs` times out on a board (no HTTP response at all), what should `last_http_status` be? Suggest `0` or `-1` to distinguish from actual 4xx responses.
4. **Historical tracking:** Should we keep a `board_health_log` table tracking status changes over time (for trending), or is current-state-only sufficient for launch? Recommend current-state-only for now.

---

*This brief was produced by Pod 1 (Growth). Pod 2 has authority on admin access control implementation and Edge Function architecture.*
