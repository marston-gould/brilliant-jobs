// ============================================================
// PaginationControls — Feed Pagination (SA-014)
// ============================================================
// Shows "Showing X of Y jobs" with Load More and Back to Top.
// Matches legacy pagination behavior (50 per page, 500 cap).
// ============================================================

import { Button } from '@components';

interface PaginationControlsProps {
  showing: number;
  total: number;
  page: number;
  maxRows?: number;
  onLoadMore: () => void;
  onBackToTop: () => void;
}

const MAX_FEED_ROWS = 500;

export function PaginationControls({
  showing,
  total,
  page,
  maxRows = MAX_FEED_ROWS,
  onLoadMore,
  onBackToTop,
}: PaginationControlsProps) {
  const capped = Math.min(total, maxRows);
  const hasMore = showing < capped;
  const hasPageHistory = page > 0;

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <span className="text-xs text-text-faint">
        Showing {showing.toLocaleString()} of {total.toLocaleString()} jobs
        {total > maxRows && ` (limited to ${maxRows.toLocaleString()})`}
      </span>
      <div className="flex gap-2 items-center">
        {hasPageHistory && (
          <Button variant="secondary" size="sm" onClick={onBackToTop}>
            ↑ Back to top
          </Button>
        )}
        {hasMore && (
          <Button variant="primary" size="sm" onClick={onLoadMore}>
            Load more jobs
          </Button>
        )}
      </div>
    </div>
  );
}

export default PaginationControls;
