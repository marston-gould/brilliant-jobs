/**
 * FB-INTPREP-001-S2 — Interview Prep Phase 2: Question Bank UI
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §3.4, §5.1-5.3, §10 Phase 2
 * Product version: v9.50
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');
const exists = f => existsSync(join(ROOT, f));

const dashboardHtml = read('dashboard.html');
const ipJs = read('js/interview-prep.js');
const appJs = read('js/app.js');
const buildJs = read('build.js');
const inputCss = read('src/input.css');
const versionJs = read('js/version.js');

// ─── Section 1: Nav Item ─────────────────────────────────────────────

describe('1. Nav Item', () => {
  it('1.1 — Interview Prep nav item exists', () => {
    expect(dashboardHtml).toMatch(/data-page="interview-prep"/);
  });

  it('1.2 — Uses Lucide graduation-cap icon', () => {
    const navArea = dashboardHtml.substring(
      dashboardHtml.indexOf('data-page="interview-prep"') - 200,
      dashboardHtml.indexOf('data-page="interview-prep"') + 200
    );
    expect(navArea).toMatch(/graduation-cap/);
  });

  it('1.3 — Positioned between Insights and Account', () => {
    const insightsPos = dashboardHtml.indexOf('Insights');
    const ipNavPos = dashboardHtml.indexOf('data-page="interview-prep"');
    const accountPos = dashboardHtml.indexOf('nav-section-label">Account');
    expect(ipNavPos).toBeGreaterThan(insightsPos);
    expect(ipNavPos).toBeLessThan(accountPos);
  });

  it('1.4 — Nav label is "Interview Prep"', () => {
    const navArea = dashboardHtml.substring(
      dashboardHtml.indexOf('data-page="interview-prep"'),
      dashboardHtml.indexOf('data-page="interview-prep"') + 300
    );
    expect(navArea).toMatch(/>Interview Prep</);
  });
});

// ─── Section 2: Page Shell ───────────────────────────────────────────

describe('2. Page Shell', () => {
  it('2.1 — page-interview-prep div exists', () => {
    expect(dashboardHtml).toMatch(/id="page-interview-prep"/);
  });

  it('2.2 — Page header with title', () => {
    const pageArea = dashboardHtml.substring(
      dashboardHtml.indexOf('page-interview-prep'),
      dashboardHtml.indexOf('page-interview-prep') + 2000
    );
    expect(pageArea).toMatch(/<h2>Interview Prep<\/h2>/);
  });

  it('2.3 — Two-tab bar present (Question Bank | My Sessions)', () => {
    expect(dashboardHtml).toMatch(/id="ip-tabs"/);
    expect(dashboardHtml).toMatch(/data-ip-tab="question-bank"/);
    expect(dashboardHtml).toMatch(/data-ip-tab="my-sessions"/);
  });

  it('2.4 — Question Bank panel exists', () => {
    expect(dashboardHtml).toMatch(/id="ip-panel-question-bank"/);
  });

  it('2.5 — My Sessions panel exists', () => {
    expect(dashboardHtml).toMatch(/id="ip-panel-my-sessions"/);
  });

  it('2.6 — My Sessions shows coming soon placeholder', () => {
    const sessionsPanel = dashboardHtml.substring(
      dashboardHtml.indexOf('ip-panel-my-sessions'),
      dashboardHtml.indexOf('ip-panel-my-sessions') + 500
    );
    expect(sessionsPanel).toMatch(/Coming Soon/);
  });
});

// ─── Section 3: Filter UI ────────────────────────────────────────────

describe('3. Filter UI', () => {
  it('3.1 — Role family dropdown', () => {
    expect(dashboardHtml).toMatch(/id="ip-filter-role"/);
    expect(dashboardHtml).toMatch(/All Roles/);
  });

  it('3.2 — Department dropdown', () => {
    expect(dashboardHtml).toMatch(/id="ip-filter-dept"/);
    expect(dashboardHtml).toMatch(/All Departments/);
  });

  it('3.3 — Level dropdown', () => {
    expect(dashboardHtml).toMatch(/id="ip-filter-level"/);
    expect(dashboardHtml).toMatch(/All Levels/);
  });

  it('3.4 — Category pills (All/Behavioral/Technical/Situational/Case Study)', () => {
    expect(dashboardHtml).toMatch(/id="ip-category-pills"/);
    expect(dashboardHtml).toMatch(/data-cat="behavioral"/);
    expect(dashboardHtml).toMatch(/data-cat="technical"/);
    expect(dashboardHtml).toMatch(/data-cat="situational"/);
    expect(dashboardHtml).toMatch(/data-cat="case_study"/);
  });

  it('3.5 — Difficulty toggle (All/Standard/Advanced)', () => {
    expect(dashboardHtml).toMatch(/id="ip-difficulty-pills"/);
    expect(dashboardHtml).toMatch(/data-diff="standard"/);
    expect(dashboardHtml).toMatch(/data-diff="advanced"/);
  });

  it('3.6 — Search input present', () => {
    expect(dashboardHtml).toMatch(/id="ip-search"/);
    expect(dashboardHtml).toMatch(/Search questions or skills/);
  });
});

// ─── Section 4: Bookmarks ────────────────────────────────────────────

describe('4. Bookmarks', () => {
  it('4.1 — Bookmarks section in HTML', () => {
    expect(dashboardHtml).toMatch(/id="ip-bookmarks-section"/);
    expect(dashboardHtml).toMatch(/id="ip-bookmarks-list"/);
    expect(dashboardHtml).toMatch(/id="ip-bookmark-count"/);
  });

  it('4.2 — _ipToggleBookmark function exists', () => {
    expect(ipJs).toMatch(/window\._ipToggleBookmark/);
  });

  it('4.3 — Bookmarks stored in localStorage', () => {
    expect(ipJs).toMatch(/bj_ip_bookmarks/);
    expect(ipJs).toMatch(/localStorage\.setItem/);
    expect(ipJs).toMatch(/localStorage\.getItem/);
  });

  it('4.4 — Bookmark icon uses Lucide bookmark/bookmark-check', () => {
    expect(ipJs).toMatch(/bookmark-check/);
    expect(ipJs).toMatch(/data-lucide/);
  });

  it('4.5 — question_bookmarked PostHog event', () => {
    expect(ipJs).toMatch(/question_bookmarked/);
  });
});

// ─── Section 5: Question Card Rendering ──────────────────────────────

describe('5. Question Card Rendering', () => {
  it('5.1 — Category badge with colors', () => {
    expect(ipJs).toMatch(/CAT_COLORS/);
    expect(ipJs).toMatch(/behavioral.*bg.*text/s);
    expect(ipJs).toMatch(/technical.*bg.*text/s);
    expect(ipJs).toMatch(/situational.*bg.*text/s);
    expect(ipJs).toMatch(/case_study.*bg.*text/s);
  });

  it('5.2 — Difficulty badge with colors', () => {
    expect(ipJs).toMatch(/DIFF_COLORS/);
    expect(ipJs).toMatch(/standard.*bg.*text/s);
    expect(ipJs).toMatch(/advanced.*bg.*text/s);
  });

  it('5.3 — Skill tag chips rendered', () => {
    expect(ipJs).toMatch(/skill_tags/);
    expect(ipJs).toMatch(/\.slice\(0,\s*4\)/);
  });

  it('5.4 — XSS protection via _esc helper', () => {
    expect(ipJs).toMatch(/function _esc/);
    expect(ipJs).toMatch(/&amp;/);
    expect(ipJs).toMatch(/&lt;/);
    expect(ipJs).toMatch(/&gt;/);
  });

  it('5.5 — Performance guard: max 100 cards rendered', () => {
    expect(ipJs).toMatch(/\.slice\(0,\s*100\)/);
  });

  it('5.6 — Results count element updated', () => {
    expect(ipJs).toMatch(/ip-results-count/);
  });
});

// ─── Section 6: Data Loading ─────────────────────────────────────────

describe('6. Data Loading', () => {
  it('6.1 — Loads from interview_questions table', () => {
    expect(ipJs).toMatch(/\.from\('interview_questions'\)/);
  });

  it('6.2 — Selects required columns', () => {
    expect(ipJs).toMatch(/id.*question_text.*category.*difficulty.*role_cluster/);
  });

  it('6.3 — Limit 5000 for performance', () => {
    expect(ipJs).toMatch(/\.limit\(5000\)/);
  });

  it('6.4 — Populates filter dropdowns from data', () => {
    expect(ipJs).toMatch(/_populateDropdown/);
    expect(ipJs).toMatch(/ip-filter-role/);
    expect(ipJs).toMatch(/ip-filter-dept/);
    expect(ipJs).toMatch(/ip-filter-level/);
  });

  it('6.5 — Error handling with reportError', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:load'/);
  });
});

// ─── Section 7: Search & Filtering ───────────────────────────────────

describe('7. Search & Filtering', () => {
  it('7.1 — Search is debounced', () => {
    expect(ipJs).toMatch(/_debounceTimer/);
    expect(ipJs).toMatch(/setTimeout/);
    expect(ipJs).toMatch(/200/); // 200ms debounce
  });

  it('7.2 — Search checks question_text, skill_tags, and role_cluster', () => {
    expect(ipJs).toMatch(/inText/);
    expect(ipJs).toMatch(/inSkills/);
    expect(ipJs).toMatch(/inRole/);
  });

  it('7.3 — All filter dimensions applied', () => {
    const filterFn = ipJs.substring(ipJs.indexOf('function _applyFilters'), ipJs.indexOf('_renderQuestions'));
    expect(filterFn).toMatch(/_filters\.role/);
    expect(filterFn).toMatch(/_filters\.dept/);
    expect(filterFn).toMatch(/_filters\.level/);
    expect(filterFn).toMatch(/_filters\.category/);
    expect(filterFn).toMatch(/_filters\.difficulty/);
    expect(filterFn).toMatch(/_filters\.search/);
  });

  it('7.4 — question_bank_searched PostHog event', () => {
    expect(ipJs).toMatch(/question_bank_searched/);
  });
});

// ─── Section 8: app.js Wiring ────────────────────────────────────────

describe('8. app.js Wiring', () => {
  it('8.1 — interview-prep in _bjPageTitles', () => {
    expect(appJs).toMatch(/'interview-prep':\s*'Interview Prep'/);
  });

  it('8.2 — interview-prep in _bjPageSections', () => {
    expect(appJs).toMatch(/'interview-prep':\s*'intelligence'/);
  });

  it('8.3 — Tab handler calls initInterviewPrep', () => {
    expect(appJs).toMatch(/_tab === 'interview-prep'.*initInterviewPrep/);
  });

  it('8.4 — lastTab restore handler', () => {
    expect(appJs).toMatch(/lastTab === 'interview-prep'.*initInterviewPrep/);
  });

  it('8.5 — In skeleton exclusion list', () => {
    const skelLine = appJs.match(/\[.*'interview-prep'.*\]\.includes\(_tab\)/);
    expect(skelLine).not.toBeNull();
  });
});

// ─── Section 9: Build Configuration ──────────────────────────────────

describe('9. Build Configuration', () => {
  it('9.1 — interview-prep.js in deferred chunk', () => {
    expect(buildJs).toMatch(/interview-prep\.js/);
  });

  it('9.2 — Deferred bundle contains interview-prep code', () => {
    const bundle = read('dist/dashboard-deferred.min.js');
    expect(bundle).toMatch(/initInterviewPrep/);
  });
});

// ─── Section 10: CSS ─────────────────────────────────────────────────

describe('10. CSS', () => {
  it('10.1 — .ip-pill styles', () => {
    expect(inputCss).toMatch(/\.ip-pill/);
  });

  it('10.2 — .ip-pill.active styles', () => {
    expect(inputCss).toMatch(/\.ip-pill\.active/);
  });

  it('10.3 — .ip-tab-panel styles', () => {
    expect(inputCss).toMatch(/\.ip-tab-panel/);
  });

  it('10.4 — .ip-question-card hover', () => {
    expect(inputCss).toMatch(/\.ip-question-card:hover/);
  });
});

// ─── Section 11: PostHog Events ──────────────────────────────────────

describe('11. PostHog Events', () => {
  it('11.1 — interview_prep_page_viewed event', () => {
    expect(ipJs).toMatch(/interview_prep_page_viewed/);
  });

  it('11.2 — question_bank_searched event', () => {
    expect(ipJs).toMatch(/question_bank_searched/);
  });

  it('11.3 — question_bookmarked event', () => {
    expect(ipJs).toMatch(/question_bookmarked/);
  });
});

// ─── Section 12: Build & Version ─────────────────────────────────────

describe('12. Build & Version', () => {
  it('12.1 — Product version is v9.50', () => {
    expect(versionJs).toMatch(/v9\.50/);
  });

  it('12.2 — Dashboard bundle rebuilt', () => {
    const bundle = read('dist/dashboard.min.js');
    expect(bundle).toMatch(/v9\.50/);
  });

  it('12.3 — Styles rebuilt', () => {
    const css = read('styles.css');
    expect(css).toMatch(/ip-pill/);
  });
});

// ─── Section 13: File Inventory ──────────────────────────────────────

describe('13. File Inventory', () => {
  const files = [
    'js/interview-prep.js',
    'dashboard.html',
    'js/app.js',
    'build.js',
    'src/input.css',
    'tests/fb-intprep-001-s2-question-bank-ui.test.js',
  ];

  files.forEach(f => {
    it(`13.x — ${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
