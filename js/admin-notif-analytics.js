// ═══════════════════════════════════════════════════════════
// admin-notif-analytics.js — Notification Analytics, Email Cohorts,
//                             Cadence Optimization, Notification Log
// Admin IA v2 · Session 9 · v6.93
// ═══════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────
// NOTIF ANALYTICS — send/open/click funnel + channel breakdown
// ─────────────────────────────────────────────────────────

var _nafPeriod = 30;

async function loadNotifAnalyticsTab(periodDays) {
  console.log('[Admin] loadNotifAnalyticsTab');
  _nafPeriod = periodDays || _nafPeriod || 30;
  var el = document.getElementById('admin-panel-notif-analytics');
  if (!el) return;

  el.innerHTML = [
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;padding:20px 20px 0">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Notification Analytics</h3>',
      '<div style="display:flex;gap:4px">',
        [7,30,90].map(function(d) {
          return '<button onclick="loadNotifAnalyticsTab(' + d + ')" style="padding:5px 12px;border:1px solid var(--border);border-radius:5px;background:' +
            (d === _nafPeriod ? 'var(--accent)' : 'var(--bg-card)') + ';color:' +
            (d === _nafPeriod ? '#fff' : 'var(--text-dim)') + ';font-size:12px;font-family:var(--mono);cursor:pointer">' + d + 'd</button>';
        }).join(''),
      '</div>',
    '</div>',
    '<div style="padding:0 20px 20px">',

    // Stat cards
    '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">',
      _nafCard('naf-sent', 'Sent'),
      _nafCard('naf-delivered', 'Delivered'),
      _nafCard('naf-opened', 'Opened'),
      _nafCard('naf-clicked', 'Clicked'),
      _nafCard('naf-unsub', 'Unsubscribed'),
    '</div>',

    // Funnel chart + channel breakdown side by side
    '<div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;margin-bottom:24px">',
      '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
        '<div id="naf-funnel-chart" style="height:200px"></div>',
      '</div>',
      '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
        '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Channel Breakdown</div>',
        '<div id="naf-channel-rows"></div>',
      '</div>',
    '</div>',

    // Top types table
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px;margin-bottom:16px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Top Notification Types — Last <span id="naf-period-label">' + _nafPeriod + '</span>d</div>',
      '<div id="naf-types-table"><div style="color:var(--text-faint);font-size:13px">Loading…</div></div>',
    '</div>',

    // Volume trend chart
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
      '<div id="naf-volume-chart" style="height:180px"></div>',
    '</div>',

    '</div>'
  ].join('');

  await _loadNotifAnalyticsData();
}
window.loadNotifAnalyticsTab = loadNotifAnalyticsTab;

function _nafCard(id, label) {
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:14px">' +
    '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div id="' + id + '" style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono)">—</div>' +
    '</div>';
}

async function _loadNotifAnalyticsData() {
  try {
    var since = new Date(Date.now() - _nafPeriod * 86400000).toISOString();

    // Load from notification_log
    var res = await sb.from('notification_log')
      .select('channel,status,notification_type,created_at')
      .gte('created_at', since);

    var rows = res.data || [];

    var sent = rows.length;
    var delivered = rows.filter(function(r) { return r.status !== 'failed' && r.status !== 'bounced'; }).length;
    var opened = rows.filter(function(r) { return r.status === 'opened' || r.status === 'clicked'; }).length;
    var clicked = rows.filter(function(r) { return r.status === 'clicked'; }).length;
    var unsub = rows.filter(function(r) { return r.status === 'unsubscribed'; }).length;

    setAdminText('naf-sent', fmtAdminNum(sent));
    setAdminText('naf-delivered', fmtAdminNum(delivered));
    setAdminText('naf-opened', fmtAdminNum(opened));
    setAdminText('naf-clicked', fmtAdminNum(clicked));
    setAdminText('naf-unsub', fmtAdminNum(unsub));
    setAdminText('naf-period-label', _nafPeriod);

    // Channel breakdown
    var channelMap = {};
    rows.forEach(function(r) {
      var ch = r.channel || 'unknown';
      if (!channelMap[ch]) channelMap[ch] = { sent: 0, opened: 0, clicked: 0 };
      channelMap[ch].sent++;
      if (r.status === 'opened' || r.status === 'clicked') channelMap[ch].opened++;
      if (r.status === 'clicked') channelMap[ch].clicked++;
    });

    var channelEl = document.getElementById('naf-channel-rows');
    if (channelEl) {
      var chKeys = Object.keys(channelMap).sort(function(a,b) { return channelMap[b].sent - channelMap[a].sent; });
      if (chKeys.length === 0) {
        channelEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No data in this period</div>';
      } else {
        channelEl.innerHTML = chKeys.map(function(ch) {
          var c = channelMap[ch];
          var openRate = c.sent > 0 ? Math.round(c.opened / c.sent * 100) : 0;
          var clickRate = c.sent > 0 ? Math.round(c.clicked / c.sent * 100) : 0;
          var chIcon = ch === 'email' ? '✉' : ch === 'sms' ? '💬' : ch === 'push' ? '🔔' : '📢';
          return '<div style="margin-bottom:14px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
              '<span style="font-size:13px;color:var(--text)">' + chIcon + ' ' + ch.charAt(0).toUpperCase() + ch.slice(1) + '</span>' +
              '<span style="font-size:12px;font-family:var(--mono);color:var(--text-dim)">' + fmtAdminNum(c.sent) + ' sent</span>' +
            '</div>' +
            '<div style="display:flex;gap:12px;font-size:11px;color:var(--text-faint);margin-bottom:6px">' +
              '<span>Open: <span style="color:var(--text)">' + openRate + '%</span></span>' +
              '<span>Click: <span style="color:var(--text)">' + clickRate + '%</span></span>' +
            '</div>' +
            '<div style="height:4px;border-radius:2px;background:var(--border)">' +
              '<div style="height:100%;border-radius:2px;background:var(--accent);width:' + openRate + '%"></div>' +
            '</div>' +
            '</div>';
        }).join('');
      }
    }

    // Top types table
    var typeMap = {};
    rows.forEach(function(r) {
      var t = r.notification_type || 'unknown';
      if (!typeMap[t]) typeMap[t] = { sent: 0, opened: 0, clicked: 0 };
      typeMap[t].sent++;
      if (r.status === 'opened' || r.status === 'clicked') typeMap[t].opened++;
      if (r.status === 'clicked') typeMap[t].clicked++;
    });

    var typesEl = document.getElementById('naf-types-table');
    if (typesEl) {
      var typeKeys = Object.keys(typeMap).sort(function(a,b) { return typeMap[b].sent - typeMap[a].sent; }).slice(0, 20);
      if (typeKeys.length === 0) {
        typesEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No notification data in this period</div>';
      } else {
        typesEl.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
          '<table class="admin-table" style="width:100%">' +
          '<thead><tr><th>Type</th><th>Sent</th><th>Open Rate</th><th>Click Rate</th></tr></thead><tbody>' +
          typeKeys.map(function(t) {
            var c = typeMap[t];
            var or = c.sent > 0 ? Math.round(c.opened / c.sent * 100) : 0;
            var cr = c.sent > 0 ? Math.round(c.clicked / c.sent * 100) : 0;
            var orColor = or >= 30 ? 'admin-green' : or >= 15 ? '' : 'admin-red';
            return '<tr>' +
              '<td style="font-family:var(--mono);font-size:12px">' + escapeHtml(t) + '</td>' +
              '<td style="font-size:12px">' + fmtAdminNum(c.sent) + '</td>' +
              '<td class="' + orColor + '" style="font-size:12px">' + or + '%</td>' +
              '<td style="font-size:12px;color:var(--text-faint)">' + cr + '%</td>' +
              '</tr>';
          }).join('') +
          '</tbody></table></div>';
      }
    }

    // Volume trend chart
    var volEl = document.getElementById('naf-volume-chart');
    if (volEl && typeof echarts !== 'undefined') {
      var dayMap = {};
      rows.forEach(function(r) {
        var d = new Date(r.created_at).toISOString().slice(0,10);
        dayMap[d] = (dayMap[d] || 0) + 1;
      });
      var dates = Object.keys(dayMap).sort();
      var counts = dates.map(function(d) { return dayMap[d]; });
      var volChart = echarts.init(volEl);
      var t = typeof seoChartTheme === 'function' ? seoChartTheme() : {};
      volChart.setOption(Object.assign({}, t, {
        title: { text: 'Notifications Sent / Day', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        grid: { top: 35, right: 16, bottom: 30, left: 50 },
        xAxis: { type: 'category', data: dates, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: [{ type: 'bar', data: counts, itemStyle: { color: '#6b82a8', borderRadius: [3,3,0,0] } }]
      }), true);

      // Funnel chart
      var funnelEl = document.getElementById('naf-funnel-chart');
      if (funnelEl) {
        var fChart = echarts.init(funnelEl);
        var funnelMax = Math.max(sent, 1);
        fChart.setOption(Object.assign({}, t, {
          title: { text: 'Delivery Funnel', textStyle: { color: '#6b7280', fontSize: 13, fontWeight: 600, fontFamily: 'Outfit' }, left: 4, top: 4 },
          tooltip: { trigger: 'item', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 },
            formatter: function(p) { return p.name + ': ' + fmtAdminNum(p.value) + ' (' + (funnelMax > 0 ? Math.round(p.value/funnelMax*100) : 0) + '%)'; } },
          series: [{
            type: 'funnel',
            left: '10%', width: '80%', top: 30, bottom: 10,
            min: 0, max: funnelMax,
            minSize: '10%', maxSize: '100%',
            sort: 'descending',
            gap: 4,
            label: { show: true, position: 'inside', fontSize: 12, fontFamily: 'Outfit', color: '#fff',
              formatter: function(p) { return p.name + '\n' + fmtAdminNum(p.value); } },
            data: [
              { name: 'Sent', value: sent, itemStyle: { color: '#6b82a8' } },
              { name: 'Delivered', value: delivered, itemStyle: { color: '#5b8a72' } },
              { name: 'Opened', value: opened, itemStyle: { color: '#a08858' } },
              { name: 'Clicked', value: clicked, itemStyle: { color: '#8878a0' } }
            ]
          }]
        }), true);
        window.addEventListener('resize', function() { fChart.resize(); volChart.resize(); });
      }
    }

  } catch (err) {
    reportError('admin_notif_analytics', err);
    console.error('[Admin] loadNotifAnalyticsData error:', err);
    toastWarning('Notification analytics unavailable — notification_log table may be empty');
    var el = document.getElementById('naf-types-table');
    if (el) el.innerHTML = '<div class="admin-red" style="font-size:13px">Error: ' + escapeHtml(err.message || '') + '</div>';
  }
}


// ─────────────────────────────────────────────────────────
// EMAIL COHORTS — per-cohort email send stats + engagement
// ─────────────────────────────────────────────────────────

async function loadEmailCohortsTab() {
  console.log('[Admin] loadEmailCohortsTab');
  var el = document.getElementById('admin-panel-email-cohorts');
  if (!el) return;

  el.innerHTML = [
    '<div style="padding:20px">',
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Email Cohort Analytics</h3>',
      '<a href="https://resend.com/emails" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none;font-family:var(--mono)">↗ Resend Dashboard</a>',
    '</div>',

    // Cohort email summary table
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px;margin-bottom:20px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Email Performance by Cohort (All Time)</div>',
      '<div id="ec-cohort-table"><div style="color:var(--text-faint);font-size:13px">Loading…</div></div>',
    '</div>',

    // Opt-in stats
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">',
      _ecStatCard('ec-total-opted-in', 'Opted In'),
      _ecStatCard('ec-opted-in-pct', 'Opt-in Rate'),
      _ecStatCard('ec-unsub-total', 'Unsubscribed'),
      _ecStatCard('ec-resend-sends', 'Total Sends (30d)'),
    '</div>',

    // Recent sends log
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Recent Emails (30d)</div>',
      '<div id="ec-recent-log"><div style="color:var(--text-faint);font-size:13px">Loading…</div></div>',
    '</div>',
    '</div>'
  ].join('');

  await _loadEmailCohortsData();
}
window.loadEmailCohortsTab = loadEmailCohortsTab;

function _ecStatCard(id, label) {
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:14px">' +
    '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div id="' + id + '" style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono)">—</div>' +
    '</div>';
}

async function _loadEmailCohortsData() {
  try {
    // Cohort overview
    var cohortsRes = await sb.from('cohorts').select('id,display_id,name,is_active').eq('is_active', true).order('created_at');
    var cohorts = cohortsRes.data || [];

    // Profile email opt-in counts
    var profRes = await sb.from('profiles').select('cohort_id,email_opted_in');
    var profiles = profRes.data || [];

    var totalUsers = profiles.length;
    var totalOptedIn = profiles.filter(function(p) { return p.email_opted_in; }).length;
    var totalUnsub = profiles.filter(function(p) { return p.email_opted_in === false; }).length;

    setAdminText('ec-total-opted-in', fmtAdminNum(totalOptedIn));
    setAdminText('ec-opted-in-pct', totalUsers > 0 ? Math.round(totalOptedIn/totalUsers*100) + '%' : '—');
    setAdminText('ec-unsub-total', fmtAdminNum(totalUnsub));

    // Recent email sends from notification_log
    var since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    var logRes = await sb.from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('channel', 'email')
      .gte('created_at', since30);
    setAdminText('ec-resend-sends', fmtAdminNum(logRes.count || 0));

    // Per-cohort breakdown
    var cohortMap = {};
    profiles.forEach(function(p) {
      var cid = p.cohort_id || 'unassigned';
      if (!cohortMap[cid]) cohortMap[cid] = { total: 0, opted: 0 };
      cohortMap[cid].total++;
      if (p.email_opted_in) cohortMap[cid].opted++;
    });

    var tblEl = document.getElementById('ec-cohort-table');
    if (tblEl) {
      if (cohorts.length === 0) {
        tblEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No active cohorts found</div>';
      } else {
        tblEl.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
          '<table class="admin-table" style="width:100%">' +
          '<thead><tr><th>Cohort</th><th>Users</th><th>Opted In</th><th>Opt-in Rate</th><th>Status</th></tr></thead><tbody>' +
          cohorts.map(function(c) {
            var cm = cohortMap[c.id] || { total: 0, opted: 0 };
            var rate = cm.total > 0 ? Math.round(cm.opted/cm.total*100) : 0;
            var rateColor = rate >= 60 ? 'admin-green' : rate >= 30 ? '' : 'admin-red';
            return '<tr>' +
              '<td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + escapeHtml(c.display_id || c.id) + '</td>' +
              '<td style="font-size:12px">' + fmtAdminNum(cm.total) + '</td>' +
              '<td style="font-size:12px">' + fmtAdminNum(cm.opted) + '</td>' +
              '<td class="' + rateColor + '" style="font-size:12px">' + rate + '%</td>' +
              '<td><span class="admin-green" style="font-size:11px">● Active</span></td>' +
              '</tr>';
          }).join('') +
          '</tbody></table></div>';
      }
    }

    // Recent log
    var recentRes = await sb.from('notification_log')
      .select('notification_type,channel,status,created_at,user_id')
      .eq('channel', 'email')
      .gte('created_at', since30)
      .order('created_at', { ascending: false })
      .limit(25);

    var logEl = document.getElementById('ec-recent-log');
    if (logEl) {
      var logRows = recentRes.data || [];
      if (logRows.length === 0) {
        logEl.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No emails sent in the last 30 days</div>';
      } else {
        logEl.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
          '<table class="admin-table" style="width:100%">' +
          '<thead><tr><th>Date</th><th>Type</th><th>Status</th><th>User</th></tr></thead><tbody>' +
          logRows.map(function(r) {
            var sc = r.status === 'delivered' || r.status === 'opened' || r.status === 'clicked' ? 'admin-green' :
                     r.status === 'failed' || r.status === 'bounced' ? 'admin-red' : '';
            return '<tr>' +
              '<td style="font-size:11px;font-family:var(--mono)">' + new Date(r.created_at).toLocaleDateString() + '</td>' +
              '<td style="font-size:12px">' + escapeHtml(r.notification_type || '—') + '</td>' +
              '<td class="' + sc + '" style="font-size:12px">' + (r.status || '—') + '</td>' +
              '<td style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + (r.user_id ? r.user_id.slice(0,8) + '…' : '—') + '</td>' +
              '</tr>';
          }).join('') +
          '</tbody></table></div>';
      }
    }

  } catch (err) {
    reportError('admin_notif_analytics', err);
    console.error('[Admin] _loadEmailCohortsData error:', err);
    toastWarning('Email cohort data unavailable');
  }
}


// ─────────────────────────────────────────────────────────
// CADENCE — per-type frequency config + opt-out rates
// ─────────────────────────────────────────────────────────

async function loadCadenceTab() {
  console.log('[Admin] loadCadenceTab');
  var el = document.getElementById('admin-panel-cadence');
  if (!el) return;

  el.innerHTML = [
    '<div style="padding:20px">',
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Cadence Optimization</h3>',
      '<button onclick="loadCadenceTab()" style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px;font-family:var(--mono);cursor:pointer">↻ Refresh</button>',
    '</div>',

    // Summary cards
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">',
      _cadCard('cad-total-configs', 'Total Configs'),
      _cadCard('cad-enabled', 'Enabled'),
      _cadCard('cad-channels-active', 'Active Channels'),
      _cadCard('cad-freq-capped', 'Freq Capped'),
    '</div>',

    // Config table with edit inline
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px;margin-bottom:16px">',
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
        '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px">Notification Configs</div>',
        '<div style="display:flex;gap:8px">',
          '<select id="cad-cat-filter" onchange="filterCadenceTable()" style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:12px">',
            '<option value="all">All Categories</option>',
            Object.keys(NOTIF_CATEGORIES || {}).map(function(k) {
              return '<option value="' + k + '">' + ((NOTIF_CATEGORIES || {})[k] || {}).label + '</option>';
            }).join(''),
          '</select>',
          '<input id="cad-search" type="text" placeholder="Search type…" oninput="filterCadenceTable()"' +
            ' style="padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:12px;width:160px">',
        '</div>',
      '</div>',
      '<div id="cad-config-table"><div style="color:var(--text-faint);font-size:13px">Loading…</div></div>',
    '</div>',

    // Opt-out rate by category
    '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:16px">',
      '<div style="font-size:12px;color:var(--text-dim);font-family:var(--mono);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px">Send Volume by Category</div>',
      '<div id="cad-category-chart" style="height:200px"></div>',
    '</div>',
    '</div>'
  ].join('');

  await _loadCadenceData();
}
window.loadCadenceTab = loadCadenceTab;

function _cadCard(id, label) {
  return '<div style="border:1px solid var(--border);border-radius:8px;background:var(--bg-card);padding:14px">' +
    '<div style="font-size:11px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">' + label + '</div>' +
    '<div id="' + id + '" style="font-size:22px;font-weight:700;color:var(--text);font-family:var(--mono)">—</div>' +
    '</div>';
}

var _cadenceConfigs = [];

async function _loadCadenceData() {
  try {
    var res = await sb.from('admin_notification_config').select('*').order('notification_type');
    _cadenceConfigs = res.data || [];

    var enabled = _cadenceConfigs.filter(function(c) { return c.enabled; }).length;
    var channels = {};
    _cadenceConfigs.forEach(function(c) { if (c.channel) channels[c.channel] = true; });
    var freqCapped = _cadenceConfigs.filter(function(c) { return c.frequency_cap && c.frequency_cap > 0; }).length;

    setAdminText('cad-total-configs', fmtAdminNum(_cadenceConfigs.length));
    setAdminText('cad-enabled', fmtAdminNum(enabled));
    setAdminText('cad-channels-active', fmtAdminNum(Object.keys(channels).length));
    setAdminText('cad-freq-capped', fmtAdminNum(freqCapped));

    _renderCadenceTable(_cadenceConfigs);

    // Category chart
    var catVol = {};
    var since30 = new Date(Date.now() - 30 * 86400000).toISOString();
    var logRes = await sb.from('notification_log')
      .select('notification_type')
      .gte('created_at', since30);

    (logRes.data || []).forEach(function(r) {
      var t = r.notification_type || 'unknown';
      var cat = 'other';
      if (NOTIF_CATEGORIES) {
        Object.keys(NOTIF_CATEGORIES).forEach(function(k) {
          if ((NOTIF_CATEGORIES[k].types || []).indexOf(t) >= 0) cat = k;
        });
      }
      catVol[cat] = (catVol[cat] || 0) + 1;
    });

    var catEl = document.getElementById('cad-category-chart');
    if (catEl && typeof echarts !== 'undefined' && Object.keys(catVol).length > 0) {
      var chart = echarts.init(catEl);
      var cats = Object.keys(catVol).sort(function(a,b) { return catVol[b] - catVol[a]; });
      var t = typeof seoChartTheme === 'function' ? seoChartTheme() : {};
      chart.setOption(Object.assign({}, t, {
        tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,0.95)', borderColor: 'hsl(228,16%,85%)', textStyle: { color: '#e8eaf0', fontFamily: 'Outfit', fontSize: 12 } },
        grid: { top: 10, right: 20, bottom: 60, left: 50 },
        xAxis: { type: 'category', data: cats, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10, rotate: 35 } },
        yAxis: { type: 'value', minInterval: 1, axisLabel: { color: '#7b829a', fontFamily: 'JetBrains Mono', fontSize: 10 }, splitLine: { lineStyle: { color: '#e8eaef' } } },
        series: [{ type: 'bar', data: cats.map(function(c) { return catVol[c]; }), itemStyle: { color: '#6b82a8', borderRadius: [3,3,0,0] } }]
      }), true);
      window.addEventListener('resize', function() { chart.resize(); });
    } else if (catEl) {
      catEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:13px">No send data in last 30 days</div>';
    }

  } catch (err) {
    reportError('admin_notif_analytics', err);
    console.error('[Admin] _loadCadenceData error:', err);
    toastWarning('Cadence data unavailable');
  }
}

function _renderCadenceTable(configs) {
  var el = document.getElementById('cad-config-table');
  if (!el) return;
  if (configs.length === 0) {
    el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No configs match filter</div>';
    return;
  }
  el.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-height:420px;overflow-y:auto">' +
    '<table class="admin-table" style="width:100%">' +
    '<thead><tr><th>Type</th><th>Enabled</th><th>Channel</th><th>Cadence</th><th>Freq Cap</th><th>Cohort</th></tr></thead><tbody>' +
    configs.map(function(c) {
      var enabledBadge = c.enabled ?
        '<span class="admin-green" style="font-size:11px">● on</span>' :
        '<span class="admin-red" style="font-size:11px">● off</span>';
      return '<tr>' +
        '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(c.notification_type || '—') + '</td>' +
        '<td>' + enabledBadge + '</td>' +
        '<td style="font-size:12px">' + escapeHtml(c.channel || '—') + '</td>' +
        '<td style="font-size:12px;font-family:var(--mono)">' + escapeHtml(c.cadence || '—') + '</td>' +
        '<td style="font-size:12px;font-family:var(--mono)">' + (c.frequency_cap != null ? c.frequency_cap + '/d' : '—') + '</td>' +
        '<td style="font-size:12px;color:var(--text-faint)">' + escapeHtml(c.cohort_id || 'all') + '</td>' +
        '</tr>';
    }).join('') +
    '</tbody></table></div>';
}

function filterCadenceTable() {
  var cat = (document.getElementById('cad-cat-filter') || {}).value || 'all';
  var q = ((document.getElementById('cad-search') || {}).value || '').toLowerCase();
  var filtered = _cadenceConfigs.filter(function(c) {
    var matchCat = cat === 'all' || (NOTIF_CATEGORIES && NOTIF_CATEGORIES[cat] && (NOTIF_CATEGORIES[cat].types || []).indexOf(c.notification_type) >= 0);
    var matchQ = !q || (c.notification_type || '').toLowerCase().indexOf(q) >= 0;
    return matchCat && matchQ;
  });
  _renderCadenceTable(filtered);
}
window.filterCadenceTable = filterCadenceTable;


// ─────────────────────────────────────────────────────────
// NOTIF LOG — live notification_log viewer with filters
// ─────────────────────────────────────────────────────────

var _notifLogPage = 0;
var _notifLogFilters = { channel: 'all', status: 'all', type: '' };
var _notifLogPageSize = 50;

async function loadNotifLogTab() {
  console.log('[Admin] loadNotifLogTab');
  _notifLogPage = 0;
  var el = document.getElementById('admin-panel-notif-log');
  if (!el) return;

  el.innerHTML = [
    '<div style="padding:20px">',
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">',
      '<h3 style="font-size:15px;font-weight:600;color:var(--text);margin:0">Notification Log</h3>',
      '<button onclick="_notifLogPage=0;_fetchNotifLog()" style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px;font-family:var(--mono);cursor:pointer">↻ Refresh</button>',
    '</div>',

    // Filters
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">',
      '<select id="nl-channel" onchange="_notifLogPage=0;_notifLogFilters.channel=this.value;_fetchNotifLog()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px">',
        '<option value="all">All Channels</option>',
        '<option value="email">Email</option>',
        '<option value="sms">SMS</option>',
        '<option value="push">Push</option>',
        '<option value="in_app">In-App</option>',
      '</select>',
      '<select id="nl-status" onchange="_notifLogPage=0;_notifLogFilters.status=this.value;_fetchNotifLog()" style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px">',
        '<option value="all">All Statuses</option>',
        '<option value="sent">Sent</option>',
        '<option value="delivered">Delivered</option>',
        '<option value="opened">Opened</option>',
        '<option value="clicked">Clicked</option>',
        '<option value="failed">Failed</option>',
        '<option value="bounced">Bounced</option>',
        '<option value="unsubscribed">Unsubscribed</option>',
      '</select>',
      '<input id="nl-type-search" type="text" placeholder="Filter by type…" oninput="_notifLogPage=0;_notifLogFilters.type=this.value;_fetchNotifLog()"' +
        ' style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;width:180px">',
      '<span id="nl-count" style="font-size:12px;color:var(--text-faint);align-self:center;font-family:var(--mono)"></span>',
    '</div>',

    '<div id="nl-table"><div style="color:var(--text-faint);font-size:13px">Loading…</div></div>',
    '<div id="nl-pagination" style="display:flex;gap:8px;margin-top:12px;align-items:center"></div>',
    '</div>'
  ].join('');

  await _fetchNotifLog();
}
window.loadNotifLogTab = loadNotifLogTab;

async function _fetchNotifLog() {
  var el = document.getElementById('nl-table');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">Loading…</div>';

  try {
    var f = _notifLogFilters;
    var from = _notifLogPage * _notifLogPageSize;
    var to = from + _notifLogPageSize - 1;

    var q = sb.from('notification_log')
      .select('id,user_id,notification_type,channel,status,created_at,subject,error_message', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (f.channel !== 'all') q = q.eq('channel', f.channel);
    if (f.status !== 'all') q = q.eq('status', f.status);
    if (f.type) q = q.ilike('notification_type', '%' + f.type + '%');

    var res = await q;
    var rows = res.data || [];
    var total = res.count || 0;

    setAdminText('nl-count', fmtAdminNum(total) + ' records');

    if (rows.length === 0) {
      el.innerHTML = '<div style="color:var(--text-faint);font-size:13px">No notifications match current filters</div>';
    } else {
      el.innerHTML = '<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden">' +
        '<table class="admin-table" style="width:100%">' +
        '<thead><tr><th>Time</th><th>Type</th><th>Channel</th><th>Status</th><th>User</th><th>Subject / Error</th></tr></thead><tbody>' +
        rows.map(function(r) {
          var sc = (r.status === 'delivered' || r.status === 'opened' || r.status === 'clicked') ? 'admin-green' :
                   (r.status === 'failed' || r.status === 'bounced') ? 'admin-red' :
                   r.status === 'unsubscribed' ? 'admin-amber' : '';
          var detail = r.error_message ? '<span class="admin-red" title="' + escapeHtml(r.error_message) + '">⚠ ' + escapeHtml(r.error_message.slice(0,40)) + '…</span>'
                      : (r.subject ? escapeHtml(r.subject.slice(0,50)) : '—');
          var chIcon = r.channel === 'email' ? '✉' : r.channel === 'sms' ? '💬' : r.channel === 'push' ? '🔔' : '📢';
          return '<tr>' +
            '<td style="font-size:11px;font-family:var(--mono);white-space:nowrap">' + new Date(r.created_at).toLocaleString() + '</td>' +
            '<td style="font-size:11px;font-family:var(--mono)">' + escapeHtml(r.notification_type || '—') + '</td>' +
            '<td style="font-size:12px">' + chIcon + ' ' + (r.channel || '—') + '</td>' +
            '<td class="' + sc + '" style="font-size:12px">' + (r.status || '—') + '</td>' +
            '<td style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + (r.user_id ? r.user_id.slice(0,8) + '…' : '—') + '</td>' +
            '<td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis">' + detail + '</td>' +
            '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    // Pagination
    var totalPages = Math.ceil(total / _notifLogPageSize);
    var pagEl = document.getElementById('nl-pagination');
    if (pagEl) {
      pagEl.innerHTML = '';
      if (totalPages > 1) {
        var prevBtn = document.createElement('button');
        prevBtn.textContent = '← Prev';
        prevBtn.disabled = _notifLogPage === 0;
        prevBtn.style.cssText = 'padding:5px 12px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);font-size:12px;cursor:pointer';
        prevBtn.onclick = function() { _notifLogPage--; _fetchNotifLog(); };
        pagEl.appendChild(prevBtn);

        var pageInfo = document.createElement('span');
        pageInfo.style.cssText = 'font-size:12px;color:var(--text-faint);font-family:var(--mono);padding:0 8px';
        pageInfo.textContent = 'Page ' + (_notifLogPage + 1) + ' of ' + totalPages;
        pagEl.appendChild(pageInfo);

        var nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = _notifLogPage >= totalPages - 1;
        nextBtn.style.cssText = 'padding:5px 12px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);font-size:12px;cursor:pointer';
        nextBtn.onclick = function() { _notifLogPage++; _fetchNotifLog(); };
        pagEl.appendChild(nextBtn);
      }
    }

  } catch (err) {
    reportError('admin_notif_analytics', err);
    console.error('[Admin] _fetchNotifLog error:', err);
    if (el) el.innerHTML = '<div class="admin-red" style="font-size:13px">Error loading notification log: ' + escapeHtml(err.message || '') + '</div>';
  }
}
window._fetchNotifLog = _fetchNotifLog;

// CS-P1-004 FE-005: Register admin-notif-analytics exports with BJ namespace
(function() {
  ['_fetchNotifLog','filterCadenceTable','loadCadenceTab','loadEmailCohortsTab','loadNotifAnalyticsTab','loadNotifLogTab'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-notif-analytics', registered: Date.now() };
    }
  });
})();
