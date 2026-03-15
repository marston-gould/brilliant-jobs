/**
 * SCA-REM-S2 — Spec Compliance Remediation Session 2
 * Tests: QA-010 (sort visual), REM-S03 (ghost_badge_viewed), REM-S04 (tier escalation)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const read = (f) => readFileSync(f, 'utf8');
const sortBarJs = read('js/sort-bar.js');
const applyWorkflowJs = read('js/apply-workflow.js');
const ghostRefreshEF = read('supabase/functions/ghost-score-refresh/index.ts');

// ═══════════════════════════════════════════════════════════
// QA-010: Column sort visual feedback
// ═══════════════════════════════════════════════════════════
describe('QA-010: Column sort visual feedback', () => {
  it('renderSortPills clears sorted class from all th headers', () => {
    expect(sortBarJs).toContain("th.classList.remove('sorted')");
  });

  it('renderSortPills resets arrow to ↕ on non-active headers', () => {
    expect(sortBarJs).toContain("arrow.textContent = '↕'");
  });

  it('renderSortPills adds sorted class to active primary sort', () => {
    expect(sortBarJs).toContain("activeTh.classList.add('sorted')");
  });

  it('renderSortPills sets arrow direction based on asc/desc', () => {
    expect(sortBarJs).toContain("primarySort.asc ? '↑' : '↓'");
  });

  it('has dbField-to-data-sort mapping for all columns', () => {
    expect(sortBarJs).toContain("title: 'title'");
    expect(sortBarJs).toContain("company_name: 'company'");
    expect(sortBarJs).toContain("location: 'location'");
    expect(sortBarJs).toContain("first_seen_at: 'days'");
    expect(sortBarJs).toContain("salary_max: 'salary'");
    expect(sortBarJs).toContain("level: 'level'");
    expect(sortBarJs).toContain("match: 'match'");
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S03: ghost_badge_viewed PostHog event
// ═══════════════════════════════════════════════════════════
describe('REM-S03: ghost_badge_viewed PostHog event', () => {
  it('fires ghost_badge_viewed in buildGhostBadge', () => {
    expect(applyWorkflowJs).toContain("'ghost_badge_viewed'");
  });

  it('includes company_name property', () => {
    expect(applyWorkflowJs).toContain('company_name: key');
  });

  it('includes tier property', () => {
    // In the ghost_badge_viewed capture block
    const match = applyWorkflowJs.match(/ghost_badge_viewed[\s\S]{0,200}tier:\s*tier/);
    expect(match).not.toBeNull();
  });

  it('includes effective_count property', () => {
    const match = applyWorkflowJs.match(/ghost_badge_viewed[\s\S]{0,300}effective_count:\s*count/);
    expect(match).not.toBeNull();
  });

  it('has error handling with reportError', () => {
    expect(applyWorkflowJs).toContain("reportError('ghost:badge_viewed'");
  });

  it('now has both ghost_badge_viewed and ghost_badge_tooltip_shown', () => {
    expect(applyWorkflowJs).toContain("'ghost_badge_viewed'");
    expect(applyWorkflowJs).toContain("'ghost_badge_tooltip_shown'");
  });
});

// ═══════════════════════════════════════════════════════════
// REM-S04: ghost_badge_tier_escalation PostHog event
// ═══════════════════════════════════════════════════════════
describe('REM-S04: ghost_badge_tier_escalation PostHog event', () => {
  it('snapshots old tiers before fn_ghost_score_refresh', () => {
    expect(ghostRefreshEF).toContain('let oldTiers');
    expect(ghostRefreshEF).toContain('oldTiers[row.company_name] = row.tier');
  });

  it('compares new tiers after refresh', () => {
    expect(ghostRefreshEF).toContain('oldTier !== row.tier');
  });

  it('fires ghost_badge_tier_escalation event', () => {
    expect(ghostRefreshEF).toContain('"ghost_badge_tier_escalation"');
  });

  it('includes old_tier and new_tier properties', () => {
    expect(ghostRefreshEF).toContain('old_tier:');
    expect(ghostRefreshEF).toContain('new_tier:');
  });

  it('includes tier_changes_count in ghost_score_refresh event', () => {
    expect(ghostRefreshEF).toContain('tier_changes_count: tierChanges.length');
  });

  it('returns tier_changes count in response', () => {
    expect(ghostRefreshEF).toContain('tier_changes:');
  });

  it('old tier snapshot is non-fatal on failure', () => {
    // The try/catch with non-fatal comment
    expect(ghostRefreshEF).toContain('/* non-fatal — skip tier change detection */');
  });
});

// ═══════════════════════════════════════════════════════════
// Confirmed not-bugs (regression guards)
// ═══════════════════════════════════════════════════════════
describe('QA-006/007: Location normalization (confirmed fixed)', () => {
  const feedJs = read('js/job-feed.js');

  it('cleanLocationPart normalizes "usa" to "US"', () => {
    expect(feedJs).toContain("replace(/\\busa\\b/gi, 'US')");
  });

  it('cleanLocationPart handles "country (remote)" pattern', () => {
    expect(feedJs).toContain("(remote)");
  });

  it('cleanLocationPart title-cases country after Remote', () => {
    expect(feedJs).toContain('first.toUpperCase()');
  });
});

describe('QA-014: Dismissed jobs (confirmed working)', () => {
  const globalsJs = read('js/globals.js');

  it('hiddenJobIds reads from localStorage', () => {
    expect(globalsJs).toContain("safeReadLS(\"bj_hidden_jobs\"");
  });

  it('hidden_jobs is in user data sync mapping', () => {
    expect(globalsJs).toContain('hidden_jobs: "bj_hidden_jobs"');
  });
});

// ═══════════════════════════════════════════════════════════
// Version
// ═══════════════════════════════════════════════════════════
describe('Version v9.19', () => {
  it('version.js has v9.19', () => {
    expect(read('js/version.js')).toContain('v9.19');
  });
});
