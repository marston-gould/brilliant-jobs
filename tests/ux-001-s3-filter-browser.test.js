/**
 * UX-001-S3: Feed UX Consolidation — Universal Filter Browser
 * Validates: UX-007 (Browse buttons on all filter dimensions,
 *            generic filter browser, MV migration, SPA bridge)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');

// ============================================================
// Section 1: Browse buttons in dashboard.html
// ============================================================
describe('UX-007: Browse buttons on filter rows', () => {
  const dashHtml = read('dashboard.html');

  it('WHAT row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-what-btn"');
  });

  it('WHAT NOT row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-what-not-btn"');
  });

  it('SKILLS row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-skills-btn"');
  });

  it('DEPT row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-dept-btn"');
  });

  it('LEVEL row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-level-btn"');
  });

  it('JD CONTAINS row has Browse button', () => {
    expect(dashHtml).toContain('id="browse-jd-btn"');
  });

  it('existing WHO Browse buttons still present', () => {
    expect(dashHtml).toContain('id="browse-who-btn"');
    expect(dashHtml).toContain('id="browse-who-not-btn"');
  });

  it('all new Browse buttons use browse-companies-btn class', () => {
    const browseIds = ['browse-what-btn', 'browse-what-not-btn', 'browse-skills-btn',
                       'browse-dept-btn', 'browse-level-btn', 'browse-jd-btn'];
    for (const id of browseIds) {
      const idx = dashHtml.indexOf(`id="${id}"`);
      expect(idx).toBeGreaterThan(-1);
      // The class should be nearby
      const snippet = dashHtml.substring(Math.max(0, idx - 100), idx);
      expect(snippet).toContain('browse-companies-btn');
    }
  });

  it('filter inputs with Browse have u-pr-70 class for spacing', () => {
    expect(dashHtml).toMatch(/qb-input-what".*u-pr-70|u-pr-70.*qb-input-what/);
    expect(dashHtml).toMatch(/qb-input-skills".*u-pr-70|u-pr-70.*qb-input-skills/);
    expect(dashHtml).toMatch(/qb-input-dept".*u-pr-70|u-pr-70.*qb-input-dept/);
    expect(dashHtml).toMatch(/qb-input-level".*u-pr-70|u-pr-70.*qb-input-level/);
    expect(dashHtml).toMatch(/qb-input-jd".*u-pr-70|u-pr-70.*qb-input-jd/);
  });
});

// ============================================================
// Section 2: Generic filter browser page
// ============================================================
describe('UX-007: Generic filter browser page', () => {
  const dashHtml = read('dashboard.html');

  it('page-filter-browser exists', () => {
    expect(dashHtml).toContain('id="page-filter-browser"');
  });

  it('has back button', () => {
    expect(dashHtml).toContain('id="fb-back-btn"');
  });

  it('has title and subtitle', () => {
    expect(dashHtml).toContain('id="fb-title"');
    expect(dashHtml).toContain('id="fb-subtitle"');
  });

  it('has search input', () => {
    expect(dashHtml).toContain('id="fb-search"');
  });

  it('has alpha nav container', () => {
    expect(dashHtml).toContain('id="fb-alpha-nav"');
  });

  it('has list container', () => {
    expect(dashHtml).toContain('id="fb-list"');
  });

  it('has total count display', () => {
    expect(dashHtml).toContain('id="fb-total-count"');
  });
});

// ============================================================
// Section 3: openFilterBrowser function
// ============================================================
describe('UX-007: openFilterBrowser function', () => {
  const browsersJs = read('js/browsers.js');

  it('openFilterBrowser function exists', () => {
    expect(browsersJs).toContain('function openFilterBrowser(');
  });

  it('FB_DIMENSIONS config for all 5 dimensions', () => {
    expect(browsersJs).toContain("title:");
    expect(browsersJs).toContain("skill:");
    expect(browsersJs).toContain("dept:");
    expect(browsersJs).toContain("level:");
    expect(browsersJs).toContain("jd_keyword:");
  });

  it('each dimension has label, mvDim, pillTarget', () => {
    expect(browsersJs).toContain('Title Browser');
    expect(browsersJs).toContain('Skills Browser');
    expect(browsersJs).toContain('Department Browser');
    expect(browsersJs).toContain('Level Browser');
    expect(browsersJs).toContain('JD Keyword Browser');
  });

  it('pill targets map correctly', () => {
    expect(browsersJs).toContain("pillTarget: 'whatPills'");
    expect(browsersJs).toContain("pillTarget: 'skillsPills'");
    expect(browsersJs).toContain("pillTarget: 'deptPills'");
    expect(browsersJs).toContain("pillTarget: 'levelPills'");
    expect(browsersJs).toContain("pillTarget: 'jdPills'");
  });

  it('whatNotPills pill target for exclude mode', () => {
    expect(browsersJs).toContain("pillNotTarget: 'whatNotPills'");
  });

  it('exported to window for SPA bridge', () => {
    expect(browsersJs).toContain('window.openFilterBrowser = openFilterBrowser');
  });
});

// ============================================================
// Section 4: Filter browser data loading
// ============================================================
describe('UX-007: Data loading', () => {
  const browsersJs = read('js/browsers.js');

  it('loadFilterBrowserData function exists', () => {
    expect(browsersJs).toContain('async function loadFilterBrowserData');
  });

  it('queries mv_filter_browser_data table', () => {
    expect(browsersJs).toContain('mv_filter_browser_data');
  });

  it('has 10-minute cache TTL', () => {
    expect(browsersJs).toContain('10 * 60 * 1000');
  });

  it('orders by job_count descending', () => {
    expect(browsersJs).toContain("ascending: false");
  });
});

// ============================================================
// Section 5: Filter browser rendering
// ============================================================
describe('UX-007: Browser rendering', () => {
  const browsersJs = read('js/browsers.js');

  it('renderFilterBrowserList function exists', () => {
    expect(browsersJs).toContain('function renderFilterBrowserList');
  });

  it('renders alpha navigation for large sets', () => {
    expect(browsersJs).toContain('cb-alpha-letter');
    expect(browsersJs).toContain('fb-letter-');
  });

  it('hides alpha nav for small sets (≤20 items)', () => {
    expect(browsersJs).toMatch(/items\.length\s*<=\s*20/);
  });

  it('shows job count badge per row', () => {
    expect(browsersJs).toContain('job_count.toLocaleString()');
  });

  it('search filters the list', () => {
    expect(browsersJs).toMatch(/fb-search.*input.*renderFilterBrowserList/s);
  });

  it('shows total count', () => {
    expect(browsersJs).toContain('fb-total-count');
  });
});

// ============================================================
// Section 6: Selection and pill injection
// ============================================================
describe('UX-007: Selection and pill injection', () => {
  const browsersJs = read('js/browsers.js');

  it('_toggleFbItem function exists', () => {
    expect(browsersJs).toContain('function _toggleFbItem');
  });

  it('toggles selection state', () => {
    expect(browsersJs).toContain('_fbSelections');
    expect(browsersJs).toMatch(/delete\s+_fbSelections\[value\]/);
  });

  it('updates back button text with selection count', () => {
    expect(browsersJs).toContain('Apply');
    expect(browsersJs).toContain('selection');
  });

  it('back button injects pills into target array', () => {
    expect(browsersJs).toContain('target.push');
    expect(browsersJs).toContain("source: 'browser'");
  });

  it('back button calls renderAllPills after injection', () => {
    expect(browsersJs).toContain('renderAllPills');
  });

  it('back button calls invalidateCache', () => {
    expect(browsersJs).toContain('invalidateCache');
  });

  it('back button calls searchJobs(0)', () => {
    expect(browsersJs).toContain('searchJobs(0)');
  });

  it('back button navigates to Jobs page', () => {
    expect(browsersJs).toContain('page-jobs');
  });

  it('handles exclude mode via pillNotTarget', () => {
    expect(browsersJs).toContain('pillNotTarget');
    expect(browsersJs).toContain("mode === 'exclude'");
  });
});

// ============================================================
// Section 7: Browse button event listeners
// ============================================================
describe('UX-007: Browse button wiring', () => {
  const browsersJs = read('js/browsers.js');

  it('browse-what-btn → title, include', () => {
    expect(browsersJs).toMatch(/browse-what-btn.*openFilterBrowser\('title',\s*'include'\)/);
  });

  it('browse-what-not-btn → title, exclude', () => {
    expect(browsersJs).toMatch(/browse-what-not-btn.*openFilterBrowser\('title',\s*'exclude'\)/);
  });

  it('browse-skills-btn → skill, include', () => {
    expect(browsersJs).toMatch(/browse-skills-btn.*openFilterBrowser\('skill',\s*'include'\)/);
  });

  it('browse-dept-btn → dept, include', () => {
    expect(browsersJs).toMatch(/browse-dept-btn.*openFilterBrowser\('dept',\s*'include'\)/);
  });

  it('browse-level-btn → level, include', () => {
    expect(browsersJs).toMatch(/browse-level-btn.*openFilterBrowser\('level',\s*'include'\)/);
  });

  it('browse-jd-btn → jd_keyword, include', () => {
    expect(browsersJs).toMatch(/browse-jd-btn.*openFilterBrowser\('jd_keyword',\s*'include'\)/);
  });
});

// ============================================================
// Section 8: Migration
// ============================================================
describe('UX-007: Database migration', () => {
  const migration = read('supabase/migrations/v6.48-ux007-filter-browser-data.sql');

  it('creates mv_filter_browser_data materialized view', () => {
    expect(migration).toContain('CREATE MATERIALIZED VIEW');
    expect(migration).toContain('mv_filter_browser_data');
  });

  it('includes title dimension', () => {
    expect(migration).toContain("'title'::text AS dimension");
  });

  it('includes skill dimension with unnest', () => {
    expect(migration).toContain("'skill'::text AS dimension");
    expect(migration).toContain('unnest(extracted_skills)');
  });

  it('includes dept dimension', () => {
    expect(migration).toContain("'dept'::text AS dimension");
    expect(migration).toContain('extracted_department');
  });

  it('includes level dimension', () => {
    expect(migration).toContain("'level'::text AS dimension");
    expect(migration).toContain('extracted_seniority');
  });

  it('includes jd_keyword dimension with ts_stat', () => {
    expect(migration).toContain("'jd_keyword'::text AS dimension");
    expect(migration).toContain('ts_stat');
    expect(migration).toContain('content_tsv');
  });

  it('has unique index on (dimension, value)', () => {
    expect(migration).toContain('idx_mv_filter_browser_dimension_value');
    expect(migration).toContain('(dimension, value)');
  });

  it('grants access to authenticated and anon', () => {
    expect(migration).toContain('GRANT SELECT ON mv_filter_browser_data TO authenticated');
    expect(migration).toContain('GRANT SELECT ON mv_filter_browser_data TO anon');
  });

  it('has pg_cron for 15-minute refresh', () => {
    expect(migration).toContain('refresh-filter-browser-data');
    expect(migration).toContain('*/15 * * * *');
    expect(migration).toContain('REFRESH MATERIALIZED VIEW CONCURRENTLY');
  });

  it('filters only open jobs', () => {
    expect(migration).toMatch(/status\s*=\s*'open'/);
  });
});

// ============================================================
// Section 9: Build verification
// ============================================================
describe('Build verification', () => {
  it('product version is v8.28', () => {
    const versionJs = read('js/version.js');
    expect(versionJs).toContain('8.28');
  });

  it('dist/dashboard.min.js rebuilt', () => {
    const dist = read('dist/dashboard.min.js');
    expect(dist.length).toBeGreaterThan(1000);
  });

  it('dist/dashboard-deferred.min.js rebuilt (includes browsers.js)', () => {
    const dist = read('dist/dashboard-deferred.min.js');
    expect(dist.length).toBeGreaterThan(1000);
  });

  it('styles.css rebuilt with feed-pagination from S2', () => {
    const css = read('styles.css');
    expect(css).toContain('feed-pagination');
  });
});

// ============================================================
// Section 10: No regressions
// ============================================================
describe('No regressions', () => {
  const dashHtml = read('dashboard.html');
  const browsersJs = read('js/browsers.js');

  it('company browser page still present', () => {
    expect(dashHtml).toContain('id="page-company-browser"');
  });

  it('company browser functions still intact', () => {
    expect(browsersJs).toContain('function openCompanyBrowser');
    expect(browsersJs).toContain('cbAllCompanies');
  });

  it('location browser still intact', () => {
    expect(browsersJs).toContain('function openLocationBrowser');
    expect(dashHtml).toContain('id="page-location-browser"');
  });

  it('industry browser still intact', () => {
    expect(browsersJs).toContain('function openIndustryBrowser');
    expect(dashHtml).toContain('id="page-industry-browser"');
  });

  it('existing browse-who-btn handlers still present', () => {
    expect(browsersJs).toContain("$('#browse-who-btn')");
    expect(browsersJs).toContain("$('#browse-who-not-btn')");
  });

  it('tuning browser buttons still present', () => {
    expect(browsersJs).toContain("$('#browse-tuning-co-btn')");
    expect(browsersJs).toContain("$('#browse-tuning-loc-btn')");
    expect(browsersJs).toContain("$('#browse-tuning-ind-btn')");
  });

  it('feed-pagination from S2 still present', () => {
    expect(dashHtml).toContain('id="feed-pagination"');
  });

  it('UX-001-S1 changes preserved (no chat header buttons)', () => {
    expect(dashHtml).not.toContain('id="chat-load-btn"');
    expect(dashHtml).not.toContain('id="chat-save-btn"');
  });
});
