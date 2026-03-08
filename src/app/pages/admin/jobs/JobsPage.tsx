// ============================================================
// JobsPage — Main Admin Jobs Page Container (SA-017)
// ============================================================

import React from 'react';
import { JobsHero } from './components';
import { useJobs } from './hooks/useJobs';

export function JobsPage() {
  const [state, actions] = useJobs();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading jobs…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load jobs</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <JobsHero total={state.total} page={state.page} />

      <div id="admin-jobs-table" />

    </div>
  );
}

export default JobsPage;
