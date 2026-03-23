// ============================================================
// JobTable — Feed Results Table (SA-014)
// ============================================================
// Table container: column headers with sort affordances,
// loading skeleton, empty state, and JobRow children.
// ============================================================

import { useState, useMemo } from 'react';
import { JobCard } from './JobCard';
import { PaginationControls } from './PaginationControls';
import type { FeedJob, FeedSearchState, TrustLabel, AiLabel } from '../hooks/useFeedSearch';

interface JobTableProps {
  state: FeedSearchState;
  hasFilters: boolean;
  onSave: (jobId: string, job: any) => void;
  onHide: (jobId: string) => void;
  onApply: (jobId: string, url: string) => void;
  onPageChange: (page: number) => void;
  onOpenModal?: (jobId: string) => void;
  onSort?: (field: string) => void;
  savedJobIds: Set<string>;
  appliedJobIds: Set<string>;
  matchScores: Record<string, number | { score: number }>;
  fraudCache: Record<string, { label: TrustLabel; score: number }>;
  aiCache: Record<string, { label: AiLabel; ai_probability: number }>;
  levelHierarchy: Array<{ label: string; rank: number; color: string; keywords: string[] }>;
}

// ── Level detection from title ────────────────────────────

function getJobLevel(
  title: string,
  hierarchy: Array<{ label: string; rank: number; color: string; keywords: string[] }>
): { label: string; rank: number; color: string } | null {
  if (!title || !hierarchy?.length) return null;
  const lower = title.toLowerCase();
  for (const level of hierarchy) {
    for (const kw of level.keywords) {
      const k = kw.toLowerCase();
      // Word-boundary match: keyword must not be embedded inside another word
      const idx = lower.indexOf(k);
      if (idx === -1) continue;
      const before = idx === 0 || /[^a-z0-9]/.test(lower[idx - 1] || ' ');
      const after = idx + k.length >= lower.length || /[^a-z0-9]/.test(lower[idx + k.length] || ' ');
      if (before && after) {
        return { label: level.label, rank: level.rank, color: level.color };
      }
    }
  }
  return null;
}

// ── Skeleton row ──────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="p-2"><div className="h-3 w-6 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-3/4 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-12 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-1/2 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-2/5 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-14 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-8 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-8 bg-bg-hover rounded" /></td>
      <td className="p-2"><div className="h-3 w-20 bg-bg-hover rounded" /></td>
    </tr>
  );
}

// ── Empty state ───────────────────────────────────────────

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <tr>
      <td colSpan={9} className="text-center py-12 px-3">
        <div className="text-text-faint mb-3 opacity-25">
          <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="inline-block" aria-hidden="true">
            <rect x={2} y={7} width={20} height={14} rx={2} />
            <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
          </svg>
        </div>
        <div className="text-sm font-semibold text-text-dim mb-1.5">
          {hasFilters
            ? 'No jobs match — try broadening your search'
            : 'Select saved searches or add filters to search jobs'}
        </div>
        <p className="text-xs text-text-faint max-w-sm mx-auto leading-relaxed">
          {hasFilters
            ? 'Try broader terms or fewer filters.'
            : 'Check one or more saved searches above, or use the filter builder.'}
        </p>
      </td>
    </tr>
  );
}

// ── Error state ───────────────────────────────────────────

function ErrorState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={9} className="text-center py-8 px-3">
        <p className="text-sm text-red-400">Search failed: {message}</p>
      </td>
    </tr>
  );
}

// ── Column headers ────────────────────────────────────────

const COLUMNS = [
  { key: '', label: '', width: 'w-[30px]', sortable: false },
  { key: 'title', label: 'Title', width: 'w-[24%]', sortable: true },
  { key: 'level', label: 'Level', width: 'w-[7%]', sortable: true },
  { key: 'company_name', label: 'Company', width: 'w-[14%]', sortable: true },
  { key: 'location', label: 'Location', width: 'w-[12%]', sortable: true },
  { key: 'salary_max', label: 'Salary', width: 'w-[8%]', sortable: true },
  { key: 'created_at', label: 'Days', width: 'w-[5%]', sortable: true },
  { key: 'match', label: 'Match', width: 'w-[5%]', sortable: true },
  { key: 'actions', label: '', width: 'w-[130px]', sortable: false },
] as const;

// ── Component ─────────────────────────────────────────────

export function JobTable({
  state,
  hasFilters,
  onSave,
  onHide,
  onApply,
  onPageChange,
  onOpenModal,
  onSort,
  savedJobIds,
  appliedJobIds,
  matchScores,
  fraudCache,
  aiCache,
  levelHierarchy,
}: JobTableProps) {
  const [showPreview, setShowPreview] = useState(false);

  const lastFeedView = useMemo(() => {
    const raw = localStorage.getItem('bj_last_feed_view');
    return raw ? new Date(raw) : null;
  }, []);

  const getMatchScore = (jobId: string): number | null => {
    const raw = matchScores[jobId];
    if (raw === undefined || raw === null) return null;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'object' && raw !== null) {
      const s = (raw as Record<string, unknown>).score;
      return typeof s === 'number' ? s : null;
    }
    return null;
  };

  const JOBS_PER_PAGE = 50;
  // UX-006: pageJobCount for accurate pagination display
  const pageJobCount = state.jobs.length;

  return (
    <div>
      {/* Sort bar + Preview toggle — legacy: sort controls above card grid */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          {COLUMNS.filter(c => c.sortable).map(col => {
            const active = state.sortStack?.find((s: any) => s.field === col.key);
            return (
              <button key={col.key} onClick={() => onSort?.(col.key)}
                className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors ${
                  active ? 'border-accent text-accent bg-accent/5' : 'text-text-faint border-border hover:border-accent'
                }`}>
                {col.label} {active ? (active.asc ? '↑' : '↓') : '↕'}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1 cursor-pointer text-[10px] font-medium text-text-faint">
          <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} className="cursor-pointer" />
          Preview JD
        </label>
      </div>

      {/* Loading state */}
      {state.loading && state.jobs.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border border-border rounded-xl bg-bg-card p-4 animate-pulse">
              <div className="h-4 w-2/3 bg-bg-input rounded mb-2" />
              <div className="h-3 w-1/2 bg-bg-input rounded mb-3" />
              <div className="h-3 w-1/4 bg-bg-input rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {state.error && (
        <div className="text-center py-12 text-red text-sm">{state.error}</div>
      )}

      {/* Empty state */}
      {!state.loading && !state.error && state.jobs.length === 0 && (
        <div className="text-center py-16 text-text-faint">
          <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="inline-block mb-4 opacity-20" aria-hidden="true">
            <circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" />
          </svg>
          <p className="text-sm font-semibold text-text-dim mb-1">
            {hasFilters ? 'No jobs match your filters' : 'Select a saved search to see jobs'}
          </p>
          <p className="text-xs text-text-faint max-w-xs mx-auto leading-relaxed">
            {hasFilters
              ? 'Try broader keywords, fewer exclusions, or a wider date range.'
              : 'Check one or more saved searches above, or build a new filter.'}
          </p>
        </div>
      )}

      {/* Job card grid — 2 columns per legacy */}
      {state.jobs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {state.jobs.map((job) => (
            <JobCard
              key={job.greenhouse_id}
              job={job}
              isSaved={savedJobIds.has(job.greenhouse_id)}
              isApplied={appliedJobIds.has(job.greenhouse_id)}
              matchScore={getMatchScore(job.greenhouse_id)}
              levelInfo={getJobLevel(job.title, levelHierarchy)}
              onSave={onSave}
              onHide={onHide}
              onApply={onApply}
              onOpenModal={onOpenModal}
              showPreview={showPreview}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {state.jobs.length > 0 && (
        <PaginationControls
          pageJobCount={pageJobCount}
          total={state.total}
          page={state.page}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

export default JobTable;
