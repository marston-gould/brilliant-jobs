import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';

const jsFiles = [
  'js/version.ts',
  'js/globals.ts',
  'js/admin.js',
  'js/admin-blocks.js',
  'js/admin-companies.js',
  'js/admin-jobs.js',
  'js/admin-email.js',
  'js/admin-notifications.js',
  'js/admin-signals.js',
  'js/admin-cron.js',
  'js/admin-killswitch.js',
  'js/admin-monitoring.js',
  'js/admin-alerts.js',
  'js/admin-error-replay.js',
  'js/admin-ef-health.js',
  'js/admin-db-activity.js',
  'js/admin-posthog-insights.js',
  'js/admin-feed-health.js',
  'js/admin-cache-health.js',
  'js/admin-enrichment.js',
  'js/admin-seo.js',
  'js/admin-content.js',
  'js/admin-merch.js',
  'js/admin-referrals.js',
  'js/admin-stripe.js',
  'js/admin-subscription.js',
  'js/admin-ghost.js',
  'js/admin-templates.js',
  'js/admin-revenue.js',
  'js/admin-feedback.js',
  'js/admin-notif-analytics.js',
  'js/admin-biz-ops.js',
  'js/admin-shell.js',
];

const combined = jsFiles.map(f => `// === ${f} ===\n${readFileSync(f, 'utf-8')}`).join('\n\n');

mkdirSync('dist', { recursive: true });
writeFileSync('dist/admin.js', combined);
writeFileSync('dist/_tmp_admin.ts', combined);

buildSync({
  entryPoints: ['dist/_tmp_admin.ts'],
  outfile: 'dist/admin.min.js',
  minifySyntax: true,
  minifyWhitespace: true,
  minifyIdentifiers: false,
  sourcemap: true,
  target: 'es2020',
  bundle: false,
});

unlinkSync('dist/_tmp_admin.ts');

const origSize = combined.length;
const minSize = readFileSync('dist/admin.min.js', 'utf-8').length;
console.log('dist/admin.min.js built');
console.log(jsFiles.length + ' files => ' + (origSize/1024).toFixed(1) + 'KB => ' + (minSize/1024).toFixed(1) + 'KB minified');
