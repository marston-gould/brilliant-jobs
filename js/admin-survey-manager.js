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

  // ─── Edit (SVM-S2 stub) ────────────────────────────────────────────────────
  window.svmEditCampaign = function(id) {
    var campaign = _campaigns.find(function(c) { return c.id === id; });
    if (!campaign) return;
    // SVM-S2: Opens full CRUD modal with WHAT/WHO/WHEN/WHERE sections
    alert('Edit modal coming in SVM-S2.\n\nCampaign: ' + campaign.title + '\nVersion: ' + campaign.survey_version + '\nQuestions: ' + (campaign.questions ? campaign.questions.length + ' loaded' : 'none') + '\nAudience: ' + JSON.stringify(campaign.audience_config || {}) + '\nTrigger: ' + JSON.stringify(campaign.trigger_config || {}) + '\nPlacement: ' + JSON.stringify(campaign.placement_config || {}));
  };

  // ─── Create (SVM-S2 stub) ──────────────────────────────────────────────────
  window.svmOpenCreate = function() {
    // SVM-S2: Opens full create modal
    alert('Create modal coming in SVM-S2.');
  };

  // ─── XSS Escape ────────────────────────────────────────────────────────────
  function _svmEsc(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
})();
