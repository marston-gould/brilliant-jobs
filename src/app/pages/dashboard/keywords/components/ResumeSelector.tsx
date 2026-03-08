// ============================================================
// ResumeSelector — Resume Picker for Readiness (SA-015)
// ============================================================

import React from 'react';
import { Badge, Card } from '@app/components';
import type { ResumeInfo } from '../hooks/useKeywords';

interface ResumeSelectorProps {
  resumes: ResumeInfo[];
  onToggle: (index: number) => void;
  onSelectAll: (selected: boolean) => void;
}

export function ResumeSelector({ resumes, onToggle, onSelectAll }: ResumeSelectorProps) {
  const eligible = resumes.filter(r => !r.archived && r.textStatus === 'ready' && r.hasKeywords);
  const selectedCount = eligible.filter(r => r.selected).length;
  const allSelected = eligible.length > 0 && selectedCount === eligible.length;

  if (resumes.length === 0) {
    return (
      <Card variant="inset" padding="md" className="text-center">
        <p className="text-xs text-text-faint">
          No resumes uploaded yet. Upload a resume from the Resumes page to start readiness analysis.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {/* Select all / none */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelectAll(!allSelected)}
          className="text-[11px] text-accent hover:underline"
        >
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-[10px] text-text-faint">
          {selectedCount} of {eligible.length} selected
        </span>
      </div>

      {/* Resume cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {resumes.map(r => {
          const isEligible = !r.archived && r.textStatus === 'ready' && r.hasKeywords;
          return (
            <button
              key={r.index}
              type="button"
              disabled={!isEligible}
              onClick={() => onToggle(r.index)}
              className={`text-left p-3 rounded-lg border transition-all ${
                !isEligible
                  ? 'opacity-40 cursor-not-allowed border-border bg-bg-input'
                  : r.selected
                    ? 'border-accent/40 bg-accent/5 hover:bg-accent/10'
                    : 'border-border bg-bg-card hover:border-border-hover hover:bg-bg-hover/50'
              }`}
            >
              <div className="flex items-start gap-2">
                {/* Checkbox */}
                <span className={`mt-0.5 flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px] ${
                  r.selected
                    ? 'bg-accent border-accent text-white'
                    : 'border-border bg-bg-input'
                }`}>
                  {r.selected && '✓'}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-text truncate">{r.name}</div>
                  <div className="flex items-center gap-1 mt-1">
                    {r.archived && <Badge variant="default" size="sm">Archived</Badge>}
                    {r.textStatus !== 'ready' && <Badge variant="warning" size="sm">{r.textStatus}</Badge>}
                    {!r.hasKeywords && !r.archived && r.textStatus === 'ready' && (
                      <Badge variant="warning" size="sm">No keywords</Badge>
                    )}
                    {r.filterIds.length > 0 && (
                      <Badge variant="info" size="sm">{r.filterIds.length} filter{r.filterIds.length > 1 ? 's' : ''}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ResumeSelector;
