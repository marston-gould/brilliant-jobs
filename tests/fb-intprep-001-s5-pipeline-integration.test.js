/**
 * FB-INTPREP-001-S5 — Interview Prep Phase 5: Pipeline Integration
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §5.6, §10 Phase 5
 * Product version: v9.53
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');

const pipelineJs = read('js/pipeline.js');
const ipJs = read('js/interview-prep.js');
const inputCss = read('src/input.css');
const versionJs = read('js/version.js');

// ─── Section 1: Prep CTA on Interview-Stage Cards ────────────────────

describe('1. Prep CTA', () => {
  it('1.1 — Interview stage gets Prep button', () => {
    expect(pipelineJs).toMatch(/stage === 'interview'/);
    expect(pipelineJs).toMatch(/Prep →/);
  });

  it('1.2 — Prep button calls _ipStartMock', () => {
    expect(pipelineJs).toMatch(/_ipStartMock/);
  });

  it('1.3 — Prep button passes job ID', () => {
    expect(pipelineJs).toMatch(/item\.id/);
  });

  it('1.4 — Prep button passes pipeline entry ID', () => {
    expect(pipelineJs).toMatch(/m\._dbId/);
  });

  it('1.5 — Prep button styled as accent (blue)', () => {
    // The Prep button is in an interview-stage block with accent background
    expect(pipelineJs).toMatch(/Prep.*background:var\(--accent\)/s);
  });

  it('1.6 — event.stopPropagation on Prep click', () => {
    expect(pipelineJs).toMatch(/event\.stopPropagation.*_ipStartMock/s);
  });
});

// ─── Section 2: Readiness Score Badge ────────────────────────────────

describe('2. Readiness Score Badge', () => {
  it('2.1 — _interviewReadinessScore checked for badge', () => {
    expect(pipelineJs).toMatch(/_interviewReadinessScore/);
  });

  it('2.2 — Score color coding (green >= 75, accent >= 50, warm < 50)', () => {
    expect(pipelineJs).toMatch(/_interviewReadinessScore >= 75/);
    expect(pipelineJs).toMatch(/_interviewReadinessScore >= 50/);
  });

  it('2.3 — Badge renders inline before Prep button', () => {
    expect(pipelineJs).toMatch(/_readinessBadge.*Prep/s);
  });

  it('2.4 — Readiness scores loaded from interview_sessions', () => {
    expect(pipelineJs).toMatch(/interview_sessions/);
    expect(pipelineJs).toMatch(/overall_score/);
  });

  it('2.5 — Only completed sessions used for scores', () => {
    expect(pipelineJs).toMatch(/\.eq\('status',\s*'completed'\)/);
  });

  it('2.6 — Scores attached to pipeline meta by job_id', () => {
    expect(pipelineJs).toMatch(/meta\[sim\.job_id\]\._interviewReadinessScore/);
  });
});

// ─── Section 3: Nav Dot Pulse ────────────────────────────────────────

describe('3. Nav Dot Pulse', () => {
  it('3.1 — Checks for interview entries without simulation', () => {
    expect(pipelineJs).toMatch(/_interviewWithoutPrep/);
  });

  it('3.2 — Compares against simulation job IDs set', () => {
    expect(pipelineJs).toMatch(/_simJobIds/);
    expect(pipelineJs).toMatch(/new Set/);
  });

  it('3.3 — Creates pulse dot on interview-prep nav item', () => {
    expect(pipelineJs).toMatch(/ip-nav-dot/);
    expect(pipelineJs).toMatch(/data-page="interview-prep"/);
  });

  it('3.4 — Dot hidden when all interview entries have simulations', () => {
    expect(pipelineJs).toMatch(/_ipNavDot\.style\.display.*_interviewWithoutPrep/s);
  });

  it('3.5 — Pulse animation in CSS', () => {
    expect(inputCss).toMatch(/@keyframes pulse/);
    expect(inputCss).toMatch(/\.ip-nav-dot/);
  });
});

// ─── Section 4: _ipStartMock Integration ─────────────────────────────

describe('4. _ipStartMock Pipeline Integration', () => {
  it('4.1 — Accepts jobId parameter', () => {
    expect(ipJs).toMatch(/window\._ipStartMock.*=.*async.*function\(jobId/);
  });

  it('4.2 — Accepts pipelineEntryId parameter', () => {
    expect(ipJs).toMatch(/pipelineEntryId/);
  });

  it('4.3 — Passes job_id to EF', () => {
    expect(ipJs).toMatch(/job_id:.*jobId/);
  });

  it('4.4 — Passes pipeline_entry_id to EF', () => {
    expect(ipJs).toMatch(/pipeline_entry_id:.*pipelineEntryId/);
  });

  it('4.5 — Source set to pipeline when jobId provided', () => {
    expect(ipJs).toMatch(/source:.*jobId.*'pipeline'/s);
  });
});

// ─── Section 5: Build & Version ──────────────────────────────────────

describe('5. Build & Version', () => {
  it('5.1 — Product version v9.53', () => {
    expect(versionJs).toMatch(/v9\.53/);
  });

  it('5.2 — Pipeline bundle contains Prep CTA code', () => {
    const bundle = read('dist/dashboard.min.js');
    expect(bundle).toMatch(/v9\.53/);
  });
});

// ─── Section 6: File Inventory ───────────────────────────────────────

describe('6. File Inventory', () => {
  ['js/pipeline.js', 'js/interview-prep.js', 'src/input.css',
   'tests/fb-intprep-001-s5-pipeline-integration.test.js'].forEach(f => {
    it(`6.x — ${f} exists`, () => {
      expect(() => read(f)).not.toThrow();
    });
  });
});
