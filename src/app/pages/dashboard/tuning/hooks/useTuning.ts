// ============================================================
// useTuning — Tuning data hook (SA-017)
// ============================================================
// Bridges to legacy tuning.js via window.* globals.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';

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
      const bj = (window as any).BJ || (window as any);
      const savedFilters = Array.isArray(bj.savedFilters) ? bj.savedFilters : [];
      const filterColors = bj.filterColors || {};
      const levelHierarchy = Array.isArray(bj.levelHierarchy) ? bj.levelHierarchy : [];

      const filters: TuningFilter[] = savedFilters.map((f: any, i: number) => ({
        name: f.name || f.label || `Filter ${i + 1}`,
        idx: i,
        color: filterColors[i] || '#6366f1',
        keywords: Array.isArray(f.keywords) ? f.keywords : (f.keywords || '').split(',').filter(Boolean),
        excludedTerms: Array.isArray(f.excludedTerms) ? f.excludedTerms : [],
        location: f.location || '',
        radius: f.radius || 0,
        minSalary: f.minSalary || 0,
        levels: Array.isArray(f.levels) ? f.levels : [],
        collapsed: false,
      }));

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
          hiddenJobCount: bj._hiddenJobCount || 0,
          statusDirty: !!bj._tuningDirty,
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
    try { const fn = (window as any).saveTuning; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const saveLevels = useCallback(() => {
    try { const fn = (window as any).saveLevels; if (typeof fn === 'function') fn(); } catch {}
  }, []);
  const toggleCard = useCallback((idx: number) => {
    try { const fn = (window as any).toggleTuningCard; if (typeof fn === 'function') fn(idx); } catch {}
  }, []);
  const unhideJob = useCallback((jobId: string) => {
    try { const fn = (window as any).unhideJob; if (typeof fn === 'function') fn(jobId); } catch {}
  }, []);
  const editLevelHierarchy = useCallback((filterIdx: number) => {
    try { const fn = (window as any).editFilterLevelHierarchy; if (typeof fn === 'function') fn(filterIdx); } catch {}
  }, []);

  return [state, { saveTuning, saveLevels, toggleCard, unhideJob, editLevelHierarchy }];
}
