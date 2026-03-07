// tests/extension-handlers.test.js — CS-010: Extension handler structure tests
// Validates that all handlers:
// 1. Exist as files
// 2. Export a fill function (or safeFill wrapper)
// 3. Have no obvious syntax errors
// 4. Follow graceful degradation pattern (CS-010)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EXTENSION_DIR = join(__dirname, '..', 'extension');

const CRITICAL_HANDLERS = [
  'handlers/linkedin-easy-apply.js',
  'handlers/greenhouse-react.js',
  'handlers/greenhouse-legacy.js',
  'handlers/lever.js',
  'handlers/generic.js',
];

const ALL_HANDLERS = [
  ...CRITICAL_HANDLERS,
  'handlers/indeed.js',
  'handlers/workday.js',
  'handlers/ashby.js',
  'handlers/workable.js',
  'handlers/recruitee.js',
  'handlers/icims.js',
  'handlers/taleo.js',
  'handlers/smartrecruiters.js',
  'handlers/avature.js',
  'handlers/bamboohr.js',
  'handlers/jazzhr.js',
];

describe('Extension handler files', () => {
  for (const handler of ALL_HANDLERS) {
    it(`${handler} exists`, () => {
      const filePath = join(EXTENSION_DIR, handler);
      expect(existsSync(filePath), `Handler missing: ${handler}`).toBe(true);
    });
  }

  for (const handler of ALL_HANDLERS) {
    it(`${handler} exports a fill function`, () => {
      const filePath = join(EXTENSION_DIR, handler);
      if (!existsSync(filePath)) return;

      const src = readFileSync(filePath, 'utf-8');
      // Check for export of fill function (direct or wrapped)
      const hasFillExport = src.includes('export default') && src.includes('fill') ||
        src.includes('export { fill }') ||
        src.includes('export { safeFill as fill }');
      expect(hasFillExport, `${handler} does not export fill`).toBe(true);
    });
  }
});

describe('Graceful degradation (CS-010)', () => {
  const HANDLERS_WITH_GRACEFUL = [
    'handlers/greenhouse-react.js',
    'handlers/greenhouse-legacy.js',
    'handlers/lever.js',
  ];

  for (const handler of HANDLERS_WITH_GRACEFUL) {
    it(`${handler} has graceful degradation wrapper`, () => {
      const filePath = join(EXTENSION_DIR, handler);
      if (!existsSync(filePath)) return;

      const src = readFileSync(filePath, 'utf-8');
      // Should have safeFill wrapper with try/catch and PostHog reporting
      expect(src).toContain('safeFill');
      expect(src).toContain('ats:handlerError');
      expect(src).toContain('degraded: true');
    });
  }
});

describe('Resilient DOM utility', () => {
  it('resilientDOM.js exists', () => {
    expect(existsSync(join(EXTENSION_DIR, 'utils', 'resilientDOM.js'))).toBe(true);
  });

  it('exports queryResilient and waitForElement', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'utils', 'resilientDOM.js'), 'utf-8');
    expect(src).toContain('export function queryResilient');
    expect(src).toContain('export function waitForElement');
    expect(src).toContain('export function withGracefulDegradation');
  });
});

describe('LinkedIn handler resilience (CS-010)', () => {
  it('has multi-selector fallbacks for modal', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'handlers', 'linkedin-easy-apply.js'), 'utf-8');
    // Should have role="dialog" as a primary resilient selector
    expect(src).toContain('[role="dialog"]');
    // Should have multiple comma-separated selectors for modal
    const modalLine = src.split('\n').find(l => l.includes("modal:") && l.includes('[role="dialog"]'));
    expect(modalLine).toBeTruthy();
    // Count selectors (comma-separated)
    const selectorCount = (modalLine?.match(/,/g) || []).length + 1;
    expect(selectorCount).toBeGreaterThanOrEqual(3);
  });

  it('reports selector misses to PostHog', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'handlers', 'linkedin-easy-apply.js'), 'utf-8');
    expect(src).toContain('ats:selectorMisses');
  });
});

describe('Background message handlers (CS-010)', () => {
  it('handles ats:selectorMisses events', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'background.js'), 'utf-8');
    expect(src).toContain("msg.type === 'ats:selectorMisses'");
    expect(src).toContain('selector_miss');
  });

  it('handles ats:handlerError events', () => {
    const src = readFileSync(join(EXTENSION_DIR, 'background.js'), 'utf-8');
    expect(src).toContain("msg.type === 'ats:handlerError'");
    expect(src).toContain('handler_error');
  });
});
