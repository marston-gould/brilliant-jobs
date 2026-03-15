/**
 * REM-S10/S11-FIX — Gmail "label" scope mode
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const gmailScanEF = read('supabase/functions/gmail-scan/index.ts');
const applicationsJs = read('js/applications.js');
const dashboard = read('dashboard.html');

describe('Gmail label scope — EF', () => {
  it('scanGmail accepts gmailScanLabel parameter', () => {
    expect(gmailScanEF).toMatch(/async function scanGmail\([^)]*gmailScanLabel/);
  });

  it('applies label: filter when scope is label', () => {
    expect(gmailScanEF).toContain('gmailScanScope === "label"');
    expect(gmailScanEF).toContain('label:');
  });

  it('replaces spaces with hyphens in label name', () => {
    expect(gmailScanEF).toContain('.replace(/\\s+/g, "-")');
  });

  it('requires both scope=label and a non-empty label', () => {
    expect(gmailScanEF).toContain('gmailScanScope === "label" && gmailScanLabel');
  });

  it('reads gmail_scan_label from pipeline_tracking_settings', () => {
    expect(gmailScanEF).toContain('gmail_scan_label');
  });

  it('passes gmailLabel to scanGmail', () => {
    expect(gmailScanEF).toContain('checkpoint, logger, gmailScope, gmailLabel');
  });

  it('still has primary=in:inbox', () => {
    expect(gmailScanEF).toContain('"primary"');
    expect(gmailScanEF).toContain('in:inbox');
  });

  it('all scope = no filter (empty string)', () => {
    // When not primary and not label, scopeFilter is ""
    const match = gmailScanEF.match(/let scopeFilter\s*=\s*""/);
    expect(match).not.toBeNull();
  });
});

describe('Gmail label scope — Dashboard UI', () => {
  it('pi-gmail-label input exists in dashboard', () => {
    expect(dashboard).toContain('id="pi-gmail-label"');
  });

  it('label input starts hidden', () => {
    expect(dashboard).toContain('pi-gmail-label');
    expect(dashboard).toMatch(/pi-gmail-label.*display:\s*none/);
  });

  it('dropdown has label option', () => {
    expect(dashboard).toContain('value="label"');
    expect(dashboard).toContain('Custom label');
  });
});

describe('Gmail label scope — applications.js', () => {
  it('loads gmail_scan_label from settings', () => {
    expect(applicationsJs).toContain('gmail_scan_label');
  });

  it('saves gmail_scan_label to settings', () => {
    expect(applicationsJs).toContain("gmail_scan_label: el('pi-gmail-label')");
  });

  it('toggles label input on scope dropdown change', () => {
    expect(applicationsJs).toContain("_gmailScopeSelect.value === 'label'");
  });

  it('focuses label input when label scope selected', () => {
    expect(applicationsJs).toContain('_gmailLabelInput.focus()');
  });
});

describe('Migration', () => {
  it('migration file exists', () => {
    expect(existsSync('supabase/migrations/20260315000006_gmail_scan_label.sql')).toBe(true);
  });

  it('adds gmail_scan_label column', () => {
    const migration = read('supabase/migrations/20260315000006_gmail_scan_label.sql');
    expect(migration).toContain('gmail_scan_label');
  });
});

describe('Version v9.30', () => {
  it('version.js has v9.30', () => {
    expect(read('js/version.js')).toContain('v9.30');
  });
});
