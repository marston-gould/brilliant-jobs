/**
 * admin-payl.js — Admin PAYL Analytics Panel
 * Session: FB-PAYL-S2
 *
 * Displays:
 * - Enrollment funnel overview (6 stat cards)
 * - Conversion metrics (rates, averages)
 * - Daily funnel cohort chart
 * - Recent enrollments table
 * - Referral leaderboard
 * - Anti-gaming flags
 */

var _paylRefreshTimer = null;

async function loadPaylAnalyticsPanel() {
  var container = document.getElementById('admin-payl');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);font-size:13px;">Loading PAYL analytics...</div>';

  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) throw new Error('No Supabase client');

    var { data, error } = await sb.rpc('fn_payl_admin_summary');
    if (error) throw error;

    var result = typeof data === 'string' ? JSON.parse(data) : data;
    _renderPaylPanel(container, result);
  } catch (e) {
    if (typeof reportError === 'function') reportError('admin_payl_load', e);
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--warm);font-size:13px;">Failed to load PAYL analytics: ' + (e.message || 'Unknown error') + '</div>';
  }

  // Auto-refresh every 2 minutes
  if (_paylRefreshTimer) clearInterval(_paylRefreshTimer);
  _paylRefreshTimer = setInterval(function() {
    if (document.getElementById('admin-payl')?.offsetParent !== null) {
      loadPaylAnalyticsPanel();
    } else {
      clearInterval(_paylRefreshTimer);
      _paylRefreshTimer = null;
    }
  }, 120000);
}

function _renderPaylPanel(container, data) {
  var ov = data.overview || {};
  var funnel = data.daily_funnel || [];
  var recent = data.recent_enrollments || [];
  var leaders = data.referral_leaderboard || [];
  var flags = data.anti_gaming_flags || [];

  container.innerHTML = `
    <div style="margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">PAYL Analytics</div>
      <div style="font-size:11px;color:var(--text-dim);">Pay After You Land enrollment and conversion metrics</div>
    </div>

    <!-- Enrollment Funnel Cards -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:16px;">
      ${_paylStatCard('Pending PDF', ov.pending_pdf || 0, 'var(--text-dim)')}
      ${_paylStatCard('Pending Referrals', ov.pending_referrals || 0, 'var(--warm)')}
      ${_paylStatCard('Active', ov.active || 0, 'var(--accent)')}
      ${_paylStatCard('Converted', ov.converted || 0, 'hsl(142,60%,40%)')}
      ${_paylStatCard('Expired', ov.expired || 0, 'hsl(0,60%,50%)')}
      ${_paylStatCard('Total', ov.total_enrollments || 0, 'var(--text)')}
    </div>

    <!-- Conversion Metrics -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px;">
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-dim);">Conversion Rate</div>
        <div style="font-size:20px;font-weight:700;color:hsl(142,60%,40%);">${ov.conversion_rate_pct != null ? ov.conversion_rate_pct + '%' : '—'}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-dim);">Avg Days to Activation</div>
        <div style="font-size:20px;font-weight:700;">${ov.avg_days_to_activation != null ? ov.avg_days_to_activation + 'd' : '—'}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-dim);">Avg Days to Conversion</div>
        <div style="font-size:20px;font-weight:700;">${ov.avg_days_to_conversion != null ? ov.avg_days_to_conversion + 'd' : '—'}</div>
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:11px;color:var(--text-dim);">Qualified Referrals</div>
        <div style="font-size:20px;font-weight:700;color:var(--accent);">${ov.total_qualified_referrals || 0}</div>
      </div>
    </div>

    <!-- Daily Funnel (last 30 days) -->
    <div class="card" style="padding:12px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Daily Enrollment Funnel (30d)</div>
      ${funnel.length > 0 ? _renderFunnelTable(funnel) : '<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:12px;">No enrollment data yet</div>'}
    </div>

    <!-- Two-column: Recent Enrollments + Referral Leaderboard -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div class="card" style="padding:12px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Recent Enrollments</div>
        ${recent.length > 0 ? _renderRecentTable(recent) : '<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:12px;">No enrollments yet</div>'}
      </div>
      <div class="card" style="padding:12px;">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Referral Leaderboard</div>
        ${leaders.length > 0 ? _renderLeaderboard(leaders) : '<div style="text-align:center;padding:16px;color:var(--text-dim);font-size:12px;">No referrals yet</div>'}
      </div>
    </div>

    <!-- Anti-Gaming Flags -->
    ${flags.length > 0 ? `
      <div class="card" style="padding:12px;border:1px solid var(--warm);">
        <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:var(--warm);">Anti-Gaming Flags (${flags.length})</div>
        ${_renderFlagsTable(flags)}
      </div>` : ''}
  `;
}

function _paylStatCard(label, value, color) {
  return `<div class="card" style="padding:12px;text-align:center;">
    <div style="font-size:20px;font-weight:700;color:${color};">${value}</div>
    <div style="font-size:10px;color:var(--text-dim);margin-top:2px;">${label}</div>
  </div>`;
}

function _renderFunnelTable(funnel) {
  var header = '<tr><th>Date</th><th>Started</th><th>PDF</th><th>Activated</th><th>3 Refs</th><th>Converted</th><th>Expired</th></tr>';
  var rows = funnel.slice(0, 14).map(function(f) {
    return '<tr>' +
      '<td>' + (f.cohort_date || '—') + '</td>' +
      '<td>' + (f.enrollments_started || 0) + '</td>' +
      '<td>' + (f.pdf_uploaded || 0) + '</td>' +
      '<td>' + (f.activated || 0) + '</td>' +
      '<td>' + (f.fully_referred || 0) + '</td>' +
      '<td>' + (f.converted || 0) + '</td>' +
      '<td>' + (f.expired || 0) + '</td>' +
      '</tr>';
  }).join('');
  return '<table class="admin-table" style="font-size:11px;width:100%;">' + header + rows + '</table>';
}

function _renderRecentTable(recent) {
  var rows = recent.map(function(r) {
    var statusColor = { active: 'var(--accent)', converted: 'hsl(142,60%,40%)', expired: 'hsl(0,60%,50%)', pending_pdf: 'var(--text-dim)', pending_referrals: 'var(--warm)', revoked: 'hsl(0,60%,50%)' };
    var days = r.days_remaining != null ? r.days_remaining + 'd' : '—';
    return '<tr>' +
      '<td style="font-size:10px;font-family:monospace;">' + (r.user_id || '').substring(0, 8) + '</td>' +
      '<td><span style="color:' + (statusColor[r.status] || 'var(--text)') + ';font-weight:500;">' + (r.status || '—') + '</span></td>' +
      '<td>' + (r.referrals_qualified || 0) + '/3</td>' +
      '<td>' + days + '</td>' +
      '</tr>';
  }).join('');
  return '<table class="admin-table" style="font-size:11px;width:100%;"><tr><th>User</th><th>Status</th><th>Refs</th><th>Days</th></tr>' + rows + '</table>';
}

function _renderLeaderboard(leaders) {
  var rows = leaders.map(function(l, i) {
    return '<tr>' +
      '<td>' + (i + 1) + '</td>' +
      '<td style="font-size:10px;font-family:monospace;">' + (l.user_id || '').substring(0, 8) + '</td>' +
      '<td style="font-weight:600;">' + (l.referrals_qualified || 0) + '/' + (l.total_referrals || 0) + '</td>' +
      '<td style="font-family:monospace;font-size:10px;">' + (l.referral_code || '—') + '</td>' +
      '</tr>';
  }).join('');
  return '<table class="admin-table" style="font-size:11px;width:100%;"><tr><th>#</th><th>User</th><th>Qual/Total</th><th>Code</th></tr>' + rows + '</table>';
}

function _renderFlagsTable(flags) {
  var rows = flags.map(function(f) {
    return '<tr>' +
      '<td style="font-size:10px;font-family:monospace;">' + (f.enrollment_id || '').substring(0, 8) + '</td>' +
      '<td>' + (f.revoke_reason || '—') + '</td>' +
      '<td style="font-size:10px;">' + (f.signup_ip || '—') + '</td>' +
      '<td style="font-size:10px;">' + (f.revoked_at ? new Date(f.revoked_at).toLocaleDateString() : '—') + '</td>' +
      '</tr>';
  }).join('');
  return '<table class="admin-table" style="font-size:11px;width:100%;"><tr><th>Enrollment</th><th>Reason</th><th>IP</th><th>Revoked</th></tr>' + rows + '</table>';
}

// ─── Export ───
window.loadPaylAnalyticsPanel = loadPaylAnalyticsPanel;
