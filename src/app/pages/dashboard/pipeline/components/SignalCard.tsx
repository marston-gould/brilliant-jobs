// ============================================================
// SignalCard — Inline Signal Confirmation UI (SA-015)
// ============================================================

import { Button } from '@app/components';
import type { PipelineSignal, PipelineStage } from '../hooks/usePipeline';
import { PL_STAGE_LABELS, relativeTime } from '../hooks/usePipeline';

const ROUND_LABELS: Record<string, string> = {
  final: 'Final Round', onsite: 'On-site', panel: 'Panel',
  technical: 'Technical', hm: 'Hiring Manager', phone_screen: 'Phone Screen',
  intro: 'Intro', '1': 'Round 1', '2': 'Round 2', late: 'Late Stage',
};

interface SignalCardProps {
  signal: PipelineSignal;
  currentStage: PipelineStage;
  title: string;
  company: string;
  onConfirm: (signalId: string, action: string, correctedStage?: string) => void;
}

export function SignalCard({ signal, currentStage, title, company, onConfirm }: SignalCardProps) {
  const isSignal = signal.signal_source !== 'time_based';
  const isCalendar = signal.signal_source === 'calendar';

  const icon = isCalendar ? '📅' : isSignal ? '✉️' : '⏰';
  const headerText = isCalendar
    ? `Interview detected for ${title} at ${company}`
    : isSignal
      ? `Activity detected for ${title} at ${company}`
      : `Time to check in on ${title} at ${company}`;

  const borderColor = isSignal ? 'border-l-accent' : 'border-l-warm';
  const roundLabel = signal.evidence_metadata?.interview_round
    ? ROUND_LABELS[signal.evidence_metadata.interview_round] || signal.evidence_metadata.interview_round
    : null;

  const confPct = signal.confidence ? Math.round(signal.confidence * 100) : null;
  const confClass = confPct != null
    ? confPct >= 80 ? 'text-green' : confPct >= 60 ? 'text-warm' : 'text-red'
    : '';

  return (
    <div className={`border-l-[3px] ${borderColor} bg-bg-input rounded-r-md p-3 space-y-2`}>
      {/* Header */}
      <div className="text-xs font-medium text-text">
        <span className="mr-1.5">{icon}</span>
        {headerText}
      </div>

      {/* Evidence preview */}
      {signal.evidence_preview && (
        <div className="text-[11px] text-text-dim italic pl-5">
          {signal.evidence_preview}
        </div>
      )}

      {/* Round badge */}
      {roundLabel && (
        <div className="pl-5">
          <span className="inline-block px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-dim text-purple border border-purple/20">
            {roundLabel}
          </span>
        </div>
      )}

      {/* Confidence */}
      {confPct != null && (
        <div className={`text-[11px] pl-5 ${confClass}`}>
          {confPct}% confidence
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 flex-wrap pl-5">
        {isSignal && signal.proposed_stage ? (
          <>
            <div className="text-[11px] text-text-dim mr-1">
              Move: <strong className="text-text">{PL_STAGE_LABELS[currentStage]}</strong>
              {' → '}
              <strong className="text-accent">{PL_STAGE_LABELS[signal.proposed_stage as PipelineStage] || signal.proposed_stage}</strong>
            </div>
            <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'confirm')}>
              Confirm
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onConfirm(signal.id, 'correct')}>
              Different stage
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm(signal.id, 'dismiss')}>
              Dismiss
            </Button>
          </>
        ) : (
          <>
            {currentStage === 'saved' && (
              <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'correct', 'applied')}>
                Applied
              </Button>
            )}
            {currentStage === 'applied' && (
              <>
                <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'correct', 'responded')}>
                  Got a response
                </Button>
                <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'correct', 'interview')}>
                  Interview scheduled
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onConfirm(signal.id, 'correct', 'rejected')}>
                  Rejected
                </Button>
              </>
            )}
            {currentStage === 'responded' && (
              <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'correct', 'interview')}>
                Interview scheduled
              </Button>
            )}
            {currentStage === 'interview' && (
              <>
                <Button size="sm" variant="primary" onClick={() => onConfirm(signal.id, 'correct', 'offer')}>
                  Got an offer
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onConfirm(signal.id, 'correct', 'rejected')}>
                  Rejected
                </Button>
              </>
            )}
            <Button size="sm" variant="secondary" onClick={() => onConfirm(signal.id, 'snooze')}>
              No update yet
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onConfirm(signal.id, 'correct', 'archived')}>
              Archive
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export default SignalCard;
