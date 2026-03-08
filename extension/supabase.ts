// supabase.ts — Supabase REST API helper

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

// Auth token — set after login, used for RLS
let SUPABASE_AUTH_TOKEN = null;

const supabase = {
  setAuthToken(token) {
    SUPABASE_AUTH_TOKEN = token;
  },

  headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_AUTH_TOKEN || SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    };
  },

  async select(table, query = '') {
    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      headers: this.headers()
    }, { timeout: 10000, retries: 2 }); // CS-013 FIX-12
    if (!res.ok) throw new Error(`SELECT ${table}: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async upsert(table, rows, onConflict) {
    const headers = this.headers();
    headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rows)
    }, { timeout: 10000, retries: 2 }); // CS-013 FIX-12
    if (!res.ok) throw new Error(`UPSERT ${table}: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async update(table, match, data) {
    const params = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify(data)
    }, { timeout: 10000, retries: 2 }); // CS-013 FIX-12
    if (!res.ok) throw new Error(`UPDATE ${table}: ${res.status} ${await res.text()}`);
    return res.json();
  },

  async count(table, query = '') {
    const headers = this.headers();
    headers['Prefer'] = 'count=exact';
    headers['Range-Unit'] = 'items';
    headers['Range'] = '0-0';
    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/${table}?${query}&select=id`, {
      headers
    }, { timeout: 10000, retries: 1 }); // CS-013 FIX-12
    const count = res.headers.get('content-range')?.split('/')?.[1];
    return parseInt(count) || 0;
  },

  async rpc(fn, params = {}) {
    const res = await fetchWithRetry(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(params)
    }, { timeout: 15000, retries: 2 }); // CS-013 FIX-12
    if (!res.ok) throw new Error(`RPC ${fn}: ${res.status} ${await res.text()}`);
    return res.json();
  }
};
