// tests/fb-trial-001-s4-referral-program.test.js
// FB-TRIAL-001-S4 — Referral Program validation tests
// Covers: Parts 1–7 (EF, stripe-webhook, migration, referral limits, dashboard UI, sidebar, code expiry)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

function read(rel) { return readFileSync(resolve(ROOT, rel), 'utf8'); }
function exists(rel) { return existsSync(resolve(ROOT, rel)); }

// ─── 1. handle-referral-signup EF ───────────────────────────────────────────
describe('Part 1: handle-referral-signup EF', () => {
  const EF_PATH = 'supabase/functions/handle-referral-signup/index.ts';

  it('EF file exists', () => {
    expect(exists(EF_PATH)).toBe(true);
  });

  it('handles signup action', () => {
    const src = read(EF_PATH);
    expect(src).toContain("action !== 'signup'");
    expect(src).toContain("referral_code");
    expect(src).toContain("'signed_up'");
  });

  it('handles status action', () => {
    const src = read(EF_PATH);
    expect(src).toContain("action === 'status'");
    expect(src).toContain('trial_referrals');
    expect(src).toContain('referred_id');
  });

  it('blocks self-referral by user ID', () => {
    const src = read(EF_PATH);
    expect(src).toContain('referrer.id === user.id');
    expect(src).toContain('Self-referral not allowed');
  });

  it('blocks self-referral by email cross-check', () => {
    const src = read(EF_PATH);
    expect(src).toContain('referrerEmail.toLowerCase() === referredEmail.toLowerCase()');
  });

  it('checks referral code 90-day expiry', () => {
    const src = read(EF_PATH);
    expect(src).toContain('referral_code_generated_at');
    expect(src).toContain('daysDiff > 90');
    expect(src).toContain('Referral code has expired');
  });

  it('sets referred_by only if currently null (immutable guard)', () => {
    const src = read(EF_PATH);
    expect(src).toContain("referred_by: referrer.id");
    expect(src).toContain(".is('referred_by', null)");
  });

  it('inserts trial_referrals row with status=signed_up', () => {
    const src = read(EF_PATH);
    expect(src).toContain("status: 'signed_up'");
    expect(src).toContain('referred_signup_at');
  });

  it('invokes referral-lifecycle for notification', () => {
    const src = read(EF_PATH);
    expect(src).toContain("'referral-lifecycle'");
    expect(src).toContain("type: 'referee_signup'");
  });

  it('fires PostHog referral_signup event', () => {
    const src = read(EF_PATH);
    expect(src).toContain("'referral_signup'");
    expect(src).toContain('capturePostHog');
  });

  it('fires PostHog referral_signup_received to referrer', () => {
    const src = read(EF_PATH);
    expect(src).toContain("'referral_signup_received'");
  });

  it('requires auth (Bearer token)', () => {
    const src = read(EF_PATH);
    expect(src).toContain("'Bearer '");
    expect(src).toContain('Unauthorized');
  });

  it('CORS headers set to brilliantjobs.app', () => {
    const src = read(EF_PATH);
    expect(src).toContain('brilliantjobs.app');
  });
});

// ─── 2. Stripe Webhook — Referral Reward on Conversion ──────────────────────
describe('Part 2: stripe-webhook checkout.session.completed referral reward', () => {
  const SW = read('supabase/functions/stripe-webhook/index.ts');

  it('FB-TRIAL-001-S4 comment present in checkout handler', () => {
    expect(SW).toContain('FB-TRIAL-001-S4');
  });

  it('checks referred_by on profile after setting active_pro', () => {
    expect(SW).toContain("select('referred_by')");
    expect(SW).toContain('profile?.referred_by');
  });

  it('updates trial_referrals signed_up → converted', () => {
    expect(SW).toContain("status: 'converted'");
    expect(SW).toContain('referred_converted_at');
    expect(SW).toContain("eq('status', 'signed_up')");
  });

  it('invokes process-referral-reward EF', () => {
    expect(SW).toContain("'process-referral-reward'");
    expect(SW).toContain('referral_id');
    expect(SW).toContain('referrer_id');
  });

  it('fires PostHog trial_converted with referred_by', () => {
    expect(SW).toContain("'trial_converted'");
    expect(SW).toContain('referred_by');
    expect(SW).toContain("surface: 'stripe_webhook'");
  });

  it('wraps referral reward in try-catch (non-fatal)', () => {
    expect(SW).toContain('referral reward failed');
  });
});

// ─── 3. Migration — clawback cron + referral_code_generated_at ──────────────
describe('Part 3: Migration — clawback pg_cron + referral_code_generated_at', () => {
  const MIG_PATH = 'supabase/migrations/20260314000001_fb_trial_001_s4_referral.sql';

  it('migration file exists', () => {
    expect(exists(MIG_PATH)).toBe(true);
  });

  it('adds referral_code_generated_at column', () => {
    const src = read(MIG_PATH);
    expect(src).toContain('referral_code_generated_at');
    expect(src).toContain('TIMESTAMPTZ');
    expect(src).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('backfills referral_code_generated_at from created_at', () => {
    const src = read(MIG_PATH);
    expect(src).toContain('referral_code IS NOT NULL');
    expect(src).toContain('referral_code_generated_at IS NULL');
    expect(src).toContain('SET referral_code_generated_at = created_at');
  });

  it('updates fn_trial_on_signup to set generated_at', () => {
    const src = read(MIG_PATH);
    expect(src).toContain('fn_trial_on_signup');
    expect(src).toContain('referral_code_generated_at = NOW()');
  });

  it('creates fn_referral_clawback_check function', () => {
    const src = read(MIG_PATH);
    expect(src).toContain('fn_referral_clawback_check');
    expect(src).toContain("status = 'converted'");
    expect(src).toContain("INTERVAL '7 days'");
  });

  it('clawback sets status to expired', () => {
    const src = read(MIG_PATH);
    expect(src).toContain("SET status = 'expired'");
    expect(src).toContain('id = ANY(v_clawback_ids)');
  });

  it('schedules daily pg_cron at 3AM UTC', () => {
    const src = read(MIG_PATH);
    expect(src).toContain("'referral-clawback-checker'");
    expect(src).toContain("'0 3 * * *'");
    expect(src).toContain('fn_referral_clawback_check');
  });
});

// ─── 4. Referral Limits ──────────────────────────────────────────────────────
describe('Part 4: Referral limits (max 4 per cycle)', () => {
  it('process-referral-reward EF exists', () => {
    expect(exists('supabase/functions/process-referral-reward/index.ts')).toBe(true);
  });

  it('process-referral-reward invoked by stripe-webhook on conversion', () => {
    const sw = read('supabase/functions/stripe-webhook/index.ts');
    expect(sw).toContain('process-referral-reward');
  });

  it('referral limits comment in spec section 5.3 is addressed', () => {
    // process-referral-reward handles referrer_credit_applied_at billing cycle check
    const ef = read('supabase/functions/process-referral-reward/index.ts');
    expect(ef).toContain('referral_id');
    expect(ef).toContain('stripePost');
  });

  it('trial_referrals table has referrer_credit_applied_at column', () => {
    const mig = read('supabase/migrations/20260313000000_fb_trial_001_schema.sql');
    expect(mig).toContain('referrer_credit_applied_at');
  });
});

// ─── 5. Dashboard UI — Post-Upgrade Referral Introduction ───────────────────
describe('Part 5: Post-upgrade referral introduction', () => {
  it('trial-gate.js _maybeShowUpgradeIntro function exists', () => {
    const src = read('js/trial-gate.js');
    expect(src).toContain('_maybeShowUpgradeIntro');
  });

  it('detects ?upgraded=true URL param', () => {
    const src = read('js/trial-gate.js');
    expect(src).toContain("params.get('upgraded') !== 'true'");
  });

  it('clears ?upgraded=true from URL without reload', () => {
    const src = read('js/trial-gate.js');
    expect(src).toContain("params.delete('upgraded')");
    expect(src).toContain('history.replaceState');
  });

  it('calls showUpgradeReferralIntro from referrals.js', () => {
    const src = read('js/trial-gate.js');
    expect(src).toContain('showUpgradeReferralIntro');
  });

  it('polls for deferred chunk if referrals.js not yet loaded', () => {
    const src = read('js/trial-gate.js');
    expect(src).toContain('setInterval');
    expect(src).toContain('attempts > 20');
  });

  it('_maybeShowUpgradeIntro called on active_pro state', () => {
    const src = read('js/trial-gate.js');
    // The active_pro branch calls _maybeShowUpgradeIntro
    const proBlock = src.split("state === 'active_pro'")[1] || '';
    expect(proBlock).toContain('_maybeShowUpgradeIntro');
  });

  it('referrals.js showUpgradeReferralIntro exists', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('showUpgradeReferralIntro');
    expect(src).toContain('referral_intro_dismissed');
  });

  it('shows green success toast on upgrade', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('Welcome to Pro! All features are now unlocked.');
    expect(src).toContain('#22C55E');
  });

  it('referral intro card has copy + dismiss buttons', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('_introcopyreferrallink');
    expect(src).toContain('_dismissReferralIntro');
    expect(src).toContain('Not now');
  });

  it('dismiss sets referral_intro_dismissed in localStorage', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("localStorage.setItem('referral_intro_dismissed', '1')");
  });

  it('fires PostHog referral_intro_shown', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'referral_intro_shown'");
  });

  it('fires PostHog referral_link_copied', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'referral_link_copied'");
  });

  it('referral-intro-card container in dashboard.html', () => {
    const src = read('dashboard.html');
    expect(src).toContain('id="referral-intro-card"');
  });

  it('referral link uses brilliantjobs.app/r/{code} format', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'https://brilliantjobs.app/r/' + code");
  });

  it('fetches referral_code from profiles', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("select('referral_code')");
  });
});

// ─── 6. Sidebar Referral Link ────────────────────────────────────────────────
describe('Part 6: Sidebar referral link', () => {
  it('sidebar-referral-link div in dashboard.html', () => {
    const src = read('dashboard.html');
    expect(src).toContain('id="sidebar-referral-link"');
  });

  it('sidebar link shows "Refer a friend — get a free week"', () => {
    const src = read('dashboard.html');
    expect(src).toContain('Refer a friend');
    expect(src).toContain('get a free week');
  });

  it('sidebar link navigates to referrals page', () => {
    const src = read('dashboard.html');
    expect(src).toContain("switchPage&&BJ.switchPage('referrals')");
  });

  it('sidebar link hidden by default (display:none)', () => {
    const src = read('dashboard.html');
    const block = src.split('id="sidebar-referral-link"')[1]?.split('>')[0] || '';
    expect(block).toContain('display:none');
  });

  it('initSidebarReferralLink function in referrals.js', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('initSidebarReferralLink');
    expect(src).toContain("userState === 'active_pro'");
    expect(src).toContain("'sidebar-referral-link'");
  });

  it('initSidebarReferralLink exported to window + BJ', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'initSidebarReferralLink'");
  });
});

// ─── 7. Referral Code Expiry + Regeneration ─────────────────────────────────
describe('Part 7: Referral code expiry + regeneration', () => {
  it('regenerateReferralCode function in referrals.js', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('regenerateReferralCode');
  });

  it('updates both referral_code and referral_code_generated_at', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('referral_code:');
    expect(src).toContain('referral_code_generated_at:');
    expect(src).toContain('new Date().toISOString()');
  });

  it('disables button during regeneration (loading state)', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('btn.disabled = true');
    expect(src).toContain("btn.textContent = 'Regenerating...'");
  });

  it('updates UI after regeneration (ref-code-val, ref-link-val)', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('ref-code-val');
    expect(src).toContain('referralStats.referral_code = newCode');
  });

  it('fires PostHog referral_code_regenerated', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'referral_code_regenerated'");
  });

  it('"Regenerate code" button in Share Your Link card', () => {
    const src = read('js/referrals.js');
    expect(src).toContain('ref-regenerate-btn');
    expect(src).toContain('Regenerate code');
  });

  it('regenerateReferralCode exported to window + BJ', () => {
    const src = read('js/referrals.js');
    expect(src).toContain("'regenerateReferralCode'");
  });

  it('EF blocks expired codes (90 day check)', () => {
    const src = read('supabase/functions/handle-referral-signup/index.ts');
    expect(src).toContain('daysDiff > 90');
    expect(src).toContain('Referral code has expired');
  });
});

// ─── 8. Gateway Route ────────────────────────────────────────────────────────
describe('Gateway route #116', () => {
  it('handle-referral-signup registered in api-gateway', () => {
    const src = read('supabase/functions/api-gateway/index.ts');
    expect(src).toContain('"handle-referral-signup"');
    expect(src).toContain('FB-TRIAL-001-S4');
  });

  it('total routes updated to 116', () => {
    const src = read('supabase/functions/api-gateway/index.ts');
    expect(src).toContain('116 routes');
  });
});

// ─── 9. Version + Build ──────────────────────────────────────────────────────
describe('Version + Build', () => {
  it('BJ_VERSION is v8.98', () => {
    const src = read('js/version.js');
    expect(src).toContain('v8.98');
  });

  it('dist/dashboard.min.js contains v8.98', () => {
    const src = read('dist/dashboard.min.js');
    expect(src).toContain('v8.98');
  });

  it('dist/dashboard-deferred.min.js rebuilt (contains referral code)', () => {
    const src = read('dist/dashboard-deferred.min.js');
    // deferred chunk includes referrals.js
    expect(src).toContain('showUpgradeReferralIntro');
  });

  it('dashboard.html cache busters updated to v8.98', () => {
    const src = read('dashboard.html');
    expect(src).toContain('v=v8.98');
  });
});

// ─── 10. pod-team-manifest ───────────────────────────────────────────────────
describe('Pod Team Manifest', () => {
  it('FB-TRIAL-001-S4 pairing row exists', () => {
    const src = read('docs/scaling/pod-team-manifest.md');
    expect(src).toContain('FB-TRIAL-001-S4');
  });
});

// ─── 11. File Inventory ──────────────────────────────────────────────────────
describe('File inventory', () => {
  const requiredFiles = [
    'supabase/functions/handle-referral-signup/index.ts',
    'supabase/migrations/20260314000001_fb_trial_001_s4_referral.sql',
    'js/trial-gate.js',
    'js/referrals.js',
    'dashboard.html',
    'supabase/functions/stripe-webhook/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'supabase/functions/process-referral-reward/index.ts',
    'docs/scaling/pod-team-manifest.md',
  ];

  requiredFiles.forEach(f => {
    it(`${f} exists`, () => expect(exists(f)).toBe(true));
  });
});
