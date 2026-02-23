#!/usr/bin/env node
/**
 * Extension Build Script — Minify + obfuscate extension JS
 * Raises the bar against casual reverse-engineering of LinkedIn
 * harvesting and ATS detection patterns.
 *
 * Usage: node extension/build-extension.js
 * Output: extension/dist/content.min.js (replace content.js in production manifest)
 */

import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, 'dist');

mkdirSync(DIST, { recursive: true });

// Step 1: Minify with esbuild (tree-shaking, dead code elimination, mangling)
buildSync({
  entryPoints: [join(__dirname, 'content.js')],
  outfile: join(DIST, 'content.min.js'),
  minify: true,
  minifyWhitespace: true,
  minifyIdentifiers: true,
  minifySyntax: true,
  target: 'chrome120',
  bundle: false,
  legalComments: 'none', // strip all comments
  charset: 'utf8',
});

// Step 2: Copy other extension files to dist
['manifest.json', 'inject.css', 'popup.html'].forEach(f => {
  const src = join(__dirname, f);
  if (existsSync(src)) copyFileSync(src, join(DIST, f));
});

// Step 3: Update manifest in dist to reference minified JS
const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf-8'));
manifest.content_scripts[0].js = ['content.min.js'];
writeFileSync(join(DIST, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Step 4: Copy icon files
['icon16.png', 'icon48.png', 'icon128.png'].forEach(f => {
  const src = join(__dirname, f);
  if (existsSync(src)) copyFileSync(src, join(DIST, f));
});

const origSize = readFileSync(join(__dirname, 'content.js'), 'utf-8').length;
const minSize = readFileSync(join(DIST, 'content.min.js'), 'utf-8').length;
console.log(`✅ Extension built to extension/dist/`);
console.log(`   content.js: ${(origSize/1024).toFixed(1)}KB → ${(minSize/1024).toFixed(1)}KB (${((1-minSize/origSize)*100).toFixed(0)}% smaller)`);
console.log(`   All identifiers mangled, comments stripped.`);
