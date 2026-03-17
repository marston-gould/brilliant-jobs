// js/upgrade.js
// FB-TRIAL-001-S6 — 5.3: Monthly/Annual billing toggle on upgrade page
// Renders toggle UI, updates CTA price display, passes billing_period to create-checkout EF
// Exports: initBillingToggle (window + BJ namespace)

/* global sb, SUPABASE_URL, showToast, posthog */

var _billingPeriod = 'monthly'; // 'monthly' | 'annual'

var MONTHLY_PRICE_DISPLAY = '$19.99/mo';
var ANNUAL_PRICE_DISPLAY = '$199.90/yr';
var ANNUAL_SAVINGS_DISPLAY = 'save 17%';

// ─── Render toggle pills ───
function _renderBillingToggle(container) {
  container.innerHTML = [
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">',
    '<button id="billing-toggle-monthly" onclick="setBillingPeriod(\'monthly\')" ',
    'style="',
    'padding:6px 16px;border-radius:999px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid;transition:all 0.15s;',
    (_billingPeriod === 'monthly' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : 'background:transparent;color:var(--text-muted);border-color:var(--border);'),
    '">Monthly &mdash; ' + MONTHLY_PRICE_DISPLAY + '</button>',
    '<button id="billing-toggle-annual" onclick="setBillingPeriod(\'annual\')" ',
    'style="',
    'padding:6px 16px;border-radius:999px;font-size:13px;font-weight:500;cursor:pointer;border:1.5px solid;transition:all 0.15s;',
    (_billingPeriod === 'annual' ? 'background:var(--accent);color:#fff;border-color:var(--accent);' : 'background:transparent;color:var(--text-muted);border-color:var(--border);'),
    '">Annual &mdash; ' + ANNUAL_PRICE_DISPLAY + ' <span style="font-size:11px;opacity:0.85;">(' + ANNUAL_SAVINGS_DISPLAY + ')</span></button>',
    '</div>',
  ].join('');
}

// ─── Update CTA button text based on period ───
function _updateCtaButton() {
  var btn = document.getElementById('sub-upgrade-cta-btn');
  if (!btn) return;
  if (_billingPeriod === 'annual') {
    btn.textContent = 'Upgrade to Pro — ' + ANNUAL_PRICE_DISPLAY;
  } else {
    btn.textContent = 'Upgrade to Pro — ' + MONTHLY_PRICE_DISPLAY;
  }
}

// ─── Public: set billing period ───
window.setBillingPeriod = function(period) {
  if (period !== 'monthly' && period !== 'annual') return;
  _billingPeriod = period;
  var container = document.getElementById('billing-toggle');
  if (container) _renderBillingToggle(container);
  _updateCtaButton();
  if (typeof posthog !== 'undefined') {
    posthog.capture('billing_period_toggled', { period: period });
  }
};

// ─── Public: get current period for checkout ───
window.getBillingPeriod = function() { return _billingPeriod; };

// ─── Init: show toggle container, render pills ───
function initBillingToggle() {
  var container = document.getElementById('billing-toggle');
  if (!container) return;
  container.style.display = 'block';
  _billingPeriod = 'monthly';
  _renderBillingToggle(container);
  _updateCtaButton();
}

window.initBillingToggle = initBillingToggle;

// ─── Hook into startCheckout to pass billing_period ───
// Monkey-patch billing.js startCheckout to include billing_period
(function() {
  var _originalStartCheckout = window.startCheckout;
  window.startCheckout = async function(mode, tier, packQty) {
    if (mode === 'subscription' && tier === 'pro') {
      // Inject billing_period into the checkout
      var session = await sb.auth.getSession();
      var token = session?.data?.session?.access_token;
      if (!token) { window.location.href = '/'; return; }
      if (typeof posthog !== 'undefined') posthog.capture('billing_checkout_started', { mode, tier, billing_period: _billingPeriod });
      try {
        var res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'subscription', tier: 'pro', billing_period: _billingPeriod }),
        });
        var data = await res.json();
        if (data.url) { window.location.href = data.url; }
        else { showToast('Failed to start checkout. Please try again.', 'error'); }
      } catch (e) { showToast('Network error. Please try again.', 'error'); }
      return;
    }
    if (typeof _originalStartCheckout === 'function') {
      return _originalStartCheckout(mode, tier, packQty);
    }
  };
})();

// ─── Auto-init when upgrade banner is visible ───
(function() {
  // Watch for the sub-upgrade-banner becoming visible
  var banner = document.getElementById('sub-upgrade-banner');
  if (!banner) return;
  var obs = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        if (!banner.classList.contains('u-hidden')) {
          initBillingToggle();
        }
      }
    });
  });
  obs.observe(banner, { attributes: true });
})();

// ─── BJ namespace ───
(function() {
  if (!window.BJ) window.BJ = {};
  window.BJ.initBillingToggle = initBillingToggle;
  window.BJ.setBillingPeriod = window.setBillingPeriod;
  window.BJ.getBillingPeriod = window.getBillingPeriod;
  if (window.BJ._registry) {
    window.BJ._registry['initBillingToggle'] = { module: 'upgrade', registered: Date.now() };
  }
})();
