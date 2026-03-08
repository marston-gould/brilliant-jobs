/**
 * _shared/types.ts — Brilliant Jobs EF Domain Types
 *
 * SA-022: TypeScript strict migration.
 * Centralised type definitions consumed by all Edge Functions.
 * Import with:
 *   import type { JobRow, AgentConfig, ... } from '../_shared/types.ts';
 *
 * Sections:
 *   1. Database row types (mirrors Supabase schema)
 *   2. API request / response shapes
 *   3. Job pipeline types
 *   4. CrewAI agent types
 *   5. Notification / email types
 *   6. Scoring / resume types
 *   7. Referral / billing types
 *   8. Utility / shared primitives
 */

// ═══════════════════════════════════════════════════════════
// 1. DATABASE ROW TYPES
// ═══════════════════════════════════════════════════════════

export interface JobRow {
  id: string;
  greenhouse_id: string;
  ats_source: string;
  company_slug: string;
  company_name: string | null;
  title: string;
  url: string;
  apply_url: string | null;
  location: string | null;
  department: string | null;
  content: string | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_rate: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  tier: 'free' | 'pro' | 'enterprise';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  credits_remaining: number;
  created_at: string;
  updated_at: string;
  last_seen_at: string | null;
  referral_code: string | null;
  referred_by: string | null;
  onboarding_completed: boolean;
  settings: Record<string, unknown>;
}

export interface ResumeRow {
  id: string;
  user_id: string;
  name: string;
  file_url: string | null;
  raw_text: string | null;
  parsed_at: string | null;
  score: number | null;
  readiness: number | null;
  skills_inventory: SkillEntry[];
  raw_stats: ResumeStats | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
}

export interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  ats_source: string | null;
  ats_board_url: string | null;
  logo_url: string | null;
  industry: string | null;
  size_range: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

export interface PipelineRow {
  id: string;
  user_id: string;
  job_id: string;
  stage: PipelineStage;
  added_at: string;
  updated_at: string;
  notes: string | null;
  applied_at: string | null;
  response_at: string | null;
  resume_id: string | null;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  sent_at: string | null;
  created_at: string;
  channel: 'email' | 'sms' | 'push' | 'in_app';
}

export interface ReferralRow {
  id: string;
  referrer_id: string;
  referee_id: string | null;
  invite_code: string;
  status: 'pending' | 'activated' | 'rewarded' | 'expired' | 'fraud';
  fraud_score: number;
  created_at: string;
  activated_at: string | null;
  rewarded_at: string | null;
}

// ═══════════════════════════════════════════════════════════
// 2. API REQUEST / RESPONSE SHAPES
// ═══════════════════════════════════════════════════════════

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  correlation_id?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

export interface GatewayContext {
  correlationId: string;
  userId: string | null;
  userTier: 'free' | 'pro' | 'enterprise' | null;
  userRole: string | null;
  consumer: string | null;
  dbMode: 'read' | 'write';
}

export interface RateLimitConfig {
  requests: number;
  window_seconds: number;
  burst?: number;
}

// ═══════════════════════════════════════════════════════════
// 3. JOB PIPELINE TYPES
// ═══════════════════════════════════════════════════════════

export type PipelineStage =
  | 'bookmarked'
  | 'applied'
  | 'phone_screen'
  | 'interview'
  | 'final_round'
  | 'offer'
  | 'rejected'
  | 'withdrawn'
  | 'archived';

export interface ParsedJob {
  greenhouse_id: string;
  ats_source: string;
  company_slug: string;
  company_name: string;
  title: string;
  url: string;
  apply_url: string;
  location: string | null;
  department: string | null;
  content: string | null;
  loc_city: string | null;
  loc_state: string | null;
  loc_country: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_rate: string | null;
}

export interface AtsBoard {
  slug: string;
  source: string;
  name: string | null;
}

export interface AtsParsedResponse {
  jobs?: GreenhouseJob[];
  offers?: RecruiteeOffer[];
  [key: string]: unknown;
}

export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  content?: string;
  metadata?: Array<{ name?: string; value?: unknown }>;
}

export interface RecruiteeOffer {
  id: string | number;
  title: string;
  careers_url: string;
  location?: string;
  department?: string;
  description?: string;
}

export interface JobMatchResult {
  job_id: string;
  score: number;
  reasons: string[];
  missing_keywords: string[];
}

export interface SearchRequest {
  query?: string;
  filters?: JobFilters;
  page?: number;
  per_page?: number;
  sort?: SortOption[];
}

export interface JobFilters {
  locations?: string[];
  remote?: boolean;
  salary_min?: number;
  salary_max?: number;
  companies?: string[];
  departments?: string[];
  ats_sources?: string[];
  keywords?: string[];
}

export interface SortOption {
  field: string;
  direction: 'asc' | 'desc';
}

// ═══════════════════════════════════════════════════════════
// 4. CREWAI AGENT TYPES
// ═══════════════════════════════════════════════════════════

export type AgentMode = 'observe' | 'suggest' | 'auto' | 'autonomous';

export interface AgentConfig {
  id: string;
  agent_id: string;
  agent_name: string;
  agent_type: string;
  mode: AgentMode;
  executed: boolean;
  cron_schedule: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
  config: Record<string, unknown>;
}

export interface AgentActionLog {
  id: string;
  agent_id: string;
  action_type: string;
  action_data: Record<string, unknown>;
  result: Record<string, unknown> | null;
  executed: boolean;
  created_at: string;
}

export interface AgentCheck {
  name: string;
  status: 'ok' | 'warning' | 'critical';
  value?: number | string;
  threshold?: number | string;
  message?: string;
  recommended_action?: string;
}

export interface AgentRunResult {
  agent: string;
  mode: AgentMode;
  executed: boolean;
  timestamp: string;
  checks: AgentCheck[];
  summary: string;
}

export interface GraduationCriteria {
  min_days: number;
  min_actions: number;
  max_false_positive_rate: number;
  max_error_rate: number;
  max_override_rate?: number;
  requires_marston_approval: boolean;
}

// ═══════════════════════════════════════════════════════════
// 5. NOTIFICATION / EMAIL TYPES
// ═══════════════════════════════════════════════════════════

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  reply_to?: string;
  headers?: Record<string, string>;
}

export interface SmsPayload {
  to: string;
  body: string;
  from?: string;
}

export interface NotificationRequest {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channels: Array<'email' | 'sms' | 'push' | 'in_app'>;
  schedule_at?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  render: (context: Record<string, unknown>) => string;
}

// ═══════════════════════════════════════════════════════════
// 6. SCORING / RESUME TYPES
// ═══════════════════════════════════════════════════════════

export interface ScoreRequest {
  resume_id?: string;
  resume_text?: string;
  job_id?: string;
  job_text?: string;
  user_id: string;
  model?: string;
}

export interface ScoreResult {
  overall_score: number;
  sections: SectionScore[];
  gap_analysis: GapEntry[];
  coaching: CoachingEntry[] | null;
  keywords_matched: string[];
  keywords_missing: string[];
  raw_response: string;
}

export interface SectionScore {
  name: string;
  score: number;
  weight: number;
  feedback: string;
}

export interface GapEntry {
  gap: string;
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
  interview_questions?: string[];
}

export interface CoachingEntry {
  category: string;
  advice: string;
  examples?: string[];
}

export interface SkillEntry {
  skill: string;
  level?: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  years?: number;
}

export interface ResumeStats {
  total_years_experience: number;
  industries: string[];
  roles: string[];
  education_level: string | null;
  certifications: string[];
}

export interface ResumeProfile {
  raw_stats: ResumeStats | null;
  skills_inventory: SkillEntry[];
  summary: string | null;
}

// ═══════════════════════════════════════════════════════════
// 7. REFERRAL / BILLING TYPES
// ═══════════════════════════════════════════════════════════

export interface ReferralEvent {
  type: 'signup' | 'activation' | 'upgrade' | 'fraud_detected';
  referrer_id: string;
  referee_id?: string;
  invite_code: string;
  metadata?: Record<string, unknown>;
}

export interface BillingEvent {
  type: 'checkout.session.completed' | 'customer.subscription.updated' | 'customer.subscription.deleted' | 'invoice.payment_failed';
  stripe_customer_id: string;
  stripe_subscription_id?: string;
  amount?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export interface CreditTransaction {
  user_id: string;
  amount: number;
  type: 'grant' | 'spend' | 'refund' | 'expire';
  reason: string;
  reference_id?: string;
}

// ═══════════════════════════════════════════════════════════
// 8. UTILITY / SHARED PRIMITIVES
// ═══════════════════════════════════════════════════════════

/** Supabase client returned by createClient */
export type SupabaseClient = {
  from: (table: string) => SupabaseQueryBuilder;
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: SupabaseError | null }>;
  auth: {
    getUser: (token?: string) => Promise<{ data: { user: AuthUser | null }; error: SupabaseError | null }>;
  };
  storage: {
    from: (bucket: string) => StorageBucket;
  };
};

export interface SupabaseQueryBuilder {
  select: (columns?: string) => SupabaseQueryBuilder;
  insert: (data: Record<string, unknown> | Record<string, unknown>[]) => SupabaseQueryBuilder;
  update: (data: Record<string, unknown>) => SupabaseQueryBuilder;
  upsert: (data: Record<string, unknown> | Record<string, unknown>[], opts?: Record<string, unknown>) => SupabaseQueryBuilder;
  delete: () => SupabaseQueryBuilder;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder;
  neq: (column: string, value: unknown) => SupabaseQueryBuilder;
  gt: (column: string, value: unknown) => SupabaseQueryBuilder;
  gte: (column: string, value: unknown) => SupabaseQueryBuilder;
  lt: (column: string, value: unknown) => SupabaseQueryBuilder;
  lte: (column: string, value: unknown) => SupabaseQueryBuilder;
  in: (column: string, values: unknown[]) => SupabaseQueryBuilder;
  is: (column: string, value: null | boolean) => SupabaseQueryBuilder;
  order: (column: string, opts?: { ascending?: boolean }) => SupabaseQueryBuilder;
  limit: (n: number) => SupabaseQueryBuilder;
  range: (from: number, to: number) => SupabaseQueryBuilder;
  single: () => Promise<{ data: unknown; error: SupabaseError | null }>;
  maybeSingle: () => Promise<{ data: unknown; error: SupabaseError | null }>;
  then: <T>(onfulfilled: (value: { data: unknown; error: SupabaseError | null }) => T) => Promise<T>;
}

export interface SupabaseError {
  message: string;
  details?: string;
  hint?: string;
  code?: string;
}

export interface AuthUser {
  id: string;
  email?: string;
  role?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
}

export interface StorageBucket {
  upload: (path: string, data: Uint8Array | string, opts?: Record<string, unknown>) => Promise<{ data: unknown; error: SupabaseError | null }>;
  download: (path: string) => Promise<{ data: Blob | null; error: SupabaseError | null }>;
  getPublicUrl: (path: string) => { data: { publicUrl: string } };
}

/** Typed fetch with retry config */
export interface FetchRetryConfig {
  retries?: number;
  backoff?: number;
  timeout?: number;
  headers?: Record<string, string>;
}

/** Structured logger interface (matches logger.ts) */
export interface Logger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

/** Common error caught in catch blocks */
export type CaughtError = Error | { message?: string };

/** Safely extract a message from an unknown caught value */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return 'Unknown error';
}

/** Type guard: check if value is a non-null object */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON parse with typed result */
export function parseJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
