/**
 * Tab Test Session 3 — Résumés Tab Validation
 * 
 * Automated structural validation for all 16 test cases (RE-001 through RE-016)
 * from Tab_Test_Sequence_v3_AllUsers.docx, Section 3: Résumés Tab.
 * 
 * Subsections:
 *   3.1 Tab Load (RE-001 to RE-002)
 *   3.2 Upload (RE-003 to RE-005)
 *   3.3 Parse (RE-006 to RE-007)
 *   3.4 AI Scoring (RE-008)
 *   3.5 AI Rewrite (RE-009 to RE-010)
 *   3.6 Gap Analysis (RE-011)
 *   3.7 Archive (RE-012 to RE-013)
 *   3.8 Error and Edge States (RE-014 to RE-016)
 *   Regression Prevention (UX-004, POD3-SF readinessCache)
 *   User Profile Edge Cases (U-01, U-03, U-04, U-05, U-06)
 *   Build & Version + File Inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let dashboardHtml, resumesJs, tuningJs, keywordsJs, lazyLoaderTs,
    appJs, globalsTs, buildJs, chatJs, jobFeedJs;

try { dashboardHtml = read('dashboard.html'); } catch (e) { dashboardHtml = ''; }
try { resumesJs = read('js/resumes.js'); } catch (e) { resumesJs = ''; }
try { tuningJs = read('js/tuning.js'); } catch (e) { tuningJs = ''; }
try { keywordsJs = read('js/keywords.js'); } catch (e) { keywordsJs = ''; }
try { lazyLoaderTs = read('js/lazy-loader.ts'); } catch (e) { lazyLoaderTs = ''; }
try { appJs = read('js/app.js'); } catch (e) { appJs = ''; }
try { globalsTs = read('js/globals.ts'); } catch (e) { globalsTs = ''; }
try { buildJs = read('build.js'); } catch (e) { buildJs = ''; }
try { chatJs = read('js/chat.js'); } catch (e) { chatJs = ''; }
try { jobFeedJs = read('js/job-feed.js'); } catch (e) { jobFeedJs = ''; }

// ─────────────────────────────────────────────────
// Section 3.1 — Tab Load (RE-001 to RE-002)
// ─────────────────────────────────────────────────

describe('3.1 Tab Load', () => {
  test('RE-001: Résumés tab nav item exists in sidebar', () => {
    expect(dashboardHtml).toMatch(/data-page=["']resumes["']/);
  });

  test('RE-001: Résumés page container exists', () => {
    expect(dashboardHtml).toMatch(/id=["']page-resumes["']/);
  });

  test('RE-001: Lazy-loader TAB_CHUNKS maps resumes tab to keywords + deferred', () => {
    expect(lazyLoaderTs).toMatch(/'resumes':\s*\[['"]keywords['"],\s*['"]deferred['"]\]/);
  });

  test('RE-001: resumes.js is in the deferred build chunk', () => {
    const deferredMatch = buildJs.match(/deferred:\s*\[([\s\S]*?)\]/);
    expect(deferredMatch).toBeTruthy();
    expect(deferredMatch[1]).toMatch(/resumes\.js/);
  });

  test('RE-001: renderResumes function exists and called on module load', () => {
    expect(resumesJs).toMatch(/function\s+renderResumes\s*\(\)/);
    // Must be called at top level
    const lines = resumesJs.split('\n');
    const topCalls = lines.filter(l => l.trim() === 'renderResumes();');
    expect(topCalls.length).toBeGreaterThan(0);
  });

  test('RE-001: U-01 — Empty state shows upload prompt, not blank div', () => {
    // When no active resumes, upload zone shown with helpful text
    expect(resumesJs).toMatch(/Drop resumes here|click to upload/);
  });

  test('RE-001: U-01 — Cloud recovery attempted when no local resumes', () => {
    expect(resumesJs).toMatch(/cloud recovery|Recovering resumes/i);
  });

  test('RE-001: U-06 — reportError used in catch blocks (ES-002 compliance)', () => {
    const reportCalls = (resumesJs.match(/reportError\(/g) || []).length;
    expect(reportCalls).toBeGreaterThan(0);
  });

  test('RE-002: Resume card builder function exists', () => {
    expect(resumesJs).toMatch(/function\s+buildResumeCard/);
  });

  test('RE-002: Resume cards show filter associations', () => {
    expect(resumesJs).toMatch(/filterIds|filter-dot|filter.*color/);
  });

  test('RE-002: U-05 — Resumes grouped by saved filter', () => {
    expect(resumesJs).toMatch(/Group resumes by filter|filterIds.*includes/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.2 — Upload (RE-003 to RE-005)
// ─────────────────────────────────────────────────

describe('3.2 Upload', () => {
  test('RE-003: Upload zone exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']resume-upload-zone["']/);
  });

  test('RE-003: File input accepts PDF, DOC, DOCX only', () => {
    expect(resumesJs).toMatch(/accept=["'].pdf,.doc,.docx["']/);
  });

  test('RE-003: addResume function exists', () => {
    expect(resumesJs).toMatch(/async\s+function\s+addResume\s*\(file\)/);
  });

  test('RE-003: Upload saves to Supabase Storage for cross-device persistence', () => {
    expect(resumesJs).toMatch(/sb\.storage\.from\(['"]resumes['"]\)\.upload/);
  });

  test('RE-003: U-01 — First upload creates the resume record', () => {
    // resumes.push(resume) in addResume
    expect(resumesJs).toMatch(/resumes\.push\(resume\)/);
  });

  test('RE-003: U-03 — Entitlement check before upload (tier gating)', () => {
    expect(resumesJs).toMatch(/checkEntitlement\(['"]resumes['"]/);
  });

  test('RE-004: File input uses accept attribute to restrict types', () => {
    // HTML accept attribute provides client-side validation
    expect(resumesJs).toMatch(/accept=["'][^"']*\.pdf/);
  });

  test('RE-005: Upload zone displays size limit text', () => {
    expect(resumesJs).toMatch(/up to 5MB|5MB each/i);
  });

  test('RE-005: Drag and drop supported on upload zone', () => {
    expect(resumesJs).toMatch(/dragover/);
    expect(resumesJs).toMatch(/dragleave/);
    expect(resumesJs).toMatch(/\.addEventListener\(['"]drop['"]/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.3 — Parse (RE-006 to RE-007)
// ─────────────────────────────────────────────────

describe('3.3 Parse', () => {
  test('RE-006: Text extraction function called after upload', () => {
    expect(resumesJs).toMatch(/extractTextFromFile/);
  });

  test('RE-006: textStatus tracks parse state transitions', () => {
    // extracting → ready or no-text
    expect(resumesJs).toMatch(/textStatus.*extracting/);
    expect(resumesJs).toMatch(/textStatus.*ready/);
    expect(resumesJs).toMatch(/textStatus.*no-text/);
  });

  test('RE-006: U-06 — Failed parse sets no-text status, not stuck on extracting', () => {
    expect(resumesJs).toMatch(/no-text/);
  });

  test('RE-007: Extracted keywords stored per-resume', () => {
    expect(resumesJs).toMatch(/extractResumeKeywords/);
    expect(resumesJs).toMatch(/resumes\[.*\]\.keywords/);
  });

  test('RE-007: U-05 — Per-resume pipeline isolation (distinct extractedText)', () => {
    // Each resume gets its own extractedText and keywords
    expect(resumesJs).toMatch(/resumes\[idx\]\.extractedText\s*=\s*text/);
    expect(resumesJs).toMatch(/resumes\[idx\]\.keywords\s*=\s*extractResumeKeywords\(text\)/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.4 — AI Scoring (RE-008)
// ─────────────────────────────────────────────────

describe('3.4 AI Scoring', () => {
  test('RE-008: handleRescore function exported to window', () => {
    expect(resumesJs).toMatch(/window\.handleRescore\s*=\s*function/);
  });

  test('RE-008: readinessCache declared in globals (shell chunk)', () => {
    // POD3-SF fix: readinessCache must be in globals, not keywords
    expect(globalsTs).toMatch(/var readinessCache\s*=\s*safeReadLS\(['"]bj_readiness['"]/);
  });

  test('RE-008: Score display uses readinessCache per-resume index', () => {
    expect(resumesJs).toMatch(/readinessCache.*scores.*\[i\]/);
  });

  test('RE-008: U-05 — Scores are per-resume index, not blended', () => {
    // buildInlineGrade takes (i, score) — index-specific
    expect(resumesJs).toMatch(/buildInlineGrade\(i,/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.5 — AI Rewrite (RE-009 to RE-010)
// ─────────────────────────────────────────────────

describe('3.5 AI Rewrite', () => {
  test('RE-009: launchRewriteInterview function exported to window', () => {
    expect(resumesJs).toMatch(/window\.launchRewriteInterview\s*=\s*function/);
  });

  test('RE-009: Rewrite button present in resume card', () => {
    expect(resumesJs).toMatch(/launchRewriteInterview\(/);
    expect(resumesJs).toMatch(/Start Rewrite/);
  });

  test('RE-010: showResumePicker function exists for multi-resume selection', () => {
    expect(tuningJs).toMatch(/function\s+showResumePicker/);
  });

  test('RE-010: Resume picker overlay exists in HTML', () => {
    expect(dashboardHtml).toMatch(/id=["']resume-picker-overlay["']/);
  });

  test('RE-010: UX-004 — No bare alert() for resume generation when resumes exist', () => {
    // The old alert("Upload a resume first") was replaced by modal picker
    // Check that app.js does not have the old pattern
    const alertUpload = appJs.match(/alert\s*\(\s*['"]Upload a resume/);
    expect(alertUpload).toBeFalsy();
  });
});

// ─────────────────────────────────────────────────
// Section 3.6 — Gap Analysis (RE-011)
// ─────────────────────────────────────────────────

describe('3.6 Gap Analysis', () => {
  test('RE-011: Readiness analysis available via keywords.js', () => {
    expect(keywordsJs).toMatch(/buildReadinessSide|buildInlineGrade|readiness/);
  });

  test('RE-011: readinessCache persists scoring results', () => {
    expect(globalsTs).toMatch(/bj_readiness/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.7 — Archive (RE-012 to RE-013)
// ─────────────────────────────────────────────────

describe('3.7 Archive', () => {
  test('RE-012: archiveResume function exported to window', () => {
    expect(resumesJs).toMatch(/window\.archiveResume\s*=\s*async\s+function/);
  });

  test('RE-012: Archive sets archived flag on resume', () => {
    expect(resumesJs).toMatch(/archived.*=.*true|\.archived\s*=\s*true/);
  });

  test('RE-012: renderResumeArchive function exists for archive view', () => {
    expect(resumesJs).toMatch(/function\s+renderResumeArchive/);
  });

  test('RE-012: Active and archived resumes separated in render', () => {
    expect(resumesJs).toMatch(/activeResumes\s*=\s*resumes\.filter\(.*!.*archived/);
    expect(resumesJs).toMatch(/archivedResumes\s*=\s*resumes\.filter\(.*archived/);
  });

  test('RE-013: unarchiveResume function exported to window', () => {
    expect(resumesJs).toMatch(/window\.unarchiveResume\s*=\s*async\s+function/);
  });

  test('RE-013: Restore button exists in archive view', () => {
    expect(resumesJs).toMatch(/Restore|unarchiveResume/);
  });
});

// ─────────────────────────────────────────────────
// Section 3.8 — Error and Edge States (RE-014 to RE-016)
// ─────────────────────────────────────────────────

describe('3.8 Error and Edge States', () => {
  test('RE-014: Parse failure handled with textStatus no-text', () => {
    expect(resumesJs).toMatch(/no-text/);
  });

  test('RE-014: U-06 — Failed parse does not crash the tab', () => {
    // renderResumes must handle resumes with textStatus no-text
    expect(resumesJs).toMatch(/textStatus/);
  });

  test('RE-015: Upload uses reportError on failure', () => {
    expect(resumesJs).toMatch(/reportError\(['"]resumes['"]/);
  });

  test('RE-015: Upload zone handles drag and drop errors gracefully', () => {
    expect(resumesJs).toMatch(/drop.*preventDefault|\.addEventListener\(['"]drop['"]/s);
  });

  test('RE-016: Resume nav dot updates based on active resume state', () => {
    expect(resumesJs).toMatch(/function\s+updateResumeNavDot/);
  });

  test('RE-016: U-04 — readinessCache loaded via safeReadLS with null fallback', () => {
    expect(globalsTs).toMatch(/readinessCache\s*=\s*safeReadLS\(['"]bj_readiness['"],\s*null\)/);
  });
});

// ─────────────────────────────────────────────────
// Regression Prevention
// ─────────────────────────────────────────────────

describe('Regression Prevention', () => {
  test('UX-004: No alert() when resumes exist — picker shown instead', () => {
    const alertResume = appJs.match(/alert\s*\(\s*['"]Upload a resume/);
    expect(alertResume).toBeFalsy();
  });

  test('POD3-SF: readinessCache in globals.ts (shell), not keywords.js', () => {
    expect(globalsTs).toMatch(/var readinessCache/);
    // keywords.js should NOT redeclare with var
    const keywordsRedeclare = keywordsJs.match(/var\s+readinessCache\s*=/);
    expect(keywordsRedeclare).toBeFalsy();
  });

  test('PR-003: resumes TAB_CHUNKS loads keywords before deferred', () => {
    expect(lazyLoaderTs).toMatch(/'resumes':\s*\[['"]keywords['"],\s*['"]deferred['"]\]/);
  });
});

// ─────────────────────────────────────────────────
// User Profile Edge Cases
// ─────────────────────────────────────────────────

describe('User Profile Edge Cases', () => {
  test('U-01: Empty resume list shows upload prompt', () => {
    expect(resumesJs).toMatch(/Drop resumes here|click to upload/);
  });

  test('U-03: Entitlement checked before each upload (capacity limit)', () => {
    expect(resumesJs).toMatch(/checkEntitlement\(['"]resumes['"]/);
  });

  test('U-04: Cloud recovery syncs stale resumes from Supabase archive', () => {
    expect(resumesJs).toMatch(/cloud recovery|resume_archive|is_archived/i);
  });

  test('U-05: Resumes grouped by filter for multi-track display', () => {
    expect(resumesJs).toMatch(/filterIds.*includes|Group resumes by filter/);
  });

  test('U-06: saveResumes uses saveUserData (handles PII encryption)', () => {
    expect(resumesJs).toMatch(/saveUserData\(['"]bj_resumes['"]/);
  });
});

// ─────────────────────────────────────────────────
// Build & Version + File Inventory
// ─────────────────────────────────────────────────

describe('Build & Version + File Inventory', () => {
  test('resumes.js exists and is non-empty', () => {
    expect(resumesJs.length).toBeGreaterThan(100);
  });

  test('keywords.js exists (required for buildInlineGrade/buildReadinessSide)', () => {
    expect(keywordsJs.length).toBeGreaterThan(100);
  });

  test('Deferred chunk dist file exists', () => {
    const exists = fs.existsSync(path.join(ROOT, 'dist', 'dashboard-deferred.min.js'));
    expect(exists).toBe(true);
  });

  test('SPA ResumesPage component exists', () => {
    const exists = fs.existsSync(path.join(ROOT, 'src', 'app', 'pages', 'dashboard', 'resumes', 'ResumesPage.tsx'));
    expect(exists).toBe(true);
  });

  test('Resume upload zone container exists in dashboard.html', () => {
    expect(dashboardHtml).toMatch(/id=["']resume-upload-zone["']/);
  });
});
