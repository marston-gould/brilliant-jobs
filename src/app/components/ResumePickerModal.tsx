// ============================================================
// ResumePickerModal — Select resume before applying
// ============================================================
// Legacy: resume-picker-overlay, rp-option, rp-radio, rp-name
// Shows available resumes with score and lets user pick one.
// ============================================================

import { useState } from 'react';
import { Modal } from '@app/components/Modal';

interface Resume {
  id: string;
  name: string;
  score?: number;
  updatedAt?: string;
}

interface ResumePickerModalProps {
  open: boolean;
  onClose: () => void;
  resumes: Resume[];
  onSelect: (resumeId: string) => void;
  onSkip?: () => void;
  jobTitle?: string;
}

export function ResumePickerModal({ open, onClose, resumes, onSelect, onSkip, jobTitle }: ResumePickerModalProps) {
  const [selected, setSelected] = useState<string>(resumes[0]?.id || '');

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-6 w-[380px] max-w-[90vw]">
        <h4 className="text-[14px] font-bold text-text mb-1">Choose a Resume</h4>
        <div className="text-[12px] text-text-faint mb-4">
          {jobTitle ? `Applying to: ${jobTitle}` : 'Select which resume to submit'}
        </div>

        <div className="space-y-1.5">
          {resumes.map(r => (
            <div key={r.id}
              className={`flex items-center gap-2.5 px-3 py-2.5 border rounded-lg cursor-pointer transition-all ${
                selected === r.id ? 'border-accent bg-accent/5' : 'border-border hover:border-accent'
              }`}
              onClick={() => setSelected(r.id)}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected === r.id ? 'border-accent' : 'border-border'
              }`}>
                {selected === r.id && <div className="w-2 h-2 rounded-full bg-accent" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-text truncate">{r.name}</div>
                {r.updatedAt && <div className="text-[10px] text-text-faint">{r.updatedAt}</div>}
              </div>
              {r.score != null && (
                <div className={`text-[12px] font-bold px-2 py-0.5 rounded ${
                  r.score >= 70 ? 'bg-green/10 text-green' : r.score >= 40 ? 'bg-accent/10 text-accent' : 'bg-warm/10 text-warm'
                }`}>{r.score}</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-4 justify-end">
          {onSkip && (
            <button onClick={() => { onSkip(); onClose(); }}
              className="text-[11px] text-text-faint px-3 py-1.5 hover:text-text-dim">Skip</button>
          )}
          <button onClick={() => { if (selected) { onSelect(selected); onClose(); } }}
            className="px-4 py-2 rounded-lg bg-accent text-white text-[12px] font-semibold">
            Use This Resume
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default ResumePickerModal;
