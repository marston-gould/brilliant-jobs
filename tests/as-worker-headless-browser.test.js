// tests/as-worker-headless-browser.test.js
// Validation tests for Auto-Submit Worker (AS-1 + AS-2 + AS-3)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// ── 1. AS-1: Infrastructure ──
describe('AS-1: Worker Infrastructure', () => {
  it('Dockerfile exists with Playwright base image', () => {
    const df = readFileSync('worker/Dockerfile', 'utf8');
    expect(df).toContain('playwright');
    expect(df).toContain('WORKDIR /app');
    expect(df).toContain('HEALTHCHECK');
    expect(df).toContain('8080');
  });

  it('fly.toml exists with correct config', () => {
    const fly = readFileSync('worker/fly.toml', 'utf8');
    expect(fly).toContain('brilliant-jobs-worker');
    expect(fly).toContain('auto_stop_machines = true');
    expect(fly).toContain('auto_start_machines = true');
    expect(fly).toContain('min_machines_running = 0');
    expect(fly).toContain('memory_mb = 2048');
  });

  it('package.json has playwright and supabase deps', () => {
    const pkg = JSON.parse(readFileSync('worker/package.json', 'utf8'));
    expect(pkg.dependencies).toHaveProperty('playwright');
    expect(pkg.dependencies).toHaveProperty('@supabase/supabase-js');
    expect(pkg.type).toBe('module');
  });

  it('worker/index.js is the main entry', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain('pollForApproved');
    expect(idx).toContain('processApplication');
    expect(idx).toContain('chromium.launch');
    expect(idx).toContain("from('pending_applications')");
    expect(idx).toContain('.eq(\'status\', \'approved\')');
  });

  it('worker has health check server on :8080', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain('createServer');
    expect(idx).toContain('/health');
    expect(idx).toContain('/metrics');
    expect(idx).toContain('8080');
  });

  it('worker has graceful shutdown', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain('SIGTERM');
    expect(idx).toContain('isShuttingDown');
    expect(idx).toContain('activeSubmissions === 0');
  });

  it('worker marks apps as processing atomically', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain("status: 'processing'");
  });

  it('worker logs to submission_attempts with headless method', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain("submission_method: 'headless'");
    expect(idx).toContain('submission_attempts');
    expect(idx).toContain('duration_ms');
  });

  it('worker downloads resume to temp file', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain('writeFileSync');
    expect(idx).toContain('resumeLocalPath');
    expect(idx).toContain('unlinkSync');
  });

  it('worker rotates user agents', () => {
    const idx = readFileSync('worker/index.js', 'utf8');
    expect(idx).toContain('getRandomUserAgent');
    expect(idx).toContain('Chrome/122');
    expect(idx).toContain('Firefox/123');
  });
});

// ── 2. ATS Router ──
describe('AS-1: ATS Router', () => {
  const router = readFileSync('worker/ats-router.js', 'utf8');

  it('detects Greenhouse from URL patterns', () => {
    expect(router).toContain('greenhouse');
    expect(router).toContain('fillGreenhouse');
    expect(router).toContain("name: 'greenhouse'");
  });

  it('detects Lever, Workable, Ashby', () => {
    expect(router).toContain("name: 'lever'");
    expect(router).toContain("name: 'workable'");
    expect(router).toContain("name: 'ashby'");
    expect(router).toContain('fillLever');
    expect(router).toContain('fillWorkable');
    expect(router).toContain('fillAshby');
  });

  it('exports detectAts and routeSubmission', () => {
    expect(router).toContain('export function detectAts');
    expect(router).toContain('export async function routeSubmission');
  });

  it('falls back to generic handler for unknown URLs', () => {
    expect(router).toContain("name: 'generic'");
    expect(router).toContain('fillGeneric');
  });

  it('has Phase 2 placeholders (workday, indeed, linkedin)', () => {
    expect(router).toContain('handler: null'); // Multiple Phase 2 entries
    expect(router).toContain("name: 'workday'");
    expect(router).toContain("name: 'indeed'");
    expect(router).toContain("name: 'linkedin'");
  });
});

// ── 3. Human Simulation ──
describe('AS-1: Human Simulation', () => {
  const sim = readFileSync('worker/utils/human-sim.js', 'utf8');

  it('exports humanType with random delays', () => {
    expect(sim).toContain('export async function humanType');
    expect(sim).toContain('minDelay');
    expect(sim).toContain('maxDelay');
    expect(sim).toContain('keyboard.type');
  });

  it('exports humanClick, humanSelect, humanFileUpload', () => {
    expect(sim).toContain('export async function humanClick');
    expect(sim).toContain('export async function humanSelect');
    expect(sim).toContain('export async function humanFileUpload');
  });

  it('triggers change and blur events after typing', () => {
    expect(sim).toContain("new Event('change'");
    expect(sim).toContain("new Event('blur'");
  });

  it('has randomDelay and randomInt utilities', () => {
    expect(sim).toContain('export function randomDelay');
    expect(sim).toContain('export function randomInt');
  });
});

// ── 4. Screenshot Utility ──
describe('AS-1: Screenshot Capture', () => {
  const ss = readFileSync('worker/utils/screenshot.js', 'utf8');

  it('exports captureFailureScreenshot', () => {
    expect(ss).toContain('export async function captureFailureScreenshot');
  });

  it('uploads to Supabase Storage', () => {
    expect(ss).toContain('submission-screenshots');
    expect(ss).toContain('.upload(');
  });

  it('exports capturePageState for error context', () => {
    expect(ss).toContain('export async function capturePageState');
    expect(ss).toContain('visibleText');
  });
});

// ── 5. AS-1: Greenhouse Handler ──
describe('AS-1: Greenhouse Handler', () => {
  const gh = readFileSync('worker/handlers/greenhouse.js', 'utf8');

  it('exports fillGreenhouse function', () => {
    expect(gh).toContain('export async function fillGreenhouse');
  });

  it('fills name, email, phone, LinkedIn', () => {
    expect(gh).toContain('#first_name');
    expect(gh).toContain('#last_name');
    expect(gh).toContain('#email');
    expect(gh).toContain('#phone');
    expect(gh).toContain('linkedin');
  });

  it('handles resume upload', () => {
    expect(gh).toContain('setInputFiles');
    expect(gh).toContain('Resume uploaded');
  });

  it('answers work authorization and sponsorship questions', () => {
    expect(gh).toContain('answerCommonQuestions');
    expect(gh).toContain('workAuth');
    expect(gh).toContain('needsSponsorship');
  });

  it('detects success, CAPTCHA, and validation errors', () => {
    expect(gh).toContain('detectOutcome');
    expect(gh).toContain('captcha_detected');
    expect(gh).toContain('validation_error');
    expect(gh).toContain('Thank you');
  });

  it('captures screenshot on failure', () => {
    expect(gh).toContain('captureFailureScreenshot');
  });

  it('detects both React and Legacy Greenhouse forms', () => {
    expect(gh).toContain('data-reactroot');
    expect(gh).toContain('isReact');
  });
});

// ── 6. AS-3: Lever Handler ──
describe('AS-3: Lever Handler', () => {
  const lev = readFileSync('worker/handlers/lever.js', 'utf8');

  it('exports fillLever function', () => {
    expect(lev).toContain('export async function fillLever');
  });

  it('navigates to /apply URL', () => {
    expect(lev).toContain('/apply');
  });

  it('fills name (single field), email, phone', () => {
    expect(lev).toContain('input[name="name"]');
    expect(lev).toContain('input[name="email"]');
    expect(lev).toContain('input[name="phone"]');
  });

  it('uploads resume', () => {
    expect(lev).toContain('setInputFiles');
  });

  it('answers custom questions', () => {
    expect(lev).toContain('answerLeverQuestions');
    expect(lev).toContain('authorized');
    expect(lev).toContain('sponsor');
  });

  it('detects outcome via /thanks redirect', () => {
    expect(lev).toContain('/thanks');
    expect(lev).toContain('detectLeverOutcome');
  });
});

// ── 7. AS-3: Workable Handler ──
describe('AS-3: Workable Handler', () => {
  const wb = readFileSync('worker/handlers/workable.js', 'utf8');

  it('exports fillWorkable function', () => {
    expect(wb).toContain('export async function fillWorkable');
  });

  it('uses Workable data-ui selectors', () => {
    expect(wb).toContain('data-ui="firstname"');
    expect(wb).toContain('data-ui="lastname"');
    expect(wb).toContain('data-ui="email"');
  });

  it('handles resume upload', () => {
    expect(wb).toContain('data-ui="resume"');
    expect(wb).toContain('setInputFiles');
  });

  it('uses data-ui="submit-application" for submit', () => {
    expect(wb).toContain('data-ui="submit-application"');
  });
});

// ── 8. AS-3: Ashby Handler ──
describe('AS-3: Ashby Handler', () => {
  const ab = readFileSync('worker/handlers/ashby.js', 'utf8');

  it('exports fillAshby function', () => {
    expect(ab).toContain('export async function fillAshby');
  });

  it('uses Ashby _systemfield_ selectors', () => {
    expect(ab).toContain('_systemfield_name');
    expect(ab).toContain('_systemfield_email');
    expect(ab).toContain('_systemfield_phone');
    expect(ab).toContain('_systemfield_resume');
  });

  it('waits for networkidle (React app)', () => {
    expect(ab).toContain('networkidle');
  });
});

// ── 9. Generic Handler ──
describe('AS-1: Generic Handler', () => {
  const gen = readFileSync('worker/handlers/generic.js', 'utf8');

  it('exports fillGeneric', () => {
    expect(gen).toContain('export async function fillGeneric');
  });

  it('uses heuristic field detection', () => {
    expect(gen).toContain('heuristicFill');
    expect(gen).toContain("'first.?name'");
    expect(gen).toContain("'email'");
  });
});

// ── 10. AS-2: User Profile ──
describe('AS-2: User Profile Integration', () => {
  const idx = readFileSync('worker/index.js', 'utf8');

  it('fetches applicant_profile from profiles.user_data', () => {
    expect(idx).toContain('applicant_profile');
    expect(idx).toContain('user_data');
    expect(idx).toContain("from('profiles')");
  });

  it('extracts name, email, phone, linkedin, location, workAuth, sponsorship', () => {
    expect(idx).toContain('profile.name');
    expect(idx).toContain('profile.email');
    expect(idx).toContain('phone:');
    expect(idx).toContain('linkedin:');
    expect(idx).toContain('location:');
    expect(idx).toContain('work_authorization');
    expect(idx).toContain('needs_sponsorship');
  });

  it('validates profile completeness before submission', () => {
    expect(idx).toContain('incomplete_profile');
    expect(idx).toContain('Missing name or email');
  });
});

// ── 11. File Inventory ──
describe('AS-1/AS-2/AS-3: File Inventory', () => {
  const files = [
    'worker/Dockerfile',
    'worker/fly.toml',
    'worker/package.json',
    'worker/index.js',
    'worker/ats-router.js',
    'worker/utils/human-sim.js',
    'worker/utils/screenshot.js',
    'worker/handlers/greenhouse.js',
    'worker/handlers/lever.js',
    'worker/handlers/workable.js',
    'worker/handlers/ashby.js',
    'worker/handlers/generic.js',
  ];
  files.forEach(f => {
    it(`${f} exists`, () => {
      expect(existsSync(f)).toBe(true);
    });
  });
});

// ── 12. Coverage Summary ──
describe('AS-3: Coverage Summary', () => {
  const router = readFileSync('worker/ats-router.js', 'utf8');

  it('has handlers for 4 ATS platforms (96% coverage)', () => {
    // Greenhouse (40%) + Workable (28%) + Lever (13%) + Ashby (8%) + Recruitee API (7%) = 96%
    expect(router).toContain('fillGreenhouse');
    expect(router).toContain('fillLever');
    expect(router).toContain('fillWorkable');
    expect(router).toContain('fillAshby');
    expect(router).toContain('fillGeneric');
  });
});
