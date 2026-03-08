#!/usr/bin/env node
// tests/sa-026-fitness-functions.test.js
// Validates that all 8 architecture fitness function scripts exist, are well-formed,
// and that the CI workflow correctly includes them.
// SA-026 — Phase S6: Fitness Functions + Evolvability Framework

import assert from 'assert';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ❌ ${name}: ${e.message}`);
    failures.push({ name, error: e.message });
    failed++;
  }
}

console.log('\n📋 SA-026: Fitness Functions + Evolvability Framework Tests');
console.log('='.repeat(70));

// ── Section 1: Fitness Function Scripts Exist ─────────────────────────────
console.log('\n[1] Fitness function scripts exist');

const FF_SCRIPTS = [
  'scripts/ff-01-hook-integrity.mjs',
  'scripts/ff-02-scar-integrity.mjs',
  'scripts/ff-03-migration-sequence.mjs',
  'scripts/ff-04-ef-route-registry.mjs',
  'scripts/ff-05-crewai-observe-guard.mjs',
  'scripts/ff-06-adr-compliance.mjs',
  'scripts/ff-07-test-non-regression.mjs',
  'scripts/ff-08-architecture-boundaries.mjs',
];

for (const script of FF_SCRIPTS) {
  test(`${script} exists`, () => {
    assert.ok(existsSync(join(ROOT, script)), `Missing: ${script}`);
  });
}

// ── Section 2: Script Content Validation ─────────────────────────────────
console.log('\n[2] Script content validation');

test('FF-01 references H-01 through H-15 hook IDs', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-01-hook-integrity.mjs'), 'utf8');
  assert.ok(content.includes("id: 'H-01'"), 'Missing H-01');
  assert.ok(content.includes("id: 'H-10'"), 'Missing H-10');
  assert.ok(content.match(/process\.exit\(1\)/), 'Missing process.exit(1) on failure');
});

test('FF-02 references S-01 through S-13 scar IDs', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-02-scar-integrity.mjs'), 'utf8');
  assert.ok(content.includes("id: 'S-01'"), 'Missing S-01');
  assert.ok(content.includes("id: 'S-13'"), 'Missing S-13');
  assert.ok(content.match(/process\.exit\(1\)/), 'Missing process.exit(1) on failure');
});

test('FF-03 checks v6.XX scaling migration sequence', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-03-migration-sequence.mjs'), 'utf8');
  assert.ok(content.includes('SCALING_PATTERN'), 'Missing SCALING_PATTERN');
  assert.ok(content.includes('MIN_SCALING_MIGRATIONS'), 'Missing minimum count threshold');
});

test('FF-04 checks EF directory ↔ gateway route sync', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-04-ef-route-registry.mjs'), 'utf8');
  assert.ok(content.includes('ROUTE_REGISTRY'), 'Missing ROUTE_REGISTRY reference');
  assert.ok(content.includes('MIN_ROUTES'), 'Missing MIN_ROUTES threshold');
  assert.ok(content.includes('EXCLUDED_FROM_GATEWAY'), 'Missing exclusion list');
});

test('FF-05 has GRADUATED_AGENTS list and observe mode check', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-05-crewai-observe-guard.mjs'), 'utf8');
  assert.ok(content.includes('GRADUATED_AGENTS'), 'Missing GRADUATED_AGENTS list');
  assert.ok(content.includes('EXECUTE_TRUE_PATTERN'), 'Missing execute:true detection pattern');
  assert.ok(content.includes('CREWAI_EF_PREFIX'), 'Missing EF prefix pattern');
});

test('FF-06 checks all 8 ADRs', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-06-adr-compliance.mjs'), 'utf8');
  for (let i = 1; i <= 8; i++) {
    assert.ok(content.includes(`ADR-0${i}`), `Missing ADR-0${i} check`);
  }
  assert.ok(content.includes('adr-08-feature-flags.md'), 'Missing ADR-08 file check');
});

test('FF-07 has MIN_TEST_FILES and MIN_ASSERTIONS thresholds', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-07-test-non-regression.mjs'), 'utf8');
  assert.ok(content.includes('MIN_TEST_FILES'), 'Missing MIN_TEST_FILES');
  assert.ok(content.includes('MIN_ASSERTIONS'), 'Missing MIN_ASSERTIONS');
  assert.ok(content.includes('SUITE_MINIMUMS'), 'Missing per-suite minimums');
});

test('FF-08 checks bridge pattern and Supabase isolation', () => {
  const content = readFileSync(join(ROOT, 'scripts/ff-08-architecture-boundaries.mjs'), 'utf8');
  assert.ok(content.includes('FORBIDDEN_IN_COMPONENTS'), 'Missing forbidden patterns list');
  assert.ok(content.includes('FORBIDDEN_SUPABASE_IN_COMPONENTS'), 'Missing Supabase isolation check');
  assert.ok(content.includes('ALLOWED_WINDOW_PATTERNS'), 'Missing allowlist for hooks/providers');
});

// ── Section 3: CI Workflow Integration ───────────────────────────────────
console.log('\n[3] CI workflow integration');

const CI_FILE = join(ROOT, '.github/workflows/ci.yml');

test('CI file exists', () => {
  assert.ok(existsSync(CI_FILE), 'ci.yml missing');
});

test('CI includes fitness-functions job', () => {
  const content = readFileSync(CI_FILE, 'utf8');
  assert.ok(content.includes('fitness-functions:'), 'Missing fitness-functions job');
});

test('CI fitness-functions job runs all 8 scripts', () => {
  const content = readFileSync(CI_FILE, 'utf8');
  for (let i = 1; i <= 8; i++) {
    const padded = String(i).padStart(2, '0');
    assert.ok(content.includes(`ff-0${i}-`), `Missing FF-0${i} script in CI`);
  }
});

test('CI all-gates includes fitness-functions in needs', () => {
  const content = readFileSync(CI_FILE, 'utf8');
  assert.ok(content.includes('fitness-functions.result'), 'fitness-functions not in gate conditions');
  assert.ok(
    content.includes('needs: [lint, monitoring, test, ef-auth, secret-scan, design-check, build, compliance, fitness-functions]'),
    'fitness-functions not in needs array'
  );
});

test('CI summary reports 18 gates (not 10)', () => {
  const content = readFileSync(CI_FILE, 'utf8');
  assert.ok(content.includes('18 quality gates'), 'CI still reports 10 gates, not 18');
});

// ── Section 4: Gateway Fix ────────────────────────────────────────────────
console.log('\n[4] Gateway route fix (refresh-mv-incremental → refresh-materialized-views)');

test('Gateway refresh-mv-incremental points to refresh-materialized-views EF', () => {
  const content = readFileSync(join(ROOT, 'supabase/functions/api-gateway/index.ts'), 'utf8');
  assert.ok(
    content.includes('"refresh-mv-incremental":') && content.includes('"refresh-materialized-views"'),
    'Route fix not applied'
  );
  assert.ok(
    !content.includes('"refresh-mv-incremental":     "refresh-mv-incremental"'),
    'Dangling self-referencing route still present'
  );
});

test('refresh-materialized-views EF directory exists', () => {
  assert.ok(
    existsSync(join(ROOT, 'supabase/functions/refresh-materialized-views')),
    'refresh-materialized-views EF directory missing'
  );
});

// ── Section 5: ADR-09 Document ────────────────────────────────────────────
console.log('\n[5] ADR-09 fitness functions document');

const ADR09 = join(ROOT, 'docs/scaling/adr-09-fitness-functions.md');

test('ADR-09 document exists', () => {
  assert.ok(existsSync(ADR09), 'adr-09-fitness-functions.md not created');
});

test('ADR-09 references all 8 fitness functions', () => {
  const content = readFileSync(ADR09, 'utf8');
  for (let i = 1; i <= 8; i++) {
    const padded = String(i).padStart(2, '0');
    assert.ok(content.includes(`FF-0${i}`), `ADR-09 missing FF-0${i}`);
  }
});

test('ADR-09 documents hook-and-scar evolvability rationale', () => {
  const content = readFileSync(ADR09, 'utf8');
  assert.ok(content.includes('hook') || content.includes('Hook'), 'Missing hook discussion');
  assert.ok(content.includes('scar') || content.includes('Scar'), 'Missing scar discussion');
  assert.ok(content.includes('evolvab') || content.includes('Evolvab'), 'Missing evolvability discussion');
});

// ── Section 6: Evolvability Review Template ──────────────────────────────
console.log('\n[6] Evolvability review template');

const EVOLVABILITY_TEMPLATE = join(ROOT, 'docs/scaling/evolvability-review-template.md');

test('Evolvability review template exists', () => {
  assert.ok(existsSync(EVOLVABILITY_TEMPLATE), 'evolvability-review-template.md not created');
});

test('Evolvability template includes hook utilization section', () => {
  const content = readFileSync(EVOLVABILITY_TEMPLATE, 'utf8');
  assert.ok(content.includes('Hook') || content.includes('hook'), 'Missing hook section');
  assert.ok(content.includes('Scar') || content.includes('scar'), 'Missing scar section');
  assert.ok(content.includes('Technical Debt') || content.includes('technical debt'), 'Missing tech debt section');
});

// ── Section 7: Technical Debt Register ───────────────────────────────────
console.log('\n[7] Technical debt register');

const DEBT_REGISTER = join(ROOT, 'docs/scaling/technical-debt-register.md');

test('Technical debt register exists', () => {
  assert.ok(existsSync(DEBT_REGISTER), 'technical-debt-register.md not created');
});

test('Technical debt register has S-01 EF auth trust migration documented', () => {
  const content = readFileSync(DEBT_REGISTER, 'utf8');
  assert.ok(content.includes('S-01') || content.includes('EF auth'), 'S-01 scar not in debt register');
});

// ── Section 8: Dependabot / Renovate Config ───────────────────────────────
console.log('\n[8] Dependency automation config');

const DEPENDABOT = join(ROOT, '.github/dependabot.yml');

test('Dependabot config exists', () => {
  assert.ok(existsSync(DEPENDABOT), '.github/dependabot.yml not created');
});

test('Dependabot config covers npm dependencies', () => {
  const content = readFileSync(DEPENDABOT, 'utf8');
  assert.ok(content.includes('npm') || content.includes('package-ecosystem'), 'Missing npm ecosystem');
});

// ── Final Summary ──────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  ❌ ${f.name}: ${f.error}`);
  }
  process.exit(1);
}

console.log('\n✅ All SA-026 fitness function tests passed.');
