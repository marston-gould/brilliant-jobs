#!/usr/bin/env node
// scripts/gate-ef-auth-scan.js — CS-021 Gate 4: Edge Function Auth Check
// Scans all Supabase Edge Functions for proper auth patterns.
// Fail = any EF lacks authorization header validation.
//
// Allowlist: functions that are intentionally public (e.g., preview-jobs with rate limiting)
//
// Usage: node scripts/gate-ef-auth-scan.js

import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EF_DIR = join(process.cwd(), 'supabase', 'functions');
const SHARED_DIR = join(EF_DIR, '_shared');

// Functions that are intentionally public (must match edge-function-auth.yaml)
const PUBLIC_ALLOWLIST = new Set([
  'preview-jobs',              // Public API with rate limiting (CS-005)
  'confirm-email',             // Email confirmation link handler
  'validate-signup',           // Signup validation (rate limited CS-P1-001)
  'health-check',              // Uptime monitoring endpoint
]);

// Auth patterns we look for (any one is sufficient)
const AUTH_PATTERNS = [
  /authorization/i,
  /req\.headers\.get\(['"]authorization['"]\)/i,
  /supabase.*auth/i,
  /getUser\(/,
  /service_role/i,
  /Bearer/,
  /apikey/i,
  /verifyAuth/i,
  /requireAuth/i,
  /requireAdmin/i,              // BI-07: admin-only EFs use requireAdmin() from admin-auth.ts
  /authMiddleware/i,
  /validateToken/i,
  /stripe.*webhook.*secret/i,
  /STRIPE_WEBHOOK_SECRET/,
];

let failures = 0;
let checked = 0;
let skipped = 0;

if (!existsSync(EF_DIR)) {
  console.error('❌ Edge Functions directory not found:', EF_DIR);
  process.exit(1);
}

const dirs = readdirSync(EF_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== '_shared')
  .map(d => d.name);

for (const fn of dirs) {
  const indexPath = join(EF_DIR, fn, 'index.ts');
  if (!existsSync(indexPath)) continue;

  if (PUBLIC_ALLOWLIST.has(fn)) {
    skipped++;
    continue;
  }

  checked++;
  const content = readFileSync(indexPath, 'utf-8');
  const hasAuth = AUTH_PATTERNS.some(pat => pat.test(content));

  if (!hasAuth) {
    console.error(`❌ FAIL: ${fn}/index.ts — no auth pattern detected`);
    failures++;
  }
}

console.log(`\nGate 4: Edge Function Auth Scan`);
console.log(`  Checked: ${checked}`);
console.log(`  Skipped (public allowlist): ${skipped}`);
console.log(`  Failures: ${failures}`);

if (failures > 0) {
  console.error(`\n❌ Gate 4 FAILED — ${failures} Edge Function(s) missing auth.`);
  console.error('Add auth checks or update PUBLIC_ALLOWLIST in scripts/gate-ef-auth-scan.js');
  process.exit(1);
} else {
  console.log('\n✅ Gate 4 PASSED — All Edge Functions have auth checks.');
}
