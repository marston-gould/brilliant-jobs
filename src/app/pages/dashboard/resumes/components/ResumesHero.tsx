// ============================================================
// ResumesHero — Navy banner matching legacy .resume-hero
// ============================================================
// Legacy: #1b3e6f bg, 32px 36px padding, 14px radius
// Stats: hero-stat cards inside with white/7% bg

import type { Resume, ReadinessScore, PipelineMeta } from '../hooks/useResumes';

interface ResumesHeroProps {
  resumes: Resume[];
  archivedCount: number;
  readinessCache: Record<number, ReadinessScore>;
  pipelineMeta: Record<string, PipelineMeta>;
}

export function ResumesHero({ resumes, archivedCount, readinessCache, pipelineMeta }: ResumesHeroProps) {
  const totalActive = resumes.filter(r => !r.needsUpload).length;
  const levels = new Set(resumes.map(r => r.level).filter(Boolean)).size;
  const assigned = resumes.filter(r => (r.filterIds || []).length > 0).length;

  const scores = Object.values(readinessCache).filter(s => s.overallScore > 0);
  const coverage = scores.length > 0 && resumes.length > 0
    ? Math.round((scores.length / resumes.length) * 100) + '%'
    : '—';

  const stats = [
    { label: 'Active', value: totalActive },
    { label: 'Levels', value: levels },
    { label: 'Assigned', value: assigned, color: 'text-green' },
    { label: 'Coverage', value: coverage, color: 'text-accent' },
    { label: 'Archived', value: archivedCount, color: 'text-white/50' },
  ];

  return (
    <div className="rounded-[14px] px-9 py-8 mb-5 overflow-hidden"
      style={{ background: '#1b3e6f', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      <div className="text-[18px] font-extrabold mb-1">
        One role, one resume. <span className="text-warm">Built to compete.</span>
      </div>
      <div className="text-[12px] leading-relaxed max-w-[480px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
        Every saved search gets its own resume. We score each version against live job postings so you know where you stand — and what to fix — before you apply.
      </div>
      <div className="flex gap-2 flex-wrap mt-3.5">
        {stats.map(s => (
          <div key={s.label} className="flex-1 min-w-0 text-center px-3.5 py-2.5 rounded-lg"
            style={{ background: 'hsla(0,0%,100%,0.07)', border: '1px solid hsla(0,0%,100%,0.08)' }}>
            <div className={`text-[18px] font-bold tabular-nums ${s.color || 'text-white'}`}>{s.value}</div>
            <div className="text-[10px] text-white/50 uppercase tracking-wide">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
