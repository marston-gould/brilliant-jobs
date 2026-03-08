/**
 * admin-deploy-visibility.js — Deployment Visibility Dashboard
 * BI-03: Environment Status & Release Tracking
 *
 * Renders:
 *   - Summary cards (surfaces tracked, drift alerts, total releases, latest release)
 *   - Environment version matrix (surfaces × environments with drift highlighting)
 *   - Deploy cadence table (per-surface frequency, success rate, avg duration)
 *   - Release timeline (recent releases with type badges, surfaces, findings resolved)
 *
 * Depends on: deploy-tracker Edge Function (via gateway) — BI-03 actions
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _visibilityAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    reportError('admin_deploy_visibility', e);
    console.warn('[admin-visibility]', action, 'failed:', e.message);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _visFmt(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + 'm ago';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function _visSha(sha) {
  return sha ? sha.substring(0, 7) : '—';
}

function _visTypeBadge(type) {
  var colors = {
    feature: '#3b82f6',
    bugfix: '#f59e0b',
    security: '#ef4444',
    hotfix: '#dc2626',
    infrastructure: '#8b5cf6'
  };
  var color = colors[type] || '#6b7280';
  return '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:' + color + '">' + (type || 'unknown') + '</span>';
}

function _visDriftBadge(hasDrift) {
  if (hasDrift) {
    return '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:#ef4444">DRIFT</span>';
  }
  return '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;color:#fff;background:#22c55e">IN SYNC</span>';
}

// ── Summary Cards ────────────────────────────────────────────────────────────

function _renderVisibilityCards(summary) {
  var cards = [
    { label: 'Surfaces Tracked', value: summary.total_surfaces || 0, color: '#3b82f6' },
    { label: 'Drift Alerts', value: summary.surfaces_with_drift || 0, color: (summary.surfaces_with_drift || 0) > 0 ? '#ef4444' : '#22c55e' },
    { label: 'Total Releases', value: summary.total_releases || 0, color: '#8b5cf6' },
    { label: 'Latest Release', value: summary.latest_release || '—', color: '#f59e0b', small: true }
  ];

  var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">';
  cards.forEach(function(c) {
    html += '<div style="background:#1e293b;border-radius:8px;padding:16px;border:1px solid #334155">';
    html += '<div style="color:#94a3b8;font-size:12px;margin-bottom:4px">' + c.label + '</div>';
    html += '<div style="color:' + c.color + ';font-size:' + (c.small ? '16px' : '28px') + ';font-weight:700">' + c.value + '</div>';
    if (c.label === 'Latest Release' && summary.latest_release_at) {
      html += '<div style="color:#64748b;font-size:11px;margin-top:2px">' + _visFmt(summary.latest_release_at) + '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ── Environment Version Matrix ───────────────────────────────────────────────

function _renderEnvironmentMatrix(matrix, driftReport) {
  var driftMap = {};
  (driftReport || []).forEach(function(d) { driftMap[d.surface] = d; });

  // Group matrix rows by surface
  var surfaceMap = {};
  (matrix || []).forEach(function(ev) {
    if (!surfaceMap[ev.surface]) surfaceMap[ev.surface] = {};
    surfaceMap[ev.surface][ev.environment] = ev;
  });

  var surfaces = Object.keys(surfaceMap).sort();

  var html = '<div style="margin-bottom:20px">';
  html += '<h3 style="color:#e2e8f0;font-size:14px;font-weight:600;margin-bottom:10px">Environment Version Matrix</h3>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="border-bottom:2px solid #334155">';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Surface</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Production</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Prod SHA</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Prod Deployed</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Staging</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Staging SHA</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Status</th>';
  html += '</tr></thead><tbody>';

  if (surfaces.length === 0) {
    html += '<tr><td colspan="7" style="padding:20px;color:#64748b;text-align:center">No environment data recorded yet. Deploy tracking will populate this matrix automatically.</td></tr>';
  }

  surfaces.forEach(function(surface) {
    var prod = surfaceMap[surface]['production'] || {};
    var staging = surfaceMap[surface]['staging'] || {};
    var drift = driftMap[surface] || {};
    var hasDrift = drift.has_drift || false;
    var rowBg = hasDrift ? 'rgba(239,68,68,0.08)' : 'transparent';

    html += '<tr style="border-bottom:1px solid #1e293b;background:' + rowBg + '">';
    html += '<td style="padding:8px;color:#e2e8f0;font-weight:600">' + surface + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;font-family:monospace;font-size:12px">' + (prod.product_version || '—') + '</td>';
    html += '<td style="padding:8px;color:#94a3b8;font-family:monospace;font-size:12px">' + _visSha(prod.git_sha) + '</td>';
    html += '<td style="padding:8px;color:#94a3b8">' + _visFmt(prod.deployed_at) + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;font-family:monospace;font-size:12px">' + (staging.product_version || '—') + '</td>';
    html += '<td style="padding:8px;color:#94a3b8;font-family:monospace;font-size:12px">' + _visSha(staging.git_sha) + '</td>';
    html += '<td style="padding:8px">' + _visDriftBadge(hasDrift) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// ── Deploy Cadence Table ─────────────────────────────────────────────────────

function _renderDeployCadence(cadence) {
  var html = '<div style="margin-bottom:20px">';
  html += '<h3 style="color:#e2e8f0;font-size:14px;font-weight:600;margin-bottom:10px">Deploy Cadence (Production)</h3>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="border-bottom:2px solid #334155">';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Surface</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">7d</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">30d</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">90d</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Success</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Failed</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Rollbacks</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Avg Duration</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Last Deploy</th>';
  html += '</tr></thead><tbody>';

  if (!cadence || cadence.length === 0) {
    html += '<tr><td colspan="9" style="padding:20px;color:#64748b;text-align:center">No deploy cadence data available yet.</td></tr>';
  }

  (cadence || []).forEach(function(c) {
    var total30 = (c.successes_30d || 0) + (c.failures_30d || 0) + (c.rollbacks_30d || 0);
    var successRate = total30 > 0 ? Math.round((c.successes_30d / total30) * 100) : 0;
    var rateColor = successRate >= 95 ? '#22c55e' : successRate >= 80 ? '#f59e0b' : '#ef4444';
    var avgDur = c.avg_duration_30d_ms ? Math.round(c.avg_duration_30d_ms / 1000) + 's' : '—';

    html += '<tr style="border-bottom:1px solid #1e293b">';
    html += '<td style="padding:8px;color:#e2e8f0;font-weight:600">' + c.surface + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;text-align:right">' + (c.deploys_7d || 0) + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;text-align:right">' + (c.deploys_30d || 0) + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;text-align:right">' + (c.deploys_90d || 0) + '</td>';
    html += '<td style="padding:8px;color:' + rateColor + ';text-align:right;font-weight:600">' + successRate + '%</td>';
    html += '<td style="padding:8px;color:#ef4444;text-align:right">' + (c.failures_30d || 0) + '</td>';
    html += '<td style="padding:8px;color:#f59e0b;text-align:right">' + (c.rollbacks_30d || 0) + '</td>';
    html += '<td style="padding:8px;color:#94a3b8;text-align:right">' + avgDur + '</td>';
    html += '<td style="padding:8px;color:#94a3b8">' + _visFmt(c.last_deploy_at) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// ── Release Timeline ─────────────────────────────────────────────────────────

function _renderReleaseTimeline(releases) {
  var html = '<div style="margin-bottom:20px">';
  html += '<h3 style="color:#e2e8f0;font-size:14px;font-weight:600;margin-bottom:10px">Release Timeline</h3>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="border-bottom:2px solid #334155">';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Tag</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Version</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Title</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Type</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Surfaces</th>';
  html += '<th style="text-align:right;padding:8px;color:#94a3b8">Findings</th>';
  html += '<th style="text-align:left;padding:8px;color:#94a3b8">Released</th>';
  html += '</tr></thead><tbody>';

  if (!releases || releases.length === 0) {
    html += '<tr><td colspan="7" style="padding:20px;color:#64748b;text-align:center">No releases recorded yet. Use record-release action to populate.</td></tr>';
  }

  (releases || []).forEach(function(r) {
    var rollbackBg = r.is_rollback ? 'rgba(239,68,68,0.08)' : 'transparent';
    html += '<tr style="border-bottom:1px solid #1e293b;background:' + rollbackBg + '">';
    html += '<td style="padding:8px;color:#e2e8f0;font-family:monospace;font-size:12px">' + (r.git_tag || '—') + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;font-family:monospace;font-size:12px">' + (r.product_version || '—') + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0">' + (r.title || '—') + (r.is_rollback ? ' <span style="color:#ef4444;font-weight:600">↩ ROLLBACK</span>' : '') + '</td>';
    html += '<td style="padding:8px">' + _visTypeBadge(r.release_type) + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;text-align:right">' + (r.surface_count || 0) + '</td>';
    html += '<td style="padding:8px;color:#e2e8f0;text-align:right">' + (r.findings_resolved || 0) + '</td>';
    html += '<td style="padding:8px;color:#94a3b8">' + _visFmt(r.released_at) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div></div>';
  return html;
}

// ── Main Dashboard ───────────────────────────────────────────────────────────

async function refreshDeployVisibility() {
  var container = document.getElementById('admin-page-deploy-visibility');
  if (!container) return;

  container.innerHTML = '<div class="admin-loading">Loading deployment visibility…</div>';

  var data = await _visibilityAction('deployment-visibility');
  if (!data) {
    container.innerHTML = '<div style="color:#ef4444;padding:20px">Failed to load deployment visibility data. Check console for errors.</div>';
    return;
  }

  var html = '';
  html += _renderVisibilityCards(data.summary || {});
  html += _renderEnvironmentMatrix(data.environment_matrix || [], data.drift_report || []);
  html += _renderDeployCadence(data.deploy_cadence || []);
  html += _renderReleaseTimeline(data.release_timeline || []);

  // Last refreshed timestamp
  html += '<div style="color:#475569;font-size:11px;text-align:right;margin-top:8px">Last refreshed: ' + new Date().toLocaleTimeString() + ' · Auto-refreshes every 2 min</div>';

  container.innerHTML = html;
}

// Global function for ADMIN_SUBPAGE_MAP
window.loadDeployVisibilityPanel = refreshDeployVisibility;

// ── Auto-init ────────────────────────────────────────────────────────────────

(function() {
  var _visPoll = null;

  function startVisPoll() {
    refreshDeployVisibility();
    _visPoll = setInterval(refreshDeployVisibility, 120000);
  }

  function stopVisPoll() {
    if (_visPoll) { clearInterval(_visPoll); _visPoll = null; }
  }

  document.addEventListener('admin-page-change', function(e) {
    if (e.detail && e.detail.page === 'deploy-visibility') {
      startVisPoll();
    } else {
      stopVisPoll();
    }
  });

  if (document.getElementById('admin-page-deploy-visibility') &&
      document.getElementById('admin-page-deploy-visibility').offsetParent !== null) {
    startVisPoll();
  }
})();
