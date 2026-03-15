/**
 * FIX-11: Extension Empty Catch Remediation (EXT-ES-001)
 * Validates: All 22 empty catches replaced with logging/comments
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function readFile(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf-8'); }

console.log('\n🧪 FIX-11: Extension Empty Catch Remediation (EXT-ES-001)\n');

// ─── ZERO EMPTY CATCHES ───
console.log('── Zero Empty Catches Verification ──');

const extFiles = [
  'extension/background.ts',
  'extension/popup.ts',
  'extension/interceptor.ts',
  'extension/handlers/greenhouse-legacy.ts',
  'extension/handlers/greenhouse-react.ts',
  'extension/handlers/lever.ts',
  'extension/handlers/linkedin-easy-apply.ts',
  'extension/utils/resilientDOM.ts',
  'extension/build-extension.js',
];

extFiles.forEach(file => {
  test(`${file} — no empty catch blocks`, () => {
    const src = readFile(file);
    const matches = src.match(/catch\s*\([^)]*\)\s*\{\s*\}/g);
    assert.ok(!matches, `Found ${matches ? matches.length : 0} empty catches: ${matches ? matches.join(', ') : ''}`);
  });
});

// ─── BACKGROUND.JS ERROR HANDLING ───
console.log('── background.js Error Handling ──');

test('background.js — scroll inject catches log warnings', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes("'[BJ] scroll inject failed:'"), 'Missing scroll warning');
});

test('background.js — experience scroll catches log warnings', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes("'[BJ] experience scroll failed:'"), 'Missing experience scroll warning');
});

test('background.js — clearInterceptedData catches log warnings', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes("'[BJ] clearInterceptedData failed:'"), 'Missing clearInterceptedData warning');
});

test('background.js — hiring signal catches log warnings', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes("'[BJ] hiring signal detection failed:'"), 'Missing hiring signal warning');
});

test('background.js — JSON.parse in hiring signal marked intentionally silent', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes('expected: non-JSON script tags'), 'Missing intentional silence comment');
});

test('background.js — tab activation catch has comment', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes('tab may be gone before get()'), 'Missing tab activation comment');
});

test('background.js — experience detail scroll catches log warnings', () => {
  const src = readFile('extension/background.ts');
  assert.ok(src.includes("'[BJ] experience detail scroll failed:'"), 'Missing detail scroll warning');
});

// ─── POPUP.JS ERROR HANDLING ───
console.log('── popup.js Error Handling ──');

test('popup.js — harvest stats catches log warnings', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] harvest stats error:'"), 'Missing harvest stats warning');
});

test('popup.js — pre-harvest count catches log warnings', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] pre-harvest count failed:'"), 'Missing pre-harvest warning');
});

test('popup.js — post-harvest count catches log + PostHog', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] post-harvest count failed:'"), 'Missing post-harvest warning');
  assert.ok(src.includes("phCapture('extension_catch_error'"), 'Missing PostHog capture for post-harvest');
});

test('popup.js — scan count refresh catches log warnings', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] scan count refresh failed:'"), 'Missing scan count warning');
});

test('popup.js — hiring signal counts catches log warnings', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] hiring signal counts failed:'"), 'Missing hiring counts warning');
});

test('popup.js — company list render catches log warnings', () => {
  const src = readFile('extension/popup.ts');
  assert.ok(src.includes("'[BJ] company list render failed:'"), 'Missing company list warning');
});

// ─── HANDLER ERROR REPORTING ───
console.log('── Handler Error Reporting ──');

test('greenhouse-legacy.js — error report catch logs warning', () => {
  const src = readFile('extension/handlers/greenhouse-legacy.ts');
  assert.ok(src.includes("'[BJ] greenhouse-legacy error report failed'"), 'Missing warning');
});

test('greenhouse-react.js — error report catch logs warning', () => {
  const src = readFile('extension/handlers/greenhouse-react.ts');
  assert.ok(src.includes("'[BJ] greenhouse-react error report failed'"), 'Missing warning');
});

test('greenhouse-react.js — body.click has explanatory comment', () => {
  const src = readFile('extension/handlers/greenhouse-react.ts');
  assert.ok(src.includes('dropdown close best-effort'), 'Missing dropdown comment');
});

test('lever.js — error report catch logs warning', () => {
  const src = readFile('extension/handlers/lever.ts');
  assert.ok(src.includes("'[BJ] lever error report failed'"), 'Missing warning');
});

test('linkedin-easy-apply.js — selector miss report catch logs warning', () => {
  const src = readFile('extension/handlers/linkedin-easy-apply.ts');
  assert.ok(src.includes("'[BJ] linkedin selector miss report failed'"), 'Missing warning');
});

test('resilientDOM.js — handler error report catch logs warning', () => {
  const src = readFile('extension/utils/resilientDOM.ts');
  assert.ok(src.includes("'error report failed'"), 'Missing handler error warning');
});

test('resilientDOM.js — selector miss report catch logs warning', () => {
  const src = readFile('extension/utils/resilientDOM.ts');
  assert.ok(src.includes("'[BJ] selector miss report failed'"), 'Missing selector miss warning');
});

// ─── INTERCEPTOR ───
console.log('── Interceptor ──');

test('interceptor.js — parse failure logged with URL context', () => {
  const src = readFile('extension/interceptor.ts');
  assert.ok(src.includes("'[BJ] interceptor parse failed:'"), 'Missing interceptor parse warning');
});

// ─── BUILD SCRIPT ───
console.log('── Build Script ──');

test('build-extension.js — temp cleanup marked intentionally silent', () => {
  const src = readFile('extension/build-extension.js');
  assert.ok(src.includes('temp file cleanup'), 'Missing cleanup comment');
});

// ─── SUMMARY ───
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'─'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
