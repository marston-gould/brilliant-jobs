// ============================================================
// Supabase Provider Implementations (SA-013 → SPA-CUT-1)
// ============================================================
// These implementations use the standalone Supabase client.
// No dependency on window.BJ or legacy globals.ts.
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
import { supabase, getUser } from '@lib/supabase';

// ── Supabase client accessor ──────────────────────────────
// SPA-CUT-1: Direct import from standalone client module.
// No window.BJ dependency.

function getSupabase() {
  return supabase;
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

// ── Extended Provider Implementations (SPA-CUT-REMEDIATION) ──

import type {
  ResumeProvider, ApplicationProvider, StatsProvider, BillingProvider,
  TuningProvider, ChatProvider, IntegrationProvider, ReferralProvider,
  AdminProvider, NotificationProvider, ExtendedDataProviders,
} from './types';
import { safeReadLS, safeWriteLS, callGateway } from '@lib/supabase';

export class SupabaseResumeProvider implements ResumeProvider {
  async getAll() { return safeReadLS<any[]>('bj_resumes', []); }
  async upload(file: File) {
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const sb = getSupabase();
    const { error } = await sb.storage.from('resumes').upload(path, file);
    if (error) throw new ProviderError(error.message, 'UPLOAD_FAILED', undefined, error);
    return { storagePath: path };
  }
  async download(storagePath: string) {
    const sb = getSupabase();
    const { data } = await sb.storage.from('resumes').download(storagePath);
    return data;
  }
  async remove(idx: number) { const all = safeReadLS<any[]>('bj_resumes', []); if (idx >= 0 && idx < all.length) { all.splice(idx, 1); safeWriteLS('bj_resumes', all); } }
  async archive(idx: number) { const all = safeReadLS<any[]>('bj_resumes', []); if (all[idx]) { all[idx].archived = true; safeWriteLS('bj_resumes', all); } }
  async unarchive(idx: number) { const all = safeReadLS<any[]>('bj_resumes', []); if (all[idx]) { all[idx].archived = false; safeWriteLS('bj_resumes', all); } }
  async rename(idx: number, name: string) { const all = safeReadLS<any[]>('bj_resumes', []); if (all[idx]) { all[idx].name = name; safeWriteLS('bj_resumes', all); } }
  async setLevel(idx: number, level: string) { const all = safeReadLS<any[]>('bj_resumes', []); if (all[idx]) { all[idx].level = level; safeWriteLS('bj_resumes', all); } }
  async toggleFilter(idx: number, filterName: string) {
    const all = safeReadLS<any[]>('bj_resumes', []);
    const r = all[idx]; if (!r) return;
    const ids = r.filterIds || [];
    r.filterIds = ids.includes(filterName) ? ids.filter((id: string) => id !== filterName) : [...ids, filterName];
    safeWriteLS('bj_resumes', all);
  }
  async scoreAI(resumeText: string) {
    const result = await callGateway<any>('score-resume', { mode: 'single', resume_text: resumeText }, { timeout: 30000 });
    return { score: result?.score ?? 0, summary: result?.summary };
  }
}

export class SupabaseApplicationProvider implements ApplicationProvider {
  async getQueue() { return safeReadLS<any[]>('bj_app_queue', []); }
  async getHistory() { return safeReadLS<any[]>('bj_app_history', []); }
  async addToQueue(entry: any) { const q = safeReadLS<any[]>('bj_app_queue', []); q.push(entry); safeWriteLS('bj_app_queue', q); }
  async removeFromQueue(idx: number) { const q = safeReadLS<any[]>('bj_app_queue', []); if (idx >= 0 && idx < q.length) { q.splice(idx, 1); safeWriteLS('bj_app_queue', q); } }
  async processQueue() {
    const sb = getSupabase();
    const q = safeReadLS<any[]>('bj_app_queue', []);
    for (const entry of q.filter((e: any) => e.status === 'queued')) {
      await sb.from('pending_applications').update({ status: 'approved' }).eq('id', entry.id);
      entry.status = 'pending';
    }
    safeWriteLS('bj_app_queue', q);
  }
  async clearHistory() { safeWriteLS('bj_app_history', []); }
  async getNotifPrefs() {
    const user = await getUser(); if (!user) return null;
    const sb = getSupabase();
    const { data } = await sb.from('notification_preferences').select('*').eq('user_id', user.id).single();
    return data;
  }
  async getNotifLog() {
    const user = await getUser(); if (!user) return [];
    const sb = getSupabase();
    const { data } = await sb.from('notification_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
}

export class SupabaseStatsProvider implements StatsProvider {
  async getJobCounts() {
    const sb = getSupabase();
    const { data } = await sb.from('mv_job_feed_counts').select('*').limit(1).single();
    return data;
  }
  async getSourceBreakdown() {
    const sb = getSupabase();
    const { data } = await sb.from('mv_source_breakdown').select('*');
    return data || [];
  }
}

export class SupabaseBillingProvider implements BillingProvider {
  async getBalance() {
    try { const bal = await callGateway<any>('get-user-balance', undefined, { method: 'GET', timeout: 10000 }); return bal?.total || 0; } catch { return 0; }
  }
  async getPricing() {
    const sb = getSupabase();
    const { data } = await sb.from('pricing_defaults').select('*').order('display_order');
    return data || [];
  }
  async getUserProfile() {
    const user = await getUser(); if (!user) return null;
    const sb = getSupabase();
    const { data } = await sb.from('profiles').select('role, user_data').eq('id', user.id).single();
    return data;
  }
  async openBillingPortal() {
    try { const r = await callGateway<{ url: string }>('create-portal-session', {}, { timeout: 15000 }); return r?.url || null; } catch { return null; }
  }
}

export class SupabaseTuningProvider implements TuningProvider {
  async getTuning() { return safeReadLS<any>('bj_tuning', {}); }
  async saveTuning(data: any) { safeWriteLS('bj_tuning', data); }
  async unhideJob(jobId: string) {
    const hidden = safeReadLS<any[]>('bj_hidden_jobs', []);
    safeWriteLS('bj_hidden_jobs', hidden.filter((h: any) => (typeof h === 'string' ? h : h.id) !== jobId));
  }
  async getCollapsedStates() { return safeReadLS<Record<string, boolean>>('bj_pl_collapse', {}); }
  async setCollapsedState(idx: string, collapsed: boolean) {
    const states = safeReadLS<Record<string, boolean>>('bj_pl_collapse', {});
    states[idx] = collapsed;
    safeWriteLS('bj_pl_collapse', states);
  }
}

export class SupabaseChatProvider implements ChatProvider {
  async getHistory() { return safeReadLS<any[]>('bj_chat_history', []); }
  async sendMessage(_text: string) { return {}; /* TODO: callGateway('chat-job-search') */ }
  async clearSession() { try { localStorage.removeItem('bj_chat_history'); localStorage.removeItem('bj_chat_session'); } catch {} }
  async setMode(mode: string) { try { localStorage.setItem('bj_search_mode', mode); } catch {} }
  async applyFilters(filters: Record<string, any>) {
    try {
      const existing = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');
      localStorage.setItem('bj_chat_derived_filters', JSON.stringify({ ...existing, ...filters, _appliedAt: Date.now() }));
    } catch {}
  }
}

export class SupabaseIntegrationProvider implements IntegrationProvider {
  async getGDriveFiles() { return []; /* TODO */ }
  async connectGDrive() { /* TODO */ }
  async disconnectGDrive() { /* TODO */ }
  async addGDriveFile(_fileId: string) { /* TODO */ }
  async unlinkGDriveFile(_fileId: string) { /* TODO */ }
  async importGDriveAsResume(_fileId: string) { /* TODO */ }
}

export class SupabaseReferralProvider implements ReferralProvider {
  async getStats() { return {}; /* loaded from localStorage */ }
  async getLeaderboard() { return []; }
  async getCode() { return ''; }
}

export class SupabaseAdminProvider implements AdminProvider {
  async getOverview() { return {}; }
  async getBoardHealth() { return callGateway('admin-analytics', { action: 'board_health' }); }
  async getJobs(page = 0) { const sb = getSupabase(); const { data } = await sb.from('ats_jobs').select('*').order('created_at', { ascending: false }).range(page * 50, (page + 1) * 50 - 1); return data || []; }
  async getNotificationTemplates() { const sb = getSupabase(); const { data } = await sb.from('notification_templates').select('*').order('created_at', { ascending: false }); return data || []; }
  async getCampaigns() { const sb = getSupabase(); const { data } = await sb.from('survey_campaigns').select('*').order('priority'); return data || []; }
  async getNotificationStats() { const sb = getSupabase(); const since = new Date(Date.now() - 86400000).toISOString(); const { count: sent } = await sb.from('notification_log').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since); const { count: failed } = await sb.from('notification_log').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since); return { sent: sent || 0, failed: failed || 0 }; }
  async getCronJobs() { const sb = getSupabase(); const { data } = await sb.from('cron_registry').select('*').order('name'); return data || []; }
  async toggleCronJob(name: string, enabled: boolean) { const sb = getSupabase(); await sb.from('cron_registry').update({ enabled }).eq('name', name); }
  async getFeatureFlags() { const sb = getSupabase(); const { data } = await sb.from('feature_flags').select('*').order('key'); return data || []; }
  async toggleFeatureFlag(key: string, enabled: boolean) { const sb = getSupabase(); await sb.from('feature_flags').update({ enabled }).eq('key', key); }
  async getAgentStatus() { return callGateway('crewai-orchestrator', { action: 'status' }); }
  async getMonitoringHealth() { return callGateway('deploy-tracker', { action: 'deploy-health-score' }); }
  async getSeoData() { return callGateway('admin-analytics', { action: 'seo' }); }
  async generateSeoReport() { await callGateway('seo-sync', {}); }
  async getComplianceData() { return callGateway('admin-analytics', { action: 'compliance' }); }
  async initiateUserDeletion(userId: string) { await callGateway('admin-user-manager', { action: 'delete_account', user_id: userId, reason: 'admin_initiated' }); }
  async cancelUserDeletion(userId: string) { await callGateway('admin-user-manager', { action: 'cancel_delete', user_id: userId }); }
}

export class SupabaseNotificationProvider implements NotificationProvider {
  async getTemplates() { const sb = getSupabase(); const { data } = await sb.from('notification_templates').select('*').order('created_at', { ascending: false }); return data || []; }
  async getCampaigns() { const sb = getSupabase(); const { data } = await sb.from('survey_campaigns').select('*').order('priority'); return data || []; }
  async getStats24h() { const sb = getSupabase(); const since = new Date(Date.now() - 86400000).toISOString(); const { count: sent } = await sb.from('notification_log').select('*', { count: 'exact', head: true }).eq('status', 'sent').gte('created_at', since); const { count: failed } = await sb.from('notification_log').select('*', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since); return { sent: sent || 0, failed: failed || 0 }; }
}

// ── Extended Factory ──────────────────────────────────────

export function createExtendedSupabaseProviders(): ExtendedDataProviders {
  return {
    search: new SupabaseSearchProvider(),
    jobs: new SupabaseJobProvider(),
    user: new SupabaseUserProvider(),
    pipeline: new SupabasePipelineProvider(),
    resumes: new SupabaseResumeProvider(),
    applications: new SupabaseApplicationProvider(),
    stats: new SupabaseStatsProvider(),
    billing: new SupabaseBillingProvider(),
    tuning: new SupabaseTuningProvider(),
    chat: new SupabaseChatProvider(),
    integrations: new SupabaseIntegrationProvider(),
    referrals: new SupabaseReferralProvider(),
    admin: new SupabaseAdminProvider(),
    notifications: new SupabaseNotificationProvider(),
  };
}
