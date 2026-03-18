// ============================================================
// useTuning — Tuning data hook (SA-017 → SPA-PHASE-A)
// ============================================================
// Reads/writes tuning data via SupabaseTuningProvider.
// Falls back to localStorage for collapse states (UI-only).
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { safeReadLS, safeWriteLS } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

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
      // Load tuning data from Supabase via provider
      const tuningData = await providers.tuning.getTuning();
      const filterColors = safeReadLS<Record<string, string>>('bj_filterColors', {});

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const savedFilters: any[] = Array.isArray((tuningData as any)?.filters) ? (tuningData as any).filters : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const levelHierarchy: any[] = Array.isArray((tuningData as any)?.levels) ? (tuningData as any).levels : [];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filters: TuningFilter[] = savedFilters.map((f: any, i: number) => ({
        name: f.name || f.label || `Filter ${i + 1}`,
        idx: i,
        color: filterColors[String(i)] || '#6366f1',
        keywords: Array.isArray(f.keywords) ? f.keywords : (f.keywords || '').split(',').filter(Boolean),
        excludedTerms: Array.isArray(f.excludedTerms) ? f.excludedTerms : [],
        location: f.location || '',
        radius: f.radius || 0,
        minSalary: f.minSalary || 0,
        levels: Array.isArray(f.levels) ? f.levels : [],
        collapsed: false,
      }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          hiddenJobCount: (tuningData as any)?.hiddenJobCount ?? safeReadLS('bj__hiddenJobCount', 0),
          statusDirty: false,
        },
      });
    } catch (e) {
      dispatch({ type: 'ERROR', error: String(e) });
    }
  }, []);

  useEffect(() => {
    loadData();
    pollRef.current = setInterval(() => { loadData(); }, 30000); // 30s poll — no need for 3s
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadData]);

  const saveTuning = useCallback(async () => {
    try {
      const currentFilters = (await providers.tuning.getTuning() as any)?.filters || [];
      await providers.tuning.saveTuning({ filters: currentFilters } as any);
    } catch { /* non-fatal */ }
  }, []);

  const saveLevels = useCallback(async () => {
    try {
      const current = await providers.tuning.getTuning() as any;
      await providers.tuning.saveTuning({ ...current } as any);
    } catch { /* non-fatal */ }
  }, []);

  const toggleCard = useCallback((idx: number) => {
    providers.tuning.getCollapsedStates().then(states => {
      states[String(idx)] = !states[String(idx)];
      providers.tuning.setCollapsedState(String(idx), !!states[String(idx)]);
    }).catch(() => {
      // Fallback localStorage
      const states = safeReadLS<Record<string, boolean>>('bj_pl_collapse', {});
      states[String(idx)] = !states[String(idx)];
      safeWriteLS('bj_pl_collapse', states);
    });
  }, []);

  const unhideJob = useCallback((jobId: string) => {
    providers.tuning.unhideJob(jobId).catch(() => {
      // Fallback localStorage
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hidden = safeReadLS<any[]>('bj_hidden_jobs', []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      safeWriteLS('bj_hidden_jobs', hidden.filter((h: any) => (typeof h === 'string' ? h : h.id) !== jobId));
    });
  }, []);

  const editLevelHierarchy = useCallback((filterIdx: number) => {
    dispatch({ type: 'SET_EDITING_FILTER', filterIdx });
  }, []);

  return [state, { saveTuning, saveLevels, toggleCard, unhideJob, editLevelHierarchy }];
}
