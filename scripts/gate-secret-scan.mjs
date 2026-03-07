#!/usr/bin/env node
// scripts/gate-secret-scan.js — CS-021 Gate 5: Access Control Review
// Scans source files for hardcoded secrets, API keys, and service role keys.
//
// Usage: node scripts/gate-secret-scan.js

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';

const ROOT = process.cwd();

// Directories to scan
const SCAN_DIRS = ['js', 'extension', 'supabase/functions', 'scripts', 'src'];

// File extensions to scan
const SCAN_EXTS = new Set(['.js', '.ts', '.mjs', '.html', '.json', '.env']);

// Files explicitly excluded (e.g., this scanner itself, test fixtures)
const EXCLUDE_FILES = new Set([
  'scripts/gate-secret-scan.js',
  'tests/setup.js',
  'extension/examples',
  'dist/',
  'node_modules/',
  'load-tests/',
  '.git/',
]);

// Secret patterns: [name, regex, severity]
const SECRET_PATTERNS = [
  ['Supabase Service Role Key', /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{50,}\.[\w-]{40,}/, 'CRITICAL'],
  ['Generic JWT', /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, 'HIGH'],
  ['AWS Access Key', /AKIA[0-9A-Z]{16}/, 'CRITICAL'],
  ['AWS Secret Key', /[A-Za-z0-9/+=]{40}(?=.*aws)/i, 'CRITICAL'],
  ['Stripe Secret Key', /sk_live_[A-Za-z0-9]{20,}/, 'CRITICAL'],
  ['Stripe Webhook Secret', /whsec_[A-Za-z0-9]{20,}/, 'CRITICAL'],
  ['GitHub PAT', /ghp_[A-Za-z0-9]{36,}/, 'CRITICAL'],
  ['Anthropic API Key', /sk-ant-api[A-Za-z0-9_-]{20,}/, 'CRITICAL'],
  ['Resend API Key', /re_[A-Za-z0-9_]{20,}/, 'HIGH'],
  ['PostHog Personal Key', /phx_[A-Za-z0-9]{20,}/, 'HIGH'],
  ['Google API Key', /AIzaSy[A-Za-z0-9_-]{33}/, 'HIGH'],
  ['Hardcoded Password', /password\s*[:=]\s*['"][^'"]{4,}['"]/i, 'MEDIUM'],
  ['Private Key Block', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, 'CRITICAL'],
];

// Known safe patterns to skip (Supabase anon key is intentionally public)
const SAFE_PATTERNS = [
  /supabaseAnonKey|SUPABASE_ANON_KEY|anon[_-]?key/i,
  /SUPABASE_KEY|SUPABASE_ANON/i, // These are anon keys in client code (intentionally public)
  /publishable[_-]?key|STRIPE_PUBLISHABLE/i,
  /test[_-]?key|mock[_-]?key|example[_-]?key/i,
  /var AK\s*=|const AK\s*=/i, // Short alias for anon key
  /apikey.*SUPABASE_KEY|apikey.*AK\b/i, // apikey header using anon key variable
  /createClient\(.*SUPABASE/i, // Supabase client init with anon key
  /role.*anon/i, // JWT with role: anon
];

let failures = 0;
let scanned = 0;

function shouldExclude(filepath) {
  return Array.from(EXCLUDE_FILES).some(ex => filepath.includes(ex));
}

function walkDir(dir) {
  let files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = fullPath.replace(ROOT + '/', '');
      if (shouldExclude(relPath)) continue;
      if (entry.isDirectory()) {
        files = files.concat(walkDir(fullPath));
      } else if (SCAN_EXTS.has(extname(entry.name))) {
        files.push(fullPath);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return files;
}

function isLineSafe(line) {
  if (SAFE_PATTERNS.some(pat => pat.test(line))) return true;
  // Supabase anon keys contain base64-encoded "role":"anon" in the JWT payload
  // cm9sZSI6ImFub24 = base64 for role":"anon"
  if (/cm9sZSI6ImFub24/.test(line)) return true;
  return false;
}

for (const scanDir of SCAN_DIRS) {
  const absDir = join(ROOT, scanDir);
  try { statSync(absDir); } catch { continue; }

  const files = walkDir(absDir);
  for (const filepath of files) {
    scanned++;
    const relPath = filepath.replace(ROOT + '/', '');
    let content;
    try { content = readFileSync(filepath, 'utf-8'); } catch { continue; }
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isLineSafe(line)) continue;

      for (const [name, pattern, severity] of SECRET_PATTERNS) {
        if (pattern.test(line)) {
          // Skip if it's clearly a Deno.env.get() pattern (env var lookup, not hardcoded)
          if (/Deno\.env\.get|process\.env|import\.meta\.env/.test(line)) continue;
          // Skip if it's in a comment explaining what was removed
          if (/^\s*\/\//.test(line) && /removed|rotated|revoked|deprecated/i.test(line)) continue;

          console.error(`❌ [${severity}] ${name} in ${relPath}:${i + 1}`);
          console.error(`   ${line.trim().substring(0, 120)}`);
          failures++;
        }
      }
    }
  }
}

console.log(`\nGate 5: Secret Scan`);
console.log(`  Files scanned: ${scanned}`);
console.log(`  Violations: ${failures}`);

if (failures > 0) {
  console.error(`\n❌ Gate 5 FAILED — ${failures} potential secret(s) in source.`);
  console.error('Move secrets to environment variables or Supabase Vault.');
  process.exit(1);
} else {
  console.log('\n✅ Gate 5 PASSED — No hardcoded secrets detected.');
}
