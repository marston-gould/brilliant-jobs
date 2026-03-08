// ============================================================
// useAgents — Admin Agents data hook (SA-017)
// ============================================================
// Bridges to legacy admin-agents.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


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
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        agentCount: bj._crewaiAgentCount || 0,
        activeCount: bj._crewaiActiveCount || 0,
        actionCount: bj._crewaiActionCount || 0,
        errorRate: bj._crewaiErrorRate || 0,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadCrewAIPanel; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadCrewAIPanel; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh }];
}
