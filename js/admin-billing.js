// js/admin-billing.js — SPEC-ADMIN-002-S2: Billing Manager
// Subscriptions list + global credit ledger view

var _bmState = { tab: 'subscriptions', subPage: 1, ledgerPage: 1 };

async function loadBillingManagerTab() {
  var panel = document.getElementById('admin-panel-billing-manager');
  if (!panel) return;
  panel.innerHTML = [
    '<div style="display:flex;gap:8px;margin-bottom:16px">',
    '  <button class="bm-tab active" data-tab="subscriptions" onclick="bmSwitchTab(this,\'subscriptions\')">Subscriptions</button>',
    '  <button class="bm-tab" data-tab="ledger" onclick="bmSwitchTab(this,\'ledger\')">Global Credit Ledger</button>',
    '</div>',
    '<div id="bm-subscriptions-panel">',
    '  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">',
    '    <select id="bm-status-filter" onchange="bmLoadSubs()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '      <option value="">All Statuses</option>',
    '      <option value="active">Active</option>',
    '      <option value="past_due">Past Due</option>',
    '      <option value="canceled">Canceled</option>',
    '    </select>',
    '    <span id="bm-sub-count" style="font-size:12px;color:var(--text-faint);font-family:var(--mono);align-self:center"></span>',
    '  </div>',
    '  <div style="overflow-x:auto"><table class="admin-table" style="width:100%">',
    '    <thead><tr><th>User</th><th>Cohort</th><th>Status</th><th>Period End</th><th>Stripe Sub ID</th><th></th></tr></thead>',
    '    <tbody id="bm-sub-tbody"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '  </table></div>',
    '  <div style="display:flex;gap:8px;align-items:center;margin-top:12px">',
    '    <button onclick="bmSubPage(-1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">← Prev</button>',
    '    <span id="bm-sub-page-info" style="font-size:12px;color:var(--text-faint);font-family:var(--mono)"></span>',
    '    <button onclick="bmSubPage(1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">Next →</button>',
    '  </div>',
    '</div>',
    '<div id="bm-ledger-panel" style="display:none">',
    '  <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">',
    '    <input id="bm-ledger-user" type="text" placeholder="Filter by User ID…"',
    '      style="flex:1;min-width:160px;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px"',
    '      oninput="bmLedgerDebounced()">',
    '    <select id="bm-event-filter" onchange="bmLoadLedger()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '      <option value="">All Event Types</option>',
    '      <option value="feature_debit">feature_debit</option>',
    '      <option value="cohort_grant">cohort_grant</option>',
    '      <option value="admin_adjustment">admin_adjustment</option>',
    '      <option value="award_grant">award_grant</option>',
    '    </select>',
    '    <span id="bm-ledger-count" style="font-size:12px;color:var(--text-faint);font-family:var(--mono);align-self:center"></span>',
    '  </div>',
    '  <div style="overflow-x:auto"><table class="admin-table" style="width:100%;font-size:12px">',
    '    <thead><tr><th>Date</th><th>User</th><th>Type</th><th>Bucket</th><th>Amount</th><th>Feature</th><th>Notes</th></tr></thead>',
    '    <tbody id="bm-ledger-tbody"><tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '  </table></div>',
    '  <div style="display:flex;gap:8px;align-items:center;margin-top:12px">',
    '    <button onclick="bmLedgerPage(-1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">← Prev</button>',
    '    <span id="bm-ledger-page-info" style="font-size:12px;color:var(--text-faint);font-family:var(--mono)"></span>',
    '    <button onclick="bmLedgerPage(1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">Next →</button>',
    '  </div>',
    '</div>',
  ].join('');
  bmLoadSubs();
}

function bmSwitchTab(btn, tab) {
  document.querySelectorAll('.bm-tab').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  _bmState.tab = tab;
  document.getElementById('bm-subscriptions-panel').style.display = tab === 'subscriptions' ? '' : 'none';
  document.getElementById('bm-ledger-panel').style.display = tab === 'ledger' ? '' : 'none';
  if (tab === 'ledger') bmLoadLedger();
}

function bmSubPage(dir) {
  var tbody = document.getElementById('bm-sub-tbody');
  _bmState.subPage = Math.max(1, _bmState.subPage + dir);
  bmLoadSubs();
}

function bmLedgerPage(dir) {
  _bmState.ledgerPage = Math.max(1, _bmState.ledgerPage + dir);
  bmLoadLedger();
}

var _bmLedgerTimer = null;
function bmLedgerDebounced() {
  clearTimeout(_bmLedgerTimer);
  _bmLedgerTimer = setTimeout(function(){ _bmState.ledgerPage=1; bmLoadLedger(); }, 350);
}

async function bmLoadSubs() {
  var tbody = document.getElementById('bm-sub-tbody');
  var status = document.getElementById('bm-status-filter')?.value || '';
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-faint)">Loading…</td></tr>';
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-billing-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_subscriptions', status_filter: status, page: _bmState.subPage }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    var countEl = document.getElementById('bm-sub-count');
    if (countEl) countEl.textContent = (data.total||0).toLocaleString() + ' subscriptions';
    var pageEl = document.getElementById('bm-sub-page-info');
    if (pageEl) pageEl.textContent = 'Page ' + _bmState.subPage + ' of ' + Math.max(1, Math.ceil((data.total||0)/50));

    var subs = data.subscriptions || [];
    if (!subs.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">No subscriptions</td></tr>'; return; }
    tbody.innerHTML = subs.map(function(s) {
      var email = s.profiles?.email || '—';
      var cohort = s.profiles?.cohort_tiers?.slug || '—';
      var statusColor = s.status === 'active' ? 'var(--green)' : s.status === 'past_due' ? 'var(--warm)' : 'var(--text-faint)';
      var periodEnd = s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—';
      return '<tr>' +
        '<td style="font-size:12px">' + escapeHtml(email) + '</td>' +
        '<td><span style="font-family:var(--mono);font-size:11px">' + escapeHtml(cohort) + '</span></td>' +
        '<td style="color:' + statusColor + ';font-size:12px">' + escapeHtml(s.status) + '</td>' +
        '<td style="font-size:12px">' + periodEnd + (s.cancel_at_period_end ? ' <span style="color:var(--red);font-size:10px">(cancels)</span>' : '') + '</td>' +
        '<td style="font-family:var(--mono);font-size:10px;color:var(--text-faint)">' + escapeHtml((s.stripe_subscription_id||'').slice(0,20)) + '</td>' +
        '<td><button onclick="bmCancelSub(\'' + s.stripe_subscription_id + '\',\'' + (s.profiles?.id||'') + '\')" style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:11px;cursor:pointer">Cancel</button></td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    reportError('admin-billing:subs', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:var(--red);padding:12px">' + escapeHtml(e.message) + '</td></tr>';
  }
}

async function bmCancelSub(subId, userId) {
  var immediately = confirm('Cancel IMMEDIATELY?\n\nOK = cancel now\nCancel = cancel at period end');
  var reason = prompt('Reason for cancellation (required, min 10 chars):');
  if (!reason || reason.trim().length < 10) return toastWarning('Reason too short');
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-billing-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel_subscription', subscription_id: subId, user_id: userId, cancel_immediately: immediately, reason }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toastSuccess('Subscription ' + (immediately ? 'cancelled immediately' : 'set to cancel at period end'));
    bmLoadSubs();
  } catch(e) { reportError('admin-billing:cancel', e); toastWarning('Cancel failed: ' + e.message); }
}

async function bmLoadLedger() {
  var tbody = document.getElementById('bm-ledger-tbody');
  var userId = document.getElementById('bm-ledger-user')?.value.trim() || '';
  var eventType = document.getElementById('bm-event-filter')?.value || '';
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-faint)">Loading…</td></tr>';
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-billing-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'global_ledger', user_id: userId, event_type: eventType, page: _bmState.ledgerPage }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    var countEl = document.getElementById('bm-ledger-count');
    if (countEl) countEl.textContent = (data.total||0).toLocaleString() + ' entries';
    var pageEl = document.getElementById('bm-ledger-page-info');
    if (pageEl) pageEl.textContent = 'Page ' + _bmState.ledgerPage + ' of ' + Math.max(1, Math.ceil((data.total||0)/50));

    var entries = data.entries || [];
    if (!entries.length) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-faint)">No entries</td></tr>'; return; }
    tbody.innerHTML = entries.map(function(e) {
      var amtColor = e.amount > 0 ? 'var(--green)' : 'var(--red)';
      var email = e.profiles?.email || e.user_id?.slice(0,8) + '…';
      return '<tr>' +
        '<td>' + new Date(e.created_at).toLocaleDateString() + '</td>' +
        '<td style="font-size:11px">' + escapeHtml(email) + '</td>' +
        '<td style="font-family:var(--mono);font-size:10px">' + escapeHtml(e.event_type) + '</td>' +
        '<td style="font-size:11px">' + escapeHtml(e.bucket) + '</td>' +
        '<td style="font-family:var(--mono);font-weight:600;color:' + amtColor + '">' + (e.amount > 0 ? '+' : '') + e.amount + '</td>' +
        '<td style="font-size:11px;color:var(--text-faint)">' + escapeHtml(e.feature || '—') + '</td>' +
        '<td style="font-size:10px;color:var(--text-faint);max-width:160px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(e.notes || '—') + '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    reportError('admin-billing:ledger', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red);padding:12px">' + escapeHtml(e.message) + '</td></tr>';
  }
}

async function bmExportSubsCSV() {
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var status = document.getElementById('bm-status-filter')?.value || '';
    var res = await fetch('/functions/v1/api-gateway/admin-billing-manager', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'export_subscriptions_csv', status_filter: status }),
    });
    if (!res.ok) { toastWarning('Export failed'); return; }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'subscriptions.csv'; a.click();
    URL.revokeObjectURL(url);
  } catch(e) { reportError('admin-billing:export-csv', e); toastWarning('Export failed: ' + e.message); }
}

(function() {
  ['loadBillingManagerTab','bmLoadSubs','bmLoadLedger','bmCancelSub','bmSwitchTab','bmSubPage','bmLedgerPage'].forEach(function(n) {
    if (typeof window[n] === 'function') { window.BJ[n] = window[n]; window.BJ._registry[n] = { module: 'admin-billing', registered: Date.now() }; }
  });
})();
