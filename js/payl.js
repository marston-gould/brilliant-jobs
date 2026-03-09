/**
 * payl.js — Pay After You Land Dashboard UI
 * Session: FB-PAYL-S2
 * Depends on: tier-gating.js (isPaylUser, getUserTier), billing.js, referrals.js
 *
 * Provides:
 * - PAYL enrollment modal (3-step: PDF upload → card auth → confirmation)
 * - LinkedIn PDF upload widget (drag-and-drop + file picker)
 * - Referral progress dashboard widget
 * - Employment self-report flow (nudge + confirmation)
 * - PostHog event instrumentation (12 events per FB-PAYL-001 Section 6.4)
 * - Stripe setup_intent integration (card on file without charge)
 */

// ─── PostHog PAYL event helper ───
function _paylEvent(eventName, props) {
  try {
    if (typeof posthog !== 'undefined' && posthog.capture) {
      posthog.capture('payl_' + eventName, Object.assign({ tier: 'payl' }, props || {}));
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_posthog', e, { event: eventName });
  }
}

// ─── PAYL state ───
var _paylEnrollment = null;
var _paylReferrals = [];
var _paylStep = 0; // 0=not started, 1=pdf, 2=card, 3=done
var _paylUploadInProgress = false;

// ─── Initialize PAYL UI ───
async function initPayl() {
  if (typeof window.isPaylUser !== 'function') return;

  try {
    // Load enrollment data for PAYL users
    if (window.isPaylUser()) {
      await _loadPaylEnrollment();
      _renderReferralWidget();
      _checkEmploymentNudge();
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_init', e);
  }
}

// ─── Load PAYL enrollment from DB ───
async function _loadPaylEnrollment() {
  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) return;
    var user = (await sb.auth.getUser()).data?.user;
    if (!user) return;

    var { data, error } = await sb
      .from('payl_enrollments')
      .select('*, payl_referrals(*)')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      if (typeof reportError === 'function') reportError('payl_load', error);
      return;
    }

    if (data) {
      _paylEnrollment = data;
      _paylReferrals = data.payl_referrals || [];
    }
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_load', e);
  }
}

// ─── PAYL Tier Card (called from billing.js) ───
function getPaylTierCard(currentTier) {
  var isPaul = currentTier === 'payl';
  return {
    id: 'payl',
    name: 'Pay After You Land',
    price: 0,
    credits: 300,
    payg: 10,
    features: [
      'Full Pro features — $0 upfront',
      'Pay only when you land a job',
      'Upload LinkedIn PDF to verify',
      '3 referrals to keep access',
      '180-day access window'
    ],
    isCurrent: isPaul,
    isPayl: true
  };
}

// ─── Render PAYL tier card HTML ───
function renderPaylTierCard(currentTier) {
  var isPayl = currentTier === 'payl';
  var highlight = !isPayl ? ' sub-tier-highlight' : '';
  return `
    <div class="sub-tier-card sub-tier-payl${isPayl ? ' sub-tier-current' : ''}${highlight}" style="display:flex;flex-direction:column;border:2px solid var(--accent);position:relative;">
      ${isPayl ? '<div class="sub-tier-badge">Current</div>' : '<div class="sub-tier-badge" style="background:var(--accent);color:#fff;">Popular</div>'}
      <div class="sub-tier-name">Pay After You Land</div>
      <div class="sub-tier-price">$0<span class="sub-tier-interval"> upfront</span></div>
      <div class="sub-tier-credits">Full Pro features</div>
      <div class="sub-tier-payg" style="color:var(--accent);font-weight:600;">Pay when you get hired</div>
      <ul class="sub-tier-features" style="flex:1;">
        <li>All Pro filters &amp; tools</li>
        <li>AI resume scoring &amp; rewrites</li>
        <li>Upload LinkedIn PDF to verify</li>
        <li>Refer 3 friends to qualify</li>
        <li>180-day access window</li>
      </ul>
      <div style="margin-top:auto;text-align:center;">
        ${isPayl
          ? '<button class="btn-secondary btn-sm" disabled>Current Plan</button>'
          : currentTier === 'pro'
            ? ''
            : '<button class="btn-primary btn-sm" onclick="openPaylEnrollment()" style="background:var(--accent);">Get Started — Free</button>'
        }
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════
// ENROLLMENT MODAL (3-step flow)
// ═══════════════════════════════════════════════

function openPaylEnrollment() {
  _paylStep = 1;
  _paylEvent('enrollment_started');

  var modal = document.getElementById('payl-enrollment-modal');
  if (modal) {
    modal.classList.remove('u-hidden');
    _renderEnrollmentStep();
    return;
  }

  // Create modal if first time
  var overlay = document.createElement('div');
  overlay.id = 'payl-enrollment-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:520px;padding:0;overflow:hidden;">
      <div class="payl-modal-header" style="background:var(--accent);color:#fff;padding:20px 24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="margin:0;font-size:16px;font-weight:700;">Pay After You Land</h3>
          <button onclick="closePaylEnrollment()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:18px;">&times;</button>
        </div>
        <div class="payl-steps" style="display:flex;gap:8px;margin-top:12px;">
          <div class="payl-step-dot" data-step="1" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
          <div class="payl-step-dot" data-step="2" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
          <div class="payl-step-dot" data-step="3" style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,0.3);"></div>
        </div>
      </div>
      <div id="payl-modal-body" style="padding:24px;"></div>
    </div>`;
  document.body.appendChild(overlay);
  _renderEnrollmentStep();
}

function closePaylEnrollment() {
  var modal = document.getElementById('payl-enrollment-modal');
  if (modal) modal.classList.add('u-hidden');
}

function _renderEnrollmentStep() {
  var body = document.getElementById('payl-modal-body');
  if (!body) return;

  // Update step dots
  document.querySelectorAll('.payl-step-dot').forEach(function(dot) {
    var step = parseInt(dot.getAttribute('data-step'));
    dot.style.background = step <= _paylStep ? '#fff' : 'rgba(255,255,255,0.3)';
  });

  if (_paylStep === 1) {
    body.innerHTML = _renderPdfUploadStep();
  } else if (_paylStep === 2) {
    body.innerHTML = _renderCardAuthStep();
  } else if (_paylStep === 3) {
    body.innerHTML = _renderConfirmationStep();
  }
}

// ─── Step 1: LinkedIn PDF Upload ───
function _renderPdfUploadStep() {
  return `
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Step 1: Verify Your Identity</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">Upload a PDF export of your LinkedIn profile</div>
    </div>
    <div id="payl-pdf-dropzone"
         ondragover="event.preventDefault();this.classList.add('payl-drop-active');"
         ondragleave="this.classList.remove('payl-drop-active');"
         ondrop="event.preventDefault();this.classList.remove('payl-drop-active');handlePaylPdfDrop(event);"
         style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;transition:border-color 0.2s;"
         onclick="document.getElementById('payl-pdf-input').click();">
      <div style="margin-bottom:8px;"><i data-lucide="upload" class="icon-xl icon-stroke" style="stroke:var(--accent);"></i></div>
      <div style="font-size:13px;font-weight:600;">Drag & drop your LinkedIn PDF here</div>
      <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">or click to browse (PDF only, max 10MB)</div>
      <input type="file" id="payl-pdf-input" accept="application/pdf" style="display:none;" onchange="handlePaylPdfSelect(event)">
    </div>
    <div id="payl-pdf-status" style="margin-top:12px;text-align:center;font-size:12px;"></div>
    <div id="payl-pdf-preview" class="u-hidden" style="margin-top:16px;padding:12px;background:var(--bg-input);border-radius:8px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">Parsed Profile Preview</div>
      <div id="payl-pdf-fields"></div>
      <div style="margin-top:12px;text-align:center;">
        <button class="btn-primary btn-sm" onclick="confirmPaylPdf()">Looks Good — Continue</button>
      </div>
    </div>
    <div style="margin-top:12px;text-align:center;">
      <a href="https://www.linkedin.com/help/linkedin/answer/a566336" target="_blank" rel="noopener" style="font-size:11px;color:var(--accent);">How to export your LinkedIn profile as PDF</a>
    </div>`;
}

// ─── PDF drag-and-drop handler ───
function handlePaylPdfDrop(event) {
  var files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    _processPaylPdf(files[0]);
  }
}

function handlePaylPdfSelect(event) {
  var files = event.target?.files;
  if (files && files.length > 0) {
    _processPaylPdf(files[0]);
  }
}

async function _processPaylPdf(file) {
  var statusEl = document.getElementById('payl-pdf-status');
  if (!statusEl) return;

  // Validate
  if (file.type !== 'application/pdf') {
    statusEl.innerHTML = '<span style="color:var(--warm);">Please upload a PDF file</span>';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    statusEl.innerHTML = '<span style="color:var(--warm);">File must be under 10MB</span>';
    return;
  }

  if (_paylUploadInProgress) return;
  _paylUploadInProgress = true;
  statusEl.innerHTML = '<span style="color:var(--accent);">Uploading and parsing...</span>';

  _paylEvent('pdf_uploaded');

  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) throw new Error('No Supabase client');
    var user = (await sb.auth.getUser()).data?.user;
    if (!user) throw new Error('Not authenticated');

    // Upload to Supabase Storage
    var path = user.id + '/linkedin-profile.pdf';
    var { error: uploadError } = await sb.storage
      .from('linkedin-profiles')
      .upload(path, file, { upsert: true, contentType: 'application/pdf' });

    if (uploadError) throw uploadError;

    // Call parse-linkedin-pdf EF via gateway
    var { data: parseResult, error: parseError } = await sb.functions.invoke('api-gateway', {
      body: { route: 'parse-linkedin-pdf', action: 'parse', user_id: user.id, pdf_path: path }
    });

    if (parseError) throw parseError;

    var parsed = typeof parseResult === 'string' ? JSON.parse(parseResult) : parseResult;

    if (parsed.error) {
      _paylEvent('pdf_rejected', { reason: parsed.error });
      statusEl.innerHTML = '<span style="color:var(--warm);">' + (parsed.error || 'Failed to parse PDF') + '</span>';
      _paylUploadInProgress = false;
      return;
    }

    _paylEvent('pdf_parsed', { field_count: Object.keys(parsed.profile || {}).length });

    // Show preview
    var preview = document.getElementById('payl-pdf-preview');
    var fields = document.getElementById('payl-pdf-fields');
    if (preview && fields) {
      var profile = parsed.profile || {};
      fields.innerHTML = [
        _pdfField('Name', profile.name),
        _pdfField('Headline', profile.headline),
        _pdfField('Location', profile.location),
        _pdfField('Experience', (profile.experience || []).length + ' entries'),
        _pdfField('Skills', (profile.skills || []).length + ' listed'),
        _pdfField('Connections', profile.connections || 'N/A')
      ].join('');
      preview.classList.remove('u-hidden');
      statusEl.innerHTML = '<span style="color:hsl(142,60%,40%);">PDF parsed successfully</span>';
    }

    // Store parsed data for next step
    window._paylParsedProfile = parsed.profile;
    window._paylPdfPath = path;
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_pdf_upload', e);
    statusEl.innerHTML = '<span style="color:var(--warm);">Upload failed. Please try again.</span>';
  }

  _paylUploadInProgress = false;
  // Refresh Lucide icons for the upload area
  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

function _pdfField(label, value) {
  return '<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);">' +
    '<span style="color:var(--text-dim);">' + label + '</span>' +
    '<span style="font-weight:500;">' + (value || '—') + '</span></div>';
}

function confirmPaylPdf() {
  _paylStep = 2;
  _renderEnrollmentStep();
}

// ─── Step 2: Card Authorization (Stripe setup_intent) ───
function _renderCardAuthStep() {
  return `
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">Step 2: Authorize Payment Method</div>
      <div style="font-size:12px;color:var(--text-dim);margin-bottom:16px;">Add a card on file. You won't be charged until you land a job.</div>
    </div>
    <div style="padding:16px;background:var(--bg-input);border-radius:10px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <i data-lucide="shield-check" class="icon-md icon-stroke" style="stroke:hsl(142,60%,40%);"></i>
        <span style="font-size:12px;font-weight:500;color:hsl(142,60%,30%);">No charge today — card stored securely via Stripe</span>
      </div>
      <div id="payl-card-element" style="padding:12px;background:var(--bg-card);border:1px solid var(--border);border-radius:8px;min-height:44px;">
        <!-- Stripe Elements card input mounts here -->
        <div style="font-size:12px;color:var(--text-dim);text-align:center;padding:8px;">Loading payment form...</div>
      </div>
      <div id="payl-card-error" style="margin-top:8px;font-size:11px;color:var(--warm);"></div>
    </div>
    <div style="text-align:center;">
      <button class="btn-primary" id="payl-authorize-btn" onclick="authorizePaylCard()" style="min-width:200px;">
        Authorize Card — No Charge
      </button>
    </div>
    <div style="margin-top:12px;text-align:center;font-size:11px;color:var(--text-faint);">
      Your card will only be charged when you confirm you've landed a job, or when your 180-day window expires (if card on file).
    </div>`;
}

async function authorizePaylCard() {
  var btn = document.getElementById('payl-authorize-btn');
  var errorEl = document.getElementById('payl-card-error');
  if (btn) btn.disabled = true;
  if (btn) btn.textContent = 'Authorizing...';

  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) throw new Error('No Supabase client');

    // Call backend to create Stripe setup_intent
    var { data, error } = await sb.functions.invoke('api-gateway', {
      body: {
        route: 'payl-referral-webhook',
        action: 'setup_intent',
        pdf_path: window._paylPdfPath
      }
    });

    if (error) throw error;

    var result = typeof data === 'string' ? JSON.parse(data) : data;

    if (result.error) {
      if (errorEl) errorEl.textContent = result.error;
      if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
      return;
    }

    // If Stripe.js is loaded, confirm the setup intent
    if (typeof Stripe !== 'undefined' && result.client_secret) {
      var stripe = Stripe(result.publishable_key || window.BJ?.stripeKey);
      var { error: stripeError } = await stripe.confirmCardSetup(result.client_secret);
      if (stripeError) {
        if (errorEl) errorEl.textContent = stripeError.message;
        if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
        return;
      }
    }

    // Success — move to step 3
    _paylStep = 3;
    _renderEnrollmentStep();
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_card_auth', e);
    if (errorEl) errorEl.textContent = 'Authorization failed. Please try again.';
    if (btn) { btn.disabled = false; btn.textContent = 'Authorize Card — No Charge'; }
  }

  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

// ─── Step 3: Confirmation ───
function _renderConfirmationStep() {
  _paylEvent('activated');

  return `
    <div style="text-align:center;padding:16px 0;">
      <div style="font-size:32px;margin-bottom:8px;"><i data-lucide="circle-check" class="icon-xl icon-stroke" style="stroke:hsl(142,60%,40%);width:48px;height:48px;"></i></div>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;">You're In!</div>
      <div style="font-size:13px;color:var(--text-dim);margin-bottom:16px;">Pro features are now unlocked. Welcome to Pay After You Land.</div>
    </div>
    <div style="background:var(--bg-input);border-radius:10px;padding:16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:8px;">What happens next:</div>
      <div style="font-size:12px;line-height:1.6;">
        <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px;">
          <span style="color:var(--accent);font-weight:700;">1.</span>
          <span>Share your referral link with 3 friends. When they subscribe and stay for 30 days, your access is secured.</span>
        </div>
        <div style="display:flex;align-items:start;gap:8px;margin-bottom:6px;">
          <span style="color:var(--accent);font-weight:700;">2.</span>
          <span>Use all Pro features — filters, AI scoring, resume rewrites, auto-apply — starting now.</span>
        </div>
        <div style="display:flex;align-items:start;gap:8px;">
          <span style="color:var(--accent);font-weight:700;">3.</span>
          <span>When you land a job, let us know. Your card will be charged at the Pro rate.</span>
        </div>
      </div>
    </div>
    <div id="payl-referral-link-box" style="padding:12px;background:var(--bg-card);border:1px solid var(--accent);border-radius:8px;display:flex;align-items:center;gap:8px;">
      <input type="text" id="payl-referral-link" value="${_paylEnrollment?.referral_code ? 'brilliantjobs.app/r/' + _paylEnrollment.referral_code : 'Loading...'}" readonly style="flex:1;background:transparent;border:none;font-size:12px;color:var(--text);outline:none;">
      <button class="btn-primary btn-sm" onclick="copyPaylReferralLink()" style="white-space:nowrap;">Copy Link</button>
    </div>
    <div style="margin-top:16px;text-align:center;">
      <button class="btn-primary" onclick="closePaylEnrollment();location.reload();" style="min-width:200px;">Start Exploring Jobs</button>
    </div>`;
}

// ═══════════════════════════════════════════════
// REFERRAL PROGRESS WIDGET (dashboard)
// ═══════════════════════════════════════════════

function _renderReferralWidget() {
  var container = document.getElementById('payl-referral-widget');
  if (!container || !_paylEnrollment) return;

  var qualified = _paylEnrollment.referrals_qualified || 0;
  var total = 3;
  var pct = Math.min(100, Math.round((qualified / total) * 100));
  var daysRemaining = 0;
  if (_paylEnrollment.expires_at) {
    daysRemaining = Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000));
  }

  var statusText = qualified >= total
    ? 'All set — you\'re covered!'
    : qualified === (total - 1)
      ? '1 more to go!'
      : 'Share your link to qualify';

  var ctaText = qualified >= total
    ? ''
    : '<button class="btn-primary btn-sm" onclick="copyPaylReferralLink()" style="white-space:nowrap;">Share Link</button>';

  container.classList.remove('u-hidden');
  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="flex:1;min-width:200px;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-size:13px;font-weight:600;">Pay After You Land</span>
          <span style="font-size:11px;color:var(--text-dim);">${daysRemaining}d remaining</span>
        </div>
        <div style="background:var(--bg-input);border-radius:4px;height:8px;overflow:hidden;margin-bottom:4px;">
          <div style="background:var(--accent);height:100%;width:${pct}%;border-radius:4px;transition:width 0.3s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);">
          <span>${qualified}/${total} referrals qualified</span>
          <span>${statusText}</span>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        ${_renderReferralDots()}
        ${ctaText}
      </div>
    </div>`;
}

function _renderReferralDots() {
  var qualified = _paylEnrollment?.referrals_qualified || 0;
  var html = '';
  for (var i = 0; i < 3; i++) {
    var status = i < qualified ? 'qualified' : 'pending';
    var color = status === 'qualified' ? 'hsl(142,60%,40%)' : 'var(--border)';
    var icon = status === 'qualified' ? 'check' : 'user-plus';
    html += '<div style="width:28px;height:28px;border-radius:50%;background:' + color + ';display:flex;align-items:center;justify-content:center;">' +
      '<i data-lucide="' + icon + '" style="width:14px;height:14px;stroke:#fff;stroke-width:2;"></i></div>';
  }
  return html;
}

// ─── Copy referral link ───
function copyPaylReferralLink() {
  var code = _paylEnrollment?.referral_code;
  if (!code) return;

  var url = 'https://brilliantjobs.app/r/' + code;
  navigator.clipboard.writeText(url).then(function() {
    _paylEvent('referral_link_copied');
    if (typeof showToast === 'function') showToast('Referral link copied!');
  }).catch(function() {
    // Fallback: select input
    var input = document.getElementById('payl-referral-link');
    if (input) { input.select(); document.execCommand('copy'); }
  });
}

// ─── Share referral link (native share API) ───
function sharePaylReferralLink() {
  var code = _paylEnrollment?.referral_code;
  if (!code) return;

  var url = 'https://brilliantjobs.app/r/' + code;

  if (navigator.share) {
    navigator.share({
      title: 'Brilliant Jobs — Find your next role',
      text: 'I use Brilliant Jobs to find jobs. Try it out!',
      url: url
    }).then(function() {
      _paylEvent('referral_link_shared', { channel: 'native_share' });
    }).catch(function() { /* User cancelled */ });
  } else {
    copyPaylReferralLink();
  }
}

// ═══════════════════════════════════════════════
// EMPLOYMENT SELF-REPORT FLOW
// ═══════════════════════════════════════════════

function _checkEmploymentNudge() {
  if (!_paylEnrollment || _paylEnrollment.status !== 'active') return;
  if (!_paylEnrollment.activated_at) return;

  var daysSince = Math.floor((new Date() - new Date(_paylEnrollment.activated_at)) / 86400000);
  var nudgeDays = [90, 120, 150, 175];

  // Check if we should show nudge (within 3 days of a nudge point)
  var shouldNudge = nudgeDays.some(function(d) { return daysSince >= d && daysSince <= d + 3; });
  if (!shouldNudge) return;

  // Check if user dismissed recently
  try {
    var lastDismiss = localStorage.getItem('bj_payl_nudge_dismiss');
    if (lastDismiss && (Date.now() - parseInt(lastDismiss)) < 7 * 86400000) return;
  } catch (e) { /* localStorage unavailable */ }

  _showEmploymentNudge(daysSince);
}

function _showEmploymentNudge(daysSince) {
  var nudge = document.getElementById('payl-employment-nudge');
  if (!nudge) return;

  var isFinal = daysSince >= 175;
  var daysRemaining = _paylEnrollment.expires_at
    ? Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000))
    : 0;

  nudge.classList.remove('u-hidden');
  nudge.innerHTML = `
    <div style="display:flex;align-items:start;gap:12px;padding:16px;background:var(--bg-input);border-radius:10px;border:1px solid ${isFinal ? 'var(--warm)' : 'var(--border)'};">
      <div style="flex-shrink:0;"><i data-lucide="${isFinal ? 'alert-circle' : 'briefcase'}" class="icon-lg icon-stroke" style="stroke:${isFinal ? 'var(--warm)' : 'var(--accent)'};"></i></div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;">${isFinal ? 'Final Check-In — PAYL expires soon' : 'Have you landed a new role?'}</div>
        <div style="font-size:12px;color:var(--text-dim);margin-bottom:8px;">
          ${isFinal
            ? 'Your PAYL window expires in ' + daysRemaining + ' days. After that, your account will revert to Free unless you convert to Pro.'
            : 'It\'s been ' + daysSince + ' days since you activated Pay After You Land. Let us know if you\'ve secured a position.'}
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn-primary btn-sm" onclick="reportPaylEmployment()">I Got the Job!</button>
          <button class="btn-secondary btn-sm" onclick="dismissPaylNudge()">Still Looking</button>
        </div>
      </div>
    </div>`;

  if (typeof window.refreshIcons === 'function') window.refreshIcons();
}

function reportPaylEmployment() {
  _paylEvent('employment_reported');

  // Show confirmation modal
  var daysRemaining = _paylEnrollment?.expires_at
    ? Math.max(0, Math.ceil((new Date(_paylEnrollment.expires_at) - new Date()) / 86400000))
    : 0;

  var nudge = document.getElementById('payl-employment-nudge');
  if (!nudge) return;

  nudge.innerHTML = `
    <div style="padding:16px;background:hsl(142,50%,96%);border:1px solid hsl(142,40%,85%);border-radius:10px;">
      <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:hsl(142,60%,30%);">Congratulations!</div>
      <div style="font-size:12px;margin-bottom:12px;">Your Pro subscription will begin at the standard rate. Your saved card will be charged on your next billing date.</div>
      <div style="font-size:11px;color:var(--text-dim);margin-bottom:12px;">All your filters, resumes, and pipeline data will remain exactly as they are.</div>
      <div style="display:flex;gap:8px;">
        <button class="btn-primary btn-sm" onclick="confirmPaylConversion()">Confirm — Start Pro</button>
        <button class="btn-secondary btn-sm" onclick="dismissPaylNudge()">Not Yet</button>
      </div>
    </div>`;
}

async function confirmPaylConversion() {
  try {
    var sb = window.BJ?.sb || window.supabase;
    if (!sb) return;

    var { data, error } = await sb.functions.invoke('api-gateway', {
      body: { route: 'payl-expiry-check', action: 'convert', user_id: _paylEnrollment.user_id }
    });

    if (error) throw error;

    _paylEvent('converted');

    if (typeof showToast === 'function') showToast('Welcome to Pro! Your subscription is now active.');
    setTimeout(function() { location.reload(); }, 1500);
  } catch (e) {
    if (typeof reportError === 'function') reportError('payl_convert', e);
    if (typeof showToast === 'function') showToast('Conversion failed. Please try again.', 'error');
  }
}

function dismissPaylNudge() {
  var nudge = document.getElementById('payl-employment-nudge');
  if (nudge) nudge.classList.add('u-hidden');
  try { localStorage.setItem('bj_payl_nudge_dismiss', Date.now().toString()); } catch (e) { /* ok */ }
}

// ═══════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════

window.initPayl = initPayl;
window.openPaylEnrollment = openPaylEnrollment;
window.closePaylEnrollment = closePaylEnrollment;
window.handlePaylPdfDrop = handlePaylPdfDrop;
window.handlePaylPdfSelect = handlePaylPdfSelect;
window.confirmPaylPdf = confirmPaylPdf;
window.authorizePaylCard = authorizePaylCard;
window.copyPaylReferralLink = copyPaylReferralLink;
window.sharePaylReferralLink = sharePaylReferralLink;
window.reportPaylEmployment = reportPaylEmployment;
window.confirmPaylConversion = confirmPaylConversion;
window.dismissPaylNudge = dismissPaylNudge;
window.renderPaylTierCard = renderPaylTierCard;
window.getPaylTierCard = getPaylTierCard;

// Auto-initialize when deferred chunk loads (payl.js is in the deferred chunk)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  initPayl();
} else {
  document.addEventListener('DOMContentLoaded', initPayl);
}
