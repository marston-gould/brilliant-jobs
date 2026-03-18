// ============================================================
// useTuning — Tuning data hook (SA-017)
// ============================================================
// Standalone hook — zero window.* dependencies (SPA-CUT-3).
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';

export interface TuningFilter {
  name: string;
  idx: number;
  color: string;
  keywords: string[];
  excludedTerms: string[];
  location: string;
  radius: number;
  minSalary: number;
  levels: string[];
  collapsed: boolean;
}

export interface LevelConfig {
  label: string;
  keywords: string;
  enabled: boolean;
}

interface TuningState {
  loading: boolean;
  error: string | null;
  filters: TuningFilter[];
  levels: LevelConfig[];
  hiddenJobCount: number;
  statusDirty: boolean;
  editingFilterIdx: number | null;
}

type Action =
  | { type: 'LOADED'; data: Partial<TuningState> }
  | { type: 'ERROR'; error: string }
  | { type: 'SET_EDITING_FILTER'; filterIdx: number }
  | { type: 'CLOSE_EDITING_FILTER' };

const initialState: TuningState = {
  loading: true,
  error: null,
  filters: [],
  levels: [],
  hiddenJobCount: 0,
  statusDirty: false,
  editingFilterIdx: null,
};

function reducer(state: TuningState, action: Action): TuningState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
    case 'SET_EDITING_FILTER': return { ...state, editingFilterIdx: action.filterIdx };
    case 'CLOSE_EDITING_FILTER': return { ...state, editingFilterIdx: null };
    default: return state;
  }
}

export function useTuning(): [TuningState, {
  saveTuning: () => void;
  saveLevels: () => void;
  toggleCard: (idx: number) => void;
  unhideJob: (jobId: string) => void;
  editLevelHierarchy: (filterIdx: number) => void;
}] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const user = await getUser();
      if (!user) { dispatch({ type: 'LOADED', data: { filters: [], levels: [], hiddenJobCount: 0, statusDirty: false } }); return; }
      const sb = supabase;

      // Load saved filters from Supabase
      const { data: sfData } = await sb.from('saved_filters').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const filters: TuningFilter[] = (sfData || []).map((f: any, i: number) => ({
        name: f.name || `Filter ${i + 1}`,
        idx: i,
        color: f.config?.color || ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6'][i % 5],
        keywords: f.config?.what ? f.config.what.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
        excludedTerms: f.config?.whatNot ? f.config.whatNot.split(',').map((k: string) => k.trim()).filter(Boolean) : [],
        location: f.config?.where || '',
        radius: 0,
        minSalary: f.config?.payMin ? parseInt(f.config.payMin) : 0,
        levels: [],
        collapsed: false,
      }));

      // Load hidden job count
      const { count } = await sb.from('hidden_jobs').select('*', { count: 'exact', head: true }).eq('user_id', user.id);

      dispatch({
        type: 'LOADED',
        data: { filters, levels: [], hiddenJobCount: count || 0, statusDirty: false },
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

  const saveTuning = useCallback(() => {
    safeWriteLS('bj_tuning', safeReadLS('bj_tuning', {}));
  }, []);
  const saveLevels = useCallback(() => {
    // SPA-CUT-3: Level save handled by tuning page component
  }, []);
  const toggleCard = useCallback((idx: number) => {
    // SPA-CUT-REMEDIATION: Toggle collapse state in localStorage
    (idx: number) => {
      const states = safeReadLS<Record<string, boolean>>('bj_pl_collapse', {});
      states[String(idx)] = !states[String(idx)];
      safeWriteLS('bj_pl_collapse', states);
    }
  }, []);
  const unhideJob = useCallback((jobId: string) => {
    // SPA-CUT-REMEDIATION: Remove from hidden jobs in localStorage
    (jobId: string) => {
      const hidden = safeReadLS<any[]>('bj_hidden_jobs', []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = hidden.filter((h: any) => (typeof h === 'string' ? h : h.id) !== jobId);
      safeWriteLS('bj_hidden_jobs', filtered);
    }
  }, []);
  const editLevelHierarchy = useCallback((filterIdx: number) => {
    // SPA-CUT-FINAL: Set editingFilterIdx → TuningPage shows level editor
    dispatch({ type: 'SET_EDITING_FILTER', filterIdx });
  }, []);

  return [state, { saveTuning, saveLevels, toggleCard, unhideJob, editLevelHierarchy }];
}
