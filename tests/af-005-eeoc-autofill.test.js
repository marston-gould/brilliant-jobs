/**
 * tests/af-005-eeoc-autofill.test.js
 * AF-005: Worker + Extension Handler EEOC Auto-Fill
 *
 * Tests cover:
 *  1. eeoc-filler.js — unit tests (shouldSkip logic, field detection, PostHog emission)
 *  2. worker/index.js — citizenshipStatus added to profile
 *  3. Extension overlay — eeoPreferences in APPLY_INTERCEPTED payload
 *  4. Handler integration — eeoc-filler import verified in all 5 handlers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// ── Helper: read file source ────────────────────────────────────────────────
function src(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

// ── 1. eeoc-filler.js unit tests (logic-only, no Playwright) ───────────────

describe('eeoc-filler: shouldSkip logic', () => {
  // We test the module-level logic by importing and invoking fillEeoQuestions
  // with a mock Playwright page that records which fields were attempted.

  function makeMockPage(selectMatches = {}, radioMatches = {}) {
    // selectMatches: { [fieldPattern]: valueReturned }
    return {
      $$: vi.fn(async (selector) => {
        if (selector === 'select') {
          return Object.entries(selectMatches).map(([pattern, matched]) => ({
            evaluate: vi.fn(async (fn, ...args) => {
              // Label evaluation returns the pattern string
              if (args.length === 0) return pattern;
              return fn({ options: [{ text: matched, value: matched }] }, args[0]);
            }),
          }));
        }
        // Radio groups selector
        return Object.entries(radioMatches).map(([pattern, value]) => ({
          evaluate: vi.fn(async (fn, ...args) => {
            if (args.length === 0) return pattern;
            // Simulate radio click return
            return fn(
              { querySelectorAll: () => [{ id: 'r1', value }], textContent: value },
              args[0]
            );
          }),
        }));
      }),
    };
  }

  it('skips field when profile value is null', async () => {
    // Import dynamically to isolate module
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const log = vi.fn();
    const mockPage = { $$: vi.fn(async () => []) };

    const result = await fillEeoQuestions(mockPage, {
      gender: null,
      ethnicity: null,
      veteranStatus: null,
      disabilityStatus: null,
      citizenshipStatus: null,
    }, log);

    expect(result.filled).toBe(0);
    expect(result.skipped).toBe(0); // null = no_value, not counted as skipped
  });

  it('skips field when value is "Prefer not to say" and increments skipped count', async () => {
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const log = vi.fn();
    const postHog = vi.fn();
    const mockPage = { $$: vi.fn(async () => []) };

    const result = await fillEeoQuestions(mockPage, {
      gender: 'Prefer not to say',
      ethnicity: null,
      veteranStatus: null,
      disabilityStatus: null,
      citizenshipStatus: null,
    }, log, postHog);

    expect(result.skipped).toBe(1);
    expect(result.skipReasons[0]).toContain('prefer_not_to_say');
  });

  it('handles all "prefer not to say" variants', async () => {
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const variants = [
      'prefer not to say',
      'Prefer Not To Say',
      'decline to state',
      'Decline',
      'i prefer not to say',
    ];

    for (const variant of variants) {
      const log = vi.fn();
      const mockPage = { $$: vi.fn(async () => []) };
      const result = await fillEeoQuestions(mockPage, {
        gender: variant,
        ethnicity: null,
        veteranStatus: null,
        disabilityStatus: null,
        citizenshipStatus: null,
      }, log);
      expect(result.skipped, `Expected skip for: "${variant}"`).toBe(1);
    }
  });

  it('emits PostHog eeoc_autofill_complete when capturePostHog provided', async () => {
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const log = vi.fn();
    const postHog = vi.fn();
    const mockPage = { $$: vi.fn(async () => []) };

    await fillEeoQuestions(mockPage, {
      gender: 'Prefer not to say',
      ethnicity: null,
      veteranStatus: null,
      disabilityStatus: null,
      citizenshipStatus: null,
    }, log, postHog);

    expect(postHog).toHaveBeenCalledWith('eeoc_autofill_complete', expect.objectContaining({
      eeoc_questions_filled: 0,
      eeoc_questions_skipped: 1,
    }));
  });

  it('does NOT emit PostHog when no filled or skipped fields', async () => {
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const log = vi.fn();
    const postHog = vi.fn();
    const mockPage = { $$: vi.fn(async () => []) };

    await fillEeoQuestions(mockPage, {
      gender: null, ethnicity: null, veteranStatus: null,
      disabilityStatus: null, citizenshipStatus: null,
    }, log, postHog);

    expect(postHog).not.toHaveBeenCalled();
  });

  it('returns { filled, skipped, skipReasons } object shape', async () => {
    const { fillEeoQuestions } = await import('../worker/utils/eeoc-filler.js');
    const mockPage = { $$: vi.fn(async () => []) };
    const result = await fillEeoQuestions(mockPage, {}, vi.fn());
    expect(result).toHaveProperty('filled');
    expect(result).toHaveProperty('skipped');
    expect(result).toHaveProperty('skipReasons');
    expect(Array.isArray(result.skipReasons)).toBe(true);
  });
});

// ── 2. eeoc-filler.js — EEO_FIELDS covers all 5 required fields ───────────

describe('eeoc-filler: field coverage', () => {
  it('module exports fillEeoQuestions function', async () => {
    const mod = await import('../worker/utils/eeoc-filler.js');
    expect(typeof mod.fillEeoQuestions).toBe('function');
  });

  it('includes citizenshipStatus field definition', () => {
    const source = src('worker/utils/eeoc-filler.js');
    expect(source).toContain("profileKey: 'citizenshipStatus'");
  });

  it('includes all 5 required field definitions', () => {
    const source = src('worker/utils/eeoc-filler.js');
    expect(source).toContain("profileKey: 'gender'");
    expect(source).toContain("profileKey: 'ethnicity'");
    expect(source).toContain("profileKey: 'veteranStatus'");
    expect(source).toContain("profileKey: 'disabilityStatus'");
    expect(source).toContain("profileKey: 'citizenshipStatus'");
  });

  it('includes hispanic/latino as a race_ethnicity pattern', () => {
    const source = src('worker/utils/eeoc-filler.js');
    expect(source).toContain("'hispanic'");
  });
});

// ── 3. worker/index.js — citizenshipStatus in profile ─────────────────────

describe('worker/index.js: citizenshipStatus profile field', () => {
  it('extracts citizenshipStatus from eeo_preferences', () => {
    const source = src('worker/index.js');
    expect(source).toContain('citizenshipStatus');
    expect(source).toContain("eeo_preferences || {}).citizenshipStatus");
  });
});

// ── 4. Handler integration — all 5 handlers import eeoc-filler ────────────

describe('handler integration: eeoc-filler import', () => {
  const handlers = [
    'worker/handlers/greenhouse.js',
    'worker/handlers/lever.js',
    'worker/handlers/workable.js',
    'worker/handlers/ashby.js',
    'worker/handlers/generic.js',
  ];

  for (const handler of handlers) {
    it(`${handler} imports fillEeoQuestions from eeoc-filler`, () => {
      const source = src(handler);
      expect(source).toContain("from '../utils/eeoc-filler.js'");
      expect(source).toContain('fillEeoQuestions');
    });

    it(`${handler} no longer contains inline AF-001 eeoMap`, () => {
      const source = src(handler);
      // The old inline pattern — should be gone
      expect(source).not.toContain("patterns: ['gender', 'sex'], value: profile.gender");
    });

    it(`${handler} calls fillEeoQuestions with AF-005 comment`, () => {
      const source = src(handler);
      expect(source).toContain('AF-005');
    });
  }
});

// ── 5. Extension overlay — eeoPreferences in payload ──────────────────────

describe('extension/job-site-overlay.ts: eeoPreferences in APPLY_INTERCEPTED', () => {
  const overlaySource = src('extension/job-site-overlay.ts');

  it('declares _eeoPreferences state variable', () => {
    expect(overlaySource).toContain('var _eeoPreferences');
  });

  it('loads eeoPreferences from chrome.storage.local', () => {
    expect(overlaySource).toContain("'eeoPreferences'");
    expect(overlaySource).toContain('_eeoPreferences = localData.eeoPreferences');
  });

  it('listens for eeoPreferences changes in storage change listener', () => {
    expect(overlaySource).toContain("changes.eeoPreferences");
  });

  it('includes eeoPreferences in APPLY_INTERCEPTED payload', () => {
    expect(overlaySource).toContain('eeoPreferences: _eeoPreferences');
  });
});

// ── 6. pod-team-manifest.md — AF-005 pairing entry ────────────────────────

describe('pod-team-manifest: AF-005 pairing entry', () => {
  it('includes AF-005 pairing row', () => {
    const source = src('docs/scaling/pod-team-manifest.md');
    expect(source).toContain('AF-005');
  });
});
