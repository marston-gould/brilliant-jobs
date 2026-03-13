/**
 * APR-002 — Notification Log Archive Functionality
 * Validates A7 from the Applications + Notifications Page Restructure spec
 * 
 * Sections:
 * 1. Migration — archived_at column + index
 * 2. Dashboard HTML — archive controls, checkbox column, action column
 * 3. Notification Center JS — archive functions, filter support, bulk operations
 * 4. CSS — btn-icon style
 * 5. Build & Version
 */

import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

function read(f) { return readFileSync(f, 'utf-8'); }
function exists(f) { return existsSync(f); }

// ═══════════════════════════════════════════════════════════
// 1. MIGRATION — archived_at column + index
// ═══════════════════════════════════════════════════════════
describe('1. Migration', () => {
  const migration = read('supabase/migrations/v8.47-apr002-notification-log-archive.sql');

  it('adds archived_at column to notification_log', () => {
    expect(migration).toMatch(/ALTER TABLE notification_log/i);
    expect(migration).toMatch(/ADD COLUMN.*archived_at.*timestamptz/i);
    expect(migration).toMatch(/DEFAULT NULL/i);
  });

  it('creates composite index on user_id + archived_at', () => {
    expect(migration).toMatch(/CREATE INDEX.*idx_notif_log_archived/i);
    expect(migration).toMatch(/notification_log\s*\(\s*user_id\s*,\s*archived_at\s*\)/i);
  });
});

// ═══════════════════════════════════════════════════════════
// 2. DASHBOARD HTML — Archive controls
// ═══════════════════════════════════════════════════════════
describe('2. Dashboard HTML', () => {
  const html = read('dashboard.html');

  it('has archive filter dropdown', () => {
    expect(html).toContain('id="nlog-filter-archive"');
    expect(html).toContain('value="active"');
    expect(html).toContain('value="archived"');
    expect(html).toContain('value="all"');
  });

  it('has Archive Selected button', () => {
    expect(html).toContain('id="nc-archive-selected"');
    expect(html).toMatch(/nc-archive-selected.*disabled/);
  });

  it('has select-all checkbox in thead', () => {
    expect(html).toContain('id="nc-log-select-all"');
    expect(html).toMatch(/<th[^>]*>.*<input type="checkbox" id="nc-log-select-all">/s);
  });

  it('has 7-column table header (checkbox + 5 data + action)', () => {
    // Find the specific thead inside the notification log table
    const tableStart = html.indexOf('id="nc-notif-log-table"');
    const theadStart = html.indexOf('<thead>', tableStart);
    const theadEnd = html.indexOf('</thead>', theadStart);
    const thead = html.substring(theadStart, theadEnd);
    const thCount = (thead.match(/<th[\s>]/g) || []).length;
    expect(thCount).toBe(7);
  });

  it('empty state uses colspan=7', () => {
    expect(html).toContain('colspan="7"');
  });

  it('uses notif-log-toolbar layout', () => {
    expect(html).toContain('class="notif-log-toolbar"');
    expect(html).toContain('class="notif-log-toolbar-right"');
  });

  it('Export CSV button remains', () => {
    expect(html).toContain('id="nc-notif-export-csv"');
  });
});

// ═══════════════════════════════════════════════════════════
// 3. NOTIFICATION CENTER JS — Archive functions
// ═══════════════════════════════════════════════════════════
describe('3. Notification Center JS', () => {
  const js = read('js/notification-center.js');

  // Archive functions exist
  it('has ncArchiveNotification function', () => {
    expect(js).toMatch(/async function ncArchiveNotification\s*\(\s*id\s*\)/);
  });

  it('has ncUnarchiveNotification function', () => {
    expect(js).toMatch(/async function ncUnarchiveNotification\s*\(\s*id\s*\)/);
  });

  it('has ncBulkArchive function', () => {
    expect(js).toMatch(/async function ncBulkArchive\s*\(\s*\)/);
  });

  it('has ncUpdateArchiveButtonState function', () => {
    expect(js).toMatch(/function ncUpdateArchiveButtonState\s*\(\s*\)/);
  });

  // Archive filter in query
  it('reads nlog-filter-archive value in ncLoadNotificationLog', () => {
    expect(js).toContain("nlog-filter-archive");
  });

  it('applies archive filter: active = is null', () => {
    expect(js).toContain("query.is('archived_at', null)");
  });

  it('applies archive filter: archived = not null', () => {
    expect(js).toContain("query.not('archived_at', 'is', null)");
  });

  // Select query includes archived_at
  it('selects archived_at column in query', () => {
    expect(js).toContain('archived_at');
    expect(js).toMatch(/\.select\([^)]*archived_at/);
  });

  // Checkbox column in row rendering
  it('renders checkbox with nc-log-check class per row', () => {
    expect(js).toContain('class="nc-log-check"');
    expect(js).toContain('data-id="');
  });

  // Action column with archive/unarchive icons
  it('renders archive icon (Lucide archive) for active rows', () => {
    expect(js).toContain('data-lucide="archive"');
    expect(js).toContain('ncArchiveNotification');
  });

  it('renders unarchive icon (Lucide archive-restore) for archived rows', () => {
    expect(js).toContain('data-lucide="archive-restore"');
    expect(js).toContain('ncUnarchiveNotification');
  });

  // Archive operations use user_id guard
  it('ncArchiveNotification uses user_id guard', () => {
    const archiveFn = js.substring(
      js.indexOf('async function ncArchiveNotification'),
      js.indexOf('async function ncUnarchiveNotification')
    );
    expect(archiveFn).toContain(".eq('user_id', currentUser.id)");
    expect(archiveFn).toContain(".eq('id', id)");
  });

  it('ncUnarchiveNotification sets archived_at to null', () => {
    const unarchiveFn = js.substring(
      js.indexOf('async function ncUnarchiveNotification'),
      js.indexOf('async function ncBulkArchive')
    );
    expect(unarchiveFn).toContain('archived_at: null');
  });

  // Bulk archive
  it('ncBulkArchive reads checked items', () => {
    expect(js).toContain('.nc-log-check:checked');
    expect(js).toContain("cb.dataset.id");
  });

  it('ncBulkArchive uses .in for batch update', () => {
    const bulkFn = js.substring(
      js.indexOf('async function ncBulkArchive'),
      js.indexOf('function ncUpdateArchiveButtonState')
    );
    expect(bulkFn).toContain(".in('id', checked)");
  });

  // Select-all checkbox wired
  it('wires nc-log-select-all change listener', () => {
    expect(js).toContain("getElementById('nc-log-select-all')");
  });

  // Archive filter wired in listener array
  it('nlog-filter-archive in filter change listener array', () => {
    expect(js).toContain("'nlog-filter-archive'");
  });

  // Bulk archive button wired
  it('wires nc-archive-selected click listener', () => {
    expect(js).toContain("getElementById('nc-archive-selected')");
    expect(js).toContain('ncBulkArchive');
  });

  // Error handling with reportError
  it('uses reportError in archive functions', () => {
    const archiveSection = js.substring(js.indexOf('// NOTIFICATION LOG — Archive'));
    const reportCalls = (archiveSection.match(/reportError\(/g) || []).length;
    expect(reportCalls).toBeGreaterThanOrEqual(3); // archive, unarchive, bulk
  });

  // Colspan 7 in loading and error states
  it('uses colspan=7 in loading state', () => {
    expect(js).toContain('colspan="7"');
  });

  // Archive button label updates based on view
  it('updates archive button label for archived view', () => {
    expect(js).toContain('Unarchive Selected');
    expect(js).toContain('Archive Selected');
  });
});

// ═══════════════════════════════════════════════════════════
// 4. CSS — btn-icon style
// ═══════════════════════════════════════════════════════════
describe('4. CSS', () => {
  const css = read('src/input.css');

  it('has .btn-icon base style', () => {
    expect(css).toContain('.btn-icon');
    expect(css).toMatch(/\.btn-icon\s*\{[^}]*cursor:\s*pointer/);
  });

  it('has .btn-icon:hover style', () => {
    expect(css).toContain('.btn-icon:hover');
  });

  it('has notif-log-toolbar styles (from APR-001)', () => {
    expect(css).toContain('.notif-log-toolbar');
    expect(css).toContain('.notif-log-toolbar-right');
  });
});

// ═══════════════════════════════════════════════════════════
// 5. BUILD & VERSION
// ═══════════════════════════════════════════════════════════
describe('5. Build & Version', () => {
  it('migration file exists', () => {
    expect(exists('supabase/migrations/v8.47-apr002-notification-log-archive.sql')).toBe(true);
  });

  it('notification-center.js exists', () => {
    expect(exists('js/notification-center.js')).toBe(true);
  });

  it('pod-team-manifest.md has all 5 Pod 4 roles', () => {
    const manifest = read('docs/scaling/pod-team-manifest.md');
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});
