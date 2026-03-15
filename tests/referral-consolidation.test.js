/**
 * Referral Consolidation — Validation Tests
 *
 * Session: REFERRAL-CONSOL
 * Spec: POD3_HANDOFF_ReferralConsolidation.docx
 * Product version: v9.48
 *
 * Validates:
 *   1. Sidebar nav: Growth section + Referrals item removed
 *   2. page-referrals shell removed
 *   3. "Earn Free Credits" section in Subscription page
 *   4. referrals.js render target changed to sub-referral-content
 *   5. Leaderboard code parked (commented out)
 *   6. Outreach tracking code parked (commented out)
 *   7. Sidebar referral link navigates to subscription
 *   8. billing.js calls initReferralHub
 *   9. Referral intro card still callable
 *  10. Page routing: referrals redirects to subscription
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');

const dashboardHtml = read('dashboard.html');
const referralsJs = read('js/referrals.js');
const billingJs = read('js/billing.js');
const appJs = read('js/app.js');
const versionJs = read('js/version.js');

// ─── Section 1: Sidebar Nav Cleanup ──────────────────────────────────

describe('1. Sidebar Nav Cleanup', () => {
  it('1.1 — Growth nav section label removed', () => {
    // Should NOT have a Growth section label (non-commented)
    const growthLabels = dashboardHtml.match(/class="nav-section-label">Growth</g);
    expect(growthLabels).toBeNull();
  });

  it('1.2 — Referrals nav item removed', () => {
    expect(dashboardHtml).not.toMatch(/data-page="referrals"/);
  });

  it('1.3 — nav-ref-count badge removed', () => {
    expect(dashboardHtml).not.toMatch(/id="nav-ref-count"/);
  });

  it('1.4 — Account section label still present', () => {
    expect(dashboardHtml).toMatch(/class="nav-section-label">Account/);
  });

  it('1.5 — REFERRAL-CONSOL comment present in sidebar', () => {
    expect(dashboardHtml).toMatch(/REFERRAL-CONSOL.*Growth section.*removed/);
  });
});

// ─── Section 2: page-referrals Shell Removed ─────────────────────────

describe('2. page-referrals Shell Removed', () => {
  it('2.1 — No page-referrals div in HTML', () => {
    expect(dashboardHtml).not.toMatch(/id="page-referrals"/);
  });

  it('2.2 — No ref-hub-content container in HTML', () => {
    expect(dashboardHtml).not.toMatch(/id="ref-hub-content"/);
  });

  it('2.3 — REFERRAL-CONSOL replacement comment present', () => {
    expect(dashboardHtml).toMatch(/REFERRAL-CONSOL.*Standalone referrals page removed/);
  });
});

// ─── Section 3: Earn Free Credits Section in Subscription ────────────

describe('3. Earn Free Credits Section in Subscription', () => {
  it('3.1 — sub-referral-section card exists', () => {
    expect(dashboardHtml).toMatch(/id="sub-referral-section"/);
  });

  it('3.2 — sub-referral-content container exists', () => {
    expect(dashboardHtml).toMatch(/id="sub-referral-content"/);
  });

  it('3.3 — Card title is "Earn Free Credits"', () => {
    expect(dashboardHtml).toMatch(/Earn Free Credits/);
  });

  it('3.4 — Card subtitle mentions referral value prop', () => {
    expect(dashboardHtml).toMatch(/Refer a friend.*7 days Pro.*25 credits/);
  });

  it('3.5 — Section positioned between Auto-Refill and Pay-When-Hired', () => {
    const autoRefillPos = dashboardHtml.indexOf('card-title">Auto-Refill');
    const earnCreditsPos = dashboardHtml.indexOf('card-title">Earn Free Credits');
    const payWhenHiredPos = dashboardHtml.indexOf('card-title">Pay When You\'re Hired');
    expect(autoRefillPos).toBeGreaterThan(-1);
    expect(earnCreditsPos).toBeGreaterThan(autoRefillPos);
    expect(payWhenHiredPos).toBeGreaterThan(earnCreditsPos);
  });
});

// ─── Section 4: referrals.js Render Target ───────────────────────────

describe('4. referrals.js Render Target', () => {
  it('4.1 — Render target is sub-referral-content', () => {
    expect(referralsJs).toMatch(/getElementById\('sub-referral-content'\)/);
  });

  it('4.2 — Old ref-hub-content target removed from initReferralHub', () => {
    // The active initReferralHub function should NOT reference ref-hub-content
    const initFn = referralsJs.substring(
      referralsJs.indexOf('window.initReferralHub'),
      referralsJs.indexOf('function renderReferralHub')
    );
    expect(initFn).not.toMatch(/ref-hub-content/);
  });

  it('4.3 — Compact stat-grid replaces hero banner', () => {
    expect(referralsJs).toMatch(/Compact stat-grid replacing hero banner/);
    // Should have 3-column grid
    expect(referralsJs).toMatch(/grid-template-columns:repeat\(3,1fr\)/);
  });

  it('4.4 — No referral-hero class in render', () => {
    expect(referralsJs).not.toMatch(/class="referral-hero"/);
  });

  it('4.5 — No "Invites Sent" stat (dropped per spec)', () => {
    // The compact stat-grid should only have Referrals, Tier, Rewards Earned
    const renderSection = referralsJs.substring(
      referralsJs.indexOf('Compact stat-grid'),
      referralsJs.indexOf('Tier progress bar')
    );
    expect(renderSection).not.toMatch(/Invites Sent/);
  });

  it('4.6 — Referral history is collapsible via <details>', () => {
    expect(referralsJs).toMatch(/<details/);
    expect(referralsJs).toMatch(/<summary/);
    expect(referralsJs).toMatch(/Referral History/);
  });

  it('4.7 — Share link section preserved', () => {
    expect(referralsJs).toMatch(/Share Your Link/);
    expect(referralsJs).toMatch(/ref-copy-link-btn/);
    expect(referralsJs).toMatch(/ref-code-val/);
  });

  it('4.8 — Milestones section preserved', () => {
    expect(referralsJs).toMatch(/Milestones/);
    expect(referralsJs).toMatch(/ALL_BADGES\.map/);
  });

  it('4.9 — process_tier_bonus RPC still fires', () => {
    expect(referralsJs).toMatch(/process_tier_bonus/);
  });
});

// ─── Section 5: Leaderboard Code Parked ──────────────────────────────

describe('5. Leaderboard Code Parked', () => {
  it('5.1 — Leaderboard PARKED comment present', () => {
    expect(referralsJs).toMatch(/PARKED: Referral Consolidation v9\.48.*leaderboard/);
  });

  it('5.2 — REWARD_TIERS inside comment block', () => {
    // REWARD_TIERS should be inside a /* */ block
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?REWARD_TIERS[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('5.3 — renderRewardGrid inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?function renderRewardGrid[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('5.4 — startCountdown inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?function startCountdown[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('5.5 — loadLeaderboard inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?async function loadLeaderboard[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('5.6 — No leaderboard card in active render output', () => {
    // The renderReferralHub function should not contain a Leaderboard card title
    const renderFn = referralsJs.substring(
      referralsJs.indexOf('function renderReferralHub'),
      referralsJs.indexOf('// ---- Share Actions')
    );
    expect(renderFn).not.toMatch(/"Leaderboard"/);
    expect(renderFn).not.toMatch(/ref-leaderboard-body/);
  });
});

// ─── Section 6: Outreach Tracking Code Parked ────────────────────────

describe('6. Outreach Tracking Code Parked', () => {
  it('6.1 — Outreach tracking PARKED comment present', () => {
    expect(referralsJs).toMatch(/PARKED: Referral Consolidation v9\.48.*outreach tracking/);
  });

  it('6.2 — initReferralTracking inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?window\.initReferralTracking[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('6.3 — renderOutreachLog inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?function renderOutreachLog[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('6.4 — renderCorrelationCard inside comment block', () => {
    const parkedMatch = referralsJs.match(/\/\*[\s\S]*?function renderCorrelationCard[\s\S]*?\*\//);
    expect(parkedMatch).not.toBeNull();
  });

  it('6.5 — initReferralTracking call commented out in initReferralHub', () => {
    // The call should be commented, not active
    const initFn = referralsJs.substring(
      referralsJs.indexOf('window.initReferralHub'),
      referralsJs.indexOf('function renderReferralHub')
    );
    expect(initFn).toMatch(/\/\/.*await initReferralTracking/);
    // Should NOT have an uncommented call
    expect(initFn).not.toMatch(/^\s*await initReferralTracking/m);
  });
});

// ─── Section 7: Sidebar Referral Link Updated ────────────────────────

describe('7. Sidebar Referral Link Updated', () => {
  it('7.1 — sidebar-referral-link navigates to subscription', () => {
    const linkMatch = dashboardHtml.match(/id="sidebar-referral-link"[^>]*onclick="([^"]*)"/);
    expect(linkMatch).not.toBeNull();
    expect(linkMatch[1]).toMatch(/switchPage.*subscription/);
  });

  it('7.2 — sidebar-referral-link scrolls to sub-referral-section', () => {
    const linkMatch = dashboardHtml.match(/id="sidebar-referral-link"[^>]*onclick="([^"]*)"/);
    expect(linkMatch[1]).toMatch(/sub-referral-section/);
    expect(linkMatch[1]).toMatch(/scrollIntoView/);
  });

  it('7.3 — sidebar-referral-link does NOT navigate to referrals page', () => {
    const linkMatch = dashboardHtml.match(/id="sidebar-referral-link"[^>]*onclick="([^"]*)"/);
    expect(linkMatch[1]).not.toMatch(/switchPage.*'referrals'/);
  });
});

// ─── Section 8: billing.js Integration ───────────────────────────────

describe('8. billing.js Integration', () => {
  it('8.1 — initBilling calls initReferralHub', () => {
    expect(billingJs).toMatch(/initReferralHub/);
    // Should be inside initBilling function
    const initBillingFn = billingJs.substring(
      billingJs.indexOf('function initBilling()'),
      billingJs.indexOf('// ═══', billingJs.indexOf('function initBilling()'))
    );
    expect(initBillingFn).toMatch(/window\.initReferralHub/);
  });

  it('8.2 — initReferralHub call has typeof guard', () => {
    expect(billingJs).toMatch(/typeof window\.initReferralHub === 'function'/);
  });

  it('8.3 — referral_section_viewed PostHog event wired', () => {
    expect(billingJs).toMatch(/referral_section_viewed/);
  });

  it('8.4 — IntersectionObserver used for viewport detection', () => {
    expect(billingJs).toMatch(/IntersectionObserver/);
    expect(billingJs).toMatch(/sub-referral-section/);
  });
});

// ─── Section 9: Referral Intro Card Preserved ────────────────────────

describe('9. Referral Intro Card Preserved', () => {
  it('9.1 — referral-intro-card container still in HTML', () => {
    expect(dashboardHtml).toMatch(/id="referral-intro-card"/);
  });

  it('9.2 — showUpgradeReferralIntro NOT parked', () => {
    // Strip all /* */ comment blocks, function should still exist
    const activeCode = referralsJs.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(activeCode).toMatch(/window\.showUpgradeReferralIntro/);
  });

  it('9.3 — _introcopyreferrallink NOT parked', () => {
    const activeCode = referralsJs.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(activeCode).toMatch(/window\._introcopyreferrallink/);
  });

  it('9.4 — _dismissReferralIntro NOT parked', () => {
    const activeCode = referralsJs.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(activeCode).toMatch(/window\._dismissReferralIntro/);
  });

  it('9.5 — regenerateReferralCode NOT parked', () => {
    const afterParked = referralsJs.substring(referralsJs.lastIndexOf('*/'));
    expect(afterParked).toMatch(/window\.regenerateReferralCode/);
  });

  it('9.6 — initSidebarReferralLink NOT parked', () => {
    const afterParked = referralsJs.substring(referralsJs.lastIndexOf('*/'));
    expect(afterParked).toMatch(/window\.initSidebarReferralLink/);
  });

  it('9.7 — showReferralShareModal NOT parked', () => {
    // Should exist as active function (called from pipeline.js)
    const activeCode = referralsJs.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(activeCode).toMatch(/window\.showReferralShareModal/);
  });
});

// ─── Section 10: Page Routing ────────────────────────────────────────

describe('10. Page Routing', () => {
  it('10.1 — referrals removed from _bjPageTitles', () => {
    expect(appJs).not.toMatch(/referrals:\s*'Referrals'/);
  });

  it('10.2 — referrals removed from _bjPageSections', () => {
    expect(appJs).not.toMatch(/referrals:\s*'growth'/);
  });

  it('10.3 — Tab handler redirects referrals to subscription', () => {
    expect(appJs).toMatch(/if \(_tab === 'referrals'\)/);
    expect(appJs).toMatch(/_tab = 'subscription'/);
  });

  it('10.4 — Deep link redirect includes scrollTo', () => {
    expect(appJs).toMatch(/sub-referral-section.*scrollIntoView/);
  });

  it('10.5 — lastTab=referrals redirects to subscription', () => {
    expect(appJs).toMatch(/lastTab === 'referrals'/);
    expect(appJs).toMatch(/lastTab = 'subscription'/);
  });

  it('10.6 — referrals removed from skeleton exclusion list', () => {
    const skelLine = appJs.match(/!.*\[.*stats.*feedback.*\]\.includes\(_tab\)/);
    expect(skelLine).not.toBeNull();
    expect(skelLine[0]).not.toMatch(/referrals/);
  });

  it('10.7 — Generic scrollTo URL param handler exists', () => {
    expect(appJs).toMatch(/scrollTo/);
    expect(appJs).toMatch(/scrollIntoView/);
    expect(appJs).toMatch(/_scrollParams\.get\('scrollTo'\)/);
  });

  it('10.8 — scrollTo param cleaned from URL after scroll', () => {
    expect(appJs).toMatch(/_scrollParams\.delete\('scrollTo'\)/);
    expect(appJs).toMatch(/history\.replaceState/);
  });
});

// ─── Section 11: Subscription Page Card Order ────────────────────────

describe('11. Subscription Page Card Order', () => {
  it('11.1 — Cards in correct sequence per spec §4', () => {
    const plansPos = dashboardHtml.indexOf('card-title">Plans');
    const creditPacksPos = dashboardHtml.indexOf('Buy Credit Packs') !== -1
      ? dashboardHtml.indexOf('Buy Credit Packs')
      : dashboardHtml.indexOf('Credit Packs');
    const autoRefillPos = dashboardHtml.indexOf('Auto-Refill');
    const earnCreditsPos = dashboardHtml.indexOf('Earn Free Credits');
    const payHiredPos = dashboardHtml.indexOf('Pay When You\'re Hired');

    expect(plansPos).toBeGreaterThan(-1);
    expect(autoRefillPos).toBeGreaterThan(plansPos);
    expect(earnCreditsPos).toBeGreaterThan(autoRefillPos);
    expect(payHiredPos).toBeGreaterThan(earnCreditsPos);
  });
});

// ─── Section 12: Build & Version ─────────────────────────────────────

describe('12. Build & Version', () => {
  it('12.1 — Product version is v9.48', () => {
    expect(versionJs).toMatch(/BJ_VERSION\s*=\s*["']v9\.48["']/);
  });

  it('12.2 — Dashboard bundle rebuilt', () => {
    const bundle = read('dist/dashboard.min.js');
    expect(bundle).toMatch(/v9\.48/);
  });

  it('12.3 — Dashboard deferred bundle rebuilt', () => {
    const bundle = read('dist/dashboard-deferred.min.js');
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it('12.4 — Admin bundle rebuilt', () => {
    const bundle = read('dist/admin.min.js');
    expect(bundle.length).toBeGreaterThan(1000);
  });

  it('12.5 — Styles rebuilt', () => {
    const css = read('styles.css');
    expect(css.length).toBeGreaterThan(1000);
  });
});

// ─── Section 13: No Console Errors / Silent Fails ────────────────────

describe('13. No Silent Fails', () => {
  it('13.1 — No truly empty catches in referrals.js active code', () => {
    // Strip only the PARKED block comments (large multi-line), not inline /* ignore */ comments
    const activeCode = referralsJs
      .replace(/\/\*\n[\s\S]*?\*\//g, '')  // Strip multi-line block comments only
      .replace(/\/\/.*$/gm, '');            // Strip single-line comments
    // Match catches with absolutely nothing between braces (no whitespace-only either)
    const trulyEmpty = activeCode.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/g);
    expect(trulyEmpty).toBeNull();
  });

  it('13.2 — All referrals.js catch blocks use reportError or are intentional ignores', () => {
    // Check raw source (not stripped) — every catch block should have reportError, ignore, or console
    const activeLines = referralsJs.split('\n');
    let inParkedBlock = false;
    const catchLines = [];
    for (let i = 0; i < activeLines.length; i++) {
      const line = activeLines[i].trim();
      if (line === '/*') inParkedBlock = true;
      if (line === '*/') { inParkedBlock = false; continue; }
      if (inParkedBlock) continue;
      if (line.includes('catch(') || line.includes('catch (')) {
        // Get catch + next few lines as context
        const ctx = activeLines.slice(i, i + 3).join(' ');
        if (!ctx.includes('reportError') && !ctx.includes('ignore') && !ctx.includes('non-critical') && !ctx.includes('console')) {
          catchLines.push(`Line ${i+1}: ${line}`);
        }
      }
    }
    expect(catchLines).toEqual([]);
  });
});

// ─── Section 14: File Inventory ──────────────────────────────────────

describe('14. File Inventory', () => {
  const expectedModified = [
    'dashboard.html',
    'js/referrals.js',
    'js/billing.js',
    'js/app.js',
    'dist/dashboard.min.js',
    'dist/dashboard-deferred.min.js',
    'dist/admin.min.js',
    'styles.css',
  ];

  expectedModified.forEach(f => {
    it(`14.x — ${f} exists`, () => {
      expect(() => read(f)).not.toThrow();
    });
  });
});
