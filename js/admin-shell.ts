// @ts-nocheck
/* ───────────────────────────────────────────────────────────
   admin-shell.js — Auth gate + MFA + init for standalone /admin page
   CS-006: AD-FIX-02 — MFA enforcement added
   
   This is the entry point for admin.html. It handles:
   1. Supabase auth check
   2. Admin role verification
   3. MFA factor check (redirect to setup if no TOTP enrolled)
   4. Redirect non-admins
   5. Init admin page when authenticated + MFA verified
   ─────────────────────────────────────────────────────────── */

(async function() {
  'use strict';

  // Version display
  document.querySelectorAll('.bj-version').forEach(function(el) { el.textContent = BJ_VERSION; });
  document.querySelectorAll('.bj-year').forEach(function(el) { el.textContent = new Date().getFullYear(); });
  console.log('[BJ] Admin Console ' + BJ_VERSION);

  var gate = document.getElementById('admin-gate');
  var denied = document.getElementById('admin-denied');
  var shell = document.getElementById('admin-shell');
  var mfaSetup = document.getElementById('admin-mfa-setup');

  try {
    // 1. Check auth
    var authRes = await sb.auth.getUser();
    if (!authRes.data || !authRes.data.user) {
      // Not logged in — redirect to login
      window.location.href = '/?redirect=/admin';
      return;
    }

    var user = authRes.data.user;
    window.currentUser = user;
    // G11: also update the let binding in globals.js scope (let !== window property)
    currentUser = user;

    // 2. Check admin role
    var profileRes = await sb.from('profiles')
      .select('role, approved, plan')
      .eq('id', user.id)
      .single();

    if (profileRes.error || !profileRes.data) {
      showDenied();
      return;
    }

    var profile = profileRes.data;

    if (profile.role !== 'admin') {
      showDenied();
      return;
    }

    // 3. CS-006: MFA factor check (AD-FIX-02)
    var mfaRes = await sb.auth.mfa.listFactors();
    var totpFactors = (mfaRes.data && mfaRes.data.totp) ? mfaRes.data.totp : [];
    var verifiedFactors = totpFactors.filter(function(f) { return f.status === 'verified'; });

    if (verifiedFactors.length === 0) {
      // No MFA enrolled — show setup flow
      gate.style.display = 'none';
      showMfaSetup(user);
      return;
    }

    // 4. Check AAL — ensure this session has completed MFA challenge
    var aalRes = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalRes.data && aalRes.data.currentLevel === 'aal1' && aalRes.data.nextLevel === 'aal2') {
      // MFA enrolled but not verified this session — challenge
      gate.style.display = 'none';
      showMfaChallenge(verifiedFactors[0].id, user, profile);
      return;
    }

    // 5. Admin + MFA verified — show the console
    showAdminConsole(user, profile);

  } catch (e) {
    reportError('admin_shell', e);
    console.error('[Admin Shell] Auth error:', e);
    if (window.posthog) posthog.capture('admin_auth_error', { error: e.message });
    showDenied();
  }

  function showAdminConsole(user, profile) {
    gate.style.display = 'none';
    if (mfaSetup) mfaSetup.style.display = 'none';
    shell.style.display = 'block';

    // CS-003: PostHog identity resolution for admin surface (CX-01)
    if (window.posthog) {
      posthog.identify(user.id, {
        email: user.email,
        role: profile.role,
        plan: profile.plan,
      });
      posthog.register({ bj_surface: 'admin' });
    }

    // Set user email in topbar
    var emailEl = document.getElementById('admin-user-email');
    if (emailEl) emailEl.textContent = user.email;

    // Set version in topbar
    var versionEl = document.getElementById('admin-version');
    if (versionEl) versionEl.textContent = BJ_VERSION;

    // Init admin page
    if (typeof initAdminPage === 'function') {
      initAdminPage();
    }
    // POD3-LUCIDE: Initialize Lucide icons in admin panel
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
      lucide.createIcons();
    }
    window.refreshIcons = function() {
      if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
      }
    };
  }

  // ── MFA Setup Flow (new enrollment) ──
  async function showMfaSetup(user) {
    if (!mfaSetup) { showDenied(); return; }
    mfaSetup.style.display = 'block';

    var qrContainer = document.getElementById('mfa-qr-container');
    var qrLoading = document.getElementById('mfa-qr-loading');
    var qrImg = document.getElementById('mfa-qr-img');
    var secretDisplay = document.getElementById('mfa-secret-display');
    var secretCode = document.getElementById('mfa-secret-code');
    var verifyInput = document.getElementById('mfa-verify-code');
    var verifyBtn = document.getElementById('mfa-verify-btn');
    var errorEl = document.getElementById('mfa-error');
    var successEl = document.getElementById('mfa-success');

    try {
      // Enroll a new TOTP factor
      var enrollRes = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'BJ Admin TOTP' });
      if (enrollRes.error) throw enrollRes.error;

      var factor = enrollRes.data;

      // Show QR code
      if (factor.totp && factor.totp.qr_code) {
        qrImg.src = factor.totp.qr_code;
        qrImg.style.display = 'block';
        qrLoading.style.display = 'none';
      }

      // Show manual secret
      if (factor.totp && factor.totp.secret) {
        secretCode.textContent = factor.totp.secret;
        secretDisplay.style.display = 'block';
      }

      // Enable verify button when 6 digits entered
      verifyInput.addEventListener('input', function() {
        var val = verifyInput.value.replace(/\D/g, '');
        verifyInput.value = val;
        verifyBtn.disabled = val.length !== 6;
      });

      verifyBtn.addEventListener('click', async function() {
        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying…';
        errorEl.style.display = 'none';

        try {
          // Challenge the factor
          var challengeRes = await sb.auth.mfa.challenge({ factorId: factor.id });
          if (challengeRes.error) throw challengeRes.error;

          // Verify with the code
          var verifyRes = await sb.auth.mfa.verify({
            factorId: factor.id,
            challengeId: challengeRes.data.id,
            code: verifyInput.value
          });
          if (verifyRes.error) throw verifyRes.error;

          // MFA now active
          successEl.style.display = 'block';
          if (window.posthog) posthog.capture('admin_mfa_enrolled', { user_id: user.id });

          // Reload to enter admin console with aal2
          setTimeout(function() { window.location.reload(); }, 1500);

        } catch (err) {
          errorEl.textContent = err.message || 'Invalid code. Try again.';
          errorEl.style.display = 'block';
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify & Enable MFA';
        }
      });

    } catch (err) {
      reportError('admin_shell', err);
      console.error('[Admin Shell] MFA enroll error:', err);
      qrLoading.textContent = 'Error generating QR code. Refresh to retry.';
      if (window.posthog) posthog.capture('admin_mfa_enroll_error', { error: err.message });
    }
  }

  // ── MFA Challenge Flow (already enrolled, verify this session) ──
  async function showMfaChallenge(factorId, user, profile) {
    if (!mfaSetup) { showDenied(); return; }
    mfaSetup.style.display = 'block';

    // Repurpose the setup UI for challenge
    var qrContainer = document.getElementById('mfa-qr-container');
    var secretDisplay = document.getElementById('mfa-secret-display');
    var verifyInput = document.getElementById('mfa-verify-code');
    var verifyBtn = document.getElementById('mfa-verify-btn');
    var errorEl = document.getElementById('mfa-error');
    var successEl = document.getElementById('mfa-success');

    // Update heading text for challenge mode
    mfaSetup.querySelector('h2').textContent = 'MFA Verification Required';
    mfaSetup.querySelector('p').textContent = 'Enter the 6-digit code from your authenticator app to access the admin console.';
    qrContainer.style.display = 'none';
    if (secretDisplay) secretDisplay.style.display = 'none';
    verifyBtn.textContent = 'Verify';

    verifyInput.addEventListener('input', function() {
      var val = verifyInput.value.replace(/\D/g, '');
      verifyInput.value = val;
      verifyBtn.disabled = val.length !== 6;
    });

    verifyBtn.addEventListener('click', async function() {
      verifyBtn.disabled = true;
      verifyBtn.textContent = 'Verifying…';
      errorEl.style.display = 'none';

      try {
        var challengeRes = await sb.auth.mfa.challenge({ factorId: factorId });
        if (challengeRes.error) throw challengeRes.error;

        var verifyRes = await sb.auth.mfa.verify({
          factorId: factorId,
          challengeId: challengeRes.data.id,
          code: verifyInput.value
        });
        if (verifyRes.error) throw verifyRes.error;

        successEl.textContent = 'Verified! Loading admin…';
        successEl.style.display = 'block';

        // Now at aal2 — show admin console
        setTimeout(function() {
          mfaSetup.style.display = 'none';
          showAdminConsole(user, profile);
        }, 800);

      } catch (err) {
        errorEl.textContent = err.message || 'Invalid code. Try again.';
        errorEl.style.display = 'block';
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
      }
    });
  }

  function showDenied() {
    gate.style.display = 'none';
    if (mfaSetup) mfaSetup.style.display = 'none';
    denied.style.display = 'flex';
  }

  // Listen for auth state changes (session expiry, etc.)
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/';
    }
  });
})();

// CS-P1-004 FE-005: Register admin-shell exports with BJ namespace
(function() {
  ['currentUser'].forEach(function(name) {
    if (window[name] !== undefined) {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-shell', registered: Date.now() };
    }
  });
})();
