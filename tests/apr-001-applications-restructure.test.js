/**
 * APR-001 — Applications + Notifications Page Restructure
 * Validation tests for fixes A1–A6
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync('dashboard.html', 'utf8');
const css = readFileSync('src/input.css', 'utf8');
const appJs = readFileSync('js/app.js', 'utf8');
const applicationsJs = readFileSync('js/applications.js', 'utf8');
const manifest = readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');

// ── Section 1: A1 — Tab System CSS ──
describe('A1: Tab system CSS', () => {
  it('has .app-flow-tabs flex container', () => {
    expect(css).toContain('.app-flow-tabs');
    expect(css).toMatch(/\.app-flow-tabs\s*\{[^}]*display:\s*flex/);
  });
  it('has .app-flow-tab with cursor pointer + active state', () => {
    expect(css).toContain('.app-flow-tab');
    expect(css).toMatch(/\.app-flow-tab\.active\s*\{/);
  });
  it('has .app-flow-panel hidden by default + active visible', () => {
    expect(css).toMatch(/\.app-flow-panel\s*\{[^}]*display:\s*none/);
    expect(css).toMatch(/\.app-flow-panel\.active\s*\{[^}]*display:\s*block/);
  });
});

// ── Section 2: A1 — Tab System JS ──
describe('A1: Tab system JS', () => {
  it('has initTabGroup function', () => {
    expect(appJs).toContain('window.initTabGroup');
  });
  it('initTabGroup scopes to parent .page element', () => {
    expect(appJs).toContain("this.closest('.page')");
  });
  it('calls initTabGroup for notifications page', () => {
    expect(appJs).toContain("initTabGroup('#page-notifications')");
  });
  it('has switchAppTab function', () => {
    expect(appJs).toContain('window.switchAppTab');
  });
  it('switchAppTab migrates legacy board → pipeline', () => {
    expect(appJs).toMatch(/panel\s*===\s*'board'\)\s*panel\s*=\s*'pipeline'/);
  });
  it('switchAppTab migrates legacy settings → queue', () => {
    expect(appJs).toMatch(/panel\s*===\s*'settings'\)\s*panel\s*=\s*'queue'/);
  });
});

// ── Section 3: A2 — Pending Applications panel removed ──
describe('A2: Pending Applications panel removed', () => {
  it('no pending-apps-panel in dashboard.html', () => {
    expect(html).not.toContain('id="pending-apps-panel"');
  });
  it('no pending-apps-count in dashboard.html', () => {
    expect(html).not.toContain('id="pending-apps-count"');
  });
  it('no pending-apps-body in dashboard.html', () => {
    expect(html).not.toContain('id="pending-apps-body"');
  });
});

// ── Section 4: A3 — Application Mode + Score Gate at top ──
describe('A3: Application Mode + Score Gate promoted', () => {
  it('Application Mode in collapsible details', () => {
    expect(html).toContain('id="app-mode-details"');
    expect(html).toContain('class="app-config-section"');
  });
  it('Application Mode has summary badge', () => {
    expect(html).toContain('id="app-mode-label"');
  });
  it('Score Gate in collapsible details', () => {
    expect(html).toContain('id="score-gate-details"');
  });
  it('Score Gate has threshold badge', () => {
    expect(html).toContain('id="score-gate-label"');
  });
  it('app-config-section CSS exists', () => {
    expect(css).toContain('.app-config-section');
    expect(css).toContain('.app-config-summary');
    expect(css).toContain('.app-config-value');
    expect(css).toContain('.app-config-body');
  });
  it('Mode details appears before tabs in HTML order', () => {
    const modeIdx = html.indexOf('id="app-mode-details"');
    const tabsIdx = html.indexOf('id="app-tabs"');
    expect(modeIdx).toBeLessThan(tabsIdx);
  });
  it('Score Gate details appears before tabs in HTML order', () => {
    const sgIdx = html.indexOf('id="score-gate-details"');
    const tabsIdx = html.indexOf('id="app-tabs"');
    expect(sgIdx).toBeLessThan(tabsIdx);
  });
  it('JS has mode label map', () => {
    expect(appJs).toContain("manual: 'Manual'");
    expect(appJs).toContain("autopilot: 'Full Autopilot'");
  });
  it('JS has scoreGateModes visibility array', () => {
    expect(appJs).toContain('scoreGateModes');
    expect(appJs).toContain("'score_gated'");
  });
  it('threshold slider updates score gate label', () => {
    expect(html).toMatch(/fas-threshold.*score-gate-label/);
  });
});

// ── Section 5: A4 — Notification Settings removed from Applications ──
describe('A4: Notification Settings removed', () => {
  it('no Notification Settings card in Applications page', () => {
    // The applications page is between page-applications and page-notifications
    const appStart = html.indexOf('id="page-applications"');
    const appEnd = html.indexOf('id="page-notifications"');
    const appSection = html.substring(appStart, appEnd);
    expect(appSection).not.toContain('Notification Settings');
  });
});

// ── Section 6: A5 — Three proper tabs ──
describe('A5: Queue | Pipeline | History tabs', () => {
  it('has Queue tab', () => {
    expect(html).toContain('data-panel="queue">Queue</div>');
  });
  it('has Pipeline tab', () => {
    expect(html).toContain('data-panel="pipeline">Pipeline</div>');
  });
  it('has History tab', () => {
    expect(html).toContain('data-panel="history">History</div>');
  });
  it('no Board tab', () => {
    expect(html).not.toContain('data-panel="board">Board</div>');
  });
  it('no Settings tab on Applications page', () => {
    const appStart = html.indexOf('id="page-applications"');
    const appEnd = html.indexOf('id="page-notifications"');
    const appSection = html.substring(appStart, appEnd);
    expect(appSection).not.toContain('data-panel="settings">Settings</div>');
  });
  it('panel-pipeline exists (renamed from panel-board)', () => {
    expect(html).toContain('id="panel-pipeline"');
  });
  it('panel-board does not exist', () => {
    expect(html).not.toContain('id="panel-board"');
  });
  it('panel-settings does not exist on Applications page', () => {
    const appStart = html.indexOf('id="page-applications"');
    const appEnd = html.indexOf('id="page-notifications"');
    const appSection = html.substring(appStart, appEnd);
    expect(appSection).not.toContain('id="panel-settings"');
  });
  it('panel-queue is default active', () => {
    expect(html).toContain('class="app-flow-panel active" id="panel-queue"');
  });
  it('Queue tab is default active', () => {
    expect(html).toContain('class="app-flow-tab active" data-panel="queue"');
  });
  it('stat cards above tabs (queued/pending/submitted/failed)', () => {
    const statsIdx = html.indexOf('id="a-queued"');
    const tabsIdx = html.indexOf('id="app-tabs"');
    expect(statsIdx).toBeLessThan(tabsIdx);
    expect(statsIdx).toBeGreaterThan(0);
  });
  it('Advanced Settings details exists below tab panels', () => {
    expect(html).toContain('id="app-advanced-settings"');
    const advIdx = html.indexOf('id="app-advanced-settings"');
    const histIdx = html.indexOf('id="panel-history"');
    expect(advIdx).toBeGreaterThan(histIdx);
  });
  it('Advanced Settings contains Approval Settings', () => {
    const advStart = html.indexOf('id="app-advanced-settings"');
    const pageEnd = html.indexOf('id="page-notifications"');
    const advSection = html.substring(advStart, pageEnd);
    expect(advSection).toContain('Approval Settings');
  });
  it('Advanced Settings contains Auto-Apply Rules', () => {
    const advStart = html.indexOf('id="app-advanced-settings"');
    const pageEnd = html.indexOf('id="page-notifications"');
    const advSection = html.substring(advStart, pageEnd);
    expect(advSection).toContain('Auto-Apply Rules');
  });
  it('Advanced Settings contains Resume Assignment', () => {
    const advStart = html.indexOf('id="app-advanced-settings"');
    const pageEnd = html.indexOf('id="page-notifications"');
    const advSection = html.substring(advStart, pageEnd);
    expect(advSection).toContain('Resume Assignment');
  });
  it('Advanced Settings contains Pipeline Intelligence', () => {
    const advStart = html.indexOf('id="app-advanced-settings"');
    const pageEnd = html.indexOf('id="page-notifications"');
    const advSection = html.substring(advStart, pageEnd);
    expect(advSection).toContain('Pipeline Intelligence');
  });
});

// ── Section 7: A6 — Notification Center subtabs ──
describe('A6: Notification Center subtabs', () => {
  it('has subtab bar with Preferences and Log', () => {
    expect(html).toContain('id="nc-tabs"');
    expect(html).toContain('data-panel="nc-preferences">Preferences</div>');
    expect(html).toContain('data-panel="nc-log">Log</div>');
  });
  it('has panel-nc-preferences', () => {
    expect(html).toContain('id="panel-nc-preferences"');
  });
  it('has panel-nc-log', () => {
    expect(html).toContain('id="panel-nc-log"');
  });
  it('Preferences panel is default active', () => {
    expect(html).toContain('class="app-flow-panel active" id="panel-nc-preferences"');
  });
  it('Preferences panel contains notification matrix', () => {
    const prefStart = html.indexOf('id="panel-nc-preferences"');
    const prefEnd = html.indexOf('id="panel-nc-log"');
    const prefSection = html.substring(prefStart, prefEnd);
    expect(prefSection).toContain('notif-pref-matrix');
  });
  it('Preferences panel contains Phone Verification', () => {
    const prefStart = html.indexOf('id="panel-nc-preferences"');
    const prefEnd = html.indexOf('id="panel-nc-log"');
    const prefSection = html.substring(prefStart, prefEnd);
    expect(prefSection).toContain('Phone Verification');
  });
  it('Preferences panel contains Escalation Rules', () => {
    const prefStart = html.indexOf('id="panel-nc-preferences"');
    const prefEnd = html.indexOf('id="panel-nc-log"');
    const prefSection = html.substring(prefStart, prefEnd);
    expect(prefSection).toContain('Escalation Rules');
  });
  it('Preferences panel contains Filter-Specific Overrides', () => {
    const prefStart = html.indexOf('id="panel-nc-preferences"');
    const prefEnd = html.indexOf('id="panel-nc-log"');
    const prefSection = html.substring(prefStart, prefEnd);
    expect(prefSection).toContain('Filter-Specific Overrides');
  });
  it('Log panel contains notification log table', () => {
    const logStart = html.indexOf('id="panel-nc-log"');
    const logEnd = html.indexOf('end panel-nc-log');
    const logSection = html.substring(logStart, logEnd);
    expect(logSection).toContain('nc-notif-log-table');
  });
  it('notification log NOT in Applications History panel', () => {
    const histStart = html.indexOf('id="panel-history"');
    const histEnd = html.indexOf('id="app-advanced-settings"');
    const histSection = html.substring(histStart, histEnd);
    expect(histSection).not.toContain('Notification Log');
    expect(histSection).not.toContain('notif-log-body');
  });
  it('notification log JS removed from applications.js', () => {
    expect(applicationsJs).not.toContain('function loadNotifLog');
    expect(applicationsJs).not.toContain("$('#nlog-filter-type')");
    expect(applicationsJs).toContain('APR-001: Notification Log removed');
  });
});

// ── Section 8: Hero card navigation ──
describe('Hero card navigation', () => {
  it('hero card navigates to pipeline (not board)', () => {
    expect(appJs).toContain("switchAppTab('pipeline')");
    expect(appJs).not.toMatch(/switchAppTab\('board'\)/);
  });
});

// ── Section 9: Notification Log toolbar CSS ──
describe('Notification Log toolbar CSS', () => {
  it('has .notif-log-toolbar styles', () => {
    expect(css).toContain('.notif-log-toolbar');
    expect(css).toContain('.notif-log-toolbar-right');
  });
});

// ── Section 10: Pod team manifest ──
describe('Pod team manifest', () => {
  it('has APR-001 pairing', () => {
    expect(manifest).toContain('APR-001');
    expect(manifest).toContain('Senior Frontend Eng');
  });
  it('all 5 Pod 4 roles present', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ── Section 11: Build & Version ──
describe('Build & Version', () => {
  const version = readFileSync('js/version.js', 'utf8');
  const distMain = readFileSync('dist/dashboard.min.js', 'utf8');

  it('version.js has v8.79', () => {
    expect(version).toContain('v8.79');
  });
  it('dist bundle contains v8.79', () => {
    expect(distMain).toContain('v8.79');
  });
  it('dashboard.html cache busters at v8.79', () => {
    expect(html).toContain('?v=v8.79');
  });
});

// ── Section 12: File inventory ──
describe('File inventory', () => {
  const files = [
    'dashboard.html', 'src/input.css', 'js/app.js', 'js/applications.js',
    'docs/scaling/pod-team-manifest.md', 'dist/dashboard.min.js',
    'dist/dashboard-deferred.min.js', 'styles.css'
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(() => readFileSync(f, 'utf8')).not.toThrow();
    });
  });
});
