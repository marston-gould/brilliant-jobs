/**
 * /api/seo-page.js — Vercel serverless function for SEO data pages
 *
 * Routes:
 *   /job-market-data               → type=market
 *   /jobs-in/:metro                → type=metro&metro=:metro
 *   /jobs-in/:metro/:role          → type=metro&metro=:metro&role=:role
 *   /trends/:role                  → type=trends&role=:role
 *   /jobs-:cityA-vs-:cityB         → type=comparison&a=:cityA&b=:cityB
 *   /jobs-by-location              → type=location
 *
 * Reads pre-computed data from seo_page_cache (populated by pg_cron).
 * Returns server-rendered HTML with embedded JSON for client-side ECharts hydration.
 * ISR: revalidates every 3600s (1 hour).
 */

const { createClient } = require('@supabase/supabase-js');

// Using anon key — seo_page_cache has public read RLS policy
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =========================================================================
// Cache key builder
// =========================================================================
function buildCacheKey(type, metro, role, a, b) {
  if (type === 'market') return 'market:overview';
  if (type === 'trends') return 'trends:' + role;
  if (type === 'metro' && role) return 'metro:' + metro + ':' + role;
  if (type === 'metro') return 'metro:' + metro;
  if (type === 'comparison' && a && b) return 'compare:' + a + ':' + b;
  if (type === 'location') return '__rpc__location'; // special: uses RPC, not cache
  return null;
}

// =========================================================================
// HTML helpers
// =========================================================================
function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function jsonEsc(s) { return String(s || '').replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t'); }

function fmtSal(v) {
  if (!v || v <= 0) return 'N/A';
  if (v >= 1000000) return '$' + (Math.round(v / 100000) / 10) + 'M';
  return '$' + Math.round(v / 1000) + 'K';
}

function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }

function fmtFreshness(isoDate) {
  if (!isoDate) return 'updated daily';
  const d = new Date(isoDate);
  const now = new Date();
  const hrs = Math.floor((now - d) / 3600000);
  if (hrs < 1) return 'updated less than an hour ago';
  if (hrs < 24) return `updated ${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'updated yesterday';
  return `updated ${days} days ago`;
}

function fmtRounded(s) {
  // Handles cache values like "250000+" → "250,000+"
  if (!s) return '250,000+';
  var m = String(s).match(/^(\d+)(\+?)$/);
  if (m) return Number(m[1]).toLocaleString('en-US') + m[2];
  return s;
}

function trendArrow(val) {
  if (val === undefined || val === null) return '';
  // Cap display at ±50% — anything beyond is likely a data artifact
  if (Math.abs(val) > 50) {
    if (val > 0) return '<span class="trend-up">↑ 50%+</span>';
    return '<span class="trend-down">↓ 50%+</span>';
  }
  if (val > 3) return '<span class="trend-up">↑ ' + Math.abs(Math.round(val * 10) / 10) + '%</span>';
  if (val < -3) return '<span class="trend-down">↓ ' + Math.abs(Math.round(val * 10) / 10) + '%</span>';
  return '<span class="trend-flat">→ flat</span>';
}

// =========================================================================
// Page renderers
// =========================================================================
function renderMetroPage(data, metro, role) {
  const d = data.data;
  const stats = d.stats;
  const charts = d.charts;
  const comparison = d.comparison || {};
  const trends = d.trends || {};
  const metaInfo = d.meta || {};
  const metroDisplay = d.metro?.display_name || metro;
  const roleDisplay = d.role?.display_name || '';
  const pageTitle = role
    ? `${roleDisplay} Jobs in ${metroDisplay}`
    : `Jobs in ${metroDisplay}`;
  const metaDesc = role
    ? `${fmtNum(stats.total_jobs)} open ${roleDisplay} jobs in ${metroDisplay}. Median salary: ${fmtSal(stats.median_salary)}. See salary distribution, hiring velocity, and top companies.`
    : `${fmtNum(stats.total_jobs)} open jobs in ${metroDisplay}. Median salary: ${fmtSal(stats.median_salary)}. See salary distribution, hiring velocity, top companies, and how ${metroDisplay} compares. Data from ${fmtRounded(metaInfo.total_jobs_rounded)} direct ATS listings.`;

  // Comparison section HTML
  let comparisonHtml = '';
  if (comparison.salary_ranking && comparison.salary_ranking.length >= 5 && !role) {
    // Filter out metros with $0 or missing salary data
    const validRanking = comparison.salary_ranking.filter(r => r.median && r.median > 0);
    const currentRank = validRanking.findIndex(r => r.metro === metro) + 1;
    const natMed = comparison.national_median;
    const diffPct = natMed && stats.median_salary ? Math.round(((stats.median_salary - natMed) / natMed) * 100) : 0;
    const diffDir = diffPct >= 0 ? 'above' : 'below';
    comparisonHtml = `
    <section class="seo-section">
      <h2>How ${esc(metroDisplay)} Compares</h2>
      <p class="seo-subline">Median salary across the top metros — ${esc(metroDisplay)} ranks #${currentRank} of ${validRanking.length} metros, ${Math.abs(diffPct)}% ${diffDir} the national median of ${fmtSal(natMed)}.</p>
      <div id="chart-comparison" class="seo-chart" data-chart="comparison"></div>
      <noscript>
        <ol>${validRanking.map(r =>
          `<li>${esc(r.display)}: ${fmtSal(r.median)}</li>`
        ).join('')}</ol>
      </noscript>
    </section>`;
  }

  // Explore related links
  let relatedHtml = '';
  if (!role) {
    // Link to role sub-pages (we'll populate from role map data if available)
    relatedHtml = `
    <section class="seo-section seo-related">
      <h2>Explore ${esc(metroDisplay)} by Role</h2>
      <p class="seo-subline">Dive deeper into specific roles in ${esc(metroDisplay)}.</p>
      <div class="seo-link-grid" id="related-roles"></div>
      <p style="margin-top:24px"><a href="/job-market-data" class="seo-back-link">← Back to National Job Market Overview</a></p>
    </section>`;
  } else {
    relatedHtml = `
    <section class="seo-section seo-related">
      <h2>Explore More</h2>
      <p><a href="/jobs-in/${esc(metro)}">← All jobs in ${esc(metroDisplay)}</a></p>
      <p><a href="/trends/${esc(d.role?.slug || role)}">${esc(roleDisplay)} Trends Nationwide →</a></p>
      <p><a href="/job-market-data">← National Job Market Overview</a></p>
    </section>`;
  }

  // Build breadcrumbs
  const breadcrumbs = [{ name: 'Brilliant Jobs', url: '/' }, { name: 'Job Market Data', url: '/job-market-data' }];
  if (role) {
    breadcrumbs.push({ name: metroDisplay, url: `/jobs-in/${metro}` });
    breadcrumbs.push({ name: roleDisplay, url: `/jobs-in/${metro}/${role}` });
  } else {
    breadcrumbs.push({ name: metroDisplay, url: `/jobs-in/${metro}` });
  }

  return renderShell({
    title: `${pageTitle} — Salary Data, Hiring Trends & Top Companies | Brilliant Jobs`,
    metaDesc,
    canonical: role ? `/jobs-in/${metro}/${role}` : `/jobs-in/${metro}`,
    bodyClass: 'seo-page seo-metro',
    breadcrumbs,
    content: `
    <section class="seo-hero">
      <h1>${esc(pageTitle)}</h1>
      <p class="seo-hero-sub">${fmtNum(stats.total_jobs)} open roles across ${fmtNum(stats.companies_count)} companies — ${fmtFreshness(data.last_refreshed_at || data.computed_at)}</p>
      <div class="seo-trend-pills">
        ${stats.median_salary ? `<span class="seo-pill">${fmtSal(stats.median_salary)} median salary</span>` : ''}
        ${trends.velocity_mom !== undefined ? `<span class="seo-pill">${trendArrow(trends.velocity_mom)} job postings this month</span>` : ''}
        ${stats.remote_pct ? `<span class="seo-pill">${stats.remote_pct}% remote</span>` : ''}
      </div>
    </section>

    <section class="seo-section">
      <h2>Hiring Velocity</h2>
      <p class="seo-subline">When are companies in ${esc(metroDisplay)} hiring?</p>
      <div id="chart-timeline" class="seo-chart" data-chart="timeline"></div>
    </section>

    <section class="seo-section">
      <h2>Salary Landscape</h2>
      <p class="seo-subline">What does ${role ? esc(roleDisplay) : esc(metroDisplay)} pay? Distribution across ${fmtNum(stats.with_salary_count)} roles with salary data.</p>
      <div id="chart-salary" class="seo-chart" data-chart="salary"></div>
      <p class="seo-footnote">Based on ${fmtNum(stats.with_salary_count)} roles with salary data out of ${fmtNum(stats.total_jobs)} total listings.</p>
    </section>

    ${renderCTA()}

    ${comparisonHtml}

    <section class="seo-section">
      <h2>Who's Hiring</h2>
      <p class="seo-subline">Top companies by open roles in ${esc(metroDisplay)}.</p>
      <div id="chart-companies" class="seo-chart seo-chart-tall" data-chart="companies"></div>
    </section>

    <section class="seo-section">
      <h2>Seniority Breakdown</h2>
      <p class="seo-subline">What levels are open in ${esc(metroDisplay)}?</p>
      <div id="chart-levels" class="seo-chart" data-chart="levels"></div>
    </section>

    ${charts.loc_type && (charts.loc_type.Unspecified || 0) / stats.total_jobs < 0.3 ? `
    <section class="seo-section">
      <h2>Work Model</h2>
      <p class="seo-subline">How remote-friendly is ${esc(metroDisplay)}?</p>
      <div id="chart-worktype" class="seo-chart seo-chart-half" data-chart="worktype"></div>
    </section>` : ''}

    ${renderCTA()}

    ${relatedHtml}
    `,
    chartData: JSON.stringify(d)
  });
}

function renderTrendsPage(data, role) {
  const d = data.data;
  const stats = d.stats;
  const roleDisplay = d.role?.display_name || role;
  const metaDesc = `${fmtNum(stats.total_jobs)} open ${roleDisplay} roles nationwide. Median salary: ${fmtSal(stats.median_salary)}. See hiring trends, top metros, and companies hiring.`;

  return renderShell({
    title: `${roleDisplay} Hiring Trends — Salary, Demand & Top Employers | Brilliant Jobs`,
    metaDesc,
    canonical: `/trends/${role}`,
    bodyClass: 'seo-page seo-trends',
    breadcrumbs: [
      { name: 'Brilliant Jobs', url: '/' },
      { name: 'Job Market Data', url: '/job-market-data' },
      { name: `${roleDisplay} Trends`, url: `/trends/${role}` }
    ],
    content: `
    <section class="seo-hero">
      <h1>${esc(roleDisplay)} Hiring Trends</h1>
      <p class="seo-hero-sub">${fmtNum(stats.total_jobs)} open roles across ${fmtNum(stats.companies_count)} companies nationwide — ${fmtFreshness(data.last_refreshed_at || data.computed_at)}</p>
      <div class="seo-trend-pills">
        ${stats.median_salary ? `<span class="seo-pill">${fmtSal(stats.median_salary)} median salary</span>` : ''}
        ${d.trends?.velocity_mom !== undefined ? `<span class="seo-pill">${trendArrow(d.trends.velocity_mom)} this month</span>` : ''}
        ${stats.remote_pct ? `<span class="seo-pill">${stats.remote_pct}% remote</span>` : ''}
      </div>
    </section>

    <section class="seo-section">
      <h2>Hiring Velocity</h2>
      <p class="seo-subline">How fast is ${esc(roleDisplay)} hiring growing?</p>
      <div id="chart-timeline" class="seo-chart" data-chart="timeline"></div>
    </section>

    <section class="seo-section">
      <h2>Salary Landscape</h2>
      <p class="seo-subline">What does ${esc(roleDisplay)} pay nationwide?</p>
      <div id="chart-salary" class="seo-chart" data-chart="salary"></div>
    </section>

    ${renderCTA()}

    <section class="seo-section">
      <h2>Best Metros for ${esc(roleDisplay)}</h2>
      <p class="seo-subline">Where are the most ${esc(roleDisplay)} jobs?</p>
      <div id="chart-metros" class="seo-chart seo-chart-tall" data-chart="metros"></div>
    </section>

    <section class="seo-section">
      <h2>Seniority Breakdown</h2>
      <p class="seo-subline">What levels are hiring?</p>
      <div id="chart-levels" class="seo-chart" data-chart="levels"></div>
    </section>

    <section class="seo-section">
      <h2>Top Companies</h2>
      <p class="seo-subline">Who's hiring the most ${esc(roleDisplay)}s?</p>
      <div id="chart-companies" class="seo-chart seo-chart-tall" data-chart="companies"></div>
    </section>

    ${renderCTA()}
    `,
    chartData: JSON.stringify(d)
  });
}

function renderMarketPage(data) {
  const d = data.data;
  const stats = d.stats;
  const metaDesc = `${fmtRounded(d.meta?.total_jobs_rounded)} open jobs from direct ATS feeds. See salary distributions, hiring velocity, top companies, and metro-level market data.`;

  return renderShell({
    title: 'Job Market Data — Salary, Hiring Trends & Company Rankings | Brilliant Jobs',
    metaDesc,
    canonical: '/job-market-data',
    bodyClass: 'seo-page seo-market',
    breadcrumbs: [
      { name: 'Brilliant Jobs', url: '/' },
      { name: 'Job Market Data', url: '/job-market-data' }
    ],
    content: `
    <section class="seo-hero">
      <h1>Job Market Data</h1>
      <p class="seo-hero-sub">${fmtRounded(d.meta?.total_jobs_rounded)} open roles across ${fmtNum(stats.companies_count)} companies — ${fmtFreshness(data.last_refreshed_at || data.computed_at)}</p>
    </section>

    <section class="seo-section">
      <h2>Hiring Velocity</h2>
      <p class="seo-subline">New job postings per week across all roles and locations.</p>
      <div id="chart-timeline" class="seo-chart" data-chart="timeline"></div>
    </section>

    <section class="seo-section">
      <h2>Salary Distribution</h2>
      <p class="seo-subline">What the market pays — across ${fmtNum(stats.with_salary_count)} roles with salary data.</p>
      <div id="chart-salary" class="seo-chart" data-chart="salary"></div>
    </section>

    ${renderCTA()}

    <section class="seo-section">
      <h2>Top Metros</h2>
      <p class="seo-subline">Where the jobs are — click any metro to explore.</p>
      <div id="chart-metro-leaderboard" class="seo-chart seo-chart-tall" data-chart="metro-leaderboard"></div>
    </section>

    <section class="seo-section">
      <h2>Top Companies Hiring</h2>
      <p class="seo-subline">The companies with the most open roles right now.</p>
      <div id="chart-companies" class="seo-chart seo-chart-tall" data-chart="companies"></div>
    </section>

    ${renderCTA()}
    `,
    chartData: JSON.stringify(d)
  });
}

// =========================================================================
// Comparison page — /jobs-:cityA-vs-:cityB
// =========================================================================
function renderComparisonPage(data, a, b) {
  const d = data.data || data;
  const deltas = d.deltas || {};
  const aData = d.a || {};
  const bData = d.b || {};
  const aStats = aData.stats || aData.metro || {};
  const bStats = bData.stats || bData.metro || {};
  const aName = aData.metro?.display_name || a.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const bName = bData.metro?.display_name || b.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const salaryWinner = (deltas.salary_diff_pct || 0) > 0 ? aName : bName;
  const volumeWinner = (deltas.volume_diff_pct || 0) > 0 ? aName : bName;

  return renderShell({
    title: `${aName} vs ${bName} — Job Market Comparison 2026 | Brilliant Jobs`,
    metaDesc: `Compare ${aName} and ${bName} job markets: ${fmtNum(deltas.volume_a || 0)} vs ${fmtNum(deltas.volume_b || 0)} open positions, ${fmtSal(deltas.salary_a)} vs ${fmtSal(deltas.salary_b)} median salary. Updated daily from direct ATS data.`,
    canonical: `/jobs-${a}-vs-${b}`,
    bodyClass: 'seo-page seo-comparison',
    breadcrumbs: [
      { name: 'Market Data', url: '/job-market-data' },
      { name: 'By Location', url: '/jobs-by-location' },
      { name: `${aName} vs ${bName}`, url: `/jobs-${a}-vs-${b}` }
    ],
    content: `
    <section class="seo-hero">
      <h1>${esc(aName)} vs ${esc(bName)}</h1>
      <p class="seo-hero-sub">Side-by-side job market comparison — ${fmtFreshness(data.last_refreshed_at || data.computed_at)}.</p>
    </section>

    <section class="seo-section">
      <h2>At a Glance</h2>
      <div class="seo-stat-grid seo-stat-grid-3">
        <div class="seo-stat-card">
          <span class="seo-stat-label">Open Jobs</span>
          <span class="seo-stat-val">${fmtNum(deltas.volume_a || 0)} vs ${fmtNum(deltas.volume_b || 0)}</span>
          <span class="seo-stat-detail">${esc(volumeWinner)} has ${Math.abs(Math.round(deltas.volume_diff_pct || 0))}% more</span>
        </div>
        <div class="seo-stat-card">
          <span class="seo-stat-label">Median Salary</span>
          <span class="seo-stat-val">${fmtSal(deltas.salary_a)} vs ${fmtSal(deltas.salary_b)}</span>
          <span class="seo-stat-detail">${esc(salaryWinner)} pays ${Math.abs(Math.round(deltas.salary_diff_pct || 0))}% more</span>
        </div>
        <div class="seo-stat-card">
          <span class="seo-stat-label">Remote Rate Gap</span>
          <span class="seo-stat-val">${Math.abs(Math.round(deltas.remote_diff_pp || 0))}pp</span>
          <span class="seo-stat-detail">${(deltas.remote_diff_pp || 0) >= 0 ? esc(aName) : esc(bName)} has more remote</span>
        </div>
      </div>
    </section>

    <section class="seo-section">
      <h2>Hiring Velocity</h2>
      <p class="seo-subline">Weekly new job postings over the last 12 weeks.</p>
      <div id="chart-comparison-timeline" class="seo-chart" data-chart="comparison-timeline"></div>
    </section>

    <section class="seo-section">
      <h2>Salary Distribution</h2>
      <p class="seo-subline">How salary ranges compare between the two markets.</p>
      <div id="chart-comparison-salary" class="seo-chart" data-chart="comparison-salary"></div>
    </section>

    <section class="seo-section">
      <h2>Top Employers</h2>
      <div class="seo-grid-2col">
        <div>
          <h3>${esc(aName)}</h3>
          <div id="chart-companies-a" class="seo-chart" data-chart="companies-a"></div>
        </div>
        <div>
          <h3>${esc(bName)}</h3>
          <div id="chart-companies-b" class="seo-chart" data-chart="companies-b"></div>
        </div>
      </div>
    </section>

    <section class="seo-section seo-compare-links">
      <h2>Explore Each Market</h2>
      <p><a href="/jobs-in/${esc(a)}">Jobs in ${esc(aName)} →</a></p>
      <p><a href="/jobs-in/${esc(b)}">Jobs in ${esc(bName)} →</a></p>
    </section>

    ${renderCTA()}
    `,
    chartData: JSON.stringify({ comparison: d, metro_a: a, metro_b: b, a_name: aName, b_name: bName })
  });
}

// =========================================================================
// Location aggregate page — /jobs-by-location
// =========================================================================
function renderLocationPage(stateData, metroData) {
  const states = stateData || [];
  const metros = metroData || [];
  const totalJobs = states.reduce((sum, s) => sum + (s.count || 0), 0);

  // Build state table rows
  const stateRows = states.slice(0, 25).map(s =>
    `<tr><td>${esc(s.state)}</td><td>${fmtNum(s.count)}</td><td>${fmtSal(s.salary_median)}</td><td>${Math.round(s.remote_pct || 0)}%</td></tr>`
  ).join('');

  return renderShell({
    title: 'Jobs by Location — State & Metro Salary Data 2026 | Brilliant Jobs',
    metaDesc: `Compare ${fmtNum(totalJobs)} open jobs across ${states.length} US states and ${metros.length} metro areas. Salary data, remote work rates, and top employers by location.`,
    canonical: '/jobs-by-location',
    bodyClass: 'seo-page seo-location',
    breadcrumbs: [
      { name: 'Market Data', url: '/job-market-data' },
      { name: 'By Location', url: '/jobs-by-location' }
    ],
    content: `
    <section class="seo-hero">
      <h1>Jobs by Location</h1>
      <p class="seo-hero-sub">${fmtNum(totalJobs)} open positions across ${states.length} states — salary and remote data for every major market.</p>
    </section>

    <section class="seo-section">
      <h2>Top Metros</h2>
      <p class="seo-subline">Click any metro to explore its full market profile.</p>
      <div id="chart-metro-bar" class="seo-chart seo-chart-tall" data-chart="location-metro-bar"></div>
    </section>

    <section class="seo-section">
      <h2>State Breakdown</h2>
      <div id="chart-state-choropleth" class="seo-chart seo-chart-wide" data-chart="state-choropleth"></div>
      <div class="seo-table-wrap">
        <table class="seo-table">
          <thead><tr><th>State</th><th>Open Jobs</th><th>Median Salary</th><th>Remote %</th></tr></thead>
          <tbody>${stateRows}</tbody>
        </table>
      </div>
    </section>

    <section class="seo-section">
      <h2>Compare Metros</h2>
      <p class="seo-subline">Popular city-vs-city matchups.</p>
      <div class="seo-link-grid">
        <a href="/jobs-san-francisco-vs-austin">SF vs Austin</a>
        <a href="/jobs-san-francisco-vs-new-york">SF vs New York</a>
        <a href="/jobs-new-york-vs-los-angeles">NYC vs LA</a>
        <a href="/jobs-austin-vs-denver">Austin vs Denver</a>
        <a href="/jobs-seattle-vs-portland">Seattle vs Portland</a>
        <a href="/jobs-chicago-vs-atlanta">Chicago vs Atlanta</a>
        <a href="/jobs-boston-vs-washington-dc">Boston vs DC</a>
        <a href="/jobs-dallas-vs-austin">Dallas vs Austin</a>
        <a href="/jobs-miami-vs-atlanta">Miami vs Atlanta</a>
        <a href="/jobs-denver-vs-seattle">Denver vs Seattle</a>
      </div>
    </section>

    ${renderCTA()}
    `,
    chartData: JSON.stringify({ states: stateData, metros: metroData })
  });
}

// =========================================================================
// CTA block
// =========================================================================
function renderCTA() {
  return `
  <div class="seo-cta">
    <h3>Want this data filtered to YOUR job search?</h3>
    <p>Create a free account to see salary data, hiring trends, and company rankings for exactly the roles you're targeting — updated in real time from 7,500+ company hiring pages.</p>
    <div class="seo-cta-btns">
      <a href="/dashboard" class="btn-primary">Create Free Account</a>
      <a href="/" class="btn-secondary">See How It Works →</a>
    </div>
  </div>`;
}

// =========================================================================
// HTML shell — full page template
// =========================================================================
function renderShell({ title, metaDesc, canonical, bodyClass, content, chartData, breadcrumbs }) {
  // Build breadcrumb HTML and JSON-LD
  let breadcrumbHtml = '';
  let breadcrumbLd = '';
  if (breadcrumbs && breadcrumbs.length > 0) {
    const crumbLinks = breadcrumbs.map((b, i) =>
      i < breadcrumbs.length - 1
        ? `<a href="${b.url}">${esc(b.name)}</a>`
        : `<span>${esc(b.name)}</span>`
    ).join(' <span class="seo-crumb-sep">›</span> ');
    breadcrumbHtml = `<div class="seo-breadcrumbs">${crumbLinks}</div>`;
    breadcrumbLd = `<script type="application/ld+json">
  {"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[${breadcrumbs.map((b, i) =>
    `{"@type":"ListItem","position":${i + 1},"name":"${jsonEsc(b.name)}","item":"https://brilliantjobs.app${b.url}"}`
  ).join(',')}]}
  </script>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(metaDesc)}">
  <link rel="canonical" href="https://brilliantjobs.app${canonical}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(metaDesc)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://brilliantjobs.app${canonical}">
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2032%2032'%3E%3Crect%20width%3D'32'%20height%3D'32'%20rx%3D'8'%20fill%3D'%234d8eff'%2F%3E%3Ctext%20x%3D'50%25'%20y%3D'55%25'%20dominant-baseline%3D'central'%20text-anchor%3D'middle'%20font-family%3D'system-ui'%20font-weight%3D'800'%20font-size%3D'18'%20fill%3D'white'%3EB%3C%2Ftext%3E%3C%2Fsvg%3E">
  <link rel="preload" href="/fonts/outfit-latin-var.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/fonts/jetbrains-mono-latin-var.woff2" as="font" type="font/woff2" crossorigin>
  <style>
    @font-face { font-family: 'Outfit'; src: url('/fonts/outfit-latin-var.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
    @font-face { font-family: 'JetBrains Mono'; src: url('/fonts/jetbrains-mono-latin-var.woff2') format('woff2'); font-weight: 100 900; font-style: normal; font-display: swap; }
  </style>
  <link rel="stylesheet" href="/seo-pages.css">
  <!-- A13: PostHog analytics -->
  <script>
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init ns hs wi ls ds rs os capture calculateEventProperties fs register register_once register_for_session unregister unregister_for_session bs getFeatureFlag getFeatureFlagPayload getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty gs cs createPersonProfile setInternalOrTestUser ts ys opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing vs debug M ps getPageViewId captureTraceFeedback captureTraceMetric Xr".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    posthog.init('phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww', {
        api_host: 'https://us.i.posthog.com',
        person_profiles: 'identified_only',
    })
  </script>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "${jsonEsc(title)}",
    "description": "${jsonEsc(metaDesc)}",
    "url": "https://brilliantjobs.app${canonical}",
    "creator": { "@type": "Organization", "name": "Brilliant Jobs" },
    "temporalCoverage": "${new Date().toISOString().slice(0,10)}"
  }
  </script>
  ${breadcrumbLd}
</head>
<body class="${bodyClass}">
  <a href="#main" class="seo-skip-link">Skip to content</a>
  <nav class="seo-nav" aria-label="Main navigation">
    <a href="/" class="seo-logo">Brilliant Jobs</a>
    <div class="seo-nav-links">
      <a href="/job-market-data">Market Data</a>
      <a href="/dashboard" class="btn-nav-cta">Start Free</a>
    </div>
  </nav>

  <main id="main" class="seo-main">
    ${breadcrumbHtml}
    ${content}
  </main>

  <footer class="seo-footer">
    <p>Data sourced directly from Greenhouse, Lever, Ashby, Workable, Recruitee & USAJobs.</p>
    <p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/">brilliantjobs.app</a></p>
  </footer>

  <script id="seo-chart-data" type="application/json">${chartData}</script>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <script src="/seo-charts.js"></script>
</body>
</html>`;
}

// =========================================================================
// 404 page
// =========================================================================
function render404(msg) {
  return renderShell({
    title: 'Page Not Found | Brilliant Jobs',
    metaDesc: 'The requested data page was not found.',
    canonical: '/',
    bodyClass: 'seo-page seo-404',
    content: `
    <section class="seo-hero">
      <h1>Page Not Found</h1>
      <p class="seo-hero-sub">${esc(msg || 'This data page doesn\'t exist yet.')}</p>
      <p><a href="/job-market-data">← Browse Job Market Data</a></p>
    </section>`,
    chartData: '{}'
  });
}

// =========================================================================
// Handler
// =========================================================================

// =========================================================================
// Company Profile Page — A1
// =========================================================================
function renderCompanyPage(profile) {
  var co = profile.company || {};
  var st = profile.stats || {};
  var roles = profile.top_roles || [];
  var depts = profile.top_departments || [];
  var locs = profile.locations || [];
  var timeline = profile.hiring_timeline || [];
  var salaries = profile.salary_ranges || [];

  var name = esc(co.name || co.slug);
  var openJobs = Number(st.open_jobs || 0);
  var remoteJobs = Number(st.remote_jobs || 0);
  var hybridJobs = Number(st.hybrid_jobs || 0);
  var onsiteJobs = Number(st.onsite_jobs || 0);
  var remotePct = openJobs > 0 ? Math.round((remoteJobs / openJobs) * 100) : 0;

  var metaDesc = name + ' has ' + fmtNum(openJobs) + ' open positions' +
    (co.industry ? ' in ' + esc(co.industry) : '') +
    '. View hiring trends, salary data, top roles, and locations.';

  // Schema.org Organization JSON-LD
  var schemaOrg = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: co.name || co.slug,
    url: co.website || ('https://brilliantjobs.app/company/' + co.slug),
  };
  if (co.industry) schemaOrg.industry = co.industry;
  if (co.founded) schemaOrg.foundingDate = String(co.founded);
  if (co.locality && co.region) {
    schemaOrg.address = { '@type': 'PostalAddress', addressLocality: co.locality, addressRegion: co.region };
  }

  // Stat cards
  var statCards = [
    { label: 'Open Positions', value: fmtNum(openJobs) },
    { label: 'Remote', value: remotePct + '%' + (remoteJobs > 0 ? ' (' + fmtNum(remoteJobs) + ')' : '') },
    { label: 'Departments', value: st.dept_count > 0 ? fmtNum(st.dept_count) : 'N/A' },
    { label: 'Avg Salary', value: st.avg_salary_min ? fmtSal(st.avg_salary_min) + (st.avg_salary_max ? ' – ' + fmtSal(st.avg_salary_max) : '') : 'Not listed' },
  ];

  // Roles table
  var rolesHtml = roles.length > 0 ? '<div class="seo-section"><h2>Top Roles</h2><table class="seo-table"><thead><tr><th>Role</th><th>Openings</th></tr></thead><tbody>' +
    roles.map(function(r) { return '<tr><td>' + esc(r.title) + '</td><td>' + fmtNum(r.count) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '';

  // Departments
  var deptsHtml = depts.length > 0 ? '<div class="seo-section"><h2>Departments</h2><div class="seo-tag-cloud">' +
    depts.map(function(d) { return '<span class="seo-tag">' + esc(d.department) + ' <strong>' + fmtNum(d.count) + '</strong></span>'; }).join('') +
    '</div></div>' : '';

  // Locations
  var locsHtml = locs.length > 0 ? '<div class="seo-section"><h2>Hiring Locations</h2><table class="seo-table"><thead><tr><th>Location</th><th>Jobs</th></tr></thead><tbody>' +
    locs.map(function(l) { return '<tr><td>' + esc(l.location) + '</td><td>' + fmtNum(l.count) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '';

  // Salary table
  var salaryHtml = salaries.length > 0 ? '<div class="seo-section"><h2>Salary Ranges by Role</h2><table class="seo-table"><thead><tr><th>Role</th><th>Salary Range</th><th>Jobs</th></tr></thead><tbody>' +
    salaries.map(function(s) { return '<tr><td>' + esc(s.title) + '</td><td>' + fmtSal(s.min) + ' – ' + fmtSal(s.max) + '</td><td>' + fmtNum(s.count) + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '';

  // Timeline chart data (for ECharts)
  var timelineChartData = timeline.length > 0 ? JSON.stringify({
    weeks: timeline.map(function(t) { return t.week; }),
    counts: timeline.map(function(t) { return t.count; })
  }) : 'null';

  // Work model chart data
  var workModelData = JSON.stringify({
    labels: ['Remote', 'Hybrid', 'Onsite', 'Unspecified'],
    values: [remoteJobs, hybridJobs, onsiteJobs, Math.max(0, openJobs - remoteJobs - hybridJobs - onsiteJobs)]
  });

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + name + ' Jobs &amp; Hiring Data | Brilliant Jobs</title>' +
    '<meta name="description" content="' + esc(metaDesc) + '">' +
    '<link rel="canonical" href="https://brilliantjobs.app/company/' + esc(co.slug) + '">' +
    '<meta property="og:title" content="' + name + ' Jobs &amp; Hiring Data">' +
    '<meta property="og:description" content="' + esc(metaDesc) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:url" content="https://brilliantjobs.app/company/' + esc(co.slug) + '">' +
    '<link rel="icon" href="/resources/favicon.png">' +
    '<link rel="stylesheet" href="/seo-pages.css">' +
    '<script type="application/ld+json">' + JSON.stringify(schemaOrg) + '</script>' +
    '</head><body>' +
    '<header class="seo-header"><div class="seo-header-inner">' +
    '<a href="/" class="seo-logo">Brilliant<span>Jobs</span></a>' +
    '<nav class="seo-nav"><a href="/data-lab">Data Lab</a><a href="/blog">Insights</a><a href="/dashboard">Dashboard</a></nav>' +
    '</div></header>' +
    '<main class="seo-main"><div class="seo-container">' +
    '<nav class="seo-breadcrumb"><a href="/">Home</a> <span>&rsaquo;</span> <a href="/job-market-data">Market Data</a> <span>&rsaquo;</span> <span>' + name + '</span></nav>' +
    '<h1>' + name + '</h1>' +
    (co.industry ? '<p class="seo-subtitle">' + esc(co.industry) + (co.locality ? ' · ' + esc(co.locality) + (co.region ? ', ' + esc(co.region) : '') : '') + (co.founded ? ' · Founded ' + co.founded : '') + '</p>' : '') +
    (co.website ? '<p style="margin-bottom:24px"><a href="' + esc(co.website) + '" target="_blank" rel="noopener" style="font-size:13px;color:#818cf8">' + esc(co.website) + ' ↗</a></p>' : '') +

    // Stat cards
    '<div class="seo-stat-grid">' +
    statCards.map(function(c) {
      return '<div class="seo-stat-card"><div class="seo-stat-value">' + c.value + '</div><div class="seo-stat-label">' + c.label + '</div></div>';
    }).join('') +
    '</div>' +

    // Charts section
    '<div class="seo-chart-grid">' +
    (timeline.length > 0 ? '<div class="seo-chart-card" style="grid-column:span 2"><h3>Hiring Timeline (90 days)</h3><div id="timeline-chart" style="width:100%;height:280px"></div></div>' : '') +
    '<div class="seo-chart-card"><h3>Work Model</h3><div id="workmodel-chart" style="width:100%;height:280px"></div></div>' +
    '</div>' +

    rolesHtml + deptsHtml + locsHtml + salaryHtml +

    // CTA
    '<div class="seo-cta"><h3>Explore ' + name + ' jobs on Brilliant Jobs</h3>' +
    '<p>Filter by role, level, salary, and location in your personalized dashboard.</p>' +
    '<a href="/dashboard" class="seo-cta-btn">Search ' + name + ' Jobs →</a></div>' +

    '</div></main>' +

    // Footer
    '<footer class="seo-footer"><div class="seo-footer-inner">' +
    '<div class="seo-footer-links"><a href="/">Home</a><a href="/job-market-data">Market Data</a><a href="/blog">Insights</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>' +
    '<p>© ' + new Date().getFullYear() + ' Brilliant Jobs · v4.75</p>' +
    '</div></footer>' +

    // ECharts
    '<script src="/js/vendor/echarts.custom.min.js"></script>' +
    '<script>' +
    'var tData=' + timelineChartData + ';' +
    'var wData=' + workModelData + ';' +
    'if(tData&&document.getElementById("timeline-chart")){' +
    'var c=echarts.init(document.getElementById("timeline-chart"));' +
    'c.setOption({grid:{left:40,right:16,top:16,bottom:40},xAxis:{type:"category",data:tData.weeks.map(function(w){return w.substring(5)}),axisLabel:{color:"#71717a",fontSize:11}},yAxis:{type:"value",axisLabel:{color:"#71717a",fontSize:11},splitLine:{lineStyle:{color:"#27272a"}}},series:[{type:"bar",data:tData.counts,itemStyle:{color:"#6366f1",borderRadius:[4,4,0,0]}}],tooltip:{trigger:"axis"}});' +
    'window.addEventListener("resize",function(){c.resize()});' +
    '}' +
    'if(wData&&document.getElementById("workmodel-chart")){' +
    'var d=echarts.init(document.getElementById("workmodel-chart"));' +
    'd.setOption({series:[{type:"pie",radius:["40%","70%"],data:wData.labels.map(function(l,i){return{name:l,value:wData.values[i]}}).filter(function(d){return d.value>0}),label:{color:"#a1a1aa",fontSize:12},itemStyle:{borderColor:"#0f1117",borderWidth:2},color:["#8b5cf6","#6366f1","#3b82f6","#27272a"]}],tooltip:{trigger:"item"}});' +
    'window.addEventListener("resize",function(){d.resize()});' +
    '}' +
    '</script>' +

    '</body></html>';
}


module.exports = async function handler(req, res) {
  const { type, metro, role, a, b, slug } = req.query;

  if (!type) {
    res.status(400).send('Missing type parameter');
    return;
  }

  // Location page uses RPCs, not cache
  if (type === 'location') {
    const [stateRes, metroRes] = await Promise.all([
      sb.rpc('get_jobs_by_state'),
      sb.rpc('get_jobs_by_metro', { p_limit: 20 })
    ]);
    if (stateRes.error || metroRes.error) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(500).send(render404('Unable to load location data.'));
      return;
    }
    const html = renderLocationPage(stateRes.data, metroRes.data);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    return;
  }


  // Company profile page uses RPC
  if (type === 'company') {
    const slug = req.query.slug;
    if (!slug) {
      res.status(400).send('Missing slug parameter');
      return;
    }
    const { data: profile, error: profileErr } = await sb.rpc('get_company_profile', { p_slug: slug });
    if (profileErr || !profile) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(404).send(render404('Company not found.'));
      return;
    }
    const html = renderCompanyPage(profile);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
    return;
  }

  // Build cache key
  const cacheKey = buildCacheKey(type, metro, role, a, b);
  if (!cacheKey) {
    res.status(400).send('Invalid parameters');
    return;
  }

  // Fetch from cache
  const { data, error } = await sb
    .from('seo_page_cache')
    .select('*')
    .eq('cache_key', cacheKey)
    .single();

  if (error || !data) {
    // Check threshold: maybe this page doesn't meet minimums
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(404).send(render404(
      metro && role
        ? `Not enough data for this role in this metro yet. Try the full metro page.`
        : `This page isn't available yet.`
    ));
    return;
  }

  // Check job count threshold (skip for comparisons — they combine two metros)
  if (type !== 'comparison') {
    const threshold = type === 'trends' ? 300 : (role ? 50 : 200);
    if (data.job_count < threshold) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(404).send(render404(`Insufficient data — need at least ${threshold} jobs to show meaningful charts.`));
      return;
    }
  }

  // Render
  let html;
  switch (type) {
    case 'market':
      html = renderMarketPage(data);
      break;
    case 'metro':
      html = renderMetroPage(data, metro, role);
      break;
    case 'trends':
      html = renderTrendsPage(data, role);
      break;
    case 'comparison':
      html = renderComparisonPage(data, a, b);
      break;
    default:
      res.status(400).send('Unknown page type');
      return;
  }

  // ISR: revalidate every hour
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  // Crawl signal: Last-Modified from actual data refresh time
  if (data.last_refreshed_at || data.computed_at) {
    res.setHeader('Last-Modified', new Date(data.last_refreshed_at || data.computed_at).toUTCString());
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
