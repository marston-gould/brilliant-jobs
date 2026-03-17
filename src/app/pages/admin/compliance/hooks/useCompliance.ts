// ============================================================
// useCompliance — Admin Compliance data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


interface ComplianceState { loading: boolean; error: string | null; piiFieldCount: number; pendingDeletions: number; completedDeletions: number; lastAudit: string; }
interface ComplianceActions { refresh: () => void; initiateDeletion: (userId: string) => void; cancelDeletion: (userId: string) => void; }
type Action = { type: 'LOADED'; data: Partial<ComplianceState> } | { type: 'ERROR'; error: string };
const initialState: ComplianceState = { loading: true, error: null, piiFieldCount: 0, pendingDeletions: 0, completedDeletions: 0, lastAudit: '' };
function reducer(state: ComplianceState, action: Action): ComplianceState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useCompliance(): [ComplianceState, ComplianceActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({ type: 'LOADED', data: {
        piiFieldCount: safeReadLS('bj__compPiiFields', 0),
        pendingDeletions: safeReadLS('bj__compPendingDeletions', 0),
        completedDeletions: safeReadLS('bj__compCompletedDeletions', 0),
        lastAudit: safeReadLS('bj__compLastAudit', ''),
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'compliance' }).catch(() => { /* non-fatal */ });
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'compliance' }).catch(() => { /* non-fatal */ });
  }, []);
  const initiateDeletion = useCallback((userId: string) => {
    // TODO SPA-CUT-3: _initiateDeletion(userId) needs standalone implementation
  }, []);
  const cancelDeletion = useCallback((userId: string) => {
    // TODO SPA-CUT-3: _cancelDeletion(userId) needs standalone implementation
  }, []);

  return [state, { refresh, initiateDeletion, cancelDeletion }];
}
