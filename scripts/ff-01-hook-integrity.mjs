#!/usr/bin/env node
// scripts/ff-01-hook-integrity.mjs — SA-026 Fitness Function 01: Hook Integrity
// Verifies all H-XX hook points documented in ADRs still exist at their expected
// locations in the codebase. A hook that disappears silently is an architectural regression.
//
// Usage: node scripts/ff-01-hook-integrity.mjs

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// Each hook: id, file path, regex that must match, description
const HOOKS = [
  {
    id: 'H-01',
    desc: 'Gateway middleware pipeline slots',
    file: 'supabase/functions/api-gateway/index.ts',
    pattern: /middleware|middlewarePipeline|readReplicaRoutingMiddleware/,
  },
  {
    id: 'H-02',
    desc: 'agent_config table — agents register as rows',
    file: 'supabase/migrations/v6.22-dedup-enrichment-queue.sql',
    // We check the agent_config table exists in any migration
    file: null,
    glob: 'supabase/migrations',
    globPattern: /agent_config/,
    checkInDir: true,
  },
  {
    id: 'H-03',
    desc: 'agentEfMap in crewai-orchestrator',
    file: 'supabase/functions/crewai-orchestrator/index.ts',
    pattern: /agentEfMap/,
  },
  {
    id: 'H-04',
    desc: 'AtsHandler interface in extension types',
    file: 'extension/types/index.d.ts',
    pattern: /AtsHandler/,
  },
  {
    id: 'H-05',
    desc: '_shared/types.ts SupabaseClient shared type',
    file: 'supabase/functions/_shared/types.ts',
    pattern: /SupabaseClient/,
  },
  {
    id: 'H-06',
    desc: 'DataProvider React context interfaces',
    file: 'src/app/providers/types.ts',
    pattern: /SearchProvider|JobProvider|UserProvider|PipelineProvider/,
  },
  {
    id: 'H-07',
    desc: 'fn_cost_guardian_summary RPC callable by orchestrator and admin',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /fn_cost_guardian_summary/,
    checkInDir: true,
  },
  {
    id: 'H-10',
    desc: 'x-gateway-* header contract in gateway',
    file: 'supabase/functions/api-gateway/index.ts',
    pattern: /x-gateway/,
  },
  {
    id: 'H-12',
    desc: 'cc_run_dedup_batch() threshold param',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /cc_run_dedup_batch/,
    checkInDir: true,
  },
  {
    id: 'H-15',
    desc: 'fn_referral_pipeline_summary cross-agent correlated reports',
    file: null,
    glob: 'supabase/migrations',
    globPattern: /fn_referral_pipeline_summary/,
    checkInDir: true,
  },
];

import { readdirSync } from 'fs';

function checkInDirectory(dir, pattern) {
  const fullDir = join(ROOT, dir);
  if (!existsSync(fullDir)) return false;
  const files = readdirSync(fullDir);
  for (const f of files) {
    const content = readFileSync(join(fullDir, f), 'utf8');
    if (pattern.test(content)) return true;
  }
  return false;
}

let failures = 0;
let passed = 0;

console.log('🔍 FF-01: Hook Integrity Check');
console.log('='.repeat(60));

for (const hook of HOOKS) {
  if (hook.checkInDir) {
    const found = checkInDirectory(hook.glob, hook.globPattern);
    if (!found) {
      console.error(`❌ ${hook.id} MISSING — ${hook.desc}`);
      console.error(`   Pattern /${hook.globPattern.source}/ not found in ${hook.glob}/`);
      failures++;
    } else {
      console.log(`✅ ${hook.id} — ${hook.desc}`);
      passed++;
    }
  } else {
    const filePath = join(ROOT, hook.file);
    if (!existsSync(filePath)) {
      console.error(`❌ ${hook.id} MISSING FILE — ${hook.desc}`);
      console.error(`   Expected: ${hook.file}`);
      failures++;
      continue;
    }
    const content = readFileSync(filePath, 'utf8');
    if (!hook.pattern.test(content)) {
      console.error(`❌ ${hook.id} PATTERN MISSING — ${hook.desc}`);
      console.error(`   Pattern /${hook.pattern.source}/ not found in ${hook.file}`);
      failures++;
    } else {
      console.log(`✅ ${hook.id} — ${hook.desc}`);
      passed++;
    }
  }
}

console.log('');
console.log(`Results: ${passed} hooks intact, ${failures} missing`);

if (failures > 0) {
  console.error(`\n❌ FF-01 FAILED: ${failures} hook point(s) missing from expected locations.`);
  console.error('   Hooks are architectural contracts. Their removal is a regression, not a refactor.');
  console.error('   Either restore the hook or update this script with a Chief Architect ADR sign-off.');
  process.exit(1);
}

console.log('\n✅ FF-01 PASSED: All hook points intact.');
