// ============================================================
// useMonitoring — Admin Monitoring data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


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

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('deploy-tracker', { action: 'deploy-health-score' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        alertCount: result?.alerts ?? 0,
        activeAlerts: result?.active_alerts ?? 0,
        resolvedToday: result?.resolved_today ?? 0,
        avgResponseTime: result?.avg_response_ms ?? 0,
      }});
    } catch (e) { dispatch({ type: 'ERROR', error: String(e) }); }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => { loadData(); }, [loadData]);

  return [state, { refresh }];
}
