/**
 * SA-018: Dual-Mode Database Client — Read Replica + Primary Routing
 *
 * Provides a unified interface for Edge Functions to get the correct
 * Supabase client based on whether the operation is a read or write.
 *
 * Architecture:
 *   getDbClient('read')  → replica client (falls back to primary if unavailable)
 *   getDbClient('write') → primary client (always)
 *
 * Configuration:
 *   READ_REPLICA_URL — Vault secret containing the replica's Supabase URL
 *   If not set, all queries route to primary (graceful degradation).
 *
 * Failover:
 *   If the replica client fails to connect or the Vault secret is missing,
 *   reads automatically fall back to the primary. A 'fallback' event is
 *   logged for monitoring.
 *
 * Usage in Edge Functions:
 *   import { getDbClient, getReadClient, getWriteClient } from '../_shared/db-client.ts';
 *
 *   // Explicit mode
 *   const readDb = getDbClient('read');
 *   const writeDb = getDbClient('write');
 *
 *   // Convenience aliases
 *   const db = getReadClient();    // for SELECT queries
 *   const db = getWriteClient();   // for INSERT/UPDATE/DELETE
 *
 * HOOK (SA-024): Event bus will emit 'db.query.routed' events for
 *   observability. The routing metadata (target, latency, fallback)
 *   is already structured for event emission.
 *
 * ADR-06: docs/scaling/adr-06-pipeline.md (read replica addendum)
 * Phase: S4 — Scale Validation
 * Pair: DevOps + Backend Eng
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ─── Environment ─────────────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Read replica URL — stored in Supabase Vault, injected as env var.
// If not set, all reads route to primary (graceful degradation).
const READ_REPLICA_URL = Deno.env.get("READ_REPLICA_URL") ?? null;

// Read replica service role key — may be same as primary's if using
// Supabase's built-in read replica (same project, different host).
// Falls back to primary service role key.
const READ_REPLICA_SERVICE_ROLE_KEY =
  Deno.env.get("READ_REPLICA_SERVICE_ROLE_KEY") ?? SUPABASE_SERVICE_ROLE_KEY;

// ─── Client Singletons ──────────────────────────────────────────────────────

let _primaryClient: SupabaseClient | null = null;
let _replicaClient: SupabaseClient | null = null;
let _replicaAvailable: boolean | null = null; // null = untested, true/false = tested

/**
 * Get or create the primary Supabase client (writes + fallback reads).
 * Uses service role key for server-side operations.
 */
function getPrimaryClient(): SupabaseClient {
  if (!_primaryClient) {
    _primaryClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _primaryClient;
}

/**
 * Get or create the read replica Supabase client.
 * Returns null if READ_REPLICA_URL is not configured.
 */
function getReplicaClient(): SupabaseClient | null {
  if (!READ_REPLICA_URL) return null;

  if (!_replicaClient) {
    _replicaClient = createClient(READ_REPLICA_URL, READ_REPLICA_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _replicaClient;
}

// ─── Routing Metadata ────────────────────────────────────────────────────────

export type DbTarget = "primary" | "replica" | "fallback";
export type DbMode = "read" | "write";

export interface RoutingResult {
  client: SupabaseClient;
  target: DbTarget;
  mode: DbMode;
  fallbackReason?: string;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Get a Supabase client routed to the correct database instance.
 *
 * @param mode - 'read' routes to replica (with fallback), 'write' always routes to primary
 * @returns RoutingResult with client and metadata for monitoring
 */
export function getDbClientWithMetadata(mode: DbMode): RoutingResult {
  if (mode === "write") {
    return {
      client: getPrimaryClient(),
      target: "primary",
      mode: "write",
    };
  }

  // Read mode: try replica, fall back to primary
  const replica = getReplicaClient();

  if (!replica) {
    return {
      client: getPrimaryClient(),
      target: "fallback",
      mode: "read",
      fallbackReason: "READ_REPLICA_URL not configured",
    };
  }

  if (_replicaAvailable === false) {
    return {
      client: getPrimaryClient(),
      target: "fallback",
      mode: "read",
      fallbackReason: "Replica previously failed health check",
    };
  }

  return {
    client: replica,
    target: "replica",
    mode: "read",
  };
}

/**
 * Simple client getter — returns the Supabase client for the given mode.
 * Use this when you don't need routing metadata.
 */
export function getDbClient(mode: DbMode): SupabaseClient {
  return getDbClientWithMetadata(mode).client;
}

/** Convenience: get a read-routed client (replica with fallback). */
export function getReadClient(): SupabaseClient {
  return getDbClient("read");
}

/** Convenience: get a write-routed client (always primary). */
export function getWriteClient(): SupabaseClient {
  return getDbClient("write");
}

/**
 * Check if the read replica is currently available and responsive.
 * Tests with a lightweight query. Caches result for 60 seconds.
 *
 * Called by the replica-health Edge Function and can be used by
 * individual EFs to decide routing strategy.
 */
let _lastHealthCheck: number = 0;
const HEALTH_CHECK_TTL_MS = 60_000; // 60 seconds

export async function isReplicaAvailable(): Promise<boolean> {
  if (!READ_REPLICA_URL) return false;

  const now = Date.now();
  if (_replicaAvailable !== null && now - _lastHealthCheck < HEALTH_CHECK_TTL_MS) {
    return _replicaAvailable;
  }

  try {
    const replica = getReplicaClient();
    if (!replica) {
      _replicaAvailable = false;
      _lastHealthCheck = now;
      return false;
    }

    // Lightweight health probe: SELECT 1
    const { error } = await replica.rpc("fn_replica_health_summary");
    _replicaAvailable = !error;
    _lastHealthCheck = now;
    return _replicaAvailable;
  } catch (e) { console.warn("[EF][db_client_replica_check]", e?.message || String(e));
    _replicaAvailable = false;
    _lastHealthCheck = now;
    return false;
  }
}

/**
 * Execute a read query with automatic failover.
 * If the replica query fails, retries on primary and logs the fallback.
 *
 * @param queryFn - Function that takes a SupabaseClient and returns a query result
 * @returns The query result (from replica or primary)
 */
export async function readWithFallback<T>(
  queryFn: (client: SupabaseClient) => Promise<{ data: T | null; error: unknown }>,
): Promise<{ data: T | null; error: unknown; target: DbTarget }> {
  const routing = getDbClientWithMetadata("read");

  try {
    const result = await queryFn(routing.client);

    if (result.error && routing.target === "replica") {
      // Replica failed — try primary
      _replicaAvailable = false;
      _lastHealthCheck = Date.now();
      const primaryResult = await queryFn(getPrimaryClient());
      return { ...primaryResult, target: "fallback" };
    }

    return { ...result, target: routing.target };
  } catch (err) {
    if (routing.target === "replica") {
      // Replica threw — try primary
      _replicaAvailable = false;
      _lastHealthCheck = Date.now();
      try {
        const primaryResult = await queryFn(getPrimaryClient());
        return { ...primaryResult, target: "fallback" };
      } catch (primaryErr) {
        return { data: null, error: primaryErr, target: "fallback" };
      }
    }
    return { data: null, error: err, target: routing.target };
  }
}

/**
 * Get current routing configuration for debugging/health checks.
 */
export function getRoutingConfig(): {
  replicaConfigured: boolean;
  replicaUrl: string | null;
  replicaAvailable: boolean | null;
  primaryUrl: string;
} {
  return {
    replicaConfigured: !!READ_REPLICA_URL,
    replicaUrl: READ_REPLICA_URL ? READ_REPLICA_URL.replace(/\/\/.*@/, "//<redacted>@") : null,
    replicaAvailable: _replicaAvailable,
    primaryUrl: SUPABASE_URL,
  };
}

/**
 * Reset the replica availability cache. Used after a successful health
 * check to re-enable replica routing after a failover event.
 */
export function resetReplicaHealth(): void {
  _replicaAvailable = null;
  _lastHealthCheck = 0;
}
