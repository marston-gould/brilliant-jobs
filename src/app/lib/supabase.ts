// ============================================================
// Standalone Supabase Client for SPA (SPA-CUT-1)
// ============================================================
// Direct Supabase client — does NOT depend on window.BJ or
// legacy globals.ts. Shares the same auth session via
// localStorage (Supabase SDK uses sb-{ref}-auth-token key).
//
// This is the ONLY Supabase client the SPA should use.
// All hooks and providers import from here.
// ============================================================

import { createClient, SupabaseClient, Session, User } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

// Gateway URL for Edge Function calls
export const GATEWAY_URL = `${SUPABASE_URL}/functions/v1/api-gateway`;

// Singleton client — same auth storage as legacy globals.ts
// (both use persistSession: true → same localStorage key)
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Must match landing-app.js storageKey so login session is shared
    storageKey: 'supabase.auth.token',
  },
});

// ── Auth helpers ──────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

export async function getUser(): Promise<User | null> {
  // getSession() reads from localStorage synchronously when token is valid
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData?.session?.user) return sessionData.session.user;
  return null;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

// ── Gateway call helper ──────────────────────────────────
// Calls Edge Functions through the API gateway with auth

export async function callGateway<T = any>(
  route: string,
  body?: Record<string, unknown>,
  options?: { method?: string; timeout?: number }
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const method = options?.method || (body ? 'POST' : 'GET');
  const controller = new AbortController();
  const timeoutId = options?.timeout
    ? setTimeout(() => controller.abort(), options.timeout)
    : null;

  try {
    const resp = await fetch(`${GATEWAY_URL}/${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw Object.assign(new Error(errBody.error || `Gateway ${resp.status}`), {
        status: resp.status,
        body: errBody,
      });
    }

    return resp.json() as Promise<T>;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ── Feature flag helper ──────────────────────────────────

export async function isFeatureEnabled(flagKey: string, defaultValue = false): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('feature_flags')
      .select('enabled, rollout_pct')
      .eq('id', flagKey)
      .single();
    if (!data) return defaultValue;
    if (!data.enabled) return false;
    if (data.rollout_pct >= 100) return true;
    // Deterministic bucket based on user ID
    const user = await getUser();
    if (!user) return defaultValue;
    const hash = Array.from(user.id).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
    return (Math.abs(hash) % 100) < data.rollout_pct;
  } catch {
    return defaultValue;
  }
}

// ── localStorage helpers (match legacy patterns) ─────────

export function safeReadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    if (raw.startsWith('enc:')) return fallback; // PII-encrypted data — can't parse
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeWriteLS(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or private browsing — non-fatal
  }
}
