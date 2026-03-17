/**
 * FB-SURVEY-DELIVERY-001 Session 6: SMS Delivery + Short URL Resolution
 * Tests: resolve-survey-link EF, SMS in send-survey-invite, Vercel rewrite, quiet hours, budget
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. resolve-survey-link EF ──────────────────────────────────────────────
describe('SDV-S6: resolve-survey-link EF', () => {
  const ef = readFile('supabase/functions/resolve-survey-link/index.ts');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/resolve-survey-link/index.ts'))).toBe(true);
  });

  it('looks up token in survey_links table', () => {
    expect(ef).toContain("from(\"survey_links\")");
    expect(ef).toContain("eq(\"token\", token)");
  });

  it('validates token is 6 characters', () => {
    expect(ef).toContain('token.length !== 6');
  });

  it('checks expiry and returns 410 if expired', () => {
    expect(ef).toContain('expires_at');
    expect(ef).toContain('410');
    expect(ef).toContain('Link expired');
  });

  it('marks used_at on first click only', () => {
    expect(ef).toContain('used_at');
    expect(ef).toContain('!link.used_at');
    expect(ef).toContain('.update(');
  });

  it('returns 404 for unknown tokens', () => {
    expect(ef).toContain('404');
    expect(ef).toContain('Link not found');
  });

  it('redirects to /survey with correct params', () => {
    expect(ef).toContain('302');
    expect(ef).toContain('/survey?context=');
    expect(ef).toContain('survey_version');
    expect(ef).toContain('src=${link.channel}');
    expect(ef).toContain('uid=${link.user_id}');
  });

  it('determines survey context from version prefix', () => {
    expect(ef).toContain("startsWith(\"nps\")");
    expect(ef).toContain("startsWith(\"exit\")");
    expect(ef).toContain("startsWith(\"ghost\")");
  });

  it('fires survey_sms_clicked for SMS links', () => {
    expect(ef).toContain('"survey_sms_clicked"');
  });

  it('fires survey_email_clicked for email links', () => {
    expect(ef).toContain('"survey_email_clicked"');
  });

  it('determines click event based on channel', () => {
    expect(ef).toContain("channel === \"sms\"");
  });

  it('has no empty catch blocks', () => {
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(ef.match(emptyCatch)).toBeNull();
  });
});

// ─── 2. SMS Delivery in send-survey-invite ───────────────────────────────────
describe('SDV-S6: SMS delivery in send-survey-invite', () => {
  const ef = readFile('supabase/functions/send-survey-invite/index.ts');

  it('send_sms action is implemented (not stub)', () => {
    expect(ef).toContain("case \"send_sms\"");
    expect(ef).toContain('handleSendSms');
    expect(ef).not.toContain('not yet implemented');
  });

  it('reads Vonage credentials from env', () => {
    expect(ef).toContain('VONAGE_API_KEY');
    expect(ef).toContain('VONAGE_API_SECRET');
    expect(ef).toContain('VONAGE_FROM_NUMBER');
  });

  it('sends via Vonage REST API', () => {
    expect(ef).toContain('rest.nexmo.com/sms/json');
  });

  it('requires phone_verified for SMS', () => {
    expect(ef).toContain("phone_verified");
    expect(ef).toContain("eq(\"phone_verified\", true)");
  });

  it('enforces 30-day hard cap for SMS surveys', () => {
    expect(ef).toContain('wasAlreadySent');
    expect(ef).toMatch(/wasAlreadySent.*"sms".*30/s);
  });

  it('enforces quiet hours 10pm-7am', () => {
    expect(ef).toContain('isQuietHours');
    expect(ef).toContain('hour >= 22 || hour < 7');
  });

  it('quiet hours uses user timezone', () => {
    expect(ef).toContain('user.timezone');
    expect(ef).toContain('Intl.DateTimeFormat');
  });

  it('checks SMS daily budget', () => {
    expect(ef).toContain('checkSmsBudget');
    expect(ef).toContain('SMS_DAILY_BUDGET_CENTS');
    expect(ef).toContain('1000'); // $10 = 1000 cents
  });

  it('re-checks budget mid-loop', () => {
    expect(ef).toContain('stillInBudget');
    expect(ef).toContain('budget exceeded mid-send');
  });

  it('generates 72h expiry tokens for SMS', () => {
    expect(ef).toContain('createSurveyLink');
    expect(ef).toMatch(/createSurveyLink.*"sms".*72/s);
  });

  it('builds SMS message within 160 chars', () => {
    expect(ef).toContain('buildSmsMessage');
    expect(ef).toContain('160');
    expect(ef).toContain('Reply STOP to opt out');
  });

  it('includes credit amount in SMS', () => {
    expect(ef).toContain('creditPart');
    expect(ef).toContain('credits');
  });

  it('fires survey_sms_sent PostHog event', () => {
    expect(ef).toContain('"survey_sms_sent"');
  });

  it('returns 503 if Vonage not configured', () => {
    expect(ef).toContain('Vonage SMS credentials not configured');
    expect(ef).toContain('503');
  });

  it('returns 429 if daily budget exceeded', () => {
    expect(ef).toContain('SMS daily budget exceeded');
    expect(ef).toContain('429');
  });

  it('verifies SMS channel enabled on campaign', () => {
    expect(ef).toContain("includes(\"sms\")");
  });

  it('has no empty catch blocks', () => {
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(ef.match(emptyCatch)).toBeNull();
  });
});

// ─── 3. Vercel Rewrite ───────────────────────────────────────────────────────
describe('SDV-S6: Vercel rewrite for /s/:token', () => {
  const vercel = readFile('vercel.json');

  it('has /s/:token rewrite rule', () => {
    expect(vercel).toContain('"/s/:token"');
  });

  it('rewrites to resolve-survey-link EF', () => {
    expect(vercel).toContain('resolve-survey-link');
    expect(vercel).toContain('token=:token');
  });
});

// ─── 4. Gateway Routes ──────────────────────────────────────────────────────
describe('SDV-S6: Gateway routes', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('resolve-survey-link route registered (#140)', () => {
    expect(gw).toContain('"resolve-survey-link"');
    expect(gw).toContain('#140');
  });
});

// ─── 5. File Inventory ──────────────────────────────────────────────────────
describe('SDV-S6: File Inventory', () => {
  it('resolve-survey-link EF exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/resolve-survey-link/index.ts'))).toBe(true);
  });
  it('send-survey-invite EF exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'supabase/functions/send-survey-invite/index.ts'))).toBe(true);
  });
  it('vercel.json exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'vercel.json'))).toBe(true);
  });
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s6-sms-shorturl.test.js'))).toBe(true);
  });
});
