// tests/cs-p1-012-email-sms-templates.test.js — CS-P1-012: Email/SMS Templates + Transactional CX
// Tests for TS1-3 (dark mode), TS1-4 (A/B framework), TS1-5 (SMS overflow), TS1-6 (modularization)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const SHARED_DIR = join(__dirname, '..', 'supabase', 'functions', '_shared');
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

// ============================================================
// TS1-6: Email Template Modularization
// ============================================================
describe('TS1-6: Email template modularization', () => {
  const MODULE_FILES = [
    'email-base.ts',
    'email-core.ts',
    'email-credits.ts',
    'email-onboarding.ts',
    'email-analytics.ts',
    'email-referral.ts',
    'email-billing.ts',
    'email-engagement.ts',
  ];

  it('all module files exist', () => {
    for (const f of MODULE_FILES) {
      expect(existsSync(join(SHARED_DIR, f)), `${f} should exist`).toBe(true);
    }
  });

  it('barrel re-export file exists and re-exports all modules', () => {
    const barrel = readFileSync(join(SHARED_DIR, 'email-templates.ts'), 'utf-8');
    for (const f of MODULE_FILES) {
      const importName = `./${f.replace('.ts', '')}`;
      // Check barrel imports from each module (either export * or named export)
      expect(barrel).toContain(importName);
    }
  });

  it('no single module exceeds 60KB (exit gate)', () => {
    for (const f of MODULE_FILES) {
      const size = statSync(join(SHARED_DIR, f)).size;
      expect(size, `${f} is ${(size/1024).toFixed(1)}KB — must be < 60KB`).toBeLessThan(60 * 1024);
    }
  });

  it('barrel file is significantly smaller than original monolith', () => {
    const barrelSize = statSync(join(SHARED_DIR, 'email-templates.ts')).size;
    // Barrel should be < 5KB (just re-exports)
    expect(barrelSize).toBeLessThan(5 * 1024);
  });

  it('email-base.ts exports both layout functions', () => {
    const base = readFileSync(join(SHARED_DIR, 'email-base.ts'), 'utf-8');
    expect(base).toContain('export function baseLayout');
    expect(base).toContain('export function whiteBaseLayout');
  });

  it('email-base.ts exports helper functions', () => {
    const base = readFileSync(join(SHARED_DIR, 'email-base.ts'), 'utf-8');
    expect(base).toContain('export function utmLink');
    expect(base).toContain('export function smsUtmLink');
    expect(base).toContain('export function detailRow');
    expect(base).toContain('export function salaryDisplay');
    expect(base).toContain('export const DASHBOARD_URL');
    expect(base).toContain('export const LOGO_TEXT');
  });

  it('each module imports from email-base.ts', () => {
    for (const f of MODULE_FILES) {
      if (f === 'email-base.ts') continue;
      const content = readFileSync(join(SHARED_DIR, f), 'utf-8');
      expect(content, `${f} should import from email-base.ts`).toContain('from "./email-base.ts"');
    }
  });

  it('existing edge function imports still reference email-templates.ts', () => {
    const sendNotif = readFileSync(
      join(__dirname, '..', 'supabase', 'functions', 'send-notification', 'index.ts'), 'utf-8'
    );
    expect(sendNotif).toContain('from "../_shared/email-templates.ts"');
  });
});

// ============================================================
// TS1-3: Dark-First Email (prefers-color-scheme on both layouts)
// ============================================================
describe('TS1-3: Dark-mode email templates', () => {
  const base = readFileSync(join(SHARED_DIR, 'email-base.ts'), 'utf-8');

  it('baseLayout includes prefers-color-scheme: light media query', () => {
    expect(base).toContain('prefers-color-scheme: light');
  });

  it('whiteBaseLayout includes prefers-color-scheme: dark media query', () => {
    expect(base).toContain('prefers-color-scheme: dark');
    // Verify it has the key dark-mode overrides
    expect(base).toContain('background:#0f1117');
    expect(base).toContain('color:#f0f1f3');
  });

  it('both layouts include color-scheme meta tag', () => {
    // The meta tag tells email clients about supported color schemes
    expect(base).toContain('name="color-scheme"');
    expect(base).toContain('name="supported-color-schemes"');
  });

  it('dark mode overrides cover key elements', () => {
    // Check that the dark mode media query covers essential elements
    const darkBlock = base.match(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n  \}/);
    expect(darkBlock).not.toBeNull();
    const block = darkBlock[0];
    expect(block).toContain('.card');
    expect(block).toContain('.card-title');
    expect(block).toContain('.text');
    expect(block).toContain('.footer');
    expect(block).toContain('.btn-gray');
    expect(block).toContain('.highlight');
  });
});

// ============================================================
// TS1-5: SMS Overflow Protection
// ============================================================
describe('TS1-5: SMS overflow protection', () => {
  const smsTemplates = readFileSync(join(SHARED_DIR, 'sms-templates.ts'), 'utf-8');
  const sendNotif = readFileSync(
    join(__dirname, '..', 'supabase', 'functions', 'send-notification', 'index.ts'), 'utf-8'
  );

  it('sms-templates.ts exports safeSms utility', () => {
    expect(smsTemplates).toContain('export function safeSms');
  });

  it('safeSms enforces 160-char limit', () => {
    // The function should check text.length <= 160
    expect(smsTemplates).toContain('SMS_MAX_CHARS');
    expect(smsTemplates).toContain('160');
  });

  it('all SMS template functions use safeSms wrapper', () => {
    // Each exported template should wrap its return in safeSms
    const templateFunctions = smsTemplates.match(/export function \w+Sms/g) || [];
    expect(templateFunctions.length).toBeGreaterThanOrEqual(4);
    
    // Count safeSms calls (should be at least 5: 1 for each template)
    const safeSmsUsage = (smsTemplates.match(/safeSms\(/g) || []).length;
    expect(safeSmsUsage).toBeGreaterThanOrEqual(5);
  });

  it('creditAlertSms uses compact phrasing to prevent overflow', () => {
    expect(smsTemplates).toContain('function creditAlertSms');
    // Should truncate plan name
    expect(smsTemplates).toContain('plan.length > 12');
  });

  it('send-notification imports safeSms for safety net', () => {
    expect(sendNotif).toContain('import { safeSms }');
    expect(sendNotif).toContain('from "../_shared/sms-templates.ts"');
  });

  it('sendSMS function applies safeSms as final guard', () => {
    // The sendSMS function should call safeSms on the text before sending
    expect(sendNotif).toContain('const safeText = safeSms(text)');
    expect(sendNotif).toContain('text: safeText');
  });
});

// ============================================================
// TS1-4: A/B Testing Framework for Drip Campaigns
// ============================================================
describe('TS1-4: A/B testing framework', () => {
  const sendNotif = readFileSync(
    join(__dirname, '..', 'supabase', 'functions', 'send-notification', 'index.ts'), 'utf-8'
  );

  it('migration file exists for ab_experiments schema', () => {
    expect(existsSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'))).toBe(true);
  });

  it('migration creates ab_experiments table', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ab_experiments');
    expect(sql).toContain('notification_type TEXT NOT NULL');
    expect(sql).toContain('variants JSONB');
    expect(sql).toContain('status TEXT');
  });

  it('migration creates ab_assignments table with sticky assignment', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ab_assignments');
    expect(sql).toContain('variant_id TEXT NOT NULL');
    expect(sql).toContain('email_sent BOOLEAN');
    expect(sql).toContain('email_opened BOOLEAN');
    expect(sql).toContain('converted BOOLEAN');
  });

  it('migration creates ab_results aggregation table', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS ab_results');
    expect(sql).toContain('open_rate');
    expect(sql).toContain('click_rate');
    expect(sql).toContain('conversion_rate');
  });

  it('migration sets up RLS policies', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('service_role');
    expect(sql).toContain('user_own_assignments');
  });

  it('migration seeds initial drip campaign experiments', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain('onboarding_welcome');
    expect(sql).toContain('re_engagement_14d');
    expect(sql).toContain('re_engagement_30d');
  });

  it('migration creates hourly aggregation cron', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, 'cs-p1-012-ab-experiments.sql'), 'utf-8');
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain("aggregate-ab-results");
  });

  it('send-notification has assignVariant function', () => {
    expect(sendNotif).toContain('async function assignVariant');
    // Should do weighted random selection
    expect(sendNotif).toContain('Math.random()');
    // Should check for existing sticky assignment
    expect(sendNotif).toContain('ab_assignments');
  });

  it('resolveTemplate accepts userId parameter for A/B', () => {
    // The function signature should include userId
    expect(sendNotif).toContain('resolveTemplate(\n  notificationType: string,\n  channel: string,\n  cohortId?: string,\n  userId?: string');
  });

  it('resolveTemplate checks for active experiments', () => {
    expect(sendNotif).toContain('.eq("status", "active")');
    expect(sendNotif).toContain('ab_experiments');
  });

  it('A/B variant tracked in notification_log payload', () => {
    expect(sendNotif).toContain('ab_experiment_id');
    expect(sendNotif).toContain('ab_variant_id');
  });

  it('NotificationRequest interface includes A/B fields', () => {
    expect(sendNotif).toContain('ab_experiment_id?: string');
    expect(sendNotif).toContain('ab_variant_id?: string');
  });

  it('successful email send marks ab_assignments as sent', () => {
    expect(sendNotif).toContain('.update({ email_sent: true })');
    expect(sendNotif).toContain('.eq("experiment_id", body.ab_experiment_id)');
  });
});
