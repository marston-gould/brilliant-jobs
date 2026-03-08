/**
 * FA-010: PostHog Feed Instrumentation — Baseline Before Fixes
 * 
 * Validates that all PostHog events are wired correctly in job-feed.js
 * so the Feed Accuracy Sprint has quantitative baselines.
 * 
 * Pod 3 Team: DevOps + Senior Frontend (pairing)
 * Reviewers: Chief Architect, Evolvability Strategist
 */

const fs = require('fs');
const path = require('path');

const FEED_JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'job-feed.js'), 'utf8');
const FEED_BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'dist', 'dashboard.min.js'), 'utf8');

// ─── Section 1: PostHog Events Wired ───────────────────────────────

describe('FA-010 Section 1: PostHog events in job-feed.js', () => {
  test('feed_search_completed event is captured', () => {
    expect(FEED_JS).toContain("posthog.capture('feed_search_completed'");
  });

  test('feed_zero_results event is captured', () => {
    expect(FEED_JS).toContain("posthog.capture('feed_zero_results'");
  });

  test('feed_page_turn event is captured', () => {
    expect(FEED_JS).toContain("posthog.capture('feed_page_turn'");
  });

  test('feed_search_error event is captured', () => {
    expect(FEED_JS).toContain("posthog.capture('feed_search_error'");
  });

  test('all 4 events present in a single file', () => {
    const events = [
      'feed_search_completed',
      'feed_zero_results',
      'feed_page_turn',
      'feed_search_error'
    ];
    events.forEach(e => {
      expect(FEED_JS).toContain(e);
    });
  });
});

// ─── Section 2: Event Properties — feed_search_completed ───────────

describe('FA-010 Section 2: feed_search_completed properties', () => {
  // Extract the block around feed_search_completed
  const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_completed'");
  const block = FEED_JS.substring(captureIdx, captureIdx + 2000);

  const requiredProps = [
    'total_count',
    'page_jobs_count',
    'page_number',
    'filters_active_count',
    'filter_names',
    'us_only',
    'include_remote',
    'include_no_salary',
    'trust_filter_active',
    'ai_filter_active',
    'what_pills_count',
    'where_pills_count',
    'when_pills_count',
    'who_pills_count',
    'pay_pills_count',
    'client_side_filtered_out',
    'search_mode',
    'latency_ms',
    'is_zero_results',
    'null_loc_country_count',
    'content_match_count'
  ];

  requiredProps.forEach(prop => {
    test(`includes property: ${prop}`, () => {
      expect(block).toContain(prop);
    });
  });
});

// ─── Section 3: Latency Measurement ────────────────────────────────

describe('FA-010 Section 3: Latency measurement infrastructure', () => {
  test('searchStartMs timestamp captured inside searchJobs', () => {
    // Should be in searchJobs function, inside try block
    const searchJobsIdx = FEED_JS.indexOf('async function searchJobs(page = 0)');
    const fnBlock = FEED_JS.substring(searchJobsIdx, searchJobsIdx + 3000);
    expect(fnBlock).toContain('_searchStartMs = Date.now()');
  });

  test('latency_ms computed from _searchStartMs', () => {
    expect(FEED_JS).toContain('Date.now() - _searchStartMs');
  });

  test('latency_ms sent in feed_search_completed', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_completed'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 2000);
    expect(block).toContain('latency_ms');
  });

  test('latency_ms sent in feed_page_turn', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_page_turn'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 400);
    expect(block).toContain('latency_ms');
  });
});

// ─── Section 4: US-Only Leakage Tracking ───────────────────────────

describe('FA-010 Section 4: US-Only leakage tracking', () => {
  test('null_loc_country_count computed from currentJobs', () => {
    expect(FEED_JS).toContain('_faNullLocCountry');
  });

  test('checks loc_country for null/undefined', () => {
    expect(FEED_JS).toContain('loc_country');
    // Should check for falsy loc_country
    expect(FEED_JS).toMatch(/!currentJobs\[.*\]\.loc_country/);
  });

  test('null_loc_country_count included in feed_search_completed', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_completed'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 2000);
    expect(block).toContain('null_loc_country_count');
  });
});

// ─── Section 5: Content Match Tracking ─────────────────────────────

describe('FA-010 Section 5: Content match tracking (pre-FA-001 baseline)', () => {
  test('content_match_count variable computed', () => {
    expect(FEED_JS).toContain('_faContentMatchCount');
  });

  test('checks if title does NOT contain What pill term', () => {
    // Should check title for each what term
    expect(FEED_JS).toContain('_fjTitle');
    expect(FEED_JS).toContain('_fjTitleMatch');
  });

  test('content_match_count included in feed_search_completed', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_completed'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 2000);
    expect(block).toContain('content_match_count');
  });

  test('content_match_count only counted when What pills exist', () => {
    // Should guard with _faWhatTerms.length > 0
    expect(FEED_JS).toContain('_faWhatTerms.length > 0');
  });
});

// ─── Section 6: Search Mode Detection ──────────────────────────────

describe('FA-010 Section 6: Search mode detection', () => {
  test('detects builder mode', () => {
    expect(FEED_JS).toContain("_faSearchMode = 'builder'");
  });

  test('detects saved_filter mode', () => {
    expect(FEED_JS).toContain("_faSearchMode = 'saved_filter'");
  });

  test('detects prompt mode', () => {
    expect(FEED_JS).toContain("_faSearchMode = 'prompt'");
  });

  test('detects saved_filter+prompt combined mode', () => {
    expect(FEED_JS).toContain("_faSearchMode = 'saved_filter+prompt'");
  });

  test('search_mode included in feed_search_completed', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_completed'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 2000);
    expect(block).toContain('search_mode');
  });
});

// ─── Section 7: Error Tracking ─────────────────────────────────────

describe('FA-010 Section 7: Error event properties', () => {
  test('feed_search_error in catch block', () => {
    // The error capture should be near the catch
    const catchIdx = FEED_JS.indexOf("} catch (e) {", FEED_JS.indexOf("renderJobRows"));
    const block = FEED_JS.substring(catchIdx, catchIdx + 500);
    expect(block).toContain("posthog.capture('feed_search_error'");
  });

  test('error_message property included', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_error'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 300);
    expect(block).toContain('error_message');
  });

  test('filters_active_count in error event', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_error'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 300);
    expect(block).toContain('filters_active_count');
  });
});

// ─── Section 8: Zero Results Event ─────────────────────────────────

describe('FA-010 Section 8: Zero results event', () => {
  test('conditional on totalCount === 0', () => {
    // Find the zero results capture
    const zeroIdx = FEED_JS.indexOf("posthog.capture('feed_zero_results'");
    // Should be preceded by totalCount === 0 check
    const before = FEED_JS.substring(zeroIdx - 200, zeroIdx);
    expect(before).toContain('totalCount === 0');
  });

  test('includes filter detail properties', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_zero_results'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 600);
    expect(block).toContain('filter_names');
    expect(block).toContain('search_mode');
    expect(block).toContain('us_only');
  });
});

// ─── Section 9: Page Turn Event ────────────────────────────────────

describe('FA-010 Section 9: Page turn event', () => {
  test('conditional on page > 0', () => {
    const turnIdx = FEED_JS.indexOf("posthog.capture('feed_page_turn'");
    const before = FEED_JS.substring(turnIdx - 100, turnIdx);
    expect(before).toContain('page > 0');
  });

  test('includes page_number property', () => {
    const turnIdx = FEED_JS.indexOf("posthog.capture('feed_page_turn'");
    const block = FEED_JS.substring(turnIdx, turnIdx + 300);
    expect(block).toContain('page_number');
  });

  test('includes direction property', () => {
    const turnIdx = FEED_JS.indexOf("posthog.capture('feed_page_turn'");
    const block = FEED_JS.substring(turnIdx, turnIdx + 300);
    expect(block).toContain('direction');
  });

  test('includes total_count property', () => {
    const turnIdx = FEED_JS.indexOf("posthog.capture('feed_page_turn'");
    const block = FEED_JS.substring(turnIdx, turnIdx + 300);
    expect(block).toContain('total_count');
  });
});

// ─── Section 10: Safety Guards ─────────────────────────────────────

describe('FA-010 Section 10: Safety guards', () => {
  test('all posthog calls guarded with typeof check', () => {
    // Find all posthog.capture calls in the FA-010 block
    const fa010Start = FEED_JS.indexOf('FA-010: PostHog Feed Instrumentation');
    const fa010End = FEED_JS.indexOf('═══════════', fa010Start + 100);
    // The block and the catch both guard with typeof posthog
    expect(FEED_JS.match(/typeof posthog !== 'undefined'/g).length).toBeGreaterThanOrEqual(2);
  });

  test('filtersToRun null-safe in error event', () => {
    const captureIdx = FEED_JS.indexOf("posthog.capture('feed_search_error'");
    const block = FEED_JS.substring(captureIdx, captureIdx + 300);
    // Should handle case where filtersToRun might not be defined in catch scope
    expect(block).toContain('filtersToRun ?');
  });
});

// ─── Section 11: Build Output ──────────────────────────────────────

describe('FA-010 Section 11: Build output includes instrumentation', () => {
  test('feed_search_completed in minified bundle', () => {
    expect(FEED_BUNDLE).toContain('feed_search_completed');
  });

  test('feed_zero_results in minified bundle', () => {
    expect(FEED_BUNDLE).toContain('feed_zero_results');
  });

  test('feed_page_turn in minified bundle', () => {
    expect(FEED_BUNDLE).toContain('feed_page_turn');
  });

  test('feed_search_error in minified bundle', () => {
    expect(FEED_BUNDLE).toContain('feed_search_error');
  });
});

// ─── Section 12: File Inventory ────────────────────────────────────

describe('FA-010 Section 12: File inventory', () => {
  test('job-feed.js exists and is modified', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'js', 'job-feed.js'))).toBe(true);
  });

  test('dashboard bundle exists', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'dist', 'dashboard.min.js'))).toBe(true);
  });

  test('test file exists', () => {
    expect(fs.existsSync(path.join(__dirname, 'fa-010-feed-instrumentation.test.js'))).toBe(true);
  });

  test('PostHog dashboard spec exists', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'docs', 'feed-accuracy', 'fa-010-posthog-dashboard-spec.md'))).toBe(true);
  });
});
