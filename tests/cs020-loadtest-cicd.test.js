// tests/cs020-loadtest-cicd.test.js — CS-020 FIX-20/FIX-21 validation
// Tests load test configuration integrity and CI/CD workflow structure

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');

// ─── FIX-20: Load Test Infrastructure ──────────────────────

describe('FIX-20: Load Test Scripts', () => {
  const loadTestDir = join(ROOT, 'load-tests');

  it('load-tests directory exists', () => {
    expect(existsSync(loadTestDir)).toBe(true);
  });

  const requiredScripts = [
    'config.js',
    'preview-jobs.js',
    'extension-heartbeat.js',
    'dashboard-api.js',
    'admin-concurrent.js',
    'full-suite.js',
    'README.md',
  ];

  requiredScripts.forEach(script => {
    it(`${script} exists`, () => {
      expect(existsSync(join(loadTestDir, script))).toBe(true);
    });
  });

  it('results directory has gitignore', () => {
    const gi = join(loadTestDir, 'results', '.gitignore');
    expect(existsSync(gi)).toBe(true);
    expect(readFileSync(gi, 'utf8')).toContain('*.json');
  });

  describe('config.js — shared configuration', () => {
    let configContent;
    beforeAll(() => {
      configContent = readFileSync(join(loadTestDir, 'config.js'), 'utf8');
    });

    it('defines SUPABASE_URL', () => {
      expect(configContent).toContain('SUPABASE_URL');
      expect(configContent).toContain('qojhagupdnbtomfoxnsf.supabase.co');
    });

    it('defines threshold for p95 < 2s', () => {
      expect(configContent).toContain("'p(95)<2000'");
    });

    it('defines threshold for error rate < 0.1%', () => {
      expect(configContent).toContain("'rate<0.001'");
    });

    it('defines ramp profile reaching 1200 VUs', () => {
      expect(configContent).toContain('1200');
    });

    it('defines smoke, ramp, spike, soak profiles', () => {
      expect(configContent).toContain('smoke');
      expect(configContent).toContain('ramp');
      expect(configContent).toContain('spike');
      expect(configContent).toContain('soak');
    });

    it('exports randomItem helper', () => {
      expect(configContent).toContain('export function randomItem');
    });
  });

  describe('preview-jobs.js — landing page load test', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(loadTestDir, 'preview-jobs.js'), 'utf8');
    });

    it('targets preview-jobs endpoint', () => {
      expect(content).toContain('preview-jobs');
    });

    it('sets Origin header from config', () => {
      expect(content).toContain('LANDING_URL');
      expect(content).toContain('Origin');
    });

    it('handles rate limiting responses', () => {
      expect(content).toContain('rate_limited');
    });

    it('sends keyword + location payload', () => {
      expect(content).toContain('keyword');
      expect(content).toContain('location');
    });

    it('includes handleSummary with pass/fail', () => {
      expect(content).toContain('handleSummary');
      expect(content).toContain('PASS');
      expect(content).toContain('FAIL');
    });
  });

  describe('extension-heartbeat.js — extension load test', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(loadTestDir, 'extension-heartbeat.js'), 'utf8');
    });

    it('targets extension-heartbeat endpoint', () => {
      expect(content).toContain('extension-heartbeat');
    });

    it('sends Authorization header', () => {
      expect(content).toContain('Authorization');
    });

    it('checks for kill-switch directive', () => {
      expect(content).toContain('directive');
      expect(content).toContain('kill');
    });

    it('has stricter p95 threshold (1.5s)', () => {
      expect(content).toContain('1500');
    });
  });

  describe('dashboard-api.js — dashboard load test', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(loadTestDir, 'dashboard-api.js'), 'utf8');
    });

    it('queries ats_jobs (job feed)', () => {
      expect(content).toContain('ats_jobs');
    });

    it('queries applications (pipeline)', () => {
      expect(content).toContain('applications');
    });

    it('tests RLS by checking for 403', () => {
      expect(content).toContain('403');
    });

    it('authenticates via Supabase auth', () => {
      expect(content).toContain('auth/v1/token');
    });
  });

  describe('admin-concurrent.js — admin load test', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(loadTestDir, 'admin-concurrent.js'), 'utf8');
    });

    it('tests admin-specific endpoints', () => {
      expect(content).toContain('admin_audit_log');
      expect(content).toContain('vendor_cost_budgets');
    });

    it('uses lighter concurrency (20 VUs max)', () => {
      expect(content).toContain('20');
    });

    it('allows slightly higher latency (3s)', () => {
      expect(content).toContain('3000');
    });

    it('checks feature flags', () => {
      expect(content).toContain('feature_flags');
    });

    it('checks extension heartbeats view', () => {
      expect(content).toContain('extension_heartbeats');
    });
  });

  describe('full-suite.js — combined load test', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(loadTestDir, 'full-suite.js'), 'utf8');
    });

    it('defines 4 scenarios', () => {
      expect(content).toContain("landing:");
      expect(content).toContain("dashboard:");
      expect(content).toContain("extension:");
      expect(content).toContain("admin:");
    });

    it('targets 480 VUs for landing (40%)', () => {
      expect(content).toContain('480');
    });

    it('targets 420 VUs for dashboard (35%)', () => {
      expect(content).toContain('420');
    });

    it('targets 240 VUs for extension (20%)', () => {
      expect(content).toContain('240');
    });

    it('targets 60 VUs for admin (5%)', () => {
      expect(content).toContain('60');
    });

    it('prints pass/fail verdict', () => {
      expect(content).toContain('LAUNCH GATE MET');
      expect(content).toContain('DO NOT LAUNCH');
    });
  });
});

// ─── FIX-21: CI/CD Pipeline ───────────────────────────────

describe('FIX-21: CI/CD Workflows', () => {
  const workflowDir = join(ROOT, '.github', 'workflows');

  it('workflows directory exists', () => {
    expect(existsSync(workflowDir)).toBe(true);
  });

  const requiredWorkflows = ['ci.yml', 'deploy.yml', 'load-test.yml'];

  requiredWorkflows.forEach(wf => {
    it(`${wf} exists`, () => {
      expect(existsSync(join(workflowDir, wf))).toBe(true);
    });
  });

  describe('ci.yml — test pipeline', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(workflowDir, 'ci.yml'), 'utf8');
    });

    it('triggers on PR to main and staging', () => {
      expect(content).toContain('main');
      expect(content).toContain('staging');
      expect(content).toContain('pull_request');
    });

    it('runs vitest', () => {
      expect(content).toContain('vitest run');
    });

    it('includes build validation job', () => {
      // CS-021: build-check consolidated into Gate 9 build job
      expect(content).toContain('build');
      expect(content).toContain('node build.js');
      expect(content).toContain('node build-admin.js');
    });

    it('includes version sync check', () => {
      // CS-021: version-check consolidated into Gate 9 build job
      expect(content).toContain('pre-commit-version-check');
    });

    it('includes extension build check', () => {
      // CS-021: extension-build consolidated into Gate 9 build job
      expect(content).toContain('manifest.json');
    });

    it('uses concurrency to cancel stale runs', () => {
      expect(content).toContain('concurrency');
      expect(content).toContain('cancel-in-progress');
    });
  });

  describe('deploy.yml — production deploy', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(workflowDir, 'deploy.yml'), 'utf8');
    });

    it('triggers only on main branch', () => {
      expect(content).toContain('branches: [main]');
    });

    it('includes Supabase migration job', () => {
      expect(content).toContain('migrate');
      expect(content).toContain('supabase db push');
    });

    it('includes Edge Function deploy job', () => {
      expect(content).toContain('deploy-functions');
      expect(content).toContain('supabase functions deploy');
    });

    it('builds both dashboard and admin bundles', () => {
      expect(content).toContain('node build.js');
      expect(content).toContain('node build-admin.js');
    });

    it('includes extension build + artifact upload', () => {
      expect(content).toContain('build-extension');
      expect(content).toContain('upload-artifact');
      expect(content).toContain('brilliant-jobs-extension');
    });
  });

  describe('load-test.yml — manual load test trigger', () => {
    let content;
    beforeAll(() => {
      content = readFileSync(join(workflowDir, 'load-test.yml'), 'utf8');
    });

    it('uses workflow_dispatch (manual trigger only)', () => {
      expect(content).toContain('workflow_dispatch');
    });

    it('offers profile selection', () => {
      expect(content).toContain('smoke');
      expect(content).toContain('ramp');
      expect(content).toContain('spike');
    });

    it('offers target selection for all surfaces', () => {
      expect(content).toContain('preview-jobs');
      expect(content).toContain('dashboard-api');
      expect(content).toContain('extension-heartbeat');
      expect(content).toContain('admin-concurrent');
      expect(content).toContain('full-suite');
    });

    it('offers staging and production environments', () => {
      expect(content).toContain('staging');
      expect(content).toContain('production');
    });

    it('uploads results as artifacts', () => {
      expect(content).toContain('upload-artifact');
    });

    it('has timeout to prevent runaway tests', () => {
      expect(content).toContain('timeout-minutes');
    });
  });
});

// ─── FIX-21: Staging Documentation ────────────────────────

describe('FIX-21: Staging Configuration', () => {
  it('docs/STAGING.md exists', () => {
    expect(existsSync(join(ROOT, 'docs', 'STAGING.md'))).toBe(true);
  });

  it('STAGING.md documents the workflow', () => {
    const content = readFileSync(join(ROOT, 'docs', 'STAGING.md'), 'utf8');
    expect(content).toContain('Feature branch');
    expect(content).toContain('staging');
    expect(content).toContain('main');
    expect(content).toContain('Vercel');
  });

  it('STAGING.md lists required GitHub secrets', () => {
    const content = readFileSync(join(ROOT, 'docs', 'STAGING.md'), 'utf8');
    expect(content).toContain('SUPABASE_DB_URL');
    expect(content).toContain('SUPABASE_PROJECT_REF');
    expect(content).toContain('SUPABASE_ACCESS_TOKEN');
    expect(content).toContain('K6_TEST_EMAIL');
  });

  it('STAGING.md documents CI/CD workflows', () => {
    const content = readFileSync(join(ROOT, 'docs', 'STAGING.md'), 'utf8');
    expect(content).toContain('ci.yml');
    expect(content).toContain('deploy.yml');
    expect(content).toContain('load-test.yml');
  });
});
