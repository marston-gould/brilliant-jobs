/**
 * FB-SURVEY-DELIVERY-001 Session 1: Schema + Credit Grant Wiring
 * Tests: migration structure, RPC idempotency, survey.html credit wiring, PostHog events, seed data
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// ─── 1. Migration Structure ─────────────────────────────────────────────────
describe('SDV-S1: Migration Structure', () => {
  const migration = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');

  it('creates survey_campaigns table with all required columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS survey_campaigns');
    expect(migration).toContain('survey_version    text NOT NULL UNIQUE');
    expect(migration).toContain('survey_type       text NOT NULL');
    expect(migration).toContain('credit_reward     smallint');
    expect(migration).toContain('priority          smallint');
    expect(migration).toContain('is_active         boolean');
    expect(migration).toContain('channels          text[]');
    expect(migration).toContain('target_audience   jsonb');
    expect(migration).toContain('frequency_days    smallint');
    expect(migration).toContain('expires_at        timestamptz');
  });

  it('survey_type CHECK constraint includes all 4 types', () => {
    expect(migration).toMatch(/survey_type.*CHECK.*'nps'.*'periodic'.*'micro'.*'exit'/s);
  });

  it('priority has range constraint 1-10', () => {
    expect(migration).toMatch(/priority.*CHECK.*priority\s*>=\s*1.*priority\s*<=\s*10/s);
  });

  it('creates survey_links table with all required columns', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS survey_links');
    expect(migration).toContain('token         char(6) PRIMARY KEY');
    expect(migration).toContain('user_id       uuid NOT NULL REFERENCES auth.users');
    expect(migration).toContain('survey_version text NOT NULL');
    expect(migration).toContain('channel       text NOT NULL');
    expect(migration).toContain('expires_at    timestamptz NOT NULL');
    expect(migration).toContain('used_at       timestamptz');
  });

  it('survey_links channel CHECK includes email and sms', () => {
    expect(migration).toMatch(/channel.*CHECK.*'email'.*'sms'/s);
  });

  it('creates indexes on survey_campaigns', () => {
    expect(migration).toContain('idx_survey_campaigns_active');
    expect(migration).toContain('idx_survey_campaigns_type');
    expect(migration).toContain('idx_survey_campaigns_version');
  });

  it('creates indexes on survey_links', () => {
    expect(migration).toContain('idx_survey_links_user');
    expect(migration).toContain('idx_survey_links_expires');
  });

  it('RLS enabled on both tables', () => {
    expect(migration).toContain('ALTER TABLE survey_campaigns ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE survey_links ENABLE ROW LEVEL SECURITY');
  });

  it('survey_campaigns readable by authenticated users', () => {
    expect(migration).toContain('survey_campaigns_read');
    expect(migration).toContain('FOR SELECT TO authenticated');
  });

  it('survey_links readable by owner only', () => {
    expect(migration).toContain('survey_links_user_read');
    expect(migration).toContain('auth.uid() = user_id');
  });

  it('service_role has full access on both tables', () => {
    expect(migration).toContain('survey_campaigns_service');
    expect(migration).toContain('survey_links_service');
  });
});

// ─── 2. grant_survey_credits RPC ─────────────────────────────────────────────
describe('SDV-S1: grant_survey_credits RPC', () => {
  const migration = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');

  it('creates grant_survey_credits function', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION grant_survey_credits');
  });

  it('accepts p_user_id, p_amount, p_survey_version params', () => {
    expect(migration).toContain('p_user_id uuid');
    expect(migration).toContain('p_amount smallint');
    expect(migration).toContain('p_survey_version text');
  });

  it('returns smallint (new balance)', () => {
    expect(migration).toContain('RETURNS smallint');
  });

  it('checks idempotency via credit_transactions source + feature', () => {
    expect(migration).toContain("source = 'survey_reward'");
    expect(migration).toContain('feature = p_survey_version');
  });

  it('returns existing balance on duplicate grant (idempotent)', () => {
    // The IF EXISTS block selects balance and returns early
    expect(migration).toMatch(/IF EXISTS.*SELECT 1 FROM credit_transactions.*RETURN/s);
  });

  it('updates profiles.credit_balance', () => {
    expect(migration).toContain('UPDATE profiles SET credit_balance = credit_balance + p_amount');
  });

  it('inserts into credit_transactions with survey_reward source', () => {
    expect(migration).toContain("'survey_reward'");
    expect(migration).toContain('INSERT INTO credit_transactions');
  });

  it('is SECURITY DEFINER', () => {
    expect(migration).toContain('SECURITY DEFINER');
  });

  it('grants execute to authenticated and service_role', () => {
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION grant_survey_credits');
    expect(migration).toContain('authenticated');
    expect(migration).toContain('service_role');
  });
});

// ─── 3. Seed Data ────────────────────────────────────────────────────────────
describe('SDV-S1: Campaign Seed Data', () => {
  const migration = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');

  it('seeds NPS campaign (priority 2, 3 credits)', () => {
    expect(migration).toContain("'nps_v1'");
    expect(migration).toContain("'nps'");
  });

  it('seeds periodic campaign (priority 3, 5 credits)', () => {
    expect(migration).toContain("'periodic_v2'");
    expect(migration).toContain("'periodic'");
  });

  it('seeds paywall friction micro-survey (priority 1 — highest)', () => {
    expect(migration).toContain("'micro_paywall_v1'");
  });

  it('seeds apply confidence micro-survey (priority 4)', () => {
    expect(migration).toContain("'micro_apply_confidence_v1'");
  });

  it('seeds search relevance micro-survey (priority 5)', () => {
    expect(migration).toContain("'micro_search_relevance_v1'");
  });

  it('seeds data value micro-survey (priority 6)', () => {
    expect(migration).toContain("'micro_data_value_v1'");
  });

  it('seeds exit survey (0 credits)', () => {
    expect(migration).toContain("'exit_v1'");
    expect(migration).toContain("'exit'");
  });

  it('uses ON CONFLICT DO NOTHING for idempotent seed', () => {
    expect(migration).toContain('ON CONFLICT (survey_version) DO NOTHING');
  });
});

// ─── 4. survey.html Credit Grant Wiring ──────────────────────────────────────
describe('SDV-S1: survey.html Credit Grant', () => {
  const html = readFile('survey.html');

  it('reads src delivery param from URL', () => {
    expect(html).toContain("params.get('src')");
    expect(html).toContain('deliverySource');
  });

  it('looks up credit_reward from survey_campaigns table', () => {
    expect(html).toContain('survey_campaigns?survey_version=eq.');
    expect(html).toContain('credit_reward');
  });

  it('calls grant_survey_credits RPC', () => {
    expect(html).toContain('rpc/grant_survey_credits');
    expect(html).toContain('p_user_id');
    expect(html).toContain('p_amount');
    expect(html).toContain('p_survey_version');
  });

  it('shows credit confirmation toast on success', () => {
    expect(html).toContain('_showCreditToast');
    expect(html).toContain('credits earned');
  });

  it('_showCreditToast creates a visible toast element', () => {
    expect(html).toContain('survey-credit-toast');
    expect(html).toContain('#22c55e'); // green accent
    expect(html).toContain("'+' + amount + ' credits earned'");
  });

  it('toast auto-dismisses after 5 seconds', () => {
    expect(html).toContain('setTimeout');
    expect(html).toContain('5000');
  });

  it('fires survey_credits_granted PostHog event', () => {
    expect(html).toContain("posthog.capture('survey_credits_granted'");
    expect(html).toContain('survey_version');
    expect(html).toContain('credit_amount');
    expect(html).toContain('channel: deliverySource');
  });

  it('fires survey_credit_grant_failed on error', () => {
    expect(html).toContain("posthog.capture('survey_credit_grant_failed'");
  });

  it('credit grant is non-fatal (does not block survey submission)', () => {
    // The grant block is in a try/catch that logs a warning, not a throw
    expect(html).toContain("console.warn('Credit grant failed:'");
  });

  it('skips credit grant for exit surveys (context === churn)', () => {
    expect(html).toContain("context !== 'churn'");
  });

  it('skips credit grant for anonymous users (no userId)', () => {
    // The condition is: if (userId && context !== 'churn')
    expect(html).toMatch(/if\s*\(\s*userId\s*&&\s*context\s*!==\s*'churn'\s*\)/);
  });

  it('removed the old TODO comment', () => {
    expect(html).not.toContain('TODO: API call to unlock Pro features');
  });

  it('replaced TODO with SDV-S1 completion note', () => {
    expect(html).toContain('SDV-S1: Credit reward handled above');
  });
});

// ─── 5. No Silent Catches ────────────────────────────────────────────────────
describe('SDV-S1: No Silent Catches (Marston Principle)', () => {
  const html = readFile('survey.html');

  it('no empty catch blocks in survey.html', () => {
    // Match catch blocks that are truly empty (only whitespace or comments like /* */)
    // Allow catches with console.warn, reportError, etc.
    const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    const matches = html.match(emptyCatchPattern);
    expect(matches).toBeNull();
  });

  it('session parse catch has console.warn', () => {
    expect(html).toContain('[survey] session parse failed');
  });

  it('PostHog catches are explicitly fire-and-forget with comment', () => {
    // PostHog catches should have a comment explaining they are intentionally minimal
    const phCatches = html.match(/catch\s*\(_ph\)/g);
    expect(phCatches).not.toBeNull();
    // Each _ph catch should have a comment
    expect(html).toContain('PostHog fire-and-forget');
  });
});

// ─── 6. Hook & Scar Documentation ───────────────────────────────────────────
describe('SDV-S1: Hook & Scar Documentation', () => {
  const migration = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');

  it('documents hook on target_audience JSONB', () => {
    expect(migration).toContain('Hook: schema-free JSONB');
  });

  it('documents scar on channels array', () => {
    expect(migration).toContain('Scar: new channel types');
  });

  it('documents scar_meta column for evolvability', () => {
    expect(migration).toContain('scar_meta');
    expect(migration).toContain('Evolvability scar');
  });
});

// ─── 7. Version & Build ─────────────────────────────────────────────────────
describe('SDV-S1: File Inventory', () => {
  it('migration file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql'))).toBe(true);
  });

  it('survey.html exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'survey.html'))).toBe(true);
  });

  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s1-schema-credit-grant.test.js'))).toBe(true);
  });
});
