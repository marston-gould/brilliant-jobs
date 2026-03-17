// tests/fb-chat-002-b-backend-wiring.test.js
// FB-CHAT-002 Session B: Backend Wiring + Save/Edit + Result Presentation
// 2026-03-16 | v10.34

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const wizardJs = readFileSync('js/wizard.js', 'utf8');
const chatJs = readFileSync('js/chat.js', 'utf8');
const chatSearchEF = readFileSync('supabase/functions/chat-job-search/index.ts', 'utf8');
const inputCss = readFileSync('src/input.css', 'utf8');
const versionJs = readFileSync('js/version.js', 'utf8');

describe('FB-CHAT-002-B: Backend Wiring + Save/Edit + Result Presentation', () => {

  // --- Section 1: Schema Migration ---
  describe('1. Schema Migration', () => {
    it('migration file exists', () => {
      expect(existsSync('supabase/migrations/v10.33-fb-chat-002-b-wizard-columns.sql')).toBe(true);
    });
    it('migration adds source column', () => {
      const sql = readFileSync('supabase/migrations/v10.33-fb-chat-002-b-wizard-columns.sql', 'utf8');
      expect(sql).toContain('source text NOT NULL DEFAULT');
      expect(sql).toContain("'chat'");
    });
    it('migration adds wizard_answers column', () => {
      const sql = readFileSync('supabase/migrations/v10.33-fb-chat-002-b-wizard-columns.sql', 'utf8');
      expect(sql).toContain('wizard_answers jsonb');
    });
  });

  // --- Section 2: Chat-Job-Search EF Editorial Commentary ---
  describe('2. chat-job-search EF — Editorial Commentary', () => {
    it('system prompt includes WIZARD EDITORIAL COMMENTARY section', () => {
      expect(chatSearchEF).toContain('WIZARD EDITORIAL COMMENTARY');
    });
    it('instructs per-job commentary format (headline/why_fit/watch_for)', () => {
      expect(chatSearchEF).toContain('headline=');
      expect(chatSearchEF).toContain('why_fit=');
      expect(chatSearchEF).toContain('watch_for=');
    });
    it('instructs XML job tags in <editorial> block', () => {
      expect(chatSearchEF).toContain('<editorial>');
      expect(chatSearchEF).toContain('<job title=');
    });
    it('instructs referencing user wizard answers in why_fit', () => {
      expect(chatSearchEF).toContain("wizard answers");
    });
    it('instructs honest watch_for assessment', () => {
      expect(chatSearchEF).toContain('honest in watch_for');
    });
    it('[WIZARD] prefix triggers editorial mode', () => {
      expect(chatSearchEF).toContain('[WIZARD]');
    });
  });

  // --- Section 3: Wizard Search Execution ---
  describe('3. _wizExecuteSearch — Full Backend Wiring', () => {
    it('function is async', () => {
      expect(wizardJs).toContain('async function _wizExecuteSearch');
    });
    it('prefixes prompt with [WIZARD] for editorial mode', () => {
      expect(wizardJs).toContain("[WIZARD] ");
    });
    it('calls api-gateway/chat-job-search', () => {
      expect(wizardJs).toContain('api-gateway/chat-job-search');
    });
    it('sends Authorization header with Bearer token', () => {
      expect(wizardJs).toContain("'Authorization': 'Bearer ' + token");
    });
    it('handles error with friendly retry message', () => {
      expect(wizardJs).toContain("find an exact match");
      expect(wizardJs).toContain('Retry');
    });
    it('shows loading state on search button', () => {
      expect(wizardJs).toContain("searchBtn.disabled = true");
      expect(wizardJs).toContain("'Searching...'");
    });
  });

  // --- Section 4: Editorial Result Parsing ---
  describe('4. Editorial Result Parsing', () => {
    it('parses <editorial> block from AI response', () => {
      expect(wizardJs).toContain('_wizParseEditorial');
      expect(wizardJs).toContain('<editorial>');
    });
    it('extracts title, company, headline, why_fit, watch_for per job', () => {
      expect(wizardJs).toContain("title: m[1]");
      expect(wizardJs).toContain("company: m[2]");
      expect(wizardJs).toContain("headline: m[3]");
      expect(wizardJs).toContain("why_fit: m[4]");
      expect(wizardJs).toContain("watch_for: m[5]");
    });
  });

  // --- Section 5: Editorial Result Cards ---
  describe('5. Editorial Result Card Rendering', () => {
    it('renders editorial cards container', () => {
      expect(wizardJs).toContain('wiz-editorial-cards');
    });
    it('renders title and company per card', () => {
      expect(wizardJs).toContain('wiz-ed-title');
      expect(wizardJs).toContain('wiz-ed-company');
    });
    it('renders headline section', () => {
      expect(wizardJs).toContain('The headline:');
    });
    it('renders why-fit section', () => {
      expect(wizardJs).toContain('Why this is a fit:');
    });
    it('renders watch-for section', () => {
      expect(wizardJs).toContain('What to watch for:');
    });
    it('has View Full Feed button', () => {
      expect(wizardJs).toContain('wiz-view-feed-btn');
      expect(wizardJs).toContain('View Full Feed');
    });
    it('has Edit Search button', () => {
      expect(wizardJs).toContain('wiz-edit-wizard-btn');
      expect(wizardJs).toContain('Edit Search');
    });
    it('editorial card CSS exists', () => {
      expect(inputCss).toContain('.wiz-editorial-card');
      expect(inputCss).toContain('.wiz-ed-fit');
      expect(inputCss).toContain('.wiz-ed-watch');
    });
  });

  // --- Section 6: Derived Filters Application ---
  describe('6. Derived Filters Extraction + Application', () => {
    it('calls applyDerivedFilters or applyChatFilters', () => {
      expect(wizardJs).toContain('applyDerivedFilters');
      expect(wizardJs).toContain('applyChatFilters');
    });
    it('fires wizard_filters_extracted PostHog event', () => {
      expect(wizardJs).toContain("captureEvent('wizard_filters_extracted'");
    });
  });

  // --- Section 7: Save Dialog ---
  describe('7. Save Dialog + Persistence', () => {
    it('auto-opens save dialog after search', () => {
      expect(wizardJs).toContain('_wizOpenSaveDialog');
    });
    it('saves with source: wizard', () => {
      expect(wizardJs).toContain("source: 'wizard'");
    });
    it('saves wizard_answers to DB', () => {
      expect(wizardJs).toContain('wizard_answers: _wizardState.answers');
    });
    it('upserts existing prompt on re-edit', () => {
      expect(wizardJs).toContain('editingId');
      expect(wizardJs).toContain("method: 'PATCH'");
    });
    it('creates new prompt with POST', () => {
      expect(wizardJs).toContain("method: 'POST'");
    });
    it('fires wizard_prompt_saved PostHog event', () => {
      expect(wizardJs).toContain("captureEvent('wizard_prompt_saved'");
    });
    it('fires wizard_edit_saved PostHog event on update', () => {
      expect(wizardJs).toContain("captureEvent('wizard_edit_saved'");
    });
    it('refreshes saved prompts list after save', () => {
      expect(wizardJs).toContain('loadSavedPromptsFromDB');
    });
  });

  // --- Section 8: Wizard Re-entry ---
  describe('8. Wizard Re-entry (Edit Flow)', () => {
    it('_wizEditFromPrompt function exists', () => {
      expect(wizardJs).toContain('function _wizEditFromPrompt');
    });
    it('finds prompt in _savedPrompts', () => {
      expect(wizardJs).toContain("_savedPrompts.find");
    });
    it('checks source === wizard', () => {
      expect(wizardJs).toContain("prompt.source !== 'wizard'");
    });
    it('pre-fills answers from wizard_answers', () => {
      expect(wizardJs).toContain('prompt.wizard_answers');
    });
    it('sets editingPromptId for upsert', () => {
      expect(wizardJs).toContain('editingPromptId = promptId');
    });
    it('fires wizard_edit_started PostHog event', () => {
      expect(wizardJs).toContain("captureEvent('wizard_edit_started'");
    });
    it('exported to window', () => {
      expect(wizardJs).toContain('window._wizEditFromPrompt');
    });
  });

  // --- Section 9: Filter Selector Wand Icon ---
  describe('9. Filter Selector — Wand Icon for Wizard Prompts', () => {
    it('uses wand-2 icon for wizard-source prompts', () => {
      expect(chatJs).toContain("prompt.source === 'wizard') ? 'wand-2' : 'message-square'");
    });
    it('wizard prompts click re-enters wizard', () => {
      expect(chatJs).toContain("_wizEditFromPrompt(prompt.id)");
    });
    it('chat prompts still go to chat mode', () => {
      expect(chatJs).toContain("loadPrompt(prompt.id)");
    });
  });

  // --- Section 10: Edit in Wizard Button ---
  describe('10. Edit in Wizard Button on Loaded Prompt', () => {
    it('shows Edit in Wizard button for wizard-source prompts', () => {
      expect(chatJs).toContain('Edit in Wizard');
      expect(chatJs).toContain('wiz-edit-in-wizard-btn');
    });
    it('button calls _wizEditFromPrompt', () => {
      expect(chatJs).toContain("_wizEditFromPrompt");
    });
    it('only shown when source === wizard and wizard_answers present', () => {
      expect(chatJs).toContain("prompt.source === 'wizard' && prompt.wizard_answers");
    });
  });

  // --- Section 11: Saved Prompts Query includes new columns ---
  describe('11. Saved Prompts Query', () => {
    it('select includes source column', () => {
      expect(chatJs).toContain('source,wizard_answers');
    });
  });

  // --- Section 12: PostHog Events (Session B) ---
  describe('12. PostHog Events (Session B)', () => {
    it('fires wizard_prompt_assembled', () => {
      expect(wizardJs).toContain("captureEvent('wizard_prompt_assembled'");
    });
    it('fires wizard_prompt_edited', () => {
      expect(wizardJs).toContain("captureEvent('wizard_prompt_edited'");
    });
    it('fires wizard_filters_extracted', () => {
      expect(wizardJs).toContain("captureEvent('wizard_filters_extracted'");
    });
    it('fires wizard_results_shown', () => {
      expect(wizardJs).toContain("captureEvent('wizard_results_shown'");
    });
    it('fires wizard_prompt_saved', () => {
      expect(wizardJs).toContain("captureEvent('wizard_prompt_saved'");
    });
    it('fires wizard_edit_started', () => {
      expect(wizardJs).toContain("captureEvent('wizard_edit_started'");
    });
    it('fires wizard_edit_saved', () => {
      expect(wizardJs).toContain("captureEvent('wizard_edit_saved'");
    });
    it('fires wizard_abandoned', () => {
      expect(wizardJs).toContain("captureEvent('wizard_abandoned'");
    });
  });

  // --- Section 13: Error Handling ---
  describe('13. Error Handling', () => {
    it('search failure shows friendly retry UI', () => {
      expect(wizardJs).toContain("Back to Review");
      expect(wizardJs).toContain("Retry");
    });
    it('uses reportError for error tracking', () => {
      expect(wizardJs).toContain("reportError('wizard:search'");
      expect(wizardJs).toContain("reportError('wizard:save'");
    });
    it('save failure shows toast', () => {
      expect(wizardJs).toContain("Failed to save search");
    });
  });

  // --- Section 14: Build + Version ---
  describe('14. Build + Version', () => {
    it('version is v10.34', () => {
      expect(versionJs).toContain('v10.34');
    });
    it('dist/dashboard-deferred.min.js exists', () => {
      expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
    });
  });
});
