/* ───────────────────────────────────────────────────────────
   admin-shell.js — Auth gate + init for standalone /admin page
   v6.85 — IA v2 S2 block pages (Companies, Jobs, Email)
   
   This is the entry point for admin.html. It handles:
   1. Supabase auth check
   2. Admin role verification
   3. Redirect non-admins
   4. Init admin page when authenticated
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

    // 3. Admin verified — show the console
    gate.style.display = 'none';
    shell.style.display = 'block';

    // Set user email in topbar
    var emailEl = document.getElementById('admin-user-email');
    if (emailEl) emailEl.textContent = user.email;

    // Set version in topbar
    var versionEl = document.getElementById('admin-version');
    if (versionEl) versionEl.textContent = BJ_VERSION;

    // 4. Init admin page
    // The page-admin div is always active on this page
    if (typeof initAdminPage === 'function') {
      initAdminPage();
    }

  } catch (e) {
    console.error('[Admin Shell] Auth error:', e);
    showDenied();
  }

  function showDenied() {
    gate.style.display = 'none';
    denied.style.display = 'flex';
  }

  // Listen for auth state changes (session expiry, etc.)
  sb.auth.onAuthStateChange(function(event, session) {
    if (event === 'SIGNED_OUT') {
      window.location.href = '/';
    }
  });
})();
