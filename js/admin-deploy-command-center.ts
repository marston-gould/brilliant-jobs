/**
 * admin-deploy-command-center.js — Deployment Command Center Dashboard
 * BI-05: Unified operational view + rollback management + approval workflow
 *
 * Renders:
 *   - Unified status bar (health score, active alerts, drift, pending approvals, rollbacks)
 *   - Quick actions (initiate rollback, evaluate alerts, refresh)
 *   - Rollback management table (history + initiate new)
 *   - Deploy approval queue (pending + approve/reject)
 *   - Unified activity stream (deploys, alerts, rollbacks across all BI systems)
 *
 * Depends on: deploy-tracker Edge Function (via gateway) — actions:
 *   command-center, initiate-rollback, rollback-history, manage-approvals
 */

// ── API Helper ───────────────────────────────────────────────────────────────

async function _commandCenterAction(action, extra) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) return null;
    var { data } = await sb.functions.invoke('api-gateway', {
      body: JSON.stringify(Object.assign({ action: action }, extra || {})),
      headers: { 'x-gateway-route': 'deploy-tracker' }
    });
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (e) {
    console.error('[command-center] action failed:', action, e);
    return null;
  }
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function _ccTimeAgo(ts) {
  if (!ts) return '—';
  var diff = Date.now() - new Date(ts).getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

function _ccBadge(text, color) {
  var bg = { green: '#065f46', red: '#991b1b', yellow: '#854d0e', blue: '#1e40af', gray: '#374151', purple: '#6b21a8' };
  var fg = { green: '#6ee7b7', red: '#fca5a5', yellow: '#fde68a', blue: '#93c5fd', gray: '#9ca3af', purple: '#d8b4fe' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:' + (bg[color] || bg.gray) + ';color:' + (fg[color] || fg.gray) + '">' + text + '</span>';
}

function _ccStatusColor(status) {
  var map = { success: 'green', completed: 'green', approved: 'green', auto_approved: 'green',
    failed: 'red', rejected: 'red', cancelled: 'red',
    initiated: 'blue', in_progress: 'yellow', pending: 'yellow',
    active: 'red', acknowledged: 'yellow', expired: 'gray' };
  return map[status] || 'gray';
}

function _ccGradeColor(grade) {
  if (grade === 'A') return '#22c55e';
  if (grade === 'B') return '#84cc16';
  if (grade === 'C') return '#eab308';
  if (grade === 'D') return '#f97316';
  return '#ef4444';
}

function _ccEventIcon(type) {
  if (type === 'deploy') return '🚀';
  if (type === 'alert') return '🔔';
  if (type === 'rollback') return '⏪';
  return '<i data-lucide="clipboard-list" class="icon-xs icon-stroke"></i>';
}

// ── Main Render ──────────────────────────────────────────────────────────────

async function loadCommandCenterPanel() {
  var el = document.getElementById('admin-page-command-center');
  if (!el) return;

  el.innerHTML = '<div style="padding:24px;color:var(--text-faint)">Loading command center…</div>';

  var res = await _commandCenterAction('command-center');
  if (!res || !res.ok) {
    el.innerHTML = '<div style="padding:24px;color:#ef4444;">Failed to load command center data. Is the deploy-tracker EF deployed?</div>';
    return;
  }

  var s = res.summary || {};
  var rollbacks = res.rollbacks || [];
  var approvals = res.approvals || [];
  var activity = res.activity || [];

  var html = '';

  // ── Status Bar ──
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">';

  // Health score gauge
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:' + _ccGradeColor(s.health_grade || 'F') + '">' + (s.health_score != null ? s.health_score : '—') + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Health Score (' + (s.health_grade || '—') + ')</div>';
  html += '</div>';

  // Active alerts
  var alertColor = (s.critical_alerts > 0) ? '#ef4444' : (s.warning_alerts > 0) ? '#eab308' : '#22c55e';
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:' + alertColor + '">' + (s.active_alerts || 0) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Active Alerts';
  if (s.critical_alerts > 0) html += ' (' + s.critical_alerts + ' critical)';
  html += '</div></div>';

  // Drift
  var driftColor = (s.drift_count > 0) ? '#f97316' : '#22c55e';
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:' + driftColor + '">' + (s.drift_count || 0) + '/' + (s.total_surfaces || 0) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Environment Drift</div>';
  html += '</div>';

  // Deploys 24h
  var deployRate = s.deploy_count_24h > 0 ? Math.round((s.deploy_success_24h / s.deploy_count_24h) * 100) : 100;
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:var(--text-primary,#e2e8f0)">' + (s.deploy_count_24h || 0) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Deploys (24h) · ' + deployRate + '% success</div>';
  html += '</div>';

  // Pending approvals
  var approvalColor = (s.pending_approvals > 0) ? '#eab308' : '#22c55e';
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:' + approvalColor + '">' + (s.pending_approvals || 0) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Pending Approvals</div>';
  html += '</div>';

  // Rollbacks 7d
  html += '<div style="background:var(--bg-card,#1a1a2e);border-radius:12px;padding:16px;text-align:center">';
  html += '<div style="font-size:36px;font-weight:700;color:var(--text-primary,#e2e8f0)">' + (s.rollback_count_7d || 0) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-faint)">Rollbacks (7d)</div>';
  html += '</div>';

  html += '</div>'; // end status bar

  // ── Quick Actions Bar ──
  html += '<div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap">';
  html += '<button onclick="_ccInitRollbackPrompt()" style="padding:8px 16px;border-radius:8px;border:1px solid #ef4444;background:transparent;color:#ef4444;cursor:pointer;font-size:13px;font-weight:600">⏪ Initiate Rollback</button>';
  html += '<button onclick="_ccEvaluateAlerts()" style="padding:8px 16px;border-radius:8px;border:1px solid #3b82f6;background:transparent;color:#3b82f6;cursor:pointer;font-size:13px;font-weight:600">🔔 Evaluate Alerts</button>';
  html += '<button onclick="loadCommandCenterPanel()" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border,#333);background:transparent;color:var(--text-secondary,#94a3b8);cursor:pointer;font-size:13px;font-weight:600">↻ Refresh</button>';
  html += '</div>';

  // ── Approval Queue ──
  html += '<div style="margin-bottom:24px">';
  html += '<h3 style="font-size:14px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:12px">Deploy Approval Queue</h3>';
  if (approvals.length === 0) {
    html += '<div style="padding:16px;background:var(--bg-card,#1a1a2e);border-radius:8px;color:var(--text-faint);font-size:13px">No pending approvals.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border,#333)">';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Surface</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Requested By</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Reason</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Age</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Actions</th>';
    html += '</tr></thead><tbody>';
    for (var a = 0; a < approvals.length; a++) {
      var ap = approvals[a];
      html += '<tr style="border-bottom:1px solid var(--border-faint,#222)">';
      html += '<td style="padding:8px">' + _ccBadge(ap.surface || '—', 'blue') + '</td>';
      html += '<td style="padding:8px;color:var(--text-secondary,#94a3b8)">' + (ap.requested_by || '—') + '</td>';
      html += '<td style="padding:8px;color:var(--text-secondary,#94a3b8)">' + (ap.request_reason || '—') + '</td>';
      html += '<td style="padding:8px;color:var(--text-faint)">' + _ccTimeAgo(ap.requested_at) + '</td>';
      html += '<td style="padding:8px">';
      html += '<button onclick="_ccApproveDeployment(\'' + ap.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid #22c55e;background:transparent;color:#22c55e;cursor:pointer;font-size:11px;margin-right:4px">Approve</button>';
      html += '<button onclick="_ccRejectDeployment(\'' + ap.id + '\')" style="padding:4px 10px;border-radius:6px;border:1px solid #ef4444;background:transparent;color:#ef4444;cursor:pointer;font-size:11px">Reject</button>';
      html += '</td></tr>';
    }
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // ── Rollback History ──
  html += '<div style="margin-bottom:24px">';
  html += '<h3 style="font-size:14px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:12px">Rollback History</h3>';
  if (rollbacks.length === 0) {
    html += '<div style="padding:16px;background:var(--bg-card,#1a1a2e);border-radius:8px;color:var(--text-faint);font-size:13px">No rollbacks recorded.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border,#333)">';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Surface</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Status</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Reason</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Target</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Initiated By</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Duration</th>';
    html += '<th style="text-align:left;padding:8px;color:var(--text-faint)">Started</th>';
    html += '</tr></thead><tbody>';
    for (var r = 0; r < rollbacks.length; r++) {
      var rb = rollbacks[r];
      var target = rb.rollback_to_tag || (rb.rollback_to_sha ? rb.rollback_to_sha.substring(0, 8) : '—');
      var dur = rb.duration_ms != null ? (rb.duration_ms / 1000).toFixed(1) + 's' : '—';
      html += '<tr style="border-bottom:1px solid var(--border-faint,#222)">';
      html += '<td style="padding:8px">' + _ccBadge(rb.surface || '—', 'blue') + '</td>';
      html += '<td style="padding:8px">' + _ccBadge(rb.status, _ccStatusColor(rb.status)) + '</td>';
      html += '<td style="padding:8px;color:var(--text-secondary,#94a3b8);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (rb.reason || '—') + '</td>';
      html += '<td style="padding:8px;font-family:monospace;font-size:12px;color:var(--text-faint)">' + target + '</td>';
      html += '<td style="padding:8px;color:var(--text-faint)">' + (rb.initiated_by || '—') + '</td>';
      html += '<td style="padding:8px;color:var(--text-faint)">' + dur + '</td>';
      html += '<td style="padding:8px;color:var(--text-faint)">' + _ccTimeAgo(rb.started_at) + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }
  html += '</div>';

  // ── Unified Activity Stream ──
  html += '<div style="margin-bottom:24px">';
  html += '<h3 style="font-size:14px;font-weight:600;color:var(--text-primary,#e2e8f0);margin-bottom:12px">Activity Stream (7d)</h3>';
  if (activity.length === 0) {
    html += '<div style="padding:16px;background:var(--bg-card,#1a1a2e);border-radius:8px;color:var(--text-faint);font-size:13px">No recent activity.</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:4px">';
    for (var i = 0; i < activity.length; i++) {
      var evt = activity[i];
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-card,#1a1a2e);border-radius:8px;font-size:13px">';
      html += '<span style="font-size:16px">' + _ccEventIcon(evt.event_type) + '</span>';
      html += '<span style="min-width:60px">' + _ccBadge(evt.event_type, evt.event_type === 'alert' ? 'red' : evt.event_type === 'rollback' ? 'purple' : 'blue') + '</span>';
      html += '<span style="min-width:90px">' + _ccBadge(evt.surface || '—', 'gray') + '</span>';
      html += '<span>' + _ccBadge(evt.event_status, _ccStatusColor(evt.event_status)) + '</span>';
      html += '<span style="color:var(--text-secondary,#94a3b8);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (evt.event_detail || '') + '</span>';
      html += '<span style="color:var(--text-faint);font-size:11px;white-space:nowrap">' + _ccTimeAgo(evt.event_time) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';

  el.innerHTML = html;
}

// ── Quick Action Handlers ────────────────────────────────────────────────────

async function _ccInitRollbackPrompt() {
  var surface = prompt('Surface to rollback:\n(dashboard, landing, admin, extension, edge-functions, database, infrastructure)');
  if (!surface) return;
  var reason = prompt('Reason for rollback:');
  if (reason === null) return;
  var tag = prompt('Rollback to tag (or leave empty):');

  var res = await _commandCenterAction('initiate-rollback', {
    surface: surface.trim(),
    reason: reason.trim(),
    rollback_to_tag: tag ? tag.trim() : null,
    initiated_by: 'admin'
  });

  if (res && res.ok) {
    alert('Rollback initiated for ' + surface + '.\nID: ' + (res.rollback && res.rollback.id ? res.rollback.id.substring(0, 8) : '—'));
    loadCommandCenterPanel();
  } else {
    alert('Failed to initiate rollback: ' + ((res && res.error) || 'unknown error'));
  }
}

async function _ccEvaluateAlerts() {
  var res = await _commandCenterAction('manage-alert-rules', { sub_action: 'evaluate' });
  if (res) {
    alert('Alert evaluation complete.');
    loadCommandCenterPanel();
  } else {
    alert('Failed to evaluate alerts.');
  }
}

async function _ccApproveDeployment(approvalId) {
  if (!confirm('Approve this deployment?')) return;
  var res = await _commandCenterAction('manage-approvals', { sub_action: 'approve', approval_id: approvalId });
  if (res && res.ok) {
    loadCommandCenterPanel();
  } else {
    alert('Failed to approve: ' + ((res && res.error) || 'unknown'));
  }
}

async function _ccRejectDeployment(approvalId) {
  var reason = prompt('Rejection reason:');
  if (reason === null) return;
  var res = await _commandCenterAction('manage-approvals', { sub_action: 'reject', approval_id: approvalId, reason: reason });
  if (res && res.ok) {
    loadCommandCenterPanel();
  } else {
    alert('Failed to reject: ' + ((res && res.error) || 'unknown'));
  }
}

// ── Auto-refresh (2 min) ─────────────────────────────────────────────────────

(function() {
  var _ccRefreshTimer = null;

  function _ccStartPolling() {
    if (_ccRefreshTimer) clearInterval(_ccRefreshTimer);
    _ccRefreshTimer = setInterval(function() {
      var el = document.getElementById('admin-page-command-center');
      if (el && el.offsetParent !== null) {
        loadCommandCenterPanel();
      }
    }, 120000);
  }

  // Listen for admin panel navigation
  document.addEventListener('admin:subpage-changed', function(e) {
    if (e.detail && e.detail.page === 'command-center') {
      loadCommandCenterPanel();
      _ccStartPolling();
    }
  });

  // Auto-load if already visible
  if (document.getElementById('admin-page-command-center') &&
      document.getElementById('admin-page-command-center').offsetParent !== null) {
    loadCommandCenterPanel();
    _ccStartPolling();
  }
})();
