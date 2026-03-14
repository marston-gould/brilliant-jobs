/**
 * FB-TRIAL-001-S1 — Trial Gate Schema + checkFeatureAccess Validation Tests
 * 
 * Validates:
 * 1. Migration v8.48 structure (profiles columns, trial_referrals table, resume_score_queue, indexes, pg_cron, user migration, signup trigger, fn_check_feature_access)
 * 2. checkFeatureAccess.ts shared utility (exports, types, functions)
 * 3. File inventory
 */

import { describe, test, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// ── Section 1: Migration File Existence ─────────────────────────────────────

describe('FB-TRIAL-001-S1: Migration v8.48 existence', () => {
  test('migration file exists', () => {
    expect(exists('supabase/migrations/20260313000000_fb_trial_001_schema.sql')).toBe(true);
  });
});

// ── Section 2: Profiles Table Alterations ───────────────────────────────────

describe('FB-TRIAL-001-S1: profiles table columns', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('trial_started_at TIMESTAMPTZ column', () => {
    expect(sql).toContain('trial_started_at TIMESTAMPTZ');
  });

  test('trial_expires_at TIMESTAMPTZ column', () => {
    expect(sql).toContain('trial_expires_at TIMESTAMPTZ');
  });

  test('user_state column with CHECK constraint', () => {
    expect(sql).toContain('user_state TEXT NOT NULL DEFAULT');
    expect(sql).toContain("'trialing'");
    expect(sql).toContain("'active_pro'");
    expect(sql).toContain("'expired_free'");
  });

  test('feature_samples_used JSONB column with empty default', () => {
    expect(sql).toContain('feature_samples_used JSONB NOT NULL');
    expect(sql).toMatch(/DEFAULT\s*'\{\}'/);
  });

  test('referral_code TEXT UNIQUE column', () => {
    expect(sql).toContain('referral_code TEXT UNIQUE');
  });

  test('referred_by UUID REFERENCES profiles(id)', () => {
    expect(sql).toContain('referred_by UUID REFERENCES profiles(id)');
  });

  test('referral_credit_expires_at TIMESTAMPTZ column', () => {
    expect(sql).toContain('referral_credit_expires_at TIMESTAMPTZ');
  });

  test('trial expiry index (partial on user_state = trialing)', () => {
    expect(sql).toContain('idx_profiles_trial_expiry');
    expect(sql).toContain("WHERE user_state = 'trialing'");
  });

  test('referral_code index (partial on NOT NULL)', () => {
    expect(sql).toContain('idx_profiles_referral_code');
    expect(sql).toContain('WHERE referral_code IS NOT NULL');
  });
});

// ── Section 3: Referrals Table ──────────────────────────────────────────────

describe('FB-TRIAL-001-S1: trial_referrals table', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('CREATE TABLE referrals', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS trial_referrals');
  });

  test('referrer_id UUID NOT NULL REFERENCES profiles', () => {
    expect(sql).toContain('referrer_id     UUID NOT NULL REFERENCES profiles(id)');
  });

  test('referred_id UUID REFERENCES profiles', () => {
    expect(sql).toContain('referred_id     UUID REFERENCES profiles(id)');
  });

  test('status CHECK with 5 states', () => {
    expect(sql).toContain("'pending'");
    expect(sql).toContain("'signed_up'");
    expect(sql).toContain("'converted'");
    expect(sql).toContain("'rewarded'");
    expect(sql).toContain("'expired'");
  });

  test('referral_code index', () => {
    expect(sql).toContain('idx_trial_referrals_code');
  });

  test('referrer index (compound with status)', () => {
    expect(sql).toContain('idx_trial_referrals_referrer');
    expect(sql).toContain('(referrer_id, status)');
  });

  test('RLS enabled', () => {
    expect(sql).toContain('ALTER TABLE trial_referrals ENABLE ROW LEVEL SECURITY');
  });

  test('user read policy (referrer or referred)', () => {
    expect(sql).toContain('trial_referrals_user_read');
    expect(sql).toContain('auth.uid() = referrer_id OR auth.uid() = referred_id');
  });

  test('service role policy', () => {
    expect(sql).toContain('trial_referrals_service_all');
    expect(sql).toContain('service_role');
  });
});

// ── Section 4: Resume Score Queue Table ─────────────────────────────────────

describe('FB-TRIAL-001-S1: resume_score_queue table', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('CREATE TABLE resume_score_queue', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS resume_score_queue');
  });

  test('status CHECK with 4 states', () => {
    expect(sql).toContain("'pending'");
    expect(sql).toContain("'submitted'");
    expect(sql).toContain("'completed'");
    expect(sql).toContain("'failed'");
  });

  test('batch_id column for Anthropic Batch API', () => {
    expect(sql).toContain('batch_id    TEXT');
  });

  test('partial index on pending status', () => {
    expect(sql).toContain('idx_rsq_status');
    expect(sql).toContain("WHERE status = 'pending'");
  });

  test('RLS enabled', () => {
    expect(sql).toContain('ALTER TABLE resume_score_queue ENABLE ROW LEVEL SECURITY');
  });

  test('user read policy', () => {
    expect(sql).toContain('rsq_user_read');
  });

  test('service role policy', () => {
    expect(sql).toContain('rsq_service_all');
  });
});

// ── Section 5: pg_cron Trial Expiry Checker ─────────────────────────────────

describe('FB-TRIAL-001-S1: pg_cron trial-expiry-checker', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('cron.schedule called with trial-expiry-checker', () => {
    expect(sql).toContain("'trial-expiry-checker'");
  });

  test('runs every 15 minutes', () => {
    expect(sql).toContain('*/15 * * * *');
  });

  test('transitions trialing → expired_free', () => {
    expect(sql).toContain("SET user_state = 'expired_free'");
    expect(sql).toContain("user_state = 'trialing'");
  });

  test('checks trial_expires_at < NOW()', () => {
    expect(sql).toContain('trial_expires_at < NOW()');
  });

  test('excludes active subscribers via NOT EXISTS', () => {
    expect(sql).toContain('NOT EXISTS');
    expect(sql).toContain('user_subscriptions');
    expect(sql).toContain("status = 'active'");
  });
});

// ── Section 6: Existing User Migration ──────────────────────────────────────

describe('FB-TRIAL-001-S1: existing user migration', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('active subscribers → active_pro with all samples pre-consumed', () => {
    expect(sql).toContain("user_state = 'active_pro'");
    expect(sql).toContain('"chat":true');
    expect(sql).toContain('"score":true');
    expect(sql).toContain('"sms":true');
    expect(sql).toContain('"email":true');
    expect(sql).toContain('"apply":true');
    expect(sql).toContain('"stats":true');
    expect(sql).toContain('"filter":true');
    expect(sql).toContain('"boolean":true');
  });

  test('expired users → expired_free with fresh samples', () => {
    expect(sql).toContain("user_state = 'expired_free'");
    // Empty samples for expired users
    expect(sql).toMatch(/feature_samples_used\s*=\s*'\{\}'/);
  });

  test('recent signups → trialing', () => {
    expect(sql).toContain("user_state = 'trialing'");
    expect(sql).toContain("INTERVAL '7 days'");
  });

  test('referral codes generated for paying users', () => {
    expect(sql).toContain("referral_code = substr(md5(random()::text), 1, 8)");
    expect(sql).toContain("user_state = 'active_pro'");
    expect(sql).toContain('referral_code IS NULL');
  });
});

// ── Section 7: Signup Trigger ───────────────────────────────────────────────

describe('FB-TRIAL-001-S1: signup trigger', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('fn_trial_on_signup function exists', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_trial_on_signup');
  });

  test('sets trial_started_at to NOW()', () => {
    expect(sql).toContain('NEW.trial_started_at := NOW()');
  });

  test('sets trial_expires_at to NOW() + 7 days', () => {
    expect(sql).toContain("NEW.trial_expires_at := NOW() + INTERVAL '7 days'");
  });

  test('sets user_state to trialing', () => {
    expect(sql).toContain("NEW.user_state := 'trialing'");
  });

  test('sets feature_samples_used to empty', () => {
    expect(sql).toContain("NEW.feature_samples_used := '{}'");
  });

  test('BEFORE INSERT trigger on profiles', () => {
    expect(sql).toContain('BEFORE INSERT ON profiles');
  });

  test('only fires when trial_started_at IS NULL', () => {
    expect(sql).toContain('NEW.trial_started_at IS NULL');
  });
});

// ── Section 8: fn_check_feature_access RPC ──────────────────────────────────

describe('FB-TRIAL-001-S1: fn_check_feature_access', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('function created', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_check_feature_access');
  });

  test('accepts user_id and feature params', () => {
    expect(sql).toContain('p_user_id UUID');
    expect(sql).toContain('p_feature TEXT');
  });

  test('returns JSONB', () => {
    expect(sql).toContain('RETURNS JSONB');
  });

  test('checks user_subscriptions for active status', () => {
    expect(sql).toContain('user_subscriptions');
    expect(sql).toContain("status = 'active'");
  });

  test('atomic sample consumption with WHERE guard', () => {
    // The key pattern: UPDATE with NOT (feature_samples_used ? p_feature) prevents race conditions
    expect(sql).toContain('NOT (feature_samples_used ? p_feature)');
  });

  test('returns isSample=true on sample use', () => {
    expect(sql).toContain("'isSample'");
  });

  test('returns upgrade_required on denial', () => {
    expect(sql).toContain("'upgrade_required'");
  });

  test('SECURITY DEFINER (runs as function owner)', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  test('GRANT to authenticated and service_role', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_check_feature_access TO authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_check_feature_access TO service_role');
  });
});

// ── Section 9: checkFeatureAccess.ts Shared Utility ─────────────────────────

describe('FB-TRIAL-001-S1: checkFeatureAccess.ts', () => {
  const ts = read('supabase/functions/_shared/checkFeatureAccess.ts');

  test('file exists', () => {
    expect(exists('supabase/functions/_shared/checkFeatureAccess.ts')).toBe(true);
  });

  test('exports checkFeatureAccess function', () => {
    expect(ts).toContain('export async function checkFeatureAccess');
  });

  test('exports GatedFeature type', () => {
    expect(ts).toContain('export type GatedFeature');
  });

  test('exports FeatureAccessResult interface', () => {
    expect(ts).toContain('export interface FeatureAccessResult');
  });

  test('GatedFeature includes all 8 feature keys', () => {
    expect(ts).toContain("'chat'");
    expect(ts).toContain("'score'");
    expect(ts).toContain("'sms'");
    expect(ts).toContain("'email'");
    expect(ts).toContain("'apply'");
    expect(ts).toContain("'stats'");
    expect(ts).toContain("'filter'");
    expect(ts).toContain("'boolean'");
  });

  test('calls fn_check_feature_access RPC', () => {
    expect(ts).toContain("sb.rpc('fn_check_feature_access'");
  });

  test('passes p_user_id and p_feature to RPC', () => {
    expect(ts).toContain('p_user_id: userId');
    expect(ts).toContain('p_feature: feature');
  });

  test('exports isActivePro helper', () => {
    expect(ts).toContain('export async function isActivePro');
  });

  test('exports getTrialState helper', () => {
    expect(ts).toContain('export async function getTrialState');
  });

  test('exports getSampleAvailability helper', () => {
    expect(ts).toContain('export async function getSampleAvailability');
  });

  test('exports buildDeniedResponse helper', () => {
    expect(ts).toContain('export function buildDeniedResponse');
  });

  test('buildDeniedResponse returns 403 status', () => {
    expect(ts).toContain('status: 403');
  });

  test('exports buildSampleHeaders helper', () => {
    expect(ts).toContain('export function buildSampleHeaders');
  });

  test('X-Is-Sample header for client detection', () => {
    expect(ts).toContain("'X-Is-Sample': 'true'");
  });

  test('fail-open on RPC errors (migration safety)', () => {
    // During migration rollout, RPC errors should not gate users
    expect(ts).toContain('allowed: true');
    expect(ts).toContain('RPC error');
  });

  test('FeatureAccessResult has isSample optional boolean', () => {
    expect(ts).toContain('isSample?: boolean');
  });

  test('FeatureAccessResult has daysRemaining optional number', () => {
    expect(ts).toContain('daysRemaining?: number');
  });

  test('FeatureAccessResult has reason optional string', () => {
    expect(ts).toContain('reason?:');
    expect(ts).toContain('upgrade_required');
    expect(ts).toContain('user_not_found');
  });
});

// ── Section 10: Table Comments ──────────────────────────────────────────────

describe('FB-TRIAL-001-S1: documentation comments', () => {
  const sql = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');

  test('user_state column comment', () => {
    expect(sql).toContain("COMMENT ON COLUMN profiles.user_state");
  });

  test('feature_samples_used column comment', () => {
    expect(sql).toContain("COMMENT ON COLUMN profiles.feature_samples_used");
  });

  test('trial_referrals table comment', () => {
    expect(sql).toContain("COMMENT ON TABLE trial_referrals");
  });

  test('resume_score_queue table comment', () => {
    expect(sql).toContain("COMMENT ON TABLE resume_score_queue");
  });

  test('fn_check_feature_access function comment', () => {
    expect(sql).toContain("COMMENT ON FUNCTION fn_check_feature_access");
  });
});

// ── Section 11: File Inventory ──────────────────────────────────────────────

describe('FB-TRIAL-001-S1: file inventory', () => {
  test('migration file', () => {
    expect(exists('supabase/migrations/20260313000000_fb_trial_001_schema.sql')).toBe(true);
  });

  test('checkFeatureAccess shared utility', () => {
    expect(exists('supabase/functions/_shared/checkFeatureAccess.ts')).toBe(true);
  });

  test('this test file', () => {
    expect(exists('tests/fb-trial-001-s1-schema.test.js')).toBe(true);
  });
});
