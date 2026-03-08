#!/usr/bin/env node
// scripts/ff-08-architecture-boundaries.mjs — SA-026 Fitness Function 08: Architecture Boundaries
// Enforces the bridge pattern: React components must NOT directly access window.BJ,
// window._cache*, or other BJ globals. Data flows through hooks only.
//
// Also checks: no direct Supabase calls from component files (must go through providers),
// no inline style violations in new component files (design system compliance).
//
// Usage: node scripts/ff-08-architecture-boundaries.mjs

import { readFileSync, existsSync } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const ROOT = process.cwd();

// Allowed window.* patterns in component files (non-hook, non-utility files)
// window.open, window.location, window.scrollTo are DOM APIs — allowed
// window.BJ, window._*, window.posthog, window.resumes etc are BJ globals — forbidden in components
const FORBIDDEN_IN_COMPONENTS = [
  /window\.BJ\b/,
  /window\._[a-zA-Z]/,   // window._pipelineCache, window._pendingSignals etc
  /window\.resumes\b/,
  /window\.savedFilters\b/,
  /window\.appQueue\b/,
  /window\.appHistory\b/,
  /window\.readinessCache\b/,
  /window\.posthog\b/,
];

// Direct Supabase imports in component files (should come from providers/hooks)
const FORBIDDEN_SUPABASE_IN_COMPONENTS = /from ['"]@supabase\/supabase-js['"]|createClient.*supabase/;

// Files/dirs that ARE allowed to use window.* directly (hooks, shared utilities)
const ALLOWED_WINDOW_PATTERNS = ['hooks/', 'providers/', 'shell/', 'utils/', '.test.'];
const ALLOWED_SUPABASE_PATTERNS = ['providers/', 'hooks/', '_shared/', 'gateway', 'utils/'];

function getAllFiles(dir, ext = '.tsx') {
  const results = [];
  if (!existsSync(dir)) return results;
  
  function walk(current) {
    const entries = readdirSync(current);
    for (const entry of entries) {
      const fullPath = join(current, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (extname(entry) === ext) {
        results.push(fullPath);
      }
    }
  }
  walk(dir);
  return results;
}

function isAllowedFile(filePath, allowedPatterns) {
  return allowedPatterns.some(p => filePath.includes(p));
}

let failures = 0;
let passed = 0;
const violations = [];

console.log('🔍 FF-08: Architecture Boundary Enforcement');
console.log('='.repeat(60));

// Get all .tsx files in src/app
const tsxFiles = getAllFiles(join(ROOT, 'src/app'), '.tsx');
console.log(`Scanning ${tsxFiles.length} .tsx files for boundary violations\n`);

// Check 1: No BJ globals directly in component files
console.log('--- Bridge pattern enforcement: components must not access BJ globals ---');
let bridgeViolations = 0;
for (const filePath of tsxFiles) {
  if (isAllowedFile(filePath, ALLOWED_WINDOW_PATTERNS)) continue;
  
  const content = readFileSync(filePath, 'utf8');
  const relPath = filePath.replace(ROOT + '/', '');
  
  for (const pattern of FORBIDDEN_IN_COMPONENTS) {
    if (pattern.test(content)) {
      // Extra check: window.open and window.location are OK
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i]) && 
            !lines[i].includes('window.open') && 
            !lines[i].includes('window.location') &&
            !lines[i].includes('window.scroll') &&
            !lines[i].trim().startsWith('//')) {
          violations.push({ file: relPath, line: i + 1, pattern: pattern.source, content: lines[i].trim() });
          bridgeViolations++;
          failures++;
          break;
        }
      }
    }
  }
}

if (bridgeViolations === 0) {
  console.log(`  ✅ No bridge pattern violations — all ${tsxFiles.length} components use hook layer`);
  passed++;
} else {
  console.error(`  ❌ ${bridgeViolations} bridge pattern violation(s) found:`);
  for (const v of violations.slice(0, 10)) {
    console.error(`     ${v.file}:${v.line} — ${v.content.substring(0, 80)}`);
  }
}

// Check 2: No direct Supabase imports in pure component files
console.log('\n--- Supabase provider isolation: components must not import supabase-js directly ---');
let supabaseViolations = 0;
for (const filePath of tsxFiles) {
  if (isAllowedFile(filePath, ALLOWED_SUPABASE_PATTERNS)) continue;
  
  const content = readFileSync(filePath, 'utf8');
  if (FORBIDDEN_SUPABASE_IN_COMPONENTS.test(content)) {
    const relPath = filePath.replace(ROOT + '/', '');
    console.error(`  ❌ ${relPath} — direct @supabase/supabase-js import (use DataProvider instead)`);
    supabaseViolations++;
    failures++;
  }
}

if (supabaseViolations === 0) {
  console.log(`  ✅ No direct Supabase imports in component files`);
  passed++;
}

// Check 3: Gateway middleware pipeline structure preserved
console.log('\n--- Gateway middleware pipeline integrity ---');
const gatewayFile = join(ROOT, 'supabase/functions/api-gateway/index.ts');
if (existsSync(gatewayFile)) {
  const content = readFileSync(gatewayFile, 'utf8');
  const requiredMiddleware = [
    'requestLoggerMiddleware',
    'authMiddleware',
    'rateLimiterMiddleware',
    'readReplicaRoutingMiddleware',
    'eventBusMiddleware',
    'featureFlagMiddleware',
  ];
  
  let middlewareMissing = 0;
  for (const mw of requiredMiddleware) {
    if (!content.includes(mw)) {
      console.error(`  ❌ Middleware removed from pipeline: ${mw}`);
      middlewareMissing++;
      failures++;
    }
  }
  if (middlewareMissing === 0) {
    console.log(`  ✅ All ${requiredMiddleware.length} middleware layers present in pipeline`);
    passed++;
  }
}

// Check 4: ADR-09 (this document) exists now that we're creating it
const adr09Path = join(ROOT, 'docs/scaling/adr-09-fitness-functions.md');
if (!existsSync(adr09Path)) {
  console.log('\n  ⚠️  docs/scaling/adr-09-fitness-functions.md not yet created (SA-026 in progress)');
  // Not a failure — we create it in this session
} else {
  console.log('\n  ✅ ADR-09 fitness functions document exists');
  passed++;
}

// Summary
console.log('');
console.log(`Results: ${passed} checks passed, ${failures} failures`);

if (failures > 0) {
  console.error(`\n❌ FF-08 FAILED: Architecture boundary violations found.`);
  console.error('   The bridge pattern (components → hooks → window.*) exists to make');
  console.error('   the React SPA migratable away from legacy JS without touching components.');
  console.error('   Bypassing it ties components to legacy globals, defeating the migration path.');
  process.exit(1);
}

console.log('\n✅ FF-08 PASSED: Architecture boundaries are clean.');
