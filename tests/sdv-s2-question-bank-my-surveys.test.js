/**
 * FB-SURVEY-DELIVERY-001 Session 2: Question Bank Extraction + My Surveys Tab
 * Tests: shared module, survey.html refactor, micro-surveys.js compatibility,
 *        My Surveys tab HTML, notification-center.js wiring, PostHog events
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. Shared Question Bank Module ─────────────────────────────────────────
describe('SDV-S2: js/survey-questions.js', () => {
  const sq = readFile('js/survey-questions.js');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/survey-questions.js'))).toBe(true);
  });

  it('exports BJ_SURVEY_QUESTIONS to window', () => {
    expect(sq).toContain('window.BJ_SURVEY_QUESTIONS');
  });

  it('contains churnQuestions', () => {
    expect(sq).toContain('churnQuestions');
    expect(sq).toContain("id: 'outcome'");
  });

  it('contains periodicQuestions', () => {
    expect(sq).toContain('periodicQuestions');
    expect(sq).toContain("id: 'search_quality'");
  });

  it('contains periodicQuestionsV2 extending V1', () => {
    expect(sq).toContain('periodicQuestionsV2');
    expect(sq).toContain("id: 'job_anxiety'");
    expect(sq).toContain('periodicQuestions.concat');
  });

  it('contains ghostQuestions', () => {
    expect(sq).toContain('ghostQuestions');
    expect(sq).toContain("id: 'ghost_rate'");
  });

  it('contains npsQuestions', () => {
    expect(sq).toContain('npsQuestions');
    expect(sq).toContain("id: 'nps_score'");
  });

  it('contains microSurveyQuestions with all 4 types', () => {
    expect(sq).toContain('microSurveyQuestions');
    expect(sq).toContain('micro_paywall_v1');
    expect(sq).toContain('micro_search_v1');
    expect(sq).toContain('micro_apply_v1');
    expect(sq).toContain('micro_data_v1');
  });

  it('exports version maps', () => {
    expect(sq).toContain('exitVersions');
    expect(sq).toContain('periodicVersions');
    expect(sq).toContain('npsVersions');
    expect(sq).toContain('ghostVersions');
  });

  it('exports getQuestionText lookup function', () => {
    expect(sq).toContain('getQuestionText');
    expect(sq).toContain('function getQuestionText(questionId)');
  });

  it('getQuestionText searches all banks', () => {
    expect(sq).toContain('churnQuestions, periodicQuestions, periodicQuestionsV2, ghostQuestions, npsQuestions');
    expect(sq).toContain('microSurveyQuestions');
  });

  it('getQuestionText falls back to raw ID', () => {
    expect(sq).toContain('return questionId');
  });

  it('is an IIFE (no module pollution)', () => {
    expect(sq).toMatch(/^\(function\(\)/m);
    expect(sq).toContain("'use strict'");
  });
});

// ─── 2. survey.html Refactor ─────────────────────────────────────────────────
describe('SDV-S2: survey.html imports shared module', () => {
  const html = readFile('survey.html');

  it('loads survey-questions.js via script tag before main script', () => {
    const scriptIdx = html.indexOf('survey-questions.js');
    const mainScriptIdx = html.indexOf('const SUPABASE_URL');
    expect(scriptIdx).toBeGreaterThan(-1);
    expect(scriptIdx).toBeLessThan(mainScriptIdx);
  });

  it('references BJ_SURVEY_QUESTIONS', () => {
    expect(html).toContain('BJ_SURVEY_QUESTIONS');
  });

  it('creates local aliases from shared module', () => {
    expect(html).toContain('_SQ.churnQuestions');
    expect(html).toContain('_SQ.periodicQuestions');
    expect(html).toContain('_SQ.npsQuestions');
    expect(html).toContain('_SQ.ghostQuestions');
    expect(html).toContain('_SQ.exitVersions');
    expect(html).toContain('_SQ.periodicVersions');
  });

  it('has fallback defaults for all aliases', () => {
    expect(html).toContain('|| []');
    expect(html).toContain("|| { 'exit_v1': churnQuestions }");
  });

  it('does NOT contain inline question bank definitions', () => {
    // The old inline block had multi-line question objects — should be gone
    expect(html).not.toContain("q: \"First things first — did you land a job?\"");
    expect(html).not.toContain("q: \"How relevant are the jobs showing up in your feed?\"");
    expect(html).not.toContain("q: \"How likely are you to recommend Brilliant Jobs");
  });

  it('resolveVersion still works (references local aliases)', () => {
    expect(html).toContain('exitVersions[version]');
    expect(html).toContain('periodicVersions[version]');
    expect(html).toContain('npsVersions[version]');
    expect(html).toContain('ghostVersions[version]');
  });

  it('is significantly shorter than before extraction', () => {
    // Before: ~1572 lines. After: should be ~600+ lines shorter
    const lines = html.split('\n').length;
    expect(lines).toBeLessThan(1150);
  });
});

// ─── 3. Dashboard HTML: My Surveys Tab ───────────────────────────────────────
describe('SDV-S2: dashboard.html My Surveys tab', () => {
  const html = readFile('dashboard.html');

  it('has My Surveys tab in NC tabs', () => {
    expect(html).toContain('data-panel="nc-surveys"');
    expect(html).toContain('My Surveys');
  });

  it('has panel-nc-surveys panel', () => {
    expect(html).toContain('id="panel-nc-surveys"');
  });

  it('has available surveys container', () => {
    expect(html).toContain('id="nc-surveys-available-list"');
    expect(html).toContain('Available Surveys');
  });

  it('has completed surveys container', () => {
    expect(html).toContain('id="nc-surveys-completed-list"');
    expect(html).toContain('Your Responses');
  });

  it('has load more button', () => {
    expect(html).toContain('id="nc-surveys-load-more"');
    expect(html).toContain('ncLoadMoreSurveys');
  });
});

// ─── 4. notification-center.js: My Surveys Logic ─────────────────────────────
describe('SDV-S2: notification-center.js My Surveys', () => {
  const nc = readFile('js/notification-center.js');

  it('has ncLoadMySurveys function', () => {
    expect(nc).toContain('function ncLoadMySurveys()');
  });

  it('ncLoadMySurveys fires survey_history_viewed PostHog event', () => {
    expect(nc).toContain("'survey_history_viewed'");
    expect(nc).toContain("tab: 'my_surveys'");
  });

  it('has ncLoadAvailableSurveys function', () => {
    expect(nc).toContain('function ncLoadAvailableSurveys()');
  });

  it('available surveys queries survey_campaigns', () => {
    expect(nc).toContain("from('survey_campaigns')");
    expect(nc).toContain("eq('is_active', true)");
  });

  it('available surveys checks feedback for completions', () => {
    expect(nc).toContain("from('feedback')");
    expect(nc).toContain('completedVersions');
  });

  it('available surveys shows credit reward badge', () => {
    expect(nc).toContain('Earn');
    expect(nc).toContain('credits');
    expect(nc).toContain('#22c55e');
  });

  it('available surveys links to /survey with src=my_surveys', () => {
    expect(nc).toContain('src=my_surveys');
  });

  it('available surveys shows empty state', () => {
    expect(nc).toContain('No surveys available right now');
  });

  it('available surveys filters out exit surveys', () => {
    expect(nc).toContain("survey_type !== 'exit'");
  });

  it('has ncLoadCompletedSurveys function', () => {
    expect(nc).toContain('function ncLoadCompletedSurveys()');
  });

  it('completed surveys queries feedback table', () => {
    expect(nc).toContain("from('feedback')");
    expect(nc).toContain("eq('user_id', currentUser.id)");
    expect(nc).toContain("order('created_at', { ascending: false })");
  });

  it('completed surveys implements pagination', () => {
    expect(nc).toContain('_ncSurveysPage');
    expect(nc).toContain('_ncSurveysPageSize');
    expect(nc).toContain('.range(offset');
  });

  it('completed surveys looks up credit grants', () => {
    expect(nc).toContain("from('credit_transactions')");
    expect(nc).toContain("eq('source', 'survey_reward')");
  });

  it('completed surveys uses getQuestionText from shared module', () => {
    expect(nc).toContain('BJ_SURVEY_QUESTIONS');
    expect(nc).toContain('getQuestionText');
  });

  it('completed surveys has expand/collapse toggle', () => {
    expect(nc).toContain('ncToggleSurveyResponse');
  });

  it('expand fires survey_response_expanded PostHog event', () => {
    expect(nc).toContain("'survey_response_expanded'");
  });

  it('renders answer types correctly', () => {
    expect(nc).toContain('_ncRenderAnswer');
    // Handles: string, number, label, rating, text, array
    expect(nc).toContain('answer.label');
    expect(nc).toContain('answer.rating');
    expect(nc).toContain('answer.text');
    expect(nc).toContain('Array.isArray');
  });

  it('has XSS-safe _ncEsc function', () => {
    expect(nc).toContain('function _ncEsc');
    expect(nc).toContain('textContent');
  });

  it('truncates long text answers at 200 chars', () => {
    expect(nc).toContain('200');
    expect(nc).toContain('show more');
  });

  it('exports ncLoadMySurveys to window', () => {
    expect(nc).toContain('window.ncLoadMySurveys');
  });

  it('exports ncLoadMoreSurveys to window', () => {
    expect(nc).toContain('window.ncLoadMoreSurveys');
  });

  it('exports ncToggleSurveyResponse to window', () => {
    expect(nc).toContain('window.ncToggleSurveyResponse');
  });

  it('has no empty catch blocks', () => {
    const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    const matches = nc.match(emptyCatchPattern);
    expect(matches).toBeNull();
  });

  it('uses reportError for error handling', () => {
    expect(nc).toContain("reportError('nc_surveys_available'");
    expect(nc).toContain("reportError('nc_surveys_completed'");
  });
});

// ─── 5. app.js: Tab Switch Wiring ───────────────────────────────────────────
describe('SDV-S2: app.js My Surveys tab trigger', () => {
  const app = readFile('js/app.js');

  it('adds click listener for nc-surveys tab', () => {
    expect(app).toContain('data-panel="nc-surveys"');
    expect(app).toContain('ncLoadMySurveys');
  });
});

// ─── 6. Build Configuration ──────────────────────────────────────────────────
describe('SDV-S2: Build configuration', () => {
  const build = readFile('build.js');

  it('survey-questions.js is in the deferred chunk', () => {
    expect(build).toContain("'js/survey-questions.js'");
  });

  it('survey-questions.js appears before micro-surveys.js', () => {
    const sqIdx = build.indexOf("'js/survey-questions.js'");
    const msIdx = build.indexOf("'js/micro-surveys.js'");
    expect(sqIdx).toBeLessThan(msIdx);
  });
});

// ─── 7. File Inventory ───────────────────────────────────────────────────────
describe('SDV-S2: File Inventory', () => {
  it('js/survey-questions.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/survey-questions.js'))).toBe(true);
  });
  it('survey.html exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'survey.html'))).toBe(true);
  });
  it('js/notification-center.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/notification-center.js'))).toBe(true);
  });
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s2-question-bank-my-surveys.test.js'))).toBe(true);
  });
});
