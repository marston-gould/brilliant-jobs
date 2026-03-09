/**
 * UX-001 Session 1: Feed UX Consolidation — Save/Load Unification + Layout Fixes
 * Validates: UX-001 (unified save), UX-002 (header buttons removed), UX-003 (merch placement),
 *            UX-004 (resume generation - already fixed), UX-005 (spacing fix)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');

// ============================================================
// Section 1: UX-001 + UX-002 — Chat header Load/Save buttons removed
// ============================================================
describe('UX-001/002: Unified save/load surface', () => {
  const dashHtml = read('dashboard.html');
  const chatJs = read('js/chat.js');

  it('chat-load-btn removed from dashboard.html', () => {
    expect(dashHtml).not.toContain('id="chat-load-btn"');
    expect(dashHtml).not.toContain('class="chat-load-btn"');
  });

  it('chat-save-btn removed from dashboard.html', () => {
    expect(dashHtml).not.toContain('id="chat-save-btn"');
    expect(dashHtml).not.toContain('class="chat-save-btn"');
  });

  it('chat-clear-btn still present (Clear conversation)', () => {
    expect(dashHtml).toContain('id="chat-clear-btn"');
  });

  it('chat-clear-btn has visible label (not just ✕)', () => {
    expect(dashHtml).toMatch(/chat-clear-btn.*Clear/s);
  });

  it('chat-save-dialog modal removed', () => {
    expect(dashHtml).not.toContain('id="chat-save-dialog"');
    expect(dashHtml).not.toContain('csd-overlay');
    expect(dashHtml).not.toContain('csd-content');
  });

  it('save-prompt-row (inline chat save) still present', () => {
    expect(dashHtml).toContain('id="save-prompt-row"');
    expect(dashHtml).toContain('id="save-prompt-inline-name"');
    expect(dashHtml).toContain('id="save-prompt-inline-go"');
  });

  it('chat.js no longer binds to chat-save-btn', () => {
    expect(chatJs).not.toMatch(/getElementById\(['"]chat-save-btn['"]\)/);
  });

  it('chat.js no longer binds to chat-load-btn', () => {
    expect(chatJs).not.toMatch(/getElementById\(['"]chat-load-btn['"]\)/);
  });

  it('openSaveDialog is a safe redirect to inline row', () => {
    expect(chatJs).toContain('function openSaveDialog()');
    expect(chatJs).toMatch(/openSaveDialog.*save-prompt-row/s);
  });

  it('closeSaveDialog is a safe no-op', () => {
    expect(chatJs).toContain('function closeSaveDialog()');
  });
});

// ============================================================
// Section 2: UX-001 — Chat filter pills populate filter builder
// ============================================================
describe('UX-001: Chat filters populate filter builder pills', () => {
  const chatJs = read('js/chat.js');

  it('applyChatFilters populates whatPills from keywords', () => {
    expect(chatJs).toContain('window.whatPills.push');
    expect(chatJs).toMatch(/filters\.keywords.*whatPills\.push/s);
  });

  it('applyChatFilters populates wherePills from locations', () => {
    expect(chatJs).toContain('window.wherePills.push');
    expect(chatJs).toMatch(/filters\.locations.*wherePills\.push/s);
  });

  it('applyChatFilters handles remote flag', () => {
    expect(chatJs).toMatch(/filters\.remote.*wherePills\.push.*Remote/s);
  });

  it('applyChatFilters populates payPills from salary', () => {
    expect(chatJs).toMatch(/salary_min.*payPills\.push/s);
  });

  it('applyChatFilters populates whoPills from companies', () => {
    expect(chatJs).toMatch(/filters\.companies.*whoPills\.push/s);
  });

  it('applyChatFilters calls renderAllPills after populating', () => {
    expect(chatJs).toContain('renderAllPills()');
  });

  it('pills tagged with source: chat', () => {
    expect(chatJs).toMatch(/source:\s*['"]chat['"]/);
  });
});

// ============================================================
// Section 3: UX-001 — Via Chat badge in saved filters
// ============================================================
describe('UX-001: Via Chat badge', () => {
  const locationJs = read('js/location.js');

  it('commitSaveFilter detects chat-sourced pills', () => {
    expect(locationJs).toMatch(/hasChatPills/);
    expect(locationJs).toMatch(/source\s*===\s*['"]chat['"]/);
  });

  it('commitSaveFilter sets source: chat on filter data', () => {
    expect(locationJs).toMatch(/filterData\.source\s*=\s*['"]chat['"]/);
  });

  it('renderSavedFilters shows via Chat badge', () => {
    expect(locationJs).toContain('via Chat');
    expect(locationJs).toMatch(/sf\.source\s*===\s*['"]chat['"]/);
  });
});

// ============================================================
// Section 4: UX-003 — Merchandising blocks above toggle
// ============================================================
describe('UX-003: Merchandising block placement', () => {
  const dashHtml = read('dashboard.html');

  it('intel-section appears before search-mode-bar in DOM', () => {
    const intelIdx = dashHtml.indexOf('id="intel-section"');
    const toggleIdx = dashHtml.indexOf('id="search-mode-bar"');
    expect(intelIdx).toBeGreaterThan(-1);
    expect(toggleIdx).toBeGreaterThan(-1);
    expect(intelIdx).toBeLessThan(toggleIdx);
  });

  it('intel-section is NOT inside filter-panel-wrap', () => {
    const filterPanelStart = dashHtml.indexOf('id="filter-panel-wrap"');
    const intelIdx = dashHtml.indexOf('id="intel-section"');
    expect(intelIdx).toBeLessThan(filterPanelStart);
  });

  it('Your Market card still present', () => {
    expect(dashHtml).toContain('id="intel-card-insight"');
    expect(dashHtml).toContain('Your Market');
  });

  it('Pro Tip card still present', () => {
    expect(dashHtml).toContain('id="intel-card-merch"');
    expect(dashHtml).toContain('Pro Tip');
  });
});

// ============================================================
// Section 5: UX-004 — Resume generation already fixed (verify)
// ============================================================
describe('UX-004: Resume generation intelligence', () => {
  const locationJs = read('js/location.js');

  it('no alert() for missing resumes (uses modal)', () => {
    // Should use modal, not bare alert
    expect(locationJs).toContain('QA-FIX: Use the modal');
    expect(locationJs).not.toMatch(/alert\(['"]Upload a resume/);
  });

  it('resume picker modal exists', () => {
    expect(locationJs).toContain('Choose a resume to analyze');
  });

  it('zero-resume case shows navigate to Resumes tab', () => {
    expect(locationJs).toContain('Go to Resumes');
  });

  it('upload zone always shown in modal', () => {
    expect(locationJs).toContain('ai-resume-upload-zone');
  });
});

// ============================================================
// Section 6: UX-005 — Saved filter row spacing
// ============================================================
describe('UX-005: Saved filter row spacing', () => {
  const css = read('src/input.css');
  const locationJs = read('js/location.js');

  it('sf-del has min-width: 28px (was 20px)', () => {
    expect(css).toMatch(/\.sf-item\s+\.sf-del\s*\{[^}]*min-width:\s*28px/);
  });

  it('sf-del has margin-right: 8px (was 2px)', () => {
    expect(css).toMatch(/\.sf-item\s+\.sf-del\s*\{[^}]*margin-right:\s*8px/);
  });

  it('sf-right has padding-left for spacing from pills', () => {
    expect(locationJs).toContain('padding-left:8px');
  });
});

// ============================================================
// Section 7: Build output verification
// ============================================================
describe('Build verification', () => {
  it('product version is v8.26', () => {
    const versionJs = read('js/version.js');
    expect(versionJs).toContain('8.26');
  });

  it('dist/dashboard.min.js exists and is not empty', () => {
    const dist = read('dist/dashboard.min.js');
    expect(dist.length).toBeGreaterThan(1000);
  });

  it('dist/dashboard-deferred.min.js exists', () => {
    const dist = read('dist/dashboard-deferred.min.js');
    expect(dist.length).toBeGreaterThan(1000);
  });

  it('styles.css was rebuilt', () => {
    const css = read('styles.css');
    expect(css.length).toBeGreaterThan(1000);
  });
});

// ============================================================
// Section 8: No regressions
// ============================================================
describe('No regressions', () => {
  const dashHtml = read('dashboard.html');
  const chatJs = read('js/chat.js');
  const locationJs = read('js/location.js');

  it('chat panel still present', () => {
    expect(dashHtml).toContain('id="chat-messages"');
    expect(dashHtml).toContain('id="chat-input"');
    expect(dashHtml).toContain('id="chat-send-btn"');
  });

  it('filter builder still present', () => {
    expect(dashHtml).toContain('id="filter-panel-wrap"');
    expect(dashHtml).toContain('id="save-filter-row"');
    expect(dashHtml).toContain('id="save-filter-name"');
  });

  it('saved filters section still present', () => {
    expect(dashHtml).toContain('id="sf-list"');
    expect(dashHtml).toContain('id="saved-filters-section"');
  });

  it('search-mode-toggle still functional', () => {
    expect(dashHtml).toContain('id="search-mode-toggle"');
    expect(dashHtml).toContain('data-mode="filters"');
    expect(dashHtml).toContain('data-mode="chat"');
  });

  it('renderSavedFilters function still intact', () => {
    expect(locationJs).toContain('function renderSavedFilters()');
  });

  it('commitSaveFilter function still intact', () => {
    expect(locationJs).toContain('const filterData = {');
    expect(locationJs).toContain('saveUserData');
  });

  it('chat prompts still render in saved list', () => {
    expect(locationJs).toContain('sf-prompt-separator');
    expect(locationJs).toContain('Chat Prompts');
  });

  it('sendChatMessage still functional', () => {
    expect(chatJs).toContain('async function sendChatMessage');
    expect(chatJs).toContain('applyChatFilters');
  });

  it('applyChatFilters still triggers job feed search', () => {
    expect(chatJs).toContain('debouncedSearchJobs');
    expect(chatJs).toContain('_chatFilterOverride');
  });

  it('ai-filter-cta still present for resume generation', () => {
    expect(dashHtml).toContain('id="ai-suggest-filter-btn"');
    expect(dashHtml).toContain('Generate filters from your resume');
  });

  it('PAYL containers still present', () => {
    expect(dashHtml).toContain('payl-referral-widget');
    expect(dashHtml).toContain('payl-employment-nudge');
  });
});
