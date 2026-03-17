// @ts-nocheck
// js/admin-cohort-manager-full.js
// SPEC-ADMIN-002-S1: Cohort Manager — full CRUD (List + Editor)
// Powers admin-panel-cohort-manager

var _cmState = { cohorts: [], editing: null, loading: false };

async function loadCohortManagerTab() {
  var panel = document.getElementById('admin-panel-cohort-manager');
  if (!panel) return;
  panel.innerHTML = [
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">',
    '  <h3 style="margin:0;font-size:15px">Cohort Manager</h3>',
    '  <button onclick="cmOpenEditor(null)" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">+ New Cohort</button>',
    '</div>',
    '<div style="overflow-x:auto">',
    '<table class="admin-table" style="width:100%">',
    '  <thead><tr>',
    '    <th>Name / Slug</th><th>Monthly</th><th>Annual</th><th>Cr/mo</th>',
    '    <th>Rollover</th><th style="text-align:right">Members</th>',
    '    <th>Public</th><th></th>',
    '  </tr></thead>',
    '  <tbody id="cm-tbody"><tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '</table>',
    '</div>',
    // Editor modal
    '<div id="cm-editor-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;display:none;align-items:center;justify-content:center">',
    '  <div style="background:var(--bg-card);border-radius:10px;border:1px solid var(--border);width:560px;max-height:90vh;overflow-y:auto;padding:24px">',
    '    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">',
    '      <h3 id="cm-editor-title" style="margin:0;font-size:15px">New Cohort</h3>',
    '      <button onclick="cmCloseEditor()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:20px">×</button>',
    '    </div>',
    '    <div id="cm-editor-body"></div>',
    '  </div>',
    '</div>',
  ].join('');
  await cmLoadList();
}

async function cmLoadList() {
  var tbody = document.getElementById('cm-tbody');
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-cohort-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', include_archived: false }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _cmState.cohorts = data.cohorts || [];
    if (!tbody) return;
    if (_cmState.cohorts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint)">No cohorts</td></tr>';
      return;
    }
    tbody.innerHTML = _cmState.cohorts.map(function(c) {
      var rolloverLabel = c.rollover_cap === 0 ? 'None' : c.rollover_cap === -1 ? 'Full' : 'Cap ' + c.rollover_cap;
      var monthly = c.price_monthly_cents === 0 ? 'Free' : '$' + (c.price_monthly_cents / 100).toFixed(0) + '/mo';
      var annual = c.price_annual_cents === 0 ? 'Free' : '$' + (c.price_annual_cents / 100).toFixed(0) + '/yr';
      return [
        '<tr>',
        '  <td><div style="font-weight:500">' + escapeHtml(c.name) + '</div>',
        '    <div style="font-size:11px;color:var(--text-faint);font-family:var(--mono)">' + escapeHtml(c.slug) + '</div></td>',
        '  <td style="font-family:var(--mono)">' + monthly + '</td>',
        '  <td style="font-family:var(--mono)">' + annual + '</td>',
        '  <td style="font-family:var(--mono)">' + c.credits_monthly + '</td>',
        '  <td style="font-size:12px">' + rolloverLabel + '</td>',
        '  <td style="text-align:right;font-family:var(--mono)">' + (c.member_count || 0).toLocaleString() + '</td>',
        '  <td>' + (c.is_public ? '<span style="color:var(--green);font-size:12px">●&nbsp;Yes</span>' : '<span style="color:var(--text-faint);font-size:12px">○&nbsp;No</span>') + '</td>',
        '  <td style="white-space:nowrap">',
        '    <button onclick="cmOpenEditor(\'' + c.id + '\')" style="padding:3px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer;margin-right:4px">Edit</button>',
        '    <button onclick="cmArchive(\'' + c.id + '\')" style="padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">Archive</button> ',
        '    <button onclick="cmDuplicate(\'' + c.id + '\')" style="padding:3px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">Duplicate</button>',
        '  </td>',
        '</tr>',
      ].join('');
    }).join('');
  } catch(e) {
    reportError('admin-cohort-manager:list', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="color:var(--red);padding:16px">' + escapeHtml(e.message) + '</td></tr>';
  }
}

function cmOpenEditor(cohortId) {
  var overlay = document.getElementById('cm-editor-overlay');
  var title = document.getElementById('cm-editor-title');
  var body = document.getElementById('cm-editor-body');
  if (!overlay || !body) return;

  var c = cohortId ? _cmState.cohorts.find(function(x){ return x.id === cohortId; }) : null;
  _cmState.editing = c || null;
  if (title) title.textContent = c ? 'Edit: ' + c.name : 'New Cohort';

  overlay.style.display = 'flex';

  var field = function(label, id, val, type) {
    return '<div><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">' + label + '</label>' +
      '<input type="' + (type||'text') + '" id="cm-' + id + '" value="' + escapeHtml(String(val ?? '')) + '"' +
      ' style="width:100%;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>';
  };
  var toggle = function(label, id, val) {
    return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px">' +
      '<input type="checkbox" id="cm-' + id + '"' + (val ? ' checked' : '') + '>' +
      label + '</label>';
  };

  body.innerHTML = [
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">',
    field('Name', 'name', c?.name),
    field('Slug', 'slug', c?.slug),
    field('Monthly Price (cents)', 'price_monthly', c?.price_monthly_cents ?? 0, 'number'),
    field('Annual Price (cents)', 'price_annual', c?.price_annual_cents ?? 0, 'number'),
    field('Credits / Month', 'credits', c?.credits_monthly ?? 0, 'number'),
    field('Rollover Cap (0=none, -1=full, N=cap)', 'rollover', c?.rollover_cap ?? 0, 'number'),
    field('Sort Order', 'sort', c?.sort_order ?? 0, 'number'),
    field('Stripe Monthly Price ID', 'stripe_monthly', c?.stripe_monthly_price_id),
    field('Stripe Annual Price ID', 'stripe_annual', c?.stripe_annual_price_id),
    field('Max Auto-Apply Daily', 'max_auto_apply', c?.max_auto_apply_daily ?? ''),
    field('Max Saved Jobs', 'max_saved', c?.max_saved_jobs ?? ''),
    field('Max Recruiter Lookups/day', 'max_recruiter', c?.max_recruiter_lookups_daily ?? ''),
    '</div>',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">',
    toggle('Public (shown on pricing page)', 'is_public', c?.is_public ?? true),
    toggle('CSV Export Enabled', 'csv_export', c?.csv_export_enabled ?? false),
    toggle('API Access Enabled', 'api_access', c?.api_access_enabled ?? false),
    '</div>',
    '<div id="cm-price-warning" style="display:none;padding:10px;background:rgba(245,158,11,0.1);border:1px solid var(--warm);border-radius:6px;font-size:12px;color:var(--warm);margin-bottom:12px">',
    '  ⚠ Price change detected. Active Stripe subscriptions are NOT automatically updated.',
    '</div>',
    '<div style="display:flex;gap:8px;justify-content:flex-end">',
    '  <button onclick="cmCloseEditor()" style="padding:8px 16px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">Cancel</button>',
    '  <button onclick="cmSave()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600">Save Cohort</button>',
    '</div>',
  ].join('');
}

function cmCloseEditor() {
  var overlay = document.getElementById('cm-editor-overlay');
  if (overlay) overlay.style.display = 'none';
  _cmState.editing = null;
}

async function cmSave() {
  var get = function(id, num) {
    var el = document.getElementById('cm-' + id);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    if (num) { var v = parseInt(el.value, 10); return isNaN(v) ? null : v; }
    return el.value.trim() || null;
  };

  var fields = {
    name: get('name'), slug: get('slug') ? get('slug').toLowerCase().replace(/[^a-z0-9-]/g,'-') : null,
    price_monthly_cents: get('price_monthly', true) ?? 0,
    price_annual_cents:  get('price_annual', true) ?? 0,
    credits_monthly:     get('credits', true) ?? 0,
    rollover_cap:        get('rollover', true) ?? 0,
    sort_order:          get('sort', true) ?? 0,
    stripe_monthly_price_id: get('stripe_monthly'),
    stripe_annual_price_id:  get('stripe_annual'),
    max_auto_apply_daily:        document.getElementById('cm-ent-max-auto-apply') ? (parseInt(document.getElementById('cm-ent-max-auto-apply').value)||null) : get('max_auto_apply', true),
    max_saved_jobs:              document.getElementById('cm-ent-max-saved') ? (parseInt(document.getElementById('cm-ent-max-saved').value)||null) : get('max_saved', true),
    max_recruiter_lookups_daily: document.getElementById('cm-ent-max-recruiter') ? (parseInt(document.getElementById('cm-ent-max-recruiter').value)||null) : get('max_recruiter', true),
    is_public:        get('is_public'),
    csv_export_enabled: get('csv_export'),
    api_access_enabled: get('api_access'),
  };

  if (!fields.name) return toastWarning('Name is required');
  if (!fields.slug) return toastWarning('Slug is required');

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var action = _cmState.editing ? 'update' : 'create';
    var body = action === 'update'
      ? { action, cohort_id: _cmState.editing.id, fields }
      : { action, cohort: fields };

    var res = await fetch('/functions/v1/api-gateway/admin-cohort-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');

    if (data.price_change_warning) {
      var warn = document.getElementById('cm-price-warning');
      if (warn) warn.style.display = 'block';
      // Don't close — let admin acknowledge
      toastWarning('Saved. Note: Stripe subscriptions not auto-updated.');
    } else {
      toastSuccess(action === 'create' ? 'Cohort created' : 'Cohort updated');
      cmCloseEditor();
    }
    await cmLoadList();
  } catch(e) {
    reportError('admin-cohort-manager:save', e);
    toastWarning('Save failed: ' + e.message);
  }
}

async function cmArchive(cohortId) {
  var reason = prompt('Reason for archiving this cohort (required):');
  if (!reason) return;
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-cohort-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'archive', cohort_id: cohortId, reason }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toastSuccess('Cohort archived');
    await cmLoadList();
  } catch(e) {
    reportError('admin-cohort-manager:archive', e);
    toastWarning('Archive failed: ' + e.message);
  }
}

// BJ namespace
async function cmValidateStripePrice(fieldId) {
  var input = document.getElementById('cm-' + fieldId);
  var resultEl = document.getElementById('cm-stripe-validation-result');
  if (!input || !resultEl) return;
  var priceId = input.value.trim();
  if (!priceId) { resultEl.textContent = 'Enter a Price ID first'; return; }
  resultEl.textContent = 'Validating…';
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-cohort-manager', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'validate_stripe_price', price_id: priceId }),
    });
    var data = await res.json();
    if (data.valid) {
      var amt = data.price?.unit_amount ? ('$' + (data.price.unit_amount/100).toFixed(2)) : '';
      resultEl.style.color = 'var(--green)';
      resultEl.textContent = '✓ Valid ' + (data.price?.currency?.toUpperCase()||'') + ' ' + amt;
    } else {
      resultEl.style.color = 'var(--red)';
      resultEl.textContent = '✗ ' + (data.error || 'Invalid');
    }
  } catch(e) { resultEl.textContent = 'Error: ' + e.message; }
}

async function cmDuplicate(cohortId) {
  var newName = prompt('Name for the duplicated cohort:');
  if (!newName) return;
  var newSlug = prompt('Slug (URL-safe, e.g. pro-v2):', newName.toLowerCase().replace(/[^a-z0-9]/g, '-'));
  if (!newSlug) return;
  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-cohort-manager', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'duplicate', cohort_id: cohortId, new_name: newName, new_slug: newSlug }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error);
    toastSuccess('Cohort duplicated: ' + newName);
    cmLoadList();
  } catch(e) { reportError('admin-cohort:duplicate', e); toastWarning('Duplicate failed: ' + e.message); }
}

(function() {
  ['loadCohortManagerTab','cmLoadList','cmOpenEditor','cmCloseEditor','cmSave','cmArchive'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-cohort-manager-full', registered: Date.now() };
    }
  });
})();
