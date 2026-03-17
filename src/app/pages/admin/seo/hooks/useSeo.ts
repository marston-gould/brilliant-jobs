// ============================================================
// useSeo — Admin SEO data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


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

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      dispatch({ type: 'LOADED', data: {
        pageViews: safeReadLS('bj__seoPageViews', 0),
        impressions: safeReadLS('bj__seoImpressions', 0),
        clickRate: safeReadLS('bj__seoClickRate', 0),
        avgPosition: safeReadLS('bj__seoAvgPosition', 0),
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'seo' }).catch(() => { /* non-fatal */ });
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'seo' }).catch(() => { /* non-fatal */ });
  }, []);
  const generateReport = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('seo-sync', {}).catch(() => { /* non-fatal */ });
  }, []);

  return [state, { refresh, generateReport }];
}
