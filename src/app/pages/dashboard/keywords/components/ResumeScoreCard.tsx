// ============================================================
// ResumeScoreCard — Per-Resume Readiness Card (SA-015)
// ============================================================

import React from 'react';
import { Card } from '@app/components';
import type { ResumeScore } from '../hooks/useKeywords';
import { FilterBreakdown } from './FilterBreakdown';
import { LevelFit } from './LevelFit';

interface ResumeScoreCardProps {
  resumeIndex: number;
  data: ResumeScore;
  onScoreClick?: (resumeIndex: number) => void;
}

export function ResumeScoreCard({ resumeIndex, data, onScoreClick }: ResumeScoreCardProps) {
  const scoreClass = data.overallScore >= 70
    ? 'text-green'
    : data.overallScore >= 40
      ? 'text-warm'
      : 'text-red';

  const label = data.overallScore >= 70
    ? 'Ready'
    : data.overallScore >= 40
      ? 'Gaps'
      : 'Weak';

  const filterNames = Object.keys(data.filters);
  const levelLabels = Object.keys(data.levels);

  return (
    <Card variant="inset" padding="md" className="space-y-3">
      {/* Header: score + name */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onScoreClick?.(resumeIndex)}
          className={`font-mono text-3xl font-bold leading-tight ${scoreClass} hover:opacity-80 transition-opacity`}
          title="Click for detailed scoring"
        >
          {data.overallScore}%
        </button>
        <div>
          <div className="text-sm font-semibold text-text">{data.resumeName}</div>
          <div className={`text-[11px] font-medium ${scoreClass}`}>{label}</div>
        </div>
      </div>

      {/* Per-filter breakdowns */}
      {filterNames.length > 0 && (
        <div>
          {filterNames.map(fname => (
            <FilterBreakdown
              key={fname}
              filterName={fname}
              score={data.filters[fname]}
            />
          ))}
        </div>
      )}

      {/* Level fit */}
      {levelLabels.length > 0 && (
        <LevelFit levels={data.levels} />
      )}
    </Card>
  );
}

export default ResumeScoreCard;
