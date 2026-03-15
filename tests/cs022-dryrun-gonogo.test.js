/**
 * CS-022: 72-Hour Dry Run + Go/No-Go Tests
 * 
 * Tests the monitoring infrastructure, launch gate evaluation,
 * and Go/No-Go decision framework.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';

const ROOT = resolve(import.meta.dirname, '..');

// ─── Dry Run Monitor Script Tests ───

describe('CS-022: Dry Run Monitor', () => {
  it('dry-run-monitor.mjs exists and is valid JS', () => {
    const scriptPath = join(ROOT, 'scripts/dry-run-monitor.mjs');
    expect(existsSync(scriptPath)).toBe(true);
    const content = readFileSync(scriptPath, 'utf8');
    expect(content).toContain('async function runAllChecks');
    expect(content).toContain('checkLandingPage');
    expect(content).toContain('checkHealthEndpoint');
  });

  it('monitor checks all required surfaces', () => {
    const content = readFileSync(join(ROOT, 'scripts/dry-run-monitor.mjs'), 'utf8');
    const requiredChecks = [
      'checkLandingPage',
      'checkLandingCSP',
      'checkDashboard',
      'checkAdmin',
      'checkHealthEndpoint',
      'checkPreviewJobsEndpoint',
      'checkExtensionHeartbeat',
      'checkKillSwitch',
      'checkDatabaseConnectivity',
      'checkVercelDeployment',
    ];
    for (const check of requiredChecks) {
      expect(content).toContain(check);
    }
  });

  it('monitor supports --json and --ci flags', () => {
    const content = readFileSync(join(ROOT, 'scripts/dry-run-monitor.mjs'), 'utf8');
    expect(content).toContain('--json');
    expect(content).toContain('--ci');
    expect(content).toContain('JSON_MODE');
    expect(content).toContain('CI_MODE');
  });

  it('monitor has timeout protection', () => {
    const content = readFileSync(join(ROOT, 'scripts/dry-run-monitor.mjs'), 'utf8');
    expect(content).toContain('fetchWithTimeout');
    expect(content).toContain('AbortController');
    expect(content).toContain('15000'); // 15s timeout
  });

  it('monitor produces structured result objects', () => {
    const content = readFileSync(join(ROOT, 'scripts/dry-run-monitor.mjs'), 'utf8');
    expect(content).toContain("'PASS'");
    expect(content).toContain("'FAIL'");
    expect(content).toContain("'WARN'");
    expect(content).toContain("'SKIP'");
    expect(content).toContain('overallStatus');
  });
});

// ─── Dry Run GitHub Actions Workflow Tests ───

describe('CS-022: Dry Run Workflow', () => {
  it('dry-run.yml workflow exists', () => {
    expect(existsSync(join(ROOT, '.github/workflows/dry-run.yml'))).toBe(true);
  });

  it('workflow has hourly cron schedule', () => {
    const content = readFileSync(join(ROOT, '.github/workflows/dry-run.yml'), 'utf8');
    expect(content).toContain("cron: '0 * * * *'");
  });

  it('workflow has manual dispatch option', () => {
    const content = readFileSync(join(ROOT, '.github/workflows/dry-run.yml'), 'utf8');
    expect(content).toContain('workflow_dispatch');
  });

  it('workflow uses Supabase secrets', () => {
    const content = readFileSync(join(ROOT, '.github/workflows/dry-run.yml'), 'utf8');
    expect(content).toContain('SUPABASE_URL');
    expect(content).toContain('SUPABASE_ANON_KEY');
  });

  it('workflow uploads artifacts for historical tracking', () => {
    const content = readFileSync(join(ROOT, '.github/workflows/dry-run.yml'), 'utf8');
    expect(content).toContain('upload-artifact');
    expect(content).toContain('retention-days: 7');
  });

  it('workflow annotates on failure', () => {
    const content = readFileSync(join(ROOT, '.github/workflows/dry-run.yml'), 'utf8');
    expect(content).toContain('::error::');
  });
});

// ─── Launch Gate Evaluator Tests ───

describe('CS-022: Launch Gate Evaluator', () => {
  it('evaluate-launch-gates.mjs exists', () => {
    expect(existsSync(join(ROOT, 'scripts/evaluate-launch-gates.mjs'))).toBe(true);
  });

  it('evaluator covers all 15 launch gates', () => {
    const content = readFileSync(join(ROOT, 'scripts/evaluate-launch-gates.mjs'), 'utf8');
    for (let i = 1; i <= 15; i++) {
      expect(content).toContain(`id: 'G${i}'`);
    }
  });

  it('evaluator produces GREEN/YELLOW/RED statuses', () => {
    const content = readFileSync(join(ROOT, 'scripts/evaluate-launch-gates.mjs'), 'utf8');
    expect(content).toContain("'GREEN'");
    expect(content).toContain("'YELLOW'");
    expect(content).toContain("'RED'");
  });

  it('evaluator includes Go/No-Go decision logic', () => {
    const content = readFileSync(join(ROOT, 'scripts/evaluate-launch-gates.mjs'), 'utf8');
    expect(content).toContain("'NO-GO'");
    expect(content).toContain("'CONDITIONAL-GO'");
    expect(content).toContain("'GO'");
  });

  it('evaluator returns 0 RED gates (codebase evidence)', () => {
    // Run the evaluator and parse JSON output
    const output = execSync('node scripts/evaluate-launch-gates.mjs --json', {
      cwd: ROOT, encoding: 'utf8', timeout: 30000,
    });
    const evaluation = JSON.parse(output);
    expect(evaluation.summary.red).toBe(0);
  });

  it('evaluator returns >= 8 GREEN gates', () => {
    const output = execSync('node scripts/evaluate-launch-gates.mjs --json', {
      cwd: ROOT, encoding: 'utf8', timeout: 30000,
    });
    const evaluation = JSON.parse(output);
    expect(evaluation.summary.green).toBeGreaterThanOrEqual(8);
  });

  it('evaluator decision is CONDITIONAL-GO or GO (no hard blockers)', () => {
    const output = execSync('node scripts/evaluate-launch-gates.mjs --json', {
      cwd: ROOT, encoding: 'utf8', timeout: 30000,
    });
    const evaluation = JSON.parse(output);
    expect(['GO', 'CONDITIONAL-GO']).toContain(evaluation.decision);
  });
});

// ─── Infrastructure Verification Tests ───

describe('CS-022: Infrastructure Verification', () => {
  it('health-check Edge Function exists', () => {
    expect(existsSync(join(ROOT, 'supabase/functions/health-check/index.ts'))).toBe(true);
  });

  it('health-check EF checks database, jobs, notifications', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/health-check/index.ts'), 'utf8');
    expect(content).toContain('database');
    expect(content).toContain('job_refresh');
    expect(content).toContain('job_data');
    expect(content).toContain('notifications');
  });

  it('load test workflow exists', () => {
    expect(existsSync(join(ROOT, '.github/workflows/load-test.yml'))).toBe(true);
  });

  it('CI workflow exists with quality gates', () => {
    expect(existsSync(join(ROOT, '.github/workflows/ci.yml'))).toBe(true);
  });

  it('all 4 gate scripts exist', () => {
    const gateScripts = [
      'scripts/gate-bundle-size.mjs',
      'scripts/gate-ef-auth-scan.mjs',
      'scripts/gate-posthog-verify.mjs',
      'scripts/gate-secret-scan.mjs',
    ];
    for (const script of gateScripts) {
      expect(existsSync(join(ROOT, script))).toBe(true);
    }
  });

  it('kill-switch module exists in extension', () => {
    expect(existsSync(join(ROOT, 'extension/utils/killSwitch.ts'))).toBe(true);
  });

  it('DOMPurify vendor file exists for XSS protection', () => {
    expect(existsSync(join(ROOT, 'js/vendor/purify.min.js'))).toBe(true);
  });

  it('privacy policy page exists', () => {
    expect(existsSync(join(ROOT, 'privacy.html'))).toBe(true);
  });

  it('PII inventory documentation exists', () => {
    expect(existsSync(join(ROOT, 'docs/PII_INVENTORY.md'))).toBe(true);
  });

  it('vercel.json has CSP and security headers', () => {
    const content = readFileSync(join(ROOT, 'vercel.json'), 'utf8').toLowerCase();
    expect(content).toContain('content-security-policy');
    expect(content).toContain('x-frame-options');
    expect(content).toContain('x-content-type-options');
  });
});

// ─── Go/No-Go Document Tests ───

describe('CS-022: Go/No-Go Documentation', () => {
  it('Go/No-Go document exists in docs/audit/', () => {
    expect(existsSync(join(ROOT, 'docs/audit/CS-022-GoNoGo.md'))).toBe(true);
  });

  it('Go/No-Go document references all 15 gates', () => {
    const content = readFileSync(join(ROOT, 'docs/audit/CS-022-GoNoGo.md'), 'utf8');
    for (let i = 1; i <= 15; i++) {
      expect(content).toContain(`G${i}`);
    }
  });

  it('Go/No-Go document includes decision and rationale', () => {
    const content = readFileSync(join(ROOT, 'docs/audit/CS-022-GoNoGo.md'), 'utf8');
    expect(content).toContain('Decision');
    expect(content).toContain('CONDITIONAL-GO');
  });

  it('Go/No-Go document lists accepted risks', () => {
    const content = readFileSync(join(ROOT, 'docs/audit/CS-022-GoNoGo.md'), 'utf8');
    expect(content).toContain('Accepted Risk');
  });
});

// ─── Cross-Surface Consistency Tests ───

describe('CS-022: Cross-Surface Consistency', () => {
  it('PostHog init present on dashboard', () => {
    const content = readFileSync(join(ROOT, 'dashboard.html'), 'utf8');
    expect(content.toLowerCase()).toContain('posthog');
  });

  it('PostHog init present on admin', () => {
    const content = readFileSync(join(ROOT, 'admin.html'), 'utf8');
    expect(content.toLowerCase()).toContain('posthog');
  });

  it('PostHog init present on landing page', () => {
    const content = readFileSync(join(ROOT, 'index.html'), 'utf8');
    expect(content.toLowerCase()).toContain('posthog');
  });

  it('version.js has consistent BJ_VERSION', () => {
    const versionContent = readFileSync(join(ROOT, 'js/version.js'), 'utf8');
    const match = versionContent.match(/BJ_VERSION\s*=\s*'([^']+)'/);
    expect(match).not.toBeNull();
    expect(match[1]).toMatch(/^v\d+\.\d+$/);
  });

  it('non-bundled HTML surfaces reference version.js', () => {
    // dashboard.html is bundled and uses inline version; admin + index use version.js
    const surfaces = ['admin.html', 'index.html'];
    for (const surface of surfaces) {
      const content = readFileSync(join(ROOT, surface), 'utf8');
      expect(content).toContain('version.js');
    }
  });
});

// ─── Test Suite Completeness ───

describe('CS-022: Test Suite Health', () => {
  it('7+ test files exist', () => {
    const testFiles = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.js'));
    expect(testFiles.length).toBeGreaterThanOrEqual(7);
  });

  it('all test files are non-empty', () => {
    const testFiles = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.test.js'));
    for (const file of testFiles) {
      const content = readFileSync(join(ROOT, 'tests', file), 'utf8');
      expect(content.length).toBeGreaterThan(100);
    }
  });
});
