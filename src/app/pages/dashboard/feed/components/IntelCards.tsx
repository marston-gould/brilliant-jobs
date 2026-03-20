// ============================================================
// IntelCards — Feed Intelligence Cards (Phase D — Legacy Parity)
// ============================================================
// Left slot:  DiscoveryCard (feature discovery rotation) — DC-02
// Right slot: Pro Tip (unchanged) — spec §6
// ============================================================

import { useState } from 'react';
import { X } from 'lucide-react';
import { DiscoveryCard } from './DiscoveryCard';

interface IntelCardsProps {
  searchQuery?: string;
  visibleCompanies?: string[];
}

export function IntelCards({ }: IntelCardsProps) {
  const [showMerch, setShowMerch] = useState(true);

  if (!showMerch) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
      {/* Left slot — Discovery card rotation (DC-02) */}
      <DiscoveryCard />

      {/* Right slot — Pro Tip (DC-06: unchanged per spec §6) */}
      {showMerch && (
        <div className="flex items-start gap-3 p-[14px_16px] rounded-[10px] border border-border bg-bg-card hover:border-border-hover transition-colors">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-dim text-accent">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm mb-0.5 bg-accent-dim text-accent">
              Pro Tip
            </span>
            <div className="text-xs font-semibold text-text leading-snug">Score your resume against these jobs</div>
            <div className="text-[11px] text-text-dim mt-0.5">See how well your resume matches before you apply</div>
            <a href="/app/resumes" className="text-[10px] font-semibold text-accent mt-1 inline-block hover:underline">
              Score my resume →
            </a>
          </div>
          <button onClick={() => setShowMerch(false)}
            className="p-0.5 text-text-faint hover:text-text-dim transition-colors flex-shrink-0" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default IntelCards;
