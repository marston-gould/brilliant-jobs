/* ───────────────────────────────────────────────────────────
   admin-error-replay.js — PostHog Error Replay Integration (AD-FIX-13)
   CS-024: Error events from PostHog with session replay deep links.
   Query errors + autocaptured exceptions with "View Replay" buttons.
   ─────────────────────────────────────────────────────────── */

var _errorReplayRefreshTimer = null;
var _errorReplayHoursFilter = 24;

var ADMIN_ANALYTICS_URL = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/admin-analytics';

async function loadErrorReplayPanel() {
  var el = document.getElementById('admin-page-error-replay');
  if (!el) return;

  el.innerHTML = [
    '<div class="admin-block">',
    '  <div class="admin-block-header">',
    '    <h2 class="admin-block-title">Error Replay</h2>',
    '    <div class="admin-block-actions">',
    '      <select id="er-hours-filter" style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text-main);font-size:12px;margin-right:6px;">',
    '        <option value="1">Last 1h</option>',
    '        <option value="6">Last 6h</option>',
    '        <option value="24" selected>Last 24h</option>',
    '        <option value="72">Last 3d</option>',
    '        <option value="168">Last 7d</option>',
    '      </select>',
    '      <span id="er-last-refresh" style="font-size:12px;color:var(--muted);margin-right:8px;"></span>',
    '      <button class="admin-btn admin-btn-sm" id="er-refresh-btn">↻ Refresh</button>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Summary Cards -->',
    '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;" id="er-summary-cards">',
    '    <div class="stat-card"><div class="stat-val" id="er-total-errors">—</div><div class="stat-label">Query Errors</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="er-total-exceptions">—</div><div class="stat-label">Exceptions</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="er-with-replay">—</div><div class="stat-label">With Replay</div></div>',
    '    <div class="stat-card"><div class="stat-val" id="er-unique-labels">—</div><div class="stat-label">Unique Labels</div></div>',
    '  </div>',
    '',
    '  <!-- Query Errors Table -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;margin-bottom:20px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Query Errors (reportError)</div>',
    '    <div id="er-errors-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading error events…</div>',
    '    </div>',
    '  </div>',
    '',
    '  <!-- Autocaptured Exceptions Table -->',
    '  <div style="background:var(--bg-input);border-radius:10px;border:1px solid var(--border);padding:16px;">',
    '    <div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.5px;margin-bottom:12px;">Autocaptured Exceptions ($exception)</div>',
    '    <div id="er-exceptions-body" style="overflow-x:auto;">',
    '      <div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">Loading exceptions…</div>',
    '    </div>',
    '  </div>',
    '</div>'
  ].join('\n');

  // Bind
  document.getElementById('er-refresh-btn').addEventListener('click', function() { _refreshErrorReplay(); });
  document.getElementById('er-hours-filter').addEventListener('change', function() {
    _errorReplayHoursFilter = parseInt(this.value, 10) || 24;
    _refreshErrorReplay();
  });

  await _refreshErrorReplay();

  if (_errorReplayRefreshTimer) clearInterval(_errorReplayRefreshTimer);
  _errorReplayRefreshTimer = setInterval(_refreshErrorReplay, 120000);
}

async function _refreshErrorReplay() {
  var lastEl = document.getElementById('er-last-refresh');
  if (lastEl) lastEl.textContent = 'Refreshing…';

  try {
    var token = '';
    if (typeof sb !== 'undefined') {
      var sess = await sb.auth.getSession();
      token = (sess.data && sess.data.session) ? sess.data.session.access_token : '';
    }

    var url = ADMIN_ANALYTICS_URL + '?action=posthog-errors&hours=' + _errorReplayHoursFilter + '&limit=50';
    var res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      var errText = await res.text();
      throw new Error('API ' + res.status + ': ' + errText);
    }

    var data = await res.json();
    _renderErrorEvents(data.errors || []);
    _renderExceptionEvents(data.exceptions || []);
    _updateErrorSummary(data.errors || [], data.exceptions || []);

  } catch (e) {
    console.error('[ErrorReplay] Refresh error:', e);
    if (typeof reportError === 'function') reportError('admin-error-replay', e);
    var errBody = document.getElementById('er-errors-body');
    if (errBody) errBody.innerHTML = '<div style="color:#ef4444;font-size:13px;padding:8px;">Error loading data: ' + _erEsc(e.message) + '</div>';
  }

  if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();
}

function _updateErrorSummary(errors, exceptions) {
  var totalEl = document.getElementById('er-total-errors');
  var excEl = document.getElementById('er-total-exceptions');
  var replayEl = document.getElementById('er-with-replay');
  var labelsEl = document.getElementById('er-unique-labels');

  if (totalEl) totalEl.textContent = errors.length;
  if (excEl) excEl.textContent = exceptions.length;

  var withReplay = errors.filter(function(e) { return e.replay_url; }).length +
                   exceptions.filter(function(e) { return e.replay_url; }).length;
  if (replayEl) {
    replayEl.textContent = withReplay;
    replayEl.style.color = withReplay > 0 ? '#22c55e' : 'var(--muted)';
  }

  var labels = {};
  errors.forEach(function(e) { labels[e.label] = true; });
  if (labelsEl) labelsEl.textContent = Object.keys(labels).length;
}

function _renderErrorEvents(errors) {
  var container = document.getElementById('er-errors-body');
  if (!container) return;

  if (!errors.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">No query errors in this time window.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr><th>Time</th><th>Label</th><th>Error</th><th>Page</th><th>Replay</th></tr></thead><tbody>';

  errors.forEach(function(evt) {
    var time = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—';
    var replayBtn = evt.replay_url
      ? '<a href="' + _erEsc(evt.replay_url) + '" target="_blank" rel="noopener" class="admin-btn admin-btn-sm" style="font-size:11px;padding:2px 8px;text-decoration:none;">▶ Replay</a>'
      : '<span style="color:var(--muted);font-size:11px;">No session</span>';

    html += '<tr>' +
      '<td style="white-space:nowrap;">' + _erEsc(time) + '</td>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _erEsc(evt.label) + '</code></td>' +
      '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;" title="' + _erEsc(evt.error_message) + '">' + _erEsc(evt.error_message).substring(0, 80) + '</td>' +
      '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;">' + _erEsc(evt.page) + '</td>' +
      '<td style="text-align:center;">' + replayBtn + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _renderExceptionEvents(exceptions) {
  var container = document.getElementById('er-exceptions-body');
  if (!container) return;

  if (!exceptions.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:16px;">No autocaptured exceptions in this time window.</div>';
    return;
  }

  var html = '<table class="admin-table" style="width:100%;font-size:12px;">' +
    '<thead><tr><th>Time</th><th>Type</th><th>Message</th><th>Page</th><th>Replay</th></tr></thead><tbody>';

  exceptions.forEach(function(evt) {
    var time = evt.timestamp ? new Date(evt.timestamp).toLocaleString() : '—';
    var replayBtn = evt.replay_url
      ? '<a href="' + _erEsc(evt.replay_url) + '" target="_blank" rel="noopener" class="admin-btn admin-btn-sm" style="font-size:11px;padding:2px 8px;text-decoration:none;">▶ Replay</a>'
      : '<span style="color:var(--muted);font-size:11px;">No session</span>';

    html += '<tr>' +
      '<td style="white-space:nowrap;">' + _erEsc(time) + '</td>' +
      '<td><code style="font-size:11px;background:var(--bg-card);padding:1px 4px;border-radius:3px;">' + _erEsc(evt.type) + '</code></td>' +
      '<td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;" title="' + _erEsc(evt.message) + '">' + _erEsc(evt.message).substring(0, 80) + '</td>' +
      '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;">' + _erEsc(evt.page) + '</td>' +
      '<td style="text-align:center;">' + replayBtn + '</td>' +
      '</tr>';
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function _erEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _cleanupErrorReplayPanel() {
  if (_errorReplayRefreshTimer) {
    clearInterval(_errorReplayRefreshTimer);
    _errorReplayRefreshTimer = null;
  }
}

window.loadErrorReplayPanel = loadErrorReplayPanel;
window._cleanupErrorReplayPanel = _cleanupErrorReplayPanel;
