/**
 * post-rem-chat-analytics.test.js
 * Validation tests for:
 *   - PostHog chat mode dashboard (admin-chat-analytics.js)
 *   - Edge Function cost monitoring + response caching (chat-job-search)
 *   - Admin analytics EF chat_analytics action
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─── Helper ───
function readFile(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function fileExists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

// ═══════════════════════════════════════════════════════════
// Section 1: admin-chat-analytics.js — File Structure
// ═══════════════════════════════════════════════════════════

describe('Section 1: admin-chat-analytics.js file structure', () => {
  const src = readFile('js/admin-chat-analytics.js');

  test('file exists', () => {
    expect(fileExists('js/admin-chat-analytics.js')).toBe(true);
  });

  test('tracks all 16 chat events', () => {
    const events = [
      'chat_mode_toggled', 'chat_message_sent', 'chat_filters_extracted',
      'chat_filters_applied', 'chat_to_filter_sync', 'chat_prompt_auto_generated',
      'chat_prompt_modified', 'chat_prompt_saved', 'chat_prompt_loaded',
      'chat_prompt_deleted', 'chat_prompt_resume_assigned', 'chat_edge_function_latency',
      'chat_rate_limited', 'chat_onboarding_tooltip_shown',
      'chat_onboarding_tooltip_dismissed', 'chat_prompt_scrapped'
    ];
    events.forEach(evt => {
      expect(src).toContain(evt);
    });
  });

  test('has core funnel rendering (toggle → message → filters)', () => {
    expect(src).toContain('Toggle → Message → Filters');
  });

  test('has saved prompt adoption funnel', () => {
    expect(src).toContain('Saved Prompt Adoption');
  });

  test('has tooltip conversion section', () => {
    expect(src).toContain('Tooltip Conversion');
    expect(src).toContain('tooltip_dismissed_button');
    expect(src).toContain('tooltip_dismissed_toggle');
  });

  test('has rate limit by tier breakdown', () => {
    expect(src).toContain('Rate Limits by Tier');
    expect(src).toContain("'free'");
    expect(src).toContain("'starter'");
    expect(src).toContain("'pro'");
  });

  test('has latency percentile display (p50, p95, p99)', () => {
    expect(src).toContain('p50');
    expect(src).toContain('p95');
    expect(src).toContain('p99');
  });

  test('has latency sparkline renderer', () => {
    expect(src).toContain('_renderLatencySparkline');
    expect(src).toContain('polyline');
  });

  test('has 2000ms target line in sparkline', () => {
    expect(src).toContain('2000ms target');
  });

  test('has p95 > 2000ms alert', () => {
    expect(src).toContain('exceeds 2000ms target');
  });

  test('has cache performance section', () => {
    expect(src).toContain('Response Cache Performance');
    expect(src).toContain('Hit Rate');
    expect(src).toContain('Cache Hits');
    expect(src).toContain('Est. Savings');
  });

  test('has event volume table for all 16 events', () => {
    expect(src).toContain('Event Volume');
    expect(src).toContain('CHAT_EVENTS.forEach');
  });

  test('has polling lifecycle', () => {
    expect(src).toContain('startChatAnalyticsPolling');
    expect(src).toContain('stopChatAnalyticsPolling');
  });

  test('uses reportError for error handling', () => {
    expect(src).toContain('reportError');
  });

  test('calls admin-analytics EF with chat_analytics action', () => {
    expect(src).toContain('chat_analytics');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: admin-analytics EF — chat_analytics action
// ═══════════════════════════════════════════════════════════

describe('Section 2: admin-analytics EF chat_analytics action', () => {
  const src = readFile('supabase/functions/admin-analytics/index.ts');

  test('has chat_analytics case in switch', () => {
    expect(src).toContain('case "chat_analytics"');
  });

  test('has getChatAnalytics function', () => {
    expect(src).toContain('async function getChatAnalytics');
  });

  test('queries all 16 CHAT_EVENTS', () => {
    expect(src).toContain('chat_mode_toggled');
    expect(src).toContain('chat_prompt_scrapped');
    expect(src).toContain('chat_onboarding_tooltip_shown');
    expect(src).toContain('chat_onboarding_tooltip_dismissed');
  });

  test('computes latency percentiles', () => {
    expect(src).toContain('latencyEvents');
    expect(src).toContain('Math.floor(latencyEvents.length * 0.5)');
    expect(src).toContain('Math.floor(latencyEvents.length * 0.95)');
    expect(src).toContain('Math.floor(latencyEvents.length * 0.99)');
  });

  test('returns funnel data', () => {
    expect(src).toContain('funnel_toggle');
    expect(src).toContain('funnel_message');
    expect(src).toContain('funnel_filters');
  });

  test('returns tooltip conversion breakdown', () => {
    expect(src).toContain('tooltip_dismissed_button');
    expect(src).toContain('tooltip_dismissed_toggle');
  });

  test('returns rate limits by tier', () => {
    expect(src).toContain('rate_limits_by_tier');
  });

  test('returns latency trend for sparkline', () => {
    expect(src).toContain('latencyTrend');
    expect(src).toContain('latencyByDay');
  });

  test('returns cache stats', () => {
    expect(src).toContain('cache_hit');
    expect(src).toContain('estimated_savings');
  });

  test('action list in error message is updated', () => {
    expect(src).toContain('chat_analytics');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: chat-job-search EF — response caching
// ═══════════════════════════════════════════════════════════

describe('Section 3: chat-job-search EF response caching', () => {
  const src = readFile('supabase/functions/chat-job-search/index.ts');

  test('has filter cache constants', () => {
    expect(src).toContain('FILTER_CACHE_TTL_MS');
    expect(src).toContain('FILTER_CACHE_MAX_SIZE');
    expect(src).toContain('200'); // max size
  });

  test('has _filterCache Map', () => {
    expect(src).toContain('_filterCache');
    expect(src).toContain('new Map');
  });

  test('has _cacheKey function using djb2 hash', () => {
    expect(src).toContain('function _cacheKey');
    expect(src).toContain('djb2');
  });

  test('cache key uses last 3 user messages', () => {
    expect(src).toContain("filter(m => m.role === 'user').slice(-3)");
  });

  test('has _getCached with TTL check', () => {
    expect(src).toContain('function _getCached');
    expect(src).toContain('FILTER_CACHE_TTL_MS');
  });

  test('has _setCache with eviction', () => {
    expect(src).toContain('function _setCache');
    expect(src).toContain('FILTER_CACHE_MAX_SIZE');
  });

  test('cache lookup happens before Anthropic API call', () => {
    const cacheCheckIdx = src.indexOf('_getCached(cKey)');
    const anthropicCallIdx = src.indexOf("fetch('https://api.anthropic.com/v1/messages'");
    expect(cacheCheckIdx).toBeLessThan(anthropicCallIdx);
    expect(cacheCheckIdx).toBeGreaterThan(-1);
  });

  test('cache hit returns response with cache_hit: true', () => {
    expect(src).toContain('cache_hit: true');
  });

  test('cache set happens after filter extraction', () => {
    const setIdx = src.indexOf('_setCache(cKey');
    const extractIdx = src.indexOf('extractFilters(rawText)');
    expect(setIdx).toBeGreaterThan(extractIdx);
  });

  test('cache only stores responses with filters', () => {
    expect(src).toContain('Object.keys(filters).length > 0');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: chat.js — cache_hit PostHog tracking
// ═══════════════════════════════════════════════════════════

describe('Section 4: chat.js cache_hit PostHog tracking', () => {
  const src = readFile('js/chat.js');

  test('captures cache_hit event when response is cached', () => {
    expect(src).toContain('data.cache_hit');
    expect(src).toContain("posthog.capture('chat_edge_function_latency'");
  });

  test('includes cache_hit: true in PostHog event', () => {
    expect(src).toContain('cache_hit: true');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: admin.html integration
// ═══════════════════════════════════════════════════════════

describe('Section 5: admin.html integration', () => {
  const src = readFile('admin.html');

  test('has chat-analytics page container', () => {
    expect(src).toContain('admin-page-chat-analytics');
  });

  test('loads admin-chat-analytics.js', () => {
    expect(src).toContain('admin-chat-analytics.js');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: Version & Build
// ═══════════════════════════════════════════════════════════

describe('Section 6: Version and build output', () => {
  test('product version is v7.67', () => {
    const version = readFile('js/version.js');
    expect(version).toContain('v7.67');
  });

  test('admin.html references v7.67', () => {
    const admin = readFile('admin.html');
    expect(admin).toContain('v=v7.67');
  });

  test('dist/dashboard.min.js exists', () => {
    expect(fileExists('dist/dashboard.min.js')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 7: File inventory
// ═══════════════════════════════════════════════════════════

describe('Section 7: File inventory', () => {
  const expectedFiles = [
    'js/admin-chat-analytics.js',
    'supabase/functions/admin-analytics/index.ts',
    'supabase/functions/chat-job-search/index.ts',
    'js/chat.js',
    'admin.html',
    'js/version.js'
  ];

  expectedFiles.forEach(f => {
    test(`${f} exists`, () => {
      expect(fileExists(f)).toBe(true);
    });
  });
});
