// extension/utils/fetchWithRetry.js — CS-013 FIX-12
// Shared fetch utility with timeout + exponential backoff retry.
// Wraps native fetch; used across all extension network calls.
//
// Usage:
//   import { fetchWithRetry } from '../utils/fetchWithRetry.js';
//   const resp = await fetchWithRetry(url, options, { timeout: 15000, retries: 3 });

/**
 * Fetch with AbortSignal.timeout and exponential backoff retry.
 *
 * @param {string} url
 * @param {RequestInit} options  — standard fetch options
 * @param {object} config
 * @param {number} [config.timeout=15000]  — ms before abort (per attempt)
 * @param {number} [config.retries=2]      — extra attempts after first failure
 * @param {number} [config.baseDelay=1000] — initial backoff delay (ms)
 * @param {number} [config.maxDelay=8000]  — ceiling for backoff (ms)
 * @param {boolean} [config.retryOnServerError=true] — retry on 5xx
 * @param {boolean} [config.silent=false]  — suppress console warnings
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    timeout = 15000,
    retries = 2,
    baseDelay = 1000,
    maxDelay = 8000,
    retryOnServerError = true,
    silent = false
  } = config;

  let lastError;
  const totalAttempts = 1 + retries;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      // Merge caller's signal with our timeout signal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort('Timeout'), timeout);

      // If caller passed their own signal, forward its abort
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId);
          throw new DOMException('Aborted', 'AbortError');
        }
        options.signal.addEventListener('abort', () => controller.abort(options.signal.reason), { once: true });
      }

      const resp = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Don't retry on client errors (4xx) — only on 5xx if configured
      if (!resp.ok && resp.status >= 500 && retryOnServerError && attempt < totalAttempts - 1) {
        if (!silent) console.warn(`[fetchWithRetry] ${resp.status} on attempt ${attempt + 1}/${totalAttempts} — retrying`);
        lastError = new Error(`HTTP ${resp.status}`);
        await _backoff(attempt, baseDelay, maxDelay);
        continue;
      }

      return resp;

    } catch (err) {
      lastError = err;

      // Caller-initiated abort — don't retry
      if (err.name === 'AbortError' && options.signal?.aborted) {
        throw err;
      }

      // Network error or timeout — retry if attempts remain
      if (attempt < totalAttempts - 1) {
        if (!silent) {
          console.warn(
            `[fetchWithRetry] ${err.name || 'Error'} on attempt ${attempt + 1}/${totalAttempts}: ${err.message || err} — retrying`
          );
        }
        await _backoff(attempt, baseDelay, maxDelay);
        continue;
      }
    }
  }

  // All attempts exhausted
  throw lastError || new Error('fetchWithRetry: all attempts failed');
}

/**
 * Exponential backoff with jitter.
 * @param {number} attempt — 0-indexed attempt number
 * @param {number} baseDelay
 * @param {number} maxDelay
 */
function _backoff(attempt, baseDelay, maxDelay) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = delay * (0.5 + Math.random() * 0.5); // 50-100% of delay
  return new Promise(r => setTimeout(r, jitter));
}

/**
 * Convenience: fire-and-forget fetch. Logs errors but never throws.
 * Useful for analytics/telemetry calls.
 */
export async function fetchFireAndForget(url, options = {}, config = {}) {
  try {
    return await fetchWithRetry(url, options, { ...config, silent: true, retries: 1 });
  } catch {
    // Silently swallow — caller explicitly chose fire-and-forget
    return null;
  }
}
