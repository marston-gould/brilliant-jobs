#!/usr/bin/env node
// scripts/ff-05-crewai-observe-guard.mjs — SA-026 Fitness Function 05: CrewAI Observe Guard
// Verifies that all CrewAI agents remain in observe mode (executed = false) unless
// explicitly graduated by Marston. This is a safety invariant — agents must never
// autonomously execute real actions without formal graduation approval.
//
// An agent "escaping" observe mode in code is a critical regression, not a feature.
//
// Usage: node scripts/ff-05-crewai-observe-guard.mjs

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const EF_DIR = join(ROOT, 'supabase/functions');
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');

// Pattern that marks an AGENT CONFIG as executing real actions (not action log entries)
// We specifically want to catch: agent_config rows where executed=true, which bypasses observe mode
// We do NOT want to catch: agent_action_log.executed=true (that's just logging that an action happened)
const EXECUTE_TRUE_PATTERN = /agent_config.*executed.*true|executed.*=.*true.*agent_config/i;
// Also catch direct const/let assignments that might enable execution in EF logic
const EXECUTE_FLAG_PATTERN = /const\s+EXECUTE\s*=\s*true|let\s+EXECUTE\s*=\s*true|EXECUTE_ACTIONS\s*=\s*true/;

// Agents known to have been formally graduated by Marston (update this list when graduation happens)
const GRADUATED_AGENTS = [
  // Empty: no agents have been graduated yet as of SA-026
  // When an agent graduates, add its EF name here with graduation date:
  // 'crewai-content-qa',  // graduated 2026-XX-XX Marston-approved
];

// EF directories that contain CrewAI agent logic
const CREWAI_EF_PREFIX = 'crewai-';

let failures = 0;
let passed = 0;
const observedAgents = [];

console.log('🔍 FF-05: CrewAI Observe Mode Guard');
console.log('='.repeat(60));

// Find all crewai-* EF directories
const efDirs = readdirSync(EF_DIR).filter(name => name.startsWith(CREWAI_EF_PREFIX));
console.log(`Found ${efDirs.length} CrewAI EF directories\n`);

// Check each EF for observe mode violations
for (const ef of efDirs) {
  const efPath = join(EF_DIR, ef, 'index.ts');
  if (!existsSync(efPath)) continue;

  const content = readFileSync(efPath, 'utf8');

  if (GRADUATED_AGENTS.includes(ef)) {
    console.log(`  🎓 ${ef} — GRADUATED (Marston-approved, execute:true permitted)`);
    passed++;
    continue;
  }

  // Check for execute:true which would bypass observe mode in agent config context
  if (EXECUTE_TRUE_PATTERN.test(content) || EXECUTE_FLAG_PATTERN.test(content)) {
    console.error(`  ❌ ${ef} — OBSERVE MODE VIOLATION: executed=true found in source`);
    console.error(`     This agent would execute real actions without Marston graduation approval.`);
    failures++;
  } else {
    console.log(`  ✅ ${ef} — observe mode intact`);
    observedAgents.push(ef);
    passed++;
  }
}

// Also check migrations for any agent_config inserts that set executed=true
console.log('\n--- Checking migrations for observe mode violations ---');
const migrationFiles = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
let migrationViolations = 0;

for (const f of migrationFiles) {
  const content = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
  // Look for agent_config inserts with executed=true
  if (/INSERT.*agent_config.*executed.*true/i.test(content) ||
      /agent_config.*executed.*=.*true/i.test(content)) {
    // This is fine IF the agent is in the graduated list — check by also finding agent name
    const agentNameMatch = content.match(/INSERT.*agent_config.*['"]([a-z-]+)['"]/);
    const agentName = agentNameMatch ? `crewai-${agentNameMatch[1]}` : 'unknown';
    if (!GRADUATED_AGENTS.includes(agentName)) {
      console.error(`  ❌ ${f} — agent inserted with executed=true: ${agentName}`);
      migrationViolations++;
      failures++;
    }
  }
}

if (migrationViolations === 0) {
  console.log(`  ✅ No migration violations found`);
  passed++;
}

// Summary
console.log('');
console.log(`Agents in observe mode: ${observedAgents.length}`);
console.log(`Graduated agents: ${GRADUATED_AGENTS.length}`);
console.log(`Results: ${passed} passed, ${failures} failures`);

if (failures > 0) {
  console.error(`\n❌ FF-05 FAILED: CrewAI observe mode safety invariant broken.`);
  console.error('   Agents must remain in observe mode until formally graduated by Marston.');
  console.error('   To graduate an agent:');
  console.error('   1. Get explicit approval from Marston');
  console.error('   2. Use the /crewai-graduation?action=graduate endpoint');
  console.error('   3. Add the agent name to GRADUATED_AGENTS in this script');
  console.error('   4. Document in HANDOFF.md under completed sessions');
  process.exit(1);
}

console.log('\n✅ FF-05 PASSED: All CrewAI agents are safely in observe mode.');
