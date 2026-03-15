// tests/cohort-pricing-s1.test.js — COHORT-PRICING-S1 Validation Tests
// Cohort-based pricing configuration: migration, RPC, admin panel, billing.js refactor
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const read = (p) => readFileSync(p, 'utf-8');
const exists = (p) => existsSync(p);

// ─── 1. Migration Structure ───
describe('1. Migration: v8.97-cohort-pricing.sql', () => {
  const sql = read('supabase/migrations/v8.97-cohort-pricing.sql');

  it('creates pricing_defaults table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS pricing_defaults');
  });

  it('pricing_defaults has tier PK', () => {
    expect(sql).toContain('tier text PRIMARY KEY');
  });

  it('pricing_defaults has subscription_price_cents', () => {
    expect(sql).toContain('subscription_price_cents integer NOT NULL DEFAULT 0');
  });

  it('pricing_defaults has included_credits', () => {
    expect(sql).toContain('included_credits integer NOT NULL DEFAULT 0');
  });

  it('pricing_defaults has payg_rate_cents', () => {
    expect(sql).toContain('payg_rate_cents integer NOT NULL DEFAULT 25');
  });

  it('pricing_defaults has features jsonb', () => {
    expect(sql).toContain('features jsonb NOT NULL');
  });

  it('pricing_defaults has stripe_price_id', () => {
    expect(sql).toContain('stripe_price_id text');
  });

  it('pricing_defaults has S-12 scar_meta', () => {
    expect(sql).toContain('scar_meta jsonb');
  });

  it('pricing_defaults has display_order', () => {
    expect(sql).toContain('display_order integer NOT NULL DEFAULT 0');
  });

  it('seeds 4 tiers', () => {
    expect(sql).toContain("'free'");
    expect(sql).toContain("'starter'");
    expect(sql).toContain("'pro'");
    expect(sql).toContain("'payl'");
  });

  it('seeds correct starter price (2000 cents)', () => {
    expect(sql).toMatch(/starter.*2000.*100.*15/s);
  });

  it('seeds correct pro price (4000 cents)', () => {
    expect(sql).toMatch(/pro.*4000.*300.*10/s);
  });

  it('creates pricing_audit_log table', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS pricing_audit_log');
  });

  it('audit log has change_type CHECK constraint', () => {
    expect(sql).toContain("'global_default','cohort_override','cohort_create','cohort_assign'");
  });

  it('audit log has before_value and after_value', () => {
    expect(sql).toContain('before_value jsonb');
    expect(sql).toContain('after_value jsonb');
  });

  it('has updated_at trigger on pricing_defaults', () => {
    expect(sql).toContain('trg_pricing_defaults_updated');
  });

  it('has RLS on pricing_defaults', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('pricing_defaults_admin_all');
    expect(sql).toContain('pricing_defaults_user_read');
  });

  it('has RLS on pricing_audit_log', () => {
    expect(sql).toContain('pricing_audit_admin');
  });
});

// ─── 2. RPC: get_effective_pricing Rewrite ───
describe('2. get_effective_pricing RPC', () => {
  const sql = read('supabase/migrations/v8.97-cohort-pricing.sql');

  it('function exists with correct signature', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION get_effective_pricing(p_user_id uuid)');
  });

  it('returns jsonb', () => {
    expect(sql).toContain('RETURNS jsonb');
  });

  it('reads from pricing_defaults table', () => {
    expect(sql).toContain('FROM pricing_defaults');
  });

  it('loads user cohort_id from profiles', () => {
    expect(sql).toContain('INTO v_plan, v_cohort_id');
    expect(sql).toContain('FROM profiles WHERE id = p_user_id');
  });

  it('loads cohort pricing_config', () => {
    expect(sql).toContain('pricing_config INTO v_cohort_config');
  });

  it('checks promo_expires_at', () => {
    expect(sql).toContain('promo_expires_at');
    expect(sql).toContain('Expired, skip overrides');
  });

  it('merges subscription_price_cents override', () => {
    expect(sql).toContain("v_tier_override ? 'subscription_price_cents'");
  });

  it('merges included_credits override', () => {
    expect(sql).toContain("v_tier_override ? 'included_credits'");
  });

  it('merges payg_rate_cents override', () => {
    expect(sql).toContain("v_tier_override ? 'payg_rate_cents'");
  });

  it('returns all_tiers array', () => {
    expect(sql).toContain("'all_tiers'");
  });

  it('all_tiers resolves per-tier cohort overrides', () => {
    expect(sql).toContain("v_cohort_config -> d.tier ->> 'subscription_price_cents'");
  });

  it('returns promo_label in all_tiers', () => {
    expect(sql).toContain("'promo_label'");
  });

  it('handles PAYL tier mapping', () => {
    expect(sql).toContain("v_plan = 'payl'");
  });

  it('is SECURITY DEFINER', () => {
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('has GRANT to authenticated', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION get_effective_pricing(uuid) TO authenticated');
  });
});

// ─── 3. Cohort Assignment Trigger ───
describe('3. Cohort Assignment Trigger', () => {
  const sql = read('supabase/migrations/v8.97-cohort-pricing.sql');

  it('creates fn_assign_signup_cohort function', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_assign_signup_cohort()');
  });

  it('fires BEFORE INSERT on profiles', () => {
    expect(sql).toContain('BEFORE INSERT ON profiles');
  });

  it('checks criteria_type = signup_date_range', () => {
    expect(sql).toContain("criteria_type = 'signup_date_range'");
  });

  it('checks date range boundaries', () => {
    expect(sql).toContain("(criteria_value ->> 'start')::timestamptz <= now()");
    expect(sql).toContain("(criteria_value ->> 'end')::timestamptz > now()");
  });

  it('only assigns when cohort_id is NULL', () => {
    expect(sql).toContain('IF NEW.cohort_id IS NOT NULL THEN RETURN NEW');
  });

  it('sets cohort_assigned_at', () => {
    expect(sql).toContain('NEW.cohort_assigned_at := now()');
  });
});

// ─── 4. Admin RPCs ───
describe('4. Admin RPCs', () => {
  const sql = read('supabase/migrations/v8.97-cohort-pricing.sql');

  it('fn_update_pricing_default exists', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_update_pricing_default');
  });

  it('fn_update_pricing_default checks admin role', () => {
    expect(sql).toMatch(/fn_update_pricing_default[\s\S]*?role IN \('admin','superadmin'\)/);
  });

  it('fn_update_pricing_default writes audit log', () => {
    expect(sql).toMatch(/fn_update_pricing_default[\s\S]*?INSERT INTO pricing_audit_log/);
  });

  it('fn_update_cohort_pricing exists', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_update_cohort_pricing');
  });

  it('fn_update_cohort_pricing checks admin role', () => {
    expect(sql).toMatch(/fn_update_cohort_pricing[\s\S]*?role IN \('admin','superadmin'\)/);
  });

  it('fn_update_cohort_pricing writes audit log', () => {
    expect(sql).toMatch(/fn_update_cohort_pricing[\s\S]*?INSERT INTO pricing_audit_log/);
  });

  it('fn_create_pricing_cohort exists', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION fn_create_pricing_cohort');
  });

  it('fn_create_pricing_cohort uses ON CONFLICT upsert', () => {
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
  });

  it('all admin RPCs have GRANT to authenticated', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_update_pricing_default');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_update_cohort_pricing');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION fn_create_pricing_cohort');
  });
});

// ─── 5. Seed Cohorts ───
describe('5. Seed Cohorts', () => {
  const sql = read('supabase/migrations/v8.97-cohort-pricing.sql');

  it('seeds founding cohort', () => {
    expect(sql).toContain("'founding'");
    expect(sql).toContain("'Founding Members'");
  });

  it('founding cohort has date range ending 2026-06-01', () => {
    expect(sql).toContain('2026-06-01');
  });

  it('founding cohort has pro override at 2999 cents', () => {
    expect(sql).toContain('"subscription_price_cents": 2999');
  });

  it('founding cohort has promo_label', () => {
    expect(sql).toContain('"promo_label": "Founding Member"');
  });

  it('seeds early-bird cohort', () => {
    expect(sql).toContain("'early-bird'");
    expect(sql).toContain("'Early Bird'");
  });

  it('seeds general-launch cohort', () => {
    expect(sql).toContain("'general-launch'");
    expect(sql).toContain("'General Launch'");
  });

  it('general-launch has empty pricing config (uses global defaults)', () => {
    expect(sql).toMatch(/general-launch[\s\S]*?'\{\}'::jsonb/);
  });
});

// ─── 6. Admin Panel JS ───
describe('6. admin-cohort-pricing.js', () => {
  const js = read('js/admin-cohort-pricing.js');

  it('file exists', () => {
    expect(exists('js/admin-cohort-pricing.js')).toBe(true);
  });

  it('exports loadCohortPricingPanel to window', () => {
    expect(js).toContain('window.loadCohortPricingPanel = loadCohortPricingPanel');
  });

  it('loadPricingDefaults reads from pricing_defaults table', () => {
    expect(js).toContain("from('pricing_defaults')");
  });

  it('renderGlobalDefaults builds editable inputs per tier', () => {
    expect(js).toContain('cp-def-price-');
    expect(js).toContain('cp-def-credits-');
    expect(js).toContain('cp-def-payg-');
  });

  it('saveGlobalDefault calls fn_update_pricing_default RPC', () => {
    expect(js).toContain("sb.rpc('fn_update_pricing_default'");
  });

  it('loadPricingCohorts filters by signup_date_range', () => {
    expect(js).toContain("c.criteria_type === 'signup_date_range'");
  });

  it('openCohortEditor populates override fields', () => {
    expect(js).toContain('cp-ov-price-');
    expect(js).toContain('cp-ov-credits-');
    expect(js).toContain('cp-ov-payg-');
    expect(js).toContain('cp-ov-label-');
    expect(js).toContain('cp-ov-expiry-');
  });

  it('saveCohortOverrides builds sparse JSONB config', () => {
    expect(js).toContain("Object.keys(tierConfig).length > 0");
  });

  it('saveCohortOverrides calls fn_update_cohort_pricing RPC', () => {
    expect(js).toContain("sb.rpc('fn_update_cohort_pricing'");
  });

  it('createPricingCohort calls fn_create_pricing_cohort RPC', () => {
    expect(js).toContain("sb.rpc('fn_create_pricing_cohort'");
  });

  it('createPricingCohort validates required fields', () => {
    expect(js).toContain("'All fields are required'");
  });

  it('createPricingCohort validates date order', () => {
    expect(js).toContain("'End date must be after start date'");
  });

  it('renderCohortPreview shows overridden values differently', () => {
    expect(js).toContain('#6366f1');
    expect(js).toContain('var(--text-faint)');
  });

  it('handles promo expiry in preview', () => {
    expect(js).toContain('EXPIRED');
  });

  it('live preview updates on input', () => {
    expect(js).toContain("e.target.classList.contains('cp-override')");
  });

  it('loadPricingAuditLog fetches last 30 entries', () => {
    expect(js).toContain("from('pricing_audit_log')");
    expect(js).toContain('.limit(30)');
  });

  it('uses reportError for error handling', () => {
    expect(js).toContain("reportError('admin-pricing'");
  });
});

// ─── 7. Admin HTML Panel ───
describe('7. admin.html Panel', () => {
  const html = read('admin.html');

  it('admin-panel-cohort-pricing container exists', () => {
    expect(html).toContain('id="admin-panel-cohort-pricing"');
  });

  it('has global defaults table body', () => {
    expect(html).toContain('id="cp-defaults-body"');
  });

  it('has cohort list table body', () => {
    expect(html).toContain('id="cp-cohort-body"');
  });

  it('has cohort editor container', () => {
    expect(html).toContain('id="cp-cohort-editor"');
  });

  it('cohort editor starts hidden', () => {
    expect(html).toContain('id="cp-cohort-editor" style="display:none');
  });

  it('has editor body for per-tier overrides', () => {
    expect(html).toContain('id="cp-editor-body"');
  });

  it('has resolved preview body', () => {
    expect(html).toContain('id="cp-preview-body"');
  });

  it('has create new cohort form inputs', () => {
    expect(html).toContain('id="cp-new-id"');
    expect(html).toContain('id="cp-new-name"');
    expect(html).toContain('id="cp-new-start"');
    expect(html).toContain('id="cp-new-end"');
  });

  it('has audit log body', () => {
    expect(html).toContain('id="cp-audit-body"');
  });

  it('has admin-cohort-pricing.js script tag', () => {
    expect(html).toContain('admin-cohort-pricing.js');
  });
});

// ─── 8. ADMIN_SUBPAGE_MAP Entry ───
describe('8. ADMIN_SUBPAGE_MAP', () => {
  const js = read('js/admin.js');

  it('cohort-pricing entry exists', () => {
    expect(js).toContain("'cohort-pricing'");
  });

  it('cohort-pricing is in audience section', () => {
    expect(js).toContain("'cohort-pricing': { section: 'audience'");
  });

  it('cohort-pricing calls loadCohortPricingPanel', () => {
    expect(js).toContain('loadCohortPricingPanel()');
  });
});

// ─── 9. billing.js Refactor ───
describe('9. billing.js Database-Driven Tiers', () => {
  const js = read('js/billing.js');

  it('reads all_tiers from pricing response', () => {
    expect(js).toContain('pricing.all_tiers');
  });

  it('has FALLBACK_TIERS for rollback safety', () => {
    expect(js).toContain('FALLBACK_TIERS');
  });

  it('fallback tiers match original hardcoded values', () => {
    expect(js).toContain("tier: 'free'");
    expect(js).toContain("tier: 'starter'");
    expect(js).toContain("tier: 'pro'");
  });

  it('filters out PAYL tier from display', () => {
    expect(js).toContain("t.tier !== 'payl'");
  });

  it('maps database fields to display fields', () => {
    expect(js).toContain('t.subscription_price_cents');
    expect(js).toContain('t.included_credits');
    expect(js).toContain('t.payg_rate_cents');
  });

  it('displays promo_label badge when present', () => {
    expect(js).toContain('promo_label');
    expect(js).toContain('promoHtml');
  });

  it('promo badge has cohort styling', () => {
    expect(js).toContain('rgba(99,102,241,0.15)');
  });

  it('no hardcoded tier array in renderTierComparison', () => {
    // The old pattern had literal objects with payg: 25, payg: 15, payg: 10
    // New pattern reads from dbTiers or FALLBACK_TIERS
    expect(js).not.toMatch(/const tiers = \[\s*\{ id: 'free'/);
  });
});

// ─── 10. CSS ───
describe('10. CSS Styles', () => {
  const css = read('src/input.css');

  it('.cp-input base styles', () => {
    expect(css).toContain('.cp-input');
    expect(css).toContain('var(--bg-input)');
  });

  it('.cp-input focus styles', () => {
    expect(css).toContain('.cp-input:focus');
    expect(css).toContain('border-color: var(--accent)');
  });

  it('.cp-override highlight when value present', () => {
    expect(css).toContain('.cp-override:not(:placeholder-shown)');
    expect(css).toContain('#6366f1');
  });
});

// ─── 11. Pod Team Manifest ───
describe('11. Pod Team Manifest', () => {
  const md = read('docs/scaling/pod-team-manifest.md');

  it('COHORT-PRICING-S1 pairing exists', () => {
    expect(md).toContain('COHORT-PRICING-S1');
  });

  it('has Chief Architect reviewer', () => {
    expect(md).toMatch(/COHORT-PRICING[\s\S]*?Chief Architect/);
  });
});

// ─── 12. Version & Build ───
describe('12. Version & Build', () => {
  const version = read('js/version.js');

  it('product version is v9.22', () => {
    expect(version).toContain('9.22');
  });

  it('dist/dashboard.min.js exists', () => {
    expect(exists('dist/dashboard.min.js')).toBe(true);
  });

  it('dist/admin.min.js exists', () => {
    expect(exists('dist/admin.min.js')).toBe(true);
  });

  it('ROADMAP.md has COHORT-PRICING-S1 as done', () => {
    const rd = read('ROADMAP.md');
    expect(rd).toContain('COHORT-PRICING-S1');
    expect(rd).toMatch(/COHORT-PRICING-S1.*✅/);
  });

  it('roadmap.html has COHORT-PRICING-S1 as done', () => {
    const rh = read('roadmap.html');
    expect(rh).toContain('COHORT-PRICING-S1');
    expect(rh).toContain("s: 'done'");
  });
});
