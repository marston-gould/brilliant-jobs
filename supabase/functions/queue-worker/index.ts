// queue-worker Edge Function
// B3: Process queued notifications (and other job_queue items)
// Phase B Sprint 3 - Architecture Hardening
// Date: 2026-02-19
//
// Called by pg_cron every 1 minute. Claims pending jobs from
// the notification queue and invokes send-notification for each.
//
// Deploy: supabase functions deploy queue-worker --no-verify-jwt

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { createLogger } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const logger = createLogger("queue-worker");
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Claim a batch of pending notification jobs
    const { data: jobs, error: claimErr } = await sb.rpc("claim_queue_job", {
      p_queue: "notifications",
      p_batch_size: 10,
    });

    if (claimErr) {
      logger.error("Failed to claim jobs", { error: claimErr.message });
      return new Response(JSON.stringify({ error: claimErr.message }), { status: 500 });
    }

    if (!jobs || jobs.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    logger.info(`Processing ${jobs.length} notification jobs`);
    let success = 0;
    let failed = 0;

    for (const job of jobs) {
      try {
        // Invoke send-notification Edge Function
        const { data: fnResult, error: fnErr } = await sb.functions.invoke(
          "send-notification",
          {
            body: {
              user_id: job.payload.user_id,
              notification_type: job.payload.notification_type,
              ...job.payload.data,
              _queue_job_id: job.id,
            },
          }
        );

        if (fnErr) throw new Error(fnErr.message);

        await sb.rpc("complete_queue_job", { p_id: job.id, p_success: true });
        success++;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        logger.warn(`Job ${job.id} failed`, { error: errMsg, attempts: job.attempts });
        await sb.rpc("complete_queue_job", {
          p_id: job.id,
          p_success: false,
          p_error: errMsg,
        });
        failed++;
      }
    }

    logger.info("Batch complete", { success, failed, total: jobs.length });

    return new Response(
      JSON.stringify({ processed: jobs.length, success, failed }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    logger.error("Worker error", { error: e instanceof Error ? e.message : String(e) });
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
