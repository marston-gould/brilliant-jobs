// @ts-nocheck

// js/admin-content.js — SPEC-ADMIN-002 §6: Content Manager (full CRUD + bulk)

var _ctState = { stories: {}, selectedIds: new Set() };

async function loadContentTab() {
  try {
    var panel = document.getElementById('admin-panel-content');
    if (!panel) return;
    // Render shell if not already rendered
    if (!document.getElementById('ct-toolbar')) {
      renderContentShell(panel);
    }
    fetchContentStories();
  } catch(e) {
    reportError('admin_content', e);
    toastWarning('Content tab failed to load');
  }
}

function renderContentShell(panel) {
  var existing = panel.innerHTML;
  // Preserve existing stat cards if present
  var statsHtml = panel.querySelector('#ct-total') ? panel.querySelector('.stat-grid')?.outerHTML || '' : '';

  panel.innerHTML = [
    statsHtml || '<div class="stat-grid" style="margin-bottom:16px">',
    !statsHtml ? '  <div class="stat-card"><div class="stat-val" id="ct-total">—</div><div class="stat-label">Total</div></div>' : '',
    !statsHtml ? '  <div class="stat-card"><div class="stat-val" id="ct-pending">—</div><div class="stat-label">Pending</div></div>' : '',
    !statsHtml ? '  <div class="stat-card"><div class="stat-val" id="ct-approved">—</div><div class="stat-label">Approved</div></div>' : '',
    !statsHtml ? '  <div class="stat-card"><div class="stat-val" id="ct-published">—</div><div class="stat-label">Published</div></div>' : '',
    !statsHtml ? '  <div class="stat-card"><div class="stat-val" id="ct-rejected">—</div><div class="stat-label">Rejected</div></div>' : '',
    !statsHtml ? '</div>' : '',
    // Toolbar
    '<div id="ct-toolbar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">',
    '  <select id="ct-filter-status" onchange="fetchContentStories()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">',
    '    <option value="">All Status</option>',
    '    <option value="pending">Pending</option>',
    '    <option value="approved">Approved</option>',
    '    <option value="published">Published</option>',
    '    <option value="rejected">Rejected</option>',
    '    <option value="draft">Draft</option>',
    '    <option value="archived">Archived</option>',
    '  </select>',
    '  <select id="ct-filter-category" onchange="fetchContentStories()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px">',
    '    <option value="">All Categories</option>',
    '    <option value="market_trends">Market Trends</option>',
    '    <option value="salary">Salary</option>',
    '    <option value="career">Career</option>',
    '    <option value="hiring">Hiring</option>',
    '  </select>',
    '  <button onclick="ctBulkAction(\'approved\')" style="padding:5px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--green);font-size:12px;cursor:pointer">✓ Approve All Pending</button>',
    '  <button onclick="ctBulkAction(\'rejected\')" style="padding:5px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--red);font-size:12px;cursor:pointer">✗ Reject All Pending</button>',
    '  <button onclick="ctBulkAction(\'published\')" style="padding:5px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--accent);font-size:12px;cursor:pointer">↑ Bulk Publish Approved</button>',
    '  <button onclick="ctOpenEditor(null)" style="padding:5px 12px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;margin-left:auto">+ Create</button>',
    '  <span id="ct-action-status" style="font-size:12px;color:var(--text-faint)"></span>',
    '</div>',
    // Table
    '<div style="overflow-x:auto"><table class="admin-table" style="width:100%">',
    '  <thead><tr>',
    '    <th style="width:32px"><input type="checkbox" id="ct-select-all" onchange="ctSelectAll(this.checked)"></th>',
    '    <th>Score</th><th>Type</th><th>Category</th><th>Headline</th><th>Status</th><th>Featured</th><th>Created</th><th style="text-align:right">Actions</th>',
    '  </tr></thead>',
    '  <tbody id="ct-stories-body"><tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '</table></div>',
    // Content editor modal
    '<div id="ct-editor-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center">',
    '  <div style="background:var(--bg-card);border-radius:10px;border:1px solid var(--border);width:660px;max-height:90vh;overflow-y:auto;padding:24px">',
    '    <div style="display:flex;justify-content:space-between;margin-bottom:16px">',
    '      <h3 id="ct-editor-title" style="margin:0;font-size:15px">Content Item</h3>',
    '      <button onclick="ctCloseEditor()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:20px">×</button>',
    '    </div>',
    '    <div id="ct-editor-body"></div>',
    '  </div>',
    '</div>',
  ].join('');
}

async function fetchContentStories() {
  try {
    var statusFilter = document.getElementById('ct-filter-status')?.value || '';
    var catFilter = document.getElementById('ct-filter-category')?.value || '';
    var url = SUPABASE_URL + '/rest/v1/content_stories?select=id,story_type,category,headline,lede,body_html,meta_description,social_snippet,chart_config,evergreen_link,score,status,tags,is_featured,publish_date,author_note,slug,created_at&order=score.desc,created_at.desc&limit=200';
    if (statusFilter) url += '&status=eq.' + statusFilter;
    if (catFilter) url += '&category=eq.' + catFilter;

    var [resp, allResp] = await Promise.all([
      fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }),
      fetch(SUPABASE_URL + '/rest/v1/content_stories?select=status', { headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY } }),
    ]);
    var stories = await resp.json();
    var allStories = await allResp.json();

    var counts = { total: allStories.length, pending: 0, approved: 0, published: 0, rejected: 0 };
    allStories.forEach(function(s) { if (counts[s.status] !== undefined) counts[s.status]++; });
    ['total','pending','approved','published','rejected'].forEach(function(k) {
      var el = document.getElementById('ct-' + k);
      if (el) el.textContent = counts[k];
    });

    _ctState.stories = {};
    stories.forEach(function(s) { _ctState.stories[s.id] = s; });

    var tbody = document.getElementById('ct-stories-body');
    if (!tbody) return;
    if (!stories.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-faint)">No stories found</td></tr>';
      return;
    }

    var statusColors = { pending:'#f59e0b', approved:'#22c55e', published:'#3b82f6', scheduled:'#8b5cf6', rejected:'#ef4444', draft:'#888', archived:'#555' };
    tbody.innerHTML = stories.map(function(s) {
      var sc = statusColors[s.status] || '#888';
      var scoreColor = s.score >= 70 ? 'var(--green)' : s.score >= 40 ? 'var(--warm)' : 'var(--text-faint)';
      var actions = '';
      if (s.status === 'pending') {
        actions = '<button onclick="contentAction(' + s.id + ',\'approved\')" style="padding:2px 7px;font-size:11px;background:#22c55e;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:3px">✓</button>' +
                  '<button onclick="contentAction(' + s.id + ',\'rejected\')" style="padding:2px 7px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:3px">✗</button>';
      } else if (s.status === 'approved') {
        actions = '<button onclick="contentAction(' + s.id + ',\'published\')" style="padding:2px 7px;font-size:11px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-right:3px">Publish</button>';
      }
      actions += '<button onclick="ctOpenEditor(' + s.id + ')" style="padding:2px 7px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);cursor:pointer;margin-right:3px">Edit</button>';
      actions += '<button onclick="ctSoftDelete(' + s.id + ')" style="padding:2px 7px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--red);cursor:pointer">Del</button>';
      return '<tr>' +
        '<td><input type="checkbox" class="ct-row-cb" data-id="' + s.id + '" onchange="ctRowSelect(this)"></td>' +
        '<td style="color:' + scoreColor + ';font-weight:600;font-family:var(--mono)">' + (s.score || '—') + '</td>' +
        '<td style="font-size:11px">' + escapeHtml(s.story_type || '—') + '</td>' +
        '<td style="font-size:12px">' + escapeHtml(s.category || '—') + '</td>' +
        '<td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer" onclick="ctOpenEditor(' + s.id + ')">' + escapeHtml(s.headline || '—') + '</td>' +
        '<td><span style="color:' + sc + ';font-size:11px;font-weight:600">' + (s.status||'—').toUpperCase() + '</span></td>' +
        '<td style="text-align:center">' + (s.is_featured ? '★' : '') + '</td>' +
        '<td style="font-size:11px;color:var(--text-faint);white-space:nowrap">' + new Date(s.created_at).toLocaleDateString() + '</td>' +
        '<td style="text-align:right;white-space:nowrap">' + actions + '</td>' +
        '</tr>';
    }).join('');
  } catch(e) {
    reportError('admin_content', e);
    toastWarning('Failed to load content stories');
  }
}

function ctSelectAll(checked) {
  document.querySelectorAll('.ct-row-cb').forEach(function(cb) {
    cb.checked = checked;
    ctRowSelect(cb);
  });
}

function ctRowSelect(cb) {
  if (cb.checked) _ctState.selectedIds.add(Number(cb.dataset.id));
  else _ctState.selectedIds.delete(Number(cb.dataset.id));
}

async function ctBulkAction(newStatus) {
  var fromStatus = newStatus === 'approved' ? 'pending' : newStatus === 'rejected' ? 'pending' : 'approved';
  var stories = Object.values(_ctState.stories).filter(function(s) { return s.status === fromStatus; });
  if (!stories.length) return toastWarning('No ' + fromStatus + ' stories to bulk ' + newStatus);
  if (!confirm('Set ' + stories.length + ' ' + fromStatus + ' stories to "' + newStatus + '"?')) return;
  var statusEl = document.getElementById('ct-action-status');
  if (statusEl) statusEl.textContent = 'Processing…';
  var ok = 0;
  for (var s of stories) {
    var updates = { status: newStatus };
    if (newStatus === 'published') updates.published_at = new Date().toISOString();
    var resp = await fetch(SUPABASE_URL + '/rest/v1/content_stories?id=eq.' + s.id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    });
    if (resp.ok) ok++;
  }
  if (statusEl) statusEl.textContent = 'Bulk ' + newStatus + ': ' + ok + '/' + stories.length;
  _logAdminAction('content_bulk_' + newStatus, 'content_stories', null, { count: ok, from: fromStatus });
  fetchContentStories();
}

function ctOpenEditor(storyId) {
  var overlay = document.getElementById('ct-editor-overlay');
  var title = document.getElementById('ct-editor-title');
  var body = document.getElementById('ct-editor-body');
  if (!overlay) return;
  var s = storyId ? _ctState.stories[storyId] : null;
  if (title) title.textContent = s ? 'Edit: ' + (s.headline || 'Story #' + storyId) : 'New Content Item';
  overlay.style.display = 'flex';

  var inp = function(lbl, id, val, type) {
    return '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">' + lbl + '</label>' +
      '<input type="' + (type||'text') + '" id="cte-' + id + '" value="' + escapeHtml(String(val||'')) + '" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>';
  };
  var ta = function(lbl, id, val, rows) {
    return '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">' + lbl + '</label>' +
      '<textarea id="cte-' + id + '" rows="' + (rows||4) + '" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;resize:vertical;box-sizing:border-box">' + escapeHtml(val||'') + '</textarea></div>';
  };

  body.innerHTML = [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
    inp('Title', 'title', s?.headline),
    inp('Slug (auto or manual)', 'slug', s?.slug),
    '</div>',
    ta('Body (Markdown)', 'body', s?.body_html, 6),
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">',
    inp('Tags (comma-separated)', 'tags', Array.isArray(s?.tags) ? s.tags.join(', ') : s?.tags),
    inp('Publish Date (leave blank = publish immediately on approval)', 'publish_date', s?.publish_date ? s.publish_date.slice(0,10) : '', 'date'),
    '</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">',
    '<div><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">Status</label>',
    '<select id="cte-status" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px">',
    ['draft','pending','approved','rejected','published','archived'].map(function(st) {
      return '<option' + (s?.status === st ? ' selected' : '') + '>' + st + '</option>';
    }).join(''),
    '</select></div>',
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:16px"><input type="checkbox" id="cte-featured"' + (s?.is_featured ? ' checked' : '') + '> Featured (homepage merchandising)</label>',
    '</div>',
    ta('Author Note (admin-only, never shown to users)', 'author_note', s?.author_note, 2),
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px">',
    '<button onclick="ctCloseEditor()" style="padding:7px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">Cancel</button>',
    '<button onclick="ctSaveEditor(' + (storyId || 'null') + ')" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Save</button>',
    '</div>',
  ].join('');
}

function ctCloseEditor() {
  var overlay = document.getElementById('ct-editor-overlay');
  if (overlay) overlay.style.display = 'none';
}

async function ctSaveEditor(storyId) {
  var g = function(id) {
    var el = document.getElementById('cte-' + id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value.trim() || null;
  };

  var title = g('title');
  if (!title) return toastWarning('Title is required');

  var slug = g('slug') || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  var tagsRaw = g('tags');
  var tags = tagsRaw ? tagsRaw.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];

  var payload = {
    headline: title,
    slug: slug,
    body_html: g('body'),
    tags: tags,
    status: document.getElementById('cte-status')?.value || 'draft',
    is_featured: g('featured'),
    publish_date: g('publish_date') || null,
    author_note: g('author_note'),
  };

  try {
    var method = storyId ? 'PATCH' : 'POST';
    var url = SUPABASE_URL + '/rest/v1/content_stories' + (storyId ? '?id=eq.' + storyId : '');
    var resp = await fetch(url, {
      method: method,
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error('Save failed (' + resp.status + ')');
    _logAdminAction(storyId ? 'content_edit' : 'content_create', 'content_stories', storyId, { status: payload.status });
    toastSuccess(storyId ? 'Story updated' : 'Story created');
    ctCloseEditor();
    fetchContentStories();
  } catch(e) {
    reportError('admin_content_save', e);
    toastWarning('Save failed: ' + e.message);
  }
}

async function ctSoftDelete(storyId) {
  if (!confirm('Archive this story? (Soft delete — recoverable by changing status)')) return;
  try {
    var resp = await fetch(SUPABASE_URL + '/rest/v1/content_stories?id=eq.' + storyId, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ status: 'archived' }),
    });
    if (!resp.ok) throw new Error('Delete failed');
    _logAdminAction('content_soft_delete', 'content_stories', storyId, { status: 'archived' });
    toastSuccess('Story archived');
    fetchContentStories();
  } catch(e) {
    reportError('admin_content_delete', e);
    toastWarning('Delete failed: ' + e.message);
  }
}

async function ctHardDelete(storyId) {
  // Hard delete: superadmin only — checked server-side via admin role
  if (!confirm('PERMANENTLY DELETE this story? This cannot be undone.')) return;
  var reason = prompt('Reason for permanent deletion (required):');
  if (!reason) return;
  try {
    var resp = await fetch(SUPABASE_URL + '/rest/v1/content_stories?id=eq.' + storyId, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY },
    });
    if (!resp.ok) throw new Error('Hard delete failed');
    _logAdminAction('content_hard_delete', 'content_stories', storyId, { reason });
    toastSuccess('Story permanently deleted');
    fetchContentStories();
  } catch(e) {
    reportError('admin_content_hard_delete', e);
    toastWarning('Hard delete failed: ' + e.message);
  }
}

async function contentAction(id, newStatus) {
  try {
    var updates = { status: newStatus };
    if (newStatus === 'published') updates.published_at = new Date().toISOString();
    var resp = await fetch(SUPABASE_URL + '/rest/v1/content_stories?id=eq.' + id, {
      method: 'PATCH',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    });
    if (resp.ok) {
      _logAdminAction('content_' + newStatus, 'content_stories', id, { new_status: newStatus });
      var statusEl = document.getElementById('ct-action-status');
      if (statusEl) statusEl.textContent = 'Story #' + id + ' → ' + newStatus;
      fetchContentStories();
    } else {
      toastWarning('Update failed');
    }
  } catch(e) {
    reportError('admin_content_action', e);
    toastWarning(e.message);
  }
}

// Legacy: keep previewStory for any existing HTML references
function previewStory(id) {
  ctOpenEditor(id);
}

(function() {
  ['loadContentTab','fetchContentStories','contentAction','ctBulkAction',
   'ctOpenEditor','ctCloseEditor','ctSaveEditor','ctSoftDelete','ctHardDelete',
   'ctSelectAll','ctRowSelect','previewStory'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-content', registered: Date.now() };
    }
  });
})();
