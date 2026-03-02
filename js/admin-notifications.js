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
