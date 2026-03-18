// ============================================================
// useOverview — Admin Overview data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


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

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('admin-analytics', { action: 'board_health' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        totalJobs: result?.total_jobs ?? 0,
        activeUsers: result?.active_users ?? 0,
        efHealth: result?.ef_health ?? 100,
        cronHealth: result?.cron_health ?? 100,
        feedHealthy: result?.feed_healthy !== false,
        discoveryActive: !!result?.discovery_active,
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
