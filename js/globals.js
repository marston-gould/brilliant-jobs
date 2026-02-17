// ============================================================
// GLOBALS — Shared state across all dashboard modules
// Must load before all other JS modules
// ============================================================

const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Auth
let currentUser = null;

// Job feed state
var allJobs = [];
var currentJobs = [];
var jobSortStack = [{ field: 'updated_at', asc: false }];
var hiddenJobIds = JSON.parse(localStorage.getItem('bj_hidden_jobs') || '[]');
var savedJobIds = JSON.parse(localStorage.getItem('bj_saved_jobs') || '[]');
var appliedJobIds = JSON.parse(localStorage.getItem('bj_applied_jobs') || '[]');

// Resume state (populated fully in resumes.js)
var resumes = JSON.parse(localStorage.getItem('bj_resumes') || '[]');

// Shared filter color palette (10 colors for numbered filter badges)
var filterColors = ['#6366f1','#f59e0b','#ec4899','#22c55e','#8b5cf6','#ef4444','#06b6d4','#f97316','#14b8a6','#a855f7'];
