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

// ─── Issue 2: Pill changes auto-save ───
describe('Issue 2: Pill changes auto-save to saved filter', () => {
  test('renderAllPills checks _editingFilterIdx', () => {
    expect(queryBuilderJs).toMatch(/_editingFilterIdx/);
  });

  test('Auto-save writes all pill arrays to saved filter', () => {
    expect(queryBuilderJs).toMatch(/sf\.whatPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.wherePills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.payPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.whoPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.whenPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.whatNotPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.skillsPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.levelPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.jdPills\s*=\s*JSON\.parse/);
    expect(queryBuilderJs).toMatch(/sf\.deptPills\s*=\s*JSON\.parse/);
  });

  test('Auto-save persists to localStorage via saveUserData', () => {
    expect(queryBuilderJs).toMatch(/saveUserData\('bj_saved_filters'/);
  });

  test('Auto-save updates includeNoSalary checkbox', () => {
    expect(queryBuilderJs).toMatch(/sf\.includeNoSalary/);
  });

  test('Auto-save updates includeRemote checkbox', () => {
    expect(queryBuilderJs).toMatch(/sf\.includeRemote/);
  });

  test('debouncedSearchJobs called unconditionally (not gated on allPills > 0)', () => {
    // The old code had: if (allPills() > 0) debouncedSearchJobs();
    // The new code should call debouncedSearchJobs() unconditionally
    const lines = queryBuilderJs.split('\n');
    const searchLine = lines.find(l => l.trim() === 'debouncedSearchJobs();');
    expect(searchLine).toBeTruthy();
  });

  test('Clear All clears _editingFilterIdx to prevent accidental overwrites', () => {
    expect(locationJs).toMatch(/clear-filters-btn[\s\S]*?_editingFilterIdx\s*=\s*null/);
  });

  test('Auto-save does NOT call renderSavedFilters (preserves checkbox state)', () => {
    // Check that the auto-save block doesn't call renderSavedFilters
    const autoSaveBlock = queryBuilderJs.slice(
      queryBuilderJs.indexOf('POD3-GS: Auto-save pill changes'),
      queryBuilderJs.indexOf('Trigger job search when filters change')
    );
    expect(autoSaveBlock).not.toMatch(/renderSavedFilters\(\)/);
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
  test('Product version bumped to v7.81', () => {
    expect(versionJs).toMatch(/v7\.81/);
  });
});
