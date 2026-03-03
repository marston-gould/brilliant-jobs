# Task: Admin Console — Tabbed Architecture

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P2 — Post-launch Sprint 1
**Effort:** ~5 dev days (incremental — tabs ship independently)
**Depends on:** ATS Board Health (Step 1 complete), Cohort Phase A (done), Session Analytics Phase B (for Tab 3)

---

## What Exists Today

The Admin page (`#page-admin`) is a single-purpose ATS Board Health view:

**HTML** (`dashboard.html` L1626-1683):
- Page header: "Admin — Platform health & operations"
- Period toggle: 24h / 7d / 30d buttons (`.admin-period-toggle`)
- 5 stat cards: Total Feeds, With Jobs, 4xx Errors, Total Jobs, Net Jobs
- Health indicator dot (green/amber/red)
- Platform breakdown table (Greenhouse, Lever, Ashby, Workable, Recruitee)

**JS** (`js/admin.js` — 135 lines):
- `initAdminPage()` — initializes on page show
- `loadBoardHealth()` — calls `get_board_health()` + `get_board_health_by_platform()` RPCs
- `checkAdminAccess()` — shows nav item if `profiles.role === 'admin'`
- Period toggle persists to `localStorage('bj_admin_period')`

**CSS** (`src/input.css` L467-511):
- `.admin-period-toggle`, `.admin-period-btn`, `.admin-delta`
- `.admin-health`, `.admin-health-dot` (green/amber/red)
- `.admin-platform-table`
- Color utilities: `.admin-green`, `.admin-red`, `.admin-amber`

**Nav** (`dashboard.html` L114):
```html
<div class="nav-item" id="nav-admin" data-page="admin" style="display:none">
```

---

## Architecture: Tab System

Convert the admin page from single-purpose to a tabbed console. The tab bar sits below the page header, above the content. Each tab has its own content panel that shows/hides.

### Tab Bar

5 tabs, shipping incrementally:

| Tab | Label | Status | Data Source | Ships |
|-----|-------|--------|-------------|-------|
| 1 | Feed Health | ✅ Built | `get_board_health()`, `get_board_health_by_platform()` | Now (refactor only) |
| 2 | Cohorts | New | `cohorts`, `cohort_plan_entitlements`, `profiles` | Sprint 1 |
| 3 | Users | New | `user_sessions`, `profiles`, PostHog | Sprint 1 (after Phase B) |
| 4 | SEO | New | External page RPCs, PostHog, Search Console | Sprint 2 |
| 5 | Revenue | New | `plans`, Stripe (when integrated) | Sprint 2+ |

### HTML Structure

Replace the current `#page-admin` content:

```html
<div class="page" id="page-admin">
  <div class="page-header">
    <h2>Admin</h2>
    <p>Platform operations & analytics</p>
  </div>
  <div class="page-body">
    <!-- Tab bar -->
    <div class="admin-tabs" id="admin-tabs">
      <button class="admin-tab active" data-tab="feed-health">Feed Health</button>
      <button class="admin-tab" data-tab="cohorts">Cohorts</button>
      <button class="admin-tab" data-tab="users">Users</button>
      <button class="admin-tab" data-tab="seo">SEO</button>
      <button class="admin-tab" data-tab="revenue">Revenue</button>
    </div>

    <!-- Tab panels -->
    <div class="admin-panel active" id="admin-panel-feed-health">
      <!-- EXISTING board health content moves here unchanged -->
    </div>

    <div class="admin-panel" id="admin-panel-cohorts">
      <!-- Cohort performance content -->
    </div>

    <div class="admin-panel" id="admin-panel-users">
      <!-- User/session analytics content -->
    </div>

    <div class="admin-panel" id="admin-panel-seo">
      <!-- SEO performance content -->
    </div>

    <div class="admin-panel" id="admin-panel-revenue">
      <!-- Revenue/monetization content -->
    </div>
  </div>
</div>
```

### CSS

```css
/* Admin tab bar */
.admin-tabs {
  display: flex;
  gap: 2px;
  margin-block-end: 20px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
}
.admin-tab {
  padding: 10px 18px;
  border: none;
  background: none;
  color: var(--text-dim);
  font-size: 13px;
  font-weight: 600;
  font-family: var(--sans);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.15s;
}
.admin-tab:hover {
  color: var(--text);
  background: var(--bg-hover);
}
.admin-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}
.admin-tab.disabled {
  color: var(--text-faint);
  cursor: default;
  opacity: 0.5;
}

/* Tab panels */
.admin-panel { display: none; }
.admin-panel.active { display: block; }
```

### JS — Tab Switching

Add to `js/admin.js`:

```javascript
// Tab state
var adminActiveTab = localStorage.getItem('bj_admin_tab') || 'feed-health';
var _tabInitialized = {};

function initAdminTabs() {
  var tabBar = document.getElementById('admin-tabs');
  if (!tabBar) return;

  tabBar.addEventListener('click', function(e) {
    var btn = e.target.closest('.admin-tab');
    if (!btn || btn.classList.contains('disabled')) return;

    var tabId = btn.dataset.tab;
    switchAdminTab(tabId);
  });

  // Restore saved tab
  switchAdminTab(adminActiveTab);
}

function switchAdminTab(tabId) {
  // Update buttons
  document.querySelectorAll('.admin-tab').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tabId);
  });

  // Update panels
  document.querySelectorAll('.admin-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'admin-panel-' + tabId);
  });

  adminActiveTab = tabId;
  localStorage.setItem('bj_admin_tab', tabId);

  // Lazy-init tab content
  if (!_tabInitialized[tabId]) {
    _tabInitialized[tabId] = true;
    switch (tabId) {
      case 'feed-health': loadBoardHealth(); break;
      case 'cohorts': loadCohortTab(); break;
      case 'users': loadUsersTab(); break;
      case 'seo': loadSeoTab(); break;
      case 'revenue': loadRevenueTab(); break;
    }
  }
}
```

Update `initAdminPage()`:
```javascript
function initAdminPage() {
  var page = document.getElementById('page-admin');
  if (!page || !page.classList.contains('active')) return;
  initAdminTabs(); // replaces direct loadBoardHealth() call
}
```

---

## Tab 1: Feed Health (refactor only — 0.25 day)

Move existing board health HTML into `#admin-panel-feed-health`. No functional changes. The period toggle, stat cards, health indicator, and platform table all move as-is.

**Only change:** The period toggle now lives inside the panel, not at page level. This means each tab can have its own time controls.

---

## Tab 2: Cohorts (1.5 days)

**Purpose:** See how cohorts are performing. Which cohort configurations drive the best engagement and conversion?

### Data Available Now (Phase A complete)

| Table | Key Columns |
|-------|-------------|
| `cohorts` | `id`, `slug`, `name`, `description`, `is_locked`, `created_at` |
| `cohort_plan_entitlements` | `cohort_id`, `plan`, `feature`, `behavior`, `limit_value`, `bonus_max` |
| `profiles` | `cohort_id`, `plan`, `created_at`, `last_sign_in_at` |

### RPC

```sql
CREATE OR REPLACE FUNCTION get_cohort_overview()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT 
        c.id,
        c.slug,
        c.name,
        c.is_locked,
        c.created_at,
        COUNT(p.id) AS user_count,
        COUNT(p.id) FILTER (WHERE p.plan = 'pro') AS pro_count,
        COUNT(p.id) FILTER (WHERE p.plan = 'free') AS free_count,
        COUNT(p.id) FILTER (
          WHERE p.last_sign_in_at > NOW() - INTERVAL '7 days'
        ) AS active_7d,
        COUNT(p.id) FILTER (
          WHERE p.last_sign_in_at > NOW() - INTERVAL '30 days'
        ) AS active_30d,
        (SELECT COUNT(*) FROM cohort_plan_entitlements e WHERE e.cohort_id = c.id) AS entitlement_count
      FROM cohorts c
      LEFT JOIN profiles p ON p.cohort_id = c.id
      GROUP BY c.id, c.slug, c.name, c.is_locked, c.created_at
      ORDER BY c.created_at DESC
    ) t
  );
END;
$$;
-- Admin only
GRANT EXECUTE ON FUNCTION get_cohort_overview() TO authenticated;
```

### Panel Content

```html
<div class="admin-panel" id="admin-panel-cohorts">
  <!-- Summary cards -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-val" id="ac-total-cohorts">—</div>
      <div class="stat-label">Cohorts</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ac-total-users">—</div>
      <div class="stat-label">Total Users</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ac-pro-pct">—</div>
      <div class="stat-label">Pro Conversion</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ac-active-7d">—</div>
      <div class="stat-label">Active (7d)</div>
    </div>
  </div>

  <!-- Cohort table -->
  <div class="card" style="margin-block-start:20px;overflow-x:auto">
    <table class="admin-platform-table" id="admin-cohort-table">
      <thead>
        <tr>
          <th>Cohort</th><th>Users</th><th>Free</th><th>Pro</th>
          <th>Active 7d</th><th>Active 30d</th><th>Entitlements</th><th>Locked</th>
        </tr>
      </thead>
      <tbody id="admin-cohort-body"></tbody>
    </table>
  </div>

  <!-- Entitlement detail (expandable per cohort) -->
  <div class="card" style="margin-block-start:16px;display:none" id="admin-cohort-detail">
    <h3 style="font-size:14px;margin-bottom:12px" id="admin-cohort-detail-title"></h3>
    <table class="admin-platform-table" id="admin-entitlement-table">
      <thead>
        <tr><th>Feature</th><th>Plan</th><th>Behavior</th><th>Limit</th><th>Bonus Max</th></tr>
      </thead>
      <tbody id="admin-entitlement-body"></tbody>
    </table>
  </div>
</div>
```

### JS

```javascript
async function loadCohortTab() {
  try {
    var res = await sb.rpc('get_cohort_overview');
    if (res.error) { console.error('[Admin] Cohort RPC error:', res.error); return; }
    var cohorts = res.data;
    if (!cohorts || !cohorts.length) return;

    // Summary cards
    var totalUsers = cohorts.reduce(function(s, c) { return s + c.user_count; }, 0);
    var totalPro = cohorts.reduce(function(s, c) { return s + c.pro_count; }, 0);
    var active7d = cohorts.reduce(function(s, c) { return s + c.active_7d; }, 0);

    setAdminText('ac-total-cohorts', cohorts.length);
    setAdminText('ac-total-users', fmtNum(totalUsers));
    setAdminText('ac-pro-pct', totalUsers > 0 ? Math.round(totalPro / totalUsers * 100) + '%' : '—');
    setAdminText('ac-active-7d', fmtNum(active7d));

    // Table
    var tbody = document.getElementById('admin-cohort-body');
    if (!tbody) return;
    tbody.innerHTML = cohorts.map(function(c) {
      return '<tr class="admin-cohort-row" data-cohort-id="' + c.id + '" style="cursor:pointer">' +
        '<td class="admin-platform-name">' + c.name + ' <span style="color:var(--text-faint);font-size:10px">(' + c.slug + ')</span></td>' +
        '<td>' + fmtNum(c.user_count) + '</td>' +
        '<td>' + fmtNum(c.free_count) + '</td>' +
        '<td class="admin-green">' + fmtNum(c.pro_count) + '</td>' +
        '<td>' + fmtNum(c.active_7d) + '</td>' +
        '<td>' + fmtNum(c.active_30d) + '</td>' +
        '<td>' + c.entitlement_count + '</td>' +
        '<td>' + (c.is_locked ? '🔒' : '—') + '</td>' +
        '</tr>';
    }).join('');

    // Click to expand entitlement detail
    tbody.addEventListener('click', function(e) {
      var row = e.target.closest('.admin-cohort-row');
      if (!row) return;
      var cohortId = row.dataset.cohortId;
      var cohort = cohorts.find(function(c) { return String(c.id) === cohortId; });
      if (cohort) loadCohortDetail(cohort);
    });
  } catch (err) {
    console.error('[Admin] loadCohortTab error:', err);
  }
}

async function loadCohortDetail(cohort) {
  var detail = document.getElementById('admin-cohort-detail');
  var title = document.getElementById('admin-cohort-detail-title');
  var tbody = document.getElementById('admin-entitlement-body');
  if (!detail || !tbody) return;

  title.textContent = cohort.name + ' — Entitlements';
  detail.style.display = '';

  var res = await sb.from('cohort_plan_entitlements')
    .select('feature, plan, behavior, limit_value, bonus_max')
    .eq('cohort_id', cohort.id)
    .order('plan')
    .order('feature');

  if (res.error || !res.data) return;

  tbody.innerHTML = res.data.map(function(e) {
    return '<tr>' +
      '<td>' + e.feature + '</td>' +
      '<td>' + e.plan + '</td>' +
      '<td>' + e.behavior + '</td>' +
      '<td>' + (e.limit_value != null ? e.limit_value : '∞') + '</td>' +
      '<td>' + (e.bonus_max != null ? e.bonus_max : '—') + '</td>' +
      '</tr>';
  }).join('');
}
```

---

## Tab 3: Users (1.5 days)

**Purpose:** User activity, session patterns, retention signals. Replaces needing to go to PostHog for basic metrics.

**Blocked on:** Cohort Phase B (session analytics). Until Phase B ships, show a placeholder with basic profile stats.

### Pre-Phase B (ship immediately)

```sql
CREATE OR REPLACE FUNCTION get_user_overview()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'active_7d', (SELECT COUNT(*) FROM profiles WHERE last_sign_in_at > NOW() - INTERVAL '7 days'),
    'active_30d', (SELECT COUNT(*) FROM profiles WHERE last_sign_in_at > NOW() - INTERVAL '30 days'),
    'new_7d', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '7 days'),
    'pro_users', (SELECT COUNT(*) FROM profiles WHERE plan = 'pro'),
    'with_filters', (SELECT COUNT(DISTINCT user_id) FROM saved_filters),
    'with_resumes', (SELECT COUNT(DISTINCT user_id) FROM resumes),
    'with_connections', (SELECT COUNT(DISTINCT user_id) FROM connections WHERE user_id IS NOT NULL),
    'signup_by_week', (
      SELECT json_agg(row_to_json(t) ORDER BY t.week) FROM (
        SELECT DATE_TRUNC('week', created_at)::DATE AS week, COUNT(*) AS count
        FROM profiles
        WHERE created_at > NOW() - INTERVAL '26 weeks'
        GROUP BY 1
      ) t
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_user_overview() TO authenticated;
```

### Panel Content

```html
<div class="admin-panel" id="admin-panel-users">
  <!-- Summary cards -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-val" id="au-total">—</div>
      <div class="stat-label">Total Users</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="au-active-7d">—</div>
      <div class="stat-label">Active (7d)</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="au-new-7d">—</div>
      <div class="stat-label">New (7d)</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="au-pro">—</div>
      <div class="stat-label">Pro Users</div>
    </div>
  </div>

  <!-- Feature adoption -->
  <div class="card" style="margin-block-start:20px">
    <h3 style="font-size:14px;margin-bottom:12px">Feature Adoption</h3>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-val" id="au-filters">—</div>
        <div class="stat-label">With Saved Filters</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="au-resumes">—</div>
        <div class="stat-label">With Resumes</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" id="au-connections">—</div>
        <div class="stat-label">With Connections</div>
      </div>
    </div>
  </div>

  <!-- Signup trend chart (ECharts) -->
  <div class="card" style="margin-block-start:16px">
    <h3 style="font-size:14px;margin-bottom:12px">Signups by Week</h3>
    <div id="admin-signup-chart" style="width:100%;height:200px"></div>
  </div>
</div>
```

### Post-Phase B Enhancement

When `user_sessions` table exists, add:
- Sessions per day chart
- Average session duration
- Cohort × session cross-reference (which cohort has highest engagement?)
- Device breakdown (desktop vs mobile)
- Referral source breakdown

These are additive — the pre-Phase B version ships immediately.

---

## Tab 4: SEO (1 day)

**Purpose:** Are the external data pages driving traffic? Which pages perform best?

### Data Available

- External page RPCs (from data-pages-livedata-task.md) will return data freshness
- PostHog events on external pages (if instrumented)
- Manual inputs: Search Console data (not API-connected, but could display snapshots)

### Pre-integration (ship immediately)

Simple status dashboard showing the health of external data pages:

```sql
CREATE OR REPLACE FUNCTION get_seo_page_health()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object(
    'total_jobs', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed'),
    'with_salary', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)),
    'with_industry', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND industry IS NOT NULL),
    'with_level', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND career_level IS NOT NULL AND career_level != 'Unclassified'),
    'with_location', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND loc_state IS NOT NULL),
    'with_department', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND department IS NOT NULL),
    'last_job_seen', (SELECT MAX(first_seen_at) FROM ats_jobs)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_seo_page_health() TO authenticated;
```

### Panel Content

```html
<div class="admin-panel" id="admin-panel-seo">
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-val" id="as-total">—</div>
      <div class="stat-label">Open Jobs</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="as-salary">—</div>
      <div class="stat-label">With Salary</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="as-industry">—</div>
      <div class="stat-label">With Industry</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="as-location">—</div>
      <div class="stat-label">With Location</div>
    </div>
  </div>

  <!-- Data coverage table -->
  <div class="card" style="margin-block-start:20px">
    <h3 style="font-size:14px;margin-bottom:12px">Data Coverage — Powers External Pages</h3>
    <table class="admin-platform-table" id="admin-seo-table">
      <thead>
        <tr><th>Column</th><th>Populated</th><th>Coverage</th><th>Powers Page</th></tr>
      </thead>
      <tbody id="admin-seo-body"></tbody>
    </table>
  </div>

  <!-- External pages status -->
  <div class="card" style="margin-block-start:16px">
    <h3 style="font-size:14px;margin-bottom:12px">External Pages</h3>
    <table class="admin-platform-table">
      <thead>
        <tr><th>Page</th><th>URL</th><th>Charts</th><th>Data Source</th></tr>
      </thead>
      <tbody>
        <tr><td>Salary Data</td><td><a href="/salary-data" target="_blank">/salary-data</a></td><td>4</td><td id="as-sal-src">—</td></tr>
        <tr><td>Hiring Trends</td><td><a href="/hiring-trends" target="_blank">/hiring-trends</a></td><td>4</td><td id="as-hire-src">—</td></tr>
        <tr><td>Jobs by Industry</td><td><a href="/jobs-by-industry" target="_blank">/jobs-by-industry</a></td><td>4</td><td id="as-ind-src">—</td></tr>
        <tr><td>Career Levels</td><td><a href="/career-level-data" target="_blank">/career-level-data</a></td><td>4</td><td id="as-lvl-src">—</td></tr>
        <tr><td>Market Dynamics</td><td><a href="/market-dynamics" target="_blank">/market-dynamics</a></td><td>3</td><td id="as-mkt-src">—</td></tr>
      </tbody>
    </table>
  </div>
</div>
```

The "Data Source" column shows "Live RPC" or "Hardcoded" based on whether the RPCs from the data-pages-livedata-task have been deployed. Simple client-side check: try calling each RPC, mark green if it returns data, red if it fails.

---

## Tab 5: Revenue (0.75 day)

**Purpose:** Monetization readiness and tracking. Pre-Stripe: shows plan distribution and entitlement structure. Post-Stripe: shows MRR, conversion rates, churn.

### Pre-Stripe (ship immediately)

```sql
CREATE OR REPLACE FUNCTION get_revenue_overview()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object(
    'plan_distribution', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT COALESCE(plan, 'free') AS plan, COUNT(*) AS count
        FROM profiles
        GROUP BY plan
      ) t
    ),
    'total_users', (SELECT COUNT(*) FROM profiles),
    'pro_users', (SELECT COUNT(*) FROM profiles WHERE plan = 'pro'),
    'enterprise_users', (SELECT COUNT(*) FROM profiles WHERE plan = 'enterprise'),
    'conversion_rate', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE plan = 'pro')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
      ) FROM profiles
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_revenue_overview() TO authenticated;
```

### Panel Content

```html
<div class="admin-panel" id="admin-panel-revenue">
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-val" id="ar-mrr">$0</div>
      <div class="stat-label">MRR</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ar-pro">—</div>
      <div class="stat-label">Pro Users</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ar-conversion">—</div>
      <div class="stat-label">Conversion Rate</div>
    </div>
    <div class="stat-card">
      <div class="stat-val" id="ar-total">—</div>
      <div class="stat-label">Total Users</div>
    </div>
  </div>

  <!-- Plan breakdown -->
  <div class="card" style="margin-block-start:20px">
    <h3 style="font-size:14px;margin-bottom:12px">Plan Distribution</h3>
    <table class="admin-platform-table">
      <thead>
        <tr><th>Plan</th><th>Users</th><th>% of Total</th></tr>
      </thead>
      <tbody id="admin-plan-body"></tbody>
    </table>
  </div>

  <!-- Stripe placeholder -->
  <div class="card" style="margin-block-start:16px;text-align:center;padding:32px;color:var(--text-dim)">
    <p style="font-size:13px">Stripe integration pending. MRR, churn, and billing metrics will appear here once connected.</p>
  </div>
</div>
```

### Post-Stripe Enhancement

When Stripe is integrated, add:
- MRR calculation (pro_users × price)
- MRR growth chart (weekly)
- Churn rate (cancellations / active)
- Trial → Pro conversion funnel
- Revenue by cohort

---

## Build Order

| Step | What | Effort | Ships |
|------|------|--------|-------|
| 1 | Tab bar + switching + refactor Feed Health into panel | 0.5 day | Now |
| 2 | Cohorts tab (RPC + UI + entitlement drill-down) | 1.5 days | Sprint 1 |
| 3 | Users tab — pre-Phase B version (RPC + stat cards + signup chart) | 0.75 day | Sprint 1 |
| 4 | Revenue tab — pre-Stripe version (RPC + plan distribution) | 0.5 day | Sprint 1 |
| 5 | SEO tab (RPC + coverage table + page status) | 0.75 day | Sprint 1 |
| 6 | Users tab — Phase B enhancement (sessions, retention) | 1 day | After Phase B |
| 7 | Revenue tab — Stripe enhancement (MRR, churn) | TBD | After Stripe |

**Steps 1-5 total: ~4 dev days.** Steps 6-7 are additive and come later.

---

## Acceptance Criteria

### Tab System
- [ ] 5 tabs visible in admin page
- [ ] Tab switching shows/hides panels
- [ ] Active tab persists in `localStorage('bj_admin_tab')`
- [ ] Lazy initialization — tab data only fetches on first view
- [ ] Feed Health tab works identically to current admin page (no regression)

### Cohorts Tab
- [ ] Summary cards: total cohorts, total users, pro conversion %, 7d active
- [ ] Cohort table with user counts, plan breakdown, activity, lock status
- [ ] Click a cohort row → expands entitlement detail below
- [ ] Entitlement table shows feature, plan, behavior, limits

### Users Tab
- [ ] Summary cards: total users, 7d active, 7d new, pro users
- [ ] Feature adoption cards: filters, resumes, connections
- [ ] Signup-by-week bar chart (ECharts, reuse existing instance)

### SEO Tab
- [ ] Data coverage table: column name, populated count, % coverage, which page it powers
- [ ] External pages table with links + data source status

### Revenue Tab
- [ ] Summary cards: MRR ($0 pre-Stripe), pro users, conversion rate, total users
- [ ] Plan distribution table
- [ ] Stripe placeholder message

---

## What NOT to Change

- `checkAdminAccess()` — admin visibility gating stays the same
- Nav item structure — still `data-page="admin"`, still hidden by default
- Existing `.admin-*` CSS classes — extend, don't rename
- Board health RPCs — `get_board_health()` and `get_board_health_by_platform()` stay as-is
- ECharts loading — already available in dashboard

---

## Pod 2 Judgment Calls

1. **Shared vs. separate JS files:** All tab logic could live in `admin.js` (growing from 135 to ~400 lines), or each tab could be a separate module (`admin-cohorts.js`, `admin-users.js`, etc.). Single file is simpler; separate files scale better. Your call.
2. **RPC access control:** Currently using `GRANT TO authenticated`. If you want stricter admin-only access, wrap each RPC with a `profiles.role = 'admin'` check inside the function body. The existing pattern checks role client-side in `checkAdminAccess()` — server-side is more secure.
3. **ECharts for the signup chart:** The signup-by-week chart in the Users tab needs ECharts. ECharts is already loaded in `dashboard.html`. If the Admin page is the only consumer, consider whether a simpler CSS bar chart would suffice to avoid the rendering overhead.

---

*Tabs ship independently. Feed Health refactor (Step 1) is zero-risk. Each subsequent tab adds value on its own. No tab depends on another tab being complete.*
