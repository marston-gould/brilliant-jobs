#!/usr/bin/env node
/**
 * Upload Extension Source to Supabase Storage
 * EXT-BUILD-001 Session 1 (S1.1)
 *
 * Takes the output of build-dev.js (extension/dist/dev/) and uploads every
 * file to Supabase Storage bucket 'extension-source' under the v4/ prefix.
 *
 * Usage:
 *   node scripts/upload-extension-source.js
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables
 *   or falls back to hardcoded credentials from CREDENTIALS_MASTER.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST_DIR = join(__dirname, '..', 'extension', 'dist', 'dev');
const BUCKET = 'extension-source';
const PREFIX = 'v4';

// ─── Credentials ────────────────────────────────────────────
const SB_URL = process.env.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2OTA2NiwiZXhwIjoyMDg2MTQ1MDY2fQ._wuo4yuVmqM_x3PhOPLkfBwDrlpXcH62NZk7wX2q5tM';

// ─── MIME type mapping ──────────────────────────────────────
const MIME_TYPES = {
  '.js': 'application/javascript',
  '.html': 'text/html',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(filepath) {
  const ext = extname(filepath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ─── Collect all files recursively ──────────────────────────
function collectFiles(dir, base) {
  const files = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      const relPath = relative(base, fullPath);
      files.push({ fullPath, relPath, size: statSync(fullPath).size });
    }
  }
  return files;
}

// ─── Upload a single file ───────────────────────────────────
async function uploadFile(relPath, fullPath) {
  const storagePath = `${PREFIX}/${relPath}`;
  const mime = getMimeType(relPath);
  const body = readFileSync(fullPath);

  const url = `${SB_URL}/storage/v1/object/${BUCKET}/${storagePath}`;

  // Try upsert (update or insert)
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'apikey': SB_SERVICE_KEY,
      'Content-Type': mime,
      'x-upsert': 'true',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return { storagePath, status: response.status, size: body.length };
}

// ─── Create bucket if needed ────────────────────────────────
async function ensureBucket() {
  // Check if bucket exists
  const listUrl = `${SB_URL}/storage/v1/bucket/${BUCKET}`;
  const check = await fetch(listUrl, {
    headers: {
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'apikey': SB_SERVICE_KEY,
    },
  });

  if (check.ok) {
    console.log(`  Bucket '${BUCKET}' exists`);
    return;
  }

  // Create bucket
  const createUrl = `${SB_URL}/storage/v1/bucket`;
  const createResp = await fetch(createUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'apikey': SB_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: false,
      file_size_limit: 5242880, // 5MB
    }),
  });

  if (createResp.ok) {
    console.log(`  Created bucket '${BUCKET}'`);
  } else {
    const text = await createResp.text();
    console.warn(`  Bucket creation response: ${createResp.status} ${text}`);
  }
}

// ─── Verify upload ──────────────────────────────────────────
async function verifyUploads(expectedFiles) {
  const listUrl = `${SB_URL}/storage/v1/object/list/${BUCKET}`;

  // List files under v4/ prefix
  const resp = await fetch(listUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SB_SERVICE_KEY}`,
      'apikey': SB_SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prefix: `${PREFIX}/`,
      limit: 200,
      offset: 0,
    }),
  });

  if (!resp.ok) {
    console.warn(`  ⚠ Could not verify uploads: HTTP ${resp.status}`);
    return false;
  }

  const items = await resp.json();
  // Supabase returns items at the prefix level — we need recursive listing
  // For simplicity, we check a subset of critical files
  const criticalFiles = [
    'background.js', 'contentScript.js', 'manifest.json', 'popup.html',
    'popup.js', 'supabase.js', 'job-site-overlay.js', 'version.json',
  ];

  let verified = 0;
  for (const cf of criticalFiles) {
    const checkUrl = `${SB_URL}/storage/v1/object/info/${BUCKET}/${PREFIX}/${cf}`;
    const checkResp = await fetch(checkUrl, {
      headers: {
        'Authorization': `Bearer ${SB_SERVICE_KEY}`,
        'apikey': SB_SERVICE_KEY,
      },
    });
    if (checkResp.ok) {
      verified++;
    } else {
      console.warn(`  ⚠ Critical file not found in storage: ${cf}`);
    }
  }

  console.log(`  Verified ${verified}/${criticalFiles.length} critical files in storage`);
  return verified === criticalFiles.length;
}

// ─── Main ───────────────────────────────────────────────────
async function main() {
  console.log('\n📤 Upload Extension Source to Supabase Storage');
  console.log(`   Bucket: ${BUCKET} / ${PREFIX}/`);
  console.log(`   Source: ${DIST_DIR}\n`);

  if (!existsSync(DIST_DIR)) {
    console.error(`❌ dist/dev/ not found. Run 'node extension/build-dev.js' first.`);
    process.exit(1);
  }

  // Ensure bucket exists
  await ensureBucket();

  // Collect files
  const files = collectFiles(DIST_DIR, DIST_DIR);
  console.log(`  Found ${files.length} files to upload\n`);

  if (files.length === 0) {
    console.error('❌ No files found in dist/dev/');
    process.exit(1);
  }

  // Upload all files
  let uploaded = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const file of files) {
    try {
      const result = await uploadFile(file.relPath, file.fullPath);
      uploaded++;
      totalBytes += result.size;
      console.log(`  ✅ ${result.storagePath} (${(result.size / 1024).toFixed(1)}KB)`);
    } catch (err) {
      failed++;
      console.error(`  ❌ ${file.relPath}: ${err.message}`);
    }
  }

  console.log(`\n── Upload Summary ──`);
  console.log(`  Uploaded: ${uploaded}/${files.length} files`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Total:    ${(totalBytes / 1024).toFixed(1)}KB`);

  // Verify
  console.log('\n── Verification ──');
  const verified = await verifyUploads(files);

  if (failed > 0) {
    console.error(`\n❌ Upload completed with ${failed} failure(s)`);
    process.exit(1);
  }

  console.log(`\n✅ Upload complete — ${uploaded} files in ${BUCKET}/${PREFIX}/\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
