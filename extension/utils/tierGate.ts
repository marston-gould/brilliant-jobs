/**
 * tierGate.ts — Extension Tier Gating (v3.7.0)
 * ==============================================
 * Phase 9 (P7): Feature-flag autofill behind subscription tiers.
 *
 * Tiers:
 *   free    → Extension installed, LinkedIn scanning works, autofill DISABLED.
 *             "Upgrade to Pro" CTA on fill attempts.
 *   starter → Autofill enabled, 5 applications/day. Counter resets midnight UTC.
 *   pro     → Unlimited autofill. All handlers enabled.
 *
 * The dashboard sends tier info via dashboard:ping response and dashboard:setTier.
 * The extension caches the tier in chrome.storage.local.
 *
 * Usage in background.js:
 *   const gate = await BJ_TIER_GATE.check();
 *   if (!gate.allowed) return { success: false, error: 'tier_blocked', ...gate };
 */

const BJ_TIER_GATE = (() => {
  // ── Constants ──
  const STORAGE_KEY = 'bj_tier_data';
  const DAILY_LIMIT_STARTER = 5;
  const DAILY_LIMIT_PRO = Infinity;
  const DAILY_LIMIT_FREE = 0;

  // ── Helpers ──
  function todayUTC() {
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  function getLimitForTier(tier) {
    switch (tier) {
      case 'pro': return DAILY_LIMIT_PRO;
      case 'starter': return DAILY_LIMIT_STARTER;
      default: return DAILY_LIMIT_FREE;
    }
  }

  // ── Load tier data from storage ──
  async function loadTierData() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const data = result[STORAGE_KEY] || {};
      // Reset daily counter if date changed
      if (data.date !== todayUTC()) {
        data.date = todayUTC();
        data.dailyUsed = 0;
        await saveTierData(data);
      }
      return {
        tier: data.tier || 'free',
        dailyUsed: data.dailyUsed || 0,
        date: data.date || todayUTC(),
        lastUpdated: data.lastUpdated || null,
      };
    } catch (e) {
      return { tier: 'free', dailyUsed: 0, date: todayUTC(), lastUpdated: null };
    }
  }

  // ── Save tier data ──
  async function saveTierData(data) {
    data.lastUpdated = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEY]: data });
  }

  // ── Set tier (called when dashboard sends tier info) ──
  async function setTier(tier) {
    const valid = ['free', 'starter', 'pro'];
    if (!valid.includes(tier)) tier = 'free';
    const data = await loadTierData();
    data.tier = tier;
    await saveTierData(data);
    return data;
  }

  // ── Check if autofill is allowed ──
  async function check() {
    const data = await loadTierData();
    const limit = getLimitForTier(data.tier);

    if (data.tier === 'free') {
      return {
        allowed: false,
        tier: data.tier,
        reason: 'free_tier',
        message: 'Autofill is a Pro feature. Upgrade to unlock automatic form filling.',
        dailyUsed: data.dailyUsed,
        dailyLimit: 0,
        remaining: 0,
      };
    }

    if (data.tier === 'starter' && data.dailyUsed >= limit) {
      return {
        allowed: false,
        tier: data.tier,
        reason: 'daily_limit_reached',
        message: `You've used all ${DAILY_LIMIT_STARTER} daily autofill applications. Upgrade to Pro for unlimited.`,
        dailyUsed: data.dailyUsed,
        dailyLimit: DAILY_LIMIT_STARTER,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      tier: data.tier,
      reason: null,
      message: null,
      dailyUsed: data.dailyUsed,
      dailyLimit: limit === Infinity ? -1 : limit,
      remaining: limit === Infinity ? -1 : Math.max(0, limit - data.dailyUsed),
    };
  }

  // ── Increment daily usage counter (call after successful fill) ──
  async function recordUsage() {
    const data = await loadTierData();
    data.dailyUsed = (data.dailyUsed || 0) + 1;
    await saveTierData(data);
    return {
      dailyUsed: data.dailyUsed,
      dailyLimit: getLimitForTier(data.tier),
      remaining: data.tier === 'pro' ? -1 : Math.max(0, getLimitForTier(data.tier) - data.dailyUsed),
    };
  }

  // ── Get current status (for ping response) ──
  async function getStatus() {
    const data = await loadTierData();
    const limit = getLimitForTier(data.tier);
    return {
      tier: data.tier,
      dailyUsed: data.dailyUsed,
      dailyLimit: limit === Infinity ? -1 : limit,
      remaining: limit === Infinity ? -1 : Math.max(0, limit - data.dailyUsed),
      date: data.date,
    };
  }

  return { check, setTier, recordUsage, getStatus, loadTierData };
})();
