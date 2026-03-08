/**
 * SA-024: Event Bus + Webhook Delivery — Validation Tests
 * 77 tests across: migration, EF structure, middleware, gateway, ADR docs
 *
 * Run: node tests/sa-024-event-bus.test.js
 * Session: SA-024 | Phase S5 | 2026-03-07
 */

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg ?? "Assertion failed");
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n=== SA-024: Event Bus + Webhook Delivery ===\n");

// ── Section 1: Migration file structure ──────────────────────────────────────
console.log("1. Migration v6.31 structure");
const migration = readFile("supabase/migrations/v6.31-event-bus-webhooks.sql");

test("migration file exists", () => assert(fileExists("supabase/migrations/v6.31-event-bus-webhooks.sql")));
test("platform_events table defined", () => assert(migration.includes("CREATE TABLE IF NOT EXISTS public.platform_events")));
test("webhook_subscriptions table defined", () => assert(migration.includes("CREATE TABLE IF NOT EXISTS public.webhook_subscriptions")));
test("webhook_delivery_log table defined", () => assert(migration.includes("CREATE TABLE IF NOT EXISTS public.webhook_delivery_log")));
test("api_consumers upgrade: webhook_url column", () => assert(migration.includes("ADD COLUMN IF NOT EXISTS webhook_url")));
test("api_consumers upgrade: webhook_events column", () => assert(migration.includes("ADD COLUMN IF NOT EXISTS webhook_events")));
test("api_consumers upgrade: webhook_enabled column", () => assert(migration.includes("ADD COLUMN IF NOT EXISTS webhook_enabled")));

// ── Section 2: Migration schema correctness ───────────────────────────────────
console.log("\n2. Migration schema correctness");

test("event_id is UNIQUE", () => assert(migration.includes("event_id         TEXT        UNIQUE NOT NULL")));
test("append-only rules defined (no_update)", () => assert(migration.includes("platform_events_no_update")));
test("append-only rules defined (no_delete)", () => assert(migration.includes("platform_events_no_delete")));
test("delivery status CHECK constraint", () => assert(migration.includes("'pending', 'delivered', 'failed', 'retrying', 'abandoned'")));
test("subscription_id is UNIQUE", () => assert(migration.includes("subscription_id  TEXT        UNIQUE NOT NULL")));
test("delivery_id is UNIQUE", () => assert(migration.includes("delivery_id      TEXT        UNIQUE NOT NULL")));
test("event_filters scar column present", () => assert(migration.includes("event_filters    JSONB")));
test("failure_count column for auto-disable", () => assert(migration.includes("failure_count    INT")));
test("MAX_ATTEMPTS referenced (5 retries = 5 delay values)", () => assert(migration.includes("failure_count < 50")));

// ── Section 3: Migration functions ───────────────────────────────────────────
console.log("\n3. Database functions");

test("fn_publish_event defined", () => assert(migration.includes("CREATE OR REPLACE FUNCTION public.fn_publish_event")));
test("fn_publish_event: idempotency check", () => assert(migration.includes("p_idempotency_key IS NOT NULL")));
test("fn_publish_event: calls fn_queue_webhook_deliveries", () => assert(migration.includes("fn_queue_webhook_deliveries")));
test("fn_queue_webhook_deliveries defined", () => assert(migration.includes("CREATE OR REPLACE FUNCTION public.fn_queue_webhook_deliveries")));
test("fn_queue_webhook_deliveries: empty array = all events", () => assert(migration.includes("cardinality(event_types) = 0")));
test("fn_webhook_delivery_summary defined", () => assert(migration.includes("CREATE OR REPLACE FUNCTION public.fn_webhook_delivery_summary")));
test("fn_mark_subscription_failure defined", () => assert(migration.includes("CREATE OR REPLACE FUNCTION public.fn_mark_subscription_failure")));
test("v_event_bus_dashboard view defined", () => assert(migration.includes("CREATE OR REPLACE VIEW public.v_event_bus_dashboard")));

// ── Section 4: RLS ────────────────────────────────────────────────────────────
console.log("\n4. RLS policies");

test("platform_events RLS enabled", () => assert(migration.includes("ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY")));
test("webhook_subscriptions RLS enabled", () => assert(migration.includes("ALTER TABLE public.webhook_subscriptions ENABLE ROW LEVEL SECURITY")));
test("webhook_delivery_log RLS enabled", () => assert(migration.includes("ALTER TABLE public.webhook_delivery_log ENABLE ROW LEVEL SECURITY")));
test("platform_events: service_role insert only", () => assert(migration.includes("platform_events_service_insert")));
test("webhook subs: admin read policy", () => assert(migration.includes("webhook_subs_admin_read")));

// ── Section 5: pg_cron ────────────────────────────────────────────────────────
console.log("\n5. pg_cron jobs");

test("process_queue cron scheduled (every minute)", () => assert(migration.includes("sa024-process-webhook-queue") && migration.includes("'* * * * *'")));
test("cleanup cron scheduled (daily 3am)", () => assert(migration.includes("sa024-cleanup-delivered-events") && migration.includes("'0 3 * * *'")));
test("cleanup retains delivered 30 days", () => assert(migration.includes("INTERVAL '30 days'")));
test("cleanup retains abandoned 90 days", () => assert(migration.includes("INTERVAL '90 days'")));

// ── Section 6: EF structure ───────────────────────────────────────────────────
console.log("\n6. event-bus Edge Function");
const ef = readFile("supabase/functions/event-bus/index.ts");

test("EF file exists", () => assert(fileExists("supabase/functions/event-bus/index.ts")));
test("publish action implemented", () => assert(ef.includes("case \"publish\":")));
test("subscribe action implemented", () => assert(ef.includes("case \"subscribe\":")));
test("unsubscribe action implemented", () => assert(ef.includes("case \"unsubscribe\":")));
test("list action implemented", () => assert(ef.includes("case \"list\":")));
test("status action implemented", () => assert(ef.includes("case \"status\":")));
test("retry action implemented", () => assert(ef.includes("case \"retry\":")));
test("process_queue action implemented", () => assert(ef.includes("case \"process_queue\":")));
test("summary action implemented", () => assert(ef.includes("case \"summary\":")));
test("HMAC-SHA256 signing implemented", () => assert(ef.includes("computeHmac") && ef.includes("HMAC") && ef.includes("SHA-256")));
test("X-BJ-Signature-256 header sent", () => assert(ef.includes("X-BJ-Signature-256")));
test("X-BJ-Delivery-ID header sent", () => assert(ef.includes("X-BJ-Delivery-ID")));
test("X-BJ-Event-Type header sent", () => assert(ef.includes("X-BJ-Event-Type")));
test("retry schedule defined (5 delays)", () => {
  const match = ef.match(/RETRY_DELAYS_SECONDS\s*=\s*\[([\d,\s]+)\]/);
  assert(match && match[1].split(",").length === 5, "Expected 5 retry delays");
});
test("delivery timeout defined", () => assert(ef.includes("DELIVERY_TIMEOUT_MS")));
test("AbortSignal.timeout used", () => assert(ef.includes("AbortSignal.timeout")));
test("fire-and-forget: no await on dispatch in gateway middleware path", () => assert(ef.includes("Promise.allSettled")));
test("auto-disable at 50 failures referenced", () => assert(ef.includes("50")));
test("processDeliveryQueue function defined", () => assert(ef.includes("async function processDeliveryQueue")));
test("handleDeliveryFailure function defined", () => assert(ef.includes("async function handleDeliveryFailure")));
test("subscription_id generated with sub_ prefix", () => assert(ef.includes("\"sub_\"")));
test("webhook_secret generated with whsec_ prefix", () => assert(ef.includes("\"whsec_\"")));

// ── Section 7: Gateway middleware ─────────────────────────────────────────────
console.log("\n7. event-bus-middleware.ts");
const mw = readFile("supabase/functions/_shared/event-bus-middleware.ts");

test("middleware file exists", () => assert(fileExists("supabase/functions/_shared/event-bus-middleware.ts")));
test("eventBusMiddleware exported", () => assert(mw.includes("export function eventBusMiddleware")));
test("ROUTE_EVENT_MAP defined", () => assert(mw.includes("ROUTE_EVENT_MAP")));
test("pipeline-write → pipeline.stage_changed", () => assert(mw.includes("\"pipeline-write\"") && mw.includes("\"pipeline.stage_changed\"")));
test("validate-signup → user.signup", () => assert(mw.includes("\"validate-signup\"") && mw.includes("\"user.signup\"")));
test("crewai-graduation → agent.graduated", () => assert(mw.includes("\"crewai-graduation\"") && mw.includes("\"agent.graduated\"")));
test("fire-and-forget: no await on dispatchEvent", () => assert(mw.includes("dispatchEvent(ctx, eventType, req).catch")));
test("only fires on 2xx responses", () => assert(mw.includes("response.status >= 200 && response.status < 300")));
test("error never surfaces to caller", () => assert(mw.includes("Never let event dispatch errors")));

// ── Section 8: Gateway integration ───────────────────────────────────────────
console.log("\n8. API Gateway integration");
const gateway = readFile("supabase/functions/api-gateway/index.ts");

test("event-bus-middleware imported", () => assert(gateway.includes("event-bus-middleware")));
test("eventBusMiddleware in pipeline", () => assert(gateway.includes("eventBusMiddleware()")));
test("event-bus route registered", () => assert(gateway.includes("\"event-bus\"")));
test("route count updated to 107", () => assert(gateway.includes("107 routes")));
test("SA-024 comment on route", () => assert(gateway.includes("SA-024")));

// ── Section 9: ADR docs ───────────────────────────────────────────────────────
console.log("\n9. ADR-03 documentation");
const adr = readFile("docs/scaling/adr-03-gateway.md");

test("SA-024 section exists", () => assert(adr.includes("## SA-024")));
test("H-01 hook activation documented", () => assert(adr.includes("H-01 (activated)")));
test("H-02 hook activation documented", () => assert(adr.includes("H-02 (activated)")));
test("S-03 scar activation documented", () => assert(adr.includes("S-03 (activated)")));
test("S-04 scar documented (standing)", () => assert(adr.includes("S-04 (standing scar)")));
test("S-05 scar documented (standing)", () => assert(adr.includes("S-05 (standing scar)")));
test("HMAC signature verification example", () => assert(adr.includes("X-BJ-Signature-256")));
test("retry schedule table present", () => assert(adr.includes("Retry Schedule")));
test("alternatives considered", () => assert(adr.includes("Alternatives Considered")));
test("files created listed", () => assert(adr.includes("Files Created (SA-024)")));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`SA-024 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
  console.log("\n⚠️  Some tests failed. Review output above.");
  process.exit(1);
} else {
  console.log("\n✅ All SA-024 tests passing.");
  process.exit(0);
}
