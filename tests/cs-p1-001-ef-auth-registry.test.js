// tests/cs-p1-001-ef-auth-registry.test.js
// CS-P1-001: Edge Function Auth Registry + validate-signup hardening
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';

const EF_DIR = join(process.cwd(), 'supabase', 'functions');
const REGISTRY_PATH = join(process.cwd(), 'supabase', 'edge-function-auth.yaml');

// ─── SE-004: Edge Function Auth Classification Registry ─────────────

describe('SE-004: Edge Function Auth Registry', () => {
  const registry = yaml.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const functions = registry.functions;
  const deployed = readdirSync(EF_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== '_shared')
    .filter(d => existsSync(join(EF_DIR, d.name, 'index.ts')))
    .map(d => d.name);

  it('registry file exists and is valid YAML', () => {
    expect(existsSync(REGISTRY_PATH)).toBe(true);
    expect(functions).toBeDefined();
    expect(typeof functions).toBe('object');
  });

  it('every deployed EF is in the registry', () => {
    const missing = deployed.filter(ef => !functions[ef]);
    expect(missing).toEqual([]);
  });

  it('every registry entry is deployed', () => {
    const stale = Object.keys(functions).filter(ef => !deployed.includes(ef));
    expect(stale).toEqual([]);
  });

  it('all entries have a valid classification', () => {
    const validClasses = ['admin-only', 'authenticated', 'cron-internal', 'webhook', 'public'];
    for (const [name, entry] of Object.entries(functions)) {
      expect(validClasses).toContain(entry.classification);
    }
  });

  it('admin-only functions use requireAdmin', () => {
    const adminFns = Object.entries(functions)
      .filter(([, e]) => e.classification === 'admin-only');
    for (const [name] of adminFns) {
      const code = readFileSync(join(EF_DIR, name, 'index.ts'), 'utf8');
      expect(code).toMatch(/requireAdmin/);
    }
  });

  it('authenticated functions use auth.getUser', () => {
    const authFns = Object.entries(functions)
      .filter(([, e]) => e.classification === 'authenticated');
    for (const [name] of authFns) {
      const code = readFileSync(join(EF_DIR, name, 'index.ts'), 'utf8');
      expect(code).toMatch(/auth\.getUser|verifyJWT/);
    }
  });

  it('public functions have rate_limited and cors_restricted fields', () => {
    const publicFns = Object.entries(functions)
      .filter(([, e]) => e.classification === 'public');
    for (const [name, entry] of publicFns) {
      expect(entry).toHaveProperty('rate_limited');
      expect(entry).toHaveProperty('cors_restricted');
      expect(entry).toHaveProperty('adr');
    }
  });

  it('counts match expected totals', () => {
    const counts = {};
    for (const entry of Object.values(functions)) {
      counts[entry.classification] = (counts[entry.classification] || 0) + 1;
    }
    expect(counts['admin-only']).toBe(4);
    expect(counts['authenticated']).toBe(28);
    expect(counts['cron-internal']).toBe(46);
    expect(counts['webhook']).toBe(7);
    expect(counts['public']).toBe(4);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(89);
  });
});

// ─── IX-SE-003: validate-signup Hardening ───────────────────────────

describe('IX-SE-003: validate-signup CORS + Rate Limiting', () => {
  const code = readFileSync(join(EF_DIR, 'validate-signup', 'index.ts'), 'utf8');

  it('CORS is restricted to brilliantjobs.app (no wildcard)', () => {
    expect(code).not.toMatch(/['"]Access-Control-Allow-Origin['"]\s*:\s*['"]\*['"]/);
    expect(code).toMatch(/brilliantjobs\.app/);
  });

  it('has ALLOWED_ORIGINS array', () => {
    expect(code).toMatch(/ALLOWED_ORIGINS/);
    expect(code).toMatch(/https:\/\/brilliantjobs\.app/);
    expect(code).toMatch(/https:\/\/www\.brilliantjobs\.app/);
  });

  it('has rate limiting implementation', () => {
    expect(code).toMatch(/rateLimitMap/);
    expect(code).toMatch(/checkRateLimit/);
    expect(code).toMatch(/RATE_LIMIT_MAX/);
    expect(code).toMatch(/RATE_LIMIT_WINDOW/);
  });

  it('returns 429 when rate limited', () => {
    expect(code).toMatch(/429/);
    expect(code).toMatch(/rate_limit_exceeded/);
    expect(code).toMatch(/Retry-After/);
  });

  it('rate limit is 5 per hour', () => {
    expect(code).toMatch(/RATE_LIMIT_MAX\s*=\s*5/);
    expect(code).toMatch(/60\s*\*\s*60\s*\*\s*1000/);
  });

  it('only allows POST method', () => {
    expect(code).toMatch(/method.*!==.*POST/);
    expect(code).toMatch(/405/);
    expect(code).toMatch(/method_not_allowed/);
  });

  it('extracts client IP from forwarded headers', () => {
    expect(code).toMatch(/x-forwarded-for/);
    expect(code).toMatch(/cf-connecting-ip/);
  });

  it('dynamic CORS based on request origin', () => {
    expect(code).toMatch(/getCorsHeaders/);
    expect(code).toMatch(/req\.headers\.get.*Origin/);
  });
});

// ─── Registry consistency with gate-ef-auth-scan.mjs ────────────────

describe('Gate 04: Registry + Gate Script Consistency', () => {
  const gateScript = readFileSync(join(process.cwd(), 'scripts', 'gate-ef-auth-scan.mjs'), 'utf8');
  const registry = yaml.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const publicFns = Object.entries(registry.functions)
    .filter(([, e]) => e.classification === 'public')
    .map(([name]) => name);

  it('gate script PUBLIC_ALLOWLIST matches registry public functions', () => {
    for (const fn of publicFns) {
      expect(gateScript).toContain(`'${fn}'`);
    }
  });

  it('CI workflow includes registry validation step', () => {
    const ci = readFileSync(join(process.cwd(), '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toMatch(/validate-ef-auth/);
  });
});
