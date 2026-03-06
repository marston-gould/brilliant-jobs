// tests/setup.js — CS-010: Test environment setup
// Mocks for Supabase, PostHog, and browser globals

import '@testing-library/jest-dom';

// Mock Supabase client
globalThis.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOtp: async () => ({ data: null, error: null }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({
      select: () => ({ data: [], error: null, eq: () => ({ data: [], error: null, single: () => ({ data: null, error: null }), limit: () => ({ data: [], error: null }) }) }),
      insert: () => ({ data: null, error: null }),
      update: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
      upsert: () => ({ data: null, error: null }),
      delete: () => ({ data: null, error: null, eq: () => ({ data: null, error: null }) }),
    }),
    rpc: async () => ({ data: null, error: null }),
  }),
};

// Mock PostHog
globalThis.posthog = {
  init: () => {},
  identify: () => {},
  capture: () => {},
  reset: () => {},
};

// Mock fetch
globalThis.fetch = globalThis.fetch || (async () => new Response('{}', { status: 200 }));

// Suppress console noise in tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('[BJ]')) return;
  originalWarn.apply(console, args);
};
