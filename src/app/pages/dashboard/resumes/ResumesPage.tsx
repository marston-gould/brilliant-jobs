// ============================================================
// ResumesPage — Main Resumes Page Container (SA-016)
// ============================================================
// Orchestrates all resume components:
// - ResumesHero (stats banner)
// - ResumeUpload (drag-and-drop file upload)
// - FilterSection (resumes grouped by saved filter)
// - ResumeCard (ungrouped resumes)
// - ResumeArchive (archived resumes)
//
// Data flows through useResumes hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import { useMemo } from 'react';
import {
  ResumesHero,
  ResumeCard,
  FilterSection,
  ResumeArchive,
  ResumeUpload,
} from './components';
import { useResumes } from './hooks/useResumes';

export function ResumesPage() {
  const [state, actions] = useResumes();

  const pipelineMeta = useMemo(() => actions.getPipelineMeta(), [actions]);
  const levels = useMemo(() => actions.getLevels(), [actions]);

  // ── Loading state ──────────────────────────────────────────

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading resumes…</p>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load resumes</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  // ── Group resumes by filter ────────────────────────────────

  const placed = new Set<string>();
  const filterGroups = state.savedFilters.map((f, fi) => {
    const matching = state.resumes.filter(r => {
      const ids = r.filterIds || [];
      return ids.includes(f.name);
    });
    matching.forEach(r => placed.add(r.id || r.name));
    return {
      filter: f,
      color: state.filterColors[fi % state.filterColors.length],
      resumes: matching,
    };
  }).filter(g => g.resumes.length > 0);

  // Unassigned resumes
  const unassigned = state.resumes.filter(r => !placed.has(r.id || r.name));

  // ── Empty state ────────────────────────────────────────────

  const isEmpty = state.resumes.length === 0;

  // ── Shared card props ──────────────────────────────────────

  const cardProps = {
    savedFilters: state.savedFilters,
    filterColors: state.filterColors,
    pipelineMeta,
    levels,
    expandedIdx: state.expandedIdx,
    onToggleExpand: actions.toggleExpand,
    onToggleFilter: actions.toggleFilter,
    onSetLevel: actions.setLevel,
    onArchive: actions.archiveResume,
    onDelete: actions.deleteResume,
    onDownload: actions.downloadResume,
    onRename: actions.renameResume,
    onRescore: actions.rescoreAI,
    onScore: actions.scoreResume,
    onLaunchRewrite: actions.launchRewrite,
    onReplacePlaceholder: actions.replacePlaceholder,
    onReUpload: actions.reUpload,
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Stats */}
      <ResumesHero
        resumes={state.resumes}
        archivedCount={state.archivedResumes.length}
        readinessCache={state.readinessCache}
        pipelineMeta={pipelineMeta}
      />

      {/* Upload */}
      <div className="mb-6">
        <ResumeUpload onUpload={actions.uploadResume} />
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-12">
          <p className="text-lg font-semibold text-text-dim">No resumes yet</p>
          <p className="text-sm text-text-faint mt-1">Upload a resume above to get started with readiness scoring.</p>
        </div>
      )}

      {/* Filter-grouped resumes */}
      {filterGroups.map(g => (
        <FilterSection
          key={g.filter.name}
          filterName={g.filter.name}
          filterColor={g.color ?? '#888'}
          resumes={g.resumes}
          allResumes={state.resumes}
          readinessCache={state.readinessCache}
          {...cardProps}
        />
      ))}

      {/* Unassigned resumes */}
      {unassigned.length > 0 && (
        <div className="mb-6">
          {filterGroups.length > 0 && (
            <h3 className="text-sm font-semibold text-text-dim mb-2">Unassigned</h3>
          )}
          <div className="flex flex-col gap-2">
            {unassigned.map(r => {
              const globalIdx = state.resumes.indexOf(r);
              return (
                <ResumeCard
                  key={r.id || r.name}
                  resume={r}
                  index={globalIdx}
                  isExpanded={state.expandedIdx === globalIdx}
                  readinessScore={state.readinessCache[globalIdx] || null}
                  {...cardProps}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Archive */}
      <ResumeArchive
        resumes={state.archivedResumes}
        pipelineMeta={pipelineMeta}
        onUnarchive={actions.unarchiveResume}
        onDelete={actions.deleteResume}
        onDownload={actions.downloadResume}
      />
    </div>
  );
}

export default ResumesPage;
