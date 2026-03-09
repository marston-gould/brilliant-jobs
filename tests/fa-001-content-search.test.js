/**
 * FA-001: Expand What Pills to Content Search
 * Validates that buildFilterQuery correctly generates content_tsv clauses
 * for both positive (What) and negative (What NOT) pills when the
 * feed_content_search feature flag is enabled.
 *
 * Sections:
 *   1. Feature flag gating (5 tests)
 *   2. Positive What pills — content_tsv.wfts clauses (8 tests)
 *   3. Negative What NOT pills — content_tsv NOT clauses (6 tests)
 *   4. Global title exclusions — content_tsv NOT clauses (4 tests)
 *   5. Atomic guarantee — positive and negative always ship together (3 tests)
 *   6. Edge cases — special characters, empty terms, multi-word (7 tests)
 *   7. PostHog event property — content_search_enabled (4 tests)
 *   8. Backward compatibility — flag off = title-only (5 tests)
 */

const fs = require('fs');
const path = require('path');

// ── Load source for static analysis ──
const jobFeedSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'job-feed.js'), 'utf-8');

// ── Helper: simulate PostgREST query builder for clause capture ──
function createMockQuery() {
  const _calls = [];
  const query = {
    _calls,
    eq: function(col, val) { _calls.push({ method: 'eq', col, val }); return query; },
    not: function(col, op, val) { _calls.push({ method: 'not', col, op, val }); return query; },
    or: function(str) { _calls.push({ method: 'or', str }); return query; },
    ilike: function(col, val) { _calls.push({ method: 'ilike', col, val }); return query; },
    textSearch: function(col, val, opts) { _calls.push({ method: 'textSearch', col, val, opts }); return query; },
    in: function(col, vals) { _calls.push({ method: 'in', col, vals }); return query; },
    order: function(col, opts) { _calls.push({ method: 'order', col, opts }); return query; },
    range: function(from, to) { _calls.push({ method: 'range', from, to }); return query; },
    select: function() { return query; },
    getCalls: function(method) { return _calls.filter(c => c.method === method); },
    getOrClauses: function() { return _calls.filter(c => c.method === 'or').map(c => c.str); },
    getNotCalls: function() { return _calls.filter(c => c.method === 'not'); },
  };
  return query;
}

// ═══════════════════════════════════════════════════════════════════
// Section 1: Feature flag gating
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §1: Feature flag gating', () => {
  it('1.1 _contentSearchEnabled variable exists in source', () => {
    expect(jobFeedSrc).toContain('var _contentSearchEnabled = false');
  });

  it('1.2 isFeatureEnabled(feed_content_search) is called in searchJobs', () => {
    expect(jobFeedSrc).toContain("isFeatureEnabled('feed_content_search'");
  });

  it('1.3 flag evaluation is wrapped in try/catch with false fallback', () => {
    const flagBlock = jobFeedSrc.match(/try\s*\{[^}]*isFeatureEnabled\('feed_content_search'[^}]*\}\s*catch/s);
    expect(flagBlock).not.toBeNull();
  });

  it('1.4 flag default is false (safe fallback)', () => {
    expect(jobFeedSrc).toContain("isFeatureEnabled('feed_content_search', false)");
  });

  it('1.5 flag evaluation happens before buildFilterQuery calls', () => {
    const flagPos = jobFeedSrc.indexOf("isFeatureEnabled('feed_content_search'");
    const firstBuildCall = jobFeedSrc.indexOf('buildFilterQuery(filtersToRun[0]');
    expect(flagPos).toBeLessThan(firstBuildCall);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 2: Positive What pills — content_tsv.wfts clauses
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §2: Positive What pills include content_tsv', () => {
  it('2.1 content_tsv.wfts(english) clause present in source when flag enabled', () => {
    expect(jobFeedSrc).toContain('content_tsv.wfts(english).${safe}');
  });

  it('2.2 content_tsv clause is inside _contentSearchEnabled guard', () => {
    // Find the block between "if (_contentSearchEnabled)" and the return
    const match = jobFeedSrc.match(/if\s*\(_contentSearchEnabled\)\s*\{[\s\S]*?content_tsv\.wfts\(english\)/);
    expect(match).not.toBeNull();
  });

  it('2.3 title.ilike still present (not replaced, expanded)', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).toContain('title.ilike.%${safe}%');
  });

  it('2.4 OR clause joins both title and content_tsv clauses', () => {
    // The .or() call uses allWhatClauses which includes both when enabled
    expect(jobFeedSrc).toContain("query = query.or(allWhatClauses.join(','))");
  });

  it('2.5 uses wfts (websearch) not plfts or phfts', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).toContain('wfts(english)');
    expect(whatBlock).not.toContain('plfts');
    expect(whatBlock).not.toContain('phfts');
  });

  it('2.6 does NOT use ilike on raw content column (must use GIN index)', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).not.toContain('content.ilike');
    expect(whatBlock).not.toContain('job_description.ilike');
  });

  it('2.7 sanitization strips commas and parentheses from search terms', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).toContain("replace(/[,()]/g, '')");
  });

  it('2.8 empty terms are filtered out before building clauses', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).toContain("if (!safe) return []");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 3: Negative What NOT pills — content_tsv NOT clauses
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §3: Negative What NOT pills exclude from content_tsv', () => {
  it('3.1 NOT content_tsv clause present in What NOT section', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    expect(notBlock).toContain("query.not('content_tsv', 'wfts(english)', term)");
  });

  it('3.2 NOT content_tsv is inside _contentSearchEnabled guard', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    const match = notBlock.match(/if\s*\(_contentSearchEnabled\)\s*\{[\s\S]*?not\('content_tsv'/);
    expect(match).not.toBeNull();
  });

  it('3.3 title NOT ilike still present (not replaced)', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    expect(notBlock).toContain("query.not('title', 'ilike'");
  });

  it('3.4 both title NOT and content NOT are applied per term', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    // title NOT and content NOT should be in the same if(term) block
    const termBlock = notBlock.match(/if\s*\(term\)\s*\{[\s\S]*?not\('title'[\s\S]*?not\('content_tsv'/);
    expect(termBlock).not.toBeNull();
  });

  it('3.5 nor prefix stripping still works', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    expect(notBlock).toContain("replace(/^nor\\s+/i, '')");
  });

  it('3.6 NOT uses wfts not ilike on content', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    expect(notBlock).not.toContain("not('content_tsv', 'ilike'");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 4: Global title exclusions — content_tsv NOT
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §4: Global title exclusions also exclude from content', () => {
  it('4.1 content_tsv NOT present in global exclusions block', () => {
    const globalBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// Global title exclusions'),
      jobFeedSrc.indexOf('// WHERE')
    );
    expect(globalBlock).toContain("not('content_tsv', 'wfts(english)', v)");
  });

  it('4.2 global exclusions are behind _contentSearchEnabled guard', () => {
    const globalBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// Global title exclusions'),
      jobFeedSrc.indexOf('// WHERE')
    );
    expect(globalBlock).toContain('_contentSearchEnabled');
  });

  it('4.3 tuning.titleExcludes source reference preserved', () => {
    const globalBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// Global title exclusions'),
      jobFeedSrc.indexOf('// WHERE')
    );
    expect(globalBlock).toContain('tuning.titleExcludes');
  });

  it('4.4 title NOT ilike still applied regardless of flag', () => {
    const globalBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// Global title exclusions'),
      jobFeedSrc.indexOf('// WHERE')
    );
    expect(globalBlock).toContain("query.not('title', 'ilike'");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 5: Atomic guarantee — positive and negative ship together
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §5: Atomic guarantee', () => {
  it('5.1 same flag variable controls both positive and negative', () => {
    const positiveGuard = jobFeedSrc.indexOf('if (_contentSearchEnabled) {\n        // FA-001: OR title match');
    const negativeGuard = jobFeedSrc.indexOf('if (_contentSearchEnabled) {\n          query = query.not(\'content_tsv\'');
    expect(positiveGuard).toBeGreaterThan(-1);
    expect(negativeGuard).toBeGreaterThan(-1);
  });

  it('5.2 no separate flags for positive vs negative content search', () => {
    // There should only be one flag key: feed_content_search
    const flagRefs = jobFeedSrc.match(/isFeatureEnabled\(['"]([^'"]+)['"]/g) || [];
    const contentFlags = flagRefs.filter(f => f.includes('content'));
    expect(contentFlags.length).toBe(1);
    expect(contentFlags[0]).toContain('feed_content_search');
  });

  it('5.3 comment explicitly states atomic requirement', () => {
    expect(jobFeedSrc).toContain('Atomic');
    expect(jobFeedSrc).toContain('never ship positive content search without negative');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 6: Edge cases
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §6: Edge cases', () => {
  it('6.1 commas in search terms are stripped (prevents clause split)', () => {
    expect(jobFeedSrc).toContain("replace(/[,()]/g, '')");
  });

  it('6.2 parentheses in search terms are stripped (prevents PostgREST confusion)', () => {
    // Same regex as 6.1 — verified together
    const re = /replace\(\/\[,\(\)\]\/g/;
    expect(re.test(jobFeedSrc)).toBe(true);
  });

  it('6.3 empty terms produce no clauses', () => {
    expect(jobFeedSrc).toContain('if (!safe) return []');
  });

  it('6.4 content_tsv wfts handles multi-word terms (websearch_to_tsquery)', () => {
    // wfts = websearch full-text search, which handles "data engineer" as "data & engineer"
    // We use wfts specifically for this reason
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    expect(whatBlock).toContain('wfts(english)');
  });

  it('6.5 JD CONTAINS pills unchanged (separate concern)', () => {
    const jdBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// JD CONTAINS'),
      jobFeedSrc.indexOf('// DEPARTMENT')
    );
    // JD pills should still use textSearch directly, not .or()
    expect(jdBlock).toContain("query.textSearch('content_tsv'");
    expect(jdBlock).not.toContain('_contentSearchEnabled');
  });

  it('6.6 no double-search when JD pill AND What pill both use content_tsv', () => {
    // JD pills use textSearch() directly (AND with other clauses)
    // What pills use .or() with content_tsv (OR with title)
    // These are separate filter dimensions so double-matching is correct behavior
    // This test just verifies they use different mechanisms
    const jdBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// JD CONTAINS'),
      jobFeedSrc.indexOf('// DEPARTMENT')
    );
    expect(jdBlock).toContain('textSearch');
    expect(jdBlock).not.toContain('.or(');
  });

  it('6.7 _contentSearchEnabled defaults to false for safety', () => {
    expect(jobFeedSrc).toContain('var _contentSearchEnabled = false');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 7: PostHog event property
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §7: PostHog event includes content_search_enabled', () => {
  it('7.1 content_search_enabled property exists in feed_search_completed event', () => {
    const eventBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf("posthog.capture('feed_search_completed'"),
      jobFeedSrc.indexOf("posthog.capture('feed_zero_results'")
    );
    expect(eventBlock).toContain('content_search_enabled');
  });

  it('7.2 content_search_enabled references _contentSearchEnabled variable', () => {
    expect(jobFeedSrc).toContain('content_search_enabled: _contentSearchEnabled');
  });

  it('7.3 content_match_count still tracked (FA-010 baseline preserved)', () => {
    expect(jobFeedSrc).toContain('content_match_count: _faContentMatchCount');
  });

  it('7.4 both properties enable pre/post comparison in PostHog', () => {
    // content_match_count (how many) + content_search_enabled (flag state) = segmentable
    const eventBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf("posthog.capture('feed_search_completed'"),
      jobFeedSrc.indexOf("posthog.capture('feed_zero_results'")
    );
    expect(eventBlock).toContain('content_match_count');
    expect(eventBlock).toContain('content_search_enabled');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Section 8: Backward compatibility — flag off = title-only
// ═══════════════════════════════════════════════════════════════════
describe('FA-001 §8: Backward compatibility when flag is off', () => {
  it('8.1 title-only path still exists as else branch', () => {
    const whatBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT — title matching'),
      jobFeedSrc.indexOf('// WHAT NOT')
    );
    // After the if (_contentSearchEnabled) block, there's a plain title-only return
    const hasFallback = whatBlock.includes('// Pre-FA-001 fallback: title-only');
    expect(hasFallback).toBe(true);
  });

  it('8.2 What NOT pills only add title NOT when flag is off', () => {
    const notBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// WHAT NOT'),
      jobFeedSrc.indexOf('// Global title exclusions')
    );
    // The content NOT is inside an if (_contentSearchEnabled) guard
    // Without the flag, only title NOT is applied
    const guardedContent = notBlock.match(/if\s*\(_contentSearchEnabled\)\s*\{\s*\n\s*query = query\.not\('content_tsv'/);
    expect(guardedContent).not.toBeNull();
  });

  it('8.3 global exclusions only add title NOT when flag is off', () => {
    const globalBlock = jobFeedSrc.substring(
      jobFeedSrc.indexOf('// Global title exclusions'),
      jobFeedSrc.indexOf('// WHERE')
    );
    const guardedContent = globalBlock.match(/if\s*\(_contentSearchEnabled\)\s*\{/);
    expect(guardedContent).not.toBeNull();
  });

  it('8.4 feature flag migration exists', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'v6.40-fa001-content-search-flag.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);
  });

  it('8.5 migration sets flag to active with 100% rollout', () => {
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', 'v6.40-fa001-content-search-flag.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain("'active'");
    expect(sql).toContain('100');
    expect(sql).toContain('feed_content_search');
  });
});
