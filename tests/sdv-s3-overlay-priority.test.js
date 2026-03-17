/**
 * FB-SURVEY-DELIVERY-001 Session 3: Overlay Delivery + Priority Engine
 * Tests: survey-delivery.js structure, eligibility gates, priority resolution,
 *        overlay UI, PostHog events, session/cooldown rate limiting
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function readFile(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf-8'); }

// ─── 1. Module Structure ─────────────────────────────────────────────────────
describe('SDV-S3: js/survey-delivery.js structure', () => {
  const sd = readFile('js/survey-delivery.js');

  it('file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/survey-delivery.js'))).toBe(true);
  });

  it('is an IIFE with strict mode', () => {
    expect(sd).toMatch(/^\(function\(\)/m);
    expect(sd).toContain("'use strict'");
  });

  it('exports evaluateSurveyOverlay to window', () => {
    expect(sd).toContain('window.evaluateSurveyOverlay');
  });

  it('exports initSurveyDelivery to window', () => {
    expect(sd).toContain('window.initSurveyDelivery');
  });

  it('exports to BJ namespace', () => {
    expect(sd).toContain('window.BJ.evaluateSurveyOverlay');
    expect(sd).toContain('window.BJ.initSurveyDelivery');
  });

  it('auto-initializes after page load with 2s delay', () => {
    expect(sd).toContain('setTimeout(initSurveyDelivery, 2000)');
  });
});

// ─── 2. Session Rate Limiting ────────────────────────────────────────────────
describe('SDV-S3: Session rate limiting', () => {
  const sd = readFile('js/survey-delivery.js');

  it('uses sessionStorage for session-scoped rate limiting', () => {
    expect(sd).toContain('sessionStorage');
    expect(sd).toContain('bj_survey_overlay_shown');
  });

  it('hasShownThisSession checks sessionStorage', () => {
    expect(sd).toContain('function hasShownThisSession');
    expect(sd).toContain('sessionStorage.getItem');
  });

  it('markShownThisSession writes to sessionStorage', () => {
    expect(sd).toContain('function markShownThisSession');
    expect(sd).toContain('sessionStorage.setItem');
  });

  it('evaluateSurveyOverlay checks session limit before proceeding', () => {
    expect(sd).toContain('hasShownThisSession()');
  });
});

// ─── 3. Cooldown (7-day) ─────────────────────────────────────────────────────
describe('SDV-S3: 7-day cooldown', () => {
  const sd = readFile('js/survey-delivery.js');

  it('defines COOLDOWN_DAYS = 7', () => {
    expect(sd).toContain('COOLDOWN_DAYS = 7');
  });

  it('reads last_survey_prompt_at from user_data', () => {
    expect(sd).toContain('last_survey_prompt_at');
    expect(sd).toContain('bj_user_data');
  });

  it('calculates days since last prompt', () => {
    expect(sd).toContain('daysSince');
  });

  it('evaluateSurveyOverlay checks cooldown', () => {
    expect(sd).toContain('isInCooldown()');
  });

  it('writes cooldown timestamp after showing overlay', () => {
    expect(sd).toContain('writeCooldownTimestamp');
  });

  it('persists cooldown to Supabase profiles', () => {
    expect(sd).toContain("from('profiles')");
    expect(sd).toContain('.update(');
  });
});

// ─── 4. Campaign Fetching ────────────────────────────────────────────────────
describe('SDV-S3: Campaign fetching', () => {
  const sd = readFile('js/survey-delivery.js');

  it('fetches active campaigns from survey_campaigns', () => {
    expect(sd).toContain("from('survey_campaigns')");
    expect(sd).toContain("eq('is_active', true)");
  });

  it('orders campaigns by priority ascending', () => {
    expect(sd).toContain("order('priority', { ascending: true })");
  });

  it('caches campaigns for 5 minutes', () => {
    expect(sd).toContain('CACHE_TTL_MS');
    expect(sd).toContain('5 * 60 * 1000');
  });

  it('fetches completed versions from feedback table', () => {
    expect(sd).toContain('getCompletedVersions');
    expect(sd).toContain("from('feedback')");
  });
});

// ─── 5. Eligibility Filtering ────────────────────────────────────────────────
describe('SDV-S3: Eligibility filtering', () => {
  const sd = readFile('js/survey-delivery.js');

  it('requires overlay channel', () => {
    expect(sd).toContain("channels.indexOf('overlay')");
  });

  it('filters out completed surveys', () => {
    expect(sd).toContain('completed.has(c.survey_version)');
  });

  it('filters out exit surveys from overlay', () => {
    expect(sd).toContain("survey_type === 'exit'");
  });

  it('checks audience targeting', () => {
    expect(sd).toContain('matchesAudience');
  });

  it('requires logged-in user', () => {
    expect(sd).toContain('window.currentUser');
  });
});

// ─── 6. Audience Targeting ───────────────────────────────────────────────────
describe('SDV-S3: Audience targeting', () => {
  const sd = readFile('js/survey-delivery.js');

  it('has matchesAudience function', () => {
    expect(sd).toContain('function matchesAudience');
  });

  it('returns true when no targeting (all users)', () => {
    expect(sd).toContain('Object.keys(audience).length === 0');
  });

  it('checks plan tier', () => {
    expect(sd).toContain('audience.plan');
    expect(sd).toContain('getUserTier');
  });

  it('checks min_sessions', () => {
    expect(sd).toContain('audience.min_sessions');
    expect(sd).toContain('session_count');
  });

  it('fails open on audience errors', () => {
    expect(sd).toContain('return true'); // fail-open
  });
});

// ─── 7. Priority Resolution ──────────────────────────────────────────────────
describe('SDV-S3: Priority resolution', () => {
  const sd = readFile('js/survey-delivery.js');

  it('has resolveHighestPriority function', () => {
    expect(sd).toContain('function resolveHighestPriority');
  });

  it('sorts by priority ascending (lowest number = highest priority)', () => {
    expect(sd).toContain('a.priority');
    expect(sd).toContain('b.priority');
    expect(sd).toContain('.sort(');
  });

  it('returns first element (highest priority)', () => {
    expect(sd).toContain('sorted[0]');
  });
});

// ─── 8. Overlay UI ───────────────────────────────────────────────────────────
describe('SDV-S3: Overlay UI', () => {
  const sd = readFile('js/survey-delivery.js');

  it('creates overlay with semi-transparent backdrop', () => {
    expect(sd).toContain('rgba(0,0,0,0.5)');
    expect(sd).toContain(OVERLAY_ID_PATTERN);
  });

  it('creates centered card with max-width 480px', () => {
    expect(sd).toContain('max-width:480px');
    expect(sd).toContain('border-radius:12px');
  });

  it('shows survey title', () => {
    expect(sd).toContain('campaign.title');
  });

  it('shows credit reward badge in green', () => {
    expect(sd).toContain('#22c55e');
    expect(sd).toContain('credit_reward');
    expect(sd).toContain('Earn');
  });

  it('shows estimated time', () => {
    expect(sd).toContain('estimated_minutes');
  });

  it('has Take Survey button (primary)', () => {
    expect(sd).toContain('sdv-take-survey');
    expect(sd).toContain('Take Survey');
  });

  it('has Not Now button (ghost)', () => {
    expect(sd).toContain('sdv-not-now');
    expect(sd).toContain('Not Now');
  });

  it('has close X button', () => {
    expect(sd).toContain('x_button');
    expect(sd).toContain('closeBtn');
  });

  it('Take Survey navigates to /survey with correct params', () => {
    expect(sd).toContain('/survey?context=');
    expect(sd).toContain('&src=overlay');
    expect(sd).toContain('campaign.survey_version');
  });

  it('backdrop click dismisses overlay', () => {
    expect(sd).toContain("dismissOverlay('backdrop')");
  });

  it('overlay has fade-in animation', () => {
    expect(sd).toContain('opacity:0');
    expect(sd).toContain("opacity = '1'");
  });

  it('dismissOverlay fades out and removes', () => {
    expect(sd).toContain("opacity = '0'");
    expect(sd).toContain('.remove()');
  });
});

const OVERLAY_ID_PATTERN = 'survey-delivery-overlay';

// ─── 9. PostHog Events ───────────────────────────────────────────────────────
describe('SDV-S3: PostHog events', () => {
  const sd = readFile('js/survey-delivery.js');

  it('fires survey_overlay_shown with survey_version and credit_amount', () => {
    expect(sd).toContain("'survey_overlay_shown'");
    expect(sd).toContain('survey_version');
    expect(sd).toContain('credit_amount');
  });

  it('fires survey_overlay_accepted with survey_version', () => {
    expect(sd).toContain("'survey_overlay_accepted'");
  });

  it('fires survey_overlay_dismissed with dismiss_method', () => {
    expect(sd).toContain("'survey_overlay_dismissed'");
    expect(sd).toContain('dismiss_method');
  });

  it('tracks three dismiss methods: x_button, not_now, backdrop', () => {
    expect(sd).toContain("'x_button'");
    expect(sd).toContain("'not_now'");
    expect(sd).toContain("'backdrop'");
  });
});

// ─── 10. Page Navigation Hook ────────────────────────────────────────────────
describe('SDV-S3: Page navigation hook', () => {
  const sd = readFile('js/survey-delivery.js');

  it('uses MutationObserver to detect page switches', () => {
    expect(sd).toContain('MutationObserver');
  });

  it('observes class attribute changes on .page elements', () => {
    expect(sd).toContain("attributes: true");
    expect(sd).toContain("attributeFilter: ['class']");
  });

  it('skips evaluation on first page load (debounce)', () => {
    expect(sd).toContain('_navCount > 0');
    expect(sd).toContain('_navCount++');
  });

  it('tracks last active page to avoid duplicate evaluations', () => {
    expect(sd).toContain('_lastActivePage');
  });
});

// ─── 11. Error Handling ──────────────────────────────────────────────────────
describe('SDV-S3: Error handling', () => {
  const sd = readFile('js/survey-delivery.js');

  it('uses reportError for campaign fetch failures', () => {
    expect(sd).toContain("reportError('survey_delivery'");
  });

  it('has no empty catch blocks', () => {
    const emptyCatchPattern = /catch\s*\([^)]*\)\s*\{\s*\}/g;
    const matches = sd.match(emptyCatchPattern);
    expect(matches).toBeNull();
  });

  it('cooldown write failure is non-fatal', () => {
    expect(sd).toContain('[survey-delivery] cooldown write failed');
  });
});

// ─── 12. Build Configuration ─────────────────────────────────────────────────
describe('SDV-S3: Build configuration', () => {
  const build = readFile('build.js');

  it('survey-delivery.js is in the deferred chunk', () => {
    expect(build).toContain("'js/survey-delivery.js'");
  });

  it('survey-delivery.js appears after survey-questions.js', () => {
    const sqIdx = build.indexOf("'js/survey-questions.js'");
    const sdIdx = build.indexOf("'js/survey-delivery.js'");
    expect(sdIdx).toBeGreaterThan(sqIdx);
  });
});

// ─── 13. File Inventory ──────────────────────────────────────────────────────
describe('SDV-S3: File Inventory', () => {
  it('js/survey-delivery.js exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'js/survey-delivery.js'))).toBe(true);
  });
  it('test file exists', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests/sdv-s3-overlay-priority.test.js'))).toBe(true);
  });
});
