/**
 * SCA-REM-S7 — QA-015/016 Merchandising + final cleanup
 * Tests: Dynamic merch card, admin-configurable content rotation
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const appJs = read('js/app.js');
const dashboard = read('dashboard.html');

// ═══════════════════════════════════════════════════════════
// QA-015/016: Dynamic merch card
// ═══════════════════════════════════════════════════════════
describe('QA-015/016: Dynamic merch card loader', () => {

  describe('Data fetching chain', () => {
    it('fetches merch_placements by element_id', () => {
      expect(appJs).toContain("'merch_placements'");
      expect(appJs).toContain("'intel-card-merch'");
    });

    it('fetches merch_rules for the placement', () => {
      expect(appJs).toContain("'merch_rules'");
      expect(appJs).toContain('placement_id');
    });

    it('fetches merch_content for active rules', () => {
      expect(appJs).toContain("'merch_content'");
      expect(appJs).toContain("'rule_id'");
    });

    it('only fetches active placements', () => {
      expect(appJs).toContain(".eq('is_active', true)");
    });

    it('orders content by sort_order', () => {
      expect(appJs).toContain("order('sort_order')");
    });
  });

  describe('Rotation', () => {
    it('uses sessionStorage for rotation index', () => {
      expect(appJs).toContain('bj_merch_idx');
      expect(appJs).toContain('sessionStorage');
    });

    it('wraps index with modulo', () => {
      expect(appJs).toContain('% entries.length');
    });

    it('increments index each load', () => {
      expect(appJs).toContain('String(idx + 1)');
    });
  });

  describe('Card population', () => {
    it('sets type label text', () => {
      expect(appJs).toContain('c.type_label');
    });

    it('sets type color from color map', () => {
      expect(appJs).toContain('colorMap');
      expect(appJs).toContain("green: 'var(--green)'");
    });

    it('sets title', () => {
      expect(appJs).toContain('c.title');
    });

    it('sets subtitle', () => {
      expect(appJs).toContain('c.sub');
    });

    it('sets CTA text', () => {
      expect(appJs).toContain('c.cta_text');
    });
  });

  describe('CTA actions', () => {
    it('handles nav: action type', () => {
      expect(appJs).toContain("startsWith('nav:')");
    });

    it('handles url: action type', () => {
      expect(appJs).toContain("startsWith('url:')");
    });

    it('clicks nav button for nav: actions', () => {
      expect(appJs).toContain('[data-page=');
    });

    it('opens new window for url: actions', () => {
      expect(appJs).toContain("window.open(");
    });
  });

  describe('Analytics + error handling', () => {
    it('fires merch_impression PostHog event', () => {
      expect(appJs).toContain("'merch_impression'");
    });

    it('includes slot and content_title in event', () => {
      expect(appJs).toContain("slot: 'feed-intel'");
      expect(appJs).toContain('content_title: c.title');
    });

    it('error-handled with reportError', () => {
      expect(appJs).toContain("reportError('merch:feed-intel'");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Dashboard HTML — merch card structure
// ═══════════════════════════════════════════════════════════
describe('Dashboard merch card HTML', () => {
  it('has intel-card-merch element', () => {
    expect(dashboard).toContain('id="intel-card-merch"');
  });

  it('has intel-merch-title element', () => {
    expect(dashboard).toContain('id="intel-merch-title"');
  });

  it('has intel-merch-sub element', () => {
    expect(dashboard).toContain('id="intel-merch-sub"');
  });

  it('has intel-card-cta link', () => {
    expect(dashboard).toContain('intel-card-cta');
  });

  it('has dismiss button', () => {
    expect(dashboard).toContain('intel-dismiss');
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.26', () => {
  it('version.js has v9.26', () => {
    expect(read('js/version.js')).toContain('v9.26');
  });
});
