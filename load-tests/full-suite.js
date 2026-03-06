// load-tests/full-suite.js — Combined load test: all surfaces
// CS-020 FIX-20: Runs all 4 surface tests simultaneously
// Distributes 1,200 VUs across surfaces by traffic weight:
//   Landing preview-jobs: 40% (480 VUs) — highest public traffic
//   Dashboard API:        35% (420 VUs) — core authenticated usage
//   Extension heartbeat:  20% (240 VUs) — periodic background calls
//   Admin concurrent:      5% ( 60 VUs) — small operator pool
//
// Run: k6 run load-tests/full-suite.js

import { CONFIG, randomItem } from './config.js';
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ── Metrics ────────────────────────────────────────────────
const previewLatency = new Trend('preview_latency', true);
const dashboardLatency = new Trend('dashboard_latency', true);
const heartbeatLatency = new Trend('heartbeat_latency', true);
const adminLatency = new Trend('admin_latency', true);
const overallErrors = new Rate('overall_errors');

export const options = {
  scenarios: {
    landing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 48 },
        { duration: '2m', target: 192 },
        { duration: '3m', target: 384 },
        { duration: '3m', target: 480 },
        { duration: '5m', target: 480 },
        { duration: '2m', target: 0 },
      ],
      exec: 'landing',
      tags: { surface: 'landing' },
    },
    dashboard: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 42 },
        { duration: '2m', target: 168 },
        { duration: '3m', target: 336 },
        { duration: '3m', target: 420 },
        { duration: '5m', target: 420 },
        { duration: '2m', target: 0 },
      ],
      exec: 'dashboard',
      tags: { surface: 'dashboard' },
    },
    extension: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 24 },
        { duration: '2m', target: 96 },
        { duration: '3m', target: 192 },
        { duration: '3m', target: 240 },
        { duration: '5m', target: 240 },
        { duration: '2m', target: 0 },
      ],
      exec: 'extension',
      tags: { surface: 'extension' },
    },
    admin: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 6 },
        { duration: '2m', target: 24 },
        { duration: '3m', target: 48 },
        { duration: '3m', target: 60 },
        { duration: '5m', target: 60 },
        { duration: '2m', target: 0 },
      ],
      exec: 'admin',
      tags: { surface: 'admin' },
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<2000'],
    'http_req_failed': ['rate<0.001'],
    'preview_latency': ['p(95)<2000'],
    'dashboard_latency': ['p(95)<2000'],
    'heartbeat_latency': ['p(95)<1500'],
    'admin_latency': ['p(95)<3000'],
    'overall_errors': ['rate<0.001'],
  },
};

const REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;

// ── Shared auth helper ─────────────────────────────────────
function getToken() {
  if (!CONFIG.TEST_USER.email) return null;
  const res = http.post(AUTH_URL, JSON.stringify({
    email: CONFIG.TEST_USER.email,
    password: CONFIG.TEST_USER.password,
  }), {
    headers: { 'Content-Type': 'application/json', 'apikey': CONFIG.SUPABASE_ANON_KEY },
    tags: { name: 'auth' },
  });
  return res.status === 200 ? res.json().access_token : null;
}

// ── Scenario: Landing ──────────────────────────────────────
export function landing() {
  const payload = JSON.stringify({
    keyword: randomItem(CONFIG.KEYWORDS),
    location: randomItem(CONFIG.LOCATIONS),
    remote: Math.random() > 0.7,
    session_token: `lt-${__VU}-${Date.now()}`,
  });

  const res = http.post(
    `${CONFIG.SUPABASE_URL}/functions/v1/preview-jobs`,
    payload,
    {
      headers: { 'Content-Type': 'application/json', 'Origin': CONFIG.LANDING_URL },
      tags: { name: 'preview-jobs' },
    }
  );

  previewLatency.add(res.timings.duration);
  overallErrors.add(res.status >= 500 ? 1 : 0);

  check(res, { 'landing 200': (r) => r.status === 200 });
  sleep(3 + Math.random() * 5);
}

// ── Scenario: Dashboard ────────────────────────────────────
export function dashboard() {
  const token = getToken();
  if (!token) { sleep(5); return; }

  const h = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('dash', () => {
    const feed = http.get(
      `${REST_URL}/ats_jobs?select=id,title,company_name,salary_min,salary_max,location&status=neq.closed&order=posted_at.desc&limit=25`,
      { headers: h, tags: { name: 'feed' } }
    );
    dashboardLatency.add(feed.timings.duration);
    overallErrors.add(feed.status >= 500 ? 1 : 0);
    check(feed, { 'feed 200': (r) => r.status === 200 });

    sleep(1 + Math.random());

    const pipe = http.get(
      `${REST_URL}/applications?select=id,job_title,company_name,status,applied_at&order=applied_at.desc&limit=50`,
      { headers: h, tags: { name: 'pipeline' } }
    );
    dashboardLatency.add(pipe.timings.duration);
    overallErrors.add(pipe.status >= 500 ? 1 : 0);
    check(pipe, { 'pipeline 200': (r) => r.status === 200 });
  });

  sleep(5 + Math.random() * 10);
}

// ── Scenario: Extension ────────────────────────────────────
export function extension() {
  const token = getToken();
  if (!token) { sleep(10); return; }

  const res = http.post(
    `${CONFIG.SUPABASE_URL}/functions/v1/extension-heartbeat`,
    JSON.stringify({
      extension_id: `lt-ext-${__VU}`,
      extension_version: '0.8.0',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`,
      },
      tags: { name: 'heartbeat' },
    }
  );

  heartbeatLatency.add(res.timings.duration);
  overallErrors.add(res.status >= 500 ? 1 : 0);
  check(res, { 'heartbeat 200': (r) => r.status === 200 });

  sleep(5 + Math.random() * 10);
}

// ── Scenario: Admin ────────────────────────────────────────
export function admin() {
  const token = getToken();
  if (!token) { sleep(15); return; }

  const h = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('admin', () => {
    const users = http.get(
      `${REST_URL}/profiles?select=id,full_name,email,tier&order=created_at.desc&limit=50`,
      { headers: h, tags: { name: 'admin-users' } }
    );
    adminLatency.add(users.timings.duration);
    overallErrors.add(users.status >= 500 ? 1 : 0);

    sleep(1);

    const costs = http.get(
      `${REST_URL}/vendor_cost_budgets?select=*`,
      { headers: h, tags: { name: 'admin-costs' } }
    );
    adminLatency.add(costs.timings.duration);
    overallErrors.add(costs.status >= 500 ? 1 : 0);
  });

  sleep(10 + Math.random() * 20);
}

// ── Summary ────────────────────────────────────────────────
export function handleSummary(data) {
  const m = (name) => data.metrics[name]?.values?.['p(95)'] || 0;
  const errRate = data.metrics.overall_errors?.values?.rate || 0;

  const results = {
    preview_p95: m('preview_latency'),
    dashboard_p95: m('dashboard_latency'),
    heartbeat_p95: m('heartbeat_latency'),
    admin_p95: m('admin_latency'),
    overall_p95: m('http_req_duration'),
    error_rate: errRate,
  };

  const pass =
    results.preview_p95 < 2000 &&
    results.dashboard_p95 < 2000 &&
    results.heartbeat_p95 < 1500 &&
    results.admin_p95 < 3000 &&
    results.error_rate < 0.001;

  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     FULL-SUITE LOAD TEST (1,200 VUs)         ║');
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║  Preview p95:    ${String(results.preview_p95.toFixed(0)).padStart(6)}ms  ${results.preview_p95 < 2000 ? '✅' : '❌'}              ║`);
  console.log(`║  Dashboard p95:  ${String(results.dashboard_p95.toFixed(0)).padStart(6)}ms  ${results.dashboard_p95 < 2000 ? '✅' : '❌'}              ║`);
  console.log(`║  Heartbeat p95:  ${String(results.heartbeat_p95.toFixed(0)).padStart(6)}ms  ${results.heartbeat_p95 < 1500 ? '✅' : '❌'}              ║`);
  console.log(`║  Admin p95:      ${String(results.admin_p95.toFixed(0)).padStart(6)}ms  ${results.admin_p95 < 3000 ? '✅' : '❌'}              ║`);
  console.log(`║  Error rate:     ${(results.error_rate * 100).toFixed(3)}%    ${results.error_rate < 0.001 ? '✅' : '❌'}              ║`);
  console.log('╠═══════════════════════════════════════════════╣');
  console.log(`║  VERDICT:        ${pass ? '✅ PASS — LAUNCH GATE MET' : '❌ FAIL — DO NOT LAUNCH'}     ║`);
  console.log('╚═══════════════════════════════════════════════╝\n');

  return {
    'load-tests/results/full-suite.json': JSON.stringify(data, null, 2),
    stdout: '', // suppress default stdout
  };
}
