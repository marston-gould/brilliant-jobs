// ============================================================
// JobCard — 2-column feed card (legacy: #job-cards-container)
// ============================================================
// Legacy layout: grid-template-columns: 1fr 1fr; gap: 8px;
// Each card: ✕ hide | Title + Level badge | Company · Location · Age · Match%
//            Pipeline button | Apply → button
// ============================================================

import { useMemo, useCallback } from 'react';
import { Button } from '@app/components';
import type { TrustLabel } from '../hooks/useFeedSearch';

interface JobCardProps {
  job: Record<string, any>;
  isSaved: boolean;
  isApplied: boolean;
  matchScore: number | null;
  levelInfo: { label: string; color: string } | null;
  onSave: (id: string) => void;
  onHide: (id: string) => void;
  onApply: (id: string, url: string) => void;
  onOpenModal?: (id: string) => void;
  showPreview?: boolean;
}

function formatDays(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = Date.now();
  const days = Math.floor((now - d.getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  return `${days}d`;
}

function formatSalary(min?: number | null, max?: number | null): string {
  if (!min && !max) return '';
  const fmt = (n: number) => `$${Math.round(n / 1000)}k`;
  if (min && max) return `${fmt(min)}-${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `up to ${fmt(max)}`;
  return '';
}

function formatLocation(loc: string | null | undefined): string {
  if (!loc) return '';
  if (loc.length > 30) return loc.substring(0, 28) + '…';
  return loc;
}

export function JobCard({ job, isSaved, isApplied, matchScore, levelInfo, onSave, onHide, onApply, onOpenModal, showPreview }: JobCardProps) {
  const days = useMemo(() => formatDays(job.first_seen_at || job.updated_at), [job]);
  const salary = useMemo(() => formatSalary(job.salary_min, job.salary_max), [job]);
  const location = useMemo(() => formatLocation(job.location), [job]);
  const applyUrl = useMemo(() => job.apply_url || job.url || '#', [job]);

  return (
    <div className="border border-border rounded-lg bg-bg-card p-3.5 flex flex-col gap-2 hover:border-border-hover transition-colors">
      {/* Top row: hide × | title + level | Pipeline + Apply */}
      <div className="flex items-start gap-2">
        {/* Hide button */}
        <button
          onClick={() => onHide(job.greenhouse_id)}
          className="text-text-faint hover:text-text-dim text-sm mt-0.5 flex-shrink-0"
          title="Hide this job"
        >
          ✕
        </button>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[13px] font-semibold text-text leading-tight truncate cursor-pointer hover:text-accent transition-colors"
              onClick={() => onOpenModal?.(job.greenhouse_id)}>{job.title}</span>
            {(levelInfo || job.extracted_seniority) && (() => {
              const LEVEL_COLORS: Record<string, string> = {
                intern: '#f97316', entry: '#eab308', junior: '#eab308', mid: '#84cc16', ic: '#84cc16',
                senior: '#22c55e', lead: '#14b8a6', manager: '#06b6d4', director: '#3b82f6',
                vp: '#6366f1', executive: '#8b5cf6', unknown: '#9ca3af',
              };
              const label = levelInfo?.label || (job.extracted_seniority ? job.extracted_seniority.charAt(0).toUpperCase() + job.extracted_seniority.slice(1) : '');
              const color = levelInfo?.color || LEVEL_COLORS[job.extracted_seniority] || '#9ca3af';
              if (!label) return null;
              return <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color, border: `1px solid ${color}40` }}>{label}</span>;
            })()}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-text-faint mt-0.5 flex-wrap">
            <span className="font-medium text-text-dim">{job.company_name}</span>
            {location && <><span>·</span><span>{location}</span></>}
            {salary && <><span>·</span><span>{salary}</span></>}
            {days && <><span>·</span><span>{days}</span></>}
            {matchScore !== null && <><span>·</span><span className="font-semibold text-accent">{matchScore}%</span></>}

          </div>
        </div>

        {/* Action buttons — legacy: .job-action-btn + .apply-btn */}
        <div className="flex gap-1.5 flex-shrink-0">
          {isApplied ? (
            <span className="text-[10px] font-semibold text-green px-2.5 py-1 rounded-lg bg-green/10">
              Applied ✓
            </span>
          ) : (
            <>
              <button
                onClick={() => onSave(job.greenhouse_id)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border-[1.5px] border-accent text-accent bg-transparent hover:bg-accent/5 transition-colors whitespace-nowrap"
              >
                Pipeline
              </button>
              <button
                onClick={() => onApply(job.greenhouse_id, applyUrl)}
                className="text-[11px] font-bold px-3.5 py-[5px] rounded-lg bg-accent text-white hover:opacity-90 transition-opacity whitespace-nowrap inline-flex items-center gap-1"
              >
                Apply →
              </button>
            </>
          )}
        </div>
      </div>

      {/* Preview JD (when toggled) */}
      {showPreview && (job.content || job.description) && (() => {
        const raw = (job.content || job.description) as string;
        const text = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (!text) return null;
        return (
          <div className="text-[11px] text-text-faint leading-relaxed line-clamp-3 pt-1 border-t border-border/50">
            {text.substring(0, 300)}{text.length > 300 ? '…' : ''}
          </div>
        );
      })()}
    </div>
  );
}

export default JobCard;
