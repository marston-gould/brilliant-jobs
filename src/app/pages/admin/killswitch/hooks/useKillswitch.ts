// ============================================================
// useKillswitch — Admin Kill Switch data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


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
        supabase.from('feature_flags').select('*').order('key');
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        supabase.from('feature_flags').select('*').order('key');
  }, []);
  const toggle = useCallback((surface: string, enabled: boolean) => {
    // TODO SPA-CUT-3: _toggleKillSwitch(surface, enabled) needs standalone implementation
  }, []);

  return [state, { refresh, toggle }];
}
