#!/usr/bin/env node
// scripts/gate-bundle-size.js — CS-021 Gate 3/9: Bundle Size Limits
// Ensures no bundle exceeds size thresholds.
//
// Usage: node scripts/gate-bundle-size.js

import { statSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// Size limits in KB — set at current baseline + 20% headroom
// These prevent GROWTH, not enforce ideal sizes.
// Dashboard JS is large due to inline vendor code (echarts, etc.) — tracked for split.
const LIMITS = [
  { name: 'Dashboard JS', file: 'dist/dashboard.min.js', maxKB: 1000 },
  { name: 'Admin JS', file: 'dist/admin.min.js', maxKB: 550 },
  { name: 'CSS Bundle', file: 'styles.css', maxKB: 200 },
  { name: 'Landing Page', file: 'index.html', maxKB: 150 },
  { name: 'Dashboard HTML', file: 'dashboard.html', maxKB: 350 },
  { name: 'Admin HTML', file: 'admin.html', maxKB: 200 },
];

let failures = 0;

for (const { name, file, maxKB } of LIMITS) {
  const filepath = join(ROOT, file);
  if (!existsSync(filepath)) {
    console.warn(`⚠️  SKIP: ${name} (${file}) — not found`);
    continue;
  }

  const stat = statSync(filepath);
  const sizeKB = Math.round(stat.size / 1024);

  if (sizeKB > maxKB) {
    console.error(`❌ FAIL: ${name} — ${sizeKB}KB exceeds ${maxKB}KB limit`);
    failures++;
  } else {
    const pct = Math.round((sizeKB / maxKB) * 100);
    console.log(`✅ ${name} — ${sizeKB}KB / ${maxKB}KB (${pct}%)`);
  }
}

console.log(`\nGate 3/9: Bundle Size Check`);
console.log(`  Failures: ${failures}`);

if (failures > 0) {
  console.error(`\n❌ Bundle size gate FAILED — ${failures} bundle(s) over limit.`);
  process.exit(1);
} else {
  console.log('\n✅ Bundle size gate PASSED.');
}
