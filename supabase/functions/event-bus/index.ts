/**
 * SA-024: Event Bus Edge Function
 * Platform event publishing and HMAC-signed webhook delivery.
 *
 * Actions:
 *   publish        — emit a platform event (internal EF-to-EF use)
 *   subscribe      — register a webhook endpoint for event delivery
 *   unsubscribe    — remove a webhook subscription
 *   list           — list subscriptions for a consumer
 *   status         — delivery status for an event_id
 *   retry          — manually retry failed/abandoned deliveries
 *   process_queue  — process pending delivery queue (called by pg_cron every minute)
 *   summary        — delivery health summary (admin)
 *
 * Webhook delivery:
 *   POST to subscriber URL with HMAC-SHA256 signature:
 *     X-BJ-Signature-256: sha256=<hex>
 *     X-BJ-Delivery-ID:   del_xxx
 *     X-BJ-Event-ID:      evt_xxx
 *     X-BJ-Event-Type:    job.published
 *     X-BJ-Timestamp:     1234567890
 *
 * Retry schedule: 1min → 5min → 30min → 2h → 8h → abandoned (5 attempts max)
 *
 * ADR: docs/scaling/adr-03-gateway.md (SA-024 section)
 * Hook: H-02 — fn_publish_event() callable from any EF
 * Phase: S5 | Session: SA-024 | 2026-03-07
 */

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { requireAuth, requireAdmin } from "../_shared/admin-auth.ts";

// ── Retry schedule (seconds) ─────────────────────────────────────────────────
const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200, 28800]; // 1m, 5m, 30m, 2h, 8h
const MAX_ATTEMPTS = RETRY_DELAYS_SECONDS.length + 1; // 6 total (initial + 5 retries)
const QUEUE_BATCH_LIMIT = 50; // max deliveries per process_queue run
const DELIVERY_TIMEOUT_MS = 10_000; // 10s per webhook call

const logger = createLogger("event-bus");

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ??
    (req.method === "POST" ? (await req.clone().json().catch(() => ({}))).action : null);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (action) {

      // ── publish: emit a platform event ──────────────────────────────────────
      case "publish": {
        const { event_type, source, payload = {}, metadata = {}, idempotency_key } =
          await req.json();

        if (!event_type || !source) {
          return json({ error: "event_type and source are required" }, 400);
        }

        const { data, error } = await supabase.rpc("fn_publish_event", {
          p_event_type: event_type,
          p_source: source,
          p_payload: payload,
          p_metadata: metadata,
          p_idempotency_key: idempotency_key ?? null,
        });

        if (error) throw error;

        logger.info("event_published", { event_type, source, event_id: data });
        return json({ event_id: data, published: true });
      }

      // ── subscribe: register a webhook endpoint ──────────────────────────────
      case "subscribe": {
        const authResult = requireAuth(req);
        if (authResult.error) return json({ error: authResult.error }, 401);

        const body = await req.json();
        const { consumer_id, webhook_url, event_types = [], event_filters = {} } = body;

        if (!webhook_url) {
          return json({ error: "webhook_url is required" }, 400);
        }

        // Validate URL
        try { new URL(webhook_url); } catch {
          return json({ error: "webhook_url must be a valid URL" }, 400);
        }

        // Generate subscription_id and signing secret
        const subscription_id = "sub_" + bytesToHex(crypto.getRandomValues(new Uint8Array(12)));
        const webhook_secret = "whsec_" + bytesToHex(crypto.getRandomValues(new Uint8Array(24)));

        const { error } = await supabase
          .from("webhook_subscriptions")
          .insert({
            subscription_id,
            consumer_id: consumer_id ?? null,
            webhook_url,
            webhook_secret,
            event_types: event_types ?? [],
            event_filters: event_filters ?? {},
          });

        if (error) throw error;

        logger.info("webhook_subscribed", { subscription_id, consumer_id, webhook_url });

        return json({
          subscription_id,
          webhook_secret, // Only returned once — consumer must store this
          webhook_url,
          event_types,
          note: "Store webhook_secret securely. It will not be shown again.",
        });
      }

      // ── unsubscribe ──────────────────────────────────────────────────────────
      case "unsubscribe": {
        const { subscription_id } = await req.json();
        if (!subscription_id) return json({ error: "subscription_id required" }, 400);

        const { error } = await supabase
          .from("webhook_subscriptions")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("subscription_id", subscription_id);

        if (error) throw error;

        logger.info("webhook_unsubscribed", { subscription_id });
        return json({ unsubscribed: true, subscription_id });
      }

      // ── list: subscriptions for a consumer ──────────────────────────────────
      case "list": {
        const consumer_id = url.searchParams.get("consumer_id");
        let query = supabase
          .from("webhook_subscriptions")
          .select("subscription_id, consumer_id, webhook_url, event_types, is_active, failure_count, created_at");

        if (consumer_id) query = query.eq("consumer_id", consumer_id);

        const { data, error } = await query.order("created_at", { ascending: false });
        if (error) throw error;

        return json({ subscriptions: data });
      }

      // ── status: delivery status for an event_id ──────────────────────────────
      case "status": {
        const event_id = url.searchParams.get("event_id");
        if (!event_id) return json({ error: "event_id required" }, 400);

        const { data: deliveries, error } = await supabase
          .from("webhook_delivery_log")
          .select("delivery_id, subscription_id, status, attempt_number, http_status, error_message, delivered_at, next_retry_at, created_at")
          .eq("event_id", event_id)
          .order("created_at", { ascending: true });

        if (error) throw error;

        return json({ event_id, deliveries: deliveries ?? [] });
      }

      // ── retry: manually retry failed/abandoned deliveries ────────────────────
      case "retry": {
        const adminCheck = requireAdmin(req);
        if (adminCheck.error) return json({ error: adminCheck.error }, 403);

        const { event_id, subscription_id } = await req.json();

        let query = supabase
          .from("webhook_delivery_log")
          .update({
            status: "retrying",
            next_retry_at: new Date().toISOString(),
            attempt_number: 1,
            updated_at: new Date().toISOString(),
          })
          .in("status", ["failed", "abandoned"]);

        if (event_id) query = query.eq("event_id", event_id);
        if (subscription_id) query = query.eq("subscription_id", subscription_id);

        const { count, error } = await query;
        if (error) throw error;

        logger.info("deliveries_retried", { event_id, subscription_id, count });
        return json({ retried: count ?? 0 });
      }

      // ── summary: delivery health summary ────────────────────────────────────
      case "summary": {
        const { data, error } = await supabase.rpc("fn_webhook_delivery_summary");
        if (error) throw error;
        return json(data);
      }

      // ── process_queue: core delivery loop (called by pg_cron every minute) ───
      case "process_queue": {
        const limitParam = url.searchParams.get("limit");
        let bodyLimit: number | undefined;
        if (req.method === "POST") {
          const body = await req.json().catch(() => ({}));
          bodyLimit = body.limit;
        }
        const limit = parseInt(String(limitParam ?? bodyLimit ?? QUEUE_BATCH_LIMIT));

        const results = await processDeliveryQueue(supabase, limit);
        return json(results);
      }

      default:
        return json({ error: "Unknown action. Valid: publish, subscribe, unsubscribe, list, status, retry, process_queue, summary" }, 400);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("event_bus_error", { action, error: message });
    return json({ error: message }, 500);
  }
});

// ── processDeliveryQueue ──────────────────────────────────────────────────────
// Fetches pending/retrying deliveries and sends HMAC-signed HTTP POSTs.
// Runs in a tight loop, updating delivery state after each attempt.

async function processDeliveryQueue(
  supabase: ReturnType<typeof createClient>,
  limit: number,
): Promise<Record<string, unknown>> {
  // Fetch deliveries due for processing (SKIP LOCKED pattern via ordering + limit)
  const { data: deliveries, error: fetchErr } = await supabase
    .from("webhook_delivery_log")
    .select(`
      delivery_id, event_id, subscription_id, attempt_number,
      webhook_subscriptions!inner(webhook_url, webhook_secret, is_active),
      platform_events!inner(event_type, event_version, payload, metadata, source, created_at)
    `)
    .in("status", ["pending", "retrying"])
    .lte("next_retry_at", new Date().toISOString())
    .order("next_retry_at", { ascending: true })
    .limit(limit);

  if (fetchErr) throw fetchErr;

  if (!deliveries || deliveries.length === 0) {
    return { processed: 0, delivered: 0, failed: 0 };
  }

  let delivered = 0;
  let failed = 0;

  await Promise.allSettled(
    (deliveries as DeliveryRecord[]).map(async (delivery) => {
      const sub = delivery.webhook_subscriptions;
      const event = delivery.platform_events;

      if (!sub.is_active) {
        // Subscription was disabled between queue time and now
        await updateDelivery(supabase, delivery.delivery_id, {
          status: "abandoned",
          error_message: "Subscription disabled",
        });
        failed++;
        return;
      }

      const timestamp = Math.floor(Date.now() / 1000);
      const webhookBody = JSON.stringify({
        delivery_id: delivery.delivery_id,
        event_id: delivery.event_id,
        event_type: event.event_type,
        event_version: event.event_version,
        source: event.source,
        payload: event.payload,
        metadata: event.metadata,
        timestamp,
      });

      // Compute HMAC-SHA256
      const signature = await computeHmac(sub.webhook_secret, webhookBody);
      const startMs = Date.now();

      try {
        const response = await fetch(sub.webhook_url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-BJ-Signature-256": `sha256=${signature}`,
            "X-BJ-Delivery-ID": delivery.delivery_id,
            "X-BJ-Event-ID": delivery.event_id,
            "X-BJ-Event-Type": event.event_type,
            "X-BJ-Timestamp": String(timestamp),
            "User-Agent": "BrilliantJobs-Webhooks/1.0",
          },
          body: webhookBody,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        const durationMs = Date.now() - startMs;
        const responseBody = await response.text().catch(() => "");

        if (response.ok) {
          await updateDelivery(supabase, delivery.delivery_id, {
            status: "delivered",
            http_status: response.status,
            response_body: responseBody.slice(0, 500),
            duration_ms: durationMs,
            delivered_at: new Date().toISOString(),
          });
          await supabase.rpc("fn_mark_subscription_failure", {
            p_subscription_id: delivery.subscription_id,
            p_success: true,
          });
          delivered++;
        } else {
          // HTTP error — schedule retry
          await handleDeliveryFailure(supabase, delivery, {
            http_status: response.status,
            response_body: responseBody.slice(0, 500),
            duration_ms: durationMs,
          });
          failed++;
        }
      } catch (err: unknown) {
        // Network error / timeout
        const errorMessage = err instanceof Error ? err.message : String(err);
        await handleDeliveryFailure(supabase, delivery, {
          error_message: errorMessage.slice(0, 200),
          duration_ms: Date.now() - startMs,
        });
        failed++;
      }
    }),
  );

  return {
    processed: deliveries.length,
    delivered,
    failed,
    timestamp: new Date().toISOString(),
  };
}

// ── handleDeliveryFailure ────────────────────────────────────────────────────
async function handleDeliveryFailure(
  supabase: ReturnType<typeof createClient>,
  delivery: DeliveryRecord,
  extra: Record<string, unknown>,
): Promise<void> {
  const nextAttempt = delivery.attempt_number + 1;
  const isAbandoned = nextAttempt > MAX_ATTEMPTS;
  const delaySeconds = isAbandoned ? 0 : RETRY_DELAYS_SECONDS[delivery.attempt_number - 1] ?? 60;
  const nextRetryAt = isAbandoned
    ? null
    : new Date(Date.now() + delaySeconds * 1000).toISOString();

  await updateDelivery(supabase, delivery.delivery_id, {
    status: isAbandoned ? "abandoned" : "retrying",
    attempt_number: nextAttempt,
    next_retry_at: nextRetryAt,
    ...extra,
  });

  await supabase.rpc("fn_mark_subscription_failure", {
    p_subscription_id: delivery.subscription_id,
    p_success: false,
  });
}

// ── updateDelivery ────────────────────────────────────────────────────────────
async function updateDelivery(
  supabase: ReturnType<typeof createClient>,
  delivery_id: string,
  updates: Record<string, unknown>,
): Promise<void> {
  await supabase
    .from("webhook_delivery_log")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("delivery_id", delivery_id);
}

// ── computeHmac — HMAC-SHA256 signing ────────────────────────────────────────
async function computeHmac(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", keyMaterial, encoder.encode(body));
  return bytesToHex(new Uint8Array(signature));
}

// ── helpers ───────────────────────────────────────────────────────────────────
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface DeliveryRecord {
  delivery_id: string;
  event_id: string;
  subscription_id: string;
  attempt_number: number;
  webhook_subscriptions: {
    webhook_url: string;
    webhook_secret: string;
    is_active: boolean;
  };
  platform_events: {
    event_type: string;
    event_version: string;
    payload: Record<string, unknown>;
    metadata: Record<string, unknown>;
    source: string;
    created_at: string;
  };
}
