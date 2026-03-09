/**
 * FA-003b: preview-jobs FTS Sanitization + PostHog Parity
 * Enhances FA-003 with input sanitization for wfts queries and
 * content_search_enabled analytics property.
 *
 * Sections:
 *   1. FTS input sanitization (7 tests)
 *   2. Title-only fallback on empty sanitization (3 tests)
 *   3. Response payload — content_search_enabled (3 tests)
 *   4. Landing page PostHog parity (4 tests)
 */

const fs = require('fs');
const path = require('path');

const previewEfSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'preview-jobs', 'index.ts'),
  'utf-8'
);
const landingAppSrc = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'landing-app.js'),
  'utf-8'
);

// ═══════════════════════════════════════════════════════════════════
// Section 1: FTS input sanitization
// ═══════════════════════════════════════════════════════════════════
describe('FA-003b §1: FTS input sanitization', () => {
  it('1.1 safeFts variable exists for sanitized keyword', () => {
    expect(previewEfSrc).toContain('safeFts');
  });

  it('1.2 strips single and double quotes', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    expect(sanitizeRegex).not.toBeNull();
    expect(sanitizeRegex[1]).toContain("'");
    expect(sanitizeRegex[1]).toContain('"');
  });

  it('1.3 strips angle brackets', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    expect(sanitizeRegex[1]).toContain('<');
    expect(sanitizeRegex[1]).toContain('>');
  });

  it('1.4 strips FTS operators & | ! : ( )', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    const charClass = sanitizeRegex[1];
    expect(charClass).toContain('&');
    expect(charClass).toContain('|');
    expect(charClass).toContain('!');
    expect(charClass).toContain(':');
    expect(charClass).toContain('(');
    expect(charClass).toContain(')');
  });

  it('1.5 collapses whitespace after stripping', () => {
    expect(previewEfSrc).toContain(".replace(/\\s+/g, ' ')");
  });

  it('1.6 trims result', () => {
    expect(previewEfSrc).toMatch(/safeFts.*\.trim\(\)/);
  });

  it('1.7 sanitized value used in wfts clause (not raw keyword)', () => {
    expect(previewEfSrc).toContain('content_tsv.wfts(english).${safeFts}');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: Title-only fallback
// ═══════════════════════════════════════════════════════════════════
describe('FA-003b §2: Title-only fallback', () => {
  it('2.1 falls back to title ilike when safeFts is empty', () => {
    expect(previewEfSrc).toContain("q = q.ilike('title', `%${keyword}%`)");
  });

  it('2.2 fallback is in else branch of safeFts check', () => {
    const fallbackPattern = /else\s*\{[^}]*ilike\('title',\s*`%\$\{keyword\}%`\)/s;
    expect(fallbackPattern.test(previewEfSrc)).toBe(true);
  });

  it('2.3 safeFts truthiness check guards the OR clause', () => {
    const guardPattern = /if\s*\(\s*safeFts\s*\)\s*\{[^}]*\.or\(/s;
    expect(guardPattern.test(previewEfSrc)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: Response payload
// ═══════════════════════════════════════════════════════════════════
describe('FA-003b §3: Response content_search_enabled', () => {
  it('3.1 content_search_enabled in response JSON', () => {
    expect(previewEfSrc).toContain('content_search_enabled');
  });

  it('3.2 set to true', () => {
    expect(previewEfSrc).toContain('content_search_enabled: true');
  });

  it('3.3 is in the JSON.stringify block', () => {
    const block = previewEfSrc.match(/JSON\.stringify\(\{[^}]+content_search_enabled[^}]+\}\)/s);
    expect(block).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: Landing page PostHog parity
// ═══════════════════════════════════════════════════════════════════
describe('FA-003b §4: Landing page PostHog parity', () => {
  it('4.1 preview_results_shown includes content_search_enabled', () => {
    const captureBlock = landingAppSrc.match(/capture\(\s*['"]preview_results_shown['"][^)]+\)/s);
    expect(captureBlock).not.toBeNull();
    expect(captureBlock[0]).toContain('content_search_enabled');
  });

  it('4.2 reads from data.content_search_enabled', () => {
    expect(landingAppSrc).toContain('data.content_search_enabled');
  });

  it('4.3 boolean-coerced with !!', () => {
    expect(landingAppSrc).toContain('!!data.content_search_enabled');
  });

  it('4.4 existing PostHog events preserved', () => {
    expect(landingAppSrc).toContain("posthog.capture('preview_filter_submitted'");
    expect(landingAppSrc).toContain("posthog.capture('preview_rate_limited'");
  });
});
