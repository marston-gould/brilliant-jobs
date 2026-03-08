// ============================================================
// Supabase Provider Implementations (SA-013)
// ============================================================
// These implementations bridge the provider interfaces to the
// existing Supabase client and global functions from globals.ts.
//
// During migration, these read from the existing window.BJ
// namespace established in CS-P1-004. After full migration,
// they'll be refactored to use direct ES module imports.
// ============================================================

import type {
  SearchProvider,
  JobProvider,
  UserProvider,
  PipelineProvider,
  SearchParams,
  SearchResult,
  Job,
  UserProfile,
  PipelineItem,
  DataProviders,
} from './types';
import { ProviderError } from './types';

// ── Supabase client accessor ──────────────────────────────
// During dual-mode: reads from window.BJ.supabase (set by globals.ts)
// Post-migration: will import directly from a Supabase module

function getSupabase() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bj = (window as any).BJ;
  if (!bj?.supabase) {
    throw new ProviderError('Supabase client not initialized', 'SUPABASE_NOT_READY');
  }
  return bj.supabase;
}

// SA-014+: Gateway URL accessor for migrated pages
// const GATEWAY_URL = window.BJ?.GATEWAY_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/api-gateway';

// ── Search Provider (Supabase FTS) ────────────────────────

export class SupabaseSearchProvider implements SearchProvider {
  async search(params: SearchParams): Promise<SearchResult> {
    try {
      const sb = getSupabase();
      let query = sb.from('ats_jobs').select('*', { count: 'exact' });

      if (params.query) {
        query = query.textSearch('fts', params.query, { type: 'websearch' });
      }
      if (params.location) {
        query = query.ilike('location', `%${params.location}%`);
      }
      if (params.remote !== undefined) {
        query = query.eq('remote', params.remote);
      }
      if (params.salary_min) {
        query = query.gte('salary_max', params.salary_min);
      }
      if (params.career_level?.length) {
        query = query.in('career_level', params.career_level);
      }
      if (params.sources?.length) {
        query = query.in('source', params.sources);
      }

      // Sort
      const sortCol = params.sort_by === 'date' ? 'posted_at' : params.sort_by === 'salary' ? 'salary_max' : 'score';
      query = query.order(sortCol, { ascending: params.sort_order === 'asc' });

      // Pagination
      const page = params.page || 1;
      const perPage = params.per_page || 25;
      const from = (page - 1) * perPage;
      query = query.range(from, from + perPage - 1);

      const { data, error, count } = await query;
      if (error) throw new ProviderError(error.message, 'SEARCH_FAILED', undefined, error);

      return {
        jobs: (data || []) as unknown as Job[],
        total: count || 0,
        page,
        per_page: perPage,
      };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError('Search failed', 'SEARCH_ERROR', undefined, e);
    }
  }

  async suggest(query: string, limit = 5): Promise<string[]> {
    try {
      const sb = getSupabase();
      const { data } = await sb
        .from('ats_jobs')
        .select('title')
        .textSearch('fts', query, { type: 'websearch' })
        .limit(limit);
      return (data || []).map((r: { title: string }) => r.title);
    } catch {
      return [];
    }
  }
}

// ── Job Provider (Supabase) ───────────────────────────────

export class SupabaseJobProvider implements JobProvider {
  async getById(id: string): Promise<Job | null> {
    const sb = getSupabase();
    const { data, error } = await sb.from('ats_jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw new ProviderError(error.message, 'JOB_FETCH_FAILED', undefined, error);
    return data as unknown as Job | null;
  }

  async getByIds(ids: string[]): Promise<Job[]> {
    if (!ids.length) return [];
    const sb = getSupabase();
    const { data, error } = await sb.from('ats_jobs').select('*').in('id', ids);
    if (error) throw new ProviderError(error.message, 'JOBS_FETCH_FAILED', undefined, error);
    return (data || []) as unknown as Job[];
  }

  async save(jobId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('saved_jobs').upsert({ job_id: jobId });
    if (error) throw new ProviderError(error.message, 'SAVE_FAILED', undefined, error);
  }

  async unsave(jobId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('saved_jobs').delete().eq('job_id', jobId);
    if (error) throw new ProviderError(error.message, 'UNSAVE_FAILED', undefined, error);
  }

  async hide(jobId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('hidden_jobs').upsert({ job_id: jobId });
    if (error) throw new ProviderError(error.message, 'HIDE_FAILED', undefined, error);
  }

  async unhide(jobId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('hidden_jobs').delete().eq('job_id', jobId);
    if (error) throw new ProviderError(error.message, 'UNHIDE_FAILED', undefined, error);
  }

  async markApplied(jobId: string, appliedAt?: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('applied_jobs').upsert({
      job_id: jobId,
      applied_at: appliedAt || new Date().toISOString(),
    });
    if (error) throw new ProviderError(error.message, 'APPLY_FAILED', undefined, error);
  }
}

// ── User Provider (Supabase Auth) ─────────────────────────

export class SupabaseUserProvider implements UserProvider {
  async getCurrentUser(): Promise<UserProfile | null> {
    const sb = getSupabase();
    const { data: { user }, error } = await sb.auth.getUser();
    if (error || !user) return null;

    // Fetch profile from user_profiles table
    const { data: profile } = await sb
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email || '',
      display_name: profile?.display_name || null,
      tier: profile?.tier || 'free',
      role: user.app_metadata?.role === 'admin' ? 'admin' : 'user',
      created_at: user.created_at,
      preferences: profile?.preferences || {},
    };
  }

  async updatePreferences(prefs: Partial<UserProfile['preferences']>): Promise<void> {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED', 401);

    const { error } = await sb
      .from('user_profiles')
      .update({ preferences: prefs })
      .eq('id', user.id);
    if (error) throw new ProviderError(error.message, 'PREFS_UPDATE_FAILED', undefined, error);
  }

  async signOut(): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.auth.signOut();
    if (error) throw new ProviderError(error.message, 'SIGNOUT_FAILED', undefined, error);
  }

  onAuthChange(callback: (user: UserProfile | null) => void): () => void {
    const sb = getSupabase();
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (_event: string, session: unknown) => {
        if (session) {
          const user = await this.getCurrentUser();
          callback(user);
        } else {
          callback(null);
        }
      }
    );
    return () => subscription.unsubscribe();
  }
}

// ── Pipeline Provider (Supabase) ──────────────────────────

export class SupabasePipelineProvider implements PipelineProvider {
  async getItems(stage?: PipelineItem['stage']): Promise<PipelineItem[]> {
    const sb = getSupabase();
    let query = sb.from('pipeline_items').select('*, job:ats_jobs(*)');
    if (stage) query = query.eq('stage', stage);
    query = query.order('updated_at', { ascending: false });

    const { data, error } = await query;
    if (error) throw new ProviderError(error.message, 'PIPELINE_FETCH_FAILED', undefined, error);
    return (data || []) as unknown as PipelineItem[];
  }

  async moveToStage(itemId: string, stage: PipelineItem['stage']): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb
      .from('pipeline_items')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) throw new ProviderError(error.message, 'STAGE_MOVE_FAILED', undefined, error);
  }

  async updateNotes(itemId: string, notes: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('pipeline_items').update({ notes }).eq('id', itemId);
    if (error) throw new ProviderError(error.message, 'NOTES_UPDATE_FAILED', undefined, error);
  }

  async addItem(jobId: string, stage: PipelineItem['stage'] = 'saved'): Promise<PipelineItem> {
    const sb = getSupabase();
    const { data, error } = await sb
      .from('pipeline_items')
      .insert({ job_id: jobId, stage })
      .select('*, job:ats_jobs(*)')
      .single();
    if (error) throw new ProviderError(error.message, 'PIPELINE_ADD_FAILED', undefined, error);
    return data as unknown as PipelineItem;
  }

  async removeItem(itemId: string): Promise<void> {
    const sb = getSupabase();
    const { error } = await sb.from('pipeline_items').delete().eq('id', itemId);
    if (error) throw new ProviderError(error.message, 'PIPELINE_REMOVE_FAILED', undefined, error);
  }
}

// ── Factory ───────────────────────────────────────────────

export function createSupabaseProviders(): DataProviders {
  return {
    search: new SupabaseSearchProvider(),
    jobs: new SupabaseJobProvider(),
    user: new SupabaseUserProvider(),
    pipeline: new SupabasePipelineProvider(),
  };
}
