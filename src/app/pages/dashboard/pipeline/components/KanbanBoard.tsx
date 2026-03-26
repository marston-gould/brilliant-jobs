// ============================================================
// KanbanBoard — Horizontal Kanban Card View (SA-015-K)
// ============================================================
// Renders pipeline stages as horizontal columns with drag-drop
// cards. Each card shows: stale dot + signal indicator, title,
// company, days-in-stage, match score, quick-move buttons.
//
// Drag model: HTML5 drag API — same data keys as StageSection/
// PipelineRow so drops work across both views.
// ============================================================

import { useState } from 'react';
import type { PipelineItem, PipelineStage, StageData } from '../hooks/usePipeline';
import {
  PL_STAGES,
  PL_STAGE_LABELS,
  PL_STAGE_COLORS,
  computeStaleDot,
  relativeTime,
} from '../hooks/usePipeline';
import { SignalCard } from './SignalCard';

// ── Stale dot colour map (same tokens as PipelineRow) ────────

const DOT_CLASSES: Record<string, string> = {
  green: 'bg-green',
  yellow: 'bg-warm',
  red: 'bg-red',
  blue: 'bg-accent animate-pulse',
  gray: 'bg-text-faint',
};

// ── Kanban Card ───────────────────────────────────────────────

interface KanbanCardProps {
  item: PipelineItem;
  stage: PipelineStage;
  onMoveStage: (jobId: string, newStage: PipelineStage) => void;
  onConfirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  onOpenModal: (jobId: string) => void;
}

function KanbanCard({ item, stage, onMoveStage, onConfirmSignal, onOpenModal }: KanbanCardProps) {
  const [signalExpanded, setSignalExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);

  const m = item.meta;
  const j = item.job;
  const title = m.title || j?.title || 'Untitled';
  const company = m.companyName || m.company || j?.company_name || '';

  const stageDate =
    m.respondedAt ? new Date(m.respondedAt) :
    m.appliedAt ? new Date(m.appliedAt) :
    m.savedAt ? new Date(m.savedAt) : null;
  const daysInStage = stageDate ? Math.floor((Date.now() - stageDate.getTime()) / 86400000) : null;

  const dotColor = computeStaleDot(stage, daysInStage, item.signal);
  const matchScore = typeof m.matchScore === 'number' ? m.matchScore : null;
  const matchClass =
    matchScore != null
      ? matchScore >= 70 ? 'text-green' : matchScore >= 40 ? 'text-warm' : 'text-red'
      : 'text-text-faint';

  const activityText = item.signal
    ? (item.signal.signal_source === 'time_based'
      ? 'Prompt ' + relativeTime(item.signal.created_at)
      : '✉️ Signal ' + relativeTime(item.signal.created_at))
    : relativeTime(m.stageChangedAt || m.stage_changed_at);

  // Adjacent stages for quick-move buttons (prev + next only)
  const idx = PL_STAGES.indexOf(stage);
  const prevStage = idx > 0 ? PL_STAGES[idx - 1] : null;
  const nextStage = idx < PL_STAGES.length - 1 ? PL_STAGES[idx + 1] : null;

  return (
    <div
      className={`
        group bg-bg-card border border-border rounded-lg p-3 space-y-2 shadow-sm
        cursor-grab active:cursor-grabbing select-none
        transition-all hover:border-border-hover hover:shadow-md
        ${dragging ? 'opacity-40 scale-95' : ''}
      `}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/pipeline-entry-id', item.id);
        e.dataTransfer.setData('text/pipeline-from-stage', stage);
        e.dataTransfer.effectAllowed = 'move';
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
    >
      {/* Top row: dot + title */}
      <div className="flex items-start gap-2">
        {/* Stale / signal dot */}
        <button
          type="button"
          className={`mt-[3px] w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLASSES[dotColor]} ${item.signal ? 'cursor-pointer' : 'cursor-default'}`}
          title={item.signal ? 'Signal detected — click to review' : `${daysInStage ?? '?'}d in stage`}
          onClick={item.signal ? () => setSignalExpanded(!signalExpanded) : undefined}
        />

        {/* Title */}
        <button
          type="button"
          onClick={() => onOpenModal(item.id)}
          className="text-[12px] font-semibold text-text hover:text-accent transition-colors text-left leading-tight line-clamp-2 flex-1"
          title={title}
        >
          {title}
        </button>
      </div>

      {/* Company + meta row */}
      <div className="flex items-center justify-between gap-1 pl-4">
        <span className="text-[11px] text-text-dim truncate max-w-[120px]" title={company}>
          {company || '—'}
        </span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {daysInStage != null && (
            <span className="text-[10px] text-text-faint">{daysInStage}d</span>
          )}
          {matchScore != null && (
            <span className={`text-[10px] font-semibold ${matchClass}`}>{matchScore}%</span>
          )}
        </div>
      </div>

      {/* Activity line */}
      <div className="pl-4 text-[10px] text-text-faint truncate">{activityText}</div>

      {/* Quick-move arrows */}
      <div className="pl-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {prevStage && (
          <button
            type="button"
            onClick={() => onMoveStage(item.id, prevStage)}
            className="px-1.5 py-0.5 text-[10px] text-text-faint hover:text-text hover:bg-bg-input rounded transition-all"
            title={`← ${PL_STAGE_LABELS[prevStage]}`}
          >
            ← {PL_STAGE_LABELS[prevStage].split(' ')[0]}
          </button>
        )}
        {nextStage && (
          <button
            type="button"
            onClick={() => onMoveStage(item.id, nextStage)}
            className="px-1.5 py-0.5 text-[10px] text-text-faint hover:text-accent hover:bg-accent/10 rounded transition-all"
            title={`${PL_STAGE_LABELS[nextStage]} →`}
          >
            {PL_STAGE_LABELS[nextStage].split(' ')[0]} →
          </button>
        )}
      </div>

      {/* Signal card (inline expand) */}
      {item.signal && signalExpanded && (
        <div className="mt-1">
          <SignalCard
            signal={item.signal}
            currentStage={stage}
            title={title}
            company={company}
            onConfirm={onConfirmSignal}
          />
        </div>
      )}
    </div>
  );
}

// ── Kanban Column ─────────────────────────────────────────────

interface KanbanColumnProps {
  data: StageData;
  onMoveStage: (jobId: string, newStage: PipelineStage) => void;
  onConfirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  onOpenModal: (jobId: string) => void;
}

function KanbanColumn({ data, onMoveStage, onConfirmSignal, onOpenModal }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only clear if leaving the column itself (not a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const entryId = e.dataTransfer.getData('text/pipeline-entry-id');
    const fromStage = e.dataTransfer.getData('text/pipeline-from-stage');
    if (entryId && fromStage !== data.stage) {
      onMoveStage(entryId, data.stage);
    }
  };

  const stageColor = PL_STAGE_COLORS[data.stage];

  return (
    <div className="flex flex-col min-w-[200px] max-w-[240px] flex-shrink-0">
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-2 pb-2 mb-2 border-b-2"
        style={{ borderColor: stageColor + '60' }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: stageColor }}
        />
        <span className="text-[12px] font-bold text-text flex-1 truncate">
          {PL_STAGE_LABELS[data.stage]}
        </span>
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: stageColor + '20', color: stageColor }}
        >
          {data.items.length}
        </span>
        {data.pendingSignalCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" title={`${data.pendingSignalCount} signal${data.pendingSignalCount > 1 ? 's' : ''} pending`} />
        )}
      </div>

      {/* Drop target + cards */}
      <div
        className={`
          flex-1 min-h-[80px] space-y-2 rounded-lg p-1.5 transition-all
          ${dragOver ? 'bg-accent/5 ring-2 ring-accent/30 ring-inset' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {data.items.length === 0 ? (
          <div className={`py-6 text-center text-[11px] text-text-faint rounded-md border border-dashed transition-colors ${dragOver ? 'border-accent/40 text-accent/60' : 'border-border'}`}>
            {dragOver ? 'Drop here' : 'Empty'}
          </div>
        ) : (
          data.items.map(item => (
            <KanbanCard
              key={item.id}
              item={item}
              stage={data.stage}
              onMoveStage={onMoveStage}
              onConfirmSignal={onConfirmSignal}
              onOpenModal={onOpenModal}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Kanban Board ──────────────────────────────────────────────

interface KanbanBoardProps {
  stages: StageData[];
  onMoveStage: (jobId: string, newStage: PipelineStage) => void;
  onConfirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  onOpenModal: (jobId: string) => void;
}

// Only show stages that have items OR are the primary active ones
// Terminal stages (hired, archived) show only when non-empty
const ALWAYS_SHOW: PipelineStage[] = ['saved', 'applied', 'responded', 'interview', 'offer', 'rejected'];

export function KanbanBoard({ stages, onMoveStage, onConfirmSignal, onOpenModal }: KanbanBoardProps) {
  const visibleStages = stages.filter(s =>
    ALWAYS_SHOW.includes(s.stage) || s.items.length > 0
  );

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max px-1">
        {visibleStages.map(stageData => (
          <KanbanColumn
            key={stageData.stage}
            data={stageData}
            onMoveStage={onMoveStage}
            onConfirmSignal={onConfirmSignal}
            onOpenModal={onOpenModal}
          />
        ))}
      </div>
    </div>
  );
}

export default KanbanBoard;
