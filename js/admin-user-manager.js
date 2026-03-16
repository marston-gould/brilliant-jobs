// js/admin-user-manager.js
// SPEC-ADMIN-002-S1: User Manager — List + Detail + credit actions
// Powers admin-panel-user-manager

var _umState = {
  search: '', cohort: '', page: 1, loading: false,
  users: [], total: 0, selectedUser: null,
};

async function loadUsersTab() {
  var panel = document.getElementById('admin-panel-user-manager');
  if (!panel) return;
  renderUserManagerShell(panel);
  await umLoadList();
}

function renderUserManagerShell(panel) {
  panel.innerHTML = [
    '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:16px">',
    '  <input id="um-search" type="text" placeholder="Search email, name, user ID…"',
    '    style="flex:1;min-width:200px;padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:13px"',
    '    oninput="umSearchDebounced(this.value)">',
    '  <select id="um-cohort-filter" onchange="umFilterCohort(this.value)"',
    '    style="padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:13px">',
    '    <option value="">All Cohorts</option>',
    '    <option value="free">Free</option>',
    '    <option value="starter">Starter</option>',
    '    <option value="pro">Pro</option>',
    '    <option value="beta">Beta</option>',
    '  </select>',
    '  <span id="um-count" style="font-size:12px;color:var(--text-faint);font-family:var(--mono)"></span>',
    '</div>',
    '<div style="overflow-x:auto">',
    '<table class="admin-table" style="width:100%">',
    '  <thead><tr>',
    '    <th>User</th><th>Cohort</th><th>Joined</th><th>Last Active</th>',
    '    <th style="text-align:right">Credits</th><th>Sub Status</th><th></th>',
    '  </tr></thead>',
    '  <tbody id="um-tbody"><tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-faint)">Loading…</td></tr></tbody>',
    '</table>',
    '</div>',
    '<div style="display:flex;gap:8px;align-items:center;margin-top:12px">',
    '  <button id="um-prev" onclick="umPage(-1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">← Prev</button>',
    '  <span id="um-page-info" style="font-size:12px;color:var(--text-faint);font-family:var(--mono)"></span>',
    '  <button id="um-next" onclick="umPage(1)" style="padding:4px 12px;background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text);cursor:pointer;font-size:13px">Next →</button>',
    '</div>',
    // Detail drawer
    '<div id="um-detail-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000" onclick="umCloseDetail()"></div>',
    '<div id="um-detail-drawer" style="display:none;position:fixed;right:0;top:0;bottom:0;width:600px;background:var(--bg-card);border-left:1px solid var(--border);overflow-y:auto;z-index:1001;padding:24px">',
    '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">',
    '    <h3 id="um-drawer-title" style="margin:0;font-size:16px">User Detail</h3>',
    '    <button onclick="umCloseDetail()" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:20px">×</button>',
    '  </div>',
    '  <div id="um-drawer-tabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--border);padding-bottom:12px">',
    '    <button class="um-dtab active" data-tab="profile" onclick="umDrawerTab(this,\'profile\')">Profile</button>',
    '    <button class="um-dtab" data-tab="cohort" onclick="umDrawerTab(this,\'cohort\')">Cohort & Billing</button>',
    '    <button class="um-dtab" data-tab="credits" onclick="umDrawerTab(this,\'credits\')">Credits</button>',
    '  </div>',
    '  <div id="um-drawer-body">Loading…</div>',
    '</div>',
  ].join('');
}

var _umSearchTimer = null;
function umSearchDebounced(val) {
  clearTimeout(_umSearchTimer);
  _umSearchTimer = setTimeout(function() {
    _umState.search = val; _umState.page = 1; umLoadList();
  }, 350);
}
function umFilterCohort(val) { _umState.cohort = val; _umState.page = 1; umLoadList(); }
function umPage(dir) {
  var maxPage = Math.ceil(_umState.total / 50);
  _umState.page = Math.max(1, Math.min(_umState.page + dir, maxPage));
  umLoadList();
}

async function umLoadList() {
  if (_umState.loading) return;
  _umState.loading = true;
  var tbody = document.getElementById('um-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-faint)">Loading…</td></tr>';

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-user-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', search: _umState.search, cohort_slug: _umState.cohort, page: _umState.page }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load users');

    _umState.users = data.users || [];
    _umState.total = data.total || 0;

    var countEl = document.getElementById('um-count');
    if (countEl) countEl.textContent = _umState.total.toLocaleString() + ' users';

    var pageEl = document.getElementById('um-page-info');
    if (pageEl) pageEl.textContent = 'Page ' + _umState.page + ' of ' + Math.max(1, Math.ceil(_umState.total / 50));

    var prevBtn = document.getElementById('um-prev');
    var nextBtn = document.getElementById('um-next');
    if (prevBtn) prevBtn.disabled = _umState.page <= 1;
    if (nextBtn) nextBtn.disabled = _umState.page >= Math.ceil(_umState.total / 50);

    if (!tbody) return;
    if (_umState.users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-faint)">No users found</td></tr>';
      return;
    }
    tbody.innerHTML = _umState.users.map(function(u) {
      var cohortSlug = u.cohort_tiers?.slug || 'free';
      var cohortColor = cohortSlug === 'pro' ? 'var(--accent)' : cohortSlug === 'beta' ? 'var(--purple)' : cohortSlug === 'starter' ? 'var(--green)' : 'var(--text-dim)';
      var subStatus = u.user_subscriptions?.[0]?.status || '—';
      var joined = u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', {month:'short',day:'numeric',year:'2-digit'}) : '—';
      var lastActive = u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '—';
      var credits = u.credit_balance !== null ? u.credit_balance?.toLocaleString() : '—';
      var initials = ((u.display_name || u.email || '?')[0]).toUpperCase();
      return [
        '<tr style="cursor:pointer" onclick="umOpenDetail(\'' + u.id + '\')">',
        '  <td><div style="display:flex;align-items:center;gap:8px">',
        '    <div style="width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;flex-shrink:0">' + escapeHtml(initials) + '</div>',
        '    <div><div style="font-size:13px;font-weight:500">' + escapeHtml(u.display_name || '—') + '</div>',
        '    <div style="font-size:11px;color:var(--text-faint)">' + escapeHtml(u.email || '') + '</div></div>',
        '  </div></td>',
        '  <td><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:var(--bg-input);color:' + cohortColor + ';font-family:var(--mono)">' + escapeHtml(cohortSlug) + '</span></td>',
        '  <td style="font-size:12px;color:var(--text-dim)">' + joined + '</td>',
        '  <td style="font-size:12px;color:var(--text-dim)">' + lastActive + '</td>',
        '  <td style="text-align:right;font-family:var(--mono);font-size:13px">' + credits + '</td>',
        '  <td style="font-size:12px;color:' + (subStatus === 'active' ? 'var(--green)' : 'var(--text-dim)') + '">' + subStatus + '</td>',
        '  <td><button onclick="event.stopPropagation();umOpenDetail(\'' + u.id + '\')" style="padding:3px 10px;border:1px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer">View</button></td>',
        '</tr>',
      ].join('');
    }).join('');

  } catch(e) {
    reportError('admin-user-manager', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--red)">' + escapeHtml(e.message) + '</td></tr>';
  } finally {
    _umState.loading = false;
  }
}

async function umOpenDetail(userId) {
  var overlay = document.getElementById('um-detail-overlay');
  var drawer = document.getElementById('um-detail-drawer');
  var body = document.getElementById('um-drawer-body');
  if (!overlay || !drawer || !body) return;

  overlay.style.display = 'block';
  drawer.style.display = 'block';
  body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-faint)">Loading…</div>';

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-user-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'detail', user_id: userId }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    _umState.selectedUser = data;

    var title = document.getElementById('um-drawer-title');
    if (title) title.textContent = data.profile?.display_name || data.profile?.email || 'User Detail';

    umRenderDrawerTab('profile');
  } catch(e) {
    reportError('admin-user-manager:detail', e);
    body.innerHTML = '<div style="color:var(--red);padding:16px">' + escapeHtml(e.message) + '</div>';
  }
}

function umCloseDetail() {
  var overlay = document.getElementById('um-detail-overlay');
  var drawer = document.getElementById('um-detail-drawer');
  if (overlay) overlay.style.display = 'none';
  if (drawer) drawer.style.display = 'none';
  _umState.selectedUser = null;
}

function umDrawerTab(btn, tab) {
  document.querySelectorAll('.um-dtab').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  umRenderDrawerTab(tab);
}

function umRenderDrawerTab(tab) {
  var body = document.getElementById('um-drawer-body');
  var d = _umState.selectedUser;
  if (!body || !d) return;

  if (tab === 'profile') {
    var p = d.profile || {};
    var fields = [
      ['User ID', p.id, true],
      ['Display Name', p.display_name, false, 'display_name'],
      ['Email', p.email, false, 'email'],
      ['Phone', p.phone, false, 'phone'],
      ['Location', p.location, false, 'location'],
      ['Job Title', p.job_title, false, 'job_title'],
      ['LinkedIn', p.linkedin_url, false, 'linkedin_url'],
      ['Signup', p.created_at ? new Date(p.created_at).toLocaleString() : '—', true],
      ['Role', p.role || 'user', true],
    ];
    body.innerHTML = [
      '<div style="display:grid;gap:12px">',
      fields.map(function(f) {
        return '<div><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">' + f[0] + '</label>' +
          (f[2] ? '<span style="font-size:13px;font-family:var(--mono)">' + escapeHtml(f[1] || '—') + '</span>' :
          '<input type="text" data-field="' + f[3] + '" value="' + escapeHtml(f[1] || '') + '"' +
          ' style="width:100%;padding:6px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box">') +
          '</div>';
      }).join(''),
      '<button onclick="umSaveProfile()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;margin-top:4px">Save Profile</button>',
      '</div>',
    ].join('');
  }

  if (tab === 'cohort') {
    var sub = d.subscription || {};
    var cohortSlug = d.profile?.cohort_tiers?.slug || 'free';
    body.innerHTML = [
      '<div style="margin-bottom:20px">',
      '  <div style="font-size:12px;color:var(--text-faint);margin-bottom:6px">Current Cohort</div>',
      '  <span style="font-size:15px;font-weight:600;font-family:var(--mono)">' + escapeHtml(cohortSlug) + '</span>',
      '  <span style="font-size:11px;color:var(--text-faint);margin-left:8px">assigned ' + (d.profile?.cohort_tier_assigned_at ? new Date(d.profile.cohort_tier_assigned_at).toLocaleDateString() : '—') + '</span>',
      '</div>',
      '<div style="margin-bottom:16px">',
      '  <label style="font-size:12px;color:var(--text-faint);display:block;margin-bottom:6px">Reassign Cohort</label>',
      '  <div style="display:flex;gap:8px">',
      '    <select id="um-cohort-select" style="flex:1;padding:7px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:13px">',
      '      <option value="free"' + (cohortSlug==='free'?' selected':'') + '>Free</option>',
      '      <option value="starter"' + (cohortSlug==='starter'?' selected':'') + '>Starter</option>',
      '      <option value="pro"' + (cohortSlug==='pro'?' selected':'') + '>Pro</option>',
      '      <option value="beta"' + (cohortSlug==='beta'?' selected':'') + '>Beta</option>',
      '    </select>',
      '    <button onclick="umReassignCohort()" style="padding:7px 14px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">Reassign</button>',
      '  </div>',
      '</div>',
      '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">',
      '<div style="font-size:12px;color:var(--text-faint);margin-bottom:6px">Subscription</div>',
      '<table class="admin-table" style="width:100%;font-size:13px">',
      '  <tr><td>Status</td><td>' + escapeHtml(sub.status || '—') + '</td></tr>',
      '  <tr><td>Stripe Sub ID</td><td style="font-family:var(--mono);font-size:11px">' + escapeHtml(sub.stripe_subscription_id || '—') + '</td></tr>',
      '  <tr><td>Period End</td><td>' + (sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : '—') + '</td></tr>',
      '</table>',
    ].join('');
  }

  if (tab === 'credits') {
    var bal = d.balance || {};
    var ledger = d.ledger || [];
    body.innerHTML = [
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">',
      '  <div style="text-align:center;padding:12px;background:var(--bg-input);border-radius:8px"><div style="font-size:20px;font-weight:700;font-family:var(--mono)">' + (bal.total ?? 0) + '</div><div style="font-size:11px;color:var(--text-faint)">Total</div></div>',
      '  <div style="text-align:center;padding:12px;background:var(--bg-input);border-radius:8px"><div style="font-size:20px;font-weight:700;font-family:var(--mono)">' + (bal.base ?? 0) + '</div><div style="font-size:11px;color:var(--text-faint)">Monthly</div></div>',
      '  <div style="text-align:center;padding:12px;background:var(--bg-input);border-radius:8px"><div style="font-size:20px;font-weight:700;font-family:var(--mono)">' + (bal.awards ?? 0) + '</div><div style="font-size:11px;color:var(--text-faint)">Bonus</div></div>',
      '</div>',
      // Grant/Deduct form
      '<div style="display:flex;gap:8px;margin-bottom:16px;align-items:flex-end">',
      '  <div style="flex:0 0 90px"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Amount (+/−)</label>',
      '    <input type="number" id="um-credit-amount" placeholder="e.g. 50" style="width:100%;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>',
      '  <div style="flex:1"><label style="font-size:11px;color:var(--text-faint);display:block;margin-bottom:4px">Reason (required)</label>',
      '    <input type="text" id="um-credit-reason" placeholder="e.g. Compensation for failed rewrite" style="width:100%;padding:7px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;box-sizing:border-box"></div>',
      '  <button onclick="umCreditAction()" style="padding:7px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;white-space:nowrap">Apply</button>',
      '</div>',
      // Ledger
      '<div style="overflow-x:auto"><table class="admin-table" style="width:100%;font-size:12px">',
      '<thead><tr><th>Date</th><th>Type</th><th>Bucket</th><th>Amount</th><th>Feature</th><th>Notes</th></tr></thead>',
      '<tbody>',
      ledger.length === 0 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-faint);padding:16px">No ledger entries</td></tr>' :
        ledger.map(function(row) {
          var amtColor = row.amount > 0 ? 'var(--green)' : 'var(--red)';
          return '<tr><td style="white-space:nowrap">' + new Date(row.created_at).toLocaleDateString() + '</td>' +
            '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(row.event_type) + '</td>' +
            '<td style="font-family:var(--mono);font-size:11px">' + escapeHtml(row.bucket) + '</td>' +
            '<td style="font-family:var(--mono);font-weight:600;color:' + amtColor + '">' + (row.amount > 0 ? '+' : '') + row.amount + '</td>' +
            '<td style="font-size:11px;color:var(--text-faint)">' + escapeHtml(row.feature || '—') + '</td>' +
            '<td style="font-size:11px;color:var(--text-faint);max-width:160px;overflow:hidden;text-overflow:ellipsis">' + escapeHtml(row.notes || '—') + '</td></tr>';
        }).join(''),
      '</tbody></table></div>',
    ].join('');
  }
}

async function umSaveProfile() {
  var d = _umState.selectedUser;
  if (!d?.profile?.id) return;
  var inputs = document.querySelectorAll('#um-drawer-body [data-field]');
  var fields = {};
  inputs.forEach(function(el) { fields[el.dataset.field] = el.value; });

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-user-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_profile', user_id: d.profile.id, fields }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toastSuccess('Profile saved');
    _umState.selectedUser.profile = { ..._umState.selectedUser.profile, ...data.profile };
  } catch(e) {
    reportError('admin-user-manager:save', e);
    toastWarning('Save failed: ' + e.message);
  }
}

async function umReassignCohort() {
  var d = _umState.selectedUser;
  var sel = document.getElementById('um-cohort-select');
  if (!d?.profile?.id || !sel) return;
  var newSlug = sel.value;
  var reason = prompt('Reason for cohort change (required):');
  if (!reason) return;

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-user-manager', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reassign_cohort', user_id: d.profile.id, cohort_slug: newSlug, reason }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toastSuccess('Cohort reassigned to ' + newSlug);
    umLoadList();
  } catch(e) {
    reportError('admin-user-manager:cohort', e);
    toastWarning('Reassign failed: ' + e.message);
  }
}

async function umCreditAction() {
  var d = _umState.selectedUser;
  if (!d?.profile?.id) return;
  var amtEl = document.getElementById('um-credit-amount');
  var reasonEl = document.getElementById('um-credit-reason');
  if (!amtEl || !reasonEl) return;

  var amount = parseInt(amtEl.value, 10);
  var reason = reasonEl.value.trim();
  if (!amount || isNaN(amount)) return toastWarning('Enter a non-zero amount');
  if (!reason) return toastWarning('Reason is required');

  try {
    var token = (await sb.auth.getSession()).data.session?.access_token;
    var res = await fetch('/functions/v1/api-gateway/admin-credit-action', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: d.profile.id, amount, reason }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed');
    toastSuccess('Credits ' + (amount > 0 ? 'granted: +' : 'deducted: ') + amount);
    amtEl.value = ''; reasonEl.value = '';
    // Refresh detail
    await umOpenDetail(d.profile.id);
  } catch(e) {
    reportError('admin-user-manager:credit', e);
    toastWarning('Credit action failed: ' + e.message);
  }
}

// BJ namespace
(function() {
  ['loadUsersTab','umLoadList','umOpenDetail','umCloseDetail','umPage',
   'umSearchDebounced','umFilterCohort','umDrawerTab','umSaveProfile',
   'umReassignCohort','umCreditAction'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-user-manager', registered: Date.now() };
    }
  });
})();
