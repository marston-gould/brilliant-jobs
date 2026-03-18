// ============================================================
// useAgents — Admin Agents data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


interface AgentsState { loading: boolean; error: string | null; agentCount: number; activeCount: number; actionCount: number; errorRate: number; }
interface AgentsActions { refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<AgentsState> } | { type: 'ERROR'; error: string };
const initialState: AgentsState = { loading: true, error: null, agentCount: 0, activeCount: 0, actionCount: 0, errorRate: 0 };
function reducer(state: AgentsState, action: Action): AgentsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useAgents(): [AgentsState, AgentsActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('crewai-orchestrator', { action: 'status' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        agentCount: result?.agents?.length ?? 0,
        activeCount: result?.active ?? 0,
        actionCount: result?.actions ?? 0,
        errorRate: result?.error_rate ?? 0,
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
