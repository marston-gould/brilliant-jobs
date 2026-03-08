#!/usr/bin/env node
// scripts/ff-02-scar-integrity.mjs — SA-026 Fitness Function 02: Scar Integrity
// Verifies all S-XX scar points are still present and haven't been accidentally
// overwritten during routine development. Scars are dormant extension points —
// their accidental removal leaves future developers with no seam to attach to.
//
// Usage: node scripts/ff-02-scar-integrity.mjs

import { readFileSync, existsSync } from 'fs';
import { readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// Each scar: id, description, file(s) to check, pattern that proves the scar exists
const SCARS = [
  {
    id: 'S-01',
    desc: 'x-gateway-* header contract in gateway (EF auth trust migration point)',
    file: 'supabase/functions/api-gateway/index.ts',
    pattern: /x-gateway-db-mode|x-gateway-db-target|x-gateway-/,
  },
  {
    id: 'S-02',
    desc: 'parseJson<T>() generic typed JSON parse in _shared/types.ts',
    file: 'supabase/functions/_shared/types.ts',
    pattern: /parseJson/,
  },
  {
    id: 'S-06',
    desc: 'FLAG_AWARE_ROUTES expansion scar in feature-flag-middleware',
    file: 'supabase/functions/_shared/feature-flag-middleware.ts',
    pattern: /FLAG_AWARE_ROUTES|S-06/,
  },
  {
    id: 'S-07',
    desc: 'PostHog Remote Flags swap scar in FeatureFlagProvider',
    file: 'src/app/providers/FeatureFlagProvider.tsx',
    pattern: /S-07|PostHog Remote Flags|posthog.*remote/i,
  },
  {
    id: 'S-10',
    desc: 'DataProvider interface swap scar (Supabase → direct API migration)',
    file: 'src/app/providers/types.ts',
    pattern: /SearchProvider|DataProvider|S-10/,
  },
  {
    id: 'S-13',
    desc: 'fn_partition_health() defined in DB as CrewAI integration point (not yet called by agent)',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /fn_partition_health/,
    checkInDir: true,
  },
  {
    id: 'S-04',
    desc: 'webhook_subscriptions event_filters content-based filter scar',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /webhook_subscriptions|event_filters/,
    checkInDir: true,
  },
  {
    id: 'S-09',
    desc: 'ats_jobs_change_log.op column for field-level incremental deltas',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /ats_jobs_change_log|change_log/,
    checkInDir: true,
  },
];

function checkInDirectory(dir, pattern) {
  const fullDir = join(ROOT, dir);
  if (!existsSync(fullDir)) return false;
  try {
    const files = readdirSync(fullDir);
    for (const f of files) {
      try {
        const content = readFileSync(join(fullDir, f), 'utf8');
        if (pattern.test(content)) return true;
      } catch { /* skip unreadable */ }
    }
  } catch { return false; }
  return false;
}

let failures = 0;
let passed = 0;

console.log('🔍 FF-02: Scar Point Integrity Check');
console.log('='.repeat(60));

for (const scar of SCARS) {
  if (scar.checkInDir) {
    const found = checkInDirectory(scar.glob, scar.globPattern);
    if (!found) {
      console.error(`❌ ${scar.id} SCAR MISSING — ${scar.desc}`);
      failures++;
    } else {
      console.log(`✅ ${scar.id} — ${scar.desc}`);
      passed++;
    }
  } else {
    const filePath = join(ROOT, scar.file);
    if (!existsSync(filePath)) {
      console.error(`❌ ${scar.id} FILE MISSING — ${scar.desc}`);
      console.error(`   Expected: ${scar.file}`);
      failures++;
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (!scar.pattern.test(content)) {
      console.error(`❌ ${scar.id} SCAR PATTERN GONE — ${scar.desc}`);
      console.error(`   Pattern /${scar.pattern.source}/ not found in ${scar.file}`);
      failures++;
    } else {
      console.log(`✅ ${scar.id} — ${scar.desc}`);
      passed++;
    }
  }
}

console.log('');
console.log(`Results: ${passed} scars intact, ${failures} eroded`);

if (failures > 0) {
  console.error(`\n❌ FF-02 FAILED: ${failures} scar point(s) missing.`);
  console.error('   Scars are deliberate extension seams. Removing them eliminates future flexibility.');
  console.error('   To remove a scar intentionally, update the technical debt register and get');
  console.error('   Chief Architect + Evolvability Strategist sign-off. Then update this script.');
  process.exit(1);
}

console.log('\n✅ FF-02 PASSED: All scar points intact — architecture remains evolvable.');
