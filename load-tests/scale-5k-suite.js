// load-tests/scale-5k-suite.js — SA-023b: 5,000 Concurrent Scale Test
// Routes ALL traffic through the API gateway (SA-005 architecture)
// Tests: read replica routing (SA-018), partitioned queries (SA-019),
//        feature flags under load (SA-025), capacity model (SA-028)
//
// Exit gates:
//   ✅ Zero 5xx errors (hard gate — any 5xx = FAIL)
//   ✅ Search p95 < 500ms (preview-jobs + chat-job-search)
//   ✅ Dashboard API p95 < 1500ms
//   ✅ Heartbeat p95 < 1000ms
//   ✅ Admin p95 < 2000ms
//   ✅ Gateway p95 < 2000ms (overall)
//
// Distribution (5,000 VUs):
//   Landing search:     40% = 2,000 VUs
//   Dashboard API:      30% = 1,500 VUs
//   Extension heartbeat: 20% = 1,000 VUs
//   Admin + capacity:    10% =   500 VUs
//
// Run:
//   K6_TEST_EMAIL=test@brilliantjobs.app K6_TEST_PASSWORD=... \
//     k6 run load-tests/scale-5k-suite.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { CONFIG, randomItem } from './config.js';

// ── Custom metrics ───────────────────────────────────────────
const searchLatency     = new Trend('search_latency', true);
const dashboardLatency  = new Trend('dashboard_latency', true);
const heartbeatLatency  = new Trend('heartbeat_latency', true);
const adminLatency      = new Trend('admin_latency', true);
const gatewayLatency    = new Trend('gateway_latency', true);
const replicaRoutedReqs = new Counter('replica_routed_requests');
const fiveXXErrors      = new Counter('five_xx_errors');
const overallErrors     = new Rate('overall_errors');

// ── Ramp stages ──────────────────────────────────────────────
// Each scenario ramps proportionally to its % of 5,000

function makeStages(peakVUs) {
  return [
    { duration: '2m',  target: Math.round(peakVUs * 0.1) },   // warm-up
    { duration: '3m',  target: Math.round(peakVUs * 0.3) },
    { duration: '3m',  target: Math.round(peakVUs * 0.6) },
    { duration: '3m',  target: peakVUs },                      // reach peak
    { duration: '10m', target: peakVUs },                      // sustained peak
    { duration: '3m',  target: 0 },                            // cool-down
  ];
}

export const options = {
  scenarios: {
    search: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: makeStages(2000),
      exec: 'searchScenario',
      tags: { surface: 'landing' },
    },
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: makeStages(1500),
      exec: 'dashboardScenario',
      tags: { surface: 'dashboard' },
    },
    extension: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: makeStages(1000),
      exec: 'extensionScenario',
      tags: { surface: 'extension' },
    },
    admin: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: makeStages(500),
      exec: 'adminScenario',
      tags: { surface: 'admin' },
    },
  },

  thresholds: {
    // ── SA-023b hard gates ──
    'http_req_failed':     ['rate<0.001'],          // overall error rate < 0.1%
    'five_xx_errors':      ['count==0'],            // ZERO 5xx (hard gate)
    'search_latency':      ['p(95)<500'],           // p95 search < 500ms
    'dashboard_latency':   ['p(95)<1500'],          // p95 dashboard < 1500ms
    'heartbeat_latency':   ['p(95)<1000'],          // p95 heartbeat < 1s
    'admin_latency':       ['p(95)<2000'],          // p95 admin < 2s
    'gateway_latency':     ['p(95)<2000'],          // p95 overall < 2s
    'overall_errors':      ['rate<0.001'],
  },
};

const GW = CONFIG.GATEWAY_URL;
const REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;

// ── Shared auth ──────────────────────────────────────────────
// Per-VU token cache to avoid re-authing every iteration
const tokenCache = {};

function getToken() {
  if (!CONFIG.TEST_USER.email) return null;
  if (tokenCache[__VU]) return tokenCache[__VU];

  const res = http.post(AUTH_URL, JSON.stringify({
    email: CONFIG.TEST_USER.email,
    password: CONFIG.TEST_USER.password,
  }), {
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
    tags: { name: 'auth' },
  });

  if (res.status === 200) {
    tokenCache[__VU] = res.json().access_token;
    return tokenCache[__VU];
  }
  return null;
}

function record(res, latencyTrend) {
  latencyTrend.add(res.timings.duration);
  gatewayLatency.add(res.timings.duration);
  overallErrors.add(res.status >= 400 ? 1 : 0);

  if (res.status >= 500) {
    fiveXXErrors.add(1);
  }

  // Track read-replica routing (SA-018 header)
  if (res.headers && res.headers['X-Gateway-Db-Mode'] === 'read') {
    replicaRoutedReqs.add(1);
  }
}

// ═════════════════════════════════════════════════════════════
// SCENARIO 1: SEARCH (Landing — preview-jobs through gateway)
// 40% of traffic = 2,000 VUs
// EXIT GATE: p95 < 500ms
// ═════════════════════════════════════════════════════════════

export function searchScenario() {
  const payload = JSON.stringify({
    route: 'preview-jobs',
    keyword: randomItem(CONFIG.KEYWORDS),
    location: randomItem(CONFIG.LOCATIONS),
    remote: Math.random() > 0.7,
    session_token: `scale5k-${__VU}-${Date.now()}`,
  });

  const res = http.post(GW, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Origin': CONFIG.LANDING_URL,
    },
    tags: { name: 'gateway-preview-jobs' },
  });

  record(res, searchLatency);

  check(res, {
    'search 2xx': (r) => r.status >= 200 && r.status < 300,
    'search no 5xx': (r) => r.status < 500,
    'search p95 target': (r) => r.timings.duration < 500,
  });

  // Real user pacing: 3–8s between searches
  sleep(3 + Math.random() * 5);
}

// ═════════════════════════════════════════════════════════════
// SCENARIO 2: DASHBOARD (Authenticated REST + gateway routes)
// 30% of traffic = 1,500 VUs
// EXIT GATE: p95 < 1500ms
// ═════════════════════════════════════════════════════════════

export function dashboardScenario() {
  const token = getToken();
  if (!token) { sleep(5); return; }

  const h = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('dashboard-5k', () => {
    // Job feed — hits partitioned ats_jobs (SA-019)
    const feed = http.get(
      `${REST_URL}/ats_jobs?select=id,title,company_name,salary_min,salary_max,location,ats_source&status=neq.closed&order=posted_at.desc&limit=25`,
      { headers: h, tags: { name: 'feed-partitioned' } }
    );
    record(feed, dashboardLatency);
    check(feed, { 'feed 2xx': (r) => r.status >= 200 && r.status < 300 });

    sleep(0.5 + Math.random());

    // Application pipeline
    const pipe = http.get(
      `${REST_URL}/applications?select=id,job_title,company_name,status,applied_at&order=applied_at.desc&limit=50`,
      { headers: h, tags: { name: 'pipeline' } }
    );
    record(pipe, dashboardLatency);
    check(pipe, { 'pipeline 2xx': (r) => r.status >= 200 && r.status < 300 });

    sleep(0.5 + Math.random());

    // Chat search through gateway (read-replica-routed, SA-018)
    const chatSearch = http.post(GW, JSON.stringify({
      route: 'chat-job-search',
      query: randomItem(CONFIG.KEYWORDS),
      filters: { location: randomItem(CONFIG.LOCATIONS) },
    }), {
      headers: h,
      tags: { name: 'gateway-chat-search' },
    });
    record(chatSearch, searchLatency);  // counts toward search p95
    check(chatSearch, {
      'chat-search 2xx': (r) => r.status >= 200 && r.status < 300,
      'chat-search no 5xx': (r) => r.status < 500,
    });
  });

  sleep(5 + Math.random() * 10);
}

// ═════════════════════════════════════════════════════════════
// SCENARIO 3: EXTENSION (Heartbeat through gateway)
// 20% of traffic = 1,000 VUs
// EXIT GATE: p95 < 1000ms
// ═════════════════════════════════════════════════════════════

export function extensionScenario() {
  const token = getToken();
  if (!token) { sleep(10); return; }

  const res = http.post(GW, JSON.stringify({
    route: 'extension-heartbeat',
    extension_id: `scale5k-ext-${__VU}`,
    extension_version: '3.0.0',
  }), {
    headers: {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`,
    },
    tags: { name: 'gateway-heartbeat' },
  });

  record(res, heartbeatLatency);

  check(res, {
    'heartbeat 2xx': (r) => r.status >= 200 && r.status < 300,
    'heartbeat no 5xx': (r) => r.status < 500,
  });

  sleep(5 + Math.random() * 10);
}

// ═════════════════════════════════════════════════════════════
// SCENARIO 4: ADMIN (REST + capacity model + health check)
// 10% of traffic = 500 VUs
// EXIT GATE: p95 < 2000ms
// ═════════════════════════════════════════════════════════════

export function adminScenario() {
  const token = getToken();
  if (!token) { sleep(15); return; }

  const h = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('admin-5k', () => {
    // User list
    const users = http.get(
      `${REST_URL}/profiles?select=id,full_name,email,tier&order=created_at.desc&limit=50`,
      { headers: h, tags: { name: 'admin-users' } }
    );
    record(users, adminLatency);

    sleep(1);

    // Cost budgets
    const costs = http.get(
      `${REST_URL}/vendor_cost_budgets?select=*`,
      { headers: h, tags: { name: 'admin-costs' } }
    );
    record(costs, adminLatency);

    sleep(1);

    // Capacity summary through gateway (SA-028)
    const capacity = http.post(GW, JSON.stringify({
      route: 'capacity-model',
      action: 'summary',
    }), {
      headers: h,
      tags: { name: 'gateway-capacity' },
    });
    record(capacity, adminLatency);
    check(capacity, {
      'capacity 2xx': (r) => r.status >= 200 && r.status < 300,
    });

    sleep(1);

    // Health check through gateway (read-replica-routed)
    const health = http.post(GW, JSON.stringify({
      route: 'health-check',
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'gateway-health' },
    });
    record(health, adminLatency);
  });

  sleep(10 + Math.random() * 20);
}

// ═════════════════════════════════════════════════════════════
// SUMMARY — pass/fail report
// ═════════════════════════════════════════════════════════════

export function handleSummary(data) {
  const m = (name) => data.metrics[name]?.values?.['p(95)'] || 0;
  const c = (name) => data.metrics[name]?.values?.count || 0;
  const r = (name) => data.metrics[name]?.values?.rate || 0;
  const p50 = (name) => data.metrics[name]?.values?.['p(50)'] || 0;
  const p99 = (name) => data.metrics[name]?.values?.['p(99)'] || 0;
  const totalReqs = data.metrics.http_reqs?.values?.count || 0;

  const results = {
    search_p50:     p50('search_latency'),
    search_p95:     m('search_latency'),
    search_p99:     p99('search_latency'),
    dashboard_p95:  m('dashboard_latency'),
    heartbeat_p95:  m('heartbeat_latency'),
    admin_p95:      m('admin_latency'),
    gateway_p95:    m('gateway_latency'),
    five_xx_count:  c('five_xx_errors'),
    error_rate:     r('overall_errors'),
    total_requests: totalReqs,
    replica_routed: c('replica_routed_requests'),
  };

  const gates = {
    search_p95:    results.search_p95 < 500,
    dashboard_p95: results.dashboard_p95 < 1500,
    heartbeat_p95: results.heartbeat_p95 < 1000,
    admin_p95:     results.admin_p95 < 2000,
    gateway_p95:   results.gateway_p95 < 2000,
    zero_5xx:      results.five_xx_count === 0,
    error_rate:    results.error_rate < 0.001,
  };

  const allPass = Object.values(gates).every(Boolean);
  const passCount = Object.values(gates).filter(Boolean).length;

  const icon = (v) => v ? '✅' : '❌';

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║          SA-023b: 5,000 CONCURRENT SCALE TEST              ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total requests:     ${String(results.total_requests).padStart(10)}                         ║`);
  console.log(`║  Replica-routed:     ${String(results.replica_routed).padStart(10)}                         ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Search p50:       ${String(results.search_p50.toFixed(0)).padStart(6)}ms                              ║`);
  console.log(`║  Search p95:       ${String(results.search_p95.toFixed(0)).padStart(6)}ms  (< 500ms)  ${icon(gates.search_p95)}              ║`);
  console.log(`║  Search p99:       ${String(results.search_p99.toFixed(0)).padStart(6)}ms                              ║`);
  console.log(`║  Dashboard p95:    ${String(results.dashboard_p95.toFixed(0)).padStart(6)}ms  (< 1500ms) ${icon(gates.dashboard_p95)}              ║`);
  console.log(`║  Heartbeat p95:    ${String(results.heartbeat_p95.toFixed(0)).padStart(6)}ms  (< 1000ms) ${icon(gates.heartbeat_p95)}              ║`);
  console.log(`║  Admin p95:        ${String(results.admin_p95.toFixed(0)).padStart(6)}ms  (< 2000ms) ${icon(gates.admin_p95)}              ║`);
  console.log(`║  Gateway p95:      ${String(results.gateway_p95.toFixed(0)).padStart(6)}ms  (< 2000ms) ${icon(gates.gateway_p95)}              ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  5xx errors:       ${String(results.five_xx_count).padStart(6)}    (= 0)     ${icon(gates.zero_5xx)}              ║`);
  console.log(`║  Error rate:       ${(results.error_rate * 100).toFixed(3)}%  (< 0.1%)  ${icon(gates.error_rate)}              ║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  GATES: ${passCount}/7 passing                                        ║`);
  console.log(`║  VERDICT: ${allPass ? '✅ PASS — 5K SCALE GATE MET            ' : '❌ FAIL — DO NOT PROCEED TO LAUNCH     '}        ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  return {
    'load-tests/results/scale-5k-suite.json': JSON.stringify({
      timestamp: new Date().toISOString(),
      session: 'SA-023b',
      target_vus: 5000,
      results,
      gates,
      verdict: allPass ? 'PASS' : 'FAIL',
      raw: data,
    }, null, 2),
    stdout: '',
  };
}
