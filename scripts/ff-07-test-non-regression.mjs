#!/usr/bin/env node
// scripts/ff-07-test-non-regression.mjs — SA-026 Fitness Function 07: Test Non-Regression
// Verifies that the total test count never decreases. Tests can only be added, never
// silently removed. A falling test count is a warning sign that passing tests are being
// deleted rather than fixed — a pattern discovered in the original audit.
//
// This script counts assertions (not files) because test files can grow.
// The baseline is set conservatively below the current known count.
//
// Usage: node scripts/ff-07-test-non-regression.mjs

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const TEST_DIR = join(ROOT, 'tests');

// Minimum test count thresholds — update these when test suites grow significantly.
// Set conservatively below current known counts to allow minor fluctuation.
// NEVER decrease these numbers.
const THRESHOLDS = {
  // Total test files (all *.test.js in tests/)
  MIN_TEST_FILES: 35,
  // Total assert/expect calls across all test files  
  MIN_ASSERTIONS: 1500,
  // Specific critical test suites that must not shrink
  SUITE_MINIMUMS: {
    'sa-013-spa-scaffold.test.js': 50,
    'sa-018-read-replica.test.js': 60,
    'sa-019-partitioning.test.js': 45,
    'sa-025-feature-flags.test.js': 90,
    'sa-024-event-bus.test.js': 70,
  },
};

function countAssertions(content) {
  // Count various assertion patterns
  const patterns = [
    /\bassert\.\w+\(/g,
    /\bexpect\(/g,
    /\btest\(/g,
    /\bit\(/g,
  ];
  let count = 0;
  for (const p of patterns) {
    const matches = content.match(p);
    if (matches) count += matches.length;
  }
  return count;
}

let failures = 0;
let passed = 0;

console.log('🔍 FF-07: Test Count Non-Regression Check');
console.log('='.repeat(60));

// Count all test files
const testFiles = readdirSync(TEST_DIR)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log(`Found ${testFiles.length} test files (minimum: ${THRESHOLDS.MIN_TEST_FILES})`);

if (testFiles.length < THRESHOLDS.MIN_TEST_FILES) {
  console.error(`❌ TEST FILE REGRESSION: ${testFiles.length} files < minimum ${THRESHOLDS.MIN_TEST_FILES}`);
  failures++;
} else {
  console.log(`✅ Test file count: ${testFiles.length}`);
  passed++;
}

// Count total assertions
let totalAssertions = 0;
const suiteCounts = {};

for (const f of testFiles) {
  const content = readFileSync(join(TEST_DIR, f), 'utf8');
  const count = countAssertions(content);
  totalAssertions += count;
  suiteCounts[f] = count;
}

console.log(`\nTotal assertions: ${totalAssertions} (minimum: ${THRESHOLDS.MIN_ASSERTIONS})`);

if (totalAssertions < THRESHOLDS.MIN_ASSERTIONS) {
  console.error(`❌ ASSERTION REGRESSION: ${totalAssertions} < minimum ${THRESHOLDS.MIN_ASSERTIONS}`);
  console.error('   Tests were deleted or gutted. This is never acceptable.');
  failures++;
} else {
  console.log(`✅ Total assertion count: ${totalAssertions}`);
  passed++;
}

// Check specific critical suites
console.log('\n--- Critical suite minimums ---');
for (const [suite, minCount] of Object.entries(THRESHOLDS.SUITE_MINIMUMS)) {
  const actual = suiteCounts[suite];
  if (actual === undefined) {
    console.error(`  ❌ SUITE MISSING: ${suite} — critical test suite was deleted`);
    failures++;
  } else if (actual < minCount) {
    console.error(`  ❌ ${suite}: ${actual} assertions < minimum ${minCount}`);
    failures++;
  } else {
    console.log(`  ✅ ${suite}: ${actual} assertions`);
    passed++;
  }
}

// Summary
console.log('');
console.log(`Results: ${passed} checks passed, ${failures} failures`);

if (failures > 0) {
  console.error(`\n❌ FF-07 FAILED: Test count has regressed.`);
  console.error('   The original audit found 67 empty catch blocks silencing errors.');
  console.error('   Deleting tests is the same pattern — it makes failures invisible.');
  console.error('   Fix failing tests. Do not delete them. Update MIN counts only when');
  console.error('   suites are intentionally restructured with QA Engineer sign-off.');
  process.exit(1);
}

console.log('\n✅ FF-07 PASSED: Test count is stable or growing.');
