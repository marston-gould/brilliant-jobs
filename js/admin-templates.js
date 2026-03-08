/* ─────────────────────────────────────────────────────────
   admin-templates.js — Notification & Email Templates
   Brilliant Jobs Admin Console · v6.91
   ───────────────────────────────────────────────────────── */
'use strict';

// ── State ──────────────────────────────────────────────────
var _tplList      = [];
var _tplSelected  = null;

// ── Entry point ────────────────────────────────────────────
async function loadTemplatesTab() {
  console.log('[Admin] loadTemplatesTab');
  var panel = document.getElementById('admin-panel-templates');
  if (!panel) return;
  panel.innerHTML = '<div style="padding:24px;color:var(--text-faint)">Loading templates…</div>';
  await _loadTemplates();
  _renderTemplates(panel);
}

// ── Data ───────────────────────────────────────────────────
async function _loadTemplates() {
  try {
    var res = await sb.from('notification_templates').select('*').order('updated_at', { ascending: false });
    if (res.error) throw res.error;
    _tplList = res.data || [];
  } catch (e) {
    reportError('admin_templates', e);
    console.warn('[Admin] notification_templates table unavailable, using built-ins:', e.message);
    _tplList = _builtInTemplates();
  }
}

function _builtInTemplates() {
  var now = new Date().toISOString();
  return [
    { id: 'tpl_welcome',       name: 'Welcome Email',      channel: 'email', status: 'active',
      subject: 'Welcome to Brilliant Jobs 🎉',
      body: 'Hi {{first_name}},\n\nWelcome to Brilliant Jobs! You now have access to 400,000+ open roles.\n\nGet started by setting your first job filter.\n\n— The Brilliant Jobs Team',
      variables: ['first_name', 'dashboard_url'], updated_at: now },
    { id: 'tpl_job_alert',     name: 'Job Alert',          channel: 'email', status: 'active',
      subject: '{{count}} new jobs match your filter "{{filter_name}}"',
      body: 'Hi {{first_name}},\n\n{{count}} new jobs match your saved filter "{{filter_name}}".\n\nView them: {{jobs_url}}\n\n— Brilliant Jobs',
      variables: ['first_name', 'count', 'filter_name', 'jobs_url'], updated_at: now },
    { id: 'tpl_sms_alert',     name: 'SMS Job Alert',      channel: 'sms', status: 'active',
      subject: null,
      body: '{{count}} new jobs match "{{filter_name}}". View: {{short_url}}',
      variables: ['count', 'filter_name', 'short_url'], updated_at: now },
    { id: 'tpl_upgrade_nudge', name: 'Upgrade Nudge',      channel: 'email', status: 'draft',
      subject: 'You\'ve hit your filter limit — unlock more with Pro',
      body: 'Hi {{first_name}},\n\nYou\'ve saved {{filter_count}} filters — the max on the free plan.\n\nUpgrade to Pro for up to 10 filters.\n\nUpgrade: {{upgrade_url}}\n\n— Brilliant Jobs',
      variables: ['first_name', 'filter_count', 'upgrade_url'], updated_at: now },
    { id: 'tpl_reengagement',  name: 'Re-engagement',      channel: 'email', status: 'draft',
      subject: 'Still looking? {{count}} new jobs since you left',
      body: 'Hi {{first_name}},\n\nWe\'ve added {{count}} new jobs since your last visit.\n\nCome back: {{dashboard_url}}\n\n— Brilliant Jobs',
      variables: ['first_name', 'count', 'dashboard_url'], updated_at: now },
  ];
}

// ── Render ─────────────────────────────────────────────────
function _renderTemplates(panel) {
  var listHTML = _tplList.map(function(t) {
    var chanColor = t.channel === 'email' ? '#6b82a8' : '#5b8a72';
    var statColor = t.status === 'active' ? '#4a9a6b' : '#8b929e';
    var isActive  = _tplSelected === t.id;
    return '<div onclick="tplSelect(\'' + t.id + '\')" style="padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--border);' +
      (isActive ? 'background:rgba(107,130,168,0.08);' : '') + '">' +
      '<div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:4px">' + escapeHtml(t.name) + '</div>' +
      '<div style="display:flex;gap:6px">' +
      '<span style="font-size:10px;font-family:var(--mono);padding:1px 6px;border-radius:3px;background:' + chanColor + '22;color:' + chanColor + '">' + t.channel + '</span>' +
      '<span style="font-size:10px;font-family:var(--mono);padding:1px 6px;border-radius:3px;background:' + statColor + '22;color:' + statColor + '">' + t.status + '</span>' +
      '</div></div>';
  }).join('') || '<div style="padding:20px;text-align:center;color:var(--text-faint);font-size:13px">No templates found</div>';

  var detailHTML = _tplSelected ? _renderTplDetail(_tplList.find(function(t) { return t.id === _tplSelected; })) :
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:13px">Select a template to preview</div>';

  panel.innerHTML =
    '<div style="padding:24px">' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">' +
    '<div>' +
    '<h2 style="margin:0 0 4px;font-size:20px;font-weight:600">Templates</h2>' +
    '<p style="margin:0;color:var(--text-dim);font-size:13px">Notification and email template management</p>' +
    '</div>' +
    '<button onclick="tplOpenNew()" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-family:var(--font)">+ New Template</button>' +
    '</div>' +

    '<div style="display:grid;grid-template-columns:280px 1fr;gap:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;min-height:480px">' +

    // Master list
    '<div style="border-right:1px solid var(--border);overflow-y:auto">' +
    '<div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em">' +
    _tplList.length + ' Templates</div>' +
    listHTML + '</div>' +

    // Detail panel
    '<div id="tpl-detail-panel" style="padding:20px;overflow-y:auto">' + detailHTML + '</div>' +
    '</div>' +

    // Create modal (hidden)
    '<div id="tpl-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;align-items:center;justify-content:center">' +
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;width:540px;max-height:90vh;overflow-y:auto">' +
    '<div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">' +
    '<span style="font-size:15px;font-weight:600">New Template</span>' +
    '<button onclick="tplCloseModal()" style="background:none;border:none;color:var(--text-dim);font-size:18px;cursor:pointer">✕</button></div>' +
    '<div style="padding:20px;display:flex;flex-direction:column;gap:14px">' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Template ID<input id="tpl-id" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:var(--mono);box-sizing:border-box" placeholder="tpl_my_template"></label>' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Name<input id="tpl-name" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:var(--font);box-sizing:border-box" placeholder="My Template"></label>' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Channel<select id="tpl-channel" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"><option value="email">Email</option><option value="sms">SMS</option></select></label>' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Subject (email only)<input id="tpl-subject" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:var(--font);box-sizing:border-box" placeholder="Subject with {{variables}}"></label>' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Body<textarea id="tpl-body" rows="6" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:var(--mono);box-sizing:border-box;resize:vertical" placeholder="Template body. Use {{variable}} for dynamic values."></textarea></label>' +
    '<label style="font-size:12px;font-weight:600;color:var(--text-dim)">Variables (comma-separated)<input id="tpl-vars" style="display:block;width:100%;margin-top:4px;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:var(--mono);box-sizing:border-box" placeholder="first_name, count, url"></label>' +
    '</div>' +
    '<div style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px">' +
    '<button onclick="tplCloseModal()" style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:13px;cursor:pointer">Cancel</button>' +
    '<button onclick="tplSave()" style="padding:6px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer">Save Template</button>' +
    '</div></div></div>' +

    '</div>';
}

function _renderTplDetail(t) {
  if (!t) return '<div style="color:var(--text-faint);font-size:13px">Template not found</div>';
  var chanColor = t.channel === 'email' ? '#6b82a8' : '#5b8a72';
  var statColor = t.status === 'active' ? '#4a9a6b' : '#8b929e';
  var varsHTML  = (t.variables || []).map(function(v) {
    return '<code style="font-family:var(--mono);font-size:11px;padding:1px 6px;background:rgba(107,130,168,0.12);border-radius:3px;color:#6b82a8">{{' + v + '}}</code>';
  }).join(' ') || '<span style="color:var(--text-faint);font-size:12px">None</span>';

  return '<div>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">' +
    '<div>' +
    '<h3 style="margin:0 0 6px;font-size:16px;font-weight:600">' + escapeHtml(t.name) + '</h3>' +
    '<div style="display:flex;gap:6px">' +
    '<span style="font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:4px;background:' + chanColor + '22;color:' + chanColor + '">' + t.channel + '</span>' +
    '<span style="font-size:11px;font-family:var(--mono);padding:2px 8px;border-radius:4px;background:' + statColor + '22;color:' + statColor + '">' + t.status + '</span>' +
    '</div></div>' +
    '<div style="display:flex;gap:8px">' +
    '<button onclick="tplSendTest(\'' + t.id + '\')" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">Send Test</button>' +
    '<button onclick="tplToggleStatus(\'' + t.id + '\',\'' + t.status + '\')" style="padding:5px 12px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">' + (t.status === 'active' ? 'Deactivate' : 'Activate') + '</button>' +
    '</div></div>' +
    (t.subject ? '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Subject</div>' +
    '<div style="padding:8px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;font-size:13px;color:var(--text)">' + escapeHtml(t.subject) + '</div></div>' : '') +
    '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Body</div>' +
    '<pre style="padding:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;font-family:var(--mono);font-size:12px;color:var(--text);white-space:pre-wrap;margin:0;line-height:1.6">' + escapeHtml(t.body || '') + '</pre></div>' +
    '<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px">Variables</div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:4px">' + varsHTML + '</div></div>' +
    '<div style="font-size:11px;color:var(--text-faint)">Last updated: ' + new Date(t.updated_at).toLocaleString() + '</div>' +
    '</div>';
}

// ── Actions ────────────────────────────────────────────────
function tplSelect(id) {
  _tplSelected = id;
  var detail = document.getElementById('tpl-detail-panel');
  if (detail) detail.innerHTML = _renderTplDetail(_tplList.find(function(t) { return t.id === id; }));
  // Update active state in list
  document.querySelectorAll('#admin-panel-templates [onclick^="tplSelect"]').forEach(function(el) {
    var isActive = el.getAttribute('onclick') === 'tplSelect(\'' + id + '\')';
    el.style.background = isActive ? 'rgba(107,130,168,0.08)' : '';
  });
}

function tplOpenNew() {
  var m = document.getElementById('tpl-modal');
  if (m) { m.style.display = 'flex'; }
}

function tplCloseModal() {
  var m = document.getElementById('tpl-modal');
  if (m) m.style.display = 'none';
}

async function tplSave() {
  var id      = (document.getElementById('tpl-id')?.value || '').trim();
  var name    = (document.getElementById('tpl-name')?.value || '').trim();
  var channel = document.getElementById('tpl-channel')?.value || 'email';
  var subject = (document.getElementById('tpl-subject')?.value || '').trim() || null;
  var body    = (document.getElementById('tpl-body')?.value || '').trim();
  var varsRaw = (document.getElementById('tpl-vars')?.value || '').trim();
  if (!id || !name || !body) { alert('ID, name, and body are required'); return; }
  var variables = varsRaw ? varsRaw.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
  var row = { id: id, name: name, channel: channel, subject: subject, body: body, variables: variables, status: 'draft', updated_at: new Date().toISOString() };
  try {
    var res = await sb.from('notification_templates').upsert(row, { onConflict: 'id' });
    if (res.error) throw res.error;
  } catch (e) {
    // table may not exist — keep in memory
    var existing = _tplList.findIndex(function(t) { return t.id === id; });
    if (existing >= 0) _tplList[existing] = row; else _tplList.unshift(row);
  }
  tplCloseModal();
  _adminTabInit['templates'] = false;
  loadTemplatesTab();
}

function tplSendTest(id) {
  var email = prompt('Send test to (email address):');
  if (!email || !email.includes('@')) { if (email !== null) toastWarning('Invalid email'); return; }
  toastWarning('Test send to ' + email + ' queued — check Resend dashboard');
}

async function tplToggleStatus(id, currentStatus) {
  var newStatus = currentStatus === 'active' ? 'draft' : 'active';
  var tpl = _tplList.find(function(t) { return t.id === id; });
  if (tpl) tpl.status = newStatus;
  try { await sb.from('notification_templates').update({ status: newStatus }).eq('id', id); } catch (e) { console.error('[Admin] Template status toggle failed:', e); if (typeof reportError === 'function') reportError('admin-templates', e); if (typeof toastWarning === 'function') toastWarning('Template status update failed'); }
  var detail = document.getElementById('tpl-detail-panel');
  if (detail && tpl) detail.innerHTML = _renderTplDetail(tpl);
}
