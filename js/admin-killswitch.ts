// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-killswitch.js — Extension Kill-Switch Panel (CS-013)
   Toggle the extension_kill_switch feature flag.
   View active extension scanners. Send real-time kill/resume
   commands via chrome.runtime.sendMessage (externally_connectable).
   ─────────────────────────────────────────────────────────── */

var _ksRefreshTimer = null;

async function loadKillSwitchPanel() {
  var el = document.getElementById('admin-page-killswitch');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Extension Kill Switch</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="ks-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="ks-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Toggle Card -->',
    '  <div id="ks-toggle-card" style="padding:20px;margin-bottom:20px;border-radius:8px;border:1px solid var(--border);">',
    '    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">',
    '      <div>',
    '        <div style="font-size:15px;font-weight:600;" id="ks-state-label">Loading…</div>',
    '        <div style="font-size:13px;color:var(--muted);margin-top:4px;" id="ks-state-desc"></div>',
    '      </div>',
    '      <div style="display:flex;gap:8px;align-items:center;">',
    '        <button class="admin-btn" id="ks-toggle-btn" disabled>Loading…</button>',
    '        <button class="admin-btn admin-btn-sm" id="ks-send-btn" disabled title="Send command directly to connected extension instances">📡 Send Direct</button>',
    '      </div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Active Scanners Table -->',
    '  <div style="margin-bottom:12px;">',
    '    <h3 style="font-size:14px;font-weight:600;margin-bottom:8px;">Active Extension Instances</h3>',
    '    <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Based on heartbeat and event data from the last 24 hours.</div>',
    '  </div>',
    '  <div id="ks-scanners-container" style="overflow-x:auto;">',
    '    <div class="admin-loading">Loading scanner data…</div>',
    '  </div>',
    '</div>'
  ].join('\n');

  document.getElementById('ks-refresh-btn').addEventListener('click', function() {
    _refreshKillSwitchPanel();
  });

  document.getElementById('ks-toggle-btn').addEventListener('click', _toggleKillSwitch);
  document.getElementById('ks-send-btn').addEventListener('click', _sendDirectKillCommand);

  await _refreshKillSwitchPanel();

  // Auto-refresh every 30s
  if (_ksRefreshTimer) clearInterval(_ksRefreshTimer);
  _ksRefreshTimer = setInterval(_refreshKillSwitchPanel, 30000);
}

function _cleanupKillSwitchPanel() {
  if (_ksRefreshTimer) {
    clearInterval(_ksRefreshTimer);
    _ksRefreshTimer = null;
  }
}

// ─── Refresh all data ───
async function _refreshKillSwitchPanel() {
  await Promise.all([
    _loadKillSwitchState(),
    _loadActiveScanners()
  ]);
  var ts = document.getElementById('ks-last-refresh');
  if (ts) ts.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

// ─── Load kill-switch flag state ───
async function _loadKillSwitchState() {
  var label = document.getElementById('ks-state-label');
  var desc = document.getElementById('ks-state-desc');
  var btn = document.getElementById('ks-toggle-btn');
  var sendBtn = document.getElementById('ks-send-btn');
  var card = document.getElementById('ks-toggle-card');

  try {
    var { data, error } = await sb
      .from('feature_flags')
      .select('enabled, updated_at')
      .eq('id', 'extension_kill_switch')
      .maybeSingle();

    if (error) throw error;

    var isKilled = data && (data.enabled === true);
    var updatedAt = data?.updated_at ? new Date(data.updated_at).toLocaleString() : 'never';

    if (isKilled) {
      label.textContent = '🔴 KILLED — Extension scanning is STOPPED';
      desc.textContent = 'Last changed: ' + updatedAt + '. All connected extensions will cease scanning on their next heartbeat or alarm cycle.';
      btn.textContent = '▶ Resume Extensions';
      btn.style.background = 'var(--success, #22c55e)';
      btn.style.color = '#fff';
      card.style.borderColor = 'var(--danger, #ef4444)';
      card.style.background = 'rgba(239,68,68,0.05)';
      sendBtn.textContent = '📡 Send Resume';
      sendBtn.disabled = false;
    } else {
      label.textContent = '🟢 ACTIVE — Extension scanning is RUNNING';
      desc.textContent = 'Last changed: ' + updatedAt + '. Extensions are operating normally.';
      btn.textContent = '⏹ Kill Extensions';
      btn.style.background = 'var(--danger, #ef4444)';
      btn.style.color = '#fff';
      card.style.borderColor = 'var(--success, #22c55e)';
      card.style.background = 'rgba(34,197,94,0.05)';
      sendBtn.textContent = '📡 Send Kill';
      sendBtn.disabled = false;
    }

    btn.disabled = false;
    btn.dataset.killed = isKilled ? 'true' : 'false';
  } catch (e) {
    label.textContent = '⚠ Error loading kill-switch state';
    desc.textContent = e.message;
    btn.disabled = true;
    sendBtn.disabled = true;
  }
}

// ─── Toggle the flag in DB ───
async function _toggleKillSwitch() {
  var btn = document.getElementById('ks-toggle-btn');
  var isCurrentlyKilled = btn.dataset.killed === 'true';
  var newValue = !isCurrentlyKilled;

  var confirmMsg = newValue
    ? 'KILL all extension scanning? Connected extensions will stop within 60 seconds.'
    : 'RESUME extension scanning? Connected extensions will resume within 60 seconds.';

  if (!confirm(confirmMsg)) return;

  btn.disabled = true;
  btn.textContent = 'Saving…';

  try {
    var { error } = await sb
      .from('feature_flags')
      .upsert({
        id: 'extension_kill_switch',
        enabled: newValue,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });

    if (error) throw error;

    // Log admin action
    if (typeof _logAdminAction === 'function') {
      _logAdminAction('kill_switch_toggle', {
        new_state: newValue ? 'killed' : 'active',
        source: 'admin_panel'
      });
    }

    await _refreshKillSwitchPanel();
  } catch (e) {
    alert('Error toggling kill switch: ' + e.message);
    btn.disabled = false;
  }
}

// ─── Send direct command to extension via externally_connectable ───
async function _sendDirectKillCommand() {
  var btn = document.getElementById('ks-send-btn');
  var toggleBtn = document.getElementById('ks-toggle-btn');
  var isCurrentlyKilled = toggleBtn.dataset.killed === 'true';

  // Read the extension ID from extension_events or use known ID
  var extensionId = null;
  try {
    var { data } = await sb
      .from('extension_events')
      .select('event_data')
      .order('created_at', { ascending: false })
      .limit(1);
    // Try to extract extension ID from event_data if available
    if (data?.[0]?.event_data?.extension_id) {
      extensionId = data[0].event_data.extension_id;
    }
  } catch (e) {
    reportError('admin_killswitch', e);
    console.warn('[kill-switch] Could not look up extension ID:', e.message);
  }

  if (!extensionId) {
    alert('No extension ID found in recent events. The extension may not have sent events recently. The DB flag will still take effect on the next heartbeat cycle.');
    return;
  }

  btn.disabled = true;
  btn.textContent = '📡 Sending…';

  try {
    // Use chrome.runtime.sendMessage if available (admin must be on same device as extension)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      var command = isCurrentlyKilled ? 'resume' : 'kill';
      chrome.runtime.sendMessage(extensionId, {
        type: 'bj:admin:' + command,
        reason: 'Admin panel toggle',
        timestamp: Date.now()
      }, function(response) {
        if (chrome.runtime.lastError) {
          alert('Direct command failed: ' + chrome.runtime.lastError.message + '\nThe DB flag will still take effect on the next heartbeat cycle.');
        } else {
          alert('Direct ' + command.toUpperCase() + ' command sent successfully. Extension responded: ' + JSON.stringify(response || {}));
        }
        btn.disabled = false;
        btn.textContent = isCurrentlyKilled ? '📡 Send Resume' : '📡 Send Kill';
      });
    } else {
      alert('chrome.runtime.sendMessage is not available in this context. The DB flag will take effect on the next heartbeat cycle (up to 60s).');
      btn.disabled = false;
      btn.textContent = isCurrentlyKilled ? '📡 Send Resume' : '📡 Send Kill';
    }
  } catch (e) {
    alert('Send error: ' + e.message);
    btn.disabled = false;
    btn.textContent = isCurrentlyKilled ? '📡 Send Resume' : '📡 Send Kill';
  }
}

// ─── Load active scanners from extension_events ───
async function _loadActiveScanners() {
  var container = document.getElementById('ks-scanners-container');
  if (!container) return;

  try {
    // Get distinct users with recent extension activity (last 24h)
    var since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    var { data, error } = await sb
      .from('extension_events')
      .select('user_id, event_type, extension_version, ats_platform, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="admin-empty">No extension activity in the last 24 hours.</div>';
      return;
    }

    // Aggregate by user
    var userMap = {};
    data.forEach(function(ev) {
      var uid = ev.user_id || 'unknown';
      if (!userMap[uid]) {
        userMap[uid] = {
          user_id: uid,
          event_count: 0,
          last_seen: ev.created_at,
          version: ev.extension_version || '—',
          types: {}
        };
      }
      userMap[uid].event_count++;
      if (ev.event_type) {
        userMap[uid].types[ev.event_type] = (userMap[uid].types[ev.event_type] || 0) + 1;
      }
    });

    var users = Object.values(userMap).sort(function(a, b) {
      return new Date(b.last_seen) - new Date(a.last_seen);
    });

    var html = '<table class="admin-table" style="width:100%">';
    html += '<thead><tr>';
    html += '<th>User ID</th>';
    html += '<th>Events (24h)</th>';
    html += '<th>Last Seen</th>';
    html += '<th>Version</th>';
    html += '<th>Event Types</th>';
    html += '</tr></thead><tbody>';

    users.forEach(function(u) {
      var ago = _timeAgo(u.last_seen);
      var types = Object.entries(u.types).map(function(pair) {
        return pair[0] + ' (' + pair[1] + ')';
      }).join(', ');

      html += '<tr>';
      html += '<td style="font-family:monospace;font-size:12px;">' + _escHtml(u.user_id.substring(0, 12)) + '…</td>';
      html += '<td>' + u.event_count + '</td>';
      html += '<td title="' + _escHtml(u.last_seen) + '">' + ago + '</td>';
      html += '<td>' + _escHtml(u.version) + '</td>';
      html += '<td style="font-size:12px;">' + _escHtml(types) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '<div style="font-size:12px;color:var(--muted);margin-top:8px;">' + users.length + ' active user(s) · ' + data.length + ' events in last 24h</div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="admin-empty">Error loading scanner data: ' + _escHtml(e.message) + '</div>';
  }
}

function _timeAgo(dateStr) {
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

function _escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
