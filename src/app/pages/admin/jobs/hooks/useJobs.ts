// ============================================================
// useJobs — Admin Jobs data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';


interface JobEntry { id: string; title: string; company: string; source: string; createdAt: string; }
interface JobsState { loading: boolean; error: string | null; jobs: JobEntry[]; total: number; page: number; pageSize: number; }
interface JobsActions { loadPage: (page: number) => void; refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<JobsState> } | { type: 'ERROR'; error: string };
const initialState: JobsState = { loading: true, error: null, jobs: [], total: 0, page: 1, pageSize: 50 };
function reducer(state: JobsState, action: Action): JobsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useJobs(): [JobsState, JobsActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async (page = 1) => {
    try {
      const rawJobs = await providers.admin.getJobs(page - 1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const jobs = (rawJobs as any[]) || [];
      dispatch({ type: 'LOADED', data: { jobs, total: jobs.length, page } });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(() => loadData(), 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const loadPage = useCallback((page: number) => {
    loadData(page);
  }, [loadData]);
  const refresh = useCallback(() => loadData(1), [loadData]);

  return [state, { loadPage, refresh }];
}
