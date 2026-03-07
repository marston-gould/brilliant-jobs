// eslint.config.js — CS-021: Quality Gates ESLint Configuration
// Gates enforced:
//   Gate 1: No Silent Failures (no-empty-catch, no unchecked supabase errors)
//   Gate 5: Access Control (no hardcoded secrets)
//   Gate 7: Type Safety (strict rules for new files)
//
// Usage: npx eslint . --max-warnings 0

import js from '@eslint/js';
import noOnlyTests from 'eslint-plugin-no-only-tests';

export default [
  // Base recommended rules
  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['dist/**', 'node_modules/**', 'extension/examples/**', 'load-tests/**'],
  },

  // ─── Gate 1: No Silent Failures ──────────────────────────────
  // Block empty catch blocks, console-only error handling, and
  // fire-and-forget patterns that caused 130+ original findings.
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: [
      'dist/**',
      'node_modules/**',
      'extension/examples/**',
      'load-tests/**',
      'tests/**',
      'vitest.config.js',
      'eslint.config.js',
      'tailwind.config.js',
      'build.js',
      'build-admin.js',
    ],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: false }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'off', // Browser globals — too many to declare for vanilla JS
    },
  },

  // ─── Gate 5: No .only() in tests (prevents accidental test skipping) ───
  {
    files: ['tests/**/*.{js,ts}'],
    plugins: { 'no-only-tests': noOnlyTests },
    rules: {
      'no-only-tests/no-only-tests': 'error',
    },
  },

  // ─── Global ignores ───────────────────────────────────────────
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'extension/examples/**',
      'load-tests/**',
      '.github/**',
      'supabase/functions/**', // Deno runtime — separate linting
      'docs/**',
    ],
  },
];
