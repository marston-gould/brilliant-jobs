// ============================================================
// useResumes — Resumes data hook (SA-016)
// ============================================================
// Bridges to legacy resumes.js via window.* globals.
// Components consume resume data through this hook only.
// When migration is complete, swap window.* reads for
// ResumeProvider calls — no component changes needed.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface AIScore {
  label: 'human' | 'mixed' | 'ai_generated' | 'unknown';
  score: number;
  summary?: string;
}

export interface AIScoreHistoryEntry {
  label: string;
  score: number;
  scoredAt: string;
}

export interface ReadinessScore {
  overallScore: number;
  filterScores?: Record<string, number>;
}

export interface Resume {
  id: string;
  name: string;
  fileName: string;
  size: string;
  uploadedAt: string;
  source: 'upload' | 'gdrive' | 'rewrite';
  archived: boolean;
  needsUpload: boolean;
  filterIds: string[];
  levelLabel: string;
  textStatus: 'no-text' | 'ready' | 'extracting';
  extractedText: string;
  keywords: string[];
  aiScore: AIScore | null;
  aiScoreStatus: 'idle' | 'scoring' | 'done';
  aiScoreHistory: AIScoreHistoryEntry[];
  storagePath?: string;
  archiveId?: string;
  tier_history?: Array<{ action: string; tier: string }>;
  rewrite_round?: number;
  _rescoreCooldownUntil?: number;
}

export interface SavedFilter {
  name: string;
  query?: Record<string, unknown>;
}

export interface PipelineMeta {
  resumeUsed: string;
  stage: string;
}

// ── State ────────────────────────────────────────────────────

interface ResumesState {
  loading: boolean;
  error: string | null;
  resumes: Resume[];
  archivedResumes: Resume[];
  savedFilters: SavedFilter[];
  filterColors: string[];
  readinessCache: Record<number, ReadinessScore>;
  expandedIdx: number | null;
}

type ResumesAction =
  | { type: 'LOAD_START' }
  | { type: 'LOAD_SUCCESS'; resumes: Resume[]; archived: Resume[]; filters: SavedFilter[]; colors: string[]; readiness: Record<number, ReadinessScore> }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'TOGGLE_EXPAND'; idx: number }
  | { type: 'UPDATE_RESUMES'; resumes: Resume[]; archived: Resume[] }
  | { type: 'UPDATE_READINESS'; readiness: Record<number, ReadinessScore> };

function reducer(state: ResumesState, action: ResumesAction): ResumesState {
  switch (action.type) {
    case 'LOAD_START':
      return { ...state, loading: true, error: null };
    case 'LOAD_SUCCESS':
      return {
        ...state,
        loading: false,
        resumes: action.resumes,
        archivedResumes: action.archived,
        savedFilters: action.filters,
        filterColors: action.colors,
        readinessCache: action.readiness,
      };
    case 'LOAD_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'TOGGLE_EXPAND':
      return { ...state, expandedIdx: state.expandedIdx === action.idx ? null : action.idx };
    case 'UPDATE_RESUMES':
      return { ...state, resumes: action.resumes, archivedResumes: action.archived };
    case 'UPDATE_READINESS':
      return { ...state, readinessCache: action.readiness };
    default:
      return state;
  }
}

const INITIAL_STATE: ResumesState = {
  loading: true,
  error: null,
  resumes: [],
  archivedResumes: [],
  savedFilters: [],
  filterColors: [],
  readinessCache: {},
  expandedIdx: null,
};

const DEFAULT_FILTER_COLORS = [
  '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
];

// ── Hook ─────────────────────────────────────────────────────

export function useResumes(): [ResumesState, ReturnType<typeof buildActions>] {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load data from legacy window globals
  const loadData = useCallback(() => {
    try {
      const win = window as Record<string, unknown>;
      const _BJ = (win.BJ || {}) as Record<string, unknown>;

      // Read resumes from global
      const allResumes = (win.resumes || []) as Resume[];
      const active = allResumes.filter(r => !r.archived);
      const archived = allResumes.filter(r => r.archived);

      // Saved filters
      const safeReadLS = (win.safeReadLS || (() => [])) as (key: string, fallback: unknown) => unknown;
      const filters = (win.savedFilters || safeReadLS('bj_saved_filters', [])) as SavedFilter[];

      // Filter colors
      const colors = (win.filterColors || DEFAULT_FILTER_COLORS) as string[];

      // Readiness cache
      const readiness = ((win.readinessCache as Record<string, unknown>)?.scores || {}) as Record<number, ReadinessScore>;

      dispatch({
        type: 'LOAD_SUCCESS',
        resumes: active,
        archived,
        filters,
        colors,
        readiness,
      });
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', error: err instanceof Error ? err.message : 'Failed to load resumes' });
    }
  }, []);

  // Initial load + periodic poll for changes from legacy code
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

function buildActions(dispatch: React.Dispatch<ResumesAction>, reload: () => void) {
  const win = () => window as Record<string, unknown>;

  return {
    toggleExpand(idx: number) {
      dispatch({ type: 'TOGGLE_EXPAND', idx });
    },

    toggleFilter(resumeIdx: number, filterName: string) {
      const fn = win().toggleResumeFilter as ((idx: number, name: string) => void) | undefined;
      if (fn) fn(resumeIdx, filterName);
      setTimeout(reload, 50);
    },

    setLevel(idx: number, level: string) {
      const fn = win().setResumeLevel as ((idx: number, el: { value: string }) => void) | undefined;
      if (fn) fn(idx, { value: level });
      setTimeout(reload, 50);
    },

    archiveResume(idx: number) {
      const fn = win().archiveResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    unarchiveResume(idx: number) {
      const fn = win().unarchiveResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    deleteResume(idx: number) {
      const fn = win().confirmDeleteResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    downloadResume(idx: number) {
      const fn = win().downloadResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
    },

    renameResume(idx: number) {
      const fn = win().renameResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    rescoreAI(idx: number) {
      const fn = win().handleRescore as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 200);
    },

    scoreResume(idx: number) {
      const fn = win().handleScoreClick as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 200);
    },

    launchRewrite(idx: number) {
      const fn = win().launchRewriteInterview as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
    },

    uploadResume(file: File) {
      const fn = win().addResume as ((file: File) => void) | undefined;
      if (fn) fn(file);
      setTimeout(reload, 300);
    },

    replacePlaceholder(idx: number) {
      const fn = win().replaceResumePlaceholder as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    reUpload(idx: number) {
      const fn = win().reUploadResume as ((idx: number) => void) | undefined;
      if (fn) fn(idx);
      setTimeout(reload, 100);
    },

    getPipelineMeta(): Record<string, PipelineMeta> {
      const fn = win().getPipelineMeta as (() => Record<string, PipelineMeta>) | undefined;
      return fn ? fn() : {};
    },

    getLevels(): Array<{ label: string; color: string }> {
      const safeReadLS = (win().safeReadLS || (() => ({}))) as (key: string, fallback: unknown) => Record<string, unknown>;
      const tuning = safeReadLS('bj_tuning', {});
      return ((tuning.levelHierarchy || []) as Array<{ label: string; color: string }>).filter(l => l.label);
    },
  };
}
