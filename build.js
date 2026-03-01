import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
  'js/version.js',
  'js/globals.js',
  'js/sync.js',
  'js/query-builder.js',
  'js/job-feed.js',
  'js/sort-bar.js',
  'js/keywords.js',
  'js/browsers.js',
  'js/location.js',
  'js/pipeline.js',
  'js/tuning.js',
  'js/resumes.js',
  'js/integrations.js',
  'js/applications.js',
  'js/settings.js',
  'js/stats.js',
  'js/admin.js',
  'js/admin-notifications.js',
  'js/billing.js',
  'js/micro-surveys.js',
  'js/rewrite.js',
  'js/resume-archive.js',
  'js/resume-metrics.js',
  'js/tier-gating.js',
  'js/apply-workflow.js',
  'js/fingerprint.js',
  'js/referrals.js',
  'js/app.js',
];

// Simple concatenation — no IIFE wrapper needed.
// Browser <script> tags run in sloppy mode where function re-declarations are fine.
// NOTE: const/let re-declarations in the same scope WILL fail in esbuild.
// Fix: eliminate duplicate const declarations within single files (see app.js init() fix).
const combined = jsFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/dashboard.js', combined);
writeFileSync('dist/_tmp.js', combined);

buildSync({
  entryPoints: ['dist/_tmp.js'],
  outfile: 'dist/dashboard.min.js',
  minify: true,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});

unlinkSync('dist/_tmp.js');

const origSize = combined.length;
const minSize = readFileSync('dist/dashboard.min.js', 'utf-8').length;
console.log(`✅ dist/dashboard.min.js`);
console.log(`   ${jsFiles.length} files → ${(origSize/1024).toFixed(1)}KB → ${(minSize/1024).toFixed(1)}KB minified (${((1-minSize/origSize)*100).toFixed(0)}% smaller)`);
