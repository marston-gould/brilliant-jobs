/**
 * /api/referral-lookup.js — Username-based referral link handler
 * 
 * Handles /:username → /api/referral-lookup?u=:username rewrites.
 * Looks up the username in profiles, fires attribution, redirects to landing.
 * 
 * Spec: POD2_HANDOFF_SubscriptionFixes SUB-06
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';

// Reserved paths that are NOT usernames — static routes, SPA pages, etc.
const RESERVED = new Set([
  'admin', 'app', 'api', 'billing', 'benefits', 'compare', 'dashboard',
  'data-lab', 'feed', 'ghost-report', 'help', 'hiring-trends', 'index',
  'install', 'jobs', 'login', 'market', 'notifications', 'pipeline',
  'pricing', 'privacy', 'referral', 'referrals', 'roadmap', 'salary',
  'settings', 'signup', 'stats', 'subscription', 'survey', 'terms',
  'tuning', 'uninstall', 'r', 'img', 'js', 'css', 'fonts', 'dist',
  'blog', 'college-major-outcomes', 'jobs-by-location', 's',
]);

module.exports = async (req, res) => {
  const username = (req.query.u || '').toLowerCase().trim();

  // Not a username — fall through to 404
  if (!username || RESERVED.has(username) || username.length < 3) {
    res.status(404).send('Not found');
    return;
  }

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data } = await sb
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (!data) {
      // Username not found — redirect to landing with no referral
      res.redirect(302, '/?ref_miss=1');
      return;
    }

    // Username found — redirect to landing with ?u= param for referral capture
    res.redirect(302, `/?u=${encodeURIComponent(username)}`);
  } catch {
    // On error, just redirect to landing
    res.redirect(302, '/');
  }
};
