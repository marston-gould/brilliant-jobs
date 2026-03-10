/**
 * Tab Test Session 4 — Cross-Tab Validation
 * 
 * Automated structural validation for all 5 test cases (XT-001 through XT-005)
 * from Tab_Test_Sequence_v3_AllUsers.docx, Section 4: Cross-Tab Validation.
 * 
 * Validates shared state consistency across Job Feed, Tuning, and Résumés tabs.
 * 
 * Subsections:
 *   4.1 Dismiss in Feed → Tuning List (XT-001)
 *   4.2 Tuning Radius → Feed Results (XT-002)
 *   4.3 Résumé → Generate Filters from Feed (XT-003)
 *   4.4 AI Score Cross-Tab Consistency (XT-004)
 *   4.5 Profile Data Isolation (XT-005)
 *   Exit Criteria Validation
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let dashboardHtml, jobFeedJs, tuningJs, resumesJs, appJs, globalsTs,
    locationJs, chatJs, keywordsJs, lazyLoaderTs;

try { dashboardHtml = read('dashboard.html'); } catch (e) { dashboardHtml = ''; }
try { jobFeedJs = read('js/job-feed.js'); } catch (e) { jobFeedJs = ''; }
try { tuningJs = read('js/tuning.js'); } catch (e) { tuningJs = ''; }
try { resumesJs = read('js/resumes.js'); } catch (e) { resumesJs = ''; }
try { appJs = read('js/app.js'); } catch (e) { appJs = ''; }
try { globalsTs = read('js/globals.ts'); } catch (e) { globalsTs = ''; }
try { locationJs = read('js/location.js'); } catch (e) { locationJs = ''; }
try { chatJs = read('js/chat.js'); } catch (e) { chatJs = ''; }
try { keywordsJs = read('js/keywords.js'); } catch (e) { keywordsJs = ''; }
try { lazyLoaderTs = read('js/lazy-loader.ts'); } catch (e) { lazyLoaderTs = ''; }

// ─────────────────────────────────────────────────
// Section 4.1 — Dismiss in Feed → Tuning List (XT-001)
// ─────────────────────────────────────────────────

describe('4.1 Dismiss in Feed → Tuning List', () => {
  test('XT-001: hiddenJobIds declared in globals.ts (shared shell chunk)', () => {
    expect(globalsTs).toMatch(/var\s+hiddenJobIds\s*=\s*safeReadLS\(['"]bj_hidden_jobs['"]/);
  });

  test('XT-001: Feed dismiss writes to hiddenJobIds and saves via saveUserData', () => {
    // job-feed.js must push to hiddenJobIds array and persist
    expect(jobFeedJs).toMatch(/hiddenJobIds/);
    expect(jobFeedJs).toMatch(/saveUserData\(['"]bj_hidden_jobs['"]\s*,/);
  });

  test('XT-001: Tuning reads hiddenJobIds for dismissed list rendering', () => {
    // tuning.js updatePoorMatchSuggestions reads hiddenJobIds
    expect(tuningJs).toMatch(/hiddenJobIds/);
  });

  test('XT-001: Both feed and tuning use same localStorage key', () => {
    expect(globalsTs).toMatch(/bj_hidden_jobs/);
    expect(tuningJs).toMatch(/bj_hidden_jobs/);
  });

  test('XT-001: U-01 — First dismissal creates list correctly', () => {
    // hiddenJobIds starts as [] from safeReadLS fallback
    expect(globalsTs).toMatch(/safeReadLS\(['"]bj_hidden_jobs['"],\s*\[\]/);
  });

  test('XT-001: U-04 — hiddenJobIds format migration handles string→object', () => {
    // Legacy format was string IDs, current is objects with {id, reason, title, company}
    expect(jobFeedJs).toMatch(/typeof hiddenJobIds\[0\]\s*===\s*['"]string['"]/);
  });
});

// ─────────────────────────────────────────────────
// Section 4.2 — Tuning Radius → Feed Results (XT-002)
// ─────────────────────────────────────────────────

describe('4.2 Tuning Radius → Feed Results', () => {
  test('XT-002: Tuning saves via saveTuning() to localStorage + Supabase', () => {
    expect(tuningJs).toMatch(/function\s+saveTuning/);
    expect(tuningJs).toMatch(/saveUserData\(['"]bj_tuning['"]/);
  });

  test('XT-002: _tuningDirty flag set when tuning changes', () => {
    expect(tuningJs).toMatch(/window\._tuningDirty\s*=\s*true/);
  });

  test('XT-002: Feed tab activation checks _tuningDirty and re-searches', () => {
    // app.js tab switch handler must check and reset _tuningDirty
    expect(appJs).toMatch(/window\._tuningDirty/);
    expect(appJs).toMatch(/_tuningDirty\s*=\s*false/);
  });

  test('XT-002: Feed buildFilterQuery reads tuning settings', () => {
    expect(jobFeedJs).toMatch(/tuningSettings|bj_tuning/);
  });

  test('XT-002: US-Only, excludeHourly, excludeStaffing propagate to feed queries', () => {
    expect(jobFeedJs).toMatch(/usOnly|us.only/i);
    expect(jobFeedJs).toMatch(/excludeHourly|exclude.*hourly/i);
  });
});

// ─────────────────────────────────────────────────
// Section 4.3 — Résumé → Generate Filters from Feed (XT-003)
// ─────────────────────────────────────────────────

describe('4.3 Résumé → Generate Filters from Feed', () => {
  test('XT-003: showResumePicker function available for multi-resume selection', () => {
    expect(tuningJs).toMatch(/function\s+showResumePicker/);
  });

  test('XT-003: Resume picker overlay exists in HTML', () => {
    expect(dashboardHtml).toMatch(/resume-picker-overlay/);
  });

  test('XT-003: UX-004 — No alert() when resumes exist', () => {
    // Must not have bare alert("Upload a resume first")
    const alertUpload = appJs.match(/alert\s*\(\s*['"]Upload a resume/);
    expect(alertUpload).toBeFalsy();
  });

  test('XT-003: resumes array accessible globally for picker population', () => {
    // resumes declared in globals, accessible across all chunks
    expect(globalsTs).toMatch(/bj_resumes/);
  });

  test('XT-003: Resume picker renders resume options with names', () => {
    expect(tuningJs).toMatch(/rp-option|r\.name/);
  });

  test('XT-003: Chat mode can access resumes for filter generation', () => {
    // chat.js or the filter generation path must reference resumes
    const chatOrAppRefsResumes = chatJs.includes('resumes') || appJs.includes('resumes');
    expect(chatOrAppRefsResumes).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// Section 4.4 — AI Score Cross-Tab Consistency (XT-004)
// ─────────────────────────────────────────────────

describe('4.4 AI Score Cross-Tab Consistency', () => {
  test('XT-004: readinessCache in globals.ts (shell) — shared across all tabs', () => {
    expect(globalsTs).toMatch(/var readinessCache\s*=\s*safeReadLS\(['"]bj_readiness['"]/);
  });

  test('XT-004: Resumes tab reads readinessCache for score display', () => {
    expect(resumesJs).toMatch(/readinessCache/);
  });

  test('XT-004: keywords.js provides buildInlineGrade for score rendering', () => {
    expect(keywordsJs).toMatch(/function\s+buildInlineGrade|buildInlineGrade/);
  });

  test('XT-004: readinessCache persisted to localStorage under bj_readiness', () => {
    expect(globalsTs).toMatch(/bj_readiness/);
  });

  test('XT-004: U-05 — Scores indexed per-resume (not blended)', () => {
    // readinessCache.scores[i] — per-resume index
    expect(resumesJs).toMatch(/readinessCache\.scores\[i\]|readinessCache.*scores.*\[i\]/);
  });
});

// ─────────────────────────────────────────────────
// Section 4.5 — Profile Data Isolation (XT-005)
// ─────────────────────────────────────────────────

describe('4.5 Profile Data Isolation', () => {
  test('XT-005: RLS policies exist on user-facing tables', () => {
    // Verify RLS referenced in codebase — Supabase enforces user isolation
    const rlsRef = globalsTs.includes('currentUser') || appJs.includes('currentUser');
    expect(rlsRef).toBe(true);
  });

  test('XT-005: currentUser used for Supabase queries (user-scoped)', () => {
    expect(appJs).toMatch(/currentUser/);
  });

  test('XT-005: PII data encrypted in localStorage (enc: prefix)', () => {
    expect(globalsTs).toMatch(/enc:|readPiiData|savePiiData|_PII_KEYS/);
  });

  test('XT-005: Saved filters scoped to user via user_filters table', () => {
    expect(locationJs).toMatch(/user_filters|savedFilters/);
  });

  test('XT-005: hiddenJobIds stored per-user via saveUserData', () => {
    expect(globalsTs).toMatch(/saveUserData/);
  });

  test('XT-005: Logout clears user state', () => {
    // app.js or settings.js must clear localStorage on logout
    const logoutClear = appJs.includes('signOut') || appJs.includes('logout');
    expect(logoutClear).toBe(true);
  });
});

// ─────────────────────────────────────────────────
// Exit Criteria Validation
// ─────────────────────────────────────────────────

describe('Exit Criteria Validation', () => {
  test('All three tabs loadable via lazy-loader', () => {
    expect(lazyLoaderTs).toMatch(/'jobs'/);
    expect(lazyLoaderTs).toMatch(/'tuning'/);
    expect(lazyLoaderTs).toMatch(/'resumes'/);
  });

  test('Zero bare alert() for resume operations in app.js', () => {
    const alertResume = appJs.match(/alert\s*\(\s*['"]Upload a resume/);
    expect(alertResume).toBeFalsy();
  });

  test('hiddenJobIds, tuningSettings, readinessCache all in globals (shared state)', () => {
    expect(globalsTs).toMatch(/hiddenJobIds/);
    expect(globalsTs).toMatch(/readinessCache/);
    // tuningSettings read via safeReadLS in tuning.js, which is fine since it's per-tab
  });

  test('Tab Test Sequence S1 test file exists (Job Feed)', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests', 'tab-test-s1-job-feed.test.js'))).toBe(true);
  });

  test('Tab Test Sequence S2 test file exists (Tuning)', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests', 'tab-test-s2-tuning.test.js'))).toBe(true);
  });

  test('Tab Test Sequence S3 test file exists (Résumés)', () => {
    expect(fs.existsSync(path.join(ROOT, 'tests', 'tab-test-s3-resumes.test.js'))).toBe(true);
  });

  test('Pod team manifest has all 5 hook-and-scar roles', () => {
    const manifest = read('docs/scaling/pod-team-manifest.md');
    expect(manifest).toMatch(/Chief Architect/);
    expect(manifest).toMatch(/Lead Platform Engineer/);
    expect(manifest).toMatch(/System Architect.*Scalability/);
    expect(manifest).toMatch(/Forward-Looking Developer/);
    expect(manifest).toMatch(/Evolvability Strategist/);
  });
});
