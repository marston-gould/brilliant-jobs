// ============================================================
// FilterSection — Groups resumes by saved filter (SA-016)
// ============================================================

import { useState } from 'react';
import { Card } from '@app/components';
import { ResumeCard } from './ResumeCard';
import type { Resume, SavedFilter, ReadinessScore, PipelineMeta } from '../hooks/useResumes';

interface FilterSectionProps {
  filterName: string;
  filterColor: string;
  resumes: Resume[];
  allResumes: Resume[];
  savedFilters: SavedFilter[];
  filterColors: string[];
  readinessCache: Record<number, ReadinessScore>;
  pipelineMeta: Record<string, PipelineMeta>;
  levels: Array<{ label: string; color: string }>;
  expandedIdx: number | null;
  onToggleExpand: (idx: number) => void;
  onToggleFilter: (idx: number, filterName: string) => void;
  onSetLevel: (idx: number, level: string) => void;
  onArchive: (idx: number) => void;
  onDelete: (idx: number) => void;
  onDownload: (idx: number) => void;
  onRename: (idx: number) => void;
  onRescore: (idx: number) => void;
  onScore: (idx: number) => void;
  onLaunchRewrite: (idx: number) => void;
  onReplacePlaceholder: (idx: number) => void;
  onReUpload: (idx: number) => void;
}

export function FilterSection({
  filterName,
  filterColor,
  resumes,
  allResumes,
  savedFilters,
  filterColors,
  readinessCache,
  pipelineMeta,
  levels,
  expandedIdx,
  onToggleExpand,
  onToggleFilter,
  onSetLevel,
  onArchive,
  onDelete,
  onDownload,
  onRename,
  onRescore,
  onScore,
  onLaunchRewrite,
  onReplacePlaceholder,
  onReUpload,
}: FilterSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (resumes.length === 0) return null;

  return (
    <div className="mb-6">
      <button
        className="flex items-center gap-2 mb-2 w-full text-left group"
        onClick={() => setCollapsed(prev => !prev)}
        aria-expanded={!collapsed}
      >
        <span
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: filterColor }}
        />
        <h3 className="text-sm font-semibold text-text group-hover:text-accent transition-colors">
          {filterName}
        </h3>
        <span className="text-xs text-text-faint">({resumes.length})</span>
        <span className="text-xs text-text-faint ml-auto">
          {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2 ml-5">
          {resumes.map(r => {
            const globalIdx = allResumes.indexOf(r);
            return (
              <ResumeCard
                key={r.id || r.name}
                resume={r}
                index={globalIdx}
                isExpanded={expandedIdx === globalIdx}
                savedFilters={savedFilters}
                filterColors={filterColors}
                readinessScore={readinessCache[globalIdx] || null}
                pipelineMeta={pipelineMeta}
                levels={levels}
                onToggleExpand={onToggleExpand}
                onToggleFilter={onToggleFilter}
                onSetLevel={onSetLevel}
                onArchive={onArchive}
                onDelete={onDelete}
                onDownload={onDownload}
                onRename={onRename}
                onRescore={onRescore}
                onScore={onScore}
                onLaunchRewrite={onLaunchRewrite}
                onReplacePlaceholder={onReplacePlaceholder}
                onReUpload={onReUpload}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
