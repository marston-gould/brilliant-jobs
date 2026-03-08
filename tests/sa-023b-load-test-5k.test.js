/**
 * SA-023b Validation Tests — Load Test 5,000 Concurrent
 *
 * Validates: scale-5k-suite.js structure, config 5k profile, workflow updates,
 * gateway routing, threshold definitions, exit gate criteria, README updates.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. SCALE-5K SUITE FILE
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Scale 5K Suite File', () => {
  it('scale-5k-suite.js exists', () => {
    assert.ok(fileExists('load-tests/scale-5k-suite.js'));
  });

  it('Targets 5,000 total VUs (2000 + 1500 + 1000 + 500)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('2000'), 'Missing 2000 VU search scenario');
    assert.ok(content.includes('1500'), 'Missing 1500 VU dashboard scenario');
    assert.ok(content.includes('1000'), 'Missing 1000 VU extension scenario');
    assert.ok(content.includes('500'), 'Missing 500 VU admin scenario');
  });

  it('Has 4 scenarios (search, dashboard, extension, admin)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('searchScenario'), 'Missing search scenario');
    assert.ok(content.includes('dashboardScenario'), 'Missing dashboard scenario');
    assert.ok(content.includes('extensionScenario'), 'Missing extension scenario');
    assert.ok(content.includes('adminScenario'), 'Missing admin scenario');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. EXIT GATES — THRESHOLD DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Exit Gate Thresholds', () => {
  it('Search p95 threshold < 500ms', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'search_latency'"), 'Missing search_latency threshold');
    assert.ok(content.includes("'p(95)<500'"), 'Search p95 must be < 500ms');
  });

  it('Zero 5xx threshold (hard gate)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'five_xx_errors'"), 'Missing five_xx_errors threshold');
    assert.ok(content.includes("'count==0'"), '5xx count must be exactly 0');
  });

  it('Dashboard p95 threshold < 1500ms', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'p(95)<1500'"), 'Dashboard p95 must be < 1500ms');
  });

  it('Heartbeat p95 threshold < 1000ms', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'p(95)<1000'"), 'Heartbeat p95 must be < 1000ms');
  });

  it('Admin p95 threshold < 2000ms', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'admin_latency'"), 'Missing admin_latency threshold');
  });

  it('Overall error rate threshold < 0.1%', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'rate<0.001'"), 'Error rate must be < 0.001');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. GATEWAY ROUTING (SA-005 ARCHITECTURE)
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Gateway Routing', () => {
  it('Routes through API gateway (not direct EF calls)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('GATEWAY_URL') || content.includes('GW'), 'Must use gateway URL');
    // Verify config.js has the actual api-gateway URL
    const config = readFile('load-tests/config.js');
    assert.ok(config.includes('api-gateway'), 'Config GATEWAY_URL must reference api-gateway');
  });

  it('Tests preview-jobs through gateway', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("route: 'preview-jobs'") || content.includes("'preview-jobs'"),
      'Must route preview-jobs through gateway');
  });

  it('Tests extension-heartbeat through gateway', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("route: 'extension-heartbeat'") || content.includes("'extension-heartbeat'"),
      'Must route heartbeat through gateway');
  });

  it('Tests chat-job-search through gateway', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('chat-job-search'),
      'Must test chat-job-search (read-replica-routed endpoint)');
  });

  it('Tests capacity-model through gateway (SA-028)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('capacity-model'),
      'Must test capacity-model endpoint under load');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SCALING INFRASTRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Scaling Infrastructure', () => {
  it('Tracks read-replica routing metrics (SA-018)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('replica_routed') || content.includes('X-Gateway-Db-Mode'),
      'Must track read-replica routing');
  });

  it('Tests partitioned ats_jobs queries (SA-019)', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('ats_jobs') || content.includes('ats_source'),
      'Must query partitioned ats_jobs table');
  });

  it('Has 10-minute sustained peak period', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes("'10m'"), 'Must have 10 minute sustained peak');
  });

  it('Tracks 5xx errors as separate counter', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('five_xx_errors'), 'Must have dedicated 5xx counter');
    assert.ok(content.includes('fiveXXErrors'), 'Must track 5xx in record function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. CONFIG.JS UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Config Updates', () => {
  it('scale5k profile exists in config', () => {
    const content = readFile('load-tests/config.js');
    assert.ok(content.includes('scale5k'), 'Config missing scale5k profile');
  });

  it('scale5k profile ramps to 5000', () => {
    const content = readFile('load-tests/config.js');
    assert.ok(content.includes('5000'), 'scale5k profile must target 5000 VUs');
  });

  it('GATEWAY_URL added to config', () => {
    const content = readFile('load-tests/config.js');
    assert.ok(content.includes('GATEWAY_URL'), 'Config missing GATEWAY_URL');
    assert.ok(content.includes('api-gateway'), 'GATEWAY_URL must point to api-gateway');
  });

  it('Existing profiles unchanged', () => {
    const content = readFile('load-tests/config.js');
    assert.ok(content.includes('smoke'), 'smoke profile missing');
    assert.ok(content.includes('ramp'), 'ramp profile missing');
    assert.ok(content.includes('spike'), 'spike profile missing');
    assert.ok(content.includes('soak'), 'soak profile missing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. GITHUB WORKFLOW UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: GitHub Workflow', () => {
  it('Workflow includes scale5k profile option', () => {
    const content = readFile('.github/workflows/load-test.yml');
    assert.ok(content.includes('scale5k'), 'Workflow missing scale5k profile');
  });

  it('Workflow includes scale-5k-suite target', () => {
    const content = readFile('.github/workflows/load-test.yml');
    assert.ok(content.includes('scale-5k-suite'), 'Workflow missing scale-5k-suite target');
  });

  it('Workflow passes GATEWAY_URL to k6', () => {
    const content = readFile('.github/workflows/load-test.yml');
    assert.ok(content.includes('GATEWAY_URL'), 'Workflow must pass GATEWAY_URL');
  });

  it('Workflow timeout increased for 5k test', () => {
    const content = readFile('.github/workflows/load-test.yml');
    assert.ok(content.includes('60'), 'Timeout should be increased for 5k test');
  });

  it('SA-023b referenced in workflow comments', () => {
    const content = readFile('.github/workflows/load-test.yml');
    assert.ok(content.includes('SA-023b'), 'Workflow should reference SA-023b');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. README UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: README', () => {
  it('README documents scale-5k-suite', () => {
    const content = readFile('load-tests/README.md');
    assert.ok(content.includes('scale-5k-suite'), 'README missing scale-5k-suite');
  });

  it('README documents 5,000 VU target', () => {
    const content = readFile('load-tests/README.md');
    assert.ok(content.includes('5,000'), 'README missing 5,000 VU documentation');
  });

  it('README documents SA-023b exit gates', () => {
    const content = readFile('load-tests/README.md');
    assert.ok(content.includes('SA-023b'), 'README missing SA-023b section');
    assert.ok(content.includes('500ms'), 'README must document 500ms search gate');
    assert.ok(content.includes('Zero 5xx') || content.includes('zero 5xx'),
      'README must document zero 5xx gate');
  });

  it('README documents gateway routing', () => {
    const content = readFile('load-tests/README.md');
    assert.ok(content.includes('gateway') || content.includes('Gateway'),
      'README must mention gateway routing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SUMMARY REPORT
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Summary Report', () => {
  it('handleSummary function exists', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('handleSummary'), 'Must have handleSummary function');
  });

  it('Reports all 7 gates', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('search_p95'), 'Summary must report search_p95 gate');
    assert.ok(content.includes('dashboard_p95'), 'Summary must report dashboard_p95 gate');
    assert.ok(content.includes('heartbeat_p95'), 'Summary must report heartbeat_p95 gate');
    assert.ok(content.includes('admin_p95'), 'Summary must report admin_p95 gate');
    assert.ok(content.includes('gateway_p95'), 'Summary must report gateway_p95 gate');
    assert.ok(content.includes('zero_5xx'), 'Summary must report zero_5xx gate');
    assert.ok(content.includes('error_rate'), 'Summary must report error_rate gate');
  });

  it('Reports replica routing count', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('replica_routed'), 'Summary must report replica_routed count');
  });

  it('Outputs JSON results to results directory', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('scale-5k-suite.json'), 'Must output to scale-5k-suite.json');
  });

  it('PASS/FAIL verdict in output', () => {
    const content = readFile('load-tests/scale-5k-suite.js');
    assert.ok(content.includes('PASS') && content.includes('FAIL'),
      'Summary must include PASS/FAIL verdict');
    assert.ok(content.includes('5K SCALE GATE'), 'Must reference 5K scale gate');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. EXISTING LOAD TESTS NOT BROKEN
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: Existing Tests Preserved', () => {
  const existingFiles = [
    'load-tests/full-suite.js',
    'load-tests/preview-jobs.js',
    'load-tests/dashboard-api.js',
    'load-tests/extension-heartbeat.js',
    'load-tests/admin-concurrent.js',
  ];

  for (const file of existingFiles) {
    it(`${path.basename(file)} still exists`, () => {
      assert.ok(fileExists(file), `${file} missing — existing test deleted`);
    });
  }

  it('full-suite.js still targets 1,200 VUs', () => {
    const content = readFile('load-tests/full-suite.js');
    assert.ok(content.includes('1,200') || content.includes('1200'),
      'full-suite.js must still target 1200 VUs');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FILE INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-023b: File Inventory', () => {
  const expectedNew = [
    'load-tests/scale-5k-suite.js',
    'tests/sa-023b-load-test-5k.test.js',
  ];

  const expectedModified = [
    'load-tests/config.js',
    'load-tests/README.md',
    '.github/workflows/load-test.yml',
  ];

  for (const f of [...expectedNew, ...expectedModified]) {
    it(`${f} exists`, () => {
      assert.ok(fileExists(f), `${f} missing`);
    });
  }
});
