/**
 * UX-001-S2: Feed UX Consolidation — Pagination
 * Validates: UX-006 (replace infinite scroll with page-based pagination)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');

// ============================================================
// Section 1: Load More removed
// ============================================================
describe('UX-006: Load More removed', () => {
  const feedJs = read('js/job-feed.js');

  it('no "Load more jobs" button in renderJobRows', () => {
    // The inline Load More <tr> should be gone
    expect(feedJs).not.toContain('Load more jobs</button>');
  });

  it('no "Back to top" button in renderJobRows', () => {
    expect(feedJs).not.toContain('Back to top</button>');
  });

  it('no inline showing/pagination <tr> in renderJobRows', () => {
    // The old pattern was: html += `<tr><td colspan="8" style="text-align:center...
    // with "Showing X of Y" and Load More
    expect(feedJs).not.toMatch(/html\s*\+\=.*Showing.*of.*jobs.*Load more/s);
  });
});

// ============================================================
// Section 2: Pagination controls in dashboard.html
// ============================================================
describe('UX-006: Pagination container in HTML', () => {
  const dashHtml = read('dashboard.html');

  it('feed-pagination container exists', () => {
    expect(dashHtml).toContain('id="feed-pagination"');
  });

  it('feed-pagination has correct CSS class', () => {
    expect(dashHtml).toContain('class="feed-pagination"');
  });

  it('feed-pagination is after job-table', () => {
    const tableIdx = dashHtml.indexOf('id="job-table"');
    const paginationIdx = dashHtml.indexOf('id="feed-pagination"');
    expect(tableIdx).toBeGreaterThan(-1);
    expect(paginationIdx).toBeGreaterThan(-1);
    expect(paginationIdx).toBeGreaterThan(tableIdx);
  });
});

// ============================================================
// Section 3: renderPagination function
// ============================================================
describe('UX-006: renderPagination function', () => {
  const feedJs = read('js/job-feed.js');

  it('renderPagination function exists', () => {
    expect(feedJs).toContain('function renderPagination(');
  });

  it('renderPagination shows Showing X–Y of Z', () => {
    expect(feedJs).toMatch(/Showing.*toLocaleString.*of.*toLocaleString.*job/);
  });

  it('renderPagination has Previous button', () => {
    expect(feedJs).toMatch(/Prev/);
    expect(feedJs).toMatch(/Previous page/);
  });

  it('renderPagination has Next button', () => {
    expect(feedJs).toMatch(/Next.*›/);
    expect(feedJs).toMatch(/Next page/);
  });

  it('renderPagination renders page number buttons', () => {
    expect(feedJs).toContain('fp-btn');
    expect(feedJs).toContain('fp-active');
  });

  it('renderPagination has smart ellipsis', () => {
    expect(feedJs).toContain('_buildPageRange');
    expect(feedJs).toContain('fp-ellipsis');
  });

  it('renderPagination exported to window', () => {
    expect(feedJs).toContain('window.renderPagination = renderPagination');
  });

  it('renderJobRows calls renderPagination', () => {
    expect(feedJs).toMatch(/renderPagination\(jobs\.length,\s*total,\s*page\)/);
  });
});

// ============================================================
// Section 4: _buildPageRange helper
// ============================================================
describe('UX-006: Page range builder', () => {
  const feedJs = read('js/job-feed.js');

  it('_buildPageRange function exists', () => {
    expect(feedJs).toContain('function _buildPageRange(');
  });

  it('handles small page counts (≤7) without ellipsis', () => {
    expect(feedJs).toMatch(/total\s*<=\s*7/);
  });

  it('always includes first and last page', () => {
    expect(feedJs).toContain('pages.add(0)');
    expect(feedJs).toContain('pages.add(total - 1)');
  });

  it('includes current page neighbors', () => {
    expect(feedJs).toMatch(/current\s*-\s*1/);
    expect(feedJs).toMatch(/current\s*\+\s*1/);
  });
});

// ============================================================
// Section 5: Scroll to top on page change
// ============================================================
describe('UX-006: Scroll to top', () => {
  const feedJs = read('js/job-feed.js');

  it('searchJobs scrolls to job table on page > 0', () => {
    expect(feedJs).toContain('scrollIntoView');
    expect(feedJs).toMatch(/page\s*>\s*0.*scrollIntoView/s);
  });

  it('uses smooth scrolling behavior', () => {
    expect(feedJs).toContain("behavior: 'smooth'");
  });
});

// ============================================================
// Section 6: Pagination CSS
// ============================================================
describe('UX-006: Pagination CSS', () => {
  const css = read('src/input.css');

  it('feed-pagination styles defined', () => {
    expect(css).toContain('.feed-pagination');
  });

  it('fp-btn styles defined', () => {
    expect(css).toContain('.fp-btn');
  });

  it('fp-active styles defined', () => {
    expect(css).toContain('.fp-active');
  });

  it('fp-ellipsis styles defined', () => {
    expect(css).toContain('.fp-ellipsis');
  });

  it('fp-summary styles defined', () => {
    expect(css).toContain('.fp-summary');
  });

  it('fp-controls layout styles defined', () => {
    expect(css).toContain('.fp-controls');
  });

  it('empty pagination is hidden', () => {
    expect(css).toMatch(/\.feed-pagination:empty.*display:\s*none/);
  });
});

// ============================================================
// Section 7: SPA parity
// ============================================================
describe('UX-006: SPA parity', () => {
  const paginationTsx = read('src/app/pages/dashboard/feed/components/PaginationControls.tsx');
  const jobTableTsx = read('src/app/pages/dashboard/feed/components/JobTable.tsx');
  const feedPageTsx = read('src/app/pages/dashboard/feed/FeedPage.tsx');

  it('PaginationControls has pageJobCount prop (not showing)', () => {
    expect(paginationTsx).toContain('pageJobCount');
    expect(paginationTsx).not.toContain('showing:');
  });

  it('PaginationControls has onPageChange prop', () => {
    expect(paginationTsx).toContain('onPageChange');
  });

  it('PaginationControls removed onLoadMore/onBackToTop', () => {
    expect(paginationTsx).not.toContain('onLoadMore');
    expect(paginationTsx).not.toContain('onBackToTop');
  });

  it('PaginationControls has buildPageRange helper', () => {
    expect(paginationTsx).toContain('buildPageRange');
  });

  it('PaginationControls shows Prev/Next buttons', () => {
    expect(paginationTsx).toContain('Prev');
    expect(paginationTsx).toContain('Next');
  });

  it('PaginationControls shows page numbers', () => {
    expect(paginationTsx).toContain('fp-btn');
    expect(paginationTsx).toContain('fp-active');
  });

  it('PaginationControls removed "Load more jobs"', () => {
    expect(paginationTsx).not.toContain('Load more');
  });

  it('PaginationControls removed MAX_FEED_ROWS cap', () => {
    expect(paginationTsx).not.toContain('MAX_FEED_ROWS');
  });

  it('JobTable uses onPageChange prop', () => {
    expect(jobTableTsx).toContain('onPageChange');
    expect(jobTableTsx).not.toContain('onLoadMore');
    expect(jobTableTsx).not.toContain('onBackToTop');
  });

  it('FeedPage passes onPageChange to JobTable', () => {
    expect(feedPageTsx).toContain('onPageChange');
    expect(feedPageTsx).not.toContain('onLoadMore');
    expect(feedPageTsx).not.toContain('onBackToTop');
  });
});

// ============================================================
// Section 8: Build verification
// ============================================================
describe('Build verification', () => {
  it('product version is v8.27', () => {
    const versionJs = read('js/version.js');
    expect(versionJs).toContain('8.27');
  });

  it('dist/dashboard.min.js rebuilt', () => {
    const dist = read('dist/dashboard.min.js');
    expect(dist.length).toBeGreaterThan(1000);
  });

  it('styles.css rebuilt', () => {
    const css = read('styles.css');
    expect(css).toContain('feed-pagination');
    expect(css).toContain('fp-btn');
  });

  it('SPA build succeeded (FeedPage chunk exists)', () => {
    // Check dist/spa/assets/ for a FeedPage chunk
    const spaDir = join(ROOT, 'dist/spa/assets');
    const { readdirSync } = require('fs');
    const files = readdirSync(spaDir);
    const feedChunk = files.find(f => f.startsWith('FeedPage'));
    expect(feedChunk).toBeDefined();
  });
});

// ============================================================
// Section 9: No regressions
// ============================================================
describe('No regressions', () => {
  const feedJs = read('js/job-feed.js');
  const dashHtml = read('dashboard.html');

  it('searchJobs function still intact', () => {
    expect(feedJs).toContain('async function searchJobs(page = 0)');
  });

  it('renderJobRows function still intact', () => {
    expect(feedJs).toContain('function renderJobRows(jobs, total, page, filtersToRun)');
  });

  it('JOBS_PER_PAGE unchanged at 50', () => {
    const globals = read('js/globals.ts');
    expect(globals).toContain('JOBS_PER_PAGE = 50');
  });

  it('job-table still present', () => {
    expect(dashHtml).toContain('id="job-table"');
    expect(dashHtml).toContain('id="job-table-body"');
  });

  it('PostHog feed instrumentation still present', () => {
    expect(feedJs).toContain('feed_search_completed');
    expect(feedJs).toContain('feed_page_turn');
  });

  it('trust/AI filter badges still render', () => {
    expect(feedJs).toContain('trustBannerHtml');
    expect(feedJs).toContain('aiContentBannerHtml');
  });

  it('backgroundEnrichSalary still called', () => {
    expect(feedJs).toContain('backgroundEnrichSalary()');
  });

  it('preview snippets still load', () => {
    expect(feedJs).toContain('loadPreviewSnippets');
  });
});
