/**
 * admin-deploy-tracker.js — Build & Deployment Visibility Dashboard
 * BI-01: Build Instrumentation & Deployment Visibility System
 *
 * Renders:
 *   - Deploy summary cards (total, success rate, today, this week)
 *   - Per-surface health table (success rate, avg duration, last deploy)
 *   - Recent deploys timeline (last 25 with status, duration, build steps)
 *   - Daily deploy frequency sparkline (30 days)
 *
 * Depends on: deploy-tracker Edge Function (via gateway)
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _deployAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    reportError('admin_deploy_tracker', e);
    console.warn('[admin-deploy]', action, 'failed:', e.message);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _fmtDuration(ms) {
  if (!ms && ms !== 0) return '—';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

function _fmtTimeAgo(iso) {
  if (!iso) return '—';
  var diff = Date.now() - new Date(iso).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function _statusBadge(status) {
  var colors = {
    'success': '#10b981',
    'failed': '#ef4444',
    'rolled-back': '#f59e0b',
    'in-progress': '#3b82f6',
    'pending': '#6b7280'
  };
  var color = colors[status] || '#6b7280';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;' +
    'background:' + color + '20;color:' + color + ';">' + (status || 'unknown') + '</span>';
}

function _surfaceIcon(surface) {
  var icons = {
    'dashboard': '📊', 'admin': '⚙️', 'extension': '🧩', 'landing': '🏠',
    'edge-functions': '⚡', 'migrations': '🗄️', 'css': '🎨', 'spa': '⚛️', 'infrastructure': '🏗️'
  };
  return icons[surface] || '📦';
}

// ── Sparkline SVG ────────────────────────────────────────────────────────────

function _deploySparkline(dailyCounts) {
  if (!dailyCounts || dailyCounts.length === 0) return '<div style="color:var(--text-faint);font-size:12px;">No deploy data</div>';

  // Sort oldest to newest
  var sorted = dailyCounts.slice().sort(function(a, b) { return a.day < b.day ? -1 : 1; });
  var maxVal = Math.max.apply(null, sorted.map(function(d) { return d.total || 0; }));
  if (maxVal === 0) maxVal = 1;

  var w = 320, h = 60, pad = 4;
  var step = (w - pad * 2) / Math.max(sorted.length - 1, 1);

  function points(key, color) {
    var pts = sorted.map(function(d, i) {
      var x = pad + i * step;
      var y = h - pad - ((d[key] || 0) / maxVal) * (h - pad * 2);
      return x + ',' + y;
    }).join(' ');
    return '<polyline points="' + pts + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  var svg = '<svg width="' + w + '" height="' + h + '" style="display:block;">';
  svg += points('total', '#8b5cf6');
  svg += points('success', '#10b981');
  svg += points('failed', '#ef4444');
  svg += '</svg>';
  svg += '<div style="display:flex;gap:12px;font-size:10px;color:var(--text-dim);margin-top:2px;">';
  svg += '<span style="color:#8b5cf6;">● Total</span>';
  svg += '<span style="color:#10b981;">● Success</span>';
  svg += '<span style="color:#ef4444;">● Failed</span>';
  svg += '</div>';

  return svg;
}

// ── Main Render ──────────────────────────────────────────────────────────────

async function refreshDeployTracker() {
  var el = document.getElementById('admin-page-deploy-tracker');
  if (!el) return;

  el.innerHTML = '<div style="padding:24px;color:#8892b0;">Loading deploy data…</div>';

  var result = await _deployAction('summary', { days: 30 });
  if (!result || !result.summary) {
    el.innerHTML = '<div style="padding:24px;color:#ef4444;">Failed to load deploy data. Is the deploy-tracker EF deployed?</div>';
    return;
  }

  var s = result.summary;
  var html = '';

  // ── Summary Cards ────────────────────────────────────────────────────
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">';

  var cards = [
    { label: 'Total (30d)', value: s.total_deploys || 0, color: '#8b5cf6' },
    { label: 'Success Rate', value: (s.success_rate_pct || 0) + '%', color: Number(s.success_rate_pct) >= 95 ? '#10b981' : Number(s.success_rate_pct) >= 80 ? '#f59e0b' : '#ef4444' },
    { label: 'Today', value: s.deploys_today || 0, color: '#3b82f6' },
    { label: 'This Week', value: s.deploys_this_week || 0, color: '#6366f1' },
    { label: 'Failed', value: s.failed || 0, color: s.failed > 0 ? '#ef4444' : '#10b981' },
    { label: 'Avg Duration', value: _fmtDuration(s.avg_duration_ms), color: '#8892b0' }
  ];

  cards.forEach(function(c) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">';
    html += '<div style="font-size:22px;font-weight:700;color:' + c.color + ';font-family:JetBrains Mono,monospace;">' + c.value + '</div>';
    html += '<div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-top:4px;">' + c.label + '</div>';
    html += '</div>';
  });
  html += '</div>';

  // ── Deploy Frequency Sparkline ────────────────────────────────────────
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Deploy Frequency (30d)</div>';
  html += _deploySparkline(s.daily_counts);
  html += '</div>';

  // ── Per-Surface Health Table ──────────────────────────────────────────
  if (s.surfaces && s.surfaces.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;margin-bottom:20px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Surface Health</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Surface</th><th style="text-align:right">Deploys</th><th style="text-align:right">Success</th>';
    html += '<th style="text-align:right">Failed</th><th style="text-align:right">Rate</th>';
    html += '<th style="text-align:right">Avg Duration</th><th>Last Deploy</th><th>Version</th>';
    html += '</tr></thead><tbody>';

    s.surfaces.forEach(function(surf) {
      var rateColor = Number(surf.success_rate_pct) >= 95 ? '#10b981' : Number(surf.success_rate_pct) >= 80 ? '#f59e0b' : '#ef4444';
      html += '<tr>';
      html += '<td>' + _surfaceIcon(surf.surface) + ' ' + surf.surface + '</td>';
      html += '<td style="text-align:right">' + surf.total_deploys + '</td>';
      html += '<td style="text-align:right;color:#10b981">' + surf.successful + '</td>';
      html += '<td style="text-align:right;color:' + (surf.failed > 0 ? '#ef4444' : 'var(--text-dim)') + '">' + surf.failed + '</td>';
      html += '<td style="text-align:right;color:' + rateColor + ';font-weight:600">' + surf.success_rate_pct + '%</td>';
      html += '<td style="text-align:right">' + _fmtDuration(surf.avg_duration_ms) + '</td>';
      html += '<td>' + _fmtTimeAgo(surf.last_deploy_at) + '</td>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + (surf.latest_version || '—') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
  }

  // ── Recent Deploys Timeline ───────────────────────────────────────────
  if (s.recent && s.recent.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:8px;padding:16px;">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Recent Deploys</div>';
    html += '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';
    html += '<th>Surface</th><th>Status</th><th>Trigger</th><th>Version</th>';
    html += '<th>Changes</th><th style="text-align:right">Duration</th><th>When</th>';
    html += '</tr></thead><tbody>';

    s.recent.forEach(function(d) {
      html += '<tr>';
      html += '<td>' + _surfaceIcon(d.surface) + ' ' + d.surface + '</td>';
      html += '<td>' + _statusBadge(d.status) + '</td>';
      html += '<td style="font-size:12px;">' + (d.trigger_type || '—') + '</td>';
      html += '<td style="font-family:JetBrains Mono,monospace;font-size:12px;">' + (d.product_version || d.git_tag || '—') + '</td>';
      html += '<td style="font-size:12px;">' + (d.changed_summary || '—') + '</td>';
      html += '<td style="text-align:right">' + _fmtDuration(d.duration_ms) + '</td>';
      html += '<td style="font-size:12px;">' + _fmtTimeAgo(d.created_at) + '</td>';
      html += '</tr>';
      if (d.error_message) {
        html += '<tr><td colspan="7" style="padding:4px 12px;font-size:11px;color:#ef4444;background:var(--bg-main);">⚠️ ' + d.error_message + '</td></tr>';
      }
    });

    html += '</tbody></table></div></div>';
  }

  el.innerHTML = html;
}

// ── Auto-init ────────────────────────────────────────────────────────────────

(function() {
  // Poll every 2 minutes when visible
  var _deployPoll = null;

  function startDeployPoll() {
    refreshDeployTracker();
    _deployPoll = setInterval(refreshDeployTracker, 120000);
  }

  function stopDeployPoll() {
    if (_deployPoll) { clearInterval(_deployPoll); _deployPoll = null; }
  }

  // Listen for admin page navigation events
  document.addEventListener('admin-page-change', function(e) {
    if (e.detail && e.detail.page === 'deploy-tracker') {
      startDeployPoll();
    } else {
      stopDeployPoll();
    }
  });

  // Also check on load if we're already on that page
  if (document.getElementById('admin-page-deploy-tracker') &&
      document.getElementById('admin-page-deploy-tracker').offsetParent !== null) {
    startDeployPoll();
  }
})();
