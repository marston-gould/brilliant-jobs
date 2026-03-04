/* ───────────────────────────────────────────────────────────
   admin-blocks.js — Shared Admin Block Components (IA v2 S3)
   v6.86 — Extracted from admin-companies.js + new utilities
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
  // opts: { id, placeholder, platforms, sorts, defaultSort, statusOptions }
  var id = opts.id;
  var html = '<div class="admin-action-bar">';

  // Search input
  html += '<div class="admin-search-wrap">';
  html += '<input type="text" id="' + id + '-search" class="admin-search-input" placeholder="' + (opts.placeholder || 'Search…') + '" />';
  html += '</div>';

  // Platform filter
  if (opts.platforms) {
    html += '<select id="' + id + '-platform" class="admin-select">';
    html += '<option value="">All Platforms</option>';
    opts.platforms.forEach(function(p) {
      html += '<option value="' + p + '" style="text-transform:capitalize">' + p.charAt(0).toUpperCase() + p.slice(1) + '</option>';
    });
    html += '</select>';
  }

  // Status filter
  if (opts.statusOptions) {
    html += '<select id="' + id + '-status" class="admin-select">';
    opts.statusOptions.forEach(function(s) {
      html += '<option value="' + s.value + '"' + (s.selected ? ' selected' : '') + '>' + s.label + '</option>';
    });
    html += '</select>';
  }

  // Sort
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
  // opts: { id, columns:[{key,label,align,width,render}], rows, total, offset, limit, onPage }
  var id = opts.id;
  var html = '<div style="overflow-x:auto;"><table class="admin-table" style="width:100%"><thead><tr>';

  opts.columns.forEach(function(col) {
    var style = '';
    if (col.align) style += 'text-align:' + col.align + ';';
    if (col.width) style += 'width:' + col.width + ';';
    html += '<th' + (style ? ' style="' + style + '"' : '') + '>' + col.label + '</th>';
  });

  html += '</tr></thead><tbody>';

  if (!opts.rows || opts.rows.length === 0) {
    html += '<tr><td colspan="' + opts.columns.length + '" style="text-align:center;color:var(--text-faint);padding:24px;">No results found</td></tr>';
  } else {
    opts.rows.forEach(function(row) {
      html += '<tr>';
      opts.columns.forEach(function(col) {
        var style = col.align ? 'text-align:' + col.align + ';' : '';
        var val = col.render ? col.render(row) : _escHtml(String(row[col.key] || '—'));
        html += '<td style="' + style + '">' + val + '</td>';
      });
      html += '</tr>';
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
    html += '<button class="admin-pager-btn" id="' + id + '-prev"' + (page <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
    html += '<span class="admin-pager-page">Page ' + page + ' / ' + totalPages + '</span>';
    html += '<button class="admin-pager-btn" id="' + id + '-next"' + (page >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
    html += '</div></div>';
  } else if (total > 0) {
    html += '<div class="admin-pager"><span class="admin-pager-info">' + fmtAdminNum(total) + ' total</span></div>';
  }

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
