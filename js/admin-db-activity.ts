/* ───────────────────────────────────────────────────────────
   admin-db-activity.js — Database Activity Panel (AD-FIX-15)
   CS-024: Connections, slow queries, table sizes via pg_stat.
   Data from admin-analytics EF (proxied SQL functions).
   ─────────────────────────────────────────────────────────── */

var _dbActivityRefreshTimer = null;

var DB_ANALYTICS_URL = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/admin-analytics';

async function loadDbActivityPanel() {
  var el = document.getElementById('admin-page-db-activity');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Database Activity</h2>',
    '    <div class="admin-block-actions">',
    '      <span id="dba-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="dba-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Summary Cards -->',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;" id="dba-summary-cards">',
    '    <div class="stat-card"><div class="stat-val" id="dba-db-size">—</div><div class="stat-label">Database Size</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="dba-active-conn">—</div><div class="stat-label">Active Connections</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="dba-max-conn">—</div><div class="stat-label">Max Connections</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="dba-conn-pct">—</div><div class="stat-label">Connection Usage</div></div>',
    '  </div>',
    '',
    '  <!-- Connections by State -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Connections by State</div>',
    '    <div id="dba-connections-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading connections…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Table Sizes -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Table Sizes (Top 50)</div>',
    '    <div id="dba-tables-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading table sizes…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Slow Queries -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Slow Queries (by avg exec time)</div>',
    '    <div id="dba-queries-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading query stats…</div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  document.getElementById('dba-refresh-btn').addEventListener('click', function() { _refreshDbActivity(); });

  await _refreshDbActivity();

  if (_dbActivityRefreshTimer) clearInterval(_dbActivityRefreshTimer);
  _dbActivityRefreshTimer = setInterval(_refreshDbActivity, 120000);
}

async function _refreshDbActivity() {
  var lastEl = document.getElementById('dba-last-refresh');
  if (lastEl) lastEl.textContent = 'Refreshing…';

  try {
    var token = '';
    if (typeof sb !== 'undefined') {
      var sess = await sb.auth.getSession();
      token = (sess.data && sess.data.session) ? sess.data.session.access_token : '';
    }

    var res = await fetch(DB_ANALYTICS_URL + '?action=db-activity', {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    if (!res.ok) throw new Error('API ' + res.status);
    var data = await res.json();

    _renderDbSummary(data.db_size, data.connections);
    _renderConnections(data.connections, data.connections_error);
    _renderTableSizes(data.tables, data.tables_error);
    _renderSlowQueries(data.slow_queries, data.slow_queries_error);

  } catch (e) {
    console.error('[DbActivity] Refresh error:', e);
    if (typeof reportError === 'function') reportError('admin-db-activity', e);
  }

  if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function _renderDbSummary(dbSize, connections) {
  var el;

  el = document.getElementById('dba-db-size');
  if (el && dbSize) el.textContent = dbSize.db_size || '—';

  var totalConn = 0;
  if (connections && connections.length) {
    connections.forEach(function(c) { totalConn += parseInt(c.count, 10) || 0; });
  }

  el = document.getElementById('dba-active-conn');
  if (el) {
    el.textContent = totalConn;
    el.style.color = totalConn > 100 ? '#ef4444' : totalConn > 50 ? '#f59e0b' : 'var(--text)';
  }

  var maxConn = (dbSize && dbSize.max_connections) || 100;
  el = document.getElementById('dba-max-conn');
  if (el) el.textContent = maxConn;

  el = document.getElementById('dba-conn-pct');
  if (el) {
    var pct = Math.round((totalConn / maxConn) * 100);
    el.textContent = pct + '%';
    el.style.color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';
  }
}

function _renderConnections(connections, error) {
  var container = document.getElementById('dba-connections-body');
  if (!container) return;

  if (error) {
    container.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: ' + _dbaEsc(error) + '</div>';
    return;
  }

  if (!connections || !connections.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">No connection data available.</div>';
    return;
  }

  // Render as visual bars + table
  var total = 0;
  connections.forEach(function(c) { total += parseInt(c.count, 10) || 0; });

  var html = '<div style="display:flex;gap:4px;height:28px;border-radius:6px;overflow:hidden;margin-bottom:12px;">';
  var stateColors = { 'active': '#22c55e', 'idle': '#60a5fa', 'idle in transaction': '#f59e0b', 'unknown': '#94a3b8' };

  connections.forEach(function(c) {
    var pct = total > 0 ? ((parseInt(c.count, 10) || 0) / total * 100) : 0;
    var color = stateColors[c.state] || '#94a3b8';
    if (pct > 3) {
      html += '<div style="width:' + pct + '%;background:' + color + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:600;min-width:30px;" title="' + _dbaEsc(c.state) + ': ' + c.count + '">' +
        c.count + '</div>';
    }
  });
  html += '</div>';

  html += '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr><th>State</th><th style="text-align:right;">Count</th><th style="text-align:right;">Max Duration (s)</th><th style="text-align:right;">Waiting</th></tr></thead><tbody>';

  connections.forEach(function(c) {
    var color = stateColors[c.state] || '#94a3b8';
    html += '<tr>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px;"></span>' + _dbaEsc(c.state) + '</td>' +
      '<td style="text-align:right;font-weight:600;">' + c.count + '</td>' +
      '<td style="text-align:right;">' + (c.max_duration_seconds || '—') + '</td>' +
      '<td style="text-align:right;">' + (c.waiting || 0) + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _renderTableSizes(tables, error) {
  var container = document.getElementById('dba-tables-body');
  if (!container) return;

  if (error) {
    container.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: ' + _dbaEsc(error) + '</div>';
    return;
  }

  if (!tables || !tables.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">No table data available.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr>' +
    '<th>Table</th>' +
    '<th style="text-align:right;">Rows (est.)</th>' +
    '<th style="text-align:right;">Total Size</th>' +
    '<th style="text-align:right;">Index Size</th>' +
    '<th>Size Bar</th>' +
    '</tr></thead><tbody>';

  var maxBytes = tables[0] ? (parseInt(tables[0].total_bytes, 10) || 1) : 1;

  tables.forEach(function(t) {
    var barPct = Math.max(2, Math.round((parseInt(t.total_bytes, 10) || 0) / maxBytes * 100));
    var barColor = barPct > 80 ? '#ef4444' : barPct > 40 ? '#f59e0b' : '#60a5fa';
    var tableName = t.table_name || '—';
    var schema = t.schema_name || 'public';
    var displayName = schema === 'public' ? tableName : schema + '.' + tableName;

    html += '<tr>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _dbaEsc(displayName) + '</code></td>' +
      '<td style="text-align:right;">' + _dbaFormatNum(t.row_estimate) + '</td>' +
      '<td style="text-align:right;font-weight:600;">' + _dbaEsc(t.total_size) + '</td>' +
      '<td style="text-align:right;">' + _dbaEsc(t.index_size) + '</td>' +
      '<td style="width:120px;"><div style="height:10px;background:var(--bg-card);border-radius:4px;overflow:hidden;">' +
      '<div style="height:100%;width:' + barPct + '%;background:' + barColor + ';border-radius:4px;"></div></div></td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _renderSlowQueries(queries, error) {
  var container = document.getElementById('dba-queries-body');
  if (!container) return;

  if (error) {
    container.innerHTML = '<div style="color:#ef4444;font-size:13px;">Error: ' + _dbaEsc(error) + '</div>';
    return;
  }

  if (!queries || !queries.length) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">No query stats available. pg_stat_statements may not be enabled.</div>';
    return;
  }

  // Check for fallback message
  if (queries.length === 1 && queries[0].query_text && queries[0].query_text.indexOf('not enabled') !== -1) {
    container.innerHTML = '<div style="color:var(--muted);font-size:13px;">' + _dbaEsc(queries[0].query_text) + '</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr>' +
    '<th>Query (truncated)</th>' +
    '<th style="text-align:right;">Calls</th>' +
    '<th style="text-align:right;">Mean (ms)</th>' +
    '<th style="text-align:right;">Max (ms)</th>' +
    '<th style="text-align:right;">Total (ms)</th>' +
    '<th style="text-align:right;">Rows</th>' +
    '</tr></thead><tbody>';

  queries.forEach(function(q) {
    var meanColor = q.mean_time_ms > 500 ? '#ef4444' : q.mean_time_ms > 100 ? '#f59e0b' : 'var(--text-main)';

    html += '<tr>' +
      '<td style="max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + _dbaEsc(q.query_text) + '">' +
      '<code style="font-size:10px;">' + _dbaEsc(q.query_text) + '</code></td>' +
      '<td style="text-align:right;">' + _dbaFormatNum(q.calls) + '</td>' +
      '<td style="text-align:right;color:' + meanColor + ';font-weight:600;">' + _dbaFormatMs(q.mean_time_ms) + '</td>' +
      '<td style="text-align:right;">' + _dbaFormatMs(q.max_time_ms) + '</td>' +
      '<td style="text-align:right;">' + _dbaFormatMs(q.total_time_ms) + '</td>' +
      '<td style="text-align:right;">' + _dbaFormatNum(q.rows_returned) + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _dbaFormatNum(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString();
}

function _dbaFormatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  var n = parseFloat(ms);
  if (n >= 1000) return (n / 1000).toFixed(1) + 's';
  return n.toFixed(1) + 'ms';
}

function _dbaEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _cleanupDbActivityPanel() {
  if (_dbActivityRefreshTimer) {
    clearInterval(_dbActivityRefreshTimer);
    _dbActivityRefreshTimer = null;
  }
}

window.loadDbActivityPanel = loadDbActivityPanel;
window._cleanupDbActivityPanel = _cleanupDbActivityPanel;

// CS-P1-004 FE-005: Register admin-db-activity exports with BJ namespace
(function() {
  ['_cleanupDbActivityPanel','loadDbActivityPanel'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-db-activity', registered: Date.now() };
    }
  });
})();
