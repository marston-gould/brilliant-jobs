// supabase/functions/refresh-orchestrator/index.ts
//
// v5 — Queues batches via pg_net. Auth token baked into
// the queue_refresh_batch SQL function (SECURITY DEFINER).
// Orchestrator just passes target URLs.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 10;
const MAX_BATCHES = 200;

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (_req) => {
  const start = Date.now();

  try {
    const { count, error: countErr } = await sb
      .from("ats_companies")
      .select("slug", { count: "exact", head: true })
      .eq("source", "greenhouse");

    if (countErr) throw countErr;

    const totalBoards = count || 0;
    const totalBatches = Math.min(
      Math.ceil(totalBoards / BATCH_SIZE),
      MAX_BATCHES
    );

    if (totalBatches === 0) {
      return jsonResp({ message: "No boards found", totalBoards: 0 });
    }

    let queued = 0;
    const errors: string[] = [];

    for (let i = 0; i < totalBatches; i++) {
      const offset = i * BATCH_SIZE;
      const targetUrl = `${SUPABASE_URL}/functions/v1/refresh-jobs?offset=${offset}`;

      const { error: sqlErr } = await sb.rpc("queue_refresh_batch", {
        target_url: targetUrl,
      });

      if (sqlErr) {
        errors.push(`Batch ${i}: ${sqlErr.message}`);
      } else {
        queued++;
      }
    }

    return jsonResp({
      totalBoards,
      batchSize: BATCH_SIZE,
      totalBatches,
      queued,
      failed: totalBatches - queued,
      errors: errors.slice(0, 10),
      elapsed: Date.now() - start,
    });
  } catch (err: unknown) {
    return jsonResp({ error: err.message || String(err) }, 500);
  }
});

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
