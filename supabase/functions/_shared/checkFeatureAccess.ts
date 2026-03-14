// supabase/functions/_shared/checkFeatureAccess.ts
// FB-TRIAL-001: Shared 5-branch feature gating utility
// Called by all gated Edge Functions (chat-job-search, resume-score, send-notification,
// auto-apply-submit, handle-sms-reply, stats-query, saved-filters CRUD)
//
// Branch 1: active_pro + active subscription → allowed
// Branch 2: trialing + trial not expired → allowed (with daysRemaining)
// Branch 3: expired_free + sample available → allowed (isSample=true, atomically consumed)
// Branch 4: expired_free + sample consumed → denied (upgrade_required)
// Branch 5: fallback → denied
//
// The sample branch uses fn_check_feature_access() RPC for atomic JSONB consumption.
// For non-sample branches, we query profiles directly to avoid RPC overhead.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Feature keys matching the feature_samples_used JSONB keys
export type GatedFeature =
  | 'chat'
  | 'score'
  | 'sms'
  | 'email'
  | 'apply'
  | 'stats'
  | 'filter'
  | 'boolean';

export interface FeatureAccessResult {
  allowed: boolean;
  isSample?: boolean;
  daysRemaining?: number;
  reason?: 'upgrade_required' | 'user_not_found' | 'trial_expired';
}

/**
 * Check if a user can access a gated feature.
 *
 * Uses the server-side fn_check_feature_access() RPC which handles:
 * - Active Pro check (subscription status)
 * - Trial window check (trial_expires_at)
 * - Free sample check with atomic consumption (JSONB WHERE guard)
 * - Denial with upgrade_required reason
 *
 * @param sb - Supabase client (service role for RPC, or user JWT)
 * @param userId - The user's profile ID
 * @param feature - The gated feature key
 * @returns FeatureAccessResult
 */
export async function checkFeatureAccess(
  sb: SupabaseClient,
  userId: string,
  feature: GatedFeature
): Promise<FeatureAccessResult> {
  try {
    const { data, error } = await sb.rpc('fn_check_feature_access', {
      p_user_id: userId,
      p_feature: feature,
    });

    if (error) {
      console.error('[checkFeatureAccess] RPC error:', error.message);
      // Fail open for RPC errors during migration — log but allow
      // This prevents gating from breaking if migration hasn't been applied
      return { allowed: true };
    }

    // RPC returns JSONB: { allowed, isSample?, daysRemaining?, reason? }
    const result = data as Record<string, unknown>;
    return {
      allowed: result.allowed === true,
      isSample: result.isSample === true ? true : undefined,
      daysRemaining: typeof result.daysRemaining === 'number' ? result.daysRemaining : undefined,
      reason: typeof result.reason === 'string' ? (result.reason as FeatureAccessResult['reason']) : undefined,
    };
  } catch (err) {
    console.error('[checkFeatureAccess] Unexpected error:', (err as Error).message);
    // Fail open on unexpected errors
    return { allowed: true };
  }
}

/**
 * Quick check: is the user an active pro subscriber?
 * Lighter weight than full checkFeatureAccess — no sample logic.
 * Use for features that don't need the sample mechanic (e.g., referral link generation).
 */
export async function isActivePro(
  sb: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data } = await sb
      .from('profiles')
      .select('user_state')
      .eq('id', userId)
      .single();

    return data?.user_state === 'active_pro';
  } catch {
    return false;
  }
}

/**
 * Get the user's trial state for banner display.
 * Returns null if not trialing.
 */
export async function getTrialState(
  sb: SupabaseClient,
  userId: string
): Promise<{ daysRemaining: number; expiresAt: string } | null> {
  try {
    const { data } = await sb
      .from('profiles')
      .select('user_state, trial_expires_at')
      .eq('id', userId)
      .single();

    if (!data || data.user_state !== 'trialing' || !data.trial_expires_at) {
      return null;
    }

    const expiresAt = new Date(data.trial_expires_at);
    const now = new Date();
    const daysRemaining = Math.max(0, (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      daysRemaining,
      expiresAt: data.trial_expires_at,
    };
  } catch {
    return null;
  }
}

/**
 * Get the user's remaining sample availability.
 * Returns an object with feature keys and boolean (true = available, false = consumed).
 */
export async function getSampleAvailability(
  sb: SupabaseClient,
  userId: string
): Promise<Record<GatedFeature, boolean>> {
  const ALL_FEATURES: GatedFeature[] = ['chat', 'score', 'sms', 'email', 'apply', 'stats', 'filter', 'boolean'];

  try {
    const { data } = await sb
      .from('profiles')
      .select('user_state, feature_samples_used')
      .eq('id', userId)
      .single();

    if (!data || data.user_state !== 'expired_free') {
      // Not in expired state — samples not relevant
      const result: Record<string, boolean> = {};
      ALL_FEATURES.forEach(f => { result[f] = false; });
      return result as Record<GatedFeature, boolean>;
    }

    const used = (data.feature_samples_used || {}) as Record<string, boolean>;
    const result: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => {
      result[f] = !used[f]; // true = available (not yet consumed)
    });
    return result as Record<GatedFeature, boolean>;
  } catch {
    const result: Record<string, boolean> = {};
    ALL_FEATURES.forEach(f => { result[f] = false; });
    return result as Record<GatedFeature, boolean>;
  }
}

/**
 * Build a 403 response for denied feature access.
 * Standardized across all gated Edge Functions.
 */
export function buildDeniedResponse(result: FeatureAccessResult): Response {
  return new Response(
    JSON.stringify({
      error: 'upgrade_required',
      reason: result.reason || 'upgrade_required',
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Build headers indicating a sample was consumed.
 * Client reads X-Is-Sample to show post-sample conversion modal.
 */
export function buildSampleHeaders(): Record<string, string> {
  return { 'X-Is-Sample': 'true' };
}
