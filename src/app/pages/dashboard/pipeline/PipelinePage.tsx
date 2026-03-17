// ============================================================
// PipelinePage — Main Pipeline Page Container (SA-015)
// ============================================================
// Orchestrates all pipeline components:
// - PipelineHero (stats + view toggle)
// - PipelineFilterTags (filter by saved search)
// - StageSection (9 collapsible stage tables)
// - GhostMonitor (ghost detection sub-tab)
//
// Data flows through usePipeline hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useCallback } from 'react';
import { Button } from '@app/components';
import { JobDetailModal } from '@app/components/JobDetailModal';
import {
  PipelineHero,
  PipelineFilterTags,
  StageSection,
  GhostMonitor,
} from './components';
import { usePipeline } from './hooks/usePipeline';
import type { PipelineStage } from './hooks/usePipeline';

export function PipelinePage() {
  const [state, actions] = usePipeline();

  const handleArchive = useCallback((entryId: string) => {
    actions.moveStage(entryId, 'archived');
  }, [actions]);

  // ── Loading state ──────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading pipeline…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-red text-sm font-medium mb-1">Pipeline Error</div>
          <p className="text-xs text-text-faint">{state.error}</p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => actions.refresh()}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-text">Pipeline</h2>
        <p className="text-xs text-text-faint mt-0.5">
          Track your applications from saved to hired
        </p>
      </div>

      {/* Hero stats + view toggle */}
      <PipelineHero
        stats={state.stats}
        view={state.view}
        onViewChange={actions.setView}
      />

      {/* Pipeline view */}
      {state.view === 'pipeline' && (
        <div className="space-y-2">
          {/* Filter tags */}
          <PipelineFilterTags
            activeFilter={state.activeFilter}
            onFilterChange={actions.setFilter}
          />

          {/* Stage sections */}
          {state.stages.map(stageData => (
            <StageSection
              key={stageData.stage}
              data={stageData}
              collapsed={!!state.collapseStates[stageData.stage]}
              onToggleCollapse={() => actions.toggleCollapse(stageData.stage)}
              onMoveStage={actions.moveStage}
              onConfirmSignal={actions.confirmSignal}
              onUnsave={actions.unsave}
              onSetTrackingMode={actions.setTrackingMode}
              onOpenModal={actions.openJobModal}
            />
          ))}
        </div>
      )}

      {/* Ghost Monitor view */}
      {state.view === 'ghost' && (
        <GhostMonitor
          entries={state.ghostEntries}
          loading={state.ghostLoading}
          stats={state.ghostStats}
          onArchive={handleArchive}
        />
      )}

      {/* Job detail modal */}
      <JobDetailModal
        jobId={state.selectedJobId}
        onClose={actions.closeJobModal}
      />
    </div>
  );
}

export default PipelinePage;
