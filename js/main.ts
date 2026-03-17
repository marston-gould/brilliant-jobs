// @ts-nocheck
// ============================================================
// MAIN — Vite entry point. Imports all modules in load order.
// Replaces the 14 custom <script> tags in dashboard.html.
//
// External libs loaded via <script> tags in HTML (before this):
// - supabase.min.js (window.supabase)
// - pdf.js (window.pdfjsLib)
// - mammoth.js (window.mammoth)
// ============================================================

import './query-builder.js';
import './job-feed.js';
import './sort-bar.js';
import './keywords.js';
import './browsers.js';
import './location.js';
import './pipeline.js';
import './tuning.js';
import './resumes.js';
import './integrations.js';
import './applications.js';
import './settings.js';
import './billing.js';
import './fingerprint.js';
import './referrals.js';
import './app.js';
