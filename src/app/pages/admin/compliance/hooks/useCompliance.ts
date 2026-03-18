// ============================================================
// useCompliance — Admin Compliance data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


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

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('admin-analytics', { action: 'compliance' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        piiFieldCount: result?.pii_fields ?? 0,
        pendingDeletions: result?.pending_deletions ?? 0,
        completedDeletions: result?.completed_deletions ?? 0,
        lastAudit: result?.last_audit ?? '',
      }});
    } catch (e) { dispatch({ type: 'ERROR', error: String(e) }); }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => { loadData(); }, [loadData]);

  const initiateDeletion = useCallback(async (userId: string) => {
    try {
      await callGateway('admin-user-manager', { action: 'delete_account', user_id: userId, reason: 'admin_initiated' });
      (window as any).__bjToast?.('Deletion initiated', 'success');
      loadData();
    } catch { (window as any).__bjToast?.('Failed to initiate deletion', 'error'); }
  }, [loadData]);

  const cancelDeletion = useCallback(async (userId: string) => {
    try {
      await callGateway('admin-user-manager', { action: 'cancel_delete', user_id: userId });
      (window as any).__bjToast?.('Deletion cancelled', 'success');
      loadData();
    } catch { (window as any).__bjToast?.('Failed to cancel deletion', 'error'); }
  }, [loadData]);

  return [state, { refresh, initiateDeletion, cancelDeletion }];
}
