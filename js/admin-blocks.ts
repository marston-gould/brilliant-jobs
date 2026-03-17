// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-blocks.js — Shared Admin Block Components (IA v2)
   v6.87 — S4: _adminDetailPanel(), expand row wiring
   ─────────────────────────────────────────────────────────── */

// ── Reusable Stat Card ──
function _adminStatCard(label, value, sub) {
  return '<div class="admin-stat-card">' +
    '<div class="admin-stat-value">' + value + '</div>' +
    '<div class="admin-stat-label">' + label + '</div>' +
    (sub ? '<div class="admin-stat-sub">' + sub + '</div>' : '') +
    '</div>';
}

// ── HTML escape ──
function _escHtml(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Time ago ──
function _timeAgo(dateStr) {
  if (!dateStr) return '—';
  var diff = Date.now() - new Date(dateStr).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  var days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

// ── Action Bar (search + platform filter + sort) ──
function _adminActionBar(opts) {
  var id = opts.id;
  var html = '<div class="admin-action-bar">';

  html += '<div class="admin-search-wrap">';
  html += '<input type="text" id="' + id + '-search" class="admin-search-input" placeholder="' + (opts.placeholder || 'Search…') + '" />';
  html += '</div>';

  if (opts.platforms) {
    html += '<select id="' + id + '-platform" class="admin-select">';
    html += '<option value="">All Platforms</option>';
    opts.platforms.forEach(function(p) {
      html += '<option value="' + p + '" style="text-transform:capitalize">' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
    });
    html += '</select>';
  }

  if (opts.statusOptions) {
    html += '<select id="' + id + '-status" class="admin-select">';
    opts.statusOptions.forEach(function(s) {
      html += '<option value="' + s.value + '"' + (s.selected ? ' selected' : '') + '>' + s.label + '</option>';
    });
    html += '</select>';
  }

  if (opts.sorts) {
    html += '<select id="' + id + '-sort" class="admin-select">';
    opts.sorts.forEach(function(s) {
      html += '<option value="' + s.value + '"' + (s.value === opts.defaultSort ? ' selected' : '') + '>' + s.label + '</option>';
    });
    html += '</select>';
  }

  html += '</div>';
  return html;
}

// ── Paginated Table Renderer ──
function _adminPagedTable(opts) {
  var id = opts.id;
  var html = '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';

  opts.columns.forEach(function(col) {
    var style = '';
    if (col.align) style += 'text-align:' + col.align + ';';
    if (col.width) style += 'width:' + col.width + ';';
    html += '<th' + (style ? ' style="' + style + '"' : '') + '>' + col.label + '</th>';
  });

  // expand chevron column header if expandable
  if (opts.expandable) {
    html += '<th style="width:32px;"></th>';
  }

  html += '</tr></thead><tbody>';

  if (!opts.rows || opts.rows.length === 0) {
    html += '<tr><td colspan="' + (opts.columns.length + (opts.expandable ? 1 : 0)) + '" style="text-align:center;color:var(--text-faint);padding:24px;">No results found</td></tr>';
  } else {
    opts.rows.forEach(function(row, rowIdx) {
      var rowId = opts.id + '-row-' + rowIdx;
      var expandId = opts.id + '-expand-' + rowIdx;
      html += '<tr id="' + rowId + '" style="cursor:' + (opts.expandable ? 'pointer' : 'default') + ';">';
      opts.columns.forEach(function(col) {
        var style = col.align ? 'text-align:' + col.align + ';' : '';
        var val = col.render ? col.render(row) : _escHtml(String(row[col.key] || '—'));
        html += '<td style="' + style + '">' + val + '</td>';
      });
      if (opts.expandable) {
        html += '<td style="text-align:center;color:var(--text-faint);font-size:11px;" class="expand-chevron" id="chev-' + expandId + '">▶</td>';
      }
      html += '</tr>';
      if (opts.expandable) {
        html += '<tr id="' + expandId + '" style="display:none;"><td colspan="' + (opts.columns.length + 1) + '" style="padding:0;background:var(--bg-main);">';
        html += '<div class="admin-detail-panel" id="dp-' + expandId + '" style="padding:16px 20px;font-size:13px;"><span style="color:var(--text-faint);">Loading…</span></div>';
        html += '</td></tr>';
      }
    });
  }

  html += '</tbody></table></div>';

  // Pagination footer
  var total = opts.total || 0;
  var offset = opts.offset || 0;
  var limit = opts.limit || 50;
  var page = Math.floor(offset / limit) + 1;
  var totalPages = Math.ceil(total / limit);

  if (totalPages > 1) {
    html += '<div class="admin-pager">';
    html += '<span class="admin-pager-info">Showing ' + (offset + 1) + '–' + Math.min(offset + limit, total) + ' of ' + fmtAdminNum(total) + '</span>';
    html += '<div class="admin-pager-btns">';
    html += '<button class="admin-pager-btn" id="' + id + '-prev"' + (page <= 1 ? ' disabled' : '') + '>« Prev</button>';
    html += '<span class="admin-pager-page">Page ' + page + ' / ' + totalPages + '</span>';
    html += '<button class="admin-pager-btn" id="' + id + '-next"' + (page >= totalPages ? ' disabled' : '') + '>Next »</button>';
    html += '</div></div>';
  } else if (total > 0) {
    html += '<div class="admin-pager"><span class="admin-pager-info">' + fmtAdminNum(total) + ' total</span></div>';
  }

  return html;
}

// ── Expandable Row Wiring ──
// opts: { tableId, rows, loadDetail(row, panelEl) }
function _wireExpandableRows(opts) {
  var tableId = opts.tableId;
  var rows = opts.rows || [];
  rows.forEach(function(row, idx) {
    var rowEl = document.getElementById(tableId + '-row-' + idx);
    var expandEl = document.getElementById(tableId + '-expand-' + idx);
    var chevEl = document.getElementById('chev-' + tableId + '-expand-' + idx);
    var panelEl = document.getElementById('dp-' + tableId + '-expand-' + idx);
    var loaded = false;
    if (!rowEl || !expandEl) return;

    rowEl.addEventListener('click', function() {
      var isOpen = expandEl.style.display !== 'none';
      if (isOpen) {
        expandEl.style.display = 'none';
        if (chevEl) chevEl.textContent = '▶';
      } else {
        expandEl.style.display = '';
        if (chevEl) chevEl.textContent = '▼';
        if (!loaded && panelEl) {
          loaded = true;
          opts.loadDetail(row, panelEl);
        }
      }
    });
  });
}

// ── Detail Panel: Key-Value Grid ──
function _adminDetailPanel(sections) {
  // sections: [{ title, rows: [{label, value, wide}] }]
  var html = '<div style="display:flex;flex-wrap:wrap;gap:20px;">';
  sections.forEach(function(sec) {
    html += '<div style="flex:1;min-width:220px;">';
    if (sec.title) {
      html += '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-faint);margin-bottom:8px;">' + sec.title + '</div>';
    }
    html += '<div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:start;">';
    sec.rows.forEach(function(r) {
      if (!r || r.value === undefined || r.value === null || r.value === '' || r.value === '—') {
        return; // skip empty
      }
      html += '<span style="color:var(--text-faint);font-size:12px;white-space:nowrap;">' + r.label + '</span>';
      html += '<span style="font-size:12px;font-family:' + (r.mono ? 'var(--font-mono)' : 'inherit') + ';word-break:break-word;">' + r.value + '</span>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

// ── Salary formatter ──
function _fmtSalary(min, max, currency) {
  if (!min && !max) return '—';
  var c = (currency || 'USD').toUpperCase();
  var sym = c === 'USD' ? '$' : c === 'EUR' ? '€' : c === 'GBP' ? '£' : c + ' ';
  function fmt(n) {
    if (n >= 1000) return sym + Math.round(n / 1000) + 'K';
    return sym + n;
  }
  if (min && max) return fmt(min) + '–' + fmt(max);
  if (min) return fmt(min) + '+';
  return 'Up to ' + fmt(max);
}

// ── Location formatter ──
function _fmtLocation(city, state, country) {
  var parts = [];
  if (city) parts.push(city);
  if (state) parts.push(state);
  if (country && country !== 'US' && country !== 'USA') parts.push(country);
  return parts.length ? parts.join(', ') : '—';
}
