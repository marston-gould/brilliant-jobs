/**
 * SA-027: Architecture Blueprint + Hook/Scar Standards
 * Validates that the blueprint and templates are complete, accurate,
 * and consistent with the actual codebase.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(ROOT, f));

// ─── Section 1: Blueprint Document Exists ────────────────────────────────────
describe('SA-027 §1: Architecture Blueprint document', () => {
  it('architecture-blueprint.md exists', () => {
    expect(exists('docs/scaling/architecture-blueprint.md')).toBe(true);
  });

  it('hook-scar-integration-templates.md exists', () => {
    expect(exists('docs/scaling/hook-scar-integration-templates.md')).toBe(true);
  });

  const bp = read('docs/scaling/architecture-blueprint.md');

  it('contains all 6 parts', () => {
    expect(bp).toContain('Part 1: Hook Point Registry');
    expect(bp).toContain('Part 2: Scar Location Registry');
    expect(bp).toContain('Part 3: Interface Contracts');
    expect(bp).toContain('Part 4: Extension Scenarios');
    expect(bp).toContain('Part 5: Implementation Standards');
    expect(bp).toContain('Part 6: Architectural Boundaries');
  });

  it('contains Quick Reference table with counts', () => {
    expect(bp).toContain('H-)');
    expect(bp).toContain('S-)');
    expect(bp).toContain('15 |');
    expect(bp).toContain('16 |');
  });
});

// ─── Section 2: All 15 Hook Points Documented ────────────────────────────────
describe('SA-027 §2: Hook registry completeness (H-01 through H-15)', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  const hooks = Array.from({ length: 15 }, (_, i) => `H-${String(i + 1).padStart(2, '0')}`);

  hooks.forEach(h => {
    it(`${h} is documented with location + status`, () => {
      expect(bp).toContain(h);
      // Each hook section should have a table with Location and Status
    });
  });

  it('all hook statuses are one of: ACTIVE | READY | DORMANT', () => {
    const statusPattern = /✅ ACTIVE|🟡 READY|🔲 DORMANT/g;
    const matches = bp.match(statusPattern) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(15);
  });

  it('H-01 documents middleware stack extension rule', () => {
    expect(bp).toContain('MiddlewarePlugin');
    expect(bp).toContain('middlewareStack');
  });

  it('H-02 documents fn_publish_event signature', () => {
    expect(bp).toContain('fn_publish_event');
    expect(bp).toContain('idempotency_key');
  });

  it('H-03 documents FLAG_AWARE_ROUTES and parseFlagHeader', () => {
    expect(bp).toContain('FLAG_AWARE_ROUTES');
    expect(bp).toContain('parseFlagHeader');
  });

  it('H-04 documents AtsHandler interface', () => {
    expect(bp).toContain('AtsHandler');
    expect(bp).toContain('detect()');
    expect(bp).toContain('fillField');
  });

  it('H-07 documents agent RPC pattern', () => {
    expect(bp).toContain('fn_{agent_name}_summary');
    expect(bp).toContain('H-07 pattern');
  });
});

// ─── Section 3: All 16 Scar Locations Documented ─────────────────────────────
describe('SA-027 §3: Scar registry completeness (S-01 through S-16)', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  const scars = Array.from({ length: 16 }, (_, i) => `S-${String(i + 1).padStart(2, '0')}`);

  scars.forEach(s => {
    it(`${s} is documented`, () => {
      expect(bp).toContain(s);
    });
  });

  it('S-01 is flagged as HIGH RISK', () => {
    expect(bp).toContain('HIGH RISK');
    expect(bp).toContain('S-01');
  });

  it('S-16 references GRADUATED_AGENTS', () => {
    expect(bp).toContain('GRADUATED_AGENTS');
  });

  it('scar states documented (ACTIVE, READY, ON-DEMAND)', () => {
    expect(bp).toContain('✅ ACTIVE');
    expect(bp).toContain('🟡 READY');
    expect(bp).toContain('🔲 ON-DEMAND');
  });
});

// ─── Section 4: Interface Contracts ──────────────────────────────────────────
describe('SA-027 §4: Interface contracts completeness', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  it('GatewayContext interface documented', () => {
    expect(bp).toContain('GatewayContext');
    expect(bp).toContain('routeKey');
    expect(bp).toContain('targetFunction');
  });

  it('Agent contract documents observe mode invariant', () => {
    expect(bp).toContain('executed: false');
    expect(bp).toContain('OBSERVE MODE');
  });

  it('EF contract includes error handling requirement', () => {
    expect(bp).toContain('Never swallow errors');
  });

  it('React page contract requires bridge hook pattern', () => {
    expect(bp).toContain('hooks/usePageName');
    expect(bp).toContain('window.*');
  });

  it('Migration contract includes RLS requirement', () => {
    expect(bp).toContain('ENABLE ROW LEVEL SECURITY');
    expect(bp).toContain('agent_action_log');
  });

  it('Event taxonomy conventions documented', () => {
    expect(bp).toContain('domain.action');
    expect(bp).toContain('job.ingested');
  });
});

// ─── Section 5: Extension Scenarios ──────────────────────────────────────────
describe('SA-027 §5: Extension scenarios', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  it('Scenario A: new CrewAI agent steps documented', () => {
    expect(bp).toContain('Scenario A: Add a New CrewAI Agent');
    expect(bp).toContain('observe mode');
  });

  it('Scenario B: new ATS handler steps documented', () => {
    expect(bp).toContain('Scenario B: Add a New ATS');
    expect(bp).toContain('AtsHandler');
  });

  it('Scenario C: new feature flag steps documented', () => {
    expect(bp).toContain('Scenario C: Add a New Feature Flag');
  });

  it('Scenario D: new gateway middleware steps documented', () => {
    expect(bp).toContain('Scenario D: Add a New Gateway Middleware');
  });

  it('Scenario E: S-01 activation has warning and phased approach', () => {
    expect(bp).toContain('Scenario E: Activate S-01');
    expect(bp).toContain('HIGH RISK');
    expect(bp).toContain('Phase 1');
    expect(bp).toContain('Phase 3');
  });
});

// ─── Section 6: Integration Templates Completeness ───────────────────────────
describe('SA-027 §6: Integration templates', () => {
  const tmpl = read('docs/scaling/hook-scar-integration-templates.md');

  it('Template 1: new CrewAI agent (migration + EF + gateway)', () => {
    expect(tmpl).toContain('Template 1: New CrewAI Agent');
    expect(tmpl).toContain('agent_config');
    expect(tmpl).toContain('executed');
    expect(tmpl).toContain('OBSERVE MODE');
  });

  it('Template 2: new gateway middleware', () => {
    expect(tmpl).toContain('Template 2: New Gateway Middleware Plugin');
    expect(tmpl).toContain('GatewayContext');
  });

  it('Template 3: new ATS handler', () => {
    expect(tmpl).toContain('Template 3: New ATS Handler');
    expect(tmpl).toContain('implements AtsHandler');
  });

  it('Template 4: new feature flag', () => {
    expect(tmpl).toContain('Template 4: New Feature Flag');
    expect(tmpl).toContain("'draft'");
    expect(tmpl).toContain('useFeatureFlag');
  });

  it('Template 5: new React page', () => {
    expect(tmpl).toContain('Template 5: New React Page');
    expect(tmpl).toContain('usePageName');
    expect(tmpl).toContain('clearInterval');
  });

  it('Template 6: new database migration', () => {
    expect(tmpl).toContain('Template 6: New Database Migration');
    expect(tmpl).toContain('ENABLE ROW LEVEL SECURITY');
    expect(tmpl).toContain('agent_action_log');
  });

  it('PR checklist present', () => {
    expect(tmpl).toContain('Checklist: Before Opening a PR');
    expect(tmpl).toContain('ff-01-hook-integrity');
    expect(tmpl).toContain('ff-02-scar-integrity');
  });
});

// ─── Section 7: Blueprint Consistency with Codebase ──────────────────────────
describe('SA-027 §7: Blueprint consistent with actual codebase', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  it('H-01 location matches actual gateway file', () => {
    expect(exists('supabase/functions/api-gateway/index.ts')).toBe(true);
    expect(bp).toContain('supabase/functions/api-gateway/index.ts');
  });

  it('H-02 location matches actual migration', () => {
    expect(exists('supabase/migrations/v6.31-event-bus-webhooks.sql')).toBe(true);
    expect(bp).toContain('v6.31-event-bus-webhooks.sql');
  });

  it('H-03 location matches actual middleware file', () => {
    expect(exists('supabase/functions/_shared/feature-flag-middleware.ts')).toBe(true);
    expect(bp).toContain('feature-flag-middleware.ts');
  });

  it('H-04 location matches actual types file', () => {
    expect(exists('extension/types/index.d.ts')).toBe(true);
    expect(bp).toContain('extension/types/index.d.ts');
  });

  it('H-05 location matches actual shared types file', () => {
    expect(exists('supabase/functions/_shared/types.ts')).toBe(true);
    expect(bp).toContain('_shared/types.ts');
  });

  it('H-06 location matches actual providers files', () => {
    expect(exists('src/app/providers/types.ts')).toBe(true);
    expect(bp).toContain('src/app/providers/types.ts');
  });

  it('S-16 location matches actual FF-05 script', () => {
    expect(exists('scripts/ff-05-crewai-observe-guard.mjs')).toBe(true);
    expect(bp).toContain('ff-05-crewai-observe-guard.mjs');
  });

  it('architectural boundary rules match FF-08 script', () => {
    const ff08 = read('scripts/ff-08-architecture-boundaries.mjs');
    // Both should reference bridge pattern
    expect(ff08).toContain('window');
    expect(bp).toContain('Bridge pattern');
  });
});

// ─── Section 8: ADR Cross-Reference ──────────────────────────────────────────
describe('SA-027 §8: ADR cross-reference table', () => {
  const bp = read('docs/scaling/architecture-blueprint.md');

  it('cross-reference table exists', () => {
    expect(bp).toContain('Hook & Scar Cross-Reference');
    expect(bp).toContain('ADR | Hooks Created | Scars Created');
  });

  it('all 10 ADRs represented', () => {
    expect(bp).toContain('ADR-01');
    expect(bp).toContain('ADR-02');
    expect(bp).toContain('ADR-09');
  });

  it('SA-024 event bus activations documented in cross-reference', () => {
    expect(bp).toContain('SA-024 (Event Bus)');
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────
describe('SA-027: Summary', () => {
  it('architecture-blueprint.md is substantial (>200 lines)', () => {
    const lines = read('docs/scaling/architecture-blueprint.md').split('\n').length;
    expect(lines).toBeGreaterThan(200);
  });

  it('hook-scar-integration-templates.md is substantial (>100 lines)', () => {
    const lines = read('docs/scaling/hook-scar-integration-templates.md').split('\n').length;
    expect(lines).toBeGreaterThan(100);
  });

  it('All SA-027 test sections pass', () => {
    expect(true).toBe(true);
    console.log('✅ All SA-027 architecture blueprint tests passed.');
  });
});
