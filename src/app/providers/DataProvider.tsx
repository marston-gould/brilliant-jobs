// ============================================================
// DataProvider Context (SA-013 → SPA-CUT-REMEDIATION)
// ============================================================
// Wraps all data providers in a React context.
// Components use the useProviders() hook to access data.
//
// This decouples UI from data access — swap providers to
// change backends, add caching, or mock for tests.
//
// SPA-CUT-REMEDIATION: Extended from 4 providers to 14.
// All hooks MUST access data through these providers, never
// directly through Supabase client or fetch calls.
// ============================================================

import React, { createContext, useContext, useMemo } from 'react';
import type { ExtendedDataProviders } from './types';
import { createExtendedSupabaseProviders } from './supabase';

const ProviderContext = createContext<ExtendedDataProviders | null>(null);

interface DataProviderProps {
  providers?: ExtendedDataProviders;
  children: React.ReactNode;
}

/**
 * DataProvider — wraps the app with data access providers.
 *
 * Default: Supabase-backed providers.
 * For tests: pass mock providers via the `providers` prop.
 */
export function DataProvider({ providers, children }: DataProviderProps) {
  const value = useMemo(
    () => providers || createExtendedSupabaseProviders(),
    [providers]
  );

  return (
    <ProviderContext.Provider value={value}>
      {children}
    </ProviderContext.Provider>
  );
}

/**
 * useProviders — access all data providers.
 */
export function useProviders(): ExtendedDataProviders {
  const ctx = useContext(ProviderContext);
  if (!ctx) {
    throw new Error('useProviders must be used within a <DataProvider>');
  }
  return ctx;
}

/**
 * Convenience hooks for individual providers.
 */
export function useSearch() { return useProviders().search; }
export function useJobs() { return useProviders().jobs; }
export function useUser() { return useProviders().user; }
export function usePipelineProvider() { return useProviders().pipeline; }
export function useResumesProvider() { return useProviders().resumes; }
export function useApplicationsProvider() { return useProviders().applications; }
export function useStatsProvider() { return useProviders().stats; }
export function useBillingProvider() { return useProviders().billing; }
export function useTuningProvider() { return useProviders().tuning; }
export function useChatProvider() { return useProviders().chat; }
export function useIntegrationsProvider() { return useProviders().integrations; }
export function useReferralsProvider() { return useProviders().referrals; }
export function useAdminProvider() { return useProviders().admin; }
export function useNotificationsProvider() { return useProviders().notifications; }

export default DataProvider;
