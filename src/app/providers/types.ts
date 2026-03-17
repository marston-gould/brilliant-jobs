// ============================================================
// Data Provider Interfaces (SA-013)
// ============================================================
// These interfaces define ALL data access contracts.
// Components consume data through providers, never directly
// through Supabase client or fetch calls.
//
// This is a "scar" pattern: swapping to a different backend,
// adding caching layers, or mocking for tests becomes a
// provider swap, not a component rewrite.
//
// Current implementations: SupabaseJobProvider, etc.
// Future: could be REST API, GraphQL, local cache, mock.
// ============================================================

// ── Core Domain Types ─────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  company_name: string;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  source: string;
  url: string;
  posted_at: string | null;
  scraped_at: string;
  description: string | null;
  remote: boolean;
  career_level: string | null;
  tags: string[];
  score: number | null;
  saved: boolean;
  applied: boolean;
  hidden: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  tier: 'free' | 'pro' | 'enterprise';
  role: 'user' | 'admin';
  created_at: string;
  preferences: Record<string, unknown>;
}

export interface PipelineItem {
  id: string;
  job_id: string;
  job: Job;
  stage: 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'ghosted';
  notes: string;
  updated_at: string;
  applied_at: string | null;
  next_step: string | null;
  next_step_date: string | null;
}

export interface SearchParams {
  query: string;
  location?: string;
  remote?: boolean;
  salary_min?: number;
  salary_max?: number;
  career_level?: string[];
  sources?: string[];
  posted_within_days?: number;
  page?: number;
  per_page?: number;
  sort_by?: 'relevance' | 'date' | 'salary';
  sort_order?: 'asc' | 'desc';
}

export interface SearchResult {
  jobs: Job[];
  total: number;
  page: number;
  per_page: number;
  facets?: SearchFacets;
}

export interface SearchFacets {
  sources: FacetCount[];
  locations: FacetCount[];
  career_levels: FacetCount[];
  remote: { yes: number; no: number };
}

export interface FacetCount {
  value: string;
  count: number;
}

// ── Provider Errors ───────────────────────────────────────

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

// ── Provider Interfaces ───────────────────────────────────

/**
 * SearchProvider — abstracts the search engine (Supabase FTS, Typesense, etc.)
 */
export interface SearchProvider {
  search(params: SearchParams): Promise<SearchResult>;
  suggest(query: string, limit?: number): Promise<string[]>;
}

/**
 * JobProvider — CRUD operations on job data.
 */
export interface JobProvider {
  getById(id: string): Promise<Job | null>;
  getByIds(ids: string[]): Promise<Job[]>;
  save(jobId: string): Promise<void>;
  unsave(jobId: string): Promise<void>;
  hide(jobId: string): Promise<void>;
  unhide(jobId: string): Promise<void>;
  markApplied(jobId: string, appliedAt?: string): Promise<void>;
}

/**
 * UserProvider — current user profile and preferences.
 */
export interface UserProvider {
  getCurrentUser(): Promise<UserProfile | null>;
  updatePreferences(prefs: Partial<UserProfile['preferences']>): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(callback: (user: UserProfile | null) => void): () => void;
}

/**
 * PipelineProvider — application tracking pipeline.
 */
export interface PipelineProvider {
  getItems(stage?: PipelineItem['stage']): Promise<PipelineItem[]>;
  moveToStage(itemId: string, stage: PipelineItem['stage']): Promise<void>;
  updateNotes(itemId: string, notes: string): Promise<void>;
  addItem(jobId: string, stage?: PipelineItem['stage']): Promise<PipelineItem>;
  removeItem(itemId: string): Promise<void>;
}

// ── Provider Registry ─────────────────────────────────────

/**
 * All providers bundled together.
 * Passed to the ProviderContext for component consumption.
 */
export interface DataProviders {
  search: SearchProvider;
  jobs: JobProvider;
  user: UserProvider;
  pipeline: PipelineProvider;
}

// ── Extended Provider Interfaces (SPA-CUT-REMEDIATION) ────

/**
 * ResumeProvider — resume CRUD, upload, AI scoring.
 */
export interface ResumeProvider {
  getAll(): Promise<any[]>;
  upload(file: File): Promise<{ storagePath: string }>;
  download(storagePath: string): Promise<Blob | null>;
  remove(idx: number): Promise<void>;
  archive(idx: number): Promise<void>;
  unarchive(idx: number): Promise<void>;
  rename(idx: number, name: string): Promise<void>;
  setLevel(idx: number, level: string): Promise<void>;
  toggleFilter(idx: number, filterName: string): Promise<void>;
  scoreAI(resumeText: string): Promise<{ score: number; summary?: string }>;
}

/**
 * ApplicationProvider — application queue and history.
 */
export interface ApplicationProvider {
  getQueue(): Promise<any[]>;
  getHistory(): Promise<any[]>;
  addToQueue(entry: any): Promise<void>;
  removeFromQueue(idx: number): Promise<void>;
  processQueue(): Promise<void>;
  clearHistory(): Promise<void>;
  getNotifPrefs(): Promise<any | null>;
  getNotifLog(): Promise<any[]>;
}

/**
 * StatsProvider — materialized view queries for dashboard stats.
 */
export interface StatsProvider {
  getJobCounts(): Promise<any>;
  getSourceBreakdown(): Promise<any[]>;
}

/**
 * BillingProvider — credit balance, pricing, Stripe portal.
 */
export interface BillingProvider {
  getBalance(): Promise<number>;
  getPricing(): Promise<any[]>;
  getUserProfile(): Promise<any>;
  openBillingPortal(): Promise<string | null>;
}

/**
 * TuningProvider — tuning settings and hidden job management.
 */
export interface TuningProvider {
  getTuning(): Promise<any>;
  saveTuning(data: any): Promise<void>;
  unhideJob(jobId: string): Promise<void>;
  getCollapsedStates(): Promise<Record<string, boolean>>;
  setCollapsedState(idx: string, collapsed: boolean): Promise<void>;
}

/**
 * ChatProvider — chat messages and sessions.
 */
export interface ChatProvider {
  getHistory(): Promise<any[]>;
  sendMessage(text: string): Promise<any>;
  clearSession(): Promise<void>;
  setMode(mode: string): Promise<void>;
  applyFilters(filters: Record<string, any>): Promise<void>;
}

/**
 * IntegrationProvider — Google Drive and other integrations.
 */
export interface IntegrationProvider {
  getGDriveFiles(): Promise<any[]>;
  connectGDrive(): Promise<void>;
  disconnectGDrive(): Promise<void>;
  addGDriveFile(fileId: string): Promise<void>;
  unlinkGDriveFile(fileId: string): Promise<void>;
  importGDriveAsResume(fileId: string): Promise<void>;
}

/**
 * ReferralProvider — referral stats and leaderboard.
 */
export interface ReferralProvider {
  getStats(): Promise<any>;
  getLeaderboard(): Promise<any[]>;
  getCode(): Promise<string>;
}

/**
 * AdminProvider — admin panel operations.
 */
export interface AdminProvider {
  getOverview(): Promise<any>;
  getBoardHealth(): Promise<any>;
  getJobs(page?: number): Promise<any[]>;
  getNotificationTemplates(): Promise<any[]>;
  getCampaigns(): Promise<any[]>;
  getNotificationStats(): Promise<any>;
  getCronJobs(): Promise<any[]>;
  toggleCronJob(name: string, enabled: boolean): Promise<void>;
  getFeatureFlags(): Promise<any[]>;
  toggleFeatureFlag(key: string, enabled: boolean): Promise<void>;
  getAgentStatus(): Promise<any>;
  getMonitoringHealth(): Promise<any>;
  getSeoData(): Promise<any>;
  generateSeoReport(): Promise<void>;
  getComplianceData(): Promise<any>;
  initiateUserDeletion(userId: string): Promise<void>;
  cancelUserDeletion(userId: string): Promise<void>;
}

/**
 * NotificationProvider — notification management (admin).
 */
export interface NotificationProvider {
  getTemplates(): Promise<any[]>;
  getCampaigns(): Promise<any[]>;
  getStats24h(): Promise<{ sent: number; failed: number }>;
}

/**
 * Extended DataProviders — includes all domain providers.
 */
export interface ExtendedDataProviders extends DataProviders {
  resumes: ResumeProvider;
  applications: ApplicationProvider;
  stats: StatsProvider;
  billing: BillingProvider;
  tuning: TuningProvider;
  chat: ChatProvider;
  integrations: IntegrationProvider;
  referrals: ReferralProvider;
  admin: AdminProvider;
  notifications: NotificationProvider;
}
