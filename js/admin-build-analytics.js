/**
 * admin-build-analytics.js — CI Pipeline Analytics & Bundle Size Dashboard
 * BI-02: CI Pipeline Analytics & Bundle Size Tracking
 *
 * Renders:
 *   - Summary cards (total builds, CI runs, success rate, avg duration, bundle regressions)
 *   - Build step performance table (avg/p95 duration, failure rate per step)
 *   - CI workflow health table (per-workflow success rate, avg duration)
 *   - Bundle size current + trend sparklines per surface
 *   - Recent CI runs timeline
 *
 * Depends on: deploy-tracker Edge Function (build-analytics action) via gateway
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _buildAnalyticsAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    reportError('admin_build_analytics', e);
    console.warn('[admin-build]', action, 'failed:', e.message);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _baDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

function _baTimeAgo(iso) {
  if (!iso) return '—';
  var diff = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

function _baSize(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

function _baDelta(bytes) {
  if (!bytes) return '';
  var sign = bytes > 0 ? '+' : '';
  var color = bytes > 0 ? '#ef4444' : '#10b981';
  return '<span style="color:' + color + ';font-size:11px;font-weight:600;margin-left:6px;">' + sign + _baSize(bytes) + '</span>';
}

function _baConclusionBadge(conclusion) {
  var colors = {
    'success': '#10b981', 'failure': '#ef4444', 'cancelled': '#f59e0b',
    'skipped': '#6b7280', 'timed_out': '#ef4444', 'action_required': '#f59e0b'
  };
  var color = colors[conclusion] || '#6b7280';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;' +
    'background:' + color + '20;color:' + color + ';">' + (conclusion || 'pending') + '</span>';
}

function _baWorkflowIcon(name) {
  var icons = { 'CI': '🔄', 'deploy': '🚀', 'dry-run': '🧪', 'load-test': '📊', 'psi-audit': '⚡', 'selector-monitor': '🔍' };
  return icons[name] || '⚙️';
}

// ── Bundle Sparkline SVG ─────────────────────────────────────────────────────

function _baBundleSparkline(points) {
  if (!points || points.length < 2) return '';
  var w = 100, h = 28, pad = 2;
  var maxVal = Math.max.apply(null, points.map(function(p) { return p.size_bytes; }));
  var minVal = Math.min.apply(null, points.map(function(p) { return p.size_bytes; }));
  var range = maxVal - minVal || 1;
  var step = (w - pad * 2) / Math.max(points.length - 1, 1);

  // Sort oldest to newest
  var sorted = points.slice().sort(function(a, b) { return a.created_at < b.created_at ? -1 : 1; });

  var pts = sorted.map(function(d, i) {
    var x = pad + i * step;
    var y = h - pad - ((d.size_bytes - minVal) / range) * (h - pad * 2);
    return x + ',' + y;
  }).join(' ');

  // Color: green if trending down, red if trending up, blue if stable
  var firstSize = sorted[0].size_bytes;
  var lastSize = sorted[sorted.length - 1].size_bytes;
  var color = lastSize > firstSize * 1.05 ? '#ef4444' : lastSize < firstSize * 0.95 ? '#10b981' : '#3b82f6';

  return '<svg width="' + w + '" height="' + h + '" style="display:inline-block;vertical-align:middle;">' +
    '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

// ── Main Render ──────────────────────────────────────────────────────────────

async function refreshBuildAnalytics() {
  var el = document.getElementById('admin-page-build-analytics');
  if (!el) return;

  el.innerHTML = '<div style="padding:24px;color:#8892b0;">Loading build analytics…</div>';

  var result = await _buildAnalyticsAction('build-analytics', { days: 30 });
  if (!result || !result.analytics) {
    el.innerHTML = '<div style="padding:24px;color:#ef4444;">Failed to load build analytics. Is the deploy-tracker EF deployed with BI-02 actions?</div>';
    return;
  }

  var a = result.analytics;
  var html = '';

  // ── Summary Cards ────────────────────────────────────────────────────
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;margin-bottom:20px;">';

  var cards = [
    { label: 'Build Steps (30d)', value: a.total_builds || 0, color: '#8b5cf6' },
    { label: 'CI Runs (30d)', value: a.total_ci_runs || 0, color: '#3b82f6' },
    { label: 'CI Success', value: (a.ci_success_rate || 0) + '%', color: Number(a.ci_success_rate) >= 95 ? '#10b981' : Number(a.ci_success_rate) >= 80 ? '#f59e0b' : '#ef4444' },
    { label: 'Avg Build', value: _baDuration(a.avg_build_duration), color: '#8892b0' },
    { label: 'Bundle Δ', value: (a.bundle_regressions || 0) + ' up', color: Number(a.bundle_regressions) > 0 ? '#f59e0b' : '#10b981' }
  ];

  cards.forEach(function(c) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">';
    html += '<div style="font-size:22px;font-weight:700;color:' + c.color + ';font-family:JetBrains Mono,monospace;">' + c.value + '</div>';
    html += '<div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;">' + c.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── Build Step Performance Table ─────────────────────────────────────
  if (a.build_steps && a.build_steps.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Build Step Performance (30d)</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Step</th><th style="text-align:right">Runs</th><th style="text-align:right">Failed</th>';
    html += '<th style="text-align:right">Fail %</th><th style="text-align:right">Avg</th>';
    html += '<th style="text-align:right">p95</th><th style="text-align:right">Min</th><th style="text-align:right">Max</th><th>Last</th>';
    html += '</tr></thead><tbody>';

    a.build_steps.forEach(function(s) {
      var failColor = Number(s.failure_rate_pct) > 10 ? '#ef4444' : Number(s.failure_rate_pct) > 5 ? '#f59e0b' : 'var(--text-dim)';
      html += '<tr>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + s.step_name + '</td>';
      html += '<td style="text-align:right">' + s.total_runs + '</td>';
      html += '<td style="text-align:right;color:' + (s.failed > 0 ? '#ef4444' : 'var(--text-dim)') + '">' + s.failed + '</td>';
      html += '<td style="text-align:right;color:' + failColor + ';font-weight:600">' + s.failure_rate_pct + '%</td>';
      html += '<td style="text-align:right">' + _baDuration(s.avg_duration_ms) + '</td>';
      html += '<td style="text-align:right">' + _baDuration(s.p95_duration_ms) + '</td>';
      html += '<td style="text-align:right;color:var(--text-dim);font-size:12px;">' + _baDuration(s.min_duration_ms) + '</td>';
      html += '<td style="text-align:right;color:var(--text-dim);font-size:12px;">' + _baDuration(s.max_duration_ms) + '</td>';
      html += '<td style="font-size:12px;">' + _baTimeAgo(s.last_run_at) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // ── CI Workflow Health Table ──────────────────────────────────────────
  if (a.ci_workflows && a.ci_workflows.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">CI Workflow Health (30d)</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Workflow</th><th style="text-align:right">Runs</th><th style="text-align:right">Success</th>';
    html += '<th style="text-align:right">Failed</th><th style="text-align:right">Rate</th>';
    html += '<th style="text-align:right">Avg</th><th style="text-align:right">p95</th><th>Last Run</th>';
    html += '</tr></thead><tbody>';

    a.ci_workflows.forEach(function(w) {
      var rateColor = Number(w.success_rate_pct) >= 95 ? '#10b981' : Number(w.success_rate_pct) >= 80 ? '#f59e0b' : '#ef4444';
      html += '<tr>';
      html += '<td>' + _baWorkflowIcon(w.workflow_name) + ' ' + w.workflow_name + '</td>';
      html += '<td style="text-align:right">' + w.total_runs + '</td>';
      html += '<td style="text-align:right;color:#10b981">' + w.successful + '</td>';
      html += '<td style="text-align:right;color:' + (w.failed > 0 ? '#ef4444' : 'var(--text-dim)') + '">' + w.failed + '</td>';
      html += '<td style="text-align:right;color:' + rateColor + ';font-weight:600">' + w.success_rate_pct + '%</td>';
      html += '<td style="text-align:right">' + _baDuration(w.avg_duration_ms) + '</td>';
      html += '<td style="text-align:right">' + _baDuration(w.p95_duration_ms) + '</td>';
      html += '<td style="font-size:12px;">' + _baTimeAgo(w.last_run_at) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // ── Bundle Sizes ─────────────────────────────────────────────────────
  if (a.bundle_sizes && a.bundle_sizes.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Bundle Sizes (Latest)</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Surface</th><th>Bundle</th><th style="text-align:right">Size</th>';
    html += '<th style="text-align:right">Gzip</th><th>Delta</th><th>Trend</th><th>Version</th><th>Measured</th>';
    html += '</tr></thead><tbody>';

    // Build trends lookup
    var trendMap = {};
    if (a.bundle_trends) {
      a.bundle_trends.forEach(function(t) {
        var key = t.surface + ':' + t.bundle_name;
        if (!trendMap[key]) trendMap[key] = [];
        trendMap[key].push(t);
      });
    }

    a.bundle_sizes.forEach(function(b) {
      var key = b.surface + ':' + b.bundle_name;
      html += '<tr>';
      html += '<td style="font-size:12px;">' + b.surface + '</td>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + b.bundle_name + '</td>';
      html += '<td style="text-align:right;font-family:JetBrains Mono,monospace;font-size:12px;">' + _baSize(b.size_bytes) + '</td>';
      html += '<td style="text-align:right;font-family:JetBrains Mono,monospace;font-size:12px;color:var(--text-dim);">' + _baSize(b.gzip_bytes) + '</td>';
      html += '<td>' + _baDelta(b.delta_bytes) + '</td>';
      html += '<td>' + _baBundleSparkline(trendMap[key] || []) + '</td>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + (b.product_version || '—') + '</td>';
      html += '<td style="font-size:12px;">' + _baTimeAgo(b.created_at) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // ── Recent CI Runs Timeline ──────────────────────────────────────────
  if (a.recent_ci_runs && a.recent_ci_runs.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Recent CI Runs</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Workflow</th><th>Status</th><th>Trigger</th><th>Branch</th>';
    html += '<th>Actor</th><th style="text-align:right">Duration</th><th style="text-align:right">Jobs</th><th>When</th>';
    html += '</tr></thead><tbody>';

    a.recent_ci_runs.forEach(function(r) {
      html += '<tr>';
      html += '<td>' + _baWorkflowIcon(r.workflow_name) + ' ' + r.workflow_name + '</td>';
      html += '<td>' + _baConclusionBadge(r.conclusion || r.status) + '</td>';
      html += '<td style="font-size:12px;">' + (r.trigger_event || '—') + '</td>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + (r.git_branch || '—') + '</td>';
      html += '<td style="font-size:12px;">' + (r.actor || '—') + '</td>';
      html += '<td style="text-align:right">' + _baDuration(r.duration_ms) + '</td>';
      html += '<td style="text-align:right">' + (r.total_jobs || 0) + (r.failed_jobs > 0 ? ' <span style="color:#ef4444;">(' + r.failed_jobs + ' failed)</span>' : '') + '</td>';
      html += '<td style="font-size:12px;">' + _baTimeAgo(r.created_at) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div></div>';
  }

  // ── Empty State ──────────────────────────────────────────────────────
  if ((!a.build_steps || a.build_steps.length === 0) &&
      (!a.ci_workflows || a.ci_workflows.length === 0) &&
      (!a.bundle_sizes || a.bundle_sizes.length === 0)) {
    html += '<div style="padding:32px;text-align:center;color:var(--text-dim);">';
    html += '<div style="font-size:36px;margin-bottom:12px;">📦</div>';
    html += '<div style="font-size:14px;font-weight:600;margin-bottom:4px;">No build data yet</div>';
    html += '<div style="font-size:12px;">CI runs, build steps, and bundle sizes will appear here as they are recorded.</div>';
    html += '</div>';
  }

  el.innerHTML = html;
}

// ── Init: called by ADMIN_SUBPAGE_MAP ────────────────────────────────────────

window.loadBuildAnalyticsPanel = function() {
  refreshBuildAnalytics();
};

// ── Auto-refresh when visible ────────────────────────────────────────────────
(function() {
  var _baPoll = null;

  function startBaPoll() {
    refreshBuildAnalytics();
    _baPoll = setInterval(refreshBuildAnalytics, 120000); // 2min
  }

  function stopBaPoll() {
    if (_baPoll) { clearInterval(_baPoll); _baPoll = null; }
  }

  document.addEventListener('admin-page-change', function(e) {
    if (e.detail && e.detail.page === 'build-analytics') {
      startBaPoll();
    } else {
      stopBaPoll();
    }
  });
})();
