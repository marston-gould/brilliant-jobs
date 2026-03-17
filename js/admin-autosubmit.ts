// js/admin-autosubmit.js
// Auto-Submit Instrumentation Dashboard — failure tracking, timing, ATS breakdown
// Session: AS-INSTR | Pod 3

/* global supabase, reportError, toastWarning, lucide */

var _autosubmitRefreshTimer = null;

async function loadAutoSubmitPanel() {
  var container = document.getElementById('admin-autosubmit');
  if (!container) return;

  container.innerHTML = '<div style="padding:24px;color:var(--text-secondary);">Loading auto-submit instrumentation...</div>';

  try {
    var { data, error } = await supabase.rpc('fn_submission_summary');
    if (error) throw error;
    if (!data) throw new Error('No data returned');

    // EXT-AS-9: Fetch method breakdown separately (fn_submission_summary doesn't include it)
    try {
      var { data: methodRows } = await supabase
        .from('submission_attempts')
        .select('submission_method, status')
        .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString());
      if (methodRows && methodRows.length > 0) {
        var methodMap = {};
        methodRows.forEach(function(r) {
          var m = r.submission_method || 'unknown';
          if (!methodMap[m]) methodMap[m] = { submission_method: m, total: 0, submitted: 0, failed: 0, cancelled: 0 };
          methodMap[m].total++;
          if (r.status === 'submitted') methodMap[m].submitted++;
          else if (r.status === 'failed') methodMap[m].failed++;
          else if (r.status === 'cancelled') methodMap[m].cancelled++;
        });
        data.by_method = Object.values(methodMap).sort(function(a, b) { return b.total - a.total; });
      }
    } catch (err) { if (typeof reportError === 'function') reportError('admin-autosubmit-method', err); }

    renderAutoSubmitPanel(container, data);

    // Auto-refresh every 2 minutes
    if (_autosubmitRefreshTimer) clearInterval(_autosubmitRefreshTimer);
    _autosubmitRefreshTimer = setInterval(function() {
      loadAutoSubmitPanel();
    }, 120000);
  } catch (err) {
    container.innerHTML = '<div style="padding:24px;color:var(--danger);">Failed to load auto-submit data: ' + (err.message || err) + '</div>';
    if (typeof reportError === 'function') reportError('admin-autosubmit', err);
  }
}

function renderAutoSubmitPanel(container, data) {
  var overview = data.overview || {};
  var o24 = overview.overview_24h || {};
  var o7d = overview.overview_7d || {};
  var byAts = overview.by_ats || [];
  var byError = overview.by_error || [];
  var recentFailures = data.recent_failures || [];
  var recentSuccesses = data.recent_successes || [];
  var dailyTrend = data.daily_trend || [];

  var failRate24 = o24.total_24h > 0
    ? ((o24.failed_24h / o24.total_24h) * 100).toFixed(1)
    : '0.0';
  var failRate7d = o7d.total_7d > 0
    ? ((o7d.failed_7d / o7d.total_7d) * 100).toFixed(1)
    : '0.0';

  var html = '';

  // ── Overview Cards ──
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">';
  html += _statCard('Total (24h)', o24.total_24h || 0, '');
  html += _statCard('Successes (24h)', o24.success_24h || 0, 'color:var(--success)');
  html += _statCard('Failures (24h)', o24.failed_24h || 0, o24.failed_24h > 0 ? 'color:var(--danger)' : '');
  html += _statCard('Fail Rate (24h)', failRate24 + '%', parseFloat(failRate24) > 20 ? 'color:var(--danger)' : '');
  html += _statCard('Avg Duration (24h)', (o24.avg_duration_24h || 0) + 'ms', '');
  html += _statCard('P95 Duration (24h)', (o24.p95_duration_24h || 0) + 'ms', (o24.p95_duration_24h || 0) > 25000 ? 'color:var(--danger)' : '');
  html += _statCard('Total (7d)', o7d.total_7d || 0, '');
  html += _statCard('Fail Rate (7d)', failRate7d + '%', parseFloat(failRate7d) > 20 ? 'color:var(--danger)' : '');
  html += '</div>';

  // ── Failure by ATS (7d) ──
  html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Failure Rate by ATS (7 days)</h4>';
  if (byAts.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:6px 8px;">ATS</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Total</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Success</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Failed</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Fail %</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Avg ms</th>';
    html += '</tr></thead><tbody>';
    byAts.forEach(function(row) {
      var failColor = (row.failure_rate_pct || 0) > 30 ? 'color:var(--danger)' : '';
      html += '<tr style="border-bottom:1px solid var(--border-light);">';
      html += '<td style="padding:6px 8px;font-weight:500;">' + escVal(row.ats_source) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (row.total || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--success);">' + (row.successes || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--danger);">' + (row.failures || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;' + failColor + '">' + (row.failure_rate_pct || 0) + '%</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (row.avg_duration_ms || 0) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div style="padding:12px;color:var(--text-secondary);font-size:12px;">No submissions in the last 7 days.</div>';
  }

  // ── Error Type Breakdown (7d) ──
  html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Error Types (7 days)</h4>';
  if (byError.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:6px 8px;">Error Type</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Count</th>';
    html += '<th style="text-align:right;padding:6px 8px;">% of Failures</th>';
    html += '</tr></thead><tbody>';
    byError.forEach(function(row) {
      html += '<tr style="border-bottom:1px solid var(--border-light);">';
      html += '<td style="padding:6px 8px;font-family:monospace;font-size:11px;">' + escVal(row.error_type || 'unknown') + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (row.count || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + (row.pct || 0) + '%</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div style="padding:12px;color:var(--text-secondary);font-size:12px;">No failures in the last 7 days.</div>';
  }

  // ── EXT-AS-9: Submission Method Breakdown (7d) ──
  // Shows extension vs worker vs API breakdown
  html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Submission Method (7 days)</h4>';
  var byMethod = data.by_method || [];
  if (byMethod.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:6px 8px;">Method</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Total</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Success</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Failed</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Cancelled</th>';
    html += '<th style="text-align:right;padding:6px 8px;">Fail %</th>';
    html += '</tr></thead><tbody>';
    byMethod.forEach(function(row) {
      var total = (row.total || 0);
      var failed = (row.failed || 0);
      var failPct = total > 0 ? ((failed / total) * 100).toFixed(1) : '0.0';
      var failColor = parseFloat(failPct) > 30 ? 'color:var(--danger)' : '';
      var methodLabel = (row.submission_method || 'unknown').replace('extension_', 'ext: ');
      html += '<tr style="border-bottom:1px solid var(--border-light);">';
      html += '<td style="padding:6px 8px;font-weight:500;">' + escVal(methodLabel) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;">' + total + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--success);">' + (row.submitted || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--danger);">' + failed + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;color:var(--text-secondary);">' + (row.cancelled || 0) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;' + failColor + '">' + failPct + '%</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
  } else {
    html += '<div style="padding:12px;color:var(--text-secondary);font-size:12px;">No submissions in the last 7 days.</div>';
  }

  // ── Daily Trend Sparkline (30d) ──
  if (dailyTrend && dailyTrend.length > 1) {
    html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Daily Trend (30 days)</h4>';
    html += _buildTrendSparkline(dailyTrend);
  }

  // ── Recent Failures ──
  html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Recent Failures (last 50)</h4>';
  if (recentFailures.length > 0) {
    html += '<div style="max-height:400px;overflow-y:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);position:sticky;top:0;background:var(--bg-card);">';
    html += '<th style="text-align:left;padding:5px 6px;">Time</th>';
    html += '<th style="text-align:left;padding:5px 6px;">ATS</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Customer</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Company</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Job</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Resume</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Error</th>';
    html += '<th style="text-align:right;padding:5px 6px;">ms</th>';
    html += '<th style="text-align:left;padding:5px 6px;">URL</th>';
    html += '</tr></thead><tbody>';

    recentFailures.forEach(function(f) {
      var timeStr = f.created_at ? new Date(f.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      var jobUrl = f.job_url ? '<a href="' + escVal(f.job_url) + '" target="_blank" style="color:var(--accent);text-decoration:none;font-size:10px;" title="' + escVal(f.job_url) + '">Open</a>' : '—';
      html += '<tr style="border-bottom:1px solid var(--border-light);">';
      html += '<td style="padding:4px 6px;white-space:nowrap;">' + timeStr + '</td>';
      html += '<td style="padding:4px 6px;font-weight:500;">' + escVal(f.ats_source || '—') + '</td>';
      html += '<td style="padding:4px 6px;" title="' + escVal(f.user_id || '') + '">' + escVal(f.user_email || f.user_id?.substring(0, 8) || '—') + '</td>';
      html += '<td style="padding:4px 6px;">' + escVal(f.company_name || '—') + '</td>';
      html += '<td style="padding:4px 6px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escVal(f.job_title || '') + '">' + escVal(f.job_title || '—') + '</td>';
      html += '<td style="padding:4px 6px;font-size:10px;">' + escVal(f.resume_filename || '—') + ' <span style="color:var(--text-tertiary);">' + escVal(f.resume_version || '') + '</span></td>';
      html += '<td style="padding:4px 6px;color:var(--danger);font-family:monospace;font-size:10px;" title="' + escVal(f.error_detail || '') + '">' + escVal(f.error_type || f.status || '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;">' + (f.duration_ms || '—') + '</td>';
      html += '<td style="padding:4px 6px;">' + jobUrl + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
  } else {
    html += '<div style="padding:12px;color:var(--success);font-size:12px;">No failures recorded.</div>';
  }

  // ── Recent Successes (compact) ──
  html += '<h4 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--text-secondary);">Recent Successes (last 20)</h4>';
  if (recentSuccesses.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:5px 6px;">Time</th>';
    html += '<th style="text-align:left;padding:5px 6px;">ATS</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Customer</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Company</th>';
    html += '<th style="text-align:left;padding:5px 6px;">Confirmation</th>';
    html += '<th style="text-align:right;padding:5px 6px;">ms</th>';
    html += '</tr></thead><tbody>';

    recentSuccesses.forEach(function(s) {
      var timeStr = s.created_at ? new Date(s.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
      html += '<tr style="border-bottom:1px solid var(--border-light);">';
      html += '<td style="padding:4px 6px;">' + timeStr + '</td>';
      html += '<td style="padding:4px 6px;">' + escVal(s.ats_source || '—') + '</td>';
      html += '<td style="padding:4px 6px;">' + escVal(s.user_email || s.user_id?.substring(0, 8) || '—') + '</td>';
      html += '<td style="padding:4px 6px;">' + escVal(s.company_name || '—') + '</td>';
      html += '<td style="padding:4px 6px;font-family:monospace;font-size:10px;color:var(--success);">' + escVal(s.confirmation_id || '—') + '</td>';
      html += '<td style="padding:4px 6px;text-align:right;">' + (s.duration_ms || '—') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  } else {
    html += '<div style="padding:12px;color:var(--text-secondary);font-size:12px;">No successful submissions recorded.</div>';
  }

  container.innerHTML = html;
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

function _statCard(label, value, style) {
  return '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;text-align:center;">'
    + '<div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">' + label + '</div>'
    + '<div style="font-size:18px;font-weight:600;' + (style || '') + '">' + value + '</div>'
    + '</div>';
}

function _buildTrendSparkline(dailyTrend) {
  // Reverse so oldest first (left to right)
  var days = dailyTrend.slice().reverse();
  if (days.length < 2) return '';

  var maxTotal = Math.max.apply(null, days.map(function(d) { return d.total || 1; }));
  var w = 600, h = 80, pad = 4;
  var stepX = (w - pad * 2) / (days.length - 1);

  function yPos(val) { return h - pad - ((val / maxTotal) * (h - pad * 2)); }

  var successPath = 'M';
  var failPath = 'M';
  days.forEach(function(d, i) {
    var x = pad + i * stepX;
    successPath += (i > 0 ? ' L' : '') + x.toFixed(1) + ',' + yPos(d.successes || 0).toFixed(1);
    failPath += (i > 0 ? ' L' : '') + x.toFixed(1) + ',' + yPos(d.failures || 0).toFixed(1);
  });

  return '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:80px;margin-bottom:12px;">'
    + '<polyline points="' + successPath.replace(/[ML]/g, '').trim() + '" fill="none" stroke="var(--success)" stroke-width="1.5"/>'
    + '<polyline points="' + failPath.replace(/[ML]/g, '').trim() + '" fill="none" stroke="var(--danger)" stroke-width="1.5"/>'
    + '<text x="' + (w - 4) + '" y="12" text-anchor="end" font-size="9" fill="var(--success)">success</text>'
    + '<text x="' + (w - 4) + '" y="22" text-anchor="end" font-size="9" fill="var(--danger)">failed</text>'
    + '</svg>';
}

function escVal(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Expose globally
window.loadAutoSubmitPanel = loadAutoSubmitPanel;
