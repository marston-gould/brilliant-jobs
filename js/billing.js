// js/billing.js — Subscription page, credit balance, pricing, checkout flows
// v3.72: Full subscription tab + credit merchandising

const SUPABASE_FUNCTIONS_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1';

// ─── State ───
let _creditBalance = 0;
let _userPricing = null;
let _userSubscription = null;
let _creditHistory = [];
let _isAdmin = false;

// ─── Credit Balance + Pricing Loaders ───
async function loadCreditBalance() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
    if (!error && data !== null) {
      _creditBalance = data;
      renderCreditBadge(data);
      renderSubscriptionBalance(data);
      checkLowCreditAlert(data);
    }
  } catch (e) {
    console.warn('[Billing] Failed to load credit balance:', e.message);
  }
}

async function loadUserPricing() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.rpc('get_effective_pricing', { p_user_id: currentUser.id });
    if (!error && data) {
      _userPricing = data;
      renderPlanBadge(data);
      renderSubscriptionPlan(data);
      renderTierComparison(data);
      renderCreditPacks(data);
      renderUpgradeBanner(data);
    }
  } catch (e) {
    console.warn('[Billing] Failed to load pricing:', e.message);
  }
}

async function loadUserSubscription() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb
      .from('user_subscriptions')
      .select('*')
      .eq('user_id', currentUser.id)
      .single();
    if (!error && data) {
      _userSubscription = data;
      renderSubscriptionPeriod(data);
    }
  } catch (e) {}
}

async function loadCreditHistory() {
  if (!currentUser?.id) return;
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const { data, error } = await sb
      .from('credit_ledger')
      .select('amount,type,cost_category,description,created_at')
      .eq('user_id', currentUser.id)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false });
    if (!error && data) {
      _creditHistory = data;
      renderUsageBreakdown(data);
      renderBurnRate(data);
    }
  } catch (e) {
    console.warn('[Billing] Failed to load credit history:', e.message);
  }
}

// ─── Nav Badge ───
function renderCreditBadge(balance) {
  const el = document.getElementById('credit-balance-badge');
  if (!el) return;
  if (_isAdmin) {
    el.textContent = '∞';
    el.className = 'credit-balance-count credit-green';
    return;
  }
  el.textContent = balance.toLocaleString();
  el.className = 'credit-balance-count';
  if (balance > 50) el.classList.add('credit-green');
  else if (balance >= 10) el.classList.add('credit-amber');
  else el.classList.add('credit-red');
}

function renderPlanBadge(pricing) {
  const el = document.querySelector('.nav-user-plan');
  if (!el) return;
  if (_isAdmin) {
    el.textContent = 'ADMIN';
    el.style.color = '#f59e0b';
    el.style.fontWeight = '700';
    el.style.letterSpacing = '1px';
    return;
  }
  const tierNames = { free: 'Free Plan', starter: 'Starter Plan', pro: 'Pro Plan' };
  el.textContent = tierNames[pricing.tier] || 'Free Plan';
  el.style.color = '';
  el.style.fontWeight = '';
  el.style.letterSpacing = '';
}

// ─── Subscription Page Renderers ───
function renderSubscriptionPlan(pricing) {
  const tierNames = { free: 'Free', starter: 'Starter', pro: 'Pro' };
  const el = (id) => document.getElementById(id);
  if (_isAdmin) {
    if (el('sub-plan-name')) el('sub-plan-name').textContent = 'Admin';
    if (el('sub-plan-price')) el('sub-plan-price').textContent = 'Unlimited';
    if (el('sub-plan-credits-included')) el('sub-plan-credits-included').textContent = 'Unlimited credits';
    if (el('sub-plan-payg')) el('sub-plan-payg').textContent = 'All features unlocked';
    return;
  }
  if (el('sub-plan-name')) el('sub-plan-name').textContent = tierNames[pricing.tier] || 'Free';
  if (el('sub-plan-price')) el('sub-plan-price').textContent = pricing.subscription_price_cents === 0 ? '$0/mo' : '$' + (pricing.subscription_price_cents / 100).toFixed(0) + '/mo';
  if (el('sub-plan-credits-included')) el('sub-plan-credits-included').textContent = pricing.included_credits + ' credits included/month';
  if (el('sub-plan-payg')) el('sub-plan-payg').textContent = 'PAYG rate: $' + (pricing.payg_rate_cents / 100).toFixed(2) + '/credit';
}

function renderSubscriptionPeriod(sub) {
  if (!sub?.current_period_end) return;
  const periodEl = document.getElementById('sub-plan-period');
  const dateEl = document.getElementById('sub-plan-renew-date');
  if (periodEl && dateEl) {
    const date = new Date(sub.current_period_end);
    dateEl.textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    periodEl.style.display = '';
  }
}

function renderSubscriptionBalance(balance) {
  const el = document.getElementById('sub-balance-number');
  if (el) {
    if (_isAdmin) {
      el.textContent = '∞';
      el.className = 'sub-balance-number credit-green';
      return;
    }
    el.textContent = balance.toLocaleString();
    el.className = 'sub-balance-number';
    if (balance > 50) el.classList.add('credit-green');
    else if (balance >= 10) el.classList.add('credit-amber');
    else el.classList.add('credit-red');
  }
}

function renderBurnRate(history) {
  const debits = history.filter(h => h.amount < 0);
  if (debits.length === 0) return;
  const totalUsed = debits.reduce((sum, h) => sum + Math.abs(h.amount), 0);
  const firstDebit = new Date(debits[debits.length - 1].created_at);
  const daySpan = Math.max(1, (Date.now() - firstDebit.getTime()) / 86400000);
  const dailyBurn = totalUsed / daySpan;
  const daysLeft = dailyBurn > 0 ? Math.floor(_creditBalance / dailyBurn) : Infinity;

  const burnEl = document.getElementById('sub-burn-rate');
  const dailyEl = document.getElementById('sub-daily-burn');
  const daysEl = document.getElementById('sub-days-left');
  if (burnEl && dailyEl && daysEl) {
    dailyEl.textContent = dailyBurn.toFixed(1);
    daysEl.textContent = daysLeft === Infinity ? '∞' : daysLeft.toString();
    burnEl.style.display = '';
  }
}

function renderUsageBreakdown(history) {
  const debits = history.filter(h => h.amount < 0);
  let scoring = 0, rewrites = 0, alerts = 0;
  debits.forEach(d => {
    const desc = (d.description || '').toLowerCase();
    const amt = Math.abs(d.amount);
    if (desc.includes('score') || desc.includes('scoring')) scoring += amt;
    else if (desc.includes('rewrite')) rewrites += amt;
    else if (desc.includes('alert')) alerts += amt;
  });
  const el = (id) => document.getElementById(id);
  if (el('sub-usage-scoring')) el('sub-usage-scoring').textContent = scoring + ' credits';
  if (el('sub-usage-rewrites')) el('sub-usage-rewrites').textContent = rewrites + ' credits';
  if (el('sub-usage-alerts')) el('sub-usage-alerts').textContent = alerts + ' credits';
}

// ─── Low Credit Alert ───
function checkLowCreditAlert(balance) {
  const alertEl = document.getElementById('sub-credit-alert');
  const countEl = document.getElementById('sub-alert-count');
  if (!alertEl) return;
  if (_isAdmin) { alertEl.style.display = 'none'; return; }
  if (balance === 0) {
    if (countEl) countEl.textContent = '0';
    const msgEl = document.getElementById('sub-alert-msg');
    if (msgEl) msgEl.innerHTML = "You're out of credits. <strong>Buy more to continue using AI features.</strong>";
    alertEl.style.display = 'flex';
    alertEl.classList.add('sub-alert-critical');
  } else if (balance <= 10) {
    if (countEl) countEl.textContent = balance;
    alertEl.style.display = 'flex';
    alertEl.classList.remove('sub-alert-critical');
  } else {
    alertEl.style.display = 'none';
  }
}

// ─── Tier Comparison ───
function renderTierComparison(pricing) {
  const container = document.getElementById('sub-tiers');
  if (!container) return;
  const currentTier = pricing.tier;
  const tiers = [
    { id: 'free', name: 'Free', price: 0, credits: 0, payg: 25, features: ['1 saved filter', '1 resume', 'Basic job feed'] },
    { id: 'starter', name: 'Starter', price: 2000, credits: 100, payg: 15, features: ['10 saved filters', '5 resumes', 'AI resume scoring', 'SMS notifications', 'Boolean search'] },
    { id: 'pro', name: 'Pro', price: 4000, credits: 300, payg: 10, features: ['10 saved filters', '5 resumes', 'AI resume scoring', 'AI resume rewrites', 'SMS notifications', 'Boolean search', 'Auto-apply', 'Network intelligence'] },
  ];
  container.innerHTML = tiers.map(t => {
    const isCurrent = t.id === currentTier;
    const priceStr = t.price === 0 ? '$0' : '$' + (t.price / 100);
    return `
      <div class="sub-tier-card ${isCurrent ? 'sub-tier-current' : ''}">
        ${isCurrent ? '<div class="sub-tier-badge">Current</div>' : ''}
        <div class="sub-tier-name">${t.name}</div>
        <div class="sub-tier-price">${priceStr}<span class="sub-tier-interval">/mo</span></div>
        <div class="sub-tier-credits">${t.credits > 0 ? t.credits + ' credits/mo' : 'No included credits'}</div>
        <div class="sub-tier-payg">$${(t.payg / 100).toFixed(2)}/credit PAYG</div>
        <ul class="sub-tier-features">${t.features.map(f => '<li>' + f + '</li>').join('')}</ul>
        ${isCurrent
          ? '<button class="btn-secondary btn-sm" disabled>Current Plan</button>'
          : t.id === 'free'
            ? ''
            : `<button class="btn-primary btn-sm" onclick="startCheckout('subscription','${t.id}')">${currentTier === 'free' || t.price > (pricing.subscription_price_cents || 0) ? 'Upgrade' : 'Switch'}</button>`
        }
      </div>`;
  }).join('');
}

// ─── Credit Packs ───
function renderCreditPacks(pricing) {
  const container = document.getElementById('sub-packs');
  if (!container) return;
  const rate = pricing.payg_rate_cents;
  container.innerHTML = [10, 50, 100].map(qty => {
    const total = (qty * rate / 100).toFixed(2);
    return `
      <div class="sub-pack-card" onclick="startCheckout('credit_pack', null, ${qty})">
        <div class="sub-pack-qty">${qty}</div>
        <div class="sub-pack-label">credits</div>
        <div class="sub-pack-price">$${total}</div>
        <div class="sub-pack-rate">$${(rate / 100).toFixed(2)}/credit</div>
      </div>`;
  }).join('');
}

// ─── Upgrade Banner ───
function renderUpgradeBanner(pricing) {
  const banner = document.getElementById('sub-upgrade-banner');
  if (!banner) return;
  if (_isAdmin || pricing.tier === 'pro') { banner.style.display = 'none'; return; }
  const headline = document.getElementById('sub-upgrade-headline');
  const detail = document.getElementById('sub-upgrade-detail');
  const btn = banner.querySelector('button');
  if (pricing.tier === 'free') {
    if (headline) headline.textContent = 'Get started with Starter';
    if (detail) detail.textContent = '100 credits/month, $0.15/credit PAYG, AI resume scoring, SMS alerts — $20/mo';
    if (btn) { btn.textContent = 'Upgrade to Starter'; btn.setAttribute('onclick', "startCheckout('subscription','starter')"); }
  } else {
    if (headline) headline.textContent = 'Unlock everything with Pro';
    if (detail) detail.textContent = '300 credits/month, $0.10/credit PAYG, AI rewrites, auto-apply, network intelligence — $40/mo';
  }
  banner.style.display = 'flex';
}

// ─── Pricing Modal (nav badge click → navigate to subscription tab) ───
function openPricingModal() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.toggle('active', n.dataset.page === 'subscription'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const subPage = document.getElementById('page-subscription');
  if (subPage) subPage.classList.add('active');
  localStorage.setItem('bj_active_tab', 'subscription');
}

// ─── Checkout Flow ───
async function startCheckout(mode, tier, packQty) {
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  const body = { mode };
  if (mode === 'subscription') body.tier = tier;
  if (mode === 'credit_pack') body.pack_qty = packQty;
  try {
    const res = await fetch(SUPABASE_FUNCTIONS_URL + '/create-checkout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.url) { window.location.href = data.url; }
    else { showToast('Failed to start checkout. Please try again.', 'error'); }
  } catch (e) { showToast('Network error. Please try again.', 'error'); }
}

async function openCustomerPortal() {
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  try {
    const res = await fetch(SUPABASE_FUNCTIONS_URL + '/manage-subscription', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.url) { window.open(data.url, '_blank'); }
    else { showToast('Unable to open billing portal. You may need to subscribe first.', 'warning'); }
  } catch (e) { showToast('Network error. Please try again.', 'error'); }
}

// ─── Credit Gate (call before credit-consuming actions) ───
async function requireCredits(amount, description) {
  if (_isAdmin) return true;
  if (_creditBalance >= amount) return true;
  showToast('You need ' + amount + ' credits. You have ' + _creditBalance + '.', 'warning');
  openPricingModal();
  return false;
}

// ─── Payment Return Detection ───
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    showToast('Payment successful! Your credits will update shortly.', 'success');
    window.history.replaceState({}, '', window.location.pathname);
    setTimeout(function() { loadCreditBalance(); loadUserPricing(); loadUserSubscription(); }, 2000);
  } else if (params.get('payment') === 'canceled') {
    showToast('Payment canceled.', 'info');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ─── Auto-Refill Toggle ───
function initAutoRefillUI() {
  const toggle = document.getElementById('sub-refill-enabled');
  const levels = document.getElementById('sub-refill-levels');
  if (!toggle || !levels) return;
  toggle.addEventListener('change', function() {
    levels.style.display = toggle.checked ? '' : 'none';
    if (!toggle.checked && currentUser?.id) {
      sb.from('auto_refill_settings').upsert({
        user_id: currentUser.id, enabled: false, refill_level: 'low', threshold_credits: 0
      }, { onConflict: 'user_id' });
    }
  });
  if (currentUser?.id) {
    sb.from('auto_refill_settings').select('*').eq('user_id', currentUser.id).single()
      .then(function(resp) {
        if (resp.data) {
          toggle.checked = resp.data.enabled;
          levels.style.display = resp.data.enabled ? '' : 'none';
          var radio = document.getElementById('refill-' + resp.data.refill_level);
          if (radio) radio.checked = true;
        }
      });
  }
  document.querySelectorAll('input[name="refill-level"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      if (!currentUser?.id) return;
      sb.from('auto_refill_settings').upsert({
        user_id: currentUser.id, enabled: true, refill_level: radio.value, threshold_credits: 0
      }, { onConflict: 'user_id' });
      showToast('Auto-refill updated.', 'success');
    });
  });
}

// ─── Init ───
function initBilling() {
  // Check admin status from profile (already fetched in app.js init)
  _isAdmin = (window._bjUserRole === 'admin');
  loadCreditBalance();
  loadUserPricing();
  loadUserSubscription();
  loadCreditHistory();
  checkPaymentReturn();
  initAutoRefillUI();
}
