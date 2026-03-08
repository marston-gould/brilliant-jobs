# Brilliant Jobs — Architecture Blueprint
# Hook & Scar Standards Reference

> **Last updated:** SA-027 | 2026-03-08
> **Authority:** Chief Architect + Lead Platform Engineer
> **Purpose:** Single authoritative reference for all hook points (H-01–H-15), scar locations (S-01–S-16), interface contracts, extension scenarios, and integration standards. Any change to a hook or scar location MUST be reflected here first and gated by FF-01 and FF-02 in CI.

---

## Quick Reference

| Type | Count | Active | Ready | Dormant |
|------|-------|--------|-------|---------|
| **Hooks (H-)** | 15 | 9 | 5 | 1 |
| **Scars (S-)** | 16 | 3 | 9 | 4 |

---

## Part 1: Hook Point Registry

A **hook** is a pre-planned extension point with a stable interface contract. Adding a new integration means _activating_ a hook — implementing against its interface without changing the hook itself. Hooks are protected by FF-01 in CI.

### H-01 — Gateway Middleware Pipeline
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/api-gateway/index.ts` — `middlewareStack` array |
| **Status** | ✅ ACTIVE (4 middleware layers: auth, rate-limit, read-replica routing, feature-flags) |
| **Interface** | `MiddlewarePlugin: { name: string; execute(ctx: GatewayContext): Promise<GatewayContext \| Response> }` |
| **Activated in** | SA-004 (auth/rate-limit), SA-018 (read-replica), SA-024 (event bus), SA-025 (feature flags) |
| **Extension scenario** | Insert new cross-cutting concerns (A/B testing, request tracing, canary routing) as middleware entries. Never modify existing middleware to add new concerns. |

**Interface contract:**
```typescript
interface MiddlewarePlugin {
  name: string;  // kebab-case, unique, used in logs
  execute(ctx: GatewayContext): Promise<GatewayContext | Response>;
  // Return Response to short-circuit. Return ctx to continue pipeline.
}

// Register:
const middlewareStack: MiddlewarePlugin[] = [
  requestLogger,
  authMiddleware,
  rateLimiter,
  readReplicaRoutingMiddleware,  // H-01 activation: SA-018
  featureFlagMiddleware,          // H-01 activation: SA-025
  // → next middleware added here
];
```

**Extension rule:** New middleware is appended after `featureFlagMiddleware`. Auth and rate-limit are immovable — they are always positions 1 and 2.

---

### H-02 — fn_publish_event (Database Event Bus)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.31-event-bus-webhooks.sql` — `fn_publish_event()` |
| **Status** | ✅ ACTIVE |
| **Interface** | `fn_publish_event(event_type, source, payload, metadata, idempotency_key)` |
| **Activated in** | SA-024 (event bus middleware fires events post-response) |
| **Extension scenario** | Any Edge Function that needs to emit events for downstream consumers calls this directly. No schema change required for new event types — just pass a new `event_type` string. |

**Interface contract:**
```sql
SELECT fn_publish_event(
  'job.scored',         -- event_type (dot-namespaced)
  'match-score-overlay', -- source (EF name)
  jsonb_build_object('job_id', $1, 'score', $2),  -- payload
  jsonb_build_object('user_id', $3),               -- metadata
  $4::uuid             -- idempotency_key (prevents duplicate events on retry)
);
```

**Event taxonomy conventions:**
- Format: `domain.action` (e.g., `job.ingested`, `user.registered`, `agent.graduated`)
- Source: Edge Function name (kebab-case)
- Payload: domain-specific fields only
- Metadata: cross-cutting fields (user_id, session_id, tenant_id)

---

### H-03 — Feature Flag Gateway Injection
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/_shared/feature-flag-middleware.ts` — `FLAG_AWARE_ROUTES` set |
| **Status** | ✅ ACTIVE |
| **Interface** | Add route to `FLAG_AWARE_ROUTES`; downstream EF calls `parseFlagHeader(req)` |
| **Activated in** | SA-025 (feature-flag-middleware inserted into H-01 pipeline) |
| **Extension scenario** | Make any EF flag-aware without modifying gateway core. Add its route name to `FLAG_AWARE_ROUTES`. The middleware injects `x-gateway-flags: <base64-encoded-flag-map>`. EF decodes with `parseFlagHeader()`. |

**Interface contract:**
```typescript
// Feature flag middleware (feature-flag-middleware.ts)
const FLAG_AWARE_ROUTES = new Set([
  'chat-job-search',
  'preview-jobs',
  // → add new flag-aware routes here (S-06)
]);

// Consuming EF:
import { parseFlagHeader } from '../_shared/feature-flag-middleware.ts';

const flags = parseFlagHeader(req);
if (flags['new-scoring-algorithm']) {
  // use new path
}
```

---

### H-04 — AtsHandler Interface (Extension ATS Integrations)
| Property | Value |
|----------|-------|
| **Location** | `extension/types/index.d.ts` — `AtsHandler` interface |
| **Status** | ✅ ACTIVE (Greenhouse, Lever, Workday, BambooHR, JazzHR) |
| **Interface** | `AtsHandler: { detect(): boolean; fillField(type, value): FillResult; submit(): Promise<boolean> }` |
| **Activated in** | SA-022 (TypeScript conversion) |
| **Extension scenario** | Add a new ATS by creating `extension/handlers/new-ats.ts` implementing `AtsHandler`. Register in the handler map. Zero changes to calling code. |

**Interface contract:**
```typescript
interface AtsHandler {
  detect(): boolean;           // Returns true if current page is this ATS
  fillField(
    type: FieldType,
    value: string,
    selector?: string
  ): FillResult;               // Returns { success, field, value, error? }
  submit(): Promise<boolean>;  // Triggers ATS form submission
  getName(): string;           // e.g. 'greenhouse'
}

// Register new handler:
const handlers: AtsHandler[] = [
  new GreenhouseHandler(),
  new LeverHandler(),
  // → new ATS here
];
```

---

### H-05 — _shared/types.ts (EF Shared Type System)
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/_shared/types.ts` |
| **Status** | ✅ ACTIVE (46 EF files import shared types) |
| **Interface** | Re-export domain types; EFs import from `'../_shared/types.ts'` |
| **Activated in** | SA-022 (TypeScript migration) |
| **Extension scenario** | Add new domain types to `_shared/types.ts`. All EFs automatically get type safety. Never define types inline in individual EFs. |

**Interface contract:**
```typescript
// In _shared/types.ts — add new domain type:
export interface NewDomainRow {
  id: string;
  created_at: string;
  // ...fields
}

// In consuming EF:
import type { NewDomainRow, JobRow } from '../_shared/types.ts';
```

---

### H-06 — DataProvider React Context (Frontend Data Abstraction)
| Property | Value |
|----------|-------|
| **Location** | `src/app/providers/types.ts` + `src/app/providers/DataProvider.tsx` |
| **Status** | ✅ ACTIVE (SearchProvider, JobProvider, UserProvider, PipelineProvider) |
| **Interface** | Implement provider interface; register in `DataProvider.tsx` |
| **Activated in** | SA-013 (SPA scaffold) |
| **Extension scenario** | Add new data domain (e.g., NotificationsProvider) by implementing `NotificationsProvider` interface and registering in the context tree. Components never change. |

**Interface contract:**
```typescript
// In providers/types.ts — define new provider:
export interface NotificationsProvider {
  notifications: Notification[];
  unreadCount: number;
  markRead(id: string): Promise<void>;
  refresh(): void;
}

// In DataProvider.tsx — implement and register:
const notifications = useSupabaseNotifications();  // implements interface
// Pass to context

// In component:
const { notifications } = useProviders();  // H-06 consumer
```

---

### H-07 — fn_cost_guardian_summary() (Agent RPC Pattern)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.29-crewai-agents-4-5.sql` |
| **Status** | ✅ ACTIVE |
| **Interface** | JSONB-returning RPC; callable by orchestrator and admin panel without duplication |
| **Activated in** | SA-020 |
| **Extension scenario** | Every new agent exposes a `fn_{agent_name}_summary()` RPC. This is the standard interface for admin panel data, orchestrator polling, and evolvability reviews. |

**Interface contract:**
```sql
-- Pattern for new agent summary RPC:
CREATE OR REPLACE FUNCTION fn_{agent_name}_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'agent', '{agent_name}',
    'checked_at', now(),
    'status', '...',
    -- domain-specific subsections:
    'subsection_1', (...),
    'subsection_2', (...)
  ) INTO result;
  RETURN result;
END;
$$;

-- Usage (orchestrator or admin panel — identical call):
SELECT fn_{agent_name}_summary();
```

---

### H-08 — enrichment_queue.enrich_type (Enrichment Pipeline Extension)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.22-dedup-enrichment-queue.sql` — `enrichment_queue` table |
| **Status** | 🟡 READY (only `ai_enhancement` active; `salary_norm`, `geocode` structurally ready) |
| **Interface** | Insert row with new `enrich_type` value; implement handler branch in `dedup-promote` EF |
| **Activated in** | SA-008 |
| **Extension scenario** | Add salary normalization: insert rows with `enrich_type = 'salary_norm'`; add handler branch in `dedup-promote/index.ts`. Queue, retry logic, and SKIP LOCKED concurrency are inherited automatically. |

**Interface contract:**
```typescript
// New enrichment type in dedup-promote EF:
async function processEnrichmentBatch(batch: EnrichmentQueueRow[]) {
  for (const item of batch) {
    switch (item.enrich_type) {
      case 'ai_enhancement':
        await enrichWithAI(item);
        break;
      case 'salary_norm':        // ← new type (H-08 activation)
        await normalizeSalary(item);
        break;
      // → add new enrich_type cases here
    }
  }
}
```

---

### H-09 — extraction_method Field (CC Parser Extension)
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/ingest-common-crawl/index.ts` — `extractionMethod` field |
| **Status** | 🟡 READY (`html_parse` active; `warc`, `rss` supported) |
| **Interface** | Add new parser function; register in `extractionMethod` dispatch |
| **Activated in** | SA-007 |
| **Extension scenario** | Add RSS feed ingestion: implement `parseRss(url)` returning `StagingJob[]`; add `case 'rss'` to dispatch. CC staging table records `extraction_method = 'rss'` for observability. |

---

### H-10 — x-gateway-* Headers (EF Context Contract)
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/api-gateway/index.ts` — header injection; `supabase/functions/_shared/types.ts` — `GatewayHeaders` type |
| **Status** | 🟡 READY (headers injected; EF-side migration to trust gateway auth pending S-01) |
| **Interface** | EFs read `req.headers.get('x-gateway-db-mode')`, `x-gateway-flags`, `x-gateway-auth-user-id` |
| **Activated in** | SA-004 (typing), SA-018 (db-mode populated) |
| **Extension scenario** | When S-01 activates (EFs trust gateway auth), all inline auth checks are replaced by `req.headers.get('x-gateway-auth-user-id')`. Zero EF logic changes — just remove the local Supabase auth call. |

**Interface contract:**
```typescript
// Standard gateway headers available to all EFs:
interface GatewayHeaders {
  'x-gateway-auth-user-id'?: string;    // auth'd user (when S-01 activates)
  'x-gateway-auth-role'?: string;       // 'authenticated' | 'anon' | 'service_role'
  'x-gateway-db-mode'?: 'read' | 'write';
  'x-gateway-db-target'?: 'replica' | 'primary';
  'x-gateway-flags'?: string;           // base64 encoded flag map
  'x-gateway-request-id'?: string;      // trace ID (planned)
}
```

---

### H-11 — checkFraudPatterns() Hook Block (Agent Auto-Ban)
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/crewai-referral-pipeline/index.ts` — comment block after fraud detection |
| **Status** | 🔲 DORMANT (activation requires agent graduation to `auto` trust level) |
| **Interface** | 5-line injection: set `executed = true` for fraud auto-ban action |
| **Activated in** | SA-021 (defined); activation: when referral-pipeline agent reaches `auto` level |
| **Extension scenario** | When agent graduates: uncomment the `executed: true` path in fraud check. CrewAI graduation framework enforces that this can only happen post-graduation. |

---

### H-12 — cc_run_dedup_batch() Threshold Parameter
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.22-dedup-enrichment-queue.sql` — `cc_run_dedup_batch(threshold FLOAT)` |
| **Status** | ✅ ACTIVE |
| **Interface** | Pass `threshold` (0.0–1.0) from calling EF; no code changes for tuning |
| **Activated in** | SA-008 |
| **Extension scenario** | Tune dedup sensitivity per batch source: CC batches use 0.7; future high-quality ATS data can use 0.85 without code changes. |

---

### H-13 — refresh_type in mv_refresh_log
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/` — `mv_refresh_log.refresh_type` column |
| **Status** | 🟡 READY (`incremental`, `full` active; `partial` ready) |
| **Interface** | Pass `refresh_type := 'partial'` to `fn_refresh_mv_incremental()` to target specific dimensions |
| **Activated in** | SA-009 |
| **Extension scenario** | When job count exceeds 500K, targeted refresh: refresh only `mv_source_breakdown` without touching `mv_job_feed_counts`. Zero schema change. |

---

### H-14 — vendor_cost_budgets.track_via Column
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.29-crewai-agents-4-5.sql` — `vendor_cost_budgets.track_via` |
| **Status** | 🟡 READY (all entries `manual`; `vault_api`, `stripe_webhook` supported) |
| **Interface** | Update `track_via` to `'vault_api'` + add API fetch logic in cost-guardian EF |
| **Activated in** | SA-020 |
| **Extension scenario** | Automate Anthropic spend tracking: update `track_via = 'vault_api'` for Anthropic row; add API fetch branch in cost-guardian. Manual fallback remains for vendors without APIs. |

---

### H-15 — fn_referral_pipeline_summary() (Cross-Agent Aggregation)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.30-crewai-referral-pipeline.sql` |
| **Status** | ✅ ACTIVE |
| **Interface** | Orchestrator calls all agent `fn_*_summary()` RPCs to build cross-agent reports |
| **Activated in** | SA-021 |
| **Extension scenario** | Orchestrator aggregates cross-agent correlated data: "fraud spike + pipeline stall + cost spike in same 24h window = coordinated attack signal." No EF changes needed. |

---

## Part 2: Scar Location Registry

A **scar** is a visible architectural seam — a column, field, comment, or interface that documents future expansion without implementing it prematurely. Scars are protected by FF-02 in CI.

**States:**
- ✅ ACTIVE — scar has been used (graduated to active feature)
- 🟡 READY — scar is structurally present, activation criteria known
- 🔲 ON-DEMAND — activation requires explicit product decision

### S-01 — x-gateway-* Auth Trust (EF Auth Migration)
| Property | Value |
|----------|-------|
| **Location** | Every EF that calls `supabase.auth.getUser()` inline |
| **Status** | 🟡 READY — activation: 30+ days post-launch production validation |
| **Activation** | Remove inline `supabase.auth.getUser()` calls; read `x-gateway-auth-user-id` header instead |
| **Risk** | HIGH — touches ~60 EFs. Requires dedicated SA session. Do NOT activate organically. |
| **Note** | This is the highest-risk scar activation in the system. Schedule as `SA-030` or equivalent. |

---

### S-02 — parseJson<T>() Generic JSON Parse
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/_shared/types.ts` — `parseJson<T>()` |
| **Status** | 🟡 READY — propagate to remaining EFs using raw `JSON.parse()` |
| **Activation** | Replace `JSON.parse(str) as T` with `parseJson<T>(str)` across EFs (safe fallback included) |

---

### S-03 — GatewayContext.eventBus (Typed Event Bus Context)
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/api-gateway/index.ts` — `GatewayContext` type |
| **Status** | ✅ ACTIVE (SA-024: event-bus-middleware wired to context) |

---

### S-04 — webhook_subscriptions.event_filters JSONB (Content-Based Filtering)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.31-event-bus-webhooks.sql` — `webhook_subscriptions.event_filters` |
| **Status** | 🟡 READY |
| **Activation** | Implement `matchesEventFilters(subscription, event)` in `event-bus/index.ts`; column already exists |
| **Scenario** | Consumer subscribes to `job.ingested` events WHERE `payload->>'source' = 'common_crawl'` only |

---

### S-05 — platform_events.routing_key (Topic Fan-Out)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.31-event-bus-webhooks.sql` — comment placeholder in `fn_queue_webhook_deliveries` |
| **Status** | 🔲 ON-DEMAND (activate when event volume justifies partitioned fan-out) |
| **Activation** | Add `routing_key` column to `platform_events`; update `fn_queue_webhook_deliveries` to filter by topic |

---

### S-06 — FLAG_AWARE_ROUTES Expansion
| Property | Value |
|----------|-------|
| **Location** | `supabase/functions/_shared/feature-flag-middleware.ts` — `FLAG_AWARE_ROUTES` Set |
| **Status** | 🟡 READY (6 routes active; expand as needed) |
| **Activation** | Add route name to Set. Zero other changes. Flag injection automatic. |

---

### S-07 — PostHog Remote Flags Swap
| Property | Value |
|----------|-------|
| **Location** | `src/app/providers/FeatureFlagProvider.tsx` — `fn_evaluate_all_flags()` call |
| **Status** | 🟡 READY |
| **Activation** | Replace `fn_evaluate_all_flags()` with `posthog.getAllFlags()` in `FeatureFlagProvider`. The `featureFlagMiddleware` hook remains; only the source changes. |
| **Trigger** | When PostHog's statistical significance engine is needed for experiments |

---

### S-08 — flag_evaluation_log.posthog_synced (Experiment Sync)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.32-feature-flags.sql` — `flag_evaluation_log.posthog_synced` |
| **Status** | 🔲 ON-DEMAND |
| **Activation** | Implement batch-sync job that reads `posthog_synced = false` rows and sends to PostHog Experiments API |

---

### S-09 — flag_assignments.expires_at (Time-Bounded Experiments)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.32-feature-flags.sql` — `flag_assignments.expires_at` |
| **Status** | 🟡 READY |
| **Activation** | `fn_evaluate_flag()` already checks `expires_at`; create flags with `expires_at` set to enable auto-expiry |

---

### S-10 — DataProvider Interface Swap (Backend Migration)
| Property | Value |
|----------|-------|
| **Location** | `src/app/providers/types.ts` — provider interfaces |
| **Status** | 🟡 READY |
| **Activation** | Implement providers against direct API instead of Supabase client; swap in `DataProvider.tsx`. Components never change. |
| **Trigger** | When moving to a dedicated API layer (post-launch scale milestone) |

---

### S-11 — canny_sync_log.agent_suggested_response (Draft Delivery)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.29-crewai-agents-4-5.sql` — `canny_sync_log.agent_suggested_response` |
| **Status** | 🟡 READY (field exists; Canny API delivery pending agent graduation) |
| **Activation** | Content QA agent graduates to `suggest` mode; add Canny API POST in user-support EF |

---

### S-12 — vendor_cost_budgets.api_endpoint (Automated Cost Pull)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.29-crewai-agents-4-5.sql` — `vendor_cost_budgets.api_endpoint` |
| **Status** | 🔲 ON-DEMAND |
| **Activation** | Populate `api_endpoint` URL + implement fetch branch in cost-guardian (keyed by `track_via = 'vault_api'`) |

---

### S-13 — fn_partition_health() (CrewAI Integration)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.28-ats-jobs-partitioning.sql` |
| **Status** | ✅ ACTIVE (data-freshness agent uses it) |

---

### S-14 — v_partition_stats View (Capacity Modeling)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.28-ats-jobs-partitioning.sql` — `v_partition_stats` |
| **Status** | 🟡 READY (SA-028 capacity model will query this view) |

---

### S-15 — replica_routing_stats Table (SLA Reporting)
| Property | Value |
|----------|-------|
| **Location** | `supabase/migrations/v6.27-read-replica-monitoring.sql` — `replica_routing_stats` |
| **Status** | 🟡 READY (post-launch: query pattern review → SLA dashboards) |

---

### S-16 — GRADUATED_AGENTS List (FF-05 Fitness Function)
| Property | Value |
|----------|-------|
| **Location** | `scripts/ff-05-crewai-observe-guard.mjs` — `GRADUATED_AGENTS` array |
| **Status** | 🔲 ON-DEMAND (empty until first agent graduates) |
| **Activation** | When Marston graduates an agent: add agent name to `GRADUATED_AGENTS` list + add HANDOFF.md note |

---

## Part 3: Interface Contracts

### 3.1 Gateway Middleware Contract

```typescript
// GatewayContext — the shared state flowing through the middleware pipeline
interface GatewayContext {
  req: Request;
  routeKey: string;
  targetFunction: string;
  userId?: string;
  userRole?: 'authenticated' | 'anon' | 'service_role';
  dbMode?: 'read' | 'write';
  dbTarget?: 'replica' | 'primary';
  flags?: Record<string, boolean | string>;
  eventBus?: EventBusClient;  // S-03 — activated SA-024
  requestId?: string;         // planned — x-gateway-request-id
}

// Middleware contract:
type MiddlewareFn = (ctx: GatewayContext) => Promise<GatewayContext | Response>;
// → Return Response: pipeline stops, response returned to client
// → Return ctx: pipeline continues with mutated context
```

### 3.2 Agent Contract

Every CrewAI agent MUST conform to this contract:

```typescript
// Agent Edge Function contract:
interface AgentAction {
  action: 'check' | 'status' | 'summary';
}

// Required:
// 1. An agent_config row in the database (observe | suggest | auto | autonomous)
// 2. A fn_{agent_name}_summary() RPC (H-07 pattern)
// 3. executed: false in all action branches while in observe mode (FF-05 guard)
// 4. All significant actions logged to agent_action_log

// Observe mode contract — NEVER bypassed without graduation:
const agentConfig = await getAgentConfig(agentName);
if (agentConfig.executed === false) {
  // OBSERVE MODE: analyze and log, never act
  await logAction(agentName, 'would_have_done', analysis);
  return { observed: true, analysis };
}
// ACTIVE MODE: only reached after graduation approval
```

### 3.3 Edge Function Contract

Every new Edge Function MUST follow this structure:

```typescript
// Standard EF structure:
import { createClient } from '@supabase/supabase-js';
import { getReadClient, getWriteClient } from '../_shared/db-client.ts';
import type { NewDomainRow } from '../_shared/types.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // 2. Auth (until S-01 activates — then trust x-gateway-auth-user-id)
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader ?? '' } }
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return new Response('Unauthorized', { status: 401 });

    // 3. Route action
    const { action, ...params } = await req.json();
    const db = getReadClient();  // or getWriteClient() for mutations

    // 4. Handle
    switch (action) {
      case 'status': return json(await getStatus(db));
      default: return new Response('Unknown action', { status: 400 });
    }
  } catch (err) {
    // 5. Never swallow errors — log and return structured error
    console.error('[ef-name]', err);
    return json({ error: err.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### 3.4 React Page Contract

Every new dashboard/admin page MUST follow this structure:

```typescript
// Page component contract:
// 1. PageName.tsx — main container (loading/error states, component orchestration)
// 2. components/ — individual components (no window.* access, data via props)
// 3. hooks/usePageName.ts — bridge hook (window.* reads, 3s poll, cleanup)
// 4. index.ts — barrel export

// Hook contract:
export function usePageName() {
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      // Bridge: read from window.* globals (legacy compat)
      const rawData = window.pageNameCache;
      if (rawData) setData(transformData(rawData));
      setLoading(false);
    };

    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);  // cleanup required
  }, []);

  return { data, loading };
}

// Component contract (NEVER access window.* directly):
export function PageComponent({ data }: { data: PageData }) {
  // All data via props. All colors via CSS custom properties.
  // No inline styles except data-driven dynamic values.
  return <div className="bg-bg-card text-text">...</div>;
}
```

### 3.5 Database Migration Contract

Every new migration MUST follow this structure:

```sql
-- Migration: v6.XX-description.sql
-- Author: SA-0XX session
-- Purpose: one-sentence description

-- IDEMPOTENCY: Always use IF NOT EXISTS / OR REPLACE
CREATE TABLE IF NOT EXISTS new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  -- domain columns
);

-- RLS: Always define policies (never leave table unprotected)
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read" ON new_table FOR SELECT USING (true);
CREATE POLICY "admin_manage" ON new_table USING (auth.jwt()->>'role' = 'service_role');

-- INDEXES: Always define for FK columns and query hot paths
CREATE INDEX IF NOT EXISTS idx_new_table_created_at ON new_table(created_at DESC);

-- AGENT HOOK: Log migration event for CrewAI observability
INSERT INTO agent_action_log (agent_name, action_type, summary, metadata)
VALUES ('system', 'migration', 'v6.XX applied', '{"session": "SA-0XX"}');
```

---

## Part 4: Extension Scenarios

### Scenario A: Add a New CrewAI Agent

1. **Database** (`v6.XX-crewai-{name}.sql`):
   - Insert into `agent_config` (observe mode, executed=false)
   - Insert into `api_consumers` + `agent_credentials`
   - Create `fn_{name}_summary()` RPC (H-07)
   - Add pg_cron schedule
   - Log to `agent_action_log`

2. **Edge Function** (`supabase/functions/crewai-{name}/index.ts`):
   - Actions: `check`, `status`, `summary`
   - Never set `executed: true` until graduation (FF-05 guard)
   - Log all observations to `agent_action_log`

3. **Gateway** (`api-gateway/index.ts`):
   - Add route `'crewai-{name}': 'crewai-{name}'`

4. **Admin UI** (`js/admin-crewai.js`):
   - Add `refresh{Name}()` function reading from `fn_{name}_summary()` RPC
   - Admin panel picks up automatically via `v_agent_dashboard`

5. **ADR-05** — add SA-0XX section documenting decision

6. **Test** — `tests/sa-0XX-{name}-agent.test.js`

---

### Scenario B: Add a New ATS to the Extension

1. Create `extension/handlers/new-ats.ts` implementing `AtsHandler` (H-04)
2. Add `detect()` signature (URL pattern + DOM element check)
3. Register in handler registry in `extension/content.ts`
4. Add to `extension/selectors/new-ats.ts` with field mappings
5. Test: add to `tests/` — 20+ assertions (detect, fill, submit, edge cases)

---

### Scenario C: Add a New Feature Flag to the System

1. Insert into `feature_flags` table (status='draft' always)
2. Add route to `FLAG_AWARE_ROUTES` if EF needs flag injection (S-06)
3. Use `useFeatureFlag('flag-key', defaultValue)` in React components
4. Or use `parseFlagHeader(req)` in EF for server-side gating
5. Set `status='active'` when ready to roll out (never in migration — always manual)

---

### Scenario D: Add a New Gateway Middleware Plugin

1. Create `supabase/functions/_shared/{name}-middleware.ts`
2. Implement `MiddlewarePlugin` interface (H-01)
3. Append to `middlewareStack` in `api-gateway/index.ts` after `featureFlagMiddleware`
4. Update `GatewayContext` interface with new fields if needed
5. Update FF-06 (ADR compliance check) if new ADR needed
6. Update FF-01 hook integrity check if new hook points added

---

### Scenario E: Activate S-01 (EF Auth Trust Migration)

> **⚠️ HIGH RISK — requires dedicated SA session. Do NOT activate organically.**

1. **Phase 1:** Dual-read mode — EF reads BOTH inline auth AND gateway header; logs mismatches
2. **Phase 2:** Production validation — 30 days, mismatch rate < 0.01%
3. **Phase 3:** Switch — EFs trust `x-gateway-auth-user-id`; remove inline auth calls
4. **Rollback plan:** Re-enable inline auth fallback via feature flag (H-03)
5. **EFs affected:** ~60 (identified in technical debt register TD-002)

---

## Part 5: Implementation Standards

### 5.1 Hook Naming Convention
- `H-XX` — numeric, sequential, assigned in ADR that creates the hook
- Hook names in code: camelCase function/interface name documented here
- FF-01 checks physical location — keep this document and FF-01 in sync

### 5.2 Scar Naming Convention
- `S-XX` — numeric, sequential, assigned in ADR that creates the scar
- Scar comments in code: `// SCAR S-XX: <description>` on the relevant line
- FF-02 checks for scar comment presence at documented location

### 5.3 ADR Convention
- One ADR per major architectural domain
- All hook/scar points for that domain documented in the ADR's "Hook & Scar Points" section
- SA-0XX section added when work activates hooks/creates scars in that domain
- Never overwrite prior SA sections — append only

### 5.4 When to Create a Hook vs. a Scar

| Situation | Create |
|-----------|--------|
| Extension mechanism is known, interface is stable, will be used ≥2 times | **Hook** |
| Future need is anticipated but product decision not made | **Scar** |
| Technical debt that needs planned activation | **Scar** |
| External integration point (ATS, API, webhook) with stable contract | **Hook** |
| Internal implementation detail that may change | Neither — inline comment only |

### 5.5 Fitness Function Maintenance
When adding a new hook or scar:
1. Update this document (Part 1 or 2)
2. Update `scripts/ff-01-hook-integrity.mjs` (add location to `HOOK_DEFINITIONS`)
3. Update `scripts/ff-02-scar-integrity.mjs` (add location to `SCAR_DEFINITIONS`)
4. Run `npx vitest run tests/sa-026-fitness-functions.test.js` — update MIN thresholds if needed
5. CI will enforce going forward

---

## Part 6: Architectural Boundaries

These rules are enforced by FF-08 in CI:

1. **Bridge pattern** — React components never access `window.*` directly. All window.* access is in hooks.
2. **Shared types** — EFs never define types inline. All types live in `_shared/types.ts`.
3. **No BJ globals in components** — `window.BJ` is a migration bridge, not a permanent API.
4. **Agent observe mode** — Agents in observe mode never set `executed: true`. Graduation is explicit.
5. **Hook interfaces are immutable once active** — Changing an active hook interface requires a new ADR.
6. **Scars are never silently removed** — Removing a scar requires updating FF-02, this document, and a HANDOFF.md note.

---

## Appendix: Hook & Scar Cross-Reference

| ADR | Hooks Created | Scars Created |
|-----|--------------|---------------|
| ADR-01 (Search) | — | — (Typesense deferred) |
| ADR-02 (SPA) | H-06 | S-10 |
| ADR-03 (Gateway) | H-01, H-10 | S-01, S-04 (gateway-level) |
| ADR-04 (TypeScript) | H-04, H-05 | S-02 |
| ADR-05 (CrewAI) | H-02, H-07, H-11, H-15 | S-05 (agent_type), S-07 (config JSONB), S-11 |
| ADR-06 (Pipeline) | H-08, H-09, H-12, H-13, H-14 | S-08, S-09, S-12, S-13, S-14, S-15 |
| ADR-07 (Dedup) | H-12 | S-08 |
| ADR-08 (Feature Flags) | H-03 | S-06, S-07, S-08, S-09, S-10, S-11 |
| ADR-08b (Incremental MVs) | H-13 | S-09 |
| ADR-09 (Fitness Functions) | — | S-16 |
| **SA-024 (Event Bus)** | H-02 (activate) | S-03 (activate), S-04, S-05 |
