// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-signals.js — Pipeline Signals + Signal Patterns
   Admin IA v2 · Session 5 (v6.88)
   ─────────────────────────────────────────────────────────── */

var _signalsState = { loaded: false, data: null };

async function loadAdminSignals() {
  var container = document.getElementById('admin-panel-signals');
  if (!container) return;
  if (_signalsState.loaded && _signalsState.data) {
    renderSignalsPanel(container, _signalsState.data);
    return;
  }
  container.innerHTML = '<div class="admin-loading">Loading signals…</div>';
  try {
    var { data, error } = await sb.rpc('get_admin_signals');
    if (error) throw error;
    _signalsState.data = data;
    _signalsState.loaded = true;
    renderSignalsPanel(container, data);
  } catch (e) {
    container.innerHTML = '<div class="admin-error">Failed to load signals: ' + _escHtml(e.message || String(e)) + '</div>';
  }
}

function renderSignalsPanel(container, d) {
  var ps = d.pipeline_signals || {};
  var alertsHtml = '';

  // ── Stat cards ──
  var statCards = [
    { label: 'Total Signals',     value: (ps.total || 0).toLocaleString(),                            sub: 'all time' },
    { label: 'Pending',           value: (ps.pending || 0).toLocaleString(),                          sub: 'awaiting user', accent: ps.pending > 0 },
    { label: 'Accepted',          value: (ps.accepted || 0).toLocaleString(),                         sub: 'confirmed' },
    { label: 'Avg Confidence',    value: ps.avg_confidence != null ? (ps.avg_confidence * 100).toFixed(1) + '%' : '—', sub: 'across signals' },
    { label: 'Last 7 Days',       value: (ps.last_7d || 0).toLocaleString(),                          sub: 'new signals' },
  ];
  var statRow = '<div class="admin-stat-row">' + statCards.map(function(c) {
    return '<div class="admin-stat-card' + (c.accent ? ' admin-stat-card--alert' : '') + '">'
      + '<div class="asc-label">' + c.label + '</div>'
      + '<div class="asc-value">' + c.value + '</div>'
      + '<div class="asc-sub">' + c.sub + '</div>'
      + '</div>';
  }).join('') + '</div>';

  // ── Zero-state if no signals yet ──
  if (!ps.total || ps.total === 0) {
    container.innerHTML = statRow
      + '<div class="admin-block" style="margin-top:20px;text-align:center;padding:40px 20px;color:var(--text-dim)">'
      + '<div style="font-size:32px;margin-bottom:12px">📡</div>'
      + '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px">No pipeline signals yet</div>'
      + '<div style="font-size:12px">Signals are generated when Gmail or Calendar integrations detect application status changes.</div>'
      + '</div>'
      + renderSignalPatterns(d.signal_patterns || []);
    return;
  }

  // ── By Source ──
  var bySource = d.by_source || [];
  var sourceRows = bySource.map(function(s) {
    return '<tr>'
      + '<td>' + _escHtml(s.signal_source || '—') + '</td>'
      + '<td>' + (s.cnt || 0).toLocaleString() + '</td>'
      + '<td>' + (s.avg_conf != null ? (s.avg_conf * 100).toFixed(1) + '%' : '—') + '</td>'
      + '</tr>';
  }).join('');

  // ── By Type ──
  var byType = d.by_type || [];
  var typeRows = byType.map(function(t) {
    return '<tr><td>' + _escHtml(t.signal_type || '—') + '</td><td>' + (t.cnt || 0).toLocaleString() + '</td></tr>';
  }).join('');

  // ── Recent signals table ──
  var recent = d.recent || [];
  var recentRows = recent.map(function(r) {
    var statusColor = r.status === 'accepted' ? 'var(--green)' : r.status === 'dismissed' ? 'var(--text-faint)' : 'var(--amber, #f59e0b)';
    return '<tr>'
      + '<td>' + _escHtml(r.signal_source || '—') + '</td>'
      + '<td>' + _escHtml(r.signal_type || '—') + '</td>'
      + '<td>' + _escHtml(r.proposed_stage || '—') + '</td>'
      + '<td>' + (r.confidence != null ? (r.confidence * 100).toFixed(0) + '%' : '—') + '</td>'
      + '<td style="color:' + statusColor + '">' + _escHtml(r.status || '—') + '</td>'
      + '<td style="color:var(--text-dim);font-size:11px">' + (r.created_at ? _timeAgo(r.created_at) : '—') + '</td>'
      + '</tr>';
  }).join('');

  var html = statRow;

  // Source + type tables side by side
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:20px">';
  html += '<div class="admin-block"><div class="admin-block-title">By Source</div>'
    + '<table class="admin-table"><thead><tr><th>Source</th><th>Count</th><th>Avg Conf</th></tr></thead><tbody>'
    + (sourceRows || '<tr><td colspan="3" style="color:var(--text-dim)">No data</td></tr>')
    + '</tbody></table></div>';
  html += '<div class="admin-block"><div class="admin-block-title">By Type</div>'
    + '<table class="admin-table"><thead><tr><th>Signal Type</th><th>Count</th></tr></thead><tbody>'
    + (typeRows || '<tr><td colspan="2" style="color:var(--text-dim)">No data</td></tr>')
    + '</tbody></table></div>';
  html += '</div>';

  // Recent signals
  html += '<div class="admin-block" style="margin-top:16px">'
    + '<div class="admin-block-title">Recent Signals</div>'
    + '<table class="admin-table"><thead><tr><th>Source</th><th>Type</th><th>Proposed Stage</th><th>Conf</th><th>Status</th><th>When</th></tr></thead>'
    + '<tbody>' + (recentRows || '<tr><td colspan="6" style="color:var(--text-dim)">No signals</td></tr>') + '</tbody>'
    + '</table></div>';

  // Signal patterns
  html += renderSignalPatterns(d.signal_patterns || []);

  container.innerHTML = html;
}

function renderSignalPatterns(patterns) {
  if (!patterns || patterns.length === 0) {
    return '<div class="admin-block" style="margin-top:16px"><div class="admin-block-title">Signal Patterns <span style="font-size:11px;color:var(--text-dim);font-weight:400">(21 learned)</span></div>'
      + '<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:12px">Pattern library exists but has no display data yet.</div></div>';
  }
  var rows = patterns.map(function(p) {
    var conf = p.confidence_score != null ? (p.confidence_score * 100).toFixed(0) + '%' : '—';
    var ratio = (p.confirmations + p.dismissals) > 0
      ? Math.round(p.confirmations / (p.confirmations + p.dismissals) * 100) + '%'
      : '—';
    return '<tr>'
      + '<td>' + _escHtml(p.pattern_type || '—') + '</td>'
      + '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escHtml(p.pattern_value || '—') + '</td>'
      + '<td>' + _escHtml(p.associated_signal_type || '—') + '</td>'
      + '<td>' + (p.confirmations || 0) + '</td>'
      + '<td>' + (p.dismissals || 0) + '</td>'
      + '<td>' + ratio + '</td>'
      + '<td>' + conf + '</td>'
      + '<td>' + _escHtml(p.ats_source || 'all') + '</td>'
      + '</tr>';
  }).join('');
  return '<div class="admin-block" style="margin-top:16px">'
    + '<div class="admin-block-title">Signal Patterns <span style="font-size:11px;color:var(--text-dim);font-weight:400">(' + patterns.length + ' patterns)</span></div>'
    + '<table class="admin-table"><thead><tr><th>Pattern Type</th><th>Value</th><th>Signal Type</th><th>Confirms</th><th>Dismissals</th><th>Acc Rate</th><th>Confidence</th><th>ATS</th></tr></thead>'
    + '<tbody>' + rows + '</tbody></table></div>';
}
