// ============================================================
// JobRow — Single Job Entry in Feed Table (SA-014)
// ============================================================
// Renders one job with all columns: hide button, title (with
// filter badges + NEW + fraud + AI badges), level, company,
// location, salary, days ago, match score, and action buttons.
//
// Expandable snippet row for job preview.
// Design tokens only — zero inline styles.
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { Badge, Button } from '@components';
import type { FeedJob, TrustLabel, AiLabel } from '../hooks/useFeedSearch';

interface JobRowProps {
  job: FeedJob;
  isSaved: boolean;
  isApplied: boolean;
  isNew: boolean;
  matchScore: number | null;
  fraudInfo: { label: TrustLabel; score: number } | null;
  aiInfo: { label: AiLabel; ai_probability: number } | null;
  levelInfo: { label: string; color: string; rank: number } | null;
  onSave: (jobId: string) => void;
  onHide: (jobId: string) => void;
  onApply: (jobId: string, url: string) => void;
  showPreview: boolean;
}

// ── Formatting helpers ────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string {
  if (!min && !max) return '—';
  const fmt = (n: number) => {
    if (n >= 1000) return `$${Math.round(n / 1000)}K`;
    return `$${n}`;
  };
  if (min && max) return `${fmt(min)}–${fmt(max)}`;
  if (max) return `${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  return '—';
}

function formatDaysAgo(dateStr: string | null): { text: string; isRecent: boolean } {
  if (!dateStr) return { text: '—', isRecent: false };
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return { text: 'today', isRecent: true };
  return { text: `${days}d`, isRecent: days <= 3 };
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

function formatLocation(raw: string | null): string {
  if (!raw) return '—';
  // Clean up "City, State, United States" → "City, State"
  return raw
    .replace(/, United States$/i, '')
    .replace(/, USA$/i, '')
    .trim() || '—';
}

function getApplyUrl(job: FeedJob): string {
  if (job.apply_url) return job.apply_url;
  if (job.url && job.url.startsWith('http')) return job.url;
  if (job.url) return `https://boards.greenhouse.io${job.url}`;
  return '#';
}

// ── Trust badge ───────────────────────────────────────────

function TrustBadge({ info }: { info: { label: TrustLabel; score: number } | null }) {
  if (!info) return null;
  const config: Record<TrustLabel, { icon: string; variant: 'success' | 'warning' | 'error' | 'default' }> = {
    safe: { icon: '🛡️', variant: 'success' },
    caution: { icon: '⚠️', variant: 'warning' },
    suspicious: { icon: '🚩', variant: 'error' },
    unknown: { icon: '', variant: 'default' },
  };
  const c = config[info.label];
  if (!c || info.label === 'unknown') return null;
  return (
    <Badge variant={c.variant} size="sm" className="ml-1">
      {c.icon}
    </Badge>
  );
}

// ── AI content badge ──────────────────────────────────────

function AiContentBadge({ info }: { info: { label: AiLabel; ai_probability: number } | null }) {
  if (!info || info.label === 'unscored' || info.label === 'human') return null;
  const variant = info.label === 'ai_generated' ? 'error' : 'warning';
  return (
    <Badge variant={variant} size="sm" className="ml-1">
      🤖
    </Badge>
  );
}

// ── Match score badge ─────────────────────────────────────

function MatchBadge({ score, excluded }: { score: number | null; excluded?: boolean }) {
  if (score === null || score === undefined) return <span className="text-text-faint">—</span>;
  const pct = typeof score === 'number' ? score : 0;
  const colorClass =
    pct >= 80 ? 'text-green-400' :
    pct >= 60 ? 'text-amber-400' :
    pct >= 40 ? 'text-orange-400' :
    'text-text-faint';

  return (
    <span
      className={`text-xs font-semibold tabular-nums ${colorClass} ${excluded ? 'opacity-30' : ''}`}
      title={excluded ? 'Match score excluded per your AI content preferences' : `${pct}% match`}
    >
      {pct}%
    </span>
  );
}

// ── Component ─────────────────────────────────────────────

export function JobRow({
  job,
  isSaved,
  isApplied,
  isNew,
  matchScore,
  fraudInfo,
  aiInfo,
  levelInfo,
  onSave,
  onHide,
  onApply,
  showPreview,
}: JobRowProps) {
  const [expanded, setExpanded] = useState(false);

  const days = useMemo(() => formatDaysAgo(job.first_seen_at || job.updated_at), [job]);
  const salary = useMemo(() => formatSalary(job.salary_min, job.salary_max), [job]);
  const applyUrl = useMemo(() => getApplyUrl(job), [job]);
  const location = useMemo(() => formatLocation(job.location), [job]);

  const handleTitleClick = useCallback(() => setExpanded(prev => !prev), []);

  // Filter number badges (max 3 + overflow)
  const filterBadges = useMemo(() => {
    const badges = (job._filterNums || []).filter(f => f.num);
    if (badges.length === 0) return null;
    const maxBadges = 3;
    const visible = badges.slice(0, maxBadges);
    const overflow = badges.length - maxBadges;
    return (
      <>
        {visible.map((f, i) => (
          <span
            key={i}
            className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white mr-1"
            style={{ backgroundColor: f.color }}
          >
            {f.num}
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white bg-text-faint mr-1">
            +{overflow}
          </span>
        )}
      </>
    );
  }, [job._filterNums]);

  return (
    <>
      <tr
        className="border-b border-border hover:bg-bg-hover/50 transition-colors group"
        data-jobid={job.greenhouse_id}
      >
        {/* Hide button */}
        <td className="p-1.5 w-[30px]">
          <button
            type="button"
            className="px-1.5 py-0.5 text-[9px] text-text-faint hover:text-red-400 hover:bg-red-400/10 rounded transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => onHide(job.greenhouse_id)}
            title="Hide this job — trains your exclusion filters"
          >
            ✕
          </button>
        </td>

        {/* Title */}
        <td className="py-2 px-2 max-w-0">
          <div className="flex items-center gap-1 truncate">
            {filterBadges}
            <button
              type="button"
              className="text-xs font-medium text-text hover:text-accent truncate transition-colors text-left"
              onClick={handleTitleClick}
              title={job.title || ''}
            >
              {truncate(job.title, 55)}
            </button>
            {isNew && (
              <Badge variant="info" size="sm">NEW</Badge>
            )}
            <TrustBadge info={fraudInfo} />
            <AiContentBadge info={aiInfo} />
          </div>
        </td>

        {/* Level */}
        <td className="py-2 px-1.5">
          {levelInfo ? (
            <span
              className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{
                backgroundColor: `${levelInfo.color}20`,
                color: levelInfo.color,
              }}
            >
              {levelInfo.label}
            </span>
          ) : (
            <span className="text-text-faint text-xs">—</span>
          )}
        </td>

        {/* Company */}
        <td className="py-2 px-1.5 text-[13px] font-medium text-text lowercase truncate max-w-[120px]" title={job.company_name}>
          {truncate(job.company_name, 30)}
        </td>

        {/* Location */}
        <td className="py-2 px-1.5 text-xs text-text-dim truncate max-w-[100px]" title={job.location || ''}>
          {truncate(location, 35)}
        </td>

        {/* Salary */}
        <td className="py-2 px-1.5 text-xs text-text-dim tabular-nums whitespace-nowrap">
          {salary}
        </td>

        {/* Days */}
        <td className={`py-2 px-1.5 text-xs tabular-nums ${days.isRecent ? 'text-green-400' : 'text-text-dim'}`}>
          {days.text}
        </td>

        {/* Match */}
        <td className="py-2 px-1.5">
          <MatchBadge score={matchScore} excluded={job._aiScoringExcluded} />
        </td>

        {/* Actions */}
        <td className="py-2 px-1.5">
          <div className="flex gap-1 items-center whitespace-nowrap">
            {isApplied ? (
              <span className="text-[10px] font-semibold text-green-400 px-2 py-0.5 rounded bg-green-400/10">
                Applied ✓
              </span>
            ) : (
              <>
                <Button
                  variant={isSaved ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => onSave(job.greenhouse_id)}
                  className="text-[10px] px-2 py-0.5"
                >
                  {isSaved ? 'Pipeline ✓' : 'Pipeline'}
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onApply(job.greenhouse_id, applyUrl)}
                  className="text-[10px] px-2 py-0.5"
                >
                  Apply
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expandable preview row */}
      {(expanded || showPreview) && (
        <tr className="border-b border-border/50">
          <td />
          <td colSpan={7} className="py-2 px-2">
            <div className="text-xs text-text-faint leading-relaxed line-clamp-3">
              {job.description
                ? job.description.substring(0, 300) + (job.description.length > 300 ? '…' : '')
                : 'No description available'}
            </div>
          </td>
          <td />
        </tr>
      )}
    </>
  );
}

export default JobRow;
