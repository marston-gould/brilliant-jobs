// ============================================================
// useAgents — Admin Agents data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


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

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({ type: 'LOADED', data: {
        agentCount: safeReadLS('bj__crewaiAgentCount', 0),
        activeCount: safeReadLS('bj__crewaiActiveCount', 0),
        actionCount: safeReadLS('bj__crewaiActionCount', 0),
        errorRate: safeReadLS('bj__crewaiErrorRate', 0),
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('crewai-orchestrator', { action: 'status' }).catch(() => { /* non-fatal */ });
    loadData();
    pollRef.current = setInterval(loadData, 30000) // 30s poll;
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('crewai-orchestrator', { action: 'status' }).catch(() => { /* non-fatal */ });
  }, []);

  return [state, { refresh }];
}
