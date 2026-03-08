/**
 * POD3-SF: Saved Filters UX Fixes
 * (1) 1D/7D/30D columns and counts removed
 * (2) Pill changes auto-save to saved filter and re-run query
 * (3) Search includes pill values, not just filter names
 */

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const locationJs = fs.readFileSync(path.join(root, 'js/location.js'), 'utf-8');
const queryBuilderJs = fs.readFileSync(path.join(root, 'js/query-builder.js'), 'utf-8');

// ─── Issue 1: 1D/7D/30D removed ───
describe('Issue 1: 1D/7D/30D columns removed', () => {
  test('No 1D/7D/30D column headers in renderSavedFilters', () => {
    // The header section should not contain 1D, 7D, 30D labels
    const headerMatch = locationJs.match(/sf-count.*?1D/);
    expect(headerMatch).toBeNull();
  });

  test('No jobsToday/jobsWeek/jobsMonth variables', () => {
    expect(locationJs).not.toMatch(/const jToday = sf\.jobsToday/);
    expect(locationJs).not.toMatch(/const jWeek = sf\.jobsWeek/);
    expect(locationJs).not.toMatch(/const jMonth = sf\.jobsMonth/);
  });

  test('No sf-count-today/week/month classes in row HTML', () => {
    expect(locationJs).not.toMatch(/sf-count-today/);
    expect(locationJs).not.toMatch(/sf-count-week/);
    expect(locationJs).not.toMatch(/sf-count-month/);
  });

  test('No sf-item-counts container in row HTML', () => {
    // The row HTML should not have the counts container
    const rowCountsMatch = locationJs.match(/sf-item-counts[\s\S]*?sf-count-today/);
    expect(rowCountsMatch).toBeNull();
  });

  test('No trend badge in saved filter row template', () => {
    // Check only the renderSavedFilters template (not the updateSavedFilterCounts function)
    const templateStart = locationJs.indexOf('return `<div class="sf-item"');
    const templateEnd = locationJs.indexOf('}).join(', templateStart);
    const template = locationJs.slice(templateStart, templateEnd);
    expect(template).not.toMatch(/trendBadge/);
    expect(template).not.toMatch(/sf-trend-badge/);
  });
});

// ─── Issue 2: Saving an edited filter updates the feed and persists ───
describe('Issue 2: commitSaveFilter preserves state and re-runs search', () => {
  test('commitSaveFilter calls invalidateCache()', () => {
    expect(locationJs).toMatch(/function commitSaveFilter[\s\S]*?invalidateCache\(\)/);
  });

  test('Checkbox state is captured BEFORE renderSavedFilters', () => {
    const start = locationJs.indexOf('function commitSaveFilter');
    const saveBlock = locationJs.slice(start, start + 5500);
    const checkedCapture = saveBlock.indexOf('checkedIdxs');
    const renderCall = saveBlock.indexOf('renderSavedFilters()');
    expect(checkedCapture).toBeGreaterThan(0);
    expect(renderCall).toBeGreaterThan(0);
    expect(checkedCapture).toBeLessThan(renderCall);
  });

  test('Checkbox state is restored AFTER renderSavedFilters', () => {
    const start = locationJs.indexOf('function commitSaveFilter');
    const saveBlock = locationJs.slice(start, start + 5500);
    const renderCall = saveBlock.indexOf('renderSavedFilters()');
    const restoreCheckbox = saveBlock.indexOf('cb.checked = true', renderCall);
    expect(restoreCheckbox).toBeGreaterThan(renderCall);
  });

  test('Uses searchJobs(0) for immediate re-search (not debounced)', () => {
    const start = locationJs.indexOf('function commitSaveFilter');
    const saveBlock = locationJs.slice(start, start + 5500);
    expect(saveBlock).toMatch(/searchJobs\(0\)/);
  });

  test('Uses _editingFilterIdx as primary lookup for existing filter', () => {
    expect(locationJs).toMatch(/window\._editingFilterIdx\s*!=\s*null\s*\?\s*window\._editingFilterIdx/);
  });

  test('Falls back to name matching if _editingFilterIdx not set', () => {
    expect(locationJs).toMatch(/existingIdx\s*<\s*0[\s\S]*?savedFilters\.findIndex/);
  });

  test('Auto-save block is NOT in renderAllPills (reverted)', () => {
    expect(queryBuilderJs).not.toMatch(/Auto-save pill changes back to the saved filter/);
  });

  test('debouncedSearchJobs still called unconditionally in renderAllPills', () => {
    const lines = queryBuilderJs.split('\n');
    const searchLine = lines.find(l => l.trim() === 'debouncedSearchJobs();');
    expect(searchLine).toBeTruthy();
  });

  test('updateSfActiveCount called after restoring checkboxes', () => {
    const start = locationJs.indexOf('function commitSaveFilter');
    const saveBlock = locationJs.slice(start, start + 5500);
    expect(saveBlock).toMatch(/updateSfActiveCount\(\)/);
  });
});

// ─── Issue 3: Search includes pill values ───
describe('Issue 3: Search includes pill values', () => {
  test('Search filter checks pill values in addition to name', () => {
    expect(locationJs).toMatch(/allPillArrays/);
  });

  test('Search checks whatPills', () => {
    expect(locationJs).toMatch(/sf\.whatPills\s*\|\|\s*sf\.pills/);
  });

  test('Search checks wherePills', () => {
    expect(locationJs).toMatch(/sf\.wherePills\s*\|\|\s*\[\]/);
  });

  test('Search checks payPills', () => {
    expect(locationJs).toMatch(/sf\.payPills\s*\|\|\s*\[\]/);
  });

  test('Search checks whoPills', () => {
    expect(locationJs).toMatch(/sf\.whoPills\s*\|\|\s*\[\]/);
  });

  test('Search checks skill/level/jd/dept pills', () => {
    expect(locationJs).toMatch(/sf\.skillsPills/);
    expect(locationJs).toMatch(/sf\.levelPills/);
    expect(locationJs).toMatch(/sf\.jdPills/);
    expect(locationJs).toMatch(/sf\.deptPills/);
  });

  test('Search uses .includes() on pill values for substring matching', () => {
    expect(locationJs).toMatch(/v\.toLowerCase\(\)\.includes\(query\)/);
  });
});

// ─── Version ───
describe('Version', () => {
  const versionJs = fs.readFileSync(path.join(root, 'js/version.js'), 'utf-8');
  test('Product version bumped to v7.83', () => {
    expect(versionJs).toMatch(/v7\.83/);
  });
});

// ─── readinessCache fix ───
describe('readinessCache declared in globals (shell chunk)', () => {
  const globalsTs = fs.readFileSync(path.join(root, 'js/globals.ts'), 'utf-8');
  const keywordsJs = fs.readFileSync(path.join(root, 'js/keywords.js'), 'utf-8');
  const shellMin = fs.readFileSync(path.join(root, 'dist/dashboard-shell.min.js'), 'utf-8');

  test('readinessCache declared in globals.ts', () => {
    expect(globalsTs).toMatch(/var readinessCache\s*=\s*safeReadLS\('bj_readiness'/);
  });

  test('readinessCache present in shell chunk (loads before deferred)', () => {
    expect(shellMin).toMatch(/readinessCache/);
  });

  test('keywords.js does NOT redeclare with var', () => {
    // Should assign, not declare
    expect(keywordsJs).not.toMatch(/^var readinessCache/m);
    // But should still refresh value
    expect(keywordsJs).toMatch(/readinessCache\s*=\s*safeReadLS/);
  });
});

// ─── Roadmap relabel ───
describe('Chat UX relabel', () => {
  const roadmapHtml = fs.readFileSync(path.join(root, 'roadmap.html'), 'utf-8');

  test('Chat UX iteration bucket changed to post-launch', () => {
    const chatLine = roadmapHtml.split('\n').find(l => l.includes('Chat UX iteration'));
    expect(chatLine).toBeTruthy();
    expect(chatLine).toMatch(/b:\s*'post-launch'/);
    expect(chatLine).not.toMatch(/b:\s*'needs-data'/);
  });
});
