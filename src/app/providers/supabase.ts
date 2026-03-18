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

    // Fetch profile from profiles table
    const { data: profile } = await sb
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const userData = (profile?.user_data as Record<string, unknown>) || {};
    return {
      id: user.id,
      email: user.email || '',
      display_name: profile?.full_name || null,
      tier: profile?.plan || 'free',
      role: (user.app_metadata?.role === 'admin' || profile?.role === 'admin') ? 'admin' : 'user',
      created_at: user.created_at,
      preferences: (userData.preferences as Record<string, unknown>) || {},
    };
  }

  async updatePreferences(prefs: Partial<UserProfile['preferences']>): Promise<void> {
    const sb = getSupabase();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED', 401);

    // Read existing user_data, merge preferences into it
    const { data: profile } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
    const existing = (profile?.user_data as Record<string, unknown>) || {};
    const { error } = await sb
      .from('profiles')
      .update({ user_data: { ...existing, preferences: { ...(existing.preferences as Record<string, unknown> || {}), ...prefs } } })
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
  AdminProvider, NotificationProvider, InterviewPrepProvider, DashboardNotificationProvider,
  ExtendedDataProviders, ChatMessage,
  InterviewQuestion, InterviewQuestionFilters, InterviewClusterMeta,
  InterviewSession, SimulationMessage, InterviewScorecard, UserNotification,
} from './types';
import { safeReadLS, safeWriteLS, callGateway, GATEWAY_URL, getAccessToken } from '@lib/supabase';

export class SupabaseResumeProvider implements ResumeProvider {
  async getAll() {
    const user = await getUser();
    if (!user) return [];
    const sb = getSupabase();
    const { data, error } = await sb.from('resumes').select('*').eq('user_id', user.id).is('deleted_at', null).order('created_at', { ascending: false });
    if (error) { console.error('[BJ:Resumes] getAll error:', error.message); return safeReadLS<any[]>('bj_resumes', []); }
    return (data || []).map(r => ({
      id: r.id, name: r.name || r.file_name, file_name: r.file_name, file_path: r.file_path,
      file_size: r.file_size, level: r.level_label, levelColor: r.level_color,
      is_default: r.is_default, source: r.source, created_at: r.created_at,
      archived: false, filterIds: [],
    }));
  }
  async upload(file: File) {
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${user.id}/${Date.now()}.${ext}`;
    const sb = getSupabase();
    const { error: uploadErr } = await sb.storage.from('resumes').upload(path, file);
    if (uploadErr) throw new ProviderError(uploadErr.message, 'UPLOAD_FAILED', undefined, uploadErr);
    const { error: insertErr } = await sb.from('resumes').insert({
      user_id: user.id, name: file.name.replace(/\.[^.]+$/, ''), file_name: file.name,
      file_path: path, file_size: String(file.size), source: 'upload',
    });
    if (insertErr) console.error('[BJ:Resumes] insert error:', insertErr.message);
    return { storagePath: path };
  }
  async download(storagePath: string) {
    const sb = getSupabase();
    const { data } = await sb.storage.from('resumes').download(storagePath);
    return data;
  }
  async remove(idx: number) {
    const all = await this.getAll();
    const r = all[idx]; if (!r?.id) return;
    const sb = getSupabase();
    await sb.from('resumes').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
  }
  async archive(idx: number) {
    // Soft delete — resumes table uses deleted_at for archive
    const all = await this.getAll();
    const r = all[idx]; if (!r?.id) return;
    const sb = getSupabase();
    await sb.from('resumes').update({ deleted_at: new Date().toISOString() }).eq('id', r.id);
  }
  async unarchive(idx: number) {
    const all = await this.getAll();
    const r = all[idx]; if (!r?.id) return;
    const sb = getSupabase();
    await sb.from('resumes').update({ deleted_at: null }).eq('id', r.id);
  }
  async rename(idx: number, name: string) {
    const all = await this.getAll();
    const r = all[idx]; if (!r?.id) return;
    const sb = getSupabase();
    await sb.from('resumes').update({ name }).eq('id', r.id);
  }
  async setLevel(idx: number, level: string) {
    const all = await this.getAll();
    const r = all[idx]; if (!r?.id) return;
    const sb = getSupabase();
    await sb.from('resumes').update({ level_label: level }).eq('id', r.id);
  }
  async toggleFilter(idx: number, filterName: string) {
    // Filter assignment not in resumes table — keep localStorage for now
    const all = safeReadLS<any[]>('bj_resume_filters', []);
    const r = all[idx] || { filterIds: [] };
    const ids = r.filterIds || [];
    r.filterIds = ids.includes(filterName) ? ids.filter((id: string) => id !== filterName) : [...ids, filterName];
    all[idx] = r;
    safeWriteLS('bj_resume_filters', all);
  }
  async scoreAI(resumeText: string) {
    const result = await callGateway<any>('score-resume', { mode: 'single', resume_text: resumeText }, { timeout: 30000 });
    return { score: result?.score ?? 0, summary: result?.summary };
  }
  async parseResume(file: File) {
    const token = await getAccessToken();
    if (!token) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const formData = new FormData();
    formData.append('file', file);
    const resp = await fetch(`${GATEWAY_URL}/resume-parse`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!resp.ok) throw new ProviderError(`Parse failed: ${resp.status}`, 'PARSE_FAILED');
    return resp.json();
  }
  async generateBullets(roleTitle: string, company?: string, context?: string, targetJobId?: string) {
    return callGateway<any>('resume-rewrite-bullet', { role_title: roleTitle, company, context, target_job_id: targetJobId }, { timeout: 20000 });
  }
  async generateSummary(resumeId: string, tone: string, targetJobId?: string) {
    return callGateway<any>('resume-generate', { resume_id: resumeId, section: 'summary', tone, target_job_id: targetJobId }, { timeout: 20000 });
  }
  async optimizeForJob(resumeId: string, jobId: string) {
    return callGateway<any>('resume-optimize', { resume_id: resumeId, job_id: jobId }, { timeout: 30000 });
  }
  async generateDocx(resumeId: string, template: string) {
    return callGateway<any>('export-resume-docx', { resume_id: resumeId, template }, { timeout: 20000 });
  }
}

export class SupabaseApplicationProvider implements ApplicationProvider {
  async getQueue() {
    const user = await getUser(); if (!user) return [];
    const sb = getSupabase();
    const { data } = await sb
      .from('pending_applications')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pending', 'queued', 'approved'])
      .order('created_at', { ascending: false });
    return (data || []).map(mapPendingToQueueEntry);
  }
  async getHistory() {
    const user = await getUser(); if (!user) return [];
    const sb = getSupabase();
    const { data } = await sb
      .from('pending_applications')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['submitted', 'rejected', 'expired', 'cancelled'])
      .order('created_at', { ascending: false })
      .limit(100);
    return (data || []).map(mapPendingToQueueEntry);
  }
  async addToQueue(entry: Partial<import('./types').AppQueueEntry>) {
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const sb = getSupabase();
    const { error } = await sb.from('pending_applications').insert({
      user_id: user.id,
      job_id: entry.resumeId || '',
      job_title: entry.jobTitle,
      company_name: entry.company,
      job_url: entry.url,
      status: 'queued',
      approval_mode: entry.mode || 'manual',
    });
    if (error) throw new ProviderError(error.message, 'QUEUE_ADD_FAILED', undefined, error);
  }
  async removeFromQueue(idx: number) {
    // idx-based removal for backward compat — fetch queue then delete by ID
    const queue = await this.getQueue();
    const entry = queue[idx];
    if (!entry?.id) return;
    const sb = getSupabase();
    await sb.from('pending_applications').delete().eq('id', entry.id);
  }
  async processQueue() {
    const user = await getUser(); if (!user) return;
    const sb = getSupabase();
    await sb
      .from('pending_applications')
      .update({ status: 'approved' })
      .eq('user_id', user.id)
      .eq('status', 'queued');
  }
  async clearHistory() {
    const user = await getUser(); if (!user) return;
    const sb = getSupabase();
    await sb
      .from('pending_applications')
      .delete()
      .eq('user_id', user.id)
      .in('status', ['submitted', 'rejected', 'expired', 'cancelled']);
  }
  async getNotifPrefs() {
    const user = await getUser(); if (!user) return [];
    const sb = getSupabase();
    const { data } = await sb.from('user_notification_preferences').select('*').eq('user_id', user.id);
    return data || [];
  }
  async saveNotifPref(notifType: string, field: string, value: boolean | string) {
    const user = await getUser(); if (!user) return;
    const sb = getSupabase();
    const { data: existing } = await sb.from('user_notification_preferences')
      .select('id').eq('user_id', user.id).eq('notification_type', notifType).single();
    if (existing) {
      await sb.from('user_notification_preferences').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await sb.from('user_notification_preferences').insert({
        user_id: user.id, notification_type: notifType, [field]: value,
        email_enabled: field === 'email_enabled' ? value : true,
        sms_enabled: field === 'sms_enabled' ? value : false,
        frequency: field === 'frequency' ? value : 'daily',
      });
    }
  }
  async getNotifLog() {
    const user = await getUser(); if (!user) return [];
    const sb = getSupabase();
    const { data } = await sb.from('notification_log').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50);
    return data || [];
  }
}

// Helper to map Supabase pending_applications row to AppQueueEntry
function mapPendingToQueueEntry(row: Record<string, unknown>): import('./types').AppQueueEntry {
  return {
    id: row.id as string,
    jobTitle: (row.job_title as string) || '',
    company: (row.company_name as string) || '',
    url: (row.job_url as string) || '',
    resumeName: '',
    resumeId: (row.resume_id as string) || '',
    mode: (row.approval_mode as string) || 'manual',
    status: (row.status as string) || 'pending',
    addedAt: (row.created_at as string) || '',
    submittedAt: (row.submitted_at as string) || undefined,
    source: 'dashboard',
  };
}

export class SupabaseStatsProvider implements StatsProvider {
  async getJobCounts() {
    const sb = getSupabase();
    // Use the reliable get_landing_stats RPC
    try {
      const { data, error } = await sb.rpc('get_landing_stats');
      if (!error && data) {
        return {
          total_open: data.jobs ?? 0,
          new_today: 0, // RPC doesn't return this, will get from feed
          total_companies: data.companies ?? 0,
          with_salary: data.with_salary ?? 0,
          remote: data.remote ?? 0,
          metros: data.metros ?? 0,
        };
      }
    } catch { /* RPC may not exist */ }
    // Fallback: direct count from ats_jobs
    const { count: total } = await sb.from('ats_jobs').select('*', { count: 'exact', head: true });
    const { data: companiesData } = await sb.from('ats_jobs').select('company_name').limit(10000);
    const uniqueCompanies = new Set((companiesData || []).map((r: { company_name: string }) => r.company_name)).size;
    return { total_open: total || 0, new_today: 0, total_companies: uniqueCompanies };
  }
  async getSourceBreakdown() {
    const sb = getSupabase();
    // Try materialized view first, fallback to RPC or direct query
    try {
      const { data, error } = await sb.from('mv_source_breakdown').select('*');
      if (!error && data?.length) return data;
    } catch { /* view may not exist */ }
    // Fallback: group by source via RPC or raw query
    const { data } = await sb.rpc('get_source_breakdown').select('*');
    if (data?.length) return data;
    // Last resort: fetch sources and count client-side (not ideal but works)
    const { data: jobs } = await sb.from('ats_jobs').select('source').limit(10000);
    const counts: Record<string, number> = {};
    (jobs || []).forEach((j: { source: string }) => { counts[j.source] = (counts[j.source] || 0) + 1; });
    return Object.entries(counts).map(([source_name, job_count]) => ({ source_name, job_count }));
  }
}

export class SupabaseBillingProvider implements BillingProvider {
  async getBalance() {
    try {
      const bal = await callGateway<any>('get-user-balance', undefined, { method: 'GET', timeout: 10000 });
      return bal?.total || 0;
    } catch {
      // Fallback: sum credit ledger directly
      try {
        const user = await getUser(); if (!user) return 0;
        const sb = getSupabase();
        const { data } = await sb.from('bj_credit_ledger').select('amount').eq('user_id', user.id).eq('voided', false);
        return (data || []).reduce((sum: number, r: { amount: number }) => sum + (r.amount || 0), 0);
      } catch { return 0; }
    }
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
  async getTuning(): Promise<import('./types').TuningData> {
    const user = await getUser(); if (!user) return {} as import('./types').TuningData;
    const sb = getSupabase();
    const { data } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
    return ((data?.user_data as Record<string, unknown>)?.tuning || {}) as import('./types').TuningData;
  }
  async saveTuning(tuningData: import('./types').TuningData) {
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED');
    const sb = getSupabase();
    // Read current user_data, merge tuning into it
    const { data: profile } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
    const existingData = (profile?.user_data as Record<string, unknown>) || {};
    const { error } = await sb.from('profiles').update({
      user_data: { ...existingData, tuning: tuningData },
    }).eq('id', user.id);
    if (error) throw new ProviderError(error.message, 'TUNING_SAVE_FAILED', undefined, error);
  }
  async unhideJob(jobId: string) {
    // Use the hidden_jobs table (same as JobProvider.unhide)
    const sb = getSupabase();
    await sb.from('hidden_jobs').delete().eq('job_id', jobId);
  }
  // Collapse states are UI-only — localStorage is fine here
  async getCollapsedStates() { return safeReadLS<Record<string, boolean>>('bj_pl_collapse', {}); }
  async setCollapsedState(idx: string, collapsed: boolean) {
    const states = safeReadLS<Record<string, boolean>>('bj_pl_collapse', {});
    states[idx] = collapsed;
    safeWriteLS('bj_pl_collapse', states);
  }
}

export class SupabaseChatProvider implements ChatProvider {
  async getHistory() { return safeReadLS<any[]>('bj_chat_history', []); }
  async sendMessage(text: string): Promise<ChatMessage> {
    // Get existing history for context
    const history = safeReadLS<ChatMessage[]>('bj_chat_history', []);
    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    history.push(userMsg);

    try {
      const sessionId = localStorage.getItem('bj_chat_session') || crypto.randomUUID();
      localStorage.setItem('bj_chat_session', sessionId);
      const mode = localStorage.getItem('bj_search_mode') || 'chat';
      const derivedFilters = JSON.parse(localStorage.getItem('bj_chat_derived_filters') || '{}');

      const result = await callGateway<{ reply: string; filters?: Record<string, any> }>('chat-job-search', {
        message: text,
        session_id: sessionId,
        mode,
        filters: derivedFilters,
        history: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
      }, { timeout: 30000 });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result?.reply || 'Sorry, I couldn\'t process that request.',
        timestamp: new Date().toISOString(),
      };
      history.push(assistantMsg);
      safeWriteLS('bj_chat_history', history);

      // If the response includes derived filters, store them
      if (result?.filters) {
        this.applyFilters(result.filters);
      }

      return assistantMsg;
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date().toISOString(),
      };
      history.push(errorMsg);
      safeWriteLS('bj_chat_history', history);
      return errorMsg;
    }
  }
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
  async getGDriveFiles() { return []; /* GDrive integration not yet available */ }
  async connectGDrive() { throw new ProviderError('Google Drive integration is not yet available. Coming soon!', 'GDRIVE_NOT_AVAILABLE'); }
  async disconnectGDrive() { throw new ProviderError('Google Drive integration is not yet available.', 'GDRIVE_NOT_AVAILABLE'); }
  async addGDriveFile(_fileId: string) { throw new ProviderError('Google Drive integration is not yet available.', 'GDRIVE_NOT_AVAILABLE'); }
  async unlinkGDriveFile(_fileId: string) { throw new ProviderError('Google Drive integration is not yet available.', 'GDRIVE_NOT_AVAILABLE'); }
  async importGDriveAsResume(_fileId: string) { throw new ProviderError('Google Drive integration is not yet available.', 'GDRIVE_NOT_AVAILABLE'); }
}

export class SupabaseReferralProvider implements ReferralProvider {
  async getStats() {
    const user = await getUser(); if (!user) return {};
    const sb = getSupabase();
    const { data } = await sb.from('referrals').select('*').eq('referrer_id', user.id);
    const referrals = data || [];
    return {
      totalReferred: referrals.length,
      converted: referrals.filter((r: any) => r.status === 'converted').length,
      creditsEarned: referrals.reduce((sum: number, r: any) => sum + (r.credits_earned || 0), 0),
    };
  }
  async getLeaderboard() {
    const sb = getSupabase();
    const { data } = await sb.from('referrals').select('referrer_id').limit(200);
    const map = new Map<string, number>();
    (data || []).forEach((r: any) => {
      map.set(r.referrer_id, (map.get(r.referrer_id) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([userId, count], i) => ({
        userId,
        displayName: userId.substring(0, 8) + '…',
        referralCount: count,
        rank: i + 1,
      }));
  }
  async getCode() {
    const user = await getUser(); if (!user) return '';
    const sb = getSupabase();
    const { data } = await sb.from('profiles').select('referral_code').eq('id', user.id).single();
    return data?.referral_code || '';
  }
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

// ── Interview Prep Provider (Supabase + Edge Functions) ──

export class SupabaseInterviewPrepProvider implements InterviewPrepProvider {
  async getQuestions(filters?: InterviewQuestionFilters): Promise<InterviewQuestion[]> {
    const sb = getSupabase();
    let query = sb.from('interview_questions').select('*');

    if (filters?.category) query = query.eq('category', filters.category);
    if (filters?.difficulty) query = query.eq('difficulty', filters.difficulty);
    if (filters?.role) query = query.eq('role_cluster', filters.role);
    if (filters?.department) query = query.eq('department', filters.department);
    if (filters?.level) query = query.eq('level', filters.level);
    if (filters?.search) query = query.ilike('question', `%${filters.search}%`);

    query = query.order('created_at', { ascending: false }).limit(200);
    const { data, error } = await query;
    if (error) throw new ProviderError(error.message, 'QUESTIONS_FETCH_FAILED', undefined, error);

    let questions = (data || []) as InterviewQuestion[];

    // Client-side bookmark filter (bookmarks stored in localStorage)
    if (filters?.bookmarked) {
      const bookmarks = safeReadLS<string[]>('bj_interview_bookmarks', []);
      questions = questions.filter(q => bookmarks.includes(q.id));
    }

    return questions;
  }

  async getClusterMeta(): Promise<InterviewClusterMeta> {
    const sb = getSupabase();
    const { data } = await sb.from('interview_questions').select('role_cluster, department, level');
    const roles = new Set<string>();
    const departments = new Set<string>();
    const levels = new Set<string>();
    (data || []).forEach((q: Record<string, string | null>) => {
      if (q.role_cluster) roles.add(q.role_cluster);
      if (q.department) departments.add(q.department);
      if (q.level) levels.add(q.level);
    });
    return {
      roles: Array.from(roles).sort(),
      departments: Array.from(departments).sort(),
      levels: Array.from(levels).sort(),
    };
  }

  async getBookmarks(): Promise<string[]> {
    return safeReadLS<string[]>('bj_interview_bookmarks', []);
  }

  async toggleBookmark(questionId: string): Promise<void> {
    const bookmarks = safeReadLS<string[]>('bj_interview_bookmarks', []);
    const idx = bookmarks.indexOf(questionId);
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
    } else {
      bookmarks.push(questionId);
    }
    safeWriteLS('bj_interview_bookmarks', bookmarks);
  }

  async getSessions(): Promise<InterviewSession[]> {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) return [];
    const { data } = await sb
      .from('interview_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return (data || []) as InterviewSession[];
  }

  async getSession(sessionId: string): Promise<InterviewSession | null> {
    const sb = getSupabase();
    const { data } = await sb
      .from('interview_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();
    return data as InterviewSession | null;
  }

  async startSimulation(params: { questionIds: string[]; jobContext?: string }): Promise<InterviewSession> {
    const result = await callGateway<InterviewSession>('interview-simulate', {
      action: 'start',
      question_ids: params.questionIds,
      job_context: params.jobContext,
    }, { timeout: 15000 });
    return result;
  }

  async sendSimulationMessage(sessionId: string, message: string, history: SimulationMessage[]): Promise<SimulationMessage> {
    const result = await callGateway<{ message: SimulationMessage }>('interview-simulate', {
      action: 'respond',
      session_id: sessionId,
      message,
      history,
    }, { timeout: 30000 });
    return result.message;
  }

  async endSimulation(sessionId: string, history: SimulationMessage[]): Promise<InterviewScorecard> {
    const result = await callGateway<{ scorecard: InterviewScorecard }>('interview-simulate', {
      action: 'end',
      session_id: sessionId,
      history,
    }, { timeout: 30000 });
    return result.scorecard;
  }
}

// ── Dashboard Notification Provider (user-facing) ────────

export class SupabaseDashboardNotificationProvider implements DashboardNotificationProvider {
  async getNotifications(limit = 50): Promise<UserNotification[]> {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) return [];
    const { data } = await sb
      .from('notification_log')
      .select('id, user_id, type, title:subject, body:message, read, action_url, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as unknown as UserNotification[];
  }

  async markRead(notificationId: string): Promise<void> {
    const sb = getSupabase();
    await sb.from('notification_log').update({ read: true }).eq('id', notificationId);
  }

  async markAllRead(): Promise<void> {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) return;
    await sb.from('notification_log').update({ read: true }).eq('user_id', user.id).eq('read', false);
  }

  async getUnreadCount(): Promise<number> {
    const sb = getSupabase();
    const user = await getUser();
    if (!user) return 0;
    const { count } = await sb
      .from('notification_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);
    return count || 0;
  }

  async getPreferences(): Promise<import('./types').NotificationPref | null> {
    const user = await getUser();
    if (!user) return null;
    const sb = getSupabase();
    const { data } = await sb.from('notification_preferences').select('*').eq('user_id', user.id).single();
    return data;
  }

  async updatePreferences(prefs: Partial<import('./types').NotificationPref>): Promise<void> {
    const user = await getUser();
    if (!user) throw new ProviderError('Not authenticated', 'AUTH_REQUIRED', 401);
    const sb = getSupabase();
    const { error } = await sb
      .from('notification_preferences')
      .upsert({ user_id: user.id, ...prefs });
    if (error) throw new ProviderError(error.message, 'NOTIF_PREFS_UPDATE_FAILED', undefined, error);
  }
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
    interviewPrep: new SupabaseInterviewPrepProvider(),
    dashboardNotifications: new SupabaseDashboardNotificationProvider(),
  };
}
