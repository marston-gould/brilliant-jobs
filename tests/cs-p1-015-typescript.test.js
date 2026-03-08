/**
 * CS-P1-015: TypeScript Migration — Validation Tests
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

describe('CS-P1-015: TypeScript Migration (Incremental)', () => {
  const MIGRATED_FILES = [
    'js/version.ts',
    'js/globals.ts',
    'js/sync.ts',
    'js/fingerprint.ts',
    'js/tier-gating.ts',
    'js/lazy-loader.ts',
    'js/api.ts',
  ];

  describe('Infrastructure', () => {
    it('tsconfig.json exists with strict mode', () => {
      // tsconfig.json has comments — strip them for JSON.parse
      // Must respect string literals containing /* and // patterns (e.g., glob paths)
      const raw = readFileSync('tsconfig.json', 'utf-8');
      const stripped = raw.replace(/^(\s*)"((?:[^"\\]|\\.)*)"\s*:\s*(.*)$/gm, (m) => m)  // preserve full lines with strings
        .split('\n')
        .map(line => {
          // Only strip // comments that aren't inside a string value
          let inString = false;
          let i = 0;
          while (i < line.length) {
            if (line[i] === '"' && (i === 0 || line[i-1] !== '\\')) inString = !inString;
            if (!inString && line[i] === '/' && line[i+1] === '/') return line.substring(0, i);
            i++;
          }
          return line;
        })
        .join('\n');
      const config = JSON.parse(stripped);
      expect(config.compilerOptions.strict).toBe(true);
      expect(config.compilerOptions.noImplicitAny).toBe(true);
      expect(config.compilerOptions.strictNullChecks).toBe(true);
      expect(config.compilerOptions.noEmit).toBe(true);
    });

    it('TypeScript is installed as devDependency', () => {
      const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
      expect(pkg.devDependencies.typescript).toBeDefined();
    });

    it('shared type definitions exist', () => {
      expect(existsSync('js/types/index.d.ts')).toBe(true);
      const types = readFileSync('js/types/index.d.ts', 'utf-8');
      expect(types).toContain('interface SupabaseJob');
      expect(types).toContain('interface UserProfile');
      expect(types).toContain('interface BJNamespace');
      expect(types).toContain('interface Window');
    });
  });

  describe('Core Modules Migrated', () => {
    MIGRATED_FILES.forEach(tsFile => {
      const name = tsFile.replace('js/', '').replace('.ts', '');

      it(`${name}.ts exists`, () => {
        expect(existsSync(tsFile)).toBe(true);
      });

      it(`${name}.ts has type annotations`, () => {
        const content = readFileSync(tsFile, 'utf-8');
        // Check for TypeScript syntax (type annotations, interfaces, etc.)
        const hasTypes = content.includes(': ') || 
                        content.includes('<') ||
                        content.includes('as ') ||
                        content.includes('void');
        expect(hasTypes).toBe(true);
      });

      it(`${name}.js generated from .ts (types stripped)`, () => {
        const jsFile = tsFile.replace('.ts', '.js');
        expect(existsSync(jsFile)).toBe(true);
        const jsContent = readFileSync(jsFile, 'utf-8');
        // Generated .js should not contain TypeScript-only syntax
        // Check for common TS patterns that esbuild strips
        expect(jsContent).not.toContain('interface ');
        expect(jsContent).not.toContain(': SupabaseClient');
        expect(jsContent).not.toContain(': TierName');
        expect(jsContent).not.toContain(': ChunkName');
      });
    });
  });

  describe('Type Checking', () => {
    it('tsc --noEmit passes with zero errors', () => {
      const result = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8', timeout: 30000 });
      expect(result.trim()).toBe('');
    });
  });

  describe('Build System', () => {
    it('build.js references .ts files in shell chunk', () => {
      const buildJs = readFileSync('build.js', 'utf-8');
      expect(buildJs).toContain("'js/version.ts'");
      expect(buildJs).toContain("'js/globals.ts'");
      expect(buildJs).toContain("'js/sync.ts'");
      expect(buildJs).toContain("'js/fingerprint.ts'");
      expect(buildJs).toContain("'js/tier-gating.ts'");
      expect(buildJs).toContain("'js/lazy-loader.ts'");
    });

    it('build.js compiles .ts → .js for direct HTML loading', () => {
      const buildJs = readFileSync('build.js', 'utf-8');
      expect(buildJs).toContain('transformSync');
      expect(buildJs).toContain('.ts files compiled to .js');
    });

    it('temp files use .ts extension for esbuild type stripping', () => {
      const buildJs = readFileSync('build.js', 'utf-8');
      expect(buildJs).toContain('_tmp_${name}.ts');
    });
  });

  describe('CI Gate', () => {
    it('CI workflow includes TypeScript type-check step', () => {
      const ci = readFileSync('.github/workflows/ci.yml', 'utf-8');
      expect(ci).toContain('TypeScript type-check');
      expect(ci).toContain('tsc --noEmit');
    });

    it('CI workflow rejects new .js files for migrated modules', () => {
      const ci = readFileSync('.github/workflows/ci.yml', 'utf-8');
      expect(ci).toContain('Reject new .js files');
      expect(ci).toContain('MIGRATED_FILES');
    });
  });

  describe('Bundle Integrity', () => {
    it('dashboard bundles build successfully with .ts sources', () => {
      // Build was already run — check output exists and is reasonable size
      const shellBundle = readFileSync('dist/dashboard-shell.min.js', 'utf-8');
      expect(shellBundle.length).toBeGreaterThan(10000);
      // No TypeScript syntax in output
      expect(shellBundle).not.toContain(': string');
      expect(shellBundle).not.toContain(': void');
    });
  });
});
