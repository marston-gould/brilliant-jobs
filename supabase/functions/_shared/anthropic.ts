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
const BREAKER_402_COOLDOWN_MS = 3600000; // 1 hour for credits exhausted

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

/** 402 Credits Exhausted — immediate open with 1-hour cooldown */
async function recordBreaker402(sb: SupabaseClient): Promise<void> {
  const now = new Date().toISOString();
  const halfOpen = new Date(Date.now() + BREAKER_402_COOLDOWN_MS).toISOString();
  try {
    await sb.from("ai_circuit_breaker").upsert({
      service: "anthropic",
      is_open: true,
      failure_count: 999, // sentinel: credits exhausted
      last_failure_at: now,
      opened_at: now,
      half_open_after: halfOpen,
      updated_at: now,
    }, { onConflict: "service" });
  } catch (_) { /* non-fatal */ }
}

// ─── Daily Spend Cap ─────────────────────────────────────────────────

const HAIKU_INPUT_RATE = 0.001 / 1000;  // $0.001 per 1K input tokens
const HAIKU_OUTPUT_RATE = 0.005 / 1000; // $0.005 per 1K output tokens
const SONNET_INPUT_RATE = 0.003 / 1000;
const SONNET_OUTPUT_RATE = 0.015 / 1000;
const DEFAULT_DAILY_CAP = 5.00; // $5.00 default

async function checkDailySpendCap(sb: SupabaseClient, callerEf: string): Promise<{ allowed: boolean; spent: number; cap: number }> {
  try {
    // Get configurable cap from app_settings if available
    let cap = DEFAULT_DAILY_CAP;
    try {
      const { data: setting } = await sb.from("app_settings")
        .select("value").eq("key", "ai_daily_spend_cap").maybeSingle();
      if (setting?.value) cap = parseFloat(setting.value) || DEFAULT_DAILY_CAP;
    } catch (_) { /* table may not exist — use default */ }

    // Sum today's spend from ai_usage_log
    const { data: rows } = await sb.from("ai_usage_log")
      .select("model, input_tokens, output_tokens")
      .gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString());
    
    let spent = 0;
    if (rows) {
      for (const r of rows) {
        const isHaiku = (r.model || "").includes("haiku");
        const inRate = isHaiku ? HAIKU_INPUT_RATE : SONNET_INPUT_RATE;
        const outRate = isHaiku ? HAIKU_OUTPUT_RATE : SONNET_OUTPUT_RATE;
        spent += (r.input_tokens || 0) * inRate + (r.output_tokens || 0) * outRate;
      }
    }
    return { allowed: spent < cap, spent, cap };
  } catch (_) {
    // If we can't check, allow (fail open) but log warning
    console.warn(JSON.stringify({ level: "warn", ef: callerEf, message: "Daily spend cap check failed — allowing request" }));
    return { allowed: true, spent: 0, cap: DEFAULT_DAILY_CAP };
  }
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
      const reason = breaker.failure_count === 999 ? "credits exhausted (402)" : "failures";
      console.warn(JSON.stringify({
        level: "warn",
        ef: callerEf,
        message: `Anthropic circuit breaker OPEN (${reason}) — request rejected`,
        failure_count: breaker.failure_count,
        half_open_after: breaker.half_open_after,
      }));
      return { ok: false, error: `Circuit breaker open (${reason}) — Anthropic API temporarily unavailable`, circuitOpen: true };
    }
    // Half-open: allow one probe request through
    console.log(JSON.stringify({ level: "info", ef: callerEf, message: "Anthropic circuit breaker HALF-OPEN — sending probe" }));
  }

  // 1b. Daily spend cap (skip for user-initiated exempt callers)
  const EXEMPT_CALLERS = ["auto-apply-trigger", "score-resume", "rewrite-resume-analyze", "rewrite-resume-execute", "generate-cover-letter", "answer-form-question", "interview-simulate", "interview-practice"];
  if (!EXEMPT_CALLERS.includes(callerEf)) {
    const capCheck = await checkDailySpendCap(sb, callerEf);
    if (!capCheck.allowed) {
      console.warn(JSON.stringify({
        level: "warn", ef: callerEf, message: "Daily spend cap reached",
        spent: capCheck.spent.toFixed(4), cap: capCheck.cap,
      }));
      await logUsage(sb, callerEf, request.model, 0, 0, userId, 0, "daily_spend_cap_reached");
      return { ok: false, error: `Daily spend cap reached ($${capCheck.spent.toFixed(2)} of $${capCheck.cap})` };
    }
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

      // Credits exhausted (402) — immediate circuit breaker, 1-hour cooldown, no retry
      if (resp.status === 402) {
        const durationMs402 = Date.now() - startMs;
        console.error(JSON.stringify({
          level: "error", ef: callerEf, message: "Anthropic 402 CREDITS EXHAUSTED — opening circuit breaker for 1 hour",
          status: 402,
        }));
        await recordBreaker402(sb);
        await logUsage(sb, callerEf, request.model, 0, 0, userId, durationMs402, "credits_exhausted_402");
        return { ok: false, error: "Anthropic credits exhausted (402) — circuit breaker opened for 1 hour", status: 402, circuitOpen: true };
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
//   }, { userId, model: 'claude-haiku-4-5-20251001' });
//   if (result.circuitOpen) return gracefulDegradation();

export interface BreakerOptions {
  userId?: string;
  model?: string;
}

export async function withAnthropicBreaker<T>(
  sb: SupabaseClient,
  callerEf: string,
  fn: () => Promise<T>,
  opts?: BreakerOptions,
): Promise<{ result?: T; circuitOpen?: boolean; error?: string }> {
  const userId = opts?.userId;
  const model = opts?.model || "claude-haiku-4-5-20251001";

  // Check breaker
  const breaker = await getBreakerState(sb);
  if (breaker.is_open) {
    const halfOpenTime = breaker.half_open_after ? new Date(breaker.half_open_after).getTime() : 0;
    if (Date.now() < halfOpenTime) {
      const reason = breaker.failure_count === 999 ? "credits exhausted" : "failures";
      console.warn(JSON.stringify({ level: "warn", ef: callerEf, message: `Circuit breaker OPEN (${reason})` }));
      return { circuitOpen: true, error: `Circuit breaker open (${reason})` };
    }
    console.log(JSON.stringify({ level: "info", ef: callerEf, message: "Circuit breaker HALF-OPEN — probe" }));
  }

  // Daily spend cap (skip exempt user-initiated callers)
  const EXEMPT = ["auto-apply-trigger", "score-resume", "rewrite-resume-analyze", "rewrite-resume-execute", "generate-cover-letter", "answer-form-question", "interview-simulate", "interview-practice"];
  if (!EXEMPT.includes(callerEf)) {
    const capCheck = await checkDailySpendCap(sb, callerEf);
    if (!capCheck.allowed) {
      console.warn(JSON.stringify({ level: "warn", ef: callerEf, message: "Daily spend cap reached", spent: capCheck.spent.toFixed(4) }));
      await logUsage(sb, callerEf, model, 0, 0, userId, 0, "daily_spend_cap_reached");
      return { error: `Daily spend cap reached ($${capCheck.spent.toFixed(2)})` };
    }
  }

  const startMs = Date.now();
  try {
    const result = await fn();
    await recordBreakerSuccess(sb);
    // Extract tokens from Anthropic response if available
    const r = result as Record<string, unknown> | null;
    const usage = r && typeof r === "object" ? (r as Record<string, unknown>).usage as Record<string, number> | undefined : undefined;
    const inputTokens = usage?.input_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;
    await logUsage(sb, callerEf, model, inputTokens, outputTokens, userId, Date.now() - startMs);
    return { result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("402") || msg.includes("credits") || msg.includes("payment")) {
      await recordBreaker402(sb);
      await logUsage(sb, callerEf, model, 0, 0, userId, Date.now() - startMs, "credits_exhausted_402");
      return { circuitOpen: true, error: "Credits exhausted (402)" };
    }
    await recordBreakerFailure(sb, breaker);
    await logUsage(sb, callerEf, model, 0, 0, userId, Date.now() - startMs, msg.slice(0, 200));
    return { error: msg };
  }
}
