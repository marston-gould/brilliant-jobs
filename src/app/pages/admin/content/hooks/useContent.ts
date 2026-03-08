// ============================================================
// useContent — Admin Content data hook (SA-017)
// ============================================================
// Bridges to legacy admin-content.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


interface ContentState { loading: boolean; error: string | null; storyCount: number; pendingCount: number; publishedCount: number; }
interface ContentActions { refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<ContentState> } | { type: 'ERROR'; error: string };
const initialState: ContentState = { loading: true, error: null, storyCount: 0, pendingCount: 0, publishedCount: 0 };
function reducer(state: ContentState, action: Action): ContentState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useContent(): [ContentState, ContentActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      const stories = bj._contentStories || {};
      const all = Object.values(stories);
      dispatch({ type: 'LOADED', data: {
        storyCount: all.length,
        pendingCount: all.filter((s: any) => s.status === 'pending').length,
        publishedCount: all.filter((s: any) => s.status === 'published').length,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadContentTab; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadContentTab; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh }];
}
