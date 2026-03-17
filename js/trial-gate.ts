// js/trial-gate.js — FB-TRIAL-001-S3/S7: Trial Gate Client + Free Samples + Inline Nudges
// Renders trial countdown banner, pre-sample prompts, post-sample conversion modals,
// and contextual inline nudges for fully-expired users.
// S7: adds all 22 PostHog events per spec §11, 7 inline nudges per spec §6.4.
// Exports: initTrialGate, showPreSamplePrompt, showSampleConversionModal,
//          hideTrialBanner, renderExpiredNudges

/* ─── Feature label map (human-readable names for modals) ─── */
var _FEATURE_LABELS = {
  chat:    'AI Chat',
  score:   'Resume Scoring',
  sms:     'SMS Alert',
  email:   'Email Notification',
  apply:   'Auto-Apply',
  stats:   'Stats Page',
  filter:  'Saved Filter',
  boolean: 'Boolean Search',
};

/* ─── State ─── */
var _trialBannerInterval = null;
var _sampleAvailability = null; // { chat: true, score: false, ... }
var _allSamplesConsumed = false; // true when expired_free + no samples left → show inline nudges
var _trialDaysRemaining = null;  // cached for event properties

/* ────────────────────────────────────────────────────────────
 *  initTrialGate()
 *  Called once from app.js init(). Fetches user_state and renders
 *  the trial countdown banner for trialing users. Caches sample
 *  availability for expired_free users.
 * ──────────────────────────────────────────────────────────── */
async function initTrialGate() {
  if (!window.currentUser) return;
  try {
    var result = await safeQuery(function() {
      return sb.from('profiles')
        .select('user_state, trial_expires_at, feature_samples_used, trial_started_at')
        .eq('id', currentUser.id)
        .single();
    }, { label: 'trial-gate:init', fallback: null });

    if (!result) return;

    var state = result.user_state;

    // Cache trial_expires_at for _daysSinceExpiry() calls
    if (result.trial_expires_at) {
      try { sessionStorage.setItem('bj_trial_expires_at', result.trial_expires_at); } catch (_e) { /* storage quota */ }
    }

    // ── TRIALING: render countdown banner + fire trial_started if fresh ──
    if (state === 'trialing' && result.trial_expires_at) {
      var now = new Date();
      var exp = new Date(result.trial_expires_at);
      var msLeft = exp.getTime() - now.getTime();
      _trialDaysRemaining = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      // trial_started: fire once per user (only on first dashboard load, within 10 min of signup)
      if (result.trial_started_at) {
        var startedMsAgo = now.getTime() - new Date(result.trial_started_at).getTime();
        if (startedMsAgo < 10 * 60 * 1000 && !sessionStorage.getItem('bj_trial_started_fired')) {
          sessionStorage.setItem('bj_trial_started_fired', '1');
          if (window.posthog) posthog.capture('trial_started', {
            user_id: currentUser.id,
            signup_source: 'dashboard',
            referred_by: (window._bjReferredBy || null),
          });
        }
      }
      // trial_upgrade_prompted: fires each time the banner is rendered
      if (window.posthog) posthog.capture('trial_upgrade_prompted', {
        user_id: currentUser.id,
        trigger: 'trial_banner',
        day_of_trial: 7 - _trialDaysRemaining,
      });

      _renderTrialBanner(result.trial_expires_at);
    }

    // ── EXPIRED_FREE: cache sample availability ──
    if (state === 'expired_free') {
      var used = result.feature_samples_used || {};
      _sampleAvailability = {};
      var allFeatures = ['chat', 'score', 'sms', 'email', 'apply', 'stats', 'filter', 'boolean'];
      var anyAvailable = false;
      for (var i = 0; i < allFeatures.length; i++) {
        _sampleAvailability[allFeatures[i]] = !used[allFeatures[i]];
        if (!used[allFeatures[i]]) anyAvailable = true;
      }
      _allSamplesConsumed = !anyAvailable;

      if (_allSamplesConsumed) {
        // §6.4: render inline nudges — replaces feature UI for fully-expired users
        renderExpiredNudges();
      } else {
        // Update any gated feature buttons with sample badges
        _updateSampleBadges();
      }
    }

    // ── ACTIVE_PRO: hide banner if it exists (e.g. mid-trial upgrade) ──
    if (state === 'active_pro') {
      hideTrialBanner();
      // FB-TRIAL-001-S4 Part 5: Post-upgrade referral intro on ?upgraded=true
      _maybeShowUpgradeIntro();
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('trial-gate:init', e);
  }
}

/* ────────────────────────────────────────────────────────────
 *  _renderTrialBanner(expiresAt)
 *  Shows persistent banner below nav with countdown.
 *  Color: blue (5–7 days), amber (2–4 days), red (0–1 day).
 * ──────────────────────────────────────────────────────────── */
function _renderTrialBanner(expiresAt) {
  var banner = document.getElementById('trial-banner');
  if (!banner) return;

  function _update() {
    var now = new Date();
    var exp = new Date(expiresAt);
    var msLeft = exp.getTime() - now.getTime();
    var daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

    // Determine color tier
    var bgColor, textColor;
    if (daysLeft <= 1) {
      bgColor = '#E24B4A'; textColor = '#fff';
    } else if (daysLeft <= 4) {
      bgColor = '#F59E0B'; textColor = '#1a1a2e';
    } else {
      bgColor = '#3B82F6'; textColor = '#fff';
    }

    // Determine message text
    var msg;
    if (daysLeft === 0) {
      msg = 'Trial ending today';
    } else if (daysLeft === 1) {
      msg = 'Your trial ends tomorrow';
    } else {
      msg = daysLeft + ' days left in your free trial';
    }

    banner.style.display = 'flex';
    banner.style.background = bgColor;
    banner.style.color = textColor;
    banner.innerHTML =
      '<span style="flex:1;font-size:13px;font-weight:600;">' +
        (typeof escHtml === 'function' ? escHtml(msg) : msg) +
      '</span>' +
      '<a href="/upgrade" style="background:rgba(255,255,255,0.2);color:' + textColor +
        ';padding:4px 14px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;"' +
        ' onclick="if(window.posthog)posthog.capture(\'trial_upgrade_clicked\',{source:\'trial_banner\',day_of_trial:' + (7 - daysLeft) + '})">' +
        'Upgrade now</a>';

    // If expired already, switch to hidden
    if (msLeft <= 0) {
      hideTrialBanner();
      if (_trialBannerInterval) { clearInterval(_trialBannerInterval); _trialBannerInterval = null; }
    }
  }

  _update();
  // Update every 60 seconds for live countdown
  _trialBannerInterval = setInterval(_update, 60000);
}

/* ────────────────────────────────────────────────────────────
 *  hideTrialBanner()
 * ──────────────────────────────────────────────────────────── */
function hideTrialBanner() {
  var banner = document.getElementById('trial-banner');
  if (banner) banner.style.display = 'none';
  if (_trialBannerInterval) { clearInterval(_trialBannerInterval); _trialBannerInterval = null; }
}

/* ────────────────────────────────────────────────────────────
 *  showPreSamplePrompt(featureKey, onConfirm, onCancel)
 *  Pre-sample confirmation for expired_free users.
 *  "This will use your one free [feature] sample. Continue?"
 *  Skipped for trialing/active_pro users.
 * ──────────────────────────────────────────────────────────── */
function showPreSamplePrompt(featureKey, onConfirm, onCancel) {
  var overlay = document.getElementById('pre-sample-prompt');
  if (!overlay) { if (onConfirm) onConfirm(); return; }

  var label = _FEATURE_LABELS[featureKey] || featureKey;

  overlay.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:24px 28px;max-width:380px;width:90%;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:8px;">Free Sample</div>' +
      '<div style="font-size:13px;color:var(--text-dim);margin-bottom:20px;line-height:1.5;">' +
        'This will use your one free <strong>' + (typeof escHtml === 'function' ? escHtml(label) : label) + '</strong> sample. Continue?' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:center;">' +
        '<button id="pre-sample-cancel" style="padding:8px 18px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text-dim);font-size:12px;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button id="pre-sample-confirm" style="padding:8px 18px;border-radius:8px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">Continue</button>' +
      '</div>' +
    '</div>';

  overlay.style.display = 'flex';

  // PostHog — spec §11: sample_offered + legacy pre_sample_prompt_shown
  if (window.posthog) {
    posthog.capture('sample_offered', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
    posthog.capture('pre_sample_prompt_shown', { feature: featureKey });
  }

  // Wire buttons
  var confirmBtn = document.getElementById('pre-sample-confirm');
  var cancelBtn = document.getElementById('pre-sample-cancel');

  if (confirmBtn) {
    confirmBtn.onclick = function() {
      overlay.style.display = 'none';
      // sample_used: spec §11 — fires when sample is consumed
      if (window.posthog) {
        posthog.capture('sample_used', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
        posthog.capture('pre_sample_confirmed', { feature: featureKey });
      }
      if (onConfirm) onConfirm();
    };
  }
  if (cancelBtn) {
    cancelBtn.onclick = function() {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('pre_sample_cancelled', { feature: featureKey });
      if (onCancel) onCancel();
    };
  }

  // Click outside to dismiss
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      if (onCancel) onCancel();
    }
  };
}

/* ────────────────────────────────────────────────────────────
 *  showSampleConversionModal(featureKey)
 *  Post-sample conversion modal. Shown AFTER the feature result
 *  is displayed, triggered by X-Is-Sample response header.
 * ──────────────────────────────────────────────────────────── */
function showSampleConversionModal(featureKey) {
  var overlay = document.getElementById('sample-conversion-modal');
  if (!overlay) return;

  var label = _FEATURE_LABELS[featureKey] || featureKey;

  overlay.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:14px;padding:28px 32px;max-width:420px;width:90%;text-align:center;box-shadow:0 12px 48px rgba(0,0,0,0.35);">' +
      '<div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--purple));display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">' +
        '<i data-lucide="sparkles" style="width:24px;height:24px;color:#fff;"></i>' +
      '</div>' +
      '<div style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">That was your free ' +
        (typeof escHtml === 'function' ? escHtml(label) : label) + ' sample</div>' +
      '<div style="font-size:13px;color:var(--text-dim);margin-bottom:22px;line-height:1.5;">' +
        'Upgrade to Pro for unlimited ' + (typeof escHtml === 'function' ? escHtml(label) : label) + ' and all other Pro features.' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;align-items:center;">' +
        '<a href="/upgrade" id="sample-modal-upgrade" style="display:inline-block;padding:10px 28px;border-radius:8px;background:var(--accent);color:#fff;font-size:13px;font-weight:700;text-decoration:none;width:100%;max-width:280px;">Upgrade to Pro</a>' +
        '<button id="sample-modal-dismiss" style="padding:8px 18px;border:none;background:none;color:var(--text-faint);font-size:12px;cursor:pointer;">Maybe later</button>' +
      '</div>' +
    '</div>';

  overlay.style.display = 'flex';

  // PostHog
  if (window.posthog) posthog.capture('sample_conversion_prompted', { feature: featureKey });

  // Refresh Lucide icons for the sparkles icon
  if (typeof refreshIcons === 'function') refreshIcons();

  // Wire dismiss
  var dismissBtn = document.getElementById('sample-modal-dismiss');
  if (dismissBtn) {
    dismissBtn.onclick = function() {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('sample_conversion_dismissed', { feature: featureKey });
    };
  }

  // Wire upgrade click tracking
  var upgradeBtn = document.getElementById('sample-modal-upgrade');
  if (upgradeBtn) {
    upgradeBtn.onclick = function() {
      // sample_converted: user upgrades immediately after sample — spec §11
      if (window.posthog) {
        posthog.capture('sample_converted', { feature: featureKey, days_since_expiry: _daysSinceExpiry() });
        posthog.capture('sample_conversion_upgrade_click', { feature: featureKey });
      }
    };
  }

  // Click outside to dismiss
  overlay.onclick = function(e) {
    if (e.target === overlay) {
      overlay.style.display = 'none';
      if (window.posthog) posthog.capture('sample_conversion_dismissed', { feature: featureKey });
    }
  };

  // Mark sample as consumed in local cache
  if (_sampleAvailability) {
    _sampleAvailability[featureKey] = false;
    _updateSampleBadges();
  }
}

/* ────────────────────────────────────────────────────────────
 *  handleSampleHeader(response, featureKey)
 *  Utility: after a gated API call, check for X-Is-Sample header
 *  and trigger the post-sample conversion modal.
 *  Call AFTER displaying the feature result to the user.
 * ──────────────────────────────────────────────────────────── */
function handleSampleHeader(response, featureKey) {
  if (!response || !response.headers) return;
  var isSample = response.headers.get('X-Is-Sample');
  if (isSample === 'true') {
    // Delay slightly to ensure the feature result is visible first
    setTimeout(function() {
      showSampleConversionModal(featureKey);
    }, 800);
  }
}

/* ────────────────────────────────────────────────────────────
 *  getSampleAvailability()
 *  Returns cached sample availability map, or null if not loaded.
 *  { chat: true, score: false, ... }
 * ──────────────────────────────────────────────────────────── */
function getClientSampleAvailability() {
  return _sampleAvailability;
}

/* ────────────────────────────────────────────────────────────
 *  _updateSampleBadges()
 *  Updates gated feature buttons with "1 free try" badges
 *  when samples are available.
 * ──────────────────────────────────────────────────────────── */
function _updateSampleBadges() {
  if (!_sampleAvailability) return;

  // Remove any existing sample badges
  var existing = document.querySelectorAll('.trial-sample-badge');
  for (var i = 0; i < existing.length; i++) {
    existing[i].remove();
  }

  // Map feature keys to button selectors
  var _FEATURE_BUTTON_MAP = {
    chat:    '#search-mode-toggle-chat, [data-feature-gate="chat"]',
    score:   '[data-feature-gate="score"]',
    apply:   '[data-feature-gate="apply"]',
    stats:   '[data-page="stats"]',
    filter:  '[data-feature-gate="filter"]',
    boolean: '[data-feature-gate="boolean"]',
    sms:     '[data-feature-gate="sms"]',
    email:   '[data-feature-gate="email"]',
  };

  var keys = Object.keys(_FEATURE_BUTTON_MAP);
  for (var k = 0; k < keys.length; k++) {
    var feature = keys[k];
    if (!_sampleAvailability[feature]) continue; // already consumed or not available

    var btns = document.querySelectorAll(_FEATURE_BUTTON_MAP[feature]);
    for (var b = 0; b < btns.length; b++) {
      var btn = btns[b];
      // Only add badge if button is positioned relatively or we can attach
      if (getComputedStyle(btn).position === 'static') {
        btn.style.position = 'relative';
      }
      var badge = document.createElement('span');
      badge.className = 'trial-sample-badge';
      badge.textContent = '1 free try';
      badge.style.cssText = 'position:absolute;top:-6px;right:-6px;background:var(--accent);color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:8px;white-space:nowrap;pointer-events:none;z-index:2;';
      btn.appendChild(badge);
    }
  }
}

/* ────────────────────────────────────────────────────────────
 *  _maybeShowUpgradeIntro()
 *  FB-TRIAL-001-S4 Part 5: Shows post-upgrade toast + referral card
 *  if ?upgraded=true is in the URL (once per page load, then param cleared).
 * ─────────────────────────────────────────────────────────── */
function _maybeShowUpgradeIntro() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('upgraded') !== 'true') return;

    // Clear param from URL without reload
    params.delete('upgraded');
    var newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
    window.history.replaceState({}, '', newUrl);

    // Delegate to referrals.js (deferred chunk — may not be loaded yet)
    if (typeof window.showUpgradeReferralIntro === 'function') {
      window.showUpgradeReferralIntro();
    } else {
      // Wait for deferred chunk
      var attempts = 0;
      var poll = setInterval(function() {
        attempts++;
        if (typeof window.showUpgradeReferralIntro === 'function') {
          clearInterval(poll);
          window.showUpgradeReferralIntro();
        } else if (attempts > 20) {
          clearInterval(poll);
        }
      }, 200);
    }

    // Part 6: ensure sidebar link visible
    if (typeof window.initSidebarReferralLink === 'function') {
      window.initSidebarReferralLink('active_pro');
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('trial-gate:upgrade-intro', e);
  }
}

/* ────────────────────────────────────────────────────────────
 *  _daysSinceExpiry()
 *  Returns days since trial expired (for PostHog event properties).
 *  Uses trial_expires_at from the banner interval if available,
 *  otherwise returns 0 as a safe default.
 * ──────────────────────────────────────────────────────────── */
function _daysSinceExpiry() {
  try {
    // Try to read from cached profile if available
    var cached = sessionStorage.getItem('bj_trial_expires_at');
    if (cached) {
      var diff = Date.now() - new Date(cached).getTime();
      return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
    }
  } catch (_e) { /* ignore */ }
  return 0;
}

/* ────────────────────────────────────────────────────────────
 *  renderExpiredNudges()
 *  §6.4: Contextual inline nudges for expired_free users with
 *  all samples consumed. Injects small upgrade prompts into 7
 *  feature locations. Fires expired_gate_hit for each location.
 * ──────────────────────────────────────────────────────────── */
function renderExpiredNudges() {
  var upgradeUrl = '/upgrade';
  var nudgeStyle = 'display:inline-flex;align-items:center;gap:6px;padding:6px 12px;' +
    'border-radius:8px;background:var(--bg-card);border:1px solid var(--border);' +
    'font-size:12px;color:var(--text-dim);margin-top:6px;';
  var ctaStyle = 'color:var(--accent);font-weight:700;text-decoration:none;';

  function _makeNudge(msgHtml, feature) {
    var el = document.createElement('div');
    el.className = 'trial-expired-nudge';
    el.setAttribute('data-feature', feature);
    el.style.cssText = nudgeStyle;
    el.innerHTML = msgHtml + ' <a href="' + upgradeUrl + '" style="' + ctaStyle + '">Upgrade</a>';
    el.querySelector('a').addEventListener('click', function() {
      if (window.posthog) posthog.capture('trial_upgrade_clicked', {
        source: 'inline_nudge',
        feature: feature,
        days_since_expiry: _daysSinceExpiry(),
      });
    });
    return el;
  }

  function _fireGateHit(feature) {
    if (window.posthog) posthog.capture('expired_gate_hit', {
      feature: feature,
      days_since_expiry: _daysSinceExpiry(),
    });
  }

  // 1. Chat tab — disable input, show static card above it
  var chatInput = document.getElementById('chat-input');
  if (chatInput && !document.querySelector('.trial-expired-nudge[data-feature="chat"]')) {
    _fireGateHit('chat');
    var chatNudge = _makeNudge('You used your free AI Chat sample.', 'chat');
    chatNudge.style.cssText += 'width:100%;box-sizing:border-box;justify-content:center;';
    chatInput.parentNode.insertBefore(chatNudge, chatInput);
    chatInput.disabled = true;
    chatInput.placeholder = 'Upgrade to continue using AI Chat';
    chatInput.style.opacity = '0.4';
  }

  // 2. Boolean search toggle — disable + add Pro badge
  var booleanToggle = document.getElementById('boolean-toggle') ||
    document.querySelector('[data-feature-gate="boolean"]');
  if (booleanToggle && !document.querySelector('.trial-expired-nudge[data-feature="boolean"]')) {
    _fireGateHit('boolean');
    booleanToggle.disabled = true;
    booleanToggle.style.opacity = '0.4';
    var boolNudge = document.createElement('span');
    boolNudge.className = 'trial-expired-nudge';
    boolNudge.setAttribute('data-feature', 'boolean');
    boolNudge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
      'background:var(--accent);color:#fff;font-size:9px;font-weight:700;';
    boolNudge.textContent = 'Pro';
    booleanToggle.parentNode && booleanToggle.parentNode.insertBefore(boolNudge, booleanToggle.nextSibling);
  }

  // 3. Stats page — blur charts with upgrade overlay
  var statsPage = document.getElementById('page-stats');
  if (statsPage && !document.querySelector('.trial-expired-nudge[data-feature="stats"]')) {
    _fireGateHit('stats');
    var statsOverlay = document.createElement('div');
    statsOverlay.className = 'trial-expired-nudge';
    statsOverlay.setAttribute('data-feature', 'stats');
    statsOverlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'background:rgba(var(--bg-rgb,255,255,255),0.85);backdrop-filter:blur(4px);' +
      'z-index:10;border-radius:8px;gap:10px;';
    statsOverlay.innerHTML = '<div style="font-size:14px;font-weight:600;color:var(--text);">' +
      'Upgrade to see your analytics</div>' +
      '<a href="' + upgradeUrl + '" style="' + ctaStyle + 'font-size:13px;padding:8px 20px;' +
      'background:var(--accent);color:#fff;border-radius:8px;text-decoration:none;">Upgrade to Pro</a>';
    statsOverlay.querySelector('a').addEventListener('click', function() {
      if (window.posthog) posthog.capture('trial_upgrade_clicked', { source: 'inline_nudge', feature: 'stats' });
    });
    var statsInner = statsPage.querySelector('.page-content, .stats-content, section') || statsPage;
    statsInner.style.position = 'relative';
    statsInner.appendChild(statsOverlay);
  }

  // 4. Saved filter counter nudge — append after filter list header
  var filterListHeader = document.getElementById('saved-filters-header') ||
    document.querySelector('.sf-header, #saved-searches-header');
  if (filterListHeader && !document.querySelector('.trial-expired-nudge[data-feature="filter"]')) {
    _fireGateHit('filter');
    var filterNudge = _makeNudge('You\'ve used your free filter sample.', 'filter');
    filterListHeader.parentNode && filterListHeader.parentNode.insertBefore(filterNudge, filterListHeader.nextSibling);
  }

  // 5. SMS notification toggles — disable + badge
  var smsToggles = document.querySelectorAll('[data-feature-gate="sms"], .sms-toggle, #sms-enabled-toggle');
  if (smsToggles.length > 0 && !document.querySelector('.trial-expired-nudge[data-feature="sms"]')) {
    _fireGateHit('sms');
    smsToggles.forEach(function(toggle) {
      toggle.disabled = true;
      toggle.style.opacity = '0.4';
      var badge = document.createElement('span');
      badge.className = 'trial-expired-nudge';
      badge.setAttribute('data-feature', 'sms');
      badge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
        'background:var(--bg-card);border:1px solid var(--border);color:var(--text-dim);font-size:9px;font-weight:700;';
      badge.textContent = 'Pro feature';
      toggle.parentNode && toggle.parentNode.insertBefore(badge, toggle.nextSibling);
    });
  }

  // 6. Resume score column — "Upgrade to score more" note below score cards
  var scoreArea = document.querySelector('.readiness-area, #readiness-section, [data-feature-gate="score"]');
  if (scoreArea && !document.querySelector('.trial-expired-nudge[data-feature="score"]')) {
    _fireGateHit('score');
    var scoreNudge = _makeNudge('Upgrade to score more resumes.', 'score');
    scoreArea.appendChild(scoreNudge);
  }

  // 7. Extension auto-apply button placeholder — injected via data attribute
  // Extension handles its own gating; we ensure the page-level settings button is flagged
  var autoApplyBtn = document.querySelector('[data-feature-gate="apply"], #auto-apply-btn, .auto-apply-toggle');
  if (autoApplyBtn && !document.querySelector('.trial-expired-nudge[data-feature="apply"]')) {
    _fireGateHit('apply');
    autoApplyBtn.disabled = true;
    autoApplyBtn.style.opacity = '0.4';
    var applyBadge = document.createElement('span');
    applyBadge.className = 'trial-expired-nudge';
    applyBadge.setAttribute('data-feature', 'apply');
    applyBadge.style.cssText = 'margin-left:6px;padding:2px 6px;border-radius:4px;' +
      'background:var(--accent);color:#fff;font-size:9px;font-weight:700;';
    applyBadge.textContent = 'Pro';
    autoApplyBtn.parentNode && autoApplyBtn.parentNode.insertBefore(applyBadge, autoApplyBtn.nextSibling);
  }
}

/* ─── Exports to window + BJ namespace ─── */
window.initTrialGate = initTrialGate;
window.showPreSamplePrompt = showPreSamplePrompt;
window.showSampleConversionModal = showSampleConversionModal;
window.hideTrialBanner = hideTrialBanner;
window.handleSampleHeader = handleSampleHeader;
window.getClientSampleAvailability = getClientSampleAvailability;
window.renderExpiredNudges = renderExpiredNudges;

if (typeof window.BJ !== 'undefined') {
  BJ.initTrialGate = initTrialGate;
  BJ.showPreSamplePrompt = showPreSamplePrompt;
  BJ.showSampleConversionModal = showSampleConversionModal;
  BJ.hideTrialBanner = hideTrialBanner;
  BJ.handleSampleHeader = handleSampleHeader;
  BJ.getClientSampleAvailability = getClientSampleAvailability;
  BJ.renderExpiredNudges = renderExpiredNudges;
}
