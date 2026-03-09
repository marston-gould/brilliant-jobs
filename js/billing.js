// js/billing.js — Subscription page, credit balance, pricing, checkout flows
// v3.72: Full subscription tab + credit merchandising
// QA-FIX: Uses SUPABASE_URL from globals.ts (shell chunk) instead of local var

// ─── State ───
var _creditBalance = 0;
var _userPricing = null;
var _userSubscription = null;
var _creditHistory = [];
var _isAdmin = false;

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
    reportError('billing', e);
    console.warn('[Billing] Failed to load credit balance:', e.message); toastWarning('Unable to load credit balance');
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
    reportError('billing', e);
    console.warn('[Billing] Failed to load pricing:', e.message); toastWarning('Unable to load pricing');
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
  } catch(e) { reportError('billing:billing', e); }
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
    reportError('billing', e);
    console.warn('[Billing] Failed to load credit history:', e.message); toastWarning('Unable to load credit history');
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
      <div class="sub-tier-card ${isCurrent ? 'sub-tier-current' : ''}" style="display:flex;flex-direction:column;">
        ${isCurrent ? '<div class="sub-tier-badge">Current</div>' : ''}
        <div class="sub-tier-name">${t.name}</div>
        <div class="sub-tier-price">${priceStr}<span class="sub-tier-interval">/mo</span></div>
        <div class="sub-tier-credits">${t.credits > 0 ? t.credits + ' credits/mo' : 'No included credits'}</div>
        <div class="sub-tier-payg">$${(t.payg / 100).toFixed(2)}/credit PAYG</div>
        <ul class="sub-tier-features" style="flex:1;">${t.features.map(f => '<li>' + f + '</li>').join('')}</ul>
        <div style="margin-top:auto;text-align:center;">
        ${isCurrent
          ? '<button class="btn-secondary btn-sm" disabled>Current Plan</button>'
          : t.id === 'free'
            ? ''
            : `<button class="btn-primary btn-sm" onclick="startCheckout('subscription','${t.id}')">${currentTier === 'free' || t.price > (pricing.subscription_price_cents || 0) ? 'Upgrade' : 'Switch'}</button>`
        }
        </div>
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
  // CX-06: PostHog — checkout started
  if (window.posthog) posthog.capture('billing_checkout_started', { mode, tier: tier || null, pack_qty: packQty || null });
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  const body = { mode };
  if (mode === 'subscription') body.tier = tier;
  if (mode === 'credit_pack') body.pack_qty = packQty;
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/create-checkout', {
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
  // CX-06: PostHog — billing portal opened
  if (window.posthog) posthog.capture('billing_portal_opened');
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/manage-subscription', {
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
  showToast('You need ' + amount + ' credits for ' + description + '. You have ' + _creditBalance + '.', 'warning');
  // P13-09: Paywall friction micro-survey
  if (typeof showPaywallFriction === 'function') showPaywallFriction(description);
  openPricingModal();
  return false;
}

// ─── Debit Credits (call to actually debit after action) ───
async function debitCreditsForAction(amount, costCategory, description, costCents) {
  if (!currentUser?.id) return null;
  try {
    var result = await sb.rpc('debit_credits', {
      p_user_id: currentUser.id,
      p_amount: amount,
      p_cost_category: costCategory || 'claude',
      p_description: description || 'AI action',
      p_cost_cents: costCents || 0
    });
    if (result.error) {
      reportError('billing:debit-credits', result.error); toastError('Credit deduction failed');
      return { success: false, error: result.error.message };
    }
    var data = result.data;
    if (data.success) {
      // Update local balance
      if (data.admin) {
        _creditBalance = 999999;
      } else {
        _creditBalance = data.balance;
      }
      renderCreditBadge(_creditBalance);
      renderSubscriptionBalance(_creditBalance);
      // Check if auto-refill should fire
      if (data.trigger_refill) {
        triggerAutoRefill();
      }
    }
    return data;
  } catch (e) {
    reportError('billing', e);
    console.error('[Billing] debitCreditsForAction error:', e); toastError('Credit deduction failed');
    return { success: false, error: e.message };
  }
}

// ─── Auto-Refill Trigger ───
async function triggerAutoRefill() {
  if (!currentUser?.id) return;
  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;
    console.log('[Billing] Triggering auto-refill');
    var res = await fetch(SUPABASE_URL + '/functions/v1/auto-refill', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUser.id }),
    });
    var data = await res.json();
    if (data.refilled) {
      showToast('Auto-refill: $' + (data.amount_cents / 100).toFixed(2) + ' charged. Credits incoming!', 'success');
      // Credits will be granted by Stripe webhook — refresh balance after delay
      setTimeout(function() { loadCreditBalance(); }, 5000);
    } else if (data.reason === 'payment_failed') {
      showToast('Auto-refill failed: ' + (data.error || 'payment declined') + '. Check your payment method.', 'error');
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Auto-refill trigger error:', e); toastWarning('Auto-refill check failed');
  }
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

// ─── Hire Fee: SetupIntent Flow ───
async function setupHireFee() {
  var session = await sb.auth.getSession();
  var token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }

  try {
    showToast('Setting up payment authorization...', 'info');
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'setup' }),
    });
    var data = await res.json();
    if (data.client_secret) {
      // Load Stripe.js and mount card element for SetupIntent confirmation
      if (!window.Stripe) {
        var script = document.createElement('script');
        script.src = 'https://js.stripe.com/v3/';
        script.onload = function() { confirmSetupIntent(data.client_secret); };
        document.head.appendChild(script);
      } else {
        confirmSetupIntent(data.client_secret);
      }
    } else {
      showToast('Failed to set up payment: ' + (data.error || 'Unknown error'), 'error');
    }
  } catch (e) {
    showToast('Network error. Please try again.', 'error');
  }
}

async function confirmSetupIntent(clientSecret) {
  var stripe = Stripe('pk_live_51T3TKnPKzCZbw3KzvE3xlxz8Yt9Hx9PTIRewh21Pks8YQt6TgV5urss7w93Hd27vfnZQlMiAvMP9WAgRSHM3dFFz00ufrYmhyI');

  // Create a modal with card element
  var modal = document.createElement('div');
  modal.id = 'hire-fee-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  modal.innerHTML = '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px;max-width:420px;width:90%;box-shadow:0 16px 48px rgba(0,0,0,0.2);">' +
    '<h3 style="font-size:16px;font-weight:700;margin-bottom:8px;">Authorize Payment Method</h3>' +
    '<p style="font-size:12px;color:var(--text-dim);margin-bottom:20px;">This card will only be charged when you confirm a successful hire through Brilliant Jobs.</p>' +
    '<div id="hire-fee-card-element" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:16px;"></div>' +
    '<div id="hire-fee-error" style="color:hsl(0,70%,50%);font-size:12px;margin-bottom:12px;display:none;"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;">' +
    '<button onclick="document.getElementById(\'hire-fee-modal\').remove()" class="btn-secondary btn-sm">Cancel</button>' +
    '<button id="hire-fee-confirm-btn" class="btn-primary btn-sm">Authorize</button>' +
    '</div></div>';
  document.body.appendChild(modal);

  var elements = stripe.elements();
  var cardElement = elements.create('card', {
    style: {
      base: { fontSize: '14px', color: '#1a1a2e', '::placeholder': { color: '#999' } }
    }
  });
  cardElement.mount('#hire-fee-card-element');

  document.getElementById('hire-fee-confirm-btn')?.addEventListener('click', async function() {
    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Authorizing...';
    var errorEl = document.getElementById('hire-fee-error');

    var result = await stripe.confirmCardSetup(clientSecret, {
      payment_method: { card: cardElement }
    });

    if (result.error) {
      errorEl.textContent = result.error.message;
      errorEl.style.display = '';
      btn.disabled = false;
      btn.textContent = 'Authorize';
    } else {
      // SetupIntent succeeded — stripe-webhook will store the payment method
      showToast('Payment method authorized! You\'re all set for pay-when-hired.', 'success');
      modal.remove();
      // Refresh hire fee status after webhook processes
      setTimeout(function() { loadHireFeeStatus(); }, 2000);
    }
  });

  // Close on backdrop click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });
}

async function loadHireFeeStatus() {
  if (!currentUser?.id) return;
  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return;
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'status' }),
    });
    if (!res.ok) return; // Edge function not deployed yet — silent fail
    var data = await res.json();
    var noMethodEl = document.getElementById('sub-hire-fee-nomethod');
    var activeEl = document.getElementById('sub-hire-fee-active');
    if (noMethodEl && activeEl) {
      noMethodEl.style.display = data.has_payment_method ? 'none' : '';
      activeEl.style.display = data.has_payment_method ? '' : 'none';
    }
  } catch (e) {
    reportError('billing', e);
    console.warn('[Billing] Failed to load hire fee status:', e); toastWarning('Unable to load hire fee status');
  }
}

// Called from pipeline when user marks a job as "hired"
async function confirmHireFee(jobId, jobTitle, salaryEstimate) {
  var feeAmountCents = Math.min(500000, Math.max(50000, Math.round((salaryEstimate || 80000) * 0.05 * 100)));
  var feeDisplay = '$' + (feeAmountCents / 100).toLocaleString();

  if (!confirm('Congratulations on your new role!\n\n' +
    'Job: ' + (jobTitle || 'Unknown') + '\n' +
    'Success fee: ' + feeDisplay + '\n\n' +
    'By confirming, your authorized payment method will be charged ' + feeDisplay + '.')) {
    return false;
  }

  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) return false;

    showToast('Processing hire fee...', 'info');
    var res = await fetch(SUPABASE_URL + '/functions/v1/hire-fee', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'charge', amount_cents: feeAmountCents, job_id: jobId }),
    });
    var data = await res.json();
    if (data.charged) {
      showToast('Hire fee of ' + feeDisplay + ' charged. Thank you and congratulations!', 'success');
      return true;
    } else if (data.error === 'no_payment_method') {
      showToast('No payment method on file. Please authorize a card in your Subscription settings.', 'warning');
      openPricingModal();
      return false;
    } else {
      showToast('Payment failed: ' + (data.error || 'Unknown error'), 'error');
      return false;
    }
  } catch (e) {
    showToast('Network error processing hire fee.', 'error');
    return false;
  }
}

// v5.17: Expose credit balance for resume score UX tier-routing
function getUserCredits() { return _creditBalance; }
window.getUserCredits = getUserCredits;

// ─── Init ───
function initBilling() {
  // CX-06: PostHog — billing page viewed
  if (window.posthog) posthog.capture('billing_page_viewed');
  // Check admin status from profile (already fetched in app.js init)
  _isAdmin = (window._bjUserRole === 'admin');
  loadCreditBalance();
  loadUserPricing();
  loadUserSubscription();
  loadCreditHistory();
  checkPaymentReturn();
  initAutoRefillUI();
  loadHireFeeStatus();
  _initTierChangeListener();
}

// ═══════════════════════════════════════════════════════════
// Item #11: Tier Change Push Notification
// Listens for realtime changes to user_subscriptions and
// fires a toast when plan changes mid-session.
// ═══════════════════════════════════════════════════════════
var _tierChangeChannel = null;

function _initTierChangeListener() {
  if (!currentUser?.id || _tierChangeChannel) return;
  try {
    _tierChangeChannel = sb.channel('tier-change-' + currentUser.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'user_subscriptions',
        filter: 'user_id=eq.' + currentUser.id
      }, function(payload) {
        var newTier = payload.new?.tier;
        var oldTier = payload.old?.tier;
        if (newTier && oldTier && newTier !== oldTier) {
          var tierNames = { free: 'Free', starter: 'Starter', pro: 'Pro' };
          var isUpgrade = (newTier === 'pro') || (newTier === 'starter' && oldTier === 'free');
          if (typeof showToast === 'function') {
            showToast(
              (isUpgrade ? '🎉 ' : '') + 'Plan changed: ' + (tierNames[oldTier] || oldTier) + ' → ' + (tierNames[newTier] || newTier),
              { type: isUpgrade ? 'success' : 'info', duration: 8000 }
            );
          }
          // Reload pricing and credit balance to reflect new tier
          loadUserPricing();
          loadCreditBalance();
          loadUserSubscription();
        }
      })
      .subscribe();
  } catch(e) { reportError('billing', e); console.warn('[billing] Tier change listener setup failed:', e);
  }
}

// CS-P1-004 FE-005: Register billing exports with BJ namespace
(function() {
  ['getUserCredits'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'billing', registered: Date.now() };
    }
  });
})();
