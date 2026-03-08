#!/usr/bin/env node
// scripts/ff-06-adr-compliance.mjs — SA-026 Fitness Function 06: ADR Compliance
// Verifies that key architectural decisions documented in ADRs haven't been
// silently reversed. Each ADR decision is distilled into one verifiable assertion.
// Architectural drift is caught here before it becomes a compounding problem.
//
// Usage: node scripts/ff-06-adr-compliance.mjs

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// Each ADR check: adr, decision summary, file to check, assertion (pattern must exist)
const ADR_CHECKS = [
  {
    adr: 'ADR-01',
    decision: 'Typesense deferred post-launch — Postgres FTS is primary search (chat-job-search)',
    file: 'supabase/functions/api-gateway/index.ts',
    // Postgres FTS primary search must remain routed — this is the ADR decision
    assertPresent: /["']chat-job-search["']/,
    assertPresentDesc: 'chat-job-search route in gateway (Postgres FTS primary search)',
  },
  {
    adr: 'ADR-02',
    decision: 'SPA uses React Router — /app/* catch-all rewrite in vercel.json',
    file: 'vercel.json',
    // vercel.json uses /app/:path* — match with path wildcard pattern
    assertPresent: /\/app\/:path|\/app\/\*/,
    assertPresentDesc: '/app/:path* or /app/* catch-all rewrite to SPA in vercel.json',
  },
  {
    adr: 'ADR-03',
    decision: 'All EFs accessed via API gateway — no direct EF calls',
    file: 'supabase/functions/api-gateway/index.ts',
    assertPresent: /ROUTE_REGISTRY/,
    assertPresentDesc: 'ROUTE_REGISTRY in gateway (all EFs go through registry)',
  },
  {
    adr: 'ADR-04',
    decision: 'TypeScript strict mode enforced for all new code',
    file: 'tsconfig.json',
    assertPresent: /"strict"\s*:\s*true/,
    assertPresentDesc: 'strict: true in tsconfig.json',
  },
  {
    adr: 'ADR-05',
    decision: 'All CrewAI agents observe-only until Marston graduation',
    file: 'supabase/functions/crewai-orchestrator/index.ts',
    assertPresent: /agentEfMap|orchestrat/i,
    assertPresentDesc: 'Orchestrator pattern intact in crewai-orchestrator',
  },
  {
    adr: 'ADR-06',
    decision: 'Live web fetch (not WARC) for Common Crawl ingestion',
    file: 'supabase/functions/ingest-common-crawl/index.ts',
    assertPresent: /fetch|live.*web|web.*fetch/i,
    assertPresentDesc: 'Live web fetch pattern in CC ingestion EF',
  },
  {
    adr: 'ADR-07',
    decision: 'Two-tier dedup: URL hash exact match then pg_trgm fuzzy',
    file: null,
    migrationPattern: /cc_find_exact_duplicates|cc_find_fuzzy_duplicates/,
    migrationDir: 'supabase/migrations',
    migrationDesc: 'Two dedup functions (exact + fuzzy) in migrations',
  },
  {
    adr: 'ADR-08',
    decision: 'Feature flags use deterministic bucket assignment (not random)',
    file: null,
    migrationPattern: /fn_evaluate_flag|bucket.*rollout|rollout.*bucket/,
    migrationDir: 'supabase/migrations',
    migrationDesc: 'fn_evaluate_flag with bucket-based rollout in migrations',
  },
];

import { readdirSync } from 'fs';

function checkInMigrations(dir, pattern) {
  const fullDir = join(ROOT, dir);
  const files = readdirSync(fullDir).filter(f => f.endsWith('.sql'));
  for (const f of files) {
    const content = readFileSync(join(fullDir, f), 'utf8');
    if (pattern.test(content)) return true;
  }
  return false;
}

let failures = 0;
let passed = 0;

console.log('🔍 FF-06: ADR Compliance Snapshot');
console.log('='.repeat(60));

for (const check of ADR_CHECKS) {
  const prefix = `  ${check.adr}`;

  if (check.migrationPattern) {
    const found = checkInMigrations(check.migrationDir, check.migrationPattern);
    if (!found) {
      console.error(`${prefix} ❌ DRIFT: ${check.decision}`);
      console.error(`       Missing: ${check.migrationDesc}`);
      failures++;
    } else {
      console.log(`${prefix} ✅ ${check.decision}`);
      passed++;
    }
    continue;
  }

  const filePath = join(ROOT, check.file);
  if (!existsSync(filePath)) {
    console.error(`${prefix} ❌ FILE MISSING: ${check.file}`);
    failures++;
    continue;
  }

  const content = readFileSync(filePath, 'utf8');

  if (check.assertPresent) {
    if (!check.assertPresent.test(content)) {
      console.error(`${prefix} ❌ DRIFT: ${check.decision}`);
      console.error(`       Expected pattern not found: ${check.assertPresentDesc}`);
      failures++;
    } else {
      console.log(`${prefix} ✅ ${check.decision}`);
      passed++;
    }
  }

  if (check.assertAbsent) {
    if (check.assertAbsent.test(content)) {
      console.error(`${prefix} ❌ DRIFT: ${check.decision}`);
      console.error(`       Forbidden pattern found: ${check.assertAbsentDesc}`);
      failures++;
    } else {
      console.log(`${prefix} ✅ ${check.decision}`);
      passed++;
    }
  }
}

// Also verify all ADR files still exist (they're the source of truth)
console.log('\n--- Checking ADR files exist ---');
const adrFiles = [
  'docs/scaling/adr-01-search.md',
  'docs/scaling/adr-02-spa.md',
  'docs/scaling/adr-03-gateway.md',
  'docs/scaling/adr-04-typescript.md',
  'docs/scaling/adr-05-crewai.md',
  'docs/scaling/adr-06-pipeline.md',
  'docs/scaling/adr-07-dedup.md',
  'docs/scaling/adr-08-feature-flags.md',
];

let missingAdrs = 0;
for (const adr of adrFiles) {
  if (!existsSync(join(ROOT, adr))) {
    console.error(`  ❌ ADR file missing: ${adr}`);
    missingAdrs++;
    failures++;
  }
}
if (missingAdrs === 0) {
  console.log(`  ✅ All ${adrFiles.length} ADR files present`);
  passed++;
}

// Summary
console.log('');
console.log(`Results: ${passed} checks passed, ${failures} failures`);

if (failures > 0) {
  console.error(`\n❌ FF-06 FAILED: Architectural decisions have drifted from ADR documentation.`);
  console.error('   Either the code was changed without updating the ADR (drift),');
  console.error('   or the ADR was updated without updating this fitness function (script lag).');
  console.error('   In either case: update the ADR, update the code, or update this script.');
  console.error('   Chief Architect sign-off required for any ADR reversal.');
  process.exit(1);
}

console.log('\n✅ FF-06 PASSED: Codebase is compliant with all ADR decisions.');
