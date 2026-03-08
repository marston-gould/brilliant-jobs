// ============================================================
// useMonitoring — Admin Monitoring data hook (SA-017)
// ============================================================
// Bridges to legacy admin-monitoring.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


interface MonitoringState { loading: boolean; error: string | null; alertCount: number; activeAlerts: number; resolvedToday: number; avgResponseTime: number; }
interface MonitoringActions { refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<MonitoringState> } | { type: 'ERROR'; error: string };
const initialState: MonitoringState = { loading: true, error: null, alertCount: 0, activeAlerts: 0, resolvedToday: 0, avgResponseTime: 0 };
function reducer(state: MonitoringState, action: Action): MonitoringState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useMonitoring(): [MonitoringState, MonitoringActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        alertCount: bj._monAlertCount || 0,
        activeAlerts: bj._monActiveAlerts || 0,
        resolvedToday: bj._monResolvedToday || 0,
        avgResponseTime: bj._monAvgResponseTime || 0,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadMonitoringPanel; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadMonitoringPanel; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh }];
}
