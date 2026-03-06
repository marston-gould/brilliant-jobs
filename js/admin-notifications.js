/* ───────────────────────────────────────────────────────────
   admin-notifications.js — Notification Management + Template Manager
   Session 1 of Notification System (Pod 2)
   v6.22
   ─────────────────────────────────────────────────────────── */

// ═══════════════════════════════════════════════════════════
// NOTIFICATION TYPE CATALOG (79 types, 13 categories)
// ═══════════════════════════════════════════════════════════
var NOTIF_CATEGORIES = {
  onboarding: { label: 'Onboarding', types: ['welcome','onboard_resume','onboard_filter','onboard_extension'] },
  integration: { label: 'Integration Adoption', types: ['adopt_extension_reminder','adopt_gmail','adopt_calendar','adopt_drive','adopt_integration_combo','adopt_post_value_moment'] },
  extension: { label: 'Extension', types: ['extension_update','extension_disconnected'] },
  application: { label: 'Application Process', types: ['auto_apply_confirm','apply_alert','cv_score_approval','auth_pending_reminder','auth_expired','auth_pre_rewrite','pipeline_response','pipeline_interview','interview_reminder','pipeline_stale'] },
  resume: { label: 'Resume Intelligence', types: ['rewrite_started','rewrite_complete','rewrite_failed','rewrite_review_reminder','rewrite_batch_summary'] },
  stats: { label: 'Stats & Trends', types: ['weekly_summary','monthly_pipeline_report','pipeline_benchmark','filter_trend_weekly','market_pulse','trend_anomaly'] },
  ghost: { label: 'Ghost Intelligence', types: ['ghost_alert','ghost_report_weekly'] },
  discovery: { label: 'Job Discovery', types: ['new_jobs_daily','new_jobs_realtime'] },
  verification: { label: 'Pipeline Verification', types: ['pipeline_status_check','pipeline_bulk_review','pipeline_detected_update','pipeline_auto_updated','pipeline_ambiguous_signal','pipeline_outcome_unknown'] },
  referral: { label: 'Referral', types: ['referral_invite','referral_sent_confirmation','referral_status_update','referral_nudge_referee','referral_conversion','referral_reward_earned','referral_expiring_reward','referral_milestone','referral_periodic_summary'] },
  upgrade: { label: 'Upgrade & Credits', types: ['usage_upgrade_prompt','credit_cost_comparison','credit_burn_rate_alert','credit_low_balance','credit_exhausted','upgrade_roi_summary','price_lock_warning','promo_trial','promo_feature_preview'] },
  community: { label: 'Community & Feedback', types: ['bug_report_thankyou','bug_resolved','feature_request_thankyou','feature_request_accepted','feature_request_shipped','monthly_product_update'] },
  account: { label: 'Account & Billing', types: ['double_opt_in','notification_opt_in','subscription_expiring','subscription_confirm','credit_purchase_receipt','payment_failed','payment_recovered','plan_change_confirm','subscription_cancelled','invoice_generated','refund_processed','inactive_reengagement','reengagement_14d','reengagement_30d','reengagement_60d'] }
};

// Message classification
var NOTIF_CLASSIFICATION = {
  required_transactional: ['subscription_confirm','credit_purchase_receipt','payment_failed','payment_recovered','plan_change_confirm','subscription_cancelled','invoice_generated','refund_processed','double_opt_in'],
  configurable_transactional: ['subscription_expiring','notification_opt_in'],
  product: ['welcome','onboard_resume','onboard_filter','onboard_extension','adopt_extension_reminder','adopt_gmail','adopt_calendar','adopt_drive','adopt_integration_combo','adopt_post_value_moment','extension_update','extension_disconnected','auto_apply_confirm','apply_alert','cv_score_approval','auth_pending_reminder','auth_expired','auth_pre_rewrite','pipeline_response','pipeline_interview','interview_reminder','pipeline_stale','rewrite_started','rewrite_complete','rewrite_failed','rewrite_review_reminder','rewrite_batch_summary','weekly_summary','monthly_pipeline_report','pipeline_benchmark','filter_trend_weekly','market_pulse','trend_anomaly','ghost_alert','ghost_report_weekly','new_jobs_daily','new_jobs_realtime','pipeline_status_check','pipeline_bulk_review','pipeline_detected_update','pipeline_auto_updated','pipeline_ambiguous_signal','pipeline_outcome_unknown','bug_report_thankyou','bug_resolved','feature_request_thankyou','feature_request_accepted','feature_request_shipped','monthly_product_update'],
  marketing: ['usage_upgrade_prompt','credit_cost_comparison','credit_burn_rate_alert','credit_low_balance','credit_exhausted','upgrade_roi_summary','price_lock_warning','promo_trial','promo_feature_preview','referral_invite','referral_sent_confirmation','referral_status_update','referral_nudge_referee','referral_conversion','referral_reward_earned','referral_expiring_reward','referral_milestone','referral_periodic_summary','inactive_reengagement','reengagement_14d','reengagement_30d','reengagement_60d']
};

// Dark theme types
var DARK_THEME_TYPES = ['weekly_summary','monthly_pipeline_report','pipeline_benchmark','market_pulse','trend_anomaly','filter_trend_weekly','ghost_report_weekly','upgrade_roi_summary','credit_cost_comparison','monthly_product_update','rewrite_batch_summary'];

// ═══════════════════════════════════════════════════════════
// TAB: NOTIFICATION MANAGEMENT
// ═══════════════════════════════════════════════════════════
async function loadNotificationsTab() {
  var container = document.getElementById('admin-panel-notifications');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">Loading notification configs…</div>';

  try {
    // Load configs
    var { data: configs, error } = await sb.from('admin_notification_config').select('*').order('notification_type');
    if (error) throw error;

    // Load cohorts for dropdown
    var { data: cohorts } = await sb.from('cohorts').select('id,name').order('name');
    var cohortList = cohorts || [{ id: 'all', name: 'All' }];

    // Build category filter
    var categoryFilter = '<select id="notif-cat-filter" onchange="filterNotifConfigs()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px;">' +
      '<option value="all">All Categories</option>';
    Object.keys(NOTIF_CATEGORIES).forEach(function(k) {
      categoryFilter += '<option value="' + k + '">' + NOTIF_CATEGORIES[k].label + '</option>';
    });
    categoryFilter += '</select>';

    // Header + actions
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
      '<div style="display:flex;gap:8px;align-items:center">' + categoryFilter +
      '<span style="font-size:12px;color:var(--text-dim)" id="notif-config-count">' + (configs || []).length + ' configs</span></div>' +
      '<button onclick="seedAllNotifConfigs()" style="padding:6px 14px;border-radius:6px;border:1px solid var(--border);background:var(--accent);color:#fff;font-size:12px;cursor:pointer;">Seed Missing Configs</button>' +
      '</div>';

    // Config table
    html += '<div style="overflow-x:auto"><table class="admin-table" style="width:100%;font-size:12px;border-collapse:collapse;">' +
      '<thead><tr style="text-align:left;border-bottom:1px solid var(--border)">' +
      '<th style="padding:8px 6px">Type</th>' +
      '<th style="padding:8px 6px">Category</th>' +
      '<th style="padding:8px 6px">Classification</th>' +
      '<th style="padding:8px 6px">Cohort</th>' +
      '<th style="padding:8px 6px">Enabled</th>' +
      '<th style="padding:8px 6px">Cadence</th>' +
      '<th style="padding:8px 6px">Channel</th>' +
      '<th style="padding:8px 6px">Freq Cap</th>' +
      '<th style="padding:8px 6px">Actions</th>' +
      '</tr></thead><tbody id="notif-config-body">';

    // Render existing configs
    (configs || []).forEach(function(c) {
      html += renderNotifConfigRow(c);
    });

    // Also show unconfigured types
    var configuredTypes = new Set((configs || []).map(function(c) { return c.notification_type; }));
    var missingTypes = [];
    Object.keys(NOTIF_CATEGORIES).forEach(function(cat) {
      NOTIF_CATEGORIES[cat].types.forEach(function(t) {
        if (!configuredTypes.has(t)) missingTypes.push(t);
      });
    });

    if (missingTypes.length > 0) {
      html += '<tr><td colspan="9" style="padding:12px 6px;color:var(--text-faint);font-style:italic;border-top:2px solid var(--border)">' +
        '⚠ ' + missingTypes.length + ' notification types without config: ' + missingTypes.slice(0, 10).join(', ') +
        (missingTypes.length > 10 ? ' + ' + (missingTypes.length - 10) + ' more' : '') + '</td></tr>';
    }

    html += '</tbody></table></div>';

    // Coverage stats
    var allTypes = [];
    Object.values(NOTIF_CATEGORIES).forEach(function(c) { allTypes = allTypes.concat(c.types); });
    var coveragePct = allTypes.length > 0 ? Math.round((configuredTypes.size / allTypes.length) * 100) : 0;
    html += '<div style="margin-top:12px;font-size:11px;color:var(--text-dim)">Coverage: ' + configuredTypes.size + '/' + allTypes.length + ' types (' + coveragePct + '%)</div>';

    // Suppression Management Section (Card 3)
    html += '<div style="margin-top:24px;padding-top:20px;border-top:2px solid var(--border)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;cursor:pointer" onclick="toggleSuppressionSection()">' +
        '<h3 style="margin:0;font-size:14px;color:var(--text)">Email Suppressions</h3>' +
        '<span id="suppression-toggle-icon" style="color:var(--text-dim);font-size:12px">▼</span>' +
      '</div>' +
      '<div id="suppression-section"></div>' +
    '</div>';

    container.innerHTML = html;
    renderSuppressionSection();
  } catch (e) {
    console.error('[Admin] Notifications tab error:', e);
    container.innerHTML = '<div class="admin-red">Error: ' + escapeHtml(String(e)) + '</div>';
  }
}

function renderNotifConfigRow(c) {
  var cat = getCategoryForType(c.notification_type);
  var cls = getClassification(c.notification_type);
  var clsBadge = cls === 'required_transactional' ? '<span class="admin-badge admin-badge-red">Required</span>' :
    cls === 'configurable_transactional' ? '<span class="admin-badge admin-badge-amber">Config Trans</span>' :
    cls === 'marketing' ? '<span class="admin-badge admin-badge-blue">Marketing</span>' :
    '<span class="admin-badge admin-badge-green">Product</span>';

  return '<tr data-category="' + cat + '" data-type="' + c.notification_type + '">' +
    '<td style="padding:6px;font-family:var(--mono);font-size:11px">' + escapeHtml(c.notification_type) + '</td>' +
    '<td style="padding:6px;font-size:11px">' + (NOTIF_CATEGORIES[cat] ? NOTIF_CATEGORIES[cat].label : cat) + '</td>' +
    '<td style="padding:6px">' + clsBadge + '</td>' +
    '<td style="padding:6px;font-size:11px">' + escapeHtml(c.cohort_id) + '</td>' +
    '<td style="padding:6px">' +
      '<label class="admin-toggle" style="margin:0">' +
        '<input type="checkbox" ' + (c.enabled ? 'checked' : '') +
        ' onchange="toggleNotifConfig(\'' + c.id + '\', this.checked)"' +
        (cls === 'required_transactional' ? ' disabled title="Required transactional — cannot disable"' : '') + '>' +
        '<span class="admin-toggle-slider"></span>' +
      '</label>' +
    '</td>' +
    '<td style="padding:6px;font-size:11px">' + escapeHtml(c.cadence || 'default') + '</td>' +
    '<td style="padding:6px;font-size:11px">' + escapeHtml(c.channel_override || 'user_preference') + '</td>' +
    '<td style="padding:6px;font-size:11px">' + (c.frequency_cap_count ? c.frequency_cap_count + '/' + (c.frequency_cap_period || '?') : '—') + '</td>' +
    '<td style="padding:6px"><button onclick="editNotifConfig(\'' + c.id + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:11px;cursor:pointer">Edit</button></td>' +
    '</tr>';
}

function getCategoryForType(type) {
  for (var cat in NOTIF_CATEGORIES) {
    if (NOTIF_CATEGORIES[cat].types.indexOf(type) !== -1) return cat;
  }
  return 'unknown';
}

function getClassification(type) {
  for (var cls in NOTIF_CLASSIFICATION) {
    if (NOTIF_CLASSIFICATION[cls].indexOf(type) !== -1) return cls;
  }
  return 'product';
}

function filterNotifConfigs() {
  var filter = document.getElementById('notif-cat-filter').value;
  var rows = document.querySelectorAll('#notif-config-body tr[data-category]');
  var count = 0;
  rows.forEach(function(r) {
    var show = filter === 'all' || r.dataset.category === filter;
    r.style.display = show ? '' : 'none';
    if (show) count++;
  });
  var countEl = document.getElementById('notif-config-count');
  if (countEl) countEl.textContent = count + ' configs shown';
}

async function toggleNotifConfig(id, enabled) {
  try {
    var { error } = await sb.from('admin_notification_config').update({ enabled: enabled, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    toastSuccess('Config ' + (enabled ? 'enabled' : 'disabled'));
  } catch (e) {
    toastError('Failed to update: ' + e.message);
  }
}

async function seedAllNotifConfigs() {
  try {
    var { data: existing } = await sb.from('admin_notification_config').select('notification_type,cohort_id');
    var existingSet = new Set((existing || []).map(function(r) { return r.notification_type + '|' + r.cohort_id; }));
    var toInsert = [];
    Object.keys(NOTIF_CATEGORIES).forEach(function(cat) {
      NOTIF_CATEGORIES[cat].types.forEach(function(type) {
        if (!existingSet.has(type + '|all')) {
          var cls = getClassification(type);
          toInsert.push({
            notification_type: type,
            cohort_id: 'all',
            enabled: true,
            cadence: 'default',
            channel_override: 'user_preference',
            landing_page: '/dashboard'
          });
        }
      });
    });

    if (toInsert.length === 0) {
      toastSuccess('All configs already exist');
      return;
    }

    var { error } = await sb.from('admin_notification_config').insert(toInsert);
    if (error) throw error;
    toastSuccess('Seeded ' + toInsert.length + ' notification configs');
    loadNotificationsTab();
  } catch (e) {
    toastError('Seed failed: ' + e.message);
  }
}

async function editNotifConfig(id) {
  try {
    var { data: config, error } = await sb.from('admin_notification_config').select('*').eq('id', id).single();
    if (error) throw error;

    var modal = document.createElement('div');
    modal.className = 'admin-modal-overlay';
    modal.innerHTML = '<div class="admin-modal" style="max-width:520px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">' +
        '<h3 style="margin:0;font-size:16px">Edit: ' + escapeHtml(config.notification_type) + '</h3>' +
        '<button onclick="this.closest(\'.admin-modal-overlay\').remove()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer">✕</button>' +
      '</div>' +
      '<div style="display:grid;gap:12px">' +
        '<label style="font-size:12px;color:var(--text-dim)">Cadence' +
          '<select id="nc-cadence" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
            '<option value="default"' + (config.cadence === 'default' ? ' selected' : '') + '>Default</option>' +
            '<option value="realtime"' + (config.cadence === 'realtime' ? ' selected' : '') + '>Real-time</option>' +
            '<option value="daily"' + (config.cadence === 'daily' ? ' selected' : '') + '>Daily Digest</option>' +
            '<option value="weekly"' + (config.cadence === 'weekly' ? ' selected' : '') + '>Weekly</option>' +
            '<option value="monthly"' + (config.cadence === 'monthly' ? ' selected' : '') + '>Monthly</option>' +
          '</select></label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Channel Override' +
          '<select id="nc-channel" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
            '<option value="user_preference"' + (config.channel_override === 'user_preference' ? ' selected' : '') + '>User Preference</option>' +
            '<option value="email_only"' + (config.channel_override === 'email_only' ? ' selected' : '') + '>Email Only</option>' +
            '<option value="sms_only"' + (config.channel_override === 'sms_only' ? ' selected' : '') + '>SMS Only</option>' +
          '</select></label>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
          '<label style="font-size:12px;color:var(--text-dim)">Freq Cap Count' +
            '<input id="nc-freq-count" type="number" value="' + (config.frequency_cap_count || '') + '" placeholder="e.g. 3" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
          '</label>' +
          '<label style="font-size:12px;color:var(--text-dim)">Freq Cap Period' +
            '<input id="nc-freq-period" type="text" value="' + escapeHtml(config.frequency_cap_period || '') + '" placeholder="e.g. week" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
          '</label>' +
        '</div>' +
        '<label style="font-size:12px;color:var(--text-dim)">Landing Page' +
          '<input id="nc-landing" type="text" value="' + escapeHtml(config.landing_page || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '</label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Landing Tab' +
          '<input id="nc-tab" type="text" value="' + escapeHtml(config.landing_tab || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
        '<button onclick="this.closest(\'.admin-modal-overlay\').remove()" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);cursor:pointer">Cancel</button>' +
        '<button onclick="saveNotifConfig(\'' + id + '\')" style="padding:8px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer">Save</button>' +
      '</div>' +
    '</div>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  } catch (e) {
    toastError('Failed to load config: ' + e.message);
  }
}

async function saveNotifConfig(id) {
  try {
    var freqCount = document.getElementById('nc-freq-count').value;
    var updates = {
      cadence: document.getElementById('nc-cadence').value,
      channel_override: document.getElementById('nc-channel').value,
      frequency_cap_count: freqCount ? parseInt(freqCount) : null,
      frequency_cap_period: document.getElementById('nc-freq-period').value || null,
      landing_page: document.getElementById('nc-landing').value || null,
      landing_tab: document.getElementById('nc-tab').value || null,
      updated_at: new Date().toISOString()
    };
    var { error } = await sb.from('admin_notification_config').update(updates).eq('id', id);
    if (error) throw error;
    _logAdminAction('notification_config_updated', 'admin_notification_config', id, updates);
    document.querySelector('.admin-modal-overlay').remove();
    toastSuccess('Config saved');
    loadNotificationsTab();
  } catch (e) {
    toastError('Save failed: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════
// TAB: TEMPLATE MANAGER
// ═══════════════════════════════════════════════════════════
async function loadTemplatesTab() {
  var container = document.getElementById('admin-panel-templates');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">Loading templates…</div>';

  try {
    var { data: templates, error } = await sb.from('notification_templates').select('*').order('notification_type').order('channel').order('created_at', { ascending: false });
    if (error) throw error;

    // Category + status filters
    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<select id="tpl-cat-filter" onchange="filterTemplates()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px">' +
          '<option value="all">All Categories</option>';
    Object.keys(NOTIF_CATEGORIES).forEach(function(k) {
      html += '<option value="' + k + '">' + NOTIF_CATEGORIES[k].label + '</option>';
    });
    html += '</select>' +
        '<select id="tpl-status-filter" onchange="filterTemplates()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px">' +
          '<option value="all">All Statuses</option>' +
          '<option value="production">Production</option>' +
          '<option value="draft">Draft</option>' +
          '<option value="archived">Archived</option>' +
        '</select>' +
        '<select id="tpl-channel-filter" onchange="filterTemplates()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px">' +
          '<option value="all">All Channels</option>' +
          '<option value="email">Email</option>' +
          '<option value="sms">SMS</option>' +
          '<option value="in_app">In-App</option>' +
        '</select>' +
        '<input id="tpl-search" type="text" placeholder="Search templates…" oninput="filterTemplates()" style="padding:6px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px;width:180px">' +
      '</div>' +
      '<button onclick="openTemplateEditor()" style="padding:6px 14px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-size:12px;cursor:pointer">+ New Template</button>' +
    '</div>';

    // Coverage indicator
    var allTypes = [];
    Object.values(NOTIF_CATEGORIES).forEach(function(c) { allTypes = allTypes.concat(c.types); });
    var prodTemplates = (templates || []).filter(function(t) { return t.is_production && t.channel === 'email'; });
    var coveredTypes = new Set(prodTemplates.map(function(t) { return t.notification_type; }));
    var missingCount = allTypes.filter(function(t) { return !coveredTypes.has(t); }).length;
    if (missingCount > 0) {
      html += '<div style="padding:8px 12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:6px;margin-bottom:12px;font-size:12px;color:#ef4444">' +
        '⚠ ' + missingCount + ' notification types missing production email template</div>';
    }

    // Template table
    html += '<div style="overflow-x:auto"><table class="admin-table" style="width:100%;font-size:12px;border-collapse:collapse">' +
      '<thead><tr style="text-align:left;border-bottom:1px solid var(--border)">' +
      '<th style="padding:8px 6px">Type</th>' +
      '<th style="padding:8px 6px">Channel</th>' +
      '<th style="padding:8px 6px">Cohort</th>' +
      '<th style="padding:8px 6px">Plan</th>' +
      '<th style="padding:8px 6px">Version</th>' +
      '<th style="padding:8px 6px">Status</th>' +
      '<th style="padding:8px 6px">Theme</th>' +
      '<th style="padding:8px 6px">Subject</th>' +
      '<th style="padding:8px 6px">Updated</th>' +
      '<th style="padding:8px 6px">Actions</th>' +
      '</tr></thead><tbody id="tpl-table-body">';

    (templates || []).forEach(function(t) {
      var cat = getCategoryForType(t.notification_type);
      var statusBadge = t.status === 'production' ? '<span class="admin-badge admin-badge-green">Production</span>' :
        t.status === 'draft' ? '<span class="admin-badge admin-badge-amber">Draft</span>' :
        t.status === 'review' ? '<span class="admin-badge admin-badge-blue">Review</span>' :
        '<span class="admin-badge" style="background:var(--bg-input);color:var(--text-dim)">Archived</span>';
      var themeBadge = t.theme === 'dark' ? '<span style="padding:2px 6px;border-radius:3px;background:#1E2028;color:#F0F1F3;font-size:10px">Dark</span>' :
        '<span style="padding:2px 6px;border-radius:3px;background:#F8FAFC;color:#1E293B;font-size:10px;border:1px solid #ddd">Light</span>';
      var subjectSnippet = (t.subject_line || '—').substring(0, 40) + (t.subject_line && t.subject_line.length > 40 ? '…' : '');
      var updatedDate = t.updated_at ? new Date(t.updated_at).toLocaleDateString() : '—';

      html += '<tr data-category="' + cat + '" data-status="' + (t.status || 'production') + '" data-channel="' + (t.channel || 'email') + '" data-search="' + escapeHtml((t.notification_type + ' ' + (t.subject_line || '')).toLowerCase()) + '">' +
        '<td style="padding:6px;font-family:var(--mono);font-size:11px">' + escapeHtml(t.notification_type) + '</td>' +
        '<td style="padding:6px;font-size:11px">' + escapeHtml(t.channel || 'email') + '</td>' +
        '<td style="padding:6px;font-size:11px">' + escapeHtml(t.cohort_id || 'default') + '</td>' +
        '<td style="padding:6px;font-size:11px">' + escapeHtml(t.plan || '—') + '</td>' +
        '<td style="padding:6px;font-family:var(--mono);font-size:11px">' + escapeHtml(t.version) + '</td>' +
        '<td style="padding:6px">' + statusBadge + '</td>' +
        '<td style="padding:6px">' + themeBadge + '</td>' +
        '<td style="padding:6px;font-size:11px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(t.subject_line || '') + '">' + escapeHtml(subjectSnippet) + '</td>' +
        '<td style="padding:6px;font-size:11px;color:var(--text-dim)">' + updatedDate + '</td>' +
        '<td style="padding:6px;white-space:nowrap">' +
          '<button onclick="openTemplateEditor(\'' + t.id + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:11px;cursor:pointer;margin-right:4px" title="Edit">✎</button>' +
          '<button onclick="duplicateTemplate(\'' + t.id + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:11px;cursor:pointer;margin-right:4px" title="Duplicate">⧉</button>' +
          (t.status !== 'production' && t.status !== 'archived' ? '<button onclick="promoteTemplate(\'' + t.id + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:11px;cursor:pointer" title="Promote to Production">▲</button>' : '') +
          (t.status === 'archived' ? '<button onclick="promoteTemplate(\'' + t.id + '\')" style="padding:3px 8px;border-radius:4px;border:1px solid var(--accent);background:var(--bg-input);color:var(--accent);font-size:11px;cursor:pointer" title="Rollback to Production">↩</button>' : '') +
        '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<div style="margin-top:12px;font-size:11px;color:var(--text-dim)">' + (templates || []).length + ' templates total, ' + prodTemplates.length + ' in production</div>';

    container.innerHTML = html;
  } catch (e) {
    console.error('[Admin] Templates tab error:', e);
    container.innerHTML = '<div class="admin-red">Error: ' + escapeHtml(String(e)) + '</div>';
  }
}

function filterTemplates() {
  var catFilter = document.getElementById('tpl-cat-filter').value;
  var statusFilter = document.getElementById('tpl-status-filter').value;
  var channelFilter = document.getElementById('tpl-channel-filter').value;
  var searchTerm = (document.getElementById('tpl-search').value || '').toLowerCase();

  document.querySelectorAll('#tpl-table-body tr').forEach(function(row) {
    var catMatch = catFilter === 'all' || row.dataset.category === catFilter;
    var statusMatch = statusFilter === 'all' || row.dataset.status === statusFilter;
    var channelMatch = channelFilter === 'all' || row.dataset.channel === channelFilter;
    var searchMatch = !searchTerm || (row.dataset.search || '').indexOf(searchTerm) !== -1;
    row.style.display = (catMatch && statusMatch && channelMatch && searchMatch) ? '' : 'none';
  });
}

async function openTemplateEditor(templateId) {
  var template = null;
  if (templateId) {
    var { data, error } = await sb.from('notification_templates').select('*').eq('id', templateId).single();
    if (error) { toastError('Failed to load template'); return; }
    template = data;
  }

  var isNew = !template;
  var t = template || { notification_type: '', channel: 'email', cohort_id: 'default', plan: 'free', version: '1.0.0', status: 'draft', theme: 'white', subject_line: '', preheader: '', html_body: '', plain_text_body: '', sms_body: '', in_app_title: '', in_app_body: '', in_app_icon: '', in_app_action_url: '', cta_primary_text: '', cta_primary_url: '', cta_secondary_text: '', cta_secondary_url: '', notes: '' };

  // Build type dropdown options
  var typeOptions = '';
  Object.keys(NOTIF_CATEGORIES).forEach(function(cat) {
    typeOptions += '<optgroup label="' + NOTIF_CATEGORIES[cat].label + '">';
    NOTIF_CATEGORIES[cat].types.forEach(function(type) {
      typeOptions += '<option value="' + type + '"' + (t.notification_type === type ? ' selected' : '') + '>' + type + '</option>';
    });
    typeOptions += '</optgroup>';
  });

  var modal = document.createElement('div');
  modal.className = 'admin-modal-overlay';
  modal.innerHTML = '<div class="admin-modal" style="max-width:800px;max-height:90vh;overflow-y:auto">' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;position:sticky;top:0;background:var(--bg-card);padding:8px 0;z-index:1">' +
      '<h3 style="margin:0;font-size:16px">' + (isNew ? 'New Template' : 'Edit: ' + t.notification_type + ' (' + t.channel + ')') + '</h3>' +
      '<button onclick="this.closest(\'.admin-modal-overlay\').remove()" style="background:none;border:none;color:var(--text-dim);font-size:20px;cursor:pointer">✕</button>' +
    '</div>' +

    // Identity row
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:12px">' +
      '<label style="font-size:12px;color:var(--text-dim)">Type<select id="te-type" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px;font-size:11px">' + typeOptions + '</select></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Channel<select id="te-channel" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '<option value="email"' + (t.channel === 'email' ? ' selected' : '') + '>Email</option>' +
        '<option value="sms"' + (t.channel === 'sms' ? ' selected' : '') + '>SMS</option>' +
        '<option value="in_app"' + (t.channel === 'in_app' ? ' selected' : '') + '>In-App</option>' +
      '</select></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Cohort<input id="te-cohort" type="text" value="' + escapeHtml(t.cohort_id || 'default') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Version<input id="te-version" type="text" value="' + escapeHtml(t.version) + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px;font-family:var(--mono)"></label>' +
    '</div>' +

    // Status + Theme
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">' +
      '<label style="font-size:12px;color:var(--text-dim)">Status<select id="te-status" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '<option value="draft"' + (t.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
        '<option value="review"' + (t.status === 'review' ? ' selected' : '') + '>Review</option>' +
        '<option value="production"' + (t.status === 'production' ? ' selected' : '') + '>Production</option>' +
        '<option value="archived"' + (t.status === 'archived' ? ' selected' : '') + '>Archived</option>' +
      '</select></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Theme<select id="te-theme" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '<option value="white"' + (t.theme === 'white' ? ' selected' : '') + '>White (Light)</option>' +
        '<option value="dark"' + (t.theme === 'dark' ? ' selected' : '') + '>Dark (Data)</option>' +
      '</select></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Plan<select id="te-plan" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px">' +
        '<option value="free"' + (t.plan === 'free' ? ' selected' : '') + '>Free</option>' +
        '<option value="starter"' + (t.plan === 'starter' ? ' selected' : '') + '>Starter</option>' +
        '<option value="pro"' + (t.plan === 'pro' ? ' selected' : '') + '>Pro</option>' +
        '<option value="default"' + (t.plan === 'default' ? ' selected' : '') + '>Default (all plans)</option>' +
      '</select></label>' +
    '</div>' +

    // Email fields
    '<div id="te-email-fields">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text)">Email Content</div>' +
      '<label style="font-size:12px;color:var(--text-dim)">Subject Line<input id="te-subject" type="text" value="' + escapeHtml(t.subject_line || '') + '" placeholder="e.g. Welcome to Brilliant Jobs — {{user.first_name}}" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0"></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Preheader<input id="te-preheader" type="text" value="' + escapeHtml(t.preheader || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0"></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">HTML Body<textarea id="te-html" rows="8" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0;font-family:var(--mono);font-size:11px;resize:vertical">' + escapeHtml(t.html_body || '') + '</textarea></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Plain Text Body<textarea id="te-plaintext" rows="4" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0;font-family:var(--mono);font-size:11px;resize:vertical">' + escapeHtml(t.plain_text_body || '') + '</textarea></label>' +
    '</div>' +

    // SMS fields
    '<div id="te-sms-fields" style="display:none">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text)">SMS Content</div>' +
      '<label style="font-size:12px;color:var(--text-dim)">SMS Body (160 char segments)<textarea id="te-sms" rows="3" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0;font-size:12px;resize:vertical" oninput="updateSmsCounter()">' + escapeHtml(t.sms_body || '') + '</textarea></label>' +
      '<div id="te-sms-counter" style="font-size:11px;color:var(--text-dim);margin-bottom:8px">0/160</div>' +
    '</div>' +

    // In-app fields
    '<div id="te-inapp-fields" style="display:none">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text)">In-App Content</div>' +
      '<label style="font-size:12px;color:var(--text-dim)">Title<input id="te-inapp-title" type="text" value="' + escapeHtml(t.in_app_title || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0"></label>' +
      '<label style="font-size:12px;color:var(--text-dim)">Body<textarea id="te-inapp-body" rows="3" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin:4px 0 8px 0;resize:vertical">' + escapeHtml(t.in_app_body || '') + '</textarea></label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<label style="font-size:12px;color:var(--text-dim)">Icon<input id="te-inapp-icon" type="text" value="' + escapeHtml(t.in_app_icon || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Action URL<input id="te-inapp-url" type="text" value="' + escapeHtml(t.in_app_action_url || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
      '</div>' +
    '</div>' +

    // CTA fields
    '<div style="margin-top:12px">' +
      '<div style="font-size:13px;font-weight:600;margin-bottom:8px;color:var(--text)">CTAs</div>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
        '<label style="font-size:12px;color:var(--text-dim)">Primary CTA Text<input id="te-cta1-text" type="text" value="' + escapeHtml(t.cta_primary_text || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Primary CTA URL<input id="te-cta1-url" type="text" value="' + escapeHtml(t.cta_primary_url || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Secondary CTA Text<input id="te-cta2-text" type="text" value="' + escapeHtml(t.cta_secondary_text || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
        '<label style="font-size:12px;color:var(--text-dim)">Secondary CTA URL<input id="te-cta2-url" type="text" value="' + escapeHtml(t.cta_secondary_url || '') + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px"></label>' +
      '</div>' +
    '</div>' +

    // Notes
    '<label style="font-size:12px;color:var(--text-dim);margin-top:12px;display:block">Notes<textarea id="te-notes" rows="2" style="width:100%;padding:6px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);margin-top:4px;resize:vertical">' + escapeHtml(t.notes || '') + '</textarea></label>' +

    // Actions
    '<div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">' +
      '<button onclick="this.closest(\'.admin-modal-overlay\').remove()" style="padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);cursor:pointer">Cancel</button>' +
      '<button onclick="saveTemplate(' + (isNew ? 'null' : '\'' + templateId + '\'') + ')" style="padding:8px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer">Save</button>' +
    '</div>' +
  '</div>';

  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });

  // Toggle channel-specific fields
  var channelSelect = document.getElementById('te-channel');
  function updateChannelFields() {
    var ch = channelSelect.value;
    document.getElementById('te-email-fields').style.display = ch === 'email' ? '' : 'none';
    document.getElementById('te-sms-fields').style.display = ch === 'sms' ? '' : 'none';
    document.getElementById('te-inapp-fields').style.display = ch === 'in_app' ? '' : 'none';
  }
  channelSelect.addEventListener('change', updateChannelFields);
  updateChannelFields();

  // Auto-set theme based on type
  var typeSelect = document.getElementById('te-type');
  typeSelect.addEventListener('change', function() {
    var themeSelect = document.getElementById('te-theme');
    themeSelect.value = DARK_THEME_TYPES.indexOf(typeSelect.value) !== -1 ? 'dark' : 'white';
  });
}

function updateSmsCounter() {
  var body = document.getElementById('te-sms');
  var counter = document.getElementById('te-sms-counter');
  if (body && counter) {
    var len = body.value.length;
    var segments = Math.ceil(len / 160) || 1;
    counter.textContent = len + '/' + (segments * 160) + ' (' + segments + ' segment' + (segments > 1 ? 's' : '') + ')';
    counter.style.color = len > 320 ? '#ef4444' : 'var(--text-dim)';
  }
}

async function saveTemplate(templateId) {
  try {
    var channel = document.getElementById('te-channel').value;
    var status = document.getElementById('te-status').value;
    var data = {
      notification_type: document.getElementById('te-type').value,
      channel: channel,
      cohort_id: document.getElementById('te-cohort').value || 'default',
      plan: document.getElementById('te-plan').value || 'free',
      version: document.getElementById('te-version').value,
      status: status,
      is_production: status === 'production',
      theme: document.getElementById('te-theme').value,
      subject_line: document.getElementById('te-subject').value || null,
      preheader: document.getElementById('te-preheader').value || null,
      html_body: document.getElementById('te-html').value || null,
      plain_text_body: document.getElementById('te-plaintext').value || null,
      sms_body: document.getElementById('te-sms').value || null,
      in_app_title: document.getElementById('te-inapp-title').value || null,
      in_app_body: document.getElementById('te-inapp-body').value || null,
      in_app_icon: document.getElementById('te-inapp-icon').value || null,
      in_app_action_url: document.getElementById('te-inapp-url').value || null,
      cta_primary_text: document.getElementById('te-cta1-text').value || null,
      cta_primary_url: document.getElementById('te-cta1-url').value || null,
      cta_secondary_text: document.getElementById('te-cta2-text').value || null,
      cta_secondary_url: document.getElementById('te-cta2-url').value || null,
      notes: document.getElementById('te-notes').value || null,
      updated_at: new Date().toISOString()
    };

    if (templateId) {
      var { error } = await sb.from('notification_templates').update(data).eq('id', templateId);
      if (error) throw error;
    } else {
      data.active = true;
      data.config = {};
      var { error } = await sb.from('notification_templates').insert(data);
      if (error) throw error;
    }

    document.querySelector('.admin-modal-overlay').remove();
    toastSuccess('Template saved');
    loadTemplatesTab();
  } catch (e) {
    toastError('Save failed: ' + e.message);
  }
}

async function duplicateTemplate(id) {
  try {
    var { data: original, error } = await sb.from('notification_templates').select('*').eq('id', id).single();
    if (error) throw error;

    var clone = Object.assign({}, original);
    delete clone.id;
    clone.status = 'draft';
    clone.is_production = false;
    clone.version = bumpVersion(clone.version, 'minor');
    clone.notes = 'Duplicated from v' + original.version;
    clone.created_at = new Date().toISOString();
    clone.updated_at = new Date().toISOString();
    clone.promoted_at = null;
    clone.promoted_by = null;

    var { error: insertErr } = await sb.from('notification_templates').insert(clone);
    if (insertErr) throw insertErr;
    toastSuccess('Template duplicated as draft v' + clone.version);
    loadTemplatesTab();
  } catch (e) {
    toastError('Duplicate failed: ' + e.message);
  }
}

async function promoteTemplate(id) {
  if (!confirm('Promote this template to production? The current production version will be archived.')) return;
  try {
    var { data: template, error } = await sb.from('notification_templates').select('*').eq('id', id).single();
    if (error) throw error;

    // Archive current production version(s) for this type/channel/cohort/plan
    await sb.from('notification_templates')
      .update({ status: 'archived', is_production: false, updated_at: new Date().toISOString() })
      .eq('notification_type', template.notification_type)
      .eq('channel', template.channel)
      .eq('cohort_id', template.cohort_id)
      .eq('plan', template.plan)
      .eq('is_production', true)
      .neq('id', id);

    // Promote this one
    await sb.from('notification_templates')
      .update({ status: 'production', is_production: true, promoted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);

    toastSuccess('Template promoted to production');
    loadTemplatesTab();
  } catch (e) {
    toastError('Promote failed: ' + e.message);
  }
}

function bumpVersion(ver, type) {
  var parts = (ver || '1.0.0').split('.').map(Number);
  if (type === 'major') { parts[0]++; parts[1] = 0; parts[2] = 0; }
  else if (type === 'minor') { parts[1]++; parts[2] = 0; }
  else { parts[2]++; }
  return parts.join('.');
}


function toggleSuppressionSection() {
  var section = document.getElementById('suppression-section');
  var icon = document.getElementById('suppression-toggle-icon');
  if (!section) return;
  if (section.style.display === 'none') {
    section.style.display = '';
    if (icon) icon.textContent = '▼';
    renderSuppressionSection();
  } else {
    section.style.display = 'none';
    if (icon) icon.textContent = '▶';
  }
}

// ═══════════════════════════════════════════════════════════
// TAB SECTION: SUPPRESSION MANAGEMENT (Card 3 — Phase 69 Session 2)
// Rendered inside the Notifications tab as a collapsible section
// ═══════════════════════════════════════════════════════════

async function renderSuppressionSection() {
  var container = document.getElementById('suppression-section');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">Loading suppression list…</div>';

  try {
    var { data: suppressions, error } = await sb
      .from('notification_suppressions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    var items = suppressions || [];

    // Stats summary
    var hard = items.filter(function(s) { return s.type === 'hard_bounce'; }).length;
    var soft = items.filter(function(s) { return s.type === 'soft_bounce'; }).length;
    var complaints = items.filter(function(s) { return s.type === 'complaint'; }).length;
    var manual = items.filter(function(s) { return s.type === 'manual'; }).length;
    var active = items.filter(function(s) {
      return s.type === 'hard_bounce' || s.type === 'complaint' ||
        (s.expires_at && new Date(s.expires_at) > new Date());
    }).length;

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">' +
      '<div style="display:flex;gap:12px;align-items:center">' +
      '<span class="admin-badge admin-badge-red">' + active + ' active</span>' +
      '<span style="font-size:11px;color:var(--text-faint)">' +
        hard + ' hard · ' + soft + ' soft · ' + complaints + ' complaint · ' + manual + ' manual' +
      '</span></div>' +
      '<div style="display:flex;gap:6px">' +
      '<input type="text" id="suppression-search" placeholder="Search email…" ' +
        'oninput="filterSuppressionRows()" ' +
        'style="padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:12px;width:180px">' +
      '<select id="suppression-type-filter" onchange="filterSuppressionRows()" ' +
        'style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:12px">' +
        '<option value="all">All types</option>' +
        '<option value="hard_bounce">Hard bounce</option>' +
        '<option value="soft_bounce">Soft bounce</option>' +
        '<option value="complaint">Complaint</option>' +
        '<option value="manual">Manual</option>' +
      '</select>' +
      '<button onclick="showAddSuppressionModal()" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--accent);color:#fff;font-size:11px;cursor:pointer">+ Add</button>' +
      '<button onclick="exportSuppressions()" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:11px;cursor:pointer">Export CSV</button>' +
      '</div></div>';

    // Table
    html += '<div style="overflow-x:auto;max-height:400px;overflow-y:auto"><table class="admin-table" style="width:100%;font-size:11px;border-collapse:collapse">' +
      '<thead style="position:sticky;top:0;background:var(--bg-card);z-index:1"><tr style="text-align:left;border-bottom:1px solid var(--border)">' +
      '<th style="padding:6px">Email</th>' +
      '<th style="padding:6px">Type</th>' +
      '<th style="padding:6px">Reason</th>' +
      '<th style="padding:6px">Bounces</th>' +
      '<th style="padding:6px">Expires</th>' +
      '<th style="padding:6px">Updated</th>' +
      '<th style="padding:6px">Actions</th>' +
      '</tr></thead><tbody id="suppression-tbody">';

    items.forEach(function(s) {
      html += renderSuppressionRow(s);
    });

    if (items.length === 0) {
      html += '<tr><td colspan="7" style="padding:16px;text-align:center;color:var(--text-faint)">No suppressions yet. Bounces and complaints from Resend webhooks will appear here automatically.</td></tr>';
    }

    html += '</tbody></table></div>';

    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = '<div class="admin-red">Failed to load suppressions: ' + e.message + '</div>';
  }
}

function renderSuppressionRow(s) {
  var isActive = s.type === 'hard_bounce' || s.type === 'complaint' ||
    (s.expires_at && new Date(s.expires_at) > new Date());
  var typeBadge = {
    hard_bounce: 'admin-badge-red',
    soft_bounce: 'admin-badge-amber',
    complaint: 'admin-badge-red',
    manual: 'admin-badge-blue'
  }[s.type] || 'admin-badge-blue';

  var expiresText = '—';
  if (s.type === 'hard_bounce' || s.type === 'complaint') {
    expiresText = 'Permanent';
  } else if (s.expires_at) {
    var exp = new Date(s.expires_at);
    expiresText = exp > new Date() ? relativeTime(exp) : '<span style="color:var(--text-faint)">Expired</span>';
  }

  return '<tr class="suppression-row" data-email="' + (s.email || '').toLowerCase() + '" data-type="' + s.type + '" ' +
    'style="border-bottom:1px solid var(--border);opacity:' + (isActive ? '1' : '0.5') + '">' +
    '<td style="padding:6px;font-family:var(--mono);font-size:10px">' + escapeHtml(s.email || '') + '</td>' +
    '<td style="padding:6px"><span class="admin-badge ' + typeBadge + '">' + s.type.replace('_', ' ') + '</span></td>' +
    '<td style="padding:6px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escapeHtml(s.reason || '') + '">' + escapeHtml((s.reason || '').slice(0, 60)) + '</td>' +
    '<td style="padding:6px;font-family:var(--mono)">' + (s.bounce_count || '—') + '</td>' +
    '<td style="padding:6px;font-size:10px">' + expiresText + '</td>' +
    '<td style="padding:6px;font-size:10px;color:var(--text-dim)">' + formatTimestamp(s.updated_at) + '</td>' +
    '<td style="padding:6px">' +
      '<button onclick="removeSuppression(\'' + s.id + '\',\'' + escapeHtml(s.email || '') + '\')" ' +
        'style="padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--red);font-size:10px;cursor:pointer" ' +
        'title="Remove suppression">Remove</button>' +
    '</td></tr>';
}

function filterSuppressionRows() {
  var search = (document.getElementById('suppression-search')?.value || '').toLowerCase();
  var typeFilter = document.getElementById('suppression-type-filter')?.value || 'all';
  var rows = document.querySelectorAll('.suppression-row');
  rows.forEach(function(row) {
    var email = row.getAttribute('data-email') || '';
    var type = row.getAttribute('data-type') || '';
    var matchSearch = !search || email.includes(search);
    var matchType = typeFilter === 'all' || type === typeFilter;
    row.style.display = (matchSearch && matchType) ? '' : 'none';
  });
}

function showAddSuppressionModal() {
  var overlay = document.createElement('div');
  overlay.className = 'admin-modal-overlay';
  overlay.id = 'suppression-modal';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  overlay.innerHTML = '<div class="admin-modal" style="max-width:400px">' +
    '<h3 style="margin:0 0 16px;font-size:15px;color:var(--text)">Add Manual Suppression</h3>' +
    '<label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">Email address</label>' +
    '<input type="email" id="supp-add-email" placeholder="user@example.com" ' +
      'style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px;margin-bottom:12px;box-sizing:border-box">' +
    '<label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:4px">Reason</label>' +
    '<input type="text" id="supp-add-reason" placeholder="e.g. User requested removal" ' +
      'style="width:100%;padding:8px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px;margin-bottom:16px;box-sizing:border-box">' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
      '<button onclick="document.getElementById(\'suppression-modal\').remove()" ' +
        'style="padding:8px 16px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:12px;cursor:pointer">Cancel</button>' +
      '<button onclick="submitAddSuppression()" ' +
        'style="padding:8px 16px;border-radius:6px;border:none;background:var(--accent);color:#fff;font-size:12px;cursor:pointer">Add Suppression</button>' +
    '</div></div>';

  document.body.appendChild(overlay);
  document.getElementById('supp-add-email')?.focus();
}

async function submitAddSuppression() {
  var email = (document.getElementById('supp-add-email')?.value || '').trim().toLowerCase();
  var reason = (document.getElementById('supp-add-reason')?.value || '').trim() || 'Manual suppression via admin';

  if (!email || !email.includes('@')) {
    toastError('Please enter a valid email address');
    return;
  }

  try {
    var { error } = await sb.from('notification_suppressions').upsert({
      email: email,
      type: 'manual',
      reason: reason,
      updated_at: new Date().toISOString(),
      expires_at: null
    }, { onConflict: 'email,type' });

    if (error) throw error;

    document.getElementById('suppression-modal')?.remove();
    toastSuccess('Suppression added for ' + email);
    renderSuppressionSection();
  } catch (e) {
    toastError('Failed to add suppression: ' + e.message);
  }
}

async function removeSuppression(id, email) {
  if (!confirm('Remove suppression for ' + email + '? They will start receiving emails again.')) return;

  try {
    var { error } = await sb.from('notification_suppressions').delete().eq('id', id);
    if (error) throw error;
    toastSuccess('Suppression removed for ' + email);
    renderSuppressionSection();
  } catch (e) {
    toastError('Failed to remove: ' + e.message);
  }
}

async function exportSuppressions() {
  try {
    var { data, error } = await sb
      .from('notification_suppressions')
      .select('email,type,reason,bounce_count,expires_at,created_at,updated_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    if (!data || data.length === 0) {
      toastError('No suppressions to export');
      return;
    }

    var csv = 'email,type,reason,bounce_count,expires_at,created_at,updated_at\n';
    data.forEach(function(s) {
      csv += '"' + (s.email || '') + '",' +
        '"' + (s.type || '') + '",' +
        '"' + (s.reason || '').replace(/"/g, '""') + '",' +
        (s.bounce_count || 0) + ',' +
        '"' + (s.expires_at || '') + '",' +
        '"' + (s.created_at || '') + '",' +
        '"' + (s.updated_at || '') + '"\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'suppressions-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    toastSuccess('Exported ' + data.length + ' suppressions');
  } catch (e) {
    toastError('Export failed: ' + e.message);
  }
}

function relativeTime(date) {
  var diff = date - new Date();
  var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Tomorrow';
  if (days < 30) return days + 'd';
  return Math.floor(days / 30) + 'mo';
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// MODAL STYLES (injected once)
// ═══════════════════════════════════════════════════════════
(function injectNotifStyles() {
  if (document.getElementById('admin-notif-styles')) return;
  var style = document.createElement('style');
  style.id = 'admin-notif-styles';
  style.textContent = '.admin-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}' +
    '.admin-modal{background:var(--bg-card);border-radius:12px;padding:24px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);border:1px solid var(--border)}' +
    '.admin-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.3px}' +
    '.admin-badge-green{background:rgba(34,197,94,0.15);color:#22c55e}' +
    '.admin-badge-amber{background:rgba(245,158,11,0.15);color:#f59e0b}' +
    '.admin-badge-red{background:rgba(239,68,68,0.15);color:#ef4444}' +
    '.admin-badge-blue{background:rgba(59,130,246,0.15);color:#3b82f6}' +
    '.admin-toggle{position:relative;display:inline-block;width:32px;height:18px}' +
    '.admin-toggle input{opacity:0;width:0;height:0}' +
    '.admin-toggle-slider{position:absolute;cursor:pointer;inset:0;background:var(--border);border-radius:18px;transition:.2s}' +
    '.admin-toggle-slider:before{content:"";position:absolute;height:14px;width:14px;left:2px;bottom:2px;background:#fff;border-radius:50%;transition:.2s}' +
    '.admin-toggle input:checked+.admin-toggle-slider{background:var(--accent)}' +
    '.admin-toggle input:checked+.admin-toggle-slider:before{transform:translateX(14px)}' +
    '.admin-toggle input:disabled+.admin-toggle-slider{opacity:0.5;cursor:not-allowed}' +
    '.admin-loading{padding:24px;text-align:center;color:var(--text-dim);font-size:13px}' +
    '.admin-red{padding:12px;color:#ef4444;font-size:13px}';
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════
// CARD 8: NOTIFICATION ANALYTICS DASHBOARD (Phase 69 Session 3)
// ═══════════════════════════════════════════════════════════
// Admin tab: send volume, delivery rate, open rate, click rate,
// bounce rate, SMS delivery rate — powered by notification_log data
// from Resend webhooks (Cards 1+2) and Vonage DLRs (Card 6).

async function loadNotifAnalyticsTab() {
  var container = document.getElementById('admin-panel-notif-analytics');
  if (!container) return;
  container.innerHTML = '<div class="admin-loading">Loading notification analytics…</div>';

  try {
    // Fetch notification_log data for the past 30 days
    var since = new Date();
    since.setDate(since.getDate() - 30);
    var sinceISO = since.toISOString();

    var { data: logs, error } = await sb
      .from('notification_log')
      .select('id, notification_type, channel, status, classification, send_decision, send_reason, created_at, sms_delivered_at, sms_failed_at')
      .gte('created_at', sinceISO)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;
    if (!logs || logs.length === 0) {
      container.innerHTML = '<div style="padding:24px;color:var(--text-dim);font-size:13px;text-align:center">No notification data in the past 30 days. Send some notifications first.</div>';
      return;
    }

    // ── Aggregate stats ──
    var emailLogs = logs.filter(function(l) { return l.channel === 'email'; });
    var smsLogs = logs.filter(function(l) { return l.channel === 'sms'; });

    var emailSent = emailLogs.filter(function(l) { return l.send_decision === 'sent'; });
    var emailBlocked = emailLogs.filter(function(l) { return l.send_decision === 'blocked'; });
    var emailDelivered = emailLogs.filter(function(l) { return l.status === 'delivered' || l.status === 'opened' || l.status === 'clicked'; });
    var emailOpened = emailLogs.filter(function(l) { return l.status === 'opened' || l.status === 'clicked'; });
    var emailClicked = emailLogs.filter(function(l) { return l.status === 'clicked'; });
    var emailBounced = emailLogs.filter(function(l) { return l.status === 'bounced' || l.status === 'failed'; });

    var smsSent = smsLogs.filter(function(l) { return l.send_decision === 'sent'; });
    var smsDelivered = smsLogs.filter(function(l) { return l.sms_delivered_at !== null; });
    var smsFailed = smsLogs.filter(function(l) { return l.sms_failed_at !== null; });

    function pct(num, denom) {
      if (!denom || denom === 0) return '—';
      return (num / denom * 100).toFixed(1) + '%';
    }

    // ── Daily volume for chart ──
    var dailyVolume = {};
    var dailyOpen = {};
    var dailyClick = {};
    var dailySms = {};
    logs.forEach(function(l) {
      var day = l.created_at.slice(0, 10);
      if (!dailyVolume[day]) { dailyVolume[day] = 0; dailyOpen[day] = 0; dailyClick[day] = 0; dailySms[day] = 0; }
      if (l.channel === 'email' && l.send_decision === 'sent') dailyVolume[day]++;
      if (l.status === 'opened' || l.status === 'clicked') dailyOpen[day]++;
      if (l.status === 'clicked') dailyClick[day]++;
      if (l.channel === 'sms' && l.send_decision === 'sent') dailySms[day]++;
    });

    var days = Object.keys(dailyVolume).sort();
    var maxVol = Math.max.apply(null, days.map(function(d) { return dailyVolume[d]; }).concat([1]));

    // ── Block reason breakdown ──
    var blockReasons = {};
    emailBlocked.forEach(function(l) {
      var reason = l.send_reason || 'unknown';
      blockReasons[reason] = (blockReasons[reason] || 0) + 1;
    });

    // ── Type breakdown ──
    var typeBreakdown = {};
    emailSent.forEach(function(l) {
      var t = l.notification_type || 'unknown';
      typeBreakdown[t] = (typeBreakdown[t] || 0) + 1;
    });
    var topTypes = Object.entries(typeBreakdown).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 10);

    // ── Build HTML ──
    var html = '';

    // Period selector
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">' +
      '<span style="font-size:15px;font-weight:600;color:var(--text)">Notification Analytics</span>' +
      '<span style="font-size:12px;color:var(--text-faint)">Last 30 days · ' + logs.length + ' events</span>' +
    '</div>';

    // Stat cards row
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">';
    var cards = [
      { label: 'Emails Sent', value: emailSent.length, color: 'var(--accent)' },
      { label: 'Delivery Rate', value: pct(emailDelivered.length, emailSent.length), color: 'var(--green)' },
      { label: 'Open Rate', value: pct(emailOpened.length, emailSent.length), color: '#a78bfa' },
      { label: 'Click Rate', value: pct(emailClicked.length, emailSent.length), color: '#f59e0b' },
      { label: 'Bounce Rate', value: pct(emailBounced.length, emailSent.length), color: 'var(--red)' },
      { label: 'SMS Sent', value: smsSent.length, color: 'var(--accent)' },
      { label: 'SMS Delivery', value: pct(smsDelivered.length, smsSent.length), color: 'var(--green)' },
      { label: 'Blocked', value: emailBlocked.length, color: 'var(--text-faint)' }
    ];
    cards.forEach(function(c) {
      html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">' +
        '<div style="font-size:22px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + c.color + '">' + c.value + '</div>' +
        '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">' + c.label + '</div>' +
      '</div>';
    });
    html += '</div>';

    // Daily volume chart (CSS bar chart — no external lib needed)
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Daily Send Volume (Email)</div>' +
      '<div style="display:flex;align-items:flex-end;gap:2px;height:120px">';
    days.forEach(function(d) {
      var h = Math.max(4, Math.round(dailyVolume[d] / maxVol * 110));
      var title = d + ': ' + dailyVolume[d] + ' emails';
      html += '<div title="' + title + '" style="flex:1;height:' + h + 'px;background:var(--accent);border-radius:3px 3px 0 0;min-width:4px;opacity:0.85;transition:opacity 0.2s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.85"></div>';
    });
    html += '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--text-faint);font-family:JetBrains Mono,monospace">' +
        '<span>' + (days[0] || '') + '</span><span>' + (days[days.length - 1] || '') + '</span>' +
      '</div>' +
    '</div>';

    // SMS volume chart
    if (smsSent.length > 0) {
      var maxSms = Math.max.apply(null, days.map(function(d) { return dailySms[d] || 0; }).concat([1]));
      html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">' +
        '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Daily Send Volume (SMS)</div>' +
        '<div style="display:flex;align-items:flex-end;gap:2px;height:80px">';
      days.forEach(function(d) {
        var sv = dailySms[d] || 0;
        var h = sv === 0 ? 0 : Math.max(4, Math.round(sv / maxSms * 70));
        var title = d + ': ' + sv + ' SMS';
        html += '<div title="' + title + '" style="flex:1;height:' + h + 'px;background:#22c55e;border-radius:3px 3px 0 0;min-width:4px;opacity:0.85;transition:opacity 0.2s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=0.85"></div>';
      });
      html += '</div>' +
        '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--text-faint);font-family:JetBrains Mono,monospace">' +
          '<span>' + (days[0] || '') + '</span><span>' + (days[days.length - 1] || '') + '</span>' +
        '</div>' +
      '</div>';
    }

    // Two-column: Top types + Block reasons
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';

    // Top notification types
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Top Notification Types</div>';
    if (topTypes.length > 0) {
      var topMax = topTypes[0][1];
      topTypes.forEach(function(entry) {
        var barW = Math.max(8, Math.round(entry[1] / topMax * 100));
        html += '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:var(--text);font-family:JetBrains Mono,monospace">' + entry[0] + '</span>' +
            '<span style="color:var(--text-dim)">' + entry[1] + '</span>' +
          '</div>' +
          '<div style="height:6px;background:var(--bg-card);border-radius:3px;overflow:hidden">' +
            '<div style="width:' + barW + '%;height:100%;background:var(--accent);border-radius:3px"></div>' +
          '</div>' +
        '</div>';
      });
    } else {
      html += '<div style="color:var(--text-faint);font-size:12px">No data</div>';
    }
    html += '</div>';

    // Block reasons
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Block Reasons</div>';
    var blockEntries = Object.entries(blockReasons).sort(function(a, b) { return b[1] - a[1]; });
    if (blockEntries.length > 0) {
      var blockMax = blockEntries[0][1];
      blockEntries.forEach(function(entry) {
        var barW = Math.max(8, Math.round(entry[1] / blockMax * 100));
        html += '<div style="margin-bottom:6px">' +
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">' +
            '<span style="color:var(--text);font-family:JetBrains Mono,monospace">' + entry[0] + '</span>' +
            '<span style="color:var(--text-dim)">' + entry[1] + '</span>' +
          '</div>' +
          '<div style="height:6px;background:var(--bg-card);border-radius:3px;overflow:hidden">' +
            '<div style="width:' + barW + '%;height:100%;background:#ef4444;border-radius:3px"></div>' +
          '</div>' +
        '</div>';
      });
    } else {
      html += '<div style="color:var(--text-faint);font-size:12px">No blocked notifications</div>';
    }
    html += '</div></div>';

    // Classification breakdown
    var classBreakdown = {};
    logs.forEach(function(l) {
      var c = l.classification || 'unknown';
      classBreakdown[c] = (classBreakdown[c] || 0) + 1;
    });
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">' +
      '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Classification Breakdown</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">';
    var classColors = { product: 'var(--accent)', required_transactional: 'var(--green)', configurable_transactional: '#f59e0b', marketing: '#a78bfa', unknown: 'var(--text-faint)' };
    Object.entries(classBreakdown).sort(function(a, b) { return b[1] - a[1]; }).forEach(function(entry) {
      var color = classColors[entry[0]] || 'var(--text-dim)';
      html += '<div style="text-align:center">' +
        '<div style="font-size:20px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + color + '">' + entry[1] + '</div>' +
        '<div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.3px">' + entry[0].replace(/_/g, ' ') + '</div>' +
      '</div>';
    });
    html += '</div></div>';

    container.innerHTML = html;
    console.log('[Admin] Notification analytics loaded: ' + logs.length + ' events');

  } catch (e) {
    console.error('[Admin] Notification analytics error:', e);
    container.innerHTML = '<div class="admin-red">Failed to load analytics: ' + (e.message || e) + '</div>';
  }
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE PREVIEW + TEST SEND (Card 9 — Phase 69 Session 4)
// ═══════════════════════════════════════════════════════════

function refreshTemplatePreview() {
  var iframe = document.getElementById('te-preview-iframe');
  var empty = document.getElementById('te-preview-empty');
  var channel = document.getElementById('te-channel').value;

  if (channel === 'sms') {
    // SMS preview — show text in a phone mockup
    var smsBody = document.getElementById('te-sms').value || '';
    iframe.srcdoc = '<html><body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#e5e5ea;display:flex;justify-content:center;align-items:flex-start;min-height:100%">' +
      '<div style="max-width:280px;background:#fff;border-radius:18px;padding:12px 16px;margin-top:20px;box-shadow:0 1px 3px rgba(0,0,0,0.12);font-size:14px;line-height:1.5;color:#1a1a1a">' +
      smsBody.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>') +
      '<div style="font-size:10px;color:#8e8e93;margin-top:6px;text-align:right">Preview</div>' +
      '</div></body></html>';
    if (empty) empty.style.display = 'none';
    return;
  }

  if (channel === 'in_app') {
    var title = document.getElementById('te-inapp-title').value || '';
    var body = document.getElementById('te-inapp-body').value || '';
    var icon = document.getElementById('te-inapp-icon').value || '🔔';
    iframe.srcdoc = '<html><body style="margin:0;padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0f1117">' +
      '<div style="max-width:360px;background:#181a20;border:1px solid #2a2d35;border-radius:14px;padding:16px;display:flex;gap:12px;align-items:flex-start">' +
      '<span style="font-size:24px">' + icon + '</span>' +
      '<div><div style="font-size:14px;font-weight:600;color:#f0f1f3;margin-bottom:4px">' + title.replace(/</g, '&lt;') + '</div>' +
      '<div style="font-size:13px;color:#94a3b8;line-height:1.4">' + body.replace(/</g, '&lt;').replace(/\n/g, '<br>') + '</div></div>' +
      '</div></body></html>';
    if (empty) empty.style.display = 'none';
    return;
  }

  // Email preview — render HTML in iframe
  var htmlContent = document.getElementById('te-html').value || '';
  if (!htmlContent.trim()) {
    if (empty) empty.style.display = 'flex';
    iframe.srcdoc = '';
    return;
  }

  // Replace template variables with sample data
  var preview = htmlContent
    .replace(/\{\{user\.first_name\}\}/g, 'Alex')
    .replace(/\{\{user\.email\}\}/g, 'alex@example.com')
    .replace(/\{\{company_name\}\}/g, 'Acme Corp')
    .replace(/\{\{job_title\}\}/g, 'Senior Engineer')
    .replace(/\{\{score\}\}/g, '87')
    .replace(/\{\{dashboard_url\}\}/g, 'https://brilliantjobs.app/dashboard.html')
    .replace(/\{\{unsubscribe_url\}\}/g, '#')
    .replace(/\{\{[^}]+\}\}/g, '[sample]');

  iframe.srcdoc = preview;
  if (empty) empty.style.display = 'none';
}

async function testSendTemplate() {
  var btn = document.getElementById('te-test-send-btn');
  var status = document.getElementById('te-test-send-status');
  var channel = document.getElementById('te-channel').value;
  var notifType = document.getElementById('te-type').value;
  var subject = document.getElementById('te-subject').value || 'Test: ' + notifType;
  var html = document.getElementById('te-html').value || '';
  var smsBody = document.getElementById('te-sms').value || '';

  if (channel === 'email' && !html.trim()) {
    status.textContent = 'No HTML body to send.';
    status.style.color = '#ef4444';
    return;
  }
  if (channel === 'sms' && !smsBody.trim()) {
    status.textContent = 'No SMS body to send.';
    status.style.color = '#ef4444';
    return;
  }

  // Get current admin user
  var user = null;
  try { user = (await sb.auth.getUser()).data.user; } catch(e) { if (typeof reportError === 'function') reportError('admin-notif', e); }
  if (!user) {
    status.textContent = 'Not logged in.';
    status.style.color = '#ef4444';
    return;
  }

  btn.disabled = true;
  btn.textContent = '⏳ Sending…';
  status.textContent = '';

  try {
    // Replace template variables with real user data for test
    var testSubject = '[TEST] ' + subject
      .replace(/\{\{user\.first_name\}\}/g, user.email.split('@')[0])
      .replace(/\{\{[^}]+\}\}/g, '[test]');

    var testHtml = html
      .replace(/\{\{user\.first_name\}\}/g, user.email.split('@')[0])
      .replace(/\{\{user\.email\}\}/g, user.email)
      .replace(/\{\{company_name\}\}/g, 'Test Company')
      .replace(/\{\{job_title\}\}/g, 'Test Position')
      .replace(/\{\{score\}\}/g, '85')
      .replace(/\{\{dashboard_url\}\}/g, 'https://brilliantjobs.app/dashboard.html')
      .replace(/\{\{[^}]+\}\}/g, '[test]');

    var payload = {
      user_id: user.id,
      notification_type: notifType,
      subject: testSubject,
      html: testHtml,
      text: 'Test notification from template editor',
      force_channel: channel === 'sms' ? 'sms' : 'email',
      idempotency_key: 'test-send-' + Date.now()
    };

    if (channel === 'sms') {
      payload.sms_text = smsBody
        .replace(/\{\{[^}]+\}\}/g, '[test]');
    }

    var res = await fetch(
      (window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/send-notification',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (window._bjServiceKey || window._bjAnonKey || '')
        },
        body: JSON.stringify(payload)
      }
    );

    var result = await res.json();
    if (result.email_sent || result.sms_sent) {
      status.textContent = '✓ Test sent to ' + user.email + (result.sms_sent ? ' (SMS)' : ' (email)');
      status.style.color = '#22c55e';
    } else {
      status.textContent = '✗ Send blocked: ' + (result.decision_reason || result.error || 'unknown');
      status.style.color = '#ef4444';
    }
  } catch (e) {
    status.textContent = '✗ Error: ' + (e.message || e);
    status.style.color = '#ef4444';
  } finally {
    btn.disabled = false;
    btn.textContent = '✉ Test Send';
  }
}

// ═══════════════════════════════════════════════════════════
// WEB PUSH SUBSCRIPTION MANAGEMENT (Card 7 — Phase 69 Session 4)
// ═══════════════════════════════════════════════════════════

async function initPushToggle() {
  var toggle = document.getElementById('notify-push');
  if (!toggle) return;

  // Check if push is supported
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toggle.disabled = true;
    toggle.parentElement.title = 'Push notifications not supported in this browser';
    return;
  }

  // Check current subscription status
  try {
    var reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      var sub = await reg.pushManager.getSubscription();
      toggle.checked = !!sub;
    }
  } catch (e) {
    console.warn('[Push] Init check failed:', e);
  }

  toggle.addEventListener('change', async function() {
    if (toggle.checked) {
      await subscribeToPush();
    } else {
      await unsubscribeFromPush();
    }
  });
}

async function subscribeToPush() {
  var toggle = document.getElementById('notify-push');
  try {
    // Register service worker
    var reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Get VAPID public key from push-subscribe endpoint
    var keyRes = await fetch(
      (window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/push-subscribe'
    );
    var keyData = await keyRes.json();
    if (!keyData.vapid_public_key) throw new Error('No VAPID key');

    // Convert VAPID key to Uint8Array
    var vapidKey = urlBase64ToUint8Array(keyData.vapid_public_key);

    // Subscribe to push
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey
    });

    // Send subscription to server
    var session = await sb.auth.getSession();
    var token = session.data.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    var saveRes = await fetch(
      (window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/push-subscribe',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ subscription: sub.toJSON() })
      }
    );

    var saveData = await saveRes.json();
    if (saveData.ok) {
      console.log('[Push] Subscribed successfully');
      if (typeof toastSuccess === 'function') toastSuccess('Push notifications enabled');
    } else {
      throw new Error(saveData.error || 'Failed to save subscription');
    }
  } catch (e) {
    console.error('[Push] Subscribe failed:', e);
    if (toggle) toggle.checked = false;
    if (e.name === 'NotAllowedError') {
      if (typeof toastError === 'function') toastError('Push notifications blocked by browser. Check site permissions.');
    } else {
      if (typeof toastError === 'function') toastError('Failed to enable push: ' + (e.message || e));
    }
  }
}

async function unsubscribeFromPush() {
  try {
    var reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      var sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();

        // Tell server
        var session = await sb.auth.getSession();
        var token = session.data.session?.access_token;
        if (token) {
          await fetch(
            (window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/push-subscribe',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
              },
              body: JSON.stringify({ action: 'unsubscribe', endpoint: sub.endpoint })
            }
          );
        }
      }
    }
    console.log('[Push] Unsubscribed');
    if (typeof toastSuccess === 'function') toastSuccess('Push notifications disabled');
  } catch (e) {
    console.error('[Push] Unsubscribe error:', e);
  }
}

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Initialize push toggle when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPushToggle);
} else {
  initPushToggle();
}

// ═══════════════════════════════════════════════════════════
// EMAIL COHORT ANALYTICS TAB
// Phase 69 Card 11 — Zero-based cohort email performance
// ═══════════════════════════════════════════════════════════

var _emailCohortState = {
  cohorts: [],
  logs: [],
  selectedCohort: null,
  selectedCampaign: null,
  compareCohort: null,
  view: 'overview' // 'overview' | 'campaign' | 'compare'
};

async function loadEmailCohortsTab() {
  var container = document.getElementById('admin-panel-email-cohorts');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px">Loading email cohort analytics…</div>';

  try {
    // Fetch cohorts
    var { data: cohorts, error: cErr } = await sb
      .from('cohorts')
      .select('id, name, description, criteria_type, criteria_value, is_active')
      .order('created_at', { ascending: true });
    if (cErr) throw cErr;

    // Fetch email notification_log with cohort data (last 90 days for broader window)
    var since = new Date();
    since.setDate(since.getDate() - 90);
    var { data: logs, error: lErr } = await sb
      .from('notification_log')
      .select('notification_type, channel, status, user_cohort, created_at, delivered_at, opened_at, clicked_at, user_id')
      .eq('channel', 'email')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000);
    if (lErr) throw lErr;

    _emailCohortState.cohorts = cohorts || [];
    _emailCohortState.logs = logs || [];

    // Default to first cohort
    if (cohorts && cohorts.length > 0) {
      _emailCohortState.selectedCohort = cohorts[0].id;
    }

    renderEmailCohortsTab(container);
    console.log('[Admin] Email cohort analytics loaded: ' + (logs || []).length + ' email events, ' + (cohorts || []).length + ' cohorts');

  } catch (e) {
    console.error('[Admin] Email cohort analytics error:', e);
    container.innerHTML = '<div style="padding:24px;color:#ef4444;font-size:13px">Failed to load: ' + (e.message || e) + '</div>';
  }
}

function renderEmailCohortsTab(container) {
  var state = _emailCohortState;
  var html = '';

  // ── Header with cohort selector ──
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">';
  html += '<span style="font-size:15px;font-weight:600;color:var(--text)">Email Cohort Analytics</span>';
  html += '<div style="display:flex;gap:6px;align-items:center">';

  // View mode pills
  var views = [
    { id: 'overview', label: 'Overview' },
    { id: 'campaign', label: 'Campaign Drilldown' },
    { id: 'compare', label: 'Compare Cohorts' }
  ];
  views.forEach(function(v) {
    var active = state.view === v.id;
    html += '<button onclick="switchEmailCohortView(\'' + v.id + '\')" style="font-size:11px;padding:4px 10px;border-radius:12px;cursor:pointer;border:1px solid ' +
      (active ? 'var(--accent)' : 'var(--border)') + ';background:' +
      (active ? 'var(--accent)' : 'transparent') + ';color:' +
      (active ? '#fff' : 'var(--text-dim)') + ';font-family:JetBrains Mono,monospace;transition:all 0.15s">' + v.label + '</button>';
  });
  html += '</div></div>';

  // ── Cohort selector row ──
  html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px;flex-wrap:wrap">';
  html += '<label style="font-size:12px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Cohort:</label>';
  html += '<select id="ec-cohort-select" onchange="selectEmailCohort(this.value)" style="font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-family:JetBrains Mono,monospace">';
  // Add 'All' option
  html += '<option value="__all__"' + (state.selectedCohort === '__all__' ? ' selected' : '') + '>All (no filter)</option>';
  state.cohorts.forEach(function(c) {
    html += '<option value="' + c.id + '"' + (state.selectedCohort === c.id ? ' selected' : '') + '>' + c.name + ' (' + c.id + ')</option>';
  });
  // Null cohort
  html += '<option value="__none__"' + (state.selectedCohort === '__none__' ? ' selected' : '') + '>Unassigned (null)</option>';
  html += '</select>';

  // Show cohort member count
  var cohortLogs = filterLogsByCohort(state.logs, state.selectedCohort);
  var uniqueUsers = new Set(cohortLogs.map(function(l) { return l.user_id; }));
  html += '<span style="font-size:11px;color:var(--text-faint)">' + cohortLogs.length + ' emails · ' + uniqueUsers.size + ' users · last 90 days</span>';

  if (state.view === 'compare') {
    html += '<label style="font-size:12px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;margin-left:16px">vs:</label>';
    html += '<select id="ec-compare-select" onchange="selectCompareCohort(this.value)" style="font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-family:JetBrains Mono,monospace">';
    html += '<option value="">Select cohort…</option>';
    state.cohorts.forEach(function(c) {
      if (c.id !== state.selectedCohort) {
        html += '<option value="' + c.id + '"' + (state.compareCohort === c.id ? ' selected' : '') + '>' + c.name + '</option>';
      }
    });
    html += '<option value="__none__"' + (state.compareCohort === '__none__' ? ' selected' : '') + '>Unassigned (null)</option>';
    html += '</select>';
  }
  html += '</div>';

  // ── Render active view ──
  if (state.view === 'overview') {
    html += renderCohortOverview(cohortLogs);
  } else if (state.view === 'campaign') {
    html += renderCampaignDrilldown(cohortLogs);
  } else if (state.view === 'compare') {
    var compareLogs = state.compareCohort ? filterLogsByCohort(state.logs, state.compareCohort) : [];
    html += renderCohortCompare(cohortLogs, compareLogs);
  }

  container.innerHTML = html;
}

function filterLogsByCohort(logs, cohortId) {
  if (!cohortId || cohortId === '__all__') return logs;
  if (cohortId === '__none__') return logs.filter(function(l) { return !l.user_cohort; });
  return logs.filter(function(l) { return l.user_cohort === cohortId; });
}

// ═══════════════════════════════════════════════════════════
// VIEW 1: OVERVIEW — Aggregate performance per campaign
// ═══════════════════════════════════════════════════════════

function renderCohortOverview(logs) {
  if (!logs || logs.length === 0) {
    return '<div style="padding:40px;text-align:center;color:var(--text-faint);font-size:13px">No email data for this cohort in the last 90 days.</div>';
  }

  // Aggregate by notification_type (campaign)
  var campaigns = {};
  logs.forEach(function(l) {
    var t = l.notification_type || 'unknown';
    if (!campaigns[t]) {
      campaigns[t] = { sent: 0, delivered: 0, opened: 0, clicked: 0, users: new Set() };
    }
    campaigns[t].sent++;
    campaigns[t].users.add(l.user_id);
    if (l.delivered_at || l.status === 'delivered' || l.status === 'opened' || l.status === 'clicked') campaigns[t].delivered++;
    if (l.opened_at || l.status === 'opened' || l.status === 'clicked') campaigns[t].opened++;
    if (l.clicked_at || l.status === 'clicked') campaigns[t].clicked++;
  });

  // Totals
  var totalSent = logs.length;
  var totalDelivered = logs.filter(function(l) { return l.delivered_at || l.status === 'delivered' || l.status === 'opened' || l.status === 'clicked'; }).length;
  var totalOpened = logs.filter(function(l) { return l.opened_at || l.status === 'opened' || l.status === 'clicked'; }).length;
  var totalClicked = logs.filter(function(l) { return l.clicked_at || l.status === 'clicked'; }).length;

  function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) + '%' : '—'; }

  var html = '';

  // Stat cards
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">';
  var cards = [
    { label: 'Total Sent', value: totalSent, color: 'var(--accent)' },
    { label: 'Delivered', value: pct(totalDelivered, totalSent), color: 'var(--green)' },
    { label: 'Open Rate', value: pct(totalOpened, totalSent), color: '#a78bfa' },
    { label: 'Click Rate', value: pct(totalClicked, totalSent), color: '#f59e0b' },
    { label: 'Campaigns', value: Object.keys(campaigns).length, color: 'var(--text)' }
  ];
  cards.forEach(function(c) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">' +
      '<div style="font-size:22px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + c.color + '">' + c.value + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">' + c.label + '</div>' +
    '</div>';
  });
  html += '</div>';

  // Campaign table
  var sorted = Object.entries(campaigns).sort(function(a, b) { return b[1].sent - a[1].sent; });

  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Campaign Performance</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:JetBrains Mono,monospace">';
  html += '<thead><tr style="border-bottom:2px solid var(--border)">';
  html += '<th style="text-align:left;padding:6px 10px;color:var(--text-dim)">Campaign</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Sent</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Users</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Delivered</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Opened</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Clicked</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Open Rate</th>';
  html += '<th style="text-align:right;padding:6px 10px;color:var(--text-dim)">Click Rate</th>';
  html += '<th style="text-align:center;padding:6px 10px;color:var(--text-dim)"></th>';
  html += '</tr></thead><tbody>';

  sorted.forEach(function(entry) {
    var name = entry[0];
    var c = entry[1];
    html += '<tr style="border-bottom:1px solid var(--border)">';
    html += '<td style="padding:6px 10px;color:var(--text)">' + name + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:var(--text)">' + c.sent + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:var(--text-dim)">' + c.users.size + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:var(--green)">' + pct(c.delivered, c.sent) + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:#a78bfa">' + pct(c.opened, c.sent) + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:#f59e0b">' + pct(c.clicked, c.sent) + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:#a78bfa;font-weight:600">' + pct(c.opened, c.sent) + '</td>';
    html += '<td style="text-align:right;padding:6px 10px;color:#f59e0b;font-weight:600">' + pct(c.clicked, c.sent) + '</td>';
    html += '<td style="text-align:center;padding:6px 10px"><button onclick="drillIntoCampaign(\'' + name + '\')" style="font-size:10px;padding:2px 8px;border-radius:4px;border:1px solid var(--border);background:transparent;color:var(--accent);cursor:pointer;font-family:JetBrains Mono,monospace">Drilldown →</button></td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';

  return html;
}

// ═══════════════════════════════════════════════════════════
// VIEW 2: CAMPAIGN DRILLDOWN — Zero-based day curve
// ═══════════════════════════════════════════════════════════

function renderCampaignDrilldown(logs) {
  var state = _emailCohortState;

  // Campaign selector
  var campaignTypes = {};
  logs.forEach(function(l) {
    var t = l.notification_type || 'unknown';
    campaignTypes[t] = (campaignTypes[t] || 0) + 1;
  });
  var sortedCampaigns = Object.entries(campaignTypes).sort(function(a, b) { return b[1] - a[1]; });

  if (!state.selectedCampaign && sortedCampaigns.length > 0) {
    state.selectedCampaign = sortedCampaigns[0][0];
  }

  var html = '';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">';
  html += '<label style="font-size:12px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Campaign:</label>';
  html += '<select id="ec-campaign-select" onchange="selectEmailCampaign(this.value)" style="font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-family:JetBrains Mono,monospace">';
  sortedCampaigns.forEach(function(entry) {
    html += '<option value="' + entry[0] + '"' + (state.selectedCampaign === entry[0] ? ' selected' : '') + '>' + entry[0] + ' (' + entry[1] + ')</option>';
  });
  html += '</select></div>';

  if (!state.selectedCampaign || !campaignTypes[state.selectedCampaign]) {
    return html + '<div style="padding:40px;text-align:center;color:var(--text-faint);font-size:13px">Select a campaign to see zero-based performance.</div>';
  }

  // Filter logs for this campaign
  var campaignLogs = logs.filter(function(l) { return l.notification_type === state.selectedCampaign; });

  // Build zero-based day data
  var dayData = buildZeroBasedDays(campaignLogs, 30);

  // Render the table and chart
  html += renderZeroBasedTable(dayData, campaignLogs.length);
  html += renderZeroBasedChart(dayData, 'var(--accent)', '#a78bfa', '#f59e0b');

  return html;
}

function buildZeroBasedDays(campaignLogs, maxDays) {
  // For each log entry, Day 0 = date(created_at)
  // Then check if opened_at / clicked_at / delivered_at fell on Day N relative to created_at
  var now = new Date();
  var days = [];

  for (var d = 0; d <= maxDays; d++) {
    days.push({ day: d, delivered: 0, opened: 0, clicked: 0 });
  }

  campaignLogs.forEach(function(l) {
    var sendDate = new Date(l.created_at);

    // Delivered
    if (l.delivered_at || l.status === 'delivered' || l.status === 'opened' || l.status === 'clicked') {
      var deliveredDate = l.delivered_at ? new Date(l.delivered_at) : sendDate;
      var dDay = Math.floor((deliveredDate - sendDate) / 86400000);
      // Cumulative: mark all days from dDay onward
      for (var i = Math.max(0, dDay); i <= maxDays; i++) {
        days[i].delivered++;
      }
    }

    // Opened
    if (l.opened_at || l.status === 'opened' || l.status === 'clicked') {
      var openDate = l.opened_at ? new Date(l.opened_at) : sendDate;
      var oDay = Math.floor((openDate - sendDate) / 86400000);
      for (var i = Math.max(0, oDay); i <= maxDays; i++) {
        days[i].opened++;
      }
    }

    // Clicked
    if (l.clicked_at || l.status === 'clicked') {
      var clickDate = l.clicked_at ? new Date(l.clicked_at) : sendDate;
      var cDay = Math.floor((clickDate - sendDate) / 86400000);
      for (var i = Math.max(0, cDay); i <= maxDays; i++) {
        days[i].clicked++;
      }
    }
  });

  return days;
}

function renderZeroBasedTable(dayData, totalSent) {
  function pct(n) { return totalSent > 0 ? (n / totalSent * 100).toFixed(1) + '%' : '—'; }

  var html = '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;overflow-x:auto">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Zero-Based Cumulative Performance · ' + totalSent + ' emails sent</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:JetBrains Mono,monospace">';
  html += '<thead><tr style="border-bottom:2px solid var(--border)">';
  html += '<th style="text-align:left;padding:6px 8px;color:var(--text-dim);width:60px">Day</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:var(--green)">Delivered</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:var(--green)">Del %</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:#a78bfa">Opened</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:#a78bfa">Open %</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:#f59e0b">Clicked</th>';
  html += '<th style="text-align:right;padding:6px 8px;color:#f59e0b">Click %</th>';
  html += '</tr></thead><tbody>';

  // Show Day 0, 1, 2, 3, 5, 7, 14, 21, 30 (key milestones)
  var showDays = [0, 1, 2, 3, 5, 7, 14, 21, 30];
  showDays.forEach(function(d) {
    if (d >= dayData.length) return;
    var row = dayData[d];
    var bg = d === 0 ? 'background:color-mix(in srgb, var(--accent) 5%, transparent);' : '';
    html += '<tr style="border-bottom:1px solid var(--border);' + bg + '">';
    html += '<td style="padding:6px 8px;color:var(--text);font-weight:' + (d === 0 ? '600' : '400') + '">Day ' + d + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--text)">' + row.delivered + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--green)">' + pct(row.delivered) + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--text)">' + row.opened + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:#a78bfa">' + pct(row.opened) + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:var(--text)">' + row.clicked + '</td>';
    html += '<td style="text-align:right;padding:6px 8px;color:#f59e0b">' + pct(row.clicked) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

function renderZeroBasedChart(dayData, deliveredColor, openColor, clickColor) {
  // Simple CSS bar chart showing cumulative open and click rates over days
  var maxVal = Math.max.apply(null, dayData.map(function(d) { return d.opened; }).concat([1]));

  var html = '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Cumulative Open / Click Curve</div>';
  html += '<div style="display:flex;gap:16px;font-size:10px;color:var(--text-faint);margin-bottom:12px">';
  html += '<span><span style="display:inline-block;width:10px;height:10px;background:#a78bfa;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Opens</span>';
  html += '<span><span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;margin-right:4px;vertical-align:middle"></span>Clicks</span>';
  html += '</div>';
  html += '<div style="display:flex;align-items:flex-end;gap:1px;height:140px">';

  dayData.forEach(function(d, idx) {
    var openH = maxVal > 0 ? Math.max(0, Math.round(d.opened / maxVal * 130)) : 0;
    var clickH = maxVal > 0 ? Math.max(0, Math.round(d.clicked / maxVal * 130)) : 0;
    var title = 'Day ' + d.day + ': ' + d.opened + ' opens, ' + d.clicked + ' clicks';
    html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;min-width:3px" title="' + title + '">';
    html += '<div style="width:100%;height:' + openH + 'px;background:#a78bfa;border-radius:2px 2px 0 0;opacity:0.7"></div>';
    if (clickH > 0) {
      html += '<div style="width:100%;height:' + clickH + 'px;background:#f59e0b;border-radius:0;opacity:0.85;margin-top:-' + clickH + 'px;position:relative"></div>';
    }
    html += '</div>';
  });

  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--text-faint);font-family:JetBrains Mono,monospace">';
  html += '<span>Day 0</span><span>Day 7</span><span>Day 14</span><span>Day 21</span><span>Day 30</span>';
  html += '</div></div>';

  return html;
}

// ═══════════════════════════════════════════════════════════
// VIEW 3: COMPARE — Same campaign, two cohorts side-by-side
// ═══════════════════════════════════════════════════════════

function renderCohortCompare(logsA, logsB) {
  var state = _emailCohortState;

  // Campaign selector (from cohort A)
  var campaignTypes = {};
  logsA.forEach(function(l) {
    var t = l.notification_type || 'unknown';
    campaignTypes[t] = (campaignTypes[t] || 0) + 1;
  });
  var sortedCampaigns = Object.entries(campaignTypes).sort(function(a, b) { return b[1] - a[1]; });

  if (!state.selectedCampaign && sortedCampaigns.length > 0) {
    state.selectedCampaign = sortedCampaigns[0][0];
  }

  var html = '';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap">';
  html += '<label style="font-size:12px;color:var(--text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Campaign:</label>';
  html += '<select id="ec-compare-campaign" onchange="selectEmailCampaign(this.value)" style="font-size:13px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-family:JetBrains Mono,monospace">';
  sortedCampaigns.forEach(function(entry) {
    html += '<option value="' + entry[0] + '"' + (state.selectedCampaign === entry[0] ? ' selected' : '') + '>' + entry[0] + ' (' + entry[1] + ')</option>';
  });
  html += '</select></div>';

  if (!state.selectedCampaign) {
    return html + '<div style="padding:40px;text-align:center;color:var(--text-faint);font-size:13px">Select a campaign to compare.</div>';
  }

  if (!state.compareCohort) {
    return html + '<div style="padding:40px;text-align:center;color:var(--text-faint);font-size:13px">Select a second cohort above to compare.</div>';
  }

  var campaignLogsA = logsA.filter(function(l) { return l.notification_type === state.selectedCampaign; });
  var campaignLogsB = logsB.filter(function(l) { return l.notification_type === state.selectedCampaign; });

  var daysA = buildZeroBasedDays(campaignLogsA, 30);
  var daysB = buildZeroBasedDays(campaignLogsB, 30);

  // Find cohort names
  var nameA = getCohortName(state.selectedCohort);
  var nameB = getCohortName(state.compareCohort);

  // Side-by-side summary cards
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';
  html += renderComparisonSummaryCard(nameA, campaignLogsA, daysA, 'var(--accent)');
  html += renderComparisonSummaryCard(nameB, campaignLogsB, daysB, '#22c55e');
  html += '</div>';

  // Combined comparison table
  html += renderComparisonTable(daysA, daysB, campaignLogsA.length, campaignLogsB.length, nameA, nameB);

  return html;
}

function getCohortName(cohortId) {
  if (cohortId === '__all__') return 'All';
  if (cohortId === '__none__') return 'Unassigned';
  var match = _emailCohortState.cohorts.find(function(c) { return c.id === cohortId; });
  return match ? match.name : cohortId;
}

function renderComparisonSummaryCard(name, logs, dayData, color) {
  var sent = logs.length;
  var day7 = dayData[7] || { delivered: 0, opened: 0, clicked: 0 };
  var day30 = dayData[30] || dayData[dayData.length - 1] || { delivered: 0, opened: 0, clicked: 0 };
  function pct(n) { return sent > 0 ? (n / sent * 100).toFixed(1) + '%' : '—'; }

  var html = '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;border-top:3px solid ' + color + '">';
  html += '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px">' + name + '</div>';
  html += '<div style="font-size:12px;font-family:JetBrains Mono,monospace;color:var(--text-dim);display:grid;grid-template-columns:1fr 1fr;gap:6px">';
  html += '<div>Sent: <span style="color:var(--text);font-weight:600">' + sent + '</span></div>';
  html += '<div>Day 7 Open: <span style="color:#a78bfa;font-weight:600">' + pct(day7.opened) + '</span></div>';
  html += '<div>Day 30 Open: <span style="color:#a78bfa;font-weight:600">' + pct(day30.opened) + '</span></div>';
  html += '<div>Day 30 Click: <span style="color:#f59e0b;font-weight:600">' + pct(day30.clicked) + '</span></div>';
  html += '</div></div>';
  return html;
}

function renderComparisonTable(daysA, daysB, sentA, sentB, nameA, nameB) {
  function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) + '%' : '—'; }
  function delta(a, b, da, db) {
    if (da === 0 || db === 0) return '';
    var rateA = a / da * 100;
    var rateB = b / db * 100;
    var diff = rateA - rateB;
    var color = diff > 0 ? 'var(--green)' : diff < 0 ? '#ef4444' : 'var(--text-faint)';
    var sign = diff > 0 ? '+' : '';
    return '<span style="color:' + color + ';font-weight:600">' + sign + diff.toFixed(1) + 'pp</span>';
  }

  var html = '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;overflow-x:auto">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Side-by-Side · ' + nameA + ' vs ' + nameB + '</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:JetBrains Mono,monospace">';
  html += '<thead><tr style="border-bottom:2px solid var(--border)">';
  html += '<th style="text-align:left;padding:5px 6px;color:var(--text-dim)">Day</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:var(--accent)" colspan="2">' + nameA + ' Open</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:#22c55e" colspan="2">' + nameB + ' Open</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:var(--text-dim)">Δ Open</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:var(--accent)">' + nameA + ' Click</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:#22c55e">' + nameB + ' Click</th>';
  html += '<th style="text-align:right;padding:5px 6px;color:var(--text-dim)">Δ Click</th>';
  html += '</tr></thead><tbody>';

  var showDays = [0, 1, 2, 3, 5, 7, 14, 21, 30];
  showDays.forEach(function(d) {
    var a = daysA[d] || { delivered: 0, opened: 0, clicked: 0 };
    var b = daysB[d] || { delivered: 0, opened: 0, clicked: 0 };
    html += '<tr style="border-bottom:1px solid var(--border)">';
    html += '<td style="padding:5px 6px;color:var(--text);font-weight:600">Day ' + d + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:var(--text)">' + a.opened + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:var(--accent)">' + pct(a.opened, sentA) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:var(--text)">' + b.opened + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:#22c55e">' + pct(b.opened, sentB) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px">' + delta(a.opened, b.opened, sentA, sentB) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:var(--accent)">' + pct(a.clicked, sentA) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px;color:#22c55e">' + pct(b.clicked, sentB) + '</td>';
    html += '<td style="text-align:right;padding:5px 6px">' + delta(a.clicked, b.clicked, sentA, sentB) + '</td>';
    html += '</tr>';
  });

  html += '</tbody></table></div>';
  return html;
}

// ═══════════════════════════════════════════════════════════
// UI EVENT HANDLERS
// ═══════════════════════════════════════════════════════════

function switchEmailCohortView(view) {
  _emailCohortState.view = view;
  var container = document.getElementById('admin-panel-email-cohorts');
  if (container) renderEmailCohortsTab(container);
}

function selectEmailCohort(cohortId) {
  _emailCohortState.selectedCohort = cohortId;
  _emailCohortState.selectedCampaign = null; // reset campaign on cohort change
  var container = document.getElementById('admin-panel-email-cohorts');
  if (container) renderEmailCohortsTab(container);
}

function selectCompareCohort(cohortId) {
  _emailCohortState.compareCohort = cohortId || null;
  var container = document.getElementById('admin-panel-email-cohorts');
  if (container) renderEmailCohortsTab(container);
}

function selectEmailCampaign(campaign) {
  _emailCohortState.selectedCampaign = campaign;
  var container = document.getElementById('admin-panel-email-cohorts');
  if (container) renderEmailCohortsTab(container);
}

function drillIntoCampaign(campaign) {
  _emailCohortState.selectedCampaign = campaign;
  _emailCohortState.view = 'campaign';
  var container = document.getElementById('admin-panel-email-cohorts');
  if (container) renderEmailCohortsTab(container);
}

// ═══════════════════════════════════════════════════════════
// CADENCE OPTIMIZATION (Phase 69 Card 10)
// Analyzes open/click rates by send hour, day of week, frequency.
// Computes re-engagement tier win-back rates.
// Surfaces recommendations and allows auto-adjust of thresholds.
// ═══════════════════════════════════════════════════════════

var _cadenceState = {
  settings: null,
  analysis: null,
  loaded: false
};

async function loadCadenceTab() {
  var container = document.getElementById('admin-panel-cadence');
  if (!container) return;
  container.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px">Analyzing notification cadence…</div>';

  try {
    // Fetch cadence_settings
    var { data: settings, error: sErr } = await sb
      .from('cadence_settings')
      .select('*')
      .eq('id', 'global')
      .single();
    if (sErr) throw sErr;

    // Fetch notification_log for analysis (90 days, email only, with engagement data)
    var since = new Date();
    since.setDate(since.getDate() - 90);
    var { data: logs, error: lErr } = await sb
      .from('notification_log')
      .select('notification_type, status, created_at, delivered_at, opened_at, clicked_at, user_id, user_cohort, send_decision')
      .eq('channel', 'email')
      .eq('send_decision', 'sent')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(10000);
    if (lErr) throw lErr;

    // Fetch re-engagement logs specifically
    var { data: reengageLogs, error: rErr } = await sb
      .from('notification_log')
      .select('notification_type, status, opened_at, clicked_at, user_id, created_at')
      .eq('channel', 'email')
      .in('notification_type', ['reengagement_14d', 'reengagement_30d', 'reengagement_60d', 'inactive_reengagement'])
      .gte('created_at', since.toISOString())
      .limit(5000);

    // Fetch last_seen data for re-engagement analysis
    var { data: profiles, error: pErr } = await sb
      .from('profiles')
      .select('id, last_seen_at')
      .not('last_seen_at', 'is', null)
      .limit(5000);

    _cadenceState.settings = settings;
    _cadenceState.analysis = runCadenceAnalysis(logs || [], reengageLogs || [], profiles || []);
    _cadenceState.loaded = true;

    renderCadenceTab(container);
    console.log('[Admin] Cadence optimization loaded: ' + (logs || []).length + ' email events analyzed');

  } catch (e) {
    console.error('[Admin] Cadence optimization error:', e);
    container.innerHTML = '<div style="padding:24px;color:#ef4444;font-size:13px">Failed to load: ' + (e.message || e) + '</div>';
  }
}

// ── Core analysis engine ──

function runCadenceAnalysis(logs, reengageLogs, profiles) {
  var analysis = {
    byHour: {},      // hour -> { sent, opened, clicked }
    byDow: {},       // dow -> { sent, opened, clicked }
    byType: {},      // type -> { sent, opened, clicked, frequency_per_week }
    reengagement: {  // tier -> { sent, opened (=winback) }
      tier1: { sent: 0, opened: 0 },
      tier2: { sent: 0, opened: 0 },
      tier3: { sent: 0, opened: 0 }
    },
    totalSent: logs.length,
    totalOpened: 0,
    totalClicked: 0,
    dateRange: { start: null, end: null },
    topHours: [],
    topDows: [],
    recommendations: []
  };

  if (logs.length === 0) return analysis;

  // Date range
  var dates = logs.map(function(l) { return new Date(l.created_at); });
  analysis.dateRange.start = new Date(Math.min.apply(null, dates));
  analysis.dateRange.end = new Date(Math.max.apply(null, dates));
  var weeksSpan = Math.max(1, (analysis.dateRange.end - analysis.dateRange.start) / (7 * 86400000));

  // Initialize hours and days
  for (var h = 0; h < 24; h++) analysis.byHour[h] = { sent: 0, opened: 0, clicked: 0 };
  for (var d = 0; d < 7; d++) analysis.byDow[d] = { sent: 0, opened: 0, clicked: 0 };

  // Analyze each log
  logs.forEach(function(l) {
    var dt = new Date(l.created_at);
    var hour = dt.getUTCHours();
    var dow = dt.getUTCDay();
    var type = l.notification_type || 'unknown';
    var wasOpened = !!(l.opened_at || l.status === 'opened' || l.status === 'clicked');
    var wasClicked = !!(l.clicked_at || l.status === 'clicked');

    // By hour
    analysis.byHour[hour].sent++;
    if (wasOpened) analysis.byHour[hour].opened++;
    if (wasClicked) analysis.byHour[hour].clicked++;

    // By day of week
    analysis.byDow[dow].sent++;
    if (wasOpened) analysis.byDow[dow].opened++;
    if (wasClicked) analysis.byDow[dow].clicked++;

    // By type
    if (!analysis.byType[type]) analysis.byType[type] = { sent: 0, opened: 0, clicked: 0 };
    analysis.byType[type].sent++;
    if (wasOpened) analysis.byType[type].opened++;
    if (wasClicked) analysis.byType[type].clicked++;

    if (wasOpened) analysis.totalOpened++;
    if (wasClicked) analysis.totalClicked++;
  });

  // Compute frequency per week for each type
  Object.keys(analysis.byType).forEach(function(t) {
    analysis.byType[t].frequency_per_week = +(analysis.byType[t].sent / weeksSpan).toFixed(1);
  });

  // Re-engagement analysis
  (reengageLogs || []).forEach(function(l) {
    var tier = null;
    if (l.notification_type === 'reengagement_14d') tier = 'tier1';
    else if (l.notification_type === 'reengagement_30d') tier = 'tier2';
    else if (l.notification_type === 'reengagement_60d') tier = 'tier3';
    else if (l.notification_type === 'inactive_reengagement') tier = 'tier2'; // default bucket
    if (tier) {
      analysis.reengagement[tier].sent++;
      if (l.opened_at || l.status === 'opened' || l.status === 'clicked') {
        analysis.reengagement[tier].opened++;
      }
    }
  });

  // Rank hours by open rate (minimum 5 sends to be statistically relevant)
  analysis.topHours = Object.entries(analysis.byHour)
    .filter(function(e) { return e[1].sent >= 5; })
    .map(function(e) { return { hour: parseInt(e[0]), rate: e[1].opened / e[1].sent, sent: e[1].sent }; })
    .sort(function(a, b) { return b.rate - a.rate; })
    .slice(0, 5);

  // Rank days by open rate
  var dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  analysis.topDows = Object.entries(analysis.byDow)
    .filter(function(e) { return e[1].sent >= 3; })
    .map(function(e) { return { dow: parseInt(e[0]), name: dowNames[parseInt(e[0])], rate: e[1].opened / e[1].sent, sent: e[1].sent }; })
    .sort(function(a, b) { return b.rate - a.rate; });

  // Generate recommendations
  if (analysis.topHours.length >= 2) {
    var bestH = analysis.topHours[0];
    var worstH = analysis.topHours[analysis.topHours.length - 1];
    if (bestH.rate > worstH.rate * 1.3) {
      analysis.recommendations.push({
        type: 'send_time',
        text: 'Best open rate at ' + bestH.hour + ':00 UTC (' + (bestH.rate * 100).toFixed(1) + '%) vs ' + worstH.hour + ':00 UTC (' + (worstH.rate * 100).toFixed(1) + '%). Shift sends toward ' + bestH.hour + ':00.',
        impact: 'high'
      });
    }
  }

  if (analysis.topDows.length >= 2) {
    var bestD = analysis.topDows[0];
    var worstD = analysis.topDows[analysis.topDows.length - 1];
    if (bestD.rate > worstD.rate * 1.2) {
      analysis.recommendations.push({
        type: 'send_day',
        text: bestD.name + ' has highest open rate (' + (bestD.rate * 100).toFixed(1) + '%). ' + worstD.name + ' is lowest (' + (worstD.rate * 100).toFixed(1) + '%). Prioritize ' + bestD.name + '-' + analysis.topDows[Math.min(1, analysis.topDows.length - 1)].name + ' for non-urgent emails.',
        impact: 'medium'
      });
    }
  }

  // Check over-frequency types
  Object.entries(analysis.byType).forEach(function(e) {
    if (e[1].frequency_per_week > 5 && e[1].opened / e[1].sent < 0.1) {
      analysis.recommendations.push({
        type: 'frequency',
        text: e[0] + ' sends ' + e[1].frequency_per_week + 'x/week but only ' + (e[1].opened / e[1].sent * 100).toFixed(1) + '% open rate. Consider reducing frequency.',
        impact: 'high'
      });
    }
  });

  // Re-engagement threshold recommendations
  ['tier1', 'tier2', 'tier3'].forEach(function(tier) {
    var data = analysis.reengagement[tier];
    if (data.sent >= 10) {
      var rate = data.opened / data.sent;
      if (rate < 0.05) {
        var label = tier === 'tier1' ? '14-day' : tier === 'tier2' ? '30-day' : '60-day';
        analysis.recommendations.push({
          type: 'reengagement',
          text: label + ' re-engagement has only ' + (rate * 100).toFixed(1) + '% win-back rate (' + data.sent + ' sent). Consider shortening the threshold or changing the template.',
          impact: 'medium'
        });
      }
    }
  });

  if (analysis.totalSent < 100) {
    analysis.recommendations.unshift({
      type: 'data',
      text: 'Only ' + analysis.totalSent + ' emails analyzed. Recommendations improve with 500+ emails. Current insights are directional only.',
      impact: 'low'
    });
  }

  return analysis;
}

// ── Render ──

function renderCadenceTab(container) {
  var s = _cadenceState.settings;
  var a = _cadenceState.analysis;
  if (!s || !a) return;

  var html = '';

  // Header
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">';
  html += '<span style="font-size:15px;font-weight:600;color:var(--text)">Cadence Optimization</span>';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<span style="font-size:11px;color:var(--text-faint)">' + a.totalSent + ' emails · ' + (a.dateRange.start ? a.dateRange.start.toLocaleDateString() : '?') + ' – ' + (a.dateRange.end ? a.dateRange.end.toLocaleDateString() : '?') + '</span>';
  html += '<button onclick="rerunCadenceAnalysis()" style="font-size:11px;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--accent);cursor:pointer;font-family:JetBrains Mono,monospace">Re-analyze</button>';
  html += '</div></div>';

  // ── Stat cards ──
  function pct(n, d) { return d > 0 ? (n / d * 100).toFixed(1) + '%' : '—'; }

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px">';
  var cards = [
    { label: 'Emails Analyzed', value: a.totalSent, color: 'var(--accent)' },
    { label: 'Overall Open Rate', value: pct(a.totalOpened, a.totalSent), color: '#a78bfa' },
    { label: 'Overall Click Rate', value: pct(a.totalClicked, a.totalSent), color: '#f59e0b' },
    { label: 'Best Hour (UTC)', value: a.topHours.length > 0 ? a.topHours[0].hour + ':00' : '—', color: 'var(--green)' },
    { label: 'Best Day', value: a.topDows.length > 0 ? a.topDows[0].name : '—', color: 'var(--green)' }
  ];
  cards.forEach(function(c) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:14px;text-align:center">' +
      '<div style="font-size:22px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + c.color + '">' + c.value + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:4px;text-transform:uppercase;letter-spacing:0.5px">' + c.label + '</div>' +
    '</div>';
  });
  html += '</div>';

  // ── Recommendations ──
  if (a.recommendations.length > 0) {
    html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">';
    html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Recommendations</div>';
    a.recommendations.forEach(function(r) {
      var impactColor = r.impact === 'high' ? '#ef4444' : r.impact === 'medium' ? '#f59e0b' : 'var(--text-faint)';
      var impactBg = r.impact === 'high' ? 'color-mix(in srgb, #ef4444 10%, transparent)' : r.impact === 'medium' ? 'color-mix(in srgb, #f59e0b 10%, transparent)' : 'var(--bg-card)';
      html += '<div style="padding:8px 12px;border-radius:6px;margin-bottom:6px;background:' + impactBg + ';border-left:3px solid ' + impactColor + '">';
      html += '<span style="font-size:10px;font-weight:600;text-transform:uppercase;color:' + impactColor + ';letter-spacing:0.5px">' + r.impact + ' · ' + r.type + '</span>';
      html += '<div style="font-size:12px;color:var(--text);margin-top:4px;font-family:JetBrains Mono,monospace">' + r.text + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  // ── Two-column: Send Hour Heatmap + Day of Week ──
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">';

  // Hour of day chart
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Open Rate by Hour (UTC)</div>';
  var maxHourRate = Math.max.apply(null, Object.values(a.byHour).map(function(h) { return h.sent > 0 ? h.opened / h.sent : 0; }).concat([0.01]));
  html += '<div style="display:flex;align-items:flex-end;gap:1px;height:100px">';
  for (var h = 0; h < 24; h++) {
    var hd = a.byHour[h];
    var rate = hd.sent > 0 ? hd.opened / hd.sent : 0;
    var barH = Math.max(0, Math.round(rate / maxHourRate * 90));
    var isBest = a.topHours.length > 0 && a.topHours[0].hour === h;
    var color = isBest ? 'var(--green)' : rate > maxHourRate * 0.7 ? '#a78bfa' : 'var(--accent)';
    var opacity = hd.sent < 3 ? '0.3' : '0.7';
    html += '<div title="' + h + ':00 UTC — ' + (rate * 100).toFixed(1) + '% open (' + hd.sent + ' sent)" style="flex:1;height:' + barH + 'px;background:' + color + ';border-radius:2px 2px 0 0;min-width:3px;opacity:' + opacity + ';transition:opacity 0.2s" onmouseenter="this.style.opacity=1" onmouseleave="this.style.opacity=' + opacity + '"></div>';
  }
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:9px;color:var(--text-faint);font-family:JetBrains Mono,monospace"><span>0:00</span><span>6:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>';
  html += '</div>';

  // Day of week chart
  var dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var maxDowRate = Math.max.apply(null, Object.values(a.byDow).map(function(d) { return d.sent > 0 ? d.opened / d.sent : 0; }).concat([0.01]));
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Open Rate by Day of Week</div>';
  for (var d = 0; d < 7; d++) {
    var dd = a.byDow[d];
    var rate = dd.sent > 0 ? dd.opened / dd.sent : 0;
    var barW = Math.max(0, Math.round(rate / maxDowRate * 100));
    var isBest = a.topDows.length > 0 && a.topDows[0].dow === d;
    var color = isBest ? 'var(--green)' : '#a78bfa';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">';
    html += '<span style="width:30px;font-size:11px;color:var(--text-dim);font-family:JetBrains Mono,monospace;text-align:right">' + dowNames[d] + '</span>';
    html += '<div style="flex:1;height:16px;background:var(--bg-card);border-radius:4px;overflow:hidden">';
    html += '<div style="width:' + barW + '%;height:100%;background:' + color + ';border-radius:4px;opacity:0.8"></div>';
    html += '</div>';
    html += '<span style="width:45px;font-size:10px;color:var(--text-dim);font-family:JetBrains Mono,monospace;text-align:right">' + (rate * 100).toFixed(1) + '%</span>';
    html += '<span style="width:30px;font-size:10px;color:var(--text-faint);font-family:JetBrains Mono,monospace;text-align:right">n=' + dd.sent + '</span>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>'; // end grid

  // ── Per-type frequency table ──
  var sortedTypes = Object.entries(a.byType).sort(function(a, b) { return b[1].sent - a[1].sent; });
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;overflow-x:auto">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Per-Campaign Frequency & Performance</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:JetBrains Mono,monospace">';
  html += '<thead><tr style="border-bottom:2px solid var(--border)">';
  html += '<th style="text-align:left;padding:5px 8px;color:var(--text-dim)">Campaign</th>';
  html += '<th style="text-align:right;padding:5px 8px;color:var(--text-dim)">Sent</th>';
  html += '<th style="text-align:right;padding:5px 8px;color:var(--text-dim)">Per Week</th>';
  html += '<th style="text-align:right;padding:5px 8px;color:var(--text-dim)">Open %</th>';
  html += '<th style="text-align:right;padding:5px 8px;color:var(--text-dim)">Click %</th>';
  html += '<th style="text-align:left;padding:5px 8px;color:var(--text-dim)">Signal</th>';
  html += '</tr></thead><tbody>';

  sortedTypes.forEach(function(entry) {
    var name = entry[0];
    var t = entry[1];
    var openRate = t.sent > 0 ? t.opened / t.sent : 0;
    var clickRate = t.sent > 0 ? t.clicked / t.sent : 0;
    var signal = '';
    if (t.frequency_per_week > 5 && openRate < 0.1) signal = '<span style="color:#ef4444">⚠ Over-sending</span>';
    else if (openRate > 0.3) signal = '<span style="color:var(--green)">✓ Strong</span>';
    else if (openRate > 0.15) signal = '<span style="color:#f59e0b">○ OK</span>';
    else if (t.sent >= 10) signal = '<span style="color:var(--text-faint)">△ Low engagement</span>';

    html += '<tr style="border-bottom:1px solid var(--border)">';
    html += '<td style="padding:5px 8px;color:var(--text)">' + name + '</td>';
    html += '<td style="text-align:right;padding:5px 8px;color:var(--text)">' + t.sent + '</td>';
    html += '<td style="text-align:right;padding:5px 8px;color:var(--text)">' + t.frequency_per_week + '</td>';
    html += '<td style="text-align:right;padding:5px 8px;color:#a78bfa">' + (openRate * 100).toFixed(1) + '%</td>';
    html += '<td style="text-align:right;padding:5px 8px;color:#f59e0b">' + (clickRate * 100).toFixed(1) + '%</td>';
    html += '<td style="padding:5px 8px;font-size:10px">' + signal + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // ── Re-engagement thresholds ──
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px">Re-engagement Thresholds</div>';
  html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-dim);cursor:pointer">';
  html += '<input type="checkbox" id="cadence-auto-adjust" ' + (s.auto_adjust_enabled ? 'checked' : '') + ' onchange="toggleCadenceAutoAdjust(this.checked)" style="accent-color:var(--accent)">';
  html += 'Auto-adjust from data</label>';
  html += '</div>';

  var tiers = [
    { key: 'tier1', label: 'Tier 1', days: s.reengagement_tier1_days, data: a.reengagement.tier1, type: 'reengagement_14d' },
    { key: 'tier2', label: 'Tier 2', days: s.reengagement_tier2_days, data: a.reengagement.tier2, type: 'reengagement_30d' },
    { key: 'tier3', label: 'Tier 3', days: s.reengagement_tier3_days, data: a.reengagement.tier3, type: 'reengagement_60d' }
  ];

  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">';
  tiers.forEach(function(tier) {
    var winback = tier.data.sent > 0 ? (tier.data.opened / tier.data.sent * 100).toFixed(1) : '—';
    var winbackColor = tier.data.sent > 0 ? (tier.data.opened / tier.data.sent > 0.1 ? 'var(--green)' : tier.data.opened / tier.data.sent > 0.05 ? '#f59e0b' : '#ef4444') : 'var(--text-faint)';
    html += '<div style="background:var(--bg-card);border-radius:8px;padding:12px;text-align:center">';
    html += '<div style="font-size:12px;font-weight:600;color:var(--text)">' + tier.label + '</div>';
    html += '<div style="font-size:11px;color:var(--text-dim);margin:4px 0">';
    html += '<input type="number" id="cadence-' + tier.key + '-days" value="' + tier.days + '" min="1" max="365" style="width:50px;text-align:center;font-size:13px;font-family:JetBrains Mono,monospace;border:1px solid var(--border);border-radius:4px;background:var(--bg-input);color:var(--text);padding:2px"> days inactive</div>';
    html += '<div style="font-size:11px;color:var(--text-faint);margin-top:4px">Sends: ' + tier.data.sent + '</div>';
    html += '<div style="font-size:16px;font-weight:700;font-family:JetBrains Mono,monospace;color:' + winbackColor + ';margin-top:4px">' + winback + (winback !== '—' ? '%' : '') + '</div>';
    html += '<div style="font-size:10px;color:var(--text-faint);text-transform:uppercase">Win-back Rate</div>';
    html += '</div>';
  });
  html += '</div>';

  // Save button
  html += '<div style="margin-top:12px;text-align:right">';
  html += '<button onclick="saveCadenceSettings()" style="font-size:12px;padding:6px 16px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;font-family:JetBrains Mono,monospace">Save Thresholds</button>';
  html += '</div>';
  html += '</div>';

  // ── Current settings summary ──
  html += '<div style="background:var(--bg-input);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Current Optimized Settings</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;font-family:JetBrains Mono,monospace">';
  html += '<div style="color:var(--text-dim)">Best send hours (UTC):</div><div style="color:var(--text)">' + s.best_send_hour_1 + ':00, ' + s.best_send_hour_2 + ':00, ' + s.best_send_hour_3 + ':00</div>';
  html += '<div style="color:var(--text-dim)">Best send days:</div><div style="color:var(--text)">' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.best_send_dow_1] + ', ' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.best_send_dow_2] + ', ' + ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.best_send_dow_3] + '</div>';
  html += '<div style="color:var(--text-dim)">Sample size:</div><div style="color:var(--text)">' + s.analysis_sample_size + ' emails</div>';
  html += '<div style="color:var(--text-dim)">Last analyzed:</div><div style="color:var(--text)">' + (s.last_analyzed_at ? new Date(s.last_analyzed_at).toLocaleString() : 'Never') + '</div>';
  html += '<div style="color:var(--text-dim)">Auto-adjust:</div><div style="color:' + (s.auto_adjust_enabled ? 'var(--green)' : 'var(--text-faint)') + '">' + (s.auto_adjust_enabled ? 'Enabled' : 'Disabled') + '</div>';
  html += '</div>';

  // Apply analysis button
  html += '<div style="margin-top:12px;text-align:right">';
  html += '<button onclick="applyCadenceAnalysis()" style="font-size:12px;padding:6px 16px;border-radius:6px;border:1px solid var(--accent);background:transparent;color:var(--accent);cursor:pointer;font-family:JetBrains Mono,monospace">Apply Analysis → Settings</button>';
  html += '</div>';
  html += '</div>';

  container.innerHTML = html;
}

// ── Event handlers ──

async function saveCadenceSettings() {
  try {
    var tier1 = parseInt(document.getElementById('cadence-tier1-days').value) || 14;
    var tier2 = parseInt(document.getElementById('cadence-tier2-days').value) || 30;
    var tier3 = parseInt(document.getElementById('cadence-tier3-days').value) || 60;

    var { error } = await sb
      .from('cadence_settings')
      .update({
        reengagement_tier1_days: tier1,
        reengagement_tier2_days: tier2,
        reengagement_tier3_days: tier3,
        updated_at: new Date().toISOString()
      })
      .eq('id', 'global');

    if (error) throw error;
    _cadenceState.settings.reengagement_tier1_days = tier1;
    _cadenceState.settings.reengagement_tier2_days = tier2;
    _cadenceState.settings.reengagement_tier3_days = tier3;
    if (typeof toastSuccess === 'function') toastSuccess('Thresholds saved');
  } catch (e) {
    console.error('[Cadence] Save error:', e);
    if (typeof toastError === 'function') toastError('Save failed: ' + (e.message || e));
  }
}

async function toggleCadenceAutoAdjust(enabled) {
  try {
    var { error } = await sb
      .from('cadence_settings')
      .update({ auto_adjust_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('id', 'global');
    if (error) throw error;
    _cadenceState.settings.auto_adjust_enabled = enabled;
  } catch (e) {
    console.error('[Cadence] Toggle error:', e);
  }
}

async function applyCadenceAnalysis() {
  var a = _cadenceState.analysis;
  if (!a || a.totalSent === 0) return;

  var updates = {
    analysis_sample_size: a.totalSent,
    analysis_window_days: 90,
    last_analyzed_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Apply best hours
  if (a.topHours.length >= 1) updates.best_send_hour_1 = a.topHours[0].hour;
  if (a.topHours.length >= 2) updates.best_send_hour_2 = a.topHours[1].hour;
  if (a.topHours.length >= 3) updates.best_send_hour_3 = a.topHours[2].hour;

  // Apply best days
  if (a.topDows.length >= 1) updates.best_send_dow_1 = a.topDows[0].dow;
  if (a.topDows.length >= 2) updates.best_send_dow_2 = a.topDows[1].dow;
  if (a.topDows.length >= 3) updates.best_send_dow_3 = a.topDows[2].dow;

  // Apply win-back rates
  if (a.reengagement.tier1.sent > 0) updates.tier1_winback_rate = +(a.reengagement.tier1.opened / a.reengagement.tier1.sent).toFixed(4);
  if (a.reengagement.tier2.sent > 0) updates.tier2_winback_rate = +(a.reengagement.tier2.opened / a.reengagement.tier2.sent).toFixed(4);
  if (a.reengagement.tier3.sent > 0) updates.tier3_winback_rate = +(a.reengagement.tier3.opened / a.reengagement.tier3.sent).toFixed(4);

  // Per-type frequency
  var freqMap = {};
  Object.entries(a.byType).forEach(function(e) {
    freqMap[e[0]] = { per_week: e[1].frequency_per_week, open_rate: +(e[1].opened / Math.max(1, e[1].sent)).toFixed(4) };
  });
  updates.optimal_frequency = freqMap;

  try {
    var { error } = await sb.from('cadence_settings').update(updates).eq('id', 'global');
    if (error) throw error;
    Object.assign(_cadenceState.settings, updates);
    var container = document.getElementById('admin-panel-cadence');
    if (container) renderCadenceTab(container);
    if (typeof toastSuccess === 'function') toastSuccess('Analysis applied to settings');
  } catch (e) {
    console.error('[Cadence] Apply error:', e);
    if (typeof toastError === 'function') toastError('Apply failed: ' + (e.message || e));
  }
}

async function rerunCadenceAnalysis() {
  _cadenceState.loaded = false;
  await loadCadenceTab();
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATION LOG VIEWER (S5 — v6.88)
// Paginated viewer of notification_log with search + filters
// ═══════════════════════════════════════════════════════════

var _notifLogState = {
  search: '',
  status: '',
  channel: '',
  type: '',
  offset: 0,
  limit: 50,
  total: 0
};

async function loadNotifLogTab() {
  _notifLogState.offset = 0;
  await _renderNotifLog();
}

async function _renderNotifLog() {
  var container = document.getElementById('admin-panel-notif-log');
  if (!container) return;

  var isFirst = _notifLogState.offset === 0;
  if (isFirst) {
    container.innerHTML = '<div class="admin-loading">Loading notification log…</div>';
  }

  try {
    var result = await sb.rpc('get_admin_notification_log', {
      p_search:  _notifLogState.search  || null,
      p_status:  _notifLogState.status  || null,
      p_channel: _notifLogState.channel || null,
      p_type:    _notifLogState.type    || null,
      p_offset:  _notifLogState.offset,
      p_limit:   _notifLogState.limit
    });
    if (result.error) throw result.error;
    var d = result.data || {};
    var rows = d.rows || [];
    _notifLogState.total = d.total || 0;

    var statusOptions = ['', 'sent', 'delivered', 'opened', 'clicked', 'failed', 'bounced', 'complained'];
    var channelOptions = ['', 'email', 'sms'];

    // Action bar
    var html = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">';
    html += '<input type="text" id="notif-log-search" placeholder="Search type / company / subject…" value="' + _escHtml(_notifLogState.search) + '" oninput="notifLogFilter()" style="flex:1;min-width:200px;padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px;font-family:var(--mono)">';
    html += '<select id="notif-log-status" onchange="notifLogFilter()" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px">';
    statusOptions.forEach(function(s) {
      html += '<option value="' + s + '"' + (_notifLogState.status === s ? ' selected' : '') + '>' + (s || 'All Statuses') + '</option>';
    });
    html += '</select>';
    html += '<select id="notif-log-channel" onchange="notifLogFilter()" style="padding:7px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);font-size:13px">';
    channelOptions.forEach(function(ch) {
      html += '<option value="' + ch + '"' + (_notifLogState.channel === ch ? ' selected' : '') + '>' + (ch || 'All Channels') + '</option>';
    });
    html += '</select>';
    html += '<span style="font-size:12px;color:var(--text-dim);font-family:var(--mono);white-space:nowrap">' + _notifLogState.total.toLocaleString() + ' rows</span>';
    html += '</div>';

    // Table
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--mono)">';
    html += '<thead><tr style="border-bottom:2px solid var(--border);text-align:left">';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Time</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Type</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Channel</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Status</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">User</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Company</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Subject</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Plan</th>';
    html += '<th style="padding:6px 8px;color:var(--text-dim)">Decision</th>';
    html += '</tr></thead><tbody id="notif-log-body">';

    rows.forEach(function(r) {
      var statusColor = r.status === 'delivered' || r.status === 'opened' || r.status === 'clicked' ? '#22c55e'
        : r.status === 'failed' || r.status === 'bounced' || r.status === 'complained' ? '#ef4444'
        : r.status === 'sent' ? '#a78bfa' : 'var(--text-dim)';
      var dt = r.created_at ? new Date(r.created_at) : null;
      var dateStr = dt ? (dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})) : '—';
      var openDot = r.opened_at ? ' <span style="color:#22c55e" title="Opened">●</span>' : '';
      var clickDot = r.clicked_at ? ' <span style="color:#f59e0b" title="Clicked">●</span>' : '';

      html += '<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="toggleNotifLogDetail(this,\'' + r.id + '\')">';
      html += '<td style="padding:5px 8px;color:var(--text-faint);white-space:nowrap">' + dateStr + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text)">' + _escHtml(r.notification_type || '—') + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text-dim)">' + _escHtml(r.channel || '—') + '</td>';
      html += '<td style="padding:5px 8px;color:' + statusColor + ';font-weight:600">' + _escHtml(r.status || '—') + openDot + clickDot + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text-faint);font-size:10px">' + (r.user_id ? r.user_id.substring(0,8) + '…' : '—') + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text)">' + _escHtml(r.company_name || '—') + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text-dim);max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _escHtml(r.subject || '—') + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text-dim)">' + _escHtml(r.user_plan || '—') + '</td>';
      html += '<td style="padding:5px 8px;color:var(--text-dim)">' + _escHtml(r.send_decision || '—') + '</td>';
      html += '</tr>';
      // Detail row (hidden)
      html += '<tr id="notif-log-detail-' + r.id + '" style="display:none"><td colspan="9" style="padding:0 8px 12px 8px">';
      html += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:11px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">';
      var fields = [
        ['Classification', r.classification],['Send Reason', r.send_reason],['Template v', r.template_version],
        ['Message ID', r.message_id ? r.message_id.substring(0,24)+'…' : null],
        ['Cohort', r.user_cohort],['Job ID', r.job_id],
        ['Delivered', r.delivered_at ? new Date(r.delivered_at).toLocaleString() : null],
        ['Opened', r.opened_at ? new Date(r.opened_at).toLocaleString() : null],
        ['Clicked', r.clicked_at ? new Date(r.clicked_at).toLocaleString() : null],
        ['Bounced', r.bounced_at ? new Date(r.bounced_at).toLocaleString() + (r.bounce_type ? ' ('+r.bounce_type+')' : '') : null]
      ];
      fields.forEach(function(f) {
        if (!f[1]) return;
        html += '<div><span style="color:var(--text-faint)">' + f[0] + ':</span> <span style="color:var(--text)">' + _escHtml(String(f[1])) + '</span></div>';
      });
      html += '</div></td></tr>';
    });

    html += '</tbody></table></div>';

    // Pagination
    var hasMore = (_notifLogState.offset + rows.length) < _notifLogState.total;
    if (_notifLogState.offset > 0 || hasMore) {
      html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px">';
      html += '<span style="font-size:12px;color:var(--text-dim);font-family:var(--mono)">';
      html += (_notifLogState.offset + 1) + '–' + (_notifLogState.offset + rows.length) + ' of ' + _notifLogState.total.toLocaleString();
      html += '</span><div style="display:flex;gap:8px">';
      if (_notifLogState.offset > 0) {
        html += '<button onclick="notifLogPage(-1)" style="padding:5px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:12px;cursor:pointer;font-family:var(--mono)">← Prev</button>';
      }
      if (hasMore) {
        html += '<button onclick="notifLogPage(1)" style="padding:5px 14px;border-radius:6px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:12px;cursor:pointer;font-family:var(--mono)">Next →</button>';
      }
      html += '</div></div>';
    }

    container.innerHTML = html;

  } catch (e) {
    console.error('[Admin] Notif log error:', e);
    var container2 = document.getElementById('admin-panel-notif-log');
    if (container2) container2.innerHTML = '<div style="color:#ef4444;padding:16px">Failed to load notification log: ' + _escHtml(e.message || String(e)) + '</div>';
  }
}

function toggleNotifLogDetail(row, id) {
  var detail = document.getElementById('notif-log-detail-' + id);
  if (!detail) return;
  detail.style.display = detail.style.display === 'none' ? '' : 'none';
}

var _notifLogTimer = null;
function notifLogFilter() {
  clearTimeout(_notifLogTimer);
  _notifLogTimer = setTimeout(function() {
    _notifLogState.search  = (document.getElementById('notif-log-search')  || {}).value || '';
    _notifLogState.status  = (document.getElementById('notif-log-status')  || {}).value || '';
    _notifLogState.channel = (document.getElementById('notif-log-channel') || {}).value || '';
    _notifLogState.offset  = 0;
    _renderNotifLog();
  }, 300);
}

function notifLogPage(dir) {
  _notifLogState.offset = Math.max(0, _notifLogState.offset + (dir * _notifLogState.limit));
  _renderNotifLog();
}
