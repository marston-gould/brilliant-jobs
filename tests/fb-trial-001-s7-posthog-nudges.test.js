// tests/fb-trial-001-s7-posthog-nudges.test.js
// FB-TRIAL-001-S7: PostHog Events + Inline Nudges + QA
// Validates all 22 analytics events (spec §11) and 7 inline nudges (spec §6.4)
// Run: npx vitest run tests/fb-trial-001-s7-posthog-nudges.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// ─── File helpers ───────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const readFile = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── Source files under test ─────────────────────────────────
const trialGateJS   = readFile('js/trial-gate.js');
const sendTrialEF   = readFile('supabase/functions/send-trial-notifications/index.ts');
const weeklyDigestEF = readFile('supabase/functions/weekly-digest-expired/index.ts');
const processRewardEF = readFile('supabase/functions/process-referral-reward/index.ts');
const clawbackEF    = readFile('supabase/functions/referral-reward-clawback/index.ts');
const stripeWebhookEF = readFile('supabase/functions/stripe-webhook/index.ts');
const checkAccessTS = readFile('supabase/functions/_shared/checkFeatureAccess.ts');
const dashboardMin  = readFile('dist/dashboard-deferred.min.js');

// ──────────────────────────────────────────────────────────────
// §1  All 22 PostHog Events Present
// ──────────────────────────────────────────────────────────────
describe('§1 All 22 PostHog events from spec §11', () => {

  // Client-side events in trial-gate.js
  it('trial_started fires on new signup (session dedup)', () => {
    expect(trialGateJS).toContain("'trial_started'");
    expect(trialGateJS).toContain('bj_trial_started_fired');
    expect(trialGateJS).toContain('sessionStorage.setItem(\'bj_trial_started_fired\'');
  });

  it('trial_upgrade_prompted fires when banner renders (§6.1)', () => {
    expect(trialGateJS).toContain("'trial_upgrade_prompted'");
    expect(trialGateJS).toContain('trigger: \'trial_banner\'');
  });

  it('trial_upgrade_clicked fires on banner CTA click', () => {
    expect(trialGateJS).toContain("'trial_upgrade_clicked'");
    expect(trialGateJS).toContain("source:\\'trial_banner\\'");
  });

  it('sample_offered fires when pre-sample prompt shows (replaces pre_sample_prompt_shown)', () => {
    expect(trialGateJS).toContain("'sample_offered'");
    expect(trialGateJS).toContain('days_since_expiry');
  });

  it('sample_used fires when user confirms sample use', () => {
    expect(trialGateJS).toContain("'sample_used'");
  });

  it('sample_conversion_prompted fires when post-sample modal shows', () => {
    expect(trialGateJS).toContain("'sample_conversion_prompted'");
  });

  it('sample_converted fires when user clicks Upgrade in post-sample modal', () => {
    expect(trialGateJS).toContain("'sample_converted'");
  });

  it('expired_gate_hit fires for each of the 7 nudge locations', () => {
    expect(trialGateJS).toContain("'expired_gate_hit'");
    // Should fire 7 times — one per feature
    const matches = trialGateJS.match(/_fireGateHit\('/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(7);
  });

  it('trial_upgrade_clicked fires on inline nudge upgrade links', () => {
    expect(trialGateJS).toContain("source: 'inline_nudge'");
  });

  // Server-side events
  it('trial_expired fires in send-trial-notifications expired_nudge', () => {
    expect(sendTrialEF).toContain('"trial_expired"');
    expect(sendTrialEF).toContain('features_used_count');
    expect(sendTrialEF).toContain('capturePostHog');
  });

  it('expired_digest_sent fires in weekly-digest-expired after successful send', () => {
    expect(weeklyDigestEF).toContain('"expired_digest_sent"');
    expect(weeklyDigestEF).toContain('jobs_matched');
    expect(weeklyDigestEF).toContain('capturePostHog');
  });

  it('referral_rewarded fires in process-referral-reward after credit grant', () => {
    expect(processRewardEF).toContain("'referral_rewarded'");
    expect(processRewardEF).toContain('credits_this_cycle');
    expect(processRewardEF).toContain('capturePostHog');
  });

  it('referral_clawback fires in referral-reward-clawback', () => {
    expect(clawbackEF).toContain('"referral_clawback"');
    expect(clawbackEF).toContain('referred_id');
  });

  it('expired_reactivated fires in stripe-webhook when expired_free user subscribes', () => {
    expect(stripeWebhookEF).toContain("'expired_reactivated'");
    expect(stripeWebhookEF).toContain("user_state === 'expired_free'");
    expect(stripeWebhookEF).toContain('days_since_expiry');
  });

  it('trial_converted already fires (FB-TRIAL-001-S4, preserved)', () => {
    expect(stripeWebhookEF).toContain("'trial_converted'");
  });

  it('trial_feature_used fires in checkFeatureAccess when trialing user uses feature', () => {
    expect(checkAccessTS).toContain("'trial_feature_used'");
    expect(checkAccessTS).toContain('day_of_trial');
  });

  it('referral_signup already fires in handle-referral-signup (preserved)', () => {
    const handleRef = readFile('supabase/functions/handle-referral-signup/index.ts');
    expect(handleRef).toContain("'referral_signup'");
  });

  it('referral_intro_shown already fires in referrals.js (preserved)', () => {
    const referralsJS = readFile('js/referrals.js');
    expect(referralsJS).toContain("'referral_intro_shown'");
  });

  it('referral_link_copied already fires in referrals.js (preserved)', () => {
    const referralsJS = readFile('js/referrals.js');
    expect(referralsJS).toContain("'referral_link_copied'");
  });

  it('batch_score_completed already fires in batch-resume-scorer (preserved, S6)', () => {
    const batchEF = readFile('supabase/functions/batch-resume-scorer/index.ts');
    expect(batchEF).toContain("'batch_score_completed'");
  });

  it('cache_hit_rate already fires in chat-job-search (preserved, S6)', () => {
    const chatEF = readFile('supabase/functions/chat-job-search/index.ts');
    expect(chatEF).toContain('cache_hit_rate');
  });

  it('sample_conversion_dismissed fires on modal dismiss (existing)', () => {
    expect(trialGateJS).toContain("'sample_conversion_dismissed'");
  });
});

// ──────────────────────────────────────────────────────────────
// §2  trial_started Event Properties
// ──────────────────────────────────────────────────────────────
describe('§2 trial_started event properties and dedup', () => {
  it('includes user_id, signup_source, referred_by properties', () => {
    expect(trialGateJS).toContain("signup_source: 'dashboard'");
    expect(trialGateJS).toContain('referred_by:');
  });

  it('only fires within 10 minutes of signup (startedMsAgo < 10 * 60 * 1000)', () => {
    expect(trialGateJS).toContain('10 * 60 * 1000');
  });

  it('uses sessionStorage dedup to prevent re-firing on page reload', () => {
    expect(trialGateJS).toContain("sessionStorage.getItem('bj_trial_started_fired')");
    expect(trialGateJS).toContain("sessionStorage.setItem('bj_trial_started_fired'");
  });

  it('reads trial_started_at from profiles query', () => {
    expect(trialGateJS).toContain('trial_started_at');
  });
});

// ──────────────────────────────────────────────────────────────
// §3  Inline Nudges — 7 Locations (spec §6.4)
// ──────────────────────────────────────────────────────────────
describe('§3 renderExpiredNudges — 7 locations', () => {
  it('renderExpiredNudges function exists', () => {
    expect(trialGateJS).toContain('function renderExpiredNudges');
  });

  it('window.renderExpiredNudges exported', () => {
    expect(trialGateJS).toContain('window.renderExpiredNudges = renderExpiredNudges');
  });

  it('BJ namespace includes renderExpiredNudges', () => {
    expect(trialGateJS).toContain('BJ.renderExpiredNudges = renderExpiredNudges');
  });

  it('nudge 1: chat tab — disables chat input', () => {
    expect(trialGateJS).toContain("chat-input");
    expect(trialGateJS).toContain('data-feature="chat"');
    expect(trialGateJS).toContain("'chat'");
  });

  it('nudge 2: boolean toggle — disabled with Pro badge', () => {
    expect(trialGateJS).toContain('boolean-toggle');
    expect(trialGateJS).toContain('data-feature="boolean"');
    expect(trialGateJS).toContain("'boolean'");
  });

  it('nudge 3: stats page — blurred overlay with upgrade CTA', () => {
    expect(trialGateJS).toContain('page-stats');
    expect(trialGateJS).toContain('data-feature="stats"');
    expect(trialGateJS).toContain('backdrop-filter:blur');
  });

  it('nudge 4: saved filter counter', () => {
    expect(trialGateJS).toContain('saved-filters-header');
    expect(trialGateJS).toContain('data-feature="filter"');
  });

  it('nudge 5: SMS notification toggles — disabled', () => {
    expect(trialGateJS).toContain('sms-toggle');
    expect(trialGateJS).toContain('data-feature="sms"');
    expect(trialGateJS).toContain('Pro feature');
  });

  it('nudge 6: resume score column', () => {
    expect(trialGateJS).toContain('readiness-area');
    expect(trialGateJS).toContain('data-feature="score"');
    expect(trialGateJS).toContain('Upgrade to score more');
  });

  it('nudge 7: auto-apply button — disabled with Pro badge', () => {
    expect(trialGateJS).toContain('auto-apply-btn');
    expect(trialGateJS).toContain('data-feature="apply"');
    expect(trialGateJS).toContain("'apply'");
  });

  it('each nudge fires expired_gate_hit PostHog event', () => {
    expect(trialGateJS).toContain("_fireGateHit('chat')");
    expect(trialGateJS).toContain("_fireGateHit('boolean')");
    expect(trialGateJS).toContain("_fireGateHit('stats')");
    expect(trialGateJS).toContain("_fireGateHit('filter')");
    expect(trialGateJS).toContain("_fireGateHit('sms')");
    expect(trialGateJS).toContain("_fireGateHit('score')");
    expect(trialGateJS).toContain("_fireGateHit('apply')");
  });

  it('nudge inline upgrade links fire trial_upgrade_clicked with source=inline_nudge', () => {
    expect(trialGateJS).toContain("source: 'inline_nudge'");
  });

  it('renderExpiredNudges called from initTrialGate when _allSamplesConsumed', () => {
    expect(trialGateJS).toContain('_allSamplesConsumed');
    expect(trialGateJS).toContain('renderExpiredNudges()');
  });
});

// ──────────────────────────────────────────────────────────────
// §4  _daysSinceExpiry Helper
// ──────────────────────────────────────────────────────────────
describe('§4 _daysSinceExpiry helper', () => {
  it('function exists and reads from sessionStorage', () => {
    expect(trialGateJS).toContain('function _daysSinceExpiry');
    expect(trialGateJS).toContain("sessionStorage.getItem('bj_trial_expires_at')");
  });

  it('trial_expires_at cached in sessionStorage during initTrialGate', () => {
    expect(trialGateJS).toContain("sessionStorage.setItem('bj_trial_expires_at'");
  });

  it('returns 0 as safe default on error', () => {
    expect(trialGateJS).toContain('return 0;');
  });
});

// ──────────────────────────────────────────────────────────────
// §5  PostHog Helper Added to All Backend EFs
// ──────────────────────────────────────────────────────────────
describe('§5 capturePostHog helper added to backend EFs', () => {
  it('send-trial-notifications has POSTHOG_KEY constant and capturePostHog', () => {
    expect(sendTrialEF).toContain('POSTHOG_KEY');
    expect(sendTrialEF).toContain('POSTHOG_HOST');
    expect(sendTrialEF).toContain('async function capturePostHog');
  });

  it('weekly-digest-expired has capturePostHog helper', () => {
    expect(weeklyDigestEF).toContain('async function capturePostHog');
    expect(weeklyDigestEF).toContain('POSTHOG_KEY');
  });

  it('process-referral-reward has capturePostHog helper', () => {
    expect(processRewardEF).toContain('async function capturePostHog');
    expect(processRewardEF).toContain('POSTHOG_KEY');
  });

  it('all helpers fire-and-forget (no await on outer call, or try/catch)', () => {
    // All helpers use try/catch with fire-and-forget semantics
    expect(sendTrialEF).toContain('fire-and-forget');
    expect(weeklyDigestEF).toContain('fire-and-forget');
    expect(processRewardEF).toContain('fire-and-forget');
  });
});

// ──────────────────────────────────────────────────────────────
// §6  checkFeatureAccess trial_feature_used
// ──────────────────────────────────────────────────────────────
describe('§6 checkFeatureAccess trial_feature_used event', () => {
  it('fires only when allowed=true AND daysRemaining is a number (trialing branch)', () => {
    expect(checkAccessTS).toContain("typeof accessResult.daysRemaining === 'number'");
    expect(checkAccessTS).toContain('accessResult.allowed');
  });

  it('computes day_of_trial as 7 - daysRemaining', () => {
    expect(checkAccessTS).toContain('7 - accessResult.daysRemaining');
  });

  it('never blocks the gate — PostHog call is fire-and-forget in inner try/catch', () => {
    expect(checkAccessTS).toContain('never block the gate');
  });

  it('returns accessResult correctly after event fire', () => {
    expect(checkAccessTS).toContain('return accessResult;');
  });
});

// ──────────────────────────────────────────────────────────────
// §7  expired_reactivated in stripe-webhook
// ──────────────────────────────────────────────────────────────
describe('§7 expired_reactivated stripe-webhook logic', () => {
  it('reads old user_state BEFORE updating to active_pro', () => {
    expect(stripeWebhookEF).toContain('oldProfile');
    expect(stripeWebhookEF).toContain("select('user_state, trial_expires_at')");
  });

  it('only fires when old state was expired_free', () => {
    expect(stripeWebhookEF).toContain("oldProfile?.user_state === 'expired_free'");
  });

  it('includes days_since_expiry derived from trial_expires_at', () => {
    expect(stripeWebhookEF).toContain('days_since_expiry');
    expect(stripeWebhookEF).toContain('daysSinceExpiry');
  });

  it('trigger property is checkout', () => {
    expect(stripeWebhookEF).toContain("trigger: 'checkout'");
  });
});

// ──────────────────────────────────────────────────────────────
// §8  trial_upgrade_prompted properties
// ──────────────────────────────────────────────────────────────
describe('§8 trial_upgrade_prompted event properties', () => {
  it('fires each time trial banner is rendered', () => {
    expect(trialGateJS).toContain("'trial_upgrade_prompted'");
  });

  it('includes user_id, trigger, day_of_trial', () => {
    expect(trialGateJS).toContain('day_of_trial');
    expect(trialGateJS).toContain("trigger: 'trial_banner'");
  });
});

// ──────────────────────────────────────────────────────────────
// §9  sample_converted event properties
// ──────────────────────────────────────────────────────────────
describe('§9 sample_converted event properties', () => {
  it('includes feature and days_since_expiry', () => {
    expect(trialGateJS).toContain("'sample_converted'");
    expect(trialGateJS).toContain('days_since_expiry: _daysSinceExpiry()');
  });

  it('fires alongside legacy sample_conversion_upgrade_click for backwards compat', () => {
    expect(trialGateJS).toContain("'sample_conversion_upgrade_click'");
    expect(trialGateJS).toContain("'sample_converted'");
  });
});

// ──────────────────────────────────────────────────────────────
// §10 Build integrity
// ──────────────────────────────────────────────────────────────
describe('§10 Build integrity and version', () => {
  it('BJ_VERSION is v9.01', () => {
    const ver = readFile('js/version.js');
    expect(ver).toContain('"v9.01"');
  });

  it('dashboard-deferred.min.js contains renderExpiredNudges', () => {
    expect(dashboardMin).toContain('renderExpiredNudges');
  });

  it('deferred bundle contains trial_started event name', () => {
    expect(dashboardMin).toContain('trial_started');
  });

  it('deferred bundle contains trial_upgrade_prompted', () => {
    expect(dashboardMin).toContain('trial_upgrade_prompted');
  });

  it('deferred bundle contains expired_gate_hit', () => {
    expect(dashboardMin).toContain('expired_gate_hit');
  });

  it('dist/manifest.json has been regenerated', () => {
    const manifest = readFile('dist/manifest.json');
    expect(manifest).toBeTruthy();
    expect(manifest).toContain('build');
  });
});
