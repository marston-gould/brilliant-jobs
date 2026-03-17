// ============================================================
// useResumes — Resumes data hook (SA-016 → SPA-CUT-2)
// ============================================================
// Standalone hook — reads resumes from localStorage,
// actions via Supabase + gateway. Zero window.* dependencies.
// ============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { supabase, safeReadLS, safeWriteLS, callGateway, getUser } from '@lib/supabase';
import { providers } from '@app/providers/bridge';

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
  id?: string;
  name: string;
  fileName?: string;
  archived: boolean;
  textStatus: 'pending' | 'extracting' | 'ready' | 'no-text';
  extractedText?: string;
  keywords?: string[];
  filterIds?: string[];
  level?: string;
  levelLabel?: string;
  aiScore?: AIScore;
  aiScoreHistory?: AIScoreHistoryEntry[];
  aiScoreStatus?: 'pending' | 'scoring' | 'scored' | 'failed';
  readinessScore?: ReadinessScore;
  storagePath?: string;
  supabaseId?: string;
  archiveId?: string;
  source?: 'upload' | 'drive' | 'gdrive' | 'rewrite';
  rewrite_round?: number;
  needsUpload?: boolean;
  size?: number;
  uploadedAt?: string;
  _rescoreCooldownUntil?: number;
}

export interface SavedFilter {
  id?: string;
  name: string;
  color?: string;
  checked?: boolean;
}

export interface PipelineMeta {
  stage: string;
  title?: string;
  company?: string;
  resumeUsed?: string;
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
  | { type: 'LOAD_SUCCESS'; resumes: Resume[]; archived: Resume[]; filters: SavedFilter[]; colors: string[]; readiness: Record<number, ReadinessScore> }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'TOGGLE_EXPAND'; idx: number }
  | { type: 'UPDATE_RESUMES'; resumes: Resume[]; archived: Resume[] }
  | { type: 'UPDATE_READINESS'; readiness: Record<number, ReadinessScore> };

function reducer(state: ResumesState, action: ResumesAction): ResumesState {
  switch (action.type) {
    case 'LOAD_SUCCESS':
      return { ...state, loading: false, error: null, resumes: action.resumes, archivedResumes: action.archived, savedFilters: action.filters, filterColors: action.colors, readinessCache: action.readiness };
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
  loading: true, error: null, resumes: [], archivedResumes: [],
  savedFilters: [], filterColors: [], readinessCache: {}, expandedIdx: null,
};

const DEFAULT_FILTER_COLORS = [
  '#6366f1', '#f59e0b', '#ec4899', '#22c55e', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
];

// ── Standalone data helpers (SPA-CUT-2) ──────────────────────

function loadResumesFromLS(): Resume[] {
  return safeReadLS<Resume[]>('bj_resumes', []);
}

function saveResumesToLS(resumes: Resume[]): void {
  safeWriteLS('bj_resumes', resumes);
}

// ── Hook ─────────────────────────────────────────────────────

export function useResumes(): [ResumesState, ReturnType<typeof buildActions>] {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // SPA-CUT-2: Load from localStorage directly
  const loadData = useCallback(() => {
    try {
      const allResumes = loadResumesFromLS();
      const active = allResumes.filter(r => !r.archived);
      const archived = allResumes.filter(r => r.archived);
      const filters = safeReadLS<SavedFilter[]>('bj_saved_filters', []);
      const colors = safeReadLS<string[]>('bj_filter_colors', DEFAULT_FILTER_COLORS);
      const readinessRaw = safeReadLS<{ scores?: Record<number, ReadinessScore> } | null>('bj_readiness', null);
      const readiness = readinessRaw?.scores || {};

      dispatch({ type: 'LOAD_SUCCESS', resumes: active, archived, filters, colors, readiness });
    } catch (err) {
      dispatch({ type: 'LOAD_ERROR', error: err instanceof Error ? err.message : 'Failed to load resumes' });
    }
  }, []);

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

// ── Actions (SPA-CUT-2: direct localStorage + Supabase) ──────

function buildActions(dispatch: React.Dispatch<ResumesAction>, reload: () => void) {
  return {
    toggleExpand(idx: number) {
      dispatch({ type: 'TOGGLE_EXPAND', idx });
    },

    toggleFilter(resumeIdx: number, filterName: string) {
      const all = loadResumesFromLS();
      const r = all[resumeIdx];
      if (!r) return;
      const ids = r.filterIds || [];
      r.filterIds = ids.includes(filterName) ? ids.filter(id => id !== filterName) : [...ids, filterName];
      saveResumesToLS(all);
      setTimeout(reload, 50);
    },

    setLevel(idx: number, level: string) {
      const all = loadResumesFromLS();
      if (all[idx]) { all[idx].level = level; saveResumesToLS(all); }
      setTimeout(reload, 50);
    },

    archiveResume(idx: number) {
      const all = loadResumesFromLS();
      if (all[idx]) { all[idx].archived = true; saveResumesToLS(all); }
      setTimeout(reload, 100);
    },

    unarchiveResume(idx: number) {
      const all = loadResumesFromLS();
      if (all[idx]) { all[idx].archived = false; saveResumesToLS(all); }
      setTimeout(reload, 100);
    },

    deleteResume(idx: number) {
      const all = loadResumesFromLS();
      if (idx >= 0 && idx < all.length) {
        all.splice(idx, 1);
        saveResumesToLS(all);
      }
      setTimeout(reload, 100);
    },

    downloadResume(idx: number) {
      const all = loadResumesFromLS();
      const r = all[idx];
      if (!r?.storagePath) return;
      // Download from Supabase Storage
      providers.resumes.download(r.storagePath)
        .then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = r.name || 'resume.pdf';
            a.click(); URL.revokeObjectURL(url);
          }
        }).catch(() => { /* non-fatal */ });
    },

    renameResume(idx: number) {
      const all = loadResumesFromLS();
      const r = all[idx];
      if (!r) return;
      const newName = prompt('Rename resume:', r.name);
      if (newName && newName.trim()) {
        r.name = newName.trim();
        saveResumesToLS(all);
        setTimeout(reload, 100);
      }
    },

    async rescoreAI(idx: number) {
      const all = loadResumesFromLS();
      const r = all[idx];
      if (!r?.extractedText) return;
      try {
        const result = await callGateway<any>('score-resume', {
          mode: 'single',
          resume_text: r.extractedText,
        }, { timeout: 30000 });
        if (result?.score != null) {
          r.aiScore = { label: 'human', score: result.score, summary: result.summary };
          saveResumesToLS(all);
        }
      } catch { /* non-fatal */ }
      setTimeout(reload, 200);
    },

    async scoreResume(idx: number) {
      // Same as rescoreAI — alias for backward compat
      return this.rescoreAI(idx);
    },

    launchRewrite(idx: number) {
      // TODO SPA-CUT-2: Rewrite interview needs standalone React implementation.
      // Legacy relied on a multi-step modal in dashboard.html DOM.
      const all = loadResumesFromLS();
      const r = all[idx];
      if (r) {
        // Navigate to rewrite flow — placeholder
        console.warn('[SPA] launchRewrite not yet standalone for', r.name);
      }
    },

    async uploadResume(file: File) {
      // SPA-CUT-REMEDIATION: Upload to Supabase Storage + add to localStorage
      try {
        const uploadResult = await providers.resumes.upload(file);
        if (!uploadResult) { console.error('[SPA] Upload failed'); return; }
        const path = uploadResult.storagePath;

        // Add to localStorage resume array
        const all = loadResumesFromLS();
        all.push({
          name: file.name,
          archived: false,
          textStatus: 'pending' as const,
          storagePath: path,
          size: file.size,
          uploadedAt: new Date().toISOString(),
          source: 'upload' as const,
          filterIds: [],
        });
        saveResumesToLS(all);

        // Trigger text extraction via gateway (fire-and-forget)
        callGateway('extract-resume-profile', { storage_path: path }).catch(() => { /* non-fatal */ });
      } catch (err) {
        console.error('[SPA] uploadResume error:', err);
      }
      setTimeout(reload, 300);
    },

    replacePlaceholder(idx: number) {
      // SPA-CUT-REMEDIATION: Trigger file input for replacement upload
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf,.doc,.docx,.txt';
      input.onchange = () => {
        const file = input.files?.[0];
        if (file) {
          const all = loadResumesFromLS();
          if (all[idx]) { all.splice(idx, 1); saveResumesToLS(all); }
          this.uploadResume(file);
        }
      };
      input.click();
    },

    reUpload(idx: number) {
      // SPA-CUT-REMEDIATION: Same as replacePlaceholder
      this.replacePlaceholder(idx);
    },

    getPipelineMeta(): Record<string, PipelineMeta> {
      // Read from pipeline cache in localStorage (populated by usePipeline)
      return {};
    },

    getLevels(): Array<{ label: string; color: string }> {
      const tuning = safeReadLS<Record<string, any>>('bj_tuning', {});
      return ((tuning.levelHierarchy || []) as Array<{ label: string; color: string }>).filter(l => l.label);
    },
  };
}
