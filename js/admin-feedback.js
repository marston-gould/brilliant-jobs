/* ─────────────────────────────────────────────────────────
   admin-feedback.js — User Feedback / Canny Sub-Page
   Brilliant Jobs Admin Console · v6.91
   ───────────────────────────────────────────────────────── */
'use strict';

// ── Entry point ────────────────────────────────────────────
async function loadFeedbackTab() {
  console.log('[Admin] loadFeedbackTab');
  var panel = document.getElementById('admin-panel-feedback');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:24px;color:var(--text-faint)">Loading feedback data…</div>';
  await _loadFeedback(panel);
}

async function _loadFeedback(panel) {
  try {
    // Fetch from Canny API
    var res = await fetch('https://canny.io/api/v1/posts/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: '967f88a7-80b4-60b2-84cd-02905d6f2278', limit: 50, sort: 'score' })
    });
    if (!res.ok) throw new Error('Canny API ' + res.status);
    var data = await res.json();
    _renderFeedback(panel, data.posts || [], null);
  } catch (e) {
    reportError('admin_feedback', e);
    console.warn('[Admin] Canny fetch error:', e.message);
    _renderFeedback(panel, [], e.message);
  }
}

// ── Render ─────────────────────────────────────────────────
function _renderFeedback(panel, posts, err) {
  var statusColors = {
    'open': '#6b82a8', 'under review': '#a08858', 'planned': '#5b8a72',
    'in progress': '#4a9a6b', 'complete': '#3d7a5a', 'closed': '#8b929e'
  };

  var postRows = posts.map(function(p) {
    var status = (p.status || 'open').toLowerCase();
    var color  = statusColors[status] || '#8b929e';
    return '<tr>' +
      '<td style="padding:8px 10px;max-width:320px">' +
      '<div style="font-size:13px;font-weight:500;color:var(--text)">' + escapeHtml(p.title || '') + '</div>' +
      (p.details ? '<div style="font-size:11px;color:var(--text-faint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">' + escapeHtml(p.details.substring(0, 80)) + (p.details.length > 80 ? '…' : '') + '</div>' : '') +
      '</td>' +
      '<td style="padding:8px 10px;text-align:center"><span style="font-size:12px;font-family:var(--mono);padding:2px 8px;border-radius:4px;background:' + color + '22;color:' + color + '">' + (p.status || 'open') + '</span></td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-size:13px;color:var(--accent)">' + (p.score || 0) + '</td>' +
      '<td style="padding:8px 10px;text-align:right;font-family:var(--mono);font-size:12px;color:var(--text-dim)">' + (p.commentCount || 0) + '</td>' +
      '<td style="padding:8px 10px"><a href="' + (p.url || 'https://brilliant-jobs.canny.io') + '" target="_blank" style="color:var(--accent);font-size:12px">View ↗</a></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-faint)">' +
    (err ? 'Canny API unavailable: ' + escapeHtml(err) + ' — <a href="https://brilliant-jobs.canny.io" target="_blank" style="color:var(--accent)">Open Canny directly ↗</a>' : 'No feedback posts found') +
    '</td></tr>';

  // Aggregate by status
  var statusCounts = {};
  posts.forEach(function(p) { var s = p.status || 'open'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
  var totalVotes = posts.reduce(function(sum, p) { return sum + (p.score || 0); }, 0);

  panel.innerHTML =
    '<div style="padding:24px">' +

    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
    '<div><h2 style="margin:0 0 4px;font-size:20px;font-weight:600">Feedback</h2>' +
    '<p style="margin:0;color:var(--text-dim);font-size:13px">Feature requests and bug reports via Canny</p></div>' +
    '<div style="display:flex;gap:8px">' +
    '<a href="https://brilliant-jobs.canny.io/feature-requests" target="_blank" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;text-decoration:none">Feature Requests ↗</a>' +
    '<a href="https://brilliant-jobs.canny.io/bug-reports" target="_blank" style="padding:6px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;text-decoration:none">Bug Reports ↗</a>' +
    '<a href="https://brilliant-jobs.canny.io" target="_blank" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:13px;text-decoration:none">Canny Admin ↗</a>' +
    '</div></div>' +

    // Stats
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">' +
    _fbStatCard('Total Posts', posts.length.toString(), 'All boards', '📋') +
    _fbStatCard('Total Votes', totalVotes.toLocaleString(), 'User upvotes', '👍') +
    _fbStatCard('Open', (statusCounts['open'] || 0).toString(), 'Awaiting review', '🔵') +
    _fbStatCard('Planned / In Progress', ((statusCounts['planned'] || 0) + (statusCounts['in progress'] || 0)).toString(), 'Being worked on', '🟢') +
    '</div>' +

    // Status breakdown
    (Object.keys(statusCounts).length > 0 ?
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' +
      Object.entries(statusCounts).map(function(entry) {
        var color = statusColors[entry[0].toLowerCase()] || '#8b929e';
        return '<span style="font-size:12px;padding:3px 10px;border-radius:12px;background:' + color + '22;color:' + color + '">' + entry[0] + ' · ' + entry[1] + '</span>';
      }).join('') + '</div>' : '') +

    // Posts table
    '<div class="admin-card" style="overflow:hidden">' +
    '<table style="width:100%;border-collapse:collapse">' +
    '<thead><tr style="border-bottom:1px solid var(--border)">' +
    '<th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;color:var(--text-faint)">Post</th>' +
    '<th style="text-align:center;padding:8px 10px;font-size:11px;font-weight:600;color:var(--text-faint)">Status</th>' +
    '<th style="text-align:right;padding:8px 10px;font-size:11px;font-weight:600;color:var(--text-faint)">Votes</th>' +
    '<th style="text-align:right;padding:8px 10px;font-size:11px;font-weight:600;color:var(--text-faint)">Comments</th>' +
    '<th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;color:var(--text-faint)">Link</th>' +
    '</tr></thead>' +
    '<tbody>' + postRows + '</tbody></table></div>' +

    '</div>';
}

function _fbStatCard(label, value, sub, icon) {
  return '<div class="admin-card" style="padding:14px;display:flex;gap:10px;align-items:flex-start">' +
    '<div style="font-size:20px">' + icon + '</div>' +
    '<div><div style="font-size:18px;font-weight:700;color:var(--text)">' + value + '</div>' +
    '<div style="font-size:11px;font-weight:600;color:var(--text-dim)">' + label + '</div>' +
    '<div style="font-size:10px;color:var(--text-faint);margin-top:1px">' + sub + '</div></div></div>';
}
