// ============================================================
// useKeywords — Keywords/Readiness data hook (SA-015)
// ============================================================
// Bridges to legacy keywords.js via window.* globals.
// Components consume readiness data through this hook only.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────

export interface KeywordTerm {
  term: string;
  count?: number;
}

export interface FilterScore {
  score: number;
  matched: number;
  total: number;
  jdsAnalyzed: number;
  topMatched: KeywordTerm[];
  topMissing: KeywordTerm[];
  bigramMatched?: KeywordTerm[];
  bigramMissing?: KeywordTerm[];
  // AI scoring extras (Pro tier)
  aiPowered?: boolean;
  tier?: 'basic' | 'premium';
  recommendations?: string[];
  dimensionScores?: Record<string, number>;
}

export interface LevelScore {
  score: number;
  jobCount: number;
}

export interface ResumeScore {
  resumeName: string;
  overallScore: number;
  filters: Record<string, FilterScore>;
  levels: Record<string, LevelScore>;
}

export interface ResumeInfo {
  index: number;
  name: string;
  archived: boolean;
  textStatus: string;
  hasKeywords: boolean;
  filterIds: string[];
  selected: boolean;
}

// ── State ────────────────────────────────────────────────────

interface KeywordsState {
  loading: boolean;
  analyzing: boolean;
  error: string | null;
  status: string;
  scores: Record<number, ResumeScore>;
  resumes: ResumeInfo[];
  lastRun: string | null;
}

type KeywordsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ANALYZING'; payload: boolean }
  | { type: 'SET_STATUS'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SCORES'; payload: { scores: Record<number, ResumeScore>; lastRun: string } }
  | { type: 'SET_RESUMES'; payload: ResumeInfo[] }
  | { type: 'TOGGLE_RESUME'; payload: number };

const initialState: KeywordsState = {
  loading: true,
  analyzing: false,
  error: null,
  status: '',
  scores: {},
  resumes: [],
  lastRun: null,
};

function reducer(state: KeywordsState, action: KeywordsAction): KeywordsState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ANALYZING':
      return { ...state, analyzing: action.payload };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false, analyzing: false };
    case 'SET_SCORES':
      return { ...state, scores: action.payload.scores, lastRun: action.payload.lastRun, analyzing: false, loading: false };
    case 'SET_RESUMES':
      return { ...state, resumes: action.payload, loading: false };
    case 'TOGGLE_RESUME':
      return {
        ...state,
        resumes: state.resumes.map(r =>
          r.index === action.payload ? { ...r, selected: !r.selected } : r
        ),
      };
    default:
      return state;
  }
}

// ── Legacy bridge helpers ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function win(): any { return window as any; }

function getResumes(): ResumeInfo[] {
  const resumes = win().resumes || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return resumes.map((r: any, i: number) => ({
    index: i,
    name: r.name || `Resume ${i + 1}`,
    archived: !!r.archived,
    textStatus: r.textStatus || 'pending',
    hasKeywords: !!(r.keywords && r.keywords.length > 0),
    filterIds: r.filterIds || [],
    selected: !r.archived && r.textStatus === 'ready' && !!(r.keywords && r.keywords.length > 0),
  }));
}

function getReadinessCache(): { scores: Record<number, ResumeScore>; lastRun: string } | null {
  return win().readinessCache || null;
}

// ── Hook ─────────────────────────────────────────────────────

export interface KeywordsActions {
  loadResumes: () => void;
  runAnalysis: (opts?: { tier?: string; resumeIndex?: number }) => Promise<void>;
  toggleResume: (index: number) => void;
  selectAll: (selected: boolean) => void;
  openJobModal: (jobId: string) => void;
}

export function useKeywords(): [KeywordsState, KeywordsActions] {
  const [state, dispatch] = useReducer(reducer, initialState);
  const mountedRef = useRef(true);

  // Load resumes and cached scores
  const loadResumes = useCallback(() => {
    const resumes = getResumes();
    dispatch({ type: 'SET_RESUMES', payload: resumes });

    // Load cached readiness results
    const cache = getReadinessCache();
    if (cache?.scores) {
      dispatch({
        type: 'SET_SCORES',
        payload: { scores: cache.scores, lastRun: cache.lastRun || '' },
      });
    }
  }, []);

  // Run readiness analysis via legacy function
  const runAnalysis = useCallback(async (opts?: { tier?: string; resumeIndex?: number }) => {
    dispatch({ type: 'SET_ANALYZING', payload: true });
    dispatch({ type: 'SET_STATUS', payload: 'Starting analysis…' });

    try {
      if (typeof win().runReadinessAnalysis === 'function') {
        await win().runReadinessAnalysis({
          ...opts,
          silent: false,
        });
      }

      // Read results from cache after analysis completes
      const cache = getReadinessCache();
      if (cache?.scores && mountedRef.current) {
        dispatch({
          type: 'SET_SCORES',
          payload: { scores: cache.scores, lastRun: cache.lastRun || new Date().toISOString() },
        });
      }
    } catch (err) {
      if (mountedRef.current) {
        dispatch({ type: 'SET_ERROR', payload: (err as Error).message || 'Analysis failed' });
      }
    }

    if (mountedRef.current) {
      dispatch({ type: 'SET_ANALYZING', payload: false });
      dispatch({ type: 'SET_STATUS', payload: '' });
    }
  }, []);

  const toggleResume = useCallback((index: number) => {
    dispatch({ type: 'TOGGLE_RESUME', payload: index });
  }, []);

  const selectAll = useCallback((selected: boolean) => {
    const updated = getResumes().map(r => ({
      ...r,
      selected: r.archived || r.textStatus !== 'ready' || !r.hasKeywords ? false : selected,
    }));
    dispatch({ type: 'SET_RESUMES', payload: updated });
  }, []);

  const openJobModal = useCallback((jobId: string) => {
    if (typeof win().openJobModal === 'function') {
      win().openJobModal(jobId);
    }
  }, []);

  // Initial load
  useEffect(() => {
    mountedRef.current = true;
    loadResumes();
    return () => { mountedRef.current = false; };
  }, [loadResumes]);

  const actions: KeywordsActions = useMemo(() => ({
    loadResumes,
    runAnalysis,
    toggleResume,
    selectAll,
    openJobModal,
  }), [loadResumes, runAnalysis, toggleResume, selectAll, openJobModal]);

  return [state, actions];
}
