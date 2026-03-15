/**
 * FB-INTPREP-001-S6 — Interview Prep Phase 6: Feature Gating + Polish
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §8, §9, §10 Phase 6
 * Product version: v9.54
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');

const ipJs = read('js/interview-prep.js');
const versionJs = read('js/version.js');

// ─── Section 1: Question Bank Gating ─────────────────────────────────

describe('1. Question Bank Tier Gating', () => {
  it('1.1 — Checks getUserTier for Pro status', () => {
    expect(ipJs).toMatch(/getUserTier.*===.*'pro'/);
  });

  it('1.2 — FREE_QUESTION_LIMIT = 5', () => {
    expect(ipJs).toMatch(/FREE_QUESTION_LIMIT\s*=\s*5/);
  });

  it('1.3 — Blur applied to gated questions', () => {
    expect(ipJs).toMatch(/filter:blur\(4px\)/);
    expect(ipJs).toMatch(/pointer-events:none/);
  });

  it('1.4 — isGated flag based on index vs limit', () => {
    expect(ipJs).toMatch(/isGated.*!_isPro.*idx >= FREE_QUESTION_LIMIT/);
  });

  it('1.5 — Upgrade banner shown after free limit', () => {
    expect(ipJs).toMatch(/Upgrade to Pro for full access/);
    expect(ipJs).toMatch(/more questions available with Pro/);
  });

  it('1.6 — Upgrade button navigates to subscription', () => {
    expect(ipJs).toMatch(/showPage.*subscription/);
  });
});

// ─── Section 2: Bookmark Gating ──────────────────────────────────────

describe('2. Bookmark Gating', () => {
  it('2.1 — Bookmark buttons only shown for Pro users', () => {
    // The bookmark button is wrapped in _isPro conditional
    expect(ipJs).toMatch(/_isPro.*ip-bookmark-btn/s);
  });

  it('2.2 — Free users cannot see bookmark icons', () => {
    // The ternary wraps the entire bookmark div
    expect(ipJs).toMatch(/_isPro \? '<div/);
  });
});

// ─── Section 3: Simulation Session Gating ────────────────────────────

describe('3. Simulation Session Gating', () => {
  it('3.1 — Free session counter in localStorage', () => {
    expect(ipJs).toMatch(/bj_ip_free_sessions_used/);
  });

  it('3.2 — Gate at 1 free session', () => {
    expect(ipJs).toMatch(/_freeUsed >= 1/);
  });

  it('3.3 — Toast shown when gate hit', () => {
    expect(ipJs).toMatch(/free interview session has been used/);
  });

  it('3.4 — Counter incremented after successful start', () => {
    expect(ipJs).toMatch(/localStorage\.setItem\('bj_ip_free_sessions_used'/);
  });

  it('3.5 — Pro users bypass session gate', () => {
    expect(ipJs).toMatch(/if \(!_isPro\).*_freeUsed/s);
  });

  it('3.6 — simulation_gate_hit PostHog event', () => {
    expect(ipJs).toMatch(/simulation_gate_hit/);
  });
});

// ─── Section 4: Pipeline CTA Gating ─────────────────────────────────

describe('4. Pipeline CTA Gating', () => {
  it('4.1 — Pipeline Prep button calls _ipStartMock which has gate', () => {
    // The gate is inside _ipStartMock, not in the pipeline HTML
    expect(ipJs).toMatch(/window\._ipStartMock.*=.*async.*function/);
    expect(ipJs).toMatch(/getUserTier/);
    expect(ipJs).toMatch(/_freeUsed >= 1/);
  });

  it('4.2 — CTA visible for all users (gating is functional, not visual)', () => {
    const pipelineJs = read('js/pipeline.js');
    // The Prep button renders for all interview-stage entries
    expect(pipelineJs).toMatch(/stage === 'interview'.*Prep/s);
  });
});

// ─── Section 5: PostHog Events ───────────────────────────────────────

describe('5. PostHog Events (§8 complete)', () => {
  it('5.1 — pipeline_prep_cta_clicked event', () => {
    expect(ipJs).toMatch(/pipeline_prep_cta_clicked/);
  });

  it('5.2 — pipeline_prep_cta_clicked includes pipeline_entry_id', () => {
    expect(ipJs).toMatch(/pipeline_entry_id.*pipelineEntryId/);
  });

  it('5.3 — pipeline_prep_cta_clicked includes job_id', () => {
    expect(ipJs).toMatch(/job_id:.*jobId/);
  });

  it('5.4 — simulation_gate_hit event for free users', () => {
    expect(ipJs).toMatch(/simulation_gate_hit/);
    expect(ipJs).toMatch(/sessions_used/);
  });

  // Verify all 10 spec events exist across the codebase
  const allEvents = [
    'interview_prep_page_viewed',
    'question_bank_searched',
    'question_bookmarked',
    'simulation_started',
    'simulation_message_sent',
    'simulation_completed',
    'simulation_abandoned',
    'simulation_hint_requested',
    'scorecard_viewed',
    'pipeline_prep_cta_clicked',
  ];
  allEvents.forEach(function(event) {
    it('5.x — ' + event + ' event exists', () => {
      // Check interview-prep.js + interview-simulate EF
      var efCode = '';
      try { efCode = read('supabase/functions/interview-simulate/index.ts'); } catch(_e) { /* ok */ }
      var combined = ipJs + efCode;
      expect(combined).toMatch(new RegExp(event));
    });
  });
});

// ─── Section 6: Build & Version ──────────────────────────────────────

describe('6. Build & Version', () => {
  it('6.1 — Product version v9.54', () => {
    expect(versionJs).toMatch(/v9\.54/);
  });

  it('6.2 — Deferred bundle contains gating code', () => {
    const bundle = read('dist/dashboard-deferred.min.js');
    expect(bundle).toMatch(/FREE_QUESTION_LIMIT/);
    expect(bundle).toMatch(/bj_ip_free_sessions_used/);
  });
});

// ─── Section 7: File Inventory ───────────────────────────────────────

describe('7. File Inventory', () => {
  ['js/interview-prep.js', 'tests/fb-intprep-001-s6-feature-gating.test.js'].forEach(function(f) {
    it('7.x — ' + f + ' exists', () => {
      expect(() => read(f)).not.toThrow();
    });
  });
});
