# Task: ATS Board Health Metrics (Admin Panel) — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P1 — Operational visibility before launch
**Effort:** ~1.5 dev days
**Spec:** `docs/ats-board-health-feature-brief.md`
**Depends on:** Nothing

---

## What Exists Today

**Already live:**
- `ats_companies` table — ~10,000 boards, composite PK `(slug, source)`, has `job_count`, `last_checked`
- `ats_jobs` table — ~285K jobs, has `closed_at` (populated on all closed jobs), `first_seen_at`, `status`
- `profiles.role` column — `admin`/`user`, Marston set to admin (Architecture Review A3)
- Admin RLS pattern — EXISTS subquery on `profiles.role = 'admin'` (verified, no recursion)
- `refresh-jobs` Edge Function — already marks disappeared jobs as closed with `closed_at`
- Close detection — active, 4,674 closed jobs have `closed_at` populated
- CORS lockdown — anon can't read `ats_companies` or `ats_jobs` (RPC required)

**What's missing:**
- `last_http_status` column on `ats_companies`
- `last_refresh_at` column on `ats_companies`
- `created_at` column on `ats_companies` (check if exists — may not)
- `refresh-jobs` doesn't record HTTP status on board fetch
- No admin page in dashboard
- No health queries/RPCs

---

## Build Order (6 steps)

### Step 1: Migration (1h)

```sql
-- 1a. Add columns to ats_companies
ALTER TABLE ats_companies 
  ADD COLUMN IF NOT EXISTS last_http_status INT,
  ADD COLUMN IF NOT EXISTS last_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 1b. Composite index for health queries
CREATE INDEX IF NOT EXISTS idx_ats_companies_health 
  ON ats_companies (source, last_http_status, job_count);

-- 1c. Index for delta queries (boards added in period)
CREATE INDEX IF NOT EXISTS idx_ats_companies_created 
  ON ats_companies (created_at);

-- 1d. Index for delta queries (boards that went dead in period)
CREATE INDEX IF NOT EXISTS idx_ats_companies_refresh 
  ON ats_companies (last_refresh_at) WHERE last_http_status BETWEEN 400 AND 499;

-- 1e. closed_at index (already exists per audit — verify)
-- CREATE INDEX IF NOT EXISTS idx_ats_jobs_closed 
--   ON ats_jobs (closed_at) WHERE closed_at IS NOT NULL;

-- 1f. first_seen_at index for jobs-added delta (already exists — verify)
-- idx_ats_jobs_first_seen_status already covers this
```

**Judgment call for Pod 2:** Single migration file (`004_ats_board_health.sql`) or inline with another migration? Recommend standalone.

### Step 2: Edge Function update — refresh-jobs (1h)

Two changes to the existing `refresh-jobs` Edge Function:

**2a. Record HTTP status on every board fetch:**
```javascript
// After fetching a board's job feed (success or failure)
await supabase
  .from('ats_companies')
  .update({ 
    last_http_status: response.status,  // 200, 404, 403, etc.
    last_refresh_at: new Date().toISOString()
  })
  .eq('slug', board.slug)
  .eq('source', board.source);
```

**2b. Handle timeouts/network errors:**
```javascript
// In catch block for fetch failures (no HTTP response)
await supabase
  .from('ats_companies')
  .update({ 
    last_http_status: 0,  // 0 = timeout/network error (not a real HTTP status)
    last_refresh_at: new Date().toISOString()
  })
  .eq('slug', board.slug)
  .eq('source', board.source);
```

**2c. Ensure closed_at is idempotent** (may already be — verify):
```javascript
// When marking disappeared jobs as closed
.is('closed_at', null)  // Only set once — don't overwrite
```

**Note:** Edge Function source is not in the GitHub repo. Pod 2 deploys directly via Supabase CLI.

### Step 3: Backfill known dead boards (0.5h)

The Feb 16 validation identified ~238 dead boards. Pod 2 needs to either:
- Re-run the validation script and mark boards that return 4xx
- Or wait for the updated `refresh-jobs` to naturally populate `last_http_status` over the next ~33 hours (one full refresh cycle covers all 10K boards at 50/cycle × 10min intervals)

**Recommendation:** Wait for natural population. The refresh cycle will fill in all statuses within 33 hours. No manual backfill needed — just deploy the Edge Function update and let it run.

For `created_at` backfill on existing rows (if the column was just added): leave as `NOW()` — we don't have historical creation dates, and the delta metrics only matter going forward.

### Step 4: Admin RPC functions (1.5h)

Create two SECURITY DEFINER functions. Both check `profiles.role = 'admin'` internally.

**4a. Snapshot + deltas:**
```sql
CREATE OR REPLACE FUNCTION get_board_health(period_hours INT DEFAULT 168)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  period_start TIMESTAMPTZ := NOW() - (period_hours || ' hours')::INTERVAL;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_build_object(
    -- Snapshot
    'total_feeds', (SELECT COUNT(*) FROM ats_companies),
    'feeds_with_jobs', (SELECT COUNT(*) FROM ats_companies WHERE job_count > 0),
    'feeds_4xx', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status BETWEEN 400 AND 499),
    'feeds_never_scraped', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status IS NULL),
    'feeds_zero_jobs', (SELECT COUNT(*) FROM ats_companies WHERE job_count = 0 AND (last_http_status IS NULL OR last_http_status = 200)),
    'total_jobs', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed'),
    
    -- Deltas
    'boards_added', (SELECT COUNT(*) FROM ats_companies WHERE created_at >= period_start),
    'boards_lost', (SELECT COUNT(*) FROM ats_companies WHERE last_http_status BETWEEN 400 AND 499 AND last_refresh_at >= period_start),
    'jobs_added', (SELECT COUNT(*) FROM ats_jobs WHERE first_seen_at >= period_start),
    'jobs_lost', (SELECT COUNT(*) FROM ats_jobs WHERE closed_at >= period_start),
    
    -- Derived
    'feed_health_pct', ROUND(
      (SELECT COUNT(*) FROM ats_companies WHERE job_count > 0)::NUMERIC / 
      NULLIF((SELECT COUNT(*) FROM ats_companies), 0) * 100, 1
    )
  ) INTO result;

  RETURN result;
END;
$$;
```

**4b. Platform breakdown:**
```sql
CREATE OR REPLACE FUNCTION get_board_health_by_platform(period_hours INT DEFAULT 168)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSON;
  period_start TIMESTAMPTZ := NOW() - (period_hours || ' hours')::INTERVAL;
BEGIN
  -- Admin check
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO result FROM (
    SELECT 
      c.source AS platform,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.job_count > 0) AS with_jobs,
      COUNT(*) FILTER (WHERE c.last_http_status BETWEEN 400 AND 499) AS errors_4xx,
      COUNT(*) FILTER (WHERE c.created_at >= period_start) AS boards_added,
      COUNT(*) FILTER (WHERE c.last_http_status BETWEEN 400 AND 499 AND c.last_refresh_at >= period_start) AS boards_lost,
      COALESCE(j.job_count, 0) AS jobs,
      COALESCE(j.jobs_added, 0) AS jobs_added,
      COALESCE(j.jobs_lost, 0) AS jobs_lost
    FROM ats_companies c
    LEFT JOIN LATERAL (
      SELECT 
        COUNT(*) FILTER (WHERE status != 'closed') AS job_count,
        COUNT(*) FILTER (WHERE first_seen_at >= period_start) AS jobs_added,
        COUNT(*) FILTER (WHERE closed_at >= period_start) AS jobs_lost
      FROM ats_jobs 
      WHERE ats_source = c.source
    ) j ON TRUE
    GROUP BY c.source, j.job_count, j.jobs_added, j.jobs_lost
    ORDER BY total DESC
  ) t;

  RETURN result;
END;
$$;
```

**Judgment call for Pod 2:** The platform breakdown query joins `ats_jobs` per source — with 285K jobs this should be fast with existing indexes, but test execution time. If > 200ms, consider pre-aggregating job counts per source.

### Step 5: Admin page in dashboard (2h)

**5a. Add nav item** in `dashboard.html`:
```html
<!-- In the nav, after existing items, admin-only -->
<a class="nav-item" id="nav-admin" onclick="showPage('admin')" style="display:none">
  <svg><!-- shield or gear icon --></svg>
  <span>Admin</span>
</a>
```

Show/hide based on role:
```javascript
// In app.js init or wherever currentUser is set
if (currentUser?.role === 'admin') {
  document.getElementById('nav-admin').style.display = '';
}
```

**5b. Add page section** in `dashboard.html`:
```html
<div class="page" id="page-admin">
  <div class="page-header">
    <h2>Admin</h2>
    <p>Platform health & operations</p>
  </div>
  <div class="page-body">
    <!-- Period toggle -->
    <div class="admin-period-toggle" id="admin-period-toggle">
      <button class="admin-period-btn" data-hours="24">24h</button>
      <button class="admin-period-btn active" data-hours="168">7d</button>
      <button class="admin-period-btn" data-hours="720">30d</button>
    </div>

    <!-- Stat cards -->
    <div class="stat-grid" id="admin-stats">
      <div class="stat-card">
        <div class="stat-val" id="ah-total">—</div>
        <div class="stat-label">Total Feeds</div>
        <div class="admin-delta" id="ah-total-delta"></div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="ah-with-jobs">—</div>
        <div class="stat-label">With Jobs</div>
        <div class="admin-delta" id="ah-with-jobs-delta"></div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="ah-4xx">—</div>
        <div class="stat-label">4xx Errors</div>
        <div class="admin-delta" id="ah-4xx-delta"></div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="ah-jobs">—</div>
        <div class="stat-label">Total Jobs</div>
        <div class="admin-delta" id="ah-jobs-delta"></div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="ah-net">—</div>
        <div class="stat-label">Net Jobs</div>
        <div class="admin-delta" id="ah-net-delta"></div>
      </div>
    </div>

    <!-- Health indicator -->
    <div class="admin-health" id="admin-health"></div>

    <!-- Platform breakdown table -->
    <div class="card" style="margin-top:20px">
      <table class="admin-platform-table" id="admin-platform-table">
        <thead>
          <tr>
            <th>Platform</th><th>Total</th><th>+Added</th><th>-Lost</th>
            <th>With Jobs</th><th>4xx</th>
            <th>Jobs</th><th>+New</th><th>-Closed</th>
          </tr>
        </thead>
        <tbody id="admin-platform-body"></tbody>
      </table>
    </div>
  </div>
</div>
```

**5c. CSS** — add to `src/input.css` Stats section (or new Admin section):
```css
.admin-period-toggle {
  display: flex; gap: 4px; margin-block-end: 16px;
}
.admin-period-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg-card); color: var(--text-dim);
  font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: var(--sans); transition: all 0.15s;
}
.admin-period-btn.active {
  background: var(--accent); color: #fff; border-color: var(--accent);
}
.admin-delta {
  font-size: 10px; font-family: var(--mono); margin-block-start: 4px;
  font-weight: 600;
}
.admin-delta .up { color: var(--green); }
.admin-delta .down { color: var(--red); }
.admin-delta .flat { color: var(--warm); }
.admin-health {
  font-size: 12px; font-weight: 600; margin-block-end: 16px;
  display: flex; align-items: center; gap: 8px;
}
.admin-health-dot {
  width: 10px; height: 10px; border-radius: 50%;
}
.admin-health-dot.green { background: var(--green); box-shadow: 0 0 8px hsla(var(--green-hsl), 0.5); }
.admin-health-dot.amber { background: var(--warm); box-shadow: 0 0 8px hsla(var(--warm-hsl), 0.5); }
.admin-health-dot.red { background: var(--red); box-shadow: 0 0 8px hsla(var(--red-hsl), 0.5); }
.admin-platform-table { width: 100%; border-collapse: collapse; }
.admin-platform-table th {
  text-align: start; font-size: 10px; color: var(--text-faint);
  text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;
  padding: 8px 10px; border-block-end: 2px solid var(--border);
}
.admin-platform-table td {
  padding: 8px 10px; font-size: 12px; font-family: var(--mono);
  border-block-end: 1px solid var(--border); color: var(--text-dim);
}
.admin-platform-table tr:hover td { background: var(--bg-hover); }
```

### Step 6: Admin JS module (1.5h)

Create `js/admin.js`:

```javascript
// js/admin.js — ATS Board Health metrics

var adminPeriod = parseInt(localStorage.getItem('bj_admin_period') || '168');

async function loadBoardHealth() {
  const [snapshot, platforms] = await Promise.all([
    sb.rpc('get_board_health', { period_hours: adminPeriod }),
    sb.rpc('get_board_health_by_platform', { period_hours: adminPeriod })
  ]);

  if (snapshot.error || platforms.error) {
    console.error('Admin RPC error:', snapshot.error, platforms.error);
    return;
  }

  var d = snapshot.data;

  // Stat cards
  setText('ah-total', d.total_feeds.toLocaleString());
  setText('ah-with-jobs', d.feeds_with_jobs.toLocaleString());
  setText('ah-4xx', d.feeds_4xx.toLocaleString());
  setText('ah-jobs', d.total_jobs.toLocaleString());

  var netJobs = d.jobs_added - d.jobs_lost;
  var netEl = document.getElementById('ah-net');
  if (netEl) {
    netEl.textContent = (netJobs >= 0 ? '+' : '') + netJobs.toLocaleString();
    netEl.style.color = netJobs > 0 ? 'var(--green)' : netJobs < 0 ? 'var(--red)' : 'var(--warm)';
  }

  // Deltas
  setDelta('ah-total-delta', d.boards_added, d.boards_lost);
  setDelta('ah-with-jobs-delta', d.boards_added, d.boards_lost); // approximate
  setDelta('ah-4xx-delta', d.boards_lost, 0); // boards going dead
  setDelta('ah-jobs-delta', d.jobs_added, d.jobs_lost);

  // Health indicator
  var deadPct = d.total_feeds > 0 ? (d.feeds_4xx / d.total_feeds * 100) : 0;
  var healthEl = document.getElementById('admin-health');
  var dotClass = deadPct < 5 ? 'green' : deadPct < 10 ? 'amber' : 'red';
  var healthLabel = d.feed_health_pct + '% healthy · ' + d.feeds_4xx + ' dead · ' + d.feeds_never_scraped + ' never scraped';
  healthEl.innerHTML = '<span class="admin-health-dot ' + dotClass + '"></span> ' + healthLabel;

  // Platform table
  renderPlatformTable(platforms.data);
}

function setDelta(id, added, lost) {
  var el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '<span class="up">▲' + added.toLocaleString() + '</span> <span class="down">▼' + lost.toLocaleString() + '</span>';
}

function renderPlatformTable(platforms) {
  var tbody = document.getElementById('admin-platform-body');
  if (!tbody || !platforms) return;
  tbody.innerHTML = platforms.map(function(p) {
    return '<tr>' +
      '<td style="font-family:var(--sans);font-weight:600;text-transform:capitalize">' + p.platform + '</td>' +
      '<td>' + p.total.toLocaleString() + '</td>' +
      '<td style="color:var(--green)">+' + p.boards_added + '</td>' +
      '<td style="color:var(--red)">-' + p.boards_lost + '</td>' +
      '<td>' + p.with_jobs.toLocaleString() + '</td>' +
      '<td>' + p.errors_4xx + '</td>' +
      '<td>' + p.jobs.toLocaleString() + '</td>' +
      '<td style="color:var(--green)">+' + p.jobs_added.toLocaleString() + '</td>' +
      '<td style="color:var(--red)">-' + p.jobs_lost.toLocaleString() + '</td>' +
      '</tr>';
  }).join('');
}

// Period toggle
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('admin-period-btn')) {
    document.querySelectorAll('.admin-period-btn').forEach(function(b) { b.classList.remove('active'); });
    e.target.classList.add('active');
    adminPeriod = parseInt(e.target.dataset.hours);
    localStorage.setItem('bj_admin_period', adminPeriod);
    loadBoardHealth();
  }
});

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}
```

Load in `dashboard.html` after other modules:
```html
<script src="js/admin.js"></script>
```

Call `loadBoardHealth()` when admin page is shown (in `showPage()` logic).

---

## Acceptance Criteria

### Database
- [ ] `last_http_status INT` column exists on `ats_companies`
- [ ] `last_refresh_at TIMESTAMPTZ` column exists on `ats_companies`
- [ ] `created_at TIMESTAMPTZ DEFAULT NOW()` column exists on `ats_companies`
- [ ] Composite index on `(source, last_http_status, job_count)` exists
- [ ] Migration file in `migrations/` directory

### Edge Function
- [ ] `refresh-jobs` records `last_http_status` + `last_refresh_at` on every board fetch
- [ ] Successful fetches record `200`
- [ ] 4xx/5xx responses record the actual status code
- [ ] Timeouts/network errors record `0`
- [ ] `closed_at` only set once per job (idempotent)

### Admin RPCs
- [ ] `get_board_health(period_hours)` returns snapshot + delta JSON
- [ ] `get_board_health_by_platform(period_hours)` returns per-platform breakdown
- [ ] Both functions reject non-admin callers with exception
- [ ] Both execute in < 200ms

### Admin UI
- [ ] Admin nav item visible only when `profiles.role = 'admin'`
- [ ] Non-admin users cannot see or access admin page
- [ ] 5 stat cards render: Total Feeds, With Jobs, 4xx Errors, Total Jobs, Net Jobs
- [ ] Delta badges show `▲added ▼lost` beneath each card
- [ ] Net Jobs card is green/red/amber based on sign
- [ ] Health indicator dot: green < 5% dead, amber 5-10%, red > 10%
- [ ] Period toggle: 24h / 7d / 30d (default 7d, persists in localStorage)
- [ ] Platform breakdown table shows all 5 platforms with snapshot + delta columns
- [ ] All numbers update when period is toggled
- [ ] Uses design system CSS variables (--bg-card, --border, --text, --mono, etc.)

---

## Open Questions (Pod 2 decides)

1. **Platform breakdown query performance:** The LATERAL join across 285K jobs per source — fast enough? If not, simplify to two separate queries.
2. **Edge Function deployment:** Source not in GitHub repo. Deploy via Supabase CLI. Verify the existing refresh cycle structure before patching.
3. **Backfill approach:** Wait for natural population via refresh cycle (~33h) vs. manual backfill script. Natural is recommended.

---

*Pod 1 has provided all SQL, CSS, and JS. Pod 2 executes. The only judgment calls are query performance tuning and Edge Function deployment mechanics.*
