// ============================================================
// STATE — All shared mutable state for the dashboard
// Every module imports from here instead of using window globals.
// ============================================================

export const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);
export let currentUser = null;
export function setCurrentUser(u) { currentUser = u; }
export let savedFilters = safeReadLS('bj_saved_filters', []);
export function setSavedFilters(f) { savedFilters = f; }
export let tuningSettings = safeReadLS('bj_tuning', {});
export let tuningLocExclPills = tuningSettings.locationExcludes || [];
export let tuningTitleExclPills = tuningSettings.titleExcludes || [];
export let tuningCoExclPills = tuningSettings.companyExcludes || [];
export let tuningIndExclPills = tuningSettings.industryExcludes || [];
export let levelHierarchy = tuningSettings.levelHierarchy || (typeof DEFAULT_LEVELS !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_LEVELS)) : levelHierarchy);
export function setTuningSettings(t) { tuningSettings = t; }
export function setTuningLocExclPills(p) { tuningLocExclPills = p; }
export function setTuningTitleExclPills(p) { tuningTitleExclPills = p; }
export function setTuningCoExclPills(p) { tuningCoExclPills = p; }
export function setTuningIndExclPills(p) { tuningIndExclPills = p; }
export function setLevelHierarchy(h) { levelHierarchy = h; }
export let whatPills = [];
export let wherePills = [];
export let whenPills = [];
export let whoPills = [];
export let payPills = [];
export let whatNotPills = [];
export let whereNotPills = [];
export let whoNotPills = [];
export function setWhatPills(p) { whatPills = p; }
export function setWherePills(p) { wherePills = p; }
export function setWhenPills(p) { whenPills = p; }
export function setWhoPills(p) { whoPills = p; }
export function setPayPills(p) { payPills = p; }
export function setWhatNotPills(p) { whatNotPills = p; }
export function setWhereNotPills(p) { whereNotPills = p; }
export function setWhoNotPills(p) { whoNotPills = p; }
export const WORKPLACE_WORDS = ['remote','hybrid','onsite','on-site','in-office'];
export const SALARY_RE = /^\$?\d{2,3}k?\+?$/i;
export const DEFAULT_RADIUS = 30;
export let allJobs = [];
export let currentJobs = [];
export let jobSortStack = [{ field: 'updated_at', asc: false }];
export let hiddenJobIds = safeReadLS('bj_hidden_jobs', []);
export let savedJobIds = safeReadLS('bj_saved_jobs', []);
export let appliedJobIds = safeReadLS('bj_applied_jobs', []);
export let searchTimeout = null;
export let currentJobPage = 0;
export const JOBS_PER_PAGE = 50;
export function setAllJobs(j) { allJobs = j; }
export function setCurrentJobs(j) { currentJobs = j; }
export function setJobSortStack(s) { jobSortStack = s; }
export function setHiddenJobIds(h) { hiddenJobIds = h; }
export function setSavedJobIds(s) { savedJobIds = s; }
export function setAppliedJobIds(a) { appliedJobIds = a; }
export function setSearchTimeout(t) { searchTimeout = t; }
export function setCurrentJobPage(p) { currentJobPage = p; }
export let resumes = (() => { try { var r = localStorage.getItem('bj_resumes'); return (!r || r.startsWith('enc:')) ? [] : JSON.parse(r); } catch(e) { return []; } })();
export function setResumes(r) { resumes = r; }
export const filterColors = ['#6366f1','#f59e0b','#ec4899','#22c55e','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6','#a855f7'];

// Sync
const UD_KEYS = { saved_filters:'bj_saved_filters', resumes:'bj_resumes', pipeline_meta:'bj_pipeline_meta', tuning:'bj_tuning', saved_jobs:'bj_saved_jobs', applied_jobs:'bj_applied_jobs', applied_dates:'bj_applied_dates', hidden_jobs:'bj_hidden_jobs', app_queue:'bj_app_queue', app_history:'bj_app_history', readiness:'bj_readiness' };
const UD_LS_TO_SHORT = Object.fromEntries(Object.entries(UD_KEYS).map(([k,v])=>[v,k]));
let _udSyncTimer = null;
let _udPendingKeys = new Set();

export function saveUserData(lsKey, jsonStr) {
  localStorage.setItem(lsKey, jsonStr);
  const shortKey = UD_LS_TO_SHORT[lsKey];
  if (shortKey && currentUser) {
    _udPendingKeys.add(shortKey);
    clearTimeout(_udSyncTimer);
    _udSyncTimer = setTimeout(_flushUserData, 2000);
  }
}

async function _flushUserData() {
  if (!currentUser || _udPendingKeys.size === 0) return;
  const patch = {};
  for (const key of _udPendingKeys) {
    try { patch[key] = safeReadLS(UD_KEYS[key], null); } catch { patch[key] = null; }
  }
  _udPendingKeys.clear();
  try {
    const session = (await sb.auth.getSession())?.data?.session;
    const token = session?.access_token || SUPABASE_KEY;
    await fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.id, {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+token, 'apikey':SUPABASE_KEY, 'Prefer':'return=minimal' },
      body: JSON.stringify({ user_data: Object.assign(safeReadLS('_bj_ud_cache', {}), patch) })
    });
    const cached = safeReadLS('_bj_ud_cache', {});
    Object.assign(cached, patch);
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cached));
    console.log('[sync] Flushed', Object.keys(patch).join(', '));
  } catch(e) { reportError('state', e); console.warn('[sync] Flush error:', e.message); }
}

export async function loadUserData(userId) {
  try {
    const { data, error } = await sb.from('profiles').select('user_data').eq('id', userId).single();
    if (error || !data?.user_data) { console.log('[sync] No cloud data'); return; }
    const cloud = data.user_data;
    localStorage.setItem('_bj_ud_cache', JSON.stringify(cloud));
    let needsSync = false;
    for (const [shortKey, lsKey] of Object.entries(UD_KEYS)) {
      const cloudVal = cloud[shortKey];
      const localParsed = safeReadLS(lsKey, null);
      const isEmpty = v => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
      if (!isEmpty(cloudVal) && isEmpty(localParsed)) { localStorage.setItem(lsKey, JSON.stringify(cloudVal)); }
      else if (isEmpty(cloudVal) && !isEmpty(localParsed)) { needsSync = true; _udPendingKeys.add(shortKey); }
    }
    if (needsSync) _flushUserData();
  } catch(e) { reportError('state', e); console.warn('[sync] Load error:', e.message); }
}

export 
export function rehydrateState() {
  savedFilters = safeReadLS('bj_saved_filters', []);
  tuningSettings = safeReadLS('bj_tuning', {});
  tuningLocExclPills = tuningSettings.locationExcludes || [];
  tuningTitleExclPills = tuningSettings.titleExcludes || [];
  tuningCoExclPills = tuningSettings.companyExcludes || [];
  tuningIndExclPills = tuningSettings.industryExcludes || [];
  levelHierarchy = tuningSettings.levelHierarchy || (typeof DEFAULT_LEVELS !== 'undefined' ? JSON.parse(JSON.stringify(DEFAULT_LEVELS)) : levelHierarchy);
  hiddenJobIds = safeReadLS('bj_hidden_jobs', []);
  savedJobIds = safeReadLS('bj_saved_jobs', []);
  appliedJobIds = safeReadLS('bj_applied_jobs', []);
  resumes = (() => { try { var r = localStorage.getItem('bj_resumes'); return (!r || r.startsWith('enc:')) ? [] : JSON.parse(r); } catch(e) { return []; } })();
}
