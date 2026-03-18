// ============================================================
// useSeo — Admin SEO data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


interface SeoState { loading: boolean; error: string | null; pageViews: number; impressions: number; clickRate: number; avgPosition: number; }
interface SeoActions { refresh: () => void; generateReport: () => void; }
type Action = { type: 'LOADED'; data: Partial<SeoState> } | { type: 'ERROR'; error: string };
const initialState: SeoState = { loading: true, error: null, pageViews: 0, impressions: 0, clickRate: 0, avgPosition: 0 };
function reducer(state: SeoState, action: Action): SeoState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useSeo(): [SeoState, SeoActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('admin-analytics', { action: 'seo' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        pageViews: result?.page_views ?? 0,
        impressions: result?.impressions ?? 0,
        clickRate: result?.click_rate ?? 0,
        avgPosition: result?.avg_position ?? 0,
      }});
    } catch (e) { dispatch({ type: 'ERROR', error: String(e) }); }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => { loadData(); }, [loadData]);

  const generateReport = useCallback(async () => {
    try {
      await callGateway('seo-sync', {});
      (window as any).__bjToast?.('SEO report generation started', 'success');
    } catch { (window as any).__bjToast?.('Failed to generate report', 'error'); }
  }, []);

  return [state, { refresh, generateReport }];
}
