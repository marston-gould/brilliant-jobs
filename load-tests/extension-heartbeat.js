// load-tests/extension-heartbeat.js — Extension heartbeat endpoint
// CS-020 FIX-20: Validates heartbeat stability under concurrent extension load
//
// Requires authenticated users. Set env vars:
//   K6_TEST_EMAIL=test@example.com K6_TEST_PASSWORD=... k6 run load-tests/extension-heartbeat.js
//
// For load test at scale, use the auth-pool approach (see setup function).

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { CONFIG, randomItem } from './config.js';

// Custom metrics
const heartbeatLatency = new Trend('heartbeat_latency', true);
const authFailRate = new Rate('auth_failures');
const killSwitchRate = new Rate('kill_directive_received');

const profile = CONFIG.PROFILES[__ENV.PROFILE || 'smoke'];
export const options = {
  stages: profile.stages,
  thresholds: {
    ...CONFIG.THRESHOLDS,
    heartbeat_latency: ['p(95)<1500'], // heartbeat should be fast
    auth_failures: ['rate<0.01'],       // <1% auth failures
  },
  tags: { surface: 'extension', endpoint: 'heartbeat' },
};

const ENDPOINT = `${CONFIG.SUPABASE_URL}/functions/v1/extension-heartbeat`;
const AUTH_URL = `${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`;

// ── Auth: Get a JWT token ──────────────────────────────────
// In real load test, pre-provision N test users and distribute across VUs
let cachedToken = null;
let tokenExpiry = 0;

function getAuthToken() {
  // Reuse token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  if (!CONFIG.TEST_USER.email || !CONFIG.TEST_USER.password) {
    // Unauthenticated mode — test the 401 path
    return null;
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

  if (res.status !== 200) {
    authFailRate.add(1);
    console.warn(`Auth failed: ${res.status} ${res.body}`);
    return null;
  }

  const data = res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000;
  authFailRate.add(0);
  return cachedToken;
}

// ── Extension version pool (simulate version diversity) ────
const EXT_VERSIONS = ['0.7.0', '0.7.1', '0.8.0'];

export default function () {
  const token = getAuthToken();

  const payload = JSON.stringify({
    extension_id: `load-test-ext-${__VU}`,
    extension_version: randomItem(EXT_VERSIONS),
  });

  const headers = {
    'Content-Type': 'application/json',
    'apikey': CONFIG.SUPABASE_ANON_KEY,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = http.post(ENDPOINT, payload, {
    headers,
    tags: { name: 'heartbeat' },
  });

  heartbeatLatency.add(res.timings.duration);

  if (token) {
    // Authenticated path — expect 200 OK
    const body = res.json();
    const hasKill = body && body.directive === 'kill';
    killSwitchRate.add(hasKill ? 1 : 0);

    check(res, {
      'status is 200': (r) => r.status === 200,
      'ok is true': () => body && body.ok === true,
      'has directive field': () => body && body.directive !== undefined,
      'response under 1.5s': (r) => r.timings.duration < 1500,
    });
  } else {
    // Unauthenticated path — expect 401
    check(res, {
      'unauthenticated returns 401': (r) => r.status === 401,
    });
  }

  // Extension heartbeat interval: 5-minute cycle, compressed for load test
  // Real interval is 300s; for testing, use 5-15s pacing
  sleep(5 + Math.random() * 10);
}

export function handleSummary(data) {
  const p95 = data.metrics.heartbeat_latency?.values?.['p(95)'] || 0;
  const errRate = data.metrics.http_req_failed?.values?.rate || 0;
  const authFail = data.metrics.auth_failures?.values?.rate || 0;
  const killRate = data.metrics.kill_directive_received?.values?.rate || 0;

  const pass = p95 < 1500 && errRate < 0.001;

  console.log('\n═══ HEARTBEAT LOAD TEST SUMMARY ═══');
  console.log(`  p95 latency:     ${p95.toFixed(0)}ms ${p95 < 1500 ? '✅' : '❌'}`);
  console.log(`  Error rate:      ${(errRate * 100).toFixed(3)}% ${errRate < 0.001 ? '✅' : '❌'}`);
  console.log(`  Auth failures:   ${(authFail * 100).toFixed(1)}%`);
  console.log(`  Kill directives: ${(killRate * 100).toFixed(1)}%`);
  console.log(`  RESULT:          ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('════════════════════════════════════\n');

  return {
    'load-tests/results/heartbeat.json': JSON.stringify(data, null, 2),
  };
}
