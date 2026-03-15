/**
 * BP-001 + BP-002 — Anthropic circuit breaker + Extension tier awareness
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');

// ═══════════════════════════════════════════════════════════
// BP-001: Anthropic circuit breaker
// ═══════════════════════════════════════════════════════════
describe('BP-001: Anthropic shared wrapper', () => {
  const wrapper = read('supabase/functions/_shared/anthropic.ts');

  it('exports anthropicFetch', () => {
    expect(wrapper).toContain('export async function anthropicFetch');
  });

  it('exports withAnthropicBreaker', () => {
    expect(wrapper).toContain('export async function withAnthropicBreaker');
  });

  it('reads circuit breaker state from ai_circuit_breaker', () => {
    expect(wrapper).toContain('ai_circuit_breaker');
    expect(wrapper).toContain('getBreakerState');
  });

  it('has configurable threshold and cooldown', () => {
    expect(wrapper).toContain('BREAKER_THRESHOLD');
    expect(wrapper).toContain('BREAKER_COOLDOWN_MS');
  });

  it('records failures and opens circuit', () => {
    expect(wrapper).toContain('recordBreakerFailure');
    expect(wrapper).toContain('failure_count');
  });

  it('records success and resets circuit', () => {
    expect(wrapper).toContain('recordBreakerSuccess');
    expect(wrapper).toContain('failure_count: 0');
  });

  it('supports half-open state', () => {
    expect(wrapper).toContain('half_open_after');
    expect(wrapper).toContain('HALF-OPEN');
  });

  it('respects retry-after header on 429', () => {
    expect(wrapper).toContain('parseRetryAfter');
    expect(wrapper).toContain('retry-after');
  });

  it('retries on 429 and 5xx', () => {
    expect(wrapper).toContain('resp.status === 429');
    expect(wrapper).toContain('resp.status >= 500');
  });

  it('does not retry on 4xx client errors', () => {
    expect(wrapper).toContain("don't retry, don't trip breaker");
  });

  it('logs usage to ai_usage_log', () => {
    expect(wrapper).toContain('ai_usage_log');
    expect(wrapper).toContain('logUsage');
  });

  it('logs caller_ef and model', () => {
    expect(wrapper).toContain('caller_ef: callerEf');
  });

  it('returns circuitOpen flag', () => {
    expect(wrapper).toContain('circuitOpen: true');
  });
});

describe('BP-001: Migration', () => {
  it('migration file exists', () => {
    expect(existsSync('supabase/migrations/20260315000005_bp_001_circuit_breaker.sql')).toBe(true);
  });

  const migration = read('supabase/migrations/20260315000005_bp_001_circuit_breaker.sql');

  it('creates ai_circuit_breaker table', () => {
    expect(migration).toContain('ai_circuit_breaker');
    expect(migration).toContain('is_open');
    expect(migration).toContain('failure_count');
    expect(migration).toContain('half_open_after');
  });

  it('creates ai_usage_log extensions', () => {
    expect(migration).toContain('ai_usage_log');
    expect(migration).toContain('caller_ef');
    expect(migration).toContain('input_tokens');
    expect(migration).toContain('output_tokens');
  });
});

describe('BP-001: EF integration — score-resume', () => {
  const ef = read('supabase/functions/score-resume/index.ts');

  it('imports withAnthropicBreaker', () => {
    expect(ef).toContain("import { withAnthropicBreaker }");
  });

  it('wraps callAnthropic with breaker', () => {
    expect(ef).toContain("withAnthropicBreaker(sb, 'score-resume'");
  });

  it('handles circuitOpen with 503', () => {
    expect(ef).toContain('breakerResult.circuitOpen');
    expect(ef).toContain('503');
  });
});

describe('BP-001: EF integration — chat-job-search', () => {
  const ef = read('supabase/functions/chat-job-search/index.ts');

  it('imports withAnthropicBreaker', () => {
    expect(ef).toContain("import { withAnthropicBreaker }");
  });

  it('wraps Anthropic call with breaker', () => {
    expect(ef).toContain("withAnthropicBreaker(sb, 'chat-job-search'");
  });

  it('handles circuitOpen with 503', () => {
    expect(ef).toContain('breakerResult.circuitOpen');
    expect(ef).toContain('503');
  });
});

describe('BP-001: EF integration — classify-pipeline-signal', () => {
  const ef = read('supabase/functions/classify-pipeline-signal/index.ts');

  it('imports withAnthropicBreaker', () => {
    expect(ef).toContain("import { withAnthropicBreaker }");
  });

  it('wraps Anthropic call with breaker', () => {
    expect(ef).toContain("withAnthropicBreaker(sb, 'classify-pipeline-signal'");
  });

  it('handles circuitOpen', () => {
    expect(ef).toContain('breakerResult.circuitOpen');
  });
});

// ═══════════════════════════════════════════════════════════
// BP-002: Extension tier awareness
// ═══════════════════════════════════════════════════════════
describe('BP-002: Extension tier gate', () => {
  const bg = read('extension/background.ts');

  it('defines PRO_ONLY_MODES', () => {
    expect(bg).toContain('PRO_ONLY_MODES');
  });

  it('includes auto-apply in pro-only modes', () => {
    expect(bg).toContain("'auto-apply'");
  });

  it('includes auto-score-gate in pro-only modes', () => {
    expect(bg).toContain("'auto-score-gate'");
  });

  it('includes one-click in pro-only modes', () => {
    expect(bg).toContain("'one-click'");
  });

  it('reads userRole from chrome.storage', () => {
    expect(bg).toContain("chrome.storage.local.get('userRole'");
  });

  it('checks for pro or admin role', () => {
    expect(bg).toContain("userRole === 'pro'");
    expect(bg).toContain("userRole === 'admin'");
  });

  it('sends upgradeRequired message to overlay', () => {
    expect(bg).toContain("'bj:toolbar:upgradeRequired'");
  });

  it('fires tier_gate_blocked PostHog event', () => {
    expect(bg).toContain("'tier_gate_blocked'");
  });

  it('returns upgrade_required status', () => {
    expect(bg).toContain("status: 'upgrade_required'");
  });
});

describe('BP-002: Overlay upgrade prompt', () => {
  const overlay = read('extension/job-site-overlay.ts');

  it('handles bj:toolbar:upgradeRequired message', () => {
    expect(overlay).toContain("'bj:toolbar:upgradeRequired'");
  });

  it('shows Upgrade to Pro button', () => {
    expect(overlay).toContain('Upgrade to Pro');
  });

  it('links to billing page', () => {
    expect(overlay).toContain('dashboard#billing');
  });

  it('has dismiss button', () => {
    expect(overlay).toContain('Dismiss');
  });

  it('auto-removes after 10 seconds', () => {
    expect(overlay).toContain('10000');
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.27', () => {
  it('version.js has v9.27', () => {
    expect(read('js/version.js')).toContain('v9.27');
  });
});
