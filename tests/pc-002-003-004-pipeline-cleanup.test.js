/**
 * PC-002/003/004 — Pipeline Consolidation Cleanup, Deep Links, Final Deploy
 *
 * PC-002: JS cleanup (stale comments, dead code, nav pulse enhancement)
 * PC-003: Deep link testing (ghost/pipeline redirects, tab migration)
 * PC-004: Final deploy verification (version, bundles, three-file close)
 *
 * Session: 2026-03-14
 * Pod Team: Lead Platform Eng + Forward-Looking Dev (primary)
 *           Chief Architect + Evolvability Strategist (reviewers)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

// ─────────────────────────────────────────────────────────────
// Section 1: PC-002 — Stale Comment Cleanup (pipeline.js)
// ─────────────────────────────────────────────────────────────
describe('PC-002 — pipeline.js comment cleanup', () => {
  const src = read('js/pipeline.js');

  it('no "Overlay Pipeline S2" comments remain', () => {
    expect(src).not.toContain('Overlay Pipeline S2');
  });

  it('no "S10:" comments remain', () => {
    expect(src).not.toContain('S10:');
  });

  it('no "Dual-write" comments remain', () => {
    expect(src).not.toContain('Dual-write');
  });

  it('PC-002 comment present on pipeline table cache declaration', () => {
    expect(src).toContain('PC-002: consolidated');
  });

  it('PC-002 comment present on loadNewPipelineFromSupabase init call', () => {
    expect(src).toContain('PC-002: pipeline table load on init');
  });

  it('Board view section headers use current naming', () => {
    expect(src).toContain('Load pipeline table into memory (Board view)');
    expect(src).toContain('Write to pipeline table (Board view)');
    expect(src).toContain('Get pipeline row by source_url (Board view)');
  });

  it('pipeline.js still exports core functions', () => {
    expect(src).toContain('loadPipelineFromSupabase');
    expect(src).toContain('loadNewPipelineFromSupabase');
    expect(src).toContain('saveToNewPipeline');
    expect(src).toContain('getNewPipelineEntry');
    expect(src).toContain('renderPipeline');
    expect(src).toContain('savePipelineEntry');
  });

  it('_newPipelineCache exposed on window for SPA bridge', () => {
    expect(src).toContain('window._newPipelineCache');
    expect(src).toContain('window._newPipelineLoaded');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 2: PC-002 — Nav Pulse Enhancement (applications.js)
// ─────────────────────────────────────────────────────────────
describe('PC-002 — stale pipeline nav pulse', () => {
  const src = read('js/applications.js');

  it('checkNavPulses queries user_pipeline for stale items', () => {
    expect(src).toContain("from('user_pipeline')");
    expect(src).toContain('staleThreshold');
  });

  it('stale check uses 7-day threshold', () => {
    expect(src).toMatch(/7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });

  it('stale check filters active stages only', () => {
    expect(src).toContain("'applied'");
    expect(src).toContain("'responded'");
    expect(src).toContain("'interview'");
    expect(src).toContain('activeStages');
  });

  it('pulse triggers on staleItems > 0 OR pendingActions > 0', () => {
    expect(src).toContain('pendingActions > 0 || staleItems > 0');
  });

  it('PC-002 comment present on stale pipeline check', () => {
    expect(src).toContain('PC-002');
  });

  it('still checks notification_actions for pending', () => {
    expect(src).toContain("from('notification_actions')");
    expect(src).toContain("eq('status', 'pending')");
  });

  it('still checks new jobs for feed pulse', () => {
    expect(src).toContain('bj_last_feed_view');
    expect(src).toContain('newJobs > 25');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 3: PC-002 — Dead Pipeline Nav Handler Removal (app.js)
// ─────────────────────────────────────────────────────────────
describe('PC-002 — dead pipeline nav handler removed (app.js)', () => {
  const src = read('js/app.js');

  it('no standalone pipeline tab handler in nav click (initPipeline block)', () => {
    // The old code had: if (_tab === 'pipeline') { initPipeline()...
    // This should be gone — pipeline is now handled via Applications tab
    expect(src).not.toMatch(/if\s*\(\s*_tab\s*===\s*['"]pipeline['"]\s*\)\s*\{[\s\S]*?initPipeline/);
  });

  it('pipeline removed from skeleton exclusion list', () => {
    // The skeleton hide exclusion should NOT include pipeline
    const match = src.match(/\[.*'stats'.*'applications'.*\]\.includes\(_tab\)/);
    expect(match).toBeTruthy();
    expect(match[0]).not.toContain("'pipeline'");
  });

  it('ghost redirect to applications still present', () => {
    expect(src).toContain("if (lastTab === 'ghost')");
    expect(src).toContain("localStorage.setItem('bj_active_tab', 'applications')");
  });

  it('pipeline lastTab redirect to applications still present', () => {
    expect(src).toContain("if (lastTab === 'pipeline')");
  });

  it('ghost nav click redirect still present', () => {
    expect(src).toContain("if (_tab === 'ghost')");
    expect(src).toContain('FB-GHOST-BADGE-001');
  });

  it('hero card navigates to Applications > Pipeline tab', () => {
    expect(src).toContain("switchAppTab('pipeline')");
    expect(src).toContain('j-saved-card');
  });

  it('showPage / switchPage still defined', () => {
    expect(src).toContain('window.showPage');
    expect(src).toContain('window.switchPage');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 4: PC-003 — Deep Link / Tab Migration Testing
// ─────────────────────────────────────────────────────────────
describe('PC-003 — deep link and tab migration', () => {
  const appJs = read('js/app.js');

  it('switchAppTab migrates board → pipeline', () => {
    expect(appJs).toMatch(/panel\s*===?\s*['"]board['"]/);
    expect(appJs).toContain("panel = 'pipeline'");
  });

  it('switchAppTab migrates queue → pipeline', () => {
    expect(appJs).toMatch(/panel\s*===?\s*['"]queue['"]/);
  });

  it('switchAppTab migrates history → pipeline', () => {
    expect(appJs).toMatch(/panel\s*===?\s*['"]history['"]/);
  });

  it('switchAppTab defaults to pipeline for unknown values', () => {
    expect(appJs).toContain("if (panel !== 'pipeline' && panel !== 'settings') panel = 'pipeline'");
  });

  it('switchAppTab persists to localStorage bj_app_tab', () => {
    expect(appJs).toContain("localStorage.setItem('bj_app_tab', panel)");
  });

  it('applications tab init reads saved app tab', () => {
    expect(appJs).toContain("localStorage.getItem('bj_app_tab')");
  });

  it('no page-pipeline element referenced in dashboard.html', () => {
    const html = read('dashboard.html');
    expect(html).not.toContain('id="page-pipeline"');
    expect(html).not.toContain('data-page="pipeline"');
  });

  it('no page-ghost element in dashboard.html', () => {
    const html = read('dashboard.html');
    expect(html).not.toContain('id="page-ghost"');
    expect(html).not.toContain('data-page="ghost"');
  });

  it('pipeline-overlay-tab.js deleted', () => {
    expect(existsSync(resolve(ROOT, 'js/pipeline-overlay-tab.js'))).toBe(false);
  });

  it('no pipeline-overlay-tab references in build.js', () => {
    const build = read('build.js');
    expect(build).not.toContain('pipeline-overlay-tab');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 5: PC-003 — Tab Architecture Validation
// ─────────────────────────────────────────────────────────────
describe('PC-003 — 2-tab architecture (Pipeline|Settings)', () => {
  const html = read('dashboard.html');
  const appJs = read('js/app.js');

  it('Pipeline tab button exists', () => {
    expect(html).toContain('app-top-tab-pipeline');
  });

  it('Settings tab button exists', () => {
    expect(html).toContain('app-top-tab-settings');
  });

  it('Pipeline tab content panel exists', () => {
    expect(html).toContain('app-tab-pipeline');
  });

  it('Settings tab content panel exists', () => {
    expect(html).toContain('app-tab-settings');
  });

  it('switchAppTab toggles pipeline and settings panels', () => {
    expect(appJs).toContain("getElementById('app-tab-pipeline')");
    expect(appJs).toContain("getElementById('app-tab-settings')");
  });

  it('settings summary banner shows on Pipeline tab only', () => {
    expect(appJs).toContain('app-settings-summary');
    expect(appJs).toContain("(panel === 'pipeline')");
  });

  it('score gate visibility controlled by mode in Settings tab', () => {
    expect(appJs).toContain('score-gate-card');
    expect(appJs).toContain('scoreGateModes');
  });

  it('renderSettingsSummary called on pipeline tab switch', () => {
    expect(appJs).toContain('renderSettingsSummary');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 6: PC-004 — Pod Team Manifest
// ─────────────────────────────────────────────────────────────
describe('PC-004 — pod team manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('PC-002 pairing assignment present', () => {
    expect(manifest).toContain('PC-002');
  });

  it('PC-003 pairing assignment present', () => {
    expect(manifest).toContain('PC-003');
  });

  it('PC-004 pairing assignment present', () => {
    expect(manifest).toContain('PC-004');
  });

  it('all 5 Pod 4 roles present', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect — Scalability');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });

  it('last-updated reflects current session', () => {
    expect(manifest).toContain('PC-002/003/004');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 7: PC-004 — Version & Build Verification
// ─────────────────────────────────────────────────────────────
describe('PC-004 — version and build', () => {
  it('BJ_VERSION is v9.16', () => {
    const version = read('js/version.js');
    expect(version).toContain('v9.16');
  });

  it('dist/dashboard.min.js exists', () => {
    expect(existsSync(resolve(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  it('dist/dashboard-deferred.min.js exists', () => {
    expect(existsSync(resolve(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });

  it('dist/admin.min.js exists', () => {
    expect(existsSync(resolve(ROOT, 'dist/admin.min.js'))).toBe(true);
  });

  it('styles.css exists', () => {
    expect(existsSync(resolve(ROOT, 'styles.css'))).toBe(true);
  });

  it('dashboard.min.js contains v9.16', () => {
    const dist = read('dist/dashboard.min.js');
    expect(dist).toContain('v9.16');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 8: PC-004 — Three-File Close Verification
// ─────────────────────────────────────────────────────────────
describe('PC-004 — three-file close', () => {
  it('ROADMAP.md contains PC-002/003/004 with ✅', () => {
    const roadmap = read('ROADMAP.md');
    expect(roadmap).toMatch(/PC-002.*✅|PC-002\/003\/004.*✅/);
  });

  it('roadmap.html contains PC-002/003/004 as done', () => {
    const html = read('roadmap.html');
    expect(html).toMatch(/PC-002|pc-002/i);
    expect(html).toContain("s: 'done'");
  });

  it('HANDOFF.md updated with PC-002/003/004 completion', () => {
    const handoff = read('HANDOFF.md');
    expect(handoff).toContain('PC-002');
  });
});

// ─────────────────────────────────────────────────────────────
// Section 9: File Inventory
// ─────────────────────────────────────────────────────────────
describe('PC-002/003/004 — file inventory', () => {
  const expectedModified = [
    'js/pipeline.js',
    'js/applications.js',
    'js/app.js',
    'docs/scaling/pod-team-manifest.md',
    'js/version.js',
  ];

  expectedModified.forEach(f => {
    it(`${f} exists`, () => {
      expect(existsSync(resolve(ROOT, f))).toBe(true);
    });
  });

  it('test file exists', () => {
    expect(existsSync(resolve(ROOT, 'tests/pc-002-003-004-pipeline-cleanup.test.js'))).toBe(true);
  });
});
