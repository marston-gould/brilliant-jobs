/**
 * FB-APPS-001 Session 1: My Applications Page Restructure
 * Pipeline/Settings top-level tabs, settings summary banner,
 * queue absorption, history removal, settings unwrapped
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const html = readFileSync('dashboard.html', 'utf8');
const appJs = readFileSync('js/app.js', 'utf8');
const applicationsJs = readFileSync('js/applications.js', 'utf8');
const inputCss = readFileSync('src/input.css', 'utf8');
const versionJs = readFileSync('js/version.js', 'utf8');
const distDashboard = readFileSync('dist/dashboard.min.js', 'utf8');

describe('FB-APPS-001 S1: Tab Infrastructure', () => {
  it('has Pipeline/Settings top-level tab bar', () => {
    expect(html).toContain('id="app-top-tab-pipeline"');
    expect(html).toContain('id="app-top-tab-settings"');
    expect(html).toContain('u-tab-bar');
  });

  it('Pipeline tab button calls switchAppTab(pipeline)', () => {
    expect(html).toContain("onclick=\"switchAppTab('pipeline')\"");
  });

  it('Settings tab button calls switchAppTab(settings)', () => {
    expect(html).toContain("onclick=\"switchAppTab('settings')\"");
  });

  it('has #app-tab-pipeline container (default visible)', () => {
    expect(html).toContain('id="app-tab-pipeline"');
    expect(html).not.toMatch(/<div[^>]*id="app-tab-pipeline"[^>]*class="[^"]*u-hidden/);
  });

  it('has #app-tab-settings container (hidden by default)', () => {
    expect(html).toContain('id="app-tab-settings"');
    expect(html).toMatch(/id="app-tab-settings"[^>]*class="u-hidden"/);
  });

  it('Pipeline tab is default active', () => {
    // The pipeline button has 'active' class (class attribute appears before id in HTML)
    const pipelineBtn = html.match(/class="[^"]*app-top-tab[^"]*"[^>]*id="app-top-tab-pipeline"/);
    expect(pipelineBtn).toBeTruthy();
    expect(pipelineBtn[0]).toContain('active');
  });
});

describe('FB-APPS-001 S1: Old Structure Removed', () => {
  it('Queue|Pipeline|History sub-tabs removed', () => {
    // Old sub-tab bar with data-panel="queue", data-panel="pipeline", data-panel="history"
    // Should NOT exist inside page-applications anymore
    const appsSection = html.slice(html.indexOf('id="page-applications"'), html.indexOf('id="page-notifications"'));
    expect(appsSection).not.toContain('data-panel="queue"');
    expect(appsSection).not.toContain('data-panel="history"');
    // data-panel="pipeline" should not exist as an app-flow-tab
    expect(appsSection).not.toMatch(/app-flow-tab[^>]*data-panel="pipeline"/);
  });

  it('panel-queue removed (absorbed into Pipeline tab)', () => {
    expect(html).not.toContain('id="panel-queue"');
  });

  it('panel-history removed', () => {
    expect(html).not.toContain('id="panel-history"');
  });

  it('panel-pipeline wrapper removed (content promoted)', () => {
    expect(html).not.toContain('id="panel-pipeline"');
  });

  it('app-mode-details <details> removed', () => {
    expect(html).not.toContain('id="app-mode-details"');
  });

  it('score-gate-details <details> removed', () => {
    expect(html).not.toContain('id="score-gate-details"');
  });

  it('app-advanced-settings <details> removed', () => {
    expect(html).not.toContain('id="app-advanced-settings"');
  });
});

describe('FB-APPS-001 S1: Settings Summary Banner', () => {
  it('has settings summary banner element', () => {
    expect(html).toContain('id="app-settings-summary"');
    expect(html).toContain('class="app-settings-summary"');
  });

  it('banner has mode display', () => {
    expect(html).toContain('id="app-summary-mode"');
  });

  it('banner has score gate display (conditional)', () => {
    expect(html).toContain('id="app-summary-gate"');
  });

  it('banner has rules count display (conditional)', () => {
    expect(html).toContain('id="app-summary-rules"');
  });

  it('banner has resume display', () => {
    expect(html).toContain('id="app-summary-resume"');
  });

  it('banner has prompts display', () => {
    expect(html).toContain('id="app-summary-prompts"');
  });

  it('banner has Edit link to Settings tab', () => {
    expect(html).toContain('id="app-summary-edit"');
    expect(html).toContain("switchAppTab('settings')");
  });

  it('banner is clickable (navigates to Settings)', () => {
    expect(html).toMatch(/id="app-settings-summary"[^>]*onclick="switchAppTab\('settings'\)"/);
  });

  it('renderSettingsSummary function exists in app.js', () => {
    expect(appJs).toContain('window.renderSettingsSummary = function()');
  });

  it('renderSettingsSummary reads mode from localStorage', () => {
    expect(appJs).toContain("localStorage.getItem('bj_apply_settings')");
  });

  it('renderSettingsSummary updates all 5 data points', () => {
    expect(appJs).toContain("getElementById('app-summary-mode')");
    expect(appJs).toContain("getElementById('app-summary-gate')");
    expect(appJs).toContain("getElementById('app-summary-rules')");
    expect(appJs).toContain("getElementById('app-summary-resume')");
    expect(appJs).toContain("getElementById('app-summary-prompts')");
  });

  it('renderSettingsSummary has error handling with reportError', () => {
    expect(appJs).toContain("reportError('renderSettingsSummary'");
  });
});

describe('FB-APPS-001 S1: Queue Absorption', () => {
  it('has queue absorption section in Pipeline tab', () => {
    expect(html).toContain('id="app-queue-section"');
  });

  it('queue section hidden by default (display:none)', () => {
    expect(html).toMatch(/id="app-queue-section"[^>]*style="display:none;"/);
  });

  it('queue section has badge for count', () => {
    expect(html).toContain('id="app-queue-badge"');
  });

  it('queue table preserved (app-queue-table)', () => {
    expect(html).toContain('id="app-queue-table"');
    expect(html).toContain('id="app-queue-body"');
  });

  it('Process Queue button preserved', () => {
    expect(html).toContain('id="a-process-queue"');
  });

  it('Manual Add button preserved', () => {
    expect(html).toContain('id="a-add-manual"');
  });

  it('updateQueueSectionVisibility function exists', () => {
    expect(appJs).toContain('window.updateQueueSectionVisibility = function()');
  });

  it('applications.js calls updateQueueSectionVisibility after stat update', () => {
    expect(applicationsJs).toContain('updateQueueSectionVisibility');
  });

  it('stat cards preserved (Queued, Pending, Submitted, Failed)', () => {
    expect(html).toContain('id="a-queued"');
    expect(html).toContain('id="a-pending"');
    expect(html).toContain('id="a-submitted"');
    expect(html).toContain('id="a-failed"');
  });
});

describe('FB-APPS-001 S1: Pipeline Content Promoted', () => {
  it('pipeline stages exist in app-tab-pipeline', () => {
    const pipelineTab = html.slice(html.indexOf('id="app-tab-pipeline"'), html.indexOf('<!-- /app-tab-pipeline -->'));
    expect(pipelineTab).toContain('id="pl-stages-container"');
  });

  it('all 9 pipeline stages present', () => {
    const stages = ['saved', 'applied', 'posting_closed', 'responded', 'interview', 'offer', 'rejected', 'hired', 'archived'];
    stages.forEach(stage => {
      expect(html).toContain(`data-stage="${stage}"`);
    });
  });

  it('pipeline filter bar preserved', () => {
    expect(html).toContain('id="pl-filter-select"');
  });

  it('manual add form preserved', () => {
    expect(html).toContain('id="pl-manual-add"');
  });

  it('pipeline stat cards preserved', () => {
    expect(html).toContain('id="p-total"');
    expect(html).toContain('id="p-active"');
    expect(html).toContain('id="p-response"');
    expect(html).toContain('id="p-avg-days"');
  });
});

describe('FB-APPS-001 S1: Settings Tab Content', () => {
  it('Application Mode card in Settings tab', () => {
    expect(html).toContain('id="app-mode-card"');
  });

  it('6 mode buttons present', () => {
    expect(html).toContain('data-mode="manual"');
    expect(html).toContain('data-mode="score_gated"');
    expect(html).toContain('data-mode="auto"');
    expect(html).toContain('data-mode="score_gated_auto"');
    expect(html).toContain('data-mode="auto_rewrite"');
    expect(html).toContain('data-mode="autopilot"');
  });

  it('Score Gate card in Settings tab', () => {
    expect(html).toContain('id="score-gate-card"');
  });

  it('Score threshold slider preserved', () => {
    expect(html).toContain('id="fas-threshold"');
    expect(html).toContain('id="fas-threshold-val"');
  });

  it('Approval Settings visible (not u-hidden)', () => {
    expect(html).toContain('id="approval-settings"');
    expect(html).not.toMatch(/id="approval-settings"[^>]*u-hidden/);
  });

  it('Auto-Apply Rules section present', () => {
    expect(html).toContain('Auto-Apply Rules');
    expect(html).toContain('id="auto-rules-list"');
  });

  it('Resume Assignment section present', () => {
    expect(html).toContain('Resume Assignment');
    expect(html).toContain('id="resume-assign-default"');
  });

  it('Pipeline Intelligence section present', () => {
    expect(html).toContain('Pipeline Intelligence');
    expect(html).toContain('id="pi-smart-prompts"');
  });

  it('Save Pipeline Settings button present', () => {
    expect(html).toContain('id="pi-save-btn"');
    expect(html).toContain('savePipelineIntelligenceSettings()');
  });

  it('all settings sections render directly (no <details> wrapper)', () => {
    const settingsTab = html.slice(html.indexOf('id="app-tab-settings"'), html.indexOf('<!-- /app-tab-settings -->'));
    // The settings tab should not contain any <details> wrapping the main sections
    // (Pipeline Intelligence still has inner <details> for cadences/advanced — that's fine)
    expect(settingsTab).not.toContain('id="app-advanced-settings"');
  });
});

describe('FB-APPS-001 S1: switchAppTab Rewrite', () => {
  it('switchAppTab handles pipeline tab', () => {
    expect(appJs).toContain("getElementById('app-tab-pipeline')");
    expect(appJs).toContain("getElementById('app-tab-settings')");
  });

  it('switchAppTab migrates legacy values', () => {
    expect(appJs).toContain("if (panel === 'board' || panel === 'queue' || panel === 'history') panel = 'pipeline'");
  });

  it('switchAppTab toggles top-level tab buttons', () => {
    expect(appJs).toContain("getElementById('app-top-tab-pipeline')");
    expect(appJs).toContain("getElementById('app-top-tab-settings')");
  });

  it('switchAppTab shows/hides settings summary banner', () => {
    expect(appJs).toContain("getElementById('app-settings-summary')");
  });

  it('switchAppTab calls renderSettingsSummary on pipeline tab', () => {
    expect(appJs).toContain("renderSettingsSummary()");
  });

  it('switchAppTab controls score gate card visibility on settings tab', () => {
    expect(appJs).toContain("getElementById('score-gate-card')");
  });

  it('switchAppTab persists to localStorage', () => {
    expect(appJs).toContain("localStorage.setItem('bj_app_tab', panel)");
  });
});

describe('FB-APPS-001 S1: CSS', () => {
  it('settings summary banner CSS added', () => {
    expect(inputCss).toContain('.app-settings-summary');
    expect(inputCss).toContain('.app-settings-summary-items');
    expect(inputCss).toContain('.app-summary-mode');
    expect(inputCss).toContain('.app-summary-dot');
    expect(inputCss).toContain('.app-summary-edit');
  });

  it('top-level tab override CSS added', () => {
    expect(inputCss).toContain('.app-top-tab');
  });
});

describe('FB-APPS-001 S1: BJ Namespace + Window Exports', () => {
  it('renderSettingsSummary in BJ namespace exports', () => {
    expect(appJs).toContain("'renderSettingsSummary'");
  });

  it('updateQueueSectionVisibility in BJ namespace exports', () => {
    expect(appJs).toContain("'updateQueueSectionVisibility'");
  });

  it('switchAppTab still exported', () => {
    expect(appJs).toContain("'switchAppTab'");
  });
});

describe('FB-APPS-001 S1: Build & Version', () => {
  it('version is v8.96', () => {
    expect(versionJs).toContain('v8.96');
  });

  it('dist bundle rebuilt with new code', () => {
    expect(distDashboard).toContain('renderSettingsSummary');
    expect(distDashboard).toContain('app-tab-pipeline');
    expect(distDashboard).toContain('updateQueueSectionVisibility');
  });

  it('styles.css rebuilt', () => {
    const css = readFileSync('styles.css', 'utf8');
    expect(css).toContain('app-settings-summary');
  });
});

describe('FB-APPS-001 S1: Notification Center Unaffected', () => {
  it('NC sub-tabs still use app-flow-tab pattern', () => {
    const ncSection = html.slice(html.indexOf('id="page-notifications"'));
    expect(ncSection).toContain('id="nc-tabs"');
    expect(ncSection).toContain('data-panel="nc-preferences"');
    expect(ncSection).toContain('data-panel="nc-log"');
  });

  it('initTabGroup still called for notifications', () => {
    expect(appJs).toContain("initTabGroup('#page-notifications')");
  });
});
