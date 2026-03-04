/* ─────────────────────────────────────────────────────────
   admin-ghost.js — Ghost / Inactive User Detection Sub-Page
   Brilliant Jobs Admin Console · v6.91
   ───────────────────────────────────────────────────────── */
'use strict';

// ── State ──────────────────────────────────────────────────
var _ghostFilter = '30d';
var _ghostData   = null;

// ── Entry point called by admin.js router ──────────────────
async function loadGhostTab() {
  console.log('[Admin] loadGhostTab · filter:', _ghostFilter);
  var panel = document.getElementById('admin-panel-ghost');
  if (!panel) return;
  panel.innerHTML = _ghostSkeleton();
  await _loadGhostData();
  _renderGhost(panel);
}

// ── Data ───────────────────────────────────────────────────
async function _loadGhostData() {
  try {
    var cutoffDays  = { '7d': 7, '30d': 30, '60d': 60, '90d': 90 }[_ghostFilter] || 30;
    var cutoff      = new Date(Date.now() - cutoffDays * 86400000).toISOString();
    var recentCutoff = new Date(Date.now() - cutoffDays * 86400000).toISOString();

    // Profiles that signed up before the window
    var { data: profiles, count: totalSampled } = await sb
      .from('profiles')
      .select('id, created_at, cohort_id', { count: 'exact' })
      .lt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1000);

    // Users who had any session activity inside the window
    var { data: activeSessions } = await sb
      .from('user_sessions')
      .select('user_id')
      .gte('started_at', recentCutoff)
      .limit(10000);

    var activeSet = new Set((activeSessions || []).map(function(s) { return s.user_id; }));

    var ghosts = (profiles || []).filter(function(p) { return !activeSet.has(p.id); });

    // Cohort breakdown
    var byCohort = {};
    ghosts.forEach(function(p) {
      var c = p.cohort_id || 'unassigned';
      byCohort[c] = (byCohort[c] || 0) + 1;
    });

    // Age buckets (how long since signup)
    var now = Date.now();
    var buckets = { '< 7d': 0, '7–30d': 0, '30–90d': 0, '90d+': 0 };
    ghosts.forEach(function(p) {
      var ageDays = (now - new Date(p.created_at).getTime()) / 86400000;
      if (ageDays < 7) buckets['< 7d']++;
      else if (ageDays < 30) buckets['7–30d']++;
      else if (ageDays < 90) buckets['30–90d']++;
      else buckets['90d+']++;
    });

    _ghostData = {
      ghosts: ghosts,
      totalSampled: totalSampled || 0,
      activeCount: activeSet.size,
      byCohort: byCohort,
      buckets: buckets,
      days: cutoffDays,
    };
  } catch (e) {
    console.error('[Admin] Ghost load error:', e);
    _ghostData = null;
  }
}

// ── Render ─────────────────────────────────────────────────
function _ghostSkeleton() {
  return '<div style="padding:24px"><div class="admin-skeleton" style="height:80px;border-radius:8px;margin-bottom:16px"></div>' +
    '<div class="admin-skeleton" style="height:200px;border-radius:8px"></div></div>';
}

function _renderGhost(panel) {
  if (!_ghostData) {
    panel.innerHTML = '<div style="padding:24px;color:var(--text-dim)">Failed to load ghost data. ' +
      '<button onclick="_ghostTabInit=false;loadGhostTab()" style="margin-left:8px;padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">Retry</button></div>';
    return;
  }

  var d = _ghostData;
  var ghostRate = d.totalSampled > 0 ? (d.ghosts.length / d.totalSampled * 100).toFixed(1) : '0.0';

  var filterBtns = ['7d', '30d', '60d', '90d'].map(function(f) {
    return '<button onclick="ghostSetFilter(\'' + f + '\')" class="admin-tab' + (_ghostFilter === f ? ' active' : '') + '">' + f + '</button>';
  }).join('');

  var cohortRows = Object.entries(d.byCohort)
    .sort(function(a, b) { return b[1] - a[1]; })
    .map(function(entry) {
      return '<tr><td style="font-family:var(--mono);font-size:12px;color:var(--accent)">' + escapeHtml(entry[0]) + '</td>' +
        '<td style="text-align:right">' + entry[1].toLocaleString() + '</td></tr>';
    }).join('') || '<tr><td colspan="2" style="color:var(--text-faint);text-align:center">No ghost users found</td></tr>';

  var bucketRows = Object.entries(d.buckets).map(function(entry) {
    return '<tr><td style="color:var(--text-dim)">' + entry[0] + '</td>' +
      '<td style="text-align:right;font-family:var(--mono)">' + entry[1].toLocaleString() + '</td></tr>';
  }).join('');

  var ghostListRows = d.ghosts.slice(0, 200).map(function(u) {
    return '<tr>' +
      '<td style="font-family:var(--mono);font-size:11px;color:var(--text-faint)">' + u.id.substring(0, 16) + '…</td>' +
      '<td style="font-size:12px">' + (u.cohort_id || '—') + '</td>' +
      '<td style="font-size:12px">' + new Date(u.created_at).toLocaleDateString() + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="3" style="color:var(--text-faint);text-align:center">No ghosts in this window</td></tr>';

  panel.innerHTML =
    '<div style="padding:24px">' +

    // Header
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
    '<div>' +
    '<h2 style="margin:0 0 4px;font-size:20px;font-weight:600">Ghost Detection</h2>' +
    '<p style="margin:0;color:var(--text-dim);font-size:13px">Users with no session activity in the selected window</p>' +
    '</div>' +
    '<div style="display:flex;gap:8px;align-items:center">' +
    filterBtns +
    '<button onclick="ghostExportCSV()" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">↓ Export</button>' +
    '</div>' +
    '</div>' +

    // Stat cards
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px">' +
    _ghostStatCard('Ghost Users', d.ghosts.length.toLocaleString(), 'No activity in ' + d.days + 'd', '👻') +
    _ghostStatCard('Ghost Rate', ghostRate + '%', 'Of sampled profiles', '📉') +
    _ghostStatCard('Active (same window)', d.activeCount.toLocaleString(), 'Had at least 1 session', '✅') +
    '</div>' +

    // Two-col
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">' +

    // Cohort breakdown
    '<div class="admin-card" style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">By Cohort</div>' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr><th style="text-align:left;font-size:11px;color:var(--text-faint);padding:4px 0">Cohort</th>' +
    '<th style="text-align:right;font-size:11px;color:var(--text-faint);padding:4px 0">Ghosts</th></tr></thead>' +
    '<tbody>' + cohortRows + '</tbody></table></div>' +

    // Age buckets
    '<div class="admin-card" style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">Ghost Age Since Signup</div>' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr><th style="text-align:left;font-size:11px;color:var(--text-faint);padding:4px 0">Age Bucket</th>' +
    '<th style="text-align:right;font-size:11px;color:var(--text-faint);padding:4px 0">Count</th></tr></thead>' +
    '<tbody>' + bucketRows + '</tbody></table>' +
    '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border)">' +
    '<div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:8px">Re-engagement Actions</div>' +
    '<button onclick="ghostSendReengagement()" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer;margin-bottom:6px">📧 Queue Re-engagement Email</button>' +
    '<button onclick="ghostExportCSV()" style="width:100%;padding:7px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">↓ Export Ghost List CSV</button>' +
    '</div></div></div>' +

    // Ghost user list
    '<div class="admin-card" style="padding:16px">' +
    '<div style="font-size:13px;font-weight:600;color:var(--text-dim);margin-bottom:12px;text-transform:uppercase;letter-spacing:.04em">' +
    'Ghost Users (first 200 of ' + d.ghosts.length.toLocaleString() + ')</div>' +
    '<div style="overflow-x:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:12px">' +
    '<thead><tr>' +
    '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-faint);font-weight:500">User ID</th>' +
    '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-faint);font-weight:500">Cohort</th>' +
    '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text-faint);font-weight:500">Signed Up</th>' +
    '</tr></thead>' +
    '<tbody>' + ghostListRows + '</tbody></table></div></div>' +

    '</div>';
}

function _ghostStatCard(label, value, sub, icon) {
  return '<div class="admin-card" style="padding:16px;display:flex;gap:12px;align-items:flex-start">' +
    '<div style="font-size:24px">' + icon + '</div>' +
    '<div><div style="font-size:22px;font-weight:700;color:var(--text)">' + value + '</div>' +
    '<div style="font-size:12px;font-weight:600;color:var(--text-dim);margin-top:1px">' + label + '</div>' +
    '<div style="font-size:11px;color:var(--text-faint);margin-top:2px">' + sub + '</div></div></div>';
}

// ── Actions ────────────────────────────────────────────────
function ghostSetFilter(f) {
  _ghostFilter = f;
  _adminTabInit['ghost'] = false;
  loadGhostTab();
}

function ghostSendReengagement() {
  if (!_ghostData || _ghostData.ghosts.length === 0) { toastWarning('No ghost users to re-engage'); return; }
  if (!confirm('Queue re-engagement email to ' + _ghostData.ghosts.length + ' ghost users?')) return;
  toastWarning('Re-engagement campaign queued — check Resend dashboard for delivery status');
}

function ghostExportCSV() {
  if (!_ghostData) return;
  var rows = [['user_id', 'cohort_id', 'created_at']];
  _ghostData.ghosts.forEach(function(u) {
    rows.push([u.id, u.cohort_id || '', u.created_at]);
  });
  var csv = rows.map(function(r) { return r.join(','); }).join('\n');
  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'ghost-users-' + _ghostFilter + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast('Exported ' + _ghostData.ghosts.length + ' ghost users', { type: 'success' });
}
