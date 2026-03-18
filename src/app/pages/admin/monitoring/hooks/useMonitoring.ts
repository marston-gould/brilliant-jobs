// ============================================================
// useMonitoring — Admin Monitoring data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


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
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({ type: 'LOADED', data: {
        alertCount: safeReadLS('bj__monAlertCount', 0),
        activeAlerts: safeReadLS('bj__monActiveAlerts', 0),
        resolvedToday: safeReadLS('bj__monResolvedToday', 0),
        avgResponseTime: safeReadLS('bj__monAvgResponseTime', 0),
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('deploy-tracker', { action: 'deploy-health-score' }).catch(() => { /* non-fatal */ });
    loadData();
    pollRef.current = setInterval(loadData, 30000) // 30s poll;
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('deploy-tracker', { action: 'deploy-health-score' }).catch(() => { /* non-fatal */ });
  }, []);

  return [state, { refresh }];
}
