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
    '    <span class="text-faint" style="font-size:11px">Last run: ' + lastRun + '</span>',
    '    <div class="crewai-card-actions">',
    '      <button class="btn btn-sm u-btn-pill" onclick="toggleCrewAIAgent(\'' + agent.id + '\')">' + (agent.enabled ? '⏸ Disable' : '▶ Enable') + '</button>',
    '      <button class="btn btn-sm u-btn-pill" onclick="runCrewAIAgent(\'' + agent.id + '\')">▶ Run Now</button>',
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
