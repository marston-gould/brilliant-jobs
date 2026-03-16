// js/admin-audit-log-viewer.js — SPEC-ADMIN-002-S2: Audit Log Viewer

var _alState = { page: 1, total: 0 };

async function loadAuditLogTab() {
  var panel = document.getElementById('admin-panel-audit-log');
  if (!panel) return;
  panel.innerHTML = [
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">',
    '  <input id="al-search" type="text" placeholder="Search action or reason…"',
    '    style="flex:1;min-width:160px;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px"',
    '    oninput="alSearchDebounced()">',
    '  <select id="al-target-type" onchange="alLoad()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '    <option value="">All Types</option>',
    '    <option value="user">user</option>',
    '    <option value="cohort">cohort</option>',
    '    <option value="billing">billing</option>',
    '    <option value="filter">filter</option>',
    '    <option value="prompt">prompt</option>',
    '  </select>',
    '  <input id="al-date-from" type="date" onchange="alLoad()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '  <input id="al-date-to" type="date" onchange="alLoad()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '  <button onclick="alExportCSV()" style="padding:6px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-dim);font-size:12px;cursor:pointer">Export CSV</button>',
    '  <span id="al-count" style="font-size:12px;color:var(--text-faint);font-family:var(--mono);align-self:center"></span>',
    '</div>',
    '<div style="overflow-x:auto"><table class="admin-table" style="width:100%;font-size:12px">',
    '  <thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>Target</th><th>Reason</th><th></th></tr></thead>',
    '  <tbody id="al-tbody"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '</table></div>',
    '<div style="display:flex;gap:8px;align-items:center;margin-top:12px">',
    '  <button onclick="alPage(-1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">← Prev</button>',
    '  <span id="al-page-info" style="font-size:12px;color:var(--text-faint);font-family:var(--mono)"></span>',
    '  <button onclick="alPage(1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;font-size:13px;cursor:pointer">Next →</button>',
    '</div>',
  ].join('');
  await alLoad();
}

var _alSearchTimer = null;
function alSearchDebounced() {
  clearTimeout(_alSearchTimer);
  _alSearchTimer = setTimeout(function(){ _alState.page=1; alLoad(); }, 350);
}

function alPage(dir) {
  _alState.page = Math.max(1, Math.min(_alState.page + dir, Math.ceil(_alState.total/50)));
  alLoad();
}

async function alLoad() {
  var tbody = document.getElementById('al-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-faint)">Loading…</td></tr>';
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-audit-log', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: document.getElementById('al-search')?.value || '',
        target_type: document.getElementById('al-target-type')?.value || '',
        date_from: document.getElementById('al-date-from')?.value || '',
        date_to: document.getElementById('al-date-to')?.value || '',
        page: _alState.page, per_page: 50,
      }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    _alState.total = data.total || 0;
    var countEl = document.getElementById('al-count');
    if (countEl) countEl.textContent = _alState.total.toLocaleString() + ' entries';
    var pageEl = document.getElementById('al-page-info');
    if (pageEl) pageEl.textContent = 'Page ' + _alState.page + ' of ' + Math.max(1, Math.ceil(_alState.total/50));

    var entries = data.entries || [];
    if (!entries.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">No audit entries</td></tr>';
      return;
    }

    tbody.innerHTML = entries.map(function(e, i) {
      var actor = e.profiles?.email || e.actor_id?.slice(0,8) + '…';
      var hasDiff = e.before || e.after;
      return '<tr>' +
        '<td style="white-space:nowrap">' + new Date(e.created_at).toLocaleString() + '</td>' +
        '<td style="font-size:11px">' + escapeHtml(actor) + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px;font-weight:500">' + escapeHtml(e.action) + '</td>' +
        '<td><span style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--bg-input);font-family:var(--mono)">' + escapeHtml(e.target_type) + '</span></td>' +
        '<td style="font-size:11px;color:var(--text-faint);max-width:200px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(e.reason || '—') + '</td>' +
        '<td>' + (hasDiff ? '<button onclick="alToggleDiff(\'diff-' + i + '\')" style="padding:2px 6px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:10px;cursor:pointer">diff</button>' : '') + '</td>' +
        '</tr>' +
        (hasDiff ? '<tr id="diff-' + i + '" style="display:none"><td colspan="6" style="background:var(--bg-main);padding:8px 12px"><pre style="font-size:10px;margin:0;overflow-x:auto;color:var(--text)">' +
          escapeHtml(JSON.stringify({ before: e.before, after: e.after }, null, 2)) +
          '</pre></td></tr>' : '');
    }).join('');
  } catch(e) {
    reportError('admin-audit-log', e);
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--red);padding:12px">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function alToggleDiff(id) {
  var row = document.getElementById(id);
  if (row) row.style.display = row.style.display === 'none' ? '' : 'none';
}

async function alExportCSV() {
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-audit-log', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        search: document.getElementById('al-search')?.value || '',
        target_type: document.getElementById('al-target-type')?.value || '',
        date_from: document.getElementById('al-date-from')?.value || '',
        date_to:   document.getElementById('al-date-to')?.value || '',
        page: 1, per_page: 10000, export_csv: true,
      }),
    });
    if (!res.ok) { toastWarning('Export failed'); return; }
    var blob = await res.blob();
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'audit-log.csv'; a.click();
    URL.revokeObjectURL(url);
  } catch(e) { reportError('admin-audit:export', e); toastWarning('Export failed: ' + e.message); }
}

(function() {
  ['loadAuditLogTab','alLoad','alPage','alSearchDebounced','alToggleDiff'].forEach(function(n) {
    if (typeof window[n] === 'function') { window.BJ[n] = window[n]; window.BJ._registry[n] = { module: 'admin-audit-log-viewer', registered: Date.now() }; }
  });
})();
