/**
 * SCA-REM-S6 — Spec Compliance Remediation Session 6
 * Tests: REM-S10/S11 backend (gmail-scan EF scope consumption)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const gmailScanEF = read('supabase/functions/gmail-scan/index.ts');
const dashboard = read('dashboard.html');

// ═══════════════════════════════════════════════════════════
// REM-S10: Gmail scan scope — EF reads user preference
// ═══════════════════════════════════════════════════════════
describe('REM-S10: Gmail scan scope backend', () => {
  it('scanGmail accepts gmailScanScope parameter', () => {
    expect(gmailScanEF).toMatch(/async function scanGmail\([^)]*gmailScanScope/);
  });

  it('applies in:inbox filter for primary scope', () => {
    expect(gmailScanEF).toContain('gmailScanScope === "primary"');
    expect(gmailScanEF).toContain('in:inbox');
  });

  it('empty scope filter for all mail', () => {
    // When scope is "all", scopeFilter is ""
    const match = gmailScanEF.match(/scopeFilter\s*=\s*gmailScanScope\s*===\s*"primary"\s*\?\s*"[^"]*in:inbox[^"]*"\s*:\s*""/);
    expect(match).not.toBeNull();
  });

  it('reads gmail_scan_scope from pipeline_tracking_settings', () => {
    expect(gmailScanEF).toContain('pipeline_tracking_settings');
    expect(gmailScanEF).toContain('gmail_scan_scope');
  });

  it('defaults to primary if no settings found', () => {
    expect(gmailScanEF).toContain('gmailScope = "primary"');
  });

  it('passes gmailScope to scanGmail call', () => {
    expect(gmailScanEF).toContain('checkpoint, logger, gmailScope');
  });

  it('settings read is non-fatal', () => {
    expect(gmailScanEF).toContain('/* non-fatal — default to primary */');
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S11: Calendar scan scope — EF reads user preference
// ═══════════════════════════════════════════════════════════
describe('REM-S11: Calendar scan scope backend', () => {
  it('scanCalendar accepts calendarScanScope parameter', () => {
    expect(gmailScanEF).toMatch(/async function scanCalendar\([^)]*calendarScanScope/);
  });

  it('defaults calendarIds to primary', () => {
    expect(gmailScanEF).toContain('calendarIds: string[] = ["primary"]');
  });

  it('fetches calendarList when scope is all', () => {
    expect(gmailScanEF).toContain('calendarScanScope === "all"');
    expect(gmailScanEF).toContain('calendarList');
  });

  it('iterates over calendarIds', () => {
    expect(gmailScanEF).toContain('for (const calId of calendarIds)');
  });

  it('uses calId in calendar events URL', () => {
    expect(gmailScanEF).toContain('encodeURIComponent(calId)');
  });

  it('reads calendar_scan_scope from pipeline_tracking_settings', () => {
    expect(gmailScanEF).toContain('calendar_scan_scope');
  });

  it('passes calendarScope to scanCalendar call', () => {
    expect(gmailScanEF).toContain('checkpoint, logger, calendarScope');
  });

  it('falls back to primary if calendarList fetch fails', () => {
    expect(gmailScanEF).toContain('falling back to primary');
  });

  it('continues on per-calendar errors instead of throwing', () => {
    // 403 and 429 now continue instead of returning
    expect(gmailScanEF).toMatch(/403.*continue/);
    expect(gmailScanEF).toMatch(/429.*continue/);
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S13: FilterBuilder.tsx browse buttons
// ═══════════════════════════════════════════════════════════
describe('REM-S13: FilterBuilder.tsx browse buttons', () => {
  const fb = read('src/app/pages/dashboard/feed/components/FilterBuilder.tsx');

  it('FilterBuilderProps has onBrowse callback', () => {
    expect(fb).toContain('onBrowse?:');
  });

  it('FilterRowProps has onBrowse callback', () => {
    expect(fb).toMatch(/interface FilterRowProps[\s\S]*?onBrowse\?/);
  });

  it('FilterRow renders Browse button when onBrowse provided', () => {
    expect(fb).toContain('onBrowse && (');
    expect(fb).toContain('onClick={onBrowse}');
  });

  it('What row has browse for title include', () => {
    expect(fb).toContain("onBrowse('title', 'include')");
  });

  it('What-Not row has browse for title exclude', () => {
    expect(fb).toContain("onBrowse('title', 'exclude')");
  });

  it('Who row has browse for company include', () => {
    expect(fb).toContain("onBrowse('company', 'include')");
  });

  it('Who-Not row has browse for company exclude', () => {
    expect(fb).toContain("onBrowse('company', 'exclude')");
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S14: FilterBuilder US-Only context
// ═══════════════════════════════════════════════════════════
describe('REM-S14: FilterBuilder US-Only context', () => {
  const fb = read('src/app/pages/dashboard/feed/components/FilterBuilder.tsx');

  it('FilterBuilderProps has usOnly prop', () => {
    expect(fb).toContain('usOnly?:');
  });

  it('shows US-Only banner when usOnly is true', () => {
    expect(fb).toContain('US-Only filter active');
  });
});

// ═══════════════════════════════════════════════════════════
// QA-018: Credit icon — CR badge
// ═══════════════════════════════════════════════════════════
describe('QA-018: Credit icon CR badge', () => {
  it('has CR text badge before credit count', () => {
    expect(dashboard).toContain('>CR</span>');
  });

  it('CR badge appears before credit-balance-badge', () => {
    const crIdx = dashboard.indexOf('>CR</span>');
    const countIdx = dashboard.indexOf('credit-balance-badge');
    expect(crIdx).toBeGreaterThan(0);
    expect(countIdx).toBeGreaterThan(crIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S02: Extension EEOC (confirmed already done)
// ═══════════════════════════════════════════════════════════
describe('REM-S02: Extension EEOC display (confirmed done)', () => {
  const popup = read('extension/popup.html');
  const consumer = read('extension/popup-consumer.ts');

  it('popup.html has EEOC settings card', () => {
    expect(popup).toContain('cv-settings-eeoc');
  });

  it('popup-consumer.ts has _loadSettingsEEOC function', () => {
    expect(consumer).toContain('_loadSettingsEEOC');
  });

  it('displays all 5 EEOC fields', () => {
    expect(consumer).toContain("'Gender'");
    expect(consumer).toContain("'Ethnicity'");
    expect(consumer).toContain("'Veteran'");
    expect(consumer).toContain("'Disability'");
    expect(consumer).toContain("'Citizenship'");
  });
});
describe('QA-003: Salary Min/Max split (confirmed working)', () => {
  it('has separate Min $ row', () => {
    expect(dashboard).toContain('qb-input-pay-min');
    expect(dashboard).toMatch(/qb-row-label[^>]*>Min \$/);
  });

  it('has separate Max $ row', () => {
    expect(dashboard).toContain('qb-input-pay-max');
    expect(dashboard).toMatch(/qb-row-label[^>]*>Max \$/);
  });

  it('Min and Max are in adjacent qb-row elements', () => {
    // Min $ row comes before Max $ row within the same block
    const minIdx = dashboard.indexOf('qb-input-pay-min');
    const maxIdx = dashboard.indexOf('qb-input-pay-max');
    expect(minIdx).toBeGreaterThan(0);
    expect(maxIdx).toBeGreaterThan(minIdx);
    // They should be close together (within ~500 chars)
    expect(maxIdx - minIdx).toBeLessThan(600);
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.25', () => {
  it('version.js has v9.25', () => {
    expect(read('js/version.js')).toContain('v9.25');
  });
});
