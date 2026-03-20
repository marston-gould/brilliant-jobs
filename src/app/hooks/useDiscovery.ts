// ============================================================
// useDiscovery — Feature Discovery Card Hook
// Spec: POD2_HANDOFF_DiscoveryCards
// ============================================================
// - Fetches user_feature_usage once on mount, caches in module scope
// - Exposes recordFeatureUsage(key) — upserts + fires PostHog
// - Returns the highest-priority untried discovery card
// - Dismiss via sessionStorage (not marking feature used)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase, getUser } from '@lib/supabase';

// ── Types ────────────────────────────────────────────────────

export type FeatureKey =
  | 'exclusion_filter_set'
  | 'resume_tailored'
  | 'resume_scored'
  | 'cover_letter_generated'
  | 'auto_apply_configured'
  | 'ghost_badge_viewed'
  | 'interview_practice_started'
  | 'not_filter_set'
  | 'linkedin_connected'
  | 'salary_filter_used'
  | 'linkedin_optimizer_used'
  | 'staffing_flag_viewed';

export interface DiscoveryCardDef {
  id: string;          // e.g. 'dc-01'
  priority: number;    // 1–12
  featureKey: FeatureKey;
  badge: string;
  badgeColor: string;  // Tailwind bg class
  badgeText: string;   // Tailwind text class
  iconColor: string;   // rgba background for icon circle
  headline: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}

// ── Card definitions — priority order per spec §5.2 ──────────

export const DISCOVERY_CARDS: DiscoveryCardDef[] = [
  {
    id: 'dc-01', priority: 1, featureKey: 'exclusion_filter_set',
    badge: 'FILTERS', badgeColor: 'bg-[rgba(99,102,241,0.12)]', badgeText: 'text-[#818cf8]',
    iconColor: 'rgba(99,102,241,0.1)',
    headline: 'Block companies you never want to see',
    description: 'Set company, industry, and title exclusions across all your filters in one place.',
    actionLabel: 'Open Tuning →', actionHref: '/app/tuning',
  },
  {
    id: 'dc-02', priority: 2, featureKey: 'resume_scored',
    badge: 'AI RESUME', badgeColor: 'bg-[rgba(59,130,246,0.12)]', badgeText: 'text-[#60a5fa]',
    iconColor: 'rgba(59,130,246,0.1)',
    headline: 'Score your resume against these jobs',
    description: 'See how well your resume matches before you apply.',
    actionLabel: 'Score my resume →', actionHref: '/app/resumes',
  },
  {
    id: 'dc-03', priority: 3, featureKey: 'resume_tailored',
    badge: 'AI RESUME', badgeColor: 'bg-[rgba(59,130,246,0.12)]', badgeText: 'text-[#60a5fa]',
    iconColor: 'rgba(59,130,246,0.1)',
    headline: 'Tailor your resume for this job in one click',
    description: 'AI rewrites your bullet points to match each job description.',
    actionLabel: 'Try on a job →', actionHref: '/app/feed',
  },
  {
    id: 'dc-04', priority: 4, featureKey: 'not_filter_set',
    badge: 'FILTERS', badgeColor: 'bg-[rgba(99,102,241,0.12)]', badgeText: 'text-[#818cf8]',
    iconColor: 'rgba(99,102,241,0.1)',
    headline: 'Exclude title keywords like "associate"',
    description: 'Add NOT pills to any filter to block unwanted titles from your results.',
    actionLabel: 'Edit filters →', actionHref: '/app/feed',
  },
  {
    id: 'dc-05', priority: 5, featureKey: 'salary_filter_used',
    badge: 'SALARY', badgeColor: 'bg-[rgba(34,197,94,0.1)]', badgeText: 'text-[#4ade80]',
    iconColor: 'rgba(34,197,94,0.08)',
    headline: 'Filter by real salary data, not estimates',
    description: 'Set a salary minimum to only see jobs that are worth your time.',
    actionLabel: 'Set salary filter →', actionHref: '/app/feed',
  },
  {
    id: 'dc-06', priority: 6, featureKey: 'auto_apply_configured',
    badge: 'AUTOMATION', badgeColor: 'bg-[rgba(245,158,11,0.1)]', badgeText: 'text-[#fbbf24]',
    iconColor: 'rgba(245,158,11,0.08)',
    headline: 'Auto-apply to jobs while you sleep',
    description: 'Set your criteria once. Brilliant Jobs submits applications automatically.',
    actionLabel: 'Configure auto-apply →', actionHref: '/app/applications',
  },
  {
    id: 'dc-07', priority: 7, featureKey: 'cover_letter_generated',
    badge: 'AI WRITING', badgeColor: 'bg-[rgba(167,139,250,0.12)]', badgeText: 'text-[#c4b5fd]',
    iconColor: 'rgba(167,139,250,0.1)',
    headline: 'Generate a cover letter matched to each role',
    description: 'One click creates a tailored cover letter using your resume and the job description.',
    actionLabel: 'Try on a job →', actionHref: '/app/feed',
  },
  {
    id: 'dc-08', priority: 8, featureKey: 'ghost_badge_viewed',
    badge: 'TRUST', badgeColor: 'bg-[rgba(248,113,113,0.1)]', badgeText: 'text-[#f87171]',
    iconColor: 'rgba(248,113,113,0.08)',
    headline: 'Check ghost badges before you apply',
    description: 'Every job shows a ghost score — how often this company ignores applicants.',
    actionLabel: 'See ghost data →', actionHref: '/app/feed',
  },
  {
    id: 'dc-09', priority: 9, featureKey: 'staffing_flag_viewed',
    badge: 'TRANSPARENCY', badgeColor: 'bg-[rgba(156,163,175,0.12)]', badgeText: 'text-[#9ca3af]',
    iconColor: 'rgba(156,163,175,0.08)',
    headline: 'Staffing agencies are flagged',
    description: "Jobs from recruiters and agencies are clearly marked so you know what you're applying to.",
    actionLabel: 'Browse the feed →', actionHref: '/app/feed',
  },
  {
    id: 'dc-10', priority: 10, featureKey: 'linkedin_connected',
    badge: 'NETWORK', badgeColor: 'bg-[rgba(14,165,233,0.1)]', badgeText: 'text-[#38bdf8]',
    iconColor: 'rgba(14,165,233,0.08)',
    headline: 'See who you know at every company',
    description: 'Connect LinkedIn to surface mutual connections on every job card.',
    actionLabel: 'Connect LinkedIn →', actionHref: '/app/settings',
  },
  {
    id: 'dc-11', priority: 11, featureKey: 'interview_practice_started',
    badge: 'INTERVIEW', badgeColor: 'bg-[rgba(52,211,153,0.1)]', badgeText: 'text-[#34d399]',
    iconColor: 'rgba(52,211,153,0.08)',
    headline: 'Practice your interview before the real one',
    description: 'AI runs a mock interview based on the specific role and company.',
    actionLabel: 'Start practicing →', actionHref: '/app/interview-prep',
  },
  {
    id: 'dc-12', priority: 12, featureKey: 'linkedin_optimizer_used',
    badge: 'LINKEDIN', badgeColor: 'bg-[rgba(14,165,233,0.1)]', badgeText: 'text-[#38bdf8]',
    iconColor: 'rgba(14,165,233,0.08)',
    headline: 'Optimize your LinkedIn for target roles',
    description: 'AI rewrites your headline and summary to rank for the jobs you want.',
    actionLabel: 'Optimize profile →', actionHref: '/app/settings',
  },
];

// ── Module-level cache (survives re-renders, cleared on usage) ─

let _usageCache: Set<FeatureKey> | null = null;
let _cachePromise: Promise<Set<FeatureKey>> | null = null;

async function fetchUsageSet(): Promise<Set<FeatureKey>> {
  if (_usageCache !== null) return _usageCache;
  if (_cachePromise) return _cachePromise;

  _cachePromise = (async () => {
    try {
      const user = await getUser();
      if (!user) return new Set<FeatureKey>();
      const { data } = await supabase
        .from('user_feature_usage')
        .select('feature_key')
        .eq('user_id', user.id);
      const set = new Set<FeatureKey>((data || []).map((r: { feature_key: FeatureKey }) => r.feature_key));
      _usageCache = set;
      return set;
    } catch {
      return new Set<FeatureKey>();
    }
  })();

  return _cachePromise;
}

// ── Public API ────────────────────────────────────────────────

export async function recordFeatureUsage(featureKey: FeatureKey): Promise<void> {
  try {
    const user = await getUser();
    if (!user) return;

    const isFirstUse = !_usageCache?.has(featureKey);

    const { error } = await supabase.from('user_feature_usage').upsert(
      { user_id: user.id, feature_key: featureKey, first_used_at: new Date().toISOString(), use_count: 1 },
      { onConflict: 'user_id,feature_key', ignoreDuplicates: false }
    );

    if (!error) {
      // Update cache
      if (!_usageCache) _usageCache = new Set();
      _usageCache.add(featureKey);
      _cachePromise = null;
    }

    // PostHog
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('feature_engaged', { feature_key: featureKey, is_first_use: isFirstUse });
    }
  } catch {
    // Non-fatal — usage tracking should never break the UX
  }
}

// Expose globally for legacy JS modules
if (typeof window !== 'undefined') {
  (window as any).recordFeatureUsage = recordFeatureUsage;
}

// ── Hook ─────────────────────────────────────────────────────

const DISMISS_KEY = 'bj_discovery_dismissed'; // sessionStorage key
const COMPLETE_DISMISS_KEY = 'bj_discovery_complete_dismissed'; // localStorage key

export function useDiscovery() {
  const [usageSet, setUsageSet] = useState<Set<FeatureKey> | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
  });

  useEffect(() => {
    fetchUsageSet().then(set => setUsageSet(new Set(set)));
  }, []);

  const activeCard = usageSet === null ? null : (() => {
    // Check if all done
    const allTried = DISCOVERY_CARDS.every(c => usageSet.has(c.featureKey));
    if (allTried) {
      // Check if completion card dismissed permanently
      try {
        if (localStorage.getItem(COMPLETE_DISMISS_KEY)) return 'complete-dismissed' as const;
      } catch {}
      return 'complete' as const;
    }
    // Find highest-priority untried, not dismissed this session
    const candidate = DISCOVERY_CARDS
      .filter(c => !usageSet.has(c.featureKey))
      .sort((a, b) => a.priority - b.priority)[0];

    if (!candidate) return null;
    if (dismissedThisSession === candidate.id) return null;
    return candidate;
  })();

  const dismiss = useCallback((cardId: string) => {
    try { sessionStorage.setItem(DISMISS_KEY, cardId); } catch {}
    setDismissedThisSession(cardId);
    if (typeof window !== 'undefined' && (window as any).posthog) {
      const card = DISCOVERY_CARDS.find(c => c.id === cardId);
      (window as any).posthog.capture('discovery_card_dismissed', {
        card_id: cardId, feature_key: card?.featureKey,
      });
    }
  }, []);

  const dismissComplete = useCallback(() => {
    try { localStorage.setItem(COMPLETE_DISMISS_KEY, '1'); } catch {}
    setDismissedThisSession('complete');
  }, []);

  const trackShown = useCallback((card: DiscoveryCardDef) => {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('discovery_card_shown', {
        card_id: card.id, feature_key: card.featureKey, priority: card.priority,
      });
    }
  }, []);

  const trackClicked = useCallback((card: DiscoveryCardDef) => {
    if (typeof window !== 'undefined' && (window as any).posthog) {
      (window as any).posthog.capture('discovery_card_clicked', {
        card_id: card.id, feature_key: card.featureKey, destination: card.actionHref,
      });
    }
  }, []);

  return { activeCard, dismiss, dismissComplete, trackShown, trackClicked };
}
