// load-tests/preview-jobs.js — Landing page preview-jobs endpoint
// CS-020 FIX-20: Validates rate limiting + response times under load
//
// Run:
//   k6 run --env PROFILE=smoke load-tests/preview-jobs.js
//   k6 run --env PROFILE=ramp load-tests/preview-jobs.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { CONFIG, randomItem } from './config.js';

// Custom metrics
const rateLimitRate = new Rate('rate_limited_responses');
const previewLatency = new Trend('preview_jobs_latency', true);

// Select profile from env or default to smoke
const profile = CONFIG.PROFILES[__ENV.PROFILE || 'smoke'];
export const options = {
  stages: profile.stages,
  thresholds: {
    ...CONFIG.THRESHOLDS,
    rate_limited_responses: ['rate<0.5'], // expect some rate limiting under load, but <50%
  },
  tags: { surface: 'landing', endpoint: 'preview-jobs' },
};

const ENDPOINT = `${CONFIG.SUPABASE_URL}/functions/v1/preview-jobs`;

export default function () {
  const payload = JSON.stringify({
    keyword: randomItem(CONFIG.KEYWORDS),
    location: randomItem(CONFIG.LOCATIONS),
    remote: Math.random() > 0.7,
    session_token: `load-test-${__VU}-${Date.now()}`,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Origin': CONFIG.LANDING_URL,
    },
    tags: { name: 'preview-jobs' },
  };

  const res = http.post(ENDPOINT, payload, params);
  previewLatency.add(res.timings.duration);

  const body = res.json();
  const isRateLimited = body && body.error === 'rate_limited';
  rateLimitRate.add(isRateLimited ? 1 : 0);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'has total count': () => body && (typeof body.total === 'number' || isRateLimited),
    'has session_token': () => body && (typeof body.session_token === 'string' || isRateLimited),
    'response under 2s': (r) => r.timings.duration < 2000,
  });

  // Simulate real user pacing: 3–8s between searches
  sleep(3 + Math.random() * 5);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration?.values?.['p(95)'] || 0;
  const errRate = data.metrics.http_req_failed?.values?.rate || 0;
  const rlRate = data.metrics.rate_limited_responses?.values?.rate || 0;

  const pass = p95 < 2000 && errRate < 0.001;

  console.log('\n═══ PREVIEW-JOBS LOAD TEST SUMMARY ═══');
  console.log(`  p95 latency:   ${p95.toFixed(0)}ms ${p95 < 2000 ? '✅' : '❌'}`);
  console.log(`  Error rate:    ${(errRate * 100).toFixed(3)}% ${errRate < 0.001 ? '✅' : '❌'}`);
  console.log(`  Rate-limited:  ${(rlRate * 100).toFixed(1)}%`);
  console.log(`  RESULT:        ${pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log('═══════════════════════════════════════\n');

  return {
    'load-tests/results/preview-jobs.json': JSON.stringify(data, null, 2),
  };
}
