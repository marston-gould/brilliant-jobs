/**
 * SA-018: Read Replica Setup + Query Routing — Validation Tests
 *
 * Tests verify:
 *   1. File structure (migration, shared module, middleware, EF, ADR)
 *   2. Migration correctness (tables, functions, views, cron, RLS)
 *   3. db-client.ts exports and interface
 *   4. read-replica-middleware.ts route classification
 *   5. Gateway integration (pipeline, route, headers)
 *   6. replica-health EF structure
 *   7. ADR-06 documentation
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FUNCTIONS = path.join(ROOT, 'supabase', 'functions');
const SHARED = path.join(FUNCTIONS, '_shared');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

// ─── 1. File Structure ───────────────────────────────────────────────────────

describe('SA-018: File Structure', () => {
  const requiredFiles = [
    'supabase/migrations/v6.27-read-replica-monitoring.sql',
    'supabase/functions/_shared/db-client.ts',
    'supabase/functions/_shared/read-replica-middleware.ts',
    'supabase/functions/replica-health/index.ts',
    'supabase/functions/api-gateway/index.ts',
    'docs/scaling/adr-06-pipeline.md',
  ];

  test.each(requiredFiles)('file exists: %s', (file) => {
    expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
  });
});

// ─── 2. Migration Correctness ────────────────────────────────────────────────

describe('SA-018: Migration v6.27', () => {
  let sql;

  beforeAll(() => {
    sql = fs.readFileSync(
      path.join(MIGRATIONS, 'v6.27-read-replica-monitoring.sql'),
      'utf-8'
    );
  });

  test('creates replica_health_log table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS replica_health_log/);
    expect(sql).toContain('replica_lag_ms');
    expect(sql).toContain('replica_state');
    expect(sql).toContain('is_healthy');
    expect(sql).toContain('alert_fired');
  });

  test('creates replica_routing_stats table', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS replica_routing_stats/);
    expect(sql).toContain('route_name');
    expect(sql).toContain('route_type');
    expect(sql).toContain('target');
    expect(sql).toContain('avg_latency_ms');
  });

  test('route_type constraint includes read and write', () => {
    expect(sql).toMatch(/route_type IN \('read', 'write'\)/);
  });

  test('target constraint includes primary, replica, fallback', () => {
    expect(sql).toMatch(/target IN \('primary', 'replica', 'fallback'\)/);
  });

  test('creates fn_log_replica_health function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION fn_log_replica_health/);
    expect(sql).toContain('pg_stat_replication');
    expect(sql).toContain('5000'); // 5s threshold
  });

  test('creates fn_replica_health_summary function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION fn_replica_health_summary/);
  });

  test('creates fn_cleanup_replica_logs function', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION fn_cleanup_replica_logs/);
    expect(sql).toContain("7 days");
    expect(sql).toContain("30 days");
  });

  test('creates v_replica_dashboard view', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW v_replica_dashboard/);
  });

  test('schedules pg_cron health check', () => {
    expect(sql).toMatch(/cron\.schedule.*replica-health-check.*30 seconds/s);
  });

  test('schedules pg_cron log cleanup', () => {
    expect(sql).toMatch(/cron\.schedule.*replica-log-cleanup/s);
  });

  test('enables RLS on both tables', () => {
    expect(sql).toContain('ALTER TABLE replica_health_log ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE replica_routing_stats ENABLE ROW LEVEL SECURITY');
  });

  test('creates indexes for time-range and alert queries', () => {
    expect(sql).toContain('idx_replica_health_log_measured_at');
    expect(sql).toContain('idx_replica_health_log_unhealthy');
    expect(sql).toContain('idx_replica_routing_stats_recorded');
    expect(sql).toContain('idx_replica_routing_stats_route');
  });

  test('integrates with CrewAI agent_action_log for alerts', () => {
    expect(sql).toContain('agent_action_log');
    expect(sql).toContain('pipeline-health');
    expect(sql).toContain('replica_lag_alert');
  });
});

// ─── 3. db-client.ts Exports ─────────────────────────────────────────────────

describe('SA-018: db-client.ts', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(path.join(SHARED, 'db-client.ts'), 'utf-8');
  });

  test('exports getDbClient function', () => {
    expect(content).toMatch(/export function getDbClient/);
  });

  test('exports getDbClientWithMetadata function', () => {
    expect(content).toMatch(/export function getDbClientWithMetadata/);
  });

  test('exports getReadClient convenience alias', () => {
    expect(content).toMatch(/export function getReadClient/);
  });

  test('exports getWriteClient convenience alias', () => {
    expect(content).toMatch(/export function getWriteClient/);
  });

  test('exports isReplicaAvailable health check', () => {
    expect(content).toMatch(/export async function isReplicaAvailable/);
  });

  test('exports readWithFallback for automatic failover', () => {
    expect(content).toMatch(/export async function readWithFallback/);
  });

  test('exports getRoutingConfig for debugging', () => {
    expect(content).toMatch(/export function getRoutingConfig/);
  });

  test('exports resetReplicaHealth for admin reset', () => {
    expect(content).toMatch(/export function resetReplicaHealth/);
  });

  test('reads READ_REPLICA_URL from environment', () => {
    expect(content).toContain('READ_REPLICA_URL');
    expect(content).toContain('Deno.env.get("READ_REPLICA_URL")');
  });

  test('implements fallback when replica URL not configured', () => {
    expect(content).toContain('READ_REPLICA_URL not configured');
  });

  test('implements 60-second health check TTL', () => {
    expect(content).toContain('60_000');
  });

  test('defines DbMode type as read | write', () => {
    expect(content).toMatch(/export type DbMode = "read" \| "write"/);
  });

  test('defines DbTarget type with primary, replica, fallback', () => {
    expect(content).toMatch(/export type DbTarget = "primary" \| "replica" \| "fallback"/);
  });

  test('redacts replica URL in getRoutingConfig', () => {
    expect(content).toContain('<redacted>');
  });

  test('uses singleton pattern for clients', () => {
    expect(content).toContain('_primaryClient');
    expect(content).toContain('_replicaClient');
  });

  test('disables session persistence for server-side usage', () => {
    expect(content).toContain('persistSession: false');
  });
});

// ─── 4. read-replica-middleware.ts ───────────────────────────────────────────

describe('SA-018: Read Replica Middleware', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(
      path.join(SHARED, 'read-replica-middleware.ts'),
      'utf-8'
    );
  });

  test('exports readReplicaRoutingMiddleware', () => {
    expect(content).toMatch(/export const readReplicaRoutingMiddleware/);
  });

  test('exports getReadOnlyRoutes', () => {
    expect(content).toMatch(/export function getReadOnlyRoutes/);
  });

  test('classifies chat-job-search as read-only', () => {
    expect(content).toContain('"chat-job-search"');
  });

  test('classifies preview-jobs as read-only', () => {
    expect(content).toContain('"preview-jobs"');
  });

  test('classifies admin-analytics as read-only', () => {
    expect(content).toContain('"admin-analytics"');
  });

  test('classifies health-check as read-only', () => {
    expect(content).toContain('"health-check"');
  });

  test('classifies replica-health as read-only', () => {
    expect(content).toContain('"replica-health"');
  });

  test('defaults to write for non-GET methods', () => {
    expect(content).toContain('dbMode = "write"');
    expect(content).toContain('target = "primary"');
  });

  test('logs routing decisions with structured logging', () => {
    expect(content).toContain('gateway:replica_routing');
    expect(content).toContain('correlationId');
  });

  test('logs routing stats fire-and-forget', () => {
    expect(content).toContain('replica_routing_stats');
    expect(content).toContain('.then(() => {})');
    expect(content).toContain('.catch(() => {})');
  });

  test('has at least 15 read-only routes classified', () => {
    const readOnlyCount = (content.match(/"[\w-]+".*,.*\/\//g) || []).length;
    expect(readOnlyCount).toBeGreaterThanOrEqual(15);
  });
});

// ─── 5. Gateway Integration ─────────────────────────────────────────────────

describe('SA-018: Gateway Integration', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(
      path.join(FUNCTIONS, 'api-gateway', 'index.ts'),
      'utf-8'
    );
  });

  test('imports readReplicaRoutingMiddleware', () => {
    expect(content).toContain('readReplicaRoutingMiddleware');
    expect(content).toContain('read-replica-middleware');
  });

  test('includes readReplicaRoutingMiddleware in pipeline', () => {
    // Should be between auth and rate-limiter
    const pipelineMatch = content.match(/createMiddlewarePipeline\(\[([\s\S]*?)\]\)/);
    expect(pipelineMatch).not.toBeNull();
    const pipeline = pipelineMatch[1];
    const authIdx = pipeline.indexOf('authMiddleware');
    const replicaIdx = pipeline.indexOf('readReplicaRoutingMiddleware');
    const rateIdx = pipeline.indexOf('rateLimiterMiddleware');
    expect(replicaIdx).toBeGreaterThan(authIdx);
    expect(replicaIdx).toBeLessThan(rateIdx);
  });

  test('registers replica-health route', () => {
    expect(content).toContain('"replica-health"');
  });

  test('route count updated to 103', () => {
    expect(content).toContain('103 routes');
  });

  test('injects x-gateway-db-mode header into proxy', () => {
    expect(content).toContain('x-gateway-db-mode');
  });

  test('injects x-gateway-db-target header into proxy', () => {
    expect(content).toContain('x-gateway-db-target');
  });

  test('pipeline comment reflects new middleware order', () => {
    expect(content).toContain('read-replica-routing');
  });
});

// ─── 6. replica-health EF ───────────────────────────────────────────────────

describe('SA-018: Replica Health Edge Function', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(
      path.join(FUNCTIONS, 'replica-health', 'index.ts'),
      'utf-8'
    );
  });

  test('imports from _shared/db-client.ts', () => {
    expect(content).toContain('../_shared/db-client.ts');
  });

  test('imports from _shared/read-replica-middleware.ts', () => {
    expect(content).toContain('../_shared/read-replica-middleware.ts');
  });

  test('calls fn_replica_health_summary RPC', () => {
    expect(content).toContain('fn_replica_health_summary');
  });

  test('exposes health status (healthy/degraded)', () => {
    expect(content).toContain('"healthy"');
    expect(content).toContain('"degraded"');
  });

  test('supports config endpoint with admin auth', () => {
    expect(content).toContain('config');
    expect(content).toContain('Admin access required');
  });

  test('supports reset endpoint with admin auth', () => {
    expect(content).toContain('reset');
    expect(content).toContain('resetReplicaHealth');
  });

  test('uses CORS headers', () => {
    expect(content).toContain('brilliantjobs.app');
  });

  test('uses API_VERSION', () => {
    expect(content).toContain('API_VERSION');
  });
});

// ─── 7. ADR-06 Documentation ────────────────────────────────────────────────

describe('SA-018: ADR-06 Documentation', () => {
  let content;

  beforeAll(() => {
    content = fs.readFileSync(
      path.join(ROOT, 'docs', 'scaling', 'adr-06-pipeline.md'),
      'utf-8'
    );
  });

  test('contains SA-018 section', () => {
    expect(content).toContain('SA-018');
    expect(content).toContain('Read Replica Setup + Query Routing');
  });

  test('marked as IMPLEMENTED', () => {
    expect(content).toContain('IMPLEMENTED');
  });

  test('documents architecture diagram', () => {
    expect(content).toContain('x-gateway-db-mode');
    expect(content).toContain('getDbClient');
  });

  test('documents failover strategy', () => {
    expect(content).toContain('Failover Strategy');
    expect(content).toContain('graceful degradation');
    expect(content).toContain('readWithFallback');
  });

  test('documents route classification', () => {
    expect(content).toContain('Read-Only Route Classification');
    expect(content).toContain('17 routes');
  });

  test('documents monitoring', () => {
    expect(content).toContain('replica_health_log');
    expect(content).toContain('replica_routing_stats');
    expect(content).toContain('v_replica_dashboard');
  });

  test('documents HOOK & SCAR points', () => {
    expect(content).toContain('READ_ONLY_ROUTES');
    expect(content).toContain('readWithFallback');
    expect(content).toContain('Event bus');
  });
});
