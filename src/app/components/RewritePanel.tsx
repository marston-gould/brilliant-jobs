// ============================================================
// RewritePanel — Slide-out AI Resume Rewrite Panel
// ============================================================
// Legacy: rw-panel-overlay, rw-panel, rw-diff, rw-score-bar
// Shows before/after resume sections with score improvement.
// Triggered from pipeline or feed when applying with low score.
// ============================================================

import { useState, useCallback } from 'react';
import { X } from 'lucide-react';

interface RewriteSection {
  name: string;
  original: string;
  rewritten: string;
  changed: boolean;
}

interface RewritePanelProps {
  open: boolean;
  onClose: () => void;
  jobTitle?: string;
  companyName?: string;
  scoreBefore?: number;
  scoreAfter?: number;
  sections?: RewriteSection[];
  onAccept?: () => void;
  onRetry?: () => void;
}

export function RewritePanel({
  open, onClose, jobTitle, companyName,
  scoreBefore = 0, scoreAfter = 0,
  sections = [], onAccept, onRetry,
}: RewritePanelProps) {
  const [accepted, setAccepted] = useState(false);
  const delta = scoreAfter - scoreBefore;

  const handleAccept = useCallback(() => {
    setAccepted(true);
    onAccept?.();
  }, [onAccept]);

  if (!open) return null;

  return (
    <div className={`fixed inset-0 z-[1100] bg-black/50 backdrop-blur-sm flex justify-end transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-[640px] max-w-full h-full bg-bg-card border-l border-border flex flex-col animate-[slideIn_0.3s_ease]"
        style={{ animationName: 'none' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border flex-shrink-0">
          <div>
            <div className="text-[16px] font-bold text-text">Rewrite Resume</div>
            {jobTitle && <div className="text-[12px] text-text-faint mt-1">{jobTitle}{companyName ? ` · ${companyName}` : ''}</div>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-text-faint hover:bg-bg-hover hover:text-text transition-all flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Score bar */}
          <div className="flex items-center justify-between gap-4 bg-bg-input rounded-lg px-[18px] py-3.5 mb-4">
            <div className="flex items-center gap-2 font-mono text-[16px] font-bold">
              <span className="text-text-faint">{scoreBefore}</span>
              <span className="text-text-faint text-[12px]">→</span>
              <span className="text-green">{scoreAfter}</span>
            </div>
            {delta > 0 && (
              <span className="text-[12px] bg-green/10 text-green px-2 py-0.5 rounded-[10px] font-semibold">+{delta} pts</span>
            )}
          </div>

          {/* Diff sections */}
          <div className="space-y-3">
            {sections.length === 0 ? (
              <div className="text-center py-12 text-text-faint text-[13px]">
                No rewrite results yet. Click "Rewrite Resume" from a job card to generate optimized sections.
              </div>
            ) : (
              sections.map(s => (
                <div key={s.name} className={`border border-border rounded-lg overflow-hidden ${s.changed ? 'border-l-[3px] border-l-accent' : 'opacity-60'}`}>
                  <div className="flex items-center justify-between px-3.5 py-2.5 bg-bg-input">
                    <span className="text-[13px] font-semibold text-text">{s.name}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg ${s.changed ? 'bg-accent/15 text-accent' : 'bg-bg-main text-text-faint'}`}>
                      {s.changed ? 'Changed' : 'Same'}
                    </span>
                  </div>
                  {s.changed && (
                    <div className="grid grid-cols-2">
                      <div className="px-3.5 py-3 border-r border-border bg-bg-main">
                        <div className="text-[10px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Original</div>
                        <div className="text-[12px] text-text-dim leading-relaxed whitespace-pre-wrap">{s.original}</div>
                      </div>
                      <div className="px-3.5 py-3" style={{ background: 'rgba(59,130,246,0.03)' }}>
                        <div className="text-[10px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-2">Rewritten</div>
                        <div className="text-[12px] text-text-dim leading-relaxed whitespace-pre-wrap">{s.rewritten}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-6 py-4 border-t border-border flex-shrink-0">
          {accepted ? (
            <div className="text-center text-[13px] text-green font-semibold py-2">✓ Rewrite accepted and saved</div>
          ) : (
            <div className="flex gap-2">
              <button onClick={handleAccept} className="flex-1 py-2.5 rounded-lg bg-accent text-white text-[13px] font-semibold">Accept Rewrite</button>
              {onRetry && <button onClick={onRetry} className="px-4 py-2.5 rounded-lg bg-bg-input border border-border text-text-dim text-[13px] font-semibold">Retry</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RewritePanel;
