// @ts-nocheck — Phase 2: Remove this once globals.ts is fully strict-typed
// Full strict typing tracked in docs/adr/adr-typescript.md
// ============================================================
// GLOBALS — Shared state across all dashboard modules
// Must load before all other JS modules
// ============================================================

// ============================================================
// CS-P1-004 FE-005: Controlled namespace registry
// All new function exports MUST go through BJ.export() instead of window.X = Y.
// Existing window.X aliases kept for backward compat with onclick handlers.
// Phase F (TypeScript migration) will remove window.X aliases entirely.
// ============================================================
window.BJ = window.BJ || {};
window.BJ._registry = {};
/**
 * Register a function in the BJ namespace.
 * Also sets window[name] for backward compat with HTML onclick handlers.
 * @param {string} name - Function name
 * @param {Function} fn - The function to register
 * @param {string} [module] - Source module for debugging
 */
window.BJ.export = function(name: string, fn: Function, module?: string): void {
  window.BJ[name] = fn;
  window.BJ._registry[name] = { module: module || 'unknown', registered: Date.now() };
  // Backward compat: also set on window for onclick= handlers
  // TODO(Phase-F): Remove after migrating all onclick handlers to event delegation
  window[name] = fn;
};

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

// DO-002: Connection management — Supavisor pooler enabled at project level.
// REST API (PostgREST) is automatically pooled. Client-side uses REST only.
// Edge Functions use pooled connection via SUPABASE_SERVICE_ROLE_KEY.
// Global fetch wrapper adds 30s timeout to prevent hung connections.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    fetch: function(url: RequestInfo | URL, options?: RequestInit) {
      var controller = new AbortController();
      var timeoutId = setTimeout(function() { controller.abort(); }, 30000);
      return fetch(url, Object.assign({}, options, { signal: controller.signal }))
        .finally(function() { clearTimeout(timeoutId); });
    }
  }
});
window.bjSupabase = sb; // Expose for IIFE modules (referrals.js, etc.)
window._bjSupa = sb; // Legacy alias for admin modules

// PostHog analytics (A13)
window.POSTHOG_API_KEY = 'phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww';
const $ = (s: string): Element | null => document.querySelector(s);
const $$ = (s: string): NodeListOf<Element> => document.querySelectorAll(s);

// ============================================================
// XSS PROTECTION — escapeHtml utility (v3.90)
// ============================================================
// Use for any user-generated content rendered via innerHTML/template literals.
// Does NOT replace DOMPurify for untrusted rich HTML (job descriptions).

var _escapeEl = document.createElement('div');
/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Untrusted string
 * @returns {string} Escaped string safe for innerHTML
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  _escapeEl.textContent = str;
  return _escapeEl.innerHTML;
}

/**
 * Truncate string with HTML escaping (safe for innerHTML).
 * Drop-in replacement for raw truncate() in user-generated contexts.
 * @param {string} str - Untrusted string
 * @param {number} max - Max length
 * @returns {string} Escaped and truncated string
 */
function truncateSafe(str: string, max: number): string {
  if (!str) return '\u2014';
  var trimmed = str.length > max ? str.slice(0, max) + '\u2026' : str;
  return escapeHtml(trimmed);
}

// ============================================================
// TOAST NOTIFICATION SYSTEM — User-facing errors (v3.90)
// ============================================================
// Replaces silent console.error/warn for Supabase failures, auth issues, etc.

var _toastContainer: HTMLElement | null = null;
var _toastQueue = [];
var _toastCount = 0;
var _MAX_TOASTS = 3;

function _ensureToastContainer(): void {
  if (_toastContainer && document.body.contains(_toastContainer)) return;
  _toastContainer = document.createElement('div');
  _toastContainer.id = 'bj-toast-container';
  _toastContainer.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99998;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;max-width:380px;';
  document.body.appendChild(_toastContainer);
}

/**
 * Show a toast notification to the user.
 * @param {string} message - Message text (will be escaped)
 * @param {object} opts - { type: 'error'|'warning'|'success'|'info', duration: ms, action: { label, fn } }
 */
function showToast(message: string, opts?: ToastOptions): HTMLElement {
  var type = (opts && opts.type) || 'info';
  var duration = (opts && opts.duration) || (type === 'error' ? 6000 : 4000);

  _ensureToastContainer();

  // Enforce max visible toasts
  if (_toastCount >= _MAX_TOASTS) {
    var oldest = _toastContainer.querySelector('.bj-toast');
    if (oldest) _dismissToast(oldest);
  }

  var colors = {
    error:   { bg: 'hsl(0, 84%, 60%)',   icon: '\u2716' },
    warning: { bg: 'hsl(38, 92%, 50%)',   icon: '\u26A0' },
    success: { bg: 'hsl(142, 71%, 45%)',  icon: '\u2714' },
    info:    { bg: 'hsl(217, 100%, 62%)', icon: '\u2139' }
  };
  var c = colors[type] || colors.info;

  var toast = document.createElement('div');
  toast.className = 'bj-toast';
  toast.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;background:hsl(230,28%,14%);color:#f0f1f3;font-size:13px;font-family:Outfit,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;transform:translateY(12px);transition:opacity .25s,transform .25s;max-width:380px;word-break:break-word;';

  var iconSpan = '<span style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:' + c.bg + ';display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">' + c.icon + '</span>';
  var closeBtn = '<button style="flex-shrink:0;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;" title="Dismiss">\u2715</button>';
  var actionHtml = '';
  if (opts && opts.action) {
    actionHtml = '<button class="bj-toast-action" style="flex-shrink:0;background:none;border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;white-space:nowrap;">' + escapeHtml(opts.action.label) + '</button>';
  }
  toast.innerHTML = iconSpan + '<span style="flex:1;">' + escapeHtml(message) + '</span>' + actionHtml + closeBtn;

  // Close button handler
  toast.querySelector('button:last-child').addEventListener('click', function() { _dismissToast(toast); });

  // Action button handler
  if (opts && opts.action) {
    toast.querySelector('.bj-toast-action').addEventListener('click', function() {
      if (opts.action.fn) opts.action.fn();
      _dismissToast(toast);
    });
  }

  _toastContainer.appendChild(toast);
  _toastCount++;

  // Animate in
  requestAnimationFrame(function() { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(function() { _dismissToast(toast); }, duration);
  }

  return toast;
}

function _dismissToast(toast: HTMLElement): void {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(12px)';
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    _toastCount = Math.max(0, _toastCount - 1);
  }, 250);
}

// Convenience shortcuts
function toastError(msg: string, opts?: Partial<ToastOptions>): HTMLElement { return showToast(msg, Object.assign({ type: 'error' }, opts || {})); }
function toastWarning(msg: string, opts?: Partial<ToastOptions>): HTMLElement { return showToast(msg, Object.assign({ type: 'warning' }, opts || {})); }
function toastSuccess(msg: string, opts?: Partial<ToastOptions>): HTMLElement { return showToast(msg, Object.assign({ type: 'success' }, opts || {})); }
function toastInfo(msg: string, opts?: Partial<ToastOptions>): HTMLElement { return showToast(msg, Object.assign({ type: 'info' }, opts || {})); }

// ============================================================
// LOCALSTORAGE ENCRYPTION FOR PII (v3.90)
// ============================================================
// Encrypts sensitive data at rest using AES-GCM with a key derived from the user's session.
// Only PII keys are encrypted: resume text, keywords, LinkedIn profile data.

// PII encryption disabled (BUGFIX-002): async encrypt/write cycle is fragile —
// any interruption corrupts localStorage, causing "enc:..." parse failures on load
// and wiping resume data. Cloud (profiles.user_data) is protected by RLS.
// localStorage is same-origin only. Encryption adds risk without meaningful benefit.
var _encryptionKey: CryptoKey | null = null;
var _PII_KEYS: string[] = [];

/**
 * Derive an AES-GCM encryption key from the user's Supabase session ID.
 * Key is deterministic per user (same user = same key).
 */
async function _deriveEncryptionKey(userId: string): Promise<CryptoKey> {
  if (_encryptionKey) return _encryptionKey;
  var encoder = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(userId + ':bj_pii_v1'), 'PBKDF2', false, ['deriveKey']);
  _encryptionKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('brilliant-jobs-pii-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  return _encryptionKey;
}

/**
 * Encrypt a string value for localStorage storage.
 * @param {string} plaintext - Value to encrypt
 * @param {string} userId - User ID for key derivation
 * @returns {Promise<string>} Base64-encoded ciphertext with IV prefix
 */
async function encryptForStorage(plaintext: string, userId: string): Promise<string> {
  try {
    var key = await _deriveEncryptionKey(userId);
    var encoder = new TextEncoder();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(plaintext));
    // Prepend IV to ciphertext
    var combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return 'enc:' + btoa(String.fromCharCode.apply(null, combined));
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[BJ] Encryption failed, storing plaintext:', (e as Error).message);
    return plaintext;
  }
}

/**
 * Decrypt a localStorage value.
 * @param {string} ciphertext - Base64-encoded value from localStorage
 * @param {string} userId - User ID for key derivation
 * @returns {Promise<string>} Decrypted plaintext
 */
async function decryptFromStorage(ciphertext: string, userId: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith('enc:')) return ciphertext; // Not encrypted
  try {
    var key = await _deriveEncryptionKey(userId);
    var raw = atob(ciphertext.slice(4));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    var iv = bytes.slice(0, 12);
    var data = bytes.slice(12);
    var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[BJ] Decryption failed (key mismatch or corruption):', (e as Error).message);
    return null;
  }
}

/** Check if a localStorage key is PII and should be encrypted */
function isPiiKey(lsKey: string): boolean {
  return _PII_KEYS.indexOf(lsKey) !== -1;
}

/**
 * Read a PII key from localStorage, decrypting if needed. (v5.16)
 * Falls back to plaintext for unencrypted legacy data (migration-safe).
 * @param {string} lsKey - localStorage key
 * @returns {Promise<any>} Parsed JSON value
 */
async function readPiiData(lsKey: string): Promise<unknown> {
  var raw = localStorage.getItem(lsKey);
  if (!raw) return null;
  // BUGFIX-002: PII encryption removed. Clean up any leftover encrypted values
  // so cloud recovery kicks in on next load.
  if (raw.startsWith('enc:')) {
    console.log('[pii] Removing leftover encrypted value for', lsKey);
    localStorage.removeItem(lsKey);
    return null;
  }
  try { return JSON.parse(raw); } catch(e: unknown) { return null; }
}

/**
 * Safe synchronous localStorage read. (v5.22 hotfix)
 * Returns fallback if the value starts with 'enc:' (encrypted, can't parse as JSON)
 * or if JSON.parse fails for any reason. Use this everywhere instead of raw
 * JSON.parse(localStorage.getItem(...)).
 */
function safeReadLS<T>(key: string, fallback: T): T {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    // BUGFIX-002: Clean up leftover encrypted values from disabled PII encryption
    if (raw.startsWith('enc:')) {
      localStorage.removeItem(key);
      return fallback;
    }
    return JSON.parse(raw);
  } catch(e: unknown) { return fallback; }
}
window._safeReadLS = safeReadLS; // Expose for modules

// ============================================================
// SESSION MANAGEMENT HARDENING (v3.90)
// ============================================================
// - Monitors auth state changes for session expiry
// - Auto-refreshes tokens before expiry
// - Warns user before forced logout
// - Inactivity timeout for PII protection

var _sessionInactivityTimer: ReturnType<typeof setInterval> | null = null;
var _SESSION_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
var _lastActivity = Date.now();
var _sessionWarningShown = false;

/** Initialize session management */
function initSessionManagement(): void {
  // Listen for auth state changes (session expiry, token refresh)
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      if (event === 'SIGNED_OUT') {
        _clearSensitiveData();
        window.location.href = '/?session_expired=1';
      }
    }
    if (event === 'TOKEN_REFRESHED') {
      console.log('[BJ] Session token refreshed');
      _lastActivity = Date.now();
    }
  });

  // Track user activity for inactivity timeout
  ['click', 'keydown', 'scroll', 'mousemove'].forEach(function(evt) {
    document.addEventListener(evt, _trackActivity, { passive: true });
  });

  // Check inactivity every minute
  _sessionInactivityTimer = setInterval(_checkInactivity, 60000);

  // Periodically verify session is still valid
  setInterval(_verifySession, 5 * 60 * 1000); // every 5 min
}

function _trackActivity(): void {
  _lastActivity = Date.now();
  if (_sessionWarningShown) {
    _sessionWarningShown = false;
    // User came back — dismiss inactivity warning
  }
}

function _checkInactivity() {
  var idle = Date.now() - _lastActivity;
  if (idle > _SESSION_INACTIVITY_MS && !_sessionWarningShown) {
    _sessionWarningShown = true;
    showToast('Your session will expire soon due to inactivity.', {
      type: 'warning',
      duration: 0, // persistent until action
      action: { label: 'Stay signed in', fn: function() {
        _lastActivity = Date.now();
        _sessionWarningShown = false;
        sb.auth.getSession(); // triggers refresh
        toastSuccess('Session extended.');
      }}
    });
  }
  // Force logout after 2x the inactivity timeout
  if (idle > _SESSION_INACTIVITY_MS * 2) {
    _clearSensitiveData();
    // CS-P1-007 DS1-4: Reset PostHog identity on forced logout
    if (window.posthog) { try { posthog.reset(); } catch (_) {} }
    sb.auth.signOut();
  }
}

async function _verifySession(): Promise<void> {
  try {
    var result = await sb.auth.getSession();
    if (!result.data.session) {
      toastError('Your session has expired. Please sign in again.', {
        duration: 0,
        action: { label: 'Sign in', fn: function() { window.location.href = '/'; } }
      });
    }
  } catch (e: unknown) {
    // Network error — don't force logout
  }
}

/** Clear sensitive data on logout / session expiry */
function _clearSensitiveData(): void {
  _encryptionKey = null;
  _PII_KEYS.forEach(function(key) {
    localStorage.removeItem(key);
  });
  // Clear any cached query data
  clearAllCaches();
}

// Auth
var currentUser: SupabaseAuthUser | null = null;

// ============================================================
// USER DATA SYNC — localStorage ↔ Supabase profiles.user_data
// ============================================================
// Maps short keys to localStorage keys
const UD_KEYS = {
  saved_filters: 'bj_saved_filters',
  resumes: 'bj_resumes',
  pipeline_meta: 'bj_pipeline_meta',
  tuning: 'bj_tuning',
  saved_jobs: 'bj_saved_jobs',
  applied_jobs: 'bj_applied_jobs',
  applied_dates: 'bj_applied_dates',
  hidden_jobs: 'bj_hidden_jobs',
  app_queue: 'bj_app_queue',
  app_history: 'bj_app_history',
  readiness: 'bj_readiness'
};
const UD_LS_TO_SHORT = Object.fromEntries(Object.entries(UD_KEYS).map(([k,v]) => [v, k]));

// Debounce timer for batched Supabase writes
let _udSyncTimer = null;
let _udPendingKeys = new Set();

/**
 * Save user data to localStorage AND queue Supabase sync.
 * Drop-in replacement for localStorage.setItem('bj_X', JSON.stringify(val)).
 * @param {string} lsKey - Full localStorage key (e.g. 'bj_saved_filters')
 * @param {string} jsonStr - JSON string to save
 */
function saveUserData(lsKey: string, jsonStr: string): boolean {
  // Size guard: warn if single key exceeds 500KB, reject if >2MB (v3.85)
  var bytes = new Blob([jsonStr]).size;
  if (bytes > 2 * 1024 * 1024) {
    console.error('[BJ] Storage rejected: ' + lsKey + ' is ' + Math.round(bytes / 1024) + 'KB (>2MB limit)');
    return false;
  }
  if (bytes > 500 * 1024) {
    console.warn('[BJ] Storage warning: ' + lsKey + ' is ' + Math.round(bytes / 1024) + 'KB');
  }
  // BUGFIX-002: PII encryption removed — write plaintext directly
  try {
    localStorage.setItem(lsKey, jsonStr);
  } catch (e: unknown) {
    reportError('globals', e);
    console.error('[BJ] Storage full! Failed to save ' + lsKey + ':', (e as Error).message);
    _handleStorageFull(lsKey);
    return false;
  }
  const shortKey = UD_LS_TO_SHORT[lsKey];
  if (shortKey && currentUser) {
    _udPendingKeys.add(shortKey);
    clearTimeout(_udSyncTimer);
    _udSyncTimer = setTimeout(_flushUserData, 2000);
  }
  return true;
}

/** Flush all pending keys to Supabase in one PATCH */
async function _flushUserData() {
  if (!currentUser || _udPendingKeys.size === 0) return;
  const patch = {};
  for (const key of _udPendingKeys) {
    const lsKey = UD_KEYS[key];
    try {
      var raw = localStorage.getItem(lsKey) || 'null';
      // BUGFIX-002: Skip any leftover encrypted values — cloud already has plaintext
      if (raw.startsWith('enc:')) {
        console.log('[sync] Skipping encrypted value for', lsKey, 'during flush');
        continue;
      }
      patch[key] = JSON.parse(raw);
    }
    catch { patch[key] = null; }
  }
  _udPendingKeys.clear();
  try {
    const { error } = await sb.from('profiles')
      .update({ user_data: sb.rpc ? undefined : undefined }) // placeholder
      .eq('id', currentUser.id);
    // Use raw PATCH to merge into JSONB (not overwrite entire column)
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ user_data: Object.assign(
        safeReadLS('_bj_ud_cache', {}),
        patch
      )})
    });
    // Update local cache of full user_data
    const cached = safeReadLS('_bj_ud_cache', {});
    Object.assign(cached, patch);
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cached));
    console.log('[sync] Flushed', Object.keys(patch).join(', '));
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[sync] Flush error:', (e as Error).message);
  }
}

/**
 * Load user data from Supabase on login. Merges with localStorage:
 * - Supabase wins if localStorage is empty for that key
 * - localStorage wins if Supabase is empty (first sync / migration)
 * - After merge, syncs back to Supabase
 */
async function loadUserData(userId: string): Promise<void> {
  try {
    const { data, error } = await sb.from('profiles')
      .select('user_data')
      .eq('id', userId)
      .single();
    if (error || !data?.user_data) {
      console.log('[sync] No cloud data, will sync localStorage up on next save');
      return;
    }
    const cloud = data.user_data;
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cloud));
    let needsSync = false;
    for (const [shortKey, lsKey] of Object.entries(UD_KEYS)) {
      const cloudVal = cloud[shortKey];
      let localVal = localStorage.getItem(lsKey);
      // BUGFIX-002: Clean up any leftover enc: values from disabled PII encryption
      // These can't be parsed as JSON and would crash JSON.parse below
      if (localVal && localVal.startsWith('enc:')) {
        console.log('[sync] Removing leftover encrypted value for', lsKey, '— cloud recovery will restore');
        localStorage.removeItem(lsKey);
        localVal = null;
      }
      const localParsed = localVal ? JSON.parse(localVal) : null;
      const cloudEmpty = cloudVal == null || (Array.isArray(cloudVal) && cloudVal.length === 0) || (typeof cloudVal === 'object' && !Array.isArray(cloudVal) && Object.keys(cloudVal).length === 0);
      // HOTFIX-MERGE-001: localEmpty only when key is truly absent (localVal === null).
      // An empty array [] is a valid state (user deleted all items) — not "missing".
      const localEmpty = localVal === null;

      if (!cloudEmpty && localEmpty) {
        // Cloud has data, local doesn't → pull from cloud
        var cloudJson = JSON.stringify(cloudVal);
        localStorage.setItem(lsKey, cloudJson);
        console.log('[sync] Pulled', shortKey, 'from cloud');
      } else if (cloudEmpty && !localEmpty) {
        // Local has data, cloud doesn't → queue sync up
        needsSync = true;
        _udPendingKeys.add(shortKey);
      } else if (!localEmpty) {
        // Both have data → local wins (user's current machine is source of truth)
        // CRITICAL: Update _bj_ud_cache with local value so that subsequent
        // flushes (for ANY key) don't resurrect stale cloud data.
        // Without this, _bj_ud_cache retains cloud's version (e.g. deleted filters)
        // and _flushUserData reads _bj_ud_cache + patch, sending old data back.
        var cache = safeReadLS('_bj_ud_cache', {});
        cache[shortKey] = localParsed;
        localStorage.setItem('_bj_ud_cache', JSON.stringify(cache));
      }
    }
    if (needsSync) {
      console.log('[sync] Local data needs upload:', [..._udPendingKeys].join(', '));
      _flushUserData();
    }
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[sync] Load error:', (e as Error).message);
  }
}

// ============================================================
// ENTITLEMENT SYSTEM — Cohort-aware feature gating
// Calls check_entitlement() RPC with client-side caching
// ============================================================

var _entitlementCache = {};
var _entitlementCacheTTL = 5 * 60 * 1000; // 5 min cache

/**
 * Check if user can use a feature. Returns { allowed, effective_limit, remaining, behavior, ... }
 * @param {string} feature - Feature ID (e.g. 'filters', 'resumes', 'resume_grading')
 * @param {number} [usageCount=0] - Current usage count to check against
 * @returns {Promise<object>} Entitlement result from server
 */
async function checkEntitlement(feature: string, usageCount: number): Promise<Record<string, unknown> | null> {
  // Admin bypass — unlimited access to all features
  if (window._bjUserRole === 'admin') return { allowed: true, behavior: 'fixed', effective_limit: 9999, remaining: 9999 };
  if (!currentUser) return { allowed: false, behavior: 'off', effective_limit: 0, remaining: 0 };
  if (typeof usageCount === 'undefined') usageCount = 0;
  var cacheKey = feature + ':' + usageCount;
  var cached = _entitlementCache[cacheKey];
  if (cached && Date.now() - cached._ts < _entitlementCacheTTL) return cached;
  try {
    var { data, error } = await sb.rpc('check_entitlement', {
      p_user_id: currentUser.id,
      p_feature: feature,
      p_usage_count: usageCount
    });
    if (error) { console.warn('[entitlement]', feature, error.message); return { allowed: true, behavior: 'fixed', effective_limit: 99, remaining: 99 }; }
    data._ts = Date.now();
    _entitlementCache[cacheKey] = data;
    return data;
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[entitlement] Error:', (e as Error).message);
    return { allowed: true, behavior: 'fixed', effective_limit: 99, remaining: 99 };
  }
}

/** Clear entitlement cache (call after usage changes) */
function clearEntitlementCache(feature: string): void {
  if (feature) {
    Object.keys(_entitlementCache).forEach(function(k) { if (k.startsWith(feature + ':')) delete _entitlementCache[k]; });
  } else {
    _entitlementCache = {};
  }
}

/**
 * Show upgrade prompt when a feature is gated.
 * @param {string} featureName - Human-readable feature name
 * @param {object} ent - Entitlement result from checkEntitlement()
 * @returns {boolean} true if blocked (caller should abort)
 */
function showUpgradePrompt(featureName: string, ent: Record<string, unknown>): void {
  var msg = ent.behavior === 'off'
    ? featureName + ' is a Pro feature. Upgrade to unlock it.'
    : 'You\'ve reached the ' + featureName + ' limit (' + ent.effective_limit + '). Upgrade to Pro for more.';
  // Create a toast-style notification
  var toast = document.createElement('div');
  toast.className = 'upgrade-toast';
  toast.innerHTML = '<div style="display:flex;align-items:center;gap:12px;">' +
    '<i data-lucide="star" class="icon-lg icon-stroke-lg" style="color:var(--accent);fill:var(--accent)"></i>' +
    '<div><div style="font-weight:600;color:var(--text);font-size:13px;">' + msg + '</div>' +
    '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Go to Settings → Subscription to upgrade.</div></div>' +
    '</div>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.classList.add('show'); });
  setTimeout(function() { toast.classList.remove('show'); setTimeout(function() { toast.remove(); }, 300); }, 4000);
  return true;
}

// Saved filters
var savedFilters = safeReadLS('bj_saved_filters', []);

// Tuning state (refined by tuning.js when it loads)
var tuningSettings = safeReadLS('bj_tuning', {});
var tuningLocExclPills = tuningSettings.locationExcludes || [];
var tuningTitleExclPills = tuningSettings.titleExcludes || [];
var tuningCoExclPills = tuningSettings.companyExcludes || [];
var tuningIndExclPills = tuningSettings.industryExcludes || [];
var levelHierarchy = tuningSettings.levelHierarchy || [];
// FIX: getJobLevel must be in the shell chunk because the feed chunk calls it during renderJobRows()
// before the tuning chunk lazy-loads. tuning.js re-declares this (identical) — last-load wins, no conflict.
function getJobLevel(title, hierarchy) {
  const levels = hierarchy || levelHierarchy;
  if (!title || levels.length === 0) return null;
  const t = ' ' + title.toLowerCase() + ' ';
  const entries = [];
  levels.forEach((lvl, rank) => {
    (lvl.keywords || '').split(',').forEach(kw => {
      const k = kw.trim().toLowerCase();
      if (k) entries.push({ keyword: k, rank, label: lvl.label, color: lvl.color || '#94a3b8' });
    });
  });
  entries.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const e of entries) {
    const escaped = e.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[\\s,\\-\\/\\(])${escaped}(?:[\\s,\\-\\/\\)]|$)`, 'i');
    if (re.test(t)) {
      return { rank: e.rank, label: e.label, color: e.color };
    }
  }
  return null;
}

// Pill arrays (used by query-builder.js, location.js, browsers.js)
var whatPills = [];
var wherePills = [];
var whenPills = [];
var whoPills = [];
var payPills = [];
var whatNotPills = [];
var whereNotPills = [];
var whoNotPills = [];
var skillsPills = [];
var levelPills = [];
var jdPills = [];
var deptPills = [];
var WORKPLACE_WORDS = ['remote','hybrid','onsite','on-site','in-office'];
var SALARY_RE = /^\$?\d{2,3}k?\+?$/i;
var DEFAULT_RADIUS = 30;

// Job feed state
var allJobs = [];
var currentJobs = [];
var jobSortStack = [{ field: 'first_seen_at', asc: false }];
var hiddenJobIds = safeReadLS('bj_hidden_jobs', []);
var savedJobIds = safeReadLS('bj_saved_jobs', []);
var appliedJobIds = safeReadLS('bj_applied_jobs', []);
var searchTimeout = null;
var currentJobPage = 0;
var JOBS_PER_PAGE = 24;
// FA-004: MAX_FEED_ROWS cap removed — real server-side pagination via range()
var _feedLoadMoreOffset = 0; // tracks how many rows loaded so far for Load More
var _feedTotalCount = 0; // total matching rows (from count: 'exact')

// Resume state (populated fully in resumes.js)
var resumes = safeReadLS('bj_resumes', []);

// Connection state — initialized here (shell) because app.js sets .ext and .gmail
// before integrations.js (deferred) loads. integrations.js will overwrite if needed.
window._connectionState = window._connectionState || { ext: false, gmail: false, gcal: false, gdrive: false };

// POD3-SF: readinessCache must be in globals (shell chunk) because resumes.js (deferred chunk)
// references it at load time. Previously it was only in keywords.js (keywords chunk) which
// loads AFTER deferred for the Resumes tab → ReferenceError.
var readinessCache = safeReadLS('bj_readiness', null);

// Shared filter color palette (10 colors for numbered filter badges)
var filterColors = ['#6366f1','#f59e0b','#ec4899','#22c55e','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6','#a855f7'];

/**
 * Enrich a job via Edge Function (service_role writes).
 * Replaces direct sb.from('ats_jobs').update() calls blocked by RLS.
 * @param {string} jobId - greenhouse_id
 * @param {object} data - { content?: string, salary?: { min, max, raw, currency, rate } }
 */
async function enrichJob(jobId: string, data: Record<string, unknown>): Promise<void> {
  try {
    // CS-002: Use session access_token for auth (was: anon key with no auth check on EF)
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    const resp = await fetch(SUPABASE_URL + '/functions/v1/enrich-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ job_id: jobId, ...data })
    });
    if (!resp.ok) console.warn('[enrich-job] Failed for', jobId, resp.status);
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[enrich-job] Error:', (e as Error).message);
  }
}



// ============================================================
// STORAGE HEALTH — size monitoring and emergency cleanup (v3.85)
// ============================================================

/** Get total localStorage usage in bytes */
function getStorageUsage(): { used: number; quota: number; percent: number } {
  var total = 0;
  var keys = {};
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var size = new Blob([localStorage.getItem(key)]).size;
    total += size + new Blob([key]).size;
    if (key.startsWith('bj_')) keys[key] = size;
  }
  return { totalBytes: total, totalKB: Math.round(total / 1024), bjKeys: keys };
}

/** Log storage usage to console (call from DevTools: storageHealth()) */
function storageHealth(): { ok: boolean; used: number; quota: number; warnings: string[] } {
  var usage = getStorageUsage();
  console.group('[BJ] Storage Health');
  console.log('Total localStorage:', usage.totalKB + 'KB');
  var sorted = Object.entries(usage.bjKeys).sort(function(a, b) { return b[1] - a[1]; });
  sorted.forEach(function(entry) {
    var pct = Math.round(entry[1] / usage.totalBytes * 100);
    console.log('  ' + entry[0] + ': ' + Math.round(entry[1] / 1024) + 'KB (' + pct + '%)');
  });
  console.log('Estimated limit: ~5MB (varies by browser)');
  console.log('Usage: ' + Math.round(usage.totalBytes / (5 * 1024 * 1024) * 100) + '% of estimated limit');
  console.groupEnd();
  return usage;
}

/** Emergency cleanup when storage is full */
function _handleStorageFull(failedKey: string): void {
  console.warn('[BJ] Running emergency storage cleanup...');
  // Priority: remove caches first, then old data
  var sacrificial = ['bj_readiness', 'bj_ref_city_radius', '_bj_ud_cache'];
  for (var i = 0; i < sacrificial.length; i++) {
    if (sacrificial[i] !== failedKey) {
      localStorage.removeItem(sacrificial[i]);
      console.log('[BJ] Cleared ' + sacrificial[i]);
    }
  }
  // Trim hidden_jobs and applied_jobs to last 500
  ['bj_hidden_jobs', 'bj_applied_jobs', 'bj_saved_jobs'].forEach(function(key) {
    try {
      var arr = safeReadLS(key, []);
      if (arr.length > 500) {
        arr = arr.slice(-500);
        localStorage.setItem(key, JSON.stringify(arr));
        console.log('[BJ] Trimmed ' + key + ' to 500 items');
      }
    } catch (e: unknown) { reportError('storage-trim', e); }
  });
  // Trim app_history to last 200
  try {
    var hist = safeReadLS('bj_app_history', []);
    if (hist.length > 200) {
      hist = hist.slice(-200);
      saveUserData('bj_app_history', JSON.stringify(hist));
      console.log('[BJ] Trimmed bj_app_history to 200 items');
    }
  } catch (e: unknown) { reportError("storage-trim-history", e); }
}

// ============================================================
// CACHED QUERY — in-memory cache with TTL (v3.84)
// ============================================================
// ============================================================
// IN-MEMORY QUERY CACHE (A14 — v6.54)
// ============================================================
// cachedQuery wraps Supabase queries with TTL-based caching.
// Returns { data, count, cached } — cached=true means result came from cache.
// Debug: set BJ_DEBUG_CACHE=1 in localStorage to see cache hit/miss logs.
// Usage: const { data, cached } = await cachedQuery('companies', () => sb.from('ats_companies').select('slug,name'), { ttl: 300000 });

var _queryCache: Record<string, CacheEntry> = {};
var statsCache: Record<string, unknown> = {};
var _cacheHits = 0;
var _cacheMisses = 0;
var _cacheDebug: boolean = (typeof localStorage !== 'undefined' && localStorage.getItem('BJ_DEBUG_CACHE') === '1');

// TTL tiers by key prefix (v6.55 A14 Session 2)
// ref: = reference/lookup tables (rarely change) — 1 hour
// feed: = job feed queries (change frequently) — 3 min
// stats: = stats/analytics queries — 10 min
// company: = company browser queries — 10 min
// default = 5 min
var CACHE_TTL_TIERS = {
  'ref:': 3600000,     // 1 hour
  'feed:': 180000,     // 3 min
  'stats:': 600000,    // 10 min
  'company:': 600000,  // 10 min
  'pipeline:': 300000, // 5 min
  'settings:': 600000  // 10 min
};
var CACHE_TTL_DEFAULT = 300000; // 5 min

/** Resolve TTL from key prefix tier or explicit opt */
function _resolveTTL(key: string, opts?: CacheOptions): number {
  if (opts && opts.ttl) return opts.ttl;
  var prefixes = Object.keys(CACHE_TTL_TIERS);
  for (var i = 0; i < prefixes.length; i++) {
    if (key.indexOf(prefixes[i]) === 0) return CACHE_TTL_TIERS[prefixes[i]];
  }
  return CACHE_TTL_DEFAULT;
}

/**
 * Execute a Supabase query with in-memory caching.
 * @param {string} key - Unique cache key (prefix determines TTL tier)
 * @param {function} queryFn - Function returning a Supabase query promise
 * @param {object} opts - { ttl: ms (overrides tier), force: boolean }
 * @returns {Promise<{data: any, count: number|null, cached: boolean}>}
 */
async function cachedQuery(key: string, queryFn: () => Promise<unknown>, opts?: CacheOptions): Promise<Record<string, unknown>> {
  var ttl = _resolveTTL(key, opts);
  var force = opts && opts.force;
  var entry = _queryCache[key];

  if (!force && entry && Date.now() - entry.ts < ttl) {
    _cacheHits++;
    if (_cacheDebug) console.log('[cache] HIT', key, '(' + Math.round((Date.now() - entry.ts)/1000) + 's old)');
    return { data: entry.data, count: entry.count, cached: true };
  }

  try {
    var result = await queryFn();
    if (result.error) {
      console.warn('[cachedQuery] Error for', key, result.error.message);
      if (entry) return { data: entry.data, count: entry.count, cached: true };
      return { data: null, count: null, cached: false };
    }
    _queryCache[key] = { data: result.data, ts: Date.now(), count: result.count };
    _cacheMisses++;
    if (_cacheDebug) console.log('[cache] MISS', key, '(' + (result.data ? result.data.length : 0) + ' rows)');
    return { data: result.data, count: result.count, cached: false };
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[cachedQuery] Failed for', key, (e as Error).message);
    if (entry) return { data: entry.data, count: entry.count, cached: true };
    return { data: null, count: null, cached: false };
  }
}

/** Get cached count (if query used { count: 'exact' }) */
function cachedCount(key: string): number | null {
  var entry = _queryCache[key];
  return entry ? entry.count : null;
}

/** Invalidate a specific cache key or all keys matching a prefix */
function invalidateCache(keyOrPrefix: string): void {
  if (!keyOrPrefix) { _queryCache = {}; return; }
  Object.keys(_queryCache).forEach(function(k) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ':')) delete _queryCache[k];
  });
  if (_cacheDebug) console.log('[cache] Invalidated', keyOrPrefix || 'ALL');
}

/** Clear ALL app caches — query cache + stats cache (if present) */
function clearAllCaches(): void {
  _queryCache = {};
  _cacheHits = 0;
  _cacheMisses = 0;
  // Clear stats module cache if it exists
  if (typeof statsCache !== 'undefined') {
    Object.keys(statsCache).forEach(function(k) { delete statsCache[k]; });
  }
  if (_cacheDebug) console.log('[cache] All caches cleared');
}

/** Generate a deterministic cache key from filter state (A14 Session 3) */
function _filterCacheKey(prefix: string, sf: Record<string, unknown>): string {
  var parts = [];
  ['whatPills','wherePills','whenPills','whoPills','payPills','whatNotPills','whereNotPills','whoNotPills'].forEach(function(k) {
    var arr = sf[k] || sf.pills && k === 'whatPills' && sf.pills || [];
    if (arr.length > 0) parts.push(k + ':' + JSON.stringify(arr));
  });
  if (sf.includeRemote) parts.push('remote:1');
  if (sf.includeNoSalary) parts.push('nosalary:1');
  var tuning = safeReadLS('bj_tuning', {});
  if (tuning.usOnly) parts.push('us:1');
  if (tuning.locationExcludes) parts.push('locexcl:' + JSON.stringify(tuning.locationExcludes));
  return prefix + ':' + btoa(parts.join('|')).slice(0, 64);
}

/** Get cache diagnostics — call from console: getCacheStats() */
function getCacheStats(): CacheStats {
  var keys = Object.keys(_queryCache);
  var now = Date.now();
  var totalRows = 0;
  var memEstimate = 0;
  var entries = keys.map(function(k) {
    var e = _queryCache[k];
    var rows = e.data ? (Array.isArray(e.data) ? e.data.length : 1) : 0;
    totalRows += rows;
    var tierTTL = _resolveTTL(k, null);
    var ageMs = now - e.ts;
    var pctLife = Math.round((ageMs / tierTTL) * 100);
    // rough memory estimate: JSON serialization length
    try { memEstimate += JSON.stringify(e.data).length; } catch(x) { /* circular ref ok */ }
    return {
      key: k,
      age: Math.round(ageMs / 1000) + 's',
      ttl: Math.round(tierTTL / 1000) + 's',
      pctLife: Math.min(pctLife, 100) + '%',
      rows: rows,
      stale: ageMs >= tierTTL
    };
  });
  return {
    entries: keys.length,
    totalRows: totalRows,
    memEstimateKB: Math.round(memEstimate / 1024),
    hits: _cacheHits,
    misses: _cacheMisses,
    hitRate: (_cacheHits + _cacheMisses) > 0 ? Math.round(_cacheHits / (_cacheHits + _cacheMisses) * 100) + '%' : 'N/A',
    tiers: CACHE_TTL_TIERS,
    defaultTTL: CACHE_TTL_DEFAULT,
    keys: entries
  };
}

// ============================================================
// VISIBILITY-BASED CACHE TIMEOUT (A14)
// ============================================================
// Clear caches when tab has been hidden for 5+ minutes to prevent stale data
var _visibilityHiddenAt: number | null = null;
var VISIBILITY_CACHE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      _visibilityHiddenAt = Date.now();
    } else if (_visibilityHiddenAt && Date.now() - _visibilityHiddenAt >= VISIBILITY_CACHE_TIMEOUT) {
      clearAllCaches();
      if (_cacheDebug) console.log('[cache] Cleared after', Math.round((Date.now() - _visibilityHiddenAt) / 60000), 'min hidden');
      _visibilityHiddenAt = null;
    } else {
      _visibilityHiddenAt = null;
    }
  });
}

/** Pre-warm static ref table caches on app init */
async function prewarmRefCaches(): Promise<void> {
  try {
    await Promise.all([
      cachedQuery('ref:industries', function() {
        return sb.from('ref_industries').select('name, category').order('name');
      }, { ttl: 3600000 }), // 1 hour TTL — rarely changes
      cachedQuery('ref:companies:active', function() {
        return sb.from('ats_companies').select('slug, name, job_count, source').gt('job_count', 0).order('name').limit(50000);
      }, { ttl: 600000 }), // 10 min TTL — job_count updates periodically
    ]);
    console.log('[BJ] Ref caches pre-warmed');
  } catch (e: unknown) {
    reportError('globals', e);
    console.warn('[BJ] Ref cache pre-warm failed:', (e as Error).message);
  }
}

// ============================================================
// ERROR RECOVERY & OFFLINE RESILIENCE (v3.87)
// ============================================================

var _isOnline = navigator.onLine;
var _offlineBanner: HTMLElement | null = null;
var _retryQueue: Array<{ fn: () => Promise<unknown>; label: string }> = [];

/** Check if the browser is online */
function isOnline(): boolean { return _isOnline; }

/** Initialize offline/online detection */
function initOfflineDetection(): void {
  window.addEventListener('online', function() {
    _isOnline = true;
    console.log('[BJ] Back online');
    _hideOfflineBanner();
    _drainRetryQueue();
  });
  window.addEventListener('offline', function() {
    _isOnline = false;
    console.warn('[BJ] Went offline');
    _showOfflineBanner();
  });
}

function _showOfflineBanner(): void {
  if (_offlineBanner) return;
  _offlineBanner = document.createElement('div');
  _offlineBanner.id = 'bj-offline-banner';
  _offlineBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:8px 16px;font-size:14px;font-weight:600;';
  _offlineBanner.textContent = 'You are offline — changes will sync when connection returns';
  document.body.prepend(_offlineBanner);
}

function _hideOfflineBanner(): void {
  if (_offlineBanner) { _offlineBanner.remove(); _offlineBanner = null; }
}

/** Retry a failed async operation with exponential backoff */
async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; delay?: number; label?: string }): Promise<T> {
  var maxRetries = (opts && opts.retries) || 3;
  var baseDelay = (opts && opts.delay) || 1000;
  var label = (opts && opts.label) || 'operation';

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      if (attempt === maxRetries) {
        reportError('globals', e);
        console.error('[BJ] ' + label + ' failed after ' + (maxRetries + 1) + ' attempts:', (e as Error).message);
        throw e;
      }
      var delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      reportError('globals', e);
      console.warn('[BJ] ' + label + ' attempt ' + (attempt + 1) + ' failed, retrying in ' + Math.round(delay) + 'ms');
      await new Promise(function(resolve) { setTimeout(resolve, delay); });
    }
  }
}

/** Queue a failed write operation for retry when back online */
function queueForRetry(fn: () => Promise<unknown>, label: string): void {
  _retryQueue.push({ fn: fn, label: label || 'queued op', addedAt: Date.now() });
  console.log('[BJ] Queued for retry: ' + label + ' (' + _retryQueue.length + ' pending)');
}

/** Drain the retry queue (called when coming back online) */
async function _drainRetryQueue(): Promise<void> {
  if (_retryQueue.length === 0) return;
  console.log('[BJ] Draining retry queue: ' + _retryQueue.length + ' items');
  var queue = _retryQueue.slice();
  _retryQueue = [];
  for (var i = 0; i < queue.length; i++) {
    try {
      await queue[i].fn();
      console.log('[BJ] Retry succeeded: ' + queue[i].label);
    } catch (e: unknown) {
      reportError('globals', e);
      console.warn('[BJ] Retry failed: ' + queue[i].label, (e as Error).message);
      // Don't re-queue items older than 10 minutes
      if (Date.now() - queue[i].addedAt < 600000) {
        _retryQueue.push(queue[i]);
      }
    }
  }
}

/** Global unhandled error and rejection handlers */
// BE-005: Throttle for network error toasts to avoid spam
var _lastNetworkToastTime = 0;
var _NETWORK_TOAST_THROTTLE_MS = 10000; // 10s between network error toasts

function initGlobalErrorHandlers(): void {
  window.addEventListener('error', function(event) {
    console.error('[BJ] Uncaught error:', event.message, 'at', event.filename + ':' + event.lineno);
    // AUDIT-D2-002: route uncaught errors to reportError (previously console-only)
    reportError('uncaught_error', new Error(event.message || 'Unknown error'), {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      handler: 'window.onerror'
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    // BE-005: Network errors are no longer silently suppressed.
    // Offline: report to PostHog (offline banner already visible via initOfflineDetection).
    // Online: report to PostHog + show user-facing toast with retry guidance.
    if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
      reportError('network', reason, { online: _isOnline, handler: 'unhandledrejection' });
      if (!_isOnline) {
        // Offline banner already handles user notification — just log, don't toast-spam
        console.warn('[BJ] Network error while offline (reported):', msg);
        event.preventDefault();
        return;
      }
      // Online but network failed — surface to user with throttle
      var now = Date.now();
      if (now - _lastNetworkToastTime > _NETWORK_TOAST_THROTTLE_MS) {
        _lastNetworkToastTime = now;
        toastWarning('Network request failed — check your connection and try again.', {
          duration: 6000,
          action: { label: 'Retry', fn: function() { window.location.reload(); } }
        });
      }
      console.warn('[BJ] Network error while online (reported + user notified):', msg);
      return;
    }
    // AUDIT-D2-003: non-network rejections were console-only — now route to reportError
    console.error('[BJ] Unhandled promise rejection:', msg);
    reportError('unhandled_rejection', reason instanceof Error ? reason : new Error(msg), {
      handler: 'unhandledrejection'
    });
  });
}

/** Safe Supabase query wrapper — handles offline, retries, fallback */
// ── DO-001: Error reporting + persistent monitoring ──
var _errorBatch: Array<Record<string, unknown>> = [];
var _errorFlushTimer: ReturnType<typeof setTimeout> | null = null;
var _ERROR_BATCH_MAX = 10;
var _ERROR_FLUSH_MS = 5000;
var _errorDedup: Record<string, number> = {};
var _ERROR_DEDUP_WINDOW_MS = 60000; // suppress same fingerprint for 60s

function _errorFingerprint(label: string, msg: string): string {
  // Simple hash: first 8 chars of label + first 60 chars of message
  return (label + ':' + (msg || '').slice(0, 60)).replace(/\s+/g, ' ');
}

function _flushErrorBatch(): void {
  if (_errorBatch.length === 0) return;
  var batch = _errorBatch.splice(0, _ERROR_BATCH_MAX);
  _errorFlushTimer = null;
  try {
    // Fire-and-forget insert — never block the app
    sb.from('client_errors').insert(batch).then(function(result: { error?: { message?: string } }) {
      if (result.error) {
        console.warn('[BJ] Error batch insert failed:', result.error.message);
      }
    });
  } catch (_) { /* never let monitoring break the app */ }
}

function reportError(label: string, error: unknown, extra?: Record<string, unknown>): void {
  var msg = error && (error as Error).message ? (error as Error).message : String(error);
  console.warn('[BJ] ' + label + ' failed:', msg);

  // PostHog (existing analytics)
  try {
    if (window.posthog) {
      posthog.capture('query_error', {
        label: label,
        error_message: msg,
        error_stack: error && (error as Error).stack ? (error as Error).stack!.slice(0, 500) : undefined,
        page: window.location.pathname,
        timestamp: new Date().toISOString(),
        ...(extra || {})
      });
    }
  } catch (_) { /* never let reporting break the app */ }

  // Persistent error logging (DO-001)
  try {
    var fp = _errorFingerprint(label, msg);
    var now = Date.now();
    // Dedup: skip if we logged the same fingerprint in the last 60s
    if (_errorDedup[fp] && (now - _errorDedup[fp]) < _ERROR_DEDUP_WINDOW_MS) return;
    _errorDedup[fp] = now;
    // Clean old dedup entries every ~50 errors
    if (Object.keys(_errorDedup).length > 50) {
      for (var k in _errorDedup) {
        if (now - _errorDedup[k] > _ERROR_DEDUP_WINDOW_MS) delete _errorDedup[k];
      }
    }

    var severity = label.includes('fatal') ? 'fatal' : label.includes('silent') || label.includes('ignore') ? 'warning' : 'error';
    _errorBatch.push({
      user_id: (typeof currentUser !== 'undefined' && currentUser) ? currentUser.id : null,
      surface: 'dashboard',
      label: label,
      message: msg.slice(0, 2000),
      stack: error && (error as Error).stack ? (error as Error).stack!.slice(0, 4000) : null,
      url: window.location.href,
      page: (typeof localStorage !== 'undefined' ? localStorage.getItem('bj_active_tab') : null) || 'unknown',
      version: typeof BJ_VERSION !== 'undefined' ? BJ_VERSION : 'unknown',
      user_agent: navigator.userAgent.slice(0, 500),
      metadata: extra || {},
      severity: severity,
      fingerprint: fp
    });

    // Flush when batch is full or schedule a delayed flush
    if (_errorBatch.length >= _ERROR_BATCH_MAX) {
      _flushErrorBatch();
    } else if (!_errorFlushTimer) {
      _errorFlushTimer = setTimeout(_flushErrorBatch, _ERROR_FLUSH_MS);
    }
  } catch (_) { /* never let monitoring break the app */ }
}

// Flush errors on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', function() {
    if (_errorBatch.length > 0) _flushErrorBatch();
    // Flush pending user data to Supabase before page close (prevents PII data loss)
    if (_udPendingKeys.size > 0 && typeof _flushUserData === 'function') _flushUserData();
  });
  // Also flush when tab becomes hidden (more reliable for async ops than beforeunload)
  document.addEventListener('visibilitychange', function() {
    if (document.hidden && _udPendingKeys.size > 0 && typeof _flushUserData === 'function') _flushUserData();
  });
}

// ── AUDIT-D3-002: fetchWithTimeout — timeout-guarded fetch for direct API calls ──
// Wraps fetch() with AbortController. All direct fetch() calls to /api/* or EF URLs
// MUST use this instead of raw fetch() to prevent indefinite hangs on slow/stalled servers.
// Usage: const resp = await fetchWithTimeout('/api/resume-parse', { method: 'POST', ... });
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  var controller = new AbortController();
  var timeoutId = setTimeout(function() { controller.abort(); }, timeoutMs);
  try {
    var response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    return response;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      reportError('fetch-timeout', new Error('Request timed out after ' + timeoutMs + 'ms: ' + url));
      throw new Error('Request timed out — please try again.');
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
}
(window as Window & typeof globalThis & Record<string, unknown>).fetchWithTimeout = fetchWithTimeout;

async function safeQuery(queryFn: () => Promise<unknown>, opts?: SafeQueryOptions): Promise<unknown> {
  var label = (opts && opts.label) || 'query';
  var fallback = opts && opts.fallback;
  var retry = opts && opts.retry !== false;
  var silent = opts && opts.silent;

  if (!_isOnline) {
    console.warn('[BJ] Offline — skipping ' + label);
    return fallback !== undefined ? fallback : null;
  }

  try {
    if (retry) {
      return await withRetry(function() {
        return queryFn().then(function(result) {
          if (result.error) throw new Error(result.error.message);
          return result.data;
        });
      }, { retries: 2, delay: 800, label: label });
    } else {
      var result = await queryFn();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
  } catch (e: unknown) {
    if (!silent) reportError(label, e);
    return fallback !== undefined ? fallback : null;
  }
}

// ── Convenience wrapper: safeRpc ──
async function safeRpc(fnName: string, params?: Record<string, unknown>, opts?: SafeQueryOptions): Promise<unknown> {
  var label = (opts && opts.label) || ('rpc:' + fnName);
  return safeQuery(function() { return sb.rpc(fnName, params); }, { ...opts, label: label });
}
