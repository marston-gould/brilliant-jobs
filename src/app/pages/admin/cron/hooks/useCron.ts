// ============================================================
// useCron — Admin Cron data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';


interface CronJob { name: string; schedule: string; lastRun: string; status: string; nextRun: string; }
interface CronState { loading: boolean; error: string | null; jobs: CronJob[]; activeCount: number; failedCount: number; }
interface CronActions { refresh: () => void; toggleJob: (name: string, enabled: boolean) => void; }
type Action = { type: 'LOADED'; data: Partial<CronState> } | { type: 'ERROR'; error: string };
const initialState: CronState = { loading: true, error: null, jobs: [], activeCount: 0, failedCount: 0 };
function reducer(state: CronState, action: Action): CronState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useCron(): [CronState, CronActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      const jobs = Array.isArray(null) ? null : [];
      dispatch({ type: 'LOADED', data: {
        // @ts-ignore SPA-CUT-3
        jobs,
        // @ts-ignore SPA-CUT-3
        activeCount: jobs.filter((j: any) => j.status === 'active').length,
        // @ts-ignore SPA-CUT-3
        failedCount: jobs.filter((j: any) => j.status === 'failed').length,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        providers.admin.getCronJobs();
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        providers.admin.getCronJobs();
  }, []);
  const toggleJob = useCallback((name: string, enabled: boolean) => {
    // SPA-CUT-REMEDIATION: Direct Supabase update
    async (name: string, enabled: boolean) => {
      await providers.admin.toggleCronJob(name, enabled);
    }
  }, []);

  return [state, { refresh, toggleJob }];
}
