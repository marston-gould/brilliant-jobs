/**
 * CS-P1-017: Compliance Dashboard — PII Map + User Deletion + Data Export
 * Validates: 0.172 (PII map), 0.173 (user deletion), 0.174 (data export + compliance dash)
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

console.log('\n🧪 CS-P1-017: Compliance Dashboard — PII Map + Deletion + Export\n');

// ─── FILE EXISTENCE ───
console.log('── File Structure ──');

test('admin-compliance.js exists', () => {
  assert.ok(fileExists('js/admin-compliance.js'));
});

test('admin-compliance.js included in build-admin.js', () => {
  const build = readFile('build-admin.js');
  assert.ok(build.includes('admin-compliance.js'), 'Not in build pipeline');
});

test('admin-compliance.js included in built admin.min.js', () => {
  const dist = readFile('dist/admin.min.js');
  assert.ok(dist.includes('loadPiiMapPanel'), 'PII map function not in bundle');
  assert.ok(dist.includes('loadUserDeletionPanel'), 'Deletion function not in bundle');
  assert.ok(dist.includes('loadComplianceDashPanel'), 'Compliance dash function not in bundle');
});

// ─── ADMIN.JS INTEGRATION ───
console.log('── Admin.js Integration ──');

test('ADMIN_SUBPAGE_MAP contains pii-map', () => {
  const admin = readFile('js/admin.js');
  assert.ok(admin.includes("'pii-map'"), 'Missing pii-map subpage');
});

test('ADMIN_SUBPAGE_MAP contains user-deletion', () => {
  const admin = readFile('js/admin.js');
  assert.ok(admin.includes("'user-deletion'"), 'Missing user-deletion subpage');
});

test('ADMIN_SUBPAGE_MAP contains compliance-dash', () => {
  const admin = readFile('js/admin.js');
  assert.ok(admin.includes("'compliance-dash'"), 'Missing compliance-dash subpage');
});

test('ADMIN_SECTIONS includes compliance section', () => {
  const admin = readFile('js/admin.js');
  assert.ok(admin.includes("key: 'compliance'"), 'Missing compliance section');
});

test('Compliance subpages belong to compliance section', () => {
  const admin = readFile('js/admin.js');
  const piiLine = admin.match(/pii-map.*section:\s*'(\w+)'/);
  assert.ok(piiLine && piiLine[1] === 'compliance', 'pii-map not in compliance section');
  const delLine = admin.match(/user-deletion.*section:\s*'(\w+)'/);
  assert.ok(delLine && delLine[1] === 'compliance', 'user-deletion not in compliance section');
  const dashLine = admin.match(/compliance-dash.*section:\s*'(\w+)'/);
  assert.ok(dashLine && dashLine[1] === 'compliance', 'compliance-dash not in compliance section');
});

test('Cleanup for user-deletion panel registered', () => {
  const admin = readFile('js/admin.js');
  assert.ok(admin.includes('_cleanupUserDeletionPanel'), 'Missing cleanup registration');
});

// ─── ADMIN.HTML PANELS ───
console.log('── Admin.html Panels ──');

test('PII map panel exists in admin.html', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-panel-pii-map'), 'Missing pii-map panel');
});

test('User deletion panel exists in admin.html', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-panel-user-deletion'), 'Missing user-deletion panel');
});

test('Compliance dash panel exists in admin.html', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-panel-compliance-dash'), 'Missing compliance-dash panel');
});

test('PII map page container exists', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-page-pii-map'), 'Missing pii-map page container');
});

test('User deletion page container exists', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-page-user-deletion'), 'Missing user-deletion page container');
});

test('Compliance dash page container exists', () => {
  const html = readFile('admin.html');
  assert.ok(html.includes('admin-page-compliance-dash'), 'Missing compliance-dash page container');
});

// ─── 0.172: PII DATA MAP ───
console.log('── 0.172: PII Data Map ──');

test('PII_CATEGORIES covers all data types', () => {
  const src = readFile('js/admin-compliance.js');
  const required = ['identity', 'employment', 'financial', 'contact', 'behavioral', 'comms', 'engagement', 'audit'];
  required.forEach(cat => {
    assert.ok(src.includes("key: '" + cat + "'"), 'Missing category: ' + cat);
  });
});

test('PII_CATEGORIES includes critical PII tables', () => {
  const src = readFile('js/admin-compliance.js');
  const criticalTables = ['profiles', 'resumes', 'resume_rewrites', 'subscriptions', 'connections', 'audit_log', 'notification_log'];
  criticalTables.forEach(tbl => {
    assert.ok(src.includes("'" + tbl + "'"), 'Missing critical table: ' + tbl);
  });
});

test('Third-party flows include all PII processors', () => {
  const src = readFile('js/admin-compliance.js');
  const processors = ['Anthropic', 'PostHog', 'Stripe', 'Resend', 'Vonage', 'Supabase', 'Vercel', 'Cloudflare'];
  processors.forEach(p => {
    assert.ok(src.includes("service: '" + p + "'"), 'Missing processor: ' + p);
  });
});

test('PII map includes ON DELETE behavior mapping', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('TABLE_DELETE_BEHAVIOR'), 'Missing deletion behavior map');
  assert.ok(src.includes("'CASCADE'"), 'Missing CASCADE behavior');
  assert.ok(src.includes("'SET NULL'"), 'Missing SET NULL behavior');
  assert.ok(src.includes("'RETAINED'"), 'Missing RETAINED behavior');
});

test('PII map includes data retention summary', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('Data Retention Policy'), 'Missing retention section');
  assert.ok(src.includes('30-day grace'), 'Missing grace period reference');
});

test('PII map logs admin access', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("_logAdminAction('view_pii_map'"), 'PII map view not logged');
});

// ─── 0.173: USER DELETION CASCADE ───
console.log('── 0.173: User Deletion Cascade ──');

test('User search functionality exists', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_searchUserForDeletion'), 'Missing search function');
  assert.ok(src.includes('del-user-search'), 'Missing search input');
});

test('Initiate deletion with double-confirmation', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_initiateDeletion'), 'Missing initiation function');
  // Check for double confirm pattern
  assert.ok(src.includes('confirm('), 'Missing first confirmation');
  assert.ok(src.includes('prompt('), 'Missing second confirmation (email typed)');
});

test('Cancel deletion functionality', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_cancelDeletion'), 'Missing cancel function');
  assert.ok(src.includes("status: 'cancelled'"), 'Missing status update to cancelled');
});

test('Hard delete with DELETE confirmation', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_hardDeleteNow'), 'Missing hard delete function');
  assert.ok(src.includes("typed !== 'DELETE'"), 'Missing DELETE confirmation check');
});

test('Hard delete calls cascade RPC', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("'hard_delete_user_cascade'"), 'Missing cascade RPC call');
});

test('Hard delete cleans up storage', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("storage.from('resumes')"), 'Missing storage cleanup');
});

test('Hard delete removes auth user', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('auth.admin.deleteUser'), 'Missing auth user deletion');
});

test('Deletion blocks admin user deletion', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("role === 'admin'"), 'Missing admin protection');
  assert.ok(src.includes('Cannot delete admin'), 'Missing admin protection message');
});

test('Pending deletions list with grace period countdown', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('del-pending-container'), 'Missing pending container');
  assert.ok(src.includes('daysLeft'), 'Missing days left calculation');
  assert.ok(src.includes('Grace Expires'), 'Missing grace expires column');
});

test('Completed deletions list', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('del-completed-container'), 'Missing completed container');
  assert.ok(src.includes('tables_deleted'), 'Missing tables_deleted display');
});

test('Deletion actions audit-logged', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("'admin_initiated_deletion'"), 'Missing initiate audit log');
  assert.ok(src.includes("'admin_cancelled_deletion'"), 'Missing cancel audit log');
  assert.ok(src.includes("'admin_hard_deleted'"), 'Missing hard delete audit log');
});

test('PII access logged on user search', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes("'log_admin_pii_access'"), 'Missing PII access logging on search');
});

test('30-day grace period enforced', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('30 * 86400000'), 'Missing 30-day calculation');
});

// ─── 0.174: DATA EXPORT + COMPLIANCE DASHBOARD ───
console.log('── 0.174: Data Export + Compliance Dashboard ──');

test('Data export triggers download', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_triggerDataExport'), 'Missing export trigger');
  assert.ok(src.includes('URL.createObjectURL'), 'Missing blob download');
  assert.ok(src.includes('brilliant-jobs-export-'), 'Missing export filename');
});

test('Data export calls data-export EF', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('/functions/v1/data-export'), 'Missing data-export EF call');
});

test('Export resolves email to user ID', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('isUuid'), 'Missing UUID detection for export');
  assert.ok(src.includes('.ilike('), 'Missing email lookup for export');
});

test('Compliance stats cards exist', () => {
  const src = readFile('js/admin-compliance.js');
  const stats = ['comp-total-users', 'comp-pending-deletions', 'comp-completed-deletions', 'comp-exports-count', 'comp-pii-accesses'];
  stats.forEach(id => {
    assert.ok(src.includes(id), 'Missing stat card: ' + id);
  });
});

test('Stats load from database', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_loadComplianceStats'), 'Missing stats loader');
  assert.ok(src.includes("count: 'exact'"), 'Missing count queries');
});

test('PII access log displayed', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_loadPiiAccessLog'), 'Missing PII access log loader');
  assert.ok(src.includes('comp-pii-log-container'), 'Missing PII log container');
  assert.ok(src.includes('admin_pii_access_log'), 'Missing PII access log query');
});

test('Compliance audit trail displayed', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_loadComplianceAudit'), 'Missing audit loader');
  assert.ok(src.includes('comp-audit-container'), 'Missing audit container');
  assert.ok(src.includes('complianceActions'), 'Missing compliance action filter');
});

test('Compliance checklist exists', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_loadComplianceChecklist'), 'Missing checklist loader');
  assert.ok(src.includes('comp-checklist-container'), 'Missing checklist container');
});

test('Checklist covers all compliance requirements', () => {
  const src = readFile('js/admin-compliance.js');
  const requirements = ['PII Inventory', 'DPA Register', 'deletion flow', 'Data export', 'PII access logging', 'consent tracking', 'Audit trail', 'Privacy policy', 'Grace period', 'Cascade covers'];
  requirements.forEach(req => {
    assert.ok(src.includes(req), 'Missing checklist item: ' + req);
  });
});

test('Action badge colors for compliance events', () => {
  const src = readFile('js/admin-compliance.js');
  assert.ok(src.includes('_complianceActionBadge'), 'Missing badge function');
  const actions = ['account_deletion_requested', 'account_hard_deleted', 'data_export', 'view_pii_map'];
  actions.forEach(a => {
    assert.ok(src.includes("'" + a + "'"), 'Missing badge for action: ' + a);
  });
});

// ─── BACKEND INFRASTRUCTURE VERIFICATION ───
console.log('── Backend Infrastructure ──');

test('account-delete Edge Function exists', () => {
  assert.ok(fileExists('supabase/functions/account-delete/index.ts'));
});

test('data-export Edge Function exists', () => {
  assert.ok(fileExists('supabase/functions/data-export/index.ts'));
});

test('Compliance migration exists', () => {
  assert.ok(fileExists('migrations/cs-p1-014-compliance.sql'));
});

test('hard_delete_user_cascade in migration', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('hard_delete_user_cascade'), 'Missing cascade function');
});

test('deletion_requests table in migration', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('deletion_requests'), 'Missing deletion_requests table');
});

test('admin_pii_access_log table in migration', () => {
  const sql = readFile('migrations/cs-p1-014-compliance.sql');
  assert.ok(sql.includes('admin_pii_access_log'), 'Missing PII access log table');
});

test('PII inventory document exists', () => {
  assert.ok(fileExists('docs/compliance/pii-inventory.md'));
});

test('DPA register document exists', () => {
  assert.ok(fileExists('docs/compliance/dpa-register.md'));
});

// ─── VERSION & BUILD ───
console.log('── Version & Build ──');

test('Version bumped to v7.43', () => {
  const version = readFile('js/version.ts');
  assert.ok(version.includes("v7.43"), 'Version not bumped to v7.43');
});

test('Admin bundle rebuilt with compliance module', () => {
  const bundle = readFile('dist/admin.min.js');
  assert.ok(bundle.includes('PII_CATEGORIES'), 'PII categories not in bundle');
  assert.ok(bundle.includes('THIRD_PARTY_FLOWS'), 'Third party flows not in bundle');
  assert.ok(bundle.includes('_triggerDataExport'), 'Export not in bundle');
});

// ─── SUMMARY ───
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
console.log(`${'─'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
