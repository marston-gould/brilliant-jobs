// utils/errorReporter.ts — REM-002: Extension Error Reporting Utility
// Replaces fire-and-forget .catch(()=>{}) with structured error capture.
// Routes errors to PostHog via background captureEvent().

/**
 * Report a caught error to PostHog via background script.
 * Non-blocking — never throws, never disrupts calling code.
 *
 * Usage:
 *   somePromise.catch(catchAndReport('token_sync'));
 *   // or inline:
 *   somePromise.catch(e => reportCatchError('token_sync', e));
 */
export function reportCatchError(context: string, error?: unknown): void {
  try {
    const msg = error instanceof Error ? error.message : String(error || 'unknown');
    chrome.runtime.sendMessage({
      type: 'reportError',
      payload: { context, error: msg, timestamp: new Date().toISOString() }
    }).catch(() => {});  // Last-resort: if background can't receive, truly silent
  } catch {
    // Extension context may be invalidated — nothing to do
  }
}

/**
 * Returns a catch handler function for promise chains.
 * Usage: somePromise.catch(catchAndReport('my_context'));
 */
export function catchAndReport(context: string): (error?: unknown) => void {
  return (error?: unknown) => reportCatchError(context, error);
}

/**
 * Check chrome.runtime.lastError and report if present.
 * Call at the start of chrome API callbacks.
 * Returns true if there was an error (caller should bail).
 *
 * Usage:
 *   chrome.storage.local.get('key', (data) => {
 *     if (checkLastError('storage_get_key')) return;
 *     // proceed with data
 *   });
 */
export function checkLastError(context: string): boolean {
  if (chrome.runtime.lastError) {
    reportCatchError(context + '_lastError', chrome.runtime.lastError.message);
    return true;
  }
  return false;
}
