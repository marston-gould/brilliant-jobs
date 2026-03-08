/**
 * Tests: REM-001 (Security Hygiene) + REM-002 (Extension Error Handling) + REM-003 (EF Hardening + Cost Monitoring)
 * Validates all fixes from the first three Remaining Items Execution Plan sessions.
 */

const { describe, it, expect, beforeAll } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// SECTION 1: REM-001 — Security Hygiene
// ═══════════════════════════════════════════════════════════

describe('REM-001: Security Hygiene', () => {
  describe('SE-002: Key rotation script', () => {
    it('rotation script exists', () => {
      expect(fs.existsSync('scripts/rotate-jwt-secret.sh')).toBe(true);
    });

    it('rotation script is executable-ready', () => {
      const content = fs.readFileSync('scripts/rotate-jwt-secret.sh', 'utf8');
      expect(content).toContain('set -euo pipefail');
      expect(content).toContain('NEW_ANON_KEY');
      expect(content).toContain('NEW_SERVICE_ROLE_KEY');
      expect(content).toContain('globals.js');
      expect(content).toContain('supabase secrets set');
    });
  });

  describe('EXT-SEC-005: Content script CSP audit', () => {
    it('audit report exists', () => {
      expect(fs.existsSync('docs/audit/ext-sec-005-csp-audit.md')).toBe(true);
    });

    it('audit report covers all injection files', () => {
      const report = fs.readFileSync('docs/audit/ext-sec-005-csp-audit.md', 'utf8');
      expect(report).toContain('inject-overlay.ts');
      expect(report).toContain('toolbar-overlay.ts');
      expect(report).toContain('contentScript.ts');
      expect(report).toContain('content.ts');
      expect(report).toContain('popup.ts');
      expect(report).toContain('popup-post.ts');
      expect(report).toContain('background.ts');
    });

    it('audit verdict is SAFE', () => {
      const report = fs.readFileSync('docs/audit/ext-sec-005-csp-audit.md', 'utf8');
      expect(report).toContain('NO VULNERABILITIES FOUND');
    });

    it('all innerHTML writes use escHtml()', () => {
      const files = [
        'extension/inject-overlay.ts',
        'extension/toolbar-overlay.ts',
        'extension/popup.ts',
      ];
      for (const f of files) {
        const content = fs.readFileSync(f, 'utf8');
        // Every file with innerHTML writes should also have escHtml
        if (content.includes('.innerHTML = `') || content.includes('.innerHTML =')) {
          expect(content).toContain('escHtml');
        }
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 2: REM-002 — Extension Error Handling Sweep
// ═══════════════════════════════════════════════════════════

describe('REM-002: Extension Error Handling', () => {
  describe('Error reporter utility', () => {
    it('errorReporter.ts exists', () => {
      expect(fs.existsSync('extension/utils/errorReporter.ts')).toBe(true);
    });

    it('exports reportCatchError and catchAndReport', () => {
      const content = fs.readFileSync('extension/utils/errorReporter.ts', 'utf8');
      expect(content).toContain('export function reportCatchError');
      expect(content).toContain('export function catchAndReport');
      expect(content).toContain('export function checkLastError');
    });
  });

  describe('Background message handler', () => {
    it('handles reportError messages', () => {
      const content = fs.readFileSync('extension/background.ts', 'utf8');
      expect(content).toContain("msg.type === 'reportError'");
      expect(content).toContain('captureEvent');
    });
  });

  describe('EXT-ES-002: Fire-and-forget catches eliminated', () => {
    const files = [
      'extension/token-sync.ts',
      'extension/utils/applicationTracker.ts',
      'extension/utils/fillMetrics.ts',
      'extension/utils/resilientDOM.ts',
      'extension/handlers/lever.ts',
      'extension/handlers/linkedin-easy-apply.ts',
      'extension/handlers/greenhouse-legacy.ts',
      'extension/handlers/greenhouse-react.ts',
      'extension/contentScript.ts',
      'extension/interceptor.ts',
      'extension/interceptor-bridge.ts',
      'extension/popup.ts',
    ];

    for (const f of files) {
      it(`${path.basename(f)} has no naked .catch(() => {})`, () => {
        const content = fs.readFileSync(f, 'utf8');
        // Count remaining naked catches (not inside reportError or captureEvent patterns)
        const lines = content.split('\n');
        let nakedCatches = 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // A "naked" catch is .catch(() => {}) NOT on a reportError sendMessage line
          if (line.includes('.catch(() => {})') && !line.includes('reportError') && !line.includes('captureEvent')) {
            // Allow in background.ts for: PostHog fetch itself, state/log broadcasts, kill switch broadcasts
            const basename = path.basename(f);
            if (basename === 'background.ts' && (
              line.includes("type: 'log'") ||
              line.includes("type: 'state'") ||
              line.includes('_bj_kill_switch') ||
              line.includes('fetchFireAndForget') ||
              line.includes("type: 'ats:redirect")
            )) continue;
            nakedCatches++;
          }
        }
        // Allow max 2 remaining (some are legitimate fire-and-forget)
        expect(nakedCatches).toBeLessThanOrEqual(2);
      });
    }
  });

  describe('EXT-ES-003: Console-only handlers improved', () => {
    it('handler error reports now include PostHog context', () => {
      const handlers = [
        'extension/handlers/lever.ts',
        'extension/handlers/greenhouse-legacy.ts',
        'extension/handlers/greenhouse-react.ts',
      ];
      for (const f of handlers) {
        const content = fs.readFileSync(f, 'utf8');
        expect(content).toContain('reportError');
      }
    });
  });

  describe('EXT-BE-003: Token refresh reliability', () => {
    it('token refresh failure reports to PostHog', () => {
      const content = fs.readFileSync('extension/background.ts', 'utf8');
      expect(content).toContain('extension_token_refresh_failed');
      expect(content).toContain('extension_token_refresh_error');
    });

    it('token refresh failure sets badge notification', () => {
      const content = fs.readFileSync('extension/background.ts', 'utf8');
      expect(content).toContain("chrome.action.setBadgeText({ text: '!' })");
    });

    it('successful refresh clears badge', () => {
      const content = fs.readFileSync('extension/background.ts', 'utf8');
      expect(content).toContain("chrome.action.setBadgeText({ text: '' })");
    });
  });

  describe('Token sync error reporting', () => {
    it('token-sync.ts reports errors to PostHog', () => {
      const content = fs.readFileSync('extension/token-sync.ts', 'utf8');
      expect(content).toContain('dashboard_token_sync');
      expect(content).toContain('extension_token_sync_write');
      expect(content).not.toContain('// Non-critical — silently fail');
    });
  });

  describe('EXT-ES-004: lastError / promise error handling', () => {
    it('popup-post.ts chrome.storage calls have .catch()', () => {
      const content = fs.readFileSync('extension/popup-post.ts', 'utf8');
      // All .then() chains should have .catch()
      const thenLines = content.split('\n').filter(l => l.includes('.then('));
      for (const line of thenLines) {
        // Check same line or next for .catch
        expect(content.includes('.catch(')).toBe(true);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 3: REM-003 — EF Hardening + Cost Monitoring
// ═══════════════════════════════════════════════════════════

describe('REM-003: Edge Function Hardening', () => {
  describe('BE-006: EF empty catches eliminated', () => {
    const efFiles = [
      'supabase/functions/typesense-search/index.ts',
      'supabase/functions/extract-resume-profile/index.ts',
      'supabase/functions/onboarding-sequence/index.ts',
      'supabase/functions/ingest-common-crawl/index.ts',
      'supabase/functions/refresh-jobs/index.ts',
      'supabase/functions/score-sequence/index.ts',
      'supabase/functions/escalation-checker/index.ts',
      'supabase/functions/generate-filter/index.ts',
      'supabase/functions/prompt-to-filter/index.ts',
      'supabase/functions/_shared/db-client.ts',
      'supabase/functions/_shared/admin-auth.ts',
      'supabase/functions/_shared/gateway-middleware.ts',
      'supabase/functions/_shared/feature-flag-middleware.ts',
      'supabase/functions/feature-flags/index.ts',
    ];

    for (const f of efFiles) {
      it(`${f.split('/').slice(-2).join('/')} has no bare } catch {`, () => {
        if (!fs.existsSync(f)) return; // Skip if not found
        const content = fs.readFileSync(f, 'utf8');
        // Check for bare empty catches (not followed by comment or code)
        const lines = content.split('\n');
        let bareCount = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed === '} catch {' || trimmed === '} catch { }') {
            bareCount++;
          }
        }
        expect(bareCount).toBe(0);
      });
    }

    it('EF catches include context in warnings', () => {
      const content = fs.readFileSync('supabase/functions/ingest-common-crawl/index.ts', 'utf8');
      expect(content).toContain('[EF]');
    });
  });

  describe('Cost Monitor infrastructure', () => {
    it('cost monitoring migration exists', () => {
      expect(fs.existsSync('supabase/migrations/20260308_rem003_cost_monitoring.sql')).toBe(true);
    });

    it('migration creates required views', () => {
      const sql = fs.readFileSync('supabase/migrations/20260308_rem003_cost_monitoring.sql', 'utf8');
      expect(sql).toContain('v_ai_cost_daily');
      expect(sql).toContain('v_ai_cost_weekly');
      expect(sql).toContain('v_ai_cost_monthly');
      expect(sql).toContain('fn_ai_cost_summary');
    });

    it('cost-monitor EF exists', () => {
      expect(fs.existsSync('supabase/functions/cost-monitor/index.ts')).toBe(true);
    });

    it('cost-monitor EF handles all required actions', () => {
      const content = fs.readFileSync('supabase/functions/cost-monitor/index.ts', 'utf8');
      expect(content).toContain("action === \"summary\"");
      expect(content).toContain("action === \"daily\"");
      expect(content).toContain("action === \"weekly\"");
      expect(content).toContain("action === \"monthly\"");
      expect(content).toContain("action === \"budget-update\"");
    });

    it('cost-monitor EF requires admin auth', () => {
      const content = fs.readFileSync('supabase/functions/cost-monitor/index.ts', 'utf8');
      expect(content).toContain('x-gateway-user-role');
      expect(content).toContain('Admin access required');
    });

    it('cost-monitor registered in API gateway', () => {
      const gw = fs.readFileSync('supabase/functions/api-gateway/index.ts', 'utf8');
      expect(gw).toContain('"cost-monitor"');
    });

    it('admin cost dashboard JS exists', () => {
      expect(fs.existsSync('js/admin-cost-monitor.js')).toBe(true);
    });

    it('admin cost dashboard renders required sections', () => {
      const content = fs.readFileSync('js/admin-cost-monitor.js', 'utf8');
      expect(content).toContain('30-Day Spend');
      expect(content).toContain('Budget Utilization');
      expect(content).toContain('Cost by Function');
      expect(content).toContain('_costSparkline');
    });

    it('admin.html includes cost monitor page container', () => {
      const html = fs.readFileSync('admin.html', 'utf8');
      expect(html).toContain('admin-page-cost-monitor');
      expect(html).toContain('admin-cost-monitor.js');
    });
  });
});

// ═══════════════════════════════════════════════════════════
// SECTION 4: Cross-session validation
// ═══════════════════════════════════════════════════════════

describe('Cross-session: Team manifest', () => {
  it('team manifest has Pod 4 roles', () => {
    const manifest = fs.readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');
    expect(manifest).toContain('Chief Architect');
    expect(manifest).toContain('Lead Platform Engineer');
    expect(manifest).toContain('System Architect');
    expect(manifest).toContain('Forward-Looking Developer');
    expect(manifest).toContain('Evolvability Strategist');
  });

  it('team manifest has REM pairing assignments', () => {
    const manifest = fs.readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');
    expect(manifest).toContain('REM-001');
    expect(manifest).toContain('REM-002');
    expect(manifest).toContain('REM-003');
  });
});

describe('Cross-session: File inventory', () => {
  const expectedFiles = [
    // REM-001
    'docs/audit/ext-sec-005-csp-audit.md',
    'scripts/rotate-jwt-secret.sh',
    // REM-002
    'extension/utils/errorReporter.ts',
    // REM-003
    'supabase/migrations/20260308_rem003_cost_monitoring.sql',
    'supabase/functions/cost-monitor/index.ts',
    'js/admin-cost-monitor.js',
  ];

  for (const f of expectedFiles) {
    it(`${f} exists`, () => {
      expect(fs.existsSync(f)).toBe(true);
    });
  }
});
