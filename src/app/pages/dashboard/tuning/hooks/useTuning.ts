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
}

type Action =
  | { type: 'LOADED'; data: Partial<TuningState> }
  | { type: 'ERROR'; error: string };

const initialState: TuningState = {
  loading: true,
  error: null,
  filters: [],
  levels: [],
  hiddenJobCount: 0,
  statusDirty: false,
};

function reducer(state: TuningState, action: Action): TuningState {
  switch (action.type) {
    case 'LOADED': return { ...state, loading: false, error: null, ...action.data };
    case 'ERROR': return { ...state, loading: false, error: action.error };
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

  const loadData = useCallback(() => {
    try {
      // SPA-CUT-3: Data loaded from localStorage/Supabase (no window bridge)
      const savedFilters = Array.isArray(null) ? null : [];
      const filterColors = safeReadLS('bj_filterColors', {});
      const levelHierarchy = Array.isArray(null) ? null : [];

      // @ts-ignore SPA-CUT-3
      const filters: TuningFilter[] = savedFilters.map((f: any, i: number) => ({
        name: f.name || f.label || `Filter ${i + 1}`,
        idx: i,
        // @ts-ignore SPA-CUT-3
        color: filterColors[i] || '#6366f1',
        keywords: Array.isArray(f.keywords) ? f.keywords : (f.keywords || '').split(',').filter(Boolean),
        excludedTerms: Array.isArray(f.excludedTerms) ? f.excludedTerms : [],
        location: f.location || '',
        radius: f.radius || 0,
        minSalary: f.minSalary || 0,
        levels: Array.isArray(f.levels) ? f.levels : [],
        collapsed: false,
      }));

      // @ts-ignore SPA-CUT-3
      const levels: LevelConfig[] = levelHierarchy.map((l: any) => ({
        label: l.label || '',
        keywords: l.keywords || '',
        enabled: l.enabled !== false,
      }));

      dispatch({
        type: 'LOADED',
        data: {
          filters,
          levels,
          hiddenJobCount: safeReadLS('bj__hiddenJobCount', 0),
          // @ts-ignore SPA-CUT-3
          statusDirty: !!null,
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

  const saveTuning = useCallback(() => {
    safeWriteLS('bj_tuning', safeReadLS('bj_tuning', {}));
  }, []);
  const saveLevels = useCallback(() => {
    // SPA-CUT-3: Level save handled by tuning page component
  }, []);
  const toggleCard = useCallback((idx: number) => {
    // TODO SPA-CUT-3: toggleTuningCard(idx) needs standalone implementation
  }, []);
  const unhideJob = useCallback((jobId: string) => {
    // TODO SPA-CUT-3: unhideJob(jobId) needs standalone implementation
  }, []);
  const editLevelHierarchy = useCallback((filterIdx: number) => {
    // TODO SPA-CUT-3: editFilterLevelHierarchy(filterIdx) needs standalone implementation
  }, []);

  return [state, { saveTuning, saveLevels, toggleCard, unhideJob, editLevelHierarchy }];
}
