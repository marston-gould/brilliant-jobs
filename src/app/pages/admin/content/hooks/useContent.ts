// ============================================================
// useContent — Admin Content data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';


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
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      const stories = safeReadLS('bj__contentStories', {});
      const all = Object.values(stories);
      dispatch({ type: 'LOADED', data: {
        storyCount: all.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pendingCount: all.filter((s: any) => s.status === 'pending').length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        publishedCount: all.filter((s: any) => s.status === 'published').length,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'content' }).catch(() => { /* non-fatal */ });
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    // @ts-ignore SPA-CUT-3: fire-and-forget
        callGateway('admin-analytics', { action: 'content' }).catch(() => { /* non-fatal */ });
  }, []);

  return [state, { refresh }];
}
