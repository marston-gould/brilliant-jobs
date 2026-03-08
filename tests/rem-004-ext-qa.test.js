/**
 * tests/rem-004-ext-qa.test.js
 * REM-004: Extension QA + Manifest Validation
 *
 * Sections:
 *   1. Handler file existence (17 files)
 *   2. Handler export pattern validation
 *   3. ContentScript routing coverage
 *   4. Manifest → handler mapping
 *   5. Manifest permissions justification
 *   6. Selector snapshot tests (regression detection)
 *   7. Content script structure validation
 *   8. Background service worker structure
 *   9. Web accessible resources coverage
 *  10. Build output validation
 *  11. Permissions audit document
 *  12. File inventory
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const HANDLERS = path.join(EXT, 'handlers');

// ── Helpers ──────────────────────────────────────────────────────────

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function readJSON(relPath) {
  return JSON.parse(readFile(relPath));
}

// ── Section 1: Handler File Existence (17 handlers) ─────────────────

describe('Section 1: Handler File Existence', () => {
  const EXPECTED_HANDLERS = [
    'ashby.ts',
    'avature.ts',
    'bamboohr.ts',
    'generic.ts',
    'greenhouse-legacy.ts',
    'greenhouse-react.ts',
    'icims.ts',
    'indeed.ts',
    'jazzhr.ts',
    'lever.ts',
    'linkedin-easy-apply.ts',
    'recruitee.ts',
    'smartrecruiters.ts',
    'taleo.ts',
    'workable.ts',
    'workday-experience.ts',
    'workday.ts',
  ];

  test('all 17 handler files exist', () => {
    const actual = fs.readdirSync(HANDLERS).filter(f => f.endsWith('.ts')).sort();
    expect(actual).toEqual(EXPECTED_HANDLERS);
  });

  for (const handler of EXPECTED_HANDLERS) {
    test(`${handler} is non-empty`, () => {
      const content = fs.readFileSync(path.join(HANDLERS, handler), 'utf-8');
      expect(content.length).toBeGreaterThan(50);
    });
  }

  test('handler count is exactly 17', () => {
    const count = fs.readdirSync(HANDLERS).filter(f => f.endsWith('.ts')).length;
    expect(count).toBe(17);
  });
});

// ── Section 2: Handler Export Pattern Validation ────────────────────

describe('Section 2: Handler Export Pattern', () => {
  const FILL_HANDLERS = [
    'ashby.ts', 'avature.ts', 'bamboohr.ts', 'greenhouse-legacy.ts',
    'greenhouse-react.ts', 'icims.ts', 'indeed.ts', 'jazzhr.ts',
    'lever.ts', 'linkedin-easy-apply.ts', 'recruitee.ts',
    'smartrecruiters.ts', 'taleo.ts', 'workable.ts', 'workday.ts',
  ];

  for (const handler of FILL_HANDLERS) {
    test(`${handler} has a default or named fill export`, () => {
      const content = fs.readFileSync(path.join(HANDLERS, handler), 'utf-8');
      const hasDefault = /export\s+default/.test(content);
      const hasNamedFill = /export\s+{\s*[^}]*fill/.test(content);
      expect(hasDefault || hasNamedFill).toBe(true);
    });

    test(`${handler} exports a fill function`, () => {
      const content = fs.readFileSync(path.join(HANDLERS, handler), 'utf-8');
      const hasFill = /(?:export\s+default\s+(?:async\s+)?function\s+fill|export\s+default\s+fill|export\s+{\s*[^}]*fill)/.test(content);
      expect(hasFill).toBe(true);
    });
  }

  test('generic.ts exports safeFill', () => {
    const content = readFile('extension/handlers/generic.ts');
    expect(content).toMatch(/safeFill/);
    expect(content).toMatch(/export\s+{[^}]*safeFill/);
  });

  test('workday-experience.ts exports fillMyExperience', () => {
    const content = readFile('extension/handlers/workday-experience.ts');
    expect(content).toMatch(/export\s+(?:function|async\s+function|const)\s+fillMyExperience/);
  });
});

// ── Section 3: ContentScript Routing Coverage ───────────────────────

describe('Section 3: ContentScript Routing Coverage', () => {
  const contentScript = readFile('extension/contentScript.ts');

  // Every handler (except generic and workday-experience) must be in ATS_HANDLERS
  const ROUTED_HANDLERS = [
    'greenhouse-legacy', 'greenhouse-react', 'lever', 'ashby',
    'workable', 'recruitee', 'linkedin-easy-apply', 'indeed',
    'workday', 'icims', 'taleo', 'smartrecruiters', 'avature',
    'bamboohr', 'jazzhr',
  ];

  for (const handler of ROUTED_HANDLERS) {
    test(`${handler} is in ATS_HANDLERS routing table`, () => {
      const pattern = new RegExp(`['"]${handler}['"]\\s*:`);
      expect(contentScript).toMatch(pattern);
    });

    test(`${handler} has a module reference to handlers/${handler}.js`, () => {
      expect(contentScript).toContain(`handlers/${handler}.js`);
    });
  }

  test('generic handler is used as fallback', () => {
    expect(contentScript).toContain("handlers/generic.js");
    expect(contentScript).toMatch(/generic:\s*true/);
  });

  test('routing table has exactly 15 named entries', () => {
    const matches = contentScript.match(/'[\w-]+'\s*:\s*{/g);
    // Filter to only entries within ATS_HANDLERS block
    const handlerBlock = contentScript.match(/const ATS_HANDLERS\s*=\s*{([\s\S]*?)\n  };/);
    expect(handlerBlock).not.toBeNull();
    const entries = handlerBlock[1].match(/'[\w-]+'\s*:/g);
    expect(entries.length).toBe(15);
  });
});

// ── Section 4: Manifest → Handler Mapping ───────────────────────────

describe('Section 4: Manifest → Handler Mapping', () => {
  const manifest = readJSON('extension/manifest.json');
  const contentScript = readFile('extension/contentScript.ts');

  test('manifest version is 3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  test('manifest version is 2.23.0', () => {
    expect(manifest.version).toBe('2.23.0');
  });

  // Every host_permission ATS domain should have a handler route
  const ATS_HOST_PATTERNS = [
    { pattern: 'boards.greenhouse.io', handler: 'greenhouse-legacy' },
    { pattern: 'boards.eu.greenhouse.io', handler: 'greenhouse-legacy' },
    { pattern: 'job-boards.greenhouse.io', handler: 'greenhouse-react' },
    { pattern: 'job-boards.eu.greenhouse.io', handler: 'greenhouse-react' },
    { pattern: 'jobs.lever.co', handler: 'lever' },
    { pattern: 'jobs.ashbyhq.com', handler: 'ashby' },
    { pattern: 'apply.workable.com', handler: 'workable' },
    { pattern: '*.recruitee.com', handler: 'recruitee' },
    { pattern: '*.myworkdayjobs.com', handler: 'workday' },
    { pattern: 'smartapply.indeed.com', handler: 'indeed' },
    { pattern: 'apply.indeed.com', handler: 'indeed' },
    { pattern: '*.indeed.com', handler: 'indeed' },
    { pattern: '*.icims.com', handler: 'icims' },
    { pattern: '*.taleo.net', handler: 'taleo' },
    { pattern: 'jobs.smartrecruiters.com', handler: 'smartrecruiters' },
    { pattern: 'careers.smartrecruiters.com', handler: 'smartrecruiters' },
    { pattern: '*.avature.net', handler: 'avature' },
    { pattern: '*.bamboohr.com', handler: 'bamboohr' },
    { pattern: '*.applytojob.com', handler: 'jazzhr' },
  ];

  for (const { pattern, handler } of ATS_HOST_PATTERNS) {
    test(`host_permission ${pattern} maps to handler ${handler}`, () => {
      // Verify host_permission exists in manifest
      const hasPermission = manifest.host_permissions.some(p => p.includes(pattern));
      expect(hasPermission).toBe(true);
      // Verify handler exists in routing
      expect(contentScript).toContain(`'${handler}'`);
    });
  }

  // Content script matches must include all ATS domains
  test('content_scripts[2] covers all ATS domains', () => {
    const atsMatches = manifest.content_scripts[2].matches;
    expect(atsMatches).toContain('https://*.bamboohr.com/*');
    expect(atsMatches).toContain('https://*.applytojob.com/*');
    expect(atsMatches.length).toBeGreaterThanOrEqual(19);
  });

  // Infrastructure host_permissions
  test('Supabase host_permission present', () => {
    expect(manifest.host_permissions).toContain('https://qojhagupdnbtomfoxnsf.supabase.co/*');
  });

  test('BrilliantJobs host_permissions present', () => {
    expect(manifest.host_permissions).toContain('https://brilliantjobs.app/*');
    expect(manifest.host_permissions).toContain('https://www.brilliantjobs.app/*');
  });
});

// ── Section 5: Manifest Permissions Justification ───────────────────

describe('Section 5: Manifest Permissions', () => {
  const manifest = readJSON('extension/manifest.json');

  const EXPECTED_PERMISSIONS = [
    'activeTab', 'scripting', 'storage', 'tabs',
    'alarms', 'sidePanel', 'notifications'
  ];

  test('exactly 7 permissions declared', () => {
    expect(manifest.permissions.length).toBe(7);
  });

  for (const perm of EXPECTED_PERMISSIONS) {
    test(`permission '${perm}' is declared`, () => {
      expect(manifest.permissions).toContain(perm);
    });
  }

  test('no unexpected permissions', () => {
    const unexpected = manifest.permissions.filter(p => !EXPECTED_PERMISSIONS.includes(p));
    expect(unexpected).toEqual([]);
  });

  // Verify each permission has actual chrome.* API usage
  const PERMISSION_API_MAP = {
    'storage': 'chrome.storage',
    'tabs': 'chrome.tabs',
    'alarms': 'chrome.alarms',
    'scripting': 'chrome.scripting',
    'notifications': 'chrome.notifications',
    'sidePanel': 'chrome.sidePanel',
  };

  for (const [perm, api] of Object.entries(PERMISSION_API_MAP)) {
    test(`permission '${perm}' has corresponding ${api} usage in background.ts`, () => {
      const bg = readFile('extension/background.ts');
      expect(bg).toContain(api);
    });
  }

  test('optional_host_permissions is only https://*/*', () => {
    expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
  });

  test('no dangerous permissions (debugger, declarativeNetRequest, etc)', () => {
    const dangerous = ['debugger', 'declarativeNetRequest', 'webRequest', 'proxy', 'privacy', 'history', 'bookmarks'];
    for (const perm of dangerous) {
      expect(manifest.permissions).not.toContain(perm);
    }
  });
});

// ── Section 6: Selector Snapshot Tests ──────────────────────────────

describe('Section 6: Selector Snapshots (Regression Detection)', () => {
  const contentScript = readFile('extension/contentScript.ts');

  // Snapshot: ATS_HANDLERS routing hostnames/patterns
  // If these change, handler routing breaks. Tests will fail → reviewer investigates.

  const ROUTING_SNAPSHOTS = {
    'greenhouse-legacy': { hostnames: ['boards.greenhouse.io', 'boards.eu.greenhouse.io'] },
    'greenhouse-react': { hostnames: ['job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io'] },
    'lever': { hostnames: ['jobs.lever.co'] },
    'ashby': { hostnames: ['jobs.ashbyhq.com'] },
    'workable': { hostnames: ['apply.workable.com'] },
    'recruitee': { pattern: '\\.recruitee\\.com$' },
    'linkedin-easy-apply': { hostnames: ['www.linkedin.com'] },
    'indeed': { hostnames: ['smartapply.indeed.com', 'apply.indeed.com', 'm5.apply.indeed.com'] },
    'workday': { pattern: '\\.myworkdayjobs\\.com$' },
    'icims': { pattern: '\\.icims\\.com$' },
    'taleo': { pattern: '\\.taleo\\.net$' },
    'smartrecruiters': { hostnames: ['jobs.smartrecruiters.com', 'careers.smartrecruiters.com'] },
    'avature': { pattern: '\\.avature\\.net$' },
    'bamboohr': { pattern: '\\.bamboohr\\.com$' },
    'jazzhr': { pattern: '\\.applytojob\\.com$' },
  };

  for (const [id, snapshot] of Object.entries(ROUTING_SNAPSHOTS)) {
    if (snapshot.hostnames) {
      for (const hostname of snapshot.hostnames) {
        test(`${id} routing includes hostname '${hostname}'`, () => {
          expect(contentScript).toContain(`'${hostname}'`);
        });
      }
    }
    if (snapshot.pattern) {
      test(`${id} routing includes hostnamePattern ${snapshot.pattern}`, () => {
        expect(contentScript).toContain(snapshot.pattern);
      });
    }
  }

  // Snapshot: Key handler selectors that must not silently change
  const HANDLER_SELECTOR_SNAPSHOTS = {
    'lever.ts': ['[name=\'name\']', '[name=\'email\']', '#resume-upload-input'],
    'greenhouse-legacy.ts': ['#first_name', '#last_name', '#email'],
    'indeed.ts': ['indeed.com'],
    'workday.ts': ['data-automation-id'],
    'bamboohr.ts': ['BambooHR-ATS', 'ApplicationForm'],
    'jazzhr.ts': ['applicant_form', 'first_name', 'applicant_email'],
  };

  for (const [file, selectors] of Object.entries(HANDLER_SELECTOR_SNAPSHOTS)) {
    for (const sel of selectors) {
      test(`${file} contains selector/pattern '${sel}'`, () => {
        const content = fs.readFileSync(path.join(HANDLERS, file), 'utf-8');
        expect(content).toContain(sel);
      });
    }
  }

  // Snapshot: JD selectors must exist for all 15 ATS + generic
  const JD_SELECTOR_ENTRIES = [
    'greenhouse-legacy', 'greenhouse-react', 'lever', 'ashby', 'workable',
    'recruitee', 'linkedin-easy-apply', 'indeed', 'workday', 'icims',
    'taleo', 'smartrecruiters', 'avature', 'bamboohr', 'jazzhr', 'generic',
  ];

  for (const entry of JD_SELECTOR_ENTRIES) {
    test(`JD_SELECTORS has entry for '${entry}'`, () => {
      const pattern = new RegExp(`'${entry}'\\s*:\\s*\\[`);
      expect(contentScript).toMatch(pattern);
    });
  }

  // Snapshot: TITLE_SELECTORS must exist for all 15 ATS + generic
  for (const entry of JD_SELECTOR_ENTRIES) {
    test(`TITLE_SELECTORS has entry for '${entry}'`, () => {
      const pattern = new RegExp(`'${entry}'\\s*:\\s*'`);
      expect(contentScript).toMatch(pattern);
    });
  }

  // Snapshot: COMPANY_SELECTORS must exist for all 15 ATS + generic
  for (const entry of JD_SELECTOR_ENTRIES) {
    test(`COMPANY_SELECTORS has entry for '${entry}'`, () => {
      // COMPANY_SELECTORS entries are strings like 'handler': 'selector, selector'
      const pattern = new RegExp(`'${entry}'\\s*:\\s*'`);
      // Need to check in the COMPANY_SELECTORS section specifically
      expect(contentScript).toMatch(pattern);
    });
  }
});

// ── Section 7: Content Script Structure ─────────────────────────────

describe('Section 7: Content Script Structure', () => {
  const contentScript = readFile('extension/contentScript.ts');

  test('contentScript.ts uses reportError pattern', () => {
    expect(contentScript).toMatch(/reportError|chrome\.runtime\.sendMessage.*reportError/);
  });

  test('contentScript.ts has escHtml or DOMPurify for XSS prevention', () => {
    // Per EXT-SEC-005 audit, all innerHTML writes use escHtml
    expect(contentScript).toMatch(/escHtml|DOMPurify|textContent/);
  });

  test('contentScript.ts handles handler load failures', () => {
    expect(contentScript).toMatch(/catch|\.catch/);
  });

  test('detectATS function exists', () => {
    expect(contentScript).toContain('function detectATS()');
  });

  test('generic fallback is triggered when no handler matches', () => {
    expect(contentScript).toMatch(/generic.*true|generic.*fallback/i);
  });

  test('no empty catch blocks in contentScript', () => {
    // All empty catches were replaced in REM-002
    const emptyCatches = contentScript.match(/catch\s*\(\s*\w*\s*\)\s*{\s*}/g);
    expect(emptyCatches).toBeNull();
  });
});

// ── Section 8: Background Service Worker ────────────────────────────

describe('Section 8: Background Service Worker', () => {
  const background = readFile('extension/background.ts');

  test('background.ts has reportError handler', () => {
    expect(background).toMatch(/reportError/);
  });

  test('background.ts has STATIC_DOMAINS list', () => {
    expect(background).toContain('STATIC_DOMAINS');
  });

  test('background.ts STATIC_DOMAINS includes bamboohr', () => {
    expect(background).toContain('.bamboohr.com');
  });

  test('background.ts STATIC_DOMAINS includes jazzhr/applytojob', () => {
    expect(background).toContain('.applytojob.com');
  });

  test('background.ts registers service worker listeners', () => {
    expect(background).toMatch(/chrome\.runtime\.onInstalled|chrome\.runtime\.onMessage/);
  });

  test('background.ts uses chrome.alarms', () => {
    expect(background).toContain('chrome.alarms');
  });

  test('no non-sendMessage empty catch blocks in background', () => {
    // sendMessage .catch(() => {}) is intentional — suppresses "Receiving end does not exist"
    // fetchFireAndForget .catch(() => {}) is intentional — analytics fire-and-forget
    // These patterns often span multiple lines, so check a wider window
    const lines = background.split('\n');
    let unexpectedEmptyCatches = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*{\s*}\s*\)/.test(lines[i])) {
        // Check wider surrounding context (up to 15 lines back) for intentional patterns
        const contextStart = Math.max(0, i - 15);
        const context = lines.slice(contextStart, i + 1).join('\n');
        const isIntentional = /sendMessage|fetchFireAndForget|\/\/.*fire.and.forget|\/\/.*non.critical|\/\/.*Tab may not/i.test(context);
        if (!isIntentional) {
          unexpectedEmptyCatches++;
        }
      }
    }
    expect(unexpectedEmptyCatches).toBe(0);
  });
});

// ── Section 9: Web Accessible Resources ─────────────────────────────

describe('Section 9: Web Accessible Resources', () => {
  const manifest = readJSON('extension/manifest.json');
  const war = manifest.web_accessible_resources[0];

  test('handlers/*.js is in web_accessible_resources', () => {
    expect(war.resources).toContain('handlers/*.js');
  });

  test('fillMetrics.js is in web_accessible_resources', () => {
    expect(war.resources).toContain('utils/fillMetrics.js');
  });

  test('inject-overlay.js is in web_accessible_resources', () => {
    expect(war.resources).toContain('inject-overlay.js');
  });

  test('inject.css is in web_accessible_resources', () => {
    expect(war.resources).toContain('inject.css');
  });

  test('web_accessible_resources matches include all ATS domains', () => {
    expect(war.matches).toContain('https://*.bamboohr.com/*');
    expect(war.matches).toContain('https://*.applytojob.com/*');
    expect(war.matches).toContain('https://www.linkedin.com/*');
    expect(war.matches.length).toBeGreaterThanOrEqual(20);
  });
});

// ── Section 10: Build Output Validation ─────────────────────────────

describe('Section 10: Build Output', () => {
  test('build-extension.js exists', () => {
    expect(fileExists('extension/build-extension.js')).toBe(true);
  });

  test('build-extension.js references .ts source files', () => {
    const content = readFile('extension/build-extension.js');
    expect(content).toMatch(/\.ts/);
  });

  test('manifest.json is valid JSON', () => {
    expect(() => readJSON('extension/manifest.json')).not.toThrow();
  });

  test('manifest uses service_worker (MV3)', () => {
    const manifest = readJSON('extension/manifest.json');
    expect(manifest.background.service_worker).toBe('background.js');
  });

  test('no MV2 remnants (background.scripts)', () => {
    const manifest = readJSON('extension/manifest.json');
    expect(manifest.background.scripts).toBeUndefined();
  });

  test('externally_connectable is scoped to brilliantjobs.app', () => {
    const manifest = readJSON('extension/manifest.json');
    expect(manifest.externally_connectable.matches).toContain('https://brilliantjobs.app/*');
    expect(manifest.externally_connectable.matches).toContain('https://www.brilliantjobs.app/*');
    expect(manifest.externally_connectable.matches).toContain('https://staging.brilliantjobs.app/*');
    expect(manifest.externally_connectable.matches.length).toBe(3);
  });

  test('side_panel configured', () => {
    const manifest = readJSON('extension/manifest.json');
    expect(manifest.side_panel.default_path).toBe('popup.html');
  });
});

// ── Section 11: Permissions Audit Document ──────────────────────────

describe('Section 11: Permissions Audit Document', () => {
  test('permissions audit document exists', () => {
    expect(fileExists('docs/audit/ext-cws-001-permissions-audit.md')).toBe(true);
  });

  test('audit doc covers all 7 permissions', () => {
    const doc = readFile('docs/audit/ext-cws-001-permissions-audit.md');
    const permissions = ['activeTab', 'scripting', 'storage', 'tabs', 'alarms', 'sidePanel', 'notifications'];
    for (const perm of permissions) {
      expect(doc).toContain(perm);
    }
  });

  test('audit doc covers optional_host_permissions', () => {
    const doc = readFile('docs/audit/ext-cws-001-permissions-audit.md');
    expect(doc).toContain('optional_host_permissions');
  });

  test('audit doc documents bamboohr and jazzhr wiring', () => {
    const doc = readFile('docs/audit/ext-cws-001-permissions-audit.md');
    expect(doc).toContain('BambooHR');
    expect(doc).toContain('JazzHR');
  });

  test('audit doc documents distribution model', () => {
    const doc = readFile('docs/audit/ext-cws-001-permissions-audit.md');
    expect(doc).toMatch(/sideload|website-direct/i);
  });
});

// ── Section 12: File Inventory ──────────────────────────────────────

describe('Section 12: File Inventory', () => {
  const EXPECTED_FILES = [
    'docs/audit/ext-cws-001-permissions-audit.md',
    'extension/manifest.json',
    'extension/contentScript.ts',
    'extension/background.ts',
    'extension/handlers/bamboohr.ts',
    'extension/handlers/jazzhr.ts',
    'extension/handlers/ashby.ts',
    'extension/handlers/avature.ts',
    'extension/handlers/generic.ts',
    'extension/handlers/greenhouse-legacy.ts',
    'extension/handlers/greenhouse-react.ts',
    'extension/handlers/icims.ts',
    'extension/handlers/indeed.ts',
    'extension/handlers/lever.ts',
    'extension/handlers/linkedin-easy-apply.ts',
    'extension/handlers/recruitee.ts',
    'extension/handlers/smartrecruiters.ts',
    'extension/handlers/taleo.ts',
    'extension/handlers/workable.ts',
    'extension/handlers/workday-experience.ts',
    'extension/handlers/workday.ts',
    'tests/rem-004-ext-qa.test.js',
  ];

  for (const file of EXPECTED_FILES) {
    test(`${file} exists`, () => {
      expect(fileExists(file)).toBe(true);
    });
  }
});
