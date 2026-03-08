// src/app/hooks/useFeatureFlag.ts
// SA-025: Feature Flags + Experimentation — React SDK Hook
// Reads from FeatureFlagContext (bootstrapped on app load via evaluate_all RPC).
// Falls back to window.BJ bridge pattern during SPA migration.
// ─────────────────────────────────────────────────────────────────────────────

import { useContext, useCallback } from "react";
import { FeatureFlagContext, type FlagMap } from "../providers/FeatureFlagProvider";

interface UseFlagResult {
  /** Whether this flag is enabled for the current user */
  isEnabled: boolean;
  /** Assigned variant name (null for boolean/percentage flags) */
  variant: string | null;
  /** True while flags are loading on first render */
  isLoading: boolean;
  /** True if the flag key was not found in the flag map */
  isUnknown: boolean;
}

/**
 * useFeatureFlag — read a single feature flag for the current user.
 *
 * @param flagKey  The flag key (e.g. 'new-feed-layout')
 * @param defaultValue  Default enabled state if flag is not found (default: false)
 *
 * @example
 * const { isEnabled, variant } = useFeatureFlag('resume-rewrite-v2');
 * if (isEnabled && variant === 'treatment') { ... }
 */
export function useFeatureFlag(flagKey: string, defaultValue = false): UseFlagResult {
  const ctx = useContext(FeatureFlagContext);

  if (!ctx) {
    // Outside provider: safe default (never throw in production)
    return {
      isEnabled: defaultValue,
      variant: null,
      isLoading: false,
      isUnknown: true,
    };
  }

  const { flags, isLoading } = ctx;
  const flag = flags[flagKey];

  if (!flag) {
    return {
      isEnabled: defaultValue,
      variant: null,
      isLoading,
      isUnknown: true,
    };
  }

  return {
    isEnabled: flag.enabled,
    variant: flag.variant ?? null,
    isLoading,
    isUnknown: false,
  };
}

/**
 * useAllFeatureFlags — read the full flag map.
 * Use sparingly; prefer useFeatureFlag for targeted access.
 */
export function useAllFeatureFlags(): { flags: FlagMap; isLoading: boolean } {
  const ctx = useContext(FeatureFlagContext);
  return ctx ?? { flags: {}, isLoading: false };
}

/**
 * useFeatureFlagVariant — convenience hook for variant experiments.
 * Returns the variant name or null if not in experiment.
 *
 * @example
 * const variant = useFeatureFlagVariant('resume-rewrite-v2');
 * // variant === 'control' | 'treatment' | null
 */
export function useFeatureFlagVariant(flagKey: string): string | null {
  const { isEnabled, variant } = useFeatureFlag(flagKey);
  return isEnabled ? variant : null;
}

export default useFeatureFlag;
