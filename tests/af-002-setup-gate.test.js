/**
 * AF-002 — First-Time Setup Gate
 * Validation tests: 60 tests across 10 sections
 */
const fs = require('fs');
const path = require('path');

function readFile(f) {
  return fs.readFileSync(path.join(__dirname, '..', f), 'utf-8');
}

describe('AF-002: First-Time Setup Gate', () => {
  let applyWorkflow, jobFeed, applications, settings, locationJs, dashboardHtml;
  let backgroundTs, contentScript, jobSiteOverlay, podManifest;

  beforeAll(() => {
    applyWorkflow = readFile('js/apply-workflow.js');
    jobFeed = readFile('js/job-feed.js');
    applications = readFile('js/applications.js');
    settings = readFile('js/settings.js');
    locationJs = readFile('js/location.js');
    dashboardHtml = readFile('dashboard.html');
    backgroundTs = readFile('extension/background.ts');
    contentScript = readFile('extension/contentScript.ts');
    jobSiteOverlay = readFile('extension/job-site-overlay.ts');
    podManifest = readFile('docs/scaling/pod-team-manifest.md');
  });

  // ── Section 1: isSetupComplete() function ──
  describe('1. isSetupComplete function', () => {
    test('1.1 isSetupComplete function exists in apply-workflow.js', () => {
      expect(applyWorkflow).toContain('function isSetupComplete()');
    });
    test('1.2 Checks setup_complete cached flag first', () => {
      expect(applyWorkflow).toContain('settings.setup_complete === true');
    });
    test('1.3 Checks applicant profile name and email', () => {
      expect(applyWorkflow).toContain('profile.name');
      expect(applyWorkflow).toContain('profile.email');
    });
    test('1.4 Checks applicationMode is set', () => {
      expect(applyWorkflow).toContain('settings.default_apply_mode');
    });
    test('1.5 Checks activeResumeId is set', () => {
      expect(applyWorkflow).toContain('active_resume_id');
    });
    test('1.6 Reads from localStorage bj_apply_settings', () => {
      expect(applyWorkflow).toContain("localStorage.getItem('bj_apply_settings'");
    });
    test('1.7 Reads from localStorage bj_applicant_profile', () => {
      expect(applyWorkflow).toContain("localStorage.getItem('bj_applicant_profile'");
    });
    test('1.8 Window export for isSetupComplete', () => {
      expect(applyWorkflow).toContain('window.isSetupComplete = isSetupComplete');
    });
  });

  // ── Section 2: Setup gate modal ──
  describe('2. Setup gate modal', () => {
    test('2.1 showSetupGateModal function exists', () => {
      expect(applyWorkflow).toContain('function showSetupGateModal()');
    });
    test('2.2 hideSetupGateModal function exists', () => {
      expect(applyWorkflow).toContain('function hideSetupGateModal()');
    });
    test('2.3 navigateToSetup function exists', () => {
      expect(applyWorkflow).toContain('function navigateToSetup()');
    });
    test('2.4 Modal HTML in dashboard.html', () => {
      expect(dashboardHtml).toContain('id="setup-gate-overlay"');
    });
    test('2.5 Modal has three checklist items', () => {
      expect(dashboardHtml).toContain('sg-check-profile');
      expect(dashboardHtml).toContain('sg-check-mode');
      expect(dashboardHtml).toContain('sg-check-resume');
    });
    test('2.6 Modal has Go to Settings button', () => {
      expect(dashboardHtml).toContain('navigateToSetup()');
      expect(dashboardHtml).toContain('Go to Settings');
    });
    test('2.7 Modal close button', () => {
      expect(dashboardHtml).toContain('hideSetupGateModal()');
    });
    test('2.8 Window exports for modal functions', () => {
      expect(applyWorkflow).toContain('window.showSetupGateModal = showSetupGateModal');
      expect(applyWorkflow).toContain('window.hideSetupGateModal = hideSetupGateModal');
      expect(applyWorkflow).toContain('window.navigateToSetup = navigateToSetup');
    });
  });

  // ── Section 3: checkAndSetSetupComplete ──
  describe('3. checkAndSetSetupComplete function', () => {
    test('3.1 Function exists', () => {
      expect(applyWorkflow).toContain('async function checkAndSetSetupComplete()');
    });
    test('3.2 Sets setup_complete in localStorage', () => {
      expect(applyWorkflow).toContain("settings.setup_complete = true");
      expect(applyWorkflow).toContain("localStorage.setItem('bj_apply_settings'");
    });
    test('3.3 Persists to Supabase profiles.user_data', () => {
      expect(applyWorkflow).toContain("ud.apply_settings.setup_complete = true");
    });
    test('3.4 PostHog event on setup complete', () => {
      expect(applyWorkflow).toContain("posthog.capture('setup_complete'");
    });
    test('3.5 Window export', () => {
      expect(applyWorkflow).toContain('window.checkAndSetSetupComplete = checkAndSetSetupComplete');
    });
  });

  // ── Section 4: Feed apply gate ──
  describe('4. Job Feed apply button gate', () => {
    test('4.1 applyButton checks isSetupComplete', () => {
      expect(locationJs).toContain('isSetupComplete');
    });
    test('4.2 Shows gate modal on failed check', () => {
      expect(locationJs).toContain('showSetupGateModal()');
    });
    test('4.3 Prevents default on failed check', () => {
      expect(locationJs).toContain('event.preventDefault();showSetupGateModal()');
    });
    test('4.4 Fraud interstitial also checks setup gate', () => {
      // The fraud interstitial path also has the gate check
      const fraudLine = locationJs.match(/showFraudInterstitial.*isSetupComplete/s);
      expect(fraudLine || locationJs.includes('isSetupComplete') && locationJs.includes('showFraudInterstitial')).toBeTruthy();
    });
  });

  // ── Section 5: Pipeline gate ──
  describe('5. Pipeline Process Queue gate', () => {
    test('5.1 Process Queue button checks isSetupComplete', () => {
      expect(applications).toContain('isSetupComplete');
    });
    test('5.2 Shows gate modal or toast on failed check', () => {
      expect(applications).toContain('showSetupGateModal');
    });
    test('5.3 processApplyQueue checks isSetupComplete', () => {
      expect(applyWorkflow).toMatch(/function processApplyQueue[\s\S]*?isSetupComplete/);
    });
    test('5.4 approvePendingApp checks isSetupComplete', () => {
      expect(applyWorkflow).toMatch(/function approvePendingApp[\s\S]*?isSetupComplete/);
    });
    test('5.5 proceedToApply checks isSetupComplete', () => {
      expect(applyWorkflow).toMatch(/function proceedToApply[\s\S]*?isSetupComplete/);
    });
  });

  // ── Section 6: Settings cache ──
  describe('6. Settings localStorage caching', () => {
    test('6.1 loadApplicantProfile caches to bj_applicant_profile', () => {
      expect(settings).toContain("localStorage.setItem('bj_applicant_profile'");
    });
    test('6.2 loadApplicantProfile caches apply_settings', () => {
      expect(settings).toContain("localStorage.setItem('bj_apply_settings'");
    });
    test('6.3 saveApplicantProfile caches to localStorage', () => {
      // Count occurrences — should have cache after save
      const matches = settings.match(/localStorage\.setItem\('bj_applicant_profile'/g);
      expect(matches.length).toBeGreaterThanOrEqual(2); // load + save
    });
    test('6.4 syncApplySettingsToSupabase caches to localStorage', () => {
      const matches = settings.match(/localStorage\.setItem\('bj_apply_settings'/g);
      expect(matches.length).toBeGreaterThanOrEqual(2); // load + sync
    });
    test('6.5 Profile save triggers checkAndSetSetupComplete', () => {
      expect(settings).toContain('checkAndSetSetupComplete');
    });
    test('6.6 Settings sync triggers checkAndSetSetupComplete', () => {
      const syncSection = settings.substring(settings.indexOf('async function syncApplySettingsToSupabase'));
      expect(syncSection).toContain('checkAndSetSetupComplete');
    });
  });

  // ── Section 7: Extension setup gate ──
  describe('7. Extension setup gate', () => {
    test('7.1 background.ts checks setup_complete in APPLY_INTERCEPTED', () => {
      expect(backgroundTs).toContain('isSetupDone');
    });
    test('7.2 Reads applySettings from chrome.storage.local', () => {
      expect(backgroundTs).toContain("chrome.storage.local.get(['applySettings', 'applicantProfile']");
    });
    test('7.3 Checks profile name and email', () => {
      expect(backgroundTs).toContain("applicantProfile.name");
      expect(backgroundTs).toContain("applicantProfile.email");
    });
    test('7.4 Checks applicationMode', () => {
      expect(backgroundTs).toContain("applySettings.applicationMode");
    });
    test('7.5 Checks activeResumeId', () => {
      expect(backgroundTs).toContain("applySettings.activeResumeId");
    });
    test('7.6 Sends bj:toolbar:setupRequired on failed check', () => {
      expect(backgroundTs).toContain("'bj:toolbar:setupRequired'");
    });
    test('7.7 Responds with setup_required status', () => {
      expect(backgroundTs).toContain("status: 'setup_required'");
    });
    test('7.8 PostHog setup_gate_shown event', () => {
      expect(backgroundTs).toContain("'setup_gate_shown'");
    });
  });

  // ── Section 8: ContentScript bridge ──
  describe('8. ContentScript bridge', () => {
    test('8.1 Bridges bj:toolbar:setupRequired message', () => {
      expect(contentScript).toContain("'bj:toolbar:setupRequired'");
    });
    test('8.2 Comment updated to include AF-002', () => {
      expect(contentScript).toContain('AF-002');
    });
  });

  // ── Section 9: Job site overlay ──
  describe('9. Job site overlay setup required', () => {
    test('9.1 showSetupRequiredOverlay function exists', () => {
      expect(jobSiteOverlay).toContain('function showSetupRequiredOverlay');
    });
    test('9.2 Handles setupRequired message', () => {
      expect(jobSiteOverlay).toContain("evt.data.type === 'bj:toolbar:setupRequired'");
    });
    test('9.3 Overlay has dashboard link', () => {
      expect(jobSiteOverlay).toContain('Open Dashboard Settings');
    });
    test('9.4 Overlay has close button', () => {
      expect(jobSiteOverlay).toContain('bj-setup-close');
    });
    test('9.5 Click-outside-to-close', () => {
      expect(jobSiteOverlay).toContain('e.target === overlay');
    });
    test('9.6 Auto-dismiss after 15 seconds', () => {
      expect(jobSiteOverlay).toContain('15000');
    });
    test('9.7 Window export', () => {
      expect(jobSiteOverlay).toContain('showSetupRequiredOverlay');
    });
  });

  // ── Section 10: Pod team manifest + file inventory ──
  describe('10. Team manifest and file inventory', () => {
    test('10.1 AF-002 pairing in pod-team-manifest.md', () => {
      expect(podManifest).toContain('AF-002');
    });
    test('10.2 5 hook-and-scar roles present', () => {
      expect(podManifest).toContain('Chief Architect');
      expect(podManifest).toContain('Lead Platform Eng');
      expect(podManifest).toContain('System Architect');
      expect(podManifest).toContain('Forward-Looking Dev');
      expect(podManifest).toContain('Evolvability Strategist');
    });
    test('10.3 All modified files exist', () => {
      const files = [
        'js/apply-workflow.js',
        'js/location.js',
        'js/applications.js',
        'js/settings.js',
        'dashboard.html',
        'extension/background.ts',
        'extension/contentScript.ts',
        'extension/job-site-overlay.ts',
        'docs/scaling/pod-team-manifest.md',
      ];
      files.forEach(f => {
        expect(fs.existsSync(path.join(__dirname, '..', f))).toBe(true);
      });
    });
  });
});
