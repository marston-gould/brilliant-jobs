/* ───────────────────────────────────────────────────────────
   notification-center.js — Notification Center + Opt-In Modal
   Session 2+ of Notification System (Pod 2)
   v6.51
   
   Bridges user_notification_preferences + user_notification_state
   (Session 2 tables) with existing UI in panel-notifications
   AND standalone page-notifications.
   Adds opt-in modal for first-login-after-verification flow.
   v5.98: Required transactional lock icons + enforcement
   v5.99: Standalone Notification Center page support
   v6.51: Notification log wiring — load, filter, paginate, CSV export
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
      var { data: newRow, error: insErr } = await sb.from('user_notification_state')
        .insert({ user_id: currentUser.id })
        .select().single();
      if (insErr) reportError('nc:state-insert', insErr);
      ncState = newRow;
    } else {
      ncState = data;
    }
  } catch(e) { reportError('notification-center', e); console.warn('[NC] Failed to load notification state:', e);
  }
}

async function ncLoadPrefs() {
  if (typeof sb === 'undefined') return;
  if (!currentUser) return;
  try {
    var data = await safeQuery(() => sb.from('user_notification_preferences').select('*').eq('user_id', currentUser.id), { label: 'notification-center:user_notification_preferences', fallback: [] });
    ncPrefs = {};
    (data || []).forEach(function(p) { ncPrefs[p.notification_type] = p; });
  } catch(e) { reportError('notification-center', e); console.warn('[NC] Failed to load preferences:', e);
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
  } catch(e) { reportError('notification-center:notification-center', e); }

  var modal = document.createElement('div');
  modal.id = 'nc-optin-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
  modal.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;padding:32px;">' +
      '<div style="text-align:center;margin-bottom:20px;">' +
        '<div style="width:48px;height:48px;border-radius:50%;background:rgba(59,130,246,0.15);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">' +
          '<i data-lucide="bell" class="icon-lg icon-stroke" style="stroke:#3b82f6;"></i>' +
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
  if (typeof window.refreshIcons === 'function') window.refreshIcons();

  // CX-06: PostHog — notification opt-in modal shown
  if (window.posthog) posthog.capture('notification_opt_in_shown', { categories_shown: categoryToggles.map(c => c.key) });

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
    var { error: prefErr } = await sb.from('user_notification_preferences')
      .upsert(rows, { onConflict: 'user_id,notification_type' });
    if (prefErr) { reportError('nc:save-prefs', prefErr); ncShowToast('Failed to save preferences', 'error'); return; }

    // Update notification state: preferences completed + marketing opt-in
    var stateUpdate = {
      preferences_completed: true,
      preferences_completed_at: new Date().toISOString()
    };
    if (marketingOptIn) {
      stateUpdate.marketing_opt_in = true;
      stateUpdate.marketing_opt_in_at = new Date().toISOString();
    }
    var { error: stateErr } = await sb.from('user_notification_state')
      .update(stateUpdate)
      .eq('user_id', currentUser.id);
    if (stateErr) reportError('nc:save-state', stateErr);

    // Refresh local state
    ncState = Object.assign(ncState || {}, stateUpdate);
    await ncLoadPrefs();

    // Close modal
    var modal = document.getElementById('nc-optin-modal');
    if (modal) modal.remove();

    ncShowToast('Notification preferences saved!', 'success');
    console.log('[NC] Opt-in complete: ' + rows.length + ' preferences seeded, marketing=' + marketingOptIn);

    // CX-06: PostHog — notification opt-in saved
    if (window.posthog) posthog.capture('notification_opt_in_saved', {
      categories_enabled: Object.keys(enabledCategories).filter(k => enabledCategories[k]),
      categories_disabled: Object.keys(enabledCategories).filter(k => !enabledCategories[k]),
      marketing_opt_in: marketingOptIn,
      total_preferences: rows.length
    });

  } catch (e) {
    reportError('notification_center', e);
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
      var { error: syncErr } = await sb.from('user_notification_preferences')
        .upsert(rows, { onConflict: 'user_id,notification_type' });
      if (syncErr) reportError('nc:sync-prefs', syncErr);
      else console.log('[NC] Synced ' + rows.length + ' preferences to user_notification_preferences');
    }
  } catch(e) { reportError('notification-center', e); console.warn('[NC] Sync to new table failed:', e);
  }
}

// ═══════════════════════════════════════════════════════════
// TOAST HELPER
// ═══════════════════════════════════════════════════════════
function ncShowToast(msg, type) {
  var toast = document.createElement('div');
  var colors = { success: 'var(--green)', error: 'var(--red)', info: 'var(--accent)' };
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
    var { error: smsErr } = await sb.from('user_notification_preferences')
      .update({ sms_enabled: enabled })
      .eq('user_id', currentUser.id)
      .eq('notification_type', type);
    if (smsErr) { reportError('nc:sms-toggle', smsErr); return; }
    if (ncPrefs[type]) ncPrefs[type].sms_enabled = enabled;
    console.log('[NC] SMS ' + (enabled ? 'enabled' : 'disabled') + ' for ' + type);
    // CX-06: PostHog — notification SMS toggled
    if (window.posthog) posthog.capture('notification_sms_toggled', { type: type, enabled: enabled });
  } catch(e) { reportError('notification-center', e); console.warn('[NC] SMS toggle failed for ' + type + ':', e);
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
    reportError('notification_center', e);
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
    ncWirePreferenceEvents();

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
  console.log('[NC] Notification Center initialized (Session 2+, v6.51)');
}

// ═══════════════════════════════════════════════════════════
// DS1A-17: NOTIFICATION PREFERENCE EVENT TRACKING
// Fires PostHog events for all 75+ notification preference inputs
// ═══════════════════════════════════════════════════════════
function ncWirePreferenceEvents() {
  var wired = 0;
  // Wire email toggles
  document.querySelectorAll('tr[data-notif] .nch-email').forEach(function(toggle) {
    if (toggle._ncEvented) return;
    toggle._ncEvented = true;
    toggle.addEventListener('change', function() {
      var type = this.closest('tr')?.dataset?.notif || 'unknown';
      if (window.posthog) posthog.capture('notification_email_toggled', {
        notification_type: type, enabled: this.checked, channel: 'email'
      });
      ncSyncFromUI();
    });
    wired++;
  });
  // Wire SMS toggles (supplement existing wiring with PostHog event)
  document.querySelectorAll('tr[data-notif] .nch-sms').forEach(function(toggle) {
    if (toggle._ncEvented) return;
    toggle._ncEvented = true;
    wired++;
  });
  // Wire frequency selects
  document.querySelectorAll('tr[data-notif] .nch-freq').forEach(function(select) {
    if (select._ncEvented) return;
    select._ncEvented = true;
    select.addEventListener('change', function() {
      var type = this.closest('tr')?.dataset?.notif || 'unknown';
      if (window.posthog) posthog.capture('notification_frequency_changed', {
        notification_type: type, frequency: this.value, channel: 'email'
      });
      ncSyncFromUI();
    });
    wired++;
  });
  console.log('[NC] Wired PostHog events to ' + wired + ' notification preference inputs');
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
  ['nc-nlog-filter-type','nc-nlog-filter-channel','nc-nlog-filter-status','nlog-filter-archive'].forEach(function(id) {
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

  // Wire select-all checkbox
  var selectAllCb = document.getElementById('nc-log-select-all');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', function() {
      document.querySelectorAll('.nc-log-check').forEach(function(cb) {
        cb.checked = selectAllCb.checked;
      });
      ncUpdateArchiveButtonState();
    });
  }

  // Wire bulk archive button
  var archiveBtn = document.getElementById('nc-archive-selected');
  if (archiveBtn) {
    archiveBtn.addEventListener('click', ncBulkArchive);
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
  var archiveFilter = (document.getElementById('nlog-filter-archive') || {}).value || 'active';

  // Show loading state
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:32px;">Loading notifications…</td></tr>';

  // Reset select-all checkbox
  var selectAllCb = document.getElementById('nc-log-select-all');
  if (selectAllCb) selectAllCb.checked = false;
  ncUpdateArchiveButtonState();

  try {
    var query = sb.from('notification_log')
      .select('id,notification_type,channel,status,subject,company_name,created_at,payload,classification,send_decision,archived_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Archive filter
    if (archiveFilter === 'active') query = query.is('archived_at', null);
    else if (archiveFilter === 'archived') query = query.not('archived_at', 'is', null);
    // 'all' = no filter

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

    var isViewingArchived = archiveFilter === 'archived';

    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-faint);padding:48px 12px;">' +
        '<div style="margin-bottom:12px;"><i data-lucide="bell" class="icon-xl icon-stroke-lg" style="opacity:0.25;"></i></div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text-dim);margin-bottom:6px;">No notifications found</div>' +
        '<div style="font-size:12px;">' + (typeFilter || channelFilter || statusFilter || archiveFilter !== 'active' ? 'Try adjusting your filters.' : 'Notification history will appear here once the system is active.') + '</div>' +
        '</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function(row) {
        var ts = new Date(row.created_at);
        var timeStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        var typeLabel = (row.notification_type || '').replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        var channelIcon = row.channel === 'sms' ? '<i data-lucide="message-square" class="icon-xs icon-stroke"></i>' : row.channel === 'in_app' ? '<i data-lucide="bell" class="icon-xs icon-stroke"></i>' : '<i data-lucide="mail" class="icon-xs icon-stroke"></i>';
        var statusClass = row.status === 'sent' || row.status === 'delivered' ? 'color:var(--green)' :
          row.status === 'failed' ? 'color:var(--red)' :
          row.status === 'held' ? 'color:var(--yellow)' : 'color:var(--text-dim)';
        var jobInfo = row.company_name || (row.payload && row.payload.job_title) || '—';

        // Action column: archive or unarchive icon
        var actionIcon = row.archived_at
          ? '<button class="btn-icon" onclick="ncUnarchiveNotification(\'' + row.id + '\')" title="Restore"><i data-lucide="archive-restore" class="icon-sm icon-stroke"></i></button>'
          : '<button class="btn-icon" onclick="ncArchiveNotification(\'' + row.id + '\')" title="Archive"><i data-lucide="archive" class="icon-sm icon-stroke"></i></button>';

        return '<tr>' +
          '<td style="width:28px;text-align:center;"><input type="checkbox" class="nc-log-check" data-id="' + row.id + '" onchange="ncUpdateArchiveButtonState()"></td>' +
          '<td style="font-size:12px;white-space:nowrap;color:var(--text-dim);">' + timeStr + '</td>' +
          '<td style="font-size:12px;">' + typeLabel + '</td>' +
          '<td style="font-size:12px;text-align:center;" title="' + row.channel + '">' + channelIcon + '</td>' +
          '<td style="font-size:12px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + jobInfo + '</td>' +
          '<td style="font-size:12px;font-weight:500;' + statusClass + '">' + (row.status || '—') + '</td>' +
          '<td style="width:50px;text-align:center;">' + actionIcon + '</td>' +
          '</tr>';
      }).join('');
    }
    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    // Update Archive Selected button label based on view
    var archiveBtn = document.getElementById('nc-archive-selected');
    if (archiveBtn) archiveBtn.textContent = isViewingArchived ? 'Unarchive Selected' : 'Archive Selected';

    // Render pagination
    ncRenderLogPagination(page, total);
    console.log('[NC] Notification log loaded: ' + rows.length + ' rows, page ' + page + '/' + Math.ceil(total / NC_LOG_PAGE_SIZE));

  } catch (err) {
    reportError('notification_center', err);
    console.error('[NC] Failed to load notification log:', err);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--red);padding:32px;">Failed to load notification log. Please try again.</td></tr>';
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

// ═══════════════════════════════════════════════════════════
// NOTIFICATION LOG — Archive / Unarchive (APR-002)
// ═══════════════════════════════════════════════════════════

// Single row archive
async function ncArchiveNotification(id) {
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
  try {
    var result = await sb.from('notification_log')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (result.error) throw result.error;
    ncLoadNotificationLog(1);
  } catch (err) {
    reportError('notification_center', err, { action: 'archive', id: id });
    ncShowToast('Failed to archive notification.', 'error');
  }
}

// Single row unarchive
async function ncUnarchiveNotification(id) {
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
  try {
    var result = await sb.from('notification_log')
      .update({ archived_at: null })
      .eq('id', id)
      .eq('user_id', currentUser.id);
    if (result.error) throw result.error;
    ncLoadNotificationLog(1);
  } catch (err) {
    reportError('notification_center', err, { action: 'unarchive', id: id });
    ncShowToast('Failed to restore notification.', 'error');
  }
}

// Bulk archive (or unarchive if viewing archived)
async function ncBulkArchive() {
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;
  var checked = [].slice.call(document.querySelectorAll('.nc-log-check:checked')).map(function(cb) { return cb.dataset.id; });
  if (!checked.length) return;

  var archiveFilter = (document.getElementById('nlog-filter-archive') || {}).value || 'active';
  var isUnarchive = archiveFilter === 'archived';

  try {
    var result = await sb.from('notification_log')
      .update({ archived_at: isUnarchive ? null : new Date().toISOString() })
      .in('id', checked)
      .eq('user_id', currentUser.id);
    if (result.error) throw result.error;
    ncShowToast((isUnarchive ? 'Restored ' : 'Archived ') + checked.length + ' notification' + (checked.length > 1 ? 's' : '') + '.', 'success');
    ncLoadNotificationLog(1);
  } catch (err) {
    reportError('notification_center', err, { action: 'bulk_archive', count: checked.length });
    ncShowToast('Failed to update notifications.', 'error');
  }
}

// Update Archive Selected button enabled state
function ncUpdateArchiveButtonState() {
  var anyChecked = document.querySelectorAll('.nc-log-check:checked').length > 0;
  var btn = document.getElementById('nc-archive-selected');
  if (btn) btn.disabled = !anyChecked;
}

// ─── SDV-S2: MY SURVEYS TAB ──────────────────────────────────────────────────

var _ncSurveysPage = 0;
var _ncSurveysPageSize = 10;
var _ncSurveysLoaded = false;

function ncLoadMySurveys() {
  if (!currentUser) return;
  _ncSurveysPage = 0;
  _ncSurveysLoaded = false;
  ncLoadAvailableSurveys();
  ncLoadCompletedSurveys();

  // PostHog: survey_history_viewed
  try {
    if (typeof captureEvent === 'function') captureEvent('survey_history_viewed', { tab: 'my_surveys' });
    else if (typeof posthog !== 'undefined') posthog.capture('survey_history_viewed', { tab: 'my_surveys' });
  } catch (_ph) { /* PostHog fire-and-forget */ }
}

// ─── Available Surveys ───
async function ncLoadAvailableSurveys() {
  var container = document.getElementById('nc-surveys-available-list');
  if (!container) return;
  container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Loading...</div>';

  try {
    var sb = window.supabase || window._supabase;
    if (!sb) { container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Not connected.</div>'; return; }

    // Fetch active campaigns
    var campaignRes = await sb.from('survey_campaigns')
      .select('survey_version,survey_type,title,description,estimated_minutes,credit_reward')
      .eq('is_active', true)
      .order('priority', { ascending: true });

    if (campaignRes.error) throw campaignRes.error;
    var campaigns = campaignRes.data || [];

    if (campaigns.length === 0) {
      container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">No surveys available right now. Check back soon.</div>';
      return;
    }

    // Fetch user's completed survey versions from feedback table
    var feedbackRes = await sb.from('feedback')
      .select('survey_version')
      .eq('user_id', currentUser.id);
    var completedVersions = new Set();
    if (feedbackRes.data) feedbackRes.data.forEach(function(r) { if (r.survey_version) completedVersions.add(r.survey_version); });

    // Filter to only uncompleted, non-exit surveys
    var available = campaigns.filter(function(c) {
      return !completedVersions.has(c.survey_version) && c.survey_type !== 'exit';
    });

    if (available.length === 0) {
      container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">No surveys available right now. Check back soon.</div>';
      return;
    }

    var html = '';
    for (var i = 0; i < available.length; i++) {
      var s = available[i];
      var esc = _ncEsc;
      html += '<div class="card" style="margin-bottom:10px;padding:14px 16px;border:1px solid var(--border);">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:13px;">' + esc(s.title) + '</div>';
      if (s.description) html += '<div class="u-text-faint" style="font-size:11px;margin-top:2px;">' + esc(s.description) + '</div>';
      html += '<div style="font-size:11px;margin-top:4px;color:var(--text-dim);">~' + (s.estimated_minutes || 2) + ' min</div>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      if (s.credit_reward > 0) {
        html += '<span style="background:#22c55e;color:#fff;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;">Earn ' + s.credit_reward + ' credits</span>';
      }
      html += '<a href="/survey?context=' + (s.survey_type === 'nps' ? 'nps' : s.survey_type === 'exit' ? 'churn' : s.survey_type === 'micro' ? 'periodic' : 'periodic') + '&v=' + encodeURIComponent(s.survey_version) + '&src=my_surveys" class="btn btn-primary btn-sm" style="font-size:11px;padding:4px 12px;">Take Survey</a>';
      html += '</div></div></div>';
    }
    container.innerHTML = html;
  } catch (err) {
    reportError('nc_surveys_available', err);
    container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Failed to load surveys.</div>';
  }
}

// ─── Completed Surveys ───
async function ncLoadCompletedSurveys() {
  var container = document.getElementById('nc-surveys-completed-list');
  if (!container) return;
  container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Loading...</div>';
  _ncSurveysPage = 0;
  _ncSurveysLoaded = false;
  await _ncFetchCompletedPage(container, false);
}

async function _ncFetchCompletedPage(container, append) {
  try {
    var sb = window.supabase || window._supabase;
    if (!sb) { container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Not connected.</div>'; return; }

    var offset = _ncSurveysPage * _ncSurveysPageSize;
    var res = await sb.from('feedback')
      .select('id,type,survey_version,answers,created_at')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + _ncSurveysPageSize - 1);

    if (res.error) throw res.error;
    var rows = res.data || [];

    if (rows.length === 0 && !append) {
      container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">No survey responses yet.</div>';
      _hideLoadMore();
      return;
    }

    // Look up credit grants for these versions
    var versions = rows.map(function(r) { return r.survey_version; }).filter(Boolean);
    var creditMap = {};
    if (versions.length > 0) {
      var creditRes = await sb.from('credit_transactions')
        .select('feature,amount')
        .eq('user_id', currentUser.id)
        .eq('source', 'survey_reward')
        .in('feature', versions);
      if (creditRes.data) creditRes.data.forEach(function(c) { creditMap[c.feature] = c.amount; });
    }

    var html = append ? '' : '';
    var esc = _ncEsc;
    var getQ = (typeof window.BJ_SURVEY_QUESTIONS !== 'undefined') ? window.BJ_SURVEY_QUESTIONS.getQuestionText : function(id) { return id; };

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var typeLabel = _ncSurveyTypeLabel(r.type);
      var dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString() : '';
      var credits = creditMap[r.survey_version];
      var cardId = 'nc-survey-resp-' + r.id;

      html += '<div class="card" style="margin-bottom:8px;padding:12px 16px;border:1px solid var(--border);cursor:pointer;" onclick="window.ncToggleSurveyResponse(\'' + r.id + '\')">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      html += '<span style="font-size:10px;font-weight:600;padding:2px 6px;border-radius:4px;background:var(--accent-glow);color:var(--accent);">' + esc(typeLabel) + '</span>';
      html += '<span style="font-size:12px;font-weight:500;">' + esc(dateStr) + '</span>';
      html += '</div>';
      html += '<div style="display:flex;align-items:center;gap:8px;">';
      if (credits && credits > 0) {
        html += '<span style="font-size:10px;color:#22c55e;font-weight:600;">+' + credits + ' credits</span>';
      } else {
        html += '<span class="u-text-faint" style="font-size:10px;">\u2014</span>';
      }
      html += '<span class="u-text-faint" style="font-size:10px;">\u25BC</span>';
      html += '</div></div>';

      // Expandable response detail (hidden by default)
      html += '<div id="' + cardId + '" style="display:none;margin-top:10px;border-top:1px solid var(--border);padding-top:10px;">';
      if (r.answers && typeof r.answers === 'object') {
        var keys = Object.keys(r.answers);
        for (var k = 0; k < keys.length; k++) {
          var qId = keys[k];
          var answer = r.answers[qId];
          var qText = getQ(qId);
          html += '<div style="margin-bottom:8px;">';
          html += '<div style="font-size:11px;font-weight:600;color:var(--text-dim);">' + esc(qText) + '</div>';
          html += '<div style="font-size:12px;margin-top:2px;">' + _ncRenderAnswer(answer) + '</div>';
          html += '</div>';
        }
      } else {
        html += '<div class="u-text-faint" style="font-size:11px;">No response data available.</div>';
      }
      html += '</div></div>';
    }

    if (append) {
      container.insertAdjacentHTML('beforeend', html);
    } else {
      container.innerHTML = html;
    }

    // Show/hide load more
    if (rows.length < _ncSurveysPageSize) {
      _ncSurveysLoaded = true;
      _hideLoadMore();
    } else {
      _showLoadMore();
    }
  } catch (err) {
    reportError('nc_surveys_completed', err);
    if (!append) container.innerHTML = '<div class="u-text-faint" style="padding:16px 0;">Failed to load responses.</div>';
  }
}

function _ncRenderAnswer(answer) {
  if (answer === null || answer === undefined) return '<span class="u-text-faint">—</span>';
  if (typeof answer === 'string') {
    var truncated = answer.length > 200 ? _ncEsc(answer.substring(0, 200)) + '<span class="u-text-faint">… (show more)</span>' : _ncEsc(answer);
    return truncated;
  }
  if (typeof answer === 'number') return String(answer);
  if (answer.label) return _ncEsc(answer.label);
  if (answer.rating !== undefined) return 'Rating: ' + answer.rating + (answer.maxRating ? '/' + answer.maxRating : '/5');
  if (answer.text) {
    var t = answer.text;
    return t.length > 200 ? _ncEsc(t.substring(0, 200)) + '<span class="u-text-faint">… (show more)</span>' : _ncEsc(t);
  }
  if (answer.index !== undefined && answer.label === undefined) return 'Option ' + (answer.index + 1);
  if (Array.isArray(answer)) return answer.map(function(a) { return _ncEsc(typeof a === 'string' ? a : (a.label || JSON.stringify(a))); }).join(', ');
  return _ncEsc(JSON.stringify(answer));
}

function _ncSurveyTypeLabel(type) {
  if (!type) return 'Survey';
  var map = { 'exit_survey': 'Exit', 'nps_survey': 'NPS', 'user_survey': 'Periodic', 'ghost_survey': 'Ghost', 'micro_survey': 'Micro' };
  return map[type] || type;
}

function _ncEsc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function _showLoadMore() {
  var el = document.getElementById('nc-surveys-load-more');
  if (el) el.style.display = '';
}

function _hideLoadMore() {
  var el = document.getElementById('nc-surveys-load-more');
  if (el) el.style.display = 'none';
}

// ─── Window Exports ───
window.ncLoadMySurveys = ncLoadMySurveys;

window.ncLoadMoreSurveys = function() {
  _ncSurveysPage++;
  var container = document.getElementById('nc-surveys-completed-list');
  if (container) _ncFetchCompletedPage(container, true);
};

window.ncToggleSurveyResponse = function(id) {
  var el = document.getElementById('nc-survey-resp-' + id);
  if (!el) return;
  var isHidden = el.style.display === 'none';
  el.style.display = isHidden ? '' : 'none';
  if (isHidden) {
    try {
      if (typeof captureEvent === 'function') captureEvent('survey_response_expanded', { survey_id: id });
      else if (typeof posthog !== 'undefined') posthog.capture('survey_response_expanded', { survey_id: id });
    } catch (_ph) { /* PostHog fire-and-forget */ }
  }
};