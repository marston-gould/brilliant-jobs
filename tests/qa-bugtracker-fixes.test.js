/**
 * QA Bug Tracker Fixes — Validation Tests
 * 18 items from Marston's QA notes. Tests cover both new fixes and
 * verification that previously-fixed items remain resolved.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

describe('QA Bug Tracker — Previously Fixed (Verification)', () => {
  test('QA-001: Stats queries use status=open, not is_active', () => {
    const app = read('js/app.js');
    expect(app).not.toMatch(/is_active/);
  });

  test('QA-004: Min salary Enter applies filter, no auto-tab', () => {
    const loc = read('js/location.js');
    // The Enter handler should call applyPayFilter, not focus max
    const enterBlock = loc.match(/qb-input-pay-min.*?keydown.*?{([\s\S]*?)}\);/);
    expect(enterBlock).toBeTruthy();
    expect(enterBlock[1]).toContain('applyPayFilter');
    expect(enterBlock[1]).not.toMatch(/focus|advanceToNextInput/);
  });

  test('QA-006/007: Location normalization handles remote patterns', () => {
    const feed = read('js/job-feed.js');
    expect(feed).toContain('cleanLocationPart');
    // "country (remote)" → "Remote, Country" pattern
    expect(feed).toMatch(/\(remote\)/i);
    // "usa" → "US" normalization
    expect(feed).toMatch(/\\busa\\b/i);
  });

  test('QA-008: Chat chunk loaded on jobs tab (TAB_CHUNKS)', () => {
    const loader = read('js/lazy-loader.ts');
    const jobsMatch = loader.match(/'jobs'\s*:\s*\[(.*?)\]/);
    expect(jobsMatch).toBeTruthy();
    expect(jobsMatch[1]).toContain('deferred');
  });

  test('QA-009: Company browser loaded on jobs tab (TAB_CHUNKS)', () => {
    const loader = read('js/lazy-loader.ts');
    const jobsMatch = loader.match(/'jobs'\s*:\s*\[(.*?)\]/);
    expect(jobsMatch).toBeTruthy();
    expect(jobsMatch[1]).toContain('keywords');
  });

  test('QA-011: US-Only filter uses smart 4-tier approach', () => {
    const feed = read('js/job-feed.js');
    // FA-009 smart filter — checks for state codes
    expect(feed).toMatch(/loc_state/);
    expect(feed).toMatch(/loc_country\.eq\.US/);
  });

  test('QA-013: migratePipelineData guarded with typeof check', () => {
    const tuning = read('js/tuning.js');
    expect(tuning).toMatch(/typeof migratePipelineData.*===.*'function'/);
  });

  test('QA-014: updatePoorMatchSuggestions called during tuning init', () => {
    const tuning = read('js/tuning.js');
    // Should be called unconditionally (not just in setTimeout)
    const lines = tuning.split('\n');
    const directCall = lines.some(l => l.trim() === 'updatePoorMatchSuggestions();');
    expect(directCall).toBe(true);
  });

  test('QA-017: Theme toggle and credits in flex row', () => {
    const html = read('dashboard.html');
    // Check for flex container wrapping both elements
    const navFooter = html.match(/nav-footer[\s\S]*?<\/nav>/);
    expect(navFooter).toBeTruthy();
    expect(navFooter[0]).toMatch(/display:\s*flex.*align-items:\s*center/);
    // Both credit-balance and theme-toggle should be inside the same flex container
    expect(navFooter[0]).toMatch(/credit-balance.*theme-toggle/s);
  });
});

describe('QA Bug Tracker — New Fixes (This Session)', () => {
  test('QA-010: Feed cache key includes sort stack', () => {
    const feed = read('js/job-feed.js');
    // Sort key should be part of feedCacheKey
    expect(feed).toContain('_sortKey');
    expect(feed).toMatch(/feedCacheKey.*_sortKey/);
  });

  test('QA-012: Keywords chunk loaded on tuning tab (TAB_CHUNKS)', () => {
    const loader = read('js/lazy-loader.ts');
    const tuningMatch = loader.match(/'tuning'\s*:\s*\[(.*?)\]/);
    expect(tuningMatch).toBeTruthy();
    expect(tuningMatch[1]).toContain('keywords');
  });

  test('QA-002: Setup card body has text-align:center', () => {
    const css = read('src/input.css');
    expect(css).toMatch(/setup-int-body.*text-align:\s*center/);
  });

  test('QA-018: Credit icon is a dollar sign SVG', () => {
    const html = read('dashboard.html');
    const creditIcon = html.match(/credit-icon.*?<\/svg>/);
    expect(creditIcon).toBeTruthy();
    // Dollar sign SVG has the distinctive S-curve path
    expect(creditIcon[0]).toContain('M17 5H9.5');
  });
});

describe('QA Bug Tracker — Build Verification', () => {
  test('Product version is v7.98', () => {
    const version = read('js/version.js');
    expect(version).toContain('7.98');
  });

  test('Dashboard bundle exists and is rebuilt', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  test('Styles rebuilt', () => {
    expect(fs.existsSync(path.join(ROOT, 'styles.css'))).toBe(true);
  });
});

describe('QA Bug Tracker — Round 2 Fixes (Marston Screenshot Review)', () => {
  test('Stats: Companies hiring now uses distinct RPC, not same count as career pages', () => {
    const app = read('js/app.js');
    // Should call get_distinct_company_count RPC
    expect(app).toContain('get_distinct_company_count');
    // Should NOT reuse pagesResult for companies
    expect(app).not.toMatch(/companiesEl.*pagesResult/);
  });

  test('Stats: All three numbers use consistent rounding (floor to 1000)', () => {
    const app = read('js/app.js');
    // Open positions should also round
    const jobsBlock = app.match(/Open positions[\s\S]*?catch/);
    expect(jobsBlock[0]).toContain('Math.floor');
    expect(jobsBlock[0]).toContain('/ 1000');
  });

  test('Stats: RPC migration exists for distinct company count', () => {
    const sql = read('supabase/migrations/v6.44-distinct-company-count.sql');
    expect(sql).toContain('COUNT(DISTINCT company_name)');
    expect(sql).toContain("status = 'open'");
  });

  test('Pill grouping: incl. remote placed after where pills, not at end', () => {
    const loc = read('js/location.js');
    // _wherePills should include incl. remote before allSfPills is assembled
    expect(loc).toMatch(/_wherePills\.push.*incl\. remote/);
    // allSfPills should use _wherePills (pre-grouped)
    expect(loc).toContain('..._wherePills');
  });

  test('Pill grouping: incl. no salary placed after pay pills, not at end', () => {
    const loc = read('js/location.js');
    // _payPills should include incl. no salary before allSfPills is assembled
    expect(loc).toMatch(/_payPills\.push.*incl\. no salary/);
    expect(loc).toContain('..._payPills');
  });

  test('Delete consistency: Job dismiss uses sf-del class (same as saved search)', () => {
    const feed = read('js/job-feed.js');
    // Job row should use sf-del span, not job-action-btn hide-btn
    expect(feed).toMatch(/class="sf-del".*hideJob/);
    expect(feed).not.toMatch(/class="job-action-btn hide-btn"/);
  });

  test('Delete consistency: No dedicated hide button column in table', () => {
    const html = read('dashboard.html');
    // Should NOT have the 30px empty header for hide column
    expect(html).not.toContain('width:30px;cursor:default;');
  });

  test('Delete consistency: sf-del hover works on job-data-row', () => {
    const css = read('src/input.css');
    expect(css).toContain('.job-data-row .sf-del');
    expect(css).toContain('.job-data-row:hover .sf-del');
  });

  test('Colspans updated to 8 (hide column removed)', () => {
    const feed = read('js/job-feed.js');
    // No colspan="9" should remain
    expect(feed).not.toMatch(/colspan="9"/);
    expect(feed).toMatch(/colspan="8"/);
  });
});
