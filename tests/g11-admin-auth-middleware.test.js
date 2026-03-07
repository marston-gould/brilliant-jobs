/**
 * G11: Shared Admin Auth Middleware Tests
 *
 * Validates that admin-auth.ts exists and is imported by all admin EFs,
 * and that inline auth code has been removed.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const ROOT = resolve(import.meta.dirname, '..');

// ─── Shared module exists ───

describe('G11: admin-auth.ts shared module', () => {

  it('admin-auth.ts exists in _shared directory', () => {
    const path = join(ROOT, 'supabase/functions/_shared/admin-auth.ts');
    expect(existsSync(path)).toBe(true);
  });

  it('exports requireAdmin function', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('export async function requireAdmin');
  });

  it('exports authErrorResponse helper', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('export function authErrorResponse');
  });

  it('exports AdminAuthError class', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('export class AdminAuthError');
  });

  it('checks profiles.role === admin', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('profiles');
    expect(content).toContain('role');
    expect(content).toContain('"admin"');
  });

  it('handles service_role JWT bypass', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('service_role');
    expect(content).toContain('isServiceRole: true');
  });

  it('returns 401 for missing token', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('Authorization required');
    expect(content).toContain('401');
  });

  it('returns 403 for non-admin users', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/_shared/admin-auth.ts'), 'utf8');
    expect(content).toContain('Admin role required');
    expect(content).toContain('403');
  });
});

// ─── All admin EFs import the shared module ───

const ADMIN_EFS = [
  'admin-analytics',
  'approve-content',
  'generate-editorial-content',
  'seo-sync',
];

describe('G11: Admin EFs import shared admin-auth', () => {

  ADMIN_EFS.forEach(ef => {
    it(`${ef} imports requireAdmin from _shared/admin-auth.ts`, () => {
      const path = join(ROOT, `supabase/functions/${ef}/index.ts`);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, 'utf8');
      expect(content).toContain("_shared/admin-auth.ts");
      expect(content).toContain('requireAdmin');
    });

    it(`${ef} imports authErrorResponse from _shared/admin-auth.ts`, () => {
      const content = readFileSync(join(ROOT, `supabase/functions/${ef}/index.ts`), 'utf8');
      expect(content).toContain('authErrorResponse');
    });

    it(`${ef} does NOT contain inline verifyAdmin function`, () => {
      const content = readFileSync(join(ROOT, `supabase/functions/${ef}/index.ts`), 'utf8');
      expect(content).not.toContain('async function verifyAdmin');
    });
  });
});

// ─── Inline admin auth removed from refactored EFs ───

describe('G11: Inline admin auth removed', () => {

  it('admin-analytics no longer has standalone verifyAdmin', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/admin-analytics/index.ts'), 'utf8');
    expect(content).not.toContain('async function verifyAdmin(req');
    expect(content).toContain('await requireAdmin(req)');
  });

  it('approve-content uses shared middleware instead of inline check', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/approve-content/index.ts'), 'utf8');
    expect(content).toContain('await requireAdmin(req)');
    expect(content).not.toContain('payload.role === "service_role"');
  });

  it('generate-editorial-content uses shared middleware', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/generate-editorial-content/index.ts'), 'utf8');
    expect(content).toContain('await requireAdmin(req)');
    expect(content).not.toContain('payload.role === "service_role"');
  });

  it('seo-sync uses shared middleware', () => {
    const content = readFileSync(join(ROOT, 'supabase/functions/seo-sync/index.ts'), 'utf8');
    expect(content).toContain('await requireAdmin(req)');
    expect(content).not.toContain("payload.role === 'service_role'");
  });
});
