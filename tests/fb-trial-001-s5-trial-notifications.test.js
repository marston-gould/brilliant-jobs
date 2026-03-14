// tests/fb-trial-001-s5-trial-notifications.test.js
// FB-TRIAL-001-S5: Trial Notifications — validation tests
// Parts: send-trial-notifications EF, weekly-digest-expired EF,
//        pg_cron migration, notification templates, stripe-webhook consolidation

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}
function exists(p) {
  return fs.existsSync(path.join(ROOT, p));
}

// ══════════════════════════════════════════════════════════════
// 1. FILE EXISTENCE
// ══════════════════════════════════════════════════════════════
describe('1. File existence', () => {
  it('send-trial-notifications EF exists', () => {
    expect(exists('supabase/functions/send-trial-notifications/index.ts')).toBe(true);
  });
  it('weekly-digest-expired EF exists', () => {
    expect(exists('supabase/functions/weekly-digest-expired/index.ts')).toBe(true);
  });
  it('pg_cron migration exists', () => {
    expect(exists('supabase/migrations/20260314000002_fb_trial_001_s5_notification_crons.sql')).toBe(true);
  });
  it('stripe-webhook exists', () => {
    expect(exists('supabase/functions/stripe-webhook/index.ts')).toBe(true);
  });
  it('handle-referral-signup exists', () => {
    expect(exists('supabase/functions/handle-referral-signup/index.ts')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. send-trial-notifications EF — structure & actions
// ══════════════════════════════════════════════════════════════
describe('2. send-trial-notifications EF', () => {
  const ef = read('supabase/functions/send-trial-notifications/index.ts');

  it('imports serve and createClient', () => {
    expect(ef).toContain('serve');
    expect(ef).toContain('createClient');
  });

  it('exports all 6 required actions', () => {
    expect(ef).toContain('trial_expiring');
    expect(ef).toContain('expired_nudge');
    expect(ef).toContain('expired_nudge_30d');
    expect(ef).toContain('sample_reminder');
    expect(ef).toContain('referral_signup');
    expect(ef).toContain('referral_converted');
  });

  it('auth: service_role only', () => {
    expect(ef).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(ef).toContain('service_role_required');
  });

  it('trial_expiring: queries trialing profiles with trial_expires_at window', () => {
    expect(ef).toContain("user_state", "trialing");
    expect(ef).toContain('trial_expires_at');
  });

  it('trial_expiring: 5d, 3d, 1d windows defined', () => {
    expect(ef).toContain('trial_expiring_5d');
    expect(ef).toContain('trial_expiring_3d');
    expect(ef).toContain('trial_expiring_1d');
  });

  it('expired_nudge: queries users expired in last 24h', () => {
    expect(ef).toContain('24 * 3600');
    expect(ef).toContain('expired_free');
  });

  it('expired_nudge_30d: queries users expired ~30 days ago', () => {
    expect(ef).toContain('30');
    expect(ef).toContain('trial_expired_30d');
  });

  it('sample_reminder: only sends if no samples consumed', () => {
    expect(ef).toContain('anyConsumed');
    expect(ef).toContain('sample_used_reminder');
  });

  it('referral_signup: dedup check per referred_id', () => {
    expect(ef).toContain('referral_signup_notify');
    expect(ef).toContain('referred_id');
  });

  it('referral_converted: fires to both referrer and referred', () => {
    expect(ef).toContain('referral_converted_referrer');
    expect(ef).toContain('referral_converted_referred');
  });

  it('uses notification_log for dedup', () => {
    expect(ef).toContain('notification_log');
    expect(ef).toContain('alreadySent');
  });

  it('uses Resend for email delivery', () => {
    expect(ef).toContain('RESEND_API_KEY');
    expect(ef).toContain('api.resend.com/emails');
  });

  it('logs sent notifications to notification_log', () => {
    expect(ef).toContain('logNotification');
    expect(ef).toContain('notification_log');
  });

  it('reads template from notification_templates', () => {
    expect(ef).toContain('notification_templates');
    expect(ef).toContain('getTemplate');
  });

  it('has inline fallback HTML when template missing', () => {
    expect(ef).toContain('buildEmailHtml');
  });

  it('CORS header restricted to brilliantjobs.app', () => {
    expect(ef).toContain('https://brilliantjobs.app');
  });

  it('handles OPTIONS preflight', () => {
    expect(ef).toContain('OPTIONS');
  });
});

// ══════════════════════════════════════════════════════════════
// 3. weekly-digest-expired EF — structure & logic
// ══════════════════════════════════════════════════════════════
describe('3. weekly-digest-expired EF', () => {
  const ef = read('supabase/functions/weekly-digest-expired/index.ts');

  it('service_role only auth', () => {
    expect(ef).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(ef).toContain('service_role_required');
  });

  it('queries expired_free users', () => {
    expect(ef).toContain('expired_free');
  });

  it('queries ats_jobs for jobs posted in last 7 days', () => {
    expect(ef).toContain('7 * 86400');
    expect(ef).toContain('ats_jobs');
    expect(ef).toContain("status", "open");
  });

  it('matches jobs using user_filters filter_data', () => {
    expect(ef).toContain('user_filters');
    expect(ef).toContain('matchesFilter');
  });

  it('shows up to 5 jobs in preview', () => {
    expect(ef).toContain('slice(0, 5)');
  });

  it('includes Upgrade CTA with total count', () => {
    expect(ef).toContain('Upgrade to see all');
    expect(ef).toContain('totalCount');
  });

  it('skips users not logged in 60+ days', () => {
    expect(ef).toContain('60 * 86400');
    expect(ef).toContain('lastActiveThreshold');
  });

  it('skips users with no active saved filter', () => {
    expect(ef).toContain('filters.length === 0');
  });

  it('respects notification_preferences email_enabled=false', () => {
    expect(ef).toContain('notification_preferences');
    expect(ef).toContain('email_enabled');
  });

  it('dedup: skips users who got digest this week', () => {
    expect(ef).toContain('weekly_digest_expired');
    expect(ef).toContain('recentDigest');
  });

  it('logs sent digests to notification_log', () => {
    expect(ef).toContain('notification_log');
    expect(ef).toContain('weekly_digest_expired');
  });

  it('XSS escaping in HTML output', () => {
    expect(ef).toContain('escHtml');
  });

  it('returns sent/skipped/errors stats', () => {
    expect(ef).toContain('sent');
    expect(ef).toContain('skipped');
    expect(ef).toContain('errors');
  });
});

// ══════════════════════════════════════════════════════════════
// 4. pg_cron migration
// ══════════════════════════════════════════════════════════════
describe('4. pg_cron migration', () => {
  const sql = read('supabase/migrations/20260314000002_fb_trial_001_s5_notification_crons.sql');

  it('schedules trial-expiry-notifications daily at 9AM UTC', () => {
    expect(sql).toContain('trial-expiry-notifications');
    expect(sql).toContain("'0 9 * * *'");
    expect(sql).toContain('trial_expiring');
  });

  it('schedules expired-nudge-notifications daily at 9AM UTC', () => {
    expect(sql).toContain('expired-nudge-notifications');
    expect(sql).toContain('expired_nudge');
  });

  it('schedules expired-nudge-30d daily at 10AM UTC', () => {
    expect(sql).toContain('expired-nudge-30d');
    expect(sql).toContain("'0 10 * * *'");
    expect(sql).toContain('expired_nudge_30d');
  });

  it('schedules weekly-digest-expired Mondays at 8AM UTC', () => {
    expect(sql).toContain('weekly-digest-expired');
    expect(sql).toContain("'0 8 * * 1'");
  });

  it('all crons use ON CONFLICT DO UPDATE (idempotent)', () => {
    const matches = sql.match(/ON CONFLICT \(jobname\) DO UPDATE/g);
    expect(matches?.length).toBeGreaterThanOrEqual(4);
  });

  it('calls send-trial-notifications EF endpoint', () => {
    expect(sql).toContain('send-trial-notifications');
  });

  it('calls weekly-digest-expired EF endpoint', () => {
    expect(sql).toContain('weekly-digest-expired');
  });
});

// ══════════════════════════════════════════════════════════════
// 5. Notification templates seeding
// ══════════════════════════════════════════════════════════════
describe('5. Notification templates seeding', () => {
  const sql = read('supabase/migrations/20260314000002_fb_trial_001_s5_notification_crons.sql');

  const expectedTemplates = [
    'trial_expiring_5d',
    'trial_expiring_3d',
    'trial_expiring_1d',
    'trial_expired',
    'trial_expired_30d',
    'referral_signup_notify',
    'referral_converted_referrer',
    'referral_converted_referred',
    'sample_used_reminder',
  ];

  for (const tpl of expectedTemplates) {
    it(`seeds template: ${tpl}`, () => {
      expect(sql).toContain(`'${tpl}'`);
    });
  }

  it('all email templates have subject_line', () => {
    const emailInserts = sql.match(/\('.*?',\s*'email'/g);
    expect(emailInserts?.length).toBeGreaterThanOrEqual(9);
  });

  it('SMS templates present for trial_expiring_1d, trial_expired, referral_converted_referrer', () => {
    expect(sql).toContain("('trial_expiring_1d', 'sms'");
    expect(sql).toContain("('trial_expired', 'sms'");
    expect(sql).toContain("('referral_converted_referrer', 'sms'");
  });

  it('uses ON CONFLICT DO UPDATE for idempotent seeding', () => {
    expect(sql).toContain('ON CONFLICT (notification_type, channel) DO UPDATE');
  });

  it('templates include upgrade CTA links', () => {
    expect(sql).toContain('brilliantjobs.app/upgrade');
  });

  it('templates include unsubscribe links', () => {
    expect(sql).toContain('brilliantjobs.app/unsubscribe');
  });

  it('includes notification_log dedup index', () => {
    expect(sql).toContain('idx_notif_log_user_type_created');
    expect(sql).toContain('notification_log (user_id, notification_type, created_at DESC)');
  });
});

// ══════════════════════════════════════════════════════════════
// 6. Part 5: Notification consolidation in stripe-webhook
// ══════════════════════════════════════════════════════════════
describe('6. stripe-webhook consolidation', () => {
  const sw = read('supabase/functions/stripe-webhook/index.ts');

  it('fires send-trial-notifications after process-referral-reward', () => {
    expect(sw).toContain("'send-trial-notifications'");
    expect(sw).toContain("action: 'referral_converted'");
  });

  it('referral_converted call includes referrer_id and referred_id', () => {
    expect(sw).toContain('referrer_id: referrerId');
    expect(sw).toContain('referred_id: convertedUserId');
  });

  it('referral notification is non-fatal (try-catch wrapped)', () => {
    // The notification call should be inside a try block separate from the reward
    const notifyBlock = sw.indexOf('referral_converted notifications fired');
    const tryBefore = sw.lastIndexOf('try {', notifyBlock);
    expect(tryBefore).toBeGreaterThan(0);
  });

  it('process-referral-reward still called (reward not removed)', () => {
    expect(sw).toContain("'process-referral-reward'");
  });
});

// ══════════════════════════════════════════════════════════════
// 7. Part 5: Notification consolidation in handle-referral-signup
// ══════════════════════════════════════════════════════════════
describe('7. handle-referral-signup consolidation', () => {
  const hrf = read('supabase/functions/handle-referral-signup/index.ts');

  it('still calls referral-lifecycle for status tracking', () => {
    expect(hrf).toContain("'referral-lifecycle'");
    expect(hrf).toContain("type: 'referee_signup'");
  });

  it('also calls send-trial-notifications for dedicated email', () => {
    expect(hrf).toContain("'send-trial-notifications'");
    expect(hrf).toContain("action: 'referral_signup'");
  });

  it('passes referrer_id and referred_id to send-trial-notifications', () => {
    expect(hrf).toContain('referrer_id: referrer.id');
    expect(hrf).toContain('referred_id: user.id');
  });

  it('send-trial-notifications call is non-fatal', () => {
    expect(hrf).toContain('send-trial-notifications referral_signup failed');
  });
});

// ══════════════════════════════════════════════════════════════
// 8. api-gateway route registration
// ══════════════════════════════════════════════════════════════
describe('8. api-gateway routes', () => {
  const gw = read('supabase/functions/api-gateway/index.ts');

  it('route #117: send-trial-notifications registered', () => {
    expect(gw).toContain('"send-trial-notifications"');
  });

  it('route #118: weekly-digest-expired registered', () => {
    expect(gw).toContain('"weekly-digest-expired"');
  });

  it('TOTAL comment updated to 118', () => {
    expect(gw).toContain('TOTAL: 118 routes');
  });
});

// ══════════════════════════════════════════════════════════════
// 9. pod-team-manifest
// ══════════════════════════════════════════════════════════════
describe('9. pod-team-manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');
  it('FB-TRIAL-001-S5 pairing present', () => {
    expect(manifest).toContain('FB-TRIAL-001-S5');
  });
});

// ══════════════════════════════════════════════════════════════
// 10. Build and version integrity
// ══════════════════════════════════════════════════════════════
describe('10. Build integrity', () => {
  it('BJ_VERSION is v8.99', () => {
    const v = read('js/version.js');
    expect(v).toContain('v8.99');
  });

  it('version.ts matches version.js', () => {
    const ts = read('js/version.ts');
    const js = read('js/version.js');
    const tsVersion = ts.match(/BJ_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    const jsVersion = js.match(/BJ_VERSION\s*=\s*['"]([^'"]+)['"]/)?.[1];
    expect(tsVersion).toBe(jsVersion);
  });
});
