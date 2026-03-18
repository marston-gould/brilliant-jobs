// ============================================================
// IntelCards — Feed Intelligence Cards (Phase D — Legacy Parity)
// ============================================================
// Matches legacy dashboard.html #intel-section exactly:
// - Horizontal card layout (not sidebar)
// - Two cards: "Your Market" insight + "Pro Tip" merch
// - Each has: icon, type badge, title, subtitle, CTA, dismiss
// - Positioned above search mode toggle, persists across modes
//
// Legacy CSS reference (dist/styles.css):
//   .intel-card: bg-card, border, 10px radius, 14px 16px pad,
//                flex row, gap-12, hover border-hover
//   .intel-icon: 36x36, rounded-lg, centered emoji
//   .intel-card-type: 8px, 700, uppercase, pill badge
//   .intel-card-title: 12px, 600, text color
//   .intel-card-sub: 11px, text-dim
//   .intel-card-cta: 10px, 600, accent
// ============================================================

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useStatsProvider } from '@providers';

interface IntelCardsProps {
  searchQuery?: string;
  visibleCompanies?: string[];
}

export function IntelCards({ searchQuery }: IntelCardsProps) {
  const statsProvider = useStatsProvider();
  const [insightTitle, setInsightTitle] = useState('Loading market data\u2026');
  const [insightSub, setInsightSub] = useState('');
  const [showInsight, setShowInsight] = useState(true);
  const [showMerch, setShowMerch] = useState(true);

  useEffect(() => {
    async function loadInsight() {
      try {
        const counts = await statsProvider.getJobCounts();
        if (counts) {
          const total = counts.total_open ?? 0;
          const newToday = counts.new_today ?? 0;
          const companies = counts.total_companies ?? 0;
          if (total > 0) {
            setInsightTitle(`${total.toLocaleString()} active jobs across ${companies.toLocaleString()} companies`);
            setInsightSub(newToday > 0 ? `${newToday} new today` : 'Updated daily from direct career pages');
          } else {
            setInsightTitle('Market data loading\u2026');
            setInsightSub('Stats will appear once your search runs');
          }
        }
      } catch {
        setInsightTitle('Market data temporarily unavailable');
        setInsightSub('');
      }
    }
    loadInsight();
  }, [statsProvider, searchQuery]);

  if (!showInsight && !showMerch) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
      {showInsight && (
        <div className="flex items-start gap-3 p-[14px_16px] rounded-[10px] border border-border bg-bg-card hover:border-border-hover transition-colors">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg"
               style={{ background: 'rgba(34,197,94,0.08)' }}>
            💰
          </div>
          <div className="flex-1 min-w-0">
            <span className="inline-block text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm mb-0.5"
                  style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--green)' }}>
              Your Market
            </span>
            <div className="text-xs font-semibold text-text leading-snug">{insightTitle}</div>
            {insightSub && <div className="text-[11px] text-text-dim mt-0.5">{insightSub}</div>}
          </div>
          <button onClick={() => setShowInsight(false)}
            className="p-0.5 text-text-faint hover:text-text-dim transition-colors flex-shrink-0" aria-label="Dismiss">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {showMerch && (
        <div className="flex items-start gap-3 p-[14px_16px] rounded-[10px] border border-border bg-bg-card hover:border-border-hover transition-colors">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg bg-accent-dim">
            ⚡
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
