// ============================================================
// IntelCards — Feed Intelligence Sidebar Cards
// ============================================================
// Phase D: Feed feature gap — legacy had intel cards showing:
// - Resume match score against current search
// - Ghost rate for top companies in results
// - Market signals (salary trends, demand indicators)
// ============================================================

import { useState, useEffect } from 'react';
import {
  FileText,
  Ghost,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import { useResumesProvider, useStatsProvider } from '@providers';

interface IntelCardsProps {
  /** Current search query for contextual scoring */
  searchQuery?: string;
  /** Company names from visible results for ghost rate */
  visibleCompanies?: string[];
}

export function IntelCards({ searchQuery, visibleCompanies }: IntelCardsProps) {
  const resumeProvider = useResumesProvider();
  const statsProvider = useStatsProvider();

  const [resumeScore, setResumeScore] = useState<number | null>(null);
  const [resumeName, setResumeName] = useState<string>('');
  const [sourceBreakdown, setSourceBreakdown] = useState<Array<Record<string, any>>>([]);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadIntel() {
      setLoading(true);
      try {
        const [resumes, sources] = await Promise.allSettled([
          resumeProvider.getAll(),
          statsProvider.getSourceBreakdown(),
        ]);

        // Get primary resume score
        if (resumes.status === 'fulfilled' && resumes.value.length > 0) {
          const primary = resumes.value.find(r => !r.archived) ?? resumes.value[0];
          if (primary) {
            setResumeName(primary.name || 'Primary Resume');
            // If we have extracted text, try to score against search query
            if (primary.extractedText && searchQuery) {
              try {
                const result = await resumeProvider.scoreAI(primary.extractedText);
                setResumeScore(result.score);
              } catch {
                setResumeScore(null);
              }
            }
          }
        }

        if (sources.status === 'fulfilled') {
          setSourceBreakdown(sources.value.slice(0, 6));
        }
      } catch {
        // Non-fatal — cards just won't show data
      } finally {
        setLoading(false);
      }
    }
    loadIntel();
  }, [resumeProvider, statsProvider, searchQuery]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-20 rounded bg-border-subtle/50" />
              <div className="h-6 w-16 rounded bg-border-subtle/50" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-text-faint">
          Intelligence
        </span>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-text-faint" />
          : <ChevronDown className="w-3.5 h-3.5 text-text-faint" />
        }
      </button>

      {expanded && (
        <>
          {/* Resume Match Score */}
          <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-xs font-semibold text-text-secondary">Resume Match</span>
            </div>
            {resumeScore !== null ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${
                    resumeScore >= 75 ? 'text-emerald-500'
                    : resumeScore >= 50 ? 'text-amber-500'
                    : 'text-red-500'
                  }`}>
                    {resumeScore}
                  </span>
                  <span className="text-xs text-text-faint">/100</span>
                </div>
                <div className="w-full h-1.5 bg-bg-main rounded-full overflow-hidden mt-2">
                  <div
                    className={`h-full rounded-full transition-all ${
                      resumeScore >= 75 ? 'bg-emerald-500'
                      : resumeScore >= 50 ? 'bg-amber-500'
                      : 'bg-red-500'
                    }`}
                    style={{ width: `${resumeScore}%` }}
                  />
                </div>
                <p className="text-[11px] text-text-faint mt-1.5 truncate">{resumeName}</p>
              </>
            ) : (
              <p className="text-xs text-text-faint">
                {resumeName ? 'Score unavailable for current search' : 'Upload a resume to see match scores'}
              </p>
            )}
          </div>

          {/* Ghost Rate Indicator */}
          <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
            <div className="flex items-center gap-2 mb-2">
              <Ghost className="w-4 h-4 text-purple-500" />
              <span className="text-xs font-semibold text-text-secondary">Ghost Risk</span>
            </div>
            {visibleCompanies && visibleCompanies.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs text-text-secondary">
                    {visibleCompanies.length} compan{visibleCompanies.length === 1 ? 'y' : 'ies'} in view
                  </span>
                </div>
                <p className="text-[11px] text-text-faint">
                  Ghost rates are shown per-job via trust badges. Companies with high ghost rates are flagged in the Pipeline.
                </p>
              </div>
            ) : (
              <p className="text-xs text-text-faint">Run a search to see ghost risk indicators</p>
            )}
          </div>

          {/* Market Signals */}
          <div className="p-4 rounded-lg border border-border-subtle bg-bg-surface">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-text-secondary">Source Mix</span>
            </div>
            {sourceBreakdown.length > 0 ? (
              <div className="space-y-1.5">
                {sourceBreakdown.map((s, i) => {
                  const name = s.source_name || s.source || 'Unknown';
                  const count = typeof s.job_count === 'number' ? s.job_count : 0;
                  const firstCount = sourceBreakdown[0]?.job_count;
                  const maxCount = (typeof firstCount === 'number' && firstCount > 0) ? firstCount : 1;
                  const pct = Math.round((count / maxCount) * 100);
                  return (
                    <div key={name + '-' + i}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <span className="text-text-secondary truncate">{name}</span>
                        <span className="text-text-faint tabular-nums">{count.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1 bg-bg-main rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500/60 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-text-faint">No source data available</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default IntelCards;
