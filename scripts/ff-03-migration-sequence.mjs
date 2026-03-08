#!/usr/bin/env node
// scripts/ff-03-migration-sequence.mjs — SA-026 Fitness Function 03: Migration Sequence
import { readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const MIGRATIONS_DIR = join(ROOT, 'supabase/migrations');
const SCALING_PATTERN = /^v(\d+)\.(\d+)-(.+)\.sql$/;
const MIN_SCALING_MIGRATIONS = 12;

let failures = 0; let passed = 0;

console.log('🔍 FF-03: Migration Sequence Ordering Check');
console.log('='.repeat(60));

const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
console.log(`Found ${files.length} total migration files\n`);

const scaling = files
  .filter(f => SCALING_PATTERN.test(f))
  .map(f => { const m = f.match(SCALING_PATTERN); return { file: f, major: +m[1], minor: +m[2] }; })
  .sort((a,b) => a.major !== b.major ? a.major - b.major : a.minor - b.minor);

console.log(`  v6.XX scaling migrations: ${scaling.length}`);

// Duplicate check
const seen = new Map();
for (const m of scaling) {
  const key = `${m.major}.${m.minor}`;
  if (seen.has(key)) {
    console.error(`  ❌ DUPLICATE v${key}: "${seen.get(key)}" and "${m.file}"`);
    failures++;
  }
  seen.set(key, m.file);
}

// Sequence check — reset minor counter when major version changes
let prevMajor = -1; let prevMinor = -1; let seqOk = true;
for (const m of scaling) {
  if (m.major !== prevMajor) { prevMajor = m.major; prevMinor = -1; }
  if (m.minor <= prevMinor) {
    console.error(`  ❌ OUT OF ORDER: ${m.file} (minor ${m.minor} after ${prevMinor} in v${m.major}.x)`);
    failures++; seqOk = false;
  }
  prevMinor = m.minor;
}
if (seqOk) { console.log(`  ✅ Sequence: all ${scaling.length} scaling migrations in order`); passed++; }

// Count regression
if (scaling.length < MIN_SCALING_MIGRATIONS) {
  console.error(`  ❌ REGRESSION: ${scaling.length} scaling migrations < minimum ${MIN_SCALING_MIGRATIONS}`);
  failures++;
} else { console.log(`  ✅ Count: ${scaling.length} (min ${MIN_SCALING_MIGRATIONS})`); passed++; }

const latest = scaling[scaling.length - 1];
if (latest) { console.log(`  ✅ Latest: v${latest.major}.${latest.minor}`); passed++; }

console.log(`\nResults: ${passed} passed, ${failures} failures`);
if (failures > 0) { console.error('\n❌ FF-03 FAILED'); process.exit(1); }
console.log('\n✅ FF-03 PASSED: Migration sequence is ordered and well-formed.');
