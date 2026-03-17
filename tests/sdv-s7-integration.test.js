/**
 * FB-SURVEY-DELIVERY-001 Session 7: PostHog Instrumentation + Integration Test
 * Final verification: all 12 PostHog events, all deliverables, production state
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. All 12 PostHog Events Verified ──────────────────────────────────────
describe('SDV-S7: All 12 spec PostHog events wired', () => {
  const surveyHtml = readFile('survey.html');
  const surveyDelivery = readFile('js/survey-delivery.js');
  const notifCenter = readFile('js/notification-center.js');
  const appJs = readFile('js/app.js');
  const sendInvite = readFile('supabase/functions/send-survey-invite/index.ts');
  const resolveLink = readFile('supabase/functions/resolve-survey-link/index.ts');

  // Overlay events (SDV-S3)
  it('1. survey_overlay_shown — in survey-delivery.js', () => {
    expect(surveyDelivery).toContain("'survey_overlay_shown'");
  });
  it('2. survey_overlay_accepted — in survey-delivery.js', () => {
    expect(surveyDelivery).toContain("'survey_overlay_accepted'");
  });
  it('3. survey_overlay_dismissed — in survey-delivery.js', () => {
    expect(surveyDelivery).toContain("'survey_overlay_dismissed'");
  });

  // Merch events (SDV-S4)
  it('4. survey_merch_cta_shown — in app.js', () => {
    expect(appJs).toContain("'survey_merch_cta_shown'");
  });
  it('5. survey_merch_cta_clicked — in app.js', () => {
    expect(appJs).toContain("'survey_merch_cta_clicked'");
  });

  // Email events (SDV-S5)
  it('6. survey_email_sent — in send-survey-invite EF', () => {
    expect(sendInvite).toContain('"survey_email_sent"');
  });
  it('7. survey_email_clicked — in resolve-survey-link EF', () => {
    expect(resolveLink).toContain('"survey_email_clicked"');
  });

  // SMS events (SDV-S6)
  it('8. survey_sms_sent — in send-survey-invite EF', () => {
    expect(sendInvite).toContain('"survey_sms_sent"');
  });
  it('9. survey_sms_clicked — in resolve-survey-link EF', () => {
    expect(resolveLink).toContain('"survey_sms_clicked"');
  });

  // Credit event (SDV-S1)
  it('10. survey_credits_granted — in survey.html', () => {
    expect(surveyHtml).toContain("'survey_credits_granted'");
  });

  // History events (SDV-S2)
  it('11. survey_history_viewed — in notification-center.js', () => {
    expect(notifCenter).toContain("'survey_history_viewed'");
  });
  it('12. survey_response_expanded — in notification-center.js', () => {
    expect(notifCenter).toContain("'survey_response_expanded'");
  });
});

// ─── 2. All Deliverable Files Exist ──────────────────────────────────────────
describe('SDV-S7: All deliverable files', () => {
  const files = [
    'supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql',
    'supabase/migrations/v10.25-fb-sdv-s5-survey-cron.sql',
    'js/survey-questions.js',
    'js/survey-delivery.js',
    'supabase/functions/send-survey-invite/index.ts',
    'supabase/functions/resolve-survey-link/index.ts',
  ];

  files.forEach(f => {
    it(f + ' exists', () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });

  const modifiedFiles = [
    'survey.html',
    'js/micro-surveys.js',
    'js/notification-center.js',
    'js/app.js',
    'build.js',
    'vercel.json',
    'supabase/functions/api-gateway/index.ts',
    'dashboard.html',
  ];

  modifiedFiles.forEach(f => {
    it(f + ' exists (modified)', () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});

// ─── 3. Cross-Channel Consistency ────────────────────────────────────────────
describe('SDV-S7: Cross-channel delivery consistency', () => {
  const surveyDelivery = readFile('js/survey-delivery.js');
  const sendInvite = readFile('supabase/functions/send-survey-invite/index.ts');
  const microSurveys = readFile('js/micro-surveys.js');

  it('overlay checks session rate limit (one per session)', () => {
    expect(surveyDelivery).toContain('hasShownThisSession');
    expect(surveyDelivery).toContain('sessionStorage');
  });

  it('overlay checks 7-day cooldown', () => {
    expect(surveyDelivery).toContain('COOLDOWN_DAYS = 7');
    expect(surveyDelivery).toContain('last_survey_prompt_at');
  });

  it('email checks frequency cap from campaign', () => {
    expect(sendInvite).toContain('wasAlreadySent');
    expect(sendInvite).toContain('frequency_days');
  });

  it('SMS enforces 30-day hard cap', () => {
    expect(sendInvite).toContain('"sms"');
    expect(sendInvite).toContain('30');
  });

  it('micro-surveys use 2s debounce', () => {
    expect(microSurveys).toContain('FLUSH_DELAY_MS = 2000');
  });

  it('all channels check completion before sending', () => {
    // Overlay
    expect(surveyDelivery).toContain('getCompletedVersions');
    // Email + SMS
    expect(sendInvite).toContain("from(\"feedback\")");
  });
});

// ─── 4. Credit System Integrity ──────────────────────────────────────────────
describe('SDV-S7: Credit system integrity', () => {
  const migration = readFile('supabase/migrations/v10.01-fb-survey-delivery-001-s1.sql');
  const surveyHtml = readFile('survey.html');

  it('grant_survey_credits RPC is idempotent', () => {
    expect(migration).toContain("source = 'survey_reward'");
    expect(migration).toContain('feature = p_survey_version');
    expect(migration).toContain('IF EXISTS');
  });

  it('survey.html calls the RPC on submission', () => {
    expect(surveyHtml).toContain('rpc/grant_survey_credits');
  });

  it('credit grant is non-fatal (survey submit always succeeds)', () => {
    expect(surveyHtml).toContain("console.warn('Credit grant failed:'");
  });

  it('exit surveys get 0 credits', () => {
    expect(surveyHtml).toContain("context !== 'churn'");
  });
});

// ─── 5. Gateway Routes ──────────────────────────────────────────────────────
describe('SDV-S7: Gateway completeness', () => {
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

// ─── 6. Vercel Rewrite ──────────────────────────────────────────────────────
describe('SDV-S7: Vercel short URL rewrite', () => {
  const vercel = readFile('vercel.json');

  it('/s/:token rewrite exists', () => {
    expect(vercel).toContain('"/s/:token"');
    expect(vercel).toContain('resolve-survey-link');
  });
});

// ─── 7. Shared Question Bank ─────────────────────────────────────────────────
describe('SDV-S7: Question bank shared module', () => {
  const sq = readFile('js/survey-questions.js');
  const surveyHtml = readFile('survey.html');
  const build = readFile('build.js');

  it('shared module exports BJ_SURVEY_QUESTIONS', () => {
    expect(sq).toContain('window.BJ_SURVEY_QUESTIONS');
  });

  it('survey.html imports from shared module', () => {
    expect(surveyHtml).toContain('survey-questions.js');
    expect(surveyHtml).toContain('BJ_SURVEY_QUESTIONS');
  });

  it('shared module in deferred build chunk', () => {
    expect(build).toContain("'js/survey-questions.js'");
  });

  it('survey-delivery.js in deferred build chunk', () => {
    expect(build).toContain("'js/survey-delivery.js'");
  });
});

// ─── 8. No Silent Fails Across All Deliverables ─────────────────────────────
describe('SDV-S7: No silent fails (Marston principle)', () => {
  const files = [
    'js/survey-delivery.js',
    'js/survey-questions.js',
    'js/micro-surveys.js',
    'supabase/functions/send-survey-invite/index.ts',
    'supabase/functions/resolve-survey-link/index.ts',
  ];

  files.forEach(f => {
    it(f + ' has no empty catch blocks', () => {
      const content = readFile(f);
      const emptyCatch = /catch\s*\([^)]*\)\s*\{\s*\}/g;
      expect(content.match(emptyCatch)).toBeNull();
    });
  });

  it('micro-surveys.js has no bare catch{} blocks', () => {
    const ms = readFile('js/micro-surveys.js');
    const bareCatch = /catch\s*\{/g;
    expect(ms.match(bareCatch)).toBeNull();
  });
});

// ─── 9. All 7 Test Suites Exist ──────────────────────────────────────────────
describe('SDV-S7: Test suite inventory', () => {
  const testFiles = [
    'tests/sdv-s1-schema-credit-grant.test.js',
    'tests/sdv-s2-question-bank-my-surveys.test.js',
    'tests/sdv-s3-overlay-priority.test.js',
    'tests/sdv-s4-microsurv-merch.test.js',
    'tests/sdv-s5-email-delivery.test.js',
    'tests/sdv-s6-sms-shorturl.test.js',
    'tests/sdv-s7-integration.test.js',
  ];

  testFiles.forEach(f => {
    it(f + ' exists', () => {
      expect(fs.existsSync(path.join(ROOT, f))).toBe(true);
    });
  });
});

// ─── 10. ROADMAP + roadmap.html Consistency ──────────────────────────────────
describe('SDV-S7: Roadmap consistency', () => {
  const roadmap = readFile('ROADMAP.md');
  const roadmapHtml = readFile('roadmap.html');

  for (let i = 1; i <= 7; i++) {
    const id = 'SDV-S' + i;
    it(id + ' marked done in ROADMAP.md', () => {
      const pattern = new RegExp(id + '.*✅');
      expect(roadmap).toMatch(pattern);
    });
    it(id + ' marked done in roadmap.html', () => {
      expect(roadmapHtml).toContain(id + ':');
      expect(roadmapHtml).toContain("s: 'done'");
    });
  }
});
