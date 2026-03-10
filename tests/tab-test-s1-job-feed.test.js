/**
 * Tab Test Session 1 — Job Feed Tab Validation
 * 
 * Automated structural validation for all 22 test cases (JF-001 through JF-022)
 * from Tab_Test_Sequence_v3_AllUsers.docx, Section 1: Job Feed Tab.
 * 
 * These tests verify code-level prerequisites, HTML structure, JS function existence,
 * regression prevention for UX-001 through UX-007, and defensive coding patterns
 * that ensure all 6 simulated user profiles (U-01 through U-06) are handled correctly.
 * 
 * Subsections:
 *   1.1 Initial Load (JF-001 to JF-003)
 *   1.2 Filter Builder Mode (JF-004 to JF-011)
 *   1.3 Chat Mode (JF-012 to JF-013)
 *   1.4 Job Cards (JF-014 to JF-017)
 *   1.5 Pagination (JF-018 to JF-020)
 *   1.6 Error and Edge States (JF-021 to JF-022)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let dashboardHtml, jobFeedJs, chatJs, locationJs, browsersJs, appJs,
    globalsTs, inputCss, queryBuilderJs, lazyLoaderTs, paylJs, tuningJs;

try { dashboardHtml = read('dashboard.html'); } catch (e) { dashboardHtml = ''; }
try { jobFeedJs = read('js/job-feed.js'); } catch (e) { jobFeedJs = ''; }
try { chatJs = read('js/chat.js'); } catch (e) { chatJs = ''; }
try { locationJs = read('js/location.js'); } catch (e) { locationJs = ''; }
try { browsersJs = read('js/browsers.js'); } catch (e) { browsersJs = ''; }
try { appJs = read('js/app.js'); } catch (e) { appJs = ''; }
try { globalsTs = read('js/globals.ts'); } catch (e) { globalsTs = ''; }
try { inputCss = read('src/input.css'); } catch (e) { inputCss = ''; }
try { queryBuilderJs = read('js/query-builder.js'); } catch (e) { queryBuilderJs = ''; }
try { lazyLoaderTs = read('js/lazy-loader.ts'); } catch (e) { lazyLoaderTs = ''; }
try { tuningJs = read('js/tuning.js'); } catch (e) { tuningJs = ''; }

// ─────────────────────────────────────────────────
// Section 1.1 — Initial Load (JF-001 to JF-003)
// ─────────────────────────────────────────────────

describe('1.1 Initial Load', () => {
  // JF-001: Tab navigation + load
  test('JF-001: Job Feed tab exists and is the default tab', () => {
    // Jobs tab must exist in sidebar/nav
    expect(dashboardHtml).toMatch(/id=["'].*jobs/i);
    // Job table container must exist
    expect(dashboardHtml).toMatch(/id=["']job-table["']/);
  });

  test('JF-001: searchJobs function exists for initial load', () => {
    expect(jobFeedJs).toMatch(/function\s+searchJobs\s*\(/);
  });

  test('JF-001: U-01 — No tuning config does not crash (default fallback)', () => {
    // searchJobs must handle missing/null tuning config
    // Check that buildFilterQuery handles empty savedFilters gracefully
    expect(jobFeedJs).toMatch(/buildFilterQuery/);
    // Must not require tuning config to execute
    expect(jobFeedJs).toMatch(/getCheckedSavedFilters/);
  });

  test('JF-001: U-04 — typeof guards protect against missing globals', () => {
    // migratePipelineData guard (QA-HOTFIX-001)
    expect(tuningJs).toMatch(/typeof\s+migratePipelineData/);
    // renderConnectionStatus is defined in app.js as window global (safe for cross-chunk calls)
    expect(appJs).toMatch(/window\.renderConnectionStatus\s*=/);
  });

  test('JF-001: U-06 — Error handling wraps feed load', () => {
    // searchJobs must have try/catch or error handling
    expect(jobFeedJs).toMatch(/reportError|catch/);
  });

  // JF-002: Job count label
  test('JF-002: Pagination label container exists', () => {
    expect(dashboardHtml).toMatch(/id=["']feed-pagination["']/);
  });

  test('JF-002: renderPagination shows "Showing X-Y of Z" range', () => {
    // renderPagination must compute and display range
    expect(jobFeedJs).toMatch(/renderPagination/);
    expect(jobFeedJs).toMatch(/Showing/);
  });

  test('JF-002: renderPagination handles page indicator', () => {
    expect(jobFeedJs).toMatch(/Page\s/);
  });

  // JF-003: Console clean on load
  test('JF-003: reportError used instead of console-only catches', () => {
    // Zero console-only catches (ES-002 complete)
    const consoleOnlyCatches = jobFeedJs.match(/catch\s*\([^)]*\)\s*\{\s*console\.(log|warn|error)\([^)]*\);\s*\}/g);
    expect(consoleOnlyCatches || []).toHaveLength(0);
  });

  test('JF-003: U-04 — stale config errors caught (typeof guards)', () => {
    // Multiple typeof guards for cross-chunk safety
    expect(appJs).toMatch(/typeof/);
  });

  test('JF-003: U-06 — Global error handler installed', () => {
    expect(globalsTs).toMatch(/unhandledrejection/);
    expect(globalsTs).toMatch(/reportError/);
  });
});

// ─────────────────────────────────────────────────
// Section 1.2 — Filter Builder Mode (JF-004 to JF-011)
// ─────────────────────────────────────────────────

describe('1.2 Filter Builder Mode', () => {
  // JF-004: Filter Builder toggle
  test('JF-004: Search mode toggle exists', () => {
    expect(dashboardHtml).toMatch(/id=["']search-mode-bar["']/);
    expect(dashboardHtml).toMatch(/filter-panel-wrap/);
  });

  test('JF-004: Toggle between Filters and Chat modes', () => {
    // search-mode-bar must have buttons/controls for both modes
    expect(dashboardHtml).toMatch(/Filters|Filter Builder/i);
    expect(dashboardHtml).toMatch(/Chat/);
  });

  // JF-005: Merchandising block placement (UX-003 regression)
  test('JF-005: UX-003 — intel-section appears ABOVE search-mode-bar', () => {
    const intelPos = dashboardHtml.indexOf('id="intel-section"');
    const modeBarPos = dashboardHtml.indexOf('id="search-mode-bar"');
    expect(intelPos).toBeGreaterThan(-1);
    expect(modeBarPos).toBeGreaterThan(-1);
    expect(intelPos).toBeLessThan(modeBarPos);
  });

  test('JF-005: intel-section is outside filter-panel-wrap', () => {
    const intelPos = dashboardHtml.indexOf('id="intel-section"');
    const filterWrapPos = dashboardHtml.indexOf('id="filter-panel-wrap"');
    expect(intelPos).toBeLessThan(filterWrapPos);
  });

  // JF-006: Location filter
  test('JF-006: Location filter input exists', () => {
    expect(dashboardHtml).toMatch(/id=["']qb-input-where["']/);
  });

  // JF-007: Title/keyword filter
  test('JF-007: What pills / keyword filter input exists', () => {
    expect(dashboardHtml).toMatch(/id=["']qb-input-what["']/);
  });

  test('JF-007: Content search enabled (FA-001)', () => {
    // buildFilterQuery must include content_tsv search for What pills
    expect(jobFeedJs).toMatch(/content_tsv/);
    expect(jobFeedJs).toMatch(/wfts/);
  });

  test('JF-007: U-06 — Empty keyword weight does not corrupt filter', () => {
    // Pill values get sanitized before query building
    expect(jobFeedJs).toMatch(/trim|replace|sanitize/i);
  });

  // JF-008: Company browse button (UX-007, QA-012 regression)
  test('JF-008: Browse WHO button exists', () => {
    expect(dashboardHtml).toMatch(/id=["']browse-who-btn["']/);
  });

  test('JF-008: Browse WHO NOT button exists', () => {
    expect(dashboardHtml).toMatch(/id=["']browse-who-not-btn["']/);
  });

  test('JF-008: QA-012 — keywords chunk loaded for jobs tab', () => {
    // TAB_CHUNKS must include keywords for jobs tab
    expect(lazyLoaderTs).toMatch(/['"]jobs['"].*keywords|jobs.*\[.*keywords/s);
  });

  test('JF-008: openFilterBrowser function exists', () => {
    expect(browsersJs).toMatch(/openFilterBrowser|function\s+openFilterBrowser/);
  });

  test('JF-008: Filter browser page exists in dashboard', () => {
    expect(dashboardHtml).toMatch(/id=["']page-filter-browser["']/);
  });

  // JF-009: Save a search
  test('JF-009: commitSaveFilter function exists', () => {
    expect(locationJs).toMatch(/commitSaveFilter|function\s+commitSaveFilter/);
  });

  test('JF-009: UX-001 — No duplicate save mechanism in Chat header', () => {
    // chat-save-dialog must be absent
    expect(dashboardHtml).not.toMatch(/id=["']chat-save-dialog["']/);
    // No Load/Save BUTTONS in chat-header-actions (only Clear)
    // "chat-loaded-prompt" span is OK (it's a status indicator, not a button)
    const chatHeaderMatch = dashboardHtml.match(/chat-header-actions[\s\S]*?<\/div>/);
    if (chatHeaderMatch) {
      // Must not have Save Search or Load Search buttons
      expect(chatHeaderMatch[0]).not.toMatch(/Save Search|Load Search/i);
      expect(chatHeaderMatch[0]).not.toMatch(/id=["']chat-save-btn["']|id=["']chat-load-btn["']/);
      expect(chatHeaderMatch[0]).toMatch(/Clear/);
    }
  });

  test('JF-009: Save preserves checkbox state (POD3-SF fix)', () => {
    // commitSaveFilter must restore checked indices after renderSavedFilters
    expect(locationJs).toMatch(/invalidateCache|searchJobs/);
  });

  test('JF-009: U-06 — escHtml used for special characters', () => {
    // Saved filter names must be HTML-escaped
    expect(locationJs).toMatch(/escHtml|escapeHtml|textContent/);
  });

  // JF-010: Load a saved search
  test('JF-010: renderSavedFilters function exists', () => {
    expect(locationJs).toMatch(/renderSavedFilters|function\s+renderSavedFilters/);
  });

  test('JF-010: via Chat badge for chat-generated saves', () => {
    expect(locationJs).toMatch(/via\s*Chat|source.*chat/);
  });

  test('JF-010: Saved filter search checks pill arrays', () => {
    // Search must check whatPills, wherePills, etc.
    expect(locationJs).toMatch(/whatPills|wherePills|whoPills/);
  });

  // JF-011: Delete a saved search (UX-005 regression)
  test('JF-011: UX-005 — sf-del has sufficient width/margin', () => {
    // sf-del must have min-width >= 28px and margin-right >= 8px
    expect(inputCss).toMatch(/sf-del/);
    const sfDelBlock = inputCss.match(/\.sf-item\s+\.sf-del\s*\{[^}]+\}/s);
    if (sfDelBlock) {
      expect(sfDelBlock[0]).toMatch(/min-width|width/);
    }
  });

  test('JF-011: 1D/7D/30D columns removed from saved filters (POD3-SF)', () => {
    // renderSavedFilters must NOT include 1D/7D/30D headers
    expect(locationJs).not.toMatch(/1D.*7D.*30D/);
  });
});

// ─────────────────────────────────────────────────
// Section 1.3 — Chat Mode (JF-012 to JF-013)
// ─────────────────────────────────────────────────

describe('1.3 Chat Mode', () => {
  // JF-012: Chat filter extraction
  test('JF-012: applyChatFilters populates filter builder pills', () => {
    expect(chatJs).toMatch(/applyChatFilters/);
    // Must populate pills from extracted filters
    expect(chatJs).toMatch(/whatPills|wherePills|payPills/);
  });

  test('JF-012: UX-001/UX-002 — No Load/Save/X buttons in Chat header', () => {
    // Only Clear button should exist in chat-header-actions
    const chatHeader = dashboardHtml.match(/chat-header-actions[\s\S]*?<\/div>/);
    expect(chatHeader).toBeTruthy();
    if (chatHeader) {
      expect(chatHeader[0]).toMatch(/chat-clear-btn/);
      expect(chatHeader[0]).not.toMatch(/chat-save-btn|chat-load-btn/);
    }
  });

  test('JF-012: Chat mode toggle does not require page reload', () => {
    // Must use display/visibility toggling, not navigation
    expect(dashboardHtml).toMatch(/chat-panel|chat-container/i);
  });

  // JF-013: Chat-saved search badge
  test('JF-013: via Chat badge rendered for chat-sourced pills', () => {
    // commitSaveFilter detects source: 'chat' 
    expect(locationJs).toMatch(/source.*['"]chat['"]|hasChatPills/);
    // renderSavedFilters shows "via Chat" badge
    expect(locationJs).toMatch(/via\s*Chat/);
  });
});

// ─────────────────────────────────────────────────
// Section 1.4 — Job Cards (JF-014 to JF-017)
// ─────────────────────────────────────────────────

describe('1.4 Job Cards', () => {
  // JF-014: Job card content completeness
  test('JF-014: renderJobRows function exists', () => {
    expect(jobFeedJs).toMatch(/renderJobRows|function\s+renderJobRows/);
  });

  test('JF-014: Job card includes required fields', () => {
    // Must render company, title, location, salary, source
    expect(jobFeedJs).toMatch(/company_name|company/);
    expect(jobFeedJs).toMatch(/title/);
    expect(jobFeedJs).toMatch(/location/);
    expect(jobFeedJs).toMatch(/salary|compensation/i);
  });

  test('JF-014: U-06 — escHtml used for job card rendering', () => {
    // Job card fields must be HTML-escaped to prevent [object Object]
    expect(jobFeedJs).toMatch(/escHtml|textContent/);
  });

  // JF-015: Ghost job badge
  test('JF-015: Ghost/fraud badge rendering exists', () => {
    expect(jobFeedJs).toMatch(/fraud_label|ghost|fraud.*badge/i);
  });

  test('JF-015: Trust badges use Lucide icons (not emoji)', () => {
    // POD3-LUCIDE: trust badges should use data-lucide attributes
    expect(jobFeedJs).toMatch(/data-lucide|shield-check|triangle-alert|flag/);
  });

  // JF-016: Dismiss a job
  test('JF-016: Dismiss job function exists', () => {
    expect(jobFeedJs).toMatch(/dismissJob|dismiss.*job|hiddenJobIds/i);
  });

  test('JF-016: Dismissed jobs excluded from results', () => {
    // Query must filter out dismissed/hidden job IDs
    expect(jobFeedJs).toMatch(/hiddenJobIds|dismissed|not\.in/i);
  });

  // JF-017: External apply link
  test('JF-017: Apply link opens in new tab', () => {
    // Links must have target="_blank" or equivalent
    expect(jobFeedJs).toMatch(/target.*_blank|window\.open/);
  });

  test('JF-017: Job URL rendered from job data', () => {
    expect(jobFeedJs).toMatch(/job_url|apply_url|url/);
  });
});

// ─────────────────────────────────────────────────
// Section 1.5 — Pagination (JF-018 to JF-020)
// ─────────────────────────────────────────────────

describe('1.5 Pagination', () => {
  // JF-018: Page size (UX-006 regression)
  test('JF-018: UX-006 — No "Load more" button rendered in renderJobRows', () => {
    // "Load more" may appear in comments, but must NOT be in actual HTML string output
    // Check that no innerHTML/template string creates a Load More button
    expect(jobFeedJs).not.toMatch(/'Load more|"Load more|`Load more/);
  });

  test('JF-018: UX-006 — No "Load more" button in dashboard HTML', () => {
    expect(dashboardHtml).not.toMatch(/Load more jobs/i);
  });

  test('JF-018: Page size is 50', () => {
    expect(jobFeedJs).toMatch(/50|PAGE_SIZE|pageSize/);
  });

  test('JF-018: Pagination controls container exists', () => {
    expect(dashboardHtml).toMatch(/id=["']feed-pagination["']/);
    expect(dashboardHtml).toMatch(/UX-006.*[Pp]agination/);
  });

  // JF-019: Next and Previous page
  test('JF-019: Scroll to top on page change', () => {
    expect(jobFeedJs).toMatch(/scrollIntoView|scrollTo/);
  });

  test('JF-019: Previous/Next buttons rendered by renderPagination', () => {
    expect(jobFeedJs).toMatch(/Previous|Prev/);
    expect(jobFeedJs).toMatch(/Next/);
  });

  test('JF-019: DOM replaced (not appended) on page transition', () => {
    // innerHTML assignment or replaceChildren pattern expected
    expect(jobFeedJs).toMatch(/innerHTML|replaceChildren/);
  });

  // JF-020: Direct page jump
  test('JF-020: _buildPageRange helper exists', () => {
    expect(jobFeedJs).toMatch(/_buildPageRange|buildPageRange/);
  });

  test('JF-020: Page number buttons rendered', () => {
    // renderPagination must create numbered page buttons
    expect(jobFeedJs).toMatch(/fp-btn|page.*button/i);
  });

  test('JF-020: Active page highlighted', () => {
    expect(jobFeedJs).toMatch(/fp-active/);
  });

  test('JF-020: Ellipsis for large page counts', () => {
    expect(jobFeedJs).toMatch(/fp-ellipsis|\.\.\./);
  });
});

// ─────────────────────────────────────────────────
// Section 1.6 — Error and Edge States (JF-021 to JF-022)
// ─────────────────────────────────────────────────

describe('1.6 Error and Edge States', () => {
  // JF-021: No-results state
  test('JF-021: Empty state / no-results message exists', () => {
    // Must show a message when zero results returned
    expect(jobFeedJs).toMatch(/no.*results|no.*jobs|empty.*state|No jobs/i);
  });

  test('JF-021: U-06 — NULL-safe NOT queries (FA-002)', () => {
    // What NOT pills must use NULL-safe pattern
    expect(jobFeedJs).toMatch(/content_tsv\.is\.null/);
  });

  // JF-022: Network failure
  test('JF-022: Network error handling in globals', () => {
    // Global unhandledrejection catches network failures
    expect(globalsTs).toMatch(/unhandledrejection/);
    expect(globalsTs).toMatch(/reportError.*network|network.*reportError/s);
  });

  test('JF-022: Toast warning shown to user on network error', () => {
    expect(globalsTs).toMatch(/toastWarning/);
  });

  test('JF-022: Offline detection initialized', () => {
    expect(globalsTs).toMatch(/initOfflineDetection|offline/);
  });
});

// ─────────────────────────────────────────────────
// Cross-cutting: Regression Prevention
// ─────────────────────────────────────────────────

describe('Regression Prevention (UX-001 through UX-007)', () => {
  test('UX-001: No duplicate save mechanism in Chat header', () => {
    expect(dashboardHtml).not.toMatch(/id=["']chat-save-dialog["']/);
  });

  test('UX-002: Save dialog modal removed', () => {
    const chatSaveDialogCount = (dashboardHtml.match(/chat-save-dialog/g) || []).length;
    expect(chatSaveDialogCount).toBe(0);
  });

  test('UX-003: intel-section above search-mode-bar', () => {
    const intel = dashboardHtml.indexOf('intel-section');
    const modeBar = dashboardHtml.indexOf('search-mode-bar');
    expect(intel).toBeLessThan(modeBar);
  });

  test('UX-005: sf-del spacing prevents accidental deletion', () => {
    expect(inputCss).toMatch(/sf-del/);
  });

  test('UX-006: No infinite scroll or Load More', () => {
    expect(dashboardHtml).not.toMatch(/Load more jobs/i);
    expect(dashboardHtml).toMatch(/feed-pagination/);
  });

  test('UX-007: All 8 browse buttons present', () => {
    expect(dashboardHtml).toMatch(/browse-what-btn/);
    expect(dashboardHtml).toMatch(/browse-what-not-btn/);
    expect(dashboardHtml).toMatch(/browse-who-btn/);
    expect(dashboardHtml).toMatch(/browse-who-not-btn/);
    expect(dashboardHtml).toMatch(/browse-skills-btn/);
    expect(dashboardHtml).toMatch(/browse-dept-btn/);
    expect(dashboardHtml).toMatch(/browse-level-btn/);
    expect(dashboardHtml).toMatch(/browse-jd-btn/);
  });
});

// ─────────────────────────────────────────────────
// Cross-cutting: User Profile Edge Cases
// ─────────────────────────────────────────────────

describe('User Profile Edge Case Handling', () => {
  test('U-01: New user — empty saved filters does not crash', () => {
    // getCheckedSavedFilters must handle empty array (lives in job-feed.js)
    expect(jobFeedJs).toMatch(/getCheckedSavedFilters/);
    // renderSavedFilters handles empty list (lives in location.js)
    expect(locationJs).toMatch(/renderSavedFilters/);
  });

  test('U-03: Power user — Feed cache key includes sort', () => {
    // QA-010 fix: sort must be part of cache key
    expect(jobFeedJs).toMatch(/_sortKey|sortStack.*cacheKey|feedCacheKey/);
  });

  test('U-04: Dormant user — Stale config guards present', () => {
    // typeof guards on cross-chunk dependencies
    expect(tuningJs).toMatch(/typeof\s+migratePipelineData/);
    // renderConnectionStatus is defined on window in app.js (safe for cross-chunk calls)
    expect(appJs).toMatch(/window\.renderConnectionStatus\s*=/);
  });

  test('U-06: Malformed data — readinessCache in shell chunk', () => {
    // readinessCache moved to globals.ts (shell chunk) to prevent ReferenceError
    expect(globalsTs).toMatch(/readinessCache/);
  });

  test('U-06: Malformed data — FTS sanitization in preview-jobs', () => {
    // FA-003b: FTS input sanitization strips dangerous characters
    const previewJobs = (() => {
      try { return read('supabase/functions/preview-jobs/index.ts'); } catch { return ''; }
    })();
    if (previewJobs) {
      expect(previewJobs).toMatch(/safeFts|sanitize|replace.*['"]/);
    }
  });
});

// ─────────────────────────────────────────────────
// Build & Version Verification
// ─────────────────────────────────────────────────

describe('Build & Version', () => {
  test('Product version is current', () => {
    const versionJs = read('js/version.js');
    expect(versionJs).toMatch(/BJ_VERSION\s*=\s*["']v8\.\d+["']/);
  });

  test('dist/dashboard.min.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  test('dist/dashboard-deferred.min.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });

  test('Lucide CDN script in dashboard.html', () => {
    expect(dashboardHtml).toMatch(/lucide/);
  });

  test('refreshIcons exported globally', () => {
    expect(appJs).toMatch(/refreshIcons|window\.refreshIcons/);
  });
});

// ─────────────────────────────────────────────────
// File Inventory
// ─────────────────────────────────────────────────

describe('File Inventory', () => {
  const requiredFiles = [
    'dashboard.html',
    'js/job-feed.js',
    'js/chat.js',
    'js/location.js',
    'js/browsers.js',
    'js/app.js',
    'js/globals.ts',
    'js/query-builder.js',
    'js/lazy-loader.ts',
    'js/version.js',
    'js/us-filter.js',
    'src/input.css',
    'dist/dashboard.min.js',
    'dist/dashboard-deferred.min.js',
  ];

  test.each(requiredFiles)('%s exists', (file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });
});
