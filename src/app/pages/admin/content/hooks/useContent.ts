// ============================================================
// useContent — Admin Content data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { callGateway } from '@lib/supabase';


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

  const loadData = useCallback(async () => {
    try {
      const result = await callGateway('admin-analytics', { action: 'content' }).catch(() => null) as any;
      dispatch({ type: 'LOADED', data: {
        storyCount: result?.stories ?? 0,
        pendingCount: result?.pending ?? 0,
        publishedCount: result?.published ?? 0,
      }});
    } catch (e) { dispatch({ type: 'ERROR', error: String(e) }); }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 30000); // 30s poll
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => { loadData(); }, [loadData]);

  return [state, { refresh }];
}
