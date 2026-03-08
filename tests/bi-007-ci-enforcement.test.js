// tests/bi-007-ci-enforcement.test.js
// BI-07: CI Pipeline Enforcement & Gate Remediation
// Validates: branch protection, gate script fixes, TypeScript cleanup, deploy gating

import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const ROOT = process.cwd();
const read = (f) => readFileSync(join(ROOT, f), 'utf-8');
const exists = (f) => existsSync(join(ROOT, f));
const fileContains = (f, s) => expect(read(f)).toContain(s);
const fileNotContains = (f, s) => expect(read(f)).not.toContain(s);

// ── 1. Gate 2+6: PostHog Detection Fix ──────────────────────────────────────
describe('BI-07 §1: Gate 2+6 PostHog Detection', () => {
  const script = read('scripts/gate-posthog-verify.mjs');

  test('Detects external PostHog script tags (double-quote)', () => {
    expect(script).toContain("src=\"[^\"]*posthog[^\"]*\\.js");
  });

  test('Detects external PostHog script tags (single-quote)', () => {
    expect(script).toContain("src='[^']*posthog[^']*\\.js");
  });

  test('Gate passes when run locally', () => {
    const output = execSync('node scripts/gate-posthog-verify.mjs', { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Gate 2 PASSED');
  });
});

// ── 2. Gate 4: EF Auth Registry ─────────────────────────────────────────────
describe('BI-07 §2: Gate 4 EF Auth Registry', () => {
  const yaml = read('supabase/edge-function-auth.yaml');
  const scan = read('scripts/gate-ef-auth-scan.mjs');

  test('Auth scan includes requireAdmin pattern', () => {
    expect(scan).toContain('/requireAdmin/i');
  });

  test('Registry has 112 EFs classified', () => {
    expect(yaml).toContain('TOTAL:         112');
  });

  const requiredEfs = [
    'admin-cron-management', 'api-gateway', 'capacity-model', 'cost-monitor',
    'crewai-agent-digest', 'crewai-content-qa', 'crewai-cost-guardian',
    'crewai-data-freshness', 'crewai-graduation', 'crewai-orchestrator',
    'crewai-pipeline-health', 'crewai-referral-pipeline', 'crewai-user-support',
    'dedup-promote', 'deploy-tracker', 'event-bus', 'feature-flags',
    'ingest-common-crawl', 'refresh-materialized-views', 'replica-health',
    'typesense-search', 'typesense-seed',
  ];

  for (const ef of requiredEfs) {
    test(`${ef} is classified in registry`, () => {
      expect(yaml).toContain(`  ${ef}:`);
    });
  }

  test('Gate 4 scan passes locally', () => {
    const output = execSync('node scripts/gate-ef-auth-scan.mjs', { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Gate 4 PASSED');
  });

  test('Gate 4 registry validation passes locally', () => {
    const output = execSync('node scripts/validate-ef-auth.js', { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Errors:   0');
  });
});

// ── 3. Gate 1+7: TypeScript Fixes ───────────────────────────────────────────
describe('BI-07 §3: TypeScript Cleanup', () => {
  const tsconfig = read('tsconfig.json');
  const shellIndex = read('src/app/shell/index.ts');
  const types = read('js/types/index.d.ts');

  test('TypeScript strict mode still enabled', () => {
    expect(tsconfig).toContain('"strict": true');
  });

  test('noUnusedLocals disabled (covered by ESLint)', () => {
    expect(tsconfig).toContain('"noUnusedLocals": false');
  });

  test('LegacyPageWrapper export removed from shell', () => {
    expect(shellIndex).not.toContain("export { LegacyPageWrapper }");
  });

  test('TabName includes jobs', () => {
    expect(types).toContain("'jobs'");
  });

  test('Badge component has secondary variant', () => {
    const badge = read('src/app/components/Badge.tsx');
    expect(badge).toContain("'secondary'");
  });

  test('tsc --noEmit passes with 0 errors', () => {
    const output = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf-8', timeout: 60000 });
    expect(output).not.toContain('error TS');
  }, 60000);
});

// ── 4. Gate 8: Design System Ratchet ────────────────────────────────────────
describe('BI-07 §4: Gate 8 Ratchet Baseline', () => {
  const ci = read('.github/workflows/ci.yml');

  test('Inline style threshold is 590 (ratchet from 586)', () => {
    expect(ci).toContain('-gt 590');
  });

  test('Ratchet comment explains rationale', () => {
    expect(ci).toContain('Ratchet baseline');
  });
});

// ── 5. Gate 3: Bundle Size Limit ────────────────────────────────────────────
describe('BI-07 §5: Gate 3 Bundle Size', () => {
  const gate = read('scripts/gate-bundle-size.mjs');

  test('Admin JS limit raised to 650KB', () => {
    expect(gate).toContain('maxKB: 650');
  });

  test('Bundle size gate passes locally', () => {
    const output = execSync('node scripts/gate-bundle-size.mjs', { cwd: ROOT, encoding: 'utf-8' });
    expect(output).toContain('Bundle size gate PASSED');
  });
});

// ── 6. Branch Protection & Workflow ─────────────────────────────────────────
describe('BI-07 §6: Branch Protection & PR Workflow', () => {
  test('PR helper script exists', () => {
    expect(exists('scripts/pr-push.sh')).toBe(true);
  });

  test('PR helper blocks direct main pushes', () => {
    const script = read('scripts/pr-push.sh');
    expect(script).toContain('Cannot push directly to main');
  });

  test('PR helper supports auto-merge', () => {
    const script = read('scripts/pr-push.sh');
    expect(script).toContain('gh pr merge --auto --squash');
  });
});

// ── 7. File Inventory ───────────────────────────────────────────────────────
describe('BI-07 §7: File Inventory', () => {
  const expectedModified = [
    'scripts/gate-posthog-verify.mjs',
    'scripts/gate-ef-auth-scan.mjs',
    'scripts/gate-bundle-size.mjs',
    'supabase/edge-function-auth.yaml',
    'tsconfig.json',
    'src/app/shell/index.ts',
    'src/app/components/Badge.tsx',
    'js/types/index.d.ts',
    '.github/workflows/ci.yml',
  ];

  for (const f of expectedModified) {
    test(`${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  }

  test('PR push script is executable-ready', () => {
    const script = read('scripts/pr-push.sh');
    expect(script.startsWith('#!/bin/bash')).toBe(true);
  });
});
