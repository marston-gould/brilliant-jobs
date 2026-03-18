// ============================================================
// useSettings — Settings data hook (SA-017 → SPA-PHASE-A)
// ============================================================
// Loads profile from Supabase auth + profiles table.
// Zero window.* dependencies. No polling needed — settings
// change only on explicit user action.
// ============================================================

import { useCallback, useEffect, useReducer } from 'react';
import { safeReadLS, callGateway, getUser, supabase } from '@lib/supabase';

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

  const loadData = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) {
        dispatch({ type: 'ERROR', error: 'Not authenticated' });
        return;
      }

      // Load profile from Supabase profiles table
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, phone, user_data, created_at, plan')
        .eq('id', user.id)
        .maybeSingle();

      const userData = (profile?.user_data as Record<string, unknown>) || {};

      // Count user resources in parallel
      const [resumesResult] = await Promise.allSettled([
        supabase.from('resumes').select('*', { count: 'exact', head: true }).eq('user_id', user.id).is('deleted_at', null),
      ]);

      const resumeCount = resumesResult.status === 'fulfilled' ? (resumesResult.value.count || 0) : safeReadLS('bj__resumeCount', 0);
      const jobCount = safeReadLS<number>('bj__totalJobCount', 0);

      const deleteGrace = (userData.deleteGracePeriodEnd as string) || null;

      dispatch({
        type: 'LOADED',
        data: {
          profile: {
            email: user.email || '',
            name: profile?.full_name || (userData.name as string) || '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            phone: profile?.phone || (userData.phone as string) || '',
            linkedIn: (userData.linkedIn as string) || '',
            joinedAt: user.created_at || '',
          },
          aiScoring: initialState.aiScoring,
          dangerZone: {
            deleteRequested: !!deleteGrace,
            graceExpiresAt: deleteGrace,
            exportReady: !!(userData.exportReady),
          },
          jobCount,
          filterCount: safeReadLS<number>('bj__filterCount', 0),
          resumeCount,
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openFeedback = useCallback(() => {
    try { window.open('https://brilliantjobs.canny.io', '_blank'); } catch { /* non-fatal */ }
  }, []);

  const requestDelete = useCallback(async () => {
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    try {
      await callGateway('admin-user-manager', { action: 'request_deletion' });
      (window as any).__bjToast?.('Account deletion requested. You have 30 days to cancel.', 'info');
      loadData();
    } catch { (window as any).__bjToast?.('Failed to request deletion. Please contact support.', 'error'); }
  }, [loadData]);

  const cancelDelete = useCallback(async () => {
    try {
      await callGateway('admin-user-manager', { action: 'cancel_deletion' });
      (window as any).__bjToast?.('Account deletion cancelled.', 'success');
      loadData();
    } catch { (window as any).__bjToast?.('Failed to cancel deletion. Please contact support.', 'error'); }
  }, [loadData]);

  const exportData = useCallback(async () => {
    try {
      const result = await callGateway<{ url: string }>('admin-user-manager', { action: 'export_data' });
      if (result?.url) window.open(result.url, '_blank');
      else (window as any).__bjToast?.("Export started — you'll receive an email when ready.", 'info');
    } catch { (window as any).__bjToast?.('Export failed. Please try again.', 'error'); }
  }, []);

  return [state, { openFeedback, requestDelete, cancelDelete, exportData }];
}
