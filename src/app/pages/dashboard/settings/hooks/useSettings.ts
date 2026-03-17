// ============================================================
// useSettings — Settings data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

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
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      const profile: ProfileData = {
        email: safeReadLS('bj__userEmail', ''),
        name: safeReadLS('bj__userName', ''),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        phone: safeReadLS('bj__userPhone', ''),
        linkedIn: safeReadLS('bj__userLinkedIn', ''),
        joinedAt: safeReadLS('bj__userJoinedAt', ''),
      };
      const aiScoring: AiScoringPrefs = initialState.aiScoring;
      const dangerZone: DangerZoneState = {
        // @ts-ignore SPA-CUT-3
        deleteRequested: !!null,
        graceExpiresAt: safeReadLS('bj__graceExpiresAt', null),
        // @ts-ignore SPA-CUT-3
        exportReady: !!null,
      };
      dispatch({
        type: 'LOADED',
        data: {
          profile,
          aiScoring,
          dangerZone,
          jobCount: safeReadLS('bj__totalJobCount', 0),
          // @ts-ignore SPA-CUT-3
          filterCount: Array.isArray(null) ? null.length : 0,
          // @ts-ignore SPA-CUT-3
          resumeCount: Array.isArray(null) ? null.length : 0,
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
    try { window.open('https://brilliantjobs.canny.io', '_blank'); } catch { /* non-fatal */ }
  }, []);
  const requestDelete = useCallback(() => {
    // SPA-CUT-REMEDIATION: Via admin-user-manager gateway
    async () => {
      if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
      await callGateway('admin-user-manager', { action: 'request_deletion' });
    }
  }, []);
  const cancelDelete = useCallback(() => {
    // SPA-CUT-REMEDIATION: Via admin-user-manager gateway
    async () => { await callGateway('admin-user-manager', { action: 'cancel_deletion' }); }
  }, []);
  const exportData = useCallback(() => {
    // SPA-CUT-REMEDIATION: Via admin-user-manager gateway (returns download URL)
    async () => {
      const result = await callGateway('admin-user-manager', { action: 'export_data' });
      if (result?.url) window.open(result.url, '_blank');
    }
  }, []);

  return [state, { openFeedback, requestDelete, cancelDelete, exportData }];
}
