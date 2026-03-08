// extension/utils/killSwitch.ts — CS-013 FIX-13
// Three-layer kill-switch per ADR-006:
//   Layer 1: Heartbeat directives (server returns { kill: true } in heartbeat response)
//   Layer 2: Externally connectable message (admin page sends kill message to extension)
//   Layer 3: DB flag (extension checks `feature_flags` table on startup)
//
// When killed:
//   - All scanning stops immediately
//   - Content scripts are notified to detach
//   - Kill state persists in chrome.storage.local
//   - Extension continues running (popup still works, login still works)
//   - Only scanning/filling/overlay features are disabled
//
// Usage in background.js:
//   import { killSwitch } from '../utils/killSwitch.ts';
//   if (killSwitch.isKilled()) return; // check before scanning

const KILL_STORAGE_KEY = '_bj_kill_switch';
const KILL_REASON_KEY = '_bj_kill_reason';

let _killed = false;
let _killReason = '';

/**
 * Initialize kill-switch state from storage on startup.
 */
async function init() {
  try {
    const data = await chrome.storage.local.get([KILL_STORAGE_KEY, KILL_REASON_KEY]);
    _killed = data[KILL_STORAGE_KEY] === true;
    _killReason = data[KILL_REASON_KEY] || '';
    if (_killed) {
      console.warn('[kill-switch] Extension is in killed state. Reason:', _killReason);
    }
  } catch (e) {
    console.warn('[kill-switch] Failed to read state:', e.message);
  }
}

/**
 * Check if the extension is currently killed.
 * @returns {boolean}
 */
function isKilled() {
  return _killed;
}

/**
 * Get the kill reason.
 * @returns {string}
 */
function getKillReason() {
  return _killReason;
}

/**
 * Activate the kill-switch.
 * @param {string} reason — why the kill was triggered
 * @param {string} [layer] — which layer triggered it ('heartbeat', 'external', 'db_flag')
 */
async function kill(reason, layer = 'unknown') {
  _killed = true;
  _killReason = reason || `Killed via ${layer}`;
  try {
    await chrome.storage.local.set({
      [KILL_STORAGE_KEY]: true,
      [KILL_REASON_KEY]: _killReason
    });
    console.warn(`[kill-switch] ACTIVATED via ${layer}:`, _killReason);

    // Notify all content scripts to detach
    _notifyContentScripts({ action: '_bj_kill_switch_activated', reason: _killReason });

    // Log event for diagnostics
    _logKillEvent(layer, reason);
  } catch (e) {
    console.error('[kill-switch] Failed to persist kill state:', e.message);
  }
}

/**
 * Deactivate the kill-switch (resume scanning).
 * @param {string} [layer] — which layer triggered the resume
 */
async function resume(layer = 'unknown') {
  _killed = false;
  _killReason = '';
  try {
    await chrome.storage.local.remove([KILL_STORAGE_KEY, KILL_REASON_KEY]);
    console.log(`[kill-switch] DEACTIVATED via ${layer}`);

    // Notify content scripts they can resume
    _notifyContentScripts({ action: '_bj_kill_switch_deactivated' });
  } catch (e) {
    console.error('[kill-switch] Failed to clear kill state:', e.message);
  }
}

// ─── Layer 1: Heartbeat Directive Handler ────────────────────

/**
 * Process heartbeat response for kill directives.
 * Called from sendHeartbeat() after parsing response JSON.
 *
 * @param {object} heartbeatResponse — parsed JSON from extension-heartbeat EF
 */
async function processHeartbeatDirective(heartbeatResponse) {
  if (!heartbeatResponse) return;

  const directive = heartbeatResponse.directive || heartbeatResponse.kill_switch;

  if (directive === 'kill' || directive === true) {
    const reason = heartbeatResponse.kill_reason || 'Server directive via heartbeat';
    await kill(reason, 'heartbeat');
  } else if (directive === 'resume' || directive === false) {
    if (_killed) {
      await resume('heartbeat');
    }
  }
  // directive === undefined or null → no change
}

// ─── Layer 2: External Message Handler ────────────────────────

/**
 * Handle external messages from admin page (externally_connectable).
 * Register this in background.js:
 *   chrome.runtime.onMessageExternal.addListener(killSwitch.handleExternalMessage);
 *
 * @param {object} message
 * @param {object} sender
 * @param {function} sendResponse
 */
function handleExternalMessage(message, sender, sendResponse) {
  // Only accept kill messages from brilliantjobs.app
  const allowedOrigins = [
    'https://brilliantjobs.app',
    'https://www.brilliantjobs.app',
    'https://staging.brilliantjobs.app'
  ];

  const senderOrigin = sender.url ? new URL(sender.url).origin : '';
  if (!allowedOrigins.includes(senderOrigin)) {
    sendResponse({ error: 'Unauthorized origin' });
    return;
  }

  if (message.type === '_bj_kill_switch') {
    if (message.action === 'kill') {
      kill(message.reason || 'Admin kill command', 'external')
        .then(() => sendResponse({ ok: true, killed: true }));
    } else if (message.action === 'resume') {
      resume('external')
        .then(() => sendResponse({ ok: true, killed: false }));
    } else if (message.action === 'status') {
      sendResponse({ ok: true, killed: _killed, reason: _killReason });
    }
    return true; // async response
  }
}

// ─── Layer 3: DB Flag Check ──────────────────────────────────

/**
 * Check the feature_flags table for a kill-switch flag.
 * Call on extension startup and periodically (e.g., once per hour).
 *
 * @param {string} supabaseUrl
 * @param {string} supabaseKey — anon key
 * @param {string} [authToken] — user's JWT (optional)
 */
async function checkDbFlag(supabaseUrl, supabaseKey, authToken) {
  try {
    const headers = {
      'apikey': supabaseKey,
      'Content-Type': 'application/json'
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const resp = await fetch(
      `${supabaseUrl}/rest/v1/feature_flags?key=eq.extension_kill_switch&select=value`,
      { headers, signal: AbortSignal.timeout(10000) }
    );

    if (!resp.ok) {
      console.warn('[kill-switch] DB flag check failed:', resp.status);
      return;
    }

    const rows = await resp.json();
    const flag = rows?.[0]?.value;

    if (flag === true || flag === 'true' || flag === 'kill') {
      if (!_killed) {
        await kill('DB flag: extension_kill_switch = true', 'db_flag');
      }
    } else if (flag === false || flag === 'false' || flag === 'resume' || flag === null) {
      if (_killed && _killReason.includes('DB flag')) {
        await resume('db_flag');
      }
    }
  } catch (e) {
    // DB flag check is best-effort — don't block
    console.warn('[kill-switch] DB flag check error:', e.message);
  }
}

// ─── Internal Helpers ────────────────────────────────────────

/**
 * Notify all tabs' content scripts about kill state change.
 */
function _notifyContentScripts(message) {
  try {
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // Tab might not have content script — expected
          });
        }
      }
    });
  } catch {
    // Fail silently — best-effort notification
  }
}

/**
 * Log kill event for diagnostics (fire-and-forget to PostHog-style event).
 */
function _logKillEvent(layer, reason) {
  try {
    chrome.runtime.sendMessage({
      type: 'kill_switch_event',
      data: {
        layer,
        reason,
        killed: _killed,
        timestamp: Date.now()
      }
    }).catch(() => {});
  } catch {
    // Fail silently
  }
}

// ─── Public API ──────────────────────────────────────────────

export const killSwitch = {
  init,
  isKilled,
  getKillReason,
  kill,
  resume,
  processHeartbeatDirective,
  handleExternalMessage,
  checkDbFlag
};
