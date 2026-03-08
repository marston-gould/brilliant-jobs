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
