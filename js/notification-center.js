/* ───────────────────────────────────────────────────────────
   notification-center.js — Notification Center + Opt-In Modal
   Session 2+ of Notification System (Pod 2)
   v6.27
   
   Bridges user_notification_preferences + user_notification_state
   (Session 2 tables) with existing UI in panel-notifications
   AND standalone page-notifications.
   Adds opt-in modal for first-login-after-verification flow.
   v5.98: Required transactional lock icons + enforcement
   v5.99: Standalone Notification Center page support
   v6.27: Notification log wiring — load, filter, paginate, CSV export
   ─────────────────────────────────────────────────────────── */

// ═══════════════════════════════════════════════════════════
// NOTIFICATION TYPE CATALOG (79 types, 13 categories)
// Mirrors admin-notifications.js classification
// ═══════════════════════════════════════════════════════════
var NC_CATEGORIES = {
  onboarding:   { label: 'Onboarding', types: ['welcome','onboard_resume','onboard_filter','onboard_extension'] },
  integration:  { label: 'Integration Adoption', types: ['adopt_extension_reminder','adopt_gmail','adopt_calendar','adopt_drive','adopt_integration_combo','adopt_post_value_moment'] },
  extension:    { label: 'Extension', types: ['extension_update','extension_disconnected'] },
  application:  { label: 'Application Process', types: ['auto_apply_confirm','apply_alert','cv_score_approval','auth_pending_reminder','auth_expired','auth_pre_rewrite','pipeline_response','pipeline_interview','interview_reminder','pipeline_stale'] },
  resume:       { label: 'Resume Intelligence', types: ['rewrite_started','rewrite_complete','rewrite_failed','rewrite_review_reminder','rewrite_batch_summary'] },
  stats:        { label: 'Stats & Trends', types: ['weekly_summary','monthly_pipeline_report','pipeline_benchmark','filter_trend_weekly','market_pulse','trend_anomaly'] },
  ghost:        { label: 'Ghost Intelligence', types: ['ghost_alert','ghost_report_weekly'] },
  discovery:    { label: 'Job Discovery', types: ['new_jobs_daily','new_jobs_realtime'] },
  verification: { label: 'Pipeline Verification', types: ['pipeline_status_check','pipeline_bulk_review','pipeline_detected_update','pipeline_auto_updated','pipeline_ambiguous_signal','pipeline_outcome_unknown'] },
  referral:     { label: 'Referral', types: ['referral_invite','referral_sent_confirmation','referral_status_update','referral_nudge_referee','referral_conversion','referral_reward_earned','referral_expiring_reward','referral_milestone','referral_periodic_summary'] },
  upgrade:      { label: 'Upgrade & Credits', types: ['usage_upgrade_prompt','credit_cost_comparison','credit_burn_rate_alert','credit_low_balance','credit_exhausted','upgrade_roi_summary','price_lock_warning','promo_trial','promo_feature_preview'] },
  community:    { label: 'Community & Feedback', types: ['bug_report_thankyou','bug_resolved','feature_request_thankyou','feature_request_accepted','feature_request_shipped','monthly_product_update'] },
  account:      { label: 'Account & Billing', types: ['double_opt_in','notification_opt_in','subscription_expiring','subscription_confirm','credit_purchase_receipt','payment_failed','payment_recovered','plan_change_confirm','subscription_cancelled','invoice_generated','refund_processed','inactive_reengagement'] }
};

var NC_CLASSIFICATION = {
  required_transactional: ['subscription_confirm','credit_purchase_receipt','payment_failed','payment_recovered','plan_change_confirm','subscription_cancelled','invoice_generated','refund_processed','double_opt_in'],
  configurable_transactional: ['subscription_expiring','notification_opt_in'],
  marketing: ['usage_upgrade_prompt','credit_cost_comparison','credit_burn_rate_alert','credit_low_balance','credit_exhausted','upgrade_roi_summary','price_lock_warning','promo_trial','promo_feature_preview','referral_invite','referral_sent_confirmation','referral_status_update','referral_nudge_referee','referral_conversion','referral_reward_earned','referral_expiring_reward','referral_milestone','referral_periodic_summary','inactive_reengagement']
};

function ncGetClassification(type) {
  for (var cls in NC_CLASSIFICATION) {
    if (NC_CLASSIFICATION[cls].indexOf(type) !== -1) return cls;
  }
  return 'product';
}

function ncGetCategory(type) {
  for (var cat in NC_CATEGORIES) {
    if (NC_CATEGORIES[cat].types.indexOf(type) !== -1) return cat;
  }
  return 'unknown';
}

function ncGetUserLabel(type) {
  // Convert snake_case to readable label
  return type.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

// ═══════════════════════════════════════════════════════════
// NOTIFICATION STATE MANAGEMENT
// ═══════════════════════════════════════════════════════════
var ncState = null;  // user_notification_state row
var ncPrefs = {};    // user_notification_preferences keyed by type

async function ncLoadState() {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  try {
    var { data, error } = await sb.from('user_notification_state')
      .select('*').eq('user_id', currentUser.id).single();
    if (error && error.code === 'PGRST116') {
      // No row yet — create one
      var { data: newRow } = await sb.from('user_notification_state')
        .insert({ user_id: currentUser.id })
        .select().single();
      ncState = newRow;
    } else {
      ncState = data;
    }
  } catch (e) {
    console.warn('[NC] Failed to load notification state:', e);
  }
}

async function ncLoadPrefs() {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  try {
    var { data } = await sb.from('user_notification_preferences')
      .select('*').eq('user_id', currentUser.id);
    ncPrefs = {};
    (data || []).forEach(function(p) { ncPrefs[p.notification_type] = p; });
  } catch (e) {
    console.warn('[NC] Failed to load preferences:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// DOUBLE OPT-IN: Check on dashboard load
// ═══════════════════════════════════════════════════════════
async function ncCheckEmailConfirmation() {
  var params = new URLSearchParams(window.location.search);
  if (params.get('email_confirmed') === 'true') {
    ncShowToast('Email confirmed! Your account is now active.', 'success');
    // Clean URL
    history.replaceState(null, '', window.location.pathname);
  } else if (params.get('email_confirmed') === 'already') {
    ncShowToast('Your email was already confirmed.', 'info');
    history.replaceState(null, '', window.location.pathname);
  } else if (params.get('email_error')) {
    var reason = params.get('email_error');
    var msg = reason === 'token_expired' ? 'Confirmation link has expired. Please request a new one.'
      : reason === 'invalid_token' ? 'Invalid confirmation link.'
      : 'Email confirmation failed. Please try again.';
    ncShowToast(msg, 'error');
    history.replaceState(null, '', window.location.pathname);
  }
}

// ═══════════════════════════════════════════════════════════
// OPT-IN MODAL (Deliverable 5)
// Shown on first dashboard login after email verification
// ═══════════════════════════════════════════════════════════
async function ncCheckOptInModal() {
  if (!currentUser || !ncState) return;

  // Only show if email verified but preferences not yet completed
  if (ncState.email_verified && !ncState.preferences_completed) {
    ncShowOptInModal();
  }
}

function ncShowOptInModal() {
  // Don't show if already present
  if (document.getElementById('nc-optin-modal')) return;

  var categoryToggles = [
    { key: 'application', label: 'Application Updates', desc: 'Auto-apply confirmations, pipeline changes, interview alerts', default: true },
    { key: 'discovery',   label: 'Job Matches', desc: 'New jobs matching your saved filters, real-time alerts', default: true },
    { key: 'stats',       label: 'Pipeline Intelligence', desc: 'Weekly summaries, market trends, pipeline benchmarks', default: true },
    { key: 'resume',      label: 'Resume Intelligence', desc: 'Rewrite status, readiness changes, scoring updates', default: true },
    { key: 'ghost',       label: 'Ghost Alerts', desc: 'Possible ghost job detection and reports', default: false },
    { key: 'verification', label: 'Pipeline Verification', desc: 'Application status checks and auto-updates', default: true }
  ];

  var togglesHtml = categoryToggles.map(function(cat) {
    return '<label class="nc-optin-toggle" style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer;">' +
      '<input type="checkbox" class="nc-cat-toggle" data-cat="' + cat.key + '"' + (cat.default ? ' checked' : '') + ' style="margin-top:3px;accent-color:var(--accent);">' +
      '<div><div style="font-size:13px;font-weight:600;color:var(--text);">' + cat.label + '</div>' +
      '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">' + cat.desc + '</div></div></label>';
  }).join('');

  // Detect locale for marketing default (GDPR vs CAN-SPAM)
  var isEU = false;
  try {
    var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    isEU = tz.indexOf('Europe') === 0;
  } catch(e) {}

  var modal = document.createElement('div');
  modal.id = 'nc-optin-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:32px;">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:rgba(59,130,246,0.15);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">' +
          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/></svg>' +
        '</div>' +
        '<h3 style="margin:0 0 6px;font-size:18px;color:var(--text);">Set Up Your Notifications</h3>' +
        '<p style="margin:0;font-size:13px;color:var(--text-dim);">Choose what you want to hear about. You can change these anytime in Settings.</p>' +
      '</div>' +
      '<div style="margin-bottom:20px;">' + togglesHtml + '</div>' +
      '<div style="padding:12px 0;border-top:1px solid var(--border);margin-bottom:16px;">' +
        '<label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">' +
          '<input type="checkbox" id="nc-marketing-optin"' + (isEU ? '' : ' checked') + ' style="margin-top:3px;accent-color:var(--accent);">' +
          '<div><div style="font-size:13px;font-weight:600;color:var(--text);">Product updates & promotions</div>' +
          '<div style="font-size:11px;color:var(--text-dim);margin-top:2px;">Upgrade offers, new features, referral rewards, and tips.</div></div>' +
        '</label>' +
      '</div>' +
      '<div style="display:flex;gap:10px;">' +
        '<button id="nc-optin-save" class="btn btn-primary" style="flex:1;padding:12px;font-size:14px;">Save Preferences</button>' +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:11px;color:var(--text-faint);text-align:center;">You can also set up phone for SMS alerts later in the Notifications tab.</p>' +
    '</div>';

  document.body.appendChild(modal);

  document.getElementById('nc-optin-save').addEventListener('click', ncSaveOptInPreferences);
}

async function ncSaveOptInPreferences() {
  if (typeof sb === 'undefined') return;
  var btn = document.getElementById('nc-optin-save');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    // Gather category selections
    var enabledCategories = {};
    document.querySelectorAll('.nc-cat-toggle').forEach(function(cb) {
      enabledCategories[cb.dataset.cat] = cb.checked;
    });
    var marketingOptIn = document.getElementById('nc-marketing-optin')?.checked || false;

    // Build preference rows for all 79 types
    var rows = [];
    Object.keys(NC_CATEGORIES).forEach(function(cat) {
      var catEnabled = enabledCategories[cat] !== undefined ? enabledCategories[cat] : true;
      NC_CATEGORIES[cat].types.forEach(function(type) {
        var cls = ncGetClassification(type);
        // Required transactional: always email_enabled regardless of toggle
        var emailOn = cls === 'required_transactional' ? true : catEnabled;
        // Marketing types: respect marketing opt-in
        if (cls === 'marketing' && !marketingOptIn) emailOn = false;

        rows.push({
          user_id: currentUser.id,
          notification_type: type,
          email_enabled: emailOn,
          sms_enabled: false,  // SMS off by default, set up later
          in_app_enabled: true, // In-app always on for discoverability
          frequency: 'realtime'
        });
      });
    });

    // Upsert all preference rows
    await sb.from('user_notification_preferences')
      .upsert(rows, { onConflict: 'user_id,notification_type' });

    // Update notification state: preferences completed + marketing opt-in
    var stateUpdate = {
      preferences_completed: true,
      preferences_completed_at: new Date().toISOString()
    };
    if (marketingOptIn) {
      stateUpdate.marketing_opt_in = true;
      stateUpdate.marketing_opt_in_at = new Date().toISOString();
    }
    await sb.from('user_notification_state')
      .update(stateUpdate)
      .eq('user_id', currentUser.id);

    // Refresh local state
    ncState = Object.assign(ncState || {}, stateUpdate);
    await ncLoadPrefs();

    // Close modal
    var modal = document.getElementById('nc-optin-modal');
    if (modal) modal.remove();

    ncShowToast('Notification preferences saved!', 'success');
    console.log('[NC] Opt-in complete: ' + rows.length + ' preferences seeded, marketing=' + marketingOptIn);

  } catch (e) {
    console.error('[NC] Opt-in save failed:', e);
    btn.textContent = 'Error — retry';
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════
// SYNC PREFERENCES: Bridge old UI → new tables
// Called by existing Save Preferences button in applications.js
// ═══════════════════════════════════════════════════════════
async function ncSyncFromUI() {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  try {
    var rows = [];
    // Collect from all notification preference matrices (Applications panel + standalone page)
    document.querySelectorAll('tr[data-notif]').forEach(function(row) {
      var type = row.dataset.notif;
      var emailOn = row.querySelector('.nch-email')?.checked ?? true;
      var smsOn = row.querySelector('.nch-sms')?.checked ?? false;
      var freqEl = row.querySelector('.nch-freq');
      var freq = freqEl ? freqEl.value : 'realtime';

      rows.push({
        user_id: currentUser.id,
        notification_type: type,
        email_enabled: emailOn,
        sms_enabled: smsOn,
        in_app_enabled: true,
        frequency: freq
      });
    });

    if (rows.length > 0) {
      await sb.from('user_notification_preferences')
        .upsert(rows, { onConflict: 'user_id,notification_type' });
      console.log('[NC] Synced ' + rows.length + ' preferences to user_notification_preferences');
    }
  } catch (e) {
    console.warn('[NC] Sync to new table failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// TOAST HELPER
// ═══════════════════════════════════════════════════════════
function ncShowToast(msg, type) {
  var toast = document.createElement('div');
  var colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6' };
  toast.style.cssText = 'position:fixed;top:20px;right:20px;background:var(--bg-card);border:1px solid ' + (colors[type] || colors.info) + ';color:var(--text);padding:14px 20px;border-radius:10px;font-size:13px;z-index:10000;max-width:400px;box-shadow:0 8px 24px rgba(0,0,0,0.3);';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() { toast.remove(); }, 5000);
}

// ═══════════════════════════════════════════════════════════
// PER-TYPE SMS OPT-IN ENFORCEMENT
// Wires individual SMS toggles to user_notification_preferences.sms_enabled
// Only the 7 SMS-allowed types show SMS toggles
// ═══════════════════════════════════════════════════════════
var NC_SMS_ALLOWED = ['apply_alert','cv_score_approval','auth_pending_reminder','auth_pre_rewrite','pipeline_interview','interview_reminder','new_jobs_realtime'];

async function ncToggleSmsForType(type, enabled) {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  if (NC_SMS_ALLOWED.indexOf(type) === -1) {
    console.warn('[NC] SMS not allowed for type:', type);
    return;
  }
  try {
    await sb.from('user_notification_preferences')
      .update({ sms_enabled: enabled })
      .eq('user_id', currentUser.id)
      .eq('notification_type', type);
    if (ncPrefs[type]) ncPrefs[type].sms_enabled = enabled;
    console.log('[NC] SMS ' + (enabled ? 'enabled' : 'disabled') + ' for ' + type);
  } catch (e) {
    console.warn('[NC] SMS toggle failed for ' + type + ':', e);
  }
}

// Render per-type SMS toggles in all notification preference matrices (panel + standalone)
function ncRenderSmsToggles() {
  var rows = document.querySelectorAll('tr[data-notif]');
  rows.forEach(function(row) {
    var type = row.dataset.notif;
    var smsCell = row.querySelector('.nch-sms');
    if (!smsCell) return;

    // Only SMS-allowed types get an interactive toggle
    if (NC_SMS_ALLOWED.indexOf(type) === -1) {
      smsCell.disabled = true;
      smsCell.checked = false;
      smsCell.title = 'SMS is only available for time-sensitive application alerts';
      return;
    }

    // Check if phone is verified
    if (!ncState || !ncState.sms_verified) {
      smsCell.disabled = true;
      smsCell.title = 'Verify your phone number first to enable SMS';
      return;
    }

    // Wire the toggle
    var pref = ncPrefs[type];
    smsCell.checked = pref ? pref.sms_enabled : false;
    smsCell.disabled = false;
    smsCell.addEventListener('change', function() {
      ncToggleSmsForType(type, this.checked);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// REQUIRED TRANSACTIONAL LOCK ENFORCEMENT
// Ensures required_transactional rows stay locked (checked + disabled)
// Adds tooltip explaining why these can't be toggled
// ═══════════════════════════════════════════════════════════
function ncEnforceLockIcons() {
  var locked = NC_CLASSIFICATION.required_transactional || [];
  locked.forEach(function(type) {
    // Query both the Applications panel and the standalone Notification Center page
    var rows = document.querySelectorAll('tr[data-notif="' + type + '"]');
    rows.forEach(function(row) {
      // Ensure class is present
      if (!row.classList.contains('notif-locked')) row.classList.add('notif-locked');
      // Force email toggle checked + disabled
      var emailToggle = row.querySelector('.nch-email');
      if (emailToggle) {
        emailToggle.checked = true;
        emailToggle.disabled = true;
        var label = emailToggle.closest('.toggle-switch');
        if (label) {
          label.classList.add('disabled');
          label.title = 'Required — this notification cannot be disabled';
        }
      }
      // Force SMS toggle disabled
      var smsToggle = row.querySelector('.nch-sms');
      if (smsToggle) {
        smsToggle.disabled = true;
        var smsLabel = smsToggle.closest('.toggle-switch');
        if (smsLabel) smsLabel.classList.add('disabled');
      }
    });
  });
  console.log('[NC] Required transactional lock icons enforced (' + locked.length + ' types)');
}

// ═══════════════════════════════════════════════════════════
// RESEND CONFIRMATION EMAIL
// Called from UI when user's token has expired
// ═══════════════════════════════════════════════════════════
async function ncResendConfirmation() {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  try {
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    if (!token) {
      ncShowToast('Please log in again to resend confirmation.', 'error');
      return;
    }

    var res = await fetch(sb.supabaseUrl + '/functions/v1/resend-confirmation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });

    var data = await res.json();
    if (res.status === 429) {
      ncShowToast('Too many resend attempts. Please wait an hour.', 'error');
    } else if (data.already_verified) {
      ncShowToast('Your email is already verified!', 'info');
      ncState.email_verified = true;
    } else if (data.ok) {
      ncShowToast('Confirmation email sent! Check your inbox.', 'success');
    } else {
      ncShowToast(data.error || 'Failed to resend. Please try again.', 'error');
    }
  } catch (e) {
    console.error('[NC] Resend confirmation failed:', e);
    ncShowToast('Failed to resend confirmation email.', 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// INITIALIZE
// ═══════════════════════════════════════════════════════════
async function initNotificationCenter() {
  await ncLoadState();
  await ncLoadPrefs();
  ncCheckEmailConfirmation();

  // Render per-type SMS toggles once preferences panel is available
  setTimeout(function() {
    ncRenderSmsToggles();
    ncEnforceLockIcons();
    ncCheckOptInModal();

    // Show email confirmation banner on standalone page if not verified
    if (ncState && !ncState.email_verified) {
      var ncBanner = document.getElementById('nc-email-banner');
      if (ncBanner) ncBanner.style.display = 'flex';

      // Wire resend button on standalone page
      var ncResendBtn = document.getElementById('nc-resend-confirm-btn');
      if (ncResendBtn) {
        ncResendBtn.addEventListener('click', ncResendConfirmation);
      }

      // Add resend button to Applications panel (legacy)
      var resendTarget = document.getElementById('nc-resend-target') || document.querySelector('.notif-verify-section');
      if (resendTarget && !document.getElementById('nc-resend-btn')) {
        var btn = document.createElement('button');
        btn.id = 'nc-resend-btn';
        btn.className = 'btn btn-secondary';
        btn.style.cssText = 'margin-top:8px;font-size:12px;padding:6px 14px;';
        btn.textContent = 'Resend confirmation email';
        btn.addEventListener('click', ncResendConfirmation);
        resendTarget.appendChild(btn);
      }
    } else if (ncState && ncState.email_verified) {
      // Hide banner if verified
      var ncBanner = document.getElementById('nc-email-banner');
      if (ncBanner) ncBanner.style.display = 'none';
    }
  }, 1500);
  console.log('[NC] Notification Center initialized (Session 2+, v6.27)');
}

// Hook into save buttons on both Applications panel and standalone Notification Center
document.addEventListener('DOMContentLoaded', function() {
  // Applications panel save button
  var saveBtn = document.getElementById('notif-save-prefs');
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      // Small delay to let the existing save complete first
      setTimeout(ncSyncFromUI, 500);
    });
  }

  // Standalone Notification Center save button (if present)
  var ncSaveBtn = document.getElementById('nc-notif-save-prefs');
  if (ncSaveBtn) {
    ncSaveBtn.addEventListener('click', function() {
      setTimeout(ncSyncFromUI, 500);
    });
  }

  // Wire standalone notification log filter changes
  ['nc-nlog-filter-type','nc-nlog-filter-channel','nc-nlog-filter-status'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('change', function() {
      ncLoadNotificationLog(1);
    });
  });

  // Wire standalone CSV export
  var ncExportBtn = document.getElementById('nc-notif-export-csv');
  if (ncExportBtn) {
    ncExportBtn.addEventListener('click', ncExportLogCSV);
  }

  // Initial log load on standalone page
  if (document.getElementById('nc-notif-log-body')) {
    ncLoadNotificationLog(1);
  }
});

// ═══════════════════════════════════════════════════════════
// NOTIFICATION LOG — Load, Filter, Paginate, Export
// Reads from notification_log table (RLS: users see own rows)
// ═══════════════════════════════════════════════════════════
var NC_LOG_PAGE_SIZE = 20;
var ncLogCache = [];

async function ncLoadNotificationLog(page) {
  if (typeof sb === 'undefined') { console.warn('[NC] Supabase client not ready — skipping log load'); return; }
  var tbody = document.getElementById('nc-notif-log-body');
  if (!tbody) return;

  // Read filter values
  var typeFilter = (document.getElementById('nc-nlog-filter-type') || {}).value || '';
  var channelFilter = (document.getElementById('nc-nlog-filter-channel') || {}).value || '';
  var statusFilter = (document.getElementById('nc-nlog-filter-status') || {}).value || '';

  // Show loading state
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:32px;">Loading notifications…</td></tr>';

  try {
    var query = sb.from('notification_log')
      .select('id,notification_type,channel,status,subject,company_name,created_at,payload,classification,send_decision', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (typeFilter) query = query.eq('notification_type', typeFilter);
    if (channelFilter) query = query.eq('channel', channelFilter);
    if (statusFilter) query = query.eq('status', statusFilter);

    var offset = (page - 1) * NC_LOG_PAGE_SIZE;
    query = query.range(offset, offset + NC_LOG_PAGE_SIZE - 1);

    var result = await query;
    if (result.error) throw result.error;

    var rows = result.data || [];
    var total = result.count || 0;
    ncLogCache = rows;

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-faint);padding:48px 12px;">' +
        '<div style="margin-bottom:12px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25;"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No notifications found</div>' +
        '<div style="font-size:12px;">' + (typeFilter || channelFilter || statusFilter ? 'Try adjusting your filters.' : 'Notification history will appear here once the system is active.') + '</div>' +
        '</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function(row) {
        var ts = new Date(row.created_at);
        var timeStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        var typeLabel = (row.notification_type || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        var channelIcon = row.channel === 'sms' ? '💬' : row.channel === 'in_app' ? '🔔' : '✉️';
        var statusClass = row.status === 'sent' || row.status === 'delivered' ? 'color:var(--green)' :
          row.status === 'failed' ? 'color:var(--red)' :
          row.status === 'held' ? 'color:var(--yellow)' : 'color:var(--text-dim)';
        var jobInfo = row.company_name || (row.payload && row.payload.job_title) || '—';

        return '<tr>' +
          '<td style="font-size:12px;white-space:nowrap;color:var(--text-dim);">' + timeStr + '</td>' +
          '<td style="font-size:12px;">' + typeLabel + '</td>' +
          '<td style="font-size:12px;text-align:center;" title="' + row.channel + '">' + channelIcon + '</td>' +
          '<td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + jobInfo + '</td>' +
          '<td style="font-size:12px;font-weight:500;' + statusClass + '">' + (row.status || '—') + '</td>' +
          '</tr>';
      }).join('');
    }

    // Render pagination
    ncRenderLogPagination(page, total);
    console.log('[NC] Notification log loaded: ' + rows.length + ' rows, page ' + page + '/' + Math.ceil(total / NC_LOG_PAGE_SIZE));

  } catch (err) {
    console.error('[NC] Failed to load notification log:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--red);padding:32px;">Failed to load notification log. Please try again.</td></tr>';
  }
}

function ncRenderLogPagination(currentPage, total) {
  var container = document.getElementById('nc-notif-log-pagination');
  if (!container) return;

  var totalPages = Math.ceil(total / NC_LOG_PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  var html = '';
  if (currentPage > 1) {
    html += '<button class="btn btn-secondary btn-sm" onclick="ncLoadNotificationLog(' + (currentPage - 1) + ')" style="font-size:11px;">← Prev</button>';
  }
  html += '<span style="font-size:12px;color:var(--text-dim);padding:4px 8px;">Page ' + currentPage + ' of ' + totalPages + ' (' + total + ' total)</span>';
  if (currentPage < totalPages) {
    html += '<button class="btn btn-secondary btn-sm" onclick="ncLoadNotificationLog(' + (currentPage + 1) + ')" style="font-size:11px;">Next →</button>';
  }
  container.innerHTML = html;
}

function ncExportLogCSV() {
  if (!ncLogCache || ncLogCache.length === 0) {
    ncShowToast('No notification log data to export. Load the log first.', 'info');
    return;
  }

  var headers = ['Timestamp', 'Type', 'Channel', 'Status', 'Company/Job', 'Subject', 'Classification', 'Decision'];
  var csvRows = [headers.join(',')];

  ncLogCache.forEach(function(row) {
    var ts = new Date(row.created_at).toISOString();
    var jobInfo = row.company_name || (row.payload && row.payload.job_title) || '';
    var subject = (row.subject || '').replace(/"/g, '""');
    csvRows.push([
      ts,
      row.notification_type || '',
      row.channel || '',
      row.status || '',
      '"' + jobInfo + '"',
      '"' + subject + '"',
      row.classification || '',
      row.send_decision || ''
    ].join(','));
  });

  var blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'notification-log-' + new Date().toISOString().slice(0, 10) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  ncShowToast('Notification log exported (' + ncLogCache.length + ' rows).', 'success');
}


