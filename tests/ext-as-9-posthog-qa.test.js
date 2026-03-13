/**
 * EXT-AS-9: PostHog Instrumentation + QA Validation
 * Session: EXT-AS-9 | Pod 3 Engineering
 * 
 * Validates:
 * - All 14 spec PostHog events present (directly or via equivalent)
 * - POSTHOG_CAPTURE relay handler in background.ts
 * - score_gate_shown event in overlay
 * - selector_failed events in overlay
 * - Extension-side submission_attempts logging
 * - Admin panel method breakdown
 * - Extension manifest version 3.0.0
 * - Build output
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const BG = readFileSync('extension/background.ts', 'utf-8');
const OVERLAY = readFileSync('extension/job-site-overlay.ts', 'utf-8');
const ADMIN_AS = readFileSync('js/admin-autosubmit.js', 'utf-8');
const MANIFEST = JSON.parse(readFileSync('extension/manifest.json', 'utf-8'));

describe('EXT-AS-9: PostHog Event Coverage', () => {
  // Spec Section 6: 14 PostHog events
  const SPEC_EVENTS = [
    { name: 'mode_changed', file: 'popup-consumer.ts' },
    { name: 'threshold_changed', file: 'popup-consumer.ts' },
    { name: 'save_to_pipeline', mapped: 'job_site_overlay_saved' },
    { name: 'apply_intercepted', file: 'background.ts' },
    { name: 'score_gate_shown', file: 'job-site-overlay.ts' },
    { name: 'score_gate_action', mapped: 'score_gate_decision' },
    { name: 'rewrite_started', mapped: 'rewrite_resume_extension' },
    { name: 'rewrite_completed', mapped: 'rewrite_resume_extension' },
    { name: 'rewrite_submitted', mapped: 'rewrite_decision' },
    { name: 'rewrite_discarded', mapped: 'rewrite_decision' },
    { name: 'auto_submitted', mapped: ['auto_apply_submitted', 'auto_rewrite_submitted', 'full_autopilot_submitted'] },
    { name: 'daily_limit_hit', mapped: 'daily_apply_limit_reached' },
    { name: 'selector_failed', file: 'job-site-overlay.ts' },
    { name: 'admin_toggle', file: 'popup-consumer.ts' },
  ];

  it('all 14 spec events are present (direct or mapped equivalent)', () => {
    const allFiles = BG + OVERLAY + readFileSync('extension/popup-consumer.ts', 'utf-8');
    
    SPEC_EVENTS.forEach(evt => {
      if (evt.mapped) {
        const names = Array.isArray(evt.mapped) ? evt.mapped : [evt.mapped];
        const found = names.some(n => allFiles.includes(`'${n}'`));
        expect(found, `Missing event: ${evt.name} (mapped to ${evt.mapped})`).toBe(true);
      } else {
        expect(allFiles.includes(`'${evt.name}'`), `Missing event: ${evt.name}`).toBe(true);
      }
    });
  });

  it('score_gate_shown fires in showScoreGatePopup', () => {
    expect(OVERLAY).toContain("event: 'score_gate_shown'");
    expect(OVERLAY).toContain("sendMsg('POSTHOG_CAPTURE'");
  });

  it('score_gate_shown includes score, threshold, is_above, platform, mode', () => {
    const idx = OVERLAY.indexOf("event: 'score_gate_shown'");
    const snippet = OVERLAY.substring(idx, idx + 300);
    expect(snippet).toContain('score:');
    expect(snippet).toContain('threshold:');
    expect(snippet).toContain('is_above:');
    expect(snippet).toContain('platform:');
    expect(snippet).toContain('mode:');
  });
});

describe('EXT-AS-9: selector_failed Events', () => {
  it('fires selector_failed for apply button selectors', () => {
    const idx = OVERLAY.indexOf('interceptApplyButtons');
    const fn = OVERLAY.substring(idx, idx + 800);
    expect(fn).toContain("event: 'selector_failed'");
    expect(fn).toContain("selector_type: 'apply_button'");
  });

  it('fires selector_failed for save button target', () => {
    expect(OVERLAY).toContain("selector_type: 'save_button_target'");
  });

  it('tracks platform and url in selector_failed', () => {
    // Find first occurrence
    const idx = OVERLAY.indexOf("event: 'selector_failed'");
    const snippet = OVERLAY.substring(idx, idx + 300);
    expect(snippet).toContain('site:');
    expect(snippet).toContain('url:');
  });
});

describe('EXT-AS-9: POSTHOG_CAPTURE Relay Handler', () => {
  it('background.ts has POSTHOG_CAPTURE message handler', () => {
    expect(BG).toContain("msg.type === 'POSTHOG_CAPTURE'");
  });

  it('POSTHOG_CAPTURE calls captureEvent with event and properties', () => {
    const idx = BG.indexOf("msg.type === 'POSTHOG_CAPTURE'");
    const snippet = BG.substring(idx, idx + 300);
    expect(snippet).toContain('captureEvent(p.event');
    expect(snippet).toContain('p.properties');
  });
});

describe('EXT-AS-9: Extension-side submission_attempts Logging', () => {
  it('_logSubmissionAttempt helper exists', () => {
    expect(BG).toContain('async function _logSubmissionAttempt');
  });

  it('writes to submission_attempts REST endpoint', () => {
    const idx = BG.indexOf('_logSubmissionAttempt');
    const fn = BG.substring(idx, idx + 1200);
    expect(fn).toContain('/rest/v1/submission_attempts');
    expect(fn).toContain('submission_method');
    expect(fn).toContain('status');
  });

  it('logs auto_apply submissions', () => {
    expect(BG).toContain("method: 'extension_auto', status: 'submitted'");
  });

  it('logs auto_rewrite submissions', () => {
    expect(BG).toContain("method: 'extension_rewrite', status: 'submitted'");
  });

  it('logs full_autopilot submissions', () => {
    expect(BG).toContain("method: 'extension_autopilot', status: 'submitted'");
  });

  it('logs score_gate submit_anyway', () => {
    expect(BG).toContain("method: 'extension_score_gate', status: 'submitted'");
  });

  it('logs cancellations', () => {
    expect(BG).toContain("status: 'cancelled'");
  });

  it('is fire-and-forget (best-effort)', () => {
    const idx = BG.indexOf('async function _logSubmissionAttempt');
    const fn = BG.substring(idx, idx + 1500);
    expect(fn).toContain('fetchFireAndForget');
  });
});

describe('EXT-AS-9: Admin Panel Method Breakdown', () => {
  it('admin-autosubmit.js renders method breakdown table', () => {
    expect(ADMIN_AS).toContain('Submission Method (7 days)');
    expect(ADMIN_AS).toContain('by_method');
  });

  it('method table has correct columns', () => {
    expect(ADMIN_AS).toContain('Method');
    expect(ADMIN_AS).toContain('Success');
    expect(ADMIN_AS).toContain('Failed');
    expect(ADMIN_AS).toContain('Cancelled');
    expect(ADMIN_AS).toContain('Fail %');
  });

  it('queries submission_attempts for method breakdown', () => {
    expect(ADMIN_AS).toContain("from('submission_attempts')");
    expect(ADMIN_AS).toContain("submission_method");
  });

  it('groups by submission_method', () => {
    expect(ADMIN_AS).toContain('methodMap');
    expect(ADMIN_AS).toContain('r.submission_method');
  });
});

describe('EXT-AS-9: Extension Manifest', () => {
  it('version is 3.0.0', () => {
    expect(MANIFEST.version).toBe('3.0.0');
  });
});

describe('EXT-AS-9: Build Output', () => {
  it('dist/dashboard.min.js exists', () => {
    expect(existsSync('dist/dashboard.min.js')).toBe(true);
  });

  it('dist/dashboard-deferred.min.js exists', () => {
    expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
  });

  it('dist/admin.min.js exists', () => {
    expect(existsSync('dist/admin.min.js')).toBe(true);
  });

  it('version.js contains v8.78', () => {
    const v = readFileSync('js/version.js', 'utf-8');
    expect(v).toContain('v8.78');
  });
});
