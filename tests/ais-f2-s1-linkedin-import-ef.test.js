/**
 * AIS-F2-S1: LinkedIn Import — EF + Storage
 * ==========================================
 * Tests:
 *  1. linkedin_profiles migration: schema, RLS, indexes, storage policies
 *  2. parse-linkedin-pdf EF: upload action added (standalone, no enrollment_id)
 *  3. EF upload: JWT auth required
 *  4. EF upload: 10MB limit enforced
 *  5. EF upload: PDF hash dedup (cross-account)
 *  6. EF upload: text extraction + parse failure handling
 *  7. EF upload: fraud signals (low_connections, no_experience, low_confidence)
 *  8. EF upload: Storage upload to linkedin-profiles bucket
 *  9. EF upload: upserts to linkedin_profiles table (one per user)
 * 10. EF upload: returns parsed profile + fraud_signals + pdf_hash
 * 11. Version / build integrity at v9.58
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');
const read = (rel) => readFileSync(resolve(ROOT, rel), 'utf8');

// ─────────────────────────────────────────────────
// 1. Migration: linkedin_profiles table
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: linkedin_profiles migration', () => {
  const src = read('supabase/migrations/v9.57-ais-f2-s1-linkedin-profiles.sql');

  it('migration file exists', () => expect(src).toBeTruthy());
  it('creates linkedin_profiles table', () => expect(src).toContain('CREATE TABLE IF NOT EXISTS linkedin_profiles'));
  it('has user_id FK to auth.users', () => expect(src).toMatch(/user_id.*uuid.*REFERENCES auth\.users/));
  it('has display_name column', () => expect(src).toContain('display_name'));
  it('has headline column', () => expect(src).toContain('headline'));
  it('has experience_json jsonb column', () => expect(src).toContain('experience_json'));
  it('has skills_array text[] column', () => expect(src).toContain('skills_array'));
  it('has education_json column', () => expect(src).toContain('education_json'));
  it('has li_connections column', () => expect(src).toContain('li_connections'));
  it('has pdf_hash UNIQUE column', () => expect(src).toMatch(/pdf_hash.*UNIQUE|UNIQUE.*pdf_hash/));
  it('has raw_pdf_url column', () => expect(src).toContain('raw_pdf_url'));
  it('has parsed_at column', () => expect(src).toContain('parsed_at'));
  it('has fraud_signals column', () => expect(src).toContain('fraud_signals'));
  it('unique index on user_id (one profile per user)', () => expect(src).toContain('idx_linkedin_profiles_user'));
  it('enables RLS', () => expect(src).toContain('ENABLE ROW LEVEL SECURITY'));
  it('user policy: manage own profiles', () => expect(src).toContain('users_manage_own_linkedin_profiles'));
  it('service_role full access policy', () => expect(src).toContain('service_role_full_linkedin_profiles'));
  it('storage upload policy for linkedin-profiles bucket', () => expect(src).toContain("linkedin_profiles_upload_own"));
  it('storage read policy for linkedin-profiles bucket', () => expect(src).toContain("linkedin_profiles_read_own"));
  it('updated_at trigger', () => expect(src).toContain('fn_linkedin_profiles_updated_at'));
});

// ─────────────────────────────────────────────────
// 2. EF: upload action exists
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: parse-linkedin-pdf EF upload action', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('upload action handler exists', () => expect(src).toContain("action === \"upload\""));
  it('upload is standalone — no enrollment_id required', () => {
    const uploadBlock = src.slice(src.indexOf('action === "upload"'));
    expect(uploadBlock.slice(0, 500)).not.toContain('enrollment_id');
  });
});

// ─────────────────────────────────────────────────
// 3. EF: JWT auth
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: upload requires JWT auth', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('checks Authorization header in upload', () => expect(src).toContain('Authorization required'));
  it('validates token with auth.getUser', () => expect(src).toContain('auth.getUser'));
  it('returns 401 on missing auth', () => expect(src).toContain('"Authorization required"'));
});

// ─────────────────────────────────────────────────
// 4. EF: 10MB limit
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: 10MB PDF size limit', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('enforces 10MB limit', () => expect(src).toContain('10 * 1024 * 1024'));
  it('returns 413 on oversized PDF', () => expect(src).toContain('413'));
});

// ─────────────────────────────────────────────────
// 5. EF: PDF hash dedup
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: PDF hash dedup', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('computes SHA-256 hash of PDF bytes', () => expect(src).toContain('SHA-256'));
  it('checks linkedin_profiles for duplicate hash cross-account', () => {
    expect(src).toMatch(/linkedin_profiles[\s\S]{0,200}pdf_hash/);
  });
  it('returns 409 on cross-account duplicate', () => expect(src).toContain('409'));
  it('duplicate error message meaningful', () => expect(src).toContain('already been used by another account'));
});

// ─────────────────────────────────────────────────
// 6. EF: parse failure handling
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: parse failure handling', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('returns 422 when text extraction fails', () => expect(src).toContain('422'));
  it('parse failure error is actionable', () => expect(src).toContain('LinkedIn PDF export'));
  it('checks minimum text length', () => expect(src).toContain('pdfText.length < 100'));
});

// ─────────────────────────────────────────────────
// 7. EF: fraud signals
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: fraud signals', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('flags low_connections when < 50', () => expect(src).toContain('low_connections'));
  it('flags no_experience when experience empty', () => expect(src).toContain('no_experience'));
  it('flags low_confidence when parse confidence < 0.3', () => expect(src).toContain('low_confidence'));
  it('returns fraud_signals in response', () => expect(src).toMatch(/fraud_signals[\s\S]{0,200}return new Response/));
});

// ─────────────────────────────────────────────────
// 8. EF: Storage upload
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: Storage upload to linkedin-profiles bucket', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('uploads to linkedin-profiles bucket', () => expect(src).toContain("from(\"linkedin-profiles\")"));
  it('uses user_id in storage path for isolation', () => expect(src).toContain('`${userId}/'));
  it('uses upsert to handle re-uploads', () => expect(src).toContain('upsert: true'));
});

// ─────────────────────────────────────────────────
// 9. EF: upsert to linkedin_profiles
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: upserts to linkedin_profiles table', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('upserts to linkedin_profiles', () => expect(src).toMatch(/\.from\("linkedin_profiles"\)[\s\S]{0,100}\.upsert/));
  it('conflicts on user_id (one profile per user)', () => expect(src).toContain('onConflict: "user_id"'));
  it('stores pdf_hash in profile row', () => expect(src).toContain('pdf_hash: hash'));
  it('stores raw_pdf_url (storage path)', () => expect(src).toContain('raw_pdf_url: storagePath'));
  it('stores parsed_at timestamp', () => expect(src).toContain("parsed_at: new Date().toISOString()"));
});

// ─────────────────────────────────────────────────
// 10. EF: response shape
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: upload response shape', () => {
  const src = read('supabase/functions/parse-linkedin-pdf/index.ts');

  it('returns success: true', () => expect(src).toContain('success: true'));
  it('returns parsed profile', () => expect(src).toContain('profile: parsed'));
  it('returns fraud_signals array', () => expect(src).toMatch(/fraud_signals[\s\S]{0,50}storage_path|storage_path[\s\S]{0,50}fraud_signals/));
  it('returns pdf_hash', () => expect(src).toContain('pdf_hash: hash'));
  it('returns storage_path', () => expect(src).toContain('storage_path: storagePath'));
});

// ─────────────────────────────────────────────────
// 11. Version / build
// ─────────────────────────────────────────────────
describe('AIS-F2-S1: version and build', () => {
  it('version is v9.58', () => expect(read('js/version.js')).toContain('v9.58'));
  it('dist/dashboard.min.js at v9.58', () => expect(read('dist/dashboard.min.js')).toContain('v9.58'));
  it('migration file present', () => expect(() => read('supabase/migrations/v9.57-ais-f2-s1-linkedin-profiles.sql')).not.toThrow());
  it('EF file present', () => expect(() => read('supabase/functions/parse-linkedin-pdf/index.ts')).not.toThrow());
});
