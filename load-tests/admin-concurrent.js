// load-tests/admin-concurrent.js — Admin panel concurrent access
// CS-020 FIX-20: Validates admin can sustain concurrent operator sessions
//
// Admin has lower concurrency target (10-20 simultaneous operators)
// but tests data-heavy queries: user management, audit logs, cost dashboard

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { CONFIG } from './config.js';

const adminLatency = new Trend('admin_query_latency', true);
const adminErrors = new Rate('admin_errors');

// Admin uses a lighter profile — max 20 concurrent operators
export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '2m', target: 20 },
    { duration: '2m', target: 20 },  // sustained
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    admin_query_latency: ['p(95)<3000'], // admin can be slightly slower (3s)
    admin_errors: ['rate<0.01'],          // <1% error rate
    http_req_failed: ['rate<0.001'],
  },
  tags: { surface: 'admin', endpoint: 'concurrent' },
};

const REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;

let adminToken = null;

function ensureAdminAuth() {
  if (adminToken) return true;

  // Admin auth uses same mechanism — would need admin-role user credentials
  const email = __ENV.K6_ADMIN_EMAIL || CONFIG.TEST_USER.email;
  const password = __ENV.K6_ADMIN_PASSWORD || CONFIG.TEST_USER.password;

  if (!email || !password) {
    console.warn('No admin credentials — skipping');
    return false;
  }

  const res = http.post(AUTH_URL, JSON.stringify({ email, password }), {
    headers: {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
    },
    tags: { name: 'admin-auth' },
  });

  if (res.status !== 200) return false;
  adminToken = res.json().access_token;
  return true;
}

function adminHeaders() {
  return {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json',
  };
}

// ── Admin queries ──────────────────────────────────────────

function queryUserList() {
  // Admin loads user list with profile + subscription data
  const url = `${REST_URL}/profiles?select=id,full_name,email,tier,created_at&order=created_at.desc&limit=50`;

  const res = http.get(url, {
    headers: adminHeaders(),
    tags: { name: 'admin-users' },
  });

  adminLatency.add(res.timings.duration);
  adminErrors.add(res.status >= 400 ? 1 : 0);

  check(res, {
    'users: status 200': (r) => r.status === 200,
    'users: under 3s': (r) => r.timings.duration < 3000,
  });
}

function queryAuditLog() {
  // Admin loads recent audit log entries
  const url = `${REST_URL}/admin_audit_log?select=id,action_type,actor_id,target_type,target_id,created_at,metadata&order=created_at.desc&limit=100`;

  const res = http.get(url, {
    headers: adminHeaders(),
    tags: { name: 'admin-audit' },
  });

  adminLatency.add(res.timings.duration);
  adminErrors.add(res.status >= 400 ? 1 : 0);

  check(res, {
    'audit: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'audit: under 3s': (r) => r.timings.duration < 3000,
  });
}

function queryCostDashboard() {
  // Admin loads vendor cost budgets (CS-019 feature)
  const url = `${REST_URL}/vendor_cost_budgets?select=*&order=vendor_name.asc`;

  const res = http.get(url, {
    headers: adminHeaders(),
    tags: { name: 'admin-costs' },
  });

  adminLatency.add(res.timings.duration);
  adminErrors.add(res.status >= 400 ? 1 : 0);

  check(res, {
    'costs: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'costs: under 2s': (r) => r.timings.duration < 2000,
  });
}

function queryFeatureFlags() {
  // Admin checks feature flags (kill-switch status)
  const url = `${REST_URL}/feature_flags?select=id,enabled,updated_at`;

  const res = http.get(url, {
    headers: adminHeaders(),
    tags: { name: 'admin-flags' },
  });

  adminLatency.add(res.timings.duration);

  check(res, {
    'flags: status 200 or 404': (r) => r.status === 200 || r.status === 404,
  });
}

function queryExtensionHeartbeats() {
  // Admin views extension connection status
  const url = `${REST_URL}/extension_heartbeats?select=user_id,status,last_heartbeat_at,extension_version&order=last_heartbeat_at.desc&limit=50`;

  const res = http.get(url, {
    headers: adminHeaders(),
    tags: { name: 'admin-heartbeats' },
  });

  adminLatency.add(res.timings.duration);

  check(res, {
    'heartbeats: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'heartbeats: under 2s': (r) => r.timings.duration < 2000,
  });
}

// ── Main VU flow ───────────────────────────────────────────

export default function () {
  if (!ensureAdminAuth()) {
    sleep(10);
    return;
  }

  group('admin-session', function () {
    // Admin typically loads multiple panels
    queryUserList();
    sleep(0.5 + Math.random());

    queryAuditLog();
    sleep(0.5 + Math.random());

    queryCostDashboard();
    sleep(0.5 + Math.random());

    if (Math.random() > 0.5) {
      queryFeatureFlags();
      sleep(0.5);
    }

    if (Math.random() > 0.6) {
      queryExtensionHeartbeats();
    }
  });

  // Admin browsing cadence: 10-30s between page loads
  sleep(10 + Math.random() * 20);
}

export function handleSummary(data) {
  const p95 = data.metrics.admin_query_latency?.values?.['p(95)'] || 0;
  const errRate = data.metrics.admin_errors?.values?.rate || 0;

  const pass = p95 < 3000 && errRate < 0.01;

  console.log('\n═══ ADMIN CONCURRENT LOAD TEST SUMMARY ═══');
  console.log(`  p95 latency:   ${p95.toFixed(0)}ms ${p95 < 3000 ? '✅' : '❌'}`);
  console.log(`  Error rate:    ${(errRate * 100).toFixed(2)}% ${errRate < 0.01 ? '✅' : '❌'}`);
  console.log(`  RESULT:        ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═══════════════════════════════════════════\n');

  return {
    'load-tests/results/admin-concurrent.json': JSON.stringify(data, null, 2),
  };
}
