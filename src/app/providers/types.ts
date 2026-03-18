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
  getAll(): Promise<ResumeItem[]>;
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
  getQueue(): Promise<AppQueueEntry[]>;
  getHistory(): Promise<AppQueueEntry[]>;
  addToQueue(entry: Partial<AppQueueEntry>): Promise<void>;
  removeFromQueue(idx: number): Promise<void>;
  processQueue(): Promise<void>;
  clearHistory(): Promise<void>;
  getNotifPrefs(): Promise<any>;
  getNotifLog(): Promise<any[]>;
}

/**
 * StatsProvider — materialized view queries for dashboard stats.
 */
export interface StatsProvider {
  getJobCounts(): Promise<JobCountStats | null>;
  getSourceBreakdown(): Promise<SourceBreakdown[]>;
}

/**
 * BillingProvider — credit balance, pricing, Stripe portal.
 */
export interface BillingProvider {
  getBalance(): Promise<number>;
  getPricing(): Promise<PricingTierItem[]>;
  getUserProfile(): Promise<UserProfileExtended | null>;
  openBillingPortal(): Promise<string | null>;
}

/**
 * TuningProvider — tuning settings and hidden job management.
 */
export interface TuningProvider {
  getTuning(): Promise<TuningData>;
  saveTuning(data: TuningData): Promise<void>;
  unhideJob(jobId: string): Promise<void>;
  getCollapsedStates(): Promise<Record<string, boolean>>;
  setCollapsedState(idx: string, collapsed: boolean): Promise<void>;
}

/**
 * ChatProvider — chat messages and sessions.
 */
export interface ChatProvider {
  getHistory(): Promise<ChatMessage[]>;
  sendMessage(text: string): Promise<ChatMessage>;
  clearSession(): Promise<void>;
  setMode(mode: string): Promise<void>;
  applyFilters(filters: Record<string, any>): Promise<void>;
}

/**
 * IntegrationProvider — Google Drive and other integrations.
 */
export interface IntegrationProvider {
  getGDriveFiles(): Promise<GDriveFile[]>;
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
  getStats(): Promise<Record<string, unknown>>;
  getLeaderboard(): Promise<LeaderboardEntry[]>;
  getCode(): Promise<string>;
}

/**
 * AdminProvider — admin panel operations.
 */
export interface AdminProvider {
  getOverview(): Promise<Record<string, unknown>>;
  getBoardHealth(): Promise<Record<string, unknown>>;
  getJobs(page?: number): Promise<Job[]>;
  getNotificationTemplates(): Promise<NotificationTemplate[]>;
  getCampaigns(): Promise<CampaignItem[]>;
  getNotificationStats(): Promise<Record<string, unknown>>;
  getCronJobs(): Promise<CronJobItem[]>;
  toggleCronJob(name: string, enabled: boolean): Promise<void>;
  getFeatureFlags(): Promise<FeatureFlagItem[]>;
  toggleFeatureFlag(key: string, enabled: boolean): Promise<void>;
  getAgentStatus(): Promise<Record<string, unknown>>;
  getMonitoringHealth(): Promise<Record<string, unknown>>;
  getSeoData(): Promise<Record<string, unknown>>;
  generateSeoReport(): Promise<void>;
  getComplianceData(): Promise<Record<string, unknown>>;
  initiateUserDeletion(userId: string): Promise<void>;
  cancelUserDeletion(userId: string): Promise<void>;
}

/**
 * NotificationProvider — notification management (admin).
 */
export interface NotificationProvider {
  getTemplates(): Promise<NotificationTemplate[]>;
  getCampaigns(): Promise<CampaignItem[]>;
  getStats24h(): Promise<{ sent: number; failed: number }>;
}

/**
 * InterviewPrepProvider — question bank, practice sessions, simulation.
 */
export interface InterviewPrepProvider {
  getQuestions(filters?: InterviewQuestionFilters): Promise<InterviewQuestion[]>;
  getClusterMeta(): Promise<InterviewClusterMeta>;
  getBookmarks(): Promise<string[]>;
  toggleBookmark(questionId: string): Promise<void>;
  getSessions(): Promise<InterviewSession[]>;
  getSession(sessionId: string): Promise<InterviewSession | null>;
  startSimulation(params: { questionIds: string[]; jobContext?: string }): Promise<InterviewSession>;
  sendSimulationMessage(sessionId: string, message: string, history: SimulationMessage[]): Promise<SimulationMessage>;
  endSimulation(sessionId: string, history: SimulationMessage[]): Promise<InterviewScorecard>;
}

/**
 * DashboardNotificationProvider — user-facing notification center.
 */
export interface DashboardNotificationProvider {
  getNotifications(limit?: number): Promise<UserNotification[]>;
  markRead(notificationId: string): Promise<void>;
  markAllRead(): Promise<void>;
  getUnreadCount(): Promise<number>;
  getPreferences(): Promise<NotificationPref | null>;
  updatePreferences(prefs: Partial<NotificationPref>): Promise<void>;
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
  interviewPrep: InterviewPrepProvider;
  dashboardNotifications: DashboardNotificationProvider;
}

// ── Domain Types for Extended Providers ───────────────────

export interface ResumeItem {
  id?: string;
  name: string;
  fileName?: string;
  archived: boolean;
  textStatus: 'pending' | 'extracting' | 'ready' | 'no-text';
  extractedText?: string;
  keywords?: string[];
  filterIds?: string[];
  level?: string;
  storagePath?: string;
  source?: string;
  size?: number;
  uploadedAt?: string;
}

export interface AppQueueEntry {
  id: string;
  jobTitle: string;
  company: string;
  url: string;
  resumeName: string;
  resumeId: string;
  mode: string;
  status: string;
  addedAt: string;
  submittedAt?: string;
  source: string;
}

export interface NotificationPref {
  enabled: boolean;
  channels: string[];
  escalation: string;
  timezone: string;
  phone?: string;
}

export interface NotificationLogItem {
  id: string;
  type: string;
  channel: string;
  status: string;
  sentAt: string;
  subject?: string;
  error?: string;
}

export interface SourceBreakdown {
  source_name: string;
  job_count: number;
}

export interface JobCountStats {
  total_open?: number;
  new_today?: number;
  total_companies?: number;
}

export interface PricingTierItem {
  tier: string;
  subscription_price_cents?: number;
  included_credits?: number;
  features?: Record<string, unknown>;
  display_order?: number;
}

export interface UserProfileExtended {
  role?: string;
  user_data?: Record<string, unknown>;
}

export interface TuningData {
  levelHierarchy?: Array<{ label: string; color: string }>;
  [key: string]: unknown;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface GDriveFile {
  id: string;
  name: string;
  mimeType?: string;
  url?: string;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  referralCount: number;
  rank: number;
}

export interface CronJobItem {
  name: string;
  schedule: string;
  enabled: boolean;
  status?: string;
  lastRun?: string;
}

export interface FeatureFlagItem {
  key: string;
  enabled: boolean;
  rollout_pct?: number;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: string;
  subject?: string;
  body?: string;
  created_at?: string;
}

export interface CampaignItem {
  id: string;
  name: string;
  priority: number;
  status?: string;
}

// ── Interview Prep Domain Types ─────────────────────────

export interface InterviewQuestion {
  id: string;
  question: string;
  category: 'behavioral' | 'technical' | 'situational' | 'case_study';
  difficulty: 'standard' | 'advanced';
  role_cluster?: string;
  department?: string;
  level?: string;
  tips?: string;
  sample_answer?: string;
  created_at?: string;
}

export interface InterviewQuestionFilters {
  category?: string;
  difficulty?: string;
  role?: string;
  department?: string;
  level?: string;
  search?: string;
  bookmarked?: boolean;
}

export interface InterviewClusterMeta {
  roles: string[];
  departments: string[];
  levels: string[];
}

export interface InterviewSession {
  id: string;
  user_id: string;
  status: 'active' | 'completed' | 'cancelled';
  question_ids: string[];
  job_context?: string;
  scorecard?: InterviewScorecard;
  created_at: string;
  completed_at?: string;
}

export interface SimulationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface InterviewScorecard {
  overall_score: number;
  categories: Array<{
    name: string;
    score: number;
    feedback: string;
  }>;
  strengths: string[];
  improvements: string[];
  summary: string;
}

// ── User Notification Types ─────────────────────────────

export interface UserNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  action_url?: string;
  created_at: string;
}
