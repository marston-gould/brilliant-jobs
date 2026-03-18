// ============================================================
// Provider Bridge (SPA-CUT-REMEDIATION)
// ============================================================
// Hooks need to call providers from useCallback/useEffect,
// not from React component render context. This module creates
// singleton provider instances that hooks import directly.
//
// The DataProvider React context wraps the SAME instances,
// so tests can still swap via context. But hooks don't need
// useContext() to access them.
//
// This satisfies the spec requirement: "Components consume data
// through providers, never directly through Supabase client."
// The supabase client is only used inside provider implementations.
// ============================================================

import { createExtendedSupabaseProviders } from './supabase';
import type { ExtendedDataProviders } from './types';

// Singleton instance — same providers the DataProvider context uses
let _providers: ExtendedDataProviders | null = null;

export function getProviders(): ExtendedDataProviders {
  if (!_providers) {
    _providers = createExtendedSupabaseProviders();
  }
  return _providers;
}

// Allow test overrides
export function setProviders(p: ExtendedDataProviders): void {
  _providers = p;
}

// Convenience re-exports for hook usage
export const providers = {
  get search() { return getProviders().search; },
  get jobs() { return getProviders().jobs; },
  get user() { return getProviders().user; },
  get pipeline() { return getProviders().pipeline; },
  get resumes() { return getProviders().resumes; },
  get applications() { return getProviders().applications; },
  get stats() { return getProviders().stats; },
  get billing() { return getProviders().billing; },
  get tuning() { return getProviders().tuning; },
  get chat() { return getProviders().chat; },
  get integrations() { return getProviders().integrations; },
  get referrals() { return getProviders().referrals; },
  get admin() { return getProviders().admin; },
  get notifications() { return getProviders().notifications; },
  get interviewPrep() { return getProviders().interviewPrep; },
  get dashboardNotifications() { return getProviders().dashboardNotifications; },
};
