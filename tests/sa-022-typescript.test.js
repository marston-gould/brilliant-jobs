#!/usr/bin/env node
/**
 * SA-022 Validation Tests — TypeScript Migration: Extension + Edge Functions
 *
 * Run: node tests/sa-022-typescript.test.js
 *
 * Verifies:
 *   1. No .js source files in extension/ (TypeScript gate)
 *   2. All 54 expected .ts files exist in extension/
 *   3. extension/tsconfig.tson exists and is valid
 *   4. extension/types/index.d.ts exports required type names
 *   5. _shared/types.ts exports all 8 required sections
 *   6. Zero `: any` in EF files (non-comment lines)
 *   7. CI gate steps present in ci.yml
 *   8. build-extension.js references .ts files
 *   9. ADR-04 exists with SA-022 section
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
    failures.push({ name, error: e.message });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readFile(path) {
  const full = join(ROOT, path);
  assert(existsSync(full), `File not found: ${path}`);
  return readFileSync(full, 'utf-8');
}

function fileExists(path) {
  return existsSync(join(ROOT, path));
}

function listFiles(dir, ext) {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { recursive: true })
    .filter(f => f.endsWith(ext))
    .map(f => join(dir, f));
}

// ──────────────────────────────────────────────────────────
// SECTION 1: No .js source files in extension/
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-1] Extension: No .js source files');

const EXEMPT_JS = ['extension/build-extension.js'];
const EXEMPT_DIRS = ['extension/dist', 'extension/examples'];

function getExtensionJsFiles() {
  const root = join(ROOT, 'extension');
  if (!existsSync(root)) return [];
  const results = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = full.replace(ROOT + '/', '');
      if (entry.isDirectory()) {
        if (!EXEMPT_DIRS.some(d => rel.startsWith(d))) walk(full);
      } else if (entry.name.endsWith('.js')) {
        if (!EXEMPT_JS.includes(rel)) results.push(rel);
      }
    }
  }
  walk(root);
  return results;
}

test('No .js source files in extension/ (excluding dist/examples/build script)', () => {
  const violations = getExtensionJsFiles();
  assert(violations.length === 0,
    `Found ${violations.length} raw .js source files:\n     ${violations.join('\n     ')}`);
});

// ──────────────────────────────────────────────────────────
// SECTION 2: All 54 expected .ts files exist
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-2] Extension: All .ts source files present');

const EXPECTED_TS_FILES = [
  'extension/background.ts',
  'extension/content.ts',
  'extension/contentScript.ts',
  'extension/human-sim.ts',
  'extension/interceptor.ts',
  'extension/interceptor-bridge.ts',
  'extension/popup.ts',
  'extension/popup-bridge.ts',
  'extension/popup-post.ts',
  'extension/supabase.ts',
  'extension/token-sync.ts',
  'extension/toolbar-overlay.ts',
  'extension/inject-overlay.ts',
  'extension/fields/checkbox.ts',
  'extension/fields/dateFields.ts',
  'extension/fields/dropdown.ts',
  'extension/fields/dropdownSearchable.ts',
  'extension/fields/radioGroup.ts',
  'extension/fields/textInput.ts',
  'extension/handlers/ashby.ts',
  'extension/handlers/avature.ts',
  'extension/handlers/bamboohr.ts',
  'extension/handlers/generic.ts',
  'extension/handlers/greenhouse-legacy.ts',
  'extension/handlers/greenhouse-react.ts',
  'extension/handlers/icims.ts',
  'extension/handlers/indeed.ts',
  'extension/handlers/jazzhr.ts',
  'extension/handlers/lever.ts',
  'extension/handlers/linkedin-easy-apply.ts',
  'extension/handlers/recruitee.ts',
  'extension/handlers/smartrecruiters.ts',
  'extension/handlers/taleo.ts',
  'extension/handlers/workable.ts',
  'extension/handlers/workday-experience.ts',
  'extension/handlers/workday.ts',
  'extension/selectors/registry.ts',
  'extension/utils/aiAnswerer.ts',
  'extension/utils/applicationTracker.ts',
  'extension/utils/autoTracker.ts',
  'extension/utils/crypto.ts',
  'extension/utils/fetchWithRetry.ts',
  'extension/utils/fieldFillerQueue.ts',
  'extension/utils/fileUpload.ts',
  'extension/utils/fillMetrics.ts',
  'extension/utils/indeedAntiBot.ts',
  'extension/utils/jdMatcher.ts',
  'extension/utils/killSwitch.ts',
  'extension/utils/multilingualLabels.ts',
  'extension/utils/mutationWatcher.ts',
  'extension/utils/originGuard.ts',
  'extension/utils/reactProps.ts',
  'extension/utils/resilientDOM.ts',
  'extension/utils/tierGate.ts',
];

test(`All ${EXPECTED_TS_FILES.length} expected .ts files exist`, () => {
  const missing = EXPECTED_TS_FILES.filter(f => !fileExists(f));
  assert(missing.length === 0,
    `Missing ${missing.length} .ts files:\n     ${missing.join('\n     ')}`);
});

// ──────────────────────────────────────────────────────────
// SECTION 3: extension/tsconfig.tson
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-3] Extension: tsconfig.json');

test('extension/tsconfig.tson exists', () => {
  assert(fileExists('extension/tsconfig.tson'), 'extension/tsconfig.tson not found');
});

test('extension/tsconfig.tson is valid JSON', () => {
  const content = readFile('extension/tsconfig.tson');
  const cfg = JSON.parse(content);
  assert(cfg.compilerOptions, 'Missing compilerOptions');
});

test('extension/tsconfig.tson has strict: true', () => {
  const cfg = JSON.parse(readFile('extension/tsconfig.tson'));
  assert(cfg.compilerOptions.strict === true, 'strict: true not set');
});

test('extension/tsconfig.tson has noImplicitAny: true', () => {
  const cfg = JSON.parse(readFile('extension/tsconfig.tson'));
  assert(cfg.compilerOptions.noImplicitAny === true, 'noImplicitAny: true not set');
});

// ──────────────────────────────────────────────────────────
// SECTION 4: extension/types/index.d.ts
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-4] Extension: Type declarations');

test('extension/types/index.d.ts exists', () => {
  assert(fileExists('extension/types/index.d.ts'), 'extension/types/index.d.ts not found');
});

const REQUIRED_EXT_TYPES = [
  'JobData', 'ApplicationData', 'FieldType', 'FieldConfig', 'FillResult',
  'AtsHandler', 'FetchOptions', 'KillSwitchState', 'HeartbeatPayload',
  'TierGateResult', 'TokenSyncPayload', 'ExtensionMessage', 'MessageHandler',
  'AIAnswerRequest', 'AIAnswerResult', 'FillMetrics', 'SelectorRegistry',
  'InterceptorMessage', 'PopupState',
];

for (const typeName of REQUIRED_EXT_TYPES) {
  test(`extension/types/index.d.ts declares ${typeName}`, () => {
    const content = readFile('extension/types/index.d.ts');
    assert(content.includes(typeName),
      `Type '${typeName}' not found in extension/types/index.d.ts`);
  });
}

// ──────────────────────────────────────────────────────────
// SECTION 5: _shared/types.ts
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-5] EF Shared Types: _shared/types.ts');

test('supabase/functions/_shared/types.ts exists', () => {
  assert(fileExists('supabase/functions/_shared/types.ts'),
    'supabase/functions/_shared/types.ts not found');
});

const REQUIRED_SHARED_TYPES = [
  // DB rows
  'JobRow', 'UserRow', 'ResumeRow', 'CompanyRow', 'PipelineRow', 'NotificationRow', 'ReferralRow',
  // API shapes
  'ApiResponse', 'PaginatedResponse', 'GatewayContext',
  // Job pipeline
  'ParsedJob', 'AtsBoard', 'SearchRequest', 'JobFilters',
  // CrewAI
  'AgentConfig', 'AgentMode', 'AgentActionLog', 'AgentCheck', 'AgentRunResult',
  // Notifications
  'EmailPayload', 'SmsPayload', 'NotificationRequest',
  // Scoring
  'ScoreRequest', 'ScoreResult', 'ResumeProfile', 'SkillEntry',
  // Billing
  'ReferralEvent', 'BillingEvent', 'CreditTransaction',
  // Utilities
  'SupabaseClient', 'Logger', 'getErrorMessage', 'isRecord', 'parseJson',
];

for (const typeName of REQUIRED_SHARED_TYPES) {
  test(`_shared/types.ts exports ${typeName}`, () => {
    const content = readFile('supabase/functions/_shared/types.ts');
    assert(content.includes(typeName),
      `'${typeName}' not found in _shared/types.ts`);
  });
}

// ──────────────────────────────────────────────────────────
// SECTION 6: Zero `: any` in EF files
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-6] EF TypeScript: Zero `: any` annotations');

function getEfFiles() {
  const root = join(ROOT, 'supabase/functions');
  if (!existsSync(root)) return [];
  const results = [];
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = full.replace(ROOT + '/', '');
      if (entry.isDirectory() && entry.name !== '_shared') walk(full);
      else if (entry.name.endsWith('.ts') && entry.name !== 'index.d.ts') results.push(rel);
    }
  }
  walk(root);
  return results;
}

test('Zero `: any` annotations in all EF files (excluding _shared)', () => {
  const efFiles = getEfFiles();
  const violations = [];
  for (const f of efFiles) {
    const content = readFileSync(join(ROOT, f), 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
      if (/: any\b/.test(line)) {
        violations.push(`${f}:${i + 1} → ${line.trim()}`);
      }
    }
  }
  assert(violations.length === 0,
    `Found ${violations.length} ': any' annotations:\n     ${violations.slice(0, 10).join('\n     ')}`);
});

// ──────────────────────────────────────────────────────────
// SECTION 7: CI gate steps
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-7] CI Gate: SA-022 steps');

test('.github/workflows/ci.yml exists', () => {
  assert(fileExists('.github/workflows/ci.yml'), 'ci.yml not found');
});

test('CI has SA-022 Extension TypeScript gate', () => {
  const content = readFile('.github/workflows/ci.yml');
  assert(content.includes('SA-022 Extension TypeScript gate'),
    'SA-022 Extension TypeScript gate step not found in ci.yml');
});

test('CI has SA-022 EF no-any gate', () => {
  const content = readFile('.github/workflows/ci.yml');
  assert(content.includes('SA-022 EF TypeScript no-any gate'),
    'SA-022 EF no-any gate step not found in ci.yml');
});

test('CI Extension gate checks for .js files in extension/', () => {
  const content = readFile('.github/workflows/ci.yml');
  assert(content.includes('find extension/') && content.includes('.js'),
    'Extension .js file check not found in ci.yml');
});

// ──────────────────────────────────────────────────────────
// SECTION 8: build-extension.js references .ts
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-8] Build script: TypeScript source references');

test('build-extension.js exists', () => {
  assert(fileExists('extension/build-extension.js'), 'extension/build-extension.js not found');
});

test('build-extension.js references background.ts (not background.js)', () => {
  const content = readFile('extension/build-extension.js');
  assert(content.includes("'background.ts'") || content.includes('"background.ts"'),
    "build-extension.js still references 'background.js' instead of 'background.ts'");
});

test('build-extension.js discovers .ts handler files', () => {
  const content = readFile('extension/build-extension.js');
  assert(content.includes("endsWith('.ts')"),
    "build-extension.js still uses endsWith('.js') for handler/utils discovery");
});

test('build-extension.js has TypeScript v3 header comment', () => {
  const content = readFile('extension/build-extension.js');
  assert(content.includes('TypeScript') || content.includes('SA-022'),
    'build-extension.js missing TypeScript/SA-022 annotation');
});

// ──────────────────────────────────────────────────────────
// SECTION 9: ADR-04
// ──────────────────────────────────────────────────────────
console.log('\n[SA-022-9] ADR-04: TypeScript migration');

test('docs/scaling/adr-04-typescript.md exists', () => {
  assert(fileExists('docs/scaling/adr-04-typescript.md'),
    'docs/scaling/adr-04-typescript.md not found');
});

test('ADR-04 has IMPLEMENTED status', () => {
  const content = readFile('docs/scaling/adr-04-typescript.md');
  assert(content.includes('IMPLEMENTED'), 'ADR-04 missing IMPLEMENTED status');
});

test('ADR-04 documents SA-022 session', () => {
  const content = readFile('docs/scaling/adr-04-typescript.md');
  assert(content.includes('SA-022'), 'ADR-04 missing SA-022 reference');
});

test('ADR-04 documents Hook & Scar points', () => {
  const content = readFile('docs/scaling/adr-04-typescript.md');
  assert(content.includes('Hook') && content.includes('Scar'),
    'ADR-04 missing Hook & Scar section');
});

test('ADR-04 documents extension types index.d.ts', () => {
  const content = readFile('docs/scaling/adr-04-typescript.md');
  assert(content.includes('index.d.ts'), 'ADR-04 missing extension/types/index.d.ts reference');
});

test('ADR-04 documents _shared/types.ts', () => {
  const content = readFile('docs/scaling/adr-04-typescript.md');
  assert(content.includes('_shared/types.ts'), 'ADR-04 missing _shared/types.ts reference');
});

// ──────────────────────────────────────────────────────────
// RESULTS
// ──────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${'─'.repeat(60)}`);
console.log(`SA-022 Tests: ${passed}/${total} passed`);
if (failed > 0) {
  console.log(`\nFailed tests (${failed}):`);
  for (const f of failures) {
    console.log(`  • ${f.name}`);
    console.log(`    ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('✅ All SA-022 TypeScript migration tests passed');
  process.exit(0);
}
