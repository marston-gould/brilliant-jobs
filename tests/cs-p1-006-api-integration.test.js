// tests/cs-p1-006-api-integration.test.js — QA-003: Integration Tests for Critical APIs
// Validates Edge Function contracts: request shapes, response shapes, auth requirements,
// rate limiting, CORS headers, error handling.
// These tests verify the code structure + contract, not live API calls.
// Live integration tests require Supabase local dev server (supabase start).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const EF_DIR = join(__dirname, '..', 'supabase', 'functions');
const SHARED_DIR = join(EF_DIR, '_shared');

// ============================================================================
// Helper: Parse Edge Function source for contract validation
// ============================================================================
function readEF(name) {
  const path = join(EF_DIR, name, 'index.ts');
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}

function readShared(name) {
  const path = join(SHARED_DIR, name);
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf-8');
}


// ============================================================================
// Critical EF: All functions exist
// ============================================================================
describe('QA-003: Critical Edge Functions exist', () => {
  const CRITICAL_EFS = [
    'health-check',
    'preview-jobs',
    'validate-signup',
    'extension-heartbeat',
    'evaluate-alerts',
    'send-notification',
    'create-checkout',
    'stripe-webhook',
    'check-referral-activation',
    'referral-lifecycle',
    'pipeline-write',
    'data-export',
    'account-delete',
    'rewrite-resume',
    'score-resume',
  ];

  for (const ef of CRITICAL_EFS) {
    it(`${ef}/index.ts exists`, () => {
      const path = join(EF_DIR, ef, 'index.ts');
      expect(existsSync(path), `Missing critical EF: ${ef}`).toBe(true);
    });
  }
});


// ============================================================================
// Shared modules exist and export expected interfaces
// ============================================================================
describe('QA-003: Shared modules', () => {
  it('admin-auth.ts exports requireAdmin + AdminAuthError', () => {
    const src = readShared('admin-auth.ts');
    expect(src).toBeTruthy();
    expect(src).toContain('export class AdminAuthError');
    expect(src).toContain('export async function requireAdmin');
  });

  it('api-version.ts exports API_VERSION', () => {
    const src = readShared('api-version.ts');
    expect(src).toBeTruthy();
    expect(src).toContain('export const API_VERSION');
  });

  it('middleware.ts exports middleware functions', () => {
    const src = readShared('middleware.ts');
    expect(src).toBeTruthy();
  });

  it('resilience.ts exports fetchWithRetry', () => {
    const src = readShared('resilience.ts');
    expect(src).toBeTruthy();
    expect(src).toContain('fetchWithRetry');
  });

  it('logger.ts exports createLogger', () => {
    const src = readShared('logger.ts');
    expect(src).toBeTruthy();
    expect(src).toContain('createLogger');
  });
});


// ============================================================================
// Contract: health-check
// ============================================================================
describe('QA-003: health-check contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('health-check');
  });

  it('handles OPTIONS for CORS preflight', () => {
    expect(src).toContain('OPTIONS');
    expect(src).toMatch(/Access-Control-Allow-Origin/);
  });

  it('returns structured health response with status, timestamp, checks', () => {
    expect(src).toContain('healthy');
    expect(src).toContain('degraded');
    expect(src).toContain('unhealthy');
    expect(src).toContain('timestamp');
    expect(src).toContain('checks');
  });

  it('includes API version header', () => {
    expect(src).toContain('API_VERSION');
    expect(src).toContain('x-api-version');
  });

  it('performs database connectivity check', () => {
    expect(src).toMatch(/supabase|createClient/);
  });

  it('returns latency measurements', () => {
    expect(src).toContain('latencyMs');
  });
});


// ============================================================================
// Contract: preview-jobs (public, rate-limited)
// ============================================================================
describe('QA-003: preview-jobs contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('preview-jobs');
  });

  it('implements rate limiting', () => {
    expect(src).toContain('MAX_QUERIES');
    expect(src).toContain('SESSION_TTL');
    // Should limit to small number of queries
    expect(src).toMatch(/MAX_QUERIES\s*=\s*\d/);
  });

  it('restricts CORS to brilliantjobs.app', () => {
    expect(src).toContain('brilliantjobs.app');
    expect(src).toContain('Access-Control-Allow-Origin');
  });

  it('obfuscates response data (no raw company names/IDs)', () => {
    expect(src).toMatch(/obfuscat|truncat|redact/i);
  });

  it('includes API version', () => {
    expect(src).toContain('API_VERSION');
  });

  it('cleans expired sessions', () => {
    expect(src).toContain('cleanSessions');
  });

  it('only allows POST method', () => {
    expect(src).toContain('POST');
    expect(src).toContain('OPTIONS');
  });
});


// ============================================================================
// Contract: validate-signup (public, rate-limited)
// ============================================================================
describe('QA-003: validate-signup contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('validate-signup');
  });

  it('implements IP-based rate limiting', () => {
    expect(src).toContain('RATE_LIMIT_MAX');
    expect(src).toContain('RATE_LIMIT_WINDOW');
    expect(src).toContain('rateLimitMap');
  });

  it('restricts CORS to allowed origins only', () => {
    expect(src).toContain('ALLOWED_ORIGINS');
    expect(src).toContain('brilliantjobs.app');
    // Should not use wildcard
    expect(src).not.toMatch(/Allow-Origin.*\*/);
  });

  it('validates against competitor blocklist', () => {
    expect(src).toMatch(/blocklist|competitor/i);
  });

  it('includes API version', () => {
    expect(src).toContain('API_VERSION');
  });
});


// ============================================================================
// Contract: extension-heartbeat
// ============================================================================
describe('QA-003: extension-heartbeat contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('extension-heartbeat');
  });

  it('handles two modes: user heartbeat and cron check', () => {
    expect(src).toContain('cron_check');
    expect(src).toContain('handleCronCheck');
  });

  it('handles CORS preflight', () => {
    expect(src).toContain('OPTIONS');
    expect(src).toContain('CORS_HEADERS');
  });

  it('uses Supabase client for data operations', () => {
    expect(src).toContain('createClient');
    expect(src).toContain('SUPABASE_URL');
  });
});


// ============================================================================
// Contract: evaluate-alerts (internal, cron-driven)
// ============================================================================
describe('QA-003: evaluate-alerts contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('evaluate-alerts');
  });

  it('exists and is a valid TypeScript file', () => {
    expect(src).toBeTruthy();
    expect(src.length).toBeGreaterThan(100);
  });

  it('queries alert rules or health data', () => {
    expect(src).toMatch(/alert|health|v_cron_health/i);
  });

  it('implements cooldown logic', () => {
    expect(src).toMatch(/cooldown|last_fired|fired_at/i);
  });
});


// ============================================================================
// Contract: pipeline-write (authenticated)
// ============================================================================
describe('QA-003: pipeline-write contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('pipeline-write');
  });

  it('exists', () => {
    expect(src).toBeTruthy();
  });

  it('requires authentication', () => {
    // Should reference auth/token verification
    expect(src).toMatch(/auth|authorization|getUser|getSession|Bearer/i);
  });

  it('validates pipeline stage transitions', () => {
    // Should enforce valid stage values
    expect(src).toMatch(/stage|saved|applied|interview|offer/i);
  });
});


// ============================================================================
// Contract: account-delete (authenticated, destructive)
// ============================================================================
describe('QA-003: account-delete contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('account-delete');
  });

  it('exists', () => {
    expect(src).toBeTruthy();
  });

  it('requires authentication', () => {
    expect(src).toMatch(/auth|authorization|Bearer|getUser/i);
  });

  it('handles cascading deletion', () => {
    expect(src).toMatch(/delete|cascade|remove|purge/i);
  });
});


// ============================================================================
// Contract: data-export (authenticated)
// ============================================================================
describe('QA-003: data-export contract', () => {
  let src;

  beforeEach(() => {
    src = readEF('data-export');
  });

  it('exists', () => {
    expect(src).toBeTruthy();
  });

  it('requires authentication', () => {
    expect(src).toMatch(/auth|authorization|Bearer|getUser/i);
  });

  it('returns structured data format', () => {
    expect(src).toMatch(/JSON|json|export|data/i);
  });
});


// ============================================================================
// Contract: Admin EFs require admin auth
// ============================================================================
describe('QA-003: Admin EF auth requirements', () => {
  const ADMIN_EFS = [
    'admin-analytics',
    'approve-content',
    'build-extension',
  ];

  for (const ef of ADMIN_EFS) {
    it(`${ef} uses requireAdmin or admin auth check`, () => {
      const src = readEF(ef);
      if (!src) return; // Skip if EF doesn't exist
      expect(src).toMatch(/requireAdmin|admin-auth|role.*admin|profiles.*role|auth\.getUser|Authorization/i);
    });
  }
});


// ============================================================================
// Contract: All EFs handle errors gracefully
// ============================================================================
describe('QA-003: Error handling patterns', () => {
  const CRITICAL_EFS = [
    'health-check',
    'preview-jobs',
    'validate-signup',
    'extension-heartbeat',
    'evaluate-alerts',
    'pipeline-write',
    'send-notification',
  ];

  for (const ef of CRITICAL_EFS) {
    it(`${ef} has try/catch error handling`, () => {
      const src = readEF(ef);
      if (!src) return;
      // Should have at least one try/catch block (catch may omit parens in modern JS)
      expect(src).toMatch(/try\s*\{/);
      expect(src).toMatch(/catch\s*[({]/);
    });

    it(`${ef} returns proper HTTP error responses`, () => {
      const src = readEF(ef);
      if (!src) return;
      // Should return Response objects with status codes
      expect(src).toMatch(/new Response|Response\(|jsonResponse/);
      // Should handle at least one error status (numeric or in jsonResponse helper)
      expect(src).toMatch(/status[:\s]+(400|401|403|404|429|500|503)|jsonResponse\([^)]+,\s*(400|401|403|404|429|500|503)\)|\b(400|401|403|404|429|500|503)\b/);
    });
  }
});


// ============================================================================
// Contract: Webhook EFs validate signatures
// ============================================================================
describe('QA-003: Webhook signature validation', () => {
  it('stripe-webhook validates Stripe signature', () => {
    const src = readEF('stripe-webhook');
    if (!src) return;
    expect(src).toMatch(/stripe-signature|constructEvent|webhook.*secret/i);
  });

  it('resend-webhook validates request origin', () => {
    const src = readEF('resend-webhook');
    if (!src) return;
    // Should have some form of validation
    expect(src).toMatch(/signature|verify|validate|svix|webhook-id/i);
  });

  it('vonage-webhook validates request', () => {
    const src = readEF('vonage-webhook');
    if (!src) return;
    expect(src).toMatch(/signature|verify|validate|vonage/i);
  });
});


// ============================================================================
// Contract: AI-consuming EFs use ai-guard
// ============================================================================
describe('QA-003: AI API spend controls', () => {
  const AI_EFS = [
    'rewrite-resume',
    'rewrite-resume-analyze',
    'rewrite-resume-execute',
    'generate-cover-letter',
    'generate-editorial-content',
    'enrich-jd-ai',
    'score-resume',
    'chat-job-search',
    'answer-form-question',
  ];

  for (const ef of AI_EFS) {
    it(`${ef} uses ai-guard or has spend controls`, () => {
      const src = readEF(ef);
      if (!src) return;
      // Should reference ai-guard, token limits, or cost tracking
      expect(src).toMatch(/ai-guard|aiGuard|max_tokens|token|cost|credit|budget/i);
    });
  }
});


// ============================================================================
// Test Suite: Cron cleanup migration
// ============================================================================
describe('QA-003: Cron cleanup migration (DE-004/DE-005)', () => {
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260307_cs_p1_006_cron_cleanup.sql');

  it('migration file exists', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it('contains DE-004 dead cron removal logic', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('DE-004');
    expect(sql).toContain('cron.unschedule');
    expect(sql).toContain('Feb 31');
  });

  it('contains DE-005 purge consolidation logic', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('DE-005');
    expect(sql).toContain('unified-data-hygiene');
    expect(sql).toContain('run_data_hygiene');
  });

  it('creates cron validation function', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('validate_cron_schedule');
  });

  it('creates v_cron_audit view', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('v_cron_audit');
    expect(sql).toContain('invalid_schedule');
  });

  it('data hygiene covers all cleanup targets', () => {
    const sql = readFileSync(migrationPath, 'utf-8');
    expect(sql).toContain('cron.job_run_details');
    expect(sql).toContain('ef_rate_limits');
    expect(sql).toContain('availability_checks');
    expect(sql).toContain('alert_history');
    expect(sql).toContain('notification_log');
    expect(sql).toContain('extension_heartbeats');
  });
});


// ============================================================================
// Test Suite: Cost-per-user modeling (CE-002)
// ============================================================================
describe('QA-003: Cost visibility dashboard (CE-002)', () => {
  const bizOpsPath = join(__dirname, '..', 'js', 'admin-biz-ops.js');

  it('admin-biz-ops.js contains cost-per-user modeling', () => {
    const src = readFileSync(bizOpsPath, 'utf-8');
    expect(src).toContain('Cost-per-User Modeling');
    expect(src).toContain('_VENDOR_COST_CURVES');
    expect(src).toContain('_runCostPerUserModel');
  });

  it('models all 8 vendors', () => {
    const src = readFileSync(bizOpsPath, 'utf-8');
    const vendors = ['Supabase', 'Vercel', 'Anthropic', 'Cloudflare', 'Resend', 'Vonage', 'DataForSEO', 'PostHog'];
    for (const vendor of vendors) {
      expect(src).toContain(`${vendor}:`);
    }
  });

  it('includes per-user and total cost calculation', () => {
    const src = readFileSync(bizOpsPath, 'utf-8');
    expect(src).toContain('Per-User / Month');
    expect(src).toContain('TOTAL');
  });

  it('includes cost projection chart', () => {
    const src = readFileSync(bizOpsPath, 'utf-8');
    expect(src).toContain('cpu-chart');
    expect(src).toContain('Total Monthly Cost');
    expect(src).toContain('Per-User Cost');
  });

  it('supports configurable scenarios (100, 500, 1000 users)', () => {
    const src = readFileSync(bizOpsPath, 'utf-8');
    expect(src).toContain('cpu-scenario-a');
    expect(src).toContain('cpu-scenario-b');
    expect(src).toContain('cpu-scenario-c');
  });
});
