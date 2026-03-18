// ============================================================
// ScoreGateModal — Resume score check before applying
// ============================================================
// Legacy: sg-overlay, sg-modal, sg-score-badge, sg-breakdown
// Shows resume match score with missing keywords and offers
// apply, rewrite, or skip actions.
// ============================================================

import { Modal } from '@app/components/Modal';

interface ScoreGateModalProps {
  open: boolean;
  onClose: () => void;
  jobTitle: string;
  companyName: string;
  score: number | null;
  missingKeywords?: string[];
  onApply: () => void;
  onRewrite?: () => void;
  onSkip: () => void;
}

export function ScoreGateModal({
  open, onClose, jobTitle, companyName, score, missingKeywords = [], onApply, onRewrite, onSkip,
}: ScoreGateModalProps) {
  if (!open) return null;

  const scoreClass = score == null ? 'bg-bg-hover text-text-faint'
    : score >= 70 ? 'bg-green/15 text-green'
    : score >= 40 ? 'bg-warm/15 text-warm'
    : 'bg-red/15 text-red';

  const scoreLabel = score == null ? 'Unscored'
    : score >= 70 ? 'Strong Match'
    : score >= 40 ? 'Moderate Match'
    : 'Weak Match';

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5 sm:p-7 max-w-[480px]">
        {/* Job info */}
        <div className="mb-4">
          <div className="text-[14px] font-semibold text-text">{jobTitle}</div>
          <div className="text-[12px] text-text-dim">{companyName}</div>
        </div>

        {/* Score badge + threshold */}
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${scoreClass}`}>
            <div className="text-[20px] font-extrabold leading-none">{score ?? '—'}</div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.5px] opacity-80">score</div>
          </div>
          <div className="text-[13px] text-text-dim leading-relaxed">
            <strong className="text-text">{scoreLabel}.</strong>{' '}
            {score != null && score < 70
              ? 'Your resume may not fully match this role. Consider rewriting before applying.'
              : 'Your resume is a good fit for this position.'}
          </div>
        </div>

        {/* Missing keywords */}
        {missingKeywords.length > 0 && (
          <div className="bg-bg-input border border-border rounded-[10px] p-3.5 mb-4">
            <div className="text-[12px] text-text-dim leading-relaxed mb-2.5">
              Missing keywords that could improve your score:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {missingKeywords.map(kw => (
                <span key={kw} className="text-[11px] px-2 py-0.5 rounded bg-red/10 text-red">{kw}</span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
          <button onClick={() => { onApply(); onClose(); }}
            className="px-3.5 py-[7px] rounded-lg bg-accent text-white text-[12px] font-semibold">
            Apply Anyway
          </button>
          {onRewrite && (
            <button onClick={() => { onRewrite(); onClose(); }}
              className="px-3.5 py-[7px] rounded-lg bg-purple/15 text-purple text-[12px] font-semibold">
              Rewrite Resume
            </button>
          )}
          <button onClick={() => { onSkip(); onClose(); }}
            className="px-3.5 py-[7px] rounded-lg bg-transparent text-text-faint text-[12px] font-semibold">
            Skip
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ScoreGateModal;
