// ============================================================
// FeedHero — Feed Stats Banner (SA-014 → Legacy Parity)
// ============================================================
// Matches legacy dashboard.html .feed-hero exactly:
//   bg: #1b3e6f (navy), white text, 14px radius, 24px 28px pad
//   Stats: frosted glass cards (white 7% bg, white 8% border)
//   Values: mono font, 20px/700, -.5px letter-spacing
//   Labels: 9px, white 55%, uppercase, .3px tracking
//   New Today: green (#22c55e), Pipeline: blue (accent), clickable
// ============================================================

import type { FeedStats } from '../hooks/useFeedSearch';

interface FeedHeroProps {
  stats: FeedStats;
  onPipelineClick?: () => void;
}

const statItems: Array<{
  key: keyof FeedStats;
  label: string;
  colorClass?: string;
  clickable?: boolean;
}> = [
  { key: 'total', label: 'Total Jobs' },
  { key: 'companies', label: 'Companies' },
  { key: 'newToday', label: 'New Today', colorClass: 'text-green' },
  { key: 'pipeline', label: 'Pipeline', colorClass: 'text-accent', clickable: true },
];

export function FeedHero({ stats, onPipelineClick }: FeedHeroProps) {
  return (
    <div className="rounded-[14px] p-[24px_28px] mb-4 hero-gradient"
         style={{ background: '#1b3e6f', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '4px' }}>
        Your market.{' '}
        <span className="text-warm">Your numbers.</span>
      </div>
      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, maxWidth: '480px' }}>
        Every job below comes direct from company career pages &mdash; not recycled
        posts, not ghost listings. Scored against your resume and filtered by
        your rules.
      </div>
      <div className="flex gap-2 flex-wrap mt-3.5">
        {statItems.map(({ key, label, colorClass, clickable }) => {
          const value = stats[key] ?? 0;
          const isClickable = clickable && onPipelineClick;

          return (
            <div
              key={key}
              className={`text-center flex-1 min-w-0 rounded-lg ${isClickable ? 'cursor-pointer' : ''}`}
              style={{
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              onClick={isClickable ? onPipelineClick : undefined}
              title={isClickable ? 'View in Pipeline' : undefined}
            >
              <div className={`font-mono font-bold leading-none whitespace-nowrap ${colorClass || ''}`}
                   style={{ fontSize: '20px', letterSpacing: '-0.5px' }}>
                {value.toLocaleString()}
              </div>
              <div style={{
                fontSize: '9px',
                color: 'rgba(255,255,255,0.55)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                marginTop: '4px',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}>
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FeedHero;
