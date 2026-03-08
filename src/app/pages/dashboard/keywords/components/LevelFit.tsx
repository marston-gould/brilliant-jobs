// ============================================================
// LevelFit — Level Fit Analysis (SA-015)
// ============================================================

import React from 'react';
import { Card } from '@app/components';
import type { LevelScore } from '../hooks/useKeywords';

interface LevelFitProps {
  levels: Record<string, LevelScore>;
}

export function LevelFit({ levels }: LevelFitProps) {
  const entries = Object.entries(levels);
  if (entries.length === 0) return null;

  return (
    <div className="pt-3 border-t border-border">
      <div className="text-[11px] font-semibold text-text-dim mb-2">Level Fit</div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([label, ls]) => {
          const scoreClass = ls.score >= 70 ? 'text-green' : ls.score >= 40 ? 'text-warm' : 'text-red';
          return (
            <Card key={label} variant="default" padding="sm" className="text-center min-w-[80px]">
              <div className={`font-mono text-sm font-bold ${scoreClass}`}>{ls.score}%</div>
              <div className="text-[10px] text-text-dim">{label}</div>
              <div className="text-[9px] text-text-faint">{ls.jobCount} jobs</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default LevelFit;
