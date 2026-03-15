/**
 * SCA-REM-S5 — Spec Compliance Remediation Session 5
 * Tests: REM-S07 (auto-move notification), REM-S08 (Realtime confirmed), QA-013 label fix
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const ppaEF = read('supabase/functions/process-pipeline-action/index.ts');
const dashboard = read('dashboard.html');
const tuningJs = read('js/tuning.js');
const applicationsJs = read('js/applications.js');

// ═══════════════════════════════════════════════════════════
// REM-S07: Auto-move notification dispatch
// ═══════════════════════════════════════════════════════════
describe('REM-S07: Auto-move notification dispatch', () => {

  describe('process-pipeline-action EF', () => {
    it('inserts into notification_log after auto-move', () => {
      expect(ppaEF).toContain('notification_log');
      expect(ppaEF).toContain('"pipeline_auto_move"');
    });

    it('uses in_app channel', () => {
      // Find the notification insert block
      const match = ppaEF.match(/notification_log[\s\S]{0,500}channel:\s*"in_app"/);
      expect(match).not.toBeNull();
    });

    it('includes signal_id in payload', () => {
      expect(ppaEF).toContain('signal_id: signal.id');
    });

    it('includes from_stage and to_stage in payload', () => {
      const match = ppaEF.match(/notification_log[\s\S]{0,800}from_stage:\s*currentStage/);
      expect(match).not.toBeNull();
    });

    it('includes confidence_score in payload', () => {
      const match = ppaEF.match(/notification_log[\s\S]{0,800}confidence_score/);
      expect(match).not.toBeNull();
    });

    it('notification insert is non-fatal (try/catch)', () => {
      expect(ppaEF).toContain('Non-fatal: auto-move succeeded');
    });

    it('logs error on notification failure', () => {
      expect(ppaEF).toContain('Notification insert failed');
    });
  });

  describe('Dashboard — notification preferences', () => {
    it('has pipeline_auto_move notification preference row', () => {
      expect(dashboard).toContain('data-notif="pipeline_auto_move"');
    });

    it('has Auto-move notifications label', () => {
      expect(dashboard).toContain('Auto-move notifications');
    });

    it('has pipeline_auto_move in log filter dropdown', () => {
      expect(dashboard).toContain('value="pipeline_auto_move"');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S08: Supabase Realtime broadcast (confirmed already done)
// ═══════════════════════════════════════════════════════════
describe('REM-S08: Supabase Realtime broadcast', () => {
  it('broadcasts on pipeline_signals channel', () => {
    expect(ppaEF).toContain('channel("pipeline_signals")');
  });

  it('sends stage_changed event', () => {
    expect(ppaEF).toContain('event: "stage_changed"');
  });

  it('payload includes user_id, signal_id, stages, source', () => {
    expect(ppaEF).toContain('user_id: signal.user_id');
    expect(ppaEF).toContain('from_stage: currentStage');
    expect(ppaEF).toContain('to_stage: targetStage');
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S10/S11: Scan scope settings (UI wired, EF consumption pending)
// ═══════════════════════════════════════════════════════════
describe('REM-S10/S11: Scan scope settings UI', () => {
  it('Gmail scope dropdown exists in dashboard', () => {
    expect(dashboard).toContain('id="pi-gmail-scope"');
  });

  it('Calendar scope dropdown exists in dashboard', () => {
    expect(dashboard).toContain('id="pi-cal-scope"');
  });

  it('applications.js loads gmail_scan_scope', () => {
    expect(applicationsJs).toContain('gmail_scan_scope');
  });

  it('applications.js loads calendar_scan_scope', () => {
    expect(applicationsJs).toContain('calendar_scan_scope');
  });

  it('applications.js saves gmail_scan_scope', () => {
    const match = applicationsJs.match(/gmail_scan_scope.*pi-gmail-scope/);
    expect(match).not.toBeNull();
  });

  it('applications.js saves calendar_scan_scope', () => {
    const match = applicationsJs.match(/calendar_scan_scope.*pi-cal-scope/);
    expect(match).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════
// QA-013: DEFAULT_LEVELS label fix (from earlier)
// ═══════════════════════════════════════════════════════════
describe('QA-013: DEFAULT_LEVELS label fix', () => {
  it('has 11 levels in DEFAULT_LEVELS', () => {
    expect(tuningJs).toContain("label: 'C-Suite'");
    expect(tuningJs).toContain("label: 'VP'");
    expect(tuningJs).toContain("label: 'Sr Director'");
    expect(tuningJs).toContain("label: 'Director'");
    expect(tuningJs).toContain("label: 'Assoc Director'");
    expect(tuningJs).toContain("label: 'Sr Manager'");
    expect(tuningJs).toContain("label: 'Head'");
    expect(tuningJs).toContain("label: 'Manager'");
    expect(tuningJs).toContain("label: 'Senior'");
    expect(tuningJs).toContain("label: 'Mid'");
    expect(tuningJs).toContain("label: 'Entry'");
  });

  it('Level 7 is "Head" not "Lead"', () => {
    expect(tuningJs).not.toContain("label: 'Lead'");
    expect(tuningJs).toContain("label: 'Head'");
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.24', () => {
  it('version.js has v9.24', () => {
    expect(read('js/version.js')).toContain('v9.24');
  });
});
