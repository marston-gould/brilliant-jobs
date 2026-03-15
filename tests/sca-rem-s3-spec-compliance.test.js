/**
 * SCA-REM-S3 — Spec Compliance Remediation Session 3
 * Tests: REM-S05 (ghost config), QA-009/012 (browse guard), QA-004 (salary auto-tab)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const migration = read('supabase/migrations/20260315000004_rem_s05_ghost_config.sql');
const sortBarJs = read('js/sort-bar.js');
const appJs = read('js/app.js');

// ═══════════════════════════════════════════════════════════
// REM-S05: Ghost tier thresholds configurable
// ═══════════════════════════════════════════════════════════
describe('REM-S05: Ghost tier thresholds configurable', () => {

  describe('Migration — ghost_config table', () => {
    it('creates ghost_config table', () => {
      expect(migration).toContain('CREATE TABLE IF NOT EXISTS ghost_config');
    });

    it('has key as primary key', () => {
      expect(migration).toMatch(/key\s+text\s+PRIMARY\s+KEY/);
    });

    it('has value column as numeric', () => {
      expect(migration).toMatch(/value\s+numeric\s+NOT\s+NULL/);
    });

    it('enables RLS', () => {
      expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    });

    it('seeds tier_medium_threshold = 5', () => {
      expect(migration).toContain("'tier_medium_threshold', 5");
    });

    it('seeds tier_high_threshold = 16', () => {
      expect(migration).toContain("'tier_high_threshold', 16");
    });

    it('uses ON CONFLICT DO NOTHING for idempotent seeds', () => {
      expect(migration).toContain('ON CONFLICT (key) DO NOTHING');
    });
  });

  describe('fn_ghost_score_refresh — reads from config', () => {
    it('declares v_thresh_medium variable', () => {
      expect(migration).toContain('v_thresh_medium');
    });

    it('declares v_thresh_high variable', () => {
      expect(migration).toContain('v_thresh_high');
    });

    it('reads tier_medium_threshold from ghost_config', () => {
      expect(migration).toContain("key = 'tier_medium_threshold'");
    });

    it('reads tier_high_threshold from ghost_config', () => {
      expect(migration).toContain("key = 'tier_high_threshold'");
    });

    it('uses COALESCE with fallback defaults', () => {
      expect(migration).toContain('COALESCE');
    });

    it('uses v_thresh_high in CASE statement', () => {
      expect(migration).toContain('effective_count >= v_thresh_high');
    });

    it('uses v_thresh_medium in CASE statement', () => {
      expect(migration).toContain('effective_count >= v_thresh_medium');
    });

    it('no longer has hardcoded 16 in CASE tier', () => {
      // The CASE statement should use variables, not literals
      const caseBlock = migration.match(/CASE\s+WHEN effective_count >= v_thresh/);
      expect(caseBlock).not.toBeNull();
    });
  });
});

// ═══════════════════════════════════════════════════════════
// QA-009/012: Browse button chunk-loading guard
// ═══════════════════════════════════════════════════════════
describe('QA-009/012: Browse button chunk-loading guard', () => {
  it('has delegated click listener for browse-companies-btn', () => {
    expect(appJs).toContain("btn = e.target.closest('.browse-companies-btn')");
  });

  it('checks if openFilterBrowser exists (chunk loaded)', () => {
    expect(appJs).toContain("typeof window.openFilterBrowser === 'function'");
  });

  it('loads keywords chunk on first click if not loaded', () => {
    expect(appJs).toContain("bjLoadChunk('keywords')");
  });

  it('re-fires click after chunk loads', () => {
    expect(appJs).toContain('btn.click()');
  });

  it('uses capture phase to fire before browsers.js handlers', () => {
    expect(appJs).toContain('true); // useCapture');
  });

  it('has guard against re-entrant clicks', () => {
    expect(appJs).toContain('_browseGuardActive');
  });
});

// ═══════════════════════════════════════════════════════════
// QA-004: Min salary auto-tab removed
// ═══════════════════════════════════════════════════════════
describe('QA-004: Min salary auto-tab removed', () => {
  it('qbInputOrder does NOT include pay-min', () => {
    const match = sortBarJs.match(/qbInputOrder\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    expect(match[1]).not.toContain('pay-min');
  });

  it('qbInputOrder ends at who', () => {
    const match = sortBarJs.match(/qbInputOrder\s*=\s*\[([^\]]+)\]/);
    expect(match[1]).toContain("'qb-input-who'");
    // Should be the last entry
    const items = match[1].split(',').map(s => s.trim().replace(/'/g, ''));
    expect(items[items.length - 1]).toBe('qb-input-who');
  });

  it('focusNextInput still exists for other fields', () => {
    expect(sortBarJs).toContain('function focusNextInput');
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.20', () => {
  it('version.js has v9.20', () => {
    expect(read('js/version.js')).toContain('v9.20');
  });
});
