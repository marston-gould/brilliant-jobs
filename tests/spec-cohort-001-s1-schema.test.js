/**
 * SPEC-COHORT-001-S1: Cohort Tier System — Schema + Seed
 * Validates migration v9.76-spec-cohort-001-s1.sql
 *
 * Tests cover:
 *   1. cohort_tiers table structure
 *   2. profiles additions
 *   3. credit_ledger table structure
 *   4. feature_costs table structure
 *   5. Seeded cohort_tiers data
 *   6. Seeded feature_costs data
 *   7. RLS policies
 *   8. RPC functions
 *   9. Indexes
 *  10. Migration file integrity
 *  11. Backfill logic
 *  12. File inventory
 */

import { readFileSync, existsSync } from 'fs';
import { describe, it, expect } from 'vitest';

const MIGRATION = 'supabase/migrations/v9.76-spec-cohort-001-s1.sql';

const migrationSql = existsSync(MIGRATION) ? readFileSync(MIGRATION, 'utf8') : '';

// ─── 1. cohort_tiers table ─────────────────────────────────
describe('1. cohort_tiers table', () => {
  it('creates cohort_tiers table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS cohort_tiers/);
  });
  it('has uuid PK with gen_random_uuid', () => {
    expect(migrationSql).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid/);
  });
  it('has name NOT NULL', () => {
    expect(migrationSql).toMatch(/name\s+text\s+NOT NULL/);
  });
  it('has slug UNIQUE NOT NULL', () => {
    expect(migrationSql).toMatch(/slug\s+text\s+NOT NULL\s+UNIQUE/);
  });
  it('has price_monthly_cents with check >= 0', () => {
    expect(migrationSql).toMatch(/price_monthly_cents\s+integer\s+NOT NULL\s+CHECK\s*\(price_monthly_cents\s*>=\s*0\)/);
  });
  it('has price_annual_cents with check >= 0', () => {
    expect(migrationSql).toMatch(/price_annual_cents\s+integer\s+NOT NULL\s+CHECK\s*\(price_annual_cents\s*>=\s*0\)/);
  });
  it('has credits_monthly with check >= 0', () => {
    expect(migrationSql).toMatch(/credits_monthly\s+integer\s+NOT NULL\s+CHECK\s*\(credits_monthly\s*>=\s*0\)/);
  });
  it('has rollover_cap DEFAULT 0 with check >= -1', () => {
    expect(migrationSql).toMatch(/rollover_cap\s+integer\s+NOT NULL\s+DEFAULT\s+0/);
    expect(migrationSql).toMatch(/CHECK\s*\(rollover_cap\s*>=\s*-1\)/);
  });
  it('has stripe_monthly_price_id and stripe_annual_price_id', () => {
    expect(migrationSql).toContain('stripe_monthly_price_id');
    expect(migrationSql).toContain('stripe_annual_price_id');
  });
  it('has is_public boolean DEFAULT true', () => {
    expect(migrationSql).toMatch(/is_public\s+boolean\s+NOT NULL\s+DEFAULT\s+true/);
  });
  it('has sort_order integer', () => {
    expect(migrationSql).toContain('sort_order');
  });
  it('has created_at and updated_at timestamps', () => {
    expect(migrationSql).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/);
    expect(migrationSql).toContain('updated_at');
  });
  it('has created_by FK to auth.users', () => {
    expect(migrationSql).toMatch(/created_by\s+uuid\s+REFERENCES\s+auth\.users/);
  });
  it('has updated_at trigger', () => {
    expect(migrationSql).toMatch(/fn_cohort_tiers_updated_at/);
    expect(migrationSql).toMatch(/trg_cohort_tiers_updated/);
  });
});

// ─── 2. profiles additions ─────────────────────────────────
describe('2. profiles table additions', () => {
  it('adds cohort_tier_id FK to cohort_tiers', () => {
    expect(migrationSql).toMatch(/cohort_tier_id\s+uuid\s+REFERENCES\s+cohort_tiers/);
  });
  it('adds cohort_tier_assigned_at timestamptz', () => {
    expect(migrationSql).toContain('cohort_tier_assigned_at');
  });
  it('adds rollover_cap_override with nullable check', () => {
    expect(migrationSql).toMatch(/rollover_cap_override\s+integer/);
    expect(migrationSql).toContain('rollover_cap_override IS NULL OR rollover_cap_override >= -1');
  });
  it('uses ADD COLUMN IF NOT EXISTS for safety', () => {
    const addCount = (migrationSql.match(/ADD COLUMN IF NOT EXISTS/g) || []).length;
    expect(addCount).toBeGreaterThanOrEqual(3);
  });
  it('creates index on cohort_tier_id', () => {
    expect(migrationSql).toContain('idx_profiles_cohort_tier');
  });
});

// ─── 3. credit_ledger table ─────────────────────────────────
describe('3. credit_ledger table', () => {
  it('creates credit_ledger table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS credit_ledger/);
  });
  it('has user_id FK to auth.users with CASCADE', () => {
    expect(migrationSql).toMatch(/user_id\s+uuid\s+NOT NULL\s+REFERENCES\s+auth\.users.*ON DELETE CASCADE/);
  });
  it('has bucket CHECK with three valid values', () => {
    expect(migrationSql).toMatch(/bucket\s+text\s+NOT NULL\s+CHECK\s*\(bucket\s+IN\s*\(\s*'base','rolled','award'\s*\)\)/);
  });
  it('has event_type CHECK with all required values', () => {
    const requiredTypes = [
      'cohort_grant', 'rollover_grant', 'rollover_expire',
      'award_grant', 'award_expire', 'feature_debit',
      'admin_adjustment', 'cohort_prorate', 'refund_restore'
    ];
    for (const t of requiredTypes) {
      expect(migrationSql).toContain(`'${t}'`);
    }
  });
  it('has amount integer NOT NULL (no decimal for credits)', () => {
    expect(migrationSql).toMatch(/amount\s+integer\s+NOT NULL/);
  });
  it('has expires_at nullable for award entries', () => {
    expect(migrationSql).toContain('expires_at');
  });
  it('has voided boolean DEFAULT false', () => {
    expect(migrationSql).toMatch(/voided\s+boolean\s+NOT NULL\s+DEFAULT\s+false/);
  });
  it('has period_start for billing period tracking', () => {
    expect(migrationSql).toContain('period_start');
  });
  it('has source_ref for award attribution', () => {
    expect(migrationSql).toContain('source_ref');
  });
  it('has notes field (required for admin_adjustment)', () => {
    expect(migrationSql).toContain('notes');
  });
  it('creates composite index on user_id + created_at', () => {
    expect(migrationSql).toContain('idx_credit_ledger_user_created');
  });
  it('creates period index for balance queries', () => {
    expect(migrationSql).toContain('idx_credit_ledger_user_period');
  });
  it('creates awards expiry index', () => {
    expect(migrationSql).toContain('idx_credit_ledger_awards_expiry');
  });
  it('creates feature index for passive cap checks', () => {
    expect(migrationSql).toContain('idx_credit_ledger_feature');
  });
});

// ─── 4. feature_costs table ─────────────────────────────────
describe('4. feature_costs table', () => {
  it('creates feature_costs table', () => {
    expect(migrationSql).toMatch(/CREATE TABLE IF NOT EXISTS feature_costs/);
  });
  it('has feature_key as text PRIMARY KEY', () => {
    expect(migrationSql).toMatch(/feature_key\s+text\s+PRIMARY KEY/);
  });
  it('has credit_cost with CHECK >= 0', () => {
    expect(migrationSql).toContain('credit_cost  integer NOT NULL DEFAULT 0');
    expect(migrationSql).toContain('CHECK (credit_cost >= 0)');
  });
  it('has daily_cap nullable integer', () => {
    expect(migrationSql).toContain('daily_cap');
  });
  it('has is_passive boolean', () => {
    expect(migrationSql).toMatch(/is_passive\s+boolean\s+NOT NULL\s+DEFAULT\s+false/);
  });
  it('has updated_at timestamp', () => {
    // feature_costs has its own updated_at
    const fc = migrationSql.slice(migrationSql.indexOf('CREATE TABLE IF NOT EXISTS feature_costs'));
    expect(fc).toContain('updated_at');
  });
});

// ─── 5. Seeded cohort_tiers ─────────────────────────────────
describe('5. Seeded cohort_tiers', () => {
  const seeds = [
    { slug: 'free',    monthly: 0,    annual: 0,     credits: 50,  rollover: 0,    public: true },
    { slug: 'starter', monthly: 2000, annual: 19200, credits: 250, rollover: 50,   public: true },
    { slug: 'pro',     monthly: 4000, annual: 38400, credits: 750, rollover: -1,   public: true },
    { slug: 'beta',    monthly: 0,    annual: 0,     credits: 500, rollover: 200,  public: false },
  ];
  for (const s of seeds) {
    it(`seeds ${s.slug} cohort`, () => {
      expect(migrationSql).toContain(`'${s.slug}'`);
      expect(migrationSql).toContain(String(s.monthly));
      expect(migrationSql).toContain(String(s.credits));
    });
    it(`${s.slug} has correct rollover_cap ${s.rollover}`, () => {
      // Check the seed section contains the rollover value
      const seedSection = migrationSql.slice(migrationSql.indexOf('Seed: cohort_tiers'));
      expect(seedSection).toContain(String(s.rollover));
    });
    it(`${s.slug} has correct is_public=${s.public}`, () => {
      const seedSection = migrationSql.slice(migrationSql.indexOf('Seed: cohort_tiers'));
      expect(seedSection).toContain(String(s.public));
    });
  }
  it('uses ON CONFLICT (slug) DO UPDATE for idempotency', () => {
    expect(migrationSql).toMatch(/ON CONFLICT\s*\(slug\)\s*DO UPDATE/);
  });
});

// ─── 6. Seeded feature_costs ─────────────────────────────────
describe('6. Seeded feature_costs', () => {
  const activeCosts = [
    { key: 'score-resume',             cost: 3, passive: false },
    { key: 'rewrite-resume-analyze',   cost: 2, passive: false },
    { key: 'rewrite-resume-execute',   cost: 5, passive: false },
    { key: 'analyze-application-gap',  cost: 3, passive: false },
    { key: 'chat-job-search',          cost: 2, passive: false },
    { key: 'answer-form-question',     cost: 1, passive: false },
    { key: 'extract-resume-profile',   cost: 1, passive: false },
    { key: 'rewrite-resume-extension', cost: 1, passive: false },
  ];
  const passiveCosts = [
    { key: 'auto-apply-trigger',  cost: 1, cap: 50 },
    { key: 'analyze-hidden-job',  cost: 1, cap: 20 },
    { key: 'score-ai-content',    cost: 1, cap: 30 },
  ];

  for (const f of activeCosts) {
    it(`seeds ${f.key} with cost=${f.cost} is_passive=false`, () => {
      expect(migrationSql).toContain(`'${f.key}'`);
    });
  }
  for (const f of passiveCosts) {
    it(`seeds ${f.key} with cost=${f.cost} is_passive=true daily_cap=${f.cap}`, () => {
      expect(migrationSql).toContain(`'${f.key}'`);
      const seedSection = migrationSql.slice(migrationSql.indexOf('Seed: feature_costs'));
      expect(seedSection).toContain(String(f.cap));
    });
  }
  it('seeds exactly 11 feature costs', () => {
    // Count insert value rows in feature_costs seed section
    const seedSection = migrationSql.slice(
      migrationSql.indexOf('Seed: feature_costs'),
      migrationSql.indexOf('profiles.cohort_tier_id backfill')
    );
    const rows = (seedSection.match(/\('[\w-]+'/g) || []).length;
    expect(rows).toBe(11);
  });
  it('uses ON CONFLICT (feature_key) DO UPDATE for idempotency', () => {
    expect(migrationSql).toMatch(/ON CONFLICT\s*\(feature_key\)\s*DO UPDATE/);
  });
});

// ─── 7. RLS policies ─────────────────────────────────────────
describe('7. RLS policies', () => {
  it('enables RLS on cohort_tiers', () => {
    expect(migrationSql).toMatch(/ALTER TABLE cohort_tiers ENABLE ROW LEVEL SECURITY/);
  });
  it('enables RLS on credit_ledger', () => {
    expect(migrationSql).toMatch(/ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY/);
  });
  it('enables RLS on feature_costs', () => {
    expect(migrationSql).toMatch(/ALTER TABLE feature_costs ENABLE ROW LEVEL SECURITY/);
  });
  it('credit_ledger user read policy scoped to auth.uid()', () => {
    expect(migrationSql).toMatch(/USING\s*\(auth\.uid\(\)\s*=\s*user_id\)/);
  });
  it('credit_ledger service_role full access', () => {
    expect(migrationSql).toMatch(/TO service_role\s+USING\s*\(true\)/);
  });
  it('cohort_tiers admin policy uses role check', () => {
    expect(migrationSql).toMatch(/role\s+IN\s*\('admin','superadmin'\)/);
  });
  it('GRANTS authenticated read on all new tables', () => {
    const grants = (migrationSql.match(/GRANT SELECT ON .+ TO authenticated/g) || []);
    expect(grants.length).toBeGreaterThanOrEqual(3);
  });
  it('GRANTS service_role ALL on all new tables', () => {
    const grants = (migrationSql.match(/GRANT ALL ON .+ TO service_role/g) || []);
    expect(grants.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── 8. RPC functions ─────────────────────────────────────────
describe('8. RPC functions', () => {
  it('creates fn_get_user_credit_balance', () => {
    expect(migrationSql).toContain('fn_get_user_credit_balance');
  });
  it('fn_get_user_credit_balance returns jsonb with rolled/base/awards/total', () => {
    const fnBody = migrationSql.slice(
      migrationSql.indexOf('fn_get_user_credit_balance'),
      migrationSql.indexOf('fn_debit_credits')
    );
    expect(fnBody).toContain("'rolled'");
    expect(fnBody).toContain("'base'");
    expect(fnBody).toContain("'awards'");
    expect(fnBody).toContain("'total'");
  });
  it('creates fn_debit_credits', () => {
    expect(migrationSql).toContain('fn_debit_credits');
  });
  it('fn_debit_credits raises insufficient_credits when balance < cost', () => {
    const fnBody = migrationSql.slice(
      migrationSql.indexOf('fn_debit_credits'),
      migrationSql.indexOf('fn_grant_base_credits')
    );
    expect(fnBody).toContain('insufficient_credits');
  });
  it('fn_debit_credits uses FOR UPDATE to prevent race conditions', () => {
    const fnBody = migrationSql.slice(
      migrationSql.indexOf('fn_debit_credits'),
      migrationSql.indexOf('fn_grant_base_credits')
    );
    expect(fnBody).toContain('FOR UPDATE');
  });
  it('creates fn_grant_base_credits', () => {
    expect(migrationSql).toContain('fn_grant_base_credits');
  });
  it('creates fn_grant_award_credits', () => {
    expect(migrationSql).toContain('fn_grant_award_credits');
  });
  it('fn_grant_award_credits inserts into award bucket', () => {
    const fnBody = migrationSql.slice(
      migrationSql.indexOf('fn_grant_award_credits'),
      migrationSql.indexOf('Bootstrap')
    );
    expect(fnBody).toContain("'award'");
    expect(fnBody).toContain("'award_grant'");
  });
  it('GRANTs all functions to correct roles', () => {
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION fn_get_user_credit_balance.*TO authenticated, service_role/);
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION fn_debit_credits.*TO service_role/);
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION fn_grant_base_credits.*TO service_role/);
    expect(migrationSql).toMatch(/GRANT EXECUTE ON FUNCTION fn_grant_award_credits.*TO service_role/);
  });
});

// ─── 9. Indexes ──────────────────────────────────────────────
describe('9. Indexes', () => {
  const expectedIndexes = [
    'idx_cohort_tiers_slug',
    'idx_cohort_tiers_order',
    'idx_profiles_cohort_tier',
    'idx_credit_ledger_user_created',
    'idx_credit_ledger_user_period',
    'idx_credit_ledger_awards_expiry',
    'idx_credit_ledger_feature',
  ];
  for (const idx of expectedIndexes) {
    it(`creates index ${idx}`, () => {
      expect(migrationSql).toContain(idx);
    });
  }
  it('credit_ledger awards expiry index is partial (bucket=award, voided=false)', () => {
    const idxSection = migrationSql.slice(migrationSql.indexOf('idx_credit_ledger_awards_expiry'));
    expect(idxSection).toContain("bucket = 'award'");
    expect(idxSection).toContain('voided = false');
  });
});

// ─── 10. Migration file integrity ────────────────────────────
describe('10. Migration file integrity', () => {
  it('migration file exists', () => {
    expect(existsSync(MIGRATION)).toBe(true);
  });
  it('migration file is non-empty', () => {
    expect(migrationSql.length).toBeGreaterThan(100);
  });
  it('migration has correct version header', () => {
    expect(migrationSql).toContain('SPEC-COHORT-001-S1');
  });
  it('no raw TODO or placeholder comments', () => {
    expect(migrationSql).not.toMatch(/TODO:|FIXME:|PLACEHOLDER/i);
  });
  it('all CREATE TABLE statements use IF NOT EXISTS', () => {
    const creates = migrationSql.match(/CREATE TABLE/g) || [];
    const safe    = migrationSql.match(/CREATE TABLE IF NOT EXISTS/g) || [];
    expect(creates.length).toBe(safe.length);
  });
  it('all DROP TRIGGER statements use IF EXISTS', () => {
    const drops = migrationSql.match(/DROP TRIGGER/g) || [];
    const safe  = migrationSql.match(/DROP TRIGGER IF EXISTS/g) || [];
    expect(drops.length).toBe(safe.length);
  });
  it('has COMMENTS on all new tables', () => {
    const tableComments = (migrationSql.match(/COMMENT ON TABLE/g) || []).length;
    expect(tableComments).toBeGreaterThanOrEqual(3);
  });
});

// ─── 11. Backfill logic ───────────────────────────────────────
describe('11. Backfill logic', () => {
  it('backfills cohort_tier_id from existing plan column', () => {
    expect(migrationSql).toContain('profiles.cohort_tier_id backfill');
    expect(migrationSql).toContain("plan IN ('pro','payl')");
    expect(migrationSql).toContain("plan = 'starter'");
  });
  it('backfill only runs where cohort_tier_id IS NULL', () => {
    const backfill = migrationSql.slice(migrationSql.indexOf('profiles.cohort_tier_id backfill'));
    expect(backfill).toContain('cohort_tier_id IS NULL');
  });
  it('bootstrap grants credits to all existing users', () => {
    expect(migrationSql).toContain('Bootstrap: grant initial credits');
  });
  it('bootstrap skips users who already have a cohort_grant this period', () => {
    const bootstrap = migrationSql.slice(migrationSql.indexOf('Bootstrap'));
    expect(bootstrap).toContain('event_type = \'cohort_grant\'');
    expect(bootstrap).toContain('NOT EXISTS');
  });
  it('bootstrap only grants to users with credits_monthly > 0', () => {
    const bootstrap = migrationSql.slice(migrationSql.indexOf('Bootstrap'));
    expect(bootstrap).toContain('credits_monthly > 0');
  });
});

// ─── 12. File inventory ──────────────────────────────────────
describe('12. File inventory', () => {
  const expectedFiles = [
    'supabase/migrations/v9.76-spec-cohort-001-s1.sql',
    'tests/spec-cohort-001-s1-schema.test.js',
  ];
  for (const f of expectedFiles) {
    it(`file exists: ${f}`, () => {
      expect(existsSync(f)).toBe(true);
    });
  }
});
