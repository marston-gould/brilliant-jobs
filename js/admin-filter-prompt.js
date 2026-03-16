// js/admin-filter-prompt.js — SPEC-ADMIN-002-S2: Filter & Prompt Manager

var _fpState = { fpTab: 'filters', editingFilter: null, editingPrompt: null };

async function loadFilterPromptTab() {
  var panel = document.getElementById('admin-panel-filter-prompt');
  if (!panel) return;
  panel.innerHTML = [
    '<div style="display:flex;gap:8px;margin-bottom:16px">',
    '  <button class="fp-tab active" onclick="fpSwitch(this,\'filters\')">Filter Config</button>',
    '  <button class="fp-tab" onclick="fpSwitch(this,\'prompts\')">Prompt Templates</button>',
    '</div>',
    '<div id="fp-filters-panel">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
    '    <div style="font-size:13px;color:var(--text-dim)">Job feed filter definitions — admin-editable without code deploy</div>',
    '    <button onclick="fpOpenFilter(null)" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">+ New Filter</button>',
    '  </div>',
    '  <table class="admin-table" style="width:100%"><thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Weight</th><th>Active</th><th></th></tr></thead>',
    '  <tbody id="fp-filter-tbody"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody></table>',
    '</div>',
    '<div id="fp-prompts-panel" style="display:none">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">',
    '    <select id="fp-feature-filter" onchange="fpLoadPrompts()" style="padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px">',
    '      <option value="">All Features</option>',
    '      <option value="job_scoring">job_scoring</option>',
    '      <option value="resume_rewrite">resume_rewrite</option>',
    '      <option value="cover_letter">cover_letter</option>',
    '      <option value="interview_prep">interview_prep</option>',
    '    </select>',
    '    <button onclick="fpOpenPrompt(null)" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">+ New Prompt</button>',
    '  </div>',
    '  <table class="admin-table" style="width:100%"><thead><tr><th>Name</th><th>Feature</th><th>Role</th><th>Version</th><th>Active</th><th></th></tr></thead>',
    '  <tbody id="fp-prompt-tbody"><tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr></tbody></table>',
    '</div>',
    // Filter editor modal
    '<div id="fp-filter-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center">',
    '  <div style="background:var(--bg-card);border-radius:10px;border:1px solid var(--border);width:480px;max-height:90vh;overflow-y:auto;padding:24px">',
    '    <div style="display:flex;justify-content:space-between;margin-bottom:16px"><h3 id="fp-filter-modal-title" style="margin:0;font-size:15px">Filter</h3><button onclick="fpCloseFilter()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:20px">×</button></div>',
    '    <div id="fp-filter-editor-body"></div>',
    '  </div>',
    '</div>',
    // Prompt editor modal
    '<div id="fp-prompt-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center">',
    '  <div style="background:var(--bg-card);border-radius:10px;border:1px solid var(--border);width:600px;max-height:90vh;overflow-y:auto;padding:24px">',
    '    <div style="display:flex;justify-content:space-between;margin-bottom:16px"><h3 id="fp-prompt-modal-title" style="margin:0;font-size:15px">Prompt Template</h3><button onclick="fpClosePrompt()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:20px">×</button></div>',
    '    <div id="fp-prompt-editor-body"></div>',
    '  </div>',
    '</div>',
  ].join('');

  await fpLoadFilters();
}

function fpSwitch(btn, tab) {
  document.querySelectorAll('.fp-tab').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  _fpState.fpTab = tab;
  document.getElementById('fp-filters-panel').style.display = tab === 'filters' ? '' : 'none';
  document.getElementById('fp-prompts-panel').style.display = tab === 'prompts' ? '' : 'none';
  if (tab === 'prompts') fpLoadPrompts();
}

async function fpLoadFilters() {
  var tbody = document.getElementById('fp-filter-tbody');
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_filters', include_inactive: true }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    var filters = data.filters || [];
    if (!tbody) return;
    if (!filters.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">No filters</td></tr>'; return; }
    tbody.innerHTML = filters.map(function(f) {
      return '<tr>' +
        '<td style="font-family:var(--mono);font-size:12px">' + escapeHtml(f.key) + '</td>' +
        '<td>' + escapeHtml(f.label) + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(f.type) + '</td>' +
        '<td style="font-family:var(--mono)">' + (f.weight||1).toFixed(1) + '</td>' +
        '<td style="color:' + (f.is_active ? 'var(--green)' : 'var(--text-faint)') + '">' + (f.is_active ? '●' : '○') + '</td>' +
        '<td><button onclick="fpOpenFilter(\'' + f.key + '\')" style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:11px;cursor:pointer">Edit</button></td>' +
        '</tr>';
    }).join('');
    window._fpFilters = filters;
  } catch(e) { reportError('admin-filter-prompt:filters', e); }
}

async function fpLoadPrompts() {
  var tbody = document.getElementById('fp-prompt-tbody');
  var feature = document.getElementById('fp-feature-filter')?.value || '';
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_prompts', feature, include_inactive: true }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    var prompts = data.prompts || [];
    if (!tbody) return;
    if (!prompts.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-faint)">No prompts</td></tr>'; return; }
    tbody.innerHTML = prompts.map(function(p) {
      return '<tr>' +
        '<td style="font-size:13px;font-weight:500">' + escapeHtml(p.name) + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(p.feature) + '</td>' +
        '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(p.role) + '</td>' +
        '<td style="font-family:var(--mono)">' + p.version + '</td>' +
        '<td style="color:' + (p.is_active ? 'var(--green)' : 'var(--text-faint)') + '">' + (p.is_active ? '● active' : '○ inactive') + '</td>' +
        '<td><button onclick="fpOpenPrompt(\'' + p.id + '\')" style="padding:2px 8px;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);color:var(--text-dim);font-size:11px;cursor:pointer">Edit</button></td>' +
        '</tr>';
    }).join('');
    window._fpPrompts = prompts;
  } catch(e) { reportError('admin-filter-prompt:prompts', e); }
}

function fpOpenFilter(filterKey) {
  var f = filterKey ? (window._fpFilters||[]).find(function(x){ return x.key===filterKey; }) : null;
  _fpState.editingFilter = f || null;
  var modal = document.getElementById('fp-filter-modal');
  var title = document.getElementById('fp-filter-modal-title');
  var body = document.getElementById('fp-filter-editor-body');
  if (!modal) return;
  if (title) title.textContent = f ? 'Edit Filter: ' + f.key : 'New Filter';
  modal.style.display = 'flex';
  if (p) setTimeout(function(){ fpLoadVersionHistory(p.name); fpDetectVars(); }, 100);
  var inp = function(lbl, id, val, type) {
    return '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">' + lbl + '</label>' +
      '<input type="' + (type||'text') + '" id="fpf-' + id + '" value="' + escapeHtml(String(val??'')) + '" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>';
  };
  body.innerHTML = inp('Key (snake_case)', 'key', f?.key) + inp('Label', 'label', f?.label) +
    '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">Type</label>' +
    '<select id="fpf-type" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px">' +
    ['range','select','toggle','multi-select'].map(function(t){ return '<option' + (f?.type===t?' selected':'') + '>' + t + '</option>'; }).join('') + '</select></div>' +
    inp('Weight (scoring influence)', 'weight', f?.weight??1, 'number') +
    inp('Sort Order', 'sort', f?.sort_order??0, 'number') +
    '<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:16px">' +
    '<input type="checkbox" id="fpf-active"' + ((f?.is_active!==false)?' checked':'') + '> Active</label>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
    '<button onclick="fpCloseFilter()" style="padding:7px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">Cancel</button>' +
    '<button onclick="fpSaveFilter()" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Save</button></div>';
}

function fpCloseFilter() {
  var modal = document.getElementById('fp-filter-modal');
  if (modal) modal.style.display = 'none';
}

async function fpSaveFilter() {
  var g = function(id, num) {
    var el = document.getElementById('fpf-' + id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return num ? parseFloat(el.value) : el.value.trim();
  };
  var filter = { key: g('key'), label: g('label'), type: document.getElementById('fpf-type')?.value,
    weight: g('weight', true)||1, sort_order: g('sort', true)||0, is_active: g('active') };
  if (!filter.key || !filter.label) return toastWarning('Key and label required');
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upsert_filter', filter }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toastSuccess('Filter saved');
    // §7.1: Warn if weight changed — existing scores NOT retroactively recomputed
    if (filter.weight !== (_fpState.editingFilter?.weight ?? 1)) {
      toastWarning('Weight changed. Note: existing job scores are NOT retroactively recomputed. Takes effect on next scoring run.');
    }
    fpCloseFilter();
    fpLoadFilters();
  } catch(e) { reportError('admin-filter-prompt:save-filter', e); toastWarning('Save failed: ' + e.message); }
}

function fpOpenPrompt(promptId) {
  var p = promptId ? (window._fpPrompts||[]).find(function(x){ return x.id===promptId; }) : null;
  _fpState.editingPrompt = p || null;
  var modal = document.getElementById('fp-prompt-modal');
  var title = document.getElementById('fp-prompt-modal-title');
  var body = document.getElementById('fp-prompt-editor-body');
  if (!modal) return;
  if (title) title.textContent = p ? 'Edit: ' + p.name : 'New Prompt';
  modal.style.display = 'flex';
  var inp = function(lbl, id, val, type) {
    return '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">' + lbl + '</label>' +
      '<input type="' + (type||'text') + '" id="fpp-' + id + '" value="' + escapeHtml(String(val??'')) + '" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>';
  };
  body.innerHTML = [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">',
    inp('Name', 'name', p?.name), inp('Feature', 'feature', p?.feature),
    '</div>',
    '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">Role</label>',
    '<select id="fpp-role" style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px">',
    ['system','user','assistant'].map(function(r){ return '<option' + (p?.role===r?' selected':'') + '>' + r + '</option>'; }).join(''),
    '</select></div>',
    '<div style="margin-bottom:10px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:3px">Template <span id="fpp-vars" style="color:var(--accent);font-size:10px;margin-left:8px"></span></label>',
    '<textarea id="fpp-template" oninput="fpDetectVars()" rows="8" style="width:100%;padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:var(--mono);resize:vertical;box-sizing:border-box">' + escapeHtml(p?.template||'') + '</textarea></div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">',
    inp('Model override', 'model', p?.model),
    inp('Max tokens', 'max_tokens', p?.max_tokens, 'number'),
    inp('Temperature', 'temperature', p?.temperature, 'number'),
    '</div>',
    // Version history panel
    (p ? [
      '<details style="margin-bottom:16px">',
      '  <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none">Version History</summary>',
      '  <div id="fp-version-history" style="margin-top:8px;font-size:12px;color:var(--text-faint)">Loading…</div>',
      '</details>',
    ] : []).join(''),
    // Test runner
    '<details style="margin-bottom:16px">',
    '  <summary style="font-size:12px;color:var(--text-dim);cursor:pointer;user-select:none">Test Runner — fire prompt with test values</summary>',
    '  <div style="margin-top:8px">',
    '    <div id="fp-test-vars-container" style="margin-bottom:8px"><span style="font-size:11px;color:var(--text-faint)">Enter template values then run test.</span></div>',
    '    <textarea id="fp-test-vars" rows="3" placeholder='{"var1": "value1", "var2": "value2"}' style="width:100%;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:var(--mono);box-sizing:border-box"></textarea>',
    '    <button onclick="fpRunTest()" style="padding:6px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer;margin-top:6px">Run Test</button>',
    '    <div id="fp-test-result" style="margin-top:8px;font-size:12px;display:none">',
    '      <div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Response:</div>',
    '      <pre id="fp-test-output" style="background:var(--bg-input);padding:8px;border-radius:6px;font-size:11px;overflow-x:auto;white-space:pre-wrap;max-height:200px;overflow-y:auto"></pre>',
    '    </div>',
    '  </div>',
    '</details>',
    '<div style="display:flex;gap:8px;justify-content:flex-end">',
    '<button onclick="fpClosePrompt()" style="padding:7px 14px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">Cancel</button>',
    '<button onclick="fpSavePrompt()" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Save (new version)</button>',
    '</div>',
  ].join('');
  fpDetectVars();
}

function fpDetectVars() {
  var ta = document.getElementById('fpp-template');
  var varEl = document.getElementById('fpp-vars');
  var inspectorEl = document.getElementById('fpp-var-inspector');
  if (!ta || !varEl) return;
  var matches = [...ta.value.matchAll(/\{\{(\w+)\}\}/g)];
  var vars = [...new Set(matches.map(function(m){ return m[1]; }))];
  varEl.textContent = vars.length ? vars.length + ' variable' + (vars.length > 1 ? 's' : '') + ' detected' : '';

  // Variable inspector: show each var with required/optional toggle
  if (!inspectorEl) return;
  if (!vars.length) { inspectorEl.innerHTML = ''; return; }
  inspectorEl.innerHTML = '<div style="font-size:11px;color:var(--text-faint);margin-bottom:4px">Variable Inspector</div>' +
    vars.map(function(v) {
      var reqId = 'fpvar-req-' + v;
      return '<label style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;margin-bottom:4px;font-size:12px;cursor:pointer">' +
        '<input type="checkbox" id="' + reqId + '" checked> ' +
        '<code style="background:var(--bg-input);padding:1px 5px;border-radius:4px">{{' + v + '}}</code>' +
        '<span style="font-size:10px;color:var(--text-faint)">required</span>' +
        '</label>';
    }).join('');
}

function fpGetRequiredVars() {
  var boxes = document.querySelectorAll('[id^="fpvar-req-"]');
  var required = [];
  boxes.forEach(function(cb) {
    if (cb.checked) required.push(cb.id.replace('fpvar-req-', ''));
  });
  return required;
}

function fpClosePrompt() {
  var modal = document.getElementById('fp-prompt-modal');
  if (modal) modal.style.display = 'none';
}

async function fpSavePrompt() {
  var g = function(id) { var el = document.getElementById('fpp-' + id); return el ? el.value.trim()||null : null; };
  var prompt = {
    name: g('name'), feature: g('feature'),
    role: document.getElementById('fpp-role')?.value || 'user',
    template: g('template'),
    model: g('model'), max_tokens: parseInt(g('max_tokens')||'0')||null,
    temperature: parseFloat(g('temperature')||'0')||null,
    required_variables: fpGetRequiredVars(),
  };
  if (!prompt.name || !prompt.feature || !prompt.template) return toastWarning('Name, feature, and template required');
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_prompt', prompt }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.missing_variables ? ': missing ' + data.missing_variables.join(', ') : ''));
    toastSuccess('Prompt saved (v' + data.prompt?.version + ')');
    fpClosePrompt();
    fpLoadPrompts();
  } catch(e) { reportError('admin-filter-prompt:save-prompt', e); toastWarning('Save failed: ' + e.message); }
}

async function fpRunTest() {
  var p = _fpState.editingPrompt;
  if (!p?.id) { toastWarning('Save the prompt first to test it'); return; }
  var varsEl = document.getElementById('fp-test-vars');
  var resultEl = document.getElementById('fp-test-result');
  var outputEl = document.getElementById('fp-test-output');
  if (!varsEl) return;

  var testVars = {};
  try {
    if (varsEl.value.trim()) testVars = JSON.parse(varsEl.value);
  } catch(e) { return toastWarning('Invalid JSON in test variables'); }

  if (resultEl) resultEl.style.display = 'none';
  var btn = document.querySelector('[onclick="fpRunTest()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test_prompt', prompt_id: p.id, test_variables: testVars }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error + (data.unresolved ? ' (unresolved: ' + data.unresolved.join(', ') + ')' : ''));

    var responseText = data.response?.content?.[0]?.text || JSON.stringify(data.response, null, 2);
    if (outputEl) outputEl.textContent = responseText;
    if (resultEl) resultEl.style.display = '';
    toastSuccess('Test completed (' + (data.usage?.output_tokens || '?') + ' tokens)');
  } catch(e) {
    reportError('admin-filter-prompt:test', e);
    if (outputEl) outputEl.textContent = 'Error: ' + e.message;
    if (resultEl) resultEl.style.display = '';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Run Test'; }
  }
}

async function fpLoadVersionHistory(promptName) {
  var el = document.getElementById('fp-version-history');
  if (!el) return;
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'prompt_version_history', prompt_name: promptName }),
    });
    var data = await res.json();
    var versions = data.versions || [];
    el.innerHTML = '<table class="admin-table" style="width:100%;font-size:11px"><thead><tr><th>v</th><th>Active</th><th>Updated</th><th>By</th><th></th></tr></thead><tbody>' +
      versions.map(function(v) {
        return '<tr style="' + (v.is_active ? 'background:rgba(99,102,241,0.05)' : '') + '">' +
          '<td style="font-family:var(--mono)">' + v.version + '</td>' +
          '<td>' + (v.is_active ? '✓' : '') + '</td>' +
          '<td>' + new Date(v.updated_at).toLocaleDateString() + '</td>' +
          '<td style="font-size:10px">' + escapeHtml((v.profiles?.email||'').split('@')[0]) + '</td>' +
          '<td>' + (!v.is_active ? '<button onclick="fpRestoreVersion(\'' + v.id + '\')" style="padding:1px 6px;border:1px solid var(--border);border-radius:4px;font-size:10px;cursor:pointer">Restore</button>' : '') + '</td>' +
          '</tr>';
      }).join('') + '</tbody></table>';
  } catch(e) { el.textContent = 'Failed to load history'; }
}

async function fpRestoreVersion(versionId) {
  if (!confirm('Restore this version as the active prompt?')) return;
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-filter-prompt', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'restore_prompt_version', prompt_id: versionId }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toastSuccess('Version restored');
    fpClosePrompt();
    fpLoadPrompts();
  } catch(e) { reportError('admin-filter-prompt:restore', e); toastWarning('Restore failed: ' + e.message); }
}

(function() {
  ['loadFilterPromptTab','fpLoadFilters','fpLoadPrompts','fpOpenFilter','fpSaveFilter',
   'fpOpenPrompt','fpSavePrompt','fpCloseFilter','fpClosePrompt','fpSwitch','fpDetectVars'].forEach(function(n) {
    if (typeof window[n] === 'function') { window.BJ[n] = window[n]; window.BJ._registry[n] = { module: 'admin-filter-prompt', registered: Date.now() }; }
  });
})();
