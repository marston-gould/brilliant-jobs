// ═══════════════════════════════════════════════════════════
// admin-stripe.js — Stripe Customer & Subscription Management
// Admin IA v2 · Session 8 · v6.92
// ═══════════════════════════════════════════════════════════

var _stripeSearchTimeout = null;
var _stripeCurrentCustomer = null;

async function loadStripeTab() {
  console.log('[Admin] loadStripeTab');
  var el = document.getElementById('admin-stripe-panel');
  if (!el) return;

  el.innerHTML = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Stripe Customer Management</h3>',
      '<a href="https://dashboard.stripe.com/customers" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none;font-family:var(--mono)">',
        '↗ Open Stripe Dashboard',
      '</a>',
    '</div>',

    // Search bar
    '<div style="display:flex;gap:8px;margin-bottom:20px">',
      '<input id="stripe-search-input" type="text" placeholder="Search by email or Stripe customer ID…"',
        ' style="flex:1;padding:8px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--mono)"',
        ' oninput="stripeSearchDebounce()" onkeydown="if(event.key===\'Enter\')stripeSearchNow()">',
      '<button onclick="stripeSearchNow()" style="padding:8px 16px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:13px;font-family:var(--mono);cursor:pointer">Search</button>',
    '</div>',

    // Results area
    '<div id="stripe-search-results" style="margin-bottom:24px"></div>',

    // Customer detail panel (hidden until customer selected)
    '<div id="stripe-customer-detail" style="display:none">',
      '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:20px">',
        '<div id="stripe-customer-header" style="margin-bottom:16px"></div>',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">',
          '<div id="stripe-sub-info"></div>',
          '<div id="stripe-billing-info"></div>',
        '</div>',
        '<div id="stripe-billing-history" style="margin-bottom:16px"></div>',
        '<div id="stripe-actions" style="display:flex;gap:8px;flex-wrap:wrap"></div>',
      '</div>',
    '</div>',

    // Recent subscribers
    '<div>',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Recent Subscribers (30d)</div>',
      '<div id="stripe-recent-subs">',
        '<div style="color:var(--text-faint);font-size:13px">Loading...</div>',
      '</div>',
    '</div>'
  ].join('');

  loadStripeRecentSubs();
}

function stripeSearchDebounce() {
  clearTimeout(_stripeSearchTimeout);
  _stripeSearchTimeout = setTimeout(stripeSearchNow, 400);
}

async function stripeSearchNow() {
  var q = (document.getElementById('stripe-search-input') || {}).value || '';
  q = q.trim();
  if (!q) { document.getElementById('stripe-search-results').innerHTML = ''; return; }

  var resultsEl = document.getElementById('stripe-search-results');
  resultsEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">Searching...</div>';

  try {
    // Search billing_events for matching stripe_customer_id or join profiles by email
    var byEmail = await sb.from('profiles')
      .select('id,email,plan,cohort_id,created_at')
      .ilike('email', '%' + q + '%')
      .limit(5);

    var byStripeId = null;
    if (q.startsWith('cus_')) {
      byStripeId = await sb.from('subscriptions')
        .select('user_id,stripe_customer_id,stripe_subscription_id,status,plan_id,current_period_end')
        .eq('stripe_customer_id', q)
        .limit(1);
    }

    var rows = byEmail.data || [];
    if (byStripeId && byStripeId.data && byStripeId.data.length) {
      // Merge results
      var existingIds = rows.map(function(r) { return r.id; });
      byStripeId.data.forEach(function(s) {
        if (existingIds.indexOf(s.user_id) < 0) {
          rows.push({ id: s.user_id, email: '(via Stripe ID)', plan: s.plan_id, _sub: s });
        }
      });
    }

    if (!rows.length) {
      resultsEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No customers found for "' + escapeHtml(q) + '"</div>';
      _logAdminAction('admin_email_search', 'profiles', null, { query: q, results: 0 });
      return;
    }

    _logAdminAction('admin_email_search', 'profiles', null, { query: q, results: rows.length });

    resultsEl.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
      rows.map(function(r, i) {
        return '<div onclick="loadStripeCustomer(\'' + r.id + '\')" style="padding:10px 14px;' +
          (i > 0 ? 'border-top:1px solid var(--border);' : '') +
          'cursor:pointer;display:flex;align-items:center;gap:12px;background:var(--bg-card)"' +
          ' onmouseover="this.style.background=\'var(--bg-card-hover)\'" onmouseout="this.style.background=\'var(--bg-card)\'">' +
          '<span style="font-family:var(--mono);font-size:13px;flex:1">' + escapeHtml(r.email || '—') + '</span>' +
          '<span class="' + _stripePlanBadgeClass(r.plan) + '">' + (r.plan || 'free').toUpperCase() + '</span>' +
          '<span style="font-size:11px;color:var(--text-faint)">' + (r.created_at ? new Date(r.created_at).toLocaleDateString() : '') + '</span>' +
          '</div>';
      }).join('') +
      '</div>';
  } catch (err) {
    console.error('[Admin] Stripe search error:', err);
    resultsEl.innerHTML = '<div class="admin-red" style="font-size:13px">Search failed: ' + escapeHtml(err.message || '') + '</div>';
  }
}
window.stripeSearchNow = stripeSearchNow;
window.stripeSearchDebounce = stripeSearchDebounce;

function _stripePlanBadgeClass(plan) {
  if (plan === 'pro') return 'admin-plan-badge admin-green';
  if (plan === 'enterprise') return 'admin-plan-badge admin-amber';
  if (plan === 'starter') return 'admin-plan-badge';
  return 'admin-plan-badge';
}

async function loadStripeCustomer(userId) {
  document.getElementById('stripe-customer-detail').style.display = 'block';
  var headerEl = document.getElementById('stripe-customer-header');
  var subEl = document.getElementById('stripe-sub-info');
  var billingEl = document.getElementById('stripe-billing-info');
  var historyEl = document.getElementById('stripe-billing-history');
  var actionsEl = document.getElementById('stripe-actions');

  headerEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">Loading customer...</div>';
  subEl.innerHTML = billingEl.innerHTML = historyEl.innerHTML = '';

  try {
    // Load profile + subscription in parallel
    var [profRes, subRes] = await Promise.all([
      sb.from('profiles').select('id,email,plan,cohort_id,created_at,role').eq('id', userId).single(),
      sb.from('subscriptions').select('*').eq('user_id', userId).maybeSingle()
    ]);

    var prof = profRes.data;
    var sub = subRes.data;
    _stripeCurrentCustomer = { userId, prof, sub };

    // Header
    headerEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px">' +
      '<div style="width:36px;height:36px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700">' +
        (prof ? prof.email.charAt(0).toUpperCase() : '?') +
      '</div>' +
      '<div>' +
        '<div style="font-size:15px;font-weight:600;color:var(--text)">' + escapeHtml((prof || {}).email || userId) + '</div>' +
        '<div style="font-size:12px;color:var(--text-faint);font-family:var(--mono)">' + userId + '</div>' +
      '</div>' +
      '</div>';

    // Subscription info
    if (sub) {
      var periodEnd = sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—';
      var statusColor = sub.status === 'active' ? 'admin-green' : (sub.status === 'past_due' ? 'admin-red' : 'admin-amber');
      subEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Subscription</div>' +
        _stripeInfoRow('Plan', (sub.plan_id || '—').toUpperCase()) +
        _stripeInfoRow('Status', '<span class="' + statusColor + '">' + (sub.status || '—') + '</span>') +
        _stripeInfoRow('Period End', periodEnd) +
        _stripeInfoRow('Cancel EOT', sub.cancel_at_period_end ? '<span class="admin-amber">Yes</span>' : 'No') +
        _stripeInfoRow('Stripe Sub ID', '<span style="font-size:11px;font-family:var(--mono)">' + escapeHtml(sub.stripe_subscription_id || '—') + '</span>') +
        _stripeInfoRow('Stripe Cust ID', '<span style="font-size:11px;font-family:var(--mono)">' + escapeHtml(sub.stripe_customer_id || '—') + '</span>');
    } else {
      subEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Subscription</div>' +
        '<div style="color:var(--text-faint);font-size:13px">No active subscription</div>';
    }

    // Profile info
    billingEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Profile</div>' +
      _stripeInfoRow('Plan (profile)', '<span class="' + _stripePlanBadgeClass((prof || {}).plan) + '">' + ((prof || {}).plan || 'free').toUpperCase() + '</span>') +
      _stripeInfoRow('Cohort', escapeHtml(((prof || {}).cohort_id) || '—')) +
      _stripeInfoRow('Role', escapeHtml(((prof || {}).role) || 'user')) +
      _stripeInfoRow('Member Since', prof ? new Date(prof.created_at).toLocaleDateString() : '—');

    // Billing history
    var evRes = await sb.from('billing_events')
      .select('stripe_event_id,event_type,processed_at,payload')
      .contains('payload', { customer: sub ? sub.stripe_customer_id : '' })
      .order('processed_at', { ascending: false })
      .limit(10);

    var events = (evRes.data || []);
    if (events.length) {
      historyEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Billing History</div>' +
        '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
        events.map(function(ev, i) {
          var amount = ev.payload && ev.payload.amount_paid ? '$' + (ev.payload.amount_paid / 100).toFixed(2) : '';
          return '<div style="padding:7px 12px;' + (i > 0 ? 'border-top:1px solid var(--border);' : '') + 'display:flex;gap:12px;align-items:center">' +
            '<span style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + new Date(ev.processed_at).toLocaleDateString() + '</span>' +
            '<span style="font-size:12px;flex:1">' + escapeHtml(ev.event_type) + '</span>' +
            (amount ? '<span style="font-size:12px;color:var(--admin-green)">' + amount + '</span>' : '') +
            '</div>';
        }).join('') + '</div>';
    } else {
      historyEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Billing History</div>' +
        '<div style="color:var(--text-faint);font-size:13px">No billing events found</div>';
    }

    // Actions
    actionsEl.innerHTML = '';
    var actions = [];

    if (sub && sub.stripe_customer_id) {
      actions.push({
        label: '↗ View in Stripe',
        color: '',
        fn: 'window.open("https://dashboard.stripe.com/customers/' + sub.stripe_customer_id + '","_blank")'
      });
    }

    if (sub && sub.status === 'active' && !sub.cancel_at_period_end) {
      actions.push({ label: 'Cancel at EOT', color: 'admin-amber', fn: 'confirmStripeCancelEOT("' + userId + '")' });
    }

    actions.push({ label: 'Override Plan', color: '', fn: 'openStripePlanOverride("' + userId + '")' });

    actions.forEach(function(a) {
      var btn = document.createElement('button');
      btn.textContent = a.label;
      btn.className = 'merch-btn-sm ' + (a.color || '');
      btn.setAttribute('onclick', a.fn);
      actionsEl.appendChild(btn);
    });

  } catch (err) {
    console.error('[Admin] loadStripeCustomer error:', err);
    headerEl.innerHTML = '<div class="admin-red" style="font-size:13px">Error loading customer: ' + escapeHtml(err.message || '') + '</div>';
  }
}
window.loadStripeCustomer = loadStripeCustomer;

function _stripeInfoRow(label, value) {
  return '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px">' +
    '<span style="font-size:11px;color:var(--text-faint);min-width:90px;font-family:var(--mono)">' + label + '</span>' +
    '<span style="font-size:13px;color:var(--text)">' + value + '</span>' +
    '</div>';
}

async function loadStripeRecentSubs() {
  var el = document.getElementById('stripe-recent-subs');
  if (!el) return;
  try {
    var res = await sb.from('subscriptions')
      .select('user_id,plan_id,status,stripe_customer_id,current_period_start')
      .eq('status', 'active')
      .order('current_period_start', { ascending: false })
      .limit(20);

    if (!res.data || !res.data.length) {
      el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No active subscriptions yet</div>';
      return;
    }

    // Get emails
    var userIds = res.data.map(function(r) { return r.user_id; });
    var profRes = await sb.from('profiles').select('id,email,cohort_id').in('id', userIds);
    var profMap = {};
    (profRes.data || []).forEach(function(p) { profMap[p.id] = p; });

    el.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
      '<table class="admin-table" style="width:100%">' +
      '<thead><tr>' +
        '<th>Email</th><th>Plan</th><th>Cohort</th><th>Status</th><th>Since</th><th></th>' +
      '</tr></thead><tbody>' +
      res.data.map(function(s, i) {
        var prof = profMap[s.user_id] || {};
        var statusColor = s.status === 'active' ? 'admin-green' : 'admin-red';
        return '<tr>' +
          '<td style="font-family:var(--mono);font-size:12px">' + escapeHtml(prof.email || s.user_id.slice(0,8) + '…') + '</td>' +
          '<td><span class="' + _stripePlanBadgeClass(s.plan_id) + '">' + (s.plan_id || '—').toUpperCase() + '</span></td>' +
          '<td style="font-size:12px;color:var(--text-faint)">' + escapeHtml(prof.cohort_id || '—') + '</td>' +
          '<td class="' + statusColor + '" style="font-size:12px">' + (s.status || '—') + '</td>' +
          '<td style="font-size:12px;color:var(--text-faint)">' + (s.current_period_start ? new Date(s.current_period_start).toLocaleDateString() : '—') + '</td>' +
          '<td><button onclick="loadStripeCustomer(\'' + s.user_id + '\')" class="merch-btn-sm">View</button></td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';
  } catch (err) {
    console.error('[Admin] loadStripeRecentSubs error:', err);
    el.innerHTML = '<div class="admin-red" style="font-size:13px">Failed to load subscribers</div>';
  }
}

async function openStripePlanOverride(userId) {
  var newPlan = window.prompt('Override plan for this user (free / starter / pro / enterprise):');
  if (!newPlan || !['free','starter','pro','enterprise'].includes(newPlan.trim().toLowerCase())) {
    if (newPlan !== null) toastWarning('Invalid plan. Must be: free, starter, pro, or enterprise');
    return;
  }
  newPlan = newPlan.trim().toLowerCase();
  try {
    var res = await sb.from('profiles').update({ plan: newPlan }).eq('id', userId);
    if (res.error) throw res.error;
    _logAdminAction('stripe_plan_override', 'profiles', userId, { new_plan: newPlan });
    toastSuccess('Plan updated to ' + newPlan + ' for user');
    loadStripeCustomer(userId);
  } catch (err) {
    console.error('[Admin] Plan override error:', err);
    toastError('Plan override failed: ' + (err.message || ''));
  }
}
window.openStripePlanOverride = openStripePlanOverride;

async function confirmStripeCancelEOT(userId) {
  if (!window.confirm('Cancel subscription at end of current period? The user keeps access until then.')) return;
  // Stub — production wiring requires Stripe API call from Edge Function
  toastWarning('Cancel EOT: requires Edge Function wiring (stub). Use Stripe Dashboard to cancel manually.');
}
window.confirmStripeCancelEOT = confirmStripeCancelEOT;

// CS-P1-004 FE-005: Register admin-stripe exports with BJ namespace
(function() {
  ['confirmStripeCancelEOT','loadStripeCustomer','openStripePlanOverride','stripeSearchDebounce','stripeSearchNow'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-stripe', registered: Date.now() };
    }
  });
})();
