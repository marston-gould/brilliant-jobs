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
  | { type: 'CLOSE_EDITING_FILTER' }
  | { type: 'TOGGLE_CARD'; idx: number };

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
    case 'TOGGLE_CARD': return { ...state, filters: state.filters.map((f, i) => i === action.idx ? { ...f, collapsed: !f.collapsed } : f) };
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

      // Load saved filters from user_filters table
      const { data: sfData } = await sb.from('user_filters').select('*').eq('user_id', user.id).order('sort_order', { ascending: true });
      const filters: TuningFilter[] = (sfData || []).map((f: any, i: number) => ({
        name: f.name || `Filter ${i + 1}`,
        idx: i,
        color: f.filter_data?._filterColor || ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#8b5cf6'][i % 5],
        keywords: f.filter_data?.whatPills ? f.filter_data.whatPills.map((p: any) => p.values?.[0]).filter(Boolean) : [],
        excludedTerms: f.filter_data?.whatNotPills ? f.filter_data.whatNotPills.map((p: any) => p.values?.[0]).filter(Boolean) : [],
        location: f.filter_data?.wherePills ? f.filter_data.wherePills.map((p: any) => p.values?.[0]).filter(Boolean).join(', ') : '',
        radius: 0,
        minSalary: f.filter_data?.payPills?.[0]?.min ? parseInt(f.filter_data.payPills[0].min) : 0,
        levels: f.filter_data?.levelPills ? f.filter_data.levelPills.map((p: any) => p.values?.[0]).filter(Boolean) : [],
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
    pollRef.current = setInterval(loadData, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const saveTuning = useCallback(() => {
    // Tuning auto-saves via individual card toggles — this is a no-op placeholder
  }, []);
  const saveLevels = useCallback(() => {
    // Level save handled by tuning page component
  }, []);
  const toggleCard = useCallback((idx: number) => {
    dispatch({ type: 'TOGGLE_CARD', idx });
  }, []);
  const unhideJob = useCallback(async (jobId: string) => {
    try {
      const user = await getUser();
      if (!user) return;
      await supabase.from('hidden_jobs').delete().eq('user_id', user.id).eq('job_id', jobId);
      loadData();
    } catch {
      // Fallback: remove from localStorage
      const hidden = safeReadLS<any[]>('bj_hidden_jobs', []);
      const filtered = hidden.filter((h: any) => (typeof h === 'string' ? h : h.id) !== jobId);
      safeWriteLS('bj_hidden_jobs', filtered);
    }
  }, [loadData]);
  const editLevelHierarchy = useCallback((filterIdx: number) => {
    dispatch({ type: 'SET_EDITING_FILTER', filterIdx });
  }, []);

  return [state, { saveTuning, saveLevels, toggleCard, unhideJob, editLevelHierarchy }];
}
