// ============================================================
// useNotifications — Admin Notifications data hook (SA-017)
// ============================================================
// Bridges to legacy admin-notifications.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';


interface NotificationsState { loading: boolean; error: string | null; totalSent: number; deliveryRate: number; templateCount: number; failedCount: number; }
interface NotificationsActions { refresh: () => void; }
type Action = { type: 'LOADED'; data: Partial<NotificationsState> } | { type: 'ERROR'; error: string };
const initialState: NotificationsState = { loading: true, error: null, totalSent: 0, deliveryRate: 0, templateCount: 0, failedCount: 0 };
function reducer(state: NotificationsState, action: Action): NotificationsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}


export function useNotifications(): [NotificationsState, NotificationsActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any);
      dispatch({ type: 'LOADED', data: {
        totalSent: bj._notifTotalSent || 0,
        deliveryRate: bj._notifDeliveryRate || 0,
        templateCount: bj._notifTemplateCount || 0,
        failedCount: bj._notifFailedCount || 0,
      }});
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    // Init admin panel
    try { const fn = (window as any).loadNotificationsTab; if (typeof fn === 'function') fn(); } catch {}
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const refresh = useCallback(() => {
    try { const fn = (window as any).loadNotificationsTab; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { refresh }];
}
