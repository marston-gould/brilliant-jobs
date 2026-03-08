// ============================================================
// FilterBreakdown — Per-filter Keyword Analysis (SA-015)
// ============================================================

import { useState } from 'react';
import type { FilterScore } from '../hooks/useKeywords';
import { KeywordTag } from './KeywordTag';

interface FilterBreakdownProps {
  filterName: string;
  score: FilterScore;
}

export function FilterBreakdown({ filterName, score }: FilterBreakdownProps) {
  const [expanded, setExpanded] = useState(false);

  const scoreClass = score.score >= 70 ? 'text-green' : score.score >= 40 ? 'text-warm' : 'text-red';

  const hasBigrams = (score.bigramMatched && score.bigramMatched.length > 0) ||
    (score.bigramMissing && score.bigramMissing.length > 0);

  return (
    <div className="pb-3 mb-3 border-b border-border last:border-b-0 last:pb-0 last:mb-0">
      {/* Score header */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`font-mono text-sm font-semibold ${scoreClass}`}>
          {score.score}%
        </span>
        <span className="text-xs font-semibold text-text">{filterName}</span>
        <span className="text-[10px] text-text-faint">
          {score.matched}/{score.total} terms · {score.jdsAnalyzed} JDs
        </span>
        {score.aiPowered && (
          <span className="px-1.5 py-0 text-[9px] font-medium rounded-full bg-purple-dim text-purple border border-purple/20">
            AI
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="ml-auto text-[10px] text-accent font-medium hover:underline"
        >
          {expanded ? 'Hide keywords ▾' : 'Show keywords ▸'}
        </button>
      </div>

      {/* Missing preview (always visible — top 5) */}
      {score.topMissing.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1">
          {score.topMissing.slice(0, 5).map((t, i) => (
            <KeywordTag key={i} term={t} variant="missing" />
          ))}
          {score.topMissing.length > 5 && (
            <span className="text-[10px] text-text-faint self-center">
              +{score.topMissing.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Expanded keyword detail */}
      {expanded && (
        <div className="mt-2.5 space-y-3">
          {/* Legend */}
          <div className="text-[9px] text-text-faint">
            <span className="text-green">✓ green</span> = in your resume{' '}
            <span className="text-red">✗ red</span> = missing — add these to improve your match
          </div>

          {/* Skills & Tools (unigrams) */}
          <div>
            <div className="text-[10px] font-semibold text-text-dim mb-1">Skills & Tools</div>
            <div className="flex flex-wrap gap-1">
              {score.topMatched.map((t, i) => (
                <KeywordTag key={`m-${i}`} term={t} variant="matched" />
              ))}
              {score.topMissing.map((t, i) => (
                <KeywordTag key={`x-${i}`} term={t} variant="missing" />
              ))}
            </div>
          </div>

          {/* 2-word phrases (bigrams) */}
          {hasBigrams && (
            <div>
              <div className="text-[10px] font-semibold text-text-dim mb-1">2-Word Phrases</div>
              <div className="flex flex-wrap gap-1">
                {(score.bigramMatched || []).map((t, i) => (
                  <KeywordTag key={`bm-${i}`} term={t} variant="matched" />
                ))}
                {(score.bigramMissing || []).map((t, i) => (
                  <KeywordTag key={`bx-${i}`} term={t} variant="missing" />
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations (Pro tier) */}
          {score.recommendations && score.recommendations.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-text-dim mb-1">AI Recommendations</div>
              <ul className="space-y-1">
                {score.recommendations.map((rec, i) => (
                  <li key={i} className="text-[11px] text-text-dim pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-accent">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FilterBreakdown;
