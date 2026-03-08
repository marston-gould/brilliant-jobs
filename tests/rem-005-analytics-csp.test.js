/**
 * REM-005 — Analytics + CSP Strict
 * Validation tests for LS1-6 (Ahrefs removal) and SE-005 (CSP strict on SPA)
 *
 * Run: node tests/rem-005-analytics-csp.test.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let pass = 0;
let fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push(`  ✗ ${name}: ${e.message}`);
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

const ROOT = path.resolve(__dirname, '..');

// ─── Section 1: LS1-6 Ahrefs Removal ──────────────────────────────────────

test('index.html: no Ahrefs script tag', () => {
  const content = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert(!content.includes('analytics.ahrefs.com/analytics.js'), 'Ahrefs script tag still present in index.html');
});

test('index.html: Ahrefs removal comment present', () => {
  const content = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
  assert(content.includes('REM-005 LS1-6'), 'REM-005 removal comment missing from index.html');
});

test('compare.html: no Ahrefs script tag', () => {
  const content = fs.readFileSync(path.join(ROOT, 'compare.html'), 'utf-8');
  assert(!content.includes('analytics.ahrefs.com/analytics.js'), 'Ahrefs script tag still present in compare.html');
});

test('compare.html: Ahrefs removal comment present', () => {
  const content = fs.readFileSync(path.join(ROOT, 'compare.html'), 'utf-8');
  assert(content.includes('REM-005 LS1-6'), 'REM-005 removal comment missing from compare.html');
});

test('No Ahrefs data-key attributes in any HTML file', () => {
  const htmlFiles = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(ROOT, file), 'utf-8');
    assert(!content.includes('epmlewecGa7zjdRysfTLMg'), `Ahrefs data-key found in ${file}`);
  }
});

// ─── Section 2: CSP Ahrefs Cleanup ─────────────────────────────────────────

test('vercel.json: valid JSON', () => {
  const raw = fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8');
  JSON.parse(raw); // throws on invalid
});

test('vercel.json: no Ahrefs in any CSP header', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  for (const rule of config.headers || []) {
    for (const h of rule.headers || []) {
      if (h.key === 'Content-Security-Policy') {
        assert(!h.value.includes('ahrefs'), `Ahrefs still in CSP for source: ${rule.source}`);
      }
    }
  }
});

test('vercel.json: landing page CSP has no unsafe-inline in script-src', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const landing = config.headers.find(r => r.source === '/');
  const csp = landing.headers.find(h => h.key === 'Content-Security-Policy');
  const scriptSrc = csp.value.match(/script-src\s+([^;]+)/)?.[1] || '';
  assert(!scriptSrc.includes("'unsafe-inline'"), 'Landing page CSP has unsafe-inline in script-src');
});

// ─── Section 3: SE-005 SPA CSP Strict ──────────────────────────────────────

test('vercel.json: /app/:path* CSP header exists', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  assert(spa, 'No /app/:path* header rule found');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy');
  assert(csp, 'No CSP header in /app/:path* rule');
});

test('vercel.json: SPA CSP has no unsafe-inline in script-src', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] || '';
  assert(!scriptSrc.includes("'unsafe-inline'"), 'SPA CSP has unsafe-inline in script-src');
});

test('vercel.json: SPA CSP has no unsafe-inline in style-src', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  const styleSrc = csp.match(/style-src\s+([^;]+)/)?.[1] || '';
  assert(!styleSrc.includes("'unsafe-inline'"), 'SPA CSP has unsafe-inline in style-src');
});

test('vercel.json: SPA CSP has SHA-256 hash for theme script', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes("'sha256-"), 'SPA CSP missing SHA-256 hash');
});

test('SPA theme script hash matches actual inline script', () => {
  const spaHtml = fs.readFileSync(path.join(ROOT, 'src/app/index.html'), 'utf-8');
  // Extract the inline script content (between first <script> and </script>)
  const scriptMatch = spaHtml.match(/<script>([^<]+)<\/script>/);
  assert(scriptMatch, 'No inline script found in SPA index.html');
  const scriptContent = scriptMatch[1];

  // Compute SHA-256
  const hash = crypto.createHash('sha256').update(scriptContent).digest('base64');

  // Check it appears in the SPA CSP
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes(`'sha256-${hash}'`), `SPA CSP hash mismatch. Expected: sha256-${hash}`);
});

test('vercel.json: SPA CSP allows PostHog', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes('us.i.posthog.com'), 'SPA CSP missing PostHog script-src');
  assert(csp.includes('*.posthog.com'), 'SPA CSP missing PostHog connect-src wildcard');
});

test('vercel.json: SPA CSP allows Supabase', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes('qojhagupdnbtomfoxnsf.supabase.co'), 'SPA CSP missing Supabase connect-src');
  assert(csp.includes('wss://'), 'SPA CSP missing WebSocket for Supabase realtime');
});

test('vercel.json: SPA CSP has frame-ancestors none', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes("frame-ancestors 'none'"), 'SPA CSP missing frame-ancestors none');
});

test('vercel.json: SPA CSP has base-uri self', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const spa = config.headers.find(r => r.source === '/app/:path*');
  const csp = spa.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes("base-uri 'self'"), 'SPA CSP missing base-uri self');
});

// ─── Section 4: Legacy CSP Preservation ─────────────────────────────────────

test('vercel.json: catch-all CSP still has unsafe-inline (legacy needs it)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf-8'));
  const catchAll = config.headers.find(r => r.source === '/(.*)');
  const csp = catchAll.headers.find(h => h.key === 'Content-Security-Policy').value;
  assert(csp.includes("'unsafe-inline'"), 'Catch-all CSP lost unsafe-inline — legacy dashboard.html will break');
});

test('dashboard.html: REM-005 CSP status comment present', () => {
  const content = fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf-8');
  assert(content.includes('REM-005'), 'REM-005 status comment missing from dashboard.html');
});

// ─── Section 5: SPA index.html sanity ──────────────────────────────────────

test('SPA index.html: has exactly one inline script (theme flash prevention)', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/app/index.html'), 'utf-8');
  const inlineScripts = content.match(/<script>[\s\S]*?<\/script>/g) || [];
  assert(inlineScripts.length === 1, `Expected 1 inline script, found ${inlineScripts.length}`);
});

test('SPA index.html: no onclick/onchange/onsubmit handlers', () => {
  const content = fs.readFileSync(path.join(ROOT, 'src/app/index.html'), 'utf-8');
  const handlers = ['onclick', 'onchange', 'onsubmit', 'onkeyup', 'onkeydown', 'onfocus', 'onblur', 'oninput'];
  for (const h of handlers) {
    assert(!content.includes(`${h}=`), `SPA index.html has inline ${h} handler`);
  }
});

// ─── Section 6: No Ahrefs anywhere ─────────────────────────────────────────

test('No analytics.ahrefs.com in any JS/TS file', () => {
  function checkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        checkDir(full);
      } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
        const content = fs.readFileSync(full, 'utf-8');
        assert(!content.includes('analytics.ahrefs.com'), `Ahrefs reference found in ${full}`);
      }
    }
  }
  checkDir(path.join(ROOT, 'js'));
  checkDir(path.join(ROOT, 'supabase'));
  checkDir(path.join(ROOT, 'src'));
});

// ─── Report ────────────────────────────────────────────────────────────────

console.log(`\nREM-005 Analytics + CSP Strict — Validation Results`);
console.log(`${'═'.repeat(55)}`);
console.log(`  ✓ ${pass} passed`);
if (fail > 0) {
  console.log(`  ✗ ${fail} failed`);
  failures.forEach(f => console.log(f));
}
console.log(`${'─'.repeat(55)}`);
console.log(`  Total: ${pass + fail} tests | ${fail === 0 ? 'ALL PASSING ✅' : 'FAILURES ❌'}`);
console.log();

process.exit(fail > 0 ? 1 : 0);
