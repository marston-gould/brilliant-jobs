/**
 * AIS-F5-S1: Application Modes — Extension Popup + Sync
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('AIS-F5-S1: Extension popup 6 modes', () => {
  const html = read('extension/popup.html');
  it('manual mode card exists', () => expect(html).toContain('data-mode="manual"'));
  it('score-gated mode card exists', () => expect(html).toContain('data-mode="score-gated"'));
  it('auto-apply mode card exists', () => expect(html).toContain('data-mode="auto-apply"'));
  it('auto-score-gate mode card exists', () => expect(html).toContain('data-mode="auto-score-gate"'));
  it('auto-rewrite mode card exists', () => expect(html).toContain('data-mode="auto-rewrite"'));
  it('full-autopilot mode card exists', () => expect(html).toContain('data-mode="full-autopilot"'));
});

describe('AIS-F5-S1: popup-consumer.ts mode sync', () => {
  const src = read('extension/popup-consumer.ts');
  it('reads mode from chrome.storage.local', () => expect(src).toContain('chrome.storage.local.get'));
  it('persists mode to chrome.storage.sync', () => expect(src).toContain('chrome.storage.sync.set'));
  it('notifies background to sync to Supabase', () => expect(src).toContain('syncApplySettingsToSupabase'));
  it('threshold section visibility controlled by mode', () => expect(src).toContain('_updateThresholdVisibility'));
  it('PostHog mode_changed fired', () => expect(src).toContain("'mode_changed'"));
  it('mode card selection highlight', () => expect(src).toContain('_selectModeCard'));
  it('listens for settings changes from background', () => expect(src).toContain('applicationMode'));
});

describe('AIS-F5-S1: version', () => {
  it('version is v9.66', () => expect(read('js/version.js')).toContain('v9.66'));
});
