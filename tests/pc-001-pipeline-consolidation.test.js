/**
 * PC-001 — Pipeline + My Applications Consolidation (Phase 1 + Phase 2)
 * Validates: dead code removal, sub-tab restructure, Board default, Settings rename
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const dashHTML = readFileSync('dashboard.html', 'utf-8');
const appJS = readFileSync('js/app.js', 'utf-8');
const buildJS = readFileSync('build.js', 'utf-8');

// === Section 1: Dead Code Removal (Phase 1) ===
describe('PC-001 Phase 1: Dead Code Removal', () => {
  it('page-pipeline div is completely removed from DOM', () => {
    expect(dashHTML).not.toContain('id="page-pipeline"');
    expect(dashHTML).not.toContain('<!-- ============ PIPELINE ============ -->');
  });

  it('pipeline nav item is removed from sidebar', () => {
    expect(dashHTML).not.toContain('data-page="pipeline"');
  });

  it('Legacy/Overlay toggle buttons are removed', () => {
    expect(dashHTML).not.toContain('pl-view-btn-legacy');
    expect(dashHTML).not.toContain('pl-view-btn-overlay');
    expect(dashHTML).not.toContain('switchPipelineView');
  });

  it('pl-view-legacy and pl-view-overlay divs are removed', () => {
    expect(dashHTML).not.toContain('id="pl-view-legacy"');
    expect(dashHTML).not.toContain('id="pl-view-overlay"');
  });

  it('pipeline-overlay-tab.js is deleted', () => {
    expect(existsSync('js/pipeline-overlay-tab.js')).toBe(false);
  });

  it('pipeline-overlay-tab.js is removed from build.js', () => {
    expect(buildJS).not.toContain('pipeline-overlay-tab.js');
  });

  it('no JS references to page-pipeline remain', () => {
    expect(appJS).not.toContain('page-pipeline');
  });

  it('no JS references to switchPipelineView remain', () => {
    expect(appJS).not.toContain('switchPipelineView');
  });

  it('no switchAppView references remain (replaced by switchAppTab)', () => {
    expect(appJS).not.toContain('switchAppView');
  });
});

// === Section 2: List/Board Toggle Removal ===
describe('PC-001 Phase 2a: List/Board Toggle Removal', () => {
  it('List/Board toggle buttons are removed from applications', () => {
    expect(dashHTML).not.toContain('id="app-view-list"');
    expect(dashHTML).not.toContain('id="app-view-board"');
    // The switchAppView toggle within applications is removed
    const appSection = dashHTML.slice(
      dashHTML.indexOf('id="page-applications"'),
      dashHTML.indexOf('id="page-notifications"') > 0 ?
        dashHTML.indexOf('id="page-notifications"') :
        dashHTML.indexOf('id="page-ghost"')
    );
    expect(appSection).not.toContain("switchAppView");
  });

  it('app-view-list-panel wrapper is removed', () => {
    expect(dashHTML).not.toContain('app-view-list-panel');
  });

  it('app-view-board-panel is removed (replaced by panel-board)', () => {
    expect(dashHTML).not.toContain('app-view-board-panel');
    expect(dashHTML).not.toContain('pl-stages-container-board');
  });
});

// === Section 3: Sub-Tab Restructure ===
describe('PC-001 Phase 2b: Sub-Tab Restructure', () => {
  it('Board sub-tab exists and is first', () => {
    expect(dashHTML).toContain('data-panel="board"');
    const boardIdx = dashHTML.indexOf('data-panel="board"');
    const queueIdx = dashHTML.indexOf('data-panel="queue"');
    expect(boardIdx).toBeLessThan(queueIdx);
  });

  it('Queue sub-tab exists', () => {
    expect(dashHTML).toContain('data-panel="queue"');
  });

  it('History sub-tab exists', () => {
    expect(dashHTML).toContain('data-panel="history"');
  });

  it('Settings sub-tab exists (renamed from Rules & Settings)', () => {
    expect(dashHTML).toContain('data-panel="settings"');
    expect(dashHTML).not.toContain('data-panel="rules"');
  });

  it('Notifications redirect sub-tab is removed', () => {
    const appSection = dashHTML.slice(
      dashHTML.indexOf('id="page-applications"'),
      dashHTML.indexOf('id="page-notifications"')
    );
    expect(appSection).not.toContain('data-panel="notifications"');
  });

  it('panel-board exists as default active panel', () => {
    expect(dashHTML).toContain('id="panel-board"');
    // Check it has the active class
    const boardPanel = dashHTML.match(/class="app-flow-panel[^"]*"[^>]*id="panel-board"/);
    expect(boardPanel).not.toBeNull();
    expect(dashHTML).toMatch(/class="app-flow-panel active" id="panel-board"/);
  });

  it('panel-settings exists (renamed from panel-rules)', () => {
    expect(dashHTML).toContain('id="panel-settings"');
    expect(dashHTML).not.toContain('id="panel-rules"');
  });

  it('panel-notifications is removed from applications', () => {
    expect(dashHTML).not.toContain('id="panel-notifications"');
  });
});

// === Section 4: Board Panel Content ===
describe('PC-001 Phase 2c: Board Panel Has Pipeline Content', () => {
  it('Board panel has pipeline stat cards (p-total, p-active, p-response, p-avg-days)', () => {
    const boardSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-board"'),
      dashHTML.indexOf('id="panel-queue"')
    );
    expect(boardSection).toContain('id="p-total"');
    expect(boardSection).toContain('id="p-active"');
    expect(boardSection).toContain('id="p-response"');
    expect(boardSection).toContain('id="p-avg-days"');
  });

  it('Board panel has pipeline stages container', () => {
    const boardSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-board"'),
      dashHTML.indexOf('id="panel-queue"')
    );
    expect(boardSection).toContain('id="pl-stages-container"');
  });

  it('Board panel has all 9 pipeline stage sections', () => {
    const boardSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-board"'),
      dashHTML.indexOf('id="panel-queue"')
    );
    const stages = ['saved', 'applied', 'posting_closed', 'responded', 'interview', 'offer', 'rejected', 'hired', 'archived'];
    stages.forEach(stage => {
      expect(boardSection).toContain(`data-stage="${stage}"`);
      expect(boardSection).toContain(`id="pb-${stage}"`);
      expect(boardSection).toContain(`id="pc-${stage}"`);
    });
  });

  it('Board panel has filter bar with pl-filter-select', () => {
    const boardSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-board"'),
      dashHTML.indexOf('id="panel-queue"')
    );
    expect(boardSection).toContain('id="pl-filter-select"');
  });

  it('Board panel has manual add form', () => {
    const boardSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-board"'),
      dashHTML.indexOf('id="panel-queue"')
    );
    expect(boardSection).toContain('id="pl-manual-add"');
    expect(boardSection).toContain('id="pl-man-title"');
  });
});

// === Section 5: Queue Panel ===
describe('PC-001: Queue Panel', () => {
  it('Queue panel has its own stat cards', () => {
    const queueSection = dashHTML.slice(
      dashHTML.indexOf('id="panel-queue"'),
      dashHTML.indexOf('id="panel-history"') > 0 ?
        dashHTML.indexOf('id="panel-history"') :
        dashHTML.indexOf('id="panel-settings"')
    );
    expect(queueSection).toContain('id="a-queued"');
    expect(queueSection).toContain('id="a-pending"');
    expect(queueSection).toContain('id="a-submitted"');
    expect(queueSection).toContain('id="a-failed"');
  });
});

// === Section 6: Pending Applications Panel ===
describe('PC-001: Pending Applications', () => {
  it('Pending applications panel exists above sub-tabs', () => {
    const pendingIdx = dashHTML.indexOf('id="pending-apps-panel"');
    const tabsIdx = dashHTML.indexOf('class="app-flow-tabs"');
    expect(pendingIdx).toBeGreaterThan(0);
    expect(tabsIdx).toBeGreaterThan(0);
    expect(pendingIdx).toBeLessThan(tabsIdx);
  });
});

// === Section 7: JS Tab Switching ===
describe('PC-001: JS Tab Switching', () => {
  it('switchAppTab function exists in app.js', () => {
    expect(appJS).toContain('window.switchAppTab');
  });

  it('switchAppTab is registered in BJ namespace', () => {
    expect(appJS).toContain("'switchAppTab'");
  });

  it('Board is default tab (falls back to board)', () => {
    expect(appJS).toContain("|| 'board'");
  });

  it('switchAppTab triggers renderPipeline for board view', () => {
    expect(appJS).toContain("panel === 'board' && typeof renderPipeline === 'function'");
  });

  it('Tab state persists to localStorage as bj_app_tab', () => {
    expect(appJS).toContain("localStorage.setItem('bj_app_tab'");
    expect(appJS).toContain("localStorage.getItem('bj_app_tab')");
  });
});

// === Section 8: Hero Card Navigation ===
describe('PC-001: Hero Card Navigation', () => {
  it('j-saved-card navigates to My Applications (not Pipeline)', () => {
    expect(appJS).toContain('page-applications');
    expect(appJS).toContain("switchAppTab('board')");
    // Should NOT reference page-pipeline
    const savedCardBlock = appJS.slice(
      appJS.indexOf("j-saved-card"),
      appJS.indexOf("j-saved-card") + 500
    );
    expect(savedCardBlock).not.toContain('page-pipeline');
    expect(savedCardBlock).toContain('page-applications');
  });
});

// === Section 9: No Duplicate IDs ===
describe('PC-001: DOM Integrity', () => {
  it('no duplicate pipeline stat IDs (p-total appears exactly once)', () => {
    const matches = dashHTML.match(/id="p-total"/g);
    expect(matches).toHaveLength(1);
  });

  it('no duplicate pipeline stat IDs (p-active appears exactly once)', () => {
    const matches = dashHTML.match(/id="p-active"/g);
    expect(matches).toHaveLength(1);
  });

  it('no duplicate filter select IDs', () => {
    const matches = dashHTML.match(/id="pl-filter-select"/g);
    expect(matches).toHaveLength(1);
  });
});

// === Section 10: Build & Version ===
describe('PC-001: Build & Version', () => {
  it('dashboard.min.js exists (rebuilt)', () => {
    expect(existsSync('dist/dashboard.min.js')).toBe(true);
  });

  it('dashboard-deferred.min.js exists (rebuilt)', () => {
    expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
  });

  it('version.js contains v8.77', () => {
    const version = readFileSync('js/version.js', 'utf-8');
    expect(version).toContain('8.77');
  });

  it('pipeline.js still exists (powers Board view)', () => {
    expect(existsSync('js/pipeline.js')).toBe(true);
  });

  it('pipeline chunk in build.js has only pipeline.js', () => {
    const pipelineChunk = buildJS.match(/pipeline:\s*\[([\s\S]*?)\]/);
    expect(pipelineChunk).not.toBeNull();
    expect(pipelineChunk[1]).toContain('pipeline.js');
    expect(pipelineChunk[1]).not.toContain('pipeline-overlay-tab.js');
  });
});
