// ============================================================
// StageSection — Collapsible Pipeline Stage (SA-015)
// ============================================================

import React from 'react';
import { Badge, Card } from '@app/components';
import type { PipelineStage, StageData } from '../hooks/usePipeline';
import { PL_STAGE_LABELS, PL_STAGE_COLORS } from '../hooks/usePipeline';
import { PipelineRow } from './PipelineRow';

interface StageSectionProps {
  data: StageData;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onMoveStage: (jobId: string, newStage: PipelineStage) => void;
  onConfirmSignal: (signalId: string, action: string, correctedStage?: string) => void;
  onUnsave: (jobId: string) => void;
  onSetTrackingMode: (jobId: string, mode: string) => void;
  onOpenModal: (jobId: string) => void;
}

export function StageSection({
  data, collapsed, onToggleCollapse,
  onMoveStage, onConfirmSignal, onUnsave, onSetTrackingMode, onOpenModal,
}: StageSectionProps) {
  const matchText = data.minMatch != null && data.maxMatch != null && data.medianMatch != null
    ? `Match: ${data.minMatch}% – ${data.medianMatch}% – ${data.maxMatch}%`
    : null;

  return (
    <Card variant="outline" padding="none" className="overflow-hidden">
      {/* Stage header */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover/50 transition-colors"
      >
        {/* Collapse chevron */}
        <span className={`text-[10px] text-text-faint transition-transform ${collapsed ? '' : 'rotate-90'}`}>
          ▶
        </span>

        {/* Stage color dot */}
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: PL_STAGE_COLORS[data.stage] }}
        />

        {/* Stage label */}
        <span className="text-xs font-semibold text-text">
          {PL_STAGE_LABELS[data.stage]}
        </span>

        {/* Count */}
        <Badge variant="default" size="sm">
          {data.items.length}
        </Badge>

        {/* Signal badge */}
        {data.pendingSignalCount > 0 && (
          <Badge variant="info" size="sm" dot>
            {data.pendingSignalCount} signal{data.pendingSignalCount > 1 ? 's' : ''} pending
          </Badge>
        )}

        {/* Match range (right-aligned) */}
        {matchText && (
          <span className="ml-auto text-[10px] text-text-faint">
            {matchText}
          </span>
        )}
      </button>

      {/* Stage body */}
      {!collapsed && (
        <div className="border-t border-border">
          {data.items.length === 0 ? (
            <div className="py-6 text-center text-xs text-text-faint">
              No jobs in this stage
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-bg-input/50">
                    <th className="w-4 py-1.5 px-1" />
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Title</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Company</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Resume</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Filters</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Discovered</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Applied</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Days</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Activity</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Match</th>
                    <th className="py-1.5 px-2 text-[10px] font-medium text-text-faint uppercase tracking-wider">Move</th>
                    <th className="w-8 py-1.5 px-1" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map(item => (
                    <PipelineRow
                      key={item.id}
                      item={item}
                      stage={data.stage}
                      onMoveStage={onMoveStage}
                      onConfirmSignal={onConfirmSignal}
                      onUnsave={onUnsave}
                      onSetTrackingMode={onSetTrackingMode}
                      onOpenModal={onOpenModal}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default StageSection;
