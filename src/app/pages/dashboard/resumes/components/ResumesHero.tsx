// ============================================================
// ResumesHero — Stats banner for Resumes page (SA-016)
// ============================================================

import React from 'react';
import { Card } from '@app/components';
import type { Resume, ReadinessScore, PipelineMeta } from '../hooks/useResumes';

interface ResumesHeroProps {
  resumes: Resume[];
  archivedCount: number;
  readinessCache: Record<number, ReadinessScore>;
  pipelineMeta: Record<string, PipelineMeta>;
}

export function ResumesHero({ resumes, archivedCount, readinessCache, pipelineMeta }: ResumesHeroProps) {
  const totalActive = resumes.filter(r => !r.needsUpload).length;
  const placeholders = resumes.filter(r => r.needsUpload).length;

  // Avg readiness across scored resumes
  const scores = Object.values(readinessCache).filter(s => s.overallScore > 0);
  const avgReadiness = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.overallScore, 0) / scores.length)
    : 0;

  // Total applied and response rate from pipeline meta
  const metaEntries = Object.values(pipelineMeta);
  const totalApplied = metaEntries.filter(m => m.stage !== 'saved').length;
  const totalResponded = metaEntries.filter(m => ['responded', 'interview', 'offer'].includes(m.stage)).length;
  const responseRate = totalApplied > 0 ? Math.round((totalResponded / totalApplied) * 100) : 0;

  const stats = [
    { label: 'Active Resumes', value: totalActive, sublabel: placeholders > 0 ? `+${placeholders} placeholder${placeholders !== 1 ? 's' : ''}` : undefined },
    { label: 'Avg Readiness', value: avgReadiness > 0 ? `${avgReadiness}%` : '—', sublabel: scores.length > 0 ? `${scores.length} scored` : 'No scores yet' },
    { label: 'Total Applied', value: totalApplied, sublabel: totalResponded > 0 ? `${totalResponded} responded` : undefined },
    { label: 'Response Rate', value: totalApplied > 0 ? `${responseRate}%` : '—', sublabel: totalApplied > 0 ? `across all resumes` : 'No applications yet' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} variant="default" padding="md">
          <p className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-1">{s.label}</p>
          <p className="text-2xl font-bold text-text">{s.value}</p>
          {s.sublabel && (
            <p className="text-xs text-text-dim mt-0.5">{s.sublabel}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
