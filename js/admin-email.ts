// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-email.js — Email Sub-page (Admin IA v2)
   v6.87 — S4: delivery funnel ECharts bar chart
   ─────────────────────────────────────────────────────────── */

function loadAdminEmail() {
  var panel = document.getElementById('admin-panel-email');
  if (!panel) return;

  panel.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint);font-size:13px;">Loading email data…</div>';

  sb.rpc('get_admin_email').then(function(res) {
    if (res.error) {
      panel.innerHTML = '<div style="color:var(--red);padding:20px;">Error: ' + res.error.message + '</div>';
      return;
    }
    renderEmailPage(panel, res.data);
  }).catch(function(e) {
    panel.innerHTML = '<div style="color:var(--red);padding:20px;">Failed to load: ' + e.message + '</div>';
  });
}

function renderEmailPage(panel, d) {
  var html = '';

  var statusMap = {};
  (d.by_status || []).forEach(function(s) { statusMap[s.status] = s.cnt; });
  var sent = statusMap['sent'] || 0;
  var delivered = statusMap['delivered'] || 0;
  var failed = statusMap['failed'] || 0;
  var blocked = statusMap['blocked'] || 0;

  html += '<div class="admin-stat-row">';
  html += _adminStatCard('Total Sent', fmtAdminNum(d.total_sent), '');
  html += _adminStatCard('Sent', fmtAdminNum(sent), '');
  html += _adminStatCard('Delivered', fmtAdminNum(delivered), d.total_sent ? Math.round((delivered / d.total_sent) * 100) + '%' : '');
  html += _adminStatCard('Failed', fmtAdminNum(failed), failed > 0 ? 'alert' : '');
  html += _adminStatCard('Blocked', fmtAdminNum(blocked), '');
  html += '</div>';

  // ── Delivery Funnel ECharts Chart ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Delivery Funnel</div>';
  html += '<div id="admin-email-funnel-chart" style="width:100%;height:200px;"></div>';
  html += '</div>';

  // ── Channel Split ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">By Channel</div>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;padding:8px 0;">';

  (d.by_channel || []).forEach(function(ch) {
    var pct = d.total_sent ? Math.round((ch.cnt / d.total_sent) * 100) : 0;
    var color = ch.channel === 'email' ? 'var(--accent)' : 'var(--warm)';
    html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px 20px;min-width:120px;text-align:center;">';
    html += '<div style="font-size:20px;font-weight:700;color:' + color + ';">' + fmtAdminNum(ch.cnt) + '</div>';
    html += '<div style="font-size:12px;color:var(--text-faint);text-transform:capitalize;">' + _escHtml(ch.channel) + ' (' + pct + '%)</div>';
    html += '</div>';
  });

  html += '</div></div>';

  // ── By Notification Type ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">By Notification Type</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Type</th><th style="text-align:right">Total</th><th style="text-align:right">Delivered</th><th style="text-align:right">Sent</th><th style="text-align:right">Failed</th><th style="text-align:right">Blocked</th>';
  html += '</tr></thead><tbody>';

  (d.by_type || []).forEach(function(t) {
    html += '<tr>';
    html += '<td style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(t.notification_type) + '</td>';
    html += '<td style="text-align:right">' + fmtAdminNum(t.cnt) + '</td>';
    html += '<td style="text-align:right;color:var(--green);">' + (t.delivered || 0) + '</td>';
    html += '<td style="text-align:right">' + (t.sent || 0) + '</td>';
    html += '<td style="text-align:right;' + (t.failed > 0 ? 'color:var(--red);font-weight:600;' : '') + '">' + (t.failed || 0) + '</td>';
    html += '<td style="text-align:right;' + (t.blocked > 0 ? 'color:var(--warm);' : '') + '">' + (t.blocked || 0) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  // ── Recent Sends ──
  html += '<div class="admin-block" style="margin-top:16px;">';
  html += '<div class="admin-block-title">Recent Sends</div>';
  html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
  html += '<th>Type</th><th>Channel</th><th>Status</th><th>Time</th>';
  html += '</tr></thead><tbody>';

  (d.recent_sends || []).forEach(function(r) {
    var statusColor = r.status === 'delivered' ? 'var(--green)' :
                      r.status === 'failed' ? 'var(--red)' :
                      r.status === 'blocked' ? 'var(--warm)' : 'var(--text)';
    html += '<tr>';
    html += '<td style="font-family:var(--font-mono);font-size:12px;">' + _escHtml(r.notification_type) + '</td>';
    html += '<td style="text-transform:capitalize;">' + _escHtml(r.channel) + '</td>';
    html += '<td style="color:' + statusColor + ';font-weight:600;text-transform:capitalize;">' + _escHtml(r.status) + '</td>';
    html += '<td style="color:var(--text-faint);font-size:12px;">' + _timeAgo(r.created_at) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';

  panel.innerHTML = html;

  // Render delivery funnel chart
  _renderEmailFunnelChart({ sent: sent, delivered: delivered, failed: failed, blocked: blocked, total: d.total_sent });
}

function _renderEmailFunnelChart(data) {
  if (typeof echarts === 'undefined') return;
  var el = document.getElementById('admin-email-funnel-chart');
  if (!el) return;
  var chart = echarts.init(el, null, { renderer: 'svg' });

  var stages = [
    { name: 'Total Sent', value: data.total, color: 'var(--accent)' },
    { name: 'Sent', value: data.sent, color: '#6366f1' },
    { name: 'Delivered', value: data.delivered, color: 'var(--green)' },
    { name: 'Failed', value: data.failed, color: 'var(--red)' },
    { name: 'Blocked', value: data.blocked, color: 'var(--warm)' }
  ];

  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'none' },
      backgroundColor: 'var(--bg-card)',
      borderColor: 'var(--border)',
      textStyle: { color: 'var(--text)', fontSize: 12 },
      formatter: function(params) {
        return params[0].name + ': <b>' + params[0].value.toLocaleString() + '</b>';
      }
    },
    grid: { top: 8, right: 16, bottom: 40, left: 80 },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'var(--border)', type: 'dashed' } },
      axisLabel: { color: 'var(--text-faint)', fontSize: 11, formatter: function(v) { return v >= 1000 ? Math.round(v/1000) + 'K' : v; } }
    },
    yAxis: {
      type: 'category',
      data: stages.map(function(s) { return s.name; }),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: 'var(--text-faint)', fontSize: 11 }
    },
    series: [{
      type: 'bar',
      data: stages.map(function(s) {
        return { value: s.value, itemStyle: { color: s.color, borderRadius: [0, 4, 4, 0] } };
      }),
      label: {
        show: true,
        position: 'right',
        color: 'var(--text-faint)',
        fontSize: 11,
        formatter: function(params) { return params.value.toLocaleString(); }
      },
      barMaxWidth: 28
    }]
  });

  window.addEventListener('resize', function() { chart.resize(); });
}
