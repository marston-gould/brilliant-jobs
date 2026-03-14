// tests/fb-trial-001-s6-cost-optimizations.test.js
// FB-TRIAL-001-S6: Cost Optimizations 5.1–5.3 validation tests
// Sections: prompt caching, batch scorer EF, fly.toml, billing toggle, PostHog doc, gateway

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── 1. Prompt Caching — chat-job-search (5.1) ───────────────────────────────
describe('5.1 — chat-job-search prompt caching', () => {
  const src = fs.readFileSync('supabase/functions/chat-job-search/index.ts', 'utf8');

  it('adds anthropic-beta prompt-caching header', () => {
    expect(src).toContain("'anthropic-beta': 'prompt-caching-2024-07-31'");
  });

  it('converts system prompt to array with cache_control ephemeral', () => {
    expect(src).toContain("cache_control: { type: 'ephemeral' }");
    expect(src).toContain("type: 'text'");
    // system is now array, not plain string
    expect(src).toContain('system: [{ type:');
  });

  it('logs cache_hit_rate after Anthropic response', () => {
    expect(src).toContain('cache_hit_rate=');
    expect(src).toContain('tokens_saved=');
    expect(src).toContain('cache_read_input_tokens');
  });
});

// ─── 2. Prompt Caching — score-resume (5.1) ──────────────────────────────────
describe('5.1 — score-resume prompt caching', () => {
  const src = fs.readFileSync('supabase/functions/score-resume/index.ts', 'utf8');

  it('adds anthropic-beta prompt-caching header to callAnthropic', () => {
    expect(src).toContain("'anthropic-beta': 'prompt-caching-2024-07-31'");
  });

  it('wraps system prompt in array with cache_control', () => {
    expect(src).toContain('cache_control: { type:');
    expect(src).toContain("'ephemeral'");
    expect(src).toContain("type: 'text', text: systemPrompt");
  });

  it('captures cache_read_input_tokens in usage', () => {
    expect(src).toContain('cache_read_input_tokens');
    expect(src).toContain('cache_creation_input_tokens');
  });

  it('logs cache hit rate when > 0', () => {
    expect(src).toContain('cache_hit_rate=');
  });
});

// ─── 3. batch-resume-scorer EF (5.2) ─────────────────────────────────────────
describe('5.2 — batch-resume-scorer EF', () => {
  const efPath = 'supabase/functions/batch-resume-scorer/index.ts';
  expect(fs.existsSync(efPath)).toBe(true);
  const src = fs.readFileSync(efPath, 'utf8');

  it('implements submit action', () => {
    expect(src).toContain('handleSubmit');
    expect(src).toContain("action === 'submit'");
  });

  it('reads up to 50 pending rows for submit', () => {
    expect(src).toContain(".limit(50)");
    expect(src).toContain("status', 'pending'");
  });

  it('submits to Anthropic Batch API', () => {
    expect(src).toContain('/v1/messages/batches');
    expect(src).toContain('message-batches-2024-09-24');
  });

  it('stores batch_id on rows after submit', () => {
    expect(src).toContain("status: 'submitted'");
    expect(src).toContain("batch_id: batchId");
  });

  it('implements poll action', () => {
    expect(src).toContain('handlePoll');
    expect(src).toContain("action === 'poll'");
  });

  it('poll checks processing_status ended', () => {
    expect(src).toContain("processing_status !== 'ended'");
  });

  it('marks rows complete with result JSONB', () => {
    expect(src).toContain("status: 'completed'");
    expect(src).toContain('result: parsed');
  });

  it('marks rows failed with error', () => {
    expect(src).toContain("status: 'failed'");
    expect(src).toContain('error: errMsg');
  });

  it('emits batch_score_completed PostHog event', () => {
    expect(src).toContain('batch_score_completed');
    expect(src).toContain('batch_id');
    expect(src).toContain('scores_count');
    expect(src).toContain('latency_sec');
  });

  it('implements status action returning queue counts', () => {
    expect(src).toContain('handleStatus');
    expect(src).toContain("action === 'status'");
    expect(src).toContain('pending: 0');
  });

  it('is service-role only', () => {
    expect(src).toContain('Service role required');
    expect(src).toContain('SERVICE_ROLE_KEY');
  });

  it('uses prompt caching on batch items', () => {
    expect(src).toContain('cache_control: { type:');
  });
});

// ─── 4. score-resume queue path (5.2) ────────────────────────────────────────
describe('5.2 — score-resume queue path for expired_free', () => {
  const src = fs.readFileSync('supabase/functions/score-resume/index.ts', 'utf8');

  it('inserts to resume_score_queue when access denied and mode=single', () => {
    expect(src).toContain('resume_score_queue');
    expect(src).toContain("queued: true");
    expect(src).toContain("queue_id:");
  });

  it('returns 202 status with X-Score-Queued header', () => {
    expect(src).toContain("status: 202");
    expect(src).toContain("'X-Score-Queued': 'true'");
  });

  it('stores resume_text and job_description_text in queue row', () => {
    expect(src).toContain('resume_text: resume_text.slice');
    expect(src).toContain('job_description_text:');
  });
});

// ─── 5. keywords.js shimmer + poll (5.2) ─────────────────────────────────────
describe('5.2 — keywords.js queue detection and poll', () => {
  const src = fs.readFileSync('js/keywords.js', 'utf8');

  it('detects 202 + X-Score-Queued header', () => {
    expect(src).toContain("res.status === 202");
    expect(src).toContain("X-Score-Queued");
  });

  it('calls _startScoreQueuePoll on queued response', () => {
    expect(src).toContain('_startScoreQueuePoll');
    expect(src).toContain('queueData.queue_id');
  });

  it('_startScoreQueuePoll shows shimmer', () => {
    expect(src).toContain('score-shimmer');
    expect(src).toContain('shimmer');
  });

  it('polls every 10s up to 5 minutes (30 attempts)', () => {
    expect(src).toContain('10000');
    expect(src).toContain('maxAttempts = 30');
  });

  it('renders result when status is completed', () => {
    expect(src).toContain("qrow.status === 'completed'");
    expect(src).toContain('match_score');
  });
});

// ─── 6. batch-resume-scorer migration (5.2) ──────────────────────────────────
describe('5.2 — batch-resume-scorer migration', () => {
  const migPath = 'supabase/migrations/20260314000003_fb_trial_001_s6_batch_scorer.sql';
  expect(fs.existsSync(migPath)).toBe(true);
  const src = fs.readFileSync(migPath, 'utf8');

  it('adds resume_text column to resume_score_queue', () => {
    expect(src).toContain('resume_text TEXT');
  });

  it('adds job_description_text column', () => {
    expect(src).toContain('job_description_text TEXT');
  });

  it('schedules batch-resume-scorer-submit pg_cron', () => {
    expect(src).toContain('batch-resume-scorer-submit');
    expect(src).toContain('*/5 * * * *');
  });

  it('schedules batch-resume-scorer-poll pg_cron', () => {
    expect(src).toContain('batch-resume-scorer-poll');
  });

  it('adds submitted status index', () => {
    expect(src).toContain("WHERE status = 'submitted'");
  });
});

// ─── 7. fly.toml auto-stop (5.2) ─────────────────────────────────────────────
describe('5.2 — fly.toml auto-stop', () => {
  const src = fs.readFileSync('worker/fly.toml', 'utf8');

  it('sets auto_stop_machines = "stop"', () => {
    expect(src).toContain('auto_stop_machines = "stop"');
  });

  it('sets auto_start_machines = true', () => {
    expect(src).toContain('auto_start_machines = true');
  });

  it('sets min_machines_running = 0', () => {
    expect(src).toContain('min_machines_running = 0');
  });
});

// ─── 8. Annual billing toggle — upgrade.js (5.3) ─────────────────────────────
describe('5.3 — upgrade.js billing toggle', () => {
  const jsPath = 'js/upgrade.js';
  expect(fs.existsSync(jsPath)).toBe(true);
  const src = fs.readFileSync(jsPath, 'utf8');

  it('defines initBillingToggle', () => {
    expect(src).toContain('function initBillingToggle');
    expect(src).toContain('window.initBillingToggle = initBillingToggle');
  });

  it('renders monthly pill with $19.99/mo', () => {
    expect(src).toContain('$19.99/mo');
  });

  it('renders annual pill with $199.90/yr and save 17%', () => {
    expect(src).toContain('$199.90/yr');
    expect(src).toContain('save 17%');
  });

  it('defines setBillingPeriod and getBillingPeriod', () => {
    expect(src).toContain('window.setBillingPeriod');
    expect(src).toContain('window.getBillingPeriod');
  });

  it('patches startCheckout to pass billing_period', () => {
    expect(src).toContain('billing_period');
    expect(src).toContain('billing_period: _billingPeriod');
  });

  it('exports to BJ namespace', () => {
    expect(src).toContain('window.BJ.initBillingToggle');
  });
});

// ─── 9. create-checkout billing_period (5.3) ─────────────────────────────────
describe('5.3 — create-checkout EF billing_period routing', () => {
  const src = fs.readFileSync('supabase/functions/create-checkout/index.ts', 'utf8');

  it('extracts billing_period from request body', () => {
    expect(src).toContain('billing_period');
    expect(src).toContain("billing_period === 'annual'");
  });

  it('uses ANNUAL_STRIPE_PRICE_ID for annual tier', () => {
    expect(src).toContain('ANNUAL_STRIPE_PRICE_ID');
    expect(src).toContain("Deno.env.get('ANNUAL_STRIPE_PRICE_ID')");
  });

  it('falls back to monthly if annual price not configured', () => {
    expect(src).toContain('falling back to monthly');
  });

  it('adds us_bank_account payment method for annual', () => {
    expect(src).toContain('us_bank_account');
    expect(src).toContain('payment_method_types');
  });

  it('includes billing_period in subscription metadata', () => {
    expect(src).toContain("metadata][billing_period]");
  });
});

// ─── 10. billing-toggle container in dashboard.html ──────────────────────────
describe('5.3 — dashboard.html billing toggle container', () => {
  const src = fs.readFileSync('dashboard.html', 'utf8');

  it('has #billing-toggle div', () => {
    expect(src).toContain('id="billing-toggle"');
  });

  it('has #sub-upgrade-cta-btn with id for JS targeting', () => {
    expect(src).toContain('id="sub-upgrade-cta-btn"');
  });
});

// ─── 11. PostHog migration doc (5.3) ─────────────────────────────────────────
describe('5.3 — POSTHOG_MIGRATION_READY.md', () => {
  const docPath = 'docs/specs/POSTHOG_MIGRATION_READY.md';
  expect(fs.existsSync(docPath)).toBe(true);
  const src = fs.readFileSync(docPath, 'utf8');

  it('documents trigger condition ($50/mo)', () => {
    expect(src).toContain('$50/mo');
  });

  it('documents billing cap navigation path', () => {
    expect(src).toContain('Organization');
    expect(src).toContain('Billing');
    expect(src).toContain('Usage limits');
  });

  it('documents Analytics cap at $50/mo', () => {
    expect(src).toContain('Analytics');
    expect(src).toContain('$50/mo');
  });

  it('documents Session Replay cap at $0', () => {
    expect(src).toContain('Session Replay');
    expect(src).toContain('$0');
  });

  it('documents Feature Flags cap at $0', () => {
    expect(src).toContain('Feature Flags');
    expect(src).toContain('$0');
  });

  it('documents self-hosting architecture options', () => {
    expect(src).toContain('Cloud EU');
    expect(src).toContain('Fly.io');
  });

  it('documents SDK swap steps for all 4 surfaces', () => {
    expect(src).toContain('dashboard.html');
    expect(src).toContain('landing-app.js');
    expect(src).toContain('admin-shell.js');
    expect(src).toContain('background.ts');
  });

  it('documents data migration plan', () => {
    expect(src).toContain('export');
    expect(src).toContain('backfill');
  });

  it('documents feature flag migration path', () => {
    expect(src).toContain('feature_flags');
  });

  it('is marked design doc only, not to execute', () => {
    expect(src).toContain('DO NOT EXECUTE');
  });
});

// ─── 12. Gateway route for batch-resume-scorer ───────────────────────────────
describe('Gateway route', () => {
  const src = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');

  it('has route #119 for batch-resume-scorer', () => {
    expect(src).toContain('"batch-resume-scorer"');
  });

  it('shows total 119 routes', () => {
    expect(src).toContain('119 routes');
  });
});

// ─── 13. build.js includes upgrade.js ────────────────────────────────────────
describe('build.js', () => {
  const src = fs.readFileSync('build.js', 'utf8');

  it('includes upgrade.js in deferred chunk', () => {
    expect(src).toContain("'js/upgrade.js'");
  });
});

// ─── 14. Pod team manifest ────────────────────────────────────────────────────
describe('Pod team manifest', () => {
  const src = fs.readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');

  it('has FB-TRIAL-001-S6 pairing', () => {
    expect(src).toContain('FB-TRIAL-001-S6');
  });
});

// ─── 15. File inventory ───────────────────────────────────────────────────────
describe('File inventory', () => {
  const required = [
    'supabase/functions/batch-resume-scorer/index.ts',
    'supabase/migrations/20260314000003_fb_trial_001_s6_batch_scorer.sql',
    'js/upgrade.js',
    'docs/specs/POSTHOG_MIGRATION_READY.md',
  ];
  required.forEach(f => {
    it(`${f} exists`, () => {
      expect(fs.existsSync(f)).toBe(true);
    });
  });
});
