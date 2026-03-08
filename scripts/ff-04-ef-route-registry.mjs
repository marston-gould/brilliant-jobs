#!/usr/bin/env node
// scripts/ff-04-ef-route-registry.mjs — SA-026 Fitness Function 04: EF Route Registry
// Verifies that every Edge Function directory has a corresponding route in the
// API gateway. An EF that exists but isn't routed is dead code — it won't be
// reached in production, wastes build resources, and misleads developers.
//
// Also verifies that no route points to a non-existent EF directory.
//
// Usage: node scripts/ff-04-ef-route-registry.mjs

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const EF_DIR = join(ROOT, 'supabase/functions');
const GATEWAY_FILE = join(ROOT, 'supabase/functions/api-gateway/index.ts');

// EFs that are shared utilities, not independently callable endpoints
const SHARED_DIRS = ['_shared', 'api-gateway'];

// EFs intentionally excluded from gateway routing (special-purpose / direct-call only)
const EXCLUDED_FROM_GATEWAY = [
  // Typesense seed is a one-shot migration tool, not a user-facing route
  'typesense-seed',
  'typesense-search',
];

let failures = 0;
let warnings = 0;
let passed = 0;

console.log('🔍 FF-04: EF Route Registry Check');
console.log('='.repeat(60));

// Get all EF directories
const efDirs = readdirSync(EF_DIR)
  .filter(name => {
    const fullPath = join(EF_DIR, name);
    return statSync(fullPath).isDirectory() &&
           !SHARED_DIRS.includes(name) &&
           !name.startsWith('.');
  });

console.log(`Found ${efDirs.length} Edge Function directories (excluding shared)\n`);

// Parse route registry from gateway
const gatewayContent = readFileSync(GATEWAY_FILE, 'utf8');

// Extract all route keys from ROUTE_REGISTRY
// Pattern: "key": "value" inside the ROUTE_REGISTRY block
const routeMatches = [...gatewayContent.matchAll(/"([a-z][a-zA-Z0-9-]+)"\s*:\s*"([a-z][a-zA-Z0-9-]+)"/g)];
const registeredRoutes = new Set(routeMatches.map(m => m[2]));

console.log(`Found ${registeredRoutes.size} routes in ROUTE_REGISTRY\n`);

// Check 1: Every EF has a route (or is explicitly excluded)
console.log('--- Checking EF → Route coverage ---');
let unroutedEfs = [];
for (const ef of efDirs) {
  if (EXCLUDED_FROM_GATEWAY.includes(ef)) {
    console.log(`  ⏭️  ${ef} (explicitly excluded)`);
    continue;
  }
  if (registeredRoutes.has(ef)) {
    passed++;
  } else {
    console.error(`  ❌ EF "${ef}" has no gateway route`);
    unroutedEfs.push(ef);
    failures++;
  }
}

if (unroutedEfs.length === 0) {
  console.log(`  ✅ All ${efDirs.length - EXCLUDED_FROM_GATEWAY.filter(e => efDirs.includes(e)).length} EFs are routed`);
}

// Check 2: Every route points to a real EF directory
console.log('\n--- Checking Route → EF existence ---');
let danglingRoutes = [];
for (const route of registeredRoutes) {
  const efPath = join(EF_DIR, route);
  if (!existsSync(efPath)) {
    console.error(`  ❌ Route "${route}" points to non-existent EF directory`);
    danglingRoutes.push(route);
    failures++;
  }
}

if (danglingRoutes.length === 0) {
  console.log(`  ✅ All ${registeredRoutes.size} routes point to real EF directories`);
  passed++;
}

// Check 3: Route count stays above minimum (regression guard)
const MIN_ROUTES = 100;
if (registeredRoutes.size < MIN_ROUTES) {
  console.error(`\n❌ Route count regression: ${registeredRoutes.size} routes (minimum: ${MIN_ROUTES})`);
  console.error('   Routes were deleted without removing corresponding EFs.');
  failures++;
} else {
  console.log(`\n✅ Route count: ${registeredRoutes.size} (minimum: ${MIN_ROUTES})`);
  passed++;
}

// Summary
console.log('');
console.log(`Results: ${passed} checks passed, ${failures} failures, ${warnings} warnings`);

if (failures > 0) {
  if (unroutedEfs.length > 0) {
    console.error(`\nUnrouted EFs: ${unroutedEfs.join(', ')}`);
    console.error('Add these EFs to ROUTE_REGISTRY in api-gateway/index.ts');
    console.error('Or add to EXCLUDED_FROM_GATEWAY in this script with a documented reason.');
  }
  if (danglingRoutes.length > 0) {
    console.error(`\nDangling routes: ${danglingRoutes.join(', ')}`);
    console.error('These routes point to deleted EF directories. Remove them from ROUTE_REGISTRY.');
  }
  console.error(`\n❌ FF-04 FAILED: Gateway route registry is out of sync with EF directories.`);
  process.exit(1);
}

console.log('\n✅ FF-04 PASSED: Gateway route registry is in sync with all Edge Functions.');
