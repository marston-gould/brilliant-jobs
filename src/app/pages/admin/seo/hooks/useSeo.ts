// ============================================================
// useSeo — Admin SEO data hook (SA-017)
// ============================================================
// Bridges to legacy admin-seo.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


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
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        pageViews: bj._seoPageViews || 0,
        impressions: bj._seoImpressions || 0,
        clickRate: bj._seoClickRate || 0,
        avgPosition: bj._seoAvgPosition || 0,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadSeoTab; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadSeoTab; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const generateReport = useCallback(() => {
    try { const fn = (window as any).generateSeoReport; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh, generateReport }];
}
