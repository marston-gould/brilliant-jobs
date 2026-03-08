// ============================================================
// useOverview — Admin Overview data hook (SA-017)
// ============================================================
// Bridges to legacy admin-overview.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


interface OverviewState {
  loading: boolean;
  error: string | null;
  totalJobs: number;
  activeUsers: number;
  efHealth: number;
  cronHealth: number;
  feedHealthy: boolean;
  discoveryActive: boolean;
}
interface OverviewActions { refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<OverviewState> } | { type: 'ERROR'; error: string };
const initialState: OverviewState = { loading: true, error: null, totalJobs: 0, activeUsers: 0, efHealth: 100, cronHealth: 100, feedHealthy: true, discoveryActive: false };
function reducer(state: OverviewState, action: Action): OverviewState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useOverview(): [OverviewState, OverviewActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        totalJobs: bj._adminTotalJobs || 0,
        activeUsers: bj._adminActiveUsers || 0,
        efHealth: bj._adminEfHealth ?? 100,
        cronHealth: bj._adminCronHealth ?? 100,
        feedHealthy: bj._adminFeedHealthy !== false,
        discoveryActive: !!bj._adminDiscoveryActive,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).initAdminPage; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadBoardHealth; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh }];
}
