#!/usr/bin/env node
/**
 * Extension Build Script v2 — Fingerprint-Randomized Builds
 * 
 * Every invocation produces a unique build:
 *   1. Randomized JS filenames (content.js → c8f2a1.js)
 *   2. Randomized manifest metadata (name, short_name, description)
 *   3. Randomized internal message channel names (cross-file consistent)
 *   4. Dead code injection (random no-op functions + variables)
 *   5. esbuild minification + identifier mangling
 * 
 * Goal: no two downloaded builds share the same file fingerprint,
 * making pattern-based detection by LinkedIn infeasible.
 * 
 * Usage: 
 *   node extension/build-extension.js           # single unique build
 *   node extension/build-extension.js --batch 5  # generate 5 unique builds
 * 
 * Output: extension/dist/{build-id}/  (one folder per unique build)
 */

import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomBytes, createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = join(__dirname, 'dist');

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// JS files to process (minify + randomize)
const JS_FILES = [
  'background.js',
  'content.js',
  'contentScript.js',
  'human-sim.js',
  'interceptor.js',
  'interceptor-bridge.js',
  'popup.js',
  'popup-bridge.js',
  'popup-post.js',
  'supabase.js',
];

// Subdirectory JS files (discovered at runtime)
const HANDLER_FILES = existsSync(join(__dirname, 'handlers'))
  ? readdirSync(join(__dirname, 'handlers')).filter(f => f.endsWith('.js')) : [];
const UTILS_FILES = existsSync(join(__dirname, 'utils'))
  ? readdirSync(join(__dirname, 'utils')).filter(f => f.endsWith('.js')) : [];
const FIELDS_FILES = existsSync(join(__dirname, 'fields'))
  ? readdirSync(join(__dirname, 'fields')).filter(f => f.endsWith('.js')) : [];

// Static files to copy as-is
const STATIC_FILES = [
  'inject.css', 'help.html', 'version.json',
  'icon16.png', 'icon48.png', 'icon128.png',
  'icon16-outline.png', 'icon48-outline.png', 'icon128-outline.png',
];

// Internal message channels to randomize (used across files via chrome.runtime.sendMessage)
const MESSAGE_CHANNELS = [
  'ats:confirmationDetected',
  'ats:fieldsChanged',
  'ats:pageDetected',
  'ats:submitDetected',
  'confirmation_detected',
  'submit_detected',
  'form_submit',
  'button_click',
  'clearInterceptedData',
  'getInterceptedData',
  'interceptedProfileData',
  'getState',
  'startScanner',
  'pauseScanner',
  'resumeScanner',
  'stopScanner',
  'refreshToken',
  'tokenUpdated',
];

// Manifest name/description variation pools
const NAME_VARIANTS = [
  'BJ Career Tools', 'BJ Network', 'BJ Helper', 'BJ Connect',
  'Career Signal', 'Job Radar', 'Network Scout', 'Hire Pulse',
  'Career Lens', 'Job Beacon', 'Work Signal', 'Talent Scan',
];
const DESC_VARIANTS = [
  'Discover jobs through your professional network',
  'Career intelligence and network insights',
  'Professional network job discovery tool',
  'Smart job search companion',
  'Network-powered career discovery',
  'Professional opportunity finder',
  'Job market intelligence assistant',
  'Career network analysis tool',
];

// ═══════════════════════════════════════════════════════════
// RANDOMIZATION HELPERS
// ═══════════════════════════════════════════════════════════

function randomHex(len = 6) {
  return randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
}

function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Generate a map of original filenames → randomized filenames */
function generateFilenameMap() {
  const map = {};
  for (const f of JS_FILES) map[f] = `${randomHex(6)}.js`;
  for (const f of HANDLER_FILES) map[`handlers/${f}`] = `h_${randomHex(5)}.js`;
  for (const f of UTILS_FILES) map[`utils/${f}`] = `u_${randomHex(5)}.js`;
  for (const f of FIELDS_FILES) map[`fields/${f}`] = `f_${randomHex(5)}.js`;
  return map;
}

/** Generate consistent channel name replacements */
function generateChannelMap() {
  const map = {};
  for (const ch of MESSAGE_CHANNELS) {
    if (ch.includes(':')) {
      map[ch] = `${randomHex(3)}:${randomHex(4)}`;
    } else {
      map[ch] = `_${randomHex(6)}`;
    }
  }
  return map;
}

/** Generate random dead code to inject */
function generateDeadCode() {
  const count = 3 + Math.floor(Math.random() * 5);
  const lines = [];
  for (let i = 0; i < count; i++) {
    const v = `_${randomHex(4)}`;
    const kind = Math.random();
    if (kind < 0.3) lines.push(`var ${v}=${Math.floor(Math.random() * 9999)};`);
    else if (kind < 0.6) lines.push(`var ${v}="${randomHex(8)}";`);
    else lines.push(`function ${v}(){return ${Math.random() < 0.5 ? 'true' : 'false'}}`);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════
// FILE PROCESSING
// ═══════════════════════════════════════════════════════════

/** Apply channel name replacements and dead code injection to source */
function transformSource(source, channelMap) {
  let result = source;

  // Replace channel names — longest first to avoid partial matches
  const sorted = Object.keys(channelMap).sort((a, b) => b.length - a.length);
  for (const original of sorted) {
    const replacement = channelMap[original];
    result = result.replaceAll(`'${original}'`, `'${replacement}'`);
    result = result.replaceAll(`"${original}"`, `"${replacement}"`);
  }

  // Inject dead code after first line
  const nl = result.indexOf('\n');
  if (nl > -1) {
    result = result.slice(0, nl + 1) + generateDeadCode() + '\n' + result.slice(nl + 1);
  }

  return result;
}

/** Process a single JS file: transform → minify → write */
function processJsFile(srcPath, outPath, channelMap) {
  let source = readFileSync(srcPath, 'utf-8');
  source = transformSource(source, channelMap);

  const tmpPath = outPath + '.tmp.js';
  writeFileSync(tmpPath, source);

  try {
    buildSync({
      entryPoints: [tmpPath],
      outfile: outPath,
      minify: true,
      minifyWhitespace: true,
      minifyIdentifiers: true,
      minifySyntax: true,
      target: 'chrome120',
      bundle: false,
      legalComments: 'none',
      charset: 'utf8',
    });
  } finally {
    try { unlinkSync(tmpPath); } catch (_) { /* temp file cleanup — best effort */ }
  }
}

/** Build manifest.json with randomized names and file references */
function buildManifest(buildDir, filenameMap) {
  const manifest = JSON.parse(readFileSync(join(__dirname, 'manifest.json'), 'utf-8'));

  // Randomize metadata
  manifest.name = randomPick(NAME_VARIANTS);
  manifest.short_name = manifest.name.split(' ').slice(0, 2).join(' ');
  manifest.description = randomPick(DESC_VARIANTS);
  // Micro-version: 2.11.0.XXXX
  manifest.version = `${manifest.version}.${Math.floor(Math.random() * 9000) + 1000}`;

  // Update service worker reference
  if (manifest.background?.service_worker) {
    manifest.background.service_worker = filenameMap['background.js'];
  }

  // Update content_scripts JS references
  if (manifest.content_scripts) {
    for (const cs of manifest.content_scripts) {
      cs.js = cs.js.map(f => filenameMap[f] || f);
    }
  }

  writeFileSync(join(buildDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

/** Update popup.html script references to randomized filenames */
function buildPopupHtml(buildDir, filenameMap) {
  let html = readFileSync(join(__dirname, 'popup.html'), 'utf-8');
  for (const [original, randomized] of Object.entries(filenameMap)) {
    const baseName = original.split('/').pop();
    html = html.replaceAll(`src="${baseName}"`, `src="${randomized}"`);
    html = html.replaceAll(`src="${original}"`, `src="${randomized}"`);
  }
  writeFileSync(join(buildDir, 'popup.html'), html);
}

// ═══════════════════════════════════════════════════════════
// MAIN BUILD
// ═══════════════════════════════════════════════════════════

function buildOne() {
  const buildId = randomHex(8);
  const buildDir = join(DIST_ROOT, buildId);
  mkdirSync(buildDir, { recursive: true });

  const filenameMap = generateFilenameMap();
  const channelMap = generateChannelMap();

  let totalOrigSize = 0;
  let totalMinSize = 0;
  let fileCount = 0;

  // Helper: process a file and accumulate stats
  function process(srcPath, relKey) {
    if (!existsSync(srcPath)) { console.warn(`  ⚠ Skipping: ${relKey}`); return; }
    const outPath = join(buildDir, filenameMap[relKey]);
    processJsFile(srcPath, outPath, channelMap);
    totalOrigSize += readFileSync(srcPath).length;
    totalMinSize += readFileSync(outPath).length;
    fileCount++;
  }

  // Process all JS
  for (const f of JS_FILES) process(join(__dirname, f), f);
  for (const f of HANDLER_FILES) process(join(__dirname, 'handlers', f), `handlers/${f}`);
  for (const f of UTILS_FILES) process(join(__dirname, 'utils', f), `utils/${f}`);
  for (const f of FIELDS_FILES) process(join(__dirname, 'fields', f), `fields/${f}`);

  // Build manifest + popup.html with randomized refs
  const manifest = buildManifest(buildDir, filenameMap);
  buildPopupHtml(buildDir, filenameMap);

  // Copy static files
  for (const f of STATIC_FILES) {
    const src = join(__dirname, f);
    if (existsSync(src)) { copyFileSync(src, join(buildDir, f)); fileCount++; }
  }

  // Write build manifest (debugging only — strip before shipping)
  writeFileSync(join(buildDir, '_build_manifest.json'), JSON.stringify({
    buildId,
    timestamp: new Date().toISOString(),
    filenameMap,
    channelMap,
    manifestName: manifest.name,
    manifestVersion: manifest.version,
  }, null, 2));

  // Compute build fingerprint hash
  const allFiles = readdirSync(buildDir).filter(f => !f.startsWith('_')).sort();
  const hashInput = allFiles.map(f =>
    createHash('md5').update(readFileSync(join(buildDir, f))).digest('hex')
  ).join('');
  const buildHash = createHash('sha256').update(hashInput).digest('hex').slice(0, 12);

  return { buildId, buildDir, buildHash, totalOrigSize, totalMinSize, fileCount, manifestName: manifest.name };
}

// ═══════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════

const args = process.argv.slice(2);
const batchIdx = args.indexOf('--batch');
const batchCount = batchIdx >= 0 ? parseInt(args[batchIdx + 1]) || 1 : 1;

mkdirSync(DIST_ROOT, { recursive: true });

console.log(`\n🔧 Extension Fingerprint Build v2`);
console.log(`   Generating ${batchCount} unique build(s)...\n`);

const builds = [];
for (let i = 0; i < batchCount; i++) {
  const result = buildOne();
  builds.push(result);
  const pct = ((1 - result.totalMinSize / result.totalOrigSize) * 100).toFixed(0);
  console.log(`✅ Build ${i + 1}/${batchCount}: ${result.buildId}`);
  console.log(`   Hash: ${result.buildHash} | Name: "${result.manifestName}"`);
  console.log(`   ${result.fileCount} files | ${(result.totalOrigSize/1024).toFixed(0)}KB → ${(result.totalMinSize/1024).toFixed(0)}KB (${pct}% smaller)`);
  console.log(`   → ${result.buildDir}\n`);
}

if (batchCount > 1) {
  const hashes = new Set(builds.map(b => b.buildHash));
  if (hashes.size === builds.length) {
    console.log(`🔒 All ${builds.length} builds have unique fingerprints ✓`);
  } else {
    console.warn(`⚠ WARNING: ${builds.length - hashes.size} hash collision(s)`);
  }
}

console.log(`Done.`);
