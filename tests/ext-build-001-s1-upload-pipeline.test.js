/**
 * EXT-BUILD-001-S1 — Upload Pipeline + EF File List Update + Bug Fixes
 * Tests: build-dev.js output, upload script, build-extension EF updates, B3, B6
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const DIST_DEV = join(EXT, 'dist', 'dev');

// ═══════════════════════════════════════════════════════════
// Helper: recursively collect files
// ═══════════════════════════════════════════════════════════
function collectFiles(dir) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

// ═══════════════════════════════════════════════════════════
// Section 1: build-dev.js exists and produces correct output
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — build-dev.js', () => {
  it('build-dev.js exists in extension/', () => {
    expect(existsSync(join(EXT, 'build-dev.js'))).toBe(true);
  });

  it('dist/dev/ directory exists with compiled output', () => {
    expect(existsSync(DIST_DEV)).toBe(true);
    const files = collectFiles(DIST_DEV);
    expect(files.length).toBeGreaterThanOrEqual(60);
  });

  it('compiled at least 58 JS files', () => {
    const files = collectFiles(DIST_DEV).filter(f => f.endsWith('.js'));
    expect(files.length).toBeGreaterThanOrEqual(58);
  });

  it('contains all 11 static files', () => {
    const statics = ['manifest.json', 'popup.html', 'inject.css', 'help.html', 'version.json',
      'icon16.png', 'icon48.png', 'icon128.png', 'icon16-outline.png', 'icon48-outline.png', 'icon128-outline.png'];
    for (const f of statics) {
      expect(existsSync(join(DIST_DEV, f)), `static file: ${f}`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: Three build modes — Plain / ESM / IIFE
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — Build mode verification', () => {
  it('Plain files are NOT IIFE-wrapped (supabase.js)', () => {
    const content = readFileSync(join(DIST_DEV, 'supabase.js'), 'utf-8');
    expect(content).not.toMatch(/^\s*\(\(\) => \{/);
    expect(content).toContain('SUPABASE_URL');
  });

  it('Plain files are NOT IIFE-wrapped (popup.js)', () => {
    const path = join(DIST_DEV, 'popup.js');
    if (!existsSync(path)) return; // skip if not built
    const content = readFileSync(path, 'utf-8');
    expect(content).not.toMatch(/^\s*\(\(\) => \{/);
  });

  it('ESM handler files preserve export default (lever.js)', () => {
    const content = readFileSync(join(DIST_DEV, 'handlers', 'lever.js'), 'utf-8');
    expect(content).toMatch(/export\s*\{/);
  });

  it('ESM handler files preserve export default (greenhouse-react.js)', () => {
    const path = join(DIST_DEV, 'handlers', 'greenhouse-react.js');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toMatch(/export\s*\{/);
  });

  it('ESM handler files preserve export default (indeed.js)', () => {
    const path = join(DIST_DEV, 'handlers', 'indeed.js');
    if (!existsSync(path)) return;
    const content = readFileSync(path, 'utf-8');
    expect(content).toMatch(/export\s*\{/);
  });

  it('All 17 handlers have export statements', () => {
    const handlers = ['ashby', 'avature', 'bamboohr', 'generic', 'greenhouse-legacy',
      'greenhouse-react', 'icims', 'indeed', 'jazzhr', 'lever', 'linkedin-easy-apply',
      'recruitee', 'smartrecruiters', 'taleo', 'workable', 'workday-experience', 'workday'];
    for (const h of handlers) {
      const path = join(DIST_DEV, 'handlers', `${h}.js`);
      if (!existsSync(path)) continue;
      const content = readFileSync(path, 'utf-8');
      expect(content, `handler ${h} should have export`).toMatch(/export\s*\{/);
    }
  });

  it('IIFE files start with closure wrapper (background.js)', () => {
    const content = readFileSync(join(DIST_DEV, 'background.js'), 'utf-8');
    expect(content).toMatch(/\(\(\)\s*=>\s*\{/);
  });

  it('IIFE files start with closure wrapper (contentScript.js)', () => {
    const content = readFileSync(join(DIST_DEV, 'contentScript.js'), 'utf-8');
    expect(content).toMatch(/\(\(\)\s*=>\s*\{/);
  });

  it('IIFE files start with closure wrapper (job-site-overlay.js)', () => {
    const content = readFileSync(join(DIST_DEV, 'job-site-overlay.js'), 'utf-8');
    expect(content).toMatch(/\(\(\)\s*=>\s*\{/);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: Manifest references resolve
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — Manifest verification', () => {
  const manifest = JSON.parse(readFileSync(join(DIST_DEV, 'manifest.json'), 'utf-8'));

  it('service_worker reference resolves', () => {
    const sw = manifest.background?.service_worker;
    expect(sw).toBeTruthy();
    expect(existsSync(join(DIST_DEV, sw))).toBe(true);
  });

  it('all content_scripts JS references resolve', () => {
    for (const cs of (manifest.content_scripts || [])) {
      for (const js of (cs.js || [])) {
        expect(existsSync(join(DIST_DEV, js)), `content_script: ${js}`).toBe(true);
      }
    }
  });

  it('web_accessible_resources reference patterns', () => {
    const war = manifest.web_accessible_resources;
    expect(war).toBeTruthy();
    expect(war.length).toBeGreaterThanOrEqual(1);
    const resources = war[0].resources;
    expect(resources).toContain('job-site-overlay.js');
    expect(resources).toContain('toolbar-overlay.js');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: popup.html script references
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — popup.html verification', () => {
  const popupHtml = readFileSync(join(DIST_DEV, 'popup.html'), 'utf-8');

  it('popup.html references .js files (not .ts)', () => {
    expect(popupHtml).not.toMatch(/src="[^"]+\.ts"/);
  });

  it('all popup.html script refs resolve to files in dist/dev/', () => {
    const refs = popupHtml.match(/src="([^"]+\.js)"/g) || [];
    expect(refs.length).toBeGreaterThanOrEqual(1);
    for (const ref of refs) {
      const file = ref.match(/src="([^"]+)"/)?.[1];
      if (file) {
        expect(existsSync(join(DIST_DEV, file)), `popup script: ${file}`).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: Bug B3 — version.json sync
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — B3: version.json sync', () => {
  const versionJson = JSON.parse(readFileSync(join(EXT, 'version.json'), 'utf-8'));
  const manifestJson = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf-8'));

  it('version.json version is 3.0.0', () => {
    expect(versionJson.version).toBe('3.0.0');
  });

  it('manifest.json version is 3.0.0', () => {
    expect(manifestJson.version).toBe('3.0.0');
  });

  it('version.json and manifest.json versions match', () => {
    expect(versionJson.version).toBe(manifestJson.version);
  });

  it('version.json build references EXT-BUILD-001', () => {
    expect(versionJson.build).toContain('ext-build-001');
  });

  it('version.json lists all 17 handlers', () => {
    const handlerKeys = Object.keys(versionJson.files).filter(k => k.startsWith('handlers/'));
    expect(handlerKeys.length).toBe(17);
  });

  it('version.json lists utils files', () => {
    const utilKeys = Object.keys(versionJson.files).filter(k => k.startsWith('utils/'));
    expect(utilKeys.length).toBeGreaterThanOrEqual(10);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: Bug B6 — LinkedIn in contentScript matches
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — B6: LinkedIn job-site-overlay injection', () => {
  const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf-8'));

  it('LinkedIn URL pattern is in contentScript.js content_scripts matches', () => {
    const cs2 = manifest.content_scripts[2]; // contentScript.js entry
    expect(cs2.js).toContain('contentScript.js');
    expect(cs2.matches).toContain('https://www.linkedin.com/*');
  });

  it('LinkedIn URL is first in matches (highest traffic site)', () => {
    const cs2 = manifest.content_scripts[2];
    expect(cs2.matches[0]).toBe('https://www.linkedin.com/*');
  });

  it('job-site-overlay has LinkedIn selectors in registry', () => {
    const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
    expect(overlay).toContain('linkedin');
    expect(overlay).toMatch(/linkedin/);
  });

  it('toolbar-overlay has guard to skip when job-site-overlay is active', () => {
    const toolbar = readFileSync(join(EXT, 'toolbar-overlay.ts'), 'utf-8');
    expect(toolbar).toContain('_bjJobSiteOverlay');
    expect(toolbar).toContain('EXT-BUILD-001 B6');
  });

  it('job-site-overlay removes old toolbar-overlay on init', () => {
    const overlay = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
    expect(overlay).toContain('bj-toolbar-shadow-host');
    expect(overlay).toContain('EXT-BUILD-001 B6');
  });

  it('LinkedIn still in interceptor content_scripts (backward compat)', () => {
    const cs0 = manifest.content_scripts[0];
    expect(cs0.matches).toContain('https://www.linkedin.com/*');
    expect(cs0.js).toContain('interceptor.js');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 7: Upload script exists
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — Upload script', () => {
  it('scripts/upload-extension-source.js exists', () => {
    expect(existsSync(join(ROOT, 'scripts', 'upload-extension-source.js'))).toBe(true);
  });

  it('upload script references correct bucket and prefix', () => {
    const content = readFileSync(join(ROOT, 'scripts', 'upload-extension-source.js'), 'utf-8');
    expect(content).toContain("'extension-source'");
    expect(content).toContain("'v4'");
  });

  it('upload script reads from extension/dist/dev/', () => {
    const content = readFileSync(join(ROOT, 'scripts', 'upload-extension-source.js'), 'utf-8');
    expect(content).toContain('dist');
    expect(content).toContain('dev');
  });

  it('upload script has MIME type mapping for all file types', () => {
    const content = readFileSync(join(ROOT, 'scripts', 'upload-extension-source.js'), 'utf-8');
    expect(content).toContain('application/javascript');
    expect(content).toContain('text/html');
    expect(content).toContain('application/json');
    expect(content).toContain('text/css');
    expect(content).toContain('image/png');
  });

  it('upload script uses upsert mode', () => {
    const content = readFileSync(join(ROOT, 'scripts', 'upload-extension-source.js'), 'utf-8');
    expect(content).toContain('x-upsert');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 8: build-extension EF file list update
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — build-extension EF', () => {
  const efContent = readFileSync(join(ROOT, 'supabase', 'functions', 'build-extension', 'index.ts'), 'utf-8');

  it('EF has plainFiles array', () => {
    expect(efContent).toContain('const plainFiles');
  });

  it('EF has esmFiles array', () => {
    expect(efContent).toContain('const esmFiles');
  });

  it('EF has iifeFiles array', () => {
    expect(efContent).toContain('const iifeFiles');
  });

  it('EF has staticFiles array', () => {
    expect(efContent).toContain('const staticFiles');
  });

  it('EF plainFiles includes supabase.js and popup-consumer.js', () => {
    expect(efContent).toContain('"supabase.js"');
    expect(efContent).toContain('"popup-consumer.js"');
  });

  it('EF esmFiles includes all 17 handlers', () => {
    const handlers = ['ashby', 'avature', 'bamboohr', 'generic', 'greenhouse-legacy',
      'greenhouse-react', 'icims', 'indeed', 'jazzhr', 'lever', 'linkedin-easy-apply',
      'recruitee', 'smartrecruiters', 'taleo', 'workable', 'workday-experience', 'workday'];
    for (const h of handlers) {
      expect(efContent, `EF should list ${h}`).toContain(`"handlers/${h}.js"`);
    }
  });

  it('EF iifeFiles includes job-site-overlay.js', () => {
    expect(efContent).toContain('"job-site-overlay.js"');
  });

  it('EF transformSource accepts format parameter', () => {
    expect(efContent).toMatch(/format:\s*['"]plain['"].*\|.*['"]esm['"].*\|.*['"]iife['"]/);
  });

  it('EF icon list includes outline variants', () => {
    expect(efContent).toContain('icon16-outline.png');
    expect(efContent).toContain('icon48-outline.png');
    expect(efContent).toContain('icon128-outline.png');
  });

  it('EF version.json override uses 3.0.0', () => {
    expect(efContent).toContain('"3.0.0"');
  });

  it('EF no longer references old v2.x-only file list', () => {
    // Should NOT have the old flat sourceFiles array
    expect(efContent).not.toContain('const sourceFiles = [');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 9: File inventory
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — File inventory', () => {
  it('extension/build-dev.js created', () => {
    expect(existsSync(join(EXT, 'build-dev.js'))).toBe(true);
  });

  it('scripts/upload-extension-source.js created', () => {
    expect(existsSync(join(ROOT, 'scripts', 'upload-extension-source.js'))).toBe(true);
  });

  it('extension/version.json modified (3.0.0)', () => {
    const v = JSON.parse(readFileSync(join(EXT, 'version.json'), 'utf-8'));
    expect(v.version).toBe('3.0.0');
  });

  it('extension/manifest.json modified (LinkedIn in contentScript)', () => {
    const m = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf-8'));
    expect(m.content_scripts[2].matches).toContain('https://www.linkedin.com/*');
  });

  it('supabase/functions/build-extension/index.ts modified', () => {
    const content = readFileSync(join(ROOT, 'supabase', 'functions', 'build-extension', 'index.ts'), 'utf-8');
    expect(content).toContain('plainFiles');
    expect(content).toContain('esmFiles');
    expect(content).toContain('iifeFiles');
  });

  it('extension/toolbar-overlay.ts modified (B6 guard)', () => {
    const content = readFileSync(join(EXT, 'toolbar-overlay.ts'), 'utf-8');
    expect(content).toContain('_bjJobSiteOverlay');
  });

  it('extension/job-site-overlay.ts modified (B6 reconciliation)', () => {
    const content = readFileSync(join(EXT, 'job-site-overlay.ts'), 'utf-8');
    expect(content).toContain('bj-toolbar-shadow-host');
    expect(content).toContain('_bjToolbarOverlayActive');
  });

  it('tests/ext-build-001-s1-upload-pipeline.test.js created', () => {
    expect(existsSync(join(ROOT, 'tests', 'ext-build-001-s1-upload-pipeline.test.js'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 10: Handler subdirectory completeness
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S1 — Handler completeness', () => {
  const expectedHandlers = ['ashby', 'avature', 'bamboohr', 'generic', 'greenhouse-legacy',
    'greenhouse-react', 'icims', 'indeed', 'jazzhr', 'lever', 'linkedin-easy-apply',
    'recruitee', 'smartrecruiters', 'taleo', 'workable', 'workday-experience', 'workday'];

  it('all 17 handlers compiled to dist/dev/handlers/', () => {
    for (const h of expectedHandlers) {
      const path = join(DIST_DEV, 'handlers', `${h}.js`);
      expect(existsSync(path), `handler: ${h}.js`).toBe(true);
    }
  });

  it('all 17 handler source .ts files exist', () => {
    for (const h of expectedHandlers) {
      const path = join(EXT, 'handlers', `${h}.ts`);
      expect(existsSync(path), `source: ${h}.ts`).toBe(true);
    }
  });
});
