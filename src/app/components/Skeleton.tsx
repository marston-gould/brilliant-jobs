// ============================================================
// Skeleton — Animated Loading Placeholder
// ============================================================
// Phase D: Cross-cutting gap — legacy had per-section skeletons.
// Provides composable skeleton primitives for page-level loaders.
// ============================================================

interface SkeletonProps {
  className?: string;
}

/** Animated pulse block — base skeleton primitive */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-border-subtle/50 ${className}`}
      aria-hidden="true"
    />
  );
}

/** Skeleton for a typical page header (title + subtitle) */
export function SkeletonHeader() {
  return (
    <div className="space-y-2 mb-6">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72" />
    </div>
  );
}

/** Skeleton for a row of metric cards */
export function SkeletonMetricRow({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
          <Skeleton className="h-3 w-16 mb-2" />
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a list of card items */
export function SkeletonCardList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
          <div className="flex items-start gap-3">
            <Skeleton className="w-10 h-10 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for a table */
export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="border border-border-subtle rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-3 bg-bg-surface border-b border-border-subtle">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex gap-4 p-3 border-b border-border-subtle last:border-0">
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton key={ci} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Full-page skeleton: header + metrics + card list */
export function SkeletonPage() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SkeletonHeader />
      <SkeletonMetricRow />
      <SkeletonCardList />
    </div>
  );
}

export default Skeleton;
