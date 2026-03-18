// ============================================================
// PipelineRow — Pipeline Job Row (SA-015)
// ============================================================

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Badge } from '@app/components';
import type { PipelineItem, PipelineStage, StaleDotColor } from '../hooks/usePipeline';
import {
  PL_STAGES,
  PL_STAGE_LABELS,
  computeStaleDot,
  relativeTime,
} from '../hooks/usePipeline';
import { SignalCard } from './SignalCard';

// ── Stale dot component ──────────────────────────────────────

const DOT_CLASSES: Record<StaleDotColor, string> = {
  green: 'bg-green',
  yellow: 'bg-warm',
  red: 'bg-red',
  blue: 'bg-accent animate-pulse',
  gray: 'bg-text-faint',
};

const DOT_TITLES: Record<StaleDotColor, string> = {
  green: 'On track',
  yellow: 'Aging',
  red: 'Needs attention',
  blue: 'Signal detected',
  gray: 'Complete',
};

function StaleDot({ color, daysInStage, onClick }: {
  color: StaleDotColor;
  daysInStage: number | null;
  onClick?: () => void;
}) {
  const title = color === 'red' || color === 'yellow'
    ? `${daysInStage ?? '?'}d — ${DOT_TITLES[color]}`
    : DOT_TITLES[color];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASSES[color]} ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      title={title}
      aria-label={title}
    />
  );
}

// ── Action menu ──────────────────────────────────────────────

interface ActionMenuProps {
  jobId: string;
  isMuted: boolean;
  hasNote: boolean;
  onFindRecruiters: () => void;
  onToggleMute: () => void;
  onRemove: () => void;
}

function ActionMenu({ jobId, isMuted, hasNote, onFindRecruiters, onToggleMute, onRemove }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }, []);

  return (
    <div className="relative" ref={menuRef} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-2 py-0.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover rounded transition-all"
        title="Actions"
        aria-label="Actions menu"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-bg-card border border-border rounded-md shadow-lg py-1 min-w-[160px]">
          <button
            type="button"
            onClick={() => { onFindRecruiters(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover transition-all"
          >
            Find Recruiters
          </button>
          <button
            type="button"
            onClick={() => { onToggleMute(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-text-dim hover:text-text hover:bg-bg-hover transition-all"
          >
            {isMuted ? 'Unmute prompts' : 'Mute prompts'}
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => { onRemove(); setOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red hover:bg-red/5 transition-all"
          >
            Remove from pipeline
          </button>
        </div>
      )}
      {/* Indicators */}
      {hasNote && (
        <span className="absolute -bottom-1 -right-0.5 text-[8px]" title="Has status note">📌</span>
      )}
      {isMuted && (
        <span className="absolute -bottom-1 right-3 text-[8px] text-text-faint">🔇</span>
      )}
    </div>
  );
}

// ── Filter tag colors ────────────────────────────────────────

const FILTER_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f97316',
  '#22c55e', '#06b6d4', '#eab308', '#ef4444',
];

// ── Main row component ───────────────────────────────────────

interface PipelineRowProps {
  item: PipelineItem;
  stage: PipelineStage;
  onMoveStage: (jobId: string, newStage: PipelineStage) => void;
  onConfirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  onUnsave: (jobId: string) => void;
  onSetTrackingMode: (jobId: string, mode: string) => void;
  onOpenModal: (jobId: string) => void;
}

export function PipelineRow({
  item, stage, onMoveStage, onConfirmSignal, onUnsave, onSetTrackingMode, onOpenModal,
}: PipelineRowProps) {
  const [signalExpanded, setSignalExpanded] = useState(false);

  const m = item.meta;
  const j = item.job;
  const title = m.title || (j?.title || 'Untitled');
  const company = m.companyName || m.company || (j?.company_name || '');

  const discovered = j?.first_seen_at
    ? new Date(j.first_seen_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const dayApplied = m.appliedAt
    ? new Date(m.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';
  const resumeName = m.resumeUsed || '—';

  const stageDate = m.respondedAt ? new Date(m.respondedAt) :
    m.appliedAt ? new Date(m.appliedAt) :
      m.savedAt ? new Date(m.savedAt) : null;
  const daysInStage = stageDate ? Math.floor((Date.now() - stageDate.getTime()) / 86400000) : null;

  const dotColor = computeStaleDot(stage, daysInStage, item.signal);

  const lastActivity = item.signal
    ? (item.signal.signal_source === 'time_based'
      ? 'Prompt ' + relativeTime(item.signal.created_at)
      : 'Signal ' + relativeTime(item.signal.created_at))
    : relativeTime(m.stage_changed_at || m.lastPromptedAt);

  const matchScore = typeof m.matchScore === 'number' ? m.matchScore : null;
  const matchClass = matchScore != null
    ? matchScore >= 70 ? 'text-green' : matchScore >= 40 ? 'text-warm' : 'text-red'
    : 'text-text-faint';

  // Filter tag badges
  const savedFilters = useMemo(() => {
    try {
      const ls = localStorage.getItem('bj_saved_filters');
      return ls ? JSON.parse(ls) as Array<{ name: string }> : [];
    } catch { return []; }
  }, []);

  const filterBadges = useMemo(() => {
    if (!m.filterTags?.length) return null;
    return m.filterTags.map(tag => {
      const idx = savedFilters.findIndex(f => f.name === tag);
      const color = idx >= 0 ? FILTER_COLORS[idx % FILTER_COLORS.length] : '#999';
      return { tag, color };
    });
  }, [m.filterTags, savedFilters]);

  const moveOptions = PL_STAGES.filter(s => s !== stage).map(s => ({
    value: s,
    label: PL_STAGE_LABELS[s],
  }));

  const handleFindRecruiters = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (window as any).findRecruiters === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).findRecruiters(item.id);
    }
  }, [item.id]);

  return (
    <>
      <tr
        className="border-b border-border/50 hover:bg-bg-hover/50 transition-colors cursor-grab active:cursor-grabbing"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/pipeline-entry-id', item.id);
          e.dataTransfer.setData('text/pipeline-from-stage', stage);
          e.dataTransfer.effectAllowed = 'move';
          // Reduce opacity of dragged row
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '0.5';
          }
        }}
        onDragEnd={(e) => {
          if (e.currentTarget instanceof HTMLElement) {
            e.currentTarget.style.opacity = '1';
          }
        }}
      >
        {/* Stale dot */}
        <td className="w-4 text-center py-2 px-1">
          <StaleDot
            color={dotColor}
            daysInStage={daysInStage}
            onClick={item.signal ? () => setSignalExpanded(!signalExpanded) : undefined}
          />
        </td>

        {/* Title */}
        <td className="py-2 px-3 max-w-[180px]">
          <button
            type="button"
            onClick={() => onOpenModal(item.id)}
            className="text-xs font-medium text-text hover:text-accent transition-colors truncate block max-w-full text-left"
            title={title}
          >
            {title.length > 35 ? title.slice(0, 35) + '…' : title}
          </button>
        </td>

        {/* Company */}
        <td className="py-2 px-3 max-w-[130px]">
          <span className="text-xs text-text-dim truncate block" title={company}>
            {company.length > 20 ? company.slice(0, 20) + '…' : company || '—'}
          </span>
        </td>

        {/* Resume */}
        <td className="py-2 px-3">
          {resumeName !== '—' ? (
            <Badge variant="info" size="sm">{resumeName}</Badge>
          ) : (
            <span className="text-[11px] text-text-faint">—</span>
          )}
        </td>

        {/* Filter tags */}
        <td className="py-2 px-3">
          {filterBadges ? (
            <div className="flex gap-0.5 flex-wrap">
              {filterBadges.map(fb => (
                <span
                  key={fb.tag}
                  className="inline-block px-1.5 py-0 text-[10px] font-medium rounded-full border"
                  style={{
                    color: fb.color,
                    backgroundColor: fb.color + '15',
                    borderColor: fb.color + '30',
                  }}
                >
                  {fb.tag}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[10px] text-text-faint">—</span>
          )}
        </td>

        {/* Discovered */}
        <td className="py-2 px-3 text-xs text-text-dim whitespace-nowrap">{discovered}</td>

        {/* Day Applied */}
        <td className="py-2 px-3 text-xs text-text-dim whitespace-nowrap">{dayApplied}</td>

        {/* Days in Stage */}
        <td className="py-2 px-3 text-xs text-text-dim whitespace-nowrap">
          {daysInStage != null ? `${daysInStage}d` : '—'}
        </td>

        {/* Last Activity */}
        <td className="py-2 px-2 text-[11px] text-text-dim whitespace-nowrap">{lastActivity}</td>

        {/* Match */}
        <td className={`py-2 px-3 text-xs font-medium whitespace-nowrap ${matchClass}`}>
          {matchScore != null ? `${matchScore}%` : '—'}
        </td>

        {/* Move */}
        <td className="py-2 px-3">
          <select
            className="text-[11px] bg-bg-input text-text border border-border rounded px-1.5 py-0.5 appearance-none cursor-pointer focus:outline-none focus:border-accent"
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                onMoveStage(item.id, e.target.value as PipelineStage);
                e.target.value = '';
              }
            }}
          >
            <option value="">Move…</option>
            {moveOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </td>

        {/* Actions */}
        <td className="py-2 px-1">
          <ActionMenu
            jobId={item.id}
            isMuted={m.tracking_mode === 'muted'}
            hasNote={!!m.status_note}
            onFindRecruiters={handleFindRecruiters}
            onToggleMute={() => onSetTrackingMode(item.id, m.tracking_mode === 'muted' ? 'auto' : 'muted')}
            onRemove={() => onUnsave(item.id)}
          />
        </td>
      </tr>

      {/* Inline signal card */}
      {item.signal && signalExpanded && (
        <tr>
          <td colSpan={12} className="p-0">
            <SignalCard
              signal={item.signal}
              currentStage={stage}
              title={title}
              company={company}
              onConfirm={onConfirmSignal}
            />
          </td>
        </tr>
      )}
    </>
  );
}

export default PipelineRow;
