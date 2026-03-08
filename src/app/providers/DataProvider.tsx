// ============================================================
// DataProvider Context (SA-013)
// ============================================================
// Wraps all data providers in a React context.
// Components use the useProviders() hook to access data.
//
// This decouples UI from data access — swap providers to
// change backends, add caching, or mock for tests.
// ============================================================

import React, { createContext, useContext, useMemo } from 'react';
import type { DataProviders } from './types';
import { createSupabaseProviders } from './supabase';

const ProviderContext = createContext<DataProviders | null>(null);

interface DataProviderProps {
  providers?: DataProviders;
  children: React.ReactNode;
}

/**
 * DataProvider — wraps the app with data access providers.
 *
 * Default: Supabase-backed providers (reads from window.BJ.supabase).
 * For tests: pass mock providers via the `providers` prop.
 *
 * @example
 * // Production usage (default Supabase)
 * <DataProvider>
 *   <App />
 * </DataProvider>
 *
 * @example
 * // Test usage (mock providers)
 * <DataProvider providers={mockProviders}>
 *   <FeedPage />
 * </DataProvider>
 */
export function DataProvider({ providers, children }: DataProviderProps) {
  const value = useMemo(
    () => providers || createSupabaseProviders(),
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
 *
 * @example
 * const { search, jobs, user, pipeline } = useProviders();
 * const results = await search.search({ query: 'react developer' });
 */
export function useProviders(): DataProviders {
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
export function usePipeline() { return useProviders().pipeline; }

export default DataProvider;
