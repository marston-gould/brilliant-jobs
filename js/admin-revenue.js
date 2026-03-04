/* ─────────────────────────────────────────────────────────
   admin-revenue.js — Revenue & Billing Sub-Page
   Brilliant Jobs Admin Console · v6.91
   ───────────────────────────────────────────────────────── */
'use strict';

// ── State ──────────────────────────────────────────────────
var _revPeriod = 30;
var _revData   = null;

// ── Entry point ────────────────────────────────────────────
async function loadRevenueTab(periodDays) {
  if (periodDays) _revPeriod = periodDays;
  console.log('[Admin] loadRevenueTab · period:', _revPeriod + 'd');
  var panel = document.getElementById('admin-panel-revenue');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:24px;color:var(--text-faint)">Loading revenue data…</div>';
  await _loadRevData();
  _renderRevenue(panel);
}

// ── Data ───────────────────────────────────────────────────
async function _loadRevData() {
  try {
    var since = new Date(Date.now() - _revPeriod * 86400000).toISOString();

    // Active subscriptions breakdown
    var { data: subs } = await sb
      .from('subscriptions')
      .select('plan_id, status, created_at, user_id')
      .eq('status', 'active');

    var planCounts = {};
    (subs || []).forEach(function(s) {
      planCounts[s.plan_id] = (planCounts[s.plan_id] || 0) + 1;
    });

    // New subs in period
    var { count: newSubsCount } = await sb
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);

    // Recent billing events
    var { data: events } = await sb
      .from('billing_events')
      .select('event_type, created_at, payload')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50);

    // MRR estimate (rough: pro=$40, starter=$20)
    var prices = { pro: 40, starter: 20, enterprise: 200 };
    var mrr = Object.entries(planCounts).reduce(function(sum, entry) {
      return sum + (prices[entry[0]] || 0) * entry[1];
    }, 0);

    _revData = {
      planCounts: planCounts,
      totalActive: (subs || []).length,
      newSubsCount: newSubsCount || 0,
      mrr: mrr,
      events: events || [],
      period: _revPeriod,
    };
  } catch (e) {
    console.error('[Admin] Revenue load error:', e);
    _revData = null;
  }
}

// ── Render ─────────────────────────────────────────────────
function _renderRevenue(panel) {
  if (!_revData) {
    panel.innerHTML = '<div style="padding:24px;color:var(--text-dim)">Failed to load revenue data. ' +
      '<button onclick="_adminTabInit[\'revenue\']=false;loadRevenueTab()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">Retry</button></div>';
    return;
  }

  var d = _revData;
  var planRows = Object.entries(d.planCounts).sort(function(a, b) { return b[1] - a[1]; }).map(function(entry) {
    var prices = { pro: 40, starter: 20, enterprise: 200 };
    var planMRR = (prices[entry[0]] || 0) * entry[1];
    return '<tr>' +
      '<td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + entry[0] + '</td>' +
      '<td style="text-align:right">' + entry[1].toLocaleString() + '</td>' +
      '<td style="text-align:right;font-family:var(--mono)">$' + planMRR.toLocaleString() + '/mo</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-faint)">No active subscriptions</td></tr>';

  var eventRows = d.events.slice(0, 20).map(function(ev) {
    var payload = typeof ev.payload === 'string' ? {} : (ev.payload || {});
    var amt = payload.amount_paid ? '$' + (payload.amount_paid / 100).toFixed(2) : '—';
    return '<tr>' +
      '<td style="font-size:11px;color:var(--text-faint);white-space:nowrap">' + new Date(ev.created_at).toLocaleString() + '</td>' +
      '<td style="font-family:var(--mono);font-size:11px;color:var(--text-dim)">' + escapeHtml(ev.event_type) + '</td>' +
      '<td style="text-align:right;font-family:var(--mono);font-size:12px">' + amt + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-faint)">No billing events in this period</td></tr>';

  panel.innerHTML =
    '<div style="padding:24px">' +

    // Header
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
    '<div><h2 style="margin:0 0 4px;font-size:20px;font-weight:600">Revenue</h2>' +
    '<p style="margin:0;color:var(--text-dim);font-size:13px">Stripe subscriptions and billing event log</p></div>' +
    '<div id="admin-rev-period" style="display:flex;gap:6px">' +
    [7, 30, 90].map(function(p) {
      return '<button onclick="loadRevenueTab(' + p + ')" class="admin-period-btn admin-tab' + (d.period === p ? ' active' : '') + '" data-rev-days="' + p + '">' + p + 'd</button>';
    }).join('') + '</div></div>' +

    // Stat cards
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">' +
    _revStatCard('Est. MRR', '$' + d.mrr.toLocaleString(), 'Monthly recurring', '💰') +
    _revStatCard('Active Subs', d.totalActive.toLocaleString(), 'Across all plans', '📋') +
    _revStatCard('New Subs (' + d.period + 'd)', d.newSubsCount.toLocaleString(), 'In selected period', '📈') +
    _revStatCard('Stripe Portal', '<a href="https://dashboard.stripe.com" target="_blank" style="color:var(--accent);font-size:13px;font-weight:400">Open ↗</a>', 'Live mode', '⚡') +
    '</div>' +

    // Plan breakdown + events
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">' +

    '<div class="admin-card" style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Active Subscriptions by Plan</div>' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr><th style="text-align:left;font-size:11px;color:var(--text-faint);padding:4px 0">Plan</th>' +
    '<th style="text-align:right;font-size:11px;color:var(--text-faint);padding:4px 0">Count</th>' +
    '<th style="text-align:right;font-size:11px;color:var(--text-faint);padding:4px 0">Est. MRR</th></tr></thead>' +
    '<tbody>' + planRows + '</tbody>' +
    '<tfoot><tr style="border-top:1px solid var(--border);font-weight:600">' +
    '<td>Total</td><td style="text-align:right">' + d.totalActive + '</td>' +
    '<td style="text-align:right;font-family:var(--mono)">$' + d.mrr.toLocaleString() + '</td></tr></tfoot>' +
    '</table>' +
    '<div style="margin-top:12px;padding:8px;background:rgba(245,158,11,0.07);border-radius:6px;font-size:11px;color:#f59e0b">' +
    '⚠ MRR estimates are based on list prices. Connect Stripe revenue data for accurate figures.' +
    '</div></div>' +

    '<div class="admin-card" style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Recent Billing Events (' + d.period + 'd)</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr>' +
    '<th style="text-align:left;font-size:11px;color:var(--text-faint);padding:4px 6px">Time</th>' +
    '<th style="text-align:left;font-size:11px;color:var(--text-faint);padding:4px 6px">Event</th>' +
    '<th style="text-align:right;font-size:11px;color:var(--text-faint);padding:4px 6px">Amount</th>' +
    '</tr></thead>' +
    '<tbody>' + eventRows + '</tbody></table></div></div>' +

    '</div></div>';

  // Init revenue chart
  setTimeout(function() { _initRevChart(d); }, 100);
}

function _revStatCard(label, value, sub, icon) {
  return '<div class="admin-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start">' +
    '<div style="font-size:22px">' + icon + '</div>' +
    '<div><div style="font-size:20px;font-weight:700;color:var(--text)">' + value + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-top:1px">' + label + '</div>' +
    '<div style="font-size:11px;color:var(--text-faint);margin-top:2px">' + sub + '</div></div></div>';
}

function _initRevChart(d) {
  // Placeholder — Stripe revenue chart populated once Stripe data is wired
  var el = document.createElement('div');
  el.style.cssText = 'margin-top:16px;padding:16px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;text-align:center;color:var(--text-faint);font-size:13px;padding:40px';
  el.textContent = 'Revenue over time chart — available after Stripe webhook data accumulates';
  var panel = document.getElementById('admin-panel-revenue');
  if (panel) panel.querySelector('[style*="grid-template-columns:1fr 1fr"]')?.after(el);
}
