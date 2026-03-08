// extension/utils/fillMetrics.ts — Fill Metrics & Feedback Loop
// v2.16.0 / v5.56: Item #5 — Tracks per-platform fill success/failure rates,
// fires PostHog events from extension, and provides thumbs up/down on AI answers.
//
// Usage from handlers:
//   import { fillMetrics } from '../utils/fillMetrics.ts';
//   fillMetrics.trackFill({ ats: 'greenhouse', fields: 12, filled: 11, skipped: 1, errors: 0, timeMs: 2300 });
//   fillMetrics.trackAIAnswer({ fieldName: 'cover_letter', answer: '...', quality: 'good' });

// ============================================================
// POSTHOG INTEGRATION
// ============================================================

const POSTHOG_API_KEY = 'phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww'; // CS-003: wired to prod key
const POSTHOG_HOST = 'https://us.i.posthog.com';

async function getDistinctId() {
  try {
    const data = await chrome.storage.local.get('authSession');
    return data.authSession?.user_id || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

async function captureEvent(eventName, properties = {}) {
  try {
    const distinctId = await getDistinctId();
    const payload = {
      api_key: POSTHOG_API_KEY,
      event: eventName,
      properties: {
        distinct_id: distinctId,
        $lib: 'brilliant-jobs-extension',
        $lib_version: chrome.runtime.getManifest().version,
        ...properties,
      },
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget — don't block on analytics
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // CS-013 FIX-12: 10s timeout
    }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'fill_metrics_posthog', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
  } catch (e) {
    try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'fill_metrics_capture', error: e?.message || String(e) } }).catch(() => {}); } catch {}
  }
}

// ============================================================
// SUPABASE METRICS PERSISTENCE
// ============================================================

async function persistMetric(metric) {
  try {
    const data = await chrome.storage.local.get('authSession');
    const session = data.authSession;
    if (!session?.access_token || !session?.user_id) return;

    const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';

    await fetch(`${SUPABASE_URL}/rest/v1/extension_fill_metrics`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': session.anon_key || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        'Authorization': `Bearer ${session.access_token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        user_id: session.user_id,
        ...metric,
        created_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(10000), // CS-013 FIX-12: 10s timeout
    }).catch(e => { try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'fill_metrics_persist', error: e?.message || String(e) } }).catch(() => {}); } catch {} });
  } catch (e) {
    try { chrome.runtime.sendMessage({ type: 'reportError', payload: { context: 'fill_metrics_persist_outer', error: e?.message || String(e) } }).catch(() => {}); } catch {}
  }
}

// ============================================================
// LOCAL METRICS BUFFER
// ============================================================

// Buffer metrics locally in case network fails; flush periodically
const BUFFER_KEY = 'bj_metrics_buffer';
const MAX_BUFFER = 50;

async function bufferMetric(metric) {
  try {
    const data = await chrome.storage.local.get(BUFFER_KEY);
    const buffer = data[BUFFER_KEY] || [];
    buffer.push({ ...metric, buffered_at: Date.now() });

    // Cap buffer size
    if (buffer.length > MAX_BUFFER) buffer.shift();

    await chrome.storage.local.set({ [BUFFER_KEY]: buffer });
  } catch {
    // Silent
  }
}

async function flushBuffer() {
  try {
    const data = await chrome.storage.local.get(BUFFER_KEY);
    const buffer = data[BUFFER_KEY] || [];
    if (buffer.length === 0) return;

    // Attempt to persist each buffered metric
    const remaining = [];
    for (const metric of buffer) {
      try {
        await persistMetric(metric);
      } catch {
        remaining.push(metric);
      }
    }

    await chrome.storage.local.set({ [BUFFER_KEY]: remaining });
  } catch {
    // Silent
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export const fillMetrics = {

  /**
   * Track a form fill attempt.
   * Call after handler.fill() completes.
   *
   * @param {Object} params
   * @param {string} params.ats - ATS platform id (e.g. 'greenhouse', 'generic')
   * @param {string} params.url - Page URL (hostname only for privacy)
   * @param {number} params.fields - Total fields detected
   * @param {number} params.filled - Fields successfully filled
   * @param {number} params.skipped - Fields skipped (already filled, not applicable)
   * @param {number} params.errors - Fields that errored during fill
   * @param {number} params.timeMs - Total fill time in ms
   * @param {boolean} params.usedGeneric - Whether generic handler was used as fallback
   * @param {string[]} params.errorDetails - Array of error messages (first 5)
   */
  async trackFill({
    ats = 'unknown',
    url = '',
    fields = 0,
    filled = 0,
    skipped = 0,
    errors = 0,
    timeMs = 0,
    usedGeneric = false,
    errorDetails = [],
  }) {
    // Strip to hostname for privacy
    let hostname = '';
    try { hostname = new URL(url).hostname; } catch { hostname = url; }

    const metric = {
      event_type: 'fill',
      ats_platform: ats,
      hostname,
      total_fields: fields,
      filled_fields: filled,
      skipped_fields: skipped,
      error_fields: errors,
      fill_time_ms: timeMs,
      used_generic: usedGeneric,
      success_rate: fields > 0 ? Math.round((filled / fields) * 100) : 0,
      error_details: errorDetails.slice(0, 5).join('; '),
      extension_version: chrome.runtime.getManifest().version,
    };

    // Persist to Supabase
    persistMetric(metric);

    // Buffer locally as backup
    bufferMetric(metric);

    // Fire PostHog event
    captureEvent('extension_fill_completed', {
      ats_platform: ats,
      total_fields: fields,
      filled_fields: filled,
      skipped_fields: skipped,
      error_fields: errors,
      fill_time_ms: timeMs,
      success_rate: metric.success_rate,
      used_generic: usedGeneric,
    });

    console.log(`[BJ Metrics] Fill tracked: ${ats} — ${filled}/${fields} fields (${metric.success_rate}%)`);
  },

  /**
   * Track an AI answer quality rating (thumbs up/down).
   *
   * @param {Object} params
   * @param {string} params.fieldName - The field that was answered
   * @param {string} params.answer - The AI-generated answer (truncated to 500 chars)
   * @param {'good'|'bad'} params.quality - User rating
   * @param {string} params.ats - ATS platform
   * @param {string} params.question - The original question (truncated to 200 chars)
   */
  async trackAIAnswer({
    fieldName = '',
    answer = '',
    quality = 'good',
    ats = 'unknown',
    question = '',
  }) {
    const metric = {
      event_type: 'ai_feedback',
      ats_platform: ats,
      field_name: fieldName,
      question: question.slice(0, 200),
      answer_preview: answer.slice(0, 500),
      quality_rating: quality,
      extension_version: chrome.runtime.getManifest().version,
    };

    persistMetric(metric);
    bufferMetric(metric);

    captureEvent('extension_ai_feedback', {
      ats_platform: ats,
      field_name: fieldName,
      quality_rating: quality,
    });

    console.log(`[BJ Metrics] AI feedback: ${fieldName} — ${quality}`);
  },

  /**
   * Track overlay interaction events.
   *
   * @param {string} action - e.g. 'shown', 'dismissed', 'success_shown', 'error_shown'
   * @param {Object} details - Additional context
   */
  async trackOverlay(action, details = {}) {
    captureEvent('extension_overlay_' + action, details);
  },

  /**
   * Flush buffered metrics to Supabase.
   * Call periodically from background.js alarm handler.
   */
  flushBuffer,
};

export default fillMetrics;
