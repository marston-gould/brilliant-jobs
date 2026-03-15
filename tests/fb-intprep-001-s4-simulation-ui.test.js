/**
 * FB-INTPREP-001-S4 — Interview Prep Phase 4: Simulation UI
 *
 * Spec: FB-INTPREP-001_InterviewPrep.docx §5.4, §5.5, §10 Phase 4
 * Product version: v9.52
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const read = f => readFileSync(join(ROOT, f), 'utf-8');
const exists = f => existsSync(join(ROOT, f));

const dashboardHtml = read('dashboard.html');
const ipJs = read('js/interview-prep.js');
const inputCss = read('src/input.css');
const versionJs = read('js/version.js');

// ─── Section 1: Simulation Modal HTML ────────────────────────────────

describe('1. Simulation Modal', () => {
  it('1.1 — Overlay container exists', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-overlay"/);
  });

  it('1.2 — Modal container exists', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-modal"/);
  });

  it('1.3 — Top bar with title and progress', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-title"/);
    expect(dashboardHtml).toMatch(/id="ip-sim-progress"/);
  });

  it('1.4 — Chat area', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-chat"/);
  });

  it('1.5 — Input area with textarea and send button', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-input"/);
    expect(dashboardHtml).toMatch(/id="ip-sim-send"/);
  });

  it('1.6 — Feedback toggle checkbox', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-feedback-toggle"/);
  });

  it('1.7 — Hint button', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-hint-btn"/);
    expect(dashboardHtml).toMatch(/_ipRequestHint/);
  });

  it('1.8 — End Early button', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-end-btn"/);
    expect(dashboardHtml).toMatch(/_ipEndEarly/);
  });

  it('1.9 — Close button', () => {
    expect(dashboardHtml).toMatch(/_ipCloseSimulation/);
  });

  it('1.10 — Scorecard area (hidden by default)', () => {
    expect(dashboardHtml).toMatch(/id="ip-sim-scorecard"/);
    expect(dashboardHtml).toMatch(/display:none/);
  });
});

// ─── Section 2: My Sessions Tab ──────────────────────────────────────

describe('2. My Sessions Tab', () => {
  it('2.1 — Sessions list container', () => {
    expect(dashboardHtml).toMatch(/id="ip-sessions-list"/);
  });

  it('2.2 — Start Mock Interview button', () => {
    expect(dashboardHtml).toMatch(/id="ip-start-mock"/);
    expect(dashboardHtml).toMatch(/_ipStartMock/);
  });

  it('2.3 — No more "Coming Soon" placeholder', () => {
    const sessionsPanel = dashboardHtml.substring(
      dashboardHtml.indexOf('ip-panel-my-sessions'),
      dashboardHtml.indexOf('ip-panel-my-sessions') + 1000
    );
    expect(sessionsPanel).not.toMatch(/Coming Soon/);
  });
});

// ─── Section 3: Simulation JS Functions ──────────────────────────────

describe('3. Simulation Functions', () => {
  it('3.1 — _ipStartMock function', () => {
    expect(ipJs).toMatch(/window\._ipStartMock/);
  });

  it('3.2 — _ipSendMessage function', () => {
    expect(ipJs).toMatch(/window\._ipSendMessage/);
  });

  it('3.3 — _ipRequestHint function', () => {
    expect(ipJs).toMatch(/window\._ipRequestHint/);
  });

  it('3.4 — _ipEndEarly function', () => {
    expect(ipJs).toMatch(/window\._ipEndEarly/);
  });

  it('3.5 — _ipCloseSimulation function', () => {
    expect(ipJs).toMatch(/window\._ipCloseSimulation/);
  });

  it('3.6 — _ipToggleSessionDetail function', () => {
    expect(ipJs).toMatch(/window\._ipToggleSessionDetail/);
  });

  it('3.7 — Calls interview-simulate EF via gateway', () => {
    expect(ipJs).toMatch(/api-gateway\/interview-simulate/);
  });

  it('3.8 — Sends start action', () => {
    expect(ipJs).toMatch(/action: 'start'/);
  });

  it('3.9 — Sends message action', () => {
    expect(ipJs).toMatch(/action: 'message'/);
  });

  it('3.10 — Sends abandon action', () => {
    expect(ipJs).toMatch(/action: 'abandon'/);
  });
});

// ─── Section 4: Chat Interface ───────────────────────────────────────

describe('4. Chat Interface', () => {
  it('4.1 — _appendMessage function renders messages', () => {
    expect(ipJs).toMatch(/function _appendMessage/);
  });

  it('4.2 — User messages aligned right', () => {
    expect(ipJs).toMatch(/flex-end/);
  });

  it('4.3 — Assistant messages aligned left', () => {
    expect(ipJs).toMatch(/flex-start/);
  });

  it('4.4 — Coaching notes extracted from COACH tags', () => {
    expect(ipJs).toMatch(/COACH/);
    expect(ipJs).toMatch(/coachNote/);
    expect(ipJs).toMatch(/coachMatch/);
  });

  it('4.5 — Coaching hidden when feedback mode off', () => {
    expect(ipJs).toMatch(/!showCoaching/);
  });

  it('4.6 — Typing indicator shown while waiting', () => {
    expect(ipJs).toMatch(/ip-sim-typing/);
    expect(ipJs).toMatch(/Interviewer is thinking/);
  });

  it('4.7 — Enter key sends message (without shift)', () => {
    expect(ipJs).toMatch(/e\.key === 'Enter'.*!e\.shiftKey/);
    expect(ipJs).toMatch(/ip-sim-input/);
  });

  it('4.8 — Auto-scroll to bottom on new messages', () => {
    expect(ipJs).toMatch(/scrollTop.*scrollHeight/);
  });

  it('4.9 — Double-send prevention', () => {
    expect(ipJs).toMatch(/_simSending/);
  });
});

// ─── Section 5: Scorecard Rendering ──────────────────────────────────

describe('5. Scorecard Rendering', () => {
  it('5.1 — _renderScorecard function', () => {
    expect(ipJs).toMatch(/function _renderScorecard/);
  });

  it('5.2 — Overall score displayed prominently', () => {
    expect(ipJs).toMatch(/Readiness Score/);
    expect(ipJs).toMatch(/overall_score/);
  });

  it('5.3 — Strengths section', () => {
    expect(ipJs).toMatch(/Strengths/);
    expect(ipJs).toMatch(/scorecard\.strengths/);
  });

  it('5.4 — Improvements section', () => {
    expect(ipJs).toMatch(/Areas to Improve/);
    expect(ipJs).toMatch(/scorecard\.improvements/);
  });

  it('5.5 — Talking points section', () => {
    expect(ipJs).toMatch(/Talking Points/);
    expect(ipJs).toMatch(/scorecard\.talking_points/);
  });

  it('5.6 — Gap coverage', () => {
    expect(ipJs).toMatch(/Gap Coverage/);
    expect(ipJs).toMatch(/scorecard\.gap_coverage/);
  });

  it('5.7 — Save & Close CTA', () => {
    expect(ipJs).toMatch(/Save & Close/);
    expect(ipJs).toMatch(/_ipCloseSimulation/);
  });

  it('5.8 — Input area hidden on completion', () => {
    expect(ipJs).toMatch(/inputArea.*display.*none/s);
  });

  it('5.9 — Score color coding (green/accent/warm)', () => {
    expect(ipJs).toMatch(/>= 75/);
    expect(ipJs).toMatch(/>= 50/);
  });
});

// ─── Section 6: Sessions List ────────────────────────────────────────

describe('6. Sessions List', () => {
  it('6.1 — _loadSessions function', () => {
    expect(ipJs).toMatch(/function _loadSessions/);
  });

  it('6.2 — Loads from interview_sessions table', () => {
    expect(ipJs).toMatch(/\.from\('interview_sessions'\)/);
  });

  it('6.3 — Status badges (completed/in_progress/abandoned)', () => {
    expect(ipJs).toMatch(/Completed/);
    expect(ipJs).toMatch(/In Progress/);
    expect(ipJs).toMatch(/Abandoned/);
  });

  it('6.4 — Resume button for in-progress sessions', () => {
    expect(ipJs).toMatch(/_ipResumeMock/);
    expect(ipJs).toMatch(/Resume/);
  });

  it('6.5 — Review button for completed sessions', () => {
    expect(ipJs).toMatch(/_ipToggleSessionDetail/);
    expect(ipJs).toMatch(/Review/);
  });

  it('6.6 — Inline scorecard expand on Review click', () => {
    expect(ipJs).toMatch(/ip-session-detail-/);
    expect(ipJs).toMatch(/data-scorecard/);
  });

  it('6.7 — Sessions refreshed when closing simulation', () => {
    // _ipCloseSimulation calls _loadSessions
    const closeFn = ipJs.substring(ipJs.indexOf('_ipCloseSimulation = function'), ipJs.indexOf('_ipCloseSimulation = function') + 300);
    expect(closeFn).toMatch(/_loadSessions/);
  });

  it('6.8 — Sessions loaded when My Sessions tab clicked', () => {
    expect(ipJs).toMatch(/my-sessions.*_loadSessions/s);
  });
});

// ─── Section 7: PostHog Events ───────────────────────────────────────

describe('7. PostHog Events', () => {
  it('7.1 — simulation_hint_requested', () => {
    expect(ipJs).toMatch(/simulation_hint_requested/);
  });

  it('7.2 — scorecard_viewed', () => {
    expect(ipJs).toMatch(/scorecard_viewed/);
  });
});

// ─── Section 8: Error Handling ───────────────────────────────────────

describe('8. Error Handling', () => {
  it('8.1 — reportError on start failure', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:start'/);
  });

  it('8.2 — reportError on message failure', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:message'/);
  });

  it('8.3 — reportError on hint failure', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:hint'/);
  });

  it('8.4 — reportError on abandon failure', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:abandon'/);
  });

  it('8.5 — reportError on sessions load failure', () => {
    expect(ipJs).toMatch(/reportError\('interview-prep:sessions'/);
  });

  it('8.6 — XSS protection on all rendered content', () => {
    expect(ipJs).toMatch(/_esc\(mainContent\)/);
    expect(ipJs).toMatch(/_esc\(sc\.gap_coverage\)/);
  });
});

// ─── Section 9: CSS ──────────────────────────────────────────────────

describe('9. CSS', () => {
  it('9.1 — ip-session-card hover', () => {
    expect(inputCss).toMatch(/\.ip-session-card:hover/);
  });

  it('9.2 — sim input focus style', () => {
    expect(inputCss).toMatch(/#ip-sim-input:focus/);
  });
});

// ─── Section 10: Build & Version ─────────────────────────────────────

describe('10. Build & Version', () => {
  it('10.1 — Product version is v9.52', () => {
    expect(versionJs).toMatch(/v9\.52/);
  });

  it('10.2 — Deferred bundle contains simulation code', () => {
    const bundle = read('dist/dashboard-deferred.min.js');
    expect(bundle).toMatch(/_ipStartMock/);
    expect(bundle).toMatch(/_ipSendMessage/);
  });
});

// ─── Section 11: BJ Namespace Exports ────────────────────────────────

describe('11. BJ Namespace Exports', () => {
  const exports = ['_ipStartMock', '_ipSendMessage', '_ipRequestHint', '_ipEndEarly',
                    '_ipCloseSimulation', '_ipToggleSessionDetail', '_ipResumeMock'];
  exports.forEach(name => {
    it(`11.x — ${name} exported`, () => {
      expect(ipJs).toMatch(new RegExp("'" + name + "'"));
    });
  });
});

// ─── Section 12: File Inventory ──────────────────────────────────────

describe('12. File Inventory', () => {
  ['js/interview-prep.js', 'dashboard.html', 'src/input.css',
   'tests/fb-intprep-001-s4-simulation-ui.test.js'].forEach(f => {
    it(`12.x — ${f} exists`, () => {
      expect(exists(f)).toBe(true);
    });
  });
});
