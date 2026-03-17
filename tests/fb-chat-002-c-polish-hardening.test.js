// tests/fb-chat-002-c-polish-hardening.test.js
// FB-CHAT-002 Session C: Polish + Hardening + CI/CD + Release
// 2026-03-16 | v10.36

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const wizardJs = readFileSync('js/wizard.js', 'utf8');
const chatJs = readFileSync('js/chat.js', 'utf8');
const chatSearchEF = readFileSync('supabase/functions/chat-job-search/index.ts', 'utf8');
const inputCss = readFileSync('src/input.css', 'utf8');
const dashHtml = readFileSync('dashboard.html', 'utf8');
const versionJs = readFileSync('js/version.js', 'utf8');

describe('FB-CHAT-002-C: Polish + Hardening + CI/CD + Release', () => {

  // --- Section 1: Keyboard Accessibility ---
  describe('1. Keyboard Accessibility', () => {
    it('cards have tabindex=0 for keyboard focus', () => {
      expect(wizardJs).toContain('tabindex="0"');
    });
    it('cards have role=button', () => {
      expect(wizardJs).toContain('role="button"');
    });
    it('cards have aria-pressed', () => {
      expect(wizardJs).toContain('aria-pressed');
    });
    it('pill remove buttons have aria-label', () => {
      expect(wizardJs).toContain('aria-label="Remove"');
    });
    it('cards respond to Enter and Space keydown', () => {
      expect(wizardJs).toContain("e.key === 'Enter' || e.key === ' '");
    });
    it('wizard panel handles Enter for next step', () => {
      expect(wizardJs).toContain("e.key === 'Enter'");
      expect(wizardJs).toContain('_wizNext');
    });
    it('wizard panel handles Escape for back', () => {
      expect(wizardJs).toContain("e.key === 'Escape'");
      expect(wizardJs).toContain('_wizBack');
    });
    it('focus-visible styles on cards', () => {
      expect(inputCss).toContain('.wiz-card:focus-visible');
    });
    it('focus-visible styles on pill inputs', () => {
      expect(inputCss).toContain('.wiz-pill-input:focus-visible');
    });
    it('focus-visible styles on range slider', () => {
      expect(inputCss).toContain('.wiz-range:focus-visible');
    });
    it('focus-visible styles on buttons', () => {
      expect(inputCss).toContain('.wiz-btn:focus-visible');
    });
    it('focus-visible styles on textarea', () => {
      expect(inputCss).toContain('.wiz-textarea:focus-visible');
    });
    it('focus-visible styles on skip link', () => {
      expect(inputCss).toContain('.wiz-skip-link:focus-visible');
    });
  });

  // --- Section 2: Micro-Interactions + Polish ---
  describe('2. Micro-Interactions + Polish', () => {
    it('card hover has box-shadow', () => {
      expect(inputCss).toContain('.wiz-card:hover');
      expect(inputCss).toMatch(/wiz-card:hover[\s\S]*?box-shadow/);
    });
    it('selected card has accent box-shadow', () => {
      expect(inputCss).toMatch(/wiz-card-selected[\s\S]*?box-shadow.*accent/);
    });
    it('pill entry animation exists', () => {
      expect(inputCss).toContain('@keyframes wizPillIn');
      expect(inputCss).toContain('.wiz-pill { animation: wizPillIn');
    });
    it('progress bar segments have transition', () => {
      expect(inputCss).toMatch(/\.wiz-seg\s*\{[^}]*transition.*background/);
    });
    it('slide-in animation on steps', () => {
      expect(inputCss).toContain('@keyframes wizSlideIn');
      expect(inputCss).toContain('translateX(30px)');
    });
    it('card press scale(0.97)', () => {
      expect(inputCss).toContain('scale(0.97)');
    });
    it('slider track styling', () => {
      expect(inputCss).toContain('webkit-slider-runnable-track');
      expect(inputCss).toContain('moz-range-track');
    });
  });

  // --- Section 3: Mobile Responsive ---
  describe('3. Mobile Responsive (375px+)', () => {
    it('600px breakpoint for review body', () => {
      expect(inputCss).toContain('@media (max-width: 600px)');
    });
    it('375px breakpoint for cards and headers', () => {
      expect(inputCss).toContain('@media (max-width: 375px)');
    });
    it('480px breakpoint for fine-grained mobile', () => {
      expect(inputCss).toContain('@media (max-width: 480px)');
    });
    it('review body stacks vertically on mobile', () => {
      expect(inputCss).toMatch(/600px[\s\S]*?flex-direction:\s*column/);
    });
    it('cards go single-column on 375px', () => {
      expect(inputCss).toMatch(/375px[\s\S]*?grid-template-columns:\s*1fr/);
    });
  });

  // --- Section 4: EF Latency Monitoring ---
  describe('4. EF Latency Monitoring', () => {
    it('chat-job-search EF logs latency_ms', () => {
      expect(chatSearchEF).toContain('_efStartMs');
      expect(chatSearchEF).toContain('_efDurationMs');
      expect(chatSearchEF).toContain('latency_ms');
    });
    it('EF returns latency_ms in response', () => {
      expect(chatSearchEF).toContain('latency_ms: _efDurationMs');
    });
    it('EF logs cache_hit status', () => {
      expect(chatSearchEF).toContain('cache_hit');
    });
    it('client captures wizard_ef_latency PostHog event', () => {
      expect(wizardJs).toContain("captureEvent('wizard_ef_latency'");
      expect(wizardJs).toContain('latency_ms');
    });
  });

  // --- Section 5: prevMode Tracking Fix ---
  describe('5. prevMode Tracking (3-Mode State)', () => {
    it('prevMode detects guided state from wizard panel visibility', () => {
      expect(chatJs).toContain("'guided' : 'filters'");
      expect(chatJs).toContain('wizard-panel');
    });
    it('abandon tracking fires when switching away from wizard', () => {
      expect(chatJs).toContain('_wizTrackAbandon');
    });
  });

  // --- Section 6: Freeform Chat Regression ---
  describe('6. Freeform Chat Regression', () => {
    it('sendChatMessage function exists', () => {
      expect(chatJs).toContain('async function sendChatMessage');
    });
    it('initChatMode function exists', () => {
      expect(chatJs).toContain('function initChatMode');
    });
    it('loadPrompt function exists', () => {
      expect(chatJs).toContain('async function loadPrompt');
    });
    it('deletePrompt function exists', () => {
      expect(chatJs).toContain('async function deletePrompt');
    });
    it('syncFilterToChat function exists', () => {
      expect(chatJs).toContain('async function syncFilterToChat');
    });
    it('syncChatToFilter function exists', () => {
      expect(chatJs).toContain('async function syncChatToFilter');
    });
    it('applyChatFilters function exists', () => {
      expect(chatJs).toContain('function applyChatFilters');
    });
    it('updateDerivedFilters function exists', () => {
      expect(chatJs).toContain('async function updateDerivedFilters');
    });
    it('filter→chat sync fires on mode switch', () => {
      expect(chatJs).toContain("prevMode === 'filters'");
      expect(chatJs).toContain('syncFilterToChat()');
    });
    it('chat→filter sync fires on mode switch', () => {
      expect(chatJs).toContain("prevMode === 'chat'");
      expect(chatJs).toContain('syncChatToFilter()');
    });
    it('loadPrompt applies derived_filters to feed', () => {
      expect(chatJs).toContain('applyChatFilters(prompt.derived_filters)');
    });
    it('mode toggle still has Filters and Chat buttons', () => {
      expect(dashHtml).toContain('data-mode="filters"');
      expect(dashHtml).toContain('data-mode="chat"');
    });
    it('chat panel still exists', () => {
      expect(dashHtml).toContain('id="chat-panel"');
    });
    it('chat input still exists', () => {
      expect(dashHtml).toContain('id="chat-input"');
    });
    it('chat send button still exists', () => {
      expect(dashHtml).toContain('id="chat-send-btn"');
    });
    it('inline save prompt row still exists', () => {
      expect(dashHtml).toContain('id="save-prompt-row"');
    });
  });

  // --- Section 7: Mode Toggle 3 Modes ---
  describe('7. Mode Toggle — All 3 Modes', () => {
    it('has Filters segment', () => {
      expect(dashHtml).toContain('data-mode="filters"');
    });
    it('has Chat segment', () => {
      expect(dashHtml).toContain('data-mode="chat"');
    });
    it('has Guided segment', () => {
      expect(dashHtml).toContain('data-mode="guided"');
    });
    it('setSearchMode handles all 3 modes', () => {
      expect(chatJs).toContain("mode === 'filters'");
      expect(chatJs).toContain("mode === 'chat'");
      expect(chatJs).toContain("mode === 'guided'");
    });
  });

  // --- Section 8: Validation ---
  describe('8. Validation — Friendly Inline Errors', () => {
    it('Step 1 validation requires selection', () => {
      expect(wizardJs).toContain("!!_wizardState.answers[1]");
    });
    it('Step 2 validation requires at least 1 keyword', () => {
      expect(wizardJs).toContain("_wizardState.answers[2].length > 0");
    });
    it('Step 3 validation requires location OR remote', () => {
      expect(wizardJs).toContain("a3.locations && a3.locations.length > 0) || a3.remote");
    });
    it('validation messages use warm tone (not red)', () => {
      expect(inputCss).toContain('.wiz-validation-msg');
      expect(inputCss).toMatch(/wiz-validation-msg[\s\S]*?#D97706/); // amber, not red
    });
    it('validation message says friendly text', () => {
      expect(wizardJs).toContain('Pick one to get started');
      expect(wizardJs).toContain('Add at least one role or keyword');
      expect(wizardJs).toContain('Add a location or enable remote');
    });
  });

  // --- Section 9: No Emoji ---
  describe('9. No Emoji — Lucide Icons Only', () => {
    it('wizard.js has no emoji characters', () => {
      // Check for common emoji ranges (excluding unicode escapes for en-dash etc.)
      const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      expect(emojiPattern.test(wizardJs)).toBe(false);
    });
    it('wizard uses data-lucide for all icons', () => {
      expect(wizardJs).toContain('data-lucide=');
    });
  });

  // --- Section 10: Build + Version ---
  describe('10. Build + Version', () => {
    it('version is v10.36', () => {
      expect(versionJs).toContain('v10.36');
    });
    it('dashboard.html has v10.36', () => {
      expect(dashHtml).toContain('v10.36');
    });
    it('dist bundles exist', () => {
      expect(existsSync('dist/dashboard.min.js')).toBe(true);
      expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
      expect(existsSync('dist/admin.min.js')).toBe(true);
    });
    it('styles.css rebuilt', () => {
      const css = readFileSync('styles.css', 'utf8');
      expect(css).toContain('wiz-card');
      expect(css).toContain('wiz-editorial-card');
    });
  });

  // --- Section 11: Complete Feature Inventory ---
  describe('11. FB-CHAT-002 Complete Feature Inventory', () => {
    it('wizard.js exists', () => {
      expect(existsSync('js/wizard.js')).toBe(true);
    });
    it('migration exists', () => {
      expect(existsSync('supabase/migrations/v10.33-fb-chat-002-b-wizard-columns.sql')).toBe(true);
    });
    it('Session A test file exists', () => {
      expect(existsSync('tests/fb-chat-002-a-wizard-ui.test.js')).toBe(true);
    });
    it('Session B test file exists', () => {
      expect(existsSync('tests/fb-chat-002-b-backend-wiring.test.js')).toBe(true);
    });
    it('Session C test file exists', () => {
      expect(existsSync('tests/fb-chat-002-c-polish-hardening.test.js')).toBe(true);
    });
  });
});
