#!/usr/bin/env node
/**
 * Extension Dev Build Script — Clean, Non-Fingerprinted Build
 * EXT-BUILD-001 Session 1
 *
 * Produces a clean development build with three compilation modes:
 *   - Plain: Top-level declarations (for importScripts / <script> tags)
 *   - ESM:   Preserves export default (for dynamic import() in content scripts)
 *   - IIFE:  Self-executing closure (for manifest content_scripts / service worker)
 *
 * Output: extension/dist/dev/
 *
 * Usage:
 *   node extension/build-dev.js
 */

import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, 'dist', 'dev');

// ═══════════════════════════════════════════════════════════
// FILE CLASSIFICATION — Three Build Modes
// ═══════════════════════════════════════════════════════════

// Plain: loaded via importScripts() in service worker or <script> in popup.html
// These must NOT be IIFE-wrapped — their declarations must be global.
const PLAIN_FILES = [
  'supabase.ts',
  'popup-bridge.ts',
  'popup.ts',
  'popup-consumer.ts',
  'popup-post.ts',
  'utils/fetchWithRetry.ts',
  'utils/crypto.ts',
  'utils/autoTracker.ts',
];

// ESM: loaded via dynamic import() in contentScript.ts
// Must preserve `export default { fill }` for handler loading.
const ESM_FILES = [
  'handlers/ashby.ts',
  'handlers/avature.ts',
  'handlers/bamboohr.ts',
  'handlers/generic.ts',
  'handlers/greenhouse-legacy.ts',
  'handlers/greenhouse-react.ts',
  'handlers/icims.ts',
  'handlers/indeed.ts',
  'handlers/jazzhr.ts',
  'handlers/lever.ts',
  'handlers/linkedin-easy-apply.ts',
  'handlers/recruitee.ts',
  'handlers/smartrecruiters.ts',
  'handlers/taleo.ts',
  'handlers/workable.ts',
  'handlers/workday-experience.ts',
  'handlers/workday.ts',
  'utils/fillMetrics.ts',
];

// IIFE: loaded via manifest content_scripts or service worker entry
// Wrapped in (() => { ... })() for isolation.
const IIFE_FILES = [
  'background.ts',
  'contentScript.ts',
  'interceptor.ts',
  'interceptor-bridge.ts',
  'token-sync.ts',
  'content.ts',
  'job-site-overlay.ts',
  'inject-overlay.ts',
  'toolbar-overlay.ts',
  'human-sim.ts',
];

// Static files — copied as-is, no compilation
const STATIC_FILES = [
  'manifest.json',
  'popup.html',
  'inject.css',
  'help.html',
  'version.json',
  'icon16.png',
  'icon48.png',
  'icon128.png',
  'icon16-outline.png',
  'icon48-outline.png',
  'icon128-outline.png',
];

// Additional files that may exist and should be compiled
const EXTRA_TS_FILES = [
  'utils/originGuard.ts',
  'utils/tierGate.ts',
  'utils/jdMatcher.ts',
  'utils/fieldFillerQueue.ts',
  'utils/fileUpload.ts',
  'utils/mutationWatcher.ts',
  'utils/reactProps.ts',
  'utils/applicationTracker.ts',
  'utils/indeedAntiBot.ts',
  'utils/multilingualLabels.ts',
  'utils/resilientDOM.ts',
  'utils/killSwitch.ts',
  'utils/errorReporter.ts',
  'utils/aiAnswerer.ts',
  'fields/textInput.ts',
  'fields/dropdown.ts',
  'fields/dateFields.ts',
  'fields/checkbox.ts',
  'fields/radioGroup.ts',
  'fields/dropdownSearchable.ts',
  'selectors/registry.ts',
  'selectors/job-site-registry.ts',
];

// ═══════════════════════════════════════════════════════════
// BUILD FUNCTIONS
// ═══════════════════════════════════════════════════════════

let errors = 0;
let compiled = 0;

function stripImportsExports(source, mode) {
  let result = source;

  // Remove import type lines
  result = result.replace(/^import\s+type\s+.*$/gm, '');
  // Remove import lines
  result = result.replace(/^import\s+.*from\s+['"].*['"];?\s*$/gm, '');
  // Remove bare imports (import './foo')
  result = result.replace(/^import\s+['"].*['"];?\s*$/gm, '');

  if (mode === 'plain') {
    // Strip ALL export keywords — declarations become plain globals
    result = result.replace(/^export\s+default\s+\{[^}]*\};?\s*$/gm, '');
    result = result.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
    result = result.replace(/^export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*$/gm, '');
    result = result.replace(/^export\s+default\s+(async\s+)?(function|class)\s/gm, '$1$2 ');
    result = result.replace(/^export\s+(const|let|var|function|async|class|enum|interface|type)\s/gm, '$1 ');
  } else if (mode === 'esm') {
    // ESM mode: preserve ALL export statements intact.
    // build-dev.js strips imports (already done above), but exports stay.
    // esbuild format: 'esm' will handle them correctly.
    // No additional stripping needed.
  } else if (mode === 'iife') {
    // Strip all exports — IIFE wrapping handles isolation
    result = result.replace(/^export\s+default\s+\{[^}]*\};?\s*$/gm, '');
    result = result.replace(/^export\s+\{[^}]*\};?\s*$/gm, '');
    result = result.replace(/^export\s+default\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*;?\s*$/gm, '');
    result = result.replace(/^export\s+default\s+(async\s+)?(function|class)\s/gm, '$1$2 ');
    result = result.replace(/^export\s+(const|let|var|function|async|class|enum|interface|type)\s/gm, '$1 ');
  }

  return result;
}

function compileFile(relPath, mode) {
  const srcPath = join(__dirname, relPath);
  if (!existsSync(srcPath)) {
    console.warn(`  ⚠ Skipping (not found): ${relPath}`);
    return null;
  }

  const outName = relPath.replace(/\.ts$/, '.js');
  const outPath = join(DIST_DIR, outName);

  // Ensure output directory exists
  mkdirSync(dirname(outPath), { recursive: true });

  const source = readFileSync(srcPath, 'utf-8');
  const stripped = stripImportsExports(source, mode);

  const tmpPath = outPath + '.tmp.ts';
  writeFileSync(tmpPath, stripped);

  try {
    if (mode === 'esm') {
      buildSync({
        entryPoints: [tmpPath],
        outfile: outPath,
        bundle: true,
        format: 'esm',
        target: 'chrome120',
        legalComments: 'none',
        charset: 'utf8',
        logLevel: 'silent',
      });
    } else if (mode === 'iife') {
      buildSync({
        entryPoints: [tmpPath],
        outfile: outPath,
        bundle: true,
        format: 'iife',
        target: 'chrome120',
        legalComments: 'none',
        charset: 'utf8',
        logLevel: 'silent',
      });
    } else {
      // Plain mode — no bundling, just transpile TS to JS
      buildSync({
        entryPoints: [tmpPath],
        outfile: outPath,
        bundle: false,
        target: 'chrome120',
        legalComments: 'none',
        charset: 'utf8',
        logLevel: 'silent',
      });
    }
    compiled++;
    const size = statSync(outPath).size;
    console.log(`  ✅ ${outName} (${mode}, ${(size / 1024).toFixed(1)}KB)`);
    return outPath;
  } catch (err) {
    errors++;
    console.error(`  ❌ ${outName} (${mode}): ${err.message?.split('\n')[0] || err}`);
    return null;
  } finally {
    try { unlinkSync(tmpPath); } catch (_) { /* cleanup */ }
  }
}

function copyStatic(relPath) {
  const srcPath = join(__dirname, relPath);
  if (!existsSync(srcPath)) {
    console.warn(`  ⚠ Skipping static (not found): ${relPath}`);
    return;
  }
  const outPath = join(DIST_DIR, relPath);
  mkdirSync(dirname(outPath), { recursive: true });

  // For popup.html, replace .ts references with .js
  if (relPath === 'popup.html') {
    let html = readFileSync(srcPath, 'utf-8');
    html = html.replace(/src="([^"]+)\.ts"/g, 'src="$1.js"');
    writeFileSync(outPath, html);
  } else {
    copyFileSync(srcPath, outPath);
  }

  const size = statSync(outPath).size;
  console.log(`  📄 ${relPath} (${(size / 1024).toFixed(1)}KB)`);
}

// ═══════════════════════════════════════════════════════════
// MAIN BUILD
// ═══════════════════════════════════════════════════════════

console.log('\n🔧 Extension Dev Build (EXT-BUILD-001)\n');

// Clean output directory
mkdirSync(DIST_DIR, { recursive: true });

// Compile Plain files
console.log('── Plain (importScripts / <script>) ──');
for (const f of PLAIN_FILES) compileFile(f, 'plain');

// Compile ESM files
console.log('\n── ESM (dynamic import) ──');
for (const f of ESM_FILES) compileFile(f, 'esm');

// Compile IIFE files
console.log('\n── IIFE (content_scripts / service_worker) ──');
for (const f of IIFE_FILES) compileFile(f, 'iife');

// Compile extra TS files as IIFE (default safe mode)
console.log('\n── Extra TS files (IIFE default) ──');
for (const f of EXTRA_TS_FILES) compileFile(f, 'iife');

// Copy static files
console.log('\n── Static files ──');
for (const f of STATIC_FILES) copyStatic(f);

// Verify manifest references resolve
console.log('\n── Manifest verification ──');
const manifestPath = join(DIST_DIR, 'manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  let manifestErrors = 0;

  // Check service_worker
  const sw = manifest.background?.service_worker;
  if (sw && !existsSync(join(DIST_DIR, sw))) {
    console.error(`  ❌ service_worker not found: ${sw}`);
    manifestErrors++;
  }

  // Check content_scripts
  for (const cs of (manifest.content_scripts || [])) {
    for (const js of (cs.js || [])) {
      if (!existsSync(join(DIST_DIR, js))) {
        console.error(`  ❌ content_script not found: ${js}`);
        manifestErrors++;
      }
    }
  }

  if (manifestErrors === 0) {
    console.log('  ✅ All manifest references resolve');
  }
  errors += manifestErrors;
}

// Verify popup.html script references
const popupPath = join(DIST_DIR, 'popup.html');
if (existsSync(popupPath)) {
  const popupHtml = readFileSync(popupPath, 'utf-8');
  const scriptRefs = popupHtml.match(/src="([^"]+\.js)"/g) || [];
  let popupErrors = 0;
  for (const ref of scriptRefs) {
    const file = ref.match(/src="([^"]+)"/)?.[1];
    if (file && !existsSync(join(DIST_DIR, file))) {
      console.error(`  ❌ popup.html script not found: ${file}`);
      popupErrors++;
    }
  }
  if (popupErrors === 0 && scriptRefs.length > 0) {
    console.log(`  ✅ All popup.html script refs resolve (${scriptRefs.length} scripts)`);
  }
  errors += popupErrors;
}

// Count output files
const countFiles = (dir) => {
  let count = 0;
  if (!existsSync(dir)) return 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) count += countFiles(join(dir, entry.name));
    else count++;
  }
  return count;
};
const totalFiles = countFiles(DIST_DIR);

// Summary
console.log('\n═══════════════════════════════════════');
console.log(`  Compiled: ${compiled} files`);
console.log(`  Static:   ${STATIC_FILES.length} files`);
console.log(`  Total:    ${totalFiles} files in dist/dev/`);
console.log(`  Errors:   ${errors}`);
console.log('═══════════════════════════════════════\n');

if (errors > 0) {
  console.error(`❌ Build failed with ${errors} error(s)`);
  process.exit(1);
} else {
  console.log('✅ Build succeeded\n');
}
