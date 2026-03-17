// js/admin-survey-manager.js — FB-SURVEY-ADMIN-001 SVM-S1
// Admin panel for survey campaign CRUD.
// Renders in the Growth section of admin.html.

(function() {
  'use strict';

  var _campaigns = [];
  var _showInactive = true;

  // ─── Init ───────────────────────────────────────────────────────────────────
  window.loadSurveyManagerTab = function() {
    var container = document.getElementById('admin-sub-content');
    if (!container) return;

    container.innerHTML = '<div id="svm-root">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h3 style="margin:0;font-size:16px;">Survey Campaigns</h3>'
      + '<div style="display:flex;gap:8px;align-items:center;">'
      + '<label style="font-size:11px;display:flex;align-items:center;gap:4px;cursor:pointer;">'
      + '<input type="checkbox" id="svm-show-inactive" ' + (_showInactive ? 'checked' : '') + ' onchange="window.svmToggleInactive(this.checked)"> Show inactive</label>'
      + '<button class="btn btn-primary btn-sm" onclick="window.svmOpenCreate()" style="font-size:11px;">+ New Survey</button>'
      + '</div></div>'
      + '<div id="svm-table-wrap"><div class="u-text-faint" style="padding:16px 0;">Loading campaigns...</div></div>'
      + '</div>';

    svmFetchCampaigns();
  };

  // ─── Fetch ──────────────────────────────────────────────────────────────────
  async function svmFetchCampaigns() {
    try {
      var sb = window.supabase || window._supabase;
      if (!sb) return;

      var res = await sb.functions.invoke('admin-survey-manager', {
        body: { action: 'list', include_inactive: _showInactive }
      });
      if (res.error) throw res.error;
      var data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      _campaigns = data.campaigns || [];
      svmRenderTable();
    } catch (e) {
      if (typeof reportError === 'function') reportError('admin_survey_manager', e, { action: 'list' });
      var wrap = document.getElementById('svm-table-wrap');
      if (wrap) wrap.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Failed to load campaigns.</div>';
    }
  }

  // ─── Render Table ───────────────────────────────────────────────────────────
  function svmRenderTable() {
    var wrap = document.getElementById('svm-table-wrap');
    if (!wrap) return;

    if (_campaigns.length === 0) {
      wrap.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">No campaigns found.</div>';
      return;
    }

    var html = '<table class="admin-table" style="width:100%;font-size:12px;border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);text-align:left;">'
      + '<th style="padding:6px 8px;">Title</th>'
      + '<th style="padding:6px 8px;">Type</th>'
      + '<th style="padding:6px 8px;">Priority</th>'
      + '<th style="padding:6px 8px;">Channels</th>'
      + '<th style="padding:6px 8px;">Responses</th>'
      + '<th style="padding:6px 8px;">Credits</th>'
      + '<th style="padding:6px 8px;">Status</th>'
      + '<th style="padding:6px 8px;">Actions</th>'
      + '</tr></thead><tbody>';

    for (var i = 0; i < _campaigns.length; i++) {
      var c = _campaigns[i];
      var esc = _svmEsc;
      var statusColor = c.is_active ? '#22c55e' : '#888';
      var statusLabel = c.is_active ? 'Active' : 'Inactive';
      var rowBg = i % 2 === 0 ? '' : 'background:var(--bg-card-alt, rgba(255,255,255,0.02));';

      // Channel badges
      var channelBadges = _svmChannelBadges(c);

      // Trigger badge
      var triggerLabel = _svmTriggerLabel(c);

      html += '<tr style="border-bottom:1px solid var(--border);' + rowBg + '">'
        + '<td style="padding:6px 8px;">'
        + '<div style="font-weight:600;">' + esc(c.title) + '</div>'
        + '<div class="u-text-faint" style="font-size:10px;">' + esc(c.survey_version) + '</div>'
        + (triggerLabel ? '<div style="font-size:9px;margin-top:2px;">' + triggerLabel + '</div>' : '')
        + '</td>'
        + '<td style="padding:6px 8px;"><span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--accent-glow);color:var(--accent);">' + esc(c.survey_type) + '</span></td>'
        + '<td style="padding:6px 8px;text-align:center;">P' + (c.priority || '?') + '</td>'
        + '<td style="padding:6px 8px;">' + channelBadges + '</td>'
        + '<td style="padding:6px 8px;text-align:center;">' + (c.response_count || 0) + '</td>'
        + '<td style="padding:6px 8px;text-align:center;">' + (c.credit_reward || 0) + '</td>'
        + '<td style="padding:6px 8px;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + statusColor + ';margin-right:4px;"></span><span style="font-size:10px;">' + statusLabel + '</span></td>'
        + '<td style="padding:6px 8px;">'
        + '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;margin-right:4px;" onclick="window.svmEditCampaign(\'' + c.id + '\')" title="Edit">Edit</button>'
        + '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;margin-right:4px;" onclick="window.svmDuplicateCampaign(\'' + c.id + '\')" title="Duplicate">Dup</button>'
        + '<button class="btn btn-sm" style="font-size:10px;padding:2px 6px;color:var(--red);" onclick="window.svmDeleteCampaign(\'' + c.id + '\',\'' + esc(c.title) + '\')" title="Delete">' + (c.is_active ? 'Deactivate' : 'Delete') + '</button>'
        + '</td></tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  function _svmChannelBadges(c) {
    var channels = [];
    var pc = c.placement_config;
    if (pc) {
      if (pc.overlay && pc.overlay.enabled) {
        var pages = (pc.overlay.pages || []).length;
        channels.push('<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#6da3ff22;color:#6da3ff;">Overlay' + (pages ? ' (' + pages + 'pg)' : '') + '</span>');
      }
      if (pc.merch && pc.merch.enabled) channels.push('<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#f59e0b22;color:#f59e0b;">Merch</span>');
      if (pc.email && pc.email.enabled) channels.push('<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#22c55e22;color:#22c55e;">Email</span>');
      if (pc.sms && pc.sms.enabled) channels.push('<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#ef444422;color:#ef4444;">SMS</span>');
    } else if (c.channels) {
      c.channels.forEach(function(ch) {
        var colors = { overlay: '#6da3ff', merch: '#f59e0b', email: '#22c55e', sms: '#ef4444' };
        var color = colors[ch] || '#888';
        channels.push('<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + color + '22;color:' + color + ';">' + ch + '</span>');
      });
    }
    return channels.join(' ') || '<span class="u-text-faint" style="font-size:9px;">\u2014</span>';
  }

  function _svmTriggerLabel(c) {
    var tc = c.trigger_config;
    if (!tc) return '';
    var colors = { page_navigation: '#6da3ff', cron: '#22c55e', event: '#f59e0b', behavioral: '#a855f7' };
    var color = colors[tc.type] || '#888';
    var label = tc.type || 'unknown';
    if (tc.type === 'cron' && tc.schedule) label += ': ' + tc.schedule;
    if (tc.type === 'event' && tc.event_name) label += ': ' + tc.event_name;
    return '<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:' + color + '22;color:' + color + ';">' + _svmEsc(label) + '</span>';
  }

  // ─── Toggle Inactive ───────────────────────────────────────────────────────
  window.svmToggleInactive = function(checked) {
    _showInactive = checked;
    svmFetchCampaigns();
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────
  window.svmDeleteCampaign = async function(id, title) {
    if (!confirm('Deactivate survey "' + title + '"? This stops all delivery.')) return;
    try {
      var sb = window.supabase || window._supabase;
      var res = await sb.functions.invoke('admin-survey-manager', {
        body: { action: 'delete', id: id }
      });
      if (res.error) throw res.error;
      svmFetchCampaigns();
    } catch (e) {
      reportError('admin_survey_manager', e, { action: 'delete', id: id });
      alert('Failed to delete campaign.');
    }
  };

  // ─── Duplicate ──────────────────────────────────────────────────────────────
  window.svmDuplicateCampaign = async function(id) {
    try {
      var sb = window.supabase || window._supabase;
      var res = await sb.functions.invoke('admin-survey-manager', {
        body: { action: 'duplicate', id: id }
      });
      if (res.error) throw res.error;
      svmFetchCampaigns();
    } catch (e) {
      reportError('admin_survey_manager', e, { action: 'duplicate', id: id });
      alert('Failed to duplicate campaign.');
    }
  };

  // ─── SVM-S2: Full CRUD Modal ─────────────────────────────────────────────

  var MODAL_ID = 'svm-modal';
  var _editingCampaign = null; // null = create mode
  var _modalQuestions = [];

  var DASHBOARD_PAGES = ['feed','applications','stats','resumes','tuning','settings','subscription','interview-prep','notifications','brilliant'];
  var SURVEY_TYPES = ['nps','periodic','micro','exit'];
  var TRIGGER_TYPES = ['page_navigation','cron','event','behavioral'];
  var QUESTION_TYPES = ['choice','rating','scale','text','nps','multiselect','dropdown','chips'];
  var MERCH_POSITIONS = ['sidebar','after_20th_card','empty_state','top_of_page'];

  window.svmEditCampaign = function(id) {
    _editingCampaign = _campaigns.find(function(c) { return c.id === id; }) || null;
    if (!_editingCampaign) return;
    _modalQuestions = JSON.parse(JSON.stringify(_editingCampaign.questions || []));
    svmRenderModal();
  };

  window.svmOpenCreate = function() {
    _editingCampaign = null;
    _modalQuestions = [];
    svmRenderModal();
  };

  function svmRenderModal() {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    var c = _editingCampaign || {};
    var isEdit = !!_editingCampaign;
    var ac = c.audience_config || { type: 'all' };
    var tc = c.trigger_config || { type: 'page_navigation' };
    var pc = c.placement_config || { overlay: { enabled: true, pages: ['feed','applications','stats'] }, merch: { enabled: false }, email: { enabled: false }, sms: { enabled: false } };

    var overlay = document.createElement('div');
    overlay.id = MODAL_ID;
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;overflow-y:auto;';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--bg-card,#181a20);border-radius:12px;padding:24px 28px;max-width:720px;width:95%;max-height:90vh;overflow-y:auto;position:relative;';

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">'
      + '<h3 style="margin:0;font-size:16px;">' + (isEdit ? 'Edit Survey' : 'New Survey') + '</h3>'
      + '<button onclick="document.getElementById(\'' + MODAL_ID + '\').remove()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer;">\u00D7</button>'
      + '</div>';

    // ── WHAT Section ──
    html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px;">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--accent);">WHAT — Survey Content</div>'
      + _svmField('Title', 'svm-title', c.title || '', 'text')
      + _svmField('Version ID', 'svm-version', c.survey_version || '', 'text', isEdit)
      + '<div style="display:flex;gap:12px;">'
      + _svmSelect('Type', 'svm-type', SURVEY_TYPES, c.survey_type || 'periodic')
      + _svmField('Credits', 'svm-credits', c.credit_reward || 0, 'number')
      + _svmField('Est. Minutes', 'svm-minutes', c.estimated_minutes || 2, 'number')
      + '</div>'
      + _svmField('Description', 'svm-desc', c.description || '', 'textarea')
      + '<div style="font-size:12px;font-weight:600;margin:12px 0 8px;">Questions</div>'
      + '<div id="svm-questions-list"></div>'
      + '<button class="btn btn-sm" style="font-size:10px;margin-top:6px;" onclick="window.svmAddQuestion()">+ Add Question</button>'
      + '</div>';

    // ── WHO Section ──
    html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px;">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--accent);">WHO — Audience Targeting</div>'
      + _svmSelect('Audience Type', 'svm-audience-type', ['all','time_cohort','behavioral'], ac.type || 'all')
      + '<div id="svm-audience-fields"></div>'
      + '</div>';

    // ── WHEN Section ──
    html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px;">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--accent);">WHEN — Trigger</div>'
      + _svmSelect('Trigger Type', 'svm-trigger-type', TRIGGER_TYPES, tc.type || 'page_navigation')
      + '<div id="svm-trigger-fields"></div>'
      + _svmField('Frequency (days between prompts)', 'svm-freq', c.frequency_days || 14, 'number')
      + _svmField('Expires At', 'svm-expires', c.expires_at ? c.expires_at.split('T')[0] : '', 'date')
      + '</div>';

    // ── WHERE Section ──
    html += '<div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:8px;">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--accent);">WHERE — Delivery Channels</div>'
      + '<div style="margin-bottom:10px;">'
      + _svmCheckbox('Overlay', 'svm-ch-overlay', pc.overlay && pc.overlay.enabled)
      + '<div id="svm-overlay-pages" style="margin-left:20px;margin-top:4px;">' + _svmPageCheckboxes('overlay', pc.overlay ? pc.overlay.pages : []) + '</div>'
      + '</div>'
      + '<div style="margin-bottom:10px;">'
      + _svmCheckbox('Merch Slot', 'svm-ch-merch', pc.merch && pc.merch.enabled)
      + '<div id="svm-merch-pages" style="margin-left:20px;margin-top:4px;">' + _svmPageCheckboxes('merch', pc.merch ? pc.merch.pages : []) + '</div>'
      + _svmSelect('Merch Position', 'svm-merch-pos', MERCH_POSITIONS, pc.merch ? pc.merch.position || 'sidebar' : 'sidebar')
      + '</div>'
      + _svmCheckbox('Email', 'svm-ch-email', pc.email && pc.email.enabled)
      + _svmCheckbox('SMS', 'svm-ch-sms', pc.sms && pc.sms.enabled)
      + _svmField('Priority (1=highest)', 'svm-priority', c.priority || 5, 'number')
      + '</div>';

    // ── Actions ──
    html += '<div style="display:flex;gap:10px;justify-content:flex-end;">'
      + '<button class="btn btn-secondary" onclick="document.getElementById(\'' + MODAL_ID + '\').remove()">Cancel</button>'
      + '<button class="btn btn-primary" id="svm-save-btn" onclick="window.svmSaveCampaign()">' + (isEdit ? 'Save Changes' : 'Create Survey') + '</button>'
      + '</div>';

    card.innerHTML = html;
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Render dynamic sections
    svmRenderQuestionsList();
    svmRenderAudienceFields(ac);
    svmRenderTriggerFields(tc);

    // Wire dynamic selectors
    var audSel = document.getElementById('svm-audience-type');
    if (audSel) audSel.addEventListener('change', function() { svmRenderAudienceFields({ type: this.value }); });
    var trigSel = document.getElementById('svm-trigger-type');
    if (trigSel) trigSel.addEventListener('change', function() { svmRenderTriggerFields({ type: this.value }); });

    // Backdrop close
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
  }

  // ── Question Builder ──
  function svmRenderQuestionsList() {
    var container = document.getElementById('svm-questions-list');
    if (!container) return;
    if (_modalQuestions.length === 0) {
      container.innerHTML = '<div class="u-text-faint" style="font-size:11px;padding:8px 0;">No questions yet. Click "+ Add Question" to start building.</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < _modalQuestions.length; i++) {
      var q = _modalQuestions[i];
      html += '<div style="padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card-alt,rgba(255,255,255,0.02));" data-qi="' + i + '">'
        + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">'
        + '<div style="flex:1;margin-right:8px;">'
        + '<input type="text" value="' + _svmAttr(q.q || '') + '" onchange="window.svmUpdateQ(' + i + ',\'q\',this.value)" style="width:100%;font-size:12px;padding:4px 6px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);" placeholder="Question text">'
        + '</div>'
        + '<select onchange="window.svmUpdateQ(' + i + ',\'type\',this.value)" style="font-size:10px;padding:2px 4px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);">'
        + QUESTION_TYPES.map(function(t) { return '<option value="' + t + '"' + (q.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('')
        + '</select>'
        + '<button onclick="window.svmRemoveQ(' + i + ')" style="background:none;border:none;color:var(--red);font-size:14px;cursor:pointer;margin-left:6px;" title="Remove">\u00D7</button>'
        + '</div>';

      // Sub-text
      html += '<input type="text" value="' + _svmAttr(q.sub || '') + '" onchange="window.svmUpdateQ(' + i + ',\'sub\',this.value)" style="width:100%;font-size:10px;padding:3px 6px;margin-bottom:4px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text-dim);" placeholder="Sub-text (optional)">';

      // Options (for choice/multiselect/dropdown/chips)
      if (['choice','multiselect','dropdown','chips'].indexOf(q.type) !== -1) {
        html += '<div style="margin-top:4px;font-size:10px;color:var(--text-dim);">Options (one per line):</div>';
        html += '<textarea onchange="window.svmUpdateQOpts(' + i + ',this.value)" style="width:100%;font-size:10px;padding:4px 6px;min-height:50px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);">' + _svmEsc((q.opts || []).join('\n')) + '</textarea>';
      }

      // Scale labels
      if (q.type === 'scale' || q.type === 'rating') {
        html += '<div style="display:flex;gap:8px;margin-top:4px;">';
        html += '<input type="text" value="' + _svmAttr(q.minLabel || '') + '" onchange="window.svmUpdateQ(' + i + ',\'minLabel\',this.value)" style="flex:1;font-size:10px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);" placeholder="Min label">';
        html += '<input type="text" value="' + _svmAttr(q.maxLabel || '') + '" onchange="window.svmUpdateQ(' + i + ',\'maxLabel\',this.value)" style="flex:1;font-size:10px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);border-radius:4px;color:var(--text);" placeholder="Max label">';
        html += '</div>';
      }

      // Move buttons
      html += '<div style="display:flex;gap:4px;margin-top:4px;">';
      if (i > 0) html += '<button onclick="window.svmMoveQ(' + i + ',-1)" class="btn btn-sm" style="font-size:9px;padding:1px 6px;">\u2191</button>';
      if (i < _modalQuestions.length - 1) html += '<button onclick="window.svmMoveQ(' + i + ',1)" class="btn btn-sm" style="font-size:9px;padding:1px 6px;">\u2193</button>';
      html += '</div></div>';
    }
    container.innerHTML = html;
  }

  window.svmAddQuestion = function() {
    _modalQuestions.push({ id: 'q_' + Date.now(), q: '', type: 'choice', opts: [] });
    svmRenderQuestionsList();
  };
  window.svmRemoveQ = function(idx) {
    _modalQuestions.splice(idx, 1);
    svmRenderQuestionsList();
  };
  window.svmUpdateQ = function(idx, field, value) {
    if (_modalQuestions[idx]) _modalQuestions[idx][field] = value;
  };
  window.svmUpdateQOpts = function(idx, text) {
    if (_modalQuestions[idx]) _modalQuestions[idx].opts = text.split('\n').filter(function(s) { return s.trim(); });
  };
  window.svmMoveQ = function(idx, dir) {
    var target = idx + dir;
    if (target < 0 || target >= _modalQuestions.length) return;
    var tmp = _modalQuestions[idx];
    _modalQuestions[idx] = _modalQuestions[target];
    _modalQuestions[target] = tmp;
    svmRenderQuestionsList();
  };

  // ── Audience Fields ──
  function svmRenderAudienceFields(ac) {
    var container = document.getElementById('svm-audience-fields');
    if (!container) return;
    var type = ac.type || 'all';
    if (type === 'all') { container.innerHTML = '<div class="u-text-faint" style="font-size:11px;">All users. No targeting.</div>'; return; }
    var html = '';
    if (type === 'time_cohort') {
      html += _svmField('Signed up after', 'svm-aud-after', ac.signup_after || '', 'date');
      html += _svmField('Signed up before', 'svm-aud-before', ac.signup_before || '', 'date');
    } else if (type === 'behavioral') {
      html += _svmField('Min sessions', 'svm-aud-sessions', ac.min_sessions || '', 'number');
      html += _svmField('Min applications', 'svm-aud-apps', ac.min_applications || '', 'number');
      html += _svmSelect('Plan tier', 'svm-aud-plan', ['any','free','starter','pro'], ac.plan || 'any');
      html += _svmField('Min days since signup', 'svm-aud-days-min', ac.days_since_signup_min || '', 'number');
    }
    container.innerHTML = html;
  }

  // ── Trigger Fields ──
  function svmRenderTriggerFields(tc) {
    var container = document.getElementById('svm-trigger-fields');
    if (!container) return;
    var type = tc.type || 'page_navigation';
    var html = '';
    if (type === 'cron') {
      html += _svmField('Cron expression', 'svm-trig-cron', tc.schedule || '0 15 1 * *', 'text');
      html += '<div class="u-text-faint" style="font-size:10px;margin-top:-8px;margin-bottom:8px;">Presets: monthly 1st = 0 15 1 * * | bi-weekly Tue = 0 15 */2 * 2 | weekly Mon = 0 15 * * 1</div>';
    } else if (type === 'event') {
      html += _svmSelect('Event', 'svm-trig-event', ['ghost_detected','subscription_created','resume_uploaded','application_submitted','trial_expired','profile_completed'], tc.event_name || '');
    } else if (type === 'behavioral') {
      html += _svmSelect('Metric', 'svm-trig-metric', ['applications_count','session_count','days_since_signup','credit_balance'], tc.metric || 'applications_count');
      html += _svmSelect('Operator', 'svm-trig-op', ['>=','<=','=='], tc.operator || '>=');
      html += _svmField('Value', 'svm-trig-val', tc.value || '', 'number');
    } else {
      html += '<div class="u-text-faint" style="font-size:11px;">Shows on dashboard page navigation.</div>';
    }
    container.innerHTML = html;
  }

  // ── Save ──
  window.svmSaveCampaign = async function() {
    var btn = document.getElementById('svm-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      var sb = window.supabase || window._supabase;
      if (!sb) throw new Error('Not connected');

      // Read form values
      var title = (document.getElementById('svm-title') || {}).value || '';
      var version = (document.getElementById('svm-version') || {}).value || '';
      var type = (document.getElementById('svm-type') || {}).value || 'periodic';
      var credits = parseInt((document.getElementById('svm-credits') || {}).value) || 0;
      var minutes = parseInt((document.getElementById('svm-minutes') || {}).value) || 2;
      var desc = (document.getElementById('svm-desc') || {}).value || '';
      var freq = parseInt((document.getElementById('svm-freq') || {}).value) || 14;
      var expires = (document.getElementById('svm-expires') || {}).value || null;
      var priority = parseInt((document.getElementById('svm-priority') || {}).value) || 5;

      // Audience config
      var audType = (document.getElementById('svm-audience-type') || {}).value || 'all';
      var audience_config = { type: audType };
      if (audType === 'time_cohort') {
        audience_config.signup_after = (document.getElementById('svm-aud-after') || {}).value || null;
        audience_config.signup_before = (document.getElementById('svm-aud-before') || {}).value || null;
      } else if (audType === 'behavioral') {
        var ms = parseInt((document.getElementById('svm-aud-sessions') || {}).value); if (ms) audience_config.min_sessions = ms;
        var ma = parseInt((document.getElementById('svm-aud-apps') || {}).value); if (ma) audience_config.min_applications = ma;
        var plan = (document.getElementById('svm-aud-plan') || {}).value; if (plan && plan !== 'any') audience_config.plan = plan;
        var dsm = parseInt((document.getElementById('svm-aud-days-min') || {}).value); if (dsm) audience_config.days_since_signup_min = dsm;
      }

      // Trigger config
      var trigType = (document.getElementById('svm-trigger-type') || {}).value || 'page_navigation';
      var trigger_config = { type: trigType };
      if (trigType === 'cron') trigger_config.schedule = (document.getElementById('svm-trig-cron') || {}).value || '';
      if (trigType === 'event') trigger_config.event_name = (document.getElementById('svm-trig-event') || {}).value || '';
      if (trigType === 'behavioral') {
        trigger_config.metric = (document.getElementById('svm-trig-metric') || {}).value || '';
        trigger_config.operator = (document.getElementById('svm-trig-op') || {}).value || '>=';
        trigger_config.value = parseInt((document.getElementById('svm-trig-val') || {}).value) || 0;
      }

      // Placement config
      var overlayEnabled = !!(document.getElementById('svm-ch-overlay') || {}).checked;
      var merchEnabled = !!(document.getElementById('svm-ch-merch') || {}).checked;
      var emailEnabled = !!(document.getElementById('svm-ch-email') || {}).checked;
      var smsEnabled = !!(document.getElementById('svm-ch-sms') || {}).checked;
      var overlayPages = _svmReadPageCheckboxes('overlay');
      var merchPages = _svmReadPageCheckboxes('merch');
      var merchPos = (document.getElementById('svm-merch-pos') || {}).value || 'sidebar';

      var placement_config = {
        overlay: { enabled: overlayEnabled, pages: overlayPages },
        merch: { enabled: merchEnabled, pages: merchPages, position: merchPos },
        email: { enabled: emailEnabled },
        sms: { enabled: smsEnabled }
      };

      var payload = {
        action: _editingCampaign ? 'update' : 'create',
        title: title,
        survey_type: type,
        description: desc,
        estimated_minutes: minutes,
        credit_reward: credits,
        priority: priority,
        frequency_days: freq,
        expires_at: expires ? new Date(expires).toISOString() : null,
        questions: _modalQuestions,
        audience_config: audience_config,
        trigger_config: trigger_config,
        placement_config: placement_config
      };

      if (_editingCampaign) {
        payload.id = _editingCampaign.id;
      } else {
        payload.survey_version = version;
      }

      var res = await sb.functions.invoke('admin-survey-manager', { body: payload });
      if (res.error) throw res.error;
      var data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      if (data.error) throw new Error(data.error);

      // Close modal + refresh
      var modal = document.getElementById(MODAL_ID);
      if (modal) modal.remove();
      svmFetchCampaigns();
    } catch (e) {
      reportError('admin_survey_manager', e, { action: _editingCampaign ? 'update' : 'create' });
      alert('Failed to save: ' + (e.message || e));
      if (btn) { btn.disabled = false; btn.textContent = _editingCampaign ? 'Save Changes' : 'Create Survey'; }
    }
  };

  // ── Form Helpers ──
  function _svmField(label, id, value, type, disabled) {
    var tag = type === 'textarea' ? 'textarea' : 'input';
    var typeAttr = tag === 'input' ? ' type="' + type + '"' : '';
    var disAttr = disabled ? ' disabled' : '';
    var valContent = tag === 'textarea' ? _svmEsc(value) : '';
    var valAttr = tag === 'input' ? ' value="' + _svmAttr(value) + '"' : '';
    return '<div style="margin-bottom:8px;flex:1;">'
      + '<label style="display:block;font-size:10px;color:var(--text-dim);margin-bottom:2px;">' + _svmEsc(label) + '</label>'
      + '<' + tag + ' id="' + id + '"' + typeAttr + valAttr + disAttr + ' style="width:100%;font-size:12px;padding:4px 6px;background:var(--bg-input,#0d0f14);border:1px solid var(--border);border-radius:4px;color:var(--text);' + (disabled ? 'opacity:0.5;' : '') + '">' + valContent + (tag === 'textarea' ? '</textarea>' : '')
      + '</div>';
  }
  function _svmSelect(label, id, options, selected) {
    return '<div style="margin-bottom:8px;flex:1;">'
      + '<label style="display:block;font-size:10px;color:var(--text-dim);margin-bottom:2px;">' + _svmEsc(label) + '</label>'
      + '<select id="' + id + '" style="width:100%;font-size:12px;padding:4px 6px;background:var(--bg-input,#0d0f14);border:1px solid var(--border);border-radius:4px;color:var(--text);">'
      + options.map(function(o) { return '<option value="' + o + '"' + (o === selected ? ' selected' : '') + '>' + o + '</option>'; }).join('')
      + '</select></div>';
  }
  function _svmCheckbox(label, id, checked) {
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-bottom:6px;">'
      + '<input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '>' + _svmEsc(label) + '</label>';
  }
  function _svmPageCheckboxes(prefix, selected) {
    var sel = selected || [];
    return '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + DASHBOARD_PAGES.map(function(p) {
      return '<label style="font-size:10px;display:flex;align-items:center;gap:2px;cursor:pointer;">'
        + '<input type="checkbox" class="svm-page-cb-' + prefix + '" value="' + p + '"' + (sel.indexOf(p) !== -1 ? ' checked' : '') + '>' + p + '</label>';
    }).join('') + '</div>';
  }
  function _svmReadPageCheckboxes(prefix) {
    var pages = [];
    document.querySelectorAll('.svm-page-cb-' + prefix + ':checked').forEach(function(cb) { pages.push(cb.value); });
    return pages;
  }
  function _svmAttr(val) {
    return String(val || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  // ─── XSS Escape ────────────────────────────────────────────────────────────
  function _svmEsc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
