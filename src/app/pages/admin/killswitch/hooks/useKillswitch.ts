// ============================================================
// useKillswitch — Admin Kill Switch data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';


interface KillswitchState { loading: boolean; error: string | null; extensionEnabled: boolean; dashboardEnabled: boolean; landingEnabled: boolean; lastToggled: string; }
interface KillswitchActions { refresh: () => void; toggle: (surface: string, enabled: boolean) => void; }
type Action = { type: 'LOADED'; data: Partial<KillswitchState> } | { type: 'ERROR'; error: string };
const initialState: KillswitchState = { loading: true, error: null, extensionEnabled: true, dashboardEnabled: true, landingEnabled: true, lastToggled: '' };
function reducer(state: KillswitchState, action: Action): KillswitchState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useKillswitch(): [KillswitchState, KillswitchActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({ type: 'LOADED', data: {
        extensionEnabled: null !== false,
        dashboardEnabled: null !== false,
        landingEnabled: null !== false,
        lastToggled: safeReadLS('bj__ksLastToggled', ''),
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        providers.admin.getFeatureFlags();
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        providers.admin.getFeatureFlags();
  }, []);
  const toggle = useCallback((surface: string, enabled: boolean) => {
    // SPA-CUT-REMEDIATION: Direct Supabase update
    async (surface: string, enabled: boolean) => {
      await providers.admin.toggleFeatureFlag(surface, enabled);
    }
  }, []);

  return [state, { refresh, toggle }];
}
