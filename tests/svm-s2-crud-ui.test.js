/**
 * FB-SURVEY-ADMIN-001 SVM-S2: Full CRUD UI — WHAT / WHO / WHEN / WHERE
 * Tests: modal structure, 4 sections, question builder, audience/trigger/placement config, save wiring
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

const js = readFile('js/admin-survey-manager.js');

// ─── 1. Modal Structure ──────────────────────────────────────────────────────
describe('SVM-S2: Modal structure', () => {
  it('has MODAL_ID constant', () => { expect(js).toContain('svm-modal'); });
  it('svmRenderModal function exists', () => { expect(js).toContain('function svmRenderModal'); });
  it('svmEditCampaign loads campaign and opens modal', () => {
    expect(js).toContain('window.svmEditCampaign');
    expect(js).toContain('svmRenderModal');
  });
  it('svmOpenCreate sets null editing and opens modal', () => {
    expect(js).toContain('window.svmOpenCreate');
    expect(js).toContain('_editingCampaign = null');
  });
  it('modal has close X button', () => { expect(js).toContain('\\u00D7'); });
  it('modal has backdrop close', () => { expect(js).toContain('overlay.remove()'); });
  it('modal has Cancel and Save buttons', () => {
    expect(js).toContain('Cancel');
    expect(js).toContain('svm-save-btn');
  });
  it('shows Edit Survey title in edit mode', () => { expect(js).toContain('Edit Survey'); });
  it('shows New Survey title in create mode', () => { expect(js).toContain('New Survey'); });
});

// ─── 2. WHAT Section ─────────────────────────────────────────────────────────
describe('SVM-S2: WHAT section (survey content)', () => {
  it('has title input', () => { expect(js).toContain('svm-title'); });
  it('has version ID input (disabled in edit mode)', () => {
    expect(js).toContain('svm-version');
    expect(js).toContain('isEdit');
  });
  it('has survey type selector with all 4 types', () => {
    expect(js).toContain('svm-type');
    expect(js).toContain("'nps','periodic','micro','exit'");
  });
  it('has credits input', () => { expect(js).toContain('svm-credits'); });
  it('has estimated minutes input', () => { expect(js).toContain('svm-minutes'); });
  it('has description textarea', () => { expect(js).toContain('svm-desc'); });

  // Question builder
  it('has question builder container', () => { expect(js).toContain('svm-questions-list'); });
  it('has add question button', () => { expect(js).toContain('svmAddQuestion'); });
  it('svmAddQuestion pushes to _modalQuestions', () => {
    expect(js).toContain('_modalQuestions.push');
  });
  it('svmRemoveQ splices from _modalQuestions', () => {
    expect(js).toContain('_modalQuestions.splice');
  });
  it('question has text input', () => { expect(js).toContain('Question text'); });
  it('question has type selector with all question types', () => {
    expect(js).toContain('QUESTION_TYPES');
    expect(js).toContain("'choice','rating','scale','text','nps','multiselect','dropdown','chips'");
  });
  it('question has sub-text input', () => { expect(js).toContain('Sub-text'); });
  it('choice questions show options textarea', () => {
    expect(js).toContain('Options (one per line)');
    expect(js).toContain('svmUpdateQOpts');
  });
  it('scale/rating questions show min/max labels', () => {
    expect(js).toContain('Min label');
    expect(js).toContain('Max label');
    expect(js).toContain('minLabel');
    expect(js).toContain('maxLabel');
  });
  it('questions have move up/down buttons', () => {
    expect(js).toContain('svmMoveQ');
    // Up and down arrows
    expect(js).toContain('\\u2191');
    expect(js).toContain('\\u2193');
  });
  it('svmMoveQ swaps question positions', () => {
    expect(js).toContain('_modalQuestions[idx]');
    expect(js).toContain('_modalQuestions[target]');
  });
});

// ─── 3. WHO Section ──────────────────────────────────────────────────────────
describe('SVM-S2: WHO section (audience targeting)', () => {
  it('has audience type selector', () => { expect(js).toContain('svm-audience-type'); });
  it('supports all 3 audience types', () => {
    expect(js).toContain("'all','time_cohort','behavioral'");
  });
  it('time cohort has signup date range', () => {
    expect(js).toContain('svm-aud-after');
    expect(js).toContain('svm-aud-before');
    expect(js).toContain('Signed up after');
    expect(js).toContain('Signed up before');
  });
  it('behavioral has min_sessions', () => { expect(js).toContain('svm-aud-sessions'); });
  it('behavioral has min_applications', () => { expect(js).toContain('svm-aud-apps'); });
  it('behavioral has plan tier dropdown', () => {
    expect(js).toContain('svm-aud-plan');
    expect(js).toContain("'any','free','starter','pro'");
  });
  it('behavioral has days_since_signup_min', () => { expect(js).toContain('svm-aud-days-min'); });
  it('audience fields re-render on type change', () => {
    expect(js).toContain('svmRenderAudienceFields');
    expect(js).toContain("addEventListener('change'");
  });
});

// ─── 4. WHEN Section ─────────────────────────────────────────────────────────
describe('SVM-S2: WHEN section (trigger config)', () => {
  it('has trigger type selector', () => { expect(js).toContain('svm-trigger-type'); });
  it('supports all 4 trigger types', () => {
    expect(js).toContain("'page_navigation','cron','event','behavioral'");
  });
  it('cron has expression input with presets', () => {
    expect(js).toContain('svm-trig-cron');
    expect(js).toContain('Presets');
  });
  it('event has event name dropdown', () => {
    expect(js).toContain('svm-trig-event');
    expect(js).toContain('ghost_detected');
    expect(js).toContain('subscription_created');
  });
  it('behavioral has metric/operator/value', () => {
    expect(js).toContain('svm-trig-metric');
    expect(js).toContain('svm-trig-op');
    expect(js).toContain('svm-trig-val');
  });
  it('has frequency_days input', () => { expect(js).toContain('svm-freq'); });
  it('has expires_at date input', () => { expect(js).toContain('svm-expires'); });
  it('trigger fields re-render on type change', () => {
    expect(js).toContain('svmRenderTriggerFields');
  });
});

// ─── 5. WHERE Section ────────────────────────────────────────────────────────
describe('SVM-S2: WHERE section (channels + placement)', () => {
  it('has overlay toggle', () => { expect(js).toContain('svm-ch-overlay'); });
  it('has overlay page checkboxes', () => {
    expect(js).toContain("svm-page-cb-");
    expect(js).toContain('DASHBOARD_PAGES');
  });
  it('DASHBOARD_PAGES covers all major pages', () => {
    expect(js).toContain("'feed'");
    expect(js).toContain("'applications'");
    expect(js).toContain("'stats'");
    expect(js).toContain("'resumes'");
  });
  it('has merch toggle', () => { expect(js).toContain('svm-ch-merch'); });
  it('has merch page checkboxes', () => { expect(js).toContain("_svmPageCheckboxes('merch'"); });
  it('has merch position selector', () => {
    expect(js).toContain('svm-merch-pos');
    expect(js).toContain('MERCH_POSITIONS');
    expect(js).toContain("'after_20th_card'");
  });
  it('has email toggle', () => { expect(js).toContain('svm-ch-email'); });
  it('has SMS toggle', () => { expect(js).toContain('svm-ch-sms'); });
  it('has priority input', () => { expect(js).toContain('svm-priority'); });
});

// ─── 6. Save Logic ──────────────────────────────────────────────────────────
describe('SVM-S2: Save logic', () => {
  it('svmSaveCampaign reads all form fields', () => {
    expect(js).toContain('window.svmSaveCampaign');
    expect(js).toContain('svm-title');
    expect(js).toContain('svm-version');
    expect(js).toContain('svm-type');
  });
  it('builds audience_config from form values', () => {
    expect(js).toContain('audience_config');
    expect(js).toContain('signup_after');
    expect(js).toContain('min_sessions');
  });
  it('builds trigger_config from form values', () => {
    expect(js).toContain('trigger_config');
    expect(js).toContain('schedule');
    expect(js).toContain('event_name');
  });
  it('builds placement_config from checkboxes', () => {
    expect(js).toContain('placement_config');
    expect(js).toContain('_svmReadPageCheckboxes');
  });
  it('sends create action when no editingCampaign', () => {
    expect(js).toContain("action: _editingCampaign ? 'update' : 'create'");
  });
  it('sends update action with id when editing', () => {
    expect(js).toContain('payload.id = _editingCampaign.id');
  });
  it('sends questions array', () => {
    expect(js).toContain('questions: _modalQuestions');
  });
  it('calls admin-survey-manager EF', () => {
    expect(js).toContain("'admin-survey-manager'");
  });
  it('closes modal and refreshes on success', () => {
    expect(js).toContain('modal.remove()');
    expect(js).toContain('svmFetchCampaigns()');
  });
  it('shows error on failure', () => {
    expect(js).toContain("reportError('admin_survey_manager'");
    expect(js).toContain('Failed to save');
  });
  it('disables save button during save', () => {
    expect(js).toContain('btn.disabled = true');
    expect(js).toContain('Saving...');
  });
});

// ─── 7. XSS Safety ──────────────────────────────────────────────────────────
describe('SVM-S2: XSS safety', () => {
  it('has _svmAttr for attribute escaping', () => {
    expect(js).toContain('function _svmAttr');
    expect(js).toContain('&quot;');
  });
  it('uses _svmEsc throughout', () => {
    expect(js).toContain('_svmEsc(label)');
  });
});
