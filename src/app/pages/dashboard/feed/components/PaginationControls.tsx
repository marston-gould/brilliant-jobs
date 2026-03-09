// ============================================================
// PaginationControls — Feed Pagination (UX-006)
// ============================================================
// Proper page-based pagination replacing infinite scroll.
// Shows "Showing 1–50 of 1,325 jobs" with page number buttons.
// Matches legacy renderPagination() in job-feed.js.
// ============================================================

import { Button } from '@components';

const JOBS_PER_PAGE = 50;

interface PaginationControlsProps {
  pageJobCount: number;
  total: number;
  page: number;
  onPageChange: (page: number) => void;
}

function buildPageRange(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const pages = new Set<number>();
  pages.add(0);
  pages.add(totalPages - 1);
  for (let i = Math.max(0, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('...');
    }
    result.push(sorted[i]);
  }
  return result;
}

export function PaginationControls({
  pageJobCount,
  total,
  page,
  onPageChange,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / JOBS_PER_PAGE));
  const from = page * JOBS_PER_PAGE + 1;
  const to = Math.min(from + pageJobCount - 1, total);

  if (total === 0 || pageJobCount === 0) return null;

  const pages = buildPageRange(page, totalPages);

  return (
    <div className="flex flex-col items-center gap-2 py-4" style={{ borderTop: '1px solid var(--border)' }}>
      <span className="text-xs" style={{ color: 'var(--text-faint)', fontWeight: 500 }}>
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()} job{total !== 1 ? 's' : ''}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1 flex-wrap justify-center">
          <button
            className="fp-btn"
            disabled={page === 0}
            onClick={() => onPageChange(page - 1)}
            title="Previous page"
          >
            ‹ Prev
          </button>
          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`ellipsis-${i}`} className="fp-ellipsis">…</span>
            ) : (
              <button
                key={p}
                className={`fp-btn${p === page ? ' fp-active' : ''}`}
                disabled={p === page}
                onClick={() => onPageChange(p)}
              >
                {p + 1}
              </button>
            )
          )}
          <button
            className="fp-btn"
            disabled={page >= totalPages - 1}
            onClick={() => onPageChange(page + 1)}
            title="Next page"
          >
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}

export default PaginationControls;
