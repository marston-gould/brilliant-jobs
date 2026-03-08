// ============================================================
// FeedHero — Feed Stats Banner (SA-014)
// ============================================================
// Displays aggregate feed statistics in a hero-style card.
// Design tokens only — zero inline styles.
// ============================================================

import type { FeedStats } from '../hooks/useFeedSearch';

interface FeedHeroProps {
  stats: FeedStats;
  onPipelineClick?: () => void;
}

const statItems: Array<{
  key: keyof FeedStats;
  label: string;
  accent?: boolean;
  clickable?: boolean;
}> = [
  { key: 'total', label: 'Total Jobs' },
  { key: 'companies', label: 'Companies' },
  { key: 'newToday', label: 'New Today', accent: true },
  { key: 'pipeline', label: 'Pipeline', clickable: true },
];

export function FeedHero({ stats, onPipelineClick }: FeedHeroProps) {
  return (
    <div className="rounded-xl bg-gradient-to-br from-bg-card to-bg-input border border-border p-5 mb-3">
      <div className="text-lg font-extrabold mb-1 text-text">
        Your market.{' '}
        <span className="text-amber-400">Your numbers.</span>
      </div>
      <p className="text-xs text-text-faint leading-relaxed max-w-md mb-4">
        Every job below comes direct from company career pages — not recycled
        posts, not ghost listings. Scored against your resume and filtered by
        your rules.
      </p>
      <div className="flex gap-6 flex-wrap">
        {statItems.map(({ key, label, accent, clickable }) => {
          const value = stats[key];
          const isClickable = clickable && onPipelineClick;

          return (
            <div
              key={key}
              className={`flex flex-col items-center min-w-[64px] ${
                isClickable ? 'cursor-pointer group' : ''
              }`}
              onClick={isClickable ? onPipelineClick : undefined}
              title={isClickable ? 'View in Pipeline' : undefined}
            >
              <span
                className={`text-2xl font-bold tabular-nums ${
                  accent
                    ? 'text-accent'
                    : key === 'pipeline'
                      ? 'text-green-400 group-hover:text-green-300'
                      : 'text-text'
                }`}
              >
                {value.toLocaleString()}
              </span>
              <span className="text-xs text-text-faint mt-0.5">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FeedHero;
