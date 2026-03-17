// ============================================================
// useNotifications — Admin notifications hook (SA-017 → SPA-CUT-2)
// ============================================================
// Standalone — queries notification tables via Supabase.
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

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
      const [templates, campaigns] = await Promise.all([
        providers.notifications.getTemplates(),
        providers.notifications.getCampaigns(),
      ]);

      // 24h stats from notification_log
      const _stats24h = await providers.notifications.getStats24h();
      const sent24h = _stats24h?.sent || 0;
      const failed24h = _stats24h?.failed || 0;

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
