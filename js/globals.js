window.BJ = window.BJ || {};
window.BJ._registry = {};
window.BJ.export = function(name, fn, module) {
  window.BJ[name] = fn;
  window.BJ._registry[name] = { module: module || "unknown", registered: Date.now() };
  window[name] = fn;
};
const SUPABASE_URL = "https://qojhagupdnbtomfoxnsf.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: "public" },
  auth: { persistSession: true, autoRefreshToken: true },
  global: {
    fetch: function(url, options) {
      var controller = new AbortController();
      var timeoutId = setTimeout(function() {
        controller.abort();
      }, 3e4);
      return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function() {
        clearTimeout(timeoutId);
      });
    }
  }
});
window.bjSupabase = sb;
window._bjSupa = sb;
window.POSTHOG_API_KEY = "phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww";
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
var _escapeEl = document.createElement("div");
function escapeHtml(str) {
  if (!str) return "";
  _escapeEl.textContent = str;
  return _escapeEl.innerHTML;
}
function truncateSafe(str, max) {
  if (!str) return "\u2014";
  var trimmed = str.length > max ? str.slice(0, max) + "\u2026" : str;
  return escapeHtml(trimmed);
}
var _toastContainer = null;
var _toastQueue = [];
var _toastCount = 0;
var _MAX_TOASTS = 3;
function _ensureToastContainer() {
  if (_toastContainer && document.body.contains(_toastContainer)) return;
  _toastContainer = document.createElement("div");
  _toastContainer.id = "bj-toast-container";
  _toastContainer.style.cssText = "position:fixed;bottom:24px;right:24px;z-index:99998;display:flex;flex-direction:column-reverse;gap:8px;pointer-events:none;max-width:380px;";
  document.body.appendChild(_toastContainer);
}
function showToast(message, opts) {
  var type = opts && opts.type || "info";
  var duration = opts && opts.duration || (type === "error" ? 6e3 : 4e3);
  _ensureToastContainer();
  if (_toastCount >= _MAX_TOASTS) {
    var oldest = _toastContainer.querySelector(".bj-toast");
    if (oldest) _dismissToast(oldest);
  }
  var colors = {
    error: { bg: "hsl(0, 84%, 60%)", icon: "\u2716" },
    warning: { bg: "hsl(38, 92%, 50%)", icon: "\u26A0" },
    success: { bg: "hsl(142, 71%, 45%)", icon: "\u2714" },
    info: { bg: "hsl(217, 100%, 62%)", icon: "\u2139" }
  };
  var c = colors[type] || colors.info;
  var toast = document.createElement("div");
  toast.className = "bj-toast";
  toast.style.cssText = "pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;background:hsl(230,28%,14%);color:#f0f1f3;font-size:13px;font-family:Outfit,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.3);opacity:0;transform:translateY(12px);transition:opacity .25s,transform .25s;max-width:380px;word-break:break-word;";
  var iconSpan = '<span style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:' + c.bg + ';display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;">' + c.icon + "</span>";
  var closeBtn = '<button style="flex-shrink:0;background:none;border:none;color:#94a3b8;cursor:pointer;font-size:16px;padding:0 0 0 8px;line-height:1;" title="Dismiss">\u2715</button>';
  var actionHtml = "";
  if (opts && opts.action) {
    actionHtml = '<button class="bj-toast-action" style="flex-shrink:0;background:none;border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:4px;padding:3px 10px;font-size:11px;cursor:pointer;white-space:nowrap;">' + escapeHtml(opts.action.label) + "</button>";
  }
  toast.innerHTML = iconSpan + '<span style="flex:1;">' + escapeHtml(message) + "</span>" + actionHtml + closeBtn;
  toast.querySelector("button:last-child").addEventListener("click", function() {
    _dismissToast(toast);
  });
  if (opts && opts.action) {
    toast.querySelector(".bj-toast-action").addEventListener("click", function() {
      if (opts.action.fn) opts.action.fn();
      _dismissToast(toast);
    });
  }
  _toastContainer.appendChild(toast);
  _toastCount++;
  requestAnimationFrame(function() {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });
  if (duration > 0) {
    setTimeout(function() {
      _dismissToast(toast);
    }, duration);
  }
  return toast;
}
function _dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.style.opacity = "0";
  toast.style.transform = "translateY(12px)";
  setTimeout(function() {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
    _toastCount = Math.max(0, _toastCount - 1);
  }, 250);
}
function toastError(msg, opts) {
  return showToast(msg, Object.assign({ type: "error" }, opts || {}));
}
function toastWarning(msg, opts) {
  return showToast(msg, Object.assign({ type: "warning" }, opts || {}));
}
function toastSuccess(msg, opts) {
  return showToast(msg, Object.assign({ type: "success" }, opts || {}));
}
function toastInfo(msg, opts) {
  return showToast(msg, Object.assign({ type: "info" }, opts || {}));
}
var _encryptionKey = null;
var _PII_KEYS = ["bj_resumes", "bj_readiness"];
async function _deriveEncryptionKey(userId) {
  if (_encryptionKey) return _encryptionKey;
  var encoder = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(userId + ":bj_pii_v1"), "PBKDF2", false, ["deriveKey"]);
  _encryptionKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("brilliant-jobs-pii-salt"), iterations: 1e5, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return _encryptionKey;
}
async function encryptForStorage(plaintext, userId) {
  try {
    var key = await _deriveEncryptionKey(userId);
    var encoder = new TextEncoder();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
    var combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return "enc:" + btoa(String.fromCharCode.apply(null, combined));
  } catch (e) {
    reportError("globals", e);
    console.warn("[BJ] Encryption failed, storing plaintext:", e.message);
    return plaintext;
  }
}
async function decryptFromStorage(ciphertext, userId) {
  if (!ciphertext || !ciphertext.startsWith("enc:")) return ciphertext;
  try {
    var key = await _deriveEncryptionKey(userId);
    var raw = atob(ciphertext.slice(4));
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    var iv = bytes.slice(0, 12);
    var data = bytes.slice(12);
    var decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    reportError("globals", e);
    console.warn("[BJ] Decryption failed (key mismatch or corruption):", e.message);
    return null;
  }
}
function isPiiKey(lsKey) {
  return _PII_KEYS.indexOf(lsKey) !== -1;
}
async function readPiiData(lsKey) {
  var raw = localStorage.getItem(lsKey);
  if (!raw) return null;
  if (raw.startsWith("enc:")) {
    if (!currentUser) return null;
    var decrypted = await decryptFromStorage(raw, currentUser.id);
    if (decrypted) {
      try {
        return JSON.parse(decrypted);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function safeReadLS(key, fallback) {
  try {
    var raw = localStorage.getItem(key);
    if (!raw) return fallback;
    if (raw.startsWith("enc:")) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}
window._safeReadLS = safeReadLS;
var _sessionInactivityTimer = null;
var _SESSION_INACTIVITY_MS = 30 * 60 * 1e3;
var _lastActivity = Date.now();
var _sessionWarningShown = false;
function initSessionManagement() {
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
      if (event === "SIGNED_OUT") {
        _clearSensitiveData();
        window.location.href = "/?session_expired=1";
      }
    }
    if (event === "TOKEN_REFRESHED") {
      console.log("[BJ] Session token refreshed");
      _lastActivity = Date.now();
    }
  });
  ["click", "keydown", "scroll", "mousemove"].forEach(function(evt) {
    document.addEventListener(evt, _trackActivity, { passive: true });
  });
  _sessionInactivityTimer = setInterval(_checkInactivity, 6e4);
  setInterval(_verifySession, 5 * 60 * 1e3);
}
function _trackActivity() {
  _lastActivity = Date.now();
  if (_sessionWarningShown) {
    _sessionWarningShown = false;
  }
}
function _checkInactivity() {
  var idle = Date.now() - _lastActivity;
  if (idle > _SESSION_INACTIVITY_MS && !_sessionWarningShown) {
    _sessionWarningShown = true;
    showToast("Your session will expire soon due to inactivity.", {
      type: "warning",
      duration: 0,
      // persistent until action
      action: { label: "Stay signed in", fn: function() {
        _lastActivity = Date.now();
        _sessionWarningShown = false;
        sb.auth.getSession();
        toastSuccess("Session extended.");
      } }
    });
  }
  if (idle > _SESSION_INACTIVITY_MS * 2) {
    _clearSensitiveData();
    if (window.posthog) {
      try {
        posthog.reset();
      } catch (_) {
      }
    }
    sb.auth.signOut();
  }
}
async function _verifySession() {
  try {
    var result = await sb.auth.getSession();
    if (!result.data.session) {
      toastError("Your session has expired. Please sign in again.", {
        duration: 0,
        action: { label: "Sign in", fn: function() {
          window.location.href = "/";
        } }
      });
    }
  } catch (e) {
  }
}
function _clearSensitiveData() {
  _encryptionKey = null;
  _PII_KEYS.forEach(function(key) {
    localStorage.removeItem(key);
  });
  clearAllCaches();
}
var currentUser = null;
const UD_KEYS = {
  saved_filters: "bj_saved_filters",
  resumes: "bj_resumes",
  pipeline_meta: "bj_pipeline_meta",
  tuning: "bj_tuning",
  saved_jobs: "bj_saved_jobs",
  applied_jobs: "bj_applied_jobs",
  applied_dates: "bj_applied_dates",
  hidden_jobs: "bj_hidden_jobs",
  app_queue: "bj_app_queue",
  app_history: "bj_app_history",
  readiness: "bj_readiness"
};
const UD_LS_TO_SHORT = Object.fromEntries(Object.entries(UD_KEYS).map(([k, v]) => [v, k]));
let _udSyncTimer = null;
let _udPendingKeys = /* @__PURE__ */ new Set();
function saveUserData(lsKey, jsonStr) {
  var bytes = new Blob([jsonStr]).size;
  if (bytes > 2 * 1024 * 1024) {
    console.error("[BJ] Storage rejected: " + lsKey + " is " + Math.round(bytes / 1024) + "KB (>2MB limit)");
    return false;
  }
  if (bytes > 500 * 1024) {
    console.warn("[BJ] Storage warning: " + lsKey + " is " + Math.round(bytes / 1024) + "KB");
  }
  if (isPiiKey(lsKey) && currentUser) {
    encryptForStorage(jsonStr, currentUser.id).then(function(encrypted) {
      try {
        localStorage.setItem(lsKey, encrypted);
      } catch (e) {
        reportError("globals", e);
        console.error("[BJ] Storage full (encrypted):", e.message);
        _handleStorageFull(lsKey);
      }
    });
  } else {
    try {
      localStorage.setItem(lsKey, jsonStr);
    } catch (e) {
      reportError("globals", e);
      console.error("[BJ] Storage full! Failed to save " + lsKey + ":", e.message);
      _handleStorageFull(lsKey);
      return false;
    }
  }
  const shortKey = UD_LS_TO_SHORT[lsKey];
  if (shortKey && currentUser) {
    _udPendingKeys.add(shortKey);
    clearTimeout(_udSyncTimer);
    _udSyncTimer = setTimeout(_flushUserData, 2e3);
  }
  return true;
}
async function _flushUserData() {
  if (!currentUser || _udPendingKeys.size === 0) return;
  const patch = {};
  for (const key of _udPendingKeys) {
    const lsKey = UD_KEYS[key];
    try {
      var raw = localStorage.getItem(lsKey) || "null";
      if (isPiiKey(lsKey) && raw && raw.startsWith("enc:")) {
        raw = await decryptFromStorage(raw, currentUser.id) || "null";
      }
      patch[key] = JSON.parse(raw);
    } catch {
      patch[key] = null;
    }
  }
  _udPendingKeys.clear();
  try {
    const { error } = await sb.from("profiles").update({ user_data: sb.rpc ? void 0 : void 0 }).eq("id", currentUser.id);
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    await fetch(SUPABASE_URL + "/rest/v1/profiles?id=eq." + currentUser.id, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": SUPABASE_KEY,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ user_data: Object.assign(
        safeReadLS("_bj_ud_cache", {}),
        patch
      ) })
    });
    const cached = safeReadLS("_bj_ud_cache", {});
    Object.assign(cached, patch);
    localStorage.setItem("_bj_ud_cache", JSON.stringify(cached));
    console.log("[sync] Flushed", Object.keys(patch).join(", "));
  } catch (e) {
    reportError("globals", e);
    console.warn("[sync] Flush error:", e.message);
  }
}
async function loadUserData(userId) {
  try {
    const { data, error } = await sb.from("profiles").select("user_data").eq("id", userId).single();
    if (error || !data?.user_data) {
      console.log("[sync] No cloud data, will sync localStorage up on next save");
      return;
    }
    const cloud = data.user_data;
    localStorage.setItem("_bj_ud_cache", JSON.stringify(cloud));
    let needsSync = false;
    for (const [shortKey, lsKey] of Object.entries(UD_KEYS)) {
      const cloudVal = cloud[shortKey];
      let localVal = localStorage.getItem(lsKey);
      if (isPiiKey(lsKey) && localVal && localVal.startsWith("enc:") && userId) {
        localVal = await decryptFromStorage(localVal, userId) || localVal;
      }
      const localParsed = localVal ? JSON.parse(localVal) : null;
      const cloudEmpty = cloudVal == null || Array.isArray(cloudVal) && cloudVal.length === 0 || typeof cloudVal === "object" && !Array.isArray(cloudVal) && Object.keys(cloudVal).length === 0;
      const localEmpty = localParsed == null || Array.isArray(localParsed) && localParsed.length === 0 || typeof localParsed === "object" && !Array.isArray(localParsed) && Object.keys(localParsed).length === 0;
      if (!cloudEmpty && localEmpty) {
        var cloudJson = JSON.stringify(cloudVal);
        if (isPiiKey(lsKey) && userId) {
          encryptForStorage(cloudJson, userId).then(function(enc) {
            localStorage.setItem(lsKey, enc);
          });
        } else {
          localStorage.setItem(lsKey, cloudJson);
        }
        console.log("[sync] Pulled", shortKey, "from cloud");
      } else if (cloudEmpty && !localEmpty) {
        needsSync = true;
        _udPendingKeys.add(shortKey);
      }
    }
    if (needsSync) {
      console.log("[sync] Local data needs upload:", [..._udPendingKeys].join(", "));
      _flushUserData();
    }
  } catch (e) {
    reportError("globals", e);
    console.warn("[sync] Load error:", e.message);
  }
}
var _entitlementCache = {};
var _entitlementCacheTTL = 5 * 60 * 1e3;
async function checkEntitlement(feature, usageCount) {
  if (window._bjUserRole === "admin") return { allowed: true, behavior: "fixed", effective_limit: 9999, remaining: 9999 };
  if (!currentUser) return { allowed: false, behavior: "off", effective_limit: 0, remaining: 0 };
  if (typeof usageCount === "undefined") usageCount = 0;
  var cacheKey = feature + ":" + usageCount;
  var cached = _entitlementCache[cacheKey];
  if (cached && Date.now() - cached._ts < _entitlementCacheTTL) return cached;
  try {
    var { data, error } = await sb.rpc("check_entitlement", {
      p_user_id: currentUser.id,
      p_feature: feature,
      p_usage_count: usageCount
    });
    if (error) {
      console.warn("[entitlement]", feature, error.message);
      return { allowed: true, behavior: "fixed", effective_limit: 99, remaining: 99 };
    }
    data._ts = Date.now();
    _entitlementCache[cacheKey] = data;
    return data;
  } catch (e) {
    reportError("globals", e);
    console.warn("[entitlement] Error:", e.message);
    return { allowed: true, behavior: "fixed", effective_limit: 99, remaining: 99 };
  }
}
function clearEntitlementCache(feature) {
  if (feature) {
    Object.keys(_entitlementCache).forEach(function(k) {
      if (k.startsWith(feature + ":")) delete _entitlementCache[k];
    });
  } else {
    _entitlementCache = {};
  }
}
function showUpgradePrompt(featureName, ent) {
  var msg = ent.behavior === "off" ? featureName + " is a Pro feature. Upgrade to unlock it." : "You've reached the " + featureName + " limit (" + ent.effective_limit + "). Upgrade to Pro for more.";
  var toast = document.createElement("div");
  toast.className = "upgrade-toast";
  toast.innerHTML = '<div style="display:flex;align-items:center;gap:12px;"><i data-lucide="star" class="icon-lg icon-stroke-lg" style="color:var(--accent);fill:var(--accent)"></i><div><div style="font-weight:600;color:var(--text);font-size:13px;">' + msg + '</div><div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Go to Settings \u2192 Subscription to upgrade.</div></div></div>';
  document.body.appendChild(toast);
  requestAnimationFrame(function() {
    toast.classList.add("show");
  });
  setTimeout(function() {
    toast.classList.remove("show");
    setTimeout(function() {
      toast.remove();
    }, 300);
  }, 4e3);
  return true;
}
var savedFilters = safeReadLS("bj_saved_filters", []);
var tuningSettings = safeReadLS("bj_tuning", {});
var tuningLocExclPills = tuningSettings.locationExcludes || [];
var tuningTitleExclPills = tuningSettings.titleExcludes || [];
var tuningCoExclPills = tuningSettings.companyExcludes || [];
var tuningIndExclPills = tuningSettings.industryExcludes || [];
var levelHierarchy = tuningSettings.levelHierarchy || [];
function getJobLevel(title, hierarchy) {
  const levels = hierarchy || levelHierarchy;
  if (!title || levels.length === 0) return null;
  const t = " " + title.toLowerCase() + " ";
  const entries = [];
  levels.forEach((lvl, rank) => {
    (lvl.keywords || "").split(",").forEach((kw) => {
      const k = kw.trim().toLowerCase();
      if (k) entries.push({ keyword: k, rank, label: lvl.label, color: lvl.color || "#94a3b8" });
    });
  });
  entries.sort((a, b) => b.keyword.length - a.keyword.length);
  for (const e of entries) {
    const escaped = e.keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[\\s,\\-\\/\\(])${escaped}(?:[\\s,\\-\\/\\)]|$)`, "i");
    if (re.test(t)) {
      return { rank: e.rank, label: e.label, color: e.color };
    }
  }
  return null;
}
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
var WORKPLACE_WORDS = ["remote", "hybrid", "onsite", "on-site", "in-office"];
var SALARY_RE = /^\$?\d{2,3}k?\+?$/i;
var DEFAULT_RADIUS = 30;
var allJobs = [];
var currentJobs = [];
var jobSortStack = [{ field: "first_seen_at", asc: false }];
var hiddenJobIds = safeReadLS("bj_hidden_jobs", []);
var savedJobIds = safeReadLS("bj_saved_jobs", []);
var appliedJobIds = safeReadLS("bj_applied_jobs", []);
var searchTimeout = null;
var currentJobPage = 0;
var JOBS_PER_PAGE = 50;
var _feedLoadMoreOffset = 0;
var _feedTotalCount = 0;
var resumes = safeReadLS("bj_resumes", []);
window._connectionState = window._connectionState || { ext: false, gmail: false, gcal: false, gdrive: false };
var readinessCache = safeReadLS("bj_readiness", null);
var filterColors = ["#6366f1", "#f59e0b", "#ec4899", "#22c55e", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#14b8a6", "#a855f7"];
async function enrichJob(jobId, data) {
  try {
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    const resp = await fetch(SUPABASE_URL + "/functions/v1/enrich-job", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": SUPABASE_KEY
      },
      body: JSON.stringify({ job_id: jobId, ...data })
    });
    if (!resp.ok) console.warn("[enrich-job] Failed for", jobId, resp.status);
  } catch (e) {
    reportError("globals", e);
    console.warn("[enrich-job] Error:", e.message);
  }
}
function getStorageUsage() {
  var total = 0;
  var keys = {};
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    var size = new Blob([localStorage.getItem(key)]).size;
    total += size + new Blob([key]).size;
    if (key.startsWith("bj_")) keys[key] = size;
  }
  return { totalBytes: total, totalKB: Math.round(total / 1024), bjKeys: keys };
}
function storageHealth() {
  var usage = getStorageUsage();
  console.group("[BJ] Storage Health");
  console.log("Total localStorage:", usage.totalKB + "KB");
  var sorted = Object.entries(usage.bjKeys).sort(function(a, b) {
    return b[1] - a[1];
  });
  sorted.forEach(function(entry) {
    var pct = Math.round(entry[1] / usage.totalBytes * 100);
    console.log("  " + entry[0] + ": " + Math.round(entry[1] / 1024) + "KB (" + pct + "%)");
  });
  console.log("Estimated limit: ~5MB (varies by browser)");
  console.log("Usage: " + Math.round(usage.totalBytes / (5 * 1024 * 1024) * 100) + "% of estimated limit");
  console.groupEnd();
  return usage;
}
function _handleStorageFull(failedKey) {
  console.warn("[BJ] Running emergency storage cleanup...");
  var sacrificial = ["bj_readiness", "bj_ref_city_radius", "_bj_ud_cache"];
  for (var i = 0; i < sacrificial.length; i++) {
    if (sacrificial[i] !== failedKey) {
      localStorage.removeItem(sacrificial[i]);
      console.log("[BJ] Cleared " + sacrificial[i]);
    }
  }
  ["bj_hidden_jobs", "bj_applied_jobs", "bj_saved_jobs"].forEach(function(key) {
    try {
      var arr = safeReadLS(key, []);
      if (arr.length > 500) {
        arr = arr.slice(-500);
        localStorage.setItem(key, JSON.stringify(arr));
        console.log("[BJ] Trimmed " + key + " to 500 items");
      }
    } catch (e) {
      reportError("storage-trim", e);
    }
  });
  try {
    var hist = safeReadLS("bj_app_history", []);
    if (hist.length > 200) {
      hist = hist.slice(-200);
      saveUserData("bj_app_history", JSON.stringify(hist));
      console.log("[BJ] Trimmed bj_app_history to 200 items");
    }
  } catch (e) {
    reportError("storage-trim-history", e);
  }
}
var _queryCache = {};
var statsCache = {};
var _cacheHits = 0;
var _cacheMisses = 0;
var _cacheDebug = typeof localStorage !== "undefined" && localStorage.getItem("BJ_DEBUG_CACHE") === "1";
var CACHE_TTL_TIERS = {
  "ref:": 36e5,
  // 1 hour
  "feed:": 18e4,
  // 3 min
  "stats:": 6e5,
  // 10 min
  "company:": 6e5,
  // 10 min
  "pipeline:": 3e5,
  // 5 min
  "settings:": 6e5
  // 10 min
};
var CACHE_TTL_DEFAULT = 3e5;
function _resolveTTL(key, opts) {
  if (opts && opts.ttl) return opts.ttl;
  var prefixes = Object.keys(CACHE_TTL_TIERS);
  for (var i = 0; i < prefixes.length; i++) {
    if (key.indexOf(prefixes[i]) === 0) return CACHE_TTL_TIERS[prefixes[i]];
  }
  return CACHE_TTL_DEFAULT;
}
async function cachedQuery(key, queryFn, opts) {
  var ttl = _resolveTTL(key, opts);
  var force = opts && opts.force;
  var entry = _queryCache[key];
  if (!force && entry && Date.now() - entry.ts < ttl) {
    _cacheHits++;
    if (_cacheDebug) console.log("[cache] HIT", key, "(" + Math.round((Date.now() - entry.ts) / 1e3) + "s old)");
    return { data: entry.data, count: entry.count, cached: true };
  }
  try {
    var result = await queryFn();
    if (result.error) {
      console.warn("[cachedQuery] Error for", key, result.error.message);
      if (entry) return { data: entry.data, count: entry.count, cached: true };
      return { data: null, count: null, cached: false };
    }
    _queryCache[key] = { data: result.data, ts: Date.now(), count: result.count };
    _cacheMisses++;
    if (_cacheDebug) console.log("[cache] MISS", key, "(" + (result.data ? result.data.length : 0) + " rows)");
    return { data: result.data, count: result.count, cached: false };
  } catch (e) {
    reportError("globals", e);
    console.warn("[cachedQuery] Failed for", key, e.message);
    if (entry) return { data: entry.data, count: entry.count, cached: true };
    return { data: null, count: null, cached: false };
  }
}
function cachedCount(key) {
  var entry = _queryCache[key];
  return entry ? entry.count : null;
}
function invalidateCache(keyOrPrefix) {
  if (!keyOrPrefix) {
    _queryCache = {};
    return;
  }
  Object.keys(_queryCache).forEach(function(k) {
    if (k === keyOrPrefix || k.startsWith(keyOrPrefix + ":")) delete _queryCache[k];
  });
  if (_cacheDebug) console.log("[cache] Invalidated", keyOrPrefix || "ALL");
}
function clearAllCaches() {
  _queryCache = {};
  _cacheHits = 0;
  _cacheMisses = 0;
  if (typeof statsCache !== "undefined") {
    Object.keys(statsCache).forEach(function(k) {
      delete statsCache[k];
    });
  }
  if (_cacheDebug) console.log("[cache] All caches cleared");
}
function _filterCacheKey(prefix, sf) {
  var parts = [];
  ["whatPills", "wherePills", "whenPills", "whoPills", "payPills", "whatNotPills", "whereNotPills", "whoNotPills"].forEach(function(k) {
    var arr = sf[k] || sf.pills && k === "whatPills" && sf.pills || [];
    if (arr.length > 0) parts.push(k + ":" + JSON.stringify(arr));
  });
  if (sf.includeRemote) parts.push("remote:1");
  if (sf.includeNoSalary) parts.push("nosalary:1");
  var tuning = safeReadLS("bj_tuning", {});
  if (tuning.usOnly) parts.push("us:1");
  if (tuning.locationExcludes) parts.push("locexcl:" + JSON.stringify(tuning.locationExcludes));
  return prefix + ":" + btoa(parts.join("|")).slice(0, 64);
}
function getCacheStats() {
  var keys = Object.keys(_queryCache);
  var now = Date.now();
  var totalRows = 0;
  var memEstimate = 0;
  var entries = keys.map(function(k) {
    var e = _queryCache[k];
    var rows = e.data ? Array.isArray(e.data) ? e.data.length : 1 : 0;
    totalRows += rows;
    var tierTTL = _resolveTTL(k, null);
    var ageMs = now - e.ts;
    var pctLife = Math.round(ageMs / tierTTL * 100);
    try {
      memEstimate += JSON.stringify(e.data).length;
    } catch (x) {
    }
    return {
      key: k,
      age: Math.round(ageMs / 1e3) + "s",
      ttl: Math.round(tierTTL / 1e3) + "s",
      pctLife: Math.min(pctLife, 100) + "%",
      rows,
      stale: ageMs >= tierTTL
    };
  });
  return {
    entries: keys.length,
    totalRows,
    memEstimateKB: Math.round(memEstimate / 1024),
    hits: _cacheHits,
    misses: _cacheMisses,
    hitRate: _cacheHits + _cacheMisses > 0 ? Math.round(_cacheHits / (_cacheHits + _cacheMisses) * 100) + "%" : "N/A",
    tiers: CACHE_TTL_TIERS,
    defaultTTL: CACHE_TTL_DEFAULT,
    keys: entries
  };
}
var _visibilityHiddenAt = null;
var VISIBILITY_CACHE_TIMEOUT = 5 * 60 * 1e3;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", function() {
    if (document.hidden) {
      _visibilityHiddenAt = Date.now();
    } else if (_visibilityHiddenAt && Date.now() - _visibilityHiddenAt >= VISIBILITY_CACHE_TIMEOUT) {
      clearAllCaches();
      if (_cacheDebug) console.log("[cache] Cleared after", Math.round((Date.now() - _visibilityHiddenAt) / 6e4), "min hidden");
      _visibilityHiddenAt = null;
    } else {
      _visibilityHiddenAt = null;
    }
  });
}
async function prewarmRefCaches() {
  try {
    await Promise.all([
      cachedQuery("ref:industries", function() {
        return sb.from("ref_industries").select("name, category").order("name");
      }, { ttl: 36e5 }),
      // 1 hour TTL — rarely changes
      cachedQuery("ref:companies:active", function() {
        return sb.from("ats_companies").select("slug, name, job_count, source").gt("job_count", 0).order("name").limit(5e4);
      }, { ttl: 6e5 })
      // 10 min TTL — job_count updates periodically
    ]);
    console.log("[BJ] Ref caches pre-warmed");
  } catch (e) {
    reportError("globals", e);
    console.warn("[BJ] Ref cache pre-warm failed:", e.message);
  }
}
var _isOnline = navigator.onLine;
var _offlineBanner = null;
var _retryQueue = [];
function isOnline() {
  return _isOnline;
}
function initOfflineDetection() {
  window.addEventListener("online", function() {
    _isOnline = true;
    console.log("[BJ] Back online");
    _hideOfflineBanner();
    _drainRetryQueue();
  });
  window.addEventListener("offline", function() {
    _isOnline = false;
    console.warn("[BJ] Went offline");
    _showOfflineBanner();
  });
}
function _showOfflineBanner() {
  if (_offlineBanner) return;
  _offlineBanner = document.createElement("div");
  _offlineBanner.id = "bj-offline-banner";
  _offlineBanner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#f59e0b;color:#000;text-align:center;padding:8px 16px;font-size:14px;font-weight:600;";
  _offlineBanner.textContent = "You are offline \u2014 changes will sync when connection returns";
  document.body.prepend(_offlineBanner);
}
function _hideOfflineBanner() {
  if (_offlineBanner) {
    _offlineBanner.remove();
    _offlineBanner = null;
  }
}
async function withRetry(fn, opts) {
  var maxRetries = opts && opts.retries || 3;
  var baseDelay = opts && opts.delay || 1e3;
  var label = opts && opts.label || "operation";
  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt === maxRetries) {
        reportError("globals", e);
        console.error("[BJ] " + label + " failed after " + (maxRetries + 1) + " attempts:", e.message);
        throw e;
      }
      var delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
      reportError("globals", e);
      console.warn("[BJ] " + label + " attempt " + (attempt + 1) + " failed, retrying in " + Math.round(delay) + "ms");
      await new Promise(function(resolve) {
        setTimeout(resolve, delay);
      });
    }
  }
}
function queueForRetry(fn, label) {
  _retryQueue.push({ fn, label: label || "queued op", addedAt: Date.now() });
  console.log("[BJ] Queued for retry: " + label + " (" + _retryQueue.length + " pending)");
}
async function _drainRetryQueue() {
  if (_retryQueue.length === 0) return;
  console.log("[BJ] Draining retry queue: " + _retryQueue.length + " items");
  var queue = _retryQueue.slice();
  _retryQueue = [];
  for (var i = 0; i < queue.length; i++) {
    try {
      await queue[i].fn();
      console.log("[BJ] Retry succeeded: " + queue[i].label);
    } catch (e) {
      reportError("globals", e);
      console.warn("[BJ] Retry failed: " + queue[i].label, e.message);
      if (Date.now() - queue[i].addedAt < 6e5) {
        _retryQueue.push(queue[i]);
      }
    }
  }
}
var _lastNetworkToastTime = 0;
var _NETWORK_TOAST_THROTTLE_MS = 1e4;
function initGlobalErrorHandlers() {
  window.addEventListener("error", function(event) {
    console.error("[BJ] Uncaught error:", event.message, "at", event.filename + ":" + event.lineno);
  });
  window.addEventListener("unhandledrejection", function(event) {
    var reason = event.reason;
    var msg = reason && reason.message ? reason.message : String(reason);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed")) {
      reportError("network", reason, { online: _isOnline, handler: "unhandledrejection" });
      if (!_isOnline) {
        console.warn("[BJ] Network error while offline (reported):", msg);
        event.preventDefault();
        return;
      }
      var now = Date.now();
      if (now - _lastNetworkToastTime > _NETWORK_TOAST_THROTTLE_MS) {
        _lastNetworkToastTime = now;
        toastWarning("Network request failed \u2014 check your connection and try again.", {
          duration: 6e3,
          action: { label: "Retry", fn: function() {
            window.location.reload();
          } }
        });
      }
      console.warn("[BJ] Network error while online (reported + user notified):", msg);
      return;
    }
    console.error("[BJ] Unhandled promise rejection:", msg);
  });
}
var _errorBatch = [];
var _errorFlushTimer = null;
var _ERROR_BATCH_MAX = 10;
var _ERROR_FLUSH_MS = 5e3;
var _errorDedup = {};
var _ERROR_DEDUP_WINDOW_MS = 6e4;
function _errorFingerprint(label, msg) {
  return (label + ":" + (msg || "").slice(0, 60)).replace(/\s+/g, " ");
}
function _flushErrorBatch() {
  if (_errorBatch.length === 0) return;
  var batch = _errorBatch.splice(0, _ERROR_BATCH_MAX);
  _errorFlushTimer = null;
  try {
    sb.from("client_errors").insert(batch).then(function(result) {
      if (result.error) {
        console.warn("[BJ] Error batch insert failed:", result.error.message);
      }
    });
  } catch (_) {
  }
}
function reportError(label, error, extra) {
  var msg = error && error.message ? error.message : String(error);
  console.warn("[BJ] " + label + " failed:", msg);
  try {
    if (window.posthog) {
      posthog.capture("query_error", {
        label,
        error_message: msg,
        error_stack: error && error.stack ? error.stack.slice(0, 500) : void 0,
        page: window.location.pathname,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        ...extra || {}
      });
    }
  } catch (_) {
  }
  try {
    var fp = _errorFingerprint(label, msg);
    var now = Date.now();
    if (_errorDedup[fp] && now - _errorDedup[fp] < _ERROR_DEDUP_WINDOW_MS) return;
    _errorDedup[fp] = now;
    if (Object.keys(_errorDedup).length > 50) {
      for (var k in _errorDedup) {
        if (now - _errorDedup[k] > _ERROR_DEDUP_WINDOW_MS) delete _errorDedup[k];
      }
    }
    var severity = label.includes("fatal") ? "fatal" : label.includes("silent") || label.includes("ignore") ? "warning" : "error";
    _errorBatch.push({
      user_id: typeof currentUser !== "undefined" && currentUser ? currentUser.id : null,
      surface: "dashboard",
      label,
      message: msg.slice(0, 2e3),
      stack: error && error.stack ? error.stack.slice(0, 4e3) : null,
      url: window.location.href,
      page: (typeof localStorage !== "undefined" ? localStorage.getItem("bj_active_tab") : null) || "unknown",
      version: typeof BJ_VERSION !== "undefined" ? BJ_VERSION : "unknown",
      user_agent: navigator.userAgent.slice(0, 500),
      metadata: extra || {},
      severity,
      fingerprint: fp
    });
    if (_errorBatch.length >= _ERROR_BATCH_MAX) {
      _flushErrorBatch();
    } else if (!_errorFlushTimer) {
      _errorFlushTimer = setTimeout(_flushErrorBatch, _ERROR_FLUSH_MS);
    }
  } catch (_) {
  }
}
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", function() {
    if (_errorBatch.length > 0) _flushErrorBatch();
    if (_udPendingKeys.size > 0 && typeof _flushUserData === "function") _flushUserData();
  });
  document.addEventListener("visibilitychange", function() {
    if (document.hidden && _udPendingKeys.size > 0 && typeof _flushUserData === "function") _flushUserData();
  });
}
async function safeQuery(queryFn, opts) {
  var label = opts && opts.label || "query";
  var fallback = opts && opts.fallback;
  var retry = opts && opts.retry !== false;
  var silent = opts && opts.silent;
  if (!_isOnline) {
    console.warn("[BJ] Offline \u2014 skipping " + label);
    return fallback !== void 0 ? fallback : null;
  }
  try {
    if (retry) {
      return await withRetry(function() {
        return queryFn().then(function(result2) {
          if (result2.error) throw new Error(result2.error.message);
          return result2.data;
        });
      }, { retries: 2, delay: 800, label });
    } else {
      var result = await queryFn();
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
  } catch (e) {
    if (!silent) reportError(label, e);
    return fallback !== void 0 ? fallback : null;
  }
}
async function safeRpc(fnName, params, opts) {
  var label = opts && opts.label || "rpc:" + fnName;
  return safeQuery(function() {
    return sb.rpc(fnName, params);
  }, { ...opts, label });
}
