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
// JSON-LD builders for metro pages (Block 4: D8b)
// =========================================================================

function buildMetroJsonLd(metro, role, data, cityData) {
  var d = data.data;
  var stats = d.stats;
  var metroDisplay = d.metro?.display_name || metro;
  var roleDisplay = d.role?.display_name || '';
  var schemas = [];

  // 1. WebPage schema
  var pageTitle = role
    ? roleDisplay + ' Jobs in ' + metroDisplay
    : 'Jobs in ' + metroDisplay;
  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    'name': pageTitle,
    'url': 'https://brilliantjobs.app/jobs-in/' + metro + (role ? '/' + role : ''),
    'description': stats.total_jobs + ' open ' + (role ? roleDisplay + ' ' : '') + 'jobs in ' + metroDisplay + '. Median salary: ' + fmtSal(stats.median_salary) + '.',
    'dateModified': d.meta?.updated_at || new Date().toISOString().slice(0, 10),
    'publisher': {
      '@type': 'Organization',
      'name': 'Brilliant Jobs',
      'url': 'https://brilliantjobs.app'
    },
    'isPartOf': {
      '@type': 'WebSite',
      'name': 'Brilliant Jobs',
      'url': 'https://brilliantjobs.app'
    }
  });

  // 2. ItemList of Occupations (from top_titles — metro pages only, not role subpages)
  if (!role && cityData && cityData.top_titles && cityData.top_titles.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      'name': 'Top Occupations in ' + metroDisplay,
      'numberOfItems': cityData.top_titles.length,
      'itemListElement': cityData.top_titles.slice(0, 10).map(function(t, i) {
        return {
          '@type': 'ListItem',
          'position': i + 1,
          'item': {
            '@type': 'Occupation',
            'name': t.title,
            'occupationLocation': {
              '@type': 'City',
              'name': metroDisplay
            },
            'estimatedSalary': stats.median_salary ? [{
              '@type': 'MonetaryAmountDistribution',
              'name': 'base',
              'currency': 'USD',
              'median': stats.median_salary
            }] : undefined
          }
        };
      })
    });
  }

  // 3. Place + GeoCoordinates (metro pages only)
  if (!role) {
    var place = {
      '@context': 'https://schema.org',
      '@type': 'Place',
      'name': metroDisplay,
      'description': metroDisplay + ' job market: ' + fmtNum(stats.total_jobs) + ' open positions across ' + fmtNum(stats.companies_count) + ' companies.'
    };
    // Add state context if available from cityData
    if (cityData && cityData.job_count) {
      place.additionalProperty = [
        { '@type': 'PropertyValue', 'name': 'activeJobListings', 'value': stats.total_jobs },
        { '@type': 'PropertyValue', 'name': 'companiesHiring', 'value': stats.companies_count },
        { '@type': 'PropertyValue', 'name': 'medianSalary', 'value': stats.median_salary || 0 },
        { '@type': 'PropertyValue', 'name': 'remotePct', 'value': cityData.remote_pct || 0 }
      ];
    }
    schemas.push(place);
  }

  // 4. FAQPage — auto-generated FAQs
  var faqs = [];
  faqs.push({
    '@type': 'Question',
    'name': 'How many ' + (role ? roleDisplay + ' ' : '') + 'jobs are open in ' + metroDisplay + '?',
    'acceptedAnswer': {
      '@type': 'Answer',
      'text': 'There are currently ' + fmtNum(stats.total_jobs) + ' open ' + (role ? roleDisplay + ' ' : '') + 'positions in ' + metroDisplay + ' across ' + fmtNum(stats.companies_count) + ' companies, sourced directly from company career pages.'
    }
  });
  if (stats.median_salary) {
    faqs.push({
      '@type': 'Question',
      'name': 'What is the median salary for ' + (role ? roleDisplay + ' jobs' : 'jobs') + ' in ' + metroDisplay + '?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'The median listed salary for ' + (role ? roleDisplay + ' roles' : 'open positions') + ' in ' + metroDisplay + ' is ' + fmtSal(stats.median_salary) + ', based on ' + fmtNum(stats.with_salary_count) + ' listings with salary data.'
      }
    });
  }
  if (stats.remote_pct) {
    faqs.push({
      '@type': 'Question',
      'name': 'What percentage of ' + (role ? roleDisplay + ' ' : '') + 'jobs in ' + metroDisplay + ' are remote?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': stats.remote_pct + '% of open ' + (role ? roleDisplay + ' ' : '') + 'positions in ' + metroDisplay + ' are listed as remote or remote-friendly.'
      }
    });
  }
  if (!role && cityData && cityData.top_titles && cityData.top_titles.length >= 3) {
    var topRoles = cityData.top_titles.slice(0, 3).map(function(t) { return t.title; }).join(', ');
    faqs.push({
      '@type': 'Question',
      'name': 'What are the most in-demand roles in ' + metroDisplay + '?',
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': 'The most in-demand roles in ' + metroDisplay + ' right now are ' + topRoles + ', based on active job listing volume from direct ATS feeds.'
      }
    });
  }
  faqs.push({
    '@type': 'Question',
    'name': 'How often is the ' + metroDisplay + ' job data updated?',
    'acceptedAnswer': {
      '@type': 'Answer',
      'text': 'Job market data for ' + metroDisplay + ' is refreshed every 6 hours from direct ATS feeds including Greenhouse, Lever, Ashby, Workable, and Recruitee, plus USAJobs for federal positions.'
    }
  });

  if (faqs.length > 0) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': faqs
    });
  }

  return schemas;
}

function renderJsonLdBlocks(schemas) {
  return schemas.map(function(s) {
    return '<script type="application/ld+json">\n  ' + JSON.stringify(s) + '\n  </script>';
  }).join('\n  ');
}

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

  // Explore related links
  let relatedHtml = '';
  let hookPillsHtml = '';
  let crossMetroHtml = '';
  if (!role) {
    relatedHtml = renderServerRoles(metro, metroDisplay);
    hookPillsHtml = renderHookPills(cityData, metroDisplay);
    crossMetroHtml = renderCrossMetros(metro, metroPages);
  } else {
    // City+role subpage: link to same role in other cities + parent pages
    var otherCitiesHtml = '';
    if (metroPages && metroPages.length > 0) {
      var otherMetros = metroPages.filter(function(m) {
        var slug = m.cache_key.replace('metro:', '');
        return slug !== metro && !slug.includes(':');
      }).slice(0, 8);
      if (otherMetros.length > 0) {
        otherCitiesHtml = '\n      <div class="seo-link-grid">' +
        otherMetros.map(function(m) {
          var slug = m.cache_key.replace('metro:', '');
          var display = (m.data && m.data.metro && m.data.metro.display_name) || slug.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
          return '<a href="/jobs-in/' + esc(slug) + '/' + esc(d.role?.slug || role) + '">' + esc(roleDisplay) + ' in ' + esc(display) + '</a>';
        }).join('') + '</div>';
      }
    }
    relatedHtml = `
    <section class="seo-section seo-related">
      <h2>Explore More</h2>
      <p><a href="/jobs-in/${esc(metro)}">← All jobs in ${esc(metroDisplay)}</a></p>
      <p><a href="/trends/${esc(d.role?.slug || role)}">${esc(roleDisplay)} Trends Nationwide →</a></p>
      <p><a href="/job-market-data">← National Job Market Overview</a></p>
      ${otherCitiesHtml ? '<h3>Compare ' + esc(roleDisplay) + ' in Other Cities</h3>' + otherCitiesHtml : ''}
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

  // Build metro JSON-LD schemas
  const metroSchemas = buildMetroJsonLd(metro, role, data, cityData);
  const extraJsonLdHtml = renderJsonLdBlocks(metroSchemas);

  return renderShell({
    title: `${pageTitle} — Salary Data, Hiring Trends & Top Companies | Brilliant Jobs`,
    metaDesc,
    canonical: role ? `/jobs-in/${metro}/${role}` : `/jobs-in/${metro}`,
    bodyClass: 'seo-page seo-metro',
    breadcrumbs,
    extraJsonLd: extraJsonLdHtml,
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

    \${hookPillsHtml}

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

    ${!role && cityData ? renderVisibleFaqs(metroDisplay, roleDisplay, stats, cityData) : ''}
    `,
    chartData: JSON.stringify(d)
  });
}

function renderTrendsPage(data, role, metroPages) {
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

    ${renderHubCityGrid(metroPages)}

    ${renderHubTrendsGrid(trendPages)}

    ${renderHubDataLabLinks()}

    ${renderCTA()}
    `,
    chartData: JSON.stringify(d)
  });
}

// =========================================================================
// Visible FAQ section (matches FAQPage schema in JSON-LD)
// =========================================================================
function renderVisibleFaqs(metroDisplay, roleDisplay, stats, cityData) {
  var faqs = [];
  faqs.push({ q: 'How many jobs are open in ' + esc(metroDisplay) + '?', a: 'There are currently ' + fmtNum(stats.total_jobs) + ' open positions in ' + esc(metroDisplay) + ' across ' + fmtNum(stats.companies_count) + ' companies, sourced directly from company career pages.' });
  if (stats.median_salary) {
    faqs.push({ q: 'What is the median salary for jobs in ' + esc(metroDisplay) + '?', a: 'The median listed salary for open positions in ' + esc(metroDisplay) + ' is ' + fmtSal(stats.median_salary) + ', based on ' + fmtNum(stats.with_salary_count) + ' listings with salary data.' });
  }
  if (stats.remote_pct) {
    faqs.push({ q: 'What percentage of jobs in ' + esc(metroDisplay) + ' are remote?', a: stats.remote_pct + '% of open positions in ' + esc(metroDisplay) + ' are listed as remote or remote-friendly.' });
  }
  if (cityData && cityData.top_titles && cityData.top_titles.length >= 3) {
    var topRoles = cityData.top_titles.slice(0, 3).map(function(t) { return esc(t.title); }).join(', ');
    faqs.push({ q: 'What are the most in-demand roles in ' + esc(metroDisplay) + '?', a: 'The most in-demand roles in ' + esc(metroDisplay) + ' right now are ' + topRoles + ', based on active job listing volume from direct ATS feeds.' });
  }
  faqs.push({ q: 'How often is the ' + esc(metroDisplay) + ' job data updated?', a: 'Job market data for ' + esc(metroDisplay) + ' is refreshed every 6 hours from direct ATS feeds including Greenhouse, Lever, Ashby, Workable, and Recruitee, plus USAJobs for federal positions.' });

  return '\n  <section class="seo-section seo-faq">\n    <h2>Frequently Asked Questions</h2>\n    <div class="seo-faq-list">' +
    faqs.map(function(f) {
      return '\n      <details class="seo-faq-item"><summary>' + f.q + '</summary><p>' + f.a + '</p></details>';
    }).join('') +
    '\n    </div>\n  </section>';
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
function renderShell({ title, metaDesc, canonical, bodyClass, content, chartData, breadcrumbs, extraJsonLd }) {
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
  ${extraJsonLd || ''}
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
    <p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · <a href="/">brilliantjobs.app</a> · <span class="seo-version">v4.87</span></p>
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

  // Fetch cross-linking data (non-blocking, best-effort)
  let cityData = null;
  let metroPages = [];
  let trendPages = [];

  try {
    if (type === 'metro' && !role) {
      // Fetch hook pills + cross-metro links in parallel
      const [cityResult, metrosResult] = await Promise.all([
        fetchCityPills(metro),
        fetchMetroPages(15)
      ]);
      cityData = cityResult;
      metroPages = metrosResult;
    } else if (type === 'metro' && role) {
      // Fetch metro pages for same-role-in-other-cities cross-links
      metroPages = await fetchMetroPages(15);
    } else if (type === 'trends') {
      metroPages = await fetchMetroPages(15);
    } else if (type === 'market') {
      const [m, t] = await Promise.all([
        fetchMetroPages(50),
        fetchTrendPages()
      ]);
      metroPages = m;
      trendPages = t;
    }
  } catch (e) {
    // Cross-linking is non-critical — continue without it
    console.warn('[seo-page] Cross-link fetch failed:', e.message);
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
    default:
      res.status(400).send('Unknown page type');
      return;
  }

  // ISR: revalidate every hour
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
