/**
 * Brilliant Jobs — Global Version & Site-Wide Utilities
 * =====================================================
 * SINGLE SOURCE OF TRUTH. Every page includes this file.
 * To bump the version, change ONLY the line below.
 *
 * DO NOT hardcode version strings anywhere else.
 * DO NOT add fallback version values in catch blocks.
 * If this file doesn't load, the version simply doesn't display.
 * That's a signal something is broken — not something to paper over.
 */
var BJ_VERSION = 'v6.20';

(function() {
  document.addEventListener('DOMContentLoaded', function() {
    // Universal version display: any element with class .bj-version
    document.querySelectorAll('.bj-version').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });

    // Catch any id that ends with "-version" or is exactly "version"
    // This covers: #nav-version, #rm-version, #version, and any future additions
    document.querySelectorAll('[id$="-version"], [id="version"]').forEach(function(el) {
      el.textContent = BJ_VERSION;
    });

    // Copyright year: any .bj-year element or legacy #year
    var year = new Date().getFullYear();
    document.querySelectorAll('.bj-year').forEach(function(el) {
      el.textContent = year;
    });
    var legacyYear = document.getElementById('year');
    if (legacyYear) legacyYear.textContent = year;
  });

  // Console log for every page
  var page = document.title || location.pathname;
  console.log('[BJ] ' + page + ' ' + BJ_VERSION + ' loaded');
})();

// ─── Onboarding Milestone Hooks (v6.04) ───
// Call these from anywhere after user completes an action.
// Updates onboarding_milestones in Supabase for real-time suppression.

window.markOnboardingMilestone = async function(milestone) {
  if (typeof sb === 'undefined' || !sb) return;
  var user = null;
  try { user = (await sb.auth.getUser()).data.user; } catch(e) { return; }
  if (!user) return;

  var field = null;
  if (milestone === 'resume') field = 'resume_completed_at';
  else if (milestone === 'filter') field = 'filter_completed_at';
  else if (milestone === 'extension') field = 'extension_completed_at';
  else return;

  try {
    var update = {};
    update[field] = new Date().toISOString();
    update['updated_at'] = new Date().toISOString();
    await sb.from('onboarding_milestones').update(update).eq('user_id', user.id);
    console.log('[milestone] Marked:', milestone);
  } catch(e) {
    console.warn('[milestone] Error:', e.message);
  }
};

window.markIntegrationConnected = async function(integration) {
  if (typeof sb === 'undefined' || !sb) return;
  var user = null;
  try { user = (await sb.auth.getUser()).data.user; } catch(e) { return; }
  if (!user) return;

  var connField = integration + '_connected_at';
  var suppressField = integration + '_suppressed';

  try {
    // Update integration_adoption_state
    var update = {};
    update[connField] = new Date().toISOString();
    update[suppressField] = true;
    update['updated_at'] = new Date().toISOString();

    // Upsert — create row if it doesn't exist
    var { error } = await sb.from('integration_adoption_state').upsert({
      user_id: user.id,
      [connField]: new Date().toISOString(),
      [suppressField]: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) console.warn('[adoption] Suppress error:', error.message);
    else console.log('[adoption] Suppressed:', integration);

    // Also update profiles timestamp if applicable
    if (['gmail', 'calendar', 'drive'].includes(integration)) {
      await sb.from('profiles').update({ [connField]: new Date().toISOString() }).eq('id', user.id);
    }
  } catch(e) {
    console.warn('[adoption] Error:', e.message);
  }
};

// ─── CV Score Notification Trigger (v6.06) ───
// Call after resume scoring completes to fire score-tier email.
// Handles suppression server-side (daily limit, dedup, prefs).
window.triggerScoreNotification = async function(userId, jobId, score, analysisSummary, jobTitle, companyName) {
  if (!userId || !jobId || typeof score !== 'number') return;
  try {
    var res = await fetch((window._bjSupabaseUrl || 'https://qojhagupdnbtomfoxnsf.supabase.co') + '/functions/v1/score-sequence', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (window._bjAnonKey || '')
      },
      body: JSON.stringify({
        user_id: userId,
        job_id: jobId,
        score: score,
        analysis_summary: analysisSummary || null,
        job_title: jobTitle || null,
        company_name: companyName || null
      })
    });
    if (res.ok) {
      var result = await res.json();
      console.log('[score-notif] ' + (result.sent ? 'Sent' : 'Suppressed') + ': tier=' + result.tier + ', reason=' + (result.reason || 'ok'));
    }
  } catch(e) {
    console.warn('[score-notif] Error:', e.message);
  }
};
