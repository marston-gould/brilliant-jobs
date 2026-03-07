/* ───────────────────────────────────────────────────────────
   admin-cron.js — Cron Health Panel (AD-FIX-06)
   CS-012: Query v_cron_health view, color-coded status, auto-refresh 60s
   ─────────────────────────────────────────────────────────── */

var _cronRefreshTimer = null;

async function loadCronPanel() {
  var el = document.getElementById('admin-page-cron');
  if (!el) return;

  el.innerHTML = `
    <div class="admin-block">
      <div class="admin-block-header">
        <h2 class="admin-block-title">Cron Job Health</h2>
        <div class="admin-block-actions">
          <span id="cron-summary" style="font-size:13px;color:var(--muted);margin-right:12px;"></span>
          <span id="cron-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>
          <button class="admin-btn admin-btn-sm" id="cron-refresh-btn">↻ Refresh</button>
        </div>
      </div>
      <div id="cron-filters" style="padding:8px 0;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="admin-btn admin-btn-sm admin-btn-active" data-cron-filter="all">All</button>
        <button class="admin-btn admin-btn-sm" data-cron-filter="red">🔴 Failed</button>
        <button class="admin-btn admin-btn-sm" data-cron-filter="amber">🟡 Stale</button>
        <button class="admin-btn admin-btn-sm" data-cron-filter="green">🟢 Healthy</button>
        <button class="admin-btn admin-btn-sm" data-cron-filter="disabled">⚫ Disabled</button>
      </div>
      <div id="cron-table-container" style="overflow-x:auto;">
        <div class="admin-loading">Loading cron data…</div>
      </div>
    </div>
  `;

  // Bind refresh button
  document.getElementById('cron-refresh-btn').addEventListener('click', function() {
    _refreshCronPanel();
  });

  // Bind filter buttons
  document.querySelectorAll('[data-cron-filter]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('[data-cron-filter]').forEach(function(b) {
        b.classList.remove('admin-btn-active');
      });
      btn.classList.add('admin-btn-active');
      var filter = btn.getAttribute('data-cron-filter');
      _applyCronFilter(filter);
    });
  });

  // Initial load
  await _refreshCronPanel();

  // Auto-refresh every 60s
  if (_cronRefreshTimer) clearInterval(_cronRefreshTimer);
  _cronRefreshTimer = setInterval(_refreshCronPanel, 60000);
}

async function _refreshCronPanel() {
  var container = document.getElementById('cron-table-container');
  if (!container) return;

  try {
    var { data, error } = await sb
      .from('v_cron_health')
      .select('*');

    if (error) {
      container.innerHTML = '<div class="admin-empty">Error loading cron data: ' + error.message + '</div>';
      return;
    }

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="admin-empty">No cron jobs found.</div>';
      return;
    }

    // Update summary
    var counts = { green: 0, amber: 0, red: 0, disabled: 0, unknown: 0 };
    data.forEach(function(j) { counts[j.health] = (counts[j.health] || 0) + 1; });
    var summary = document.getElementById('cron-summary');
    if (summary) {
      summary.innerHTML =
        '<span style="color:#22c55e;">' + counts.green + ' healthy</span> · ' +
        '<span style="color:#f59e0b;">' + counts.amber + ' stale</span> · ' +
        '<span style="color:#ef4444;">' + counts.red + ' failed</span> · ' +
        '<span style="color:#6b7280;">' + counts.disabled + ' disabled</span> · ' +
        '<strong>' + data.length + ' total</strong>';
    }

    var lastRefresh = document.getElementById('cron-last-refresh');
    if (lastRefresh) {
      lastRefresh.textContent = 'Updated ' + new Date().toLocaleTimeString();
    }

    // Store data for filtering
    window._cronData = data;

    // Render table
    _renderCronTable(data);

    // Apply current filter
    var activeFilter = document.querySelector('[data-cron-filter].admin-btn-active');
    if (activeFilter) {
      var filter = activeFilter.getAttribute('data-cron-filter');
      if (filter !== 'all') _applyCronFilter(filter);
    }

  } catch(e) {
    console.error('[Admin] Cron panel error:', e);
    container.innerHTML = '<div class="admin-empty">Error: ' + e.message + '</div>';
  }
}

function _renderCronTable(data) {
  var container = document.getElementById('cron-table-container');
  if (!container) return;

  var healthDot = { green: '🟢', amber: '🟡', red: '🔴', disabled: '⚫', unknown: '⚪' };

  var rows = data.map(function(j) {
    var dot = healthDot[j.health] || '⚪';
    var ago = j.last_start ? _timeAgo(new Date(j.last_start)) : '—';
    var dur = j.last_duration_s != null ? (parseFloat(j.last_duration_s) < 60
      ? parseFloat(j.last_duration_s).toFixed(1) + 's'
      : (parseFloat(j.last_duration_s) / 60).toFixed(1) + 'm')
      : '—';
    var msg = j.last_message ? _escHtml(j.last_message.substring(0, 120)) : '';
    var schedDesc = _describeCron(j.schedule);

    return '<tr data-cron-health="' + j.health + '">' +
      '<td style="white-space:nowrap;">' + dot + '</td>' +
      '<td style="font-weight:500;">' + _escHtml(j.jobname || '(unnamed)') + '</td>' +
      '<td><code style="font-size:11px;">' + _escHtml(j.schedule) + '</code><br><span style="font-size:11px;color:var(--muted);">' + schedDesc + '</span></td>' +
      '<td>' + (j.active ? 'Yes' : '<span style="color:var(--muted);">No</span>') + '</td>' +
      '<td>' + (j.last_status || '—') + '</td>' +
      '<td style="white-space:nowrap;">' + ago + '</td>' +
      '<td>' + dur + '</td>' +
      '<td style="font-size:11px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + msg + '">' + msg + '</td>' +
      '</tr>';
  }).join('');

  container.innerHTML = `
    <table class="admin-table" id="cron-table" style="width:100%;">
      <thead>
        <tr>
          <th style="width:30px;"></th>
          <th>Job Name</th>
          <th>Schedule</th>
          <th>Active</th>
          <th>Last Status</th>
          <th>Last Run</th>
          <th>Duration</th>
          <th>Message</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function _applyCronFilter(filter) {
  var rows = document.querySelectorAll('#cron-table tbody tr');
  rows.forEach(function(row) {
    if (filter === 'all') {
      row.style.display = '';
    } else {
      row.style.display = row.getAttribute('data-cron-health') === filter ? '' : 'none';
    }
  });
}

function _describeCron(schedule) {
  if (!schedule) return '';
  var parts = schedule.split(' ');
  if (parts.length < 5) return schedule;
  var min = parts[0], hour = parts[1], dom = parts[2], mon = parts[3], dow = parts[4];

  if (min.startsWith('*/') && hour === '*') return 'Every ' + min.slice(2) + ' min';
  if (min === '0' && hour.startsWith('*/')) return 'Every ' + hour.slice(2) + ' hrs';
  if (min === '0' && hour !== '*' && dom === '*') return 'Daily at ' + hour + ':00 UTC';
  if (min !== '*' && hour !== '*' && dom === '*') return 'Daily at ' + hour + ':' + min.padStart(2, '0') + ' UTC';
  if (dow !== '*') return 'Weekly (dow=' + dow + ')';
  return schedule;
}

function _timeAgo(date) {
  var secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return secs + 's ago';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm ago';
  var days = Math.floor(hrs / 24);
  return days + 'd ' + (hrs % 24) + 'h ago';
}

function _escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Cleanup on tab switch
function _cleanupCronPanel() {
  if (_cronRefreshTimer) {
    clearInterval(_cronRefreshTimer);
    _cronRefreshTimer = null;
  }
}

// Export
window.loadCronPanel = loadCronPanel;
window._cleanupCronPanel = _cleanupCronPanel;

// CS-P1-004 FE-005: Register admin-cron exports with BJ namespace
(function() {
  ['_cleanupCronPanel','_cronData','loadCronPanel'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-cron', registered: Date.now() };
    }
  });
})();
