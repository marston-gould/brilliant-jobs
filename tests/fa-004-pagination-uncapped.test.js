/**
 * FA-004 — Remove 500-Row Cap + Real Pagination
 * Validation tests
 *
 * Verifies:
 * 1. MAX_FEED_ROWS constant removed from globals.ts/globals.js
 * 2. Single-filter path uses uncapped range() pagination
 * 3. Multi-filter path raised per-filter limit
 * 4. Pagination UI no longer references cap
 * 5. SPA useFeedSearch.ts mirrors all changes
 * 6. PostHog pagination_uncapped property added
 * 7. Version bumped and build output updated
 */

const { readFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');

const ROOT = process.cwd();

function read(f) { return readFileSync(`${ROOT}/${f}`, 'utf8'); }

// ── Section 1: MAX_FEED_ROWS Removal ──

test('1.1 — globals.ts does not define MAX_FEED_ROWS', () => {
  const src = read('js/globals.ts');
  expect(src).not.toMatch(/MAX_FEED_ROWS\s*=\s*500/);
  expect(src).not.toMatch(/var MAX_FEED_ROWS/);
});

test('1.2 — globals.js (compiled) does not contain MAX_FEED_ROWS', () => {
  const src = read('js/globals.js');
  expect(src).not.toMatch(/MAX_FEED_ROWS/);
});

test('1.3 — JOBS_PER_PAGE still 50 in globals.ts', () => {
  const src = read('js/globals.ts');
  expect(src).toMatch(/JOBS_PER_PAGE\s*=\s*50/);
});

test('1.4 — globals.ts has FA-004 removal comment', () => {
  const src = read('js/globals.ts');
  expect(src).toMatch(/FA-004.*cap removed/i);
});

// ── Section 2: Single-Filter Path (job-feed.js) ──

test('2.1 — job-feed.js single-filter path has no MAX_FEED_ROWS cap', () => {
  const src = read('js/job-feed.js');
  // Should NOT have the old bail-out pattern
  expect(src).not.toMatch(/if\s*\(from\s*>=\s*MAX_FEED_ROWS\)/);
});

test('2.2 — job-feed.js single-filter uses uncapped range()', () => {
  const src = read('js/job-feed.js');
  // Should have simple to = from + JOBS_PER_PAGE - 1 (no Math.min with MAX_FEED_ROWS)
  expect(src).toMatch(/const to = from \+ JOBS_PER_PAGE - 1;/);
  expect(src).not.toMatch(/Math\.min\(from \+ JOBS_PER_PAGE - 1,\s*MAX_FEED_ROWS/);
});

test('2.3 — job-feed.js still uses range() for server-side pagination', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/query\.range\(from, to\)/);
});

test('2.4 — job-feed.js still uses count: exact', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/count:\s*'exact'/);
});

test('2.5 — job-feed.js has FA-004 comment on single-filter path', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/FA-004.*no cap.*lightweight DB query/i);
});

// ── Section 3: Multi-Filter Path (job-feed.js) ──

test('3.1 — job-feed.js multi-filter per-filter limit raised from 250', () => {
  const src = read('js/job-feed.js');
  // Should be ceil(2000 / length), 500 — NOT ceil(MAX_FEED_ROWS / length), 250
  expect(src).toMatch(/Math\.ceil\(2000\s*\/\s*filtersToRun\.length\)/);
  expect(src).toMatch(/,\s*500\)/);
});

test('3.2 — job-feed.js multi-filter path references FA-005', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/FA-005.*server-side UNION/i);
});

test('3.3 — job-feed.js multi-filter path no longer references MAX_FEED_ROWS', () => {
  const src = read('js/job-feed.js');
  expect(src).not.toMatch(/MAX_FEED_ROWS/);
});

// ── Section 4: Pagination UI ──

test('4.1 — Pagination UI no longer shows "limited to" message', () => {
  const src = read('js/job-feed.js');
  expect(src).not.toMatch(/limited to/);
});

test('4.2 — Pagination UI no longer uses capped variable', () => {
  const src = read('js/job-feed.js');
  expect(src).not.toMatch(/const capped\s*=/);
});

test('4.3 — Pagination UI no longer uses reachedCap variable', () => {
  const src = read('js/job-feed.js');
  expect(src).not.toMatch(/reachedCap/);
});

test('4.4 — Pagination UI shows accurate total count', () => {
  const src = read('js/job-feed.js');
  // Should show total.toLocaleString() directly, not the complicated conditional
  expect(src).toMatch(/of \$\{total\.toLocaleString\(\)\} jobs/);
});

test('4.5 — Load More button shown when moreAvailable (no cap check)', () => {
  const src = read('js/job-feed.js');
  // Should be just moreAvailable, not moreAvailable && !reachedCap
  expect(src).toMatch(/\$\{moreAvailable \?/);
  expect(src).not.toMatch(/moreAvailable && !reachedCap/);
});

test('4.6 — moreAvailable checks showing < total', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/const moreAvailable = showing < total \|\| gotFullPage/);
});

// ── Section 5: SPA useFeedSearch.ts ──

test('5.1 — SPA hook does not define MAX_FEED_ROWS', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).not.toMatch(/MAX_FEED_ROWS\s*=\s*500/);
});

test('5.2 — SPA hook has FA-004 removal comment', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).toMatch(/FA-004.*cap removed/i);
});

test('5.3 — SPA single-filter has no bail-out at MAX_FEED_ROWS', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).not.toMatch(/from >= MAX_FEED_ROWS/);
});

test('5.4 — SPA single-filter uses uncapped range()', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).toMatch(/const to = from \+ JOBS_PER_PAGE - 1;/);
  expect(src).not.toMatch(/Math\.min\(from \+ JOBS_PER_PAGE - 1,\s*MAX_FEED_ROWS/);
});

test('5.5 — SPA multi-filter per-filter limit raised', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).toMatch(/Math\.ceil\(2000\s*\/\s*checkedFilters\.length\)/);
  expect(src).toMatch(/,\s*500\)/);
});

test('5.6 — SPA multi-filter references FA-005', () => {
  const src = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts');
  expect(src).toMatch(/FA-005.*server-side UNION/i);
});

// ── Section 6: PostHog Instrumentation ──

test('6.1 — feed_search_completed event includes pagination_uncapped property', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/pagination_uncapped:\s*true/);
});

test('6.2 — pagination_uncapped has FA-004 comment', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/FA-004.*500-row cap removal/i);
});

// ── Section 7: Build Output ──

test('7.1 — dashboard.min.js does not contain MAX_FEED_ROWS', () => {
  const src = read('dist/dashboard.min.js');
  expect(src).not.toMatch(/MAX_FEED_ROWS/);
});

test('7.2 — dashboard.min.js contains pagination_uncapped', () => {
  const src = read('dist/dashboard.min.js');
  expect(src).toMatch(/pagination_uncapped/);
});

test('7.3 — Product version is v7.91', () => {
  const src = read('js/version.js');
  expect(src).toMatch(/v7\.91/);
});

// ── Section 8: No Regressions ──

test('8.1 — JOBS_PER_PAGE still 50 in job-feed.js references', () => {
  const src = read('js/job-feed.js');
  // Count: should still reference JOBS_PER_PAGE in pagination logic
  const matches = src.match(/JOBS_PER_PAGE/g);
  expect(matches).not.toBeNull();
  expect(matches.length).toBeGreaterThan(3);
});

test('8.2 — cachedQuery still used in single-filter path', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/cachedQuery\(feedCacheKey/);
});

test('8.3 — _feedLoadMoreOffset still updated', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/_feedLoadMoreOffset\s*=\s*\(page \+ 1\) \* JOBS_PER_PAGE/);
});

test('8.4 — hiddenIds exclusion still in single-filter path', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/hiddenIds\.length > 0/);
});

test('8.5 — Back to top button still present', () => {
  const src = read('js/job-feed.js');
  expect(src).toMatch(/Back to top/);
});

// ── Section 9: File Inventory ──

test('9.1 — All modified files exist', () => {
  const files = [
    'js/globals.ts',
    'js/globals.js',
    'js/job-feed.js',
    'src/app/pages/dashboard/feed/hooks/useFeedSearch.ts',
    'dist/dashboard.min.js',
    'js/version.js',
  ];
  for (const f of files) {
    expect(existsSync(`${ROOT}/${f}`)).toBe(true);
  }
});
