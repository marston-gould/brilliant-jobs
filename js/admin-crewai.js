/**
 * admin-crewai.js — CrewAI Agent Management Panel
 * SA-010: Agent kill switches, status dashboard, action log browser.
 */

// ─── State ───
var _crewaiRefreshInterval = null;

function loadCrewAIPanel() {
  var el = document.getElementById('admin-page-crewai');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">CrewAI Agent Dashboard</h2>',
    '    <button class="btn btn-sm u-btn-pill" onclick="refreshCrewAIAgents()">Refresh</button>',
    '  </div>',
    '  <p class="admin-block-subtitle">Manage agent lifecycle, kill switches, and review decisions.</p>',
    '  <div id="crewai-agents-grid" class="admin-loading">Loading agents…</div>',
    '</div>',
    '<div class="admin-block" style="margin-top:24px">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Graduation Readiness</h2>',
    '    <button class="btn btn-sm u-btn-pill" onclick="refreshGraduationReadiness()">Evaluate</button>',
    '  </div>',
    '  <p class="admin-block-subtitle">Readiness assessment for agent trust level promotions.</p>',
    '  <div id="crewai-graduation-grid" class="admin-loading">Loading graduation data…</div>',
    '</div>',
    '<div class="admin-block" style="margin-top:24px">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Recent Agent Actions</h2>',
    '    <select id="crewai-agent-filter" onchange="refreshCrewAIActions()" class="admin-select">',
    '      <option value="">All Agents</option>',
    '    </select>',
    '  </div>',
    '  <div id="crewai-actions-table" class="admin-loading">Loading actions…</div>',
    '</div>',
  ].join('\n');

  refreshCrewAIAgents();
  refreshCrewAIActions();
  refreshGraduationReadiness();

  // Auto-refresh every 30 seconds
  if (_crewaiRefreshInterval) clearInterval(_crewaiRefreshInterval);
  _crewaiRefreshInterval = setInterval(function() {
    if (document.getElementById('admin-panel-crewai')?.style.display !== 'none') {
      refreshCrewAIAgents();
    }
  }, 30000);
}

// ─── Render Agent Cards ───
async function refreshCrewAIAgents() {
  var grid = document.getElementById('crewai-agents-grid');
  if (!grid) return;

  try {
    var resp = await sb.from('v_agent_dashboard').select('*');
    if (resp.error) throw resp.error;
    var agents = resp.data || [];

    if (agents.length === 0) {
      grid.innerHTML = '<p class="text-faint">No agents configured.</p>';
      return;
    }

    // Also populate the filter dropdown
    var filterEl = document.getElementById('crewai-agent-filter');
    if (filterEl && filterEl.options.length <= 1) {
      agents.forEach(function(a) {
        var opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.display_name;
        filterEl.appendChild(opt);
      });
    }

    grid.innerHTML = '<div class="crewai-grid">' + agents.map(renderAgentCard).join('') + '</div>';
  } catch (e) {
    grid.innerHTML = '<p class="text-danger">Error loading agents: ' + (e.message || e) + '</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshCrewAIAgents', e);
  }
}

function renderAgentCard(agent) {
  var trustColors = {
    observe: 'var(--text-faint)',
    suggest: 'var(--accent)',
    auto_with_approval: 'hsl(45, 80%, 50%)',
    autonomous: 'var(--green)',
  };

  var statusDot = agent.enabled
    ? '<span class="crewai-dot crewai-dot-green"></span>'
    : '<span class="crewai-dot crewai-dot-red"></span>';

  var trustBadge = '<span class="badge" style="background:color-mix(in srgb, ' +
    (trustColors[agent.trust_level] || 'var(--text-faint)') + ' 15%, transparent);color:' +
    (trustColors[agent.trust_level] || 'var(--text-faint)') + '">' +
    agent.trust_level.replace(/_/g, ' ') + '</span>';

  var lastRun = agent.last_run_at
    ? new Date(agent.last_run_at).toLocaleString()
    : 'Never';

  var errText = agent.last_error
    ? '<p class="crewai-error">' + agent.last_error.substring(0, 80) + '</p>'
    : '';

  return [
    '<div class="crewai-card">',
    '  <div class="crewai-card-header">',
    '    ' + statusDot,
    '    <strong>' + agent.display_name + '</strong>',
    '    ' + trustBadge,
    '  </div>',
    '  <div class="crewai-card-stats">',
    '    <div class="crewai-stat"><span class="crewai-stat-val">' + agent.actions_24h + '</span><span class="crewai-stat-label">Actions 24h</span></div>',
    '    <div class="crewai-stat"><span class="crewai-stat-val">' + (agent.avg_confidence_24h ? (agent.avg_confidence_24h * 100).toFixed(1) + '%' : '—') + '</span><span class="crewai-stat-label">Avg Confidence</span></div>',
    '    <div class="crewai-stat"><span class="crewai-stat-val">' + agent.run_count + '</span><span class="crewai-stat-label">Total Runs</span></div>',
    '    <div class="crewai-stat"><span class="crewai-stat-val">' + agent.errors_24h + '</span><span class="crewai-stat-label">Errors 24h</span></div>',
    '  </div>',
    errText,
    '  <div class="crewai-card-footer">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;width:100%;flex-wrap:wrap;gap:4px">',
    '      <span class="text-faint" style="font-size:11px">Last run: ' + lastRun + '</span>',
    agent.graduated_at ? '      <span class="text-faint" style="font-size:11px">Graduated: ' + new Date(agent.graduated_at).toLocaleDateString() + '</span>' : '',
    '    </div>',
    '    <div class="crewai-card-actions" style="margin-top:8px">',
    '      <button class="btn btn-sm u-btn-pill" onclick="toggleCrewAIAgent(\'' + agent.id + '\')">' + (agent.enabled ? '⏸ Disable' : '▶ Enable') + '</button>',
    '      <button class="btn btn-sm u-btn-pill" onclick="runCrewAIAgent(\'' + agent.id + '\')">▶ Run Now</button>',
    agent.trust_level !== 'autonomous' ? '      <button class="btn btn-sm u-btn-pill" style="background:var(--accent);color:white" onclick="graduateAgent(\'' + agent.id + '\')">⬆ Graduate</button>' : '',
    agent.trust_level !== 'observe' ? '      <button class="btn btn-sm u-btn-pill" style="background:hsl(0,60%,50%);color:white" onclick="rollbackAgent(\'' + agent.id + '\')">⬇ Rollback</button>' : '',
    '    </div>',
    '  </div>',
    '</div>',
  ].join('\n');
}

// ─── Toggle Kill Switch ───
async function toggleCrewAIAgent(agentId) {
  try {
    var resp = await sb.functions.invoke('crewai-orchestrator', {
      body: {},
      headers: {},
    });
    // Fallback: direct update via Supabase if orchestrator not deployed yet
    var current = await sb.from('agent_config').select('enabled').eq('id', agentId).single();
    if (current.error) throw current.error;

    var newState = !current.data.enabled;
    var update = await sb.from('agent_config').update({ enabled: newState }).eq('id', agentId);
    if (update.error) throw update.error;

    // Log the action
    if (typeof _logAdminAction === 'function') {
      _logAdminAction('crewai_kill_switch', { agent: agentId, enabled: newState });
    }

    refreshCrewAIAgents();
  } catch (e) {
    alert('Error toggling agent: ' + (e.message || e));
    if (typeof reportError === 'function') reportError('admin-crewai', 'toggleCrewAIAgent', e);
  }
}

// ─── Run Agent Now ───
async function runCrewAIAgent(agentId) {
  try {
    var btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Running…';

    var resp = await sb.functions.invoke('crewai-orchestrator', {
      body: { action: 'run', agent: agentId, triggered_by: 'admin_manual' },
    });

    if (typeof _logAdminAction === 'function') {
      _logAdminAction('crewai_manual_run', { agent: agentId });
    }

    btn.textContent = '✓ Done';
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = '▶ Run Now';
      refreshCrewAIAgents();
      refreshCrewAIActions();
    }, 2000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '▶ Run Now';
    alert('Error running agent: ' + (e.message || e));
    if (typeof reportError === 'function') reportError('admin-crewai', 'runCrewAIAgent', e);
  }
}

// ─── Render Action Log ───
async function refreshCrewAIActions() {
  var el = document.getElementById('crewai-actions-table');
  if (!el) return;

  try {
    var agentFilter = document.getElementById('crewai-agent-filter')?.value || '';
    var query = sb
      .from('agent_action_log')
      .select('id, agent_id, action_type, trust_level, target, confidence, executed, override_by, error, created_at, result')
      .order('created_at', { ascending: false })
      .limit(50);

    if (agentFilter) query = query.eq('agent_id', agentFilter);

    var resp = await query;
    if (resp.error) throw resp.error;
    var actions = resp.data || [];

    if (actions.length === 0) {
      el.innerHTML = '<p class="text-faint">No agent actions recorded yet.</p>';
      return;
    }

    var rows = actions.map(function(a) {
      var confText = a.confidence !== null ? (a.confidence * 100).toFixed(1) + '%' : '—';
      var statusBadge = a.error
        ? '<span class="badge badge-red">error</span>'
        : a.executed
          ? '<span class="badge badge-green">executed</span>'
          : '<span class="badge" style="background:var(--bg-hover);color:var(--text-faint)">observe</span>';
      var overrideBadge = a.override_by
        ? ' <span class="badge badge-blue">overridden</span>'
        : '';
      var summary = '';
      try {
        var r = typeof a.result === 'string' ? JSON.parse(a.result) : a.result;
        summary = r.summary || r.decision || '';
      } catch(_) { summary = ''; }
      var time = new Date(a.created_at).toLocaleString();

      return '<tr>' +
        '<td style="font-size:11px;color:var(--text-faint)">' + time + '</td>' +
        '<td>' + a.agent_id + '</td>' +
        '<td>' + a.action_type + '</td>' +
        '<td>' + confText + '</td>' +
        '<td>' + statusBadge + overrideBadge + '</td>' +
        '<td style="font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + (summary || '').replace(/"/g, '&quot;') + '">' + (summary || '—') + '</td>' +
        '</tr>';
    }).join('');

    el.innerHTML = '<table class="admin-table">' +
      '<thead><tr><th>Time</th><th>Agent</th><th>Action</th><th>Confidence</th><th>Status</th><th>Summary</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (e) {
    el.innerHTML = '<p class="text-danger">Error loading actions: ' + (e.message || e) + '</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshCrewAIActions', e);
  }
}

// ─── SA-012: Graduation Readiness ───
async function refreshGraduationReadiness() {
  var el = document.getElementById('crewai-graduation-grid');
  if (!el) return;

  try {
    var resp = await sb.functions.invoke('crewai-orchestrator', {
      body: { action: 'run', agent: 'graduation-eval' },
    });
    // Fallback: call graduation EF directly
    var evalResp = await sb.rpc('fn_evaluate_agent_graduation', { p_agent_id: null });
    if (evalResp.error) throw evalResp.error;
    var evals = evalResp.data || [];

    if (evals.length === 0) {
      el.innerHTML = '<p class="text-faint">No agents to evaluate.</p>';
      return;
    }

    var rows = evals.map(function(e) {
      var icon = e.eligible ? '✅' : '⏳';
      var blockerHtml = (e.blockers || []).length > 0
        ? '<ul style="margin:2px 0;padding-left:16px;font-size:11px;color:var(--text-faint)">' +
          e.blockers.map(function(b) { return '<li>' + b + '</li>'; }).join('') +
          '</ul>'
        : '<span style="color:var(--green);font-size:11px">All criteria met</span>';

      return '<tr>' +
        '<td style="padding:8px 12px">' + icon + ' <strong>' + e.display_name + '</strong></td>' +
        '<td style="padding:8px 12px">' + e.current_level + ' → ' + (e.next_level || '—') + '</td>' +
        '<td style="padding:8px 12px">' + e.days_in_level + 'd</td>' +
        '<td style="padding:8px 12px">' + e.total_actions + '</td>' +
        '<td style="padding:8px 12px">' +
          (e.false_positive_rate > 0 ? (e.false_positive_rate * 100).toFixed(1) + '%' : '0%') +
        '</td>' +
        '<td style="padding:8px 12px">' + blockerHtml + '</td>' +
        '</tr>';
    }).join('');

    el.innerHTML = '<table class="admin-table">' +
      '<thead><tr><th>Agent</th><th>Transition</th><th>Days</th><th>Actions</th><th>FP Rate</th><th>Status</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<div style="margin-top:12px;text-align:right">' +
      '  <button class="btn btn-sm u-btn-pill" onclick="sendDigestNow()" style="margin-right:8px">📧 Send Digest Now</button>' +
      '</div>';

  } catch (e) {
    el.innerHTML = '<p class="text-danger">Error loading graduation data: ' + (e.message || e) + '</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshGraduationReadiness', e);
  }
}

// ─── SA-012: Graduate Agent ───
async function graduateAgent(agentId) {
  if (!confirm('Graduate ' + agentId + ' to next trust level? This enables new capabilities.')) return;

  try {
    var resp = await sb.functions.invoke('crewai-graduation', {
      body: { action: 'graduate', agent: agentId },
    });

    var result = resp.data;
    if (result && !result.ok && result.blockers) {
      var msg = 'Agent does not meet graduation criteria:\n\n' +
        result.blockers.join('\n') +
        '\n\nForce graduate anyway?';
      if (confirm(msg)) {
        resp = await sb.functions.invoke('crewai-graduation', {
          body: { action: 'graduate', agent: agentId, force: 'true' },
        });
        result = resp.data;
      } else {
        return;
      }
    }

    if (typeof _logAdminAction === 'function') {
      _logAdminAction('crewai_graduate', { agent: agentId, result: result });
    }

    alert(result?.message || 'Agent graduated successfully');
    refreshCrewAIAgents();
    refreshGraduationReadiness();
  } catch (e) {
    alert('Error graduating agent: ' + (e.message || e));
    if (typeof reportError === 'function') reportError('admin-crewai', 'graduateAgent', e);
  }
}

// ─── SA-012: Rollback Agent ───
async function rollbackAgent(agentId) {
  var targetLevel = prompt('Rollback ' + agentId + ' to which level? (observe, suggest, auto_with_approval)\nLeave blank for one level down:');
  if (targetLevel === null) return; // user cancelled

  var reason = prompt('Reason for rollback (optional):') || 'manual_rollback';

  try {
    var body = { action: 'rollback', agent: agentId, reason: reason };
    if (targetLevel && targetLevel.trim()) body.to = targetLevel.trim();

    var resp = await sb.functions.invoke('crewai-graduation', { body: body });
    var result = resp.data;

    if (typeof _logAdminAction === 'function') {
      _logAdminAction('crewai_rollback', { agent: agentId, result: result });
    }

    alert(result?.message || 'Agent rolled back successfully');
    refreshCrewAIAgents();
    refreshGraduationReadiness();
  } catch (e) {
    alert('Error rolling back agent: ' + (e.message || e));
    if (typeof reportError === 'function') reportError('admin-crewai', 'rollbackAgent', e);
  }
}

// ─── SA-012: Send Digest Now ───
async function sendDigestNow() {
  try {
    var btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Sending…';

    await sb.functions.invoke('crewai-agent-digest', { body: {} });

    if (typeof _logAdminAction === 'function') {
      _logAdminAction('crewai_digest_manual', {});
    }

    btn.textContent = '✓ Sent';
    setTimeout(function() {
      btn.disabled = false;
      btn.textContent = '📧 Send Digest Now';
    }, 3000);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = '📧 Send Digest Now';
    alert('Error sending digest: ' + (e.message || e));
    if (typeof reportError === 'function') reportError('admin-crewai', 'sendDigestNow', e);
  }
}

// ─── SA-020: Cost Guardian Panel ───
async function refreshCostGuardian() {
  var el = document.getElementById('crewai-cost-guardian-panel');
  if (!el) return;
  el.innerHTML = '<p class="u-text-muted">Loading cost status…</p>';
  try {
    var resp = await sb.functions.invoke('crewai-cost-guardian', {
      body: { action: 'status' },
    });
    if (resp.error) throw resp.error;
    var summary = resp.data.summary;
    if (!summary || !summary.vendor_status) {
      el.innerHTML = '<p class="u-text-muted">No cost data available yet.</p>';
      return;
    }
    var statusColor = { ok: '#22c55e', warn: '#f59e0b', throttle: '#ef4444', hard_stop: '#7f1d1d', no_budget: '#94a3b8' };
    var rows = summary.vendor_status.map(function(v) {
      var color = statusColor[v.status] || '#94a3b8';
      var pct = v.status === 'no_budget' ? 'N/A' : v.spent_pct + '%';
      return '<tr>' +
        '<td>' + v.display_name + '</td>' +
        '<td>$' + (v.spent || 0).toFixed(2) + ' / $' + (v.budget || 0).toFixed(2) + '</td>' +
        '<td>' + pct + '</td>' +
        '<td><span style="color:' + color + '; font-weight:600;">' + v.status.toUpperCase() + '</span></td>' +
        '</tr>';
    }).join('');
    el.innerHTML =
      '<div style="display:flex; gap:12px; margin-bottom:12px;">' +
        '<div class="stat-chip"><span class="stat-num">$' + (summary.total_spent || 0).toFixed(2) + '</span><span class="stat-label">MTD Spend</span></div>' +
        '<div class="stat-chip"><span class="stat-num">$' + (summary.total_budget || 0).toFixed(2) + '</span><span class="stat-label">Total Budget</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (summary.alerts ? summary.alerts.length : 0) + '</span><span class="stat-label">Alerts</span></div>' +
      '</div>' +
      '<table class="data-table"><thead><tr><th>Vendor</th><th>Spent / Budget</th><th>%</th><th>Status</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>';
  } catch (e) {
    el.innerHTML = '<p class="u-text-muted">Error loading cost data.</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshCostGuardian', e);
  }
}

// ─── SA-020: User Support Panel ───
async function refreshUserSupport() {
  var el = document.getElementById('crewai-user-support-panel');
  if (!el) return;
  el.innerHTML = '<p class="u-text-muted">Loading support queue…</p>';
  try {
    var resp = await sb.functions.invoke('crewai-user-support', {
      body: { action: 'status' },
    });
    if (resp.error) throw resp.error;
    var q = resp.data.summary;
    if (!q) {
      el.innerHTML = '<p class="u-text-muted">No support data available yet.</p>';
      return;
    }
    var urgentColor = (q.urgent || 0) > 0 ? '#ef4444' : '#22c55e';
    el.innerHTML =
      '<div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">' +
        '<div class="stat-chip"><span class="stat-num" style="color:' + urgentColor + ';">' + (q.urgent || 0) + '</span><span class="stat-label">Urgent</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (q.high || 0) + '</span><span class="stat-label">High</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (q.unreviewed_by_marston || 0) + '</span><span class="stat-label">Awaiting Review</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (q.awaiting_triage || 0) + '</span><span class="stat-label">Needs Triage</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (q.total_open || 0) + '</span><span class="stat-label">Total Open</span></div>' +
      '</div>' +
      ((q.recent_urgent && q.recent_urgent.length > 0) ?
        '<p style="font-weight:600; margin:8px 0 4px;">High Priority Items</p>' +
        '<ul style="margin:0; padding-left:18px;">' +
          q.recent_urgent.map(function(item) {
            return '<li><strong>[' + item.triage_priority.toUpperCase() + ']</strong> ' +
              item.title + ' <span class="u-text-muted">(👍 ' + item.votes + ')</span></li>';
          }).join('') +
        '</ul>'
        : '<p class="u-text-muted">No urgent items. </p>');
  } catch (e) {
    el.innerHTML = '<p class="u-text-muted">Error loading support queue.</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshUserSupport', e);
  }
}

// ─── SA-021: Referral Pipeline Agent Panel ───
async function refreshReferralPipeline() {
  const el = document.getElementById('crewai-referral-pipeline-status');
  if (!el) return;
  el.innerHTML = '<p class="u-text-muted">Loading referral pipeline status…</p>';
  try {
    const resp = await callAgentGateway('crewai-referral-pipeline', 'status');
    if (!resp || !resp.summary) { el.innerHTML = '<p class="u-text-muted">No data available.</p>'; return; }
    const s = resp.summary;
    const f = s.fraud || {};
    const r = s.rewards || {};
    const a = s.attribution || {};

    const fraudColor = (f.high_fraud_score || 0) > 0 ? '#dc3545' : (f.medium_fraud_score || 0) > 5 ? '#fd7e14' : '#28a745';
    const rewardColor = (r.expiring_7d || 0) > 20 ? '#fd7e14' : '#28a745';
    const attribColor = parseFloat(a.conversion_rate_pct || 100) < 20 ? '#fd7e14' : '#28a745';

    el.innerHTML =
      '<p style="font-weight:600; margin:0 0 6px;">Fraud Monitor</p>' +
      '<div class="agent-stat-row">' +
        '<div class="stat-chip"><span class="stat-num" style="color:' + fraudColor + ';">' + (f.high_fraud_score || 0) + '</span><span class="stat-label">Critical Fraud</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (f.medium_fraud_score || 0) + '</span><span class="stat-label">Elevated</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (f.rejected || 0) + '</span><span class="stat-label">Rejected</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (f.total_referrals || 0) + '</span><span class="stat-label">Total</span></div>' +
      '</div>' +
      '<p style="font-weight:600; margin:8px 0 6px;">Rewards</p>' +
      '<div class="agent-stat-row">' +
        '<div class="stat-chip"><span class="stat-num" style="color:' + rewardColor + ';">' + (r.expiring_7d || 0) + '</span><span class="stat-label">Expiring 7d</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (r.unclaimed || 0) + '</span><span class="stat-label">Unclaimed</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (r.claimed || 0) + '</span><span class="stat-label">Claimed</span></div>' +
        '<div class="stat-chip"><span class="stat-num">$' + (r.total_value_usd || 0) + '</span><span class="stat-label">Total Value</span></div>' +
      '</div>' +
      '<p style="font-weight:600; margin:8px 0 6px;">Attribution</p>' +
      '<div class="agent-stat-row">' +
        '<div class="stat-chip"><span class="stat-num" style="color:' + attribColor + ';">' + (a.conversion_rate_pct || 0) + '%</span><span class="stat-label">Conv. Rate</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (a.total_invites || 0) + '</span><span class="stat-label">Invites</span></div>' +
        '<div class="stat-chip"><span class="stat-num">' + (a.orphaned_invites || 0) + '</span><span class="stat-label">Orphaned</span></div>' +
      '</div>';
  } catch (e) {
    el.innerHTML = '<p class="u-text-muted">Error loading referral pipeline status.</p>';
    if (typeof reportError === 'function') reportError('admin-crewai', 'refreshReferralPipeline', e);
  }
}
