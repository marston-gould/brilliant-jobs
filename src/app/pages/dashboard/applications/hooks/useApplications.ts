// ============================================================
// useApplications — Applications data hook (SA-016)
// ============================================================
// Bridges to legacy applications.js via window.* globals.
// Components consume application data through this hook only.
// When migration is complete, swap window.* reads for
// ApplicationProvider calls — no component changes needed.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

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
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, queue: action.queue, history: action.history, mode: action.mode };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_SETTINGS_TAB':
      return { ...state, settingsTab: action.tab };
    case 'TOGGLE_SETTINGS':
      return { ...state, showSettings: !state.showSettings };
    case 'UPDATE_MODE':
      return { ...state, mode: action.mode };
    case 'SET_NOTIF_PREFS':
      return { ...state, notifPrefs: action.prefs };
    case 'SET_NOTIF_LOG':
      return { ...state, notifLog: action.log };
    case 'REFRESH':
      return { ...state, queue: action.queue, history: action.history };
    default:
      return state;
  }
}

const INITIAL_STATE: ApplicationsState = {
  loading: true,
  error: null,
  queue: [],
  history: [],
  mode: 'manual',
  notifPrefs: null,
  notifLog: [],
  activeTab: 'queue',
  settingsTab: 'rules',
  showSettings: false,
};

// ── Hook ─────────────────────────────────────────────────────

export function useApplications(): [ApplicationsState, ReturnType<typeof buildActions>] {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const win = window as Record<string, unknown>;
      const safeReadLS = (win.safeReadLS || ((key: string, fb: unknown) => {
        try { return JSON.parse(localStorage.getItem(key) || '') || fb; } catch { return fb; }
      })) as (key: string, fallback: unknown) => unknown;

      const queue = (win.appQueue || safeReadLS('bj_app_queue', [])) as AppEntry[];
      const history = (win.appHistory || safeReadLS('bj_app_history', [])) as AppEntry[];
      const mode = (localStorage.getItem('bj_app_mode') || 'manual') as AppMode;

      dispatch({ type: 'LOAD_SUCCESS', queue, history, mode });
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', error: err instanceof Error ? err.message : 'Failed to load applications' });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadData, 100);
    pollRef.current = setInterval(loadData, 3000);
    return () => {
      clearTimeout(timer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadData]);

  const actions = useMemo(() => buildActions(dispatch, loadData), [dispatch, loadData]);

  return [state, actions];
}

// ── Actions ──────────────────────────────────────────────────

function buildActions(dispatch: React.Dispatch<ApplicationsAction>, reload: () => void) {
  const win = () => window as Record<string, unknown>;

  return {
    setTab(tab: 'queue' | 'history' | 'notifications') {
      dispatch({ type: 'SET_TAB', tab });
    },

    setSettingsTab(tab: 'rules' | 'notifications') {
      dispatch({ type: 'SET_SETTINGS_TAB', tab });
    },

    toggleSettings() {
      dispatch({ type: 'TOGGLE_SETTINGS' });
    },

    setMode(mode: AppMode) {
      localStorage.setItem('bj_app_mode', mode);
      dispatch({ type: 'UPDATE_MODE', mode });
    },

    addManual(jobTitle: string, company: string, url: string) {
      const w = win();
      const queue = (w.appQueue || []) as AppEntry[];
      const resumes = (w.resumes || []) as Array<{ name: string; id: string; archived: boolean; needsUpload: boolean }>;
      const firstResume = resumes.find(r => !r.archived && !r.needsUpload);
      const mode = (localStorage.getItem('bj_app_mode') || 'manual') as AppMode;

      queue.push({
        id: `app_${Date.now()}`,
        jobTitle,
        company,
        url,
        resumeName: firstResume?.name || '',
        resumeId: firstResume?.id || '',
        mode,
        status: mode === 'auto' ? 'queued' : mode === 'notify' ? 'pending' : 'queued',
        addedAt: new Date().toLocaleDateString(),
        source: 'manual',
      });

      const saveUserData = w.saveUserData as ((key: string, val: string) => void) | undefined;
      if (saveUserData) saveUserData('bj_app_queue', JSON.stringify(queue));
      setTimeout(reload, 50);
    },

    removeFromQueue(idx: number) {
      const fn = win().removeFromQueue as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 50);
    },

    processQueue() {
      const el = document.getElementById('a-process-queue');
      if (el) el.click();
      setTimeout(reload, 100);
    },

    clearHistory() {
      const w = win();
      if (w.appHistory) (w as Record<string, AppEntry[]>).appHistory = [];
      const saveUserData = w.saveUserData as ((key: string, val: string) => void) | undefined;
      if (saveUserData) saveUserData('bj_app_history', '[]');
      setTimeout(reload, 50);
    },

    loadNotifPrefs() {
      const fn = win().loadNotifPrefs as (() => Promise<void>) | undefined;
      if (fn) fn();
    },

    loadNotifLog() {
      const fn = win().loadNotifLog as (() => Promise<void>) | undefined;
      if (fn) fn();
    },

    getQueueStats() {
      return {
        queued: 0,
        pending: 0,
        submitted: 0,
        failed: 0,
      };
    },
  };
}
