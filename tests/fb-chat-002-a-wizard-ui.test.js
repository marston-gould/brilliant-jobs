// tests/fb-chat-002-a-wizard-ui.test.js
// FB-CHAT-002 Session A: Guided Intake Wizard UI + Step Definitions
// 2026-03-16 | v10.33

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const dashHtml = readFileSync('dashboard.html', 'utf8');
const wizardJs = readFileSync('js/wizard.js', 'utf8');
const chatJs = readFileSync('js/chat.js', 'utf8');
const inputCss = readFileSync('src/input.css', 'utf8');
const buildJs = readFileSync('build.js', 'utf8');
const versionJs = readFileSync('js/version.js', 'utf8');
const podManifest = readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');

describe('FB-CHAT-002-A: Wizard UI + Step Definitions', () => {

  // --- Section 1: Mode Toggle ---
  describe('1. Mode Toggle — Three Segments', () => {
    it('has Filters button in mode toggle', () => {
      expect(dashHtml).toContain('data-mode="filters"');
    });
    it('has Chat button in mode toggle', () => {
      expect(dashHtml).toContain('data-mode="chat"');
    });
    it('has Guided button in mode toggle', () => {
      expect(dashHtml).toContain('data-mode="guided"');
    });
    it('Guided button uses wand-2 Lucide icon', () => {
      expect(dashHtml).toMatch(/data-mode="guided"[\s\S]*?data-lucide="wand-2"/);
    });
    it('setSearchMode handles guided mode', () => {
      expect(chatJs).toContain("mode === 'guided'");
    });
    it('guided mode hides filter and chat panels', () => {
      expect(chatJs).toContain("filterPanel.style.display = 'none'");
      expect(chatJs).toContain("chatPanel.style.display = 'none'");
    });
    it('guided mode calls _wizOpen', () => {
      expect(chatJs).toContain("_wizOpen('toggle')");
    });
    it('guided button click wired in initChatMode', () => {
      expect(chatJs).toContain("data-mode=\"guided\"");
      expect(chatJs).toContain("setSearchMode('guided')");
    });
  });

  // --- Section 2: Wizard Panel Container ---
  describe('2. Wizard Panel Container', () => {
    it('wizard-panel div exists in dashboard.html', () => {
      expect(dashHtml).toContain('id="wizard-panel"');
    });
    it('wizard panel starts hidden', () => {
      expect(dashHtml).toMatch(/id="wizard-panel"[^>]*style="display:none;"/);
    });
    it('has progress bar container', () => {
      expect(dashHtml).toContain('id="wiz-progress"');
    });
    it('has step label container', () => {
      expect(dashHtml).toContain('id="wiz-step-label"');
    });
    it('has viewport and slider containers', () => {
      expect(dashHtml).toContain('id="wiz-viewport"');
      expect(dashHtml).toContain('id="wiz-slider"');
    });
    it('has Next button', () => {
      expect(dashHtml).toContain('id="wiz-next"');
    });
    it('has Back button', () => {
      expect(dashHtml).toContain('id="wiz-back"');
    });
    it('has Skip link', () => {
      expect(dashHtml).toContain('id="wiz-skip"');
    });
  });

  // --- Section 3: Wizard JS Module ---
  describe('3. wizard.js Module Structure', () => {
    it('wizard.js file exists', () => {
      expect(existsSync('js/wizard.js')).toBe(true);
    });
    it('defines WizardState with currentStep, answers, active', () => {
      expect(wizardJs).toContain('currentStep: 1');
      expect(wizardJs).toContain('answers: {}');
      expect(wizardJs).toContain('active: false');
    });
    it('defines all 7 steps in _WIZ_STEPS', () => {
      expect(wizardJs).toContain("id: 1, title: 'Your Situation'");
      expect(wizardJs).toContain("id: 2, title: 'Role Types'");
      expect(wizardJs).toContain("id: 3, title: 'Location'");
      expect(wizardJs).toContain("id: 4, title: 'Compensation'");
      expect(wizardJs).toContain("id: 5, title: 'Company Size'");
      expect(wizardJs).toContain("id: 6, title: 'Exclusions'");
      expect(wizardJs).toContain("id: 7, title: 'Must-Haves'");
    });
    it('defines intent mapping for all 5 Step 1 options', () => {
      expect(wizardJs).toContain("'new_role': 'looking for my next opportunity'");
      expect(wizardJs).toContain("'escaping': 'looking to move on from my current position quickly'");
      expect(wizardJs).toContain("'pivot': 'making a career change'");
      expect(wizardJs).toContain("'exploring': 'casually exploring what\\'s out there'");
      expect(wizardJs).toContain("'reenter': 'getting back into the workforce'");
    });
    it('exports initWizard to window', () => {
      expect(wizardJs).toContain('window.initWizard = initWizard');
    });
    it('exports _wizOpen to window', () => {
      expect(wizardJs).toContain('window._wizOpen = _wizOpen');
    });
    it('exports _wizAssemblePrompt to window', () => {
      expect(wizardJs).toContain('window._wizAssemblePrompt = _wizAssemblePrompt');
    });
  });

  // --- Section 4: Step 1 — Card Selector ---
  describe('4. Step 1 — Card Selector (Intent)', () => {
    it('has 5 intent options', () => {
      expect(wizardJs).toContain("value: 'new_role'");
      expect(wizardJs).toContain("value: 'escaping'");
      expect(wizardJs).toContain("value: 'pivot'");
      expect(wizardJs).toContain("value: 'exploring'");
      expect(wizardJs).toContain("value: 'reenter'");
    });
    it('uses Lucide icons for cards (briefcase, flame, shuffle, compass, log-in)', () => {
      expect(wizardJs).toContain("icon: 'briefcase'");
      expect(wizardJs).toContain("icon: 'flame'");
      expect(wizardJs).toContain("icon: 'shuffle'");
      expect(wizardJs).toContain("icon: 'compass'");
      expect(wizardJs).toContain("icon: 'log-in'");
    });
    it('Step 1 is single-select (not multi)', () => {
      // _wizRenderCardSelector called with multi=false for step 1
      expect(wizardJs).toContain('_wizRenderCardSelector(_STEP1_OPTIONS, _wizardState.answers[1] ||');
    });
    it('conversational header for Step 1', () => {
      expect(wizardJs).toContain("Great to have you here!");
    });
    it('Step 1 is required', () => {
      expect(wizardJs).toContain("id: 1, title: 'Your Situation', required: true");
    });
  });

  // --- Section 5: Step 2 — Pill Input (Roles) ---
  describe('5. Step 2 — Pill Input (Role Types)', () => {
    it('renders pill input for roles', () => {
      expect(wizardJs).toContain("_wizRenderPillInput('wiz-roles'");
    });
    it('Step 2 header adapts for career pivot', () => {
      expect(wizardJs).toContain("making a change, what kind of roles are catching your eye");
    });
    it('Step 2 header adapts for escaping', () => {
      expect(wizardJs).toContain("find you something better");
    });
    it('requires minimum 1 keyword', () => {
      expect(wizardJs).toContain('_wizardState.answers[2].length > 0');
    });
  });

  // --- Section 6: Step 3 — Location ---
  describe('6. Step 3 — Location + Remote Toggle', () => {
    it('renders location pill input', () => {
      expect(wizardJs).toContain("_wizRenderPillInput('wiz-locations'");
    });
    it('has remote toggle checkbox', () => {
      expect(wizardJs).toContain('wiz-remote-toggle');
    });
    it('remote toggle defaults to ON', () => {
      expect(wizardJs).toContain("remote: true");
    });
    it('header references user location if known', () => {
      expect(wizardJs).toContain("Since you");
      expect(wizardJs).toContain('bj_applicant_profile');
    });
    it('validation: location OR remote required', () => {
      expect(wizardJs).toContain('a3.locations && a3.locations.length > 0) || a3.remote');
    });
  });

  // --- Section 7: Step 4 — Salary Slider ---
  describe('7. Step 4 — Salary Range Slider', () => {
    it('renders dual-handle range slider', () => {
      expect(wizardJs).toContain('wiz-sal-min');
      expect(wizardJs).toContain('wiz-sal-max');
    });
    it('slider range is $0-$500K with $10K step', () => {
      expect(wizardJs).toContain('min="0" max="500000" step="10000"');
    });
    it('has No preference checkbox', () => {
      expect(wizardJs).toContain('wiz-salary-skip');
    });
    it('skip checkbox disables slider visually', () => {
      expect(wizardJs).toContain('wiz-slider-disabled');
    });
    it('has comp note text input', () => {
      expect(wizardJs).toContain('wiz-comp-note');
    });
    it('displays live values in $XK format', () => {
      expect(wizardJs).toContain("'$' + Math.round(mn / 1000) + 'K'");
    });
    it('conversational header about money', () => {
      expect(wizardJs).toContain("talk money");
    });
  });

  // --- Section 8: Step 5 — Company Size Cards ---
  describe('8. Step 5 — Company Size Multi-Select Cards', () => {
    it('has 5 company size options', () => {
      expect(wizardJs).toContain("value: 'startup'");
      expect(wizardJs).toContain("value: 'growth'");
      expect(wizardJs).toContain("value: 'midmarket'");
      expect(wizardJs).toContain("value: 'enterprise'");
      expect(wizardJs).toContain("value: 'no_pref'");
    });
    it('Step 5 is multi-select', () => {
      expect(wizardJs).toContain('_wizRenderCardSelector(_STEP5_OPTIONS, _wizardState.answers[5] || [], true)');
    });
    it('No preference deselects others (mutual exclusion)', () => {
      expect(wizardJs).toContain("val === 'no_pref'");
      expect(wizardJs).toContain("arr = ['no_pref']");
    });
    it('shows employee range subtext', () => {
      expect(wizardJs).toContain("50 employees");
    });
  });

  // --- Section 9: Step 6 — Exclusions ---
  describe('9. Step 6 — Exclusions (Company + Industry)', () => {
    it('has company exclusion pill input', () => {
      expect(wizardJs).toContain("wiz-excl-companies");
    });
    it('has industry exclusion pill input', () => {
      expect(wizardJs).toContain("wiz-excl-industries");
    });
    it('both are optional', () => {
      expect(wizardJs).toContain("id: 6, title: 'Exclusions', required: false");
    });
    it('conversational tone mentions optional', () => {
      expect(wizardJs).toContain('Totally optional');
    });
  });

  // --- Section 10: Step 7 — Free Text ---
  describe('10. Step 7 — Must-Haves Textarea', () => {
    it('has textarea with 500 char limit', () => {
      expect(wizardJs).toContain('maxlength="500"');
    });
    it('has character counter', () => {
      expect(wizardJs).toContain('wiz-char-count');
    });
    it('Step 7 is optional', () => {
      expect(wizardJs).toContain("id: 7, title: 'Must-Haves', required: false");
    });
    it('conversational header says Last one', () => {
      expect(wizardJs).toContain('Last one!');
    });
  });

  // --- Section 11: Navigation + Progress ---
  describe('11. Navigation + Progress Bar', () => {
    it('progress bar renders 7 segments', () => {
      expect(wizardJs).toContain('i <= _WIZ_TOTAL');
      expect(wizardJs).toContain("var _WIZ_TOTAL = 7");
    });
    it('completed segments get wiz-seg-done class', () => {
      expect(wizardJs).toContain('wiz-seg-done');
    });
    it('active segment gets wiz-seg-active class', () => {
      expect(wizardJs).toContain('wiz-seg-active');
    });
    it('Back button hidden on Step 1', () => {
      expect(wizardJs).toContain("step > 1) { backBtn.classList.remove('u-hidden')");
    });
    it('Skip visible only on optional steps', () => {
      expect(wizardJs).toContain('!stepDef.required');
    });
    it('last step button says Review & Search', () => {
      expect(wizardJs).toContain("'Review & Search'");
    });
    it('Enter key advances to next step', () => {
      expect(wizardJs).toContain("e.key === 'Enter'");
      expect(wizardJs).toContain('_wizNext');
    });
    it('Escape key goes back', () => {
      expect(wizardJs).toContain("e.key === 'Escape'");
      expect(wizardJs).toContain('_wizBack');
    });
  });

  // --- Section 12: Review Screen ---
  describe('12. Review Screen', () => {
    it('review screen has editable textarea', () => {
      expect(wizardJs).toContain('wiz-review-prompt');
      expect(wizardJs).toContain('wiz-review-textarea');
    });
    it('review screen has answer summary', () => {
      expect(wizardJs).toContain('_wizRenderAnswerSummary');
    });
    it('has Search Jobs button', () => {
      expect(wizardJs).toContain('wiz-search-btn');
      expect(wizardJs).toContain('Search Jobs');
    });
    it('has Back button on review', () => {
      expect(wizardJs).toContain('wiz-review-back');
    });
    it('has Start Over link', () => {
      expect(wizardJs).toContain('wiz-start-over');
      expect(wizardJs).toContain('Start Over');
    });
    it('start over clears all answers', () => {
      expect(wizardJs).toContain('_wizardState.answers = {}');
    });
  });

  // --- Section 13: Prompt Assembly ---
  describe('13. Prompt Assembly (Section 7 Format)', () => {
    it('assembles intent from Step 1', () => {
      expect(wizardJs).toContain("parts.push('I\\'m ' + intent");
    });
    it('assembles roles from Step 2', () => {
      expect(wizardJs).toContain("looking for roles in");
    });
    it('assembles locations from Step 3', () => {
      expect(wizardJs).toContain("located in");
      expect(wizardJs).toContain("including remote");
    });
    it('assembles salary from Step 4', () => {
      expect(wizardJs).toContain("My target salary range is");
    });
    it('assembles company size from Step 5', () => {
      expect(wizardJs).toContain("I prefer");
      expect(wizardJs).toContain("companies.");
    });
    it('assembles exclusions from Step 6', () => {
      expect(wizardJs).toContain("Please exclude");
      expect(wizardJs).toContain("Skip these industries");
    });
    it('assembles free text from Step 7', () => {
      expect(wizardJs).toContain("Additional priorities:");
    });
    it('skipped steps omitted from prompt', () => {
      // Each section checks if answer exists before pushing to parts
      expect(wizardJs).toContain('if (a[1])');
      expect(wizardJs).toContain('if (a[2] && a[2].length)');
      expect(wizardJs).toContain('if (a[4] && !a[4].skip)');
    });
  });

  // --- Section 14: PostHog Events ---
  describe('14. PostHog Events', () => {
    it('fires wizard_started on open', () => {
      expect(wizardJs).toContain("captureEvent('wizard_started'");
    });
    it('fires wizard_step_completed on next', () => {
      expect(wizardJs).toContain("captureEvent('wizard_step_completed'");
    });
    it('fires wizard_step_back on back', () => {
      expect(wizardJs).toContain("captureEvent('wizard_step_back'");
    });
    it('fires wizard_completed on review', () => {
      expect(wizardJs).toContain("captureEvent('wizard_completed'");
    });
    it('fires wizard_search_executed on search', () => {
      expect(wizardJs).toContain("captureEvent('wizard_search_executed'");
    });
  });

  // --- Section 15: CSS ---
  describe('15. Wizard CSS', () => {
    it('has progress bar styles', () => {
      expect(inputCss).toContain('.wiz-progress-bar');
      expect(inputCss).toContain('.wiz-seg');
      expect(inputCss).toContain('.wiz-seg-done');
      expect(inputCss).toContain('.wiz-seg-active');
    });
    it('has card selector styles', () => {
      expect(inputCss).toContain('.wiz-card');
      expect(inputCss).toContain('.wiz-card-selected');
    });
    it('has pill styles', () => {
      expect(inputCss).toContain('.wiz-pill');
      expect(inputCss).toContain('.wiz-pill-x');
      expect(inputCss).toContain('.wiz-pill-input');
    });
    it('has slider styles', () => {
      expect(inputCss).toContain('.wiz-range');
      expect(inputCss).toContain('.wiz-slider-disabled');
    });
    it('has navigation styles', () => {
      expect(inputCss).toContain('.wiz-btn-next');
      expect(inputCss).toContain('.wiz-btn-back');
      expect(inputCss).toContain('.wiz-skip-link');
    });
    it('has review screen styles', () => {
      expect(inputCss).toContain('.wiz-review-body');
      expect(inputCss).toContain('.wiz-review-textarea');
      expect(inputCss).toContain('.wiz-review-summary');
    });
    it('has slide-in animation', () => {
      expect(inputCss).toContain('@keyframes wizSlideIn');
      expect(inputCss).toContain('translateX(30px)');
    });
    it('has validation message styles', () => {
      expect(inputCss).toContain('.wiz-validation-msg');
    });
    it('has responsive breakpoints', () => {
      expect(inputCss).toContain('@media (max-width: 600px)');
      expect(inputCss).toContain('@media (max-width: 375px)');
    });
  });

  // --- Section 16: Build + Version ---
  describe('16. Build + Version', () => {
    it('wizard.js in deferred chunk', () => {
      expect(buildJs).toContain("'js/wizard.js'");
    });
    it('version is v10.33', () => {
      expect(versionJs).toContain('v10.33');
    });
    it('dashboard.html has v10.33', () => {
      expect(dashHtml).toContain('v10.33');
    });
    it('dist/dashboard.min.js exists', () => {
      expect(existsSync('dist/dashboard.min.js')).toBe(true);
    });
    it('dist/dashboard-deferred.min.js exists', () => {
      expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
    });
  });

  // --- Section 17: Entry Points ---
  describe('17. Entry Points', () => {
    it('chat empty state has Start Guided Search button', () => {
      expect(dashHtml).toContain('chat-empty-wizard-btn');
      expect(dashHtml).toContain('Start Guided Search');
    });
    it('empty state button uses wand-2 icon', () => {
      expect(dashHtml).toMatch(/chat-empty-wizard-btn[\s\S]*?wand-2/);
    });
    it('new user default checks for zero filters and prompts', () => {
      expect(wizardJs).toContain('_wizCheckNewUserDefault');
      expect(wizardJs).toContain('bj_saved_filters');
      expect(wizardJs).toContain('bj_saved_prompts');
    });
  });

  // --- Section 18: XSS Protection ---
  describe('18. XSS Protection', () => {
    it('has _wizEsc escape function', () => {
      expect(wizardJs).toContain('function _wizEsc');
      expect(wizardJs).toContain('d.textContent = str');
      expect(wizardJs).toContain('d.innerHTML');
    });
    it('card values are escaped', () => {
      expect(wizardJs).toContain("_wizEsc(o.value)");
      expect(wizardJs).toContain("_wizEsc(o.label)");
    });
  });

  // --- Section 19: Pod Team Manifest ---
  describe('19. Pod Team Manifest', () => {
    it('has FB-CHAT-002-A pairing', () => {
      expect(podManifest).toContain('FB-CHAT-002-A');
    });
    it('has FB-CHAT-002-B pairing', () => {
      expect(podManifest).toContain('FB-CHAT-002-B');
    });
    it('has FB-CHAT-002-C pairing', () => {
      expect(podManifest).toContain('FB-CHAT-002-C');
    });
    it('Chief Architect role present', () => {
      expect(podManifest).toContain('Chief Architect');
    });
    it('Lead Platform Engineer role present', () => {
      expect(podManifest).toContain('Lead Platform Eng');
    });
    it('System Architect—Scalability role present', () => {
      expect(podManifest).toContain('System Architect');
    });
    it('Forward-Looking Dev role present', () => {
      expect(podManifest).toContain('Forward-Looking Dev');
    });
    it('Evolvability Strategist role present', () => {
      expect(podManifest).toContain('Evolvability Strategist');
    });
  });

  // --- Section 20: Addendum A Investigation ---
  describe('20. Addendum A — is_us_job Investigation', () => {
    it('job feed does NOT use is_us_job column', () => {
      const jobFeedJs = readFileSync('js/job-feed.js', 'utf8');
      expect(jobFeedJs).not.toContain('is_us_job');
    });
    it('job feed uses loc_country for US filtering', () => {
      const jobFeedJs = readFileSync('js/job-feed.js', 'utf8');
      expect(jobFeedJs).toContain('loc_country');
    });
  });
});
