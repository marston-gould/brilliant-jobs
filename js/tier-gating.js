var TIER_GATES = {
  archive_storage: { free: 2097152, starter: 10485760, pro: 52428800 },
  archive_retention: { free: 30, starter: 90, pro: Infinity },
  max_resumes: { free: 3, starter: 10, pro: Infinity },
  max_versions: { free: 1, starter: 5, pro: Infinity },
  score_sparkline: { free: false, starter: 10, pro: Infinity },
  level_fit: { free: false, starter: true, pro: true },
  pipeline_stats: { free: false, starter: "basic", pro: "full" },
  job_log: { free: false, starter: 10, pro: Infinity },
  ai_scoring: { free: false, starter: false, pro: true },
  // AIS-F3-S1: Auto-apply daily submit limit (Free=0 blocked, Starter=5/day, Pro=unlimited)
  auto_apply_daily: { free: 0, starter: 5, pro: Infinity }
};
function getUserTier() {
  if (typeof _userPricing !== "undefined" && _userPricing && _userPricing.tier) {
    if (_userPricing.tier === "payl") return "pro";
    return _userPricing.tier;
  }
  if (typeof currentUser !== "undefined" && currentUser?.user_metadata?.plan) {
    var plan = currentUser.user_metadata.plan;
    if (plan === "payl") return "pro";
    return plan;
  }
  return "free";
}
function isPaylUser() {
  if (typeof _userPricing !== "undefined" && _userPricing && _userPricing.tier) {
    return _userPricing.tier === "payl";
  }
  if (typeof currentUser !== "undefined" && currentUser?.user_metadata?.plan) {
    return currentUser.user_metadata.plan === "payl";
  }
  return false;
}
function canAccess(feature) {
  var tier = getUserTier();
  var gate = TIER_GATES[feature];
  if (!gate) return true;
  var val = gate[tier];
  if (val === false) return false;
  if (val === true || val === Infinity) return true;
  return val;
}
function requiredTier(feature) {
  var gate = TIER_GATES[feature];
  if (!gate) return "free";
  if (gate.free !== false) return "free";
  if (gate.starter !== false) return "starter";
  return "pro";
}
window.showTierGate = function(el, minTier, message) {
  if (!el) return;
  el.style.position = "relative";
  var existing = el.querySelector(".tier-gate-overlay");
  if (existing) existing.remove();
  var tierNames = { starter: "Starter", pro: "Pro" };
  var overlay = document.createElement("div");
  overlay.className = "tier-gate-overlay";
  overlay.style.cssText = "position:absolute;inset:0;background:rgba(15,17,23,0.85);backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;border-radius:inherit;";
  overlay.innerHTML = `
    <i data-lucide="lock-keyhole" class="icon-lg icon-stroke" style="stroke:var(--warm);margin-bottom:8px;"></i>
    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:4px;">${message || (tierNames[minTier] || "Upgrade") + " plan required"}</div>
    <button class="btn btn-sm btn-primary" onclick="event.stopPropagation();showPage('subscription');" style="font-size:10px;padding:4px 14px;margin-top:6px;">Upgrade to ${tierNames[minTier] || "Pro"}</button>
  `;
  el.appendChild(overlay);
  if (typeof window.refreshIcons === "function") window.refreshIcons();
};
window.removeTierGate = function(el) {
  if (!el) return;
  var overlay = el.querySelector(".tier-gate-overlay");
  if (overlay) overlay.remove();
};
function applyMetricsTierGating() {
  var tier = getUserTier();
  if (tier === "free") {
    var sparkEl = document.getElementById("metrics-sparkline");
    if (sparkEl && sparkEl.parentElement) {
      window.showTierGate(sparkEl.parentElement, "starter", "Score history requires Starter plan");
    }
  }
  if (tier === "free") {
    var levelEl = document.getElementById("metrics-level-chart");
    if (levelEl && levelEl.closest(".stats-chart-card")) {
      window.showTierGate(levelEl.closest(".stats-chart-card"), "starter", "Level fit analysis requires Starter plan");
    }
  }
  if (tier === "free") {
    var funnelEl = document.getElementById("metrics-funnel-chart");
    if (funnelEl && funnelEl.closest(".stats-chart-card")) {
      window.showTierGate(funnelEl.closest(".stats-chart-card"), "starter", "Pipeline analytics requires Starter plan");
    }
  }
  if (tier === "free") {
    var logEl = document.getElementById("metrics-usage-log");
    if (logEl) window.showTierGate(logEl, "starter", "Application log requires Starter plan");
  }
}
function applyArchiveTierGating() {
}
var _origLoadResumeMetrics = window.loadResumeMetrics;
if (_origLoadResumeMetrics) {
  window.loadResumeMetrics = async function() {
    await _origLoadResumeMetrics();
    applyMetricsTierGating();
  };
}
window.canAccessFeature = canAccess;
window.getUserTier = getUserTier;
window.isPaylUser = isPaylUser;
window.requiredTierFor = requiredTier;
const _AUTO_APPLY_STORAGE_KEY = "bj_auto_apply_daily";
function _getAutoApplyDailyRecord() {
  try {
    const raw = localStorage.getItem(_AUTO_APPLY_STORAGE_KEY);
    if (!raw) return { date: "", count: 0 };
    const rec = JSON.parse(raw);
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    if (rec.date !== today) return { date: today, count: 0 };
    return rec;
  } catch (e) {
    return { date: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), count: 0 };
  }
}
function getAutoApplyDailyLimit() {
  const tier = getUserTier();
  const gate = TIER_GATES.auto_apply_daily;
  const val = gate[tier];
  if (val === void 0) return 0;
  return val;
}
function getAutoApplyDailyRemaining() {
  const limit = getAutoApplyDailyLimit();
  if (limit === 0) return 0;
  if (limit === Infinity) return Infinity;
  const rec = _getAutoApplyDailyRecord();
  return Math.max(0, limit - rec.count);
}
function incrementAutoApplyDailyCount() {
  try {
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const rec = _getAutoApplyDailyRecord();
    rec.date = today;
    rec.count = (rec.count || 0) + 1;
    localStorage.setItem(_AUTO_APPLY_STORAGE_KEY, JSON.stringify(rec));
  } catch (e) {
  }
}
function checkAutoApplyTierGate() {
  const tier = getUserTier();
  const limit = getAutoApplyDailyLimit();
  if (limit === 0) {
    return { allowed: false, tier, limit: 0, remaining: 0, requiresTier: "starter" };
  }
  const remaining = getAutoApplyDailyRemaining();
  if (remaining === 0) {
    return { allowed: false, tier, limit, remaining: 0, requiresTier: tier === "starter" ? "pro" : "starter" };
  }
  return { allowed: true, tier, limit, remaining, requiresTier: null };
}
window.getAutoApplyDailyLimit = getAutoApplyDailyLimit;
window.getAutoApplyDailyRemaining = getAutoApplyDailyRemaining;
window.incrementAutoApplyDailyCount = incrementAutoApplyDailyCount;
window.checkAutoApplyTierGate = checkAutoApplyTierGate;
(function() {
  ["canAccessFeature", "getUserTier", "isPaylUser", "removeTierGate", "requiredTierFor", "showTierGate"].forEach(function(name) {
    var fn = window[name];
    if (typeof fn === "function") {
      window.BJ[name] = fn;
      window.BJ._registry[name] = { module: "tier-gating", registered: Date.now() };
    }
  });
})();
