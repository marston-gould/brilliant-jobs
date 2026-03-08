# Hook & Scar Integration Templates

> **Last updated:** SA-027 | 2026-03-08
> Copy-paste starting points for each extension type. Always check the Architecture Blueprint for current interface contracts before using.

---

## Template 1: New CrewAI Agent

### 1a. Migration (`v6.XX-crewai-{name}.sql`)

```sql
-- Agent: {agent-name}
-- Purpose: {one-sentence description}
-- Session: SA-0XX

-- Agent config (observe mode always)
INSERT INTO agent_config (agent_name, agent_type, status, schedule, executed, config)
VALUES (
  '{agent-name}',
  'monitor',  -- 'monitor' | 'enricher' | 'communicator' | 'analyzer'
  'active',
  '*/30 * * * *',  -- cron schedule
  false,           -- NEVER true until graduation
  '{"check_window_hours": 24}'::JSONB
) ON CONFLICT (agent_name) DO NOTHING;

-- API consumer
INSERT INTO api_consumers (consumer_name, consumer_type, rate_limit_per_minute)
VALUES ('{agent-name}', 'crewai_agent', 60)
ON CONFLICT (consumer_name) DO NOTHING;

-- Link credentials
INSERT INTO agent_credentials (agent_name, consumer_id)
SELECT '{agent-name}', id FROM api_consumers WHERE consumer_name = '{agent-name}'
ON CONFLICT DO NOTHING;

-- Summary RPC (H-07 pattern)
CREATE OR REPLACE FUNCTION fn_{agent_name}_summary()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'agent', '{agent-name}',
    'checked_at', now(),
    'status', 'ok',
    'findings', (
      SELECT jsonb_agg(row_to_json(r))
      FROM (SELECT /* domain query */ ) r
    )
  ) INTO result;
  RETURN result;
END;
$$;

-- pg_cron schedule
SELECT cron.schedule(
  '{agent-name}-check',
  '*/30 * * * *',
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/crewai-{name}',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')),
    body := '{"action":"check"}'::JSONB
  )$$
);

-- Audit log
INSERT INTO agent_action_log (agent_name, action_type, summary, metadata)
VALUES ('system', 'migration', 'crewai-{name} agent created', '{"session": "SA-0XX"}');
```

### 1b. Edge Function (`supabase/functions/crewai-{name}/index.ts`)

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getReadClient } from '../_shared/db-client.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AGENT_NAME = 'crewai-{name}';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { action } = await req.json().catch(() => ({ action: 'check' }));

    // Fetch agent config — observe mode gate
    const { data: config } = await db
      .from('agent_config')
      .select('executed, status, config')
      .eq('agent_name', AGENT_NAME)
      .single();

    if (config?.status !== 'active') {
      return json({ status: 'inactive', agent: AGENT_NAME });
    }

    switch (action) {
      case 'check': return json(await runChecks(db, config));
      case 'status': return json(await getStatus(db));
      case 'summary': {
        const { data } = await db.rpc(`fn_{agent_name}_summary`);
        return json(data);
      }
      default: return new Response('Unknown action', { status: 400 });
    }
  } catch (err) {
    console.error(`[${AGENT_NAME}]`, err);
    return json({ error: String(err) }, 500);
  }
});

async function runChecks(db: ReturnType<typeof createClient>, config: Record<string, unknown>) {
  const findings: string[] = [];

  // OBSERVE MODE: analyze and log, never act
  // Even if config.executed === true, never take destructive actions
  // without Marston approval per graduation protocol

  // --- Check 1: {description} ---
  const { data: check1Data } = await db.from('{table}').select('*').limit(100);
  if (/* condition */) {
    findings.push('{finding description}');

    await db.from('agent_action_log').insert({
      agent_name: AGENT_NAME,
      action_type: 'observation',
      summary: '{what was found}',
      metadata: { executed: config.executed }
    });

    // ONLY if config.executed === true (post-graduation):
    if (config.executed) {
      // await takeAction(...);
    }
  }

  return { agent: AGENT_NAME, findings, executed: config.executed };
}

async function getStatus(db: ReturnType<typeof createClient>) {
  const { data } = await db.from('agent_config')
    .select('*')
    .eq('agent_name', AGENT_NAME)
    .single();
  return { agent: AGENT_NAME, config: data };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
```

### 1c. Gateway Route (`api-gateway/index.ts`)

```typescript
// Add to route registry (keep alphabetical within domain group):
'crewai-{name}': 'crewai-{name}',  // Agent N: {description}
```

---

## Template 2: New Gateway Middleware Plugin

```typescript
// supabase/functions/_shared/{name}-middleware.ts

import type { GatewayContext } from './types.ts';

// H-01 activation: {describe what this middleware adds to context}
export async function {name}Middleware(
  ctx: GatewayContext
): Promise<GatewayContext | Response> {
  // Extend context — never throw, degraded mode on failure
  try {
    const newContextField = await computeSomething(ctx.req);
    return { ...ctx, {fieldName}: newContextField };
  } catch (err) {
    console.warn('[{name}-middleware] degraded mode:', err);
    return ctx;  // continue pipeline without the new context field
  }
}

// Register in api-gateway/index.ts:
// const middlewareStack = [
//   requestLogger,
//   authMiddleware,
//   rateLimiter,
//   readReplicaRoutingMiddleware,
//   featureFlagMiddleware,
//   {name}Middleware,  // ← append here
// ];
```

---

## Template 3: New ATS Handler

```typescript
// extension/handlers/{ats-name}.ts

import type { AtsHandler, FieldType, FillResult } from '../types/index';

export class {AtsName}Handler implements AtsHandler {
  getName(): string { return '{ats-name}'; }

  detect(): boolean {
    // URL-based check first (fast), then DOM check (slower)
    if (!window.location.hostname.includes('{ats-domain}')) return false;
    return !!document.querySelector('{ats-specific-selector}');
  }

  fillField(type: FieldType, value: string, selector?: string): FillResult {
    const sel = selector ?? this.getSelector(type);
    if (!sel) return { success: false, field: type, value, error: 'no selector' };

    const el = document.querySelector<HTMLInputElement>(sel);
    if (!el) return { success: false, field: type, value, error: 'element not found' };

    // Trigger React/Vue synthetic events if needed
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    nativeInputValueSetter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));

    return { success: true, field: type, value };
  }

  async submit(): Promise<boolean> {
    const submitBtn = document.querySelector<HTMLButtonElement>('{submit-selector}');
    if (!submitBtn) return false;
    submitBtn.click();
    return true;
  }

  private getSelector(type: FieldType): string | null {
    const map: Partial<Record<FieldType, string>> = {
      firstName: '{selector}',
      lastName: '{selector}',
      email: '{selector}',
      phone: '{selector}',
      resume: '{selector}',
    };
    return map[type] ?? null;
  }
}

// Register in extension/content.ts:
// import { {AtsName}Handler } from './handlers/{ats-name}';
// const handlers: AtsHandler[] = [
//   new GreenhouseHandler(),
//   new {AtsName}Handler(),  // ← add here
// ];
```

---

## Template 4: New Feature Flag

```sql
-- Add flag (always draft — never active in migration):
INSERT INTO feature_flags (key, name, status, flag_type, rollout_percentage, description)
VALUES (
  '{feature-key}',         -- kebab-case
  '{Human Readable Name}',
  'draft',                 -- ALWAYS draft in migration
  'boolean',               -- 'boolean' | 'percentage' | 'variant'
  0,                       -- start at 0%, increase manually
  '{What this flag gates}'
) ON CONFLICT (key) DO NOTHING;
```

```typescript
// React component usage:
import { useFeatureFlag } from '../hooks/useFeatureFlag';

function MyComponent() {
  const newFeatureEnabled = useFeatureFlag('feature-key', false);

  if (!newFeatureEnabled) return <LegacyVersion />;
  return <NewVersion />;
}

// Edge Function usage:
import { parseFlagHeader } from '../_shared/feature-flag-middleware.ts';
// (route must be in FLAG_AWARE_ROUTES — see S-06)

const flags = parseFlagHeader(req);
if (flags['feature-key']) {
  // new path
}
```

---

## Template 5: New React Page

```typescript
// src/app/pages/{surface}/{page-name}/

// 1. PageNamePage.tsx
import { useState, useEffect } from 'react';
import { usePageName } from './hooks/usePageName';
import { PageNameHero, PageNameContent } from './components';

export function PageNamePage() {
  const { data, loading, error } = usePageName();

  if (loading) return <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>;

  if (error) return <div className="p-6 text-text-muted">
    Unable to load {page name}. Please refresh.
  </div>;

  return (
    <div className="space-y-6 p-6">
      <PageNameHero stats={data?.stats} />
      <PageNameContent data={data} />
    </div>
  );
}

// 2. hooks/usePageName.ts
export function usePageName() {
  const [data, setData] = useState<PageNameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      try {
        // Bridge: read from window.* (legacy) or Supabase directly
        const raw = (window as Window & { pageNameCache?: unknown }).pageNameCache;
        if (raw) setData(transformData(raw));
        setLoading(false);
      } catch (err) {
        setError(String(err));
        setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  return { data, loading, error };
}

// 3. components/PageNameHero.tsx (no window.* access)
interface PageNameHeroProps {
  stats?: { total: number; active: number };
}

export function PageNameHero({ stats }: PageNameHeroProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="bg-bg-card rounded-lg p-4">
        <div className="text-2xl font-bold text-text">{stats?.total ?? '—'}</div>
        <div className="text-sm text-text-muted">Total</div>
      </div>
    </div>
  );
}

// 4. index.ts
export { PageNamePage } from './PageNamePage';

// 5. Register in src/app/routes.tsx:
// const PageNamePageRoute = lazy(() =>
//   import('./pages/{surface}/{page-name}').then(m => ({ default: m.PageNamePage }))
// );
```

---

## Template 6: New Database Migration

```sql
-- supabase/migrations/v6.XX-{description}.sql
-- Session: SA-0XX
-- Purpose: {one-sentence description}

BEGIN;

-- TABLE
CREATE TABLE IF NOT EXISTS {table_name} (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL    DEFAULT now(),

  -- domain columns here
  name        TEXT        NOT NULL,
  status      TEXT        NOT NULL    DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'archived')),
  config      JSONB       NOT NULL    DEFAULT '{}'::JSONB,

  -- FK example:
  -- user_id  UUID        REFERENCES auth.users(id) ON DELETE CASCADE
);

-- UPDATED_AT trigger
CREATE OR REPLACE FUNCTION fn_{table_name}_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_{table_name}_updated_at
  BEFORE UPDATE ON {table_name}
  FOR EACH ROW EXECUTE FUNCTION fn_{table_name}_updated_at();

-- RLS
ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_{table_name}" ON {table_name}
  FOR SELECT USING (true);
CREATE POLICY "admin_manage_{table_name}" ON {table_name}
  USING (auth.jwt()->>'role' = 'service_role');

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_{table_name}_created_at
  ON {table_name}(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_{table_name}_status
  ON {table_name}(status) WHERE status = 'active';

-- AGENT HOOK (always log migration events)
INSERT INTO agent_action_log (agent_name, action_type, summary, metadata)
VALUES ('system', 'migration', 'v6.XX-{description} applied',
        '{"session": "SA-0XX"}'::JSONB);

COMMIT;
```

---

## Checklist: Before Opening a PR

- [ ] Used the correct template for the extension type
- [ ] New hook added to `HOOK_DEFINITIONS` in `ff-01-hook-integrity.mjs`
- [ ] New scar added to `SCAR_DEFINITIONS` in `ff-02-scar-integrity.mjs`
- [ ] Architecture Blueprint (`architecture-blueprint.md`) updated with new H-XX or S-XX
- [ ] ADR section added for the relevant domain ADR
- [ ] Gateway route added if new EF
- [ ] Tests written (`tests/sa-0XX-{description}.test.js`)
- [ ] `npx vitest run` passes
- [ ] Version bump if JS/CSS/HTML changed
- [ ] ROADMAP.md + roadmap.html updated
- [ ] HANDOFF.md updated
