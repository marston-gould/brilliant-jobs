/**
 * BP-001: Anthropic API wrapper — circuit breaker + retry + rate limit
 *
 * All Anthropic-calling EFs should use `anthropicFetch()` instead of raw `fetch()`.
 * Provides:
 *   1. Persistent circuit breaker via `ai_circuit_breaker` DB table
 *   2. Retry with exponential backoff on 429/529/5xx
 *   3. Rate limit header parsing (retry-after)
 *   4. Spend tracking via `ai_usage_log`
 *   5. Structured error logging
 *
 * Usage:
 *   import { anthropicFetch } from '../_shared/anthropic.ts';
 *   const result = await anthropicFetch(supabaseClient, {
 *     model: 'claude-haiku-4-5-20251001',
 *     max_tokens: 1024,
 *     messages: [{ role: 'user', content: prompt }],
 *   }, { callerEf: 'score-resume', userId });
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// ─── Circuit Breaker (DB-backed, shared across invocations) ──────────

interface BreakerState {
  is_open: boolean;
  failure_count: number;
  last_failure_at: string | null;
  opened_at: string | null;
  half_open_after: string | null;
}

const BREAKER_THRESHOLD = 5;        // consecutive failures to open
const BREAKER_COOLDOWN_MS = 120000; // 2 min before half-open probe

async function getBreakerState(sb: SupabaseClient): Promise<BreakerState> {
  try {
    const { data } = await sb.from("ai_circuit_breaker")
      .select("*").eq("service", "anthropic").maybeSingle();
    if (data) return data as BreakerState;
  } catch (_) { /* non-fatal */ }
  return { is_open: false, failure_count: 0, last_failure_at: null, opened_at: null, half_open_after: null };
}

async function recordBreakerFailure(sb: SupabaseClient, state: BreakerState): Promise<void> {
  const newCount = state.failure_count + 1;
  const shouldOpen = newCount >= BREAKER_THRESHOLD;
  const now = new Date().toISOString();
  const halfOpen = shouldOpen ? new Date(Date.now() + BREAKER_COOLDOWN_MS).toISOString() : null;
  try {
    await sb.from("ai_circuit_breaker").upsert({
      service: "anthropic",
      is_open: shouldOpen,
      failure_count: newCount,
      last_failure_at: now,
      opened_at: shouldOpen ? now : state.opened_at,
      half_open_after: shouldOpen ? halfOpen : state.half_open_after,
      updated_at: now,
    }, { onConflict: "service" });
  } catch (_) { /* non-fatal */ }
}

async function recordBreakerSuccess(sb: SupabaseClient): Promise<void> {
  try {
    await sb.from("ai_circuit_breaker").upsert({
      service: "anthropic",
      is_open: false,
      failure_count: 0,
      last_failure_at: null,
      opened_at: null,
      half_open_after: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "service" });
  } catch (_) { /* non-fatal */ }
}

// ─── Rate limit / retry-after parsing ────────────────────────────────

function parseRetryAfter(resp: Response): number | null {
  const ra = resp.headers.get("retry-after");
  if (!ra) return null;
  const secs = parseInt(ra, 10);
  return isNaN(secs) ? null : secs * 1000;
}

// ─── Usage logging ───────────────────────────────────────────────────

async function logUsage(
  sb: SupabaseClient,
  callerEf: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  userId?: string,
  durationMs?: number,
  error?: string,
): Promise<void> {
  try {
    await sb.from("ai_usage_log").insert({
      caller_ef: callerEf,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      user_id: userId || null,
      duration_ms: durationMs || null,
      error: error || null,
    });
  } catch (_) { /* non-fatal */ }
}

// ─── Main wrapper ────────────────────────────────────────────────────

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: Array<{ role: string; content: string | Array<unknown> }>;
  system?: string;
  temperature?: number;
  [key: string]: unknown;
}

export interface AnthropicOptions {
  callerEf: string;
  userId?: string;
  maxRetries?: number;
  timeoutMs?: number;
  /** Extra headers (e.g. anthropic-beta) */
  extraHeaders?: Record<string, string>;
}

export interface AnthropicResult {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: string;
  status?: number;
  inputTokens?: number;
  outputTokens?: number;
  circuitOpen?: boolean;
}

export async function anthropicFetch(
  sb: SupabaseClient,
  request: AnthropicRequest,
  options: AnthropicOptions,
): Promise<AnthropicResult> {
  const {
    callerEf,
    userId,
    maxRetries = 2,
    timeoutMs = 60000,
    extraHeaders = {},
  } = options;

  // 1. Check circuit breaker
  const breaker = await getBreakerState(sb);
  if (breaker.is_open) {
    const halfOpenTime = breaker.half_open_after ? new Date(breaker.half_open_after).getTime() : 0;
    if (Date.now() < halfOpenTime) {
      console.warn(JSON.stringify({
        level: "warn",
        ef: callerEf,
        message: "Anthropic circuit breaker OPEN — request rejected",
        failure_count: breaker.failure_count,
        half_open_after: breaker.half_open_after,
      }));
      return { ok: false, error: "Circuit breaker open — Anthropic API temporarily unavailable", circuitOpen: true };
    }
    // Half-open: allow one probe request through
    console.log(JSON.stringify({ level: "info", ef: callerEf, message: "Anthropic circuit breaker HALF-OPEN — sending probe" }));
  }

  // 2. Build request
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": ANTHROPIC_API_KEY,
    "anthropic-version": "2023-06-01",
    ...extraHeaders,
  };

  const body = JSON.stringify(request);
  const startMs = Date.now();

  // 3. Retry loop
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      const resp = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const durationMs = Date.now() - startMs;

      // Success
      if (resp.ok) {
        const data = await resp.json();
        const inputTokens = data?.usage?.input_tokens || 0;
        const outputTokens = data?.usage?.output_tokens || 0;
        await recordBreakerSuccess(sb);
        await logUsage(sb, callerEf, request.model, inputTokens, outputTokens, userId, durationMs);
        return { ok: true, data, status: resp.status, inputTokens, outputTokens };
      }

      // Rate limited — respect retry-after
      if (resp.status === 429) {
        const retryAfterMs = parseRetryAfter(resp) || (2000 * Math.pow(2, attempt));
        console.warn(JSON.stringify({
          level: "warn", ef: callerEf, message: "Anthropic 429 rate limited",
          attempt, retryAfterMs, status: 429,
        }));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryAfterMs));
          continue;
        }
        await recordBreakerFailure(sb, breaker);
        await logUsage(sb, callerEf, request.model, 0, 0, userId, durationMs, "429_rate_limited");
        return { ok: false, error: "Anthropic rate limited (429)", status: 429 };
      }

      // Overloaded (529) or server error (5xx)
      if (resp.status >= 500) {
        console.warn(JSON.stringify({
          level: "warn", ef: callerEf, message: `Anthropic ${resp.status}`,
          attempt, status: resp.status,
        }));
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
          continue;
        }
        await recordBreakerFailure(sb, breaker);
        await logUsage(sb, callerEf, request.model, 0, 0, userId, durationMs, `server_error_${resp.status}`);
        return { ok: false, error: `Anthropic server error (${resp.status})`, status: resp.status };
      }

      // Client error (4xx) — don't retry, don't trip breaker
      const errBody = await resp.text().catch(() => "");
      await logUsage(sb, callerEf, request.model, 0, 0, userId, durationMs, `client_error_${resp.status}`);
      return { ok: false, error: `Anthropic client error (${resp.status}): ${errBody.slice(0, 200)}`, status: resp.status };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("abort") || msg.includes("timed out");
      console.error(JSON.stringify({
        level: "error", ef: callerEf, message: "Anthropic fetch exception",
        attempt, error: msg, isTimeout,
      }));
      if (attempt < maxRetries && (isTimeout || msg.includes("network"))) {
        await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
        continue;
      }
      await recordBreakerFailure(sb, breaker);
      await logUsage(sb, callerEf, request.model, 0, 0, userId, Date.now() - startMs, msg);
      return { ok: false, error: msg };
    }
  }

  return { ok: false, error: "All retries exhausted" };
}

// ─── Lightweight wrapper for EFs that keep their own fetch logic ─────
// Usage: wrap your existing Anthropic call in withAnthropicBreaker:
//   const result = await withAnthropicBreaker(sb, 'score-resume', async () => {
//     return await myExistingCallAnthropic(model, system, user, maxTokens);
//   });
//   if (result.circuitOpen) return gracefulDegradation();

export async function withAnthropicBreaker<T>(
  sb: SupabaseClient,
  callerEf: string,
  fn: () => Promise<T>,
): Promise<{ result?: T; circuitOpen?: boolean; error?: string }> {
  // Check breaker
  const breaker = await getBreakerState(sb);
  if (breaker.is_open) {
    const halfOpenTime = breaker.half_open_after ? new Date(breaker.half_open_after).getTime() : 0;
    if (Date.now() < halfOpenTime) {
      console.warn(JSON.stringify({ level: "warn", ef: callerEf, message: "Circuit breaker OPEN" }));
      return { circuitOpen: true, error: "Circuit breaker open" };
    }
    console.log(JSON.stringify({ level: "info", ef: callerEf, message: "Circuit breaker HALF-OPEN — probe" }));
  }

  try {
    const result = await fn();
    await recordBreakerSuccess(sb);
    return { result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordBreakerFailure(sb, breaker);
    return { error: msg };
  }
}
