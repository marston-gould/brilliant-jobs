/**
 * FB-PAYL-S1: Pay After You Land — Foundation Validation Tests
 *
 * Validates: migration structure, Edge Functions, gateway routes,
 * feature gating, pod team manifest, file inventory
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(f) {
  return fs.readFileSync(path.join(ROOT, f), 'utf8');
}

function exists(f) {
  return fs.existsSync(path.join(ROOT, f));
}

// ── Section 1: Migration Structure ──────────────────────────────────────────

describe('FB-PAYL-S1: Migration Structure', () => {
  const sql = read('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('creates payl_enrollments table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS payl_enrollments');
  });

  it('creates payl_referrals table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS payl_referrals');
  });

  it('payl_enrollments has correct status CHECK constraint', () => {
    expect(sql).toContain("'pending_pdf'");
    expect(sql).toContain("'pending_referrals'");
    expect(sql).toContain("'active'");
    expect(sql).toContain("'converted'");
    expect(sql).toContain("'expired'");
    expect(sql).toContain("'revoked'");
  });

  it('payl_referrals has correct status CHECK constraint', () => {
    expect(sql).toContain("'signed_up'");
    expect(sql).toContain("'subscribed'");
    expect(sql).toContain("'qualified'");
  });

  it('payl_enrollments has unique constraint on user_id', () => {
    expect(sql).toContain('uq_payl_user');
  });

  it('payl_enrollments has unique constraint on linkedin_pdf_hash', () => {
    expect(sql).toContain('linkedin_pdf_hash');
    expect(sql).toContain('UNIQUE');
  });

  it('payl_enrollments has referral_code column', () => {
    expect(sql).toContain('referral_code');
  });

  it('payl_referrals has anti-gaming columns', () => {
    expect(sql).toContain('signup_ip');
    expect(sql).toContain('signup_device_hash');
    expect(sql).toContain('payment_method_hash');
  });

  it('creates scar_meta JSONB on both tables (S-12)', () => {
    const scarMatches = sql.match(/scar_meta\s+jsonb/g);
    expect(scarMatches?.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Section 2: Indexes ──────────────────────────────────────────────────────

describe('FB-PAYL-S1: Indexes', () => {
  const sql = read('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('creates enrollment user_id index', () => {
    expect(sql).toContain('idx_payl_enrollments_user_id');
  });

  it('creates enrollment status index', () => {
    expect(sql).toContain('idx_payl_enrollments_status');
  });

  it('creates enrollment referral_code index', () => {
    expect(sql).toContain('idx_payl_enrollments_referral_code');
  });

  it('creates enrollment expires_at partial index', () => {
    expect(sql).toContain('idx_payl_enrollments_expires_at');
    expect(sql).toContain("WHERE status = 'active'");
  });

  it('creates referral enrollment_id index', () => {
    expect(sql).toContain('idx_payl_referrals_enrollment_id');
  });

  it('creates referral referred_user index', () => {
    expect(sql).toContain('idx_payl_referrals_referred_user');
  });
});

// ── Section 3: RLS Policies ─────────────────────────────────────────────────

describe('FB-PAYL-S1: RLS Policies', () => {
  const sql = read('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('enables RLS on payl_enrollments', () => {
    expect(sql).toContain('ALTER TABLE payl_enrollments ENABLE ROW LEVEL SECURITY');
  });

  it('enables RLS on payl_referrals', () => {
    expect(sql).toContain('ALTER TABLE payl_referrals ENABLE ROW LEVEL SECURITY');
  });

  it('creates user read policy for enrollments', () => {
    expect(sql).toContain('payl_enrollments_user_read');
  });

  it('creates service role policy for enrollments', () => {
    expect(sql).toContain('payl_enrollments_service_all');
  });

  it('creates user read policy for referrals', () => {
    expect(sql).toContain('payl_referrals_user_read');
  });
});

// ── Section 4: Functions ────────────────────────────────────────────────────

describe('FB-PAYL-S1: Database Functions', () => {
  const sql = read('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('creates fn_payl_generate_referral_code', () => {
    expect(sql).toContain('fn_payl_generate_referral_code');
  });

  it('creates fn_payl_enroll', () => {
    expect(sql).toContain('fn_payl_enroll');
  });

  it('creates fn_payl_activate', () => {
    expect(sql).toContain('fn_payl_activate');
  });

  it('creates fn_payl_record_pdf', () => {
    expect(sql).toContain('fn_payl_record_pdf');
  });

  it('creates fn_payl_qualify_referral', () => {
    expect(sql).toContain('fn_payl_qualify_referral');
  });

  it('creates fn_payl_revoke_referral', () => {
    expect(sql).toContain('fn_payl_revoke_referral');
  });

  it('creates fn_payl_expiry_check', () => {
    expect(sql).toContain('fn_payl_expiry_check');
  });

  it('creates fn_payl_convert', () => {
    expect(sql).toContain('fn_payl_convert');
  });

  it('creates fn_payl_summary', () => {
    expect(sql).toContain('fn_payl_summary');
  });

  it('fn_payl_activate checks for PDF and 3 referrals', () => {
    expect(sql).toContain('linkedin_pdf_hash IS NULL');
    expect(sql).toContain('referrals_qualified < 3');
  });

  it('fn_payl_record_pdf checks hash dedup', () => {
    expect(sql).toContain('linkedin_pdf_hash = p_pdf_hash');
    expect(sql).toContain('duplicate_pdf');
  });

  it('fn_payl_activate sets 180-day window', () => {
    expect(sql).toContain("interval '180 days'");
  });
});

// ── Section 5: View & Cron ──────────────────────────────────────────────────

describe('FB-PAYL-S1: View & Cron', () => {
  const sql = read('supabase/migrations/v6.46-fb-payl-001-foundation.sql');

  it('creates v_payl_dashboard view', () => {
    expect(sql).toContain('CREATE OR REPLACE VIEW v_payl_dashboard');
  });

  it('v_payl_dashboard includes days_remaining', () => {
    expect(sql).toContain('days_remaining');
  });

  it('schedules pg_cron for daily expiry check', () => {
    expect(sql).toContain("'payl-expiry-check'");
    expect(sql).toContain('fn_payl_expiry_check');
  });

  it('seeds payl_tier_enabled feature flag', () => {
    expect(sql).toContain('payl_tier_enabled');
    expect(sql).toContain('draft');
  });
});

// ── Section 6: Edge Functions ───────────────────────────────────────────────

describe('FB-PAYL-S1: parse-linkedin-pdf EF', () => {
  const ef = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('exists', () => {
    expect(exists('supabase/functions/parse-linkedin-pdf/index.ts')).toBe(true);
  });

  it('handles parse action', () => {
    expect(ef).toContain("action === \"parse\"");
  });

  it('handles validate action', () => {
    expect(ef).toContain("action === \"validate\"");
  });

  it('handles status action', () => {
    expect(ef).toContain("action === \"status\"");
  });

  it('computes SHA-256 hash', () => {
    expect(ef).toContain('SHA-256');
    expect(ef).toContain('computeSha256');
  });

  it('validates PDF magic bytes', () => {
    expect(ef).toContain('%PDF');
  });

  it('checks for fraud signals', () => {
    expect(ef).toContain('low_connections');
    expect(ef).toContain('no_experience');
    expect(ef).toContain('low_confidence');
  });

  it('publishes event to event bus (H-02)', () => {
    expect(ef).toContain('fn_publish_event');
    expect(ef).toContain('payl.pdf_uploaded');
  });

  it('calls fn_payl_record_pdf RPC', () => {
    expect(ef).toContain('fn_payl_record_pdf');
  });

  it('extracts LinkedIn sections', () => {
    expect(ef).toContain('experience_json');
    expect(ef).toContain('skills_array');
    expect(ef).toContain('education_json');
    expect(ef).toContain('li_connections');
  });
});

describe('FB-PAYL-S1: payl-referral-webhook EF', () => {
  const ef = read('supabase/functions/payl-referral-webhook/index.ts');

  it('exists', () => {
    expect(exists('supabase/functions/payl-referral-webhook/index.ts')).toBe(true);
  });

  it('handles signup action', () => {
    expect(ef).toContain("action === \"signup\"");
  });

  it('handles subscribed action', () => {
    expect(ef).toContain("action === \"subscribed\"");
  });

  it('handles qualify_check action', () => {
    expect(ef).toContain("action === \"qualify_check\"");
  });

  it('handles revoke action', () => {
    expect(ef).toContain("action === \"revoke\"");
  });

  it('handles anti_gaming_check action', () => {
    expect(ef).toContain("action === \"anti_gaming_check\"");
  });

  it('implements anti-gaming checks', () => {
    expect(ef).toContain('self_referral');
    expect(ef).toContain('repeated_ip');
    expect(ef).toContain('same_device');
    expect(ef).toContain('same_payment_method');
  });

  it('checks for 30-day qualification window', () => {
    expect(ef).toContain('daysSince >= 30');
  });

  it('publishes events to event bus (H-02)', () => {
    expect(ef).toContain('fn_publish_event');
    expect(ef).toContain('payl.referral_signup');
    expect(ef).toContain('payl.referral_qualified');
  });
});

describe('FB-PAYL-S1: payl-expiry-check EF', () => {
  const ef = read('supabase/functions/payl-expiry-check/index.ts');

  it('exists', () => {
    expect(exists('supabase/functions/payl-expiry-check/index.ts')).toBe(true);
  });

  it('handles check action', () => {
    expect(ef).toContain("action === \"check\"");
  });

  it('handles nudge action', () => {
    expect(ef).toContain("action === \"nudge\"");
  });

  it('handles convert action', () => {
    expect(ef).toContain("action === \"convert\"");
  });

  it('handles extend action', () => {
    expect(ef).toContain("action === \"extend\"");
  });

  it('handles summary action', () => {
    expect(ef).toContain("action === \"summary\"");
  });

  it('implements nudge schedule at days 90/120/150/175', () => {
    expect(ef).toContain('90');
    expect(ef).toContain('120');
    expect(ef).toContain('150');
    expect(ef).toContain('175');
  });

  it('extension requires 4+ referrals (3 base + 1 extra)', () => {
    expect(ef).toContain('referrals_qualified < 4');
  });

  it('publishes events to event bus (H-02)', () => {
    expect(ef).toContain('fn_publish_event');
    expect(ef).toContain('payl.expired');
    expect(ef).toContain('payl.converted');
  });
});

// ── Section 7: Gateway Routes ───────────────────────────────────────────────

describe('FB-PAYL-S1: Gateway Routes', () => {
  const gw = read('supabase/functions/api-gateway/index.ts');

  it('registers parse-linkedin-pdf route', () => {
    expect(gw).toContain('"parse-linkedin-pdf"');
  });

  it('registers payl-referral-webhook route', () => {
    expect(gw).toContain('"payl-referral-webhook"');
  });

  it('registers payl-expiry-check route', () => {
    expect(gw).toContain('"payl-expiry-check"');
  });

  it('total routes is 113', () => {
    expect(gw).toContain('TOTAL: 113 routes');
  });
});

// ── Section 8: Feature Gating ───────────────────────────────────────────────

describe('FB-PAYL-S1: Feature Gating', () => {
  const ts = read('js/tier-gating.ts');
  const js = read('js/tier-gating.js');

  it('tier-gating.ts treats payl as pro', () => {
    expect(ts).toContain("_userPricing.tier === 'payl'");
    expect(ts).toContain("return 'pro'");
  });

  it('tier-gating.js treats payl as pro', () => {
    expect(js).toContain("_userPricing.tier === 'payl'");
    expect(js).toContain("return 'pro'");
  });

  it('tier-gating.ts has isPaylUser function', () => {
    expect(ts).toContain('function isPaylUser()');
  });

  it('tier-gating.js has isPaylUser function', () => {
    expect(js).toContain('function isPaylUser()');
  });

  it('tier-gating.ts exports isPaylUser to window', () => {
    expect(ts).toContain('window.isPaylUser = isPaylUser');
  });

  it('tier-gating.ts registers isPaylUser in BJ namespace', () => {
    expect(ts).toContain("'isPaylUser'");
  });
});

// ── Section 9: Pod Team Manifest ────────────────────────────────────────────

describe('FB-PAYL-S1: Pod Team Manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('has FB-PAYL pairing section', () => {
    expect(manifest).toContain('Pay After You Land');
  });

  it('has FB-PAYL-S1 pairing', () => {
    expect(manifest).toContain('FB-PAYL-S1');
  });

  it('has FB-PAYL-S2 pairing', () => {
    expect(manifest).toContain('FB-PAYL-S2');
  });
});

// ── Section 10: File Inventory ──────────────────────────────────────────────

describe('FB-PAYL-S1: File Inventory', () => {
  const expectedFiles = [
    'supabase/migrations/v6.46-fb-payl-001-foundation.sql',
    'supabase/functions/parse-linkedin-pdf/index.ts',
    'supabase/functions/payl-referral-webhook/index.ts',
    'supabase/functions/payl-expiry-check/index.ts',
  ];

  expectedFiles.forEach(f => {
    it(`${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
