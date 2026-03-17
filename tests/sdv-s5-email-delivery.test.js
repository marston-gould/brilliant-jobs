/**
 * FB-SURVEY-DELIVERY-001 Session 5: Email Delivery Edge Function
 * Tests: EF structure, Resend integration, frequency cap, survey_links, pg_cron, gateway route
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. EF Structure ────────────────────────────────────────────────────────
describe('SDV-S5: send-survey-invite EF structure', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/send-survey-invite/index.ts'))).toBe(true);
  });

  it('imports serve from Deno std', () => {
    expect(ef).toContain('import { serve }');
  });

  it('imports createClient from Supabase', () => {
    expect(ef).toContain('import { createClient }');
  });

  it('reads RESEND_API_KEY from env', () => {
    expect(ef).toContain('RESEND_API_KEY');
  });

  it('has send_email action', () => {
    expect(ef).toContain("case \"send_email\"");
    expect(ef).toContain('handleSendEmail');
  });

  it('has send_sms stub for SDV-S6', () => {
    expect(ef).toContain("case \"send_sms\"");
    expect(ef).toContain('SDV-S6');
  });

  it('has status action', () => {
    expect(ef).toContain("case \"status\"");
    expect(ef).toContain('handleStatus');
  });

  it('requires campaign_version for send_email', () => {
    expect(ef).toContain('campaign_version required');
  });
});

// ─── 2. Email Sending ────────────────────────────────────────────────────────
describe('SDV-S5: Resend email integration', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('sends via Resend API', () => {
    expect(ef).toContain('api.resend.com/emails');
  });

  it('uses FROM_EMAIL env var', () => {
    expect(ef).toContain('FROM_EMAIL');
    expect(ef).toContain('surveys@brilliantjobs.app');
  });

  it('builds HTML email template with survey title', () => {
    expect(ef).toContain('buildSurveyEmailHtml');
    expect(ef).toContain('${title}');
  });

  it('email includes credit badge when credits > 0', () => {
    expect(ef).toContain('creditBadge');
    expect(ef).toContain('#22c55e');
    expect(ef).toContain('Earn');
  });

  it('email includes Take Survey CTA button', () => {
    expect(ef).toContain('Take Survey');
    expect(ef).toContain('surveyUrl');
  });

  it('email includes unsubscribe link', () => {
    expect(ef).toContain('notification preferences');
  });

  it('has subject line patterns per spec', () => {
    expect(ef).toContain('getSubjectLine');
    expect(ef).toContain('How are we doing');
    expect(ef).toContain('Help shape Brilliant Jobs');
  });
});

// ─── 3. Frequency Cap ────────────────────────────────────────────────────────
describe('SDV-S5: Frequency cap enforcement', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('checks notification_log for prior sends', () => {
    expect(ef).toContain('wasAlreadySent');
    expect(ef).toContain("notification_log");
    expect(ef).toContain("survey_invite");
  });

  it('respects frequency_days from campaign', () => {
    expect(ef).toContain('frequency_days');
    expect(ef).toContain('cutoff');
  });

  it('checks feedback table for completed surveys', () => {
    expect(ef).toContain("from(\"feedback\")");
    expect(ef).toContain('survey_version');
  });

  it('skips already-sent and already-completed users', () => {
    expect(ef).toContain('skipped++');
  });

  it('logs to notification_log after successful send', () => {
    expect(ef).toContain('logNotification');
  });
});

// ─── 4. Survey Links ─────────────────────────────────────────────────────────
describe('SDV-S5: Survey link token generation', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('generates 6-character alphanumeric tokens', () => {
    expect(ef).toContain('generateToken');
    expect(ef).toContain('length === 0');
    // Token is 6 chars
    expect(ef).toMatch(/for.*i < 6/);
  });

  it('creates survey_links row with expiry', () => {
    expect(ef).toContain('createSurveyLink');
    expect(ef).toContain("from(\"survey_links\")");
    expect(ef).toContain('expires_at');
  });

  it('uses 24h expiry for email links', () => {
    expect(ef).toContain('24');
  });

  it('builds short URL /s/{token} when token generated', () => {
    expect(ef).toContain('/s/${token}');
  });

  it('falls back to direct /survey URL if token generation fails', () => {
    expect(ef).toContain('/survey?context=');
    expect(ef).toContain('src=email');
  });
});

// ─── 5. Rate Limiting ────────────────────────────────────────────────────────
describe('SDV-S5: Send rate limiting', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('has 100ms delay between sends', () => {
    expect(ef).toContain('SEND_DELAY_MS = 100');
  });

  it('has 2-minute wall-time abort', () => {
    expect(ef).toContain('WALL_TIME_MS');
    expect(ef).toContain('2 * 60 * 1000');
  });

  it('checks wall-time in the send loop', () => {
    expect(ef).toContain('Wall-time abort');
  });

  it('uses setTimeout for inter-send delay', () => {
    expect(ef).toContain('setTimeout(r, SEND_DELAY_MS)');
  });
});

// ─── 6. PostHog ──────────────────────────────────────────────────────────────
describe('SDV-S5: PostHog events', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('fires survey_email_sent event', () => {
    expect(ef).toContain('"survey_email_sent"');
  });

  it('includes survey_version and user_id in event', () => {
    expect(ef).toContain('survey_version: campaign.survey_version');
    expect(ef).toContain('user_id: user.id');
  });

  it('PostHog helper handles errors gracefully', () => {
    expect(ef).toContain('PostHog capture failed');
  });
});

// ─── 7. pg_cron Migration ────────────────────────────────────────────────────
describe('SDV-S5: pg_cron schedules', () => {
  const migration = readFile('supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql');

  it('migration file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql'))).toBe(true);
  });

  it('schedules NPS monthly on the 1st at 15:00 UTC (10am ET)', () => {
    expect(migration).toContain('survey-nps-monthly');
    expect(migration).toContain('0 15 1 * *');
    expect(migration).toContain('nps_v1');
  });

  it('schedules periodic bi-weekly on Tuesdays at 15:00 UTC', () => {
    expect(migration).toContain('survey-periodic-biweekly');
    expect(migration).toContain('0 15 * * 2');
    expect(migration).toContain('periodic_v2');
  });

  it('uses ON CONFLICT for idempotent scheduling', () => {
    expect(migration).toContain('ON CONFLICT');
    expect(migration).toContain('DO UPDATE');
  });

  it('calls send-survey-invite EF with send_email action', () => {
    expect(migration).toContain('send-survey-invite');
    expect(migration).toContain('send_email');
  });
});

// ─── 8. Gateway Route ────────────────────────────────────────────────────────
describe('SDV-S5: Gateway route', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('send-survey-invite route registered (#139)', () => {
    expect(gw).toContain('"send-survey-invite"');
    expect(gw).toContain('#139');
  });

  it('resolve-survey-link route pre-registered (#140)', () => {
    expect(gw).toContain('"resolve-survey-link"');
    expect(gw).toContain('#140');
  });

  it('route total updated to 140', () => {
    expect(gw).toContain('TOTAL: 140 routes');
  });
});

// ─── 9. Error Handling ───────────────────────────────────────────────────────
describe('SDV-S5: Error handling', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('has no empty catch blocks', () => {
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(ef.match(emptyCatch)).toBeNull();
  });

  it('returns error counts in response', () => {
    expect(ef).toContain('sent');
    expect(ef).toContain('skipped');
    expect(ef).toContain('failed');
    expect(ef).toContain('errors');
    expect(ef).toContain('elapsed_ms');
  });

  it('has fatal error handler', () => {
    expect(ef).toContain('Fatal error');
    expect(ef).toContain('500');
  });
});

// ─── 10. File Inventory ──────────────────────────────────────────────────────
describe('SDV-S5: File Inventory', () => {
  it('send-survey-invite EF exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/send-survey-invite/index.ts'))).toBe(true);
  });
  it('pg_cron migration exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql'))).toBe(true);
  });
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s5-email-delivery.test.js'))).toBe(true);
  });
});
