/**
 * SCA-REM-S4 — Spec Compliance Remediation Session 4
 * Tests: REM-S09 (PI taxonomy), REM-S12 (pagination keyboard), QA-002 (button centering)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const dashboard = read('dashboard.html');
const jobFeedJs = read('js/job-feed.js');

// ═══════════════════════════════════════════════════════════
// REM-S09: PostHog PI taxonomy documentation
// ═══════════════════════════════════════════════════════════
describe('REM-S09: PostHog PI taxonomy documentation', () => {
  it('taxonomy doc exists', () => {
    expect(existsSync('docs/posthog-pi-taxonomy.md')).toBe(true);
  });

  const doc = read('docs/posthog-pi-taxonomy.md');

  it('documents pipeline_signal_classified event', () => {
    expect(doc).toContain('pipeline_signal_classified');
  });

  it('documents classifier_batch_complete event', () => {
    expect(doc).toContain('classifier_batch_complete');
  });

  it('documents pipeline_stage_auto_moved event', () => {
    expect(doc).toContain('pipeline_stage_auto_moved');
  });

  it('documents pipeline_stage_changed client event', () => {
    expect(doc).toContain('pipeline_stage_changed');
  });

  it('documents signal_detected client event', () => {
    expect(doc).toContain('signal_detected');
  });

  it('documents staleness events', () => {
    expect(doc).toContain('pipeline_staleness_prompt');
    expect(doc).toContain('staleness_prompt_resolved');
    expect(doc).toContain('staleness_prompt_archived');
    expect(doc).toContain('staleness_prompt_snoozed');
  });

  it('documents untracked app events', () => {
    expect(doc).toContain('untracked_app_confirmed');
    expect(doc).toContain('untracked_app_dismissed');
  });

  it('has dashboard recommendations section', () => {
    expect(doc).toContain('Dashboard Recommendations');
    expect(doc).toContain('Key Funnels');
    expect(doc).toContain('Key Metrics');
  });

  it('lists all 19 events', () => {
    expect(doc).toContain('Total events:** 19');
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S12: Keyboard navigation on pagination
// ═══════════════════════════════════════════════════════════
describe('REM-S12: Pagination keyboard navigation', () => {
  it('adds role=navigation to pagination container', () => {
    expect(jobFeedJs).toContain("'role', 'navigation'");
  });

  it('adds aria-label for accessibility', () => {
    expect(jobFeedJs).toContain("'aria-label', 'Job feed pagination'");
  });

  it('listens for ArrowLeft and ArrowRight', () => {
    expect(jobFeedJs).toContain("'ArrowLeft'");
    expect(jobFeedJs).toContain("'ArrowRight'");
  });

  it('moves focus between non-disabled buttons', () => {
    expect(jobFeedJs).toContain("fp-btn:not([disabled])");
    expect(jobFeedJs).toContain('.focus()');
  });

  it('prevents default on arrow keys', () => {
    expect(jobFeedJs).toContain('e.preventDefault()');
  });
});

// ═══════════════════════════════════════════════════════════
// QA-002: Connect buttons centered
// ═══════════════════════════════════════════════════════════
describe('QA-002: Connect buttons centered', () => {
  it('Gmail disconnected div has text-align:center', () => {
    expect(dashboard).toContain('id="gmail-setup-disconnected" style="text-align:center;"');
  });

  it('Calendar disconnected div has text-align:center', () => {
    expect(dashboard).toContain('id="gcal-setup-disconnected" style="text-align:center;"');
  });

  it('Drive disconnected div has text-align:center', () => {
    expect(dashboard).toContain('id="gdrive-setup-disconnected" style="text-align:center;"');
  });
});

// ═══════════════════════════════════════════════════════════
// Confirmed not-bugs
// ═══════════════════════════════════════════════════════════
describe('QA-013: Career levels (confirmed working)', () => {
  const tuningJs = read('js/tuning.js');

  it('DEFAULT_LEVELS has 5 levels', () => {
    expect(tuningJs).toContain("label: 'Director'");
    expect(tuningJs).toContain("label: 'Manager'");
    expect(tuningJs).toContain("label: 'Senior'");
    expect(tuningJs).toContain("label: 'Mid'");
    expect(tuningJs).toContain("label: 'Entry'");
  });

  it('renderLevelTable is called on load', () => {
    // Line 233: renderLevelTable(); (outside any function = runs on script load)
    const lines = tuningJs.split('\n');
    const topLevelCall = lines.some(l => l.trim() === 'renderLevelTable();');
    expect(topLevelCall).toBe(true);
  });
});

describe('QA-017: Theme toggle + credits layout (confirmed working)', () => {
  it('credits and theme toggle share a flex row', () => {
    expect(dashboard).toContain('display:flex;align-items:center;gap:0;margin:0 -4px;');
  });

  it('credit-balance has flex:1', () => {
    expect(dashboard).toContain('credit-balance" id="credit-balance"');
    const match = dashboard.match(/credit-balance"[^>]*style="[^"]*flex:1/);
    expect(match).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.21', () => {
  it('version.js has v9.21', () => {
    expect(read('js/version.js')).toContain('v9.21');
  });
});
