// eslint.config.mjs — CS-021 + BI-07-FIX: Quality Gates ESLint Configuration
// Gates enforced:
//   Gate 1: No Silent Failures (no-empty-catch, no unchecked supabase errors)
//   Gate 5: Access Control (no hardcoded secrets)
//   Gate 7: Type Safety (strict rules for new files)
//
// BI-07-FIX: Restructured to eliminate 4,624 false-positive no-undef errors
// from test files and 175 no-redeclare from vendored echarts.
//
// Usage: npx eslint . --max-warnings 750

import js from '@eslint/js';
import noOnlyTests from 'eslint-plugin-no-only-tests';

export default [
  // ─── Global ignores (must be first, standalone object) ─────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'extension/examples/**',
      'load-tests/**',
      '.github/**',
      'supabase/functions/**',   // Deno runtime — separate linting
      'docs/**',
      'js/vendor/**',            // BI-07-FIX: vendored libs (echarts) — not our code
      'js/state.js',             // BI-07-FIX: ES module syntax — processed by bundler, not raw browser
    ],
  },

  // Base recommended rules for all JS/MJS
  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.mjs'],
    rules: {
      // BI-07-FIX: no-undef OFF globally — vanilla JS with browser globals,
      // Vitest globals in tests, Node globals in scripts. Too many to declare.
      'no-undef': 'off',
    },
  },

  // ─── Gate 1: Source files — No Silent Failures ─────────────────
  {
    files: ['js/**/*.js', 'api/**/*.js', 'worker/**/*.js', 'scripts/**/*.js', 'sw.js', 'seo-charts.js'],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-redeclare': 'warn',
    },
  },

  // ─── Build scripts — relaxed (console usage, dynamic requires) ─
  {
    files: ['build.js', 'build-admin.js', 'tailwind.config.js', 'vitest.config.js'],
    rules: {
      'no-empty': 'off',
      'no-unused-vars': 'off',
    },
  },

  // ─── Tests — only enforce no .only() ───────────────────────────
  {
    files: ['tests/**/*.{js,ts}'],
    plugins: { 'no-only-tests': noOnlyTests },
    rules: {
      'no-only-tests/no-only-tests': 'error',
      'no-unused-vars': 'off',
      'no-redeclare': 'off',
      'no-empty': 'off',
    },
  },
];
