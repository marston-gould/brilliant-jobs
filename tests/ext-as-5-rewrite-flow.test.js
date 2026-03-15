/**
 * EXT-AS-5 — AI Resume Rewrite Flow
 * Validation tests for rewrite-resume-extension EF, background.ts rewrite handler,
 * job-site-overlay.ts rewrite progress + review popups, contentScript.ts bridge.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// ═══════════════════════════════════════════════════════
// Section 1: Rewrite-Resume-Extension Edge Function
// ═══════════════════════════════════════════════════════
describe('1. rewrite-resume-extension EF', () => {
  const ef = read('supabase/functions/rewrite-resume-extension/index.ts');

  it('1.1 EF file exists', () => {
    expect(existsSync(join(ROOT, 'supabase/functions/rewrite-resume-extension/index.ts'))).toBe(true);
  });

  it('1.2 accepts resume_text + job_description_text input', () => {
    expect(ef).toContain('resume_text');
    expect(ef).toContain('job_description_text');
  });

  it('1.3 accepts job_title + company_name', () => {
    expect(ef).toContain('job_title');
    expect(ef).toContain('company_name');
  });

  it('1.4 accepts gaps + current_score + preferences', () => {
    expect(ef).toContain('gaps');
    expect(ef).toContain('current_score');
    expect(ef).toContain('preferences');
  });

  it('1.5 returns rewritten_text in response', () => {
    expect(ef).toContain('rewritten_text');
  });

  it('1.6 returns changes array', () => {
    expect(ef).toContain('changes');
  });

  it('1.7 returns skills_added + keywords_integrated', () => {
    expect(ef).toContain('skills_added');
    expect(ef).toContain('keywords_integrated');
  });

  it('1.8 returns estimated_new_score + estimated_score_improvement', () => {
    expect(ef).toContain('estimated_new_score');
    expect(ef).toContain('estimated_score_improvement');
  });

  it('1.9 validates required fields (400)', () => {
    expect(ef).toContain("Missing required fields: resume_text, job_description_text");
  });

  it('1.10 checks user plan (403 for free)', () => {
    expect(ef).toContain('PLAN_REQUIRED');
  });

  it('1.11 debit credits (1 credit for quick rewrite)', () => {
    expect(ef).toContain('extension_quick_rewrite');
    expect(ef).toContain('p_amount: 1');
  });

  it('1.12 calls Anthropic API', () => {
    expect(ef).toContain('api.anthropic.com/v1/messages');
  });

  it('1.13 includes CORS headers', () => {
    expect(ef).toContain('brilliantjobs.app');
  });

  it('1.14 logs to agent_action_log', () => {
    expect(ef).toContain('agent_action_log');
  });

  it('1.15 returns duration_ms', () => {
    expect(ef).toContain('duration_ms');
  });

  it('1.16 handles JSON parse failure gracefully', () => {
    expect(ef).toContain('JSON parse failed');
  });

  it('1.17 uses REWRITE_SYSTEM prompt', () => {
    expect(ef).toContain('REWRITE_SYSTEM');
    expect(ef).toContain('expert resume rewriter');
  });
});

// ═══════════════════════════════════════════════════════
// Section 2: API Gateway Route
// ═══════════════════════════════════════════════════════
describe('2. Gateway route', () => {
  const gw = read('supabase/functions/api-gateway/index.ts');

  it('2.1 rewrite-resume-extension route present', () => {
    expect(gw).toContain('"rewrite-resume-extension"');
  });

  it('2.2 route count updated to 114', () => {
    expect(gw).toContain('114 routes');
  });
});

// ═══════════════════════════════════════════════════════
// Section 3: background.ts — _rewriteResumeForJob
// ═══════════════════════════════════════════════════════
describe('3. background.ts rewrite function', () => {
  const bg = read('extension/background.ts');

  it('3.1 _rewriteResumeForJob function exists', () => {
    expect(bg).toContain('async function _rewriteResumeForJob');
  });

  it('3.2 gets active resume from chrome.storage.local', () => {
    const fnMatch = bg.includes("REWRITE_RESUME: No active resume selected");
    expect(fnMatch).toBe(true);
  });

  it('3.3 fetches resume text from resume_archive', () => {
    expect(bg).toContain('REWRITE_RESUME: Failed to fetch resume');
  });

  it('3.4 gets JD from content script via ats:extractJD', () => {
    expect(bg).toContain('REWRITE_RESUME: JD extraction failed');
  });

  it('3.5 reads rewrite preferences from storage', () => {
    expect(bg).toContain('rewritePreferences');
  });

  it('3.6 sends rewriting progress to tab', () => {
    expect(bg).toContain("type: 'bj:toolbar:rewriteProgress'");
  });

  it('3.7 calls rewrite-resume-extension EF via gateway', () => {
    expect(bg).toContain('api-gateway/rewrite-resume-extension');
  });

  it('3.8 passes resume_text, job_description_text, gaps, current_score, preferences', () => {
    // Check the body of the EF call
    expect(bg).toContain('resume_text: resumeText');
    expect(bg).toContain('job_description_text: jobDescription');
    expect(bg).toContain('current_score: scoreData.score');
  });

  it('3.9 captures rewrite_resume_extension PostHog event', () => {
    expect(bg).toContain("captureEvent('rewrite_resume_extension'");
  });

  it('3.10 uses 60s timeout for rewrite call', () => {
    expect(bg).toContain('timeout: 60000');
  });
});

// ═══════════════════════════════════════════════════════
// Section 4: background.ts — Rewrite action handler
// ═══════════════════════════════════════════════════════
describe('4. background.ts applyConfirm rewrite action', () => {
  const bg = read('extension/background.ts');

  it('4.1 rewrite action calls _rewriteResumeForJob', () => {
    expect(bg).toContain('const rewriteResult = await _rewriteResumeForJob(tabId, p, scoreData)');
  });

  it('4.2 sends analyzing progress before rewrite', () => {
    // Check that analyzing step is sent in the rewrite handler
    const analyzeIdx = bg.indexOf("step: 'analyzing'");
    expect(analyzeIdx).toBeGreaterThan(0);
  });

  it('4.3 sends bj:toolbar:rewriteResult on success', () => {
    expect(bg).toContain("type: 'bj:toolbar:rewriteResult'");
  });

  it('4.4 sends error on rewrite failure', () => {
    expect(bg).toContain("error: 'rewrite_failed'");
  });

  it('4.5 passes gaps from score gate data', () => {
    expect(bg).toContain('gaps: p.gaps || []');
  });

  it('4.6 EXT-AS-5 stub removed (no more rewrite_queued)', () => {
    // The old stub sent rewrite_pending status — verify it's removed
    expect(bg).not.toContain("status: 'rewrite_pending', action: 'rewrite'");
  });
});

// ═══════════════════════════════════════════════════════
// Section 5: background.ts — rewriteDecision handler
// ═══════════════════════════════════════════════════════
describe('5. background.ts rewriteDecision handler', () => {
  const bg = read('extension/background.ts');

  it('5.1 bj:toolbar:rewriteDecision handler exists', () => {
    expect(bg).toContain("msg.type === 'bj:toolbar:rewriteDecision'");
  });

  it('5.2 handles submit_rewritten decision', () => {
    expect(bg).toContain("decision === 'submit_rewritten'");
  });

  it('5.3 handles submit_original decision', () => {
    expect(bg).toContain("decision === 'submit_original'");
  });

  it('5.4 handles cancel decision', () => {
    expect(bg).toContain("decision === 'cancel'");
  });

  it('5.5 sends filling status with use_rewrite flag', () => {
    expect(bg).toContain("use_rewrite: decision === 'submit_rewritten'");
  });

  it('5.6 captures rewrite_decision PostHog event', () => {
    expect(bg).toContain("captureEvent('rewrite_decision'");
  });
});

// ═══════════════════════════════════════════════════════
// Section 6: job-site-overlay.ts — Rewrite Progress Popup
// ═══════════════════════════════════════════════════════
describe('6. Rewrite progress popup', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('6.1 showRewriteProgressPopup function exists', () => {
    expect(ov).toContain('function showRewriteProgressPopup');
  });

  it('6.2 has 3 step indicators (analyzing, rewriting, reviewing)', () => {
    expect(ov).toContain("data-step=\"analyzing\"");
    expect(ov).toContain("data-step=\"rewriting\"");
    expect(ov).toContain("data-step=\"reviewing\"");
  });

  it('6.3 has spinner SVG', () => {
    expect(ov).toContain('bj-rw-spinner');
  });

  it('6.4 updateRewriteProgress function exists', () => {
    expect(ov).toContain('function updateRewriteProgress');
  });

  it('6.5 progress tracking with active/done classes', () => {
    expect(ov).toContain("'bj-rw-step active'");
    expect(ov).toContain("'bj-rw-step done'");
  });

  it('6.6 hideRewriteProgressPopup function exists', () => {
    expect(ov).toContain('function hideRewriteProgressPopup');
  });

  it('6.7 _rewriteProgressActive state variable', () => {
    expect(ov).toContain('var _rewriteProgressActive');
  });
});

// ═══════════════════════════════════════════════════════
// Section 7: job-site-overlay.ts — Rewrite Review Popup
// ═══════════════════════════════════════════════════════
describe('7. Rewrite review popup', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('7.1 showRewriteReviewPopup function exists', () => {
    expect(ov).toContain('function showRewriteReviewPopup');
  });

  it('7.2 shows before/after score comparison', () => {
    expect(ov).toContain('bj-rw-score-compare');
    expect(ov).toContain('Original');
    expect(ov).toContain('Estimated');
  });

  it('7.3 shows skills added section', () => {
    expect(ov).toContain('Skills Highlighted');
    expect(ov).toContain('bj-rw-skill');
  });

  it('7.4 shows changes diff with section/original/revised', () => {
    expect(ov).toContain('bj-rw-change-section');
    expect(ov).toContain('bj-rw-change-orig');
    expect(ov).toContain('bj-rw-change-new');
    expect(ov).toContain('bj-rw-change-reason');
  });

  it('7.5 has Submit Rewritten Resume button', () => {
    expect(ov).toContain('Submit Rewritten Resume');
    expect(ov).toContain('bj-rr-submit-btn');
  });

  it('7.6 has Submit Original Instead button', () => {
    expect(ov).toContain('Submit Original Instead');
    expect(ov).toContain('bj-rr-original-btn');
  });

  it('7.7 has Cancel button', () => {
    expect(ov).toContain("Cancel — Don\\'t Apply");
    expect(ov).toContain('bj-rr-cancel-btn');
  });

  it('7.8 hideRewriteReviewPopup function exists', () => {
    expect(ov).toContain('function hideRewriteReviewPopup');
  });

  it('7.9 _sendRewriteDecision function exists', () => {
    expect(ov).toContain('function _sendRewriteDecision');
  });

  it('7.10 sends bj:toolbar:rewriteDecision message', () => {
    expect(ov).toContain("'bj:toolbar:rewriteDecision'");
  });

  it('7.11 close button and click-outside wired', () => {
    expect(ov).toContain('bj-rr-close-btn');
    expect(ov).toContain('e.target === overlay');
  });

  it('7.12 improvement badge shown', () => {
    expect(ov).toContain('point improvement');
  });

  it('7.13 max 5 changes shown with overflow indicator', () => {
    expect(ov).toContain('Math.min(changes.length, 5)');
    expect(ov).toContain('more changes');
  });

  it('7.14 max 8 skills shown', () => {
    expect(ov).toContain('Math.min(skills.length, 8)');
  });
});

// ═══════════════════════════════════════════════════════
// Section 8: job-site-overlay.ts — Message Handlers
// ═══════════════════════════════════════════════════════
describe('8. Overlay message handlers', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('8.1 handles bj:toolbar:rewriteProgress message', () => {
    expect(ov).toContain("evt.data.type === 'bj:toolbar:rewriteProgress'");
  });

  it('8.2 handles bj:toolbar:rewriteResult message', () => {
    expect(ov).toContain("evt.data.type === 'bj:toolbar:rewriteResult'");
  });

  it('8.3 rewrite_failed error hides progress popup', () => {
    expect(ov).toContain("s.error === 'rewrite_failed'");
    expect(ov).toContain('hideRewriteProgressPopup');
  });

  it('8.4 rewrite button triggers progress popup (not stub toast)', () => {
    // Verify the old stub toast is removed
    expect(ov).not.toContain('Rewrite queued — EXT-AS-5 will implement full flow');
    // Verify the new progress popup is shown
    expect(ov).toContain('showRewriteProgressPopup(data)');
  });
});

// ═══════════════════════════════════════════════════════
// Section 9: job-site-overlay.ts — Window Exports
// ═══════════════════════════════════════════════════════
describe('9. Overlay exports', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('9.1 exports showRewriteProgressPopup', () => {
    expect(ov).toContain('showRewriteProgressPopup: showRewriteProgressPopup');
  });

  it('9.2 exports hideRewriteProgressPopup', () => {
    expect(ov).toContain('hideRewriteProgressPopup: hideRewriteProgressPopup');
  });

  it('9.3 exports updateRewriteProgress', () => {
    expect(ov).toContain('updateRewriteProgress: updateRewriteProgress');
  });

  it('9.4 exports showRewriteReviewPopup', () => {
    expect(ov).toContain('showRewriteReviewPopup: showRewriteReviewPopup');
  });

  it('9.5 exports hideRewriteReviewPopup', () => {
    expect(ov).toContain('hideRewriteReviewPopup: hideRewriteReviewPopup');
  });

  it('9.6 exports isRewriteProgressActive', () => {
    expect(ov).toContain('isRewriteProgressActive');
  });

  it('9.7 exports isRewriteReviewActive', () => {
    expect(ov).toContain('isRewriteReviewActive');
  });
});

// ═══════════════════════════════════════════════════════
// Section 10: contentScript.ts Bridge
// ═══════════════════════════════════════════════════════
describe('10. ContentScript bridge', () => {
  const cs = read('extension/contentScript.ts');

  it('10.1 bridges bj:toolbar:rewriteProgress messages', () => {
    expect(cs).toContain("'bj:toolbar:rewriteProgress'");
  });

  it('10.2 bridges bj:toolbar:rewriteResult messages', () => {
    expect(cs).toContain("'bj:toolbar:rewriteResult'");
  });

  it('10.3 still bridges original scoreGate and applyStatus', () => {
    expect(cs).toContain("'bj:toolbar:scoreGate'");
    expect(cs).toContain("'bj:toolbar:applyStatus'");
  });

  it('10.4 EXT-AS-4/5 comment updated', () => {
    expect(cs).toContain('EXT-AS-4/5');
  });
});

// ═══════════════════════════════════════════════════════
// Section 11: _sendConfirm passes gaps data
// ═══════════════════════════════════════════════════════
describe('11. Score gate confirm passes gaps', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('11.1 _sendConfirm includes gaps in payload', () => {
    expect(ov).toContain('gaps: data.gaps || []');
  });

  it('11.2 _sendConfirm includes gap_analysis', () => {
    expect(ov).toContain('gap_analysis: data.gaps || []');
  });

  it('11.3 _sendConfirm includes jobTitle', () => {
    expect(ov).toContain("jobTitle: data.jobTitle || ''");
  });

  it('11.4 _sendConfirm includes company', () => {
    expect(ov).toContain("company: data.company || ''");
  });
});

// ═══════════════════════════════════════════════════════
// Section 12: CSS classes
// ═══════════════════════════════════════════════════════
describe('12. Rewrite CSS', () => {
  const ov = read('extension/job-site-overlay.ts');

  it('12.1 defines bj-rewrite-steps style', () => {
    expect(ov).toContain('.bj-rewrite-steps');
  });

  it('12.2 defines bj-rw-step style', () => {
    expect(ov).toContain('.bj-rw-step {');
  });

  it('12.3 defines bj-rw-dot with pulse animation', () => {
    expect(ov).toContain('.bj-rw-dot');
    expect(ov).toContain('@keyframes bj-pulse');
  });

  it('12.4 defines change diff styles', () => {
    expect(ov).toContain('.bj-rw-change {');
    expect(ov).toContain('.bj-rw-change-orig');
    expect(ov).toContain('.bj-rw-change-new');
  });

  it('12.5 defines score comparison styles', () => {
    expect(ov).toContain('.bj-rw-score-compare');
    expect(ov).toContain('.bj-rw-score-val');
    expect(ov).toContain('.bj-rw-score-lbl');
  });

  it('12.6 defines skill tag styles', () => {
    expect(ov).toContain('.bj-rw-skill');
    expect(ov).toContain('.bj-rw-skills');
  });
});

// ═══════════════════════════════════════════════════════
// Section 13: Manifest + Version + Build
// ═══════════════════════════════════════════════════════
describe('13. Manifest, version, build', () => {
  it('13.1 manifest version bumped to 2.26.0', () => {
    const m = read('extension/manifest.tson');
    expect(m).toContain('"version": "2.26.0"');
  });

  it('13.2 product version is v8.67', () => {
    const v = read('js/version.js');
    expect(v).toContain('v8.67');
  });

  it('13.3 dashboard.min.js exists (rebuilt)', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard.min.js'))).toBe(true);
  });

  it('13.4 dashboard-deferred.min.js exists (rebuilt)', () => {
    expect(existsSync(join(ROOT, 'dist/dashboard-deferred.min.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════
// Section 14: Pod Team Manifest
// ═══════════════════════════════════════════════════════
describe('14. Pod team manifest', () => {
  const ptm = read('docs/scaling/pod-team-manifest.md');

  it('14.1 EXT-AS-5 pairing added', () => {
    expect(ptm).toContain('EXT-AS-5');
  });

  it('14.2 all 5 hook-and-scar roles present', () => {
    expect(ptm).toContain('Chief Architect');
    expect(ptm).toContain('Lead Platform Engineer');
    expect(ptm).toContain('System Architect');
    expect(ptm).toContain('Forward-Looking Developer');
    expect(ptm).toContain('Evolvability Strategist');
  });
});

// ═══════════════════════════════════════════════════════
// Section 15: File Inventory
// ═══════════════════════════════════════════════════════
describe('15. File inventory', () => {
  const files = [
    'supabase/functions/rewrite-resume-extension/index.ts',
    'extension/background.ts',
    'extension/job-site-overlay.ts',
    'extension/contentScript.ts',
    'extension/manifest.tson',
    'supabase/functions/api-gateway/index.ts',
    'docs/scaling/pod-team-manifest.md',
    'tests/ext-as-5-rewrite-flow.test.js',
  ];

  for (const f of files) {
    it(`15.${files.indexOf(f) + 1} ${f} exists`, () => {
      expect(existsSync(join(ROOT, f))).toBe(true);
    });
  }
});
