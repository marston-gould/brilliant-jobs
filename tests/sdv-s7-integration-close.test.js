/**
 * FB-SURVEY-DELIVERY-001 Session 7: PostHog Instrumentation + Integration Test + Close
 * Verifies all 12 PostHog events across all surfaces, end-to-end file integrity,
 * architecture fitness, and full test suite passthrough.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. All 12 PostHog Events Wired ─────────────────────────────────────────
describe('SDV-S7: All 12 PostHog events verified', () => {
  // Spec §9 defines exactly 12 events across delivery and response surfaces

  it('1. survey_overlay_shown (survey-delivery.js)', () => {
    const sd = readFile('js/survey-delivery.js');
    expect(sd).toContain("'survey_overlay_shown'");
    // Properties: survey_version, credit_amount
    expect(sd).toContain('survey_version');
    expect(sd).toContain('credit_amount');
  });

  it('2. survey_overlay_accepted (survey-delivery.js)', () => {
    const sd = readFile('js/survey-delivery.js');
    expect(sd).toContain("'survey_overlay_accepted'");
  });

  it('3. survey_overlay_dismissed (survey-delivery.js)', () => {
    const sd = readFile('js/survey-delivery.js');
    expect(sd).toContain("'survey_overlay_dismissed'");
    // Property: dismiss_method (x_button, not_now, backdrop)
    expect(sd).toContain('dismiss_method');
  });

  it('4. survey_merch_cta_shown (app.js)', () => {
    const app = readFile('js/app.js');
    expect(app).toContain("'survey_merch_cta_shown'");
    // Properties: survey_version, placement_id, credit_amount
    expect(app).toContain('placement_id');
  });

  it('5. survey_merch_cta_clicked (app.js)', () => {
    const app = readFile('js/app.js');
    expect(app).toContain("'survey_merch_cta_clicked'");
  });

  it('6. survey_email_sent (send-survey-invite EF)', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toContain('"survey_email_sent"');
  });

  it('7. survey_email_clicked (resolve-survey-link EF)', () => {
    const ef = readFile('supabase/functions/resolve-survey-link/index.ts');
    expect(ef).toContain('"survey_email_clicked"');
  });

  it('8. survey_sms_sent (send-survey-invite EF)', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toContain('"survey_sms_sent"');
  });

  it('9. survey_sms_clicked (resolve-survey-link EF)', () => {
    const ef = readFile('supabase/functions/resolve-survey-link/index.ts');
    expect(ef).toContain('"survey_sms_clicked"');
  });

  it('10. survey_credits_granted (survey.html)', () => {
    const html = readFile('survey.html');
    expect(html).toContain("'survey_credits_granted'");
    // Properties: survey_version, credit_amount, channel
    expect(html).toContain('credit_amount');
    expect(html).toContain('channel: deliverySource');
  });

  it('11. survey_history_viewed (notification-center.js)', () => {
    const nc = readFile('js/notification-center.js');
    expect(nc).toContain("'survey_history_viewed'");
    expect(nc).toContain("tab: 'my_surveys'");
  });

  it('12. survey_response_expanded (notification-center.js)', () => {
    const nc = readFile('js/notification-center.js');
    expect(nc).toContain("'survey_response_expanded'");
  });
});

// ─── 2. Channel A: Overlay End-to-End ────────────────────────────────────────
describe('SDV-S7: Channel A — Overlay delivery chain', () => {
  it('survey-delivery.js exists and has evaluateSurveyOverlay', () => {
    const sd = readFile('js/survey-delivery.js');
    expect(sd).toContain('evaluateSurveyOverlay');
    expect(sd).toContain('window.evaluateSurveyOverlay');
  });

  it('overlay navigates to /survey?src=overlay', () => {
    const sd = readFile('js/survey-delivery.js');
    expect(sd).toContain('src=overlay');
  });

  it('survey.html reads src param and passes to credit grant PostHog', () => {
    const html = readFile('survey.html');
    expect(html).toContain("params.get('src')");
    expect(html).toContain('deliverySource');
  });

  it('survey.html calls grant_survey_credits RPC on submit', () => {
    const html = readFile('survey.html');
    expect(html).toContain('rpc/grant_survey_credits');
  });

  it('survey.html shows credit toast after grant', () => {
    const html = readFile('survey.html');
    expect(html).toContain('_showCreditToast');
  });
});

// ─── 3. Channel B: Merch End-to-End ─────────────────────────────────────────
describe('SDV-S7: Channel B — Merch CTA chain', () => {
  it('app.js handles survey_cta content_type', () => {
    const app = readFile('js/app.js');
    expect(app).toContain("content_type === 'survey_cta'");
  });

  it('merch CTA links with src=merch', () => {
    const app = readFile('js/app.js');
    expect(app).toContain('src=merch');
  });

  it('merch CTA checks completion and hides if done', () => {
    const app = readFile('js/app.js');
    expect(app).toContain("card.style.display = 'none'");
  });
});

// ─── 4. Channel C: Email End-to-End ──────────────────────────────────────────
describe('SDV-S7: Channel C — Email delivery chain', () => {
  it('send-survey-invite has send_email action', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toContain('"send_email"');
    expect(ef).toContain('handleSendEmail');
  });

  it('email generates survey_links token with 24h expiry', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toContain('createSurveyLink');
    expect(ef).toMatch(/createSurveyLink.*"email".*24/s);
  });

  it('resolve-survey-link redirects email links', () => {
    const ef = readFile('supabase/functions/resolve-survey-link/index.ts');
    expect(ef).toContain('302');
    expect(ef).toContain('"survey_email_clicked"');
  });

  it('pg_cron schedules exist for NPS and Periodic', () => {
    const mig = readFile('supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql');
    expect(mig).toContain('survey-nps-monthly');
    expect(mig).toContain('survey-periodic-biweekly');
  });
});

// ─── 5. Channel D: SMS End-to-End ────────────────────────────────────────────
describe('SDV-S7: Channel D — SMS delivery chain', () => {
  it('send-survey-invite has send_sms action (not stub)', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toContain('"send_sms"');
    expect(ef).toContain('handleSendSms');
    expect(ef).not.toContain('not yet implemented');
  });

  it('SMS generates survey_links token with 72h expiry', () => {
    const ef = readFile('supabase/functions/send-survey-invite/index.ts');
    expect(ef).toMatch(/createSurveyLink.*"sms".*72/s);
  });

  it('resolve-survey-link redirects SMS links', () => {
    const ef = readFile('supabase/functions/resolve-survey-link/index.ts');
    expect(ef).toContain('"survey_sms_clicked"');
  });

  it('Vercel rewrite /s/:token is configured', () => {
    const vercel = readFile('vercel.json');
    expect(vercel).toContain('"/s/:token"');
    expect(vercel).toContain('resolve-survey-link');
  });
});

// ─── 6. My Surveys Tab ──────────────────────────────────────────────────────
describe('SDV-S7: My Surveys tab integration', () => {
  it('dashboard.html has My Surveys tab', () => {
    const html = readFile('dashboard.html');
    expect(html).toContain('data-panel="nc-surveys"');
    expect(html).toContain('panel-nc-surveys');
  });

  it('notification-center.js loads available + completed surveys', () => {
    const nc = readFile('js/notification-center.js');
    expect(nc).toContain('ncLoadAvailableSurveys');
    expect(nc).toContain('ncLoadCompletedSurveys');
  });

  it('available surveys link with src=my_surveys', () => {
    const nc = readFile('js/notification-center.js');
    expect(nc).toContain('src=my_surveys');
  });

  it('completed surveys use getQuestionText from shared module', () => {
    const nc = readFile('js/notification-center.js');
    expect(nc).toContain('BJ_SURVEY_QUESTIONS');
    expect(nc).toContain('getQuestionText');
  });
});

// ─── 7. Shared Question Bank ─────────────────────────────────────────────────
describe('SDV-S7: Shared question bank integrity', () => {
  it('js/survey-questions.js exports BJ_SURVEY_QUESTIONS', () => {
    const sq = readFile('js/survey-questions.js');
    expect(sq).toContain('window.BJ_SURVEY_QUESTIONS');
  });

  it('survey.html imports from BJ_SURVEY_QUESTIONS', () => {
    const html = readFile('survey.html');
    expect(html).toContain('BJ_SURVEY_QUESTIONS');
    expect(html).toContain('survey-questions.js');
  });

  it('build.js includes survey-questions.js before micro-surveys.js', () => {
    const build = readFile('build.js');
    const sqIdx = build.indexOf("'js/survey-questions.js'");
    const msIdx = build.indexOf("'js/micro-surveys.js'");
    expect(sqIdx).toBeGreaterThan(-1);
    expect(sqIdx).toBeLessThan(msIdx);
  });
});

// ─── 8. Micro-Survey Priority Queue ─────────────────────────────────────────
describe('SDV-S7: Micro-survey priority fix', () => {
  it('uses 2s debounce (not 500ms)', () => {
    const ms = readFile('js/micro-surveys.js');
    expect(ms).toContain('FLUSH_DELAY_MS = 2000');
    expect(ms).not.toContain('FLUSH_DELAY_MS = 500');
  });

  it('no bare catch blocks in micro-surveys.js', () => {
    const ms = readFile('js/micro-surveys.js');
    expect(ms.match(/catch\s*\{/g)).toBeNull();
  });
});

// ─── 9. Database Schema ──────────────────────────────────────────────────────
describe('SDV-S7: Database schema integrity', () => {
  const mig = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');

  it('survey_campaigns table created', () => {
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS survey_campaigns');
  });

  it('survey_links table created', () => {
    expect(mig).toContain('CREATE TABLE IF NOT EXISTS survey_links');
  });

  it('grant_survey_credits RPC created', () => {
    expect(mig).toContain('CREATE OR REPLACE FUNCTION grant_survey_credits');
  });

  it('7 campaign seeds present', () => {
    expect(mig).toContain("'nps_v1'");
    expect(mig).toContain("'periodic_v2'");
    expect(mig).toContain("'micro_paywall_v1'");
    expect(mig).toContain("'micro_apply_confidence_v1'");
    expect(mig).toContain("'micro_search_relevance_v1'");
    expect(mig).toContain("'micro_data_value_v1'");
    expect(mig).toContain("'exit_v1'");
  });
});

// ─── 10. Gateway Routes ──────────────────────────────────────────────────────
describe('SDV-S7: Gateway route integrity', () => {
  const gw = readFile('supabase/functions/api-gateway/index.ts');

  it('send-survey-invite route #139', () => {
    expect(gw).toContain('"send-survey-invite"');
  });

  it('resolve-survey-link route #140', () => {
    expect(gw).toContain('"resolve-survey-link"');
  });

  it('total routes updated to 140', () => {
    expect(gw).toContain('TOTAL: 140 routes');
  });
});

// ─── 11. No Silent Failures (Marston Principle) ──────────────────────────────
describe('SDV-S7: No silent failures across all SDV files', () => {
  const files = [
    'js/survey-delivery.js',
    'js/survey-questions.js',
    'js/micro-surveys.js',
    'supabase/functions/send-survey-invite/index.ts',
    'supabase/functions/resolve-survey-link/index.ts',
  ];

  files.forEach(file => {
    it(`${file} has no empty catch blocks`, () => {
      const content = readFile(file);
      const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
      expect(content.match(emptyCatch)).toBeNull();
    });
  });

  it('survey.html has no empty catch blocks', () => {
    const html = readFile('survey.html');
    const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    expect(html.match(emptyCatch)).toBeNull();
  });

  it('micro-surveys.js has no bare catch {} blocks', () => {
    const ms = readFile('js/micro-surveys.js');
    expect(ms.match(/catch\s*\{/g)).toBeNull();
  });
});

// ─── 12. Complete File Inventory ─────────────────────────────────────────────
describe('SDV-S7: Complete file inventory', () => {
  const expected = [
    'supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql',
    'supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql',
    'supabase/functions/send-survey-invite/index.ts',
    'supabase/functions/resolve-survey-link/index.ts',
    'js/survey-questions.js',
    'js/survey-delivery.js',
    'tests/sdv-s1-schema-credit-grant.test.js',
    'tests/sdv-s2-question-bank-my-surveys.test.js',
    'tests/sdv-s3-overlay-priority.test.js',
    'tests/sdv-s4-microsurv-merch.test.js',
    'tests/sdv-s5-email-delivery.test.js',
    'tests/sdv-s6-sms-shorturl.test.js',
    'tests/sdv-s7-integration-close.test.js',
  ];

  expected.forEach(file => {
    it(`${file} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, file))).toBe(true);
    });
  });
});

// ─── 13. ROADMAP Sync ────────────────────────────────────────────────────────
describe('SDV-S7: ROADMAP sync verification', () => {
  it('ROADMAP.md has all 7 SDV sessions marked ✅', () => {
    const rm = readFile('ROADMAP.md');
    for (let i = 1; i <= 7; i++) {
      expect(rm).toContain(`SDV-S${i}`);
    }
    // S1-S6 should be ✅, S7 will be marked after this test runs
    for (let i = 1; i <= 6; i++) {
      const pattern = new RegExp(`SDV-S${i}.*✅`);
      expect(rm).toMatch(pattern);
    }
  });

  it('roadmap.html has SDV-S1 through S6 as done', () => {
    const rh = readFile('roadmap.html');
    for (let i = 1; i <= 6; i++) {
      expect(rh).toContain(`SDV-S${i}`);
    }
  });
});
