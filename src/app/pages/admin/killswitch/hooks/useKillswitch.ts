// ============================================================
// useKillswitch — Admin Kill Switch data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

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

  const loadData = useCallback(async () => {
    try {
      const flags = await providers.admin.getFeatureFlags().catch(() => []) as any[];
      const get = (key: string) => flags.find((f: any) => f.key === key)?.enabled !== false;
      dispatch({ type: 'LOADED', data: {
        extensionEnabled: get('extension'),
        dashboardEnabled: get('dashboard'),
        landingEnabled: get('landing'),
        lastToggled: new Date().toISOString(),
      }});
    } catch (e) { dispatch({ type: 'ERROR', error: String(e) }); }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => { loadData(); }, [loadData]);

  const toggle = useCallback(async (surface: string, enabled: boolean) => {
    try {
      await providers.admin.toggleFeatureFlag(surface, enabled);
      dispatch({ type: 'LOADED', data: {
        extensionEnabled: surface === 'extension' ? enabled : state.extensionEnabled,
        dashboardEnabled: surface === 'dashboard' ? enabled : state.dashboardEnabled,
        landingEnabled: surface === 'landing' ? enabled : state.landingEnabled,
        lastToggled: new Date().toISOString(),
      }});
      (window as any).__bjToast?.(`${surface} ${enabled ? 'enabled' : 'disabled'}`, 'success');
    } catch { (window as any).__bjToast?.('Failed to toggle', 'error'); }
  }, [loadData, state]);

  return [state, { refresh, toggle }];
}
