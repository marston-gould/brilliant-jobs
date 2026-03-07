#!/usr/bin/env node
// scripts/validate-ef-auth.js
// Gate 04: Edge Function Auth Audit — CI enforcement
// Created: CS-P1-001 (Phase 1 Remediation — SE-004)
//
// Validates that every Edge Function's code matches its classification
// in supabase/edge-function-auth.yaml
//
// Exit codes:
//   0 = all EFs classified and code matches
//   1 = validation failures found

const fs = require('fs');
const path = require('path');
const yaml = require('yaml');

const EF_DIR = path.join(__dirname, '..', 'supabase', 'functions');
const REGISTRY = path.join(__dirname, '..', 'supabase', 'edge-function-auth.yaml');

// Auth patterns to detect in code
const AUTH_PATTERNS = {
  'admin-only': [/requireAdmin/],
  'authenticated': [/auth\.getUser/, /verifyJWT/],
  'cron-internal': [],   // No user auth expected
  'webhook': [],         // Validated by signature, not JWT
  'public': [],          // Intentionally no auth
};

// Patterns that indicate user-auth presence (for cron/webhook/public — should NOT have these)
const USER_AUTH_INDICATORS = [/auth\.getUser\(token\)/, /requireAdmin\(/];

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) {
    console.error('❌ Registry not found:', REGISTRY);
    process.exit(1);
  }
  const raw = fs.readFileSync(REGISTRY, 'utf8');
  const doc = yaml.parse(raw);
  return doc.functions || {};
}

function getDeployedEFs() {
  const dirs = fs.readdirSync(EF_DIR, { withFileTypes: true });
  return dirs
    .filter(d => d.isDirectory() && d.name !== '_shared')
    .map(d => d.name)
    .filter(name => fs.existsSync(path.join(EF_DIR, name, 'index.ts')));
}

function readEFCode(name) {
  const filePath = path.join(EF_DIR, name, 'index.ts');
  return fs.readFileSync(filePath, 'utf8');
}

function validate() {
  const registry = loadRegistry();
  const deployed = getDeployedEFs();
  const errors = [];
  const warnings = [];

  // 1. Check all deployed EFs are in registry
  for (const ef of deployed) {
    if (!registry[ef]) {
      errors.push(`UNCLASSIFIED: ${ef} — deployed but not in edge-function-auth.yaml`);
    }
  }

  // 2. Check all registry entries are deployed
  for (const ef of Object.keys(registry)) {
    if (!deployed.includes(ef)) {
      warnings.push(`STALE: ${ef} — in registry but not deployed (removed?)`);
    }
  }

  // 3. Validate code matches classification
  for (const ef of deployed) {
    const entry = registry[ef];
    if (!entry) continue;

    const code = readEFCode(ef);
    const classification = entry.classification;

    // Admin-only must have requireAdmin
    if (classification === 'admin-only') {
      const hasAdmin = AUTH_PATTERNS['admin-only'].some(p => p.test(code));
      if (!hasAdmin) {
        errors.push(`MISMATCH: ${ef} classified as admin-only but no requireAdmin() found`);
      }
    }

    // Authenticated must have auth.getUser or verifyJWT
    if (classification === 'authenticated') {
      const hasAuth = AUTH_PATTERNS['authenticated'].some(p => p.test(code));
      if (!hasAuth) {
        errors.push(`MISMATCH: ${ef} classified as authenticated but no auth.getUser()/verifyJWT() found`);
      }
    }

    // Public must NOT have user auth patterns (they should be intentionally open)
    if (classification === 'public') {
      const hasUserAuth = USER_AUTH_INDICATORS.some(p => p.test(code));
      if (hasUserAuth) {
        warnings.push(`UNEXPECTED: ${ef} classified as public but has user auth patterns — verify classification`);
      }
    }
  }

  // Output results
  console.log('\n🔐 Edge Function Auth Validation (Gate 04)\n');
  console.log(`   Deployed: ${deployed.length}`);
  console.log(`   Registry: ${Object.keys(registry).length}`);
  console.log(`   Errors:   ${errors.length}`);
  console.log(`   Warnings: ${warnings.length}\n`);

  if (errors.length > 0) {
    console.log('❌ ERRORS (CI blocks merge):');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('');
  }

  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS (review recommended):');
    warnings.forEach(w => console.log(`   ${w}`));
    console.log('');
  }

  if (errors.length === 0) {
    console.log('✅ All Edge Functions classified and code matches registry.\n');
  }

  // Summary by classification
  const counts = {};
  for (const entry of Object.values(registry)) {
    const c = entry.classification;
    counts[c] = (counts[c] || 0) + 1;
  }
  console.log('📊 Classification summary:');
  for (const [cls, count] of Object.entries(counts).sort()) {
    console.log(`   ${cls}: ${count}`);
  }
  console.log('');

  process.exit(errors.length > 0 ? 1 : 0);
}

validate();
