import { buildSync, transformSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync } from 'fs';
import { createHash } from 'crypto';

// ============================================================
// CS-016 FIX-10: Code-split build — route-based lazy loading
// ============================================================
// Chunks:
//   shell    — app skeleton: globals, routing, auth, tab-guard, lazy-loader
//   feed     — default tab (job feed, sort, query, location)
//   keywords — keyword extraction + company browser (lazy, ~200KB source)
//   pipeline — pipeline tab (lazy)
//   tuning   — tuning tab (lazy)
//   deferred — all other tabs: resumes, stats, billing, settings, etc. (lazy)
//
// Initial payload = shell + feed → target <200KB minified
// ============================================================

const chunks = {
  shell: [
    'js/version.ts',
    'js/globals.ts',
    'js/theme.js',
    'js/sync.ts',
    'js/fingerprint.ts',
    'js/tier-gating.ts',
    'js/lazy-loader.ts',
    'js/tab-guard.js',
    'js/app.js',
    'js/integrations.js',
  ],
  feed: [
    'js/us-filter.js',
    'js/job-feed.js',
    'js/sort-bar.js',
    'js/query-builder.js',
  ],
  keywords: [
    'js/keywords.js',
    'js/browsers.js',
    'js/location.js',
  ],
  pipeline: [
    'js/pipeline.js',
  ],
  tuning: [
    'js/tuning.js',
  ],
  deferred: [
    'js/resumes.js',
    'js/applications.js',
    'js/settings.js',
    'js/stats.js',
    'js/billing.js',
    'js/micro-surveys.js',
    'js/rewrite.js',
    'js/resume-archive.js',
    'js/resume-metrics.js',
    'js/overlay-analytics.js',
    'js/chat.js',
    'js/apply-workflow.js',
    'js/referrals.js',
    'js/referral-outreach.js',
    'js/payl.js',
  ],
};

mkdirSync('dist', { recursive: true });

let totalOrig = 0;
let totalMin = 0;
const report = [];

for (const [name, files] of Object.entries(chunks)) {
  const combined = files.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');
  // CS-P1-015: Use .ts extension so esbuild strips TypeScript type annotations
  const tmpFile = `dist/_tmp_${name}.ts`;

  writeFileSync(tmpFile, combined);

  buildSync({
    entryPoints: [tmpFile],
    outfile: `dist/dashboard-${name}.min.js`,
    minifySyntax: true,
    minifyWhitespace: true,
    minifyIdentifiers: false,
    sourcemap: true,
    target: 'es2020',
    bundle: false,
  });

  unlinkSync(tmpFile);

  const origSize = combined.length;
  const minSize = readFileSync(`dist/dashboard-${name}.min.js`, 'utf-8').length;
  totalOrig += origSize;
  totalMin += minSize;
  report.push({ name, files: files.length, orig: origSize, min: minSize });
}

// Also build the full combined bundle for backward compat / fallback
const allFiles = Object.values(chunks).flat();
const fullCombined = allFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');
writeFileSync('dist/dashboard.js', fullCombined);
writeFileSync('dist/_tmp.ts', fullCombined);

buildSync({
  entryPoints: ['dist/_tmp.ts'],
  outfile: 'dist/dashboard.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});
unlinkSync('dist/_tmp.ts');

const fullMinSize = readFileSync('dist/dashboard.min.js', 'utf-8').length;

// Report
console.log('\n📦 CS-016 Build Report — Code-Split Chunks\n');
console.log('Chunk            Files   Source     Minified');
console.log('─'.repeat(52));
for (const r of report) {
  const pad = (s, n) => String(s).padEnd(n);
  const padR = (s, n) => String(s).padStart(n);
  console.log(
    `${pad(r.name, 17)}${padR(r.files, 3)}   ${padR((r.orig/1024).toFixed(1) + 'KB', 10)}  ${padR((r.min/1024).toFixed(1) + 'KB', 10)}`
  );
}
console.log('─'.repeat(52));

const shellMin = report.find(r => r.name === 'shell').min;
const feedMin = report.find(r => r.name === 'feed').min;
const initialPayload = shellMin + feedMin;

console.log(`\nInitial payload (shell + feed): ${(initialPayload/1024).toFixed(1)}KB`);
console.log(`Full bundle (backward compat):  ${(fullMinSize/1024).toFixed(1)}KB`);
console.log(`Target: <200KB initial ← ${initialPayload < 200 * 1024 ? '✅ PASS' : '❌ FAIL'}`);

// CS-P1-003 FE-006: Generate content hashes for cache-busting verification
const manifest = {};
for (const r of report) {
  const filePath = `dist/dashboard-${r.name}.min.js`;
  const content = readFileSync(filePath);
  const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
  manifest[r.name] = { file: `dashboard-${r.name}.min.js`, hash, size: r.min };
}
// Also hash the full bundle
const fullContent = readFileSync('dist/dashboard.min.js');
const fullHash = createHash('md5').update(fullContent).digest('hex').slice(0, 8);
manifest['full'] = { file: 'dashboard.min.js', hash: fullHash, size: fullMinSize };

// Hash CSS
if (existsSync('dist/styles.css')) {
  const cssContent = readFileSync('dist/styles.css');
  const cssHash = createHash('md5').update(cssContent).digest('hex').slice(0, 8);
  manifest['styles'] = { file: 'styles.css', hash: cssHash, size: cssContent.length };
}

// Write combined build hash (all chunk hashes concatenated and re-hashed)
const combinedHash = createHash('md5')
  .update(Object.values(manifest).map(m => m.hash).join(''))
  .digest('hex').slice(0, 8);
manifest._buildHash = combinedHash;

writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`\n🔒 Content hashes written to dist/manifest.json (build: ${combinedHash})`);
console.log('');

// ============================================================
// CS-P1-015: Compile individual .ts files to .js for direct HTML loading
// HTML pages that use <script src="/js/version.js"> etc. need plain JS.
// The .ts files are the source of truth; .js files are generated.
// ============================================================

const tsFiles = [
  'js/version.ts',
  'js/globals.ts',
  'js/sync.ts',
  'js/fingerprint.ts',
  'js/tier-gating.ts',
  'js/lazy-loader.ts',
  'js/api.ts',
];

for (const tsFile of tsFiles) {
  const jsFile = tsFile.replace('.ts', '.js');
  // Strip types via esbuild transform (no IIFE wrapping — preserves global scope)
  const tsContent = readFileSync(tsFile, 'utf-8');
  const { code } = transformSync(tsContent, {
    loader: 'ts',
    target: 'es2020',
  });
  writeFileSync(jsFile, code);
}

console.log(`\n📝 ${tsFiles.length} .ts files compiled to .js for direct HTML loading`);
