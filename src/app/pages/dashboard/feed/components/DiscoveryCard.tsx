// ============================================================
// DiscoveryCard — Left slot feature discovery card
// Spec: POD2_HANDOFF_DiscoveryCards — DC-02, DC-03, DC-04, DC-08, DC-09
// ============================================================
// Replaces the "Your Market" duplicate card.
// Matches existing Pro Tip card anatomy exactly.
// ============================================================

import { useEffect } from 'react';
import { X, Filter, FileText, Zap, Mail, Bot, Eye, GraduationCap, BadgeX, Users, DollarSign, Linkedin, ShieldAlert, PartyPopper } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDiscovery, type DiscoveryCardDef } from '@app/hooks/useDiscovery';

// Map feature keys to Lucide icons
function CardIcon({ cardId }: { cardId: string }) {
  const iconClass = 'w-4 h-4';
  const map: Record<string, React.ReactNode> = {
    'dc-01': <Filter className={iconClass} />,
    'dc-02': <FileText className={iconClass} />,
    'dc-03': <FileText className={iconClass} />,
    'dc-04': <BadgeX className={iconClass} />,
    'dc-05': <DollarSign className={iconClass} />,
    'dc-06': <Bot className={iconClass} />,
    'dc-07': <Mail className={iconClass} />,
    'dc-08': <Eye className={iconClass} />,
    'dc-09': <ShieldAlert className={iconClass} />,
    'dc-10': <Users className={iconClass} />,
    'dc-11': <GraduationCap className={iconClass} />,
    'dc-12': <Linkedin className={iconClass} />,
  };
  return <>{map[cardId] ?? <Zap className={iconClass} />}</>;
}

export function DiscoveryCard() {
  const navigate = useNavigate();
  const { activeCard, dismiss, dismissComplete, trackShown, trackClicked } = useDiscovery();

  // Track shown event once per card render
  useEffect(() => {
    if (activeCard && activeCard !== 'complete' && activeCard !== 'complete-dismissed') {
      trackShown(activeCard as DiscoveryCardDef);
    }
  }, [activeCard, trackShown]);

  if (activeCard === null || activeCard === 'complete-dismissed') return null;

  // Completion card
  if (activeCard === 'complete') {
    return (
      <div className="flex items-start gap-3 p-[14px_16px] rounded-[10px] border border-border bg-bg-card hover:border-border-hover transition-colors">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[var(--green)]"
             style={{ background: 'rgba(52,211,153,0.1)' }}>
          <PartyPopper className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="inline-block text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm mb-0.5 bg-[rgba(52,211,153,0.1)] text-[var(--green)]">
            COMPLETE
          </span>
          <div className="text-xs font-semibold text-text leading-snug">You've explored all the key features</div>
          <div className="text-[11px] text-text-dim mt-0.5">Nice work. You're getting the most out of Brilliant Jobs.</div>
        </div>
        <button onClick={dismissComplete}
          className="p-0.5 text-text-faint hover:text-text-dim transition-colors flex-shrink-0" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const card = activeCard as DiscoveryCardDef;

  return (
    <div className="flex items-start gap-3 p-[14px_16px] rounded-[10px] border border-border bg-bg-card hover:border-border-hover transition-colors">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: card.iconColor }}>
        <span className={card.badgeText}><CardIcon cardId={card.id} /></span>
      </div>
      <div className="flex-1 min-w-0">
        <span className={`inline-block text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-sm mb-0.5 ${card.badgeColor} ${card.badgeText}`}>
          {card.badge}
        </span>
        <div className="text-xs font-semibold text-text leading-snug">{card.headline}</div>
        <div className="text-[11px] text-text-dim mt-0.5">{card.description}</div>
        <button
          onClick={() => { trackClicked(card); navigate(card.actionHref); }}
          className="text-[10px] font-semibold text-accent mt-1 inline-block hover:underline"
        >
          {card.actionLabel}
        </button>
      </div>
      <button onClick={() => dismiss(card.id)}
        className="p-0.5 text-text-faint hover:text-text-dim transition-colors flex-shrink-0" aria-label="Dismiss">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default DiscoveryCard;
