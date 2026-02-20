# Task: External Data Pages — Live Data + Security + CTAs — Pod 2 Handoff

**From:** Pod 1 (Growth) — CPO
**To:** Pod 2 (Engineering) — CTO
**Date:** February 20, 2026
**Priority:** P0 (security) + P1 (credibility) — Launch-critical
**Effort:** ~4 dev days
**Audit:** `docs/data-pages-audit.md`
**Depends on:** Nothing

---

## What Exists Today

**6 public data pages + 1 hub, all dark theme, vanilla JS, ECharts 5:**

| Page | File | Charts | Data Source | CTA |
|------|------|--------|-------------|-----|
| Data Lab (hub) | `data-lab.html` (202L) | 0 (stat cards) | Hardcoded | Weak (FAQ only) |
| Salary Data | `salary-data.html` (231L) | 4 | Hardcoded JS arrays | **None** |
| Hiring Trends | `hiring-trends.html` (230L) | 4 | Hardcoded JS arrays | **None** |
| Jobs by Industry | `jobs-by-industry.html` (226L) | 4 | Hardcoded JS arrays | **None** |
| Career Level Data | `career-level-data.html` (222L) | 4 | Hardcoded JS arrays | **None** |
| Market Dynamics | `market-dynamics.html` (462L) | 3 | **Anon key + REST API** | **None** |

**Shared patterns across all pages:**
- ECharts loaded from `/js/vendor/echarts.custom.min.js` (self-hosted, deferred)
- Common helpers: `TT` (tooltip), `AL` (axis label), `SP` (split line), `PAL` (15-color palette), `fmt()`, `fmtM()`
- `I(id)` function creates ECharts instance and pushes to `chs[]` for resize
- Footer: `.foot` div with methodology line + version + links
- Breadcrumb: `/ → /data-lab → [page]`
- Eyebrow: "Brilliant Jobs · Data Lab"
- All pages claim "Updated daily" but 5 of 6 have frozen data from Feb 18

---

## Build Order (5 steps)

### Step 1: Fix market-dynamics security (P0 — 0.5 day)

**Problem:** `market-dynamics.html` L137-139 exposes the raw Supabase anon key and queries 4 materialized views directly via REST API:
```javascript
var SB = 'https://qojhagupdnbtomfoxnsf.supabase.co/rest/v1';
var AK = 'eyJhbGci...';  // ANON KEY EXPOSED
var HD = {'apikey':AK,'Authorization':'Bearer '+AK};
async function q(table) {
  var r = await fetch(SB+'/'+table+'?select=*&limit=10000',{headers:HD});
  return r.json();
}
// Queries: mv_industry_dept_week, mv_dept_level_week, mv_state_week, mv_state_velocity
```

**Fix:** Create a single SECURITY DEFINER RPC that returns all data the page needs:

```sql
CREATE OR REPLACE FUNCTION get_market_dynamics()
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN json_build_object(
    'industry_dept', (SELECT json_agg(row_to_json(t)) FROM mv_industry_dept_week t),
    'dept_level', (SELECT json_agg(row_to_json(t)) FROM mv_dept_level_week t),
    'state_week', (SELECT json_agg(row_to_json(t)) FROM mv_state_week t),
    'state_velocity', (SELECT json_agg(row_to_json(t)) FROM mv_state_velocity t)
  );
END;
$$;

-- Public access (no auth required — this is a public SEO page)
GRANT EXECUTE ON FUNCTION get_market_dynamics() TO anon;
```

**Update market-dynamics.html** — replace the REST query block (L137-151):

```javascript
// BEFORE (remove this)
var SB = '...'; var AK = '...'; var HD = {...};
async function q(table) { ... }
var [indDept, deptLevel, stateData] = await Promise.all([
  q('mv_industry_dept_week'), q('mv_dept_level_week'), q('mv_state_week')
]);
var velData = await q('mv_state_velocity');

// AFTER (replace with)
var SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
var SB_KEY = 'eyJhbGci...';  // anon key still needed for RPC call, but no table access
var res = await fetch(SB_URL + '/rest/v1/rpc/get_market_dynamics', {
  method: 'POST',
  headers: {'apikey': SB_KEY, 'Content-Type': 'application/json'}
});
var md = await res.json();
var indDept = md.industry_dept;
var deptLevel = md.dept_level;
var stateData = md.state_week;
var velData = md.state_velocity;
```

**Note:** The anon key is still in the source (required for Supabase RPC calls), but it can no longer be used to query any table directly. The RPC only returns pre-aggregated view data. This matches the landing page pattern (`get_landing_stats()`).

**Verify:** After deploying, confirm that direct REST queries to `mv_*` views return 403 for anon. If they don't, add RLS to the materialized views.

### Step 2: Signup CTAs on all 6 pages + hub (P0 — 0.5 day)

Add a CTA section **above the footer** on every page. Insert before the `.foot` div.

**CTA HTML block** (same structure, per-page copy varies):
```html
<!-- Signup CTA — insert before .foot -->
<div class="data-cta">
  <h3 class="data-cta-head">[PAGE-SPECIFIC HEADLINE]</h3>
  <p class="data-cta-sub">Free during beta. No credit card required.</p>
  <a href="/#signup" class="data-cta-btn">Get Started Free →</a>
</div>
```

**Per-page headlines:**

| Page | Headline |
|------|----------|
| data-lab.html | "Explore all of this data filtered to your job search" |
| salary-data.html | "See salary data for jobs matching your criteria" |
| hiring-trends.html | "Get notified when companies you follow post new jobs" |
| jobs-by-industry.html | "Filter jobs by your industry and see what's hiring now" |
| career-level-data.html | "Find jobs at your level with salary data included" |
| market-dynamics.html | "Track hiring shifts in real time with a free account" |

**CSS** (add to each page's `<style>` block — they all use inline styles):
```css
.data-cta {
  margin: 48px 0 32px;
  padding: 40px 32px;
  background: linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08));
  border: 1px solid rgba(59,130,246,0.15);
  border-radius: 16px;
  text-align: center;
}
.data-cta-head {
  font-size: 20px;
  font-weight: 700;
  color: #e8eaf0;
  margin-bottom: 8px;
}
.data-cta-sub {
  font-size: 13px;
  color: #7884a8;
  margin-bottom: 20px;
}
.data-cta-btn {
  display: inline-block;
  padding: 12px 32px;
  background: #4f46e5;
  color: #fff;
  border-radius: 10px;
  font-weight: 600;
  font-size: 14px;
  text-decoration: none;
  transition: all 0.15s;
}
.data-cta-btn:hover {
  background: #4338ca;
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(79,70,229,0.4);
}
```

**`/#signup` link:** The landing page already listens for `window.location.hash === '#signup'` at L1332 and opens the signup modal. This just works.

### Step 3: Build 13 SECURITY DEFINER RPCs (P1 — 1.5 days)

All RPCs return aggregated data only. All are `SECURITY DEFINER` with `GRANT EXECUTE TO anon` (public SEO pages, no auth).

**3a. salary-data.html — 4 RPCs:**

```sql
-- C1: Salary distribution (bar chart)
CREATE OR REPLACE FUNCTION get_salary_distribution()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.bucket) FROM (
      SELECT 
        CASE
          WHEN mid < 50000 THEN '$30-50K'
          WHEN mid < 75000 THEN '$50-75K'
          WHEN mid < 100000 THEN '$75-100K'
          WHEN mid < 125000 THEN '$100-125K'
          WHEN mid < 150000 THEN '$125-150K'
          WHEN mid < 175000 THEN '$150-175K'
          WHEN mid < 200000 THEN '$175-200K'
          WHEN mid < 250000 THEN '$200-250K'
          ELSE '$250K+'
        END AS label,
        CASE
          WHEN mid < 50000 THEN 1
          WHEN mid < 75000 THEN 2
          WHEN mid < 100000 THEN 3
          WHEN mid < 125000 THEN 4
          WHEN mid < 150000 THEN 5
          WHEN mid < 175000 THEN 6
          WHEN mid < 200000 THEN 7
          WHEN mid < 250000 THEN 8
          ELSE 9
        END AS bucket,
        COUNT(*) AS count
      FROM (
        SELECT (COALESCE(salary_min,0) + COALESCE(salary_max,0)) / 
          CASE WHEN salary_min IS NOT NULL AND salary_max IS NOT NULL THEN 2
               ELSE 1 END AS mid
        FROM ats_jobs
        WHERE status != 'closed'
          AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
          AND COALESCE(salary_min, salary_max) >= 30000
          AND COALESCE(salary_min, salary_max) <= 500000
      ) s
      GROUP BY 1, 2
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_salary_distribution() TO anon;

-- C2: Salary by work arrangement (grouped bar)
CREATE OR REPLACE FUNCTION get_salary_by_arrangement()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT 
        arrangement,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY mid) AS p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid) AS median,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY mid) AS p75
      FROM (
        SELECT 
          CASE 
            WHEN loc_type = 'remote' OR LOWER(location) LIKE '%remote%' THEN 'Remote'
            WHEN loc_type = 'hybrid' OR LOWER(location) LIKE '%hybrid%' THEN 'Hybrid'
            ELSE 'On-site'
          END AS arrangement,
          (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0 AS mid
        FROM ats_jobs
        WHERE status != 'closed'
          AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
          AND COALESCE(salary_min, salary_max) BETWEEN 30000 AND 500000
      ) s
      GROUP BY arrangement
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_salary_by_arrangement() TO anon;

-- C3: Salary by department (dot-in-pill range plot)
CREATE OR REPLACE FUNCTION get_salary_by_department()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.median DESC) FROM (
      SELECT 
        department AS dept,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid)::INT AS med,
        (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid) - STDDEV(mid))::INT AS s1l,
        (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid) + STDDEV(mid))::INT AS s1h,
        (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid) - 2*STDDEV(mid))::INT AS s2l,
        (PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid) + 2*STDDEV(mid))::INT AS s2h,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY mid)::INT AS median
      FROM (
        SELECT department, (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0 AS mid
        FROM ats_jobs
        WHERE status != 'closed'
          AND department IS NOT NULL
          AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
          AND COALESCE(salary_min, salary_max) BETWEEN 30000 AND 500000
      ) s
      GROUP BY department
      HAVING COUNT(*) >= 20
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_salary_by_department() TO anon;

-- C4: Salary by career level (bar)
CREATE OR REPLACE FUNCTION get_salary_by_level()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.sort_order) FROM (
      SELECT 
        level AS label,
        ROUND(AVG(mid))::INT AS avg_salary,
        COUNT(*) AS count,
        CASE level
          WHEN 'Entry Level' THEN 1 WHEN 'Associate' THEN 2
          WHEN 'Mid-Level' THEN 3 WHEN 'Senior' THEN 4
          WHEN 'Lead' THEN 5 WHEN 'Manager' THEN 6
          WHEN 'Director' THEN 7 WHEN 'VP' THEN 8
          WHEN 'C-Suite' THEN 9 ELSE 10
        END AS sort_order
      FROM (
        SELECT career_level AS level,
          (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0 AS mid
        FROM ats_jobs
        WHERE status != 'closed'
          AND career_level IS NOT NULL
          AND career_level != 'Unclassified'
          AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)
          AND COALESCE(salary_min, salary_max) BETWEEN 30000 AND 500000
      ) s
      GROUP BY level
      HAVING COUNT(*) >= 5
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_salary_by_level() TO anon;
```

**3b. hiring-trends.html — 4 RPCs:**

```sql
-- C1: Cumulative job listings over time (area)
CREATE OR REPLACE FUNCTION get_jobs_timeline()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.week) FROM (
      SELECT 
        DATE_TRUNC('week', first_seen_at)::DATE AS week,
        SUM(COUNT(*)) OVER (ORDER BY DATE_TRUNC('week', first_seen_at)) AS cumulative
      FROM ats_jobs
      WHERE first_seen_at IS NOT NULL
      GROUP BY DATE_TRUNC('week', first_seen_at)
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_jobs_timeline() TO anon;

-- C2: Weekly velocity (bar)
CREATE OR REPLACE FUNCTION get_weekly_velocity()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.week) FROM (
      SELECT 
        DATE_TRUNC('week', first_seen_at)::DATE AS week,
        COUNT(*) AS count
      FROM ats_jobs
      WHERE first_seen_at IS NOT NULL
        AND first_seen_at >= NOW() - INTERVAL '26 weeks'
      GROUP BY DATE_TRUNC('week', first_seen_at)
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_weekly_velocity() TO anon;

-- C3: Top employers (horizontal bar)
CREATE OR REPLACE FUNCTION get_top_companies(p_limit INT DEFAULT 15)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT company_name AS name, COUNT(*) AS count
      FROM ats_jobs
      WHERE status != 'closed' AND company_name IS NOT NULL
      GROUP BY company_name
      ORDER BY count DESC
      LIMIT p_limit
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_top_companies(INT) TO anon;

-- C4: Listing lifespan (bar)
CREATE OR REPLACE FUNCTION get_listing_lifespan()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.bucket) FROM (
      SELECT 
        CASE
          WHEN days <= 7 THEN '0-7 days'
          WHEN days <= 14 THEN '8-14 days'
          WHEN days <= 30 THEN '15-30 days'
          WHEN days <= 60 THEN '31-60 days'
          WHEN days <= 90 THEN '61-90 days'
          ELSE '90+ days'
        END AS label,
        CASE
          WHEN days <= 7 THEN 1 WHEN days <= 14 THEN 2
          WHEN days <= 30 THEN 3 WHEN days <= 60 THEN 4
          WHEN days <= 90 THEN 5 ELSE 6
        END AS bucket,
        COUNT(*) AS count
      FROM (
        SELECT EXTRACT(DAY FROM COALESCE(closed_at, NOW()) - first_seen_at)::INT AS days
        FROM ats_jobs
        WHERE first_seen_at IS NOT NULL AND status = 'closed' AND closed_at IS NOT NULL
      ) s
      GROUP BY 1, 2
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_listing_lifespan() TO anon;
```

**3c. jobs-by-industry.html — 3 RPCs** (C4 reuses `get_remote_breakdown`):

```sql
-- C1+C2: Jobs by industry — volume + avg salary
CREATE OR REPLACE FUNCTION get_jobs_by_industry()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.count DESC) FROM (
      SELECT 
        industry,
        COUNT(*) AS count,
        ROUND(AVG(CASE 
          WHEN salary_min IS NOT NULL OR salary_max IS NOT NULL 
          THEN (COALESCE(salary_min, salary_max) + COALESCE(salary_max, salary_min)) / 2.0 
        END))::INT AS avg_salary
      FROM ats_jobs
      WHERE status != 'closed' AND industry IS NOT NULL
      GROUP BY industry
      HAVING COUNT(*) >= 10
      ORDER BY COUNT(*) DESC
      LIMIT 15
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_jobs_by_industry() TO anon;

-- C3: Jobs by department (treemap)
CREATE OR REPLACE FUNCTION get_jobs_by_department()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.count DESC) FROM (
      SELECT department, COUNT(*) AS count
      FROM ats_jobs
      WHERE status != 'closed' AND department IS NOT NULL
      GROUP BY department
      HAVING COUNT(*) >= 10
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_jobs_by_department() TO anon;

-- C4: Work arrangement breakdown (donut) — shared with career-level C3
CREATE OR REPLACE FUNCTION get_remote_breakdown()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t)) FROM (
      SELECT 
        CASE 
          WHEN loc_type = 'remote' OR LOWER(location) LIKE '%remote%' THEN 'Remote'
          WHEN loc_type = 'hybrid' OR LOWER(location) LIKE '%hybrid%' THEN 'Hybrid'
          WHEN location IS NOT NULL THEN 'On-site'
          ELSE 'Unspecified'
        END AS arrangement,
        COUNT(*) AS count
      FROM ats_jobs WHERE status != 'closed'
      GROUP BY 1
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_remote_breakdown() TO anon;
```

**3d. career-level-data.html — 1 RPC** (C2 reuses `get_salary_by_level`, C3 reuses `get_remote_breakdown`, C4 reuses `get_salary_by_arrangement`):

```sql
-- C1: Level distribution (funnel)
CREATE OR REPLACE FUNCTION get_jobs_by_level()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t) ORDER BY t.sort_order) FROM (
      SELECT 
        career_level AS label,
        COUNT(*) AS count,
        CASE career_level
          WHEN 'Entry Level' THEN 1 WHEN 'Associate' THEN 2
          WHEN 'Mid-Level' THEN 3 WHEN 'Senior' THEN 4
          WHEN 'Lead' THEN 5 WHEN 'Manager' THEN 6
          WHEN 'Director' THEN 7 WHEN 'VP' THEN 8
          WHEN 'C-Suite' THEN 9 ELSE 10
        END AS sort_order
      FROM ats_jobs
      WHERE status != 'closed' AND career_level IS NOT NULL
        AND career_level != 'Unclassified'
      GROUP BY career_level
    ) t
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_jobs_by_level() TO anon;
```

**3e. data-lab.html hub — 1 RPC:**

```sql
-- Hub stat cards
CREATE OR REPLACE FUNCTION get_hub_stats()
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN json_build_object(
    'total_jobs', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed'),
    'total_companies', (SELECT COUNT(DISTINCT company_name) FROM ats_jobs WHERE status != 'closed'),
    'with_salary', (SELECT COUNT(*) FROM ats_jobs WHERE status != 'closed' AND salary_min IS NOT NULL),
    'remote_pct', (
      SELECT ROUND(
        COUNT(*) FILTER (WHERE loc_type = 'remote' OR LOWER(location) LIKE '%remote%')::NUMERIC / 
        NULLIF(COUNT(*), 0) * 100, 1
      ) FROM ats_jobs WHERE status != 'closed'
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_hub_stats() TO anon;
```

**RPC-to-chart mapping (13 RPCs powering 19 charts):**

| RPC | Pages |
|-----|-------|
| `get_salary_distribution()` | salary-data C1 |
| `get_salary_by_arrangement()` | salary-data C2, career-level C4 |
| `get_salary_by_department()` | salary-data C3 |
| `get_salary_by_level()` | salary-data C4, career-level C2 |
| `get_jobs_timeline()` | hiring-trends C1 |
| `get_weekly_velocity()` | hiring-trends C2 |
| `get_top_companies()` | hiring-trends C3 |
| `get_listing_lifespan()` | hiring-trends C4 |
| `get_jobs_by_industry()` | jobs-by-industry C1+C2 |
| `get_jobs_by_department()` | jobs-by-industry C3 |
| `get_remote_breakdown()` | jobs-by-industry C4, career-level C3 |
| `get_jobs_by_level()` | career-level C1 |
| `get_hub_stats()` | data-lab stat cards |
| `get_market_dynamics()` | market-dynamics C1+C2+C3 (Step 1) |

### Step 4: Wire pages to live data (P1 — 1.5 days)

For each of the 5 hardcoded pages, replace the `var` data arrays with RPC fetch calls. The pattern is identical for each page.

**Shared fetch helper** (add to each page, or extract to a shared JS file):

```javascript
var SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
var SB_KEY = 'eyJhbGci...';  // anon key for RPC access

async function rpc(name, params) {
  var res = await fetch(SB_URL + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: {'apikey': SB_KEY, 'Content-Type': 'application/json'},
    body: params ? JSON.stringify(params) : '{}'
  });
  return res.json();
}
```

**Caching pattern** (same as landing page — localStorage with TTL):

```javascript
async function cachedRpc(name, params, ttlHours) {
  ttlHours = ttlHours || 24;
  var key = 'bj_data_' + name;
  var cached = localStorage.getItem(key);
  if (cached) {
    var c = JSON.parse(cached);
    if (Date.now() - c.ts < ttlHours * 3600000) return c.data;
  }
  var data = await rpc(name, params);
  localStorage.setItem(key, JSON.stringify({data: data, ts: Date.now()}));
  return data;
}
```

**Example: salary-data.html transformation:**

```javascript
// BEFORE
var salRange = [['$30-50K',1840],['$50-75K',3220], ...];
var salRemote = [{t:'Remote',p25:85000,med:128000,p75:168000}, ...];
var salDept = [{dept:'Engineering',med:142000,...}, ...];
var salLvl = [['Entry Level',58000], ...];

// AFTER
var [salRange, salRemote, salDept, salLvl] = await Promise.all([
  cachedRpc('get_salary_distribution'),
  cachedRpc('get_salary_by_arrangement'),
  cachedRpc('get_salary_by_department'),
  cachedRpc('get_salary_by_level')
]);
// Transform to match existing chart format:
salRange = salRange.map(function(d) { return [d.label, d.count]; });
salRemote = salRemote.map(function(d) { return {t: d.arrangement, p25: Math.round(d.p25), med: Math.round(d.median), p75: Math.round(d.p75)}; });
// salDept already matches {dept, med, s1l, s1h, s2l, s2h} format
salLvl = salLvl.map(function(d) { return [d.label, d.avg_salary]; });
```

**Key principle:** Keep the ECharts `setOption()` calls untouched. Only replace the data arrays that feed them. The RPC return shapes are designed to minimize transformation code.

**Per-page wiring:**

| Page | Replace vars | With RPCs |
|------|-------------|-----------|
| salary-data.html | `salRange`, `salRemote`, `salDept`, `salLvl` | 4 RPCs via `Promise.all` |
| hiring-trends.html | `days`, `weekly`, `companies`, `lifespan` | 4 RPCs via `Promise.all` |
| jobs-by-industry.html | `industries`, `salInd`, `depts`, `remote` | 3 RPCs (industry returns both volume + salary) |
| career-level-data.html | `levels`, `salLvl`, `remote`, `sr` | 3 RPCs (reuses salary-by-level + remote + salary-by-arrangement) |
| data-lab.html | hardcoded stat cards | 1 RPC |

**Loading state:** While RPCs load, show a subtle shimmer on chart containers. Simple approach — hide charts and show a "Loading..." message, then swap on data arrival:

```javascript
document.querySelectorAll('.ec').forEach(function(el) {
  el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#4a5068;font-size:12px">Loading...</div>';
});
```

**Error handling:** If RPCs fail, fall back to showing the existing hardcoded data. Keep the old arrays commented out as fallback:

```javascript
try {
  salRange = await cachedRpc('get_salary_distribution');
  // ... transform
} catch (e) {
  console.error('[BJ] RPC error, using cached data:', e);
  salRange = [['$30-50K',1840], ...]; // hardcoded fallback
}
```

### Step 5: Methodology footers on 3 pages (P1 — 0.25 day)

`hiring-trends.html`, `career-level-data.html`, and `market-dynamics.html` are missing data source notes. `salary-data.html`, `data-lab.html`, and `jobs-by-industry.html` already have methodology via FAQ or footer.

**Update the `.foot` div on the 3 missing pages:**

```html
<!-- hiring-trends.html -->
<div class="foot">Data from <span id="foot-jobs">285,000</span>+ job listings across <span id="foot-cos">10,000</span>+ company career pages on 5 ATS platforms (Greenhouse, Lever, Ashby, Workable, Recruitee)<br>v2.88 · Updated daily · <a href="https://brilliantjobs.app">Brilliant Jobs</a> · <a href="/data-lab">Data Lab</a></div>
```

If `get_hub_stats()` is available, populate `foot-jobs` and `foot-cos` dynamically. Otherwise hardcode current numbers.

**Also update "Updated daily" to show actual date:**

```javascript
// After RPCs resolve, update footer
var today = new Date().toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'});
document.querySelector('.foot').innerHTML = document.querySelector('.foot').innerHTML.replace('Updated daily', 'Updated ' + today);
```

---

## Acceptance Criteria

### Security (P0)
- [ ] `market-dynamics.html` no longer queries `mv_*` views via REST API
- [ ] `get_market_dynamics()` RPC deployed and functional
- [ ] Direct anon REST queries to `mv_*` views return 403
- [ ] Heatmaps and choropleth render correctly from RPC data

### CTAs (P0)
- [ ] All 6 pages + hub have a visible signup CTA above the footer
- [ ] CTA button links to `/#signup` and opens signup modal on landing page
- [ ] CTA matches dark theme styling
- [ ] CTA is responsive on mobile

### Live Data (P1)
- [ ] All 13 RPCs deployed and returning data
- [ ] All RPCs are SECURITY DEFINER with `GRANT EXECUTE TO anon`
- [ ] salary-data: 4 charts populated from live RPCs
- [ ] hiring-trends: 4 charts populated from live RPCs
- [ ] jobs-by-industry: 4 charts populated from live RPCs
- [ ] career-level-data: 4 charts populated from live RPCs
- [ ] data-lab: stat cards populated from `get_hub_stats()`
- [ ] localStorage caching with 24h TTL
- [ ] "Updated [date]" shows actual date, not hardcoded "February 18, 2026"
- [ ] Charts render correctly with live data (no broken axes, no empty charts)
- [ ] Fallback to hardcoded data on RPC failure

### Methodology (P1)
- [ ] `hiring-trends.html` has data source note in footer
- [ ] `career-level-data.html` has data source note in footer
- [ ] `market-dynamics.html` has data source note in footer

---

## What NOT to Change

- ECharts `setOption()` calls — keep all chart configs identical, only swap data arrays
- Chart types, colors, animations — no visual changes
- Page structure, breadcrumbs, FAQ sections, schema markup
- `/js/vendor/echarts.custom.min.js` — self-hosted, keep as-is
- Any dashboard files

---

## Pod 2 Judgment Calls

1. **Shared JS file vs. inline:** The `rpc()` and `cachedRpc()` helpers are identical across 6 pages. Extract to `/js/data-page-common.js`? Or keep inline for simplicity? Recommend shared file to reduce duplication.
2. **RPC query performance:** Some RPCs scan the full `ats_jobs` table (285K rows). Test execution time. If any exceed 200ms, consider materialized views or partial indexes.
3. **`career_level` column:** The RPCs for level data assume `career_level` exists on `ats_jobs`. Verify this column exists and is populated. If it doesn't exist, the level chart needs to use title-based parsing (like the internal stats page does with `getJobLevel()`), which would require a different approach — either a computed column or a server-side classification.
4. **`department` column:** Same check — verify `department` exists on `ats_jobs` and has meaningful coverage. If < 30% populated, the department charts will look sparse.

---

*Pod 1 has provided all SQL, HTML, CSS, and JS. Pod 2 executes. Security fix (Step 1) ships same day. CTAs (Step 2) ship same day. RPCs + wiring (Steps 3-4) ship within 2-3 days.*
