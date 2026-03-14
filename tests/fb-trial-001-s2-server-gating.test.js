// tests/fb-trial-001-s2-server-gating.test.js
// FB-TRIAL-001-S2: Trial Gate Server — Feature access gating + Stripe state transitions
// Validates: checkFeatureAccess integration in 5 gated EFs + stripe-webhook state transitions

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const EF_DIR = path.resolve('supabase/functions');
const SHARED_DIR = path.resolve('supabase/functions/_shared');

// ═══════════════════════════════════════════════════════════
// SECTION 1: checkFeatureAccess shared utility exists
// ═══════════════════════════════════════════════════════════
describe('Section 1: checkFeatureAccess shared utility', () => {
  const utilPath = path.join(SHARED_DIR, 'checkFeatureAccess.ts');
  const src = fs.readFileSync(utilPath, 'utf-8');

  it('1.1 File exists', () => {
    expect(fs.existsSync(utilPath)).toBe(true);
  });

  it('1.2 Exports checkFeatureAccess function', () => {
    expect(src).toContain('export async function checkFeatureAccess');
  });

  it('1.3 Exports buildDeniedResponse function', () => {
    expect(src).toContain('export function buildDeniedResponse');
  });

  it('1.4 Exports buildSampleHeaders function', () => {
    expect(src).toContain('export function buildSampleHeaders');
  });

  it('1.5 buildDeniedResponse returns 403 status', () => {
    expect(src).toContain('status: 403');
  });

  it('1.6 buildSampleHeaders returns X-Is-Sample header', () => {
    expect(src).toContain("'X-Is-Sample': 'true'");
  });

  it('1.7 GatedFeature type includes all 8 feature keys', () => {
    const features = ['chat', 'score', 'sms', 'email', 'apply', 'stats', 'filter', 'boolean'];
    features.forEach(f => {
      expect(src).toContain(`'${f}'`);
    });
  });

  it('1.8 Uses fn_check_feature_access RPC', () => {
    expect(src).toContain('fn_check_feature_access');
  });

  it('1.9 Fails open on RPC errors (migration safety)', () => {
    expect(src).toContain('return { allowed: true }');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: chat-job-search gating
// ═══════════════════════════════════════════════════════════
describe('Section 2: chat-job-search gating', () => {
  const efPath = path.join(EF_DIR, 'chat-job-search/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('2.1 Imports checkFeatureAccess', () => {
    expect(src).toContain("from '../_shared/checkFeatureAccess.ts'");
  });

  it('2.2 Imports buildDeniedResponse', () => {
    expect(src).toContain('buildDeniedResponse');
  });

  it('2.3 Imports buildSampleHeaders', () => {
    expect(src).toContain('buildSampleHeaders');
  });

  it('2.4 Calls checkFeatureAccess with chat feature key', () => {
    expect(src).toContain("checkFeatureAccess(sb, user.id, 'chat')");
  });

  it('2.5 Returns buildDeniedResponse on denial', () => {
    expect(src).toContain('if (!access.allowed) return buildDeniedResponse(access)');
  });

  it('2.6 Sets sampleHeaders when isSample=true', () => {
    expect(src).toContain('access.isSample ? buildSampleHeaders() : {}');
  });

  it('2.7 Spreads sampleHeaders into success response', () => {
    expect(src).toContain('...sampleHeaders');
  });

  it('2.8 Spreads sampleHeaders into cached response path', () => {
    // Both the cache hit path and the main path should have sampleHeaders
    const matches = src.match(/\.\.\.sampleHeaders/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('2.9 FB-TRIAL-001-S2 comment present', () => {
    expect(src).toContain('FB-TRIAL-001-S2');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 3: score-resume gating
// ═══════════════════════════════════════════════════════════
describe('Section 3: score-resume gating', () => {
  const efPath = path.join(EF_DIR, 'score-resume/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('3.1 Imports checkFeatureAccess', () => {
    expect(src).toContain("from '../_shared/checkFeatureAccess.ts'");
  });

  it('3.2 Calls checkFeatureAccess with score feature key', () => {
    expect(src).toContain("checkFeatureAccess(sb, user.id, 'score')");
  });

  it('3.3 Returns buildDeniedResponse on denial', () => {
    expect(src).toContain('if (!access.allowed) return buildDeniedResponse(access)');
  });

  it('3.4 Sets sampleHeaders', () => {
    expect(src).toContain('access.isSample ? buildSampleHeaders() : {}');
  });

  it('3.5 Spreads sampleHeaders into gap-interview response', () => {
    // Check that the gap-interview response has sampleHeaders
    const gapSection = src.substring(src.indexOf("mode: 'gap-interview'"));
    expect(gapSection.substring(0, 200)).toContain('sampleHeaders');
  });

  it('3.6 Spreads sampleHeaders into revision-assess response', () => {
    const revSection = src.substring(src.indexOf("mode: 'revision-assess'"));
    expect(revSection.substring(0, 200)).toContain('sampleHeaders');
  });

  it('3.7 Spreads sampleHeaders into main success response', () => {
    // The final return with result should have sampleHeaders
    const matches = src.match(/\.\.\.sampleHeaders/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('3.8 Gate placed after auth but before rate limit DB check', () => {
    const authIdx = src.indexOf('auth.getUser');
    const gateIdx = src.indexOf("checkFeatureAccess(sb, user.id, 'score')");
    const rateLimitIdx = src.indexOf('check_ef_rate_limit');
    expect(gateIdx).toBeGreaterThan(authIdx);
    expect(gateIdx).toBeLessThan(rateLimitIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 4: send-notification gating
// ═══════════════════════════════════════════════════════════
describe('Section 4: send-notification gating', () => {
  const efPath = path.join(EF_DIR, 'send-notification/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('4.1 Imports checkFeatureAccess', () => {
    expect(src).toContain("from '../_shared/checkFeatureAccess.ts'");
  });

  it('4.2 Calls checkFeatureAccess with email feature key', () => {
    expect(src).toContain("checkFeatureAccess(sb, user_id, 'email')");
  });

  it('4.3 Only gates product classification (not transactional)', () => {
    expect(src).toContain("classification === 'product'");
  });

  it('4.4 Returns buildDeniedResponse on denial', () => {
    expect(src).toContain('if (!access.allowed) return buildDeniedResponse(access)');
  });

  it('4.5 Does NOT gate required_transactional notifications', () => {
    // The gate is inside an if (classification === 'product') block
    const gateBlock = src.substring(
      src.indexOf("FB-TRIAL-001-S2: Gate product"),
      src.indexOf("const result: NotificationResult")
    );
    expect(gateBlock).toContain("classification === 'product'");
    expect(gateBlock).not.toContain("required_transactional");
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 5: submit-application (auto-apply-submit) gating
// ═══════════════════════════════════════════════════════════
describe('Section 5: submit-application gating', () => {
  const efPath = path.join(EF_DIR, 'submit-application/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('5.1 Imports checkFeatureAccess', () => {
    expect(src).toContain("from '../_shared/checkFeatureAccess.ts'");
  });

  it('5.2 Calls checkFeatureAccess with apply feature key', () => {
    expect(src).toContain("checkFeatureAccess(sb, userId, 'apply')");
  });

  it('5.3 Returns buildDeniedResponse on denial', () => {
    expect(src).toContain('if (!access.allowed) return buildDeniedResponse(access)');
  });

  it('5.4 Sets sampleHeaders', () => {
    expect(src).toContain('access.isSample ? buildSampleHeaders() : {}');
  });

  it('5.5 Spreads sampleHeaders into success response', () => {
    expect(src).toContain('...sampleHeaders');
  });

  it('5.6 Gate placed after auth', () => {
    const authIdx = src.indexOf('auth.getUser(token)');
    const gateIdx = src.indexOf("checkFeatureAccess(sb, userId, 'apply')");
    expect(gateIdx).toBeGreaterThan(authIdx);
  });

  it('5.7 Gate placed before parse & validate', () => {
    const gateIdx = src.indexOf("checkFeatureAccess(sb, userId, 'apply')");
    const parseIdx = src.indexOf('Parse & Validate');
    expect(gateIdx).toBeLessThan(parseIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 6: handle-sms-reply gating
// ═══════════════════════════════════════════════════════════
describe('Section 6: handle-sms-reply gating', () => {
  const efPath = path.join(EF_DIR, 'handle-sms-reply/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('6.1 Imports checkFeatureAccess', () => {
    expect(src).toContain("from '../_shared/checkFeatureAccess.ts'");
  });

  it('6.2 Calls checkFeatureAccess with sms feature key', () => {
    expect(src).toContain("checkFeatureAccess(sb, userId, 'sms')");
  });

  it('6.3 Sends upgrade reply SMS on denial', () => {
    expect(src).toContain('Upgrade to Pro');
  });

  it('6.4 Returns 200 to Vonage on denial (no retries)', () => {
    // After the gate denial, should return 200
    const gateBlock = src.substring(
      src.indexOf("Feature access denied"),
      src.indexOf("Find the most recent escalated")
    );
    expect(gateBlock).toContain('status: 200');
  });

  it('6.5 Gate placed after user lookup by phone', () => {
    const userLookupIdx = src.indexOf('const userId = prefs.user_id');
    const gateIdx = src.indexOf("checkFeatureAccess(sb, userId, 'sms')");
    expect(gateIdx).toBeGreaterThan(userLookupIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 7: stripe-webhook state transitions
// ═══════════════════════════════════════════════════════════
describe('Section 7: stripe-webhook state transitions', () => {
  const efPath = path.join(EF_DIR, 'stripe-webhook/index.ts');
  const src = fs.readFileSync(efPath, 'utf-8');

  it('7.1 handleSubscriptionCreated sets user_state to active_pro', () => {
    // Find the function and check for the update
    const fnStart = src.indexOf('async function handleSubscriptionCreated');
    const fnEnd = src.indexOf('async function handleSubscriptionUpdated');
    const fnBody = src.substring(fnStart, fnEnd);
    expect(fnBody).toContain("user_state: 'active_pro'");
  });

  it('7.2 handleSubscriptionDeleted sets user_state to expired_free', () => {
    const fnStart = src.indexOf('async function handleSubscriptionDeleted');
    const fnEnd = src.indexOf('async function handleInvoicePaymentSucceeded');
    const fnBody = src.substring(fnStart, fnEnd);
    expect(fnBody).toContain("user_state: 'expired_free'");
  });

  it('7.3 handleSubscriptionDeleted resets feature_samples_used to empty object', () => {
    const fnStart = src.indexOf('async function handleSubscriptionDeleted');
    const fnEnd = src.indexOf('async function handleInvoicePaymentSucceeded');
    const fnBody = src.substring(fnStart, fnEnd);
    expect(fnBody).toContain("feature_samples_used: '{}'");
  });

  it('7.4 checkout.session.completed case in switch', () => {
    expect(src).toContain("case 'checkout.session.completed'");
  });

  it('7.5 checkout.session.completed sets user_state to active_pro', () => {
    const caseStart = src.indexOf("case 'checkout.session.completed'");
    const caseEnd = src.indexOf("case 'customer.subscription.created'");
    const caseBody = src.substring(caseStart, caseEnd);
    expect(caseBody).toContain("user_state: 'active_pro'");
  });

  it('7.6 checkout.session.completed looks up user by customer ID', () => {
    const caseStart = src.indexOf("case 'checkout.session.completed'");
    const caseEnd = src.indexOf("case 'customer.subscription.created'");
    const caseBody = src.substring(caseStart, caseEnd);
    expect(caseBody).toContain('stripe_customer_id');
  });

  it('7.7 handleSubscriptionUpdated syncs user_state on active status', () => {
    const fnStart = src.indexOf('async function handleSubscriptionUpdated');
    const fnEnd = src.indexOf('async function handleSubscriptionDeleted');
    const fnBody = src.substring(fnStart, fnEnd);
    expect(fnBody).toContain("user_state: 'active_pro'");
    expect(fnBody).toContain("sub.status === 'active'");
  });

  it('7.8 FB-TRIAL-001-S2 comments in stripe-webhook', () => {
    expect(src).toContain('FB-TRIAL-001-S2');
  });

  it('7.9 handleSubscriptionDeleted resets samples for churned users (spec 3.5)', () => {
    // Verify the comment references spec section
    const fnStart = src.indexOf('async function handleSubscriptionDeleted');
    const fnEnd = src.indexOf('async function handleInvoicePaymentSucceeded');
    const fnBody = src.substring(fnStart, fnEnd);
    expect(fnBody).toContain('spec 3.5');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 8: Pattern consistency across all gated EFs
// ═══════════════════════════════════════════════════════════
describe('Section 8: Pattern consistency', () => {
  const gatedEFs = [
    { name: 'chat-job-search', feature: 'chat' },
    { name: 'score-resume', feature: 'score' },
    { name: 'submit-application', feature: 'apply' },
    { name: 'handle-sms-reply', feature: 'sms' },
    { name: 'send-notification', feature: 'email' },
  ];

  gatedEFs.forEach(({ name, feature }) => {
    it(`8.${gatedEFs.indexOf({ name, feature }) + 1} ${name} uses correct feature key '${feature}'`, () => {
      const src = fs.readFileSync(path.join(EF_DIR, `${name}/index.ts`), 'utf-8');
      expect(src).toContain(`'${feature}'`);
    });
  });

  it('8.6 All gated EFs import from _shared/checkFeatureAccess.ts', () => {
    gatedEFs.forEach(({ name }) => {
      const src = fs.readFileSync(path.join(EF_DIR, `${name}/index.ts`), 'utf-8');
      expect(src).toContain('checkFeatureAccess');
    });
  });

  it('8.7 No gated EF uses hardcoded 403 for feature denial', () => {
    gatedEFs.forEach(({ name }) => {
      const src = fs.readFileSync(path.join(EF_DIR, `${name}/index.ts`), 'utf-8');
      // Should use buildDeniedResponse, not manual 403
      expect(src).not.toMatch(/status:\s*403.*upgrade_required/);
    });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 9: EFs NOT requiring gating (verification)
// ═══════════════════════════════════════════════════════════
describe('Section 9: Non-gated EFs unchanged', () => {
  it('9.1 auto-apply-trigger (cron) does NOT import checkFeatureAccess', () => {
    const src = fs.readFileSync(path.join(EF_DIR, 'auto-apply-trigger/index.ts'), 'utf-8');
    expect(src).not.toContain('checkFeatureAccess');
  });

  it('9.2 stats-query EF does not exist yet (future session)', () => {
    expect(fs.existsSync(path.join(EF_DIR, 'stats-query/index.ts'))).toBe(false);
  });

  it('9.3 No saved-filters CRUD EF (client-side gating)', () => {
    expect(fs.existsSync(path.join(EF_DIR, 'saved-filters/index.ts'))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 10: Pod team manifest
// ═══════════════════════════════════════════════════════════
describe('Section 10: Pod team manifest', () => {
  const manifestPath = path.resolve('docs/scaling/pod-team-manifest.md');
  const manifest = fs.readFileSync(manifestPath, 'utf-8');

  it('10.1 Chief Architect role present', () => {
    expect(manifest).toContain('Chief Architect');
  });

  it('10.2 Lead Platform Engineer role present', () => {
    expect(manifest).toContain('Lead Platform Engineer');
  });

  it('10.3 System Architect—Scalability role present', () => {
    expect(manifest).toContain('System Architect');
  });

  it('10.4 Forward-Looking Developer role present', () => {
    expect(manifest).toContain('Forward-Looking Developer');
  });

  it('10.5 Evolvability Strategist role present', () => {
    expect(manifest).toContain('Evolvability Strategist');
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 11: File inventory
// ═══════════════════════════════════════════════════════════
describe('Section 11: File inventory', () => {
  it('11.1 checkFeatureAccess.ts exists', () => {
    expect(fs.existsSync(path.join(SHARED_DIR, 'checkFeatureAccess.ts'))).toBe(true);
  });

  it('11.2 Test file exists', () => {
    expect(fs.existsSync('tests/fb-trial-001-s2-server-gating.test.js')).toBe(true);
  });

  const modifiedEFs = [
    'chat-job-search/index.ts',
    'score-resume/index.ts',
    'send-notification/index.ts',
    'submit-application/index.ts',
    'handle-sms-reply/index.ts',
    'stripe-webhook/index.ts',
  ];

  modifiedEFs.forEach(ef => {
    it(`11.${modifiedEFs.indexOf(ef) + 3} ${ef} exists`, () => {
      expect(fs.existsSync(path.join(EF_DIR, ef))).toBe(true);
    });
  });
});
