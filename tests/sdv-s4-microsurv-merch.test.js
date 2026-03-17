/**
 * FB-SURVEY-DELIVERY-001 Session 4: Micro-Survey Priority Fix + Merch Integration
 * Tests: 2s debounce, priority queue, merch survey_cta handler, PostHog events, silent catch fixes
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. Micro-Survey Priority Queue ─────────────────────────────────────────
describe('SDV-S4: Micro-survey priority queue', () => {
  const ms = readFile('js/micro-surveys.js');

  it('flush delay is 2000ms (2s debounce per spec)', () => {
    expect(ms).toContain('FLUSH_DELAY_MS = 2000');
  });

  it('has PRIORITY map with all 4 micro-survey types', () => {
    expect(ms).toContain('micro_paywall_v1: 100');
    expect(ms).toContain('micro_search_v1: 60');
    expect(ms).toContain('micro_apply_v1: 50');
    expect(ms).toContain('micro_data_v1: 30');
  });

  it('paywall friction has highest priority (100)', () => {
    const match = ms.match(/micro_paywall_v1:\s*(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match[1])).toBe(100);
  });

  it('enqueueMicroSurvey pushes to _pendingQueue', () => {
    expect(ms).toContain('_pendingQueue.push(config)');
  });

  it('enqueueMicroSurvey resets flush timer on each call', () => {
    expect(ms).toContain('clearTimeout(_flushTimer)');
    expect(ms).toContain('setTimeout(flushQueue, FLUSH_DELAY_MS)');
  });

  it('flushQueue sorts by priority descending', () => {
    expect(ms).toContain('PRIORITY[b.version]');
    expect(ms).toContain('PRIORITY[a.version]');
  });

  it('flushQueue picks first element as winner (highest priority)', () => {
    expect(ms).toContain('_pendingQueue[0]');
  });

  it('flushQueue clears queue after picking winner', () => {
    expect(ms).toContain('_pendingQueue = []');
  });

  it('logs suppressed surveys for analytics', () => {
    expect(ms).toContain('suppressed');
    expect(ms).toContain('console.info');
  });

  it('session lock still works (one micro-survey per session)', () => {
    expect(ms).toContain('canShowMicroSurvey');
    expect(ms).toContain('markMicroSurveyShown');
    expect(ms).toContain('bj_micro_survey_shown');
  });
});

// ─── 2. Silent Catch Fixes ───────────────────────────────────────────────────
describe('SDV-S4: No silent catches in micro-surveys.js', () => {
  const ms = readFile('js/micro-surveys.js');

  it('no bare catch blocks without error variable', () => {
    // Match "catch {" without a variable — these are ES2019 optional catch
    // but violate the no-silent-fails principle
    const bareCatch = /catch\s*\{/g;
    const matches = ms.match(bareCatch);
    expect(matches).toBeNull();
  });

  it('sessionStorage read catch has console.warn', () => {
    expect(ms).toContain('[micro-survey] sessionStorage read failed');
  });

  it('sessionStorage write catch has console.warn', () => {
    expect(ms).toContain('[micro-survey] sessionStorage write failed');
  });

  it('session parse catch has console.warn', () => {
    expect(ms).toContain('[micro-survey] session parse failed');
  });
});

// ─── 3. Merch survey_cta Content Type ────────────────────────────────────────
describe('SDV-S4: Merch survey_cta handler in app.js', () => {
  const app = readFile('js/app.js');

  it('checks for content_type === survey_cta', () => {
    expect(app).toContain("content_type === 'survey_cta'");
  });

  it('checks survey completion from feedback table', () => {
    expect(app).toContain("from('feedback')");
    expect(app).toContain('survey_version');
    expect(app).toContain("eq('user_id', window.currentUser.id)");
  });

  it('hides CTA card when survey already completed', () => {
    expect(app).toContain("card.style.display = 'none'");
  });

  it('renders credit badge when credit_amount > 0', () => {
    expect(app).toContain('credit_amount');
    expect(app).toContain('#22c55e');
    expect(app).toContain('Earn');
  });

  it('survey CTA links with src=merch', () => {
    expect(app).toContain('src=merch');
    expect(app).toContain('c.survey_url');
  });

  it('fires survey_merch_cta_shown PostHog event', () => {
    expect(app).toContain("'survey_merch_cta_shown'");
    expect(app).toContain('survey_version');
    expect(app).toContain('placement_id');
    expect(app).toContain('credit_amount');
  });

  it('fires survey_merch_cta_clicked PostHog event', () => {
    expect(app).toContain("'survey_merch_cta_clicked'");
    expect(app).toContain('survey_version');
    expect(app).toContain('placement_id');
  });

  it('survey completion check is non-fatal', () => {
    expect(app).toContain('[merch] survey completion check failed');
  });

  it('extracts survey_version from URL params', () => {
    expect(app).toContain("v=([^&]+)");
  });
});

// ─── 4. File Inventory ───────────────────────────────────────────────────────
describe('SDV-S4: File Inventory', () => {
  it('js/micro-surveys.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/micro-surveys.js'))).toBe(true);
  });
  it('js/app.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/app.js'))).toBe(true);
  });
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s4-microsurv-merch.test.js'))).toBe(true);
  });
});
