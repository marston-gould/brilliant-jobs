// tests/selector-registry.test.js — CS-017: Selector registry validation tests
// FIX-17 (EXT-FE-004): Ensures every handler has a registry entry,
// all entries have valid structure, and critical selectors are defined.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import {
  SELECTOR_REGISTRY,
  getRegisteredHandlers,
  getHandlerEntry,
  getCriticalSelectors,
  getSelectorCounts,
} from '../extension/selectors/registry.js';

const ROOT = join(__dirname, '..');
const EXTENSION_DIR = join(ROOT, 'extension');
const REGISTRY_PATH = join(EXTENSION_DIR, 'selectors', 'registry.js');

// ── Get handler files from filesystem ──
function getHandlerFiles() {
  const files = readdirSync(join(EXTENSION_DIR, 'handlers'));
  return files.filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
}

describe('Selector Registry Structure (CS-017)', () => {
  it('registry file exists', () => {
    expect(existsSync(REGISTRY_PATH)).toBe(true);
  });

  it('SELECTOR_REGISTRY is a non-empty array', () => {
    expect(Array.isArray(SELECTOR_REGISTRY)).toBe(true);
    expect(SELECTOR_REGISTRY.length).toBeGreaterThan(0);
  });

  it('has exactly 15 entries (one per handler)', () => {
    expect(SELECTOR_REGISTRY.length).toBe(15);
  });

  it('getRegisteredHandlers returns all 15', () => {
    const handlers = getRegisteredHandlers();
    expect(handlers.length).toBe(15);
  });
});

describe('All handlers have registry entries', () => {
  const handlerFiles = getHandlerFiles();
  const registeredNames = new Set(getRegisteredHandlers());

  for (const handler of handlerFiles) {
    it(`${handler} is registered in selector registry`, () => {
      expect(registeredNames.has(handler),
        `Handler file "${handler}.js" exists but has no registry entry`
      ).toBe(true);
    });
  }
});

describe('Registry entry structure', () => {
  for (const entry of SELECTOR_REGISTRY) {
    describe(`${entry.handler}`, () => {
      it('has handler name', () => {
        expect(typeof entry.handler).toBe('string');
        expect(entry.handler.length).toBeGreaterThan(0);
      });

      it('has urlPattern regex', () => {
        expect(entry.urlPattern).toBeDefined();
        expect(entry.urlPattern instanceof RegExp).toBe(true);
      });

      it('has selectors object', () => {
        expect(entry.selectors).toBeDefined();
        expect(typeof entry.selectors).toBe('object');
      });

      it('has at least one critical selector category', () => {
        const hasCritical = Object.values(entry.selectors).some(v => v.critical);
        expect(hasCritical, `${entry.handler} has no critical selectors`).toBe(true);
      });

      it('all selector categories have valid structure', () => {
        for (const [category, val] of Object.entries(entry.selectors)) {
          expect(val.description, `${entry.handler}.${category} missing description`).toBeDefined();
          expect(typeof val.critical, `${entry.handler}.${category} missing critical flag`).toBe('boolean');
          expect(Array.isArray(val.selectors), `${entry.handler}.${category} selectors not array`).toBe(true);
          expect(val.selectors.length, `${entry.handler}.${category} has no selectors`).toBeGreaterThan(0);
        }
      });

      it('all selectors are non-empty strings', () => {
        for (const [category, val] of Object.entries(entry.selectors)) {
          for (const sel of val.selectors) {
            expect(typeof sel).toBe('string');
            expect(sel.length, `Empty selector in ${entry.handler}.${category}`).toBeGreaterThan(0);
          }
        }
      });

      it('has sampleUrls array', () => {
        expect(Array.isArray(entry.sampleUrls)).toBe(true);
      });

      it('has authRequired boolean', () => {
        expect(typeof entry.authRequired).toBe('boolean');
      });
    });
  }
});

describe('Handler source ↔ registry selector alignment', () => {
  it('linkedin-easy-apply: modal selector in registry matches source', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'handlers', 'linkedin-easy-apply.js'), 'utf-8');
    const entry = getHandlerEntry('linkedin-easy-apply');

    expect(src).toContain('[role="dialog"]');
    const modalSelectors = entry.selectors.modal.selectors;
    const hasRoleDialog = modalSelectors.some(s => s.includes('[role="dialog"]'));
    expect(hasRoleDialog).toBe(true);
  });

  it('greenhouse-legacy: #first_name selector in registry', () => {
    const entry = getHandlerEntry('greenhouse-legacy');
    const nameSelectors = entry.selectors.nameFields.selectors;
    expect(nameSelectors).toContain('#first_name');
  });

  it('workday: data-automation-id selectors in registry', () => {
    const entry = getHandlerEntry('workday');
    const inputSelectors = entry.selectors.automationIdInputs.selectors;
    const hasAutomationId = inputSelectors.some(s => s.includes('data-automation-id'));
    expect(hasAutomationId).toBe(true);
  });

  it('lever: #resume-upload-input in registry', () => {
    const entry = getHandlerEntry('lever');
    const resumeSelectors = entry.selectors.resumeUpload.selectors;
    expect(resumeSelectors).toContain('#resume-upload-input');
  });

  it('icims: .iCIMS_MainWrapper in registry', () => {
    const entry = getHandlerEntry('icims');
    const mainSelectors = entry.selectors.mainWrapper.selectors;
    expect(mainSelectors).toContain('.iCIMS_MainWrapper');
  });
});

describe('Selector count health', () => {
  it('total selectors across all handlers >= 100', () => {
    const { total } = getSelectorCounts();
    expect(total).toBeGreaterThanOrEqual(100);
  });

  it('critical selectors across all handlers >= 50', () => {
    const { critical } = getSelectorCounts();
    expect(critical).toBeGreaterThanOrEqual(50);
  });
});

describe('No orphaned handlers', () => {
  const handlerFiles = new Set(getHandlerFiles());

  for (const entry of SELECTOR_REGISTRY) {
    it(`registry entry "${entry.handler}" has corresponding handler file`, () => {
      expect(handlerFiles.has(entry.handler),
        `Registry entry "${entry.handler}" has no handler file`
      ).toBe(true);
    });
  }
});

describe('getCriticalSelectors helper', () => {
  it('returns critical selectors for linkedin-easy-apply', () => {
    const critical = getCriticalSelectors('linkedin-easy-apply');
    expect(critical.length).toBeGreaterThan(0);
    expect(critical.every(c => c.category && c.selectors.length > 0)).toBe(true);
  });

  it('returns empty array for unknown handler', () => {
    const critical = getCriticalSelectors('nonexistent-handler');
    expect(critical).toEqual([]);
  });
});
