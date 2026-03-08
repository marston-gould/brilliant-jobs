// ============================================================
// useKillswitch — Admin Kill Switch data hook (SA-017)
// ============================================================
// Bridges to legacy admin-killswitch.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


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
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        extensionEnabled: bj._ksExtension !== false,
        dashboardEnabled: bj._ksDashboard !== false,
        landingEnabled: bj._ksLanding !== false,
        lastToggled: bj._ksLastToggled || '',
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadKillSwitchPanel; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadKillSwitchPanel; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const toggle = useCallback((surface: string, enabled: boolean) => {
    try { const fn = (window as any)._toggleKillSwitch; if (typeof fn === 'function') fn(surface, enabled); } catch {}
  }, []);

  return [state, { refresh, toggle }];
}
