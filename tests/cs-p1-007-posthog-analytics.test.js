/**
 * CS-P1-007: PostHog Analytics + Attribution CX
 * Tests: DS1-4, DS1-6, DS1-12, ES1-1, LS1-3, TS1-1, TS1-2
 */
const fs = require('fs');
const path = require('path');

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf-8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(__dirname, '..', relPath));
}

// ═══════════════════════════════════════════════════════════
// DS1-4: PostHog Identity Resolution
// ═══════════════════════════════════════════════════════════
describe('DS1-4: PostHog identity resolution', () => {
  const appJs = readFile('js/app.js');
  const settingsJs = readFile('js/settings.js');
  const globalsJs = readFile('js/globals.js');
  const landingAppJs = readFile('js/landing-app.js');

  test('Dashboard identify includes email and created_at', () => {
    expect(appJs).toContain('posthog.identify(currentUser.id');
    expect(appJs).toContain('email: currentUser.email');
    expect(appJs).toContain('created_at: currentUser.created_at');
  });

  test('Dashboard identify sets $set_once for first_seen', () => {
    expect(appJs).toContain('setPersonProperties');
    expect(appJs).toContain('first_seen_at');
    expect(appJs).toContain('signup_source');
  });

  test('Dashboard registers bj_surface super property', () => {
    expect(appJs).toContain("bj_surface: 'dashboard'");
  });

  test('Logout in settings.js calls posthog.reset()', () => {
    expect(settingsJs).toContain('posthog.reset()');
    // Must come before signOut
    const resetIdx = settingsJs.indexOf('posthog.reset()');
    const signOutIdx = settingsJs.indexOf('sb.auth.signOut()');
    expect(resetIdx).toBeLessThan(signOutIdx);
  });

  test('Forced logout in globals.js calls posthog.reset()', () => {
    expect(globalsJs).toContain('posthog.reset()');
  });

  test('Landing page logout calls posthog.reset()', () => {
    expect(landingAppJs).toContain('posthog.reset()');
    // Must come before signOut
    const resetIdx = landingAppJs.indexOf('posthog.reset()');
    const signOutIdx = landingAppJs.indexOf('sb.auth.signOut()');
    expect(resetIdx).toBeLessThan(signOutIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// DS1-6: Pageview Events — All 14 Dashboard Pages
// ═══════════════════════════════════════════════════════════
describe('DS1-6: Virtual pageview events for 14 dashboard pages', () => {
  const appJs = readFile('js/app.js');

  test('Page title map covers all 14 dashboard pages', () => {
    const pages = [
      'brilliant', 'setup', 'jobs', 'tuning', 'resumes',
      'applications', 'notifications', 'ghost', 'stats',
      'referrals', 'settings', 'subscription', 'feedback', 'pipeline'
    ];
    pages.forEach(page => {
      expect(appJs).toContain(`${page}:`);
    });
  });

  test('Page section map assigns sections', () => {
    expect(appJs).toContain('_bjPageSections');
    expect(appJs).toContain("'onboarding'");
    expect(appJs).toContain("'search'");
    expect(appJs).toContain("'tracking'");
    expect(appJs).toContain("'intelligence'");
    expect(appJs).toContain("'growth'");
    expect(appJs).toContain("'account'");
  });

  test('Nav click handler fires $pageview event (not dashboard_tab_viewed)', () => {
    expect(appJs).toContain("posthog.capture('$pageview'");
    expect(appJs).not.toContain("posthog.capture('dashboard_tab_viewed'");
  });

  test('Virtual pageview includes bj_page and bj_page_section properties', () => {
    expect(appJs).toContain('bj_page:');
    expect(appJs).toContain('bj_page_section:');
  });

  test('Initial pageview fires on dashboard load', () => {
    expect(appJs).toContain('bj_initial_load: true');
  });

  test('Virtual pageview sets $pathname with hash fragment', () => {
    expect(appJs).toContain("$pathname: '/dashboard.html#'");
  });
});

// ═══════════════════════════════════════════════════════════
// DS1-12: Performance Timing Events
// ═══════════════════════════════════════════════════════════
describe('DS1-12: Performance timing events', () => {
  test('posthog-perf.js exists', () => {
    expect(fileExists('js/posthog-perf.js')).toBe(true);
  });

  const perfJs = readFile('js/posthog-perf.js');

  test('Captures Navigation Timing (TTFB, DOM, load)', () => {
    expect(perfJs).toContain('bj_perf_ttfb_ms');
    expect(perfJs).toContain('bj_perf_dom_interactive_ms');
    expect(perfJs).toContain('bj_perf_dom_complete_ms');
    expect(perfJs).toContain('bj_perf_load_ms');
  });

  test('Captures Largest Contentful Paint (LCP)', () => {
    expect(perfJs).toContain("bj_vital_name: 'LCP'");
    expect(perfJs).toContain('largest-contentful-paint');
  });

  test('Captures First Input Delay (FID)', () => {
    expect(perfJs).toContain("bj_vital_name: 'FID'");
    expect(perfJs).toContain('first-input');
  });

  test('Exposes bjPerfMark for tab render timing', () => {
    expect(perfJs).toContain('window.bjPerfMark');
    expect(perfJs).toContain('bj_tab_render');
    expect(perfJs).toContain('bj_render_ms');
  });

  test('Dashboard includes posthog-perf.js script tag', () => {
    const html = readFile('dashboard.html');
    expect(html).toContain('posthog-perf.js');
  });

  test('Landing page includes posthog-perf.js script tag', () => {
    const html = readFile('index.html');
    expect(html).toContain('posthog-perf.js');
  });

  test('Admin includes posthog-perf.js script tag', () => {
    const html = readFile('admin.html');
    expect(html).toContain('posthog-perf.js');
  });
});

// ═══════════════════════════════════════════════════════════
// ES1-1: Extension PostHog Baseline Events
// ═══════════════════════════════════════════════════════════
describe('ES1-1: Extension PostHog baseline events', () => {
  const bgJs = readFile('extension/background.js');
  const popupJs = readFile('extension/popup.js');

  test('Extension captures lifecycle event on install/update', () => {
    expect(bgJs).toContain("captureEvent('extension_lifecycle'");
    expect(bgJs).toContain('reason:');
    expect(bgJs).toContain('previous_version:');
  });

  test('Extension captures scan_started with queue_size', () => {
    expect(bgJs).toContain("captureEvent('scan_started'");
    expect(bgJs).toContain('queue_size:');
  });

  test('Extension captures scan_paused', () => {
    expect(bgJs).toContain("captureEvent('scan_paused'");
  });

  test('Extension captures scan_resumed', () => {
    expect(bgJs).toContain("captureEvent('scan_resumed'");
  });

  test('Extension captures killswitch_triggered', () => {
    expect(bgJs).toContain("captureEvent('killswitch_triggered'");
    expect(bgJs).toContain("layer:");
  });

  test('Extension has global error handler for service worker', () => {
    expect(bgJs).toContain("self.addEventListener('error'");
    expect(bgJs).toContain("self.addEventListener('unhandledrejection'");
    expect(bgJs).toContain("captureEvent('extension_error'");
  });

  test('Popup captures scan_stopped', () => {
    expect(popupJs).toContain("phCapture('scan_stopped')");
  });

  test('Popup captures scan_paused and scan_resumed', () => {
    expect(popupJs).toContain("phCapture('scan_paused')");
    expect(popupJs).toContain("phCapture('scan_resumed')");
  });

  test('Popup still captures popup_opened and scan_started', () => {
    expect(popupJs).toContain("phCapture('popup_opened')");
    expect(popupJs).toContain("phCapture('scan_started'");
  });
});

// ═══════════════════════════════════════════════════════════
// LS1-3: PostHog Landing Page Init + UTM Capture
// ═══════════════════════════════════════════════════════════
describe('LS1-3: PostHog landing page init and UTM capture', () => {
  const consentJs = readFile('js/cookie-consent.js');

  test('Cookie consent captures UTM params from URL', () => {
    expect(consentJs).toContain('utm_source');
    expect(consentJs).toContain('utm_medium');
    expect(consentJs).toContain('utm_campaign');
    expect(consentJs).toContain('utm_content');
    expect(consentJs).toContain('utm_term');
  });

  test('UTM params stored in sessionStorage for consent delay survival', () => {
    expect(consentJs).toContain("sessionStorage.setItem('bj_utm'");
  });

  test('UTM params registered as PostHog session super properties after consent', () => {
    expect(consentJs).toContain('register_for_session');
    expect(consentJs).toContain('_registerUtmParams');
  });

  test('First-touch attribution uses $set_once pattern', () => {
    expect(consentJs).toContain('first_utm_source');
    expect(consentJs).toContain('first_utm_medium');
    expect(consentJs).toContain('first_utm_campaign');
  });

  test('PostHog loads directly (not through GTM)', () => {
    // PostHog should be loaded by loadPostHog(), not by GTM container
    expect(consentJs).toContain('function loadPostHog()');
    expect(consentJs).toContain('function loadGTM()');
    // They should be separate functions (PostHog not dependent on GTM)
    const phIdx = consentJs.indexOf('loadPostHog()');
    const gtmIdx = consentJs.indexOf('loadGTM()');
    // Both are called in loadAnalytics but are independent
    expect(phIdx).toBeGreaterThan(0);
    expect(gtmIdx).toBeGreaterThan(0);
  });

  test('Referral code captured alongside UTM params', () => {
    expect(consentJs).toContain('bj_referral_code');
  });
});

// ═══════════════════════════════════════════════════════════
// TS1-1: Email UTM Attribution
// ═══════════════════════════════════════════════════════════
describe('TS1-1: Email UTM attribution', () => {
  const emailTemplates = readFile('supabase/functions/_shared/email-templates.ts');

  test('utmLink helper exists', () => {
    expect(emailTemplates).toContain('function utmLink(');
  });

  test('Dark baseLayout auto-tags brilliantjobs.app links with UTM', () => {
    expect(emailTemplates).toContain("utm_source=email&utm_medium=notification");
  });

  test('White baseLayout auto-tags brilliantjobs.app links with UTM', () => {
    // Both layouts use the same regex pattern
    const matches = emailTemplates.match(/utm_source=email&utm_medium=notification/g);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════
// TS1-2: SMS UTM Attribution
// ═══════════════════════════════════════════════════════════
describe('TS1-2: SMS UTM attribution', () => {
  const emailTemplates = readFile('supabase/functions/_shared/email-templates.ts');

  test('smsUtmLink helper exists', () => {
    expect(emailTemplates).toContain('function smsUtmLink(');
  });

  test('smsUtmLink uses utm_source=sms', () => {
    expect(emailTemplates).toContain("utm_source=sms&utm_medium=notification");
  });

  test('All SMS templates include UTM-tagged links', () => {
    // Count smsUtmLink calls in sms_text fields
    const smsMatches = emailTemplates.match(/smsUtmLink\(/g);
    expect(smsMatches).toBeTruthy();
    // At least 9 SMS templates should have UTM links
    expect(smsMatches.length).toBeGreaterThanOrEqual(9);
  });

  test('SMS templates have correct campaign names', () => {
    expect(emailTemplates).toContain("smsUtmLink('match_alert')");
    expect(emailTemplates).toContain("smsUtmLink('interview_scheduled')");
    expect(emailTemplates).toContain("smsUtmLink('offer_received')");
    expect(emailTemplates).toContain("smsUtmLink('network_match')");
    expect(emailTemplates).toContain("smsUtmLink('resume_rewrite')");
    expect(emailTemplates).toContain("smsUtmLink('bulk_apply_complete')");
    expect(emailTemplates).toContain("smsUtmLink('interview_confirmed')");
    expect(emailTemplates).toContain("smsUtmLink('interview_tomorrow')");
    expect(emailTemplates).toContain("smsUtmLink('interview_1hr')");
  });
});
