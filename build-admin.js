import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
  'js/version.js',
  'js/globals.js',
  'js/admin.js',
  'js/admin-blocks.js',
  'js/admin-companies.js',
  'js/admin-jobs.js',
  'js/admin-email.js',
  'js/admin-notifications.js',
  'js/admin-signals.js',
  'js/admin-feed-health.js',
  'js/admin-cache-health.js',
  'js/admin-enrichment.js',
  'js/admin-seo.js',
  'js/admin-content.js',
  'js/admin-merch.js',
  'js/admin-referrals.js',
  'js/admin-shell.js',
];

const combined = jsFiles.map(f => '// === ' + f + ' ===\n' + readFileSync(f, 'utf-8')).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/admin.js', combined);
writeFileSync('dist/_tmp_admin.js', combined);

buildSync({
  entryPoints: ['dist/_tmp_admin.js'],
  outfile: 'dist/admin.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});

unlinkSync('dist/_tmp_admin.js');

const origSize = combined.length;
const minSize = readFileSync('dist/admin.min.js', 'utf-8').length;
console.log('dist/admin.min.js built');
console.log(jsFiles.length + ' files => ' + (origSize/1024).toFixed(1) + 'KB => ' + (minSize/1024).toFixed(1) + 'KB minified');
