/**
 * CS-P1-013: SEO + SRI + Referral Pipeline Tests
 * Validates: IX-DM-001, IX-SEO-001/002/003, IX-DA-002, IX-FE-006
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

console.log('\n🧪 CS-P1-013: SEO + SRI + Referral Pipeline\n');

// ─── IX-DM-001: SRI Hashes ───
console.log('── IX-DM-001: SRI Hashes ──');

const seoPages = [
  'career-level-data.html', 'data-lab.html', 'jobs-by-industry.html',
  'market-dynamics.html'
];

const industryPages = fs.readdirSync(path.join(__dirname, '..', 'industry'))
  .filter(f => f.endsWith('.html'));

// CDN scripts with expected SRI
const expectedSRI = {
  'echarts@5.5.0': 'sha384-o5uz97et3bErHvpKfD4Jz4n0JfhJDWABFuF4NP+iEEDxE1VwMWJ19QGR0lqFZnr6',
  'supabase-js@2.98.0': 'sha384-Sm2s7OXxsAMTyJ4iIyRBgVpeGUvMPk2lRQnnZhE78Wej7oggIoolKt+SCt0XJbUB',
  'echarts@5.6.0': 'sha384-pPi0zxBAoDu6+JXW/C68UZLvBUUtU+7zonhif43rqj7pxsGyqyqzcian2Rj37Rss',
};

// Test SEO pages for SRI on CDN echarts
for (const page of seoPages) {
  const html = readFile(page);
  // Only test if page uses CDN echarts (not vendor copy)
  if (html.includes('cdn.jsdelivr.net/npm/echarts@5.5.0')) {
    test(`${page}: echarts has SRI`, () => {
      assert(html.includes(expectedSRI['echarts@5.5.0']), 'Missing echarts SRI hash');
      assert(html.includes('crossorigin="anonymous"'), 'Missing crossorigin attribute');
    });
  }
  if (html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
    test(`${page}: supabase-js pinned @2.98.0 with SRI`, () => {
      assert(html.includes('@supabase/supabase-js@2.98.0'), 'supabase-js not pinned to @2.98.0');
      assert(html.includes(expectedSRI['supabase-js@2.98.0']), 'Missing supabase-js SRI hash');
    });
  }
}

// Industry pages
for (const page of industryPages) {
  const html = readFile(`industry/${page}`);
  if (html.includes('cdn.jsdelivr.net/npm/echarts@5.5.0')) {
    test(`industry/${page}: echarts has SRI`, () => {
      assert(html.includes(expectedSRI['echarts@5.5.0']), 'Missing SRI');
    });
  }
  if (html.includes('cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
    test(`industry/${page}: supabase-js pinned with SRI`, () => {
      assert(html.includes('@2.98.0'), 'Not pinned');
      assert(html.includes(expectedSRI['supabase-js@2.98.0']), 'Missing SRI');
    });
  }
}

// Admin echarts
test('admin.html: echarts pinned @5.6.0 with SRI', () => {
  const html = readFile('admin.html');
  assert(html.includes('echarts@5.6.0'), 'Not pinned to @5.6.0');
  assert(html.includes(expectedSRI['echarts@5.6.0']), 'Missing SRI hash');
});

// Dynamic scripts documented
test('index.html: Ahrefs removed (REM-005 LS1-6: redundant with PostHog+GSC)', () => {
  const html = readFile('index.html');
  assert(!html.includes('analytics.ahrefs.com/analytics.js'), 'Ahrefs script tag still present');
  assert(html.includes('REM-005 LS1-6'), 'Missing REM-005 removal comment');
});

test('compare.html: Ahrefs removed (REM-005 LS1-6: redundant with PostHog+GSC)', () => {
  const html = readFile('compare.html');
  assert(!html.includes('analytics.ahrefs.com/analytics.js'), 'Ahrefs script tag still present');
  assert(html.includes('REM-005 LS1-6'), 'Missing REM-005 removal comment');
});

// ─── IX-SEO-001: Canonical URL ───
console.log('\n── IX-SEO-001: Canonical URL ──');

test('index.html: has canonical tag', () => {
  const html = readFile('index.html');
  assert(html.includes('rel="canonical" href="https://brilliantjobs.app/"'), 'Missing canonical');
});

for (const page of seoPages) {
  test(`${page}: has canonical tag`, () => {
    const html = readFile(page);
    assert(html.includes('rel="canonical"'), `${page} missing canonical`);
    assert(html.includes('brilliantjobs.app'), `${page} canonical not on .app domain`);
  });
}

// ─── IX-SEO-002: OG + Twitter Cards ───
console.log('\n── IX-SEO-002: OG + Twitter Cards ──');

const allCheckPages = ['index.html', 'compare.html', ...seoPages, ...industryPages.map(p => `industry/${p}`)];

for (const page of allCheckPages) {
  const html = readFile(page);
  // Skip redirect-only pages
  if (html.includes('Redirecting to')) continue;
  
  test(`${page}: has og:title`, () => {
    assert(html.includes('og:title'), 'Missing og:title');
  });
  test(`${page}: has twitter:card`, () => {
    assert(html.includes('twitter:card'), 'Missing twitter:card');
  });
}

// ─── IX-SEO-003: JSON-LD Accuracy ───
console.log('\n── IX-SEO-003: JSON-LD Accuracy ──');

test('index.html: JSON-LD FAQ answer updated (no stale beta text)', () => {
  const html = readFile('index.html');
  assert(!html.includes('free during the private beta period'), 'Stale FAQ text still present');
  assert(html.includes('free plan that includes'), 'Updated FAQ text not present');
});

test('index.html: JSON-LD has Organization logo', () => {
  const html = readFile('index.html');
  assert(html.includes('"logo"') && html.includes('"ImageObject"'), 'Missing Organization logo');
});

test('index.html: JSON-LD pricing matches page ($0, $20, $40)', () => {
  const html = readFile('index.html');
  assert(html.includes('"price": "0"') && html.includes('"price": "20"') && html.includes('"price": "40"'), 'Pricing mismatch');
});

// ─── IX-DA-002: Referral Attribution Chain ───
console.log('\n── IX-DA-002: Referral Attribution Chain ──');

test('landing-app.js: signUp passes referral_code', () => {
  const js = readFile('js/landing-app.js');
  assert(js.includes('referral_code: refCode'), 'referral_code not in signUp metadata');
  assert(js.includes('referral_source: refSource'), 'referral_source not in signUp metadata');
});

test('landing-app.js: linkReferral function exists', () => {
  const js = readFile('js/landing-app.js');
  assert(js.includes('async function linkReferral'), 'linkReferral function missing');
  assert(js.includes('referral-lifecycle'), 'No referral-lifecycle call');
});

test('landing-app.js: linkReferral called after signup', () => {
  const js = readFile('js/landing-app.js');
  assert(js.includes('linkReferral(data.user.id, refCode, refSource)'), 'linkReferral not called after signup');
});

test('referral-lifecycle: handles referee_signup by referral_code', () => {
  const ts = readFile('supabase/functions/referral-lifecycle/index.ts');
  assert(ts.includes('event.metadata?.referral_code'), 'No referral_code lookup in lifecycle');
  assert(ts.includes('referee_signup'), 'No referee_signup handling');
});

test('referral-capture.js: uses correct anon key', () => {
  const js = readFile('js/referral-capture.js');
  assert(js.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24i'), 'Anon key mismatch');
});

test('referral-capture.js: cookie has Secure flag', () => {
  const js = readFile('js/referral-capture.js');
  assert(js.includes('Secure'), 'Cookie missing Secure flag');
});

// ─── IX-FE-006: No .io References ───
console.log('\n── IX-FE-006: No .io References ──');

test('No brilliantjobs.io in source files', () => {
  const files = ['index.html', 'js/landing-app.js', 'js/referral-capture.js', 'js/globals.js'];
  for (const f of files) {
    const content = readFile(f);
    assert(!content.includes('brilliantjobs.io'), `${f} still contains brilliantjobs.io`);
  }
});

// ─── Summary ───
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
process.exit(failed > 0 ? 1 : 0);
