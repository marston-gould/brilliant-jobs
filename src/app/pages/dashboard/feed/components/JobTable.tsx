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
  onSave: (jobId: string) => void;
  onHide: (jobId: string) => void;
  onApply: (jobId: string, url: string) => void;
  onPageChange: (page: number) => void;
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
      if (lower.includes(kw.toLowerCase())) {
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
  { key: 'company', label: 'Company', width: 'w-[14%]', sortable: true },
  { key: 'location', label: 'Location', width: 'w-[12%]', sortable: true },
  { key: 'salary', label: 'Salary', width: 'w-[8%]', sortable: true },
  { key: 'days', label: 'Days', width: 'w-[5%]', sortable: true },
  { key: 'match', label: 'Match', width: 'w-[5%]', sortable: true },
  { key: 'actions', label: '', width: 'w-[130px]', sortable: false },
] as const;

// ── Component ─────────────────────────────────────────────

export function JobTable({
  state,
  onSave,
  onHide,
  onApply,
  onPageChange,
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
    return typeof raw === 'number' ? raw : raw.score;
  };

  const JOBS_PER_PAGE = 50;
  // UX-006: pageJobCount for accurate pagination display
  const pageJobCount = state.jobs.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border">
            {COLUMNS.map((col) => (
              <th
                key={col.key || 'hide'}
                className={`text-left py-2 px-1.5 text-text-faint font-medium ${col.width} ${
                  col.sortable ? 'cursor-pointer hover:text-text-dim transition-colors' : 'cursor-default'
                }`}
              >
                {col.key === 'actions' ? (
                  <label className="flex items-center gap-1 cursor-pointer text-[10px] font-medium text-text-faint whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={showPreview}
                      onChange={(e) => setShowPreview(e.target.checked)}
                      className="cursor-pointer"
                    />
                    Preview Job Spec
                  </label>
                ) : (
                  <>
                    {col.label}
                    {col.sortable && <span className="ml-0.5 opacity-40">↕</span>}
                  </>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Loading state */}
          {state.loading && state.jobs.length === 0 && (
            <>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </>
          )}

          {/* Error state */}
          {state.error && <ErrorState message={state.error} />}

          {/* Empty state */}
          {!state.loading && !state.error && state.jobs.length === 0 && (
            <EmptyState hasFilters={state.total > 0} />
          )}

          {/* Job rows */}
          {state.jobs.map((job) => {
            const isNew = !!(
              lastFeedView &&
              job.first_seen_at &&
              new Date(job.first_seen_at) > lastFeedView
            );

            return (
              <JobRow
                key={job.greenhouse_id}
                job={job}
                isSaved={savedJobIds.has(job.greenhouse_id)}
                isApplied={appliedJobIds.has(job.greenhouse_id)}
                isNew={isNew}
                matchScore={getMatchScore(job.greenhouse_id)}
                fraudInfo={fraudCache[job.greenhouse_id] || null}
                aiInfo={aiCache[job.greenhouse_id] || null}
                levelInfo={getJobLevel(job.title, levelHierarchy)}
                onSave={onSave}
                onHide={onHide}
                onApply={onApply}
                showPreview={showPreview}
              />
            );
          })}
        </tbody>
      </table>

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
