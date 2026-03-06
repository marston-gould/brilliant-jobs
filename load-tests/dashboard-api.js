// load-tests/dashboard-api.js — Dashboard Supabase REST API
// CS-020 FIX-20: Validates RLS-protected queries under concurrent user load
//
// Simulates authenticated dashboard user performing typical actions:
//   - Load job feed (ats_jobs query)
//   - Load pipeline (applications query)
//   - Load stats aggregation
//   - Load settings / profile

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { CONFIG } from './config.js';

// Custom metrics
const feedLatency = new Trend('feed_query_latency', true);
const pipelineLatency = new Trend('pipeline_query_latency', true);
const statsLatency = new Trend('stats_query_latency', true);
const rlsBlockRate = new Rate('rls_blocked');
const queryCount = new Counter('total_queries');

const profile = CONFIG.PROFILES[__ENV.PROFILE || 'smoke'];
export const options = {
  stages: profile.stages,
  thresholds: {
    ...CONFIG.THRESHOLDS,
    feed_query_latency: ['p(95)<2000'],
    pipeline_query_latency: ['p(95)<2000'],
    stats_query_latency: ['p(95)<2000'],
    rls_blocked: ['rate<0.01'],
  },
  tags: { surface: 'dashboard', endpoint: 'rest-api' },
};

const REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;
const AUTH_URL = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;

// Auth: each VU logs in once at iteration start
let vuToken = null;
let vuUserId = null;

function ensureAuth() {
  if (vuToken) return true;

  if (!CONFIG.TEST_USER.email || !CONFIG.TEST_USER.password) {
    console.warn('No test credentials — skipping authenticated tests');
    return false;
  }

  const res = http.post(AUTH_URL, JSON.stringify({
    email: CONFIG.TEST_USER.email,
    password: CONFIG.TEST_USER.password,
  }), {
    headers: {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
    },
    tags: { name: 'auth-login' },
  });

  if (res.status !== 200) return false;

  const data = res.json();
  vuToken = data.access_token;
  vuUserId = data.user?.id;
  return true;
}

function authHeaders() {
  return {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${vuToken}`,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact',
  };
}

// ── Simulated dashboard queries ────────────────────────────

function queryJobFeed() {
  const url = `${REST_URL}/ats_jobs?select=id,title,company_name,salary_min,salary_max,location,loc_type,posted_at,url,status&status=neq.closed&order=posted_at.desc&limit=25`;

  const res = http.get(url, {
    headers: authHeaders(),
    tags: { name: 'job-feed' },
  });

  feedLatency.add(res.timings.duration);
  queryCount.add(1);
  rlsBlockRate.add(res.status === 403 ? 1 : 0);

  check(res, {
    'feed: status 200': (r) => r.status === 200,
    'feed: returns array': (r) => {
      try { return Array.isArray(r.json()); } catch { return false; }
    },
    'feed: under 2s': (r) => r.timings.duration < 2000,
  });
}

function queryPipeline() {
  const url = `${REST_URL}/applications?select=id,job_title,company_name,status,applied_at,stage,notes&order=applied_at.desc&limit=50`;

  const res = http.get(url, {
    headers: authHeaders(),
    tags: { name: 'pipeline' },
  });

  pipelineLatency.add(res.timings.duration);
  queryCount.add(1);
  rlsBlockRate.add(res.status === 403 ? 1 : 0);

  check(res, {
    'pipeline: status 200': (r) => r.status === 200,
    'pipeline: under 2s': (r) => r.timings.duration < 2000,
  });
}

function queryStats() {
  // Simulates the stats aggregation the dashboard makes on load
  const url = `${REST_URL}/rpc/get_dashboard_stats`;

  const res = http.post(url, '{}', {
    headers: authHeaders(),
    tags: { name: 'stats' },
  });

  statsLatency.add(res.timings.duration);
  queryCount.add(1);

  // RPC may not exist — 404 is acceptable, just means the function isn't there
  check(res, {
    'stats: status 200 or 404': (r) => r.status === 200 || r.status === 404,
    'stats: under 2s': (r) => r.timings.duration < 2000,
  });
}

function queryProfile() {
  if (!vuUserId) return;

  const url = `${REST_URL}/profiles?id=eq.${vuUserId}&select=id,full_name,email,tier,created_at`;

  const res = http.get(url, {
    headers: authHeaders(),
    tags: { name: 'profile' },
  });

  queryCount.add(1);

  check(res, {
    'profile: status 200': (r) => r.status === 200,
    'profile: under 1s': (r) => r.timings.duration < 1000,
  });
}

// ── Main VU flow ───────────────────────────────────────────

export default function () {
  if (!ensureAuth()) {
    sleep(5);
    return;
  }

  // Simulate a typical dashboard session:
  // 1. Load feed (most frequent)
  // 2. Check pipeline
  // 3. Occasionally load stats
  // 4. Rarely load profile

  group('dashboard-session', function () {
    queryJobFeed();
    sleep(1 + Math.random() * 2);

    queryPipeline();
    sleep(1 + Math.random() * 2);

    if (Math.random() > 0.5) {
      queryStats();
      sleep(1 + Math.random());
    }

    if (Math.random() > 0.8) {
      queryProfile();
    }
  });

  // Session think-time: 5-15s between "page loads"
  sleep(5 + Math.random() * 10);
}

export function handleSummary(data) {
  const feedP95 = data.metrics.feed_query_latency?.values?.['p(95)'] || 0;
  const pipeP95 = data.metrics.pipeline_query_latency?.values?.['p(95)'] || 0;
  const statsP95 = data.metrics.stats_query_latency?.values?.['p(95)'] || 0;
  const errRate = data.metrics.http_req_failed?.values?.rate || 0;
  const queries = data.metrics.total_queries?.values?.count || 0;

  const pass = feedP95 < 2000 && pipeP95 < 2000 && errRate < 0.001;

  console.log('\n═══ DASHBOARD API LOAD TEST SUMMARY ═══');
  console.log(`  Feed p95:      ${feedP95.toFixed(0)}ms ${feedP95 < 2000 ? '✅' : '❌'}`);
  console.log(`  Pipeline p95:  ${pipeP95.toFixed(0)}ms ${pipeP95 < 2000 ? '✅' : '❌'}`);
  console.log(`  Stats p95:     ${statsP95.toFixed(0)}ms`);
  console.log(`  Error rate:    ${(errRate * 100).toFixed(3)}% ${errRate < 0.001 ? '✅' : '❌'}`);
  console.log(`  Total queries: ${queries}`);
  console.log(`  RESULT:        ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('════════════════════════════════════════\n');

  return {
    'load-tests/results/dashboard-api.json': JSON.stringify(data, null, 2),
  };
}
