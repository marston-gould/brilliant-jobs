// ============================================================
// useCompliance — Admin Compliance data hook (SA-017)
// ============================================================
// Bridges to legacy admin-compliance.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


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
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        piiFieldCount: bj._compPiiFields || 0,
        pendingDeletions: bj._compPendingDeletions || 0,
        completedDeletions: bj._compCompletedDeletions || 0,
        lastAudit: bj._compLastAudit || '',
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadComplianceDashPanel; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadComplianceDashPanel; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const initiateDeletion = useCallback((userId: string) => {
    try { const fn = (window as any)._initiateDeletion; if (typeof fn === 'function') fn(userId); } catch {}
  }, []);
  const cancelDeletion = useCallback((userId: string) => {
    try { const fn = (window as any)._cancelDeletion; if (typeof fn === 'function') fn(userId); } catch {}
  }, []);

  return [state, { refresh, initiateDeletion, cancelDeletion }];
}
