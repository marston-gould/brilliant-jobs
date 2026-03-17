// ============================================================
// useKeywords — Keywords/Readiness data hook (SA-015 → SPA-CUT-1)
// ============================================================
// Standalone hook — reads resumes from localStorage, readiness
// cache from localStorage, calls score-resume EF via gateway.
// Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { safeReadLS, safeWriteLS, callGateway } from '@lib/supabase';

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

// ── Standalone data access (SPA-CUT-1) ───────────────────────

function getResumes(): ResumeInfo[] {
  const resumes = safeReadLS<any[]>('bj_resumes', []);
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
  return safeReadLS<{ scores: Record<number, ResumeScore>; lastRun: string } | null>('bj_readiness', null);
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

  const loadResumes = useCallback(() => {
    const resumes = getResumes();
    dispatch({ type: 'SET_RESUMES', payload: resumes });

    const cache = getReadinessCache();
    if (cache?.scores) {
      dispatch({
        type: 'SET_SCORES',
        payload: { scores: cache.scores, lastRun: cache.lastRun || '' },
      });
    }
  }, []);

  // SPA-CUT-1: Standalone analysis via score-resume gateway
  const runAnalysis = useCallback(async (opts?: { tier?: string; resumeIndex?: number }) => {
    dispatch({ type: 'SET_ANALYZING', payload: true });
    dispatch({ type: 'SET_STATUS', payload: 'Starting analysis…' });

    try {
      const allResumes = safeReadLS<any[]>('bj_resumes', []);
      const selectedIndices = state.resumes
        .filter(r => r.selected)
        .map(r => r.index);

      const resumesToScore = selectedIndices.length > 0
        ? selectedIndices.map(i => allResumes[i]).filter(Boolean)
        : allResumes.filter((r: any) => !r.archived && r.textStatus === 'ready');

      if (resumesToScore.length === 0) {
        dispatch({ type: 'SET_ERROR', payload: 'No resumes with extracted text available for scoring' });
        return;
      }

      const scores: Record<number, ResumeScore> = {};

      for (const resume of resumesToScore) {
        const idx = allResumes.indexOf(resume);
        if (mountedRef.current) {
          dispatch({ type: 'SET_STATUS', payload: `Scoring ${resume.name}…` });
        }

        try {
          const result = await callGateway<any>('score-resume', {
            mode: 'single',
            resume_text: resume.extractedText || '',
            tier: opts?.tier || 'basic',
          }, { timeout: 30000 });

          if (result) {
            scores[idx] = {
              resumeName: resume.name,
              overallScore: result.score || result.overallScore || 0,
              filters: result.filters || {},
              levels: result.levels || {},
            };
          }
        } catch (err) {
          console.warn(`[SPA] Score failed for ${resume.name}:`, err);
        }
      }

      const lastRun = new Date().toISOString();
      safeWriteLS('bj_readiness', { scores, lastRun });

      if (mountedRef.current) {
        dispatch({ type: 'SET_SCORES', payload: { scores, lastRun } });
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
  }, [state.resumes]);

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

  const openJobModal = useCallback((_jobId: string) => {
    // TODO SPA-CUT-1: Job detail modal needs standalone React implementation
  }, []);

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
