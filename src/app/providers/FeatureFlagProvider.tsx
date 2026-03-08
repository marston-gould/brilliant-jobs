// src/app/providers/FeatureFlagProvider.tsx
// SA-025: Feature Flags + Experimentation — React Context Provider
// Bootstraps all active flags on mount via evaluate_all RPC.
// Polls for flag updates every 60 seconds (flags change infrequently).
// Integrates with PostHog for experiment tracking.
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FlagEvaluation {
  enabled: boolean;
  variant: string | null;
  bucket: number;
  reason: string;
}

export type FlagMap = Record<string, FlagEvaluation>;

interface FeatureFlagContextValue {
  flags: FlagMap;
  isLoading: boolean;
  error: string | null;
  /** Force a re-fetch of all flags (call after user plan change, etc.) */
  refresh: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

export const FeatureFlagContext = createContext<FeatureFlagContextValue | null>(null);

// ── PostHog Integration ───────────────────────────────────────────────────────

/**
 * Report experiment exposure to PostHog.
 * PostHog uses $feature_flag_called events to count experiment exposures.
 * Scar S-07: when PostHog Remote Flags are enabled, replace local evaluation
 * with posthog.getAllFlags() and retire the Supabase evaluation layer.
 * with posthog.isFeatureEnabled() and retire the Supabase evaluation layer.
 */
function reportFlagToPostHog(flagKey: string, variant: string | boolean): void {
  try {
    const posthog = (window as Record<string, unknown>).posthog as
      | { capture: (event: string, props: Record<string, unknown>) => void }
      | undefined;

    if (!posthog?.capture) return;

    posthog.capture("$feature_flag_called", {
      $feature_flag: flagKey,
      $feature_flag_response: variant,
    });
  } catch {
    // Never block render on PostHog errors
  }
}

// ── Provider ──────────────────────────────────────────────────────────────────

interface FeatureFlagProviderProps {
  children: ReactNode;
  /** User ID for personalized evaluation (pass null for anonymous) */
  userId?: string | null;
  /** Poll interval in ms (default: 60000 = 1 minute) */
  pollIntervalMs?: number;
}

export function FeatureFlagProvider({
  children,
  userId,
  pollIntervalMs = 60_000,
}: FeatureFlagProviderProps): JSX.Element {
  const [flags, setFlags] = useState<FlagMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const lastFlagsRef = useRef<FlagMap>({});

  const fetchFlags = async (): Promise<void> => {
    try {
      // Bridge pattern: call via API gateway (SA-005 pattern)
      // Falls back to window.BJ supabase client if gateway unavailable
      const supabase = (window as Record<string, unknown>).BJ as
        | { supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } }
        | undefined;

      if (!supabase?.supabase) return;

      const { data, error: rpcError } = await supabase.supabase.rpc(
        "fn_evaluate_all_flags",
        { p_user_id: userId ?? null, p_attributes: {} }
      );

      if (rpcError) throw new Error(String(rpcError));
      if (!mountedRef.current) return;

      const newFlags = (data ?? {}) as FlagMap;
      setFlags(newFlags);
      setError(null);

      // Report newly-enabled flags to PostHog (only on change)
      for (const [key, evaluation] of Object.entries(newFlags)) {
        const previous = lastFlagsRef.current[key];
        const wasEnabled = previous?.enabled;
        if (evaluation.enabled && !wasEnabled) {
          reportFlagToPostHog(key, evaluation.variant ?? true);
        }
      }

      lastFlagsRef.current = newFlags;
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : "Flag fetch failed");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const refresh = (): void => {
    setIsLoading(true);
    fetchFlags();
  };

  useEffect(() => {
    mountedRef.current = true;
    fetchFlags();

    // Poll for flag updates (flags are cached, changes propagate within 1 minute)
    intervalRef.current = setInterval(fetchFlags, pollIntervalMs);

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [userId]);

  return (
    <FeatureFlagContext.Provider value={{ flags, isLoading, error, refresh }}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

// ── Convenience export ────────────────────────────────────────────────────────

export function useFeatureFlagContext(): FeatureFlagContextValue {
  const ctx = useContext(FeatureFlagContext);
  if (!ctx) throw new Error("useFeatureFlagContext must be used inside FeatureFlagProvider");
  return ctx;
}
