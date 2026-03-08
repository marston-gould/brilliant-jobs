/**
 * SA-029 Validation Tests — Hook Prototyping + Evolvability Baseline (Phase S6 FINAL)
 *
 * Validates: POC files, tech debt register, deprecation log, dependency policy,
 * evolvability review, ADR-09 update, architecture fitness baseline, Phase S completion.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. POC FILES EXIST AND VALIDATE HOOK POINTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: POC Files', () => {
  const pocDir = 'docs/scaling/poc';

  it('POC directory exists', () => {
    assert.ok(fileExists(pocDir), 'docs/scaling/poc/ directory missing');
  });

  it('POC-01 exists (H-01 gateway middleware)', () => {
    assert.ok(fileExists(`${pocDir}/poc-01-request-timing-middleware.ts`));
  });

  it('POC-02 exists (H-02 event bus subscriber)', () => {
    assert.ok(fileExists(`${pocDir}/poc-02-job-alert-subscriber.ts`));
  });

  it('POC-03 exists (H-04 ATS handler)', () => {
    assert.ok(fileExists(`${pocDir}/poc-03-workday-ats-handler.ts`));
  });

  it('POC-04 exists (H-03 + S-06 feature flag)', () => {
    assert.ok(fileExists(`${pocDir}/poc-04-premium-search-flag.ts`));
  });

  it('POC-05 exists (H-07 CrewAI agent)', () => {
    assert.ok(fileExists(`${pocDir}/poc-05-uptime-monitor-agent.ts`));
  });

  it('POC README exists with summary table', () => {
    const readme = readFile(`${pocDir}/README.md`);
    assert.ok(readme.includes('POC Summary'), 'README missing POC Summary section');
    assert.ok(readme.includes('POC-01'), 'README missing POC-01');
    assert.ok(readme.includes('POC-05'), 'README missing POC-05');
    assert.ok(readme.includes('PASS'), 'README missing PASS verdicts');
  });

  it('POC-01 references H-01 hook and MiddlewarePlugin interface', () => {
    const content = readFile(`${pocDir}/poc-01-request-timing-middleware.ts`);
    assert.ok(content.includes('H-01'), 'POC-01 missing H-01 reference');
    assert.ok(content.includes('MiddlewarePlugin'), 'POC-01 missing MiddlewarePlugin interface');
    assert.ok(content.includes('next()'), 'POC-01 must call next()');
  });

  it('POC-02 references H-02 hook and fn_publish_event', () => {
    const content = readFile(`${pocDir}/poc-02-job-alert-subscriber.ts`);
    assert.ok(content.includes('H-02'), 'POC-02 missing H-02 reference');
    assert.ok(content.includes('fn_publish_event'), 'POC-02 missing fn_publish_event reference');
    assert.ok(content.includes('HMAC'), 'POC-02 missing HMAC verification');
  });

  it('POC-03 references H-04 hook and AtsHandler interface', () => {
    const content = readFile(`${pocDir}/poc-03-workday-ats-handler.ts`);
    assert.ok(content.includes('H-04'), 'POC-03 missing H-04 reference');
    assert.ok(content.includes('AtsHandler'), 'POC-03 missing AtsHandler interface');
    assert.ok(content.includes('detect()'), 'POC-03 must implement detect()');
    assert.ok(content.includes('extractJobData()'), 'POC-03 must implement extractJobData()');
    assert.ok(content.includes('fillField'), 'POC-03 must implement fillField()');
    assert.ok(content.includes('getFields()'), 'POC-03 must implement getFields()');
  });

  it('POC-04 references H-03 and S-06', () => {
    const content = readFile(`${pocDir}/poc-04-premium-search-flag.ts`);
    assert.ok(content.includes('H-03'), 'POC-04 missing H-03 reference');
    assert.ok(content.includes('S-06'), 'POC-04 missing S-06 reference');
    assert.ok(content.includes('FLAG_AWARE_ROUTES'), 'POC-04 missing FLAG_AWARE_ROUTES');
    assert.ok(content.includes('x-gateway-flags'), 'POC-04 missing x-gateway-flags header');
  });

  it('POC-05 references H-07 and agent RPC pattern', () => {
    const content = readFile(`${pocDir}/poc-05-uptime-monitor-agent.ts`);
    assert.ok(content.includes('H-07'), 'POC-05 missing H-07 reference');
    assert.ok(content.includes('fn_uptime_monitor_summary'), 'POC-05 missing summary RPC');
    assert.ok(content.includes('agent_config'), 'POC-05 missing agent_config reference');
    assert.ok(content.includes('observe'), 'POC-05 must reference observe mode');
    assert.ok(content.includes('executed'), 'POC-05 must reference executed flag');
  });

  it('All 5 POCs include HOOK VALIDATION CHECKLIST', () => {
    const pocs = ['poc-01', 'poc-02', 'poc-03', 'poc-04', 'poc-05'];
    for (const poc of pocs) {
      const files = fs.readdirSync(path.join(ROOT, pocDir));
      const file = files.find(f => f.startsWith(poc));
      assert.ok(file, `${poc} file not found`);
      const content = readFile(`${pocDir}/${file}`);
      assert.ok(content.includes('HOOK VALIDATION CHECKLIST'), `${poc} missing validation checklist`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TECH DEBT REGISTER
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Tech Debt Register', () => {
  it('Updated to SA-029', () => {
    const content = readFile('docs/scaling/technical-debt-register.md');
    assert.ok(content.includes('SA-029'), 'Tech debt register not updated to SA-029');
  });

  it('TD-007 moved to resolved (SA-028 completed it)', () => {
    const content = readFile('docs/scaling/technical-debt-register.md');
    assert.ok(content.includes('TD-R007'), 'TD-007 not moved to resolved');
    // Ensure TD-007 is NOT in active section
    const activeSection = content.split('## Resolved Debt Items')[0];
    assert.ok(!activeSection.includes('TD-007'), 'TD-007 still in active section');
  });

  it('No P0 debt items exist', () => {
    const content = readFile('docs/scaling/technical-debt-register.md');
    const activeSection = content.split('## Resolved Debt Items')[0];
    assert.ok(!activeSection.includes('| P0 |'), 'P0 debt items found — should be zero');
  });

  it('Debt velocity tracking includes SA-029', () => {
    const content = readFile('docs/scaling/technical-debt-register.md');
    assert.ok(content.includes('SA-029 Final'), 'Debt velocity missing SA-029 entry');
    assert.ok(content.includes('8 open'), 'Open count should be 8');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DEPRECATION LOG
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Deprecation Log', () => {
  it('Updated to SA-029', () => {
    const content = readFile('docs/scaling/deprecation-log.md');
    assert.ok(content.includes('SA-029'), 'Deprecation log not updated to SA-029');
  });

  it('DEP-001 still tracked (direct EF URLs)', () => {
    const content = readFile('docs/scaling/deprecation-log.md');
    assert.ok(content.includes('DEP-001'), 'DEP-001 missing');
  });

  it('DEP-002 added (Deno std 0.177.0)', () => {
    const content = readFile('docs/scaling/deprecation-log.md');
    assert.ok(content.includes('DEP-002'), 'DEP-002 missing');
    assert.ok(content.includes('0.177.0'), 'DEP-002 should reference Deno std 0.177.0');
  });

  it('DEP-003 added (window.BJ bridge globals)', () => {
    const content = readFile('docs/scaling/deprecation-log.md');
    assert.ok(content.includes('DEP-003'), 'DEP-003 missing');
    assert.ok(content.includes('DataProvider'), 'DEP-003 should reference DataProvider replacement');
  });

  it('RET-001 still in retired section', () => {
    const content = readFile('docs/scaling/deprecation-log.md');
    assert.ok(content.includes('RET-001'), 'RET-001 missing from retired section');
    assert.ok(content.includes('LegacyPageWrapper'), 'RET-001 should reference LegacyPageWrapper');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DEPENDENCY MANAGEMENT POLICY
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Dependency Management Policy', () => {
  it('Policy file exists', () => {
    assert.ok(fileExists('docs/scaling/dependency-management-policy.md'));
  });

  it('Documents Dependabot configuration', () => {
    const content = readFile('docs/scaling/dependency-management-policy.md');
    assert.ok(content.includes('Dependabot'), 'Policy missing Dependabot reference');
    assert.ok(content.includes('npm'), 'Policy missing npm ecosystem');
    assert.ok(content.includes('GitHub Actions'), 'Policy missing Actions ecosystem');
  });

  it('Documents pinning rules for critical deps', () => {
    const content = readFile('docs/scaling/dependency-management-policy.md');
    assert.ok(content.includes('supabase'), 'Policy missing Supabase pinning rule');
    assert.ok(content.includes('react'), 'Policy missing React pinning rule');
    assert.ok(content.includes('deno'), 'Policy missing Deno pinning rule');
  });

  it('Includes vulnerability response SLAs', () => {
    const content = readFile('docs/scaling/dependency-management-policy.md');
    assert.ok(content.includes('Critical'), 'Policy missing Critical severity response');
    assert.ok(content.includes('24 hours'), 'Policy missing 24h SLA for Critical');
    assert.ok(content.includes('CVSS'), 'Policy missing CVSS scoring');
  });

  it('References review protocol', () => {
    const content = readFile('docs/scaling/dependency-management-policy.md');
    assert.ok(content.includes('Review Protocol'), 'Policy missing review protocol section');
    assert.ok(content.includes('18 gates'), 'Policy should reference all 18 CI gates');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EVOLVABILITY REVIEW (S6 FINAL)
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Evolvability Review S6 Final', () => {
  it('Review file exists', () => {
    assert.ok(fileExists('docs/scaling/evolvability-review-s6-final.md'));
  });

  it('Reviews all 15 hook points', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    for (let i = 1; i <= 15; i++) {
      const hookId = `H-${String(i).padStart(2, '0')}`;
      assert.ok(content.includes(hookId), `Review missing ${hookId}`);
    }
  });

  it('Reviews all 16 scar points', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    for (let i = 1; i <= 16; i++) {
      const scarId = `S-${String(i).padStart(2, '0')}`;
      assert.ok(content.includes(scarId), `Review missing ${scarId}`);
    }
  });

  it('Reviews all 9 ADRs for drift', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    for (let i = 1; i <= 9; i++) {
      assert.ok(content.includes(`ADR-0${i}`), `Review missing ADR-0${i}`);
    }
    assert.ok(content.includes('ZERO architectural drift'), 'Review should report zero drift');
  });

  it('Includes architecture fitness score (100%)', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    assert.ok(content.includes('Architecture Fitness Score'), 'Review missing fitness score');
    assert.ok(content.includes('100%'), 'Fitness score should be 100%');
    assert.ok(content.includes('8/8'), 'Should report 8/8 gates passing');
  });

  it('Includes Phase S completion criteria', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    assert.ok(content.includes('Phase S Completion Criteria'), 'Review missing completion criteria');
    assert.ok(content.includes('Phase S is COMPLETE'), 'Review should declare Phase S complete');
  });

  it('Includes post-Phase-S recommendations', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    assert.ok(content.includes('Recommendations'), 'Review missing recommendations');
    assert.ok(content.includes('S-01 activation'), 'Should recommend S-01 as first post-launch work');
  });

  it('Tech debt health section shows 8 open items', () => {
    const content = readFile('docs/scaling/evolvability-review-s6-final.md');
    assert.ok(content.includes('Open debt items'), 'Review missing debt metrics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ADR-09 UPDATE
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: ADR-09 Update', () => {
  it('ADR-09 reflects SA-029 completion', () => {
    const content = readFile('docs/scaling/adr-09-fitness-functions.md');
    assert.ok(content.includes('SA-029'), 'ADR-09 missing SA-029 reference');
    assert.ok(content.includes('IMPLEMENTED (FINAL)'), 'ADR-09 should mark SA-029 as FINAL');
  });

  it('ADR-09 declares Phase S complete', () => {
    const content = readFile('docs/scaling/adr-09-fitness-functions.md');
    assert.ok(content.includes('Phase S COMPLETE'), 'ADR-09 should declare Phase S complete');
  });

  it('ADR-09 references POC validations', () => {
    const content = readFile('docs/scaling/adr-09-fitness-functions.md');
    assert.ok(content.includes('POC'), 'ADR-09 should reference POC validations');
    assert.ok(content.includes('5/5'), 'ADR-09 should report 5/5 POCs passing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. ARCHITECTURE BLUEPRINT INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Architecture Blueprint Integrity', () => {
  it('Blueprint still documents all 15 hooks', () => {
    const content = readFile('docs/scaling/architecture-blueprint.md');
    for (let i = 1; i <= 15; i++) {
      const hookId = `H-${String(i).padStart(2, '0')}`;
      assert.ok(content.includes(hookId), `Blueprint missing ${hookId}`);
    }
  });

  it('Blueprint still documents all 16 scars', () => {
    const content = readFile('docs/scaling/architecture-blueprint.md');
    for (let i = 1; i <= 16; i++) {
      const scarId = `S-${String(i).padStart(2, '0')}`;
      assert.ok(content.includes(scarId), `Blueprint missing ${scarId}`);
    }
  });

  it('Blueprint has cross-reference appendix', () => {
    const content = readFile('docs/scaling/architecture-blueprint.md');
    assert.ok(content.includes('Cross-Reference'), 'Blueprint missing cross-reference');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. INTEGRATION TEMPLATES INTACT
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Integration Templates', () => {
  it('All 6 templates present', () => {
    const content = readFile('docs/scaling/hook-scar-integration-templates.md');
    const templates = ['Template 1', 'Template 2', 'Template 3', 'Template 4', 'Template 5', 'Template 6'];
    for (const t of templates) {
      assert.ok(content.includes(t), `Missing ${t}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. FITNESS FUNCTION SCRIPTS EXIST
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Fitness Function Scripts', () => {
  const scripts = [
    'scripts/ff-01-hook-integrity.mjs',
    'scripts/ff-02-scar-integrity.mjs',
    'scripts/ff-03-migration-sequence.mjs',
    'scripts/ff-04-ef-route-registry.mjs',
    'scripts/ff-05-crewai-observe-guard.mjs',
    'scripts/ff-06-adr-compliance.mjs',
    'scripts/ff-07-test-non-regression.mjs',
    'scripts/ff-08-architecture-boundaries.mjs',
  ];

  for (const script of scripts) {
    it(`${path.basename(script)} exists`, () => {
      assert.ok(fileExists(script), `${script} missing`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 10. TEAM MANIFEST
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Team Manifest', () => {
  it('Pod 4 has all 5 hook-and-scar roles', () => {
    const content = readFile('docs/scaling/pod-team-manifest.md');
    const roles = ['Chief Architect', 'Lead Platform Engineer', 'System Architect', 'Forward-Looking Developer', 'Evolvability Strategist'];
    for (const role of roles) {
      assert.ok(content.includes(role), `Pod 4 missing role: ${role}`);
    }
  });

  it('SA-029 pairing assignment documented', () => {
    const content = readFile('docs/scaling/pod-team-manifest.md');
    assert.ok(content.includes('SA-029'), 'SA-029 pairing missing from manifest');
  });

  it('S6 Final review documented in phase transitions', () => {
    const content = readFile('docs/scaling/pod-team-manifest.md');
    assert.ok(content.includes('S6 Final'), 'S6 Final phase transition missing');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 11. DEPENDABOT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: Dependabot', () => {
  it('Dependabot config exists', () => {
    assert.ok(fileExists('.github/dependabot.yml'));
  });

  it('npm ecosystem configured', () => {
    const content = readFile('.github/dependabot.yml');
    assert.ok(content.includes('npm'), 'Dependabot missing npm ecosystem');
  });

  it('GitHub Actions ecosystem configured', () => {
    const content = readFile('.github/dependabot.yml');
    assert.ok(content.includes('github-actions'), 'Dependabot missing actions ecosystem');
  });

  it('Supabase major version pinned', () => {
    const content = readFile('.github/dependabot.yml');
    assert.ok(content.includes('supabase'), 'Dependabot should pin Supabase');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 12. FILE INVENTORY
// ═══════════════════════════════════════════════════════════════════════════════

describe('SA-029: File Inventory', () => {
  const expectedFiles = [
    'docs/scaling/poc/README.md',
    'docs/scaling/poc/poc-01-request-timing-middleware.ts',
    'docs/scaling/poc/poc-02-job-alert-subscriber.ts',
    'docs/scaling/poc/poc-03-workday-ats-handler.ts',
    'docs/scaling/poc/poc-04-premium-search-flag.ts',
    'docs/scaling/poc/poc-05-uptime-monitor-agent.ts',
    'docs/scaling/dependency-management-policy.md',
    'docs/scaling/evolvability-review-s6-final.md',
  ];

  for (const f of expectedFiles) {
    it(`${f} exists`, () => {
      assert.ok(fileExists(f), `${f} missing`);
    });
  }

  it('All SA-029 docs are non-empty', () => {
    for (const f of expectedFiles) {
      const stat = fs.statSync(path.join(ROOT, f));
      assert.ok(stat.size > 100, `${f} is suspiciously small (${stat.size} bytes)`);
    }
  });
});
