// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   Merchandising Admin Tab — v4.51
   Master-detail layout: Placements → Rules → Content Entries
   CRUD via Supabase service role (admin context)
   ─────────────────────────────────────────────────────────── */

// ─── State ───
var _merchPlacements = [];
var _merchRules = [];
var _merchContent = [];
var _merchSelectedPlacement = null;
var _merchSelectedRule = null;
var _merchCohorts = []; // cached cohort list

// ─── Load Tab ───
function loadMerchTab() {
  console.log('[Merch] Loading merchandising tab');
  fetchMerchPlacements();
  fetchMerchCohorts();
}

// ─── Fetch Cohorts (for rule dropdown) ───
function fetchMerchCohorts() {
  sb.from('cohorts').select('id,name').eq('is_active', true).order('name').then(function(r) {
    _merchCohorts = r.data || [];
    console.log('[Merch] Loaded ' + _merchCohorts.length + ' cohorts');
  });
}

// ─── Placements ───
function fetchMerchPlacements() {
  sb.from('merch_placements').select('*').order('page_url').order('element_name').then(function(r) {
    if (r.error) { console.error('[Merch] Placements error:', r.error); toastWarning('Merch placements failed to load'); return; }
    _merchPlacements = r.data || [];
    renderMerchPlacements();
    // auto-select first or previously selected
    if (_merchSelectedPlacement) {
      var still = _merchPlacements.find(function(p) { return p.id === _merchSelectedPlacement.id; });
      if (still) { selectMerchPlacement(still.id); return; }
    }
    if (_merchPlacements.length > 0) selectMerchPlacement(_merchPlacements[0].id);
    else clearMerchDetail();
  });
}

function renderMerchPlacements() {
  var el = document.getElementById('merch-placement-list');
  if (!el) return;
  if (_merchPlacements.length === 0) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-faint)">No placements yet</div>';
    return;
  }
  var grouped = {};
  _merchPlacements.forEach(function(p) {
    if (!grouped[p.page_url]) grouped[p.page_url] = [];
    grouped[p.page_url].push(p);
  });
  var html = '';
  Object.keys(grouped).sort().forEach(function(url) {
    html += '<div style="font-size:11px;color:var(--text-faint);padding:8px 12px 4px;text-transform:uppercase;letter-spacing:.5px">' + escHtml(url) + '</div>';
    grouped[url].forEach(function(p) {
      var sel = _merchSelectedPlacement && _merchSelectedPlacement.id === p.id;
      var dot = p.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
      html += '<div class="merch-pl-card' + (sel ? ' selected' : '') + '" data-id="' + p.id + '" onclick="selectMerchPlacement(\'' + p.id + '\')" style="padding:10px 12px;cursor:pointer;border-left:3px solid ' + (sel ? 'var(--accent)' : 'transparent') + ';background:' + (sel ? 'var(--accent-glow)' : 'transparent') + ';transition:all .15s">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center">';
      html += '<span style="font-size:13px;font-weight:600">' + escHtml(p.element_name) + '</span>';
      html += dot;
      html += '</div>';
      html += '<div style="font-size:11px;color:var(--text-faint);font-family:var(--mono)">' + escHtml(p.element_id) + '</div>';
      html += '</div>';
    });
  });
  el.innerHTML = html;
}

function selectMerchPlacement(id) {
  var p = _merchPlacements.find(function(x) { return x.id === id; });
  if (!p) return;
  _merchSelectedPlacement = p;
  _merchSelectedRule = null;
  renderMerchPlacements(); // re-render to update selection
  renderMerchPlacementDetail(p);
  fetchMerchRules(p.id);
}

function clearMerchDetail() {
  var el = document.getElementById('merch-detail');
  if (el) el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-faint)">Select a placement or create one</div>';
}

function renderMerchPlacementDetail(p) {
  var el = document.getElementById('merch-detail-header');
  if (!el) return;
  var fields = (p.content_format && p.content_format.fields) ? p.content_format.fields.join(', ') : '—';
  var dot = p.is_active ? '<span style="color:var(--green)">● Active</span>' : '<span style="color:var(--red)">○ Inactive</span>';
  el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
    '<div>' +
    '<h3 style="margin:0 0 4px;font-size:18px">' + escHtml(p.element_name) + '</h3>' +
    '<div style="font-size:12px;color:var(--text-faint)">Page: <strong style="font-family:var(--mono)">' + escHtml(p.page_url) + '</strong> &nbsp;·&nbsp; Element: <strong style="font-family:var(--mono)">' + escHtml(p.element_id) + '</strong> &nbsp;·&nbsp; Format: <strong>' + escHtml(fields) + '</strong></div>' +
    (p.element_description ? '<div style="font-size:12px;color:var(--text-faint);margin-top:4px">' + escHtml(p.element_description) + '</div>' : '') +
    '</div>' +
    '<div style="display:flex;gap:6px;align-items:center">' +
    dot +
    ' <button onclick="toggleMerchPlacementActive(\'' + p.id + '\',' + !p.is_active + ')" class="merch-btn-sm">' + (p.is_active ? 'Deactivate' : 'Activate') + '</button>' +
    ' <button onclick="deleteMerchPlacement(\'' + p.id + '\')" class="merch-btn-sm merch-btn-danger">Delete</button>' +
    '</div></div>';
}

// ─── Placement CRUD ───
function showAddPlacementForm() {
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner">' +
    '<h3 style="margin:0 0 16px">Add Placement</h3>' +
    '<label class="merch-label">Page URL</label><input id="mp-url" class="merch-input" placeholder="/" value="/">' +
    '<label class="merch-label">Element ID</label><input id="mp-eid" class="merch-input" placeholder="hero-headline">' +
    '<label class="merch-label">Element Name</label><input id="mp-name" class="merch-input" placeholder="Hero Rotating Copy">' +
    '<label class="merch-label">Description (optional)</label><input id="mp-desc" class="merch-input" placeholder="Admin context note">' +
    '<label class="merch-label">Content Fields (comma-separated)</label><input id="mp-fields" class="merch-input" placeholder="h1, sub" value="h1, sub">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="saveMerchPlacement()" class="merch-btn-sm merch-btn-primary">Save</button></div></div>';
  modal.style.display = 'flex';
}

function saveMerchPlacement() {
  var url = document.getElementById('mp-url').value.trim();
  var eid = document.getElementById('mp-eid').value.trim();
  var name = document.getElementById('mp-name').value.trim();
  var desc = document.getElementById('mp-desc').value.trim();
  var fieldsRaw = document.getElementById('mp-fields').value.trim();
  if (!url || !eid || !name) { alert('Page URL, Element ID, and Name are required'); return; }
  var fields = fieldsRaw.split(',').map(function(f) { return f.trim(); }).filter(Boolean);
  sb.from('merch_placements').insert({
    page_url: url, element_id: eid, element_name: name,
    element_description: desc || null,
    content_format: { fields: fields, supports_html: true, placeholders: ['{JOBS}', '{COMPANIES}'] }
  }).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _logAdminAction('merch_placement_created', 'merch_placements', r.data[0].id, { name: name, page_url: url });
    closeMerchModal();
    _merchSelectedPlacement = r.data[0];
    fetchMerchPlacements();
  });
}

function toggleMerchPlacementActive(id, active) {
  if (!active && !confirm('Deactivating will hide all content for this placement from visitors. Continue?')) return;
  sb.from('merch_placements').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _logAdminAction('merch_placement_toggled', 'merch_placements', id, { active: active });
    fetchMerchPlacements();
  });
}

function deleteMerchPlacement(id) {
  if (!confirm('Delete this placement? This will also delete all rules and content entries. This cannot be undone.')) return;
  sb.from('merch_placements').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _logAdminAction('merch_placement_deleted', 'merch_placements', id, {});
    _merchSelectedPlacement = null;
    fetchMerchPlacements();
  });
}

// ─── Rules ───
function fetchMerchRules(placementId) {
  sb.from('merch_rules').select('*, merch_content(count)').eq('placement_id', placementId).order('priority', { ascending: false }).order('audience').then(function(r) {
    if (r.error) { console.error('[Merch] Rules error:', r.error); toastWarning('Merch rules failed to load'); return; }
    _merchRules = r.data || [];
    renderMerchRules();
    // auto-select first rule
    if (_merchRules.length > 0) selectMerchRule(_merchRules[0].id);
    else { _merchSelectedRule = null; renderMerchContent(); }
  });
}

function renderMerchRules() {
  var el = document.getElementById('merch-rules-list');
  if (!el) return;
  if (_merchRules.length === 0) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-faint);font-size:13px">No rules yet — add one to start adding content</div>';
    return;
  }
  var html = '';
  _merchRules.forEach(function(r) {
    var cohortName = r.cohort_id ? (_merchCohorts.find(function(c) { return c.id === r.cohort_id; }) || {}).name || r.cohort_id : 'All Cohorts';
    var cnt = (r.merch_content && r.merch_content[0]) ? r.merch_content[0].count : 0;
    var sel = _merchSelectedRule && _merchSelectedRule.id === r.id;
    var dot = r.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
    html += '<div class="merch-rule-row' + (sel ? ' selected' : '') + '" onclick="selectMerchRule(\'' + r.id + '\')" style="padding:8px 12px;cursor:pointer;border-radius:6px;background:' + (sel ? 'var(--accent-glow)' : 'var(--bg-card)') + ';border:1px solid ' + (sel ? 'var(--accent)' : 'var(--border)') + ';transition:all .15s">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center">';
    html += '<span style="font-size:13px"><strong>' + escHtml(cohortName) + '</strong> × <strong>' + escHtml(r.audience) + '</strong></span>';
    html += '<span style="font-size:12px;color:var(--text-faint)">' + cnt + ' entries &nbsp;' + dot + '</span>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--text-faint)">Priority: ' + r.priority + '</div>';
    html += '</div>';
  });
  el.innerHTML = html;
}

function selectMerchRule(id) {
  var r = _merchRules.find(function(x) { return x.id === id; });
  if (!r) return;
  _merchSelectedRule = r;
  renderMerchRules(); // re-render to update selection
  fetchMerchContent(r.id);
  // Show rule controls
  var ctrl = document.getElementById('merch-rule-controls');
  if (ctrl) {
    ctrl.innerHTML = '<button onclick="toggleMerchRuleActive(\'' + r.id + '\',' + !r.is_active + ')" class="merch-btn-sm">' + (r.is_active ? 'Deactivate' : 'Activate') + '</button>' +
      ' <button onclick="deleteMerchRule(\'' + r.id + '\')" class="merch-btn-sm merch-btn-danger">Delete Rule</button>';
  }
}

function showAddRuleForm() {
  if (!_merchSelectedPlacement) { alert('Select a placement first'); return; }
  var cohortOpts = '<option value="">All Cohorts</option>';
  _merchCohorts.forEach(function(c) { cohortOpts += '<option value="' + c.id + '">' + escHtml(c.name) + '</option>'; });
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner">' +
    '<h3 style="margin:0 0 16px">Add Rule</h3>' +
    '<label class="merch-label">Cohort</label><select id="mr-cohort" class="merch-input">' + cohortOpts + '</select>' +
    '<label class="merch-label">Audience</label><select id="mr-audience" class="merch-input"><option value="all">All</option><option value="new">New</option><option value="returning">Returning</option><option value="lapsed">Lapsed</option><option value="active">Active</option></select>' +
    '<label class="merch-label">Priority (higher = evaluated first)</label><input id="mr-priority" class="merch-input" type="number" value="0">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="saveMerchRule()" class="merch-btn-sm merch-btn-primary">Save</button></div></div>';
  modal.style.display = 'flex';
}

function saveMerchRule() {
  var cohort = document.getElementById('mr-cohort').value || null;
  var audience = document.getElementById('mr-audience').value;
  var priority = parseInt(document.getElementById('mr-priority').value) || 0;
  sb.from('merch_rules').insert({
    placement_id: _merchSelectedPlacement.id,
    cohort_id: cohort, audience: audience, priority: priority
  }).select().then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    closeMerchModal();
    _merchSelectedRule = r.data[0];
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

function toggleMerchRuleActive(id, active) {
  sb.from('merch_rules').update({ is_active: active, updated_at: new Date().toISOString() }).eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

function deleteMerchRule(id) {
  if (!confirm('Delete this rule and all its content entries? Cannot be undone.')) return;
  sb.from('merch_rules').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    _merchSelectedRule = null;
    fetchMerchRules(_merchSelectedPlacement.id);
  });
}

// ─── Content Entries ───
function fetchMerchContent(ruleId) {
  sb.from('merch_content').select('*').eq('rule_id', ruleId).order('sort_order').then(function(r) {
    if (r.error) { console.error('[Merch] Content error:', r.error); toastWarning('Merch content failed to load'); return; }
    _merchContent = r.data || [];
    renderMerchContent();
  });
}

function renderMerchContent() {
  var el = document.getElementById('merch-content-body');
  if (!el) return;
  var hdr = document.getElementById('merch-content-header');
  if (!_merchSelectedRule) {
    el.innerHTML = '';
    if (hdr) hdr.textContent = 'Content Entries';
    return;
  }
  var cohortName = _merchSelectedRule.cohort_id ? (_merchCohorts.find(function(c) { return c.id === _merchSelectedRule.cohort_id; }) || {}).name || _merchSelectedRule.cohort_id : 'All Cohorts';
  if (hdr) hdr.textContent = 'Content — ' + cohortName + ' × ' + _merchSelectedRule.audience + ' (' + _merchContent.length + ')';

  if (_merchContent.length === 0) {
    el.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-faint)">No entries yet</td></tr>';
    return;
  }
  var html = '';
  _merchContent.forEach(function(c, i) {
    var h1Preview = (c.content && c.content.h1) ? c.content.h1.replace(/<[^>]*>/g, '').substring(0, 50) : '—';
    var subPreview = (c.content && c.content.sub) ? c.content.sub.replace(/<[^>]*>/g, '').substring(0, 40) : '—';
    var dot = c.is_active ? '<span style="color:var(--green)">●</span>' : '<span style="color:var(--text-faint)">○</span>';
    var visits = c.min_visits > 0 ? '≥' + c.min_visits : '—';
    if (c.max_visits) visits += ' / ≤' + c.max_visits;
    html += '<tr style="cursor:pointer" onclick="showEditContentModal(\'' + c.id + '\')">';
    html += '<td style="font-family:var(--mono);font-size:11px;color:var(--text-faint);width:40px">' + c.sort_order + '</td>';
    html += '<td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(h1Preview) + '">' + escHtml(h1Preview) + '</td>';
    html += '<td style="font-size:11px;color:var(--text-faint);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(subPreview) + '</td>';
    html += '<td style="font-size:11px">' + (c.category ? '<span style="background:var(--purple-dim);color:var(--purple);padding:1px 6px;border-radius:3px;font-size:10px">' + escHtml(c.category) + '</span>' : '') + '</td>';
    html += '<td style="font-size:11px;font-family:var(--mono);color:var(--text-faint)">' + visits + '</td>';
    html += '<td style="text-align:center">' + dot + '</td>';
    html += '</tr>';
  });
  el.innerHTML = html;
}

// ─── Content Edit Modal ───
function showAddContentModal() {
  if (!_merchSelectedRule || !_merchSelectedPlacement) { alert('Select a placement and rule first'); return; }
  showContentModal(null);
}

function showEditContentModal(id) {
  var entry = _merchContent.find(function(c) { return c.id === id; });
  if (!entry) return;
  showContentModal(entry);
}

function showContentModal(entry) {
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var isEdit = !!entry;
  var modal = document.getElementById('merch-modal');
  var html = '<div class="merch-modal-inner" style="max-width:600px">';
  html += '<h3 style="margin:0 0 16px">' + (isEdit ? 'Edit' : 'Add') + ' Content Entry</h3>';

  // Content fields
  fields.forEach(function(f) {
    var val = (entry && entry.content && entry.content[f]) || '';
    html += '<label class="merch-label">' + f + '</label>';
    html += '<textarea id="mc-field-' + f + '" class="merch-input" rows="3" style="font-family:var(--mono);font-size:12px">' + escHtml(val) + '</textarea>';
  });

  // Metadata
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">';
  html += '<div><label class="merch-label">Category</label><input id="mc-category" class="merch-input" placeholder="persistence, humor, etc." value="' + escAttr((entry && entry.category) || '') + '"></div>';
  html += '<div><label class="merch-label">Sort Order</label><input id="mc-sort" class="merch-input" type="number" value="' + ((entry && entry.sort_order) || _merchContent.length) + '"></div>';
  html += '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:8px">';
  html += '<div><label class="merch-label">Min Visits</label><input id="mc-minv" class="merch-input" type="number" value="' + ((entry && entry.min_visits) || 0) + '"></div>';
  html += '<div><label class="merch-label">Max Visits</label><input id="mc-maxv" class="merch-input" type="number" value="' + ((entry && entry.max_visits) || '') + '" placeholder="no limit"></div>';
  html += '<div><label class="merch-label">Season Months</label><input id="mc-season" class="merch-input" placeholder="1,2,12" value="' + ((entry && entry.season && entry.season.months) ? entry.season.months.join(',') : '') + '"></div>';
  html += '</div>';
  html += '<div style="margin-top:8px"><label style="font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:6px"><input type="checkbox" id="mc-active"' + ((!entry || entry.is_active) ? ' checked' : '') + '> Active</label></div>';

  // Preview
  html += '<div style="margin-top:16px;padding:16px;background:var(--bg);border:1px solid var(--border);border-radius:8px">';
  html += '<div style="font-size:11px;color:var(--text-faint);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">Preview</div>';
  html += '<div id="mc-preview" style="font-size:14px;line-height:1.5"></div>';
  html += '</div>';

  // Buttons
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (isEdit) {
    html += '<button onclick="deleteMerchContent(\'' + entry.id + '\')" class="merch-btn-sm merch-btn-danger" style="margin-right:auto">Delete</button>';
  }
  html += '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>';
  html += '<button onclick="saveMerchContent(' + (isEdit ? "'" + entry.id + "'" : 'null') + ')" class="merch-btn-sm merch-btn-primary">Save</button></div>';
  html += '</div>';

  modal.innerHTML = html;
  modal.style.display = 'flex';

  // Wire up live preview
  var previewFields = fields;
  previewFields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    if (ta) ta.addEventListener('input', updateMerchPreview);
  });
  updateMerchPreview();
}

function updateMerchPreview() {
  var el = document.getElementById('mc-preview');
  if (!el) return;
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var html = '';
  fields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    if (!ta) return;
    var val = ta.value.replace(/\{JOBS\}/g, '<span style="color:var(--accent)">135,000</span>').replace(/\{COMPANIES\}/g, '<span style="color:var(--accent)">7,500</span>');
    if (f === 'h1') html += '<div style="font-size:18px;font-weight:700;margin-bottom:6px">' + val + '</div>';
    else html += '<div style="font-size:13px;color:var(--text-dim)">' + val + '</div>';
  });
  el.innerHTML = html;
}

function saveMerchContent(editId) {
  var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
  var content = {};
  fields.forEach(function(f) {
    var ta = document.getElementById('mc-field-' + f);
    content[f] = ta ? ta.value : '';
  });
  var category = document.getElementById('mc-category').value.trim() || null;
  var sort = parseInt(document.getElementById('mc-sort').value) || 0;
  var minv = parseInt(document.getElementById('mc-minv').value) || 0;
  var maxvRaw = document.getElementById('mc-maxv').value.trim();
  var maxv = maxvRaw ? parseInt(maxvRaw) : null;
  var seasonRaw = document.getElementById('mc-season').value.trim();
  var season = seasonRaw ? { months: seasonRaw.split(',').map(function(m) { return parseInt(m.trim()); }).filter(function(m) { return !isNaN(m); }) } : null;
  var active = document.getElementById('mc-active').checked;

  var payload = {
    content: content, category: category, sort_order: sort,
    min_visits: minv, max_visits: maxv, season: season,
    is_active: active, updated_at: new Date().toISOString()
  };

  if (editId) {
    sb.from('merch_content').update(payload).eq('id', editId).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
    });
  } else {
    payload.rule_id = _merchSelectedRule.id;
    sb.from('merch_content').insert(payload).then(function(r) {
      if (r.error) { alert('Error: ' + r.error.message); return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
    });
  }
}

function deleteMerchContent(id) {
  if (!confirm('Delete this content entry?')) return;
  sb.from('merch_content').delete().eq('id', id).then(function(r) {
    if (r.error) { alert('Error: ' + r.error.message); return; }
    closeMerchModal();
    fetchMerchContent(_merchSelectedRule.id);
  });
}

// ─── Bulk Import ───
function showBulkImportModal() {
  if (!_merchSelectedRule) { alert('Select a rule first'); return; }
  var modal = document.getElementById('merch-modal');
  modal.innerHTML = '<div class="merch-modal-inner" style="max-width:600px">' +
    '<h3 style="margin:0 0 16px">Bulk Import</h3>' +
    '<p style="font-size:12px;color:var(--text-dim);margin-bottom:8px">Paste a JSON array of content objects. Each should have fields matching the placement format (e.g. h1, sub). Optional: category, min_visits.</p>' +
    '<textarea id="mc-bulk" class="merch-input" rows="12" style="font-family:var(--mono);font-size:11px" placeholder=\'[{"h1":"...", "sub":"...", "category":"humor"}]\'></textarea>' +
    '<div id="mc-bulk-status" style="font-size:12px;margin-top:8px"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">' +
    '<button onclick="closeMerchModal()" class="merch-btn-sm">Cancel</button>' +
    '<button onclick="runBulkImport()" class="merch-btn-sm merch-btn-primary">Import</button></div></div>';
  modal.style.display = 'flex';
}

function runBulkImport() {
  var raw = document.getElementById('mc-bulk').value.trim();
  var status = document.getElementById('mc-bulk-status');
  try {
    var entries = JSON.parse(raw);
    if (!Array.isArray(entries)) throw new Error('Must be a JSON array');
    var rows = entries.map(function(e, i) {
      var content = {};
      var fields = (_merchSelectedPlacement.content_format && _merchSelectedPlacement.content_format.fields) || ['h1', 'sub'];
      fields.forEach(function(f) { content[f] = e[f] || ''; });
      return {
        rule_id: _merchSelectedRule.id,
        content: content,
        sort_order: _merchContent.length + i,
        category: e.category || null,
        min_visits: e.min_visits || 0,
        max_visits: e.max_visits || null,
        season: e.season || null,
        is_active: true
      };
    });
    status.textContent = 'Importing ' + rows.length + ' entries...';
    status.style.color = 'var(--accent)';
    sb.from('merch_content').insert(rows).then(function(r) {
      if (r.error) { status.textContent = 'Error: ' + r.error.message; status.style.color = 'var(--red)'; return; }
      closeMerchModal();
      fetchMerchContent(_merchSelectedRule.id);
      fetchMerchRules(_merchSelectedPlacement.id); // refresh counts
    });
  } catch (e) {
    status.textContent = 'Parse error: ' + e.message;
    status.style.color = 'var(--red)';
  }
}

// ─── Utilities ───
function closeMerchModal() {
  var modal = document.getElementById('merch-modal');
  if (modal) modal.style.display = 'none';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Admin: Signals Tab (Phase D) ─────────────────────────────────
async function loadAdminSignals() {
  try {
    // KPIs
    var total = 0, pending = 0, confirmed = 0, dismissed = 0;
    var sourceCounts = {};
    var recentRows = [];

    var { data: signals } = await sb.from('pipeline_signals')
      .select('id, signal_source, signal_type, proposed_stage, confidence, status, user_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (signals) {
      total = signals.length;
      signals.forEach(function(s) {
        if (s.status === 'pending_confirmation') pending++;
        else if (s.status === 'confirmed') confirmed++;
        else if (s.status === 'dismissed') dismissed++;
        sourceCounts[s.signal_source] = (sourceCounts[s.signal_source] || 0) + 1;
      });
      recentRows = signals.slice(0, 50);
    }

    var rate = (confirmed + dismissed) > 0 ? Math.round((confirmed / (confirmed + dismissed)) * 100) + '%' : '—';
    var el;
    el = document.getElementById('sig-total'); if (el) el.textContent = total;
    el = document.getElementById('sig-pending'); if (el) el.textContent = pending;
    el = document.getElementById('sig-confirmed'); if (el) el.textContent = confirmed;
    el = document.getElementById('sig-dismissed'); if (el) el.textContent = dismissed;
    el = document.getElementById('sig-rate'); if (el) el.textContent = rate;

    // Signals by Source chart
    var sourceEl = document.getElementById('sig-chart-source');
    if (sourceEl && typeof echarts !== 'undefined') {
      var srcChart = echarts.init(sourceEl);
      var srcData = Object.entries(sourceCounts).map(function(e) { return { name: e[0], value: e[1] }; });
      srcChart.setOption({
        tooltip: { trigger: 'item' },
        series: [{ type: 'pie', radius: ['40%', '70%'], data: srcData,
          label: { color: 'var(--text-dim)', fontSize: 11 },
          itemStyle: { borderRadius: 4, borderColor: 'var(--bg-input)', borderWidth: 2 }
        }]
      });
    }

    // Pattern Confidence Distribution
    var { data: patterns } = await sb.from('signal_patterns')
      .select('pattern_type, pattern_value, associated_signal_type, confidence_score, confirmations, dismissals, last_seen_at')
      .order('confidence_score', { ascending: false });

    var patternEl = document.getElementById('sig-chart-patterns');
    if (patternEl && patterns && typeof echarts !== 'undefined') {
      var patChart = echarts.init(patternEl);
      var buckets = { '90-100': 0, '70-89': 0, '50-69': 0, '30-49': 0, '<30': 0 };
      patterns.forEach(function(p) {
        var s = Math.round(p.confidence_score * 100);
        if (s >= 90) buckets['90-100']++;
        else if (s >= 70) buckets['70-89']++;
        else if (s >= 50) buckets['50-69']++;
        else if (s >= 30) buckets['30-49']++;
        else buckets['<30']++;
      });
      patChart.setOption({
        tooltip: {},
        xAxis: { type: 'category', data: Object.keys(buckets), axisLabel: { color: 'var(--text-dim)', fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { color: 'var(--text-dim)', fontSize: 10 } },
        series: [{ type: 'bar', data: Object.values(buckets), itemStyle: { color: 'var(--accent)', borderRadius: [4, 4, 0, 0] } }]
      });
    }

    // Patterns table
    var patBody = document.getElementById('sig-patterns-body');
    if (patBody && patterns) {
      patBody.innerHTML = patterns.map(function(p) {
        var confPct = Math.round(p.confidence_score * 100);
        var confColor = confPct >= 80 ? '#22c55e' : confPct >= 60 ? '#f59e0b' : '#ef4444';
        var lastSeen = p.last_seen_at ? new Date(p.last_seen_at).toLocaleDateString() : '—';
        return '<tr><td>' + escHtml(p.pattern_type) + '</td><td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escHtml(p.pattern_value) +
          '</td><td>' + escHtml(p.associated_signal_type) + '</td><td style="color:' + confColor + ';font-weight:600">' + confPct + '%</td><td>' + p.confirmations +
          '</td><td>' + p.dismissals + '</td><td>' + lastSeen + '</td></tr>';
      }).join('');
    }

    // Recent signals table
    var sigBody = document.getElementById('sig-recent-body');
    if (sigBody) {
      sigBody.innerHTML = recentRows.map(function(s) {
        var confPct = s.confidence ? Math.round(s.confidence * 100) + '%' : '—';
        var statusColor = s.status === 'confirmed' ? '#22c55e' : s.status === 'dismissed' ? '#ef4444' : '#f59e0b';
        var dt = new Date(s.created_at);
        var dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return '<tr><td style="font-size:10px">' + (s.user_id || '').substring(0, 8) + '…</td><td>' + escHtml(s.signal_source) +
          '</td><td>' + escHtml(s.signal_type) + '</td><td>' + escHtml(s.proposed_stage || '—') +
          '</td><td>' + confPct + '</td><td style="color:' + statusColor + '">' + escHtml(s.status) +
          '</td><td style="font-size:11px">' + dateStr + '</td></tr>';
      }).join('');
    }
  } catch (e) {
    reportError('admin_merch', e);
    console.error('[Admin] Signals tab error:', e); toastError('Signals tab failed to load');
  }
}

