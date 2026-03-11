/**
 * AF-006: Extension Activity Sync to Supabase — Validation Tests
 * Tests migration, EF, gateway route, extension sync, dashboard logging
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

// ── Helpers ──────────────────────────────────────────────────────────────
function readFile(path) {
  return readFileSync(path, 'utf-8');
}

describe('AF-006: Extension Activity Sync to Supabase', () => {
  // ── 1. Migration ─────────────────────────────────────────────────────
  describe('1. Migration: user_activity_log', () => {
    const sql = readFile('supabase/migrations/v6.51-user-activity-log.sql');

    it('creates user_activity_log table', () => {
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS user_activity_log');
    });

    it('has user_id, client_id, activity_type, source columns', () => {
      expect(sql).toContain('user_id');
      expect(sql).toContain('client_id');
      expect(sql).toContain('activity_type');
      expect(sql).toContain('source');
    });

    it('has CHECK constraint on activity_type', () => {
      expect(sql).toContain('saved');
      expect(sql).toContain('applied');
      expect(sql).toContain('auto-submitted');
      expect(sql).toContain('score-check');
      expect(sql).toContain('pipeline-approved');
      expect(sql).toContain('pipeline-queued');
    });

    it('has CHECK constraint on source (extension, dashboard)', () => {
      expect(sql).toMatch(/source.*CHECK.*extension.*dashboard/s);
    });

    it('has unique index on client_id for dedup', () => {
      expect(sql).toContain('idx_ual_client_id');
      expect(sql).toContain('client_id');
    });

    it('has user_id + created_at index', () => {
      expect(sql).toContain('idx_ual_user_created');
    });

    it('has RLS policies', () => {
      expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(sql).toContain('Users read own activity');
      expect(sql).toContain('Service role full access');
    });

    it('has cleanup cron for 90-day retention', () => {
      expect(sql).toContain('cleanup-user-activity-log');
      expect(sql).toContain("90 days");
    });

    it('has v_user_activity_summary view', () => {
      expect(sql).toContain('v_user_activity_summary');
      expect(sql).toContain('count_24h');
      expect(sql).toContain('count_7d');
      expect(sql).toContain('from_extension');
      expect(sql).toContain('from_dashboard');
    });

    it('has metadata JSONB column (S-12 scar)', () => {
      expect(sql).toContain('metadata');
      expect(sql).toContain('jsonb');
    });
  });

  // ── 2. Edge Function ─────────────────────────────────────────────────
  describe('2. Edge Function: log-user-activity', () => {
    const ef = readFile('supabase/functions/log-user-activity/index.ts');

    it('exists', () => {
      expect(existsSync('supabase/functions/log-user-activity/index.ts')).toBe(true);
    });

    it('handles batch action', () => {
      expect(ef).toContain("action === \"batch\"");
    });

    it('handles recent action', () => {
      expect(ef).toContain("action === \"recent\"");
    });

    it('handles summary action', () => {
      expect(ef).toContain("action === \"summary\"");
    });

    it('requires authorization', () => {
      expect(ef).toContain('Authorization required');
      expect(ef).toContain('getUser(token)');
    });

    it('validates activity_type against VALID_TYPES', () => {
      expect(ef).toContain('VALID_TYPES');
      expect(ef).toContain('VALID_TYPES.has(item.activity_type)');
    });

    it('uses upsert with ignoreDuplicates for dedup', () => {
      expect(ef).toContain('ignoreDuplicates: true');
      expect(ef).toContain('onConflict: "client_id"');
    });

    it('caps batch size at MAX_BATCH_SIZE', () => {
      expect(ef).toContain('MAX_BATCH_SIZE');
      expect(ef).toContain('Batch size exceeds max');
    });

    it('has CORS headers', () => {
      expect(ef).toContain('CORS_HEADERS');
      expect(ef).toContain('Access-Control-Allow-Origin');
    });

    it('validates source field', () => {
      expect(ef).toContain('VALID_SOURCES');
    });
  });

  // ── 3. Gateway Route ─────────────────────────────────────────────────
  describe('3. Gateway route #115', () => {
    const gw = readFile('supabase/functions/api-gateway/index.ts');

    it('has log-user-activity route', () => {
      expect(gw).toContain('"log-user-activity"');
    });

    it('shows 115 total routes', () => {
      expect(gw).toContain('115 routes');
    });

    it('references AF-006', () => {
      expect(gw).toContain('AF-006');
    });
  });

  // ── 4. Extension popup-consumer.ts ───────────────────────────────────
  describe('4. Extension popup-consumer.ts updates', () => {
    const pc = readFile('extension/popup-consumer.ts');

    it('ActivityItem interface has client_id field', () => {
      expect(pc).toContain('client_id: string');
    });

    it('ActivityItem interface has synced field', () => {
      expect(pc).toContain('synced?: boolean');
    });

    it('addActivityItem generates client_id', () => {
      expect(pc).toMatch(/client_id.*af-.*Date\.now/);
    });

    it('addActivityItem sets synced: false', () => {
      expect(pc).toContain('synced: false');
    });

    it('addActivityItem sends SYNC_ACTIVITY message', () => {
      expect(pc).toContain("type: 'SYNC_ACTIVITY'");
    });
  });

  // ── 5. Extension background.ts ───────────────────────────────────────
  describe('5. Extension background.ts SYNC_ACTIVITY handler', () => {
    const bg = readFile('extension/background.ts');

    it('handles SYNC_ACTIVITY message type', () => {
      expect(bg).toContain("msg.type === 'SYNC_ACTIVITY'");
    });

    it('has _debouncedActivitySync function', () => {
      expect(bg).toContain('function _debouncedActivitySync');
    });

    it('has _syncActivityToSupabase function', () => {
      expect(bg).toContain('async function _syncActivityToSupabase');
    });

    it('debounces at 30 seconds', () => {
      expect(bg).toContain('ACTIVITY_SYNC_DEBOUNCE_MS');
      expect(bg).toContain('30000');
    });

    it('batches max 10 items per sync', () => {
      expect(bg).toContain('.slice(0, 10)');
    });

    it('calls log-user-activity via api-gateway', () => {
      expect(bg).toContain('log-user-activity');
    });

    it('marks items as synced after successful batch', () => {
      expect(bg).toContain('synced: true');
    });

    it('has startup sync function', () => {
      expect(bg).toContain('_startupActivitySync');
    });

    it('fires activity_sync_batch PostHog event', () => {
      expect(bg).toContain('activity_sync_batch');
    });

    it('fires activity_sync_failed PostHog event on error', () => {
      expect(bg).toContain('activity_sync_failed');
    });

    it('APPLY_INTERCEPTED activity item has client_id', () => {
      // The activity item created in APPLY_INTERCEPTED should have client_id
      expect(bg).toMatch(/activityItem[\s\S]*client_id.*af-/);
    });

    it('APPLY_INTERCEPTED triggers _debouncedActivitySync', () => {
      expect(bg).toContain('_debouncedActivitySync()');
    });
  });

  // ── 6. Dashboard apply-workflow.js ───────────────────────────────────
  describe('6. Dashboard activity logging', () => {
    const aw = readFile('js/apply-workflow.js');

    it('has logDashboardActivity function', () => {
      expect(aw).toContain('function logDashboardActivity');
    });

    it('logDashboardActivity generates client_id with db- prefix', () => {
      expect(aw).toMatch(/client_id.*db-/);
    });

    it('logDashboardActivity sets source to dashboard', () => {
      expect(aw).toContain("source: 'dashboard'");
    });

    it('has _flushDashboardActivity with batch POST', () => {
      expect(aw).toContain('function _flushDashboardActivity');
      expect(aw).toContain('log-user-activity');
    });

    it('debounces flush at 5 seconds', () => {
      expect(aw).toContain('_dashActivityTimer');
      expect(aw).toContain('5000');
    });

    it('_trackFeedApplyComplete calls logDashboardActivity', () => {
      // The function should log applied activity
      expect(aw).toMatch(/_trackFeedApplyComplete[\s\S]*logDashboardActivity\('applied'/);
    });

    it('processApplyQueueByMode calls logDashboardActivity', () => {
      expect(aw).toMatch(/processApplyQueueByMode[\s\S]*logDashboardActivity\('pipeline-queued'/);
    });

    it('exports logDashboardActivity to window', () => {
      expect(aw).toContain('window.logDashboardActivity = logDashboardActivity');
    });
  });

  // ── 7. Keywords.js save logging ──────────────────────────────────────
  describe('7. Keywords.js save activity logging', () => {
    const kw = readFile('js/keywords.js');

    it('toggleSaveJob calls logDashboardActivity on save', () => {
      expect(kw).toContain("logDashboardActivity('saved'");
    });

    it('uses typeof guard for logDashboardActivity', () => {
      expect(kw).toContain("typeof logDashboardActivity === 'function'");
    });
  });

  // ── 8. Pod Team Manifest ─────────────────────────────────────────────
  describe('8. Pod Team Manifest', () => {
    const manifest = readFile('docs/scaling/pod-team-manifest.md');

    it('has AF-006 pairing', () => {
      expect(manifest).toContain('AF-006');
    });

    it('all 5 Pod 4 roles present', () => {
      expect(manifest).toContain('Chief Architect');
      expect(manifest).toContain('Lead Platform Engineer');
      expect(manifest).toContain('System Architect');
      expect(manifest).toContain('Forward-Looking Developer');
      expect(manifest).toContain('Evolvability Strategist');
    });
  });

  // ── 9. Build & Version ───────────────────────────────────────────────
  describe('9. Build output', () => {
    it('dashboard.min.js exists', () => {
      expect(existsSync('dist/dashboard.min.js')).toBe(true);
    });

    it('dashboard-deferred.min.js exists', () => {
      expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
    });
  });

  // ── 10. File Inventory ───────────────────────────────────────────────
  describe('10. File inventory', () => {
    const files = [
      'supabase/migrations/v6.51-user-activity-log.sql',
      'supabase/functions/log-user-activity/index.ts',
      'tests/af-006-activity-sync.test.js',
    ];
    files.forEach(f => {
      it(`${f} exists`, () => {
        expect(existsSync(f)).toBe(true);
      });
    });
  });
});
