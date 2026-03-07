#!/usr/bin/env node
/**
 * CS-022: 72-Hour Dry Run Monitor
 * 
 * Checks all production surfaces and infrastructure health.
 * Designed to run via GitHub Actions cron (hourly) or manually.
 * 
 * Usage:
 *   node scripts/dry-run-monitor.mjs
 *   node scripts/dry-run-monitor.mjs --json   # Machine-readable output
 *   node scripts/dry-run-monitor.mjs --ci     # Exit code 1 on any failure
 * 
 * Environment:
 *   SUPABASE_URL        - Supabase project URL
 *   SUPABASE_ANON_KEY   - Supabase anon key
 *   POSTHOG_API_KEY     - PostHog personal API key (optional, for event checks)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const PROD_DOMAIN = 'https://brilliantjobs.app';

const flags = new Set(process.argv.slice(2));
const JSON_MODE = flags.has('--json');
const CI_MODE = flags.has('--ci');

// ─── Check Result Structure ───
function result(name, status, latencyMs, detail = '') {
  return { name, status, latencyMs, detail, timestamp: new Date().toISOString() };
}

// ─── HTTP helper with timeout ───
async function fetchWithTimeout(url, opts = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const latency = Math.round(performance.now() - start);
    return { res, latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return { err, latency };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Individual Checks ───

async function checkLandingPage() {
  const { res, latency, err } = await fetchWithTimeout(PROD_DOMAIN);
  if (err) return result('Landing Page', 'FAIL', latency, `Unreachable: ${err.message}`);
  if (!res.ok) return result('Landing Page', 'FAIL', latency, `HTTP ${res.status}`);
  return result('Landing Page', 'PASS', latency, `HTTP ${res.status}`);
}

async function checkLandingCSP() {
  const { res, latency, err } = await fetchWithTimeout(PROD_DOMAIN);
  if (err) return result('Landing CSP Headers', 'FAIL', latency, `Unreachable: ${err.message}`);
  
  const csp = res.headers.get('content-security-policy') || res.headers.get('content-security-policy-report-only') || '';
  const xFrame = res.headers.get('x-frame-options') || '';
  const xContent = res.headers.get('x-content-type-options') || '';
  const hsts = res.headers.get('strict-transport-security') || '';
  
  const issues = [];
  if (!csp) issues.push('No CSP header');
  if (csp.includes("'unsafe-inline'") && csp.includes('script-src')) issues.push("CSP script-src has unsafe-inline");
  if (!xFrame) issues.push('No X-Frame-Options');
  if (!xContent) issues.push('No X-Content-Type-Options');
  if (!hsts) issues.push('No HSTS');
  
  const status = issues.length === 0 ? 'PASS' : issues.length <= 1 ? 'WARN' : 'FAIL';
  const detail = issues.length ? issues.join('; ') : 'CSP + X-Frame-Options + HSTS all present';
  return result('Landing CSP Headers', status, latency, detail);
}

async function checkDashboard() {
  const { res, latency, err } = await fetchWithTimeout(`${PROD_DOMAIN}/dashboard.html`);
  if (err) return result('Dashboard', 'FAIL', latency, `Unreachable: ${err.message}`);
  if (!res.ok) return result('Dashboard', 'FAIL', latency, `HTTP ${res.status}`);
  return result('Dashboard', 'PASS', latency, `HTTP ${res.status}`);
}

async function checkAdmin() {
  const { res, latency, err } = await fetchWithTimeout(`${PROD_DOMAIN}/admin.html`);
  if (err) return result('Admin', 'FAIL', latency, `Unreachable: ${err.message}`);
  if (!res.ok) return result('Admin', 'FAIL', latency, `HTTP ${res.status}`);
  return result('Admin', 'PASS', latency, `HTTP ${res.status}`);
}

async function checkRoadmap() {
  const { res, latency, err } = await fetchWithTimeout(`${PROD_DOMAIN}/roadmap`);
  if (err) return result('Roadmap Page', 'FAIL', latency, `Unreachable: ${err.message}`);
  // Accept 200 or 304
  if (!res.ok && res.status !== 304) return result('Roadmap Page', 'FAIL', latency, `HTTP ${res.status}`);
  return result('Roadmap Page', 'PASS', latency, `HTTP ${res.status}`);
}

async function checkHealthEndpoint() {
  const url = `${SUPABASE_URL}/functions/v1/health-check`;
  const { res, latency, err } = await fetchWithTimeout(url);
  if (err) return result('Health Check EF', 'FAIL', latency, `Unreachable: ${err.message}`);
  
  try {
    const body = await res.json();
    const dbCheck = body.checks?.database?.status || 'unknown';
    const jobRefresh = body.checks?.job_refresh?.status || 'unknown';
    const jobData = body.checks?.job_data?.status || 'unknown';
    const notifications = body.checks?.notifications?.status || 'unknown';
    
    const detail = `DB:${dbCheck} Jobs:${jobRefresh} Data:${jobData} Notify:${notifications} (${body.status})`;
    
    if (body.status === 'healthy') return result('Health Check EF', 'PASS', latency, detail);
    if (body.status === 'degraded') return result('Health Check EF', 'WARN', latency, detail);
    return result('Health Check EF', 'FAIL', latency, detail);
  } catch {
    return result('Health Check EF', 'FAIL', latency, `Invalid JSON response`);
  }
}

async function checkPreviewJobsEndpoint() {
  const url = `${SUPABASE_URL}/functions/v1/preview-jobs`;
  const { res, latency, err } = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 1 }),
  });
  if (err) return result('Preview Jobs EF', 'FAIL', latency, `Unreachable: ${err.message}`);
  if (!res.ok) return result('Preview Jobs EF', 'WARN', latency, `HTTP ${res.status}`);
  
  try {
    const body = await res.json();
    const count = Array.isArray(body) ? body.length : body?.jobs?.length || 0;
    return result('Preview Jobs EF', 'PASS', latency, `${count} job(s) returned`);
  } catch {
    return result('Preview Jobs EF', 'PASS', latency, `HTTP ${res.status} (non-JSON)`);
  }
}

async function checkExtensionHeartbeat() {
  const url = `${SUPABASE_URL}/functions/v1/extension-heartbeat`;
  const { res, latency, err } = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 'dry-run-probe', event: 'ping' }),
  });
  if (err) return result('Extension Heartbeat EF', 'FAIL', latency, `Unreachable: ${err.message}`);
  // 401 is expected (no auth) — proves EF is deployed and responding
  if (res.status === 401 || res.ok) {
    return result('Extension Heartbeat EF', 'PASS', latency, `HTTP ${res.status} (EF responding)`);
  }
  return result('Extension Heartbeat EF', 'WARN', latency, `HTTP ${res.status}`);
}

async function checkKillSwitch() {
  const url = `${SUPABASE_URL}/rest/v1/feature_flags?name=eq.extension_kill_switch&select=name,enabled`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  
  if (!SUPABASE_ANON_KEY) {
    return result('Kill Switch', 'SKIP', 0, 'No SUPABASE_ANON_KEY set');
  }
  
  const { res, latency, err } = await fetchWithTimeout(url, { headers });
  if (err) return result('Kill Switch', 'FAIL', latency, `Unreachable: ${err.message}`);
  
  try {
    const body = await res.json();
    if (Array.isArray(body) && body.length > 0) {
      const flag = body[0];
      return result('Kill Switch', 'PASS', latency, `Flag exists: enabled=${flag.enabled}`);
    }
    return result('Kill Switch', 'WARN', latency, 'Flag not found in feature_flags');
  } catch {
    return result('Kill Switch', 'FAIL', latency, `Invalid response`);
  }
}

async function checkDatabaseConnectivity() {
  const url = `${SUPABASE_URL}/rest/v1/ats_jobs?select=id&limit=1`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  };
  
  if (!SUPABASE_ANON_KEY) {
    return result('Database (via REST)', 'SKIP', 0, 'No SUPABASE_ANON_KEY set');
  }
  
  const { res, latency, err } = await fetchWithTimeout(url, { headers });
  if (err) return result('Database (via REST)', 'FAIL', latency, `Unreachable: ${err.message}`);
  if (!res.ok) return result('Database (via REST)', 'FAIL', latency, `HTTP ${res.status}`);
  
  return result('Database (via REST)', 'PASS', latency, `HTTP ${res.status}, latency ${latency}ms`);
}

async function checkVercelDeployment() {
  // Check that the site returns a Vercel deployment header
  const { res, latency, err } = await fetchWithTimeout(PROD_DOMAIN);
  if (err) return result('Vercel Deployment', 'FAIL', latency, `Unreachable: ${err.message}`);
  
  const server = res.headers.get('server') || '';
  const xVercel = res.headers.get('x-vercel-id') || '';
  const detail = xVercel ? `Vercel ID: ${xVercel}` : (server || 'No Vercel headers detected');
  
  return result('Vercel Deployment', res.ok ? 'PASS' : 'FAIL', latency, detail);
}

// ─── Main Runner ───

async function runAllChecks() {
  const checks = [
    checkLandingPage(),
    checkLandingCSP(),
    checkDashboard(),
    checkAdmin(),
    checkRoadmap(),
    checkHealthEndpoint(),
    checkPreviewJobsEndpoint(),
    checkExtensionHeartbeat(),
    checkKillSwitch(),
    checkDatabaseConnectivity(),
    checkVercelDeployment(),
  ];
  
  const results = await Promise.allSettled(checks);
  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    return result(`Check ${i}`, 'FAIL', 0, `Promise rejected: ${r.reason}`);
  });
}

async function main() {
  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const allResults = await runAllChecks();
  
  const passed = allResults.filter(r => r.status === 'PASS').length;
  const warned = allResults.filter(r => r.status === 'WARN').length;
  const failed = allResults.filter(r => r.status === 'FAIL').length;
  const skipped = allResults.filter(r => r.status === 'SKIP').length;
  
  const summary = {
    runId,
    timestamp: new Date().toISOString(),
    total: allResults.length,
    passed, warned, failed, skipped,
    overallStatus: failed > 0 ? 'UNHEALTHY' : warned > 0 ? 'DEGRADED' : 'HEALTHY',
    results: allResults,
  };
  
  if (JSON_MODE) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n🔍 Dry Run Monitor — ${summary.timestamp}`);
    console.log(`   Run ID: ${runId}`);
    console.log('─'.repeat(70));
    
    for (const r of allResults) {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️ ' : r.status === 'SKIP' ? '⏭️ ' : '❌';
      const pad = r.name.padEnd(24);
      const ms = r.latencyMs > 0 ? `${r.latencyMs}ms`.padStart(7) : '     — ';
      console.log(`  ${icon} ${pad} ${ms}  ${r.detail}`);
    }
    
    console.log('─'.repeat(70));
    console.log(`  Overall: ${summary.overallStatus}  |  ✅ ${passed}  ⚠️  ${warned}  ❌ ${failed}  ⏭️  ${skipped}`);
    console.log('');
  }
  
  if (CI_MODE && failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Dry-run monitor crashed:', err);
  process.exit(2);
});
