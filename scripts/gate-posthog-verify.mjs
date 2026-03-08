#!/usr/bin/env node
// scripts/gate-posthog-verify.js — CS-021 Gate 2: Monitoring Verification
// Verifies PostHog is initialized on all HTML surfaces.
//
// Usage: node scripts/gate-posthog-verify.js

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

// All HTML surfaces that must have PostHog
const SURFACES = [
  { name: 'Dashboard', file: 'dashboard.html' },
  { name: 'Landing Page', file: 'index.html' },
  { name: 'Admin', file: 'admin.html' },
  { name: 'Roadmap', file: 'roadmap.html' },
];

// PostHog patterns we look for (inline OR external script references)
const POSTHOG_PATTERNS = [
  /posthog\.init\(/,
  /posthog\.capture\(/,
  /posthog-js/,
  /ph_project_api_key/,
  /initPostHog/,
  /window\.posthog/,
  /src="[^"]*posthog[^"]*\.js/,       // BI-07: external posthog script tags (CSP-compliant pattern)
  /src='[^']*posthog[^']*\.js/,       // BI-07: single-quote variant
];

let failures = 0;

for (const surface of SURFACES) {
  const filepath = join(ROOT, surface.file);
  if (!existsSync(filepath)) {
    console.warn(`⚠️  SKIP: ${surface.name} (${surface.file}) — file not found`);
    continue;
  }

  const content = readFileSync(filepath, 'utf-8');
  const hasPostHog = POSTHOG_PATTERNS.some(pat => pat.test(content));

  if (!hasPostHog) {
    console.error(`❌ FAIL: ${surface.name} (${surface.file}) — no PostHog initialization detected`);
    failures++;
  } else {
    console.log(`✅ ${surface.name} — PostHog initialized`);
  }
}

// Check extension background.js
const bgPath = join(ROOT, 'extension', 'background.js');
if (existsSync(bgPath)) {
  const bgContent = readFileSync(bgPath, 'utf-8');
  if (/posthog|captureEvent|capture\(/.test(bgContent)) {
    console.log('✅ Extension background.js — PostHog events detected');
  } else {
    console.error('❌ FAIL: Extension background.js — no PostHog event capture detected');
    failures++;
  }
}

console.log(`\nGate 2: PostHog Monitoring Verification`);
console.log(`  Failures: ${failures}`);

if (failures > 0) {
  console.error(`\n❌ Gate 2 FAILED — ${failures} surface(s) missing PostHog.`);
  process.exit(1);
} else {
  console.log('\n✅ Gate 2 PASSED — All surfaces have PostHog monitoring.');
}
