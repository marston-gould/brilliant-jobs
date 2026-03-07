/**
 * CS-P1-014: Compliance — PII Inventory + DPAs + Data Rights
 * Validates: CP-001, CP-002, AD-CP-001, AD-CP-002, AD-CP-003
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  ✅ ${name}`); }
  catch (e) { failed++; console.log(`  ❌ ${name}: ${e.message}`); }
}

function readFile(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf-8'); }
function fileExists(f) { return fs.existsSync(path.join(__dirname, '..', f)); }

console.log('\n🧪 CS-P1-014: Compliance — PII Inventory + DPAs + Data Rights\n');

// ─── CP-001: PII Inventory ───
console.log('── CP-001: PII Inventory ──');

test('PII inventory document exists', () => {
  assert.ok(fileExists('docs/compliance/pii-inventory.md'));
});

test('PII inventory covers all 3 PII categories', () => {
  const doc = readFile('docs/compliance/pii-inventory.md');
  assert.ok(doc.includes('Direct User PII'), 'Missing Direct User PII section');
  assert.ok(doc.includes('Non-User Tables'), 'Missing Non-User Tables section');
  assert.ok(doc.includes('Supabase Auth'), 'Missing Supabase Auth section');
});

test('PII inventory documents all third-party flows', () => {
  const doc = readFile('docs/compliance/pii-inventory.md');
  for (const svc of ['Anthropic', 'PostHog', 'Stripe', 'Resend', 'Vonage']) {
    assert.ok(doc.includes(svc), `Missing third-party flow: ${svc}`);
  }
});

test('PII inventory documents Edge Functions sending PII to Anthropic', () => {
  const doc = readFile('docs/compliance/pii-inventory.md');
  for (const ef of ['score-resume', 'rewrite-resume', 'extract-resume-profile', 'generate-cover-letter']) {
    assert.ok(doc.includes(ef), `Missing EF: ${ef}`);
  }
});

test('PII inventory documents data retention periods', () => {
  const doc = readFile('docs/compliance/pii-inventory.md');
  assert.ok(doc.includes('Data Retention'), 'Missing retention section');
  assert.ok(doc.includes('30-day grace'), 'Missing grace period reference');
});

test('PII inventory documents right-to-erasure', () => {
  const doc = readFile('docs/compliance/pii-inventory.md');
  assert.ok(doc.includes('Right-to-Erasure') || doc.includes('right-to-erasure'), 'Missing erasure section');
});

// ─── CP-002: DPA Register ───
console.log('── CP-002: DPA Register ──');

test('DPA register document exists', () => {
  assert.ok(fileExists('docs/compliance/dpa-register.md'));
});

test('DPA register covers all PII-processing services', () => {
  const doc = readFile('docs/compliance/dpa-register.md');
  for (const svc of ['Anthropic', 'PostHog', 'Stripe', 'Resend', 'Vonage', 'Supabase', 'Vercel', 'Cloudflare']) {
    assert.ok(doc.includes(svc), `Missing DPA entry: ${svc}`);
  }
});

test('DPA register has priority actions', () => {
  const doc = readFile('docs/compliance/dpa-register.md');
  assert.ok(doc.includes('Priority Actions') || doc.includes('priority'), 'Missing priority actions');
});

test('DPA register documents Anthropic API data handling', () => {
  const doc = readFile('docs/compliance/dpa-register.md');
  assert.ok(doc.includes('zero-retention') || doc.includes('Zero-day retention'), 'Missing Anthropic retention details');
});

// ─── AD-CP-001: Admin PII Access ───
console.log('── AD-CP-001: Admin PII Access ──');

test('Admin PII access log table in migration', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('admin_pii_access_log'), 'Missing admin_pii_access_log table');
});

test('Admin PII access log has RLS', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('admin_pii_access_select'), 'Missing RLS policy');
  assert.ok(sql.includes('is_admin()'), 'RLS not restricted to admin');
});

test('Admin PII access logging RPC exists', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('log_admin_pii_access'), 'Missing admin PII access RPC');
});

// ─── AD-CP-002: User Deletion ───
console.log('── AD-CP-002: User Deletion ──');

test('Hard delete cascade function exists in migration', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('hard_delete_user_cascade'), 'Missing hard_delete_user_cascade function');
});

test('Deletion request tracking table exists', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('deletion_requests'), 'Missing deletion_requests table');
  assert.ok(sql.includes('grace_expires_at'), 'Missing grace period column');
});

test('Hard delete cascade covers all PII tables', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  const criticalTables = [
    'extension_heartbeats', 'extension_events', 'overlay_analytics',
    'ab_assignments', 'notification_log', 'notification_actions',
    'held_notifications', 'referral_badges', 'referral_rewards',
    'resumes', 'resume_rewrites', 'application_profiles',
    'pending_applications', 'pipeline', 'saved_filters',
    'recruiter_contacts', 'connections', 'push_subscriptions',
    'subscriptions', 'credit_transactions', 'profiles'
  ];
  for (const t of criticalTables) {
    assert.ok(sql.includes(t), `Missing cascade delete for: ${t}`);
  }
});

test('Audit log is anonymized but NOT deleted', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('audit_log is NOT deleted'), 'Missing audit_log retention note');
  assert.ok(sql.includes('UPDATE audit_log SET ip_address = NULL'), 'Missing audit_log anonymization');
});

test('Feedback is anonymized but NOT deleted', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes("UPDATE feedback SET"), 'Missing feedback anonymization');
});

test('Account-delete EF has soft-delete flow', () => {
  const ef = readFile('supabase/functions/account-delete/index.ts');
  assert.ok(ef.includes('deleted_at'), 'Missing soft-delete');
  assert.ok(ef.includes('grace_expires_at'), 'Missing grace period');
  assert.ok(ef.includes('deletion_requests'), 'Missing deletion_requests table');
});

test('Account-delete EF has cancel flow', () => {
  const ef = readFile('supabase/functions/account-delete/index.ts');
  assert.ok(ef.includes('cancel === true'), 'Missing cancel flow');
  assert.ok(ef.includes('cancelled'), 'Missing cancelled status');
});

test('Account-delete EF has hard-delete flow for admin', () => {
  const ef = readFile('supabase/functions/account-delete/index.ts');
  assert.ok(ef.includes('hard_delete === true'), 'Missing hard_delete flow');
  assert.ok(ef.includes('hard_delete_user_cascade'), 'Missing cascade call');
  assert.ok(ef.includes('admin.deleteUser'), 'Missing auth user deletion');
});

test('Account-delete EF cleans up storage', () => {
  const ef = readFile('supabase/functions/account-delete/index.ts');
  assert.ok(ef.includes("storage.from"), 'Missing storage cleanup');
  assert.ok(ef.includes('resumes'), 'Missing resume storage cleanup');
});

test('Account-delete EF signs out all sessions', () => {
  const ef = readFile('supabase/functions/account-delete/index.ts');
  assert.ok(ef.includes('signOut'), 'Missing session signout');
});

// ─── AD-CP-003: Data Export ───
console.log('── AD-CP-003: Data Export ──');

test('Data export EF covers all PII tables', () => {
  const ef = readFile('supabase/functions/data-export/index.ts');
  const criticalTables = [
    'profiles', 'connections', 'resumes', 'resume_rewrites',
    'application_profiles', 'pending_applications', 'pipeline',
    'saved_filters', 'subscriptions', 'notification_log',
    'feedback', 'recruiter_contacts', 'referrals',
    'extension_heartbeats', 'audit_log'
  ];
  for (const t of criticalTables) {
    assert.ok(ef.includes(t), `Missing export table: ${t}`);
  }
});

test('Data export includes auth user metadata', () => {
  const ef = readFile('supabase/functions/data-export/index.ts');
  assert.ok(ef.includes('auth_user'), 'Missing auth_user in export');
  assert.ok(ef.includes('user_metadata'), 'Missing user_metadata');
});

test('Data export is rate limited', () => {
  const ef = readFile('supabase/functions/data-export/index.ts');
  assert.ok(ef.includes('check_ef_rate_limit'), 'Missing rate limit');
});

test('Data export version is 2.0', () => {
  const ef = readFile('supabase/functions/data-export/index.ts');
  assert.ok(ef.includes('"2.0"'), 'Version should be 2.0');
});

// ─── Dashboard UI ───
console.log('── Dashboard UI ──');

test('Dashboard has danger zone card', () => {
  const html = readFile('dashboard.html');
  assert.ok(html.includes('danger-zone-card'), 'Missing danger zone card');
  assert.ok(html.includes('st-delete-account'), 'Missing delete account button');
  assert.ok(html.includes('st-cancel-delete'), 'Missing cancel delete button');
});

test('Dashboard has full data export button', () => {
  const html = readFile('dashboard.html');
  assert.ok(html.includes('st-full-export'), 'Missing full export button');
});

test('Dashboard has privacy & data card', () => {
  const html = readFile('dashboard.html');
  assert.ok(html.includes('privacy-card'), 'Missing privacy card');
});

test('Settings JS has full export handler', () => {
  const js = readFile('js/settings.js');
  assert.ok(js.includes('st-full-export'), 'Missing full export handler');
  assert.ok(js.includes('data-export'), 'Missing data-export EF call');
});

test('Settings JS has delete account handler', () => {
  const js = readFile('js/settings.js');
  assert.ok(js.includes('st-delete-account'), 'Missing delete handler');
  assert.ok(js.includes('account-delete'), 'Missing account-delete EF call');
});

test('Settings JS has cancel delete handler', () => {
  const js = readFile('js/settings.js');
  assert.ok(js.includes('st-cancel-delete'), 'Missing cancel handler');
  assert.ok(js.includes('cancel: true'), 'Missing cancel payload');
});

test('Settings JS has deletion status check', () => {
  const js = readFile('js/settings.js');
  assert.ok(js.includes('_checkDeletionStatus'), 'Missing deletion status check');
});

test('Delete account requires double confirmation', () => {
  const js = readFile('js/settings.js');
  assert.ok(js.includes('confirm('), 'Missing first confirmation');
  assert.ok(js.includes("prompt(") || js.includes('prompt('), 'Missing double confirmation');
  assert.ok(js.includes("'DELETE'") || js.includes('"DELETE"'), 'Missing DELETE confirmation text');
});

// ─── Privacy Consent ───
console.log('── Privacy Infrastructure ──');

test('Privacy consent tracking table exists', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('privacy_consent'), 'Missing privacy_consent table');
  assert.ok(sql.includes('policy_version'), 'Missing policy_version column');
});

test('Cron job for expired deletions exists', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('process-expired-deletions'), 'Missing deletion cron job');
});

// ─── Summary ───
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
process.exit(failed > 0 ? 1 : 0);
