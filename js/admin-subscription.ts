// @ts-nocheck
// ═══════════════════════════════════════════════════════════
// admin-subscription.js — Subscription Analytics & MRR
// Admin IA v2 · Session 8 · v6.92
// ═══════════════════════════════════════════════════════════

var _subPeriodDays = 30;

async function loadSubscriptionTab(periodDays) {
  console.log('[Admin] loadSubscriptionTab', periodDays);
  _subPeriodDays = periodDays || _subPeriodDays || 30;

  var el = document.getElementById('admin-subscription-panel');
  if (!el) return;

  el.innerHTML = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Subscription Analytics</h3>',
      '<div id="sub-period-toggle" class="admin-period-btn-group" style="display:flex;gap:4px">',
        [7,30,90].map(function(d) {
          return '<button class="admin-period-btn' + (d === _subPeriodDays ? ' active' : '') + '"' +
            ' data-sub-days="' + d + '" onclick="loadSubscriptionTab(' + d + ')" style="padding:5px 12px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-dim);font-size:12px;font-family:var(--mono);cursor:pointer">' +
            d + 'd</button>';
        }).join(''),
      '</div>',
    '</div>',

    // MRR stat cards
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">',
      _subStatCard('as-mrr', 'Est. MRR', 'sub-mrr-delta'),
      _subStatCard('as-arr', 'Est. ARR', null),
      _subStatCard('as-active-subs', 'Active Subs', 'sub-subs-delta'),
      _subStatCard('as-churn-rate', 'Churn Rate', null),
      _subStatCard('as-arpu', 'ARPU', null),
    '</div>',

    // Plan breakdown + MRR chart side by side
    '<div style="display:grid;grid-template-columns:1fr 1.6fr;gap:16px;margin-bottom:24px">',
      // Plan breakdown
      '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
        '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Plan Breakdown</div>',
        '<div id="as-plan-breakdown">',
          '<div style="color:var(--text-faint);font-size:13px">Loading...</div>',
        '</div>',
      '</div>',
      // MRR trend chart
      '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
        '<div id="as-mrr-chart" style="height:180px"></div>',
      '</div>',
    '</div>',

    // New subscriptions log
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px;margin-bottom:16px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">',
        'New Subscriptions — Last <span id="as-period-label">' + _subPeriodDays + '</span>d',
      '</div>',
      '<div id="as-new-subs-table">',
        '<div style="color:var(--text-faint);font-size:13px">Loading...</div>',
      '</div>',
    '</div>',

    // Churned subscriptions
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">',
        'Churned — Last <span id="as-churn-period-label">' + _subPeriodDays + '</span>d',
      '</div>',
      '<div id="as-churn-table">',
        '<div style="color:var(--text-faint);font-size:13px">Loading...</div>',
      '</div>',
    '</div>',
  ].join('');

  // Load data in parallel
  await Promise.all([
    _loadSubMetrics(),
    _loadSubNewTable(),
    _loadSubChurnTable()
  ]);

  _loadSubMrrChart();
}
window.loadSubscriptionTab = loadSubscriptionTab;

function _subStatCard(id, label, deltaId) {
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:14px">' +
    '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div id="' + id + '" style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono)">—</div>' +
    (deltaId ? '<div id="' + deltaId + '" style="font-size:11px;color:var(--text-faint);margin-top:4px"></div>' : '') +
    '</div>';
}

async function _loadSubMetrics() {
  try {
    // Active subs by plan
    var subRes = await sb.from('subscriptions')
      .select('plan_id,status')
      .eq('status', 'active');

    var subs = subRes.data || [];
    var planCounts = { free: 0, starter: 0, pro: 0, enterprise: 0 };
    subs.forEach(function(s) { planCounts[s.plan_id] = (planCounts[s.plan_id] || 0) + 1; });

    var planPrices = { starter: 20, pro: 40, enterprise: 200 };
    var mrr = 0;
    Object.keys(planPrices).forEach(function(p) { mrr += (planCounts[p] || 0) * planPrices[p]; });

    var totalPaid = (planCounts.starter || 0) + (planCounts.pro || 0) + (planCounts.enterprise || 0);
    var arpu = totalPaid > 0 ? Math.round(mrr / totalPaid) : 0;

    // Churn: cancelled in last 30d / active last month
    var since = new Date(Date.now() - 30 * 86400000).toISOString();
    var churnRes = await sb.from('billing_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'customer.subscription.deleted')
      .gte('processed_at', since);

    var churned = churnRes.count || 0;
    var churnRate = subs.length > 0 ? ((churned / (subs.length + churned)) * 100).toFixed(1) : '0.0';

    setAdminText('as-mrr', '$' + mrr.toLocaleString());
    setAdminText('as-arr', '$' + (mrr * 12).toLocaleString());
    setAdminText('as-active-subs', subs.length.toLocaleString());
    setAdminText('as-churn-rate', churnRate + '%');
    setAdminText('as-arpu', '$' + arpu);

    // Plan breakdown
    var breakdownEl = document.getElementById('as-plan-breakdown');
    if (breakdownEl) {
      breakdownEl.innerHTML = ['starter', 'pro', 'enterprise', 'free'].map(function(plan) {
        var cnt = planCounts[plan] || 0;
        var rev = (planPrices[plan] || 0) * cnt;
        var pct = subs.length > 0 ? Math.round(cnt / subs.length * 100) : 0;
        var barColor = plan === 'pro' ? '#6b82a8' : plan === 'enterprise' ? '#e9a23b' : plan === 'starter' ? '#5b8a72' : '#8b929e';
        return '<div style="margin-bottom:12px">' +
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
            '<span style="font-size:13px;color:var(--text);text-transform:capitalize">' + plan + '</span>' +
            '<span style="font-size:13px;font-family:var(--mono);color:var(--text-dim)">' + cnt + ' · ' + (rev > 0 ? '$' + rev + '/mo' : '—') + '</span>' +
          '</div>' +
          '<div style="height:6px;border-radius:3px;background:var(--border)">' +
            '<div style="height:100%;border-radius:3px;background:' + barColor + ';width:' + pct + '%"></div>' +
          '</div>' +
          '</div>';
      }).join('');
    }

  } catch (err) {
    reportError('admin_subscription', err);
    console.error('[Admin] _loadSubMetrics error:', err);
    toastWarning('Subscription metrics unavailable');
  }
}

async function _loadSubNewTable() {
  var el = document.getElementById('as-new-subs-table');
  if (!el) return;
  try {
    var since = new Date(Date.now() - _subPeriodDays * 86400000).toISOString();
    var res = await sb.from('billing_events')
      .select('stripe_event_id,event_type,processed_at,payload')
      .in('event_type', ['customer.subscription.created', 'invoice.payment_succeeded'])
      .gte('processed_at', since)
      .order('processed_at', { ascending: false })
      .limit(50);

    var events = (res.data || []).filter(function(e) { return e.event_type === 'customer.subscription.created'; });

    if (!events.length) {
      el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No new subscriptions in this period</div>';
      return;
    }

    el.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
      '<table class="admin-table" style="width:100%">' +
      '<thead><tr><th>Date</th><th>Customer</th><th>Plan</th><th>Amount</th></tr></thead><tbody>' +
      events.slice(0, 20).map(function(ev) {
        var payload = ev.payload || {};
        var plan = payload.plan ? (payload.plan.id || payload.plan.nickname || '—') : (payload.metadata && payload.metadata.tier ? payload.metadata.tier : '—');
        var amount = payload.plan && payload.plan.amount ? '$' + (payload.plan.amount / 100).toFixed(2) + '/mo' : '—';
        var customer = payload.customer || '—';
        return '<tr>' +
          '<td style="font-size:12px;font-family:var(--mono)">' + new Date(ev.processed_at).toLocaleDateString() + '</td>' +
          '<td style="font-size:12px;font-family:var(--mono);color:var(--text-faint)">' + escapeHtml(String(customer).slice(0,20)) + '</td>' +
          '<td style="font-size:12px;text-transform:capitalize">' + escapeHtml(String(plan)) + '</td>' +
          '<td style="font-size:12px;color:var(--admin-green)">' + escapeHtml(String(amount)) + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

  } catch (err) {
    reportError('admin_subscription', err);
    console.error('[Admin] New subs table error:', err);
    el.innerHTML = '<div class="admin-red" style="font-size:13px">Failed to load new subscriptions</div>';
  }
}

async function _loadSubChurnTable() {
  var el = document.getElementById('as-churn-table');
  if (!el) return;
  try {
    var since = new Date(Date.now() - _subPeriodDays * 86400000).toISOString();
    var res = await sb.from('billing_events')
      .select('stripe_event_id,event_type,processed_at,payload')
      .in('event_type', ['customer.subscription.deleted', 'customer.subscription.updated'])
      .gte('processed_at', since)
      .order('processed_at', { ascending: false })
      .limit(30);

    var churnEvents = (res.data || []).filter(function(e) {
      return e.event_type === 'customer.subscription.deleted' ||
        (e.event_type === 'customer.subscription.updated' && e.payload && e.payload.cancel_at_period_end === true);
    });

    if (!churnEvents.length) {
      el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No churn events in this period</div>';
      return;
    }

    el.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
      '<table class="admin-table" style="width:100%">' +
      '<thead><tr><th>Date</th><th>Customer</th><th>Event</th></tr></thead><tbody>' +
      churnEvents.map(function(ev) {
        var payload = ev.payload || {};
        var eventLabel = ev.event_type === 'customer.subscription.deleted' ? 'Cancelled' : 'Cancel Scheduled';
        var labelColor = ev.event_type === 'customer.subscription.deleted' ? 'admin-red' : 'admin-amber';
        return '<tr>' +
          '<td style="font-size:12px;font-family:var(--mono)">' + new Date(ev.processed_at).toLocaleDateString() + '</td>' +
          '<td style="font-size:12px;font-family:var(--mono);color:var(--text-faint)">' + escapeHtml(String(payload.customer || '—').slice(0,20)) + '</td>' +
          '<td class="' + labelColor + '" style="font-size:12px">' + eventLabel + '</td>' +
          '</tr>';
      }).join('') +
      '</tbody></table></div>';

  } catch (err) {
    reportError('admin_subscription', err);
    console.error('[Admin] Churn table error:', err);
    el.innerHTML = '<div class="admin-red" style="font-size:13px">Failed to load churn data</div>';
  }
}

async function _loadSubMrrChart() {
  var el = document.getElementById('as-mrr-chart');
  if (!el || typeof echarts === 'undefined') return;
  var chart = echarts.init(el);

  try {
    // Build MRR by week from billing_events
    var since = new Date(Date.now() - 90 * 86400000).toISOString();
    var newRes = await sb.from('billing_events')
      .select('processed_at,payload')
      .in('event_type', ['customer.subscription.created', 'invoice.payment_succeeded'])
      .gte('processed_at', since)
      .order('processed_at', { ascending: true });

    if (!newRes.data || !newRes.data.length) {
      chart.setOption({ title: { text: 'MRR Trend', subtext: 'Revenue data will appear after launch', left: 'center', top: 'center', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, subtextStyle: { color: '#9ca3af', fontSize: 11 } } });
      return;
    }

    // Aggregate by week
    var weekMap = {};
    newRes.data.forEach(function(ev) {
      var wk = new Date(ev.processed_at).toISOString().slice(0, 10);
      var amount = 0;
      if (ev.payload && ev.payload.amount_paid) amount = ev.payload.amount_paid / 100;
      else if (ev.payload && ev.payload.plan && ev.payload.plan.amount) amount = ev.payload.plan.amount / 100;
      weekMap[wk] = (weekMap[wk] || 0) + amount;
    });

    var dates = Object.keys(weekMap).sort();
    var values = dates.map(function(d) { return weekMap[d]; });

    var t = typeof seoChartTheme === 'function' ? seoChartTheme() : {};
    chart.setOption(Object.assign({}, t, {
      title: { text: 'Revenue / Day (90d)', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 }, formatter: function(params) { return params[0].axisValue + '<br/>$' + Number(params[0].value).toFixed(2); } },
      grid: { top: 35, right: 16, bottom: 30, left: 50 },
      xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
      yAxis: { type: 'value', axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, formatter: function(v) { return '$' + v; } }, splitLine: { lineStyle: { color: '#e8eaef' } } },
      series: [{ type: 'bar', data: values, itemStyle: { color: '#6b82a8', borderRadius: [3,3,0,0] } }]
    }), true);
    window.addEventListener('resize', function() { chart.resize(); });

  } catch (err) {
    reportError('admin_subscription', err);
    console.error('[Admin] MRR chart error:', err);
    chart.setOption({ title: { text: 'MRR Trend', subtext: 'Chart error', left: 'center', top: 'center', textStyle: { color: '#d1d5db', fontSize: 13 } } });
  }
}

// CS-P1-004 FE-005: Register admin-subscription exports with BJ namespace
(function() {
  ['loadSubscriptionTab'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-subscription', registered: Date.now() };
    }
  });
})();
