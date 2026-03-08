// ============================================================
// useJobs — Admin Jobs data hook (SA-017)
// ============================================================
// Bridges to legacy admin-jobs.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


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

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        jobs: Array.isArray(bj._adminJobs) ? bj._adminJobs : [],
        total: bj._adminJobsTotal || 0,
        page: bj._adminJobsPage || 1,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadAdminJobs; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const loadPage = useCallback((page: number) => {
    try { const fn = (window as any).loadAdminJobs; if (typeof fn === 'function') fn(page); } catch {}
  }, []);
  const refresh = useCallback(() => loadPage(1), [loadPage]);

  return [state, { loadPage, refresh }];
}
