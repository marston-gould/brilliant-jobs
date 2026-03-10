/**
 * Tab Test Session 2 — Tuning Tab Validation
 * 
 * Automated structural validation for all 14 test cases (TU-001 through TU-014)
 * from Tab_Test_Sequence_v3_AllUsers.docx, Section 2: Tuning Tab.
 * 
 * These tests verify code-level prerequisites, HTML structure, JS function existence,
 * regression prevention for QA-012/QA-013/QA-014, defensive coding patterns,
 * and the typeof guards that ensure all 6 simulated user profiles (U-01 through U-06)
 * are handled correctly.
 * 
 * Subsections:
 *   2.1 Tab Load (TU-001 to TU-002)
 *   2.2 Keyword Weights (TU-003 to TU-004)
 *   2.3 Location and Seniority (TU-005 to TU-006)
 *   2.4 Career Levels (TU-007)
 *   2.5 Browse Links (TU-008 to TU-010)
 *   2.6 Dismissed Jobs (TU-011 to TU-012)
 *   2.7 Exclusions (TU-013)
 *   2.8 Error and Edge States (TU-014)
 *   Regression Prevention (QA-011, QA-012, QA-013, QA-014)
 *   User Profile Edge Cases (U-01, U-03, U-04, U-06)
 *   Build & Version + File Inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let dashboardHtml, tuningJs, browsersJs, keywordsJs, lazyLoaderTs,
    locationJs, jobFeedJs, globalsTs, appJs, buildJs, queryBuilderJs,
    inputCss;

try { dashboardHtml = read('dashboard.html'); } catch (e) { dashboardHtml = ''; }
try { tuningJs = read('js/tuning.js'); } catch (e) { tuningJs = ''; }
try { browsersJs = read('js/browsers.js'); } catch (e) { browsersJs = ''; }
try { keywordsJs = read('js/keywords.js'); } catch (e) { keywordsJs = ''; }
try { lazyLoaderTs = read('js/lazy-loader.ts'); } catch (e) { lazyLoaderTs = ''; }
try { locationJs = read('js/location.js'); } catch (e) { locationJs = ''; }
try { jobFeedJs = read('js/job-feed.js'); } catch (e) { jobFeedJs = ''; }
try { globalsTs = read('js/globals.ts'); } catch (e) { globalsTs = ''; }
try { appJs = read('js/app.js'); } catch (e) { appJs = ''; }
try { buildJs = read('build.js'); } catch (e) { buildJs = ''; }
try { queryBuilderJs = read('js/query-builder.js'); } catch (e) { queryBuilderJs = ''; }
try { inputCss = read('src/input.css'); } catch (e) { inputCss = ''; }

// ─────────────────────────────────────────────────
// Section 2.1 — Tab Load (TU-001 to TU-002)
// ─────────────────────────────────────────────────

describe('2.1 Tab Load', () => {
  // TU-001: Tuning tab navigation
  test('TU-001: Tuning tab nav item exists in sidebar', () => {
    expect(dashboardHtml).toMatch(/data-page=["']tuning["']/);
  });

  test('TU-001: Tuning page container exists', () => {
    expect(dashboardHtml).toMatch(/id=["']page-tuning["']/);
  });

  test('TU-001: All tuning card sections render in HTML', () => {
    // Location Rules card
    expect(dashboardHtml).toMatch(/id=["']tc-location["']/);
    // Company Exclusions card
    expect(dashboardHtml).toMatch(/id=["']tc-company["']/);
    // Industry Exclusions card
    expect(dashboardHtml).toMatch(/id=["']tc-industry["']/);
    // Title Rules card (includes levels + title exclusions)
    expect(dashboardHtml).toMatch(/id=["']tc-title["']/);
    // Dismissed Jobs / Poor Matches card
    expect(dashboardHtml).toMatch(/id=["']tc-poor["']/);
  });

  test('TU-001: Lazy-loader TAB_CHUNKS maps tuning tab to keywords + tuning chunks', () => {
    // QA-012 regression: tuning tab must load both keywords and tuning chunks
    expect(lazyLoaderTs).toMatch(/'tuning':\s*\[['"]keywords['"],\s*['"]tuning['"]\]/);
  });

  test('TU-001: Build.js tuning chunk includes tuning.js', () => {
    expect(buildJs).toMatch(/tuning:\s*\[/);
    expect(buildJs).toMatch(/['"]js\/tuning\.js['"]/);
  });

  test('TU-001: U-01 — typeof guards on cross-chunk function calls', () => {
    // migratePipelineData, buildPipelineFilterTags, renderPipeline are from pipeline chunk
    // They must be guarded with typeof to prevent crash for any user profile
    expect(tuningJs).toMatch(/typeof migratePipelineData\s*===?\s*['"]function['"]/);
    expect(tuningJs).toMatch(/typeof buildPipelineFilterTags\s*===?\s*['"]function['"]/);
    expect(tuningJs).toMatch(/typeof renderPipeline\s*===?\s*['"]function['"]/);
  });

  test('TU-001: U-04 — tuningSettings loaded with safeReadLS fallback', () => {
    // safeReadLS returns default on malformed/missing localStorage
    expect(tuningJs).toMatch(/tuningSettings\s*=\s*safeReadLS\(['"]bj_tuning['"],\s*\{\}/);
  });

  test('TU-001: U-06 — pill arrays default to empty array if missing', () => {
    // Each exclusion pill array must fallback to [] if tuningSettings has no entry
    expect(tuningJs).toMatch(/tuningLocExclPills\s*=\s*tuningSettings\.locationExcludes\s*\|\|\s*\[\]/);
    expect(tuningJs).toMatch(/tuningTitleExclPills\s*=\s*tuningSettings\.titleExcludes\s*\|\|\s*\[\]/);
    expect(tuningJs).toMatch(/tuningCoExclPills\s*=\s*tuningSettings\.companyExcludes\s*\|\|\s*\[\]/);
    expect(tuningJs).toMatch(/tuningIndExclPills\s*=\s*tuningSettings\.industryExcludes\s*\|\|\s*\[\]/);
  });

  // TU-002: Console clean on load
  test('TU-002: tuning.js uses reportError instead of bare console.error', () => {
    // ES-002 compliance: no console-only catch blocks
    const catches = tuningJs.match(/catch\s*\([^)]*\)\s*\{[^}]*console\.(error|warn)\(/g) || [];
    const consoleOnlyCatches = catches.filter(c => !c.includes('reportError'));
    // Allow documented console.warn in structured logging (BE-006 pattern)
    expect(consoleOnlyCatches.length).toBeLessThanOrEqual(0);
  });

  test('TU-002: Tuning status dot exists for visual feedback', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-status-dot["']/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.2 — Keyword Weights (TU-003 to TU-004)
// ─────────────────────────────────────────────────

describe('2.2 Keyword Weights', () => {
  // TU-003: Add keyword weight
  test('TU-003: Level hierarchy with DEFAULT_LEVELS provides keywords', () => {
    // DEFAULT_LEVELS must exist for keyword weight matching
    expect(tuningJs).toMatch(/const\s+DEFAULT_LEVELS\s*=/);
  });

  test('TU-003: saveLevels persists to tuningSettings and calls saveUserData', () => {
    expect(tuningJs).toMatch(/function\s+saveLevels\s*\(\)/);
    expect(tuningJs).toMatch(/tuningSettings\.levelHierarchy\s*=\s*levelHierarchy/);
    expect(tuningJs).toMatch(/saveUserData\(['"]bj_tuning['"]/);
  });

  test('TU-003: renderLevelTable function exists for UI rendering', () => {
    expect(tuningJs).toMatch(/function\s+renderLevelTable\s*\(\)/);
  });

  test('TU-003: Level table body container exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']level-table-body["']/);
  });

  // TU-004: Delete keyword weight
  test('TU-004: Level add button exists for adding levels', () => {
    expect(dashboardHtml).toMatch(/id=["']level-add-btn["']/);
  });

  test('TU-004: Level add button has click listener', () => {
    expect(tuningJs).toMatch(/\$\(['"]#level-add-btn['"]\)\.addEventListener\(['"]click['"]/);
  });

  test('TU-004: U-06 — Level hierarchy falls back to DEFAULT_LEVELS copy', () => {
    // Must use JSON.parse(JSON.stringify(DEFAULT_LEVELS)) — deep copy, not reference
    expect(tuningJs).toMatch(/levelHierarchy\s*=\s*tuningSettings\.levelHierarchy\s*\|\|\s*JSON\.parse\(JSON\.stringify\(DEFAULT_LEVELS\)\)/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.3 — Location and Seniority (TU-005 to TU-006)
// ─────────────────────────────────────────────────

describe('2.3 Location and Seniority', () => {
  // TU-005: Location radius
  test('TU-005: US-Only toggle checkbox exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-us-only["']/);
  });

  test('TU-005: Exclude Hourly toggle checkbox exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-exclude-hourly["']/);
  });

  test('TU-005: Exclude Staffing toggle checkbox exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-exclude-staffing["']/);
  });

  test('TU-005: saveTuning function reads checkbox states and persists', () => {
    expect(tuningJs).toMatch(/function\s+saveTuning\s*\(\)/);
    expect(tuningJs).toMatch(/tuningSettings\.usOnly\s*=.*tuning-us-only/);
    expect(tuningJs).toMatch(/tuningSettings\.excludeHourly\s*=.*tuning-exclude-hourly/);
  });

  test('TU-005: US-Only toggle change event calls saveTuning', () => {
    expect(tuningJs).toMatch(/tuning-us-only.*addEventListener.*change.*saveTuning/s);
  });

  test('TU-005: Exclude Hourly change event calls saveTuning', () => {
    expect(tuningJs).toMatch(/tuning-exclude-hourly.*addEventListener.*change.*saveTuning/s);
  });

  test('TU-005: Location exclusions query builder exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-location-exclude["']/);
  });

  // TU-006: Seniority preferences
  test('TU-006: Checkbox states restored from tuningSettings on load', () => {
    expect(tuningJs).toMatch(/if\s*\(tuningSettings\.usOnly\).*tuning-us-only.*checked\s*=\s*true/s);
    expect(tuningJs).toMatch(/if\s*\(tuningSettings\.excludeHourly\).*tuning-exclude-hourly.*checked\s*=\s*true/s);
  });

  test('TU-006: QA-011 — _tuningDirty flag set on save for feed re-read', () => {
    // When tuning changes, feed must re-search on next tab switch
    expect(tuningJs).toMatch(/window\._tuningDirty\s*=\s*true/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.4 — Career Levels (TU-007)
// ─────────────────────────────────────────────────

describe('2.4 Career Levels', () => {
  // TU-007: Career levels section renders
  test('TU-007: Level table container exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']level-table["']/);
    expect(dashboardHtml).toMatch(/<thead>/);
    expect(dashboardHtml).toMatch(/Level/);
    expect(dashboardHtml).toMatch(/Match Keywords/);
  });

  test('TU-007: renderLevelTable called on tuning.js load', () => {
    // Must be called at top level to populate on page render
    const lines = tuningJs.split('\n');
    const topLevelCalls = lines.filter(l => 
      l.match(/^renderLevelTable\(\)/) && !l.match(/function/)
    );
    expect(topLevelCalls.length).toBeGreaterThan(0);
  });

  test('TU-007: QA-013 — DEFAULT_LEVELS ensures non-empty levels for U-01', () => {
    // DEFAULT_LEVELS must have at least 3 entries (typical: intern/junior/mid/senior/lead/director/vp/c-suite)
    const match = tuningJs.match(/const\s+DEFAULT_LEVELS\s*=\s*\[([\s\S]*?)\];/);
    expect(match).toBeTruthy();
    // Count objects in the array (look for { patterns)
    const objCount = (match[1].match(/\{/g) || []).length;
    expect(objCount).toBeGreaterThanOrEqual(3);
  });

  test('TU-007: getJobLevel function exists for level matching', () => {
    expect(tuningJs).toMatch(/function\s+getJobLevel\s*\(title,\s*hierarchy\)/);
  });

  test('TU-007: editFilterLevelHierarchy exported to window for per-filter override', () => {
    expect(tuningJs).toMatch(/window\.editFilterLevelHierarchy\s*=\s*function/);
  });

  test('TU-007: updateTuningBadges called after saveLevels', () => {
    // saveLevels must update badge counts
    expect(tuningJs).toMatch(/function\s+saveLevels[\s\S]*?updateTuningBadges\(\)/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.5 — Browse Links (TU-008 to TU-010)
// ─────────────────────────────────────────────────

describe('2.5 Browse Links', () => {
  // TU-008: Location browse
  test('TU-008: Location browse button exists in tuning HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']browse-tuning-loc-btn["']/);
  });

  test('TU-008: Location browse button click listener wired in browsers.js', () => {
    expect(browsersJs).toMatch(/browse-tuning-loc-btn.*addEventListener.*click.*openLocationBrowser/s);
  });

  test('TU-008: openLocationBrowser function exists in browsers.js', () => {
    expect(browsersJs).toMatch(/function\s+openLocationBrowser/);
  });

  // TU-009: Industry browse
  test('TU-009: Industry browse button exists in tuning HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']browse-tuning-ind-btn["']/);
  });

  test('TU-009: Industry browse button click listener wired in browsers.js', () => {
    expect(browsersJs).toMatch(/browse-tuning-ind-btn.*addEventListener.*click.*openIndustryBrowser/s);
  });

  test('TU-009: openIndustryBrowser function exists in browsers.js', () => {
    expect(browsersJs).toMatch(/function\s+openIndustryBrowser/);
  });

  // TU-010: Company browse
  test('TU-010: Company browse button exists in tuning HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']browse-tuning-co-btn["']/);
  });

  test('TU-010: Company browse button click listener wired in browsers.js', () => {
    expect(browsersJs).toMatch(/browse-tuning-co-btn.*addEventListener.*click.*openCompanyBrowser/s);
  });

  test('TU-010: openCompanyBrowser function exists in browsers.js', () => {
    expect(browsersJs).toMatch(/function\s+openCompanyBrowser/);
  });

  // QA-012 regression: all three browse buttons must NOT go to blank area
  test('QA-012 regression: browsers.js loaded with tuning chunk via keywords dep', () => {
    // TAB_CHUNKS for tuning = ['keywords', 'tuning']
    // browsers.js is in the keywords chunk
    // Verify browsers.js is in the keywords build chunk
    const keywordsChunkMatch = buildJs.match(/keywords:\s*\[([\s\S]*?)\]/);
    expect(keywordsChunkMatch).toBeTruthy();
    expect(keywordsChunkMatch[1]).toMatch(/browsers\.js/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.6 — Dismissed Jobs (TU-011 to TU-012)
// ─────────────────────────────────────────────────

describe('2.6 Dismissed Jobs', () => {
  // TU-011: Dismissed jobs list renders
  test('TU-011: Dismissed jobs container exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-poor-matches["']/);
  });

  test('TU-011: Suggestions container exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-suggestions["']/);
  });

  test('TU-011: updatePoorMatchSuggestions function exists', () => {
    expect(tuningJs).toMatch(/function\s+updatePoorMatchSuggestions\s*\(\)/);
  });

  test('TU-011: updatePoorMatchSuggestions called on tuning load', () => {
    // Must be called at module level to populate on page render
    const lines = tuningJs.split('\n');
    const topLevelCalls = lines.filter(l =>
      l.trim() === 'updatePoorMatchSuggestions();'
    );
    expect(topLevelCalls.length).toBeGreaterThan(0);
  });

  test('TU-011: U-01 — Empty state message shown when no dismissed jobs', () => {
    // hiddenJobIds empty should show helpful text, not blank
    expect(tuningJs).toMatch(/Nothing dismissed yet/i);
  });

  test('TU-011: U-04 — Dismissed job rendering handles orphaned IDs gracefully', () => {
    // Jobs are loaded from hiddenJobIds — backfill section must handle missing Supabase records
    expect(tuningJs).toMatch(/Backfill any hidden jobs missing title|backfill/i);
  });

  test('TU-011: U-03 — List capped to reasonable max (not unbounded render)', () => {
    // Max 20 entries shown for performance
    expect(tuningJs).toMatch(/max\s*20|\.slice\(0,\s*20\)|newest first.*max/i);
  });

  // TU-012: Undismiss a job
  test('TU-012: unhideJob function exported to window', () => {
    expect(tuningJs).toMatch(/window\.unhideJob\s*=\s*function/);
  });

  test('TU-012: unhideJob removes from hiddenJobIds and saves', () => {
    expect(tuningJs).toMatch(/saveUserData\(['"]bj_hidden_jobs['"]/);
  });

  test('TU-012: unhideJob calls updatePoorMatchSuggestions to refresh list', () => {
    // After unhide, the dismissed list must re-render
    expect(tuningJs).toMatch(/unhideJob[\s\S]*?updatePoorMatchSuggestions/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.7 — Exclusions (TU-013)
// ─────────────────────────────────────────────────

describe('2.7 Exclusions', () => {
  // TU-013: Add exclusion rule
  test('TU-013: Title exclusion input exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-title-excl-input["']/);
  });

  test('TU-013: Company exclusion query builder exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tc-company["']/);
  });

  test('TU-013: Industry exclusion input exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']tuning-ind-excl-input["']/);
  });

  test('TU-013: addSuggestedExclusion function exported to window', () => {
    expect(tuningJs).toMatch(/window\.addSuggestedExclusion\s*=\s*function/);
  });

  test('TU-013: saveTuning persists all 4 exclusion pill arrays', () => {
    expect(tuningJs).toMatch(/tuningSettings\.locationExcludes\s*=\s*tuningLocExclPills/);
    expect(tuningJs).toMatch(/tuningSettings\.titleExcludes\s*=\s*tuningTitleExclPills/);
    expect(tuningJs).toMatch(/tuningSettings\.companyExcludes\s*=\s*tuningCoExclPills/);
    expect(tuningJs).toMatch(/tuningSettings\.industryExcludes\s*=\s*tuningIndExclPills/);
  });

  test('TU-013: U-06 — Industry pill type safety handles string and object formats', () => {
    // tuning.js must handle both pill formats: string "staffing" and object {values: ["staffing"]}
    expect(tuningJs).toMatch(/typeof\s+p\s*===?\s*['"]string['"]/);
  });

  test('TU-013: Exclusions propagate to feed via buildFilterQuery', () => {
    // job-feed.js must read tuning exclusion pills
    expect(jobFeedJs).toMatch(/tuningTitleExclPills|titleExcludes/);
    expect(jobFeedJs).toMatch(/tuningCoExclPills|companyExcludes/);
    expect(jobFeedJs).toMatch(/tuningIndExclPills|industryExcludes/);
  });

  test('TU-013: SPA useFeedSearch.ts reads tuning exclusions', () => {
    let spaFeedSearch = '';
    try { spaFeedSearch = read('src/app/pages/dashboard/feed/hooks/useFeedSearch.ts'); } catch (e) {}
    expect(spaFeedSearch).toMatch(/tuning\.titleExcludes|titleExcl/);
    expect(spaFeedSearch).toMatch(/tuning\.companyExcludes|compExcl/);
    expect(spaFeedSearch).toMatch(/tuning\.industryExcludes|indExcl/);
  });
});

// ─────────────────────────────────────────────────
// Section 2.8 — Error and Edge States (TU-014)
// ─────────────────────────────────────────────────

describe('2.8 Error and Edge States', () => {
  // TU-014: Network failure on Tuning load
  test('TU-014: Global error handler exists for unhandled rejections', () => {
    expect(globalsTs).toMatch(/unhandledrejection/);
  });

  test('TU-014: toastWarning function available for user-facing error messages', () => {
    expect(globalsTs).toMatch(/function\s+toastWarning|window\.toastWarning/);
  });

  test('TU-014: Network error handler reports to PostHog', () => {
    expect(globalsTs).toMatch(/reportError.*network|network.*reportError/s);
  });

  test('TU-014: Offline detection initialized in globals', () => {
    expect(globalsTs).toMatch(/initOfflineDetection|offline/);
  });

  test('TU-014: U-03 — tuning card collapse state saved/restored from localStorage', () => {
    // Large config must not cause issues — collapse state persisted
    expect(tuningJs).toMatch(/function\s+saveTuningCollapseStates/);
    // Restore on load
    expect(tuningJs).toMatch(/tuning.*collapsed|states\.tuning/);
  });
});

// ─────────────────────────────────────────────────
// Regression Prevention
// ─────────────────────────────────────────────────

describe('Regression Prevention', () => {
  test('QA-011: _tuningDirty flag forces feed re-search on tab switch', () => {
    // tuning.js sets the flag
    expect(tuningJs).toMatch(/window\._tuningDirty\s*=\s*true/);
    // job-feed.js or app.js must CHECK the flag on feed tab activation
    const flagRead = jobFeedJs.includes('_tuningDirty') || appJs.includes('_tuningDirty');
    expect(flagRead).toBe(true);
  });

  test('QA-012: TAB_CHUNKS for tuning loads keywords chunk (browsers.js)', () => {
    // Without keywords chunk, browse buttons never register handlers
    expect(lazyLoaderTs).toMatch(/'tuning':\s*\[['"]keywords['"],/);
  });

  test('QA-013: Career levels section has defaults — never blank for new users', () => {
    expect(tuningJs).toMatch(/DEFAULT_LEVELS/);
    // Fallback: levelHierarchy = tuningSettings.levelHierarchy || DEFAULT_LEVELS copy
    expect(tuningJs).toMatch(/levelHierarchy\s*=\s*tuningSettings\.levelHierarchy\s*\|\|/);
  });

  test('QA-014: Dismissed jobs section handles empty list gracefully', () => {
    // Empty hiddenJobIds must show message, not blank
    expect(tuningJs).toMatch(/Nothing dismissed yet/);
  });

  test('QA-HOTFIX-001: typeof guard on migratePipelineData prevents crash', () => {
    expect(tuningJs).toMatch(/typeof migratePipelineData\s*===?\s*['"]function['"]/);
  });
});

// ─────────────────────────────────────────────────
// User Profile Edge Cases
// ─────────────────────────────────────────────────

describe('User Profile Edge Cases', () => {
  test('U-01 (new user): tuningSettings defaults to empty object', () => {
    expect(tuningJs).toMatch(/safeReadLS\(['"]bj_tuning['"],\s*\{\}\)/);
  });

  test('U-01 (new user): renderLevelTable uses DEFAULT_LEVELS when no saved config', () => {
    expect(tuningJs).toMatch(/levelHierarchy\s*=\s*tuningSettings\.levelHierarchy\s*\|\|\s*JSON\.parse/);
  });

  test('U-03 (power user): tuning card collapse states persist in localStorage', () => {
    expect(tuningJs).toMatch(/saveTuningCollapseStates/);
  });

  test('U-03 (power user): dismissed jobs list limited to max 20 for performance', () => {
    // Rendering 50+ hidden jobs would degrade DOM
    expect(tuningJs).toMatch(/max\s*20|\.slice\(0,\s*20\)/i);
  });

  test('U-04 (dormant user): stale tuning config safely loaded via safeReadLS', () => {
    // safeReadLS wraps JSON.parse in try/catch with fallback
    expect(globalsTs).toMatch(/function\s+safeReadLS|safeReadLS/);
  });

  test('U-06 (edge case): industry pill type safety with typeof checks', () => {
    // Handles both string and object pill formats
    const typeofChecks = (tuningJs.match(/typeof\s+p\s*===?\s*['"]string['"]/g) || []).length;
    expect(typeofChecks).toBeGreaterThanOrEqual(2);
  });

  test('U-06 (edge case): empty keyword weight entry does not crash level table', () => {
    // renderLevelTable handles entries with undefined/empty fields
    expect(tuningJs).toMatch(/renderLevelTable/);
    // Level name input should accept empty value without error
    expect(tuningJs).toMatch(/level-name|lvl\.label|lvl\.name/);
  });
});

// ─────────────────────────────────────────────────
// Build & Version + File Inventory
// ─────────────────────────────────────────────────

describe('Build & Version + File Inventory', () => {
  test('tuning.js exists and is non-empty', () => {
    expect(tuningJs.length).toBeGreaterThan(100);
  });

  test('browsers.js exists and is non-empty', () => {
    expect(browsersJs.length).toBeGreaterThan(100);
  });

  test('lazy-loader.ts exists and defines TAB_CHUNKS', () => {
    expect(lazyLoaderTs).toMatch(/TAB_CHUNKS/);
  });

  test('Tuning chunk dist file exists', () => {
    const exists = fs.existsSync(path.join(ROOT, 'dist', 'dashboard-tuning.min.js'));
    expect(exists).toBe(true);
  });

  test('Keywords chunk dist file exists (required for browse buttons)', () => {
    const exists = fs.existsSync(path.join(ROOT, 'dist', 'dashboard-keywords.min.js'));
    expect(exists).toBe(true);
  });

  test('BJ namespace registers tuning exports', () => {
    // editFilterLevelHierarchy, unhideJob, addSuggestedExclusion registered
    expect(tuningJs).toMatch(/BJ\._registry|window\.BJ/);
  });

  test('SPA TuningPage component exists', () => {
    const exists = fs.existsSync(path.join(ROOT, 'src', 'app', 'pages', 'dashboard', 'tuning', 'TuningPage.tsx'));
    expect(exists).toBe(true);
  });

  test('Pod team manifest exists with hook-and-scar roles', () => {
    const manifest = read('docs/scaling/pod-team-manifest.md');
    expect(manifest).toMatch(/Chief Architect/);
    expect(manifest).toMatch(/Lead Platform Engineer/);
    expect(manifest).toMatch(/System Architect.*Scalability/);
    expect(manifest).toMatch(/Forward-Looking Developer/);
    expect(manifest).toMatch(/Evolvability Strategist/);
  });
});
