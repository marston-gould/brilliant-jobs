// ============================================================
// useSettings — Settings data hook (SA-017)
// ============================================================
// Bridges to legacy settings.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

export interface ProfileData {
  email: string;
  name: string;
  timezone: string;
  phone: string;
  linkedIn: string;
  joinedAt: string;
}

export interface AiScoringPrefs {
  enabled: boolean;
  matchThreshold: number;
  salaryWeight: number;
  locationWeight: number;
  titleWeight: number;
}

export interface DangerZoneState {
  deleteRequested: boolean;
  graceExpiresAt: string | null;
  exportReady: boolean;
}

interface SettingsState {
  loading: boolean;
  error: string | null;
  profile: ProfileData;
  aiScoring: AiScoringPrefs;
  dangerZone: DangerZoneState;
  jobCount: number;
  filterCount: number;
  resumeCount: number;
}

type Action =
  | { type: 'LOADED'; data: Partial<SettingsState> }
  | { type: 'ERROR'; error: string };

const initialState: SettingsState = {
  loading: true,
  error: null,
  profile: { email: '', name: '', timezone: '', phone: '', linkedIn: '', joinedAt: '' },
  aiScoring: { enabled: true, matchThreshold: 60, salaryWeight: 1, locationWeight: 1, titleWeight: 1 },
  dangerZone: { deleteRequested: false, graceExpiresAt: null, exportReady: false },
  jobCount: 0,
  filterCount: 0,
  resumeCount: 0,
};

function reducer(state: SettingsState, action: Action): SettingsState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    default: return state;
  }
}

export function useSettings(): [SettingsState, {
  openFeedback: () => void;
  requestDelete: () => void;
  cancelDelete: () => void;
  exportData: () => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(() => {
    try {
      const bj = (window as any).BJ || (window as any);
      const profile: ProfileData = {
        email: bj._userEmail || '',
        name: bj._userName || '',
        timezone: bj._userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        phone: bj._userPhone || '',
        linkedIn: bj._userLinkedIn || '',
        joinedAt: bj._userJoinedAt || '',
      };
      const aiScoring: AiScoringPrefs = bj._aiScoringPrefs || initialState.aiScoring;
      const dangerZone: DangerZoneState = {
        deleteRequested: !!bj._deleteRequested,
        graceExpiresAt: bj._graceExpiresAt || null,
        exportReady: !!bj._exportReady,
      };
      dispatch({
        type: 'LOADED',
        data: {
          profile,
          aiScoring,
          dangerZone,
          jobCount: bj._totalJobCount || 0,
          filterCount: Array.isArray(bj.savedFilters) ? bj.savedFilters.length : 0,
          resumeCount: Array.isArray(bj.resumes) ? bj.resumes.length : 0,
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(loadData, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const openFeedback = useCallback(() => {
    try { const fn = (window as any).openFeedback; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const requestDelete = useCallback(() => {
    try { const fn = (window as any)._requestAccountDeletion; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const cancelDelete = useCallback(() => {
    try { const fn = (window as any)._cancelAccountDeletion; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const exportData = useCallback(() => {
    try { const fn = (window as any)._exportUserData; if (typeof fn === 'function') fn(); } catch {}
  }, []);

  return [state, { openFeedback, requestDelete, cancelDelete, exportData }];
}
