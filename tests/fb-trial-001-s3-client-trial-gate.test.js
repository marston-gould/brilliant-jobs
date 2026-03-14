// tests/fb-trial-001-s3-client-trial-gate.test.js
// FB-TRIAL-001-S3: Trial Gate Client + Free Samples — Validation Tests
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const REPO = process.cwd();
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf-8');

// ─── Section 1: trial-gate.js File Structure ───
describe('S1: trial-gate.js file structure', () => {
  const src = read('js/trial-gate.js');

  it('1.1 trial-gate.js exists', () => {
    expect(existsSync(`${REPO}/js/trial-gate.js`)).toBe(true);
  });

  it('1.2 exports initTrialGate to window', () => {
    expect(src).toContain('window.initTrialGate = initTrialGate');
  });

  it('1.3 exports showPreSamplePrompt to window', () => {
    expect(src).toContain('window.showPreSamplePrompt = showPreSamplePrompt');
  });

  it('1.4 exports showSampleConversionModal to window', () => {
    expect(src).toContain('window.showSampleConversionModal = showSampleConversionModal');
  });

  it('1.5 exports hideTrialBanner to window', () => {
    expect(src).toContain('window.hideTrialBanner = hideTrialBanner');
  });

  it('1.6 exports handleSampleHeader to window', () => {
    expect(src).toContain('window.handleSampleHeader = handleSampleHeader');
  });

  it('1.7 exports getClientSampleAvailability to window', () => {
    expect(src).toContain('window.getClientSampleAvailability = getClientSampleAvailability');
  });

  it('1.8 exports all 6 functions to BJ namespace', () => {
    expect(src).toContain('BJ.initTrialGate');
    expect(src).toContain('BJ.showPreSamplePrompt');
    expect(src).toContain('BJ.showSampleConversionModal');
    expect(src).toContain('BJ.hideTrialBanner');
    expect(src).toContain('BJ.handleSampleHeader');
    expect(src).toContain('BJ.getClientSampleAvailability');
  });
});

// ─── Section 2: Feature Label Map ───
describe('S2: Feature labels', () => {
  const src = read('js/trial-gate.js');

  it('2.1 has all 8 gated feature labels', () => {
    expect(src).toContain("chat:    'AI Chat'");
    expect(src).toContain("score:   'Resume Scoring'");
    expect(src).toContain("sms:     'SMS Alert'");
    expect(src).toContain("email:   'Email Notification'");
    expect(src).toContain("apply:   'Auto-Apply'");
    expect(src).toContain("stats:   'Stats Page'");
    expect(src).toContain("filter:  'Saved Filter'");
    expect(src).toContain("boolean: 'Boolean Search'");
  });
});

// ─── Section 3: Trial Banner Logic ───
describe('S3: Trial countdown banner', () => {
  const src = read('js/trial-gate.js');

  it('3.1 renders banner from _renderTrialBanner', () => {
    expect(src).toContain('function _renderTrialBanner(expiresAt)');
  });

  it('3.2 references trial-banner element', () => {
    expect(src).toContain("getElementById('trial-banner')");
  });

  it('3.3 uses blue color for 5-7 days', () => {
    expect(src).toContain('#3B82F6');
  });

  it('3.4 uses amber color for 2-4 days', () => {
    expect(src).toContain('#F59E0B');
  });

  it('3.5 uses red color for 0-1 day', () => {
    expect(src).toContain('#E24B4A');
  });

  it('3.6 shows "Trial ending today" for day 0', () => {
    expect(src).toContain('Trial ending today');
  });

  it('3.7 shows "Your trial ends tomorrow" for day 1', () => {
    expect(src).toContain('Your trial ends tomorrow');
  });

  it('3.8 shows "X days left in your free trial" for days 2-7', () => {
    expect(src).toContain('days left in your free trial');
  });

  it('3.9 has Upgrade now button linking to /upgrade', () => {
    expect(src).toContain('href="/upgrade"');
    expect(src).toContain('Upgrade now');
  });

  it('3.10 updates every 60 seconds', () => {
    expect(src).toContain('setInterval(_update, 60000)');
  });

  it('3.11 PostHog event on upgrade click', () => {
    expect(src).toContain("trial_banner_upgrade_click");
  });
});

// ─── Section 4: initTrialGate ───
describe('S4: initTrialGate function', () => {
  const src = read('js/trial-gate.js');

  it('4.1 queries profiles table for user_state, trial_expires_at, feature_samples_used', () => {
    expect(src).toContain("'user_state, trial_expires_at, feature_samples_used'");
  });

  it('4.2 calls _renderTrialBanner for trialing state', () => {
    expect(src).toContain("state === 'trialing'");
    expect(src).toContain('_renderTrialBanner(result.trial_expires_at)');
  });

  it('4.3 caches sample availability for expired_free state', () => {
    expect(src).toContain("state === 'expired_free'");
    expect(src).toContain('_sampleAvailability');
  });

  it('4.4 hides banner for active_pro state', () => {
    expect(src).toContain("state === 'active_pro'");
    expect(src).toContain('hideTrialBanner()');
  });

  it('4.5 calls _updateSampleBadges for expired_free', () => {
    expect(src).toContain('_updateSampleBadges()');
  });

  it('4.6 uses reportError for error handling', () => {
    expect(src).toContain("reportError('trial-gate:init'");
  });

  it('4.7 checks all 8 feature keys for sample availability', () => {
    expect(src).toContain("['chat', 'score', 'sms', 'email', 'apply', 'stats', 'filter', 'boolean']");
  });
});

// ─── Section 5: Pre-Sample Prompt ───
describe('S5: Pre-sample prompt', () => {
  const src = read('js/trial-gate.js');

  it('5.1 references pre-sample-prompt element', () => {
    expect(src).toContain("getElementById('pre-sample-prompt')");
  });

  it('5.2 shows "This will use your one free" message', () => {
    expect(src).toContain('This will use your one free');
  });

  it('5.3 has Continue and Cancel buttons', () => {
    expect(src).toContain('pre-sample-confirm');
    expect(src).toContain('pre-sample-cancel');
  });

  it('5.4 PostHog events for prompt shown, confirmed, cancelled', () => {
    expect(src).toContain("posthog.capture('pre_sample_prompt_shown'");
    expect(src).toContain("posthog.capture('pre_sample_confirmed'");
    expect(src).toContain("posthog.capture('pre_sample_cancelled'");
  });

  it('5.5 click outside to dismiss', () => {
    expect(src).toContain('if (e.target === overlay)');
  });

  it('5.6 fallback: calls onConfirm if overlay missing', () => {
    expect(src).toContain('if (!overlay) { if (onConfirm) onConfirm(); return; }');
  });
});

// ─── Section 6: Post-Sample Conversion Modal ───
describe('S6: Post-sample conversion modal', () => {
  const src = read('js/trial-gate.js');

  it('6.1 references sample-conversion-modal element', () => {
    expect(src).toContain("getElementById('sample-conversion-modal')");
  });

  it('6.2 shows "That was your free X sample" headline', () => {
    expect(src).toContain('That was your free');
    expect(src).toContain('sample');
  });

  it('6.3 shows "Upgrade to Pro for unlimited" body', () => {
    expect(src).toContain('Upgrade to Pro for unlimited');
  });

  it('6.4 has Upgrade to Pro button linking to /upgrade', () => {
    expect(src).toContain('href="/upgrade"');
    expect(src).toContain('Upgrade to Pro');
  });

  it('6.5 has "Maybe later" dismiss button', () => {
    expect(src).toContain('Maybe later');
    expect(src).toContain('sample-modal-dismiss');
  });

  it('6.6 PostHog sample_conversion_prompted event', () => {
    expect(src).toContain("posthog.capture('sample_conversion_prompted'");
  });

  it('6.7 PostHog sample_conversion_dismissed event', () => {
    expect(src).toContain("posthog.capture('sample_conversion_dismissed'");
  });

  it('6.8 PostHog sample_conversion_upgrade_click event', () => {
    expect(src).toContain("posthog.capture('sample_conversion_upgrade_click'");
  });

  it('6.9 marks sample as consumed in local cache', () => {
    expect(src).toContain('_sampleAvailability[featureKey] = false');
  });

  it('6.10 calls refreshIcons for Lucide', () => {
    expect(src).toContain('refreshIcons()');
  });

  it('6.11 click outside to dismiss', () => {
    expect(src).toContain('if (e.target === overlay)');
  });
});

// ─── Section 7: handleSampleHeader Utility ───
describe('S7: handleSampleHeader utility', () => {
  const src = read('js/trial-gate.js');

  it('7.1 checks X-Is-Sample header', () => {
    expect(src).toContain("response.headers.get('X-Is-Sample')");
  });

  it('7.2 triggers showSampleConversionModal with delay', () => {
    expect(src).toContain('setTimeout(function()');
    expect(src).toContain('showSampleConversionModal(featureKey)');
  });

  it('7.3 delay is 800ms to show feature result first', () => {
    expect(src).toContain('800');
  });
});

// ─── Section 8: Sample Badges ───
describe('S8: Sample badges on gated feature buttons', () => {
  const src = read('js/trial-gate.js');

  it('8.1 _updateSampleBadges function exists', () => {
    expect(src).toContain('function _updateSampleBadges()');
  });

  it('8.2 adds trial-sample-badge class', () => {
    expect(src).toContain('trial-sample-badge');
  });

  it('8.3 shows "1 free try" text on badges', () => {
    expect(src).toContain('1 free try');
  });

  it('8.4 removes existing badges before re-rendering', () => {
    expect(src).toContain("document.querySelectorAll('.trial-sample-badge')");
    expect(src).toContain('.remove()');
  });
});

// ─── Section 9: Dashboard HTML Containers ───
describe('S9: Dashboard HTML containers', () => {
  const html = read('dashboard.html');

  it('9.1 trial-banner container exists', () => {
    expect(html).toContain('id="trial-banner"');
  });

  it('9.2 trial-banner is below nav', () => {
    const navClose = html.indexOf('</nav>');
    const bannerPos = html.indexOf('id="trial-banner"');
    const mainPos = html.indexOf('class="main"');
    expect(bannerPos).toBeGreaterThan(navClose);
    expect(bannerPos).toBeLessThan(mainPos);
  });

  it('9.3 trial-banner hidden by default', () => {
    const match = html.match(/id="trial-banner"[^>]*>/);
    expect(match[0]).toContain('display:none');
  });

  it('9.4 sample-conversion-modal container exists', () => {
    expect(html).toContain('id="sample-conversion-modal"');
  });

  it('9.5 sample-conversion-modal is fixed overlay', () => {
    const match = html.match(/id="sample-conversion-modal"[^>]*>/);
    expect(match[0]).toContain('position:fixed');
  });

  it('9.6 sample-conversion-modal hidden by default', () => {
    const match = html.match(/id="sample-conversion-modal"[^>]*>/);
    expect(match[0]).toContain('display:none');
  });

  it('9.7 pre-sample-prompt container exists', () => {
    expect(html).toContain('id="pre-sample-prompt"');
  });

  it('9.8 pre-sample-prompt is fixed overlay', () => {
    const match = html.match(/id="pre-sample-prompt"[^>]*>/);
    expect(match[0]).toContain('position:fixed');
  });

  it('9.9 pre-sample-prompt hidden by default', () => {
    const match = html.match(/id="pre-sample-prompt"[^>]*>/);
    expect(match[0]).toContain('display:none');
  });
});

// ─── Section 10: Build Integration ───
describe('S10: Build integration', () => {
  const buildJs = read('build.js');
  const appJs = read('js/app.js');

  it('10.1 trial-gate.js in deferred chunk', () => {
    expect(buildJs).toContain("'js/trial-gate.js'");
  });

  it('10.2 initTrialGate called in app.js init()', () => {
    expect(appJs).toContain("typeof initTrialGate === 'function'");
    expect(appJs).toContain('initTrialGate()');
  });

  it('10.3 initTrialGate call is before lucide init', () => {
    const trialPos = appJs.indexOf('initTrialGate()');
    const lucidePos = appJs.indexOf('lucide.createIcons()');
    expect(trialPos).toBeLessThan(lucidePos);
  });
});

// ─── Section 11: Version & Build Output ───
describe('S11: Version and build output', () => {
  it('11.1 version is v8.97', () => {
    const ver = read('js/version.js');
    expect(ver).toContain('v8.97');
  });

  it('11.2 dashboard.min.js exists', () => {
    expect(existsSync(`${REPO}/dist/dashboard.min.js`)).toBe(true);
  });

  it('11.3 dashboard-deferred.min.js exists and includes trial-gate', () => {
    const deferred = read('dist/dashboard-deferred.min.js');
    expect(deferred).toContain('initTrialGate');
    expect(deferred).toContain('showPreSamplePrompt');
    expect(deferred).toContain('showSampleConversionModal');
  });

  it('11.4 admin.min.js exists', () => {
    expect(existsSync(`${REPO}/dist/admin.min.js`)).toBe(true);
  });
});

// ─── Section 12: Pod Team Manifest ───
describe('S12: Pod team manifest', () => {
  const manifest = read('docs/scaling/pod-team-manifest.md');

  it('12.1 FB-TRIAL-001-S3 pairing exists', () => {
    expect(manifest).toContain('FB-TRIAL-001-S3');
  });

  it('12.2 all 5 hook-and-scar roles present', () => {
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Eng');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Dev');
    expect(manifest).toContain('Evolvability Strategist');
  });
});
