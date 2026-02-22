// js/billing.js — Credit balance display, pricing modal, checkout flows
// v3.71: Monetization frontend wiring

const SUPABASE_FUNCTIONS_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1';

// ─── Credit Balance Display ───
let _creditBalance = 0;
let _userPricing = null;

async function loadCreditBalance() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
    if (!error && data !== null) {
      _creditBalance = data;
      renderCreditBadge(data);
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
    }
  } catch (e) {
    console.warn('[Billing] Failed to load pricing:', e.message);
  }
}

function renderCreditBadge(balance) {
  const el = document.getElementById('credit-balance-badge');
  if (!el) return;
  el.textContent = balance.toLocaleString();
  // Color coding per spec: green (>50), amber (10-50), red (<10)
  el.className = 'credit-balance-count';
  if (balance > 50) el.classList.add('credit-green');
  else if (balance >= 10) el.classList.add('credit-amber');
  else el.classList.add('credit-red');
}

function renderPlanBadge(pricing) {
  const el = document.querySelector('.nav-user-plan');
  if (!el) return;
  const tierNames = { free: 'Free Plan', starter: 'Starter Plan', pro: 'Pro Plan' };
  el.textContent = tierNames[pricing.tier] || 'Free Plan';
}

// ─── Pricing Modal ───
function openPricingModal() {
  let modal = document.getElementById('pricing-modal');
  if (modal) { modal.style.display = 'flex'; return; }

  const tier = _userPricing?.tier || 'free';

  modal = document.createElement('div');
  modal.id = 'pricing-modal';
  modal.className = 'billing-modal-overlay';
  modal.innerHTML = `
    <div class="billing-modal">
      <div class="billing-modal-header">
        <h2>Choose Your Plan</h2>
        <button class="billing-modal-close" onclick="closePricingModal()">&times;</button>
      </div>

      <div class="billing-tiers">
        ${buildTierCard('free', 'Free', 0, 0, 25, tier)}
        ${buildTierCard('starter', 'Starter', 2000, 100, 15, tier)}
        ${buildTierCard('pro', 'Pro', 4000, 300, 10, tier)}
      </div>

      <div class="billing-section-label">Credit Packs</div>
      <div class="billing-packs">
        ${buildPackCard(10)}
        ${buildPackCard(50)}
        ${buildPackCard(100)}
      </div>

      <div class="billing-section-label">Manage Subscription</div>
      <div class="billing-manage">
        <button class="btn-billing-manage" onclick="openCustomerPortal()">
          Manage Payment Method & Invoices
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.style.display = 'flex';
  // Close on overlay click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePricingModal();
  });
}

function closePricingModal() {
  const modal = document.getElementById('pricing-modal');
  if (modal) modal.style.display = 'none';
}

function buildTierCard(tierId, name, priceCents, credits, paygCents, currentTier) {
  const isCurrent = tierId === currentTier;
  const priceStr = priceCents === 0 ? 'Free' : `$${(priceCents / 100).toFixed(0)}/mo`;
  return `
    <div class="billing-tier-card ${isCurrent ? 'current' : ''}">
      <div class="billing-tier-name">${name}</div>
      <div class="billing-tier-price">${priceStr}</div>
      <div class="billing-tier-credits">${credits > 0 ? credits + ' credits/mo' : 'No included credits'}</div>
      <div class="billing-tier-payg">PAYG: $${(paygCents / 100).toFixed(2)}/credit</div>
      ${isCurrent
        ? '<button class="btn-billing-tier current" disabled>Current Plan</button>'
        : tierId === 'free'
          ? '<button class="btn-billing-tier" disabled>—</button>'
          : `<button class="btn-billing-tier" onclick="startCheckout('subscription','${tierId}')">Upgrade</button>`
      }
    </div>
  `;
}

function buildPackCard(qty) {
  const tier = _userPricing?.tier || 'free';
  const rate = _userPricing?.payg_rate_cents || 25;
  const totalCents = qty * rate;
  return `
    <div class="billing-pack-card" onclick="startCheckout('credit_pack', null, ${qty})">
      <div class="billing-pack-qty">${qty} credits</div>
      <div class="billing-pack-price">$${(totalCents / 100).toFixed(2)}</div>
      <div class="billing-pack-rate">$${(rate / 100).toFixed(2)}/credit</div>
    </div>
  `;
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
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('[Billing] Checkout failed:', data.error);
      showToast('Failed to start checkout. Please try again.', 'error');
    }
  } catch (e) {
    console.error('[Billing] Checkout error:', e);
    showToast('Network error. Please try again.', 'error');
  }
}

async function openCustomerPortal() {
  const session = await sb.auth.getSession();
  const token = session?.data?.session?.access_token;
  if (!token) { window.location.href = '/'; return; }

  try {
    const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/manage-subscription`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    const data = await res.json();
    if (data.url) {
      window.open(data.url, '_blank');
    } else {
      console.error('[Billing] Portal failed:', data.error);
      showToast('Failed to open subscription manager.', 'error');
    }
  } catch (e) {
    console.error('[Billing] Portal error:', e);
    showToast('Network error. Please try again.', 'error');
  }
}

// ─── Credit Gate (call before credit-consuming actions) ───
async function requireCredits(amount, description) {
  if (_creditBalance >= amount) return true;
  // Insufficient credits — show purchase prompt
  showToast(`You need ${amount} credits for this action. You have ${_creditBalance}.`, 'warning');
  openPricingModal();
  return false;
}

// ─── Payment Success Detection ───
function checkPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    showToast('Payment successful! Your credits have been updated.', 'success');
    // Clean the URL
    window.history.replaceState({}, '', window.location.pathname);
    // Refresh balance
    setTimeout(() => {
      loadCreditBalance();
      loadUserPricing();
    }, 2000); // Small delay for webhook processing
  } else if (params.get('payment') === 'canceled') {
    showToast('Payment canceled.', 'info');
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ─── Init ───
function initBilling() {
  loadCreditBalance();
  loadUserPricing();
  checkPaymentReturn();
}
