// ============================================================
// useApplications — Applications data hook (SA-016 → SPA-CUT-2)
// ============================================================
// Standalone hook — reads from localStorage + Supabase.
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

// ── Types ────────────────────────────────────────────────────

export type AppMode = 'manual' | 'auto' | 'notify';
export type AppStatus = 'queued' | 'pending' | 'sent' | 'submitted' | 'failed';

export interface AppEntry {
  id: string;
  jobTitle: string;
  company: string;
  url: string;
  resumeName: string;
  resumeId: string;
  mode: AppMode;
  status: AppStatus;
  addedAt: string;
  submittedAt?: string;
  source: string;
}

export interface NotifPref {
  enabled: boolean;
  channels: string[];
  escalation: string;
  timezone: string;
  phone?: string;
  quietStart?: string;
  quietEnd?: string;
}

export type NotifStatus = 'sent' | 'failed' | 'pending' | 'delivered';

export interface NotifLogEntry {
  id: string;
  type: string;
  channel: string;
  status: NotifStatus;
  sentAt: string;
  subject?: string;
  error?: string;
}

// ── State ────────────────────────────────────────────────────

interface ApplicationsState {
  loading: boolean;
  error: string | null;
  queue: AppEntry[];
  history: AppEntry[];
  mode: AppMode;
  notifPrefs: NotifPref | null;
  notifLog: NotifLogEntry[];
  activeTab: 'queue' | 'history' | 'notifications';
  settingsTab: 'rules' | 'notifications';
  showSettings: boolean;
}

type ApplicationsAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; queue: AppEntry[]; history: AppEntry[]; mode: AppMode }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SET_TAB'; tab: 'queue' | 'history' | 'notifications' }
  | { type: 'SET_SETTINGS_TAB'; tab: 'rules' | 'notifications' }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'UPDATE_MODE'; mode: AppMode }
  | { type: 'SET_NOTIF_PREFS'; prefs: NotifPref }
  | { type: 'SET_NOTIF_LOG'; log: NotifLogEntry[] }
  | { type: 'REFRESH'; queue: AppEntry[]; history: AppEntry[] };

function reducer(state: ApplicationsState, action: ApplicationsAction): ApplicationsState {
  switch (action.type) {
    case 'LOAD_START': return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS': return { ...state, loading: false, queue: action.queue, history: action.history, mode: action.mode };
    case 'LOAD_ERROR': return { ...state, loading: false, error: action.error };
    case 'SET_TAB': return { ...state, activeTab: action.tab };
    case 'SET_SETTINGS_TAB': return { ...state, settingsTab: action.tab };
    case 'TOGGLE_SETTINGS': return { ...state, showSettings: !state.showSettings };
    case 'UPDATE_MODE': return { ...state, mode: action.mode };
    case 'SET_NOTIF_PREFS': return { ...state, notifPrefs: action.prefs };
    case 'SET_NOTIF_LOG': return { ...state, notifLog: action.log };
    case 'REFRESH': return { ...state, queue: action.queue, history: action.history };
    default: return state;
  }
}

const INITIAL_STATE: ApplicationsState = {
  loading: true, error: null, queue: [], history: [], mode: 'manual',
  notifPrefs: null, notifLog: [], activeTab: 'queue', settingsTab: 'rules', showSettings: false,
};

// ── Hook ─────────────────────────────────────────────────────

export function useApplications(): [ApplicationsState, ReturnType<typeof buildActions>] {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const queue = safeReadLS<AppEntry[]>('bj_app_queue', []);
      const history = safeReadLS<AppEntry[]>('bj_app_history', []);
      const mode = (localStorage.getItem('bj_app_mode') || 'manual') as AppMode;
      dispatch({ type: 'LOAD_SUCCESS', queue, history, mode });
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', error: err instanceof Error ? err.message : 'Failed to load applications' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadData, 100);
    pollRef.current = setInterval(loadData, 3000);
    return () => { clearTimeout(timer); if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const actions = useMemo(() => buildActions(dispatch, loadData), [dispatch, loadData]);
  return [state, actions];
}

// ── Actions (SPA-CUT-2: direct localStorage + Supabase) ──────

function buildActions(dispatch: React.Dispatch<ApplicationsAction>, reload: () => void) {
  return {
    setTab(tab: 'queue' | 'history' | 'notifications') { dispatch({ type: 'SET_TAB', tab }); },
    setSettingsTab(tab: 'rules' | 'notifications') { dispatch({ type: 'SET_SETTINGS_TAB', tab }); },
    toggleSettings() { dispatch({ type: 'TOGGLE_SETTINGS' }); },

    setMode(mode: AppMode) {
      localStorage.setItem('bj_app_mode', mode);
      dispatch({ type: 'UPDATE_MODE', mode });
    },

    addManual(jobTitle: string, company: string, url: string) {
      const queue = safeReadLS<AppEntry[]>('bj_app_queue', []);
      const resumes = safeReadLS<any[]>('bj_resumes', []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const firstResume = resumes.find((r: any) => !r.archived && r.textStatus === 'ready');
      const mode = (localStorage.getItem('bj_app_mode') || 'manual') as AppMode;

      queue.push({
        id: `app_${Date.now()}`,
        jobTitle, company, url,
        resumeName: firstResume?.name || '',
        resumeId: firstResume?.supabaseId || '',
        mode,
        status: mode === 'auto' ? 'queued' : mode === 'notify' ? 'pending' : 'queued',
        addedAt: new Date().toLocaleDateString(),
        source: 'manual',
      });
      safeWriteLS('bj_app_queue', queue);
      setTimeout(reload, 50);
    },

    removeFromQueue(idx: number) {
      const queue = safeReadLS<AppEntry[]>('bj_app_queue', []);
      if (idx >= 0 && idx < queue.length) {
        queue.splice(idx, 1);
        safeWriteLS('bj_app_queue', queue);
      }
      setTimeout(reload, 50);
    },

    async processQueue() {
      // SPA-CUT-REMEDIATION: Approve all queued items → worker picks them up
      const queue = safeReadLS<AppEntry[]>('bj_app_queue', []);
      const queued = queue.filter(e => e.status === 'queued');
      if (queued.length === 0) return;

      // Mark all as approved → headless worker polls for approved status
      for (const entry of queued) {
        try {
          // Approved via provider
            await providers.applications.processQueue();
          entry.status = 'pending' as AppStatus;
        } catch { /* non-fatal per-item */ }
      }
      safeWriteLS('bj_app_queue', queue);
      setTimeout(reload, 100);
    },

    clearHistory() {
      safeWriteLS('bj_app_history', []);
      setTimeout(reload, 50);
    },

    async loadNotifPrefs() {
      try {
        const user = await getUser();
        if (!user) return;
        const data = await providers.applications.getNotifPrefs();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) dispatch({ type: 'SET_NOTIF_PREFS', prefs: data as any });
      } catch { /* non-fatal */ }
    },

    async loadNotifLog() {
      try {
        const user = await getUser();
        if (!user) return;
        const data = await providers.applications.getNotifLog();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (data) dispatch({ type: 'SET_NOTIF_LOG', log: data as any[] });
      } catch { /* non-fatal */ }
    },

    getQueueStats() {
      const queue = safeReadLS<AppEntry[]>('bj_app_queue', []);
      return {
        queued: queue.filter(e => e.status === 'queued').length,
        pending: queue.filter(e => e.status === 'pending').length,
        submitted: queue.filter(e => e.status === 'submitted').length,
        failed: queue.filter(e => e.status === 'failed').length,
      };
    },
  };
}
