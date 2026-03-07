// ============================================================
// REFERRALS — Referral Hub page logic
// v5.25: Phase 4 — Milestone rewards, LinkedIn referral codes, flair system
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
      const history = await safeQuery(() => sb.from('referrals').select('id, referred_email, attribution_method, status, fraud_score, signup_at, activated_at, rewarded_at')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50), { label: 'referrals:referrals', fallback: [] });
      referralHistory = history || [];

      renderReferralHub(container);

      // AC #1-8: Init outreach tracking log + correlation card
      await initReferralTracking();

      // Phase 4A: Check and grant any pending tier bonuses
      if (referralStats && referralStats.current_tier > 0) {
        try {
          const { data: bonusResult } = await sb.rpc('process_tier_bonus', { p_user_id: user.id });
          if (bonusResult && bonusResult.granted && bonusResult.granted.length > 0) {
            bonusResult.granted.forEach(g => {
              const parts = [`${g.credits} credits`];
              if (g.pro_days > 0) parts.push(`${g.pro_days} days Pro`);
              showToast(`🎉 ${g.name} tier unlocked! You earned ${parts.join(' + ')}`, { type: 'success', duration: 6000 });
            });
          }
        } catch(bonusErr) { reportError('referrals', bonusErr); console.warn('[Referrals] Tier bonus check:', bonusErr.message);
        }
      }
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
    const refLink = s.referral_link || '';

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

      <!-- Leaderboard — Phase 3: period toggle, reward grid, countdown, 20-user threshold -->
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          <div class="card-title" style="margin:0;">Leaderboard</div>
          <div style="display:flex;align-items:center;gap:10px;">
            <div id="ref-countdown" style="font-size:11px;color:var(--text-faint);font-family:var(--mono);display:flex;align-items:center;gap:4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span id="ref-countdown-text"></span>
            </div>
            <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-dim);cursor:pointer;">
              <div class="toggle-switch${s.sharing_enabled ? ' active' : ''}">
                <input type="checkbox" id="ref-optin-toggle" ${s.sharing_enabled ? 'checked' : ''} onchange="window._refToggleLeaderboard(this.checked);this.closest('.toggle-switch').classList.toggle('active',this.checked);" />
                <div class="toggle-slider"></div>
              </div>
              <span style="font-weight:500;">Show my ranking</span>
            </label>
          </div>
        </div>

        <!-- Period toggle: Weekly | Monthly — uses admin-period-btn pattern -->
        <div style="display:flex;gap:4px;margin-bottom:14px;" id="ref-period-toggle">
          <button class="admin-period-btn active" data-lb-period="weekly" onclick="window._refSwitchPeriod('weekly')">Weekly</button>
          <button class="admin-period-btn" data-lb-period="monthly" onclick="window._refSwitchPeriod('monthly')">Monthly</button>
        </div>

        <!-- Reward tier merchandising grid — spec 3.5 -->
        <div id="ref-reward-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;"></div>

        <div id="ref-leaderboard-body">
          ${s.sharing_enabled ? '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>' : '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>'}
        </div>
      </div>
    `;

    // Render reward grid and countdown for initial period
    renderRewardGrid('weekly');
    startCountdown();

    // Load leaderboard if opted in
    if (s.sharing_enabled) loadLeaderboard('weekly');
  }

  // ---- Share Actions — spec Section 4: rewritten share messages ----
  window._refCopyLink = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
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
    const link = referralStats.referral_link || '';
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link + '&utm_medium=linkedin')}`, '_blank', 'width=600,height=500');
    trackInvite('linkedin');
  };

  // Spec Section 4 — Email share
  window._refShareEmail = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
    const subject = encodeURIComponent('285K+ tracked jobs across 10K companies \u2014 free access');
    const body = encodeURIComponent(`Hey, I\u2019ve been using Brilliant Jobs \u2014 it aggregates real-time job data from 5 major ATS platforms (285K+ positions across 10K+ companies). The AI credits are useful: 25 credits is enough to score 8 resumes against live postings.

Sign up with my link and we both get 7 days of Pro + 25 credits: ${link}

Or use my code: ${referralStats.referral_code}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackInvite('email');
  };

  // Spec Section 4 — SMS share
  window._refShareSMS = function () {
    if (!referralStats) return;
    const link = referralStats.referral_link || '';
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

  // ---- Leaderboard state ----
  let _lbPeriod = 'weekly';
  let _countdownInterval = null;

  // ---- Reward tier definitions (spec 3.5) ----
  const REWARD_TIERS = {
    weekly: [
      { rank: '#1', credits: 50, proDays: 14, color: '#f59e0b', gold: true },
      { rank: '#2–3', credits: 25, proDays: 7, color: '#3b82f6', gold: false },
      { rank: '#4–10', credits: 10, proDays: 0, color: '#8b5cf6', gold: false },
      { rank: 'Top 10%', credits: 5, proDays: 0, color: '#64748b', gold: false },
    ],
    monthly: [
      { rank: '#1', credits: 100, proDays: 30, color: '#f59e0b', gold: true },
      { rank: '#2–3', credits: 50, proDays: 14, color: '#3b82f6', gold: false },
      { rank: '#4–10', credits: 25, proDays: 7, color: '#8b5cf6', gold: false },
      { rank: 'Top 25%', credits: 10, proDays: 0, color: '#64748b', gold: false },
    ]
  };

  function renderRewardGrid(period) {
    const grid = document.getElementById('ref-reward-grid');
    if (!grid) return;
    const tiers = REWARD_TIERS[period] || REWARD_TIERS.weekly;
    grid.innerHTML = tiers.map(t => `
      <div style="text-align:center;padding:12px 8px;border:1px solid var(--border);border-radius:10px;background:var(--bg-card);position:relative;${t.gold ? 'border-top:3px solid #f59e0b;' : ''}">
        <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${t.color};margin-bottom:4px;">${t.rank}</div>
        <div style="font-family:var(--mono);font-size:20px;font-weight:800;color:var(--text);line-height:1;">${t.credits}</div>
        <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">credits</div>
        ${t.proDays ? `<div style="display:inline-block;margin-top:6px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;background:${t.color}20;color:${t.color};">${t.proDays}d Pro</div>` : ''}
      </div>
    `).join('');
  }

  function startCountdown() {
    if (_countdownInterval) clearInterval(_countdownInterval);
    function update() {
      const el = document.getElementById('ref-countdown-text');
      if (!el) return;
      const now = new Date();
      let target;
      if (_lbPeriod === 'weekly') {
        // Next Monday 00:00 UTC
        target = new Date(now);
        target.setUTCHours(0, 0, 0, 0);
        const day = target.getUTCDay();
        const daysUntilMon = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
        target.setUTCDate(target.getUTCDate() + daysUntilMon);
      } else {
        // Next 1st of month 00:00 UTC
        target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      }
      const diff = target - now;
      if (diff <= 0) { el.textContent = 'Resetting...'; return; }
      const days = Math.floor(diff / 86400000);
      const hrs = Math.floor((diff % 86400000) / 3600000);
      el.textContent = `Resets in ${days}d ${hrs}h`;
    }
    update();
    _countdownInterval = setInterval(update, 60000);
  }

  window._refSwitchPeriod = function (period) {
    _lbPeriod = period;
    // Toggle active button
    document.querySelectorAll('#ref-period-toggle .admin-period-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lbPeriod === period);
    });
    renderRewardGrid(period);
    startCountdown();
    const toggle = document.getElementById('ref-optin-toggle');
    if (toggle && toggle.checked) loadLeaderboard(period);
  };

  window._refToggleLeaderboard = async function (enabled) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      var { error: shareErr } = await sb.from('profiles').update({ sharing_enabled: enabled }).eq('id', user.id);
      if (shareErr) { reportError('referrals:toggle-leaderboard', shareErr); return; }
      if (enabled) loadLeaderboard(_lbPeriod);
      else {
        const body = document.getElementById('ref-leaderboard-body');
        if (body) body.innerHTML = '<div class="ref-empty">Top referrers earn credits and Pro time every week. Show your ranking to compete.</div>';
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Toggle leaderboard error:', err);
    }
  };

  async function loadLeaderboard(period) {
    const body = document.getElementById('ref-leaderboard-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>';
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();

      // Use get_leaderboard RPC (Phase 2)
      const { data, error } = await sb.rpc('get_leaderboard', {
        p_period_type: period || 'weekly',
        p_user_id: user?.id || null
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Check 20-user threshold — count opted-in users
        const { count, error: cntErr } = await sb.from('profiles').select('*', { count: 'exact', head: true }).eq('sharing_enabled', true);
        if (cntErr) reportError('referrals:leaderboard-count', cntErr);
        const optedIn = count || 0;
        if (optedIn < 20) {
          body.innerHTML = `
            <div style="padding:20px;text-align:center;">
              <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${optedIn} of 20 users opted in</div>
              <div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden;max-width:200px;margin:0 auto;">
                <div style="height:100%;width:${Math.min((optedIn / 20) * 100, 100)}%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);border-radius:3px;transition:width .4s;"></div>
              </div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:8px;">Leaderboard activates at 20 opted-in users</div>
            </div>
          `;
        } else {
          body.innerHTML = '<div class="ref-empty">No qualifying referrals this period. Each activated referral earns you a spot.</div>';
        }
        return;
      }

      // Render leaderboard table with "Earning" column + Phase 4C flair
      body.innerHTML = `
        <table class="admin-table" style="margin-top:4px;">
          <thead><tr><th>#</th><th>Referrer</th><th>Referrals</th><th>Earning</th></tr></thead>
          <tbody>
            ${data.map(r => {
              const earningParts = [];
              if (r.earning_credits > 0) earningParts.push(`${r.earning_credits} cr`);
              if (r.earning_pro_days > 0) earningParts.push(`${r.earning_pro_days}d Pro`);
              const earning = earningParts.length ? earningParts.join(' + ') : '\u2014';
              const isMe = r.is_me;
              const tier = r.tier || 0;
              // Phase 4C: Flair based on tier
              const flairIcon = tier >= 1 ? BADGE_LABELS[ALL_BADGES[Math.min(tier - 1, 4)]]?.icon || '' : '';
              const nameStyle = tier >= 5 ? 'color:#f59e0b;font-weight:700;' : tier >= 3 ? 'color:var(--accent);font-weight:600;' : '';
              const nameIcon = tier >= 1 ? `<span style="display:inline-flex;vertical-align:middle;margin-inline-end:4px;width:16px;height:16px;${tier >= 5 ? 'color:#f59e0b;' : tier >= 3 ? 'color:var(--accent);' : 'color:var(--text-faint);'}">${flairIcon.replace(/width="26"/g, 'width="14"').replace(/height="26"/g, 'height="14"')}</span>` : '';
              const topBadge = tier >= 5 ? ' <span style="font-size:9px;padding:1px 6px;border-radius:4px;background:rgba(245,158,11,0.12);color:#f59e0b;font-weight:700;letter-spacing:.3px;vertical-align:middle;">TOP REFERRER</span>' : '';
              return `
                <tr style="${isMe ? 'background:rgba(59,130,246,0.06);' : ''}">
                  <td style="font-family:var(--mono);font-weight:700;${r.rank === 1 ? 'color:#f59e0b;' : ''}">${r.rank}</td>
                  <td style="${nameStyle}">${nameIcon}${r.display_name || 'Anonymous'}${isMe ? ' <span style="font-size:10px;color:var(--accent);font-weight:600;">(you)</span>' : ''}${topBadge}</td>
                  <td style="font-family:var(--mono);">${r.referral_count}</td>
                  <td style="font-family:var(--mono);font-size:12px;color:var(--text-dim);">${earning}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error('[Referrals] Leaderboard error:', err);
      body.innerHTML = '<div class="ref-empty">Unable to load leaderboard. Refresh to retry.</div>';
    }
  }

  async function trackInvite(channel) {
    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      const { data: { user } } = await sb.auth.getUser();
      var { error: invErr } = await sb.from('referral_invites').insert({
        referrer_id: user.id,
        channel: channel,
        utm_medium: channel
      });
      if (invErr) reportError('referrals:track-invite', invErr);
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Track invite error:', err);
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
    const link = s.referral_link || '';

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

// ============================================================
// REFERRAL OUTREACH TRACKING — v7.09 Pod 1 UI Layer
// Spec: HANDOFF_REFERRAL_TRACKING_POD1.docx
// AC #1-8: Log view, status controls, correlation card, PostHog
// ============================================================

(function () {
  'use strict';

  // ---- State ----
  let _outreachRows = [];
  let _correlationData = null;

  // ---- Status badge colors ----
  const STATUS_COLORS = {
    sent: '#3b82f6',
    pending: '#f59e0b',
    accepted: '#22c55e',
    declined: '#64748b'
  };

  // ---- Date formatter: "Mar 3" or "Mar 3, 2025" ----
  function formatOutreachDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const opts = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-US', opts);
  }

  // ---- Status badge HTML ----
  function statusBadge(status) {
    const color = STATUS_COLORS[status] || '#64748b';
    const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
    return `<span style="display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${color}18;color:${color};border:1px solid ${color}30;">
      <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>${label}
    </span>`;
  }

  // ---- Channel badge HTML ----
  function channelBadge(channel) {
    const isLinkedIn = channel === 'linkedin';
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:var(--bg-input);color:var(--text-dim);">
      ${isLinkedIn
        ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>'
        : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>'
      }
      ${isLinkedIn ? 'LinkedIn' : 'Email'}
    </span>`;
  }

  // ---- Render correlation card ----
  function renderCorrelationCard(data) {
    if (!data) return '';
    const totalSent = data.total_sent || 0;

    if (totalSent < 3) {
      return `
        <div class="card" style="padding:16px 20px;margin-bottom:20px;">
          <div class="card-title" style="margin-bottom:12px;">Referral vs. Cold Comparison</div>
          <div style="font-size:13px;color:var(--text-dim);text-align:center;padding:12px 0;">
            Send more outreach to unlock referral vs. cold stats.
          </div>
        </div>
      `;
    }

    const rate = data.acceptance_rate != null ? Math.round(data.acceptance_rate) : 0;
    const stats = [
      { label: 'Outreach Sent', val: totalSent, mono: true },
      { label: 'Acceptance Rate', val: `${rate}%`, mono: true, color: '#22c55e' },
      { label: 'Applied w/ Referral', val: data.applied_with_referral || 0, mono: true, color: '#3b82f6' },
      { label: 'Applied Cold', val: data.applied_cold || 0, mono: true, color: '#64748b' }
    ];

    return `
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title" style="margin-bottom:14px;">Referral vs. Cold Comparison</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
          ${stats.map(s => `
            <div style="text-align:center;">
              <div style="font-family:var(--mono);font-size:22px;font-weight:800;color:${s.color || 'var(--text)'};line-height:1.1;">${s.val}</div>
              <div style="font-size:11px;color:var(--text-faint);margin-top:4px;line-height:1.3;">${s.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ---- Render single outreach row ----
  function renderOutreachRow(row) {
    const statusOptions = ['sent', 'pending', 'accepted', 'declined'];
    const selectOptions = statusOptions.map(s =>
      `<option value="${s}" ${row.status === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    const referralLinkBtn = (row.referral_link && row.referral_link.trim())
      ? `<a href="${row.referral_link}" target="_blank" rel="noopener noreferrer"
           style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;background:#2e6da4;text-decoration:none;white-space:nowrap;"
           onclick="window._trackReferralLinkClick('${row.id}')">
           Apply via referral link →
         </a>`
      : '';

    // Referral link input (shown when accepted, if no link yet)
    const linkInputHtml = (row.status === 'accepted' && !row.referral_link)
      ? `<div style="margin-top:6px;display:flex;gap:6px;align-items:center;">
           <input type="text" placeholder="Paste referral link (optional)" 
             style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);"
             id="ref-link-input-${row.id}" />
           <button onclick="window._saveReferralLink('${row.id}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;cursor:pointer;">Save</button>
         </div>`
      : '';

    return `
      <tr data-outreach-id="${row.id}">
        <td>
          <div style="font-size:13px;font-weight:600;color:var(--text);">${row.job_title || '—'}</div>
          <div style="font-size:11px;color:var(--text-faint);margin-top:2px;">${row.company || '—'}</div>
        </td>
        <td>${channelBadge(row.channel)}</td>
        <td style="font-size:13px;color:var(--text-dim);">${row.their_name || '—'}</td>
        <td>
          <div id="ref-badge-${row.id}">${statusBadge(row.status)}</div>
        </td>
        <td style="font-size:12px;color:var(--text-faint);white-space:nowrap;">${formatOutreachDate(row.sent_at)}</td>
        <td>
          ${referralLinkBtn}
          <div style="${referralLinkBtn ? 'margin-top:6px;' : ''}">
            <select
              style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);cursor:pointer;"
              onchange="window._updateOutreachStatus('${row.id}', this.value, this)">
              ${selectOptions}
            </select>
          </div>
          ${linkInputHtml}
        </td>
      </tr>
    `;
  }

  // ---- Render outreach log table ----
  function renderOutreachLog(rows) {
    if (!rows || rows.length === 0) {
      return `
        <div style="text-align:center;padding:28px 16px;">
          <div style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">No outreach sent yet. Use Request Referral from any job to get started.</div>
          <button class="btn btn-secondary btn-sm" onclick="window.navigateTo && window.navigateTo('feed')">Browse Jobs →</button>
        </div>
      `;
    }

    return `
      <div style="overflow-x:auto;margin-top:12px;">
        <table class="admin-table" style="min-width:600px;">
          <thead>
            <tr>
              <th>Job / Company</th>
              <th>Channel</th>
              <th>Their Name</th>
              <th>Status</th>
              <th>Sent</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(renderOutreachRow).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ---- Main init function (called from initReferralHub) ----
  window.initReferralTracking = async function () {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;

    // Fetch outreach + correlation in parallel
    const [outreachResult, correlationResult] = await Promise.allSettled([
      sb.rpc('get_referral_outreach'),
      sb.rpc('get_referral_correlation')
    ]);

    _outreachRows = (outreachResult.status === 'fulfilled' && outreachResult.value.data) ? outreachResult.value.data : [];
    _correlationData = (correlationResult.status === 'fulfilled' && correlationResult.value.data) ? correlationResult.value.data : null;
    if (outreachResult.status === 'fulfilled' && outreachResult.value.error) reportError('referrals:outreach-rpc', outreachResult.value.error);
    if (correlationResult.status === 'fulfilled' && correlationResult.value.error) reportError('referrals:correlation-rpc', correlationResult.value.error);
    if (outreachResult.status === 'rejected') reportError('referrals:outreach-rejected', outreachResult.reason);
    if (correlationResult.status === 'rejected') reportError('referrals:correlation-rejected', correlationResult.reason);

    // PostHog: referral_log_viewed
    if (window.posthog) {
      window.posthog.capture('referral_log_viewed', { row_count: _outreachRows.length });
    }

    // Inject tracking section into ref-hub-content (after existing content)
    const container = document.getElementById('ref-hub-content');
    if (!container) return;

    // Remove existing tracking section if already rendered
    const existing = document.getElementById('ref-tracking-section');
    if (existing) existing.remove();

    const section = document.createElement('div');
    section.id = 'ref-tracking-section';
    section.innerHTML = `
      ${renderCorrelationCard(_correlationData)}
      <div class="card" style="padding:16px 20px;margin-bottom:20px;">
        <div class="card-title" style="margin-bottom:0;">Referral Outreach</div>
        <div id="ref-outreach-log">
          ${renderOutreachLog(_outreachRows)}
        </div>
      </div>
    `;
    container.appendChild(section);
  };

  // ---- Status update handler ----
  window._updateOutreachStatus = async function (rowId, newStatus, selectEl) {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;

    const row = _outreachRows.find(r => r.id === rowId);
    const oldStatus = row ? row.status : null;

    try {
      const params = { p_outreach_id: rowId, p_new_status: newStatus };
      await sb.rpc('update_referral_status', params);

      // Update in-memory state
      if (row) row.status = newStatus;

      // Patch badge in-place
      const badgeEl = document.getElementById(`ref-badge-${rowId}`);
      if (badgeEl) badgeEl.innerHTML = statusBadge(newStatus);

      // If accepted, show referral link input inline (if no link yet)
      if (newStatus === 'accepted') {
        const tr = selectEl.closest('tr');
        if (tr && !row?.referral_link) {
          const actionCell = tr.querySelector('td:last-child');
          if (actionCell && !actionCell.querySelector(`#ref-link-input-${rowId}`)) {
            const inputWrap = document.createElement('div');
            inputWrap.style.marginTop = '6px';
            inputWrap.style.display = 'flex';
            inputWrap.style.gap = '6px';
            inputWrap.innerHTML = `
              <input type="text" id="ref-link-input-${rowId}" placeholder="Paste referral link (optional)"
                style="flex:1;font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-input);color:var(--text);" />
              <button onclick="window._saveReferralLink('${rowId}')" style="padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;background:var(--accent);color:#fff;border:none;cursor:pointer;">Save</button>
            `;
            actionCell.appendChild(inputWrap);
          }
        }
      }

      // PostHog: referral_status_changed
      if (window.posthog) {
        window.posthog.capture('referral_status_changed', {
          old_status: oldStatus,
          new_status: newStatus,
          has_referral_link: !!(row && row.referral_link)
        });
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Status update error:', err);
    }
  };

  // ---- Save referral link after accepting ----
  window._saveReferralLink = async function (rowId) {
    const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    if (!sb) return;
    const input = document.getElementById(`ref-link-input-${rowId}`);
    const link = input ? input.value.trim() : '';
    if (!link) return;

    try {
      await sb.rpc('update_referral_status', {
        p_outreach_id: rowId,
        p_new_status: 'accepted',
        p_referral_link: link
      });

      // Update in-memory + UI
      const row = _outreachRows.find(r => r.id === rowId);
      if (row) row.referral_link = link;

      const tr = input ? input.closest('tr') : null;
      if (tr) {
        const actionCell = tr.querySelector('td:last-child');
        if (actionCell) {
          // Replace input area with apply button
          const inputWrap = input.closest('div');
          if (inputWrap) inputWrap.remove();
          const btn = document.createElement('a');
          btn.href = link;
          btn.target = '_blank';
          btn.rel = 'noopener noreferrer';
          btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;background:#2e6da4;text-decoration:none;margin-top:6px;';
          btn.textContent = 'Apply via referral link →';
          btn.onclick = () => window._trackReferralLinkClick(rowId);
          actionCell.insertBefore(btn, actionCell.firstChild);
        }
      }
    } catch(err) { reportError('referrals', err); console.error('[Referrals] Save referral link error:', err);
    }
  };

  // ---- Referral link click tracker ----
  window._trackReferralLinkClick = function (rowId) {
    const row = _outreachRows.find(r => r.id === rowId);
    if (window.posthog) {
      window.posthog.capture('referral_link_clicked', {
        job_id: row ? row.job_id : null
      });
    }
  };

  // CS-P1-004 FE-005: Register referrals.js exports with BJ namespace
  [
    'initReferralHub', '_refCopyLink', '_refCopyCode', '_refShareLinkedIn',
    '_refShareEmail', '_refShareSMS', '_refSwitchPeriod', '_refToggleLeaderboard',
    'showReferralShareModal', 'initReferralTracking', '_updateOutreachStatus',
    '_saveReferralLink', '_trackReferralLinkClick'
  ].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'referrals', registered: Date.now() };
    }
  });

})();
