// ============================================================
// KeywordsPage — Main Keywords/Readiness Page Container (SA-015)
// ============================================================
// Orchestrates all keywords components:
// - ResumeSelector (pick resumes to analyze)
// - ResumeScoreCard (per-resume results)
//
// Data flows through useKeywords hook → legacy bridge.
// Dark mode: automatic via CSS custom properties.
// Zero inline styles. Design tokens via Tailwind.
// ============================================================

import React, { useCallback, useMemo } from 'react';
import { Button, Card } from '@app/components';
import { ResumeSelector, ResumeScoreCard } from './components';
import { useKeywords } from './hooks/useKeywords';

export function KeywordsPage() {
  const [state, actions] = useKeywords();

  // Cache age display
  const cacheAge = useMemo(() => {
    if (!state.lastRun) return null;
    const ms = Date.now() - new Date(state.lastRun).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    return `${Math.round(mins / 1440)}d ago`;
  }, [state.lastRun]);

  const scoreEntries = useMemo(() => {
    return Object.entries(state.scores).map(([idx, data]) => ({
      index: parseInt(idx, 10),
      data,
    }));
  }, [state.scores]);

  const hasScores = scoreEntries.length > 0;
  const eligibleResumes = state.resumes.filter(r => !r.archived && r.textStatus === 'ready' && r.hasKeywords);
  const hasEligible = eligibleResumes.length > 0;

  const handleScoreClick = useCallback((resumeIndex: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).handleScoreClick === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).handleScoreClick(resumeIndex);
    }
  }, []);

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

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold text-text">Resume Readiness</h2>
        <p className="text-xs text-text-faint mt-0.5">
          Analyze how well your resumes match your saved searches
        </p>
      </div>

      {/* Resume selector */}
      <Card variant="default" padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-text">Resumes</div>
          <div className="flex items-center gap-2">
            {cacheAge && (
              <span className="text-[10px] text-text-faint">Last scored: {cacheAge}</span>
            )}
            <Button
              size="sm"
              variant="primary"
              loading={state.analyzing}
              disabled={!hasEligible || state.analyzing}
              onClick={() => actions.runAnalysis()}
            >
              {state.analyzing ? 'Scoring…' : hasScores ? 'Score All' : 'Analyze'}
            </Button>
          </div>
        </div>

        <ResumeSelector
          resumes={state.resumes}
          onToggle={actions.toggleResume}
          onSelectAll={actions.selectAll}
        />

        {/* Status message */}
        {state.status && (
          <div className="text-[11px] text-text-dim italic">{state.status}</div>
        )}
      </Card>

      {/* No eligible resumes guidance */}
      {!hasEligible && (
        <Card variant="inset" padding="md" className="text-center">
          <p className="text-xs text-text-faint">
            Upload a resume and wait for keyword extraction to complete before analyzing readiness.
          </p>
        </Card>
      )}

      {/* Error state */}
      {state.error && (
        <Card variant="outline" padding="md" className="border-red/30">
          <div className="text-xs text-red font-medium">{state.error}</div>
        </Card>
      )}

      {/* Results */}
      {hasScores && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-text">Results</div>
          {scoreEntries.map(({ index, data }) => (
            <ResumeScoreCard
              key={index}
              resumeIndex={index}
              data={data}
              onScoreClick={handleScoreClick}
            />
          ))}
        </div>
      )}

      {/* Analyzing placeholder */}
      {state.analyzing && !hasScores && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <Card key={i} variant="inset" padding="md">
              <div className="animate-pulse space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-16 h-10 rounded bg-bg-hover" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-3 w-32 rounded bg-bg-hover" />
                    <div className="h-2 w-16 rounded bg-bg-hover" />
                  </div>
                </div>
                <div className="h-2 w-full rounded bg-bg-hover" />
                <div className="h-2 w-3/4 rounded bg-bg-hover" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default KeywordsPage;
