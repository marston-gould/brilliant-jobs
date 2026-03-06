/**
 * CS-019: Extension Architecture — Privacy + PII + Cost Dashboard Tests
 * Validates FIX-18 (EXT-CWS-002, CP-001, CE-002)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

// ── Privacy Policy Tests (EXT-CWS-002) ──
describe('privacy.html — completeness', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(ROOT, 'privacy.html'), 'utf8');
  });

  it('exists and is non-empty', () => {
    expect(html.length).toBeGreaterThan(100);
  });

  it('has canonical URL', () => {
    expect(html).toContain('href="https://brilliantjobs.app/privacy"');
  });

  it('lists all third-party vendors that receive PII', () => {
    const requiredVendors = ['Supabase', 'Vercel', 'Stripe', 'Anthropic', 'Resend', 'Vonage', 'PostHog', 'Cloudflare'];
    for (const vendor of requiredVendors) {
      expect(html).toContain(vendor);
    }
  });

  it('mentions Data Processing Agreements', () => {
    expect(html).toMatch(/Data Processing Agreement/i);
  });

  it('covers all required legal sections', () => {
    const sections = [
      'Who We Are', 'Data We Collect', 'How We Use Your Data',
      'Third-Party Services', 'Data Retention', 'Data Security',
      'Your Rights', 'Cookies', 'Children', 'SMS'
    ];
    for (const s of sections) {
      expect(html).toContain(s);
    }
  });

  it('references cookie consent banner', () => {
    expect(html).toMatch(/consent banner/i);
  });

  it('covers CCPA and GDPR', () => {
    expect(html).toContain('CCPA');
    expect(html).toContain('GDPR');
  });

  it('includes contact email', () => {
    expect(html).toContain('support@brilliantjobs.app');
  });
});

// ── Extension Manifest Tests ──
describe('extension/manifest.json — privacy linkage', () => {
  let manifest;
  beforeEach(() => {
    manifest = JSON.parse(readFileSync(resolve(ROOT, 'extension', 'manifest.json'), 'utf8'));
  });

  it('has homepage_url pointing to privacy policy', () => {
    expect(manifest.homepage_url).toBe('https://brilliantjobs.app/privacy');
  });

  it('is manifest_version 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('has externally_connectable for brilliantjobs.app', () => {
    expect(manifest.externally_connectable).toBeDefined();
    expect(manifest.externally_connectable.matches).toContain('https://brilliantjobs.app/*');
  });
});

// ── Extension Popup Privacy Link Tests ──
describe('extension/popup.html — privacy link', () => {
  let html;
  beforeEach(() => {
    html = readFileSync(resolve(ROOT, 'extension', 'popup.html'), 'utf8');
  });

  it('has a link to the privacy policy', () => {
    expect(html).toContain('https://brilliantjobs.app/privacy');
  });

  it('privacy link has aria-label', () => {
    expect(html).toMatch(/aria-label="Privacy Policy"/);
  });
});

// ── PII Inventory Tests (CP-001) ──
describe('docs/PII_INVENTORY.md — completeness', () => {
  let content;
  beforeEach(() => {
    content = readFileSync(resolve(ROOT, 'docs', 'PII_INVENTORY.md'), 'utf8');
  });

  it('exists and is substantial', () => {
    expect(content.length).toBeGreaterThan(2000);
  });

  it('covers all high-sensitivity PII tables', () => {
    const tables = ['profiles', 'user_notification_state', 'subscriptions', 'resumes', 'connections', 'recruiter_contacts'];
    for (const t of tables) {
      expect(content).toContain(`\`${t}\``);
    }
  });

  it('covers medium-sensitivity activity tables', () => {
    const tables = ['pipeline', 'pending_applications', 'notification_log', 'feedback', 'credit_transactions'];
    for (const t of tables) {
      expect(content).toContain(`\`${t}\``);
    }
  });

  it('covers referral PII tables', () => {
    const tables = ['referrals', 'referral_invites', 'referral_requests'];
    for (const t of tables) {
      expect(content).toContain(`\`${t}\``);
    }
  });

  it('covers extension PII (chrome.storage)', () => {
    expect(content).toContain('authSession');
    expect(content).toContain('chrome.storage');
  });

  it('lists all third-party PII recipients', () => {
    const services = ['Anthropic', 'Stripe', 'Supabase', 'Resend', 'Vonage', 'PostHog', 'Vercel', 'Cloudflare'];
    for (const s of services) {
      expect(content).toContain(s);
    }
  });

  it('documents Edge Functions that process PII', () => {
    const funcs = ['score-resume', 'rewrite-resume', 'extract-resume-profile', 'send-notification', 'data-export', 'account-delete'];
    for (const f of funcs) {
      expect(content).toContain(`\`${f}\``);
    }
  });

  it('documents data subject rights (access, deletion, export)', () => {
    expect(content).toContain('Access');
    expect(content).toContain('Deletion');
    expect(content).toContain('Portability');
  });

  it('includes deletion cascade verification section', () => {
    expect(content).toContain('Deletion Cascade');
    expect(content).toContain('ON DELETE CASCADE');
  });

  it('specifies review schedule', () => {
    expect(content).toMatch(/[Qq]uarterly/);
  });
});

// ── Cost Dashboard Budget Alerts Tests (CE-002) ──
describe('js/admin-biz-ops.js — cost dashboard with budget alerts', () => {
  let code;
  beforeEach(() => {
    code = readFileSync(resolve(ROOT, 'js', 'admin-biz-ops.js'), 'utf8');
  });

  it('loads vendor_cost_budgets alongside cost data', () => {
    expect(code).toContain("vendor_cost_budgets");
  });

  it('renders budget alert progress bars', () => {
    expect(code).toContain('Budget Alerts');
    expect(code).toContain('costs-budget-alerts');
  });

  it('has budget edit form UI', () => {
    expect(code).toContain('costs-budget-edit-form');
    expect(code).toContain('Edit Budgets');
    expect(code).toContain('costs-budget-save');
  });

  it('computes budget percentage per vendor', () => {
    expect(code).toMatch(/spent\s*\/\s*budget/);
  });

  it('uses three-tier alert status (green/yellow/red)', () => {
    expect(code).toContain('#ef4444'); // red / over budget
    expect(code).toContain('#f59e0b'); // amber / near limit
    expect(code).toContain('#34d399'); // green / OK
  });

  it('has _saveBudgets function that upserts to vendor_cost_budgets', () => {
    expect(code).toContain('async function _saveBudgets');
    expect(code).toContain("vendor_cost_budgets");
    expect(code).toContain('upsert');
  });

  it('renders budget line on monthly chart', () => {
    expect(code).toContain('totalBudget');
    expect(code).toContain("name: 'Budget'");
  });
});

// ── Cost Budget Migration Tests ──
describe('migration — vendor_cost_budgets', () => {
  let sql;
  beforeEach(() => {
    sql = readFileSync(resolve(ROOT, 'supabase', 'migrations', '20260306_cs019_cost_budgets.sql'), 'utf8');
  });

  it('creates vendor_cost_budgets table', () => {
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('vendor_cost_budgets');
  });

  it('has vendor unique constraint', () => {
    expect(sql).toMatch(/vendor\s+TEXT\s+NOT\s+NULL\s+UNIQUE/);
  });

  it('has monthly_budget and alert_threshold_pct columns', () => {
    expect(sql).toContain('monthly_budget');
    expect(sql).toContain('alert_threshold_pct');
  });

  it('enables RLS', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
  });

  it('restricts to admin role', () => {
    expect(sql).toMatch(/role\s*=\s*'admin'/);
  });

  it('seeds default budgets for all known vendors', () => {
    const vendors = ['Anthropic', 'Supabase', 'Vercel', 'Cloudflare', 'Resend', 'Vonage', 'DataForSEO'];
    for (const v of vendors) {
      expect(sql).toContain(`'${v}'`);
    }
  });
});
