/**
 * EXT-AS-4: Score Gate Popup + Resume Scoring — Validation Tests
 *
 * Validates:
 * 1. Score-resume EF: job_description_text direct path
 * 2. Background.ts: _scoreResumeForJob function + APPLY_INTERCEPTED mode routing
 * 3. Background.ts: bj:toolbar:applyConfirm handler
 * 4. ContentScript.ts: Score gate message bridge
 * 5. Job-site-overlay.ts: Score gate popup CSS, SVG, show/hide functions
 * 6. Job-site-overlay.ts: Window message listener for score gate
 * 7. Pod team manifest: EXT-AS-4 pairing
 * 8. Extension manifest: Version bump
 * 9. Build output + version
 */

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

// ─── File loaders ───
const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf-8');

const backgroundTs = read('extension/background.ts');
const contentScriptTs = read('extension/contentScript.ts');
const overlayTs = read('extension/job-site-overlay.ts');
const scoreResumeEf = read('supabase/functions/score-resume/index.ts');
const podManifest = read('docs/scaling/pod-team-manifest.md');
const manifestJson = read('extension/manifest.json');
const versionJs = read('js/version.js');

// ─── Section 1: Score-resume EF — Direct JD Text Path ───
console.log('\n1. Score-resume EF — Direct JD Text Path');

assert(
  scoreResumeEf.includes('job_description_text'),
  'score-resume EF accepts job_description_text parameter'
);
assert(
  scoreResumeEf.includes('directJobTitle') || scoreResumeEf.includes('job_title: directJobTitle'),
  'score-resume EF accepts direct job_title for extension path'
);
assert(
  scoreResumeEf.includes('directCompanyName') || scoreResumeEf.includes('company_name: directCompanyName'),
  'score-resume EF accepts direct company_name for extension path'
);
assert(
  scoreResumeEf.includes("job_description_text && mode === 'single'"),
  'Direct JD text path only activates for single mode'
);
assert(
  scoreResumeEf.includes("greenhouse_id: 'ext-direct'"),
  'Extension direct path uses ext-direct as placeholder greenhouse_id'
);

// ─── Section 2: Background.ts — _scoreResumeForJob Function ───
console.log('\n2. Background.ts — _scoreResumeForJob Function');

assert(
  backgroundTs.includes('async function _scoreResumeForJob'),
  '_scoreResumeForJob function exists'
);
assert(
  backgroundTs.includes('resume_archive') && backgroundTs.includes('extracted_text'),
  '_scoreResumeForJob fetches resume text from resume_archive'
);
assert(
  backgroundTs.includes("{ type: 'ats:extractJD' }"),
  '_scoreResumeForJob gets JD from content script via ats:extractJD'
);
assert(
  backgroundTs.includes('score-resume') && backgroundTs.includes('api-gateway'),
  '_scoreResumeForJob calls score-resume EF via gateway'
);
assert(
  backgroundTs.includes('job_description_text: jobDescription'),
  '_scoreResumeForJob passes JD text directly (extension path)'
);
assert(
  backgroundTs.includes("mode: 'single'") && backgroundTs.includes("tier: 'basic'"),
  '_scoreResumeForJob uses single mode + basic tier'
);
assert(
  backgroundTs.includes("captureEvent('score_resume_extension'"),
  '_scoreResumeForJob logs PostHog event'
);
assert(
  backgroundTs.includes('activeResumeId'),
  '_scoreResumeForJob reads active resume ID from applySettings'
);

// ─── Section 3: Background.ts — APPLY_INTERCEPTED Mode Routing ───
console.log('\n3. Background.ts — APPLY_INTERCEPTED Mode Routing');

assert(
  backgroundTs.includes("mode === 'score-gated' || mode === 'auto-score-gate'"),
  'APPLY_INTERCEPTED routes score-gated and auto-score-gate modes'
);
assert(
  backgroundTs.includes('_scoreResumeForJob(tabId, p)'),
  'Scoring modes call _scoreResumeForJob with tab ID and payload'
);
assert(
  backgroundTs.includes("type: 'bj:toolbar:scoreGate'"),
  'Scoring result sent to tab via bj:toolbar:scoreGate message'
);
assert(
  backgroundTs.includes("type: 'bj:toolbar:applyStatus'") && backgroundTs.includes("status: 'error'"),
  'Scoring failure sends applyStatus error to tab'
);
assert(
  backgroundTs.includes('isAboveThreshold') && backgroundTs.includes('score >= threshold'),
  'Threshold comparison logic present in APPLY_INTERCEPTED'
);
assert(
  backgroundTs.includes('gaps: scoreResult.gap_analysis || scoreResult.gaps'),
  'Gap analysis passed through to score gate message'
);
assert(
  backgroundTs.includes("sender?.tab?.id"),
  'Tab ID extracted from sender for message routing'
);

// ─── Section 4: Background.ts — bj:toolbar:applyConfirm Handler ───
console.log('\n4. Background.ts — bj:toolbar:applyConfirm Handler');

assert(
  backgroundTs.includes("msg.type === 'bj:toolbar:applyConfirm'"),
  'applyConfirm message handler exists'
);
assert(
  backgroundTs.includes("action === 'submit_anyway'") &&
  backgroundTs.includes("action === 'cancel'") &&
  backgroundTs.includes("action === 'rewrite'"),
  'All 3 action types handled (submit_anyway, cancel, rewrite)'
);
assert(
  backgroundTs.includes("captureEvent('score_gate_decision'"),
  'PostHog event logged for score gate decisions'
);
assert(
  backgroundTs.includes("status: 'filling'") && backgroundTs.includes("action: 'submit_anyway'"),
  'Submit Anyway sends filling status to tab'
);
assert(
  backgroundTs.includes("status: 'rewrite_pending'"),
  'Rewrite sends rewrite_pending status to tab (EXT-AS-5 stub)'
);

// ─── Section 5: ContentScript.ts — Score Gate Message Bridge ───
console.log('\n5. ContentScript.ts — Score Gate Message Bridge');

assert(
  contentScriptTs.includes("msg.type === 'bj:toolbar:scoreGate'"),
  'Content script handles bj:toolbar:scoreGate message'
);
assert(
  contentScriptTs.includes("msg.type === 'bj:toolbar:applyStatus'"),
  'Content script handles bj:toolbar:applyStatus message'
);
assert(
  contentScriptTs.includes("source: 'bj-extension'"),
  'Bridge uses bj-extension source tag for identification'
);
assert(
  contentScriptTs.includes('window.postMessage('),
  'Bridge relays messages via window.postMessage'
);

// ─── Section 6: Job-site-overlay.ts — Score Gate Popup CSS ───
console.log('\n6. Job-site-overlay.ts — Score Gate Popup CSS');

assert(
  overlayTs.includes('.bj-score-gate-overlay'),
  'Score gate overlay CSS class exists'
);
assert(
  overlayTs.includes('.bj-score-gate {'),
  'Score gate popup container CSS exists'
);
assert(
  overlayTs.includes('.bj-sg-ring-wrap'),
  'Score ring wrapper CSS exists'
);
assert(
  overlayTs.includes('.bj-sg-btn.primary'),
  'Primary action button CSS exists'
);
assert(
  overlayTs.includes('.bj-sg-btn.secondary'),
  'Secondary action button CSS exists'
);
assert(
  overlayTs.includes('.bj-sg-btn.ghost'),
  'Ghost (cancel) button CSS exists'
);
assert(
  overlayTs.includes('.bj-sg-gaps'),
  'Gap analysis section CSS exists'
);
assert(
  overlayTs.includes('@keyframes bjFadeIn'),
  'Fade-in animation keyframes present'
);
assert(
  overlayTs.includes('.bj-sg-header.above'),
  'Above-threshold green header CSS exists'
);

// ─── Section 7: Job-site-overlay.ts — Score Ring SVG ───
console.log('\n7. Job-site-overlay.ts — Score Ring SVG');

assert(
  overlayTs.includes('function buildScoreRingSVG(score, size)'),
  'buildScoreRingSVG function exists'
);
assert(
  overlayTs.includes('circumference') && overlayTs.includes('dashOffset'),
  'SVG uses proper circumference + dash-offset calculation'
);
assert(
  overlayTs.includes("score >= 75 ? '#16a34a'") &&
  overlayTs.includes("score >= 60 ? '#f59e0b'") &&
  overlayTs.includes("'#dc2626'"),
  'Score ring has 3-tier color coding: green (>=75), amber (60-74), red (<60)'
);

// ─── Section 8: Job-site-overlay.ts — Score Gate Popup Functions ───
console.log('\n8. Job-site-overlay.ts — Score Gate Popup Functions');

assert(
  overlayTs.includes('function showScoreGatePopup(data)'),
  'showScoreGatePopup function exists'
);
assert(
  overlayTs.includes('function hideScoreGatePopup()'),
  'hideScoreGatePopup function exists'
);
assert(
  overlayTs.includes('_scoreGateActive'),
  'Score gate active state tracked'
);
assert(
  overlayTs.includes('bj-sg-rewrite-btn'),
  'Rewrite button present in popup'
);
assert(
  overlayTs.includes('bj-sg-submit-btn'),
  'Submit Anyway button present in popup'
);
assert(
  overlayTs.includes('bj-sg-cancel-btn'),
  'Cancel button present in popup'
);
assert(
  overlayTs.includes('Auto-submitting in 3 seconds'),
  'Above-threshold auto-dismiss countdown displayed'
);
assert(
  overlayTs.includes('_autoDismissTimer') && overlayTs.includes('setTimeout') && overlayTs.includes('3000'),
  'Auto-dismiss timer set to 3 seconds for above-threshold'
);
assert(
  overlayTs.includes('points below threshold') && overlayTs.includes('points above threshold'),
  'Threshold difference badge shows both below and above text'
);
assert(
  overlayTs.includes("_sendConfirm('cancel'") &&
  overlayTs.includes("_sendConfirm('submit_anyway'") &&
  overlayTs.includes("_sendConfirm('rewrite'"),
  'All 3 confirm actions wired to buttons'
);
assert(
  overlayTs.includes("function _escText(str)"),
  'Text escaping function exists for XSS prevention'
);

// ─── Section 9: Job-site-overlay.ts — Window Message Listener ───
console.log('\n9. Job-site-overlay.ts — Window Message Listener');

assert(
  overlayTs.includes("window.addEventListener('message'"),
  'Window message listener exists'
);
assert(
  overlayTs.includes("evt.data.source !== 'bj-extension'"),
  'Message listener filters by bj-extension source'
);
assert(
  overlayTs.includes("evt.data.type === 'bj:toolbar:scoreGate'"),
  'Listener handles scoreGate messages'
);
assert(
  overlayTs.includes("evt.data.type === 'bj:toolbar:applyStatus'"),
  'Listener handles applyStatus messages'
);
assert(
  overlayTs.includes('showScoreGatePopup(p)'),
  'scoreGate message triggers showScoreGatePopup'
);

// ─── Section 10: Job-site-overlay.ts — Exports ───
console.log('\n10. Job-site-overlay.ts — Exports');

assert(
  overlayTs.includes('showScoreGatePopup: showScoreGatePopup'),
  'showScoreGatePopup exported for testing'
);
assert(
  overlayTs.includes('hideScoreGatePopup: hideScoreGatePopup'),
  'hideScoreGatePopup exported for testing'
);
assert(
  overlayTs.includes('buildScoreRingSVG: buildScoreRingSVG'),
  'buildScoreRingSVG exported for testing'
);
assert(
  overlayTs.includes('isScoreGateActive'),
  'isScoreGateActive exported for testing'
);

// ─── Section 11: Pod Team Manifest ───
console.log('\n11. Pod Team Manifest');

assert(
  podManifest.includes('EXT-AS-4'),
  'EXT-AS-4 pairing present in pod-team-manifest.md'
);
assert(
  podManifest.includes('Chief Architect') &&
  podManifest.includes('Lead Platform Engineer') &&
  podManifest.includes('System Architect') &&
  podManifest.includes('Forward-Looking Developer') &&
  podManifest.includes('Evolvability Strategist'),
  'All 5 hook-and-scar roles present in pod-team-manifest.md'
);

// ─── Section 12: Extension Manifest Version ───
console.log('\n12. Extension Manifest Version');

const manifest = JSON.parse(manifestJson);
assert(manifest.version === '2.25.0', 'Extension manifest version bumped to 2.25.0');

// ─── Section 13: Build Output + Version ───
console.log('\n13. Build Output + Version');

assert(versionJs.includes('v8.66'), 'Product version is v8.66');

const dashMinExists = fs.existsSync(path.join(ROOT, 'dist/dashboard.min.js'));
assert(dashMinExists, 'dist/dashboard.min.js exists (rebuilt)');

const dashDeferredExists = fs.existsSync(path.join(ROOT, 'dist/dashboard-deferred.min.js'));
assert(dashDeferredExists, 'dist/dashboard-deferred.min.js exists (rebuilt)');

const stylesExists = fs.existsSync(path.join(ROOT, 'styles.css'));
assert(stylesExists, 'styles.css exists (Tailwind rebuild)');

// ─── Section 14: File Inventory ───
console.log('\n14. File Inventory');

const expectedFiles = [
  'extension/job-site-overlay.ts',
  'extension/background.ts',
  'extension/contentScript.ts',
  'extension/manifest.json',
  'supabase/functions/score-resume/index.ts',
  'docs/scaling/pod-team-manifest.md',
  'tests/ext-as-4-score-gate.test.js',
];

expectedFiles.forEach(f => {
  assert(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
});

// ─── Summary ───
console.log(`\n${'='.repeat(50)}`);
console.log(`EXT-AS-4 Score Gate Popup: ${passed} passed, ${failed} failed`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
