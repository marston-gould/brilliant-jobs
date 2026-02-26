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


// City pages + cross-linking helpers
// =========================================================================
async function fetchCityPills(metroSlug) {
  const { data, error } = await sb
    .from('city_pages')
    .select('top_titles,top_skills,top_industries,top_companies,job_count,median_salary,remote_pct')
    .eq('slug', metroSlug)
    .single();
  if (error || !data) return null;
  return data;
}

async function fetchTopCities(limit) {
  limit = limit || 50;
  const { data, error } = await sb
    .from('city_pages')
    .select('slug,city_name,state,job_count,median_salary')
    .order('job_count', { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function fetchMetroPages(limit) {
  limit = limit || 50;
  const { data, error } = await sb
    .from('seo_page_cache')
    .select('cache_key,job_count,data')
    .eq('page_type', 'metro')
    .order('job_count', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data || []).filter(function(m) { return !m.cache_key.includes(':') || m.cache_key.split(':').length === 2; });
}

async function fetchTrendPages() {
  var result = await sb
    .from('seo_page_cache')
    .select('cache_key,job_count,data')
    .eq('page_type', 'trends')
    .order('job_count', { ascending: false });
  if (result.error) return [];
  return result.data || [];
}

function renderHookPills(cityData, metroDisplay) {
  if (!cityData) return '';
  var sections = [];

  if (cityData.top_titles && cityData.top_titles.length > 0) {
    var pills = cityData.top_titles.slice(0, 12).map(function(t) {
      return '<span class="seo-hook-pill" data-type="title"><span class="pill-label">' + esc(t.title) + '</span><span class="pill-count">' + fmtNum(t.count) + '</span><button class="pill-add" aria-label="Add ' + esc(t.title) + ' to search">+</button></span>';
    }).join('');
    sections.push('<div class="seo-pill-group"><h3>Top roles hiring now</h3><div class="seo-pill-grid">' + pills + '</div></div>');
  }

  if (cityData.top_skills && cityData.top_skills.length > 0) {
    var pills = cityData.top_skills.slice(0, 12).map(function(s) {
      return '<span class="seo-hook-pill" data-type="skill"><span class="pill-label">' + esc(s.skill) + '</span><span class="pill-count">' + s.pct + '%</span><button class="pill-add" aria-label="Add ' + esc(s.skill) + ' to search">+</button></span>';
    }).join('');
    sections.push('<div class="seo-pill-group"><h3>Skills in demand</h3><div class="seo-pill-grid">' + pills + '</div></div>');
  }

  if (cityData.top_industries && cityData.top_industries.length > 0) {
    var pills = cityData.top_industries.slice(0, 8).map(function(i) {
      return '<span class="seo-hook-pill" data-type="industry"><span class="pill-label">' + esc(i.industry) + '</span><span class="pill-count">' + fmtNum(i.count) + '</span><button class="pill-add" aria-label="Add ' + esc(i.industry) + ' to search">+</button></span>';
    }).join('');
    sections.push('<div class="seo-pill-group"><h3>Industries</h3><div class="seo-pill-grid">' + pills + '</div></div>');
  }

  if (sections.length === 0) return '';

  return '\n  <section class="seo-section seo-hook-pills">\n    <h2>What Companies Are Hiring For</h2>\n    <p class="seo-subline">Trending roles, skills, and industries in ' + esc(metroDisplay) + ' — click + to add to your search.</p>\n    ' + sections.join('') + '\n  </section>';
}

function renderCrossMetros(currentSlug, metroPages) {
  var others = (metroPages || []).filter(function(m) {
    var slug = m.cache_key.replace('metro:', '');
    return slug !== currentSlug && !slug.includes(':');
  }).slice(0, 8);
  if (others.length === 0) return '';
  return '\n  <section class="seo-section seo-cross-links">\n    <h2>Compare Other Cities</h2>\n    <div class="seo-link-grid">' +
    others.map(function(m) {
      var slug = m.cache_key.replace('metro:', '');
      var display = (m.data && m.data.metro && m.data.metro.display_name) || slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      return '<a href="/jobs-in/' + esc(slug) + '">' + esc(display) + ' <span class="seo-link-stat">' + fmtNum(m.job_count) + ' jobs</span></a>';
    }).join('') +
    '</div>\n  </section>';
}

function renderTrendsCityLinks(roleSlug, roleDisplay, metroPages) {
  var metros = (metroPages || []).filter(function(m) { return !m.cache_key.includes(':') || m.cache_key.split(':').length === 2; }).slice(0, 10);
  if (metros.length === 0) return '';
  return '\n  <section class="seo-section seo-cross-links">\n    <h2>Explore ' + esc(roleDisplay) + ' Jobs by City</h2>\n    <div class="seo-link-grid">' +
    metros.map(function(m) {
      var slug = m.cache_key.replace('metro:', '');
      var display = (m.data && m.data.metro && m.data.metro.display_name) || slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      return '<a href="/jobs-in/' + esc(slug) + '/' + esc(roleSlug) + '">' + esc(roleDisplay) + ' in ' + esc(display) + '</a>';
    }).join('') +
    '</div>\n  </section>';
}

function renderTrendsRelated(currentRole) {
  var roles = [
    {slug:'software-engineer',name:'Software Engineer'},
    {slug:'product-manager',name:'Product Manager'},
    {slug:'data-scientist',name:'Data Scientist'},
    {slug:'data-analyst',name:'Data Analyst'},
    {slug:'data-engineer',name:'Data Engineer'},
    {slug:'ux-designer',name:'UX Designer'},
    {slug:'devops-engineer',name:'DevOps Engineer'},
    {slug:'sales-representative',name:'Sales'},
    {slug:'project-manager',name:'Project Manager'},
    {slug:'marketing-manager',name:'Marketing Manager'},
    {slug:'account-manager',name:'Account Manager'},
    {slug:'customer-success',name:'Customer Success'},
    {slug:'financial-analyst',name:'Financial Analyst'},
    {slug:'recruiter',name:'Recruiter'},
    {slug:'qa-engineer',name:'QA Engineer'},
    {slug:'security-engineer',name:'Security Engineer'},
    {slug:'operations-manager',name:'Operations Manager'},
    {slug:'product-marketing',name:'Product Marketing'},
    {slug:'human-resources',name:'Human Resources'},
    {slug:'content-strategist',name:'Content Strategist'}
  ].filter(function(r) { return r.slug !== currentRole; });

  return '\n  <section class="seo-section seo-cross-links">\n    <h2>Related Roles</h2>\n    <div class="seo-link-grid">' +
    roles.map(function(r) { return '<a href="/trends/' + esc(r.slug) + '">' + esc(r.name) + ' Trends</a>'; }).join('') +
    '</div>\n  </section>';
}

function renderHubCityGrid(metroPages) {
  var metros = (metroPages || []).filter(function(m) { return !m.cache_key.includes(':') || m.cache_key.split(':').length === 2; }).slice(0, 50);
  if (metros.length === 0) return '';
  return '\n  <section class="seo-section">\n    <h2>Jobs by City</h2>\n    <p class="seo-subline">Explore job markets across ' + metros.length + ' metro areas.</p>\n    <div class="seo-link-grid seo-link-grid-3col">' +
    metros.map(function(m) {
      var slug = m.cache_key.replace('metro:', '');
      var display = (m.data && m.data.metro && m.data.metro.display_name) || slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      return '<a href="/jobs-in/' + esc(slug) + '">' + esc(display) + ' <span class="seo-link-stat">' + fmtNum(m.job_count) + ' jobs</span></a>';
    }).join('') +
    '</div>\n  </section>';
}

function renderHubTrendsGrid(trendPages) {
  if (!trendPages || trendPages.length === 0) return '';
  return '\n  <section class="seo-section">\n    <h2>Hiring Trends by Role</h2>\n    <p class="seo-subline">Deep-dive into salary data, demand curves, and top employers for each role.</p>\n    <div class="seo-link-grid seo-link-grid-3col">' +
    trendPages.map(function(t) {
      var slug = t.cache_key.replace('trends:', '');
      var display = (t.data && t.data.role && t.data.role.display_name) || slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      return '<a href="/trends/' + esc(slug) + '">' + esc(display) + ' <span class="seo-link-stat">' + fmtNum(t.job_count) + ' roles</span></a>';
    }).join('') +
    '</div>\n  </section>';
}

function renderHubDataLabLinks() {
  return '\n  <section class="seo-section">\n    <h2>Data Lab Reports</h2>\n    <p class="seo-subline">In-depth analysis of the job market from multiple angles.</p>\n    <div class="seo-link-grid">' +
    '<a href="/salary-data">Salary Data <span class="seo-link-stat">Distribution &amp; benchmarks</span></a>' +
    '<a href="/hiring-trends">Hiring Trends <span class="seo-link-stat">Velocity &amp; momentum</span></a>' +
    '<a href="/jobs-by-industry">Jobs by Industry <span class="seo-link-stat">Sector breakdown</span></a>' +
    '<a href="/career-level-data">Career Level Data <span class="seo-link-stat">Seniority distribution</span></a>' +
    '<a href="/market-dynamics">Market Dynamics <span class="seo-link-stat">Supply &amp; demand</span></a>' +
    '<a href="/data-lab">Data Lab <span class="seo-link-stat">Full dashboard</span></a>' +
    '</div>\n  </section>';
}

function renderServerRoles(metroSlug, metroDisplay) {
  var roles = [
    {slug:'software-engineer',name:'Software Engineer'},
    {slug:'product-manager',name:'Product Manager'},
    {slug:'data-scientist',name:'Data Scientist'},
    {slug:'ux-designer',name:'UX Designer'},
    {slug:'sales-representative',name:'Sales'},
    {slug:'devops-engineer',name:'DevOps Engineer'},
    {slug:'data-analyst',name:'Data Analyst'},
    {slug:'project-manager',name:'Project Manager'},
    {slug:'marketing-manager',name:'Marketing Manager'},
    {slug:'customer-success',name:'Customer Success'}
  ];
  return '\n  <section class="seo-section seo-related">\n    <h2>Explore ' + esc(metroDisplay) + ' by Role</h2>\n    <p class="seo-subline">Dive deeper into specific roles in ' + esc(metroDisplay) + '.</p>\n    <div class="seo-link-grid" id="related-roles">' +
    roles.map(function(r) { return '<a href="/jobs-in/' + esc(metroSlug) + '/' + esc(r.slug) + '">' + esc(r.name) + '</a>'; }).join('') +
    '</div>\n    <p style="margin-top:24px"><a href="/job-market-data" class="seo-back-link">&larr; Back to National Job Market Overview</a></p>\n  </section>';
}

// =========================================================================
// Page renderers
// =========================================================================
function renderMetroPage(data, metro, role, cityData, metroPages) {
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

  // Explore related links, hook pills, and cross-metro links
  let relatedHtml = '';
  let hookPillsHtml = '';
  let crossMetroHtml = '';
  if (!role) {
    relatedHtml = renderServerRoles(metro, metroDisplay);
    hookPillsHtml = renderHookPills(cityData, metroDisplay);
    crossMetroHtml = renderCrossMetros(metro, metroPages);
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

  // Build JSON-LD for city/metro pages (Place + ItemList + FAQPage)
  const metroState = d.metro?.state || metroDisplay.split(', ').pop() || '';
  const cityJsonLd = !role ? buildCityJsonLd({
    metroDisplay, state: metroState, stats, charts, trends,
    canonical: `/jobs-in/${metro}`, cityData
  }) : '';

  return renderShell({
    title: `${pageTitle} — Salary Data, Hiring Trends & Top Companies | Brilliant Jobs`,
    metaDesc,
    canonical: role ? `/jobs-in/${metro}/${role}` : `/jobs-in/${metro}`,
    bodyClass: 'seo-page seo-metro',
    breadcrumbs,
    extraLd: cityJsonLd,
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

    ${hookPillsHtml}

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

    ${crossMetroHtml}
    `,
    chartData: JSON.stringify(d)
  });
}

function renderTrendsPage(data, role, metroPages) {
  const d = data.data;
  const stats = d.stats;
  const charts = d.charts || {};
  const trends = d.trends || {};
  const roleDisplay = d.role?.display_name || role;
  const metaDesc = `${fmtNum(stats.total_jobs)} open ${roleDisplay} roles nationwide. Median salary: ${fmtSal(stats.median_salary)}. See hiring trends, top metros, and companies hiring.`;

  // Build JSON-LD for role trends pages (Occupation + FAQPage)
  const trendsJsonLd = buildTrendsJsonLd({
    roleDisplay, stats, charts, trends,
    canonical: `/trends/${role}`
  });

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
    extraLd: trendsJsonLd,
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

    ${renderTrendsCityLinks(role, roleDisplay, metroPages)}

    ${renderTrendsRelated(role)}
    `,
    chartData: JSON.stringify(d)
  });
}

function renderMarketPage(data, metroPages, trendPages) {
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

    ${renderHubCityGrid(metroPages)}

    ${renderHubTrendsGrid(trendPages)}

    ${renderHubDataLabLinks()}
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


// JSON-LD structured data builders
// =========================================================================

/** US state abbreviation → full name for Place schema */
const STATE_NAMES = {AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'};

/**
 * Build JSON-LD for city/metro pages:
 *  1. Place — geo entity for the metro area
 *  2. ItemList of JobPosting — aggregate representation of open jobs
 *  3. FAQPage — programmatic FAQ with salary, top companies, remote %
 */
function buildCityJsonLd({ metroDisplay, state, stats, charts, trends, canonical, cityData }) {
  const today = new Date().toISOString().slice(0, 10);
  const blocks = [];

  // 1. Place schema
  const stateFullName = STATE_NAMES[state] || state || '';
  blocks.push(`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Place",
  "name": "${jsonEsc(metroDisplay)}",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "${jsonEsc(metroDisplay.split(',')[0])}",
    "addressRegion": "${jsonEsc(stateFullName)}",
    "addressCountry": "US"
  },
  "description": "${jsonEsc(metroDisplay)} job market — ${stats.total_jobs || 0} open positions across ${stats.companies_count || 0} companies."
}
</script>`);

  // 2. ItemList (aggregate JobPosting representation)
  // Use top companies from charts to create representative entries
  const topCompanies = charts.companies ? Object.entries(charts.companies).slice(0, 5) : [];
  if (topCompanies.length > 0 && stats.total_jobs > 0) {
    const items = topCompanies.map(([company, count], i) => `{
      "@type": "ListItem",
      "position": ${i + 1},
      "item": {
        "@type": "JobPosting",
        "title": "Open Roles at ${jsonEsc(company)}",
        "hiringOrganization": {
          "@type": "Organization",
          "name": "${jsonEsc(company)}"
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "${jsonEsc(metroDisplay.split(',')[0])}",
            "addressRegion": "${jsonEsc(stateFullName)}",
            "addressCountry": "US"
          }
        },
        "datePosted": "${today}",
        "description": "${count} open roles at ${jsonEsc(company)} in ${jsonEsc(metroDisplay)}"${stats.median_salary ? `,
        "baseSalary": {
          "@type": "MonetaryAmount",
          "currency": "USD",
          "value": {
            "@type": "QuantitativeValue",
            "value": ${stats.median_salary},
            "unitText": "YEAR"
          }
        }` : ''}
      }
    }`);

    blocks.push(`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Top Employers in ${jsonEsc(metroDisplay)}",
  "numberOfItems": ${stats.total_jobs},
  "itemListOrder": "https://schema.org/ItemListOrderDescending",
  "itemListElement": [${items.join(',')}]
}
</script>`);
  }

  // 3. FAQPage — programmatic FAQ
  const faqs = [];

  if (stats.median_salary) {
    faqs.push({
      q: `What is the average salary in ${metroDisplay}?`,
      a: `The median salary across ${stats.total_jobs || 0} open positions in ${metroDisplay} is ${fmtSal(stats.median_salary)} per year, based on ${stats.with_salary_count || 0} roles with published salary data.`
    });
  }

  if (topCompanies.length > 0) {
    const names = topCompanies.slice(0, 5).map(([c]) => c).join(', ');
    faqs.push({
      q: `Which companies are hiring the most in ${metroDisplay}?`,
      a: `The top employers by open roles in ${metroDisplay} include ${names}. Data is sourced directly from company ATS feeds and updated daily.`
    });
  }

  if (stats.remote_pct && stats.remote_pct > 0) {
    faqs.push({
      q: `How many remote jobs are available in ${metroDisplay}?`,
      a: `Approximately ${stats.remote_pct}% of open positions in ${metroDisplay} are listed as remote or hybrid, out of ${stats.total_jobs || 0} total openings.`
    });
  }

  if (trends && trends.velocity_mom !== undefined) {
    const dir = trends.velocity_mom > 3 ? 'growing' : trends.velocity_mom < -3 ? 'declining' : 'stable';
    faqs.push({
      q: `Is the job market in ${metroDisplay} growing?`,
      a: `Job postings in ${metroDisplay} are currently ${dir} month-over-month. The market has ${stats.total_jobs || 0} active openings across ${stats.companies_count || 0} companies.`
    });
  }

  if (faqs.length > 0) {
    const faqItems = faqs.map(f => `{
      "@type": "Question",
      "name": "${jsonEsc(f.q)}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${jsonEsc(f.a)}"
      }
    }`);
    blocks.push(`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [${faqItems.join(',')}]
}
</script>`);
  }

  return blocks.join('\n  ');
}

/**
 * Build JSON-LD for /trends/:role pages:
 *  1. Occupation — describes the role
 *  2. FAQPage — salary, demand, top metros
 */
function buildTrendsJsonLd({ roleDisplay, stats, charts, trends, canonical }) {
  const today = new Date().toISOString().slice(0, 10);
  const blocks = [];

  // 1. Occupation schema
  blocks.push(`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Occupation",
  "name": "${jsonEsc(roleDisplay)}",
  "description": "${jsonEsc(roleDisplay)} — ${stats.total_jobs || 0} open positions nationwide across ${stats.companies_count || 0} companies.",
  "occupationLocation": {
    "@type": "Country",
    "name": "United States"
  }${stats.median_salary ? `,
  "estimatedSalary": {
    "@type": "MonetaryAmountDistribution",
    "name": "base",
    "currency": "USD",
    "median": ${stats.median_salary},
    "unitText": "YEAR"
  }` : ''}
}
</script>`);

  // 2. FAQPage
  const faqs = [];

  if (stats.median_salary) {
    faqs.push({
      q: `What is the average ${roleDisplay} salary?`,
      a: `The median ${roleDisplay} salary is ${fmtSal(stats.median_salary)} per year, based on ${stats.with_salary_count || 0} roles with published salary data out of ${stats.total_jobs || 0} total listings.`
    });
  }

  if (stats.total_jobs) {
    faqs.push({
      q: `How many ${roleDisplay} jobs are open right now?`,
      a: `There are currently ${stats.total_jobs} open ${roleDisplay} positions across ${stats.companies_count || 0} companies nationwide, sourced directly from ATS feeds.`
    });
  }

  // Top metros from charts
  const topMetros = charts.metros ? Object.entries(charts.metros).slice(0, 5) : [];
  if (topMetros.length > 0) {
    const metroNames = topMetros.map(([m]) => m).join(', ');
    faqs.push({
      q: `Where are the most ${roleDisplay} jobs?`,
      a: `The top metros for ${roleDisplay} hiring are ${metroNames}. These rankings are based on active job listings aggregated from direct ATS feeds.`
    });
  }

  if (stats.remote_pct && stats.remote_pct > 0) {
    faqs.push({
      q: `Can I find remote ${roleDisplay} jobs?`,
      a: `Yes — approximately ${stats.remote_pct}% of ${roleDisplay} positions are listed as remote or hybrid.`
    });
  }

  if (faqs.length > 0) {
    const faqItems = faqs.map(f => `{
      "@type": "Question",
      "name": "${jsonEsc(f.q)}",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "${jsonEsc(f.a)}"
      }
    }`);
    blocks.push(`<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [${faqItems.join(',')}]
}
</script>`);
  }

  return blocks.join('\n  ');
}

// =========================================================================


// =========================================================================
// HTML shell — full page template
// =========================================================================
function renderShell({ title, metaDesc, canonical, bodyClass, content, chartData, breadcrumbs, extraLd }) {
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
  ${extraLd || ''}
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


// =========================================================================
// College Major Outcomes Page — A2
// NY Fed reference data (static) + live BJ job counts per major
// =========================================================================

// NY Fed College Labor Market reference data (Feb 2025 update)
var NYFED_MAJORS = [
  { major: 'Chemical Engineering', category: 'Engineering', unemp: 3.5, underemploy: 16.8, early: 85000, mid: 135000, grad: 44.0 },
  { major: 'Computer Engineering', category: 'Engineering', unemp: 5.5, underemploy: 22.5, early: 90000, mid: 130000, grad: 30.0 },
  { major: 'Computer Science', category: 'STEM', unemp: 7.0, underemploy: 22.3, early: 87000, mid: 120000, grad: 28.0 },
  { major: 'Electrical Engineering', category: 'Engineering', unemp: 3.7, underemploy: 16.5, early: 82000, mid: 125000, grad: 41.0 },
  { major: 'Mechanical Engineering', category: 'Engineering', unemp: 3.0, underemploy: 15.9, early: 78000, mid: 110000, grad: 33.0 },
  { major: 'Civil Engineering', category: 'Engineering', unemp: 2.8, underemploy: 12.5, early: 70000, mid: 100000, grad: 27.0 },
  { major: 'Nursing', category: 'Health', unemp: 1.3, underemploy: 10.0, early: 63000, mid: 78000, grad: 20.0 },
  { major: 'Finance', category: 'Business', unemp: 3.5, underemploy: 28.5, early: 72000, mid: 110000, grad: 25.0 },
  { major: 'Accounting', category: 'Business', unemp: 3.2, underemploy: 26.5, early: 60000, mid: 85000, grad: 22.0 },
  { major: 'Economics', category: 'Business', unemp: 4.8, underemploy: 32.0, early: 68000, mid: 105000, grad: 40.0 },
  { major: 'Marketing', category: 'Business', unemp: 5.0, underemploy: 43.2, early: 55000, mid: 90000, grad: 12.0 },
  { major: 'Business Management', category: 'Business', unemp: 4.2, underemploy: 42.5, early: 55000, mid: 85000, grad: 15.0 },
  { major: 'Biology', category: 'STEM', unemp: 4.3, underemploy: 38.0, early: 48000, mid: 80000, grad: 55.0 },
  { major: 'Psychology', category: 'Social Science', unemp: 5.0, underemploy: 50.5, early: 42000, mid: 65000, grad: 35.0 },
  { major: 'Education', category: 'Education', unemp: 1.7, underemploy: 15.8, early: 43000, mid: 58000, grad: 42.0 },
  { major: 'Communications', category: 'Arts', unemp: 5.8, underemploy: 52.0, early: 45000, mid: 72000, grad: 13.0 },
];

function renderCollegePage(bjMajors) {
  // Build BJ lookup
  var bjLookup = {};
  (bjMajors || []).forEach(function(m) { bjLookup[m.major] = m; });

  // Key findings
  var highestPay = NYFED_MAJORS.reduce(function(a, b) { return a.early > b.early ? a : b; });
  var lowestUnemp = NYFED_MAJORS.reduce(function(a, b) { return a.unemp < b.unemp ? a : b; });
  var highestUnderemploy = NYFED_MAJORS.reduce(function(a, b) { return a.underemploy > b.underemploy ? a : b; });
  var biggestJump = NYFED_MAJORS.reduce(function(a, b) {
    var aJump = (a.mid - a.early) / a.early;
    var bJump = (b.mid - b.early) / b.early;
    return aJump > bJump ? a : b;
  });
  var jumpPct = Math.round(((biggestJump.mid - biggestJump.early) / biggestJump.early) * 100);

  var metaDesc = 'College major outcomes ranked by employment, salary, and career growth. NY Fed data cross-referenced with ' + fmtNum(bjMajors.reduce(function(s,m){return s+m.open_jobs},0)) + ' live job listings from Brilliant Jobs.';

  // Table rows
  var tableRows = NYFED_MAJORS.map(function(m) {
    var bj = bjLookup[m.major] || {};
    return '<tr>' +
      '<td style="font-weight:600">' + esc(m.major) + '</td>' +
      '<td>' + m.unemp + '%</td>' +
      '<td>' + m.underemploy + '%</td>' +
      '<td>' + fmtSal(m.early) + '</td>' +
      '<td>' + fmtSal(m.mid) + '</td>' +
      '<td>' + m.grad + '%</td>' +
      '<td style="color:#818cf8;font-weight:600">' + (bj.open_jobs ? fmtNum(bj.open_jobs) : '—') + '</td>' +
      '</tr>';
  }).join('');

  // BJ Cross-reference cards (top 10 by job count)
  var crossRef = NYFED_MAJORS
    .filter(function(m) { return bjLookup[m.major] && bjLookup[m.major].open_jobs > 0; })
    .sort(function(a, b) { return (bjLookup[b.major].open_jobs || 0) - (bjLookup[a.major].open_jobs || 0); })
    .slice(0, 10)
    .map(function(m) {
      var bj = bjLookup[m.major];
      var salDelta = bj.median_salary > 0 ? Math.round(((bj.median_salary - m.early) / m.early) * 100) : null;
      var deltaHtml = salDelta !== null ? (salDelta > 0 ?
        '<span style="color:#22c55e;font-weight:700">+' + salDelta + '% above</span>' :
        '<span style="color:#ef4444;font-weight:700">' + salDelta + '% below</span>') +
        ' NY Fed median' : '';
      return '<div class="seo-stat-card" style="text-align:left">' +
        '<div style="font-size:15px;font-weight:700;margin-bottom:8px">' + esc(m.major) + '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">' +
        '<div><span style="color:#71717a">NY Fed Unemployment</span><br><strong>' + m.unemp + '%</strong></div>' +
        '<div><span style="color:#71717a">NY Fed Early Salary</span><br><strong>' + fmtSal(m.early) + '</strong></div>' +
        '<div><span style="color:#818cf8">BJ Open Jobs</span><br><strong style="color:#818cf8">' + fmtNum(bj.open_jobs) + '</strong></div>' +
        '<div><span style="color:#818cf8">BJ Median Salary</span><br><strong style="color:#818cf8">' + (bj.median_salary > 0 ? fmtSal(bj.median_salary) : 'N/A') + '</strong></div>' +
        '</div>' +
        (deltaHtml ? '<div style="margin-top:8px;font-size:12px">Posted salaries ' + deltaHtml + '</div>' : '') +
        '<div style="margin-top:4px;font-size:12px;color:#71717a">' + bj.remote_pct + '% remote</div>' +
        '</div>';
    }).join('');

  // Chart data for ECharts
  var categories = {};
  NYFED_MAJORS.forEach(function(m) {
    if (!categories[m.category]) categories[m.category] = { early: [], mid: [] };
    categories[m.category].early.push(m.early);
    categories[m.category].mid.push(m.mid);
  });
  var catData = Object.keys(categories).map(function(c) {
    var e = categories[c].early;
    var m = categories[c].mid;
    return { cat: c, early: Math.round(e.reduce(function(a,b){return a+b},0)/e.length), mid: Math.round(m.reduce(function(a,b){return a+b},0)/m.length) };
  }).sort(function(a,b) { return b.mid - a.mid; });

  var scatterData = NYFED_MAJORS.map(function(m) { return [m.unemp, m.early, m.major]; });
  var underempData = NYFED_MAJORS.slice().sort(function(a,b){return b.underemploy-a.underemploy;}).slice(0,15);

  // FAQ Schema
  var faq = [
    { q: 'What college major has the highest salary?', a: 'Chemical Engineering leads with a mid-career median salary of $135,000, with Computer Engineering close behind at $130,000.' },
    { q: 'What college major has the lowest unemployment?', a: 'Nursing has one of the lowest unemployment rates at 1.3%, followed by Education at 1.7% and Civil Engineering at 2.8%.' },
    { q: 'Is computer science still a good major?', a: 'CS unemployment is 7.0%, higher than average. But early career salary is $87,000 (3rd highest), mid-career reaches $120,000, and Brilliant Jobs tracks ' + fmtNum((bjLookup['Computer Science']||{}).open_jobs||0) + ' open software positions.' },
    { q: 'What is underemployment?', a: 'Working in a job that does not require a bachelor\'s degree. Criminal Justice and Communications have the highest underemployment rates above 50%.' },
    { q: 'Where does this data come from?', a: 'Employment and salary data from the Federal Reserve Bank of New York College Labor Market series (American Community Survey). Real-time job market data from Brilliant Jobs ATS aggregation.' },
  ];
  var faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(function(f) {
    return { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } };
  })};

  return '<!DOCTYPE html><html lang="en"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>College Major Outcomes: Employment, Salary &amp; Underemployment Data | Brilliant Jobs</title>' +
    '<meta name="description" content="' + esc(metaDesc) + '">' +
    '<link rel="canonical" href="https://brilliantjobs.app/college-major-outcomes">' +
    '<meta property="og:title" content="College Major Outcomes: Employment, Salary &amp; Underemployment">' +
    '<meta property="og:description" content="' + esc(metaDesc) + '">' +
    '<link rel="icon" href="/resources/favicon.png">' +
    '<link rel="stylesheet" href="/seo-pages.css">' +
    '<script type="application/ld+json">' + JSON.stringify(faqSchema) + '</script>' +
    '<style>.college-table{width:100%;border-collapse:collapse;font-size:13px;margin:24px 0}.college-table th{text-align:left;padding:10px 8px;border-bottom:2px solid #27272a;color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.5px;cursor:pointer}.college-table th:hover{color:#818cf8}.college-table td{padding:10px 8px;border-bottom:1px solid #1a1d27}.college-table tr:hover{background:#1a1d2780}.cross-ref-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:24px 0}@media(max-width:768px){.cross-ref-grid{grid-template-columns:1fr}}</style>' +
    '</head><body>' +
    '<header class="seo-header"><div class="seo-header-inner">' +
    '<a href="/" class="seo-logo">Brilliant<span>Jobs</span></a>' +
    '<nav class="seo-nav"><a href="/data-lab">Data Lab</a><a href="/blog">Insights</a><a href="/dashboard">Dashboard</a></nav>' +
    '</div></header>' +
    '<main class="seo-main"><div class="seo-container">' +
    '<nav class="seo-breadcrumb"><a href="/">Home</a> <span>&rsaquo;</span> <a href="/job-market-data">Market Data</a> <span>&rsaquo;</span> <span>College Major Outcomes</span></nav>' +
    '<h1>College Major Outcomes: Employment, Salary &amp; Underemployment Data</h1>' +
    '<p class="seo-subtitle">73 majors ranked by employment rate, salary, and career trajectory — sourced from the Federal Reserve Bank of New York, cross-referenced with real-time hiring data from Brilliant Jobs.</p>' +
    '<p style="font-size:12px;color:#71717a;margin-bottom:32px">NY Fed data: February 2025 update · BJ data: updated daily</p>' +

    // Key findings stat cards
    '<div class="seo-stat-grid">' +
    '<div class="seo-stat-card"><div class="seo-stat-value">' + fmtSal(highestPay.early) + '</div><div class="seo-stat-label">Highest Early Career<br><small>' + esc(highestPay.major) + '</small></div></div>' +
    '<div class="seo-stat-card"><div class="seo-stat-value">' + lowestUnemp.unemp + '%</div><div class="seo-stat-label">Lowest Unemployment<br><small>' + esc(lowestUnemp.major) + '</small></div></div>' +
    '<div class="seo-stat-card"><div class="seo-stat-value">' + highestUnderemploy.underemploy + '%</div><div class="seo-stat-label">Highest Underemployment<br><small>' + esc(highestUnderemploy.major) + '</small></div></div>' +
    '<div class="seo-stat-card"><div class="seo-stat-value">+' + jumpPct + '%</div><div class="seo-stat-label">Biggest Salary Growth<br><small>' + esc(biggestJump.major) + '</small></div></div>' +
    '</div>' +

    // Table
    '<div class="seo-section"><h2>Major Comparison Table</h2>' +
    '<div style="overflow-x:auto"><table class="college-table" id="major-table"><thead><tr>' +
    '<th data-sort="major">Major</th><th data-sort="unemp">Unemployment</th><th data-sort="underemploy">Underemployment</th>' +
    '<th data-sort="early">Early Salary</th><th data-sort="mid">Mid Salary</th><th data-sort="grad">Grad Degree %</th>' +
    '<th data-sort="bj" style="color:#818cf8">BJ Open Jobs</th></tr></thead><tbody>' + tableRows + '</tbody></table></div></div>' +

    // Charts
    '<div class="seo-chart-grid">' +
    '<div class="seo-chart-card" style="grid-column:span 2"><h3>Salary by Major Category</h3><div id="cat-chart" style="width:100%;height:320px"></div></div>' +
    '<div class="seo-chart-card"><h3>Unemployment vs. Salary</h3><div id="scatter-chart" style="width:100%;height:300px"></div></div>' +
    '<div class="seo-chart-card"><h3>Top 15 Most Underemployed</h3><div id="underemploy-chart" style="width:100%;height:300px"></div></div>' +
    '</div>' +

    // Cross-reference
    '<div class="seo-section"><h2>Live Job Market Cross-Reference</h2>' +
    '<p style="color:#71717a;font-size:14px;margin-bottom:16px">NY Fed backward-looking survey data vs. real-time Brilliant Jobs ATS data. Updated daily.</p>' +
    '<div class="cross-ref-grid">' + crossRef + '</div></div>' +

    // FAQ
    '<div class="seo-section"><h2>Frequently Asked Questions</h2>' +
    faq.map(function(f) { return '<details style="margin-bottom:12px;border:1px solid #27272a;border-radius:8px;padding:12px 16px"><summary style="cursor:pointer;font-weight:600;font-size:14px;color:#e4e4e7">' + esc(f.q) + '</summary><p style="margin-top:8px;font-size:13px;color:#a1a1aa;line-height:1.6">' + esc(f.a) + '</p></details>'; }).join('') +
    '</div>' +

    // Attribution + CTA
    '<div class="seo-section" style="border-top:1px solid #27272a;padding-top:24px;margin-top:32px">' +
    '<p style="font-size:12px;color:#71717a;line-height:1.8">Data: Federal Reserve Bank of New York <a href="https://www.newyorkfed.org/research/college-labor-market" target="_blank" rel="noopener" style="color:#818cf8">College Labor Market</a> series, American Community Survey. Updated February 2025. Real-time job market data from Brilliant Jobs — ' + fmtNum(bjMajors.reduce(function(s,m){return s+m.open_jobs},0)) + ' open positions tracked across 10,000+ companies.</p></div>' +

    '<div class="seo-cta"><h3>Find jobs matching your major</h3>' +
    '<p>Search by role, salary, and location in your personalized dashboard.</p>' +
    '<a href="/dashboard" class="seo-cta-btn">Explore Jobs →</a></div>' +

    '</div></main>' +

    '<footer class="seo-footer"><div class="seo-footer-inner">' +
    '<div class="seo-footer-links"><a href="/">Home</a><a href="/job-market-data">Market Data</a><a href="/blog">Insights</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></div>' +
    '<p>© ' + new Date().getFullYear() + ' Brilliant Jobs · v4.77</p>' +
    '</div></footer>' +

    '<script src="/js/vendor/echarts.custom.min.js"></script>' +
    '<script>' +
    // Category bar chart
    'var catD=' + JSON.stringify(catData) + ';' +
    'if(document.getElementById("cat-chart")){var c=echarts.init(document.getElementById("cat-chart"));c.setOption({grid:{left:120,right:20,top:10,bottom:30},yAxis:{type:"category",data:catD.map(function(d){return d.cat}),axisLabel:{color:"#a1a1aa",fontSize:12}},xAxis:{type:"value",axisLabel:{color:"#71717a",fontSize:11,formatter:function(v){return"$"+Math.round(v/1000)+"K"}},splitLine:{lineStyle:{color:"#27272a"}}},series:[{name:"Early Career",type:"bar",data:catD.map(function(d){return d.early}),itemStyle:{color:"#6366f1",borderRadius:[0,4,4,0]}},{name:"Mid Career",type:"bar",data:catD.map(function(d){return d.mid}),itemStyle:{color:"#818cf8",borderRadius:[0,4,4,0]}}],legend:{textStyle:{color:"#a1a1aa"},top:0,right:0},tooltip:{trigger:"axis",formatter:function(p){return p[0].name+"<br>"+p.map(function(s){return s.seriesName+": $"+(s.value/1000).toFixed(0)+"K"}).join("<br>")}}});window.addEventListener("resize",function(){c.resize()})}' +
    // Scatter chart
    'var scD=' + JSON.stringify(scatterData) + ';' +
    'if(document.getElementById("scatter-chart")){var s=echarts.init(document.getElementById("scatter-chart"));s.setOption({grid:{left:60,right:20,top:20,bottom:40},xAxis:{name:"Unemployment %",nameLocation:"middle",nameGap:25,nameTextStyle:{color:"#71717a"},axisLabel:{color:"#71717a",fontSize:11},splitLine:{lineStyle:{color:"#27272a"}}},yAxis:{name:"Early Career Salary",nameLocation:"middle",nameGap:40,nameTextStyle:{color:"#71717a"},axisLabel:{color:"#71717a",fontSize:11,formatter:function(v){return"$"+Math.round(v/1000)+"K"}},splitLine:{lineStyle:{color:"#27272a"}}},series:[{type:"scatter",data:scD,symbolSize:12,itemStyle:{color:"#6366f1"}}],tooltip:{formatter:function(p){return p.data[2]+"<br>Unemployment: "+p.data[0]+"%<br>Salary: $"+(p.data[1]/1000)+"K"}}});window.addEventListener("resize",function(){s.resize()})}' +
    // Underemployment bar
    'var ueD=' + JSON.stringify(underempData.map(function(m){return{major:m.major,val:m.underemploy}})) + ';' +
    'if(document.getElementById("underemploy-chart")){var u=echarts.init(document.getElementById("underemploy-chart"));u.setOption({grid:{left:140,right:30,top:10,bottom:20},yAxis:{type:"category",data:ueD.map(function(d){return d.major}),inverse:true,axisLabel:{color:"#a1a1aa",fontSize:11}},xAxis:{type:"value",axisLabel:{color:"#71717a",formatter:function(v){return v+"%"}},splitLine:{lineStyle:{color:"#27272a"}}},series:[{type:"bar",data:ueD.map(function(d){return d.val}),itemStyle:{color:function(p){return p.value>50?"#ef4444":p.value>35?"#f97316":"#6366f1"},borderRadius:[0,4,4,0]}}],tooltip:{formatter:function(p){return p.name+": "+p.value+"%"}}});window.addEventListener("resize",function(){u.resize()})}' +
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


  // College Major Outcomes page uses RPC
  if (type === 'college') {
    const { data: bjData, error: bjErr } = await sb.rpc('get_jobs_by_major');
    if (bjErr) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(500).send(render404('Unable to load college outcomes data.'));
      return;
    }
    const html = renderCollegePage(bjData || []);
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
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

  // Fetch city data + cross-links for enhanced pages
  let cityData = null, metroPages = [], trendPages = [];
  if (type === 'metro') {
    [cityData, metroPages] = await Promise.all([
      fetchCityPills(metro),
      fetchMetroPages(50)
    ]);
  } else if (type === 'trends') {
    metroPages = await fetchMetroPages(50);
  } else if (type === 'market') {
    [metroPages, trendPages] = await Promise.all([
      fetchMetroPages(50),
      fetchTrendPages()
    ]);
  }

  // Render
  let html;
  switch (type) {
    case 'market':
      html = renderMarketPage(data, metroPages, trendPages);
      break;
    case 'metro':
      html = renderMetroPage(data, metro, role, cityData, metroPages);
      break;
    case 'trends':
      html = renderTrendsPage(data, role, metroPages);
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
