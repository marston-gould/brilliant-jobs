/**
 * A6: Resilience utilities — timeout + retry wrappers for external calls
 * Phase A Sprint 3 - Architecture Hardening
 * Date: 2026-02-19
 * 
 * Usage:
 *   import { fetchWithRetry, fetchWithTimeout, TIMEOUT_CONFIGS } from '../_shared/resilience.ts';
 *   const resp = await fetchWithRetry(url, options, TIMEOUT_CONFIGS.resend);
 */

// ─── Timeout wrapper ───────────────────────────────────────────────
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal });
    return resp;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Retry wrapper with exponential backoff ────────────────────────
export interface RetryConfig {
  maxRetries?: number;
  backoffMs?: number;
  timeoutMs?: number;
  retryOn?: (resp: Response) => boolean; // retry on certain status codes
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  config: RetryConfig = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    backoffMs = 1000,
    timeoutMs = 10000,
    retryOn = (resp) => resp.status >= 500 || resp.status === 429,
  } = config;

  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, options, timeoutMs);
      
      // Check if we should retry based on response
      if (attempt < maxRetries && retryOn(resp)) {
        lastResponse = resp;
        const delay = backoffMs * Math.pow(2, attempt);
        console.log(JSON.stringify({
          level: 'warn',
          message: `Retrying request (attempt ${attempt + 1}/${maxRetries})`,
          url,
          status: resp.status,
          delay,
        }));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return resp;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(2, attempt);
        console.log(JSON.stringify({
          level: 'warn',
          message: `Request failed, retrying (attempt ${attempt + 1}/${maxRetries})`,
          url,
          error: lastError.message,
          delay,
        }));
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted
  if (lastError) throw lastError;
  if (lastResponse) return lastResponse;
  throw new Error(`All ${maxRetries} retries exhausted for: ${url}`);
}

// ─── Pre-configured timeout/retry settings per service ─────────────
export const TIMEOUT_CONFIGS = {
  // ATS APIs (Greenhouse, Lever, Ashby, Workable, Recruitee)
  ats: { timeoutMs: 15000, maxRetries: 2, backoffMs: 1000 },
  
  // Resend (email delivery)
  resend: { timeoutMs: 10000, maxRetries: 3, backoffMs: 1000 },
  
  // Vonage (SMS delivery)
  vonage: { timeoutMs: 10000, maxRetries: 3, backoffMs: 1000 },
  
  // PDL (People Data Labs - company enrichment)
  pdl: { timeoutMs: 15000, maxRetries: 2, backoffMs: 1000 },
  
  // DataForSEO (SERP-based discovery)
  dataforseo: { timeoutMs: 30000, maxRetries: 1, backoffMs: 2000 },
  
  // PostHog (analytics - fire and forget, low retry)
  posthog: { timeoutMs: 5000, maxRetries: 1, backoffMs: 500 },
} as const;

// ─── Circuit breaker (lightweight, in-memory per function invocation) ──
// Note: Edge Functions are stateless, so this only protects within a single
// invocation (e.g., a batch of 50 board refreshes). For persistent circuit
// breaking, use the database (Phase B - job_queue with failure tracking).
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  
  constructor(
    private threshold: number = 5,
    private resetMs: number = 60000
  ) {}
  
  isOpen(): boolean {
    if (this.failures >= this.threshold) {
      if (Date.now() - this.lastFailure > this.resetMs) {
        this.failures = 0; // reset after cooldown
        return false;
      }
      return true;
    }
    return false;
  }
  
  recordFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();
  }
  
  recordSuccess(): void {
    this.failures = 0;
  }
}
