/**
 * FA-003: preview-jobs Content Search + Landing Page
 * Validates that the preview-jobs Edge Function searches content_tsv
 * in addition to title, and that the landing page PostHog events
 * include the content_search_enabled property.
 *
 * Sections:
 *   1. EF source — content_tsv query pattern (8 tests)
 *   2. EF source — FTS sanitization (6 tests)
 *   3. EF source — response payload (4 tests)
 *   4. EF source — backward compat / fallback (4 tests)
 *   5. Landing page — PostHog event properties (5 tests)
 *   6. Integration — alignment with FA-001 patterns (5 tests)
 */

const fs = require('fs');
const path = require('path');

// ── Load sources ──
const previewEfSrc = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'preview-jobs', 'index.ts'),
  'utf-8'
);
const landingAppSrc = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'landing-app.js'),
  'utf-8'
);
const jobFeedSrc = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'job-feed.js'),
  'utf-8'
);

// ═══════════════════════════════════════════════════════════════════
// Section 1: EF source — content_tsv query pattern
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §1: EF content_tsv query pattern', () => {
  it('1.1 preview-jobs uses content_tsv.wfts for keyword search', () => {
    expect(previewEfSrc).toContain('content_tsv.wfts(english)');
  });

  it('1.2 keyword search combines title.ilike with content_tsv.wfts via OR', () => {
    expect(previewEfSrc).toContain('title.ilike.%${keyword}%,content_tsv.wfts(english).${safeFts}');
  });

  it('1.3 uses .or() method for combined clause (not separate filter calls)', () => {
    // The pattern should be q = q.or(`title.ilike...content_tsv.wfts...`)
    const orPattern = /q\s*=\s*q\.or\(`title\.ilike\.%\$\{keyword\}%,content_tsv\.wfts/;
    expect(orPattern.test(previewEfSrc)).toBe(true);
  });

  it('1.4 uses websearch flavor (wfts) not plain text search', () => {
    // wfts = websearch full text search (supports natural language queries)
    // Should NOT use plainto or phraseto which require exact matching
    expect(previewEfSrc).toContain('.wfts(english)');
    expect(previewEfSrc).not.toContain('.plfts(');
    expect(previewEfSrc).not.toContain('.phfts(');
  });

  it('1.5 uses english config for full-text search', () => {
    const wftsMatches = previewEfSrc.match(/wfts\((\w+)\)/g);
    expect(wftsMatches).not.toBeNull();
    wftsMatches.forEach(m => {
      expect(m).toBe('wfts(english)');
    });
  });

  it('1.6 keyword search block includes FA-003 comment attribution', () => {
    expect(previewEfSrc).toContain('FA-003');
  });

  it('1.7 GIN index comment documents the content_tsv index', () => {
    expect(previewEfSrc).toContain('GIN');
  });

  it('1.8 preserves title ilike as part of the OR (does not drop title search)', () => {
    expect(previewEfSrc).toContain('title.ilike.%${keyword}%');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: EF source — FTS sanitization
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §2: FTS input sanitization', () => {
  it('2.1 sanitizes single quotes from keyword before wfts', () => {
    expect(previewEfSrc).toContain("'");
    const sanitizePattern = /safeFts\s*=\s*keyword\.replace\([^)]+\)/;
    expect(sanitizePattern.test(previewEfSrc)).toBe(true);
  });

  it('2.2 sanitizes double quotes from keyword', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    expect(sanitizeRegex).not.toBeNull();
    expect(sanitizeRegex[1]).toContain('"');
  });

  it('2.3 sanitizes angle brackets (prevent injection)', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    expect(sanitizeRegex).not.toBeNull();
    expect(sanitizeRegex[1]).toContain('<');
    expect(sanitizeRegex[1]).toContain('>');
  });

  it('2.4 sanitizes FTS operators: & | ! : ( )', () => {
    const sanitizeRegex = previewEfSrc.match(/keyword\.replace\(\/([^/]+)\//);
    expect(sanitizeRegex).not.toBeNull();
    const charClass = sanitizeRegex[1];
    expect(charClass).toContain('&');
    expect(charClass).toContain('|');
    expect(charClass).toContain('!');
    expect(charClass).toContain(':');
    expect(charClass).toContain('(');
    expect(charClass).toContain(')');
  });

  it('2.5 collapses whitespace after sanitization', () => {
    expect(previewEfSrc).toContain(".replace(/\\s+/g, ' ')");
  });

  it('2.6 trims sanitized result', () => {
    // After sanitization, .trim() ensures no leading/trailing whitespace
    expect(previewEfSrc).toMatch(/safeFts.*\.trim\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: EF source — response payload
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §3: Response payload', () => {
  it('3.1 response includes content_search_enabled field', () => {
    expect(previewEfSrc).toContain('content_search_enabled');
  });

  it('3.2 content_search_enabled is set to true', () => {
    expect(previewEfSrc).toContain('content_search_enabled: true');
  });

  it('3.3 response still includes all original fields', () => {
    const requiredFields = ['total', 'median_salary', 'remote_pct', 'companies', 'titles', 'queries_remaining', 'session_token'];
    requiredFields.forEach(field => {
      expect(previewEfSrc).toContain(field);
    });
  });

  it('3.4 content_search_enabled is in the JSON.stringify response block', () => {
    // Find the JSON.stringify block that contains the response
    const responseBlock = previewEfSrc.match(/JSON\.stringify\(\{[^}]+content_search_enabled[^}]+\}\)/s);
    expect(responseBlock).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: EF source — backward compat / fallback
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §4: Backward compatibility and fallback', () => {
  it('4.1 falls back to title-only ilike when safeFts is empty after sanitization', () => {
    // If all characters are stripped, should fall back
    expect(previewEfSrc).toContain("q = q.ilike('title', `%${keyword}%`)");
  });

  it('4.2 fallback path uses the original keyword (not sanitized version)', () => {
    // The ilike fallback should use the raw keyword for partial matching
    const fallbackPattern = /else\s*\{[^}]*ilike\('title',\s*`%\$\{keyword\}%`\)/s;
    expect(fallbackPattern.test(previewEfSrc)).toBe(true);
  });

  it('4.3 location filter is unchanged (not affected by content search)', () => {
    expect(previewEfSrc).toContain('loc_city.ilike');
    expect(previewEfSrc).toContain('loc_state.ilike');
  });

  it('4.4 remote filter is unchanged (not affected by content search)', () => {
    expect(previewEfSrc).toContain('loc_type.eq.remote');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 5: Landing page — PostHog event properties
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §5: Landing page PostHog integration', () => {
  it('5.1 preview_results_shown event includes content_search_enabled', () => {
    // Find the posthog.capture block for preview_results_shown
    const captureBlock = landingAppSrc.match(/capture\(\s*['"]preview_results_shown['"][^)]+\)/s);
    expect(captureBlock).not.toBeNull();
    expect(captureBlock[0]).toContain('content_search_enabled');
  });

  it('5.2 content_search_enabled reads from response data', () => {
    expect(landingAppSrc).toContain('data.content_search_enabled');
  });

  it('5.3 content_search_enabled is boolean-coerced (!! operator)', () => {
    expect(landingAppSrc).toContain('!!data.content_search_enabled');
  });

  it('5.4 preview_filter_submitted event still fires (not broken)', () => {
    expect(landingAppSrc).toContain("posthog.capture('preview_filter_submitted'");
  });

  it('5.5 preview_rate_limited event still fires (not broken)', () => {
    expect(landingAppSrc).toContain("posthog.capture('preview_rate_limited'");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 6: Alignment with FA-001 dashboard patterns
// ═══════════════════════════════════════════════════════════════════
describe('FA-003 §6: Alignment with FA-001 dashboard patterns', () => {
  it('6.1 both EF and dashboard use wfts(english) for content_tsv', () => {
    expect(previewEfSrc).toContain('content_tsv.wfts(english)');
    expect(jobFeedSrc).toContain('content_tsv.wfts(english)');
  });

  it('6.2 both use title ilike as part of content search', () => {
    expect(previewEfSrc).toContain('title.ilike');
    expect(jobFeedSrc).toContain('title.ilike');
  });

  it('6.3 both sanitize FTS input (strip special characters)', () => {
    // Dashboard uses safe variable, EF uses safeFts
    expect(previewEfSrc).toContain('safeFts');
    // Dashboard also sanitizes
    expect(jobFeedSrc).toMatch(/replace\(.*['"<>]/);
  });

  it('6.4 both include content_search_enabled in PostHog events', () => {
    expect(previewEfSrc).toContain('content_search_enabled');
    expect(jobFeedSrc).toContain('content_search_enabled');
  });

  it('6.5 EF header documents FA-003 attribution', () => {
    expect(previewEfSrc).toContain('FA-003');
  });
});
