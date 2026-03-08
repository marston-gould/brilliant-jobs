// ============================================================
// Brilliant Jobs — Core Type Definitions
// CS-P1-015: TypeScript Migration Phase 1
// ============================================================
// These types cover the 7 core modules (globals, api, sync,
// version, fingerprint, tier-gating, lazy-loader) and declare
// external libraries + window globals for type safety.
// ============================================================

// ── Supabase Client (external CDN library) ──────────────────

/** Supabase query result */
interface SupabaseResponse<T> {
  data: T | null;
  error: SupabaseError | null;
  count?: number | null;
  status: number;
  statusText: string;
}

interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
  phone?: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  aud: string;
  created_at: string;
  confirmed_at?: string;
  role?: string;
}

interface SupabaseAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: SupabaseAuthUser;
}

interface SupabaseAuthResponse {
  data: {
    user: SupabaseAuthUser | null;
    session: SupabaseAuthSession | null;
  };
  error: SupabaseError | null;
}

interface SupabaseQueryBuilder {
  select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated' }): SupabaseQueryBuilder;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): SupabaseQueryBuilder;
  update(values: Record<string, unknown>): SupabaseQueryBuilder;
  upsert(values: Record<string, unknown> | Record<string, unknown>[]): SupabaseQueryBuilder;
  delete(): SupabaseQueryBuilder;
  eq(column: string, value: unknown): SupabaseQueryBuilder;
  neq(column: string, value: unknown): SupabaseQueryBuilder;
  gt(column: string, value: unknown): SupabaseQueryBuilder;
  gte(column: string, value: unknown): SupabaseQueryBuilder;
  lt(column: string, value: unknown): SupabaseQueryBuilder;
  lte(column: string, value: unknown): SupabaseQueryBuilder;
  like(column: string, pattern: string): SupabaseQueryBuilder;
  ilike(column: string, pattern: string): SupabaseQueryBuilder;
  is(column: string, value: null | boolean): SupabaseQueryBuilder;
  in(column: string, values: unknown[]): SupabaseQueryBuilder;
  contains(column: string, value: unknown): SupabaseQueryBuilder;
  order(column: string, options?: { ascending?: boolean }): SupabaseQueryBuilder;
  limit(count: number): SupabaseQueryBuilder;
  range(from: number, to: number): SupabaseQueryBuilder;
  single(): PromiseLike<SupabaseResponse<Record<string, unknown>>>;
  maybeSingle(): PromiseLike<SupabaseResponse<Record<string, unknown> | null>>;
  then<TResult1 = SupabaseResponse<Record<string, unknown>[]>>(
    onfulfilled?: ((value: SupabaseResponse<Record<string, unknown>[]>) => TResult1 | PromiseLike<TResult1>) | null
  ): Promise<TResult1>;
}

interface SupabaseRpcResult {
  data: unknown;
  error: SupabaseError | null;
}

interface SupabaseAuth {
  getUser(): Promise<{ data: { user: SupabaseAuthUser | null }; error: SupabaseError | null }>;
  getSession(): Promise<{ data: { session: SupabaseAuthSession | null }; error: SupabaseError | null }>;
  signOut(): Promise<{ error: SupabaseError | null }>;
  onAuthStateChange(callback: (event: string, session: SupabaseAuthSession | null) => void): {
    data: { subscription: { unsubscribe: () => void } };
  };
}

interface SupabaseClient {
  from(table: string): SupabaseQueryBuilder;
  rpc(fn: string, params?: Record<string, unknown>): PromiseLike<SupabaseRpcResult>;
  auth: SupabaseAuth;
}

/** External supabase CDN library */
declare const supabase: {
  createClient(url: string, key: string, options?: Record<string, unknown>): SupabaseClient;
};

// ── PostHog (external CDN library) ──────────────────────────

interface PostHogInstance {
  identify(distinctId: string, properties?: Record<string, unknown>): void;
  capture(eventName: string, properties?: Record<string, unknown>): void;
  reset(): void;
  isFeatureEnabled(key: string): boolean;
  getFeatureFlag(key: string): string | boolean | undefined;
  onFeatureFlags(callback: () => void): void;
  people: {
    set(properties: Record<string, unknown>): void;
  };
}

declare const posthog: PostHogInstance | undefined;

// ── DOMPurify (external CDN library) ────────────────────────

declare const DOMPurify: {
  sanitize(dirty: string, config?: Record<string, unknown>): string;
};

// ── Core Data Types ─────────────────────────────────────────

/** Job record from ats_jobs table */
interface SupabaseJob {
  id: string;
  title: string;
  company_name?: string | null;
  company_slug?: string | null;
  location?: string | null;
  remote_type?: 'remote' | 'hybrid' | 'onsite' | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_text?: string | null;
  description?: string | null;
  url?: string | null;
  source?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  is_active?: boolean;
  enriched?: boolean;
  enrichment_data?: Record<string, unknown> | null;
  industry?: string | null;
  level?: string | null;
  score?: number | null;
  applied?: boolean;
  saved?: boolean;
  hidden?: boolean;
}

/** User profile from profiles table */
interface UserProfile {
  id: string;
  email?: string | null;
  full_name?: string | null;
  plan?: 'free' | 'starter' | 'pro';
  user_data?: UserData | null;
  created_at?: string;
  updated_at?: string;
}

/** User data JSON blob stored in profiles.user_data */
interface UserData {
  saved_filters?: SavedFilter[];
  resumes?: ResumeRecord[];
  pipeline_meta?: Record<string, unknown>;
  tuning?: TuningSettings;
  saved_jobs?: string[];
  applied_jobs?: string[];
  applied_dates?: Record<string, string>;
  hidden_jobs?: string[];
  app_queue?: string[];
  app_history?: string[];
  readiness?: Record<string, unknown>;
}

interface SavedFilter {
  _id?: string;
  name?: string;
  [key: string]: unknown;
}

interface ResumeRecord {
  id?: string;
  name?: string;
  content?: string;
  created_at?: string;
  [key: string]: unknown;
}

interface TuningSettings {
  locationExcludes?: string[];
  titleExcludes?: string[];
  companyExcludes?: string[];
  industryExcludes?: string[];
  levelHierarchy?: string[];
  [key: string]: unknown;
}

// ── API Response Wrappers ───────────────────────────────────

/** Generic API response wrapper */
interface APIResponse<T> {
  data: T | null;
  error: string | null;
  cached?: boolean;
}

/** Paginated response with count */
interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

// ── Search Types ────────────────────────────────────────────

interface SearchParams {
  query?: string;
  location?: string;
  radius?: number;
  remote?: boolean;
  salary_min?: number;
  salary_max?: number;
  level?: string[];
  industry?: string[];
  company?: string[];
  source?: string[];
  sort_field?: string;
  sort_asc?: boolean;
  page?: number;
  per_page?: number;
}

interface SearchResults {
  jobs: SupabaseJob[];
  total: number;
  page: number;
  facets?: Record<string, Array<{ value: string; count: number }>>;
}

// ── Tier Gating Types ───────────────────────────────────────

type TierName = 'free' | 'starter' | 'pro';

type TierGateValue = boolean | number | string | typeof Infinity;

interface TierGateConfig {
  free: TierGateValue;
  starter: TierGateValue;
  pro: TierGateValue;
}

type TierFeature =
  | 'archive_storage'
  | 'archive_retention'
  | 'max_resumes'
  | 'max_versions'
  | 'score_sparkline'
  | 'level_fit'
  | 'pipeline_stats'
  | 'job_log'
  | 'ai_scoring';

// ── Toast Types ─────────────────────────────────────────────

type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastOptions {
  type?: ToastType;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
}

// ── Safe Query Types ────────────────────────────────────────

interface SafeQueryOptions {
  retries?: number;
  delay?: number;
  label?: string;
  silent?: boolean;
  fallback?: unknown;
}

// ── Cache Types ─────────────────────────────────────────────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  count?: number;
}

interface CacheOptions {
  ttl?: number;
  tier?: string;
  countKey?: string;
}

interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  hitRate: string;
  entries: Array<{
    key: string;
    age: number;
    ttl: number;
    expired: boolean;
  }>;
}

// ── Lazy Loader Types ───────────────────────────────────────

type ChunkName = 'shell' | 'feed' | 'keywords' | 'pipeline' | 'tuning' | 'deferred';

type TabName =
  | 'brilliant'
  | 'jobs'
  | 'resumes'
  | 'pipeline'
  | 'tuning'
  | 'stats'
  | 'feedback'
  | 'ghost'
  | 'referrals'
  | 'applications'
  | 'settings'
  | 'billing'
  | 'rewrite'
  | 'apply'
  | 'chat'
  | 'merch'
  | 'surveys';

// ── Fingerprint Types ───────────────────────────────────────

interface BJFingerprint {
  generate: () => string;
  components: () => string[];
}

// ── BJ Namespace ────────────────────────────────────────────

interface BJRegistry {
  [name: string]: {
    module: string;
    registered: number;
  };
}

interface BJNamespace {
  _registry: BJRegistry;
  export: (name: string, fn: Function, module?: string) => void;

  // Tier gating
  canAccessFeature?: (feature: TierFeature) => TierGateValue;
  getUserTier?: () => TierName;
  requiredTierFor?: (feature: TierFeature) => TierName;
  showTierGate?: (el: HTMLElement, minTier: TierName, message?: string) => void;
  removeTierGate?: (el: HTMLElement) => void;

  // Lazy loader
  bjLoadChunk?: (chunkName: ChunkName) => Promise<void>;
  bjEnsureTab?: (tabName: TabName) => Promise<void>;
  bjPreloadChunks?: (chunkNames: ChunkName[]) => void;

  // Sync
  syncHealthCheck?: () => Promise<void>;

  // Dynamic — other modules register via BJ.export()
  [key: string]: unknown;
}

// ── Window Augmentation ─────────────────────────────────────

interface Window {
  BJ: BJNamespace;
  bjSupabase: SupabaseClient;
  _bjSupa: SupabaseClient;
  POSTHOG_API_KEY: string;
  bjFingerprint: BJFingerprint;

  // Toast system
  showToast: (message: string, opts?: ToastOptions) => HTMLElement;

  // Tier gating
  showTierGate: (el: HTMLElement, minTier: TierName, message?: string) => void;
  removeTierGate: (el: HTMLElement) => void;
  canAccessFeature: (feature: TierFeature) => TierGateValue;
  getUserTier: () => TierName;
  requiredTierFor: (feature: TierFeature) => TierName;

  // Lazy loader
  bjLoadChunk: (chunkName: ChunkName) => Promise<void>;
  bjEnsureTab: (tabName: TabName) => Promise<void>;
  bjPreloadChunks: (chunkNames: ChunkName[]) => void;

  // Sync
  syncHealthCheck: () => Promise<void>;

  // Safe utilities
  _safeReadLS: <T>(key: string, fallback: T) => T;

  // Session
  currentUser: SupabaseAuthUser | null;

  // Allow other string keys
  [key: string]: unknown;
}

// ── API Module Type ─────────────────────────────────────────

interface ApiRegistry {
  [key: string]: Function;
}

// ── Ambient Declarations: Non-Migrated JS Modules ───────────
// These declare variables/functions from .js files that haven't
// been migrated to TypeScript yet. Remove these as files migrate.

// From app.js, theme.js, tab-guard.js (not yet migrated)
declare function showPage(page: string): void;

// From other dashboard modules (not yet migrated)
declare var renderSavedFilters: (() => void) | undefined;
declare var renderResumes: (() => void) | undefined;
declare var loadResumeMetrics: (() => Promise<void>) | undefined;

// Billing module variable (not yet migrated)
declare var _userPricing: { tier: TierName; [key: string]: unknown } | undefined;


// ── Ambient Declarations: globals.ts (ts-nocheck phase) ─────
// globals.ts has @ts-nocheck for incremental migration. These
// declarations make its exports visible to other .ts files.
// Remove when globals.ts @ts-nocheck is removed.

declare var sb: SupabaseClient;
declare var currentUser: SupabaseAuthUser | null;
declare var BJ_VERSION: string;
declare function reportError(label: string, error: unknown, extra?: Record<string, unknown>): void;
declare function safeReadLS<T>(key: string, fallback: T): T;
declare var savedFilters: SavedFilter[];
declare var tuningSettings: TuningSettings;
declare var tuningLocExclPills: string[];
declare var tuningTitleExclPills: string[];
declare var tuningCoExclPills: string[];
declare var tuningIndExclPills: string[];
declare var levelHierarchy: string[];
