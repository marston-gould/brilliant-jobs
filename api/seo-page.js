/**
 * /api/seo-page.js — Vercel serverless function for SEO data pages
 *
 * Routes:
 *   /job-market-data       → type=market
 *   /jobs-in/:metro        → type=metro&metro=:metro
 *   /jobs-in/:metro/:role  → type=metro&metro=:metro&role=:role
 *   /trends/:role          → type=trends&role=:role
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
function buildCacheKey(type, metro, role) {
  if (type === 'market') return 'market:overview';
  if (type === 'trends') return 'trends:' + role;
  if (type === 'metro' && role) return 'metro:' + metro + ':' + role;
  if (type === 'metro') return 'metro:' + metro;
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
    const currentRank = comparison.salary_ranking.findIndex(r => r.metro === metro) + 1;
    const natMed = comparison.national_median;
    const diffPct = natMed && stats.median_salary ? Math.round(((stats.median_salary - natMed) / natMed) * 100) : 0;
    const diffDir = diffPct >= 0 ? 'above' : 'below';
    comparisonHtml = `
    <section class="seo-section">
      <h2>How ${esc(metroDisplay)} Compares</h2>
      <p class="seo-subline">Median salary across the top metros — ${esc(metroDisplay)} ranks #${currentRank} of ${comparison.salary_ranking.length} metros, ${Math.abs(diffPct)}% ${diffDir} the national median of ${fmtSal(natMed)}.</p>
      <div id="chart-comparison" class="seo-chart" data-chart="comparison"></div>
      <noscript>
        <ol>${comparison.salary_ranking.map(r =>
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

  return renderShell({
    title: `${pageTitle} — Salary Data, Hiring Trends & Top Companies | Brilliant Jobs`,
    metaDesc,
    canonical: role ? `/jobs-in/${metro}/${role}` : `/jobs-in/${metro}`,
    bodyClass: 'seo-page seo-metro',
    content: `
    <section class="seo-hero">
      <h1>${esc(pageTitle)}</h1>
      <p class="seo-hero-sub">${fmtNum(stats.total_jobs)} open roles across ${fmtNum(stats.companies_count)} companies — updated daily from direct ATS feeds</p>
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
    content: `
    <section class="seo-hero">
      <h1>${esc(roleDisplay)} Hiring Trends</h1>
      <p class="seo-hero-sub">${fmtNum(stats.total_jobs)} open roles across ${fmtNum(stats.companies_count)} companies nationwide</p>
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
    content: `
    <section class="seo-hero">
      <h1>Job Market Data</h1>
      <p class="seo-hero-sub">${fmtRounded(d.meta?.total_jobs_rounded)} open roles across ${fmtNum(stats.companies_count)} companies — sourced directly from ATS platforms</p>
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
function renderShell({ title, metaDesc, canonical, bodyClass, content, chartData }) {
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
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
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
</head>
<body class="${bodyClass}">
  <nav class="seo-nav">
    <a href="/" class="seo-logo">Brilliant Jobs</a>
    <div class="seo-nav-links">
      <a href="/job-market-data">Market Data</a>
      <a href="/dashboard" class="btn-nav-cta">Start Free</a>
    </div>
  </nav>

  <main class="seo-main">
    ${content}
  </main>

  <footer class="seo-footer">
    <p>Data sourced directly from Greenhouse, Lever, Ashby, Workable & Recruitee ATS platforms.</p>
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
module.exports = async function handler(req, res) {
  const { type, metro, role } = req.query;

  if (!type) {
    res.status(400).send('Missing type parameter');
    return;
  }

  // Build cache key
  const cacheKey = buildCacheKey(type, metro, role);
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

  // Check job count threshold
  const threshold = type === 'trends' ? 300 : (role ? 50 : 200);
  if (data.job_count < threshold) {
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(404).send(render404(`Insufficient data — need at least ${threshold} jobs to show meaningful charts.`));
    return;
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
    default:
      res.status(400).send('Unknown page type');
      return;
  }

  // ISR: revalidate every hour
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
