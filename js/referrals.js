// ============================================================
// REFERRALS — Referral Hub page logic
// v5.19: Phase 1 — Copy + hero banner + design system alignment
// Spec: referral-hub-redesign-spec v3 (Feb 26, 2026)
// ============================================================

(function () {
  'use strict';

  // ---- State ----
  let referralStats = null;
  let referralHistory = [];

  // ---- Tier labels — spec 3.4: intelligence/data-themed ----
  const TIER_LABELS = ['—', 'Signal', 'Source', 'Radar', 'Intel', 'Clearance'];

  // ---- Badge SVG icons (stroke-based, no emojis — spec audit) ----
  const BADGE_LABELS = {
    signal: {
      name: 'Signal', desc: 'First referral landed',
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h2"/><path d="M6 8v8"/><path d="M10 4v16"/><path d="M14 8v8"/><path d="M18 6v12"/><path d="M22 2v20"/></svg>'
    },
    source: {
      name: 'Source', desc: '3 activated referrals',
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 010 8.49"/><path d="M7.76 16.24a6 6 0 010-8.49"/><path d="M19.07 4.93a10 10 0 010 14.14"/><path d="M4.93 19.07a10 10 0 010-14.14"/></svg>'
    },
    radar: {
      name: 'Radar', desc: 'On the network\u2019s radar',
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4"/></svg>'
    },
    intel: {
      name: 'Intel', desc: 'Feeding intel to the grid',
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
    },
    clearance: {
      name: 'Clearance', desc: 'Top clearance, inner circle',
      icon: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>'
    }
  };

  const ALL_BADGES = ['signal', 'source', 'radar', 'intel', 'clearance'];

  // ---- Init ----
  window.initReferralHub = async function () {
    const container = document.getElementById('ref-hub-content');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading referral data...</div>';

    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      if (!sb) { container.innerHTML = '<div style="padding:20px;color:var(--warm);">Unable to connect.</div>'; return; }

      const { data: { user } } = await sb.auth.getUser();
      if (!user) {
        container.innerHTML = '<div class="ref-empty">Log in to access your referral link and track earnings.</div>';
        return;
      }

      // Fetch stats via RPC
      const { data: stats, error: statsErr } = await sb.rpc('get_referral_stats', { p_user_id: user.id });
      if (statsErr) throw statsErr;
      referralStats = stats;

      // Fetch referral history
      const { data: history } = await sb.from('referrals')
        .select('id, referred_email, attribution_method, status, fraud_score, signup_at, activated_at, rewarded_at')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      referralHistory = history || [];

      renderReferralHub(container);
    } catch (err) {
      console.error('[Referrals] Init error:', err);
      container.innerHTML = '<div class="ref-empty">Unable to load referral data. Refresh to retry.</div>';
    }
  };

  // ---- Render ----
  function renderReferralHub(container) {
    const s = referralStats;
    if (!s) return;

    const tierPct = s.progress_to_next || 0;
    const nextTierAt = s.next_tier_at;
    const remaining = nextTierAt ? nextTierAt - s.referral_count : 0;
    // Spec 3.3: /in/ format for referral links
    const refLink = (s.referral_link || '').replace('/r/', '/in/');

    container.innerHTML = `
      <!-- Hero Banner — spec 3.1: .referral-hero following .feed-hero/.setup-hero pattern -->
      <div class="referral-hero">
        <div style="font-size:18px;font-weight:800;margin-bottom:4px;">
          Share the signal. <span style="color:#f59e0b;">Earn together.</span>
        </div>
        <div style="font-size:12px;color:rgba(255,255,255,0.8);line-height:1.6;max-width:480px;">
          For each friend who signs up and runs their first search: you get 7 days of Pro + 25 AI credits. They get the same.
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-val">${s.referral_count}</div>
            <div class="hero-stat-label">Referrals</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-accent">${TIER_LABELS[s.current_tier] || '\u2014'}</div>
            <div class="hero-stat-label">Current Tier</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-green">${s.stats.rewarded}</div>
            <div class="hero-stat-label">Rewards Earned</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-val hs-dim">${s.stats.total_invites}</div>
            <div class="hero-stat-label">Invites Sent</div>
          </div>
        </div>
      </div>

      <!-- Progress to Next Tier -->
      ${nextTierAt ? `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">Progress to ${TIER_LABELS[s.current_tier + 1] || 'Next Tier'}</span>
          <span style="font-size:13px;color:var(--text-dim);font-family:var(--mono);">${s.referral_count} / ${nextTierAt}</span>
        </div>
        <div class="progress-bar-bg" style="height:6px;">
          <div class="progress-bar-fill" style="width:${Math.min(tierPct, 100)}%;"></div>
        </div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:6px;">${remaining} more referral${remaining !== 1 ? 's' : ''} to unlock ${TIER_LABELS[s.current_tier + 1]} rewards</div>
      </div>
      ` : `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">Clearance \u2014 Max Tier Reached</span>
        </div>
        <div class="progress-bar-bg" style="height:6px;">
          <div class="progress-bar-fill" style="width:100%;background:linear-gradient(90deg,#f59e0b,#f97316);"></div>
        </div>
      </div>
      `}

      <!-- Share Your Link — spec: "Copy Your Link" / "Copy Code" CTAs -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Share Your Link</div>
        <div style="display:flex;gap:8px;margin:12px 0;">
          <input type="text" class="ref-link-input" value="${refLink}" readonly id="ref-link-input" onclick="this.select()" />
          <button class="btn btn-primary btn-sm" onclick="window._refCopyLink()" id="ref-copy-link-btn">Copy Your Link</button>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin:8px 0;font-size:13px;color:var(--text-dim);">
          <span>Your code:</span>
          <span style="font-family:var(--mono);font-weight:700;color:var(--accent);font-size:15px;letter-spacing:1px;" id="ref-code-val">${s.referral_code}</span>
          <button class="btn btn-secondary btn-sm" onclick="window._refCopyCode()" style="margin-left:4px;">Copy Code</button>
        </div>
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="window._refShareLinkedIn()" style="display:flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window._refShareEmail()" style="display:flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
            Email
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window._refShareSMS()" style="display:flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Text
          </button>
        </div>
      </div>

      <!-- Milestones — spec 3.4: SVG icons, no emojis -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Milestones</div>
        <div style="display:flex;gap:12px;margin-top:12px;flex-wrap:wrap;">
          ${ALL_BADGES.map(b => {
            const earned = (s.badges || []).find(x => x.name === b);
            const info = BADGE_LABELS[b];
            return `
              <div style="position:relative;text-align:center;padding:16px 14px;border:1px solid ${earned ? 'var(--accent)' : 'var(--border)'};border-radius:10px;min-width:100px;flex:1;background:${earned ? 'rgba(61,130,246,0.06)' : 'transparent'};opacity:${earned ? '1' : '0.45'};">
                <div style="color:${earned ? 'var(--accent)' : 'var(--text-faint)'};margin-bottom:6px;">${info.icon}</div>
                <div style="font-size:12px;font-weight:600;">${info.name}</div>
                <div style="font-size:10px;color:var(--text-faint);margin-top:2px;">${info.desc}</div>
                ${earned ? '<div style="position:absolute;top:6px;right:8px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Referral History — uses admin-table pattern -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title">Referral History</div>
        ${referralHistory.length === 0 ?
          '<div class="ref-empty">0 referrals. Your link is ready \u2014 each activated signup earns you 7 days Pro + 25 credits.</div>' :
          `<div style="overflow-x:auto;margin-top:12px;">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Channel</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${referralHistory.map(r => `
                  <tr>
                    <td>${maskEmail(r.referred_email)}</td>
                    <td><span class="ref-channel-pill">${r.attribution_method}</span></td>
                    <td><span class="ref-status-pill ref-status-${r.status}">${r.status}</span></td>
                    <td>${formatDate(r.signup_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
        }
      </div>

      <!-- Leaderboard — spec: opt-in toggle uses .toggle-switch standard -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
          Leaderboard
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);cursor:pointer;">
            <div class="toggle-switch" onclick="var cb=this.querySelector('input');cb.checked=!cb.checked;window._refToggleLeaderboard(cb.checked);this.classList.toggle('active',cb.checked);" ${s.sharing_enabled ? 'class="toggle-switch active"' : ''}>
              <input type="checkbox" id="ref-optin-toggle" ${s.sharing_enabled ? 'checked' : ''} style="display:none;" />
              <div class="toggle-slider"></div>
            </div>
            <span style="font-weight:500;">Show my ranking</span>
          </label>
        </div>
        <div id="ref-leaderboard-body">
          ${s.sharing_enabled ? '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>' : '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>'}
        </div>
      </div>
    `;

    // Load leaderboard if opted in
    if (s.sharing_enabled) loadLeaderboard();
  }

  // ---- Share Actions — spec Section 4: rewritten share messages ----
  window._refCopyLink = function () {
    if (!referralStats) return;
    const link = (referralStats.referral_link || '').replace('/r/', '/in/');
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('ref-copy-link-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy Your Link'; }, 2000); }
      trackInvite('copy_link');
    });
  };

  window._refCopyCode = function () {
    if (!referralStats) return;
    navigator.clipboard.writeText(referralStats.referral_code).then(() => {
      const el = document.getElementById('ref-code-val');
      if (el) { const orig = el.textContent; el.textContent = 'Copied!'; setTimeout(() => el.textContent = orig, 2000); }
      trackInvite('copy_code');
    });
  };

  // Spec Section 4 — LinkedIn share
  window._refShareLinkedIn = function () {
    if (!referralStats) return;
    const link = (referralStats.referral_link || '').replace('/r/', '/in/');
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link + '&utm_medium=linkedin')}`, '_blank', 'width=600,height=500');
    trackInvite('linkedin');
  };

  // Spec Section 4 — Email share
  window._refShareEmail = function () {
    if (!referralStats) return;
    const link = (referralStats.referral_link || '').replace('/r/', '/in/');
    const subject = encodeURIComponent('285K+ tracked jobs across 10K companies \u2014 free access');
    const body = encodeURIComponent(`Hey, I\u2019ve been using Brilliant Jobs \u2014 it aggregates real-time job data from 5 major ATS platforms (285K+ positions across 10K+ companies). The AI credits are useful: 25 credits is enough to score 8 resumes against live postings.\n\nSign up with my link and we both get 7 days of Pro + 25 credits: ${link}\n\nOr use my code: ${referralStats.referral_code}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackInvite('email');
  };

  // Spec Section 4 — SMS share
  window._refShareSMS = function () {
    if (!referralStats) return;
    const link = (referralStats.referral_link || '').replace('/r/', '/in/');
    const msg = encodeURIComponent(`285K+ jobs tracked from 10K+ companies. Not a job board \u2014 real ATS data. Free: ${link}`);
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `sms:?body=${msg}`;
    } else {
      navigator.clipboard.writeText(decodeURIComponent(msg));
      alert('Message copied to clipboard! Paste it in your messaging app.');
    }
    trackInvite('sms');
  };

  window._refToggleLeaderboard = async function (enabled) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('profiles').update({ sharing_enabled: enabled }).eq('id', user.id);
      if (enabled) loadLeaderboard();
      else {
        const body = document.getElementById('ref-leaderboard-body');
        if (body) body.innerHTML = '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>';
      }
    } catch (err) {
      console.error('[Referrals] Toggle leaderboard error:', err);
    }
  };

  async function loadLeaderboard() {
    const body = document.getElementById('ref-leaderboard-body');
    if (!body) return;
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data } = await sb.from('referral_leaderboard').select('*').order('rank', { ascending: true }).limit(20);
      if (!data || data.length === 0) {
        body.innerHTML = '<div class="ref-empty">No qualifying referrals this period. Each activated referral earns you a spot.</div>';
        return;
      }
      body.innerHTML = `
        <table class="admin-table" style="margin-top:12px;">
          <thead><tr><th>#</th><th>Referrer</th><th>Referrals</th></tr></thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td style="font-family:var(--mono);font-weight:600;">${r.rank}</td>
                <td>${r.display_name || 'Anonymous'}</td>
                <td style="font-family:var(--mono);">${r.referral_count}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      body.innerHTML = '<div class="ref-empty">Unable to load leaderboard. Refresh to retry.</div>';
    }
  }

  async function trackInvite(channel) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('referral_invites').insert({
        referrer_id: user.id,
        channel: channel,
        utm_medium: channel
      });
    } catch (err) {
      console.error('[Referrals] Track invite error:', err);
    }
  }

  // ---- Helpers ----
  function maskEmail(email) {
    if (!email) return '\u2014';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return local.charAt(0) + '***@' + domain;
  }

  function formatDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- Post-Win Share Modal — spec: "Share the signal" + context-specific data points ----
  window.showReferralShareModal = function (context) {
    const s = referralStats;
    if (!s) return;
    const link = (s.referral_link || '').replace('/r/', '/in/');

    const messages = {
      interview: `Just landed an interview. Brilliant Jobs flagged the role 3 days before it hit LinkedIn:`,
      offer: `Got the offer. Brilliant Jobs tracked the company\u2019s hiring velocity and salary range before I applied:`,
      general: `Using Brilliant Jobs to track real hiring data across 10K+ companies. Worth a look:`
    };
    const msg = messages[context] || messages.general;

    const modal = document.createElement('div');
    modal.className = 'ref-share-modal-overlay';
    modal.innerHTML = `
      <div class="ref-share-modal">
        <button class="ref-share-modal-close" onclick="this.closest('.ref-share-modal-overlay').remove()">&times;</button>
        <div class="ref-share-modal-title">Share the signal</div>
        <div class="ref-share-modal-msg">${msg}</div>
        <div class="ref-share-modal-link">${link}</div>
        <div class="ref-share-modal-actions">
          <button class="btn btn-primary" onclick="window._refCopyLink();this.textContent='Copied!'">Copy Link</button>
          <button class="btn btn-secondary" onclick="window._refShareLinkedIn()">LinkedIn</button>
          <button class="btn btn-secondary" onclick="window._refShareEmail()">Email</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

})();
