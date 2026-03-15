/**
 * EXT-BUILD-001-S3 — CI Gate + Release Process + build-extension.js Three-Mode Fix
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const EXT = join(ROOT, 'extension');
const DIST_DEV = join(EXT, 'dist', 'dev');

// ═══════════════════════════════════════════════════════════
// Section 1: S3.1 — CI gate
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — CI gate', () => {
  const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');

  it('ci.yml has ext-build job', () => {
    expect(ci).toContain('ext-build:');
    expect(ci).toContain('Gate 10: Extension Build');
  });

  it('ext-build job runs build-dev.js', () => {
    expect(ci).toContain('node extension/build-dev.js');
  });

  it('ext-build job installs esbuild', () => {
    expect(ci).toContain('npm install esbuild');
  });

  it('ext-build job verifies file count ≥ 60', () => {
    expect(ci).toContain('find extension/dist/dev -type f');
    expect(ci).toMatch(/-lt 60/);
  });

  it('ext-build job verifies manifest references', () => {
    expect(ci).toContain('service_worker');
    expect(ci).toContain('content_scripts');
  });

  it('ext-build job verifies ESM handlers have exports', () => {
    expect(ci).toContain('grep -q "export"');
    expect(ci).toContain('handlers');
  });

  it('ext-build is in all-gates needs array', () => {
    expect(ci).toMatch(/needs:.*ext-build/);
  });

  it('all-gates checks ext-build result', () => {
    expect(ci).toContain("needs.ext-build.result != 'success'");
    expect(ci).toContain("needs.ext-build.result == 'success'");
  });

  it('all-gates summary says 19 gates', () => {
    expect(ci).toContain('19 quality gates');
  });

  it('ext-build is BLOCKING (in needs array)', () => {
    const allGatesLine = ci.split('\n').find(l => l.includes('needs:') && l.includes('ext-build'));
    expect(allGatesLine).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════
// Section 2: S3.2 — Release process docs
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — Release process docs', () => {
  const docPath = join(ROOT, 'docs', 'extension-release-process.md');

  it('docs/extension-release-process.md exists', () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it('documents 7 release steps', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('### 1.');
    expect(content).toContain('### 2.');
    expect(content).toContain('### 3.');
    expect(content).toContain('### 4.');
    expect(content).toContain('### 5.');
    expect(content).toContain('### 6.');
    expect(content).toContain('### 7.');
  });

  it('mentions build-dev.js', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('build-dev.js');
  });

  it('mentions upload-extension-source.js', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('upload-extension-source.js');
  });

  it('mentions extension-version EF', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('extension-version');
  });

  it('mentions CI gate', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('gate-ext-build');
    expect(content).toContain('BLOCKING');
  });

  it('documents three compilation modes', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('Plain');
    expect(content).toContain('ESM');
    expect(content).toContain('IIFE');
  });

  it('documents fingerprinting', () => {
    const content = readFileSync(docPath, 'utf-8');
    expect(content).toContain('Channel map');
    expect(content).toContain('bj_channel_map');
  });
});

// ═══════════════════════════════════════════════════════════
// Section 3: S3.3 — build-extension.js three-mode fix
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — build-extension.js three-mode', () => {
  const buildExt = readFileSync(join(EXT, 'build-extension.js'), 'utf-8');

  it('has PLAIN_FILES array', () => {
    expect(buildExt).toContain('const PLAIN_FILES');
  });

  it('has IIFE_FILES array', () => {
    expect(buildExt).toContain('const IIFE_FILES');
  });

  it('has PLAIN_UTILS array', () => {
    expect(buildExt).toContain('const PLAIN_UTILS');
  });

  it('has ESM_UTILS array', () => {
    expect(buildExt).toContain('const ESM_UTILS');
  });

  it('has SELECTORS_FILES discovery', () => {
    expect(buildExt).toContain('SELECTORS_FILES');
    expect(buildExt).toContain("'selectors'");
  });

  it('transformSource accepts format parameter', () => {
    expect(buildExt).toMatch(/function transformSource\(source, channelMap, format/);
  });

  it('processJsFile accepts format parameter', () => {
    expect(buildExt).toMatch(/function processJsFile\(srcPath, outPath, channelMap, format/);
  });

  it('ESM format preserves exports in transformSource', () => {
    expect(buildExt).toContain("format === 'esm'");
    expect(buildExt).toContain('preserve ALL export statements');
  });

  it('processJsFile uses format-specific esbuild options', () => {
    expect(buildExt).toContain("esbuildOpts.format = 'esm'");
    expect(buildExt).toContain("esbuildOpts.format = 'iife'");
  });

  it('buildOne processes files by format category', () => {
    expect(buildExt).toContain("'plain'");
    expect(buildExt).toContain("'esm'");
    expect(buildExt).toContain("'iife'");
  });

  it('handlers processed as ESM', () => {
    expect(buildExt).toMatch(/HANDLER_FILES.*'esm'/);
  });

  it('PLAIN_FILES includes supabase.ts and popup-consumer.ts', () => {
    expect(buildExt).toContain("'supabase.ts'");
    expect(buildExt).toContain("'popup-consumer.ts'");
  });

  it('IIFE_FILES includes background.ts and contentScript.ts', () => {
    expect(buildExt).toContain("'background.ts'");
    expect(buildExt).toContain("'contentScript.ts'");
  });
});

// ═══════════════════════════════════════════════════════════
// Section 4: S3.4 — Build output format verification
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — Build output format verification', () => {
  it('build-dev.js output exists with 60+ files', () => {
    expect(existsSync(DIST_DEV)).toBe(true);
    let count = 0;
    function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else count++;
      }
    }
    walk(DIST_DEV);
    expect(count).toBeGreaterThanOrEqual(60);
  });

  it('Plain files NOT IIFE-wrapped', () => {
    const plains = ['supabase.js', 'popup.js', 'popup-consumer.js'];
    for (const f of plains) {
      const p = join(DIST_DEV, f);
      if (!existsSync(p)) continue;
      const c = readFileSync(p, 'utf-8');
      expect(c, `${f} should not be IIFE`).not.toMatch(/^\s*\(\(\) => \{/);
    }
  });

  it('IIFE files start with closure wrapper', () => {
    const iifes = ['background.js', 'contentScript.js', 'job-site-overlay.js'];
    for (const f of iifes) {
      const p = join(DIST_DEV, f);
      if (!existsSync(p)) continue;
      const c = readFileSync(p, 'utf-8');
      expect(c, `${f} should be IIFE`).toMatch(/\(\(\)\s*=>\s*\{/);
    }
  });

  it('All 17 ESM handlers have export statements', () => {
    const handlers = readdirSync(join(DIST_DEV, 'handlers')).filter(f => f.endsWith('.js'));
    expect(handlers.length).toBe(17);
    for (const h of handlers) {
      const c = readFileSync(join(DIST_DEV, 'handlers', h), 'utf-8');
      expect(c, `${h} should have export`).toMatch(/export\s*\{/);
    }
  });

  it('All manifest references resolve', () => {
    const m = JSON.parse(readFileSync(join(DIST_DEV, 'manifest.json'), 'utf-8'));
    const sw = m.background?.service_worker;
    if (sw) expect(existsSync(join(DIST_DEV, sw))).toBe(true);
    for (const cs of (m.content_scripts || [])) {
      for (const js of (cs.js || [])) {
        expect(existsSync(join(DIST_DEV, js)), `content_script: ${js}`).toBe(true);
      }
    }
  });

  it('popup.html script refs all resolve', () => {
    const html = readFileSync(join(DIST_DEV, 'popup.html'), 'utf-8');
    const refs = html.match(/src="([^"]+\.js)"/g) || [];
    for (const ref of refs) {
      const file = ref.match(/src="([^"]+)"/)?.[1];
      if (file) expect(existsSync(join(DIST_DEV, file)), `popup: ${file}`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// Section 5: Build-extension EF file list parity
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — EF file list parity', () => {
  const ef = readFileSync(join(ROOT, 'supabase', 'functions', 'build-extension', 'index.ts'), 'utf-8');

  it('EF plainFiles matches build-dev.js PLAIN_FILES count', () => {
    const efPlain = (ef.match(/"[a-z].*\.js"/g) || []).filter(m => {
      const inPlain = ef.indexOf(m) > ef.indexOf('const plainFiles') && ef.indexOf(m) < ef.indexOf('const esmFiles');
      return inPlain;
    });
    expect(efPlain.length).toBeGreaterThanOrEqual(5);
  });

  it('EF has all 17 handler files in esmFiles', () => {
    const handlerMatches = ef.match(/"handlers\/[a-z-]+\.js"/g) || [];
    expect(handlerMatches.length).toBe(17);
  });

  it('EF has fillMetrics in esmFiles', () => {
    expect(ef).toContain('"utils/fillMetrics.js"');
    // Should be in esmFiles section
    const fillIdx = ef.indexOf('"utils/fillMetrics.js"');
    const esmIdx = ef.indexOf('const esmFiles');
    const iifeIdx = ef.indexOf('const iifeFiles');
    expect(fillIdx).toBeGreaterThan(esmIdx);
    expect(fillIdx).toBeLessThan(iifeIdx);
  });
});

// ═══════════════════════════════════════════════════════════
// Section 6: File inventory
// ═══════════════════════════════════════════════════════════
describe('EXT-BUILD-001-S3 — File inventory', () => {
  it('.github/workflows/ci.yml modified (ext-build gate)', () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf-8');
    expect(ci).toContain('ext-build');
  });

  it('docs/extension-release-process.md created', () => {
    expect(existsSync(join(ROOT, 'docs', 'extension-release-process.md'))).toBe(true);
  });

  it('extension/build-extension.js modified (three-mode)', () => {
    const be = readFileSync(join(EXT, 'build-extension.js'), 'utf-8');
    expect(be).toContain('PLAIN_FILES');
    expect(be).toContain('ESM_UTILS');
  });

  it('tests/ext-build-001-s3-ci-release.test.js created', () => {
    expect(existsSync(join(ROOT, 'tests', 'ext-build-001-s3-ci-release.test.js'))).toBe(true);
  });
});
