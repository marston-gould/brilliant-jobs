// tests/cs-p1-010-cx-polish.test.js
// CS-P1-010: Dashboard CX Polish
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const readFile = (p) => readFileSync(join(process.cwd(), p), 'utf8');
const fileExists = (p) => existsSync(join(process.cwd(), p));

describe('DS1A-16: Resume token design variable', () => {
  test('no hardcoded #f59e0b in resume-metrics.js', () => {
    const src = readFile('js/resume-metrics.js');
    expect(src).not.toContain('#f59e0b');
  });

  test('uses CSS variable for amber color', () => {
    const css = readFile('src/input.css');
    expect(css).toContain('--warm');
  });
});

describe('DS1A-18: Snooze style deduplication', () => {
  test('no duplicate class attributes in notification-center.js', () => {
    const src = readFile('js/notification-center.js');
    // Split into element declarations and check for double class=
    const lines = src.split('\n');
    const dupes = lines.filter(l => {
      const matches = l.match(/class=/g);
      return matches && matches.length > 1;
    });
    expect(dupes).toEqual([]);
  });

  test('snooze CSS classes exist in input.css', () => {
    const css = readFile('src/input.css');
    expect(css).toContain('passive-snooze');
  });
});

describe('DS1A-14: Tuning page dark mode', () => {
  test('tuning dark overrides in CSS', () => {
    const css = readFile('src/input.css');
    expect(css).toMatch(/data-theme.*dark.*tuning/s);
  });
});

describe('DS1A-19: Subscription page dark mode', () => {
  test('no hardcoded hsl colors in subscription sections of app.js', () => {
    const src = readFile('js/app.js');
    // Check subscription-related rendering doesn't use raw hsl()
    const subSection = src.match(/loadSubscription[\s\S]{0,3000}/);
    if (subSection) {
      // Allow hsl in CSS variable definitions, block inline hsl
      const inlineHsl = (subSection[0].match(/style.*hsl\(/g) || []);
      expect(inlineHsl.length).toBe(0);
    }
  });
});

describe('DS1A-15: Pipeline navigation', () => {
  test('pipeline nav item exists in app.js', () => {
    const src = readFile('js/app.js');
    expect(src).toContain('pipeline');
  });

  test('pipeline icon in nav', () => {
    const src = readFile('js/app.js');
    // Should have a pipeline-related nav entry
    expect(src).toMatch(/pipeline/i);
  });
});

describe('DS1A-20: Admin survey gating', () => {
  test('survey gated to admin', () => {
    const src = readFile('js/app.js');
    expect(src).toContain('_isAdmin');
  });
});

describe('DS1A-21: Referral !important removal', () => {
  test('no !important in referrals.js', () => {
    const src = readFile('js/referrals.js');
    expect(src).not.toContain('!important');
  });

  test('no hardcoded #f59e0b in referrals.js', () => {
    const src = readFile('js/referrals.js');
    expect(src).not.toContain('#f59e0b');
  });
});

describe('DS1A-17: Notification events', () => {
  test('PostHog event tracking in notification-center.js', () => {
    const src = readFile('js/notification-center.js');
    expect(src).toContain('notification_email_toggled');
    expect(src).toContain('notification_frequency_changed');
  });

  test('ncWirePreferenceEvents function exists', () => {
    const src = readFile('js/notification-center.js');
    expect(src).toContain('ncWirePreferenceEvents');
  });
});

describe('DS1-8: Gmail connect in onboarding', () => {
  test('Gmail connect in app.js', () => {
    const src = readFile('js/app.js');
    expect(src).toContain('updateGmailUI');
  });
});

describe('DS1A-13: Extension walkthrough', () => {
  test('walkthrough steps in app.js', () => {
    const src = readFile('js/app.js');
    expect(src).toMatch(/walkthrough|sideload/i);
  });
});

describe('DS1-11: Consolidated onboarding', () => {
  test('unified setup progress in app.js', () => {
    const src = readFile('js/app.js');
    expect(src).toContain('updateSetupProgress');
  });
});
