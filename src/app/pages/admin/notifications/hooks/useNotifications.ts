// ============================================================
// useNotifications — Admin notifications hook (SA-017 → SPA-CUT-2)
// ============================================================
// Standalone — queries notification tables via Supabase.
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase } from '@lib/supabase';

interface NotificationsState {
  loading: boolean;
  error: string | null;
  templates: any[];
  campaigns: any[];
  stats: { total: number; sent24h: number; failed24h: number; pending: number };
}

type Action =
  | { type: 'LOADED'; data: Partial<NotificationsState> }
  | { type: 'ERROR'; error: string };

const initial: NotificationsState = {
  loading: true, error: null, templates: [], campaigns: [],
  stats: { total: 0, sent24h: 0, failed24h: 0, pending: 0 },
};

function reducer(state: NotificationsState, action: Action): NotificationsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useNotifications() {
  const [state, dispatch] = useReducer(reducer, initial);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [{ data: templates }, { data: campaigns }] = await Promise.all([
        supabase.from('notification_templates').select('*').order('created_at', { ascending: false }),
        supabase.from('survey_campaigns').select('*').order('priority'),
      ]);

      // 24h stats from notification_log
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count: sent24h } = await supabase.from('notification_log')
        .select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since);
      const { count: failed24h } = await supabase.from('notification_log')
        .select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since);

      if (mountedRef.current) {
        dispatch({ type: 'LOADED', data: {
          templates: templates || [],
          campaigns: campaigns || [],
          stats: { total: (templates || []).length, sent24h: sent24h || 0, failed24h: failed24h || 0, pending: 0 },
        }});
      }
    } catch (err) {
      if (mountedRef.current) dispatch({ type: 'ERROR', error: (err as Error).message });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => { mountedRef.current = false; };
  }, [refresh]);

  return { state, refresh };
}
