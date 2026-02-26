// ============================================================
// REFERRALS — Referral Hub page logic
// v5.08: Phase 2 — Referral Hub + sharing UX
// ============================================================

(function () {
  'use strict';

  // ---- State ----
  let referralStats = null;
  let referralHistory = [];

  // ---- Tier labels ----
  const TIER_LABELS = ['—', 'Starter', 'Advocate', 'Evangelist', 'Champion', 'Ambassador'];
  const BADGE_LABELS = {
    connector: { name: 'Connector', icon: '🔗', desc: '1 referral' },
    advocate: { name: 'Advocate', icon: '📣', desc: '3 referrals' },
    evangelist: { name: 'Evangelist', icon: '🚀', desc: '5 referrals' },
    champion: { name: 'Champion', icon: '🏆', desc: '10 referrals' },
    ambassador: { name: 'Ambassador', icon: '👑', desc: '25 referrals' }
  };

  const ALL_BADGES = ['connector', 'advocate', 'evangelist', 'champion', 'ambassador'];

  // ---- Init ----
  window.initReferralHub = async function () {
    const container = document.getElementById('ref-hub-content');
    if (!container) return;

    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">Loading referral data...</div>';

    try {
      const sb = window.bjSupabase || window.supabase?.createClient?.(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
      if (!sb) { container.innerHTML = '<div style="padding:20px;color:var(--warm);">Unable to connect.</div>'; return; }

      const { data: { user } } = await sb.auth.getUser();
      if (!user) { container.innerHTML = '<div style="padding:20px;">Please log in to view your referral hub.</div>'; return; }

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
      container.innerHTML = '<div style="padding:20px;color:var(--warm);">Error loading referral data. Please try again.</div>';
    }
  };

  // ---- Render ----
  function renderReferralHub(container) {
    const s = referralStats;
    if (!s) return;

    const tierPct = s.progress_to_next || 0;
    const nextTierAt = s.next_tier_at;
    const remaining = nextTierAt ? nextTierAt - s.referral_count : 0;

    container.innerHTML = `
      <!-- Share Banner -->
      <div class="ref-share-banner">
        <div class="ref-share-banner-text">
          <div class="ref-share-title">Invite friends, earn rewards</div>
          <div class="ref-share-subtitle">Both you and your friend get 7 days of Pro + 25 credits when they activate</div>
        </div>
        <div class="ref-share-actions">
          <button class="btn-primary ref-share-btn" onclick="window._refCopyLink()" id="ref-copy-link-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
            Copy Link
          </button>
          <button class="btn-secondary ref-share-btn" onclick="window._refCopyCode()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copy Code
          </button>
        </div>
      </div>

      <!-- Stats Grid -->
      <div class="ref-stats-grid">
        <div class="card ref-stat-card">
          <div class="ref-stat-val">${s.referral_count}</div>
          <div class="ref-stat-label">Total Referrals</div>
        </div>
        <div class="card ref-stat-card">
          <div class="ref-stat-val">${TIER_LABELS[s.current_tier] || 'None'}</div>
          <div class="ref-stat-label">Current Tier</div>
        </div>
        <div class="card ref-stat-card">
          <div class="ref-stat-val">${s.stats.rewarded}</div>
          <div class="ref-stat-label">Rewards Earned</div>
        </div>
        <div class="card ref-stat-card">
          <div class="ref-stat-val">${s.stats.total_invites}</div>
          <div class="ref-stat-label">Invites Sent</div>
        </div>
      </div>

      <!-- Progress to Next Tier -->
      ${nextTierAt ? `
      <div class="card ref-progress-card">
        <div class="ref-progress-header">
          <span class="ref-progress-label">Progress to ${TIER_LABELS[s.current_tier + 1] || 'Next Tier'}</span>
          <span class="ref-progress-count">${s.referral_count} / ${nextTierAt}</span>
        </div>
        <div class="ref-progress-bar-bg">
          <div class="ref-progress-bar-fill" style="width:${Math.min(tierPct, 100)}%"></div>
        </div>
        <div class="ref-progress-hint">${remaining} more referral${remaining !== 1 ? 's' : ''} to unlock ${TIER_LABELS[s.current_tier + 1]} rewards</div>
      </div>
      ` : `
      <div class="card ref-progress-card">
        <div class="ref-progress-header">
          <span class="ref-progress-label">Ambassador — Max Tier Reached!</span>
          <span class="ref-progress-count">👑</span>
        </div>
        <div class="ref-progress-bar-bg">
          <div class="ref-progress-bar-fill" style="width:100%;background:linear-gradient(90deg,#f59e0b,#f97316)"></div>
        </div>
      </div>
      `}

      <!-- Share Options -->
      <div class="card ref-share-card">
        <div class="card-title">Share Your Link</div>
        <div class="ref-link-row">
          <input type="text" class="ref-link-input" value="${s.referral_link}" readonly id="ref-link-input" />
          <button class="btn-primary btn-sm" onclick="window._refCopyLink()">Copy</button>
        </div>
        <div class="ref-code-row">
          <span class="ref-code-label">Your code:</span>
          <span class="ref-code-value" id="ref-code-val">${s.referral_code}</span>
          <button class="btn-secondary btn-sm" onclick="window._refCopyCode()" style="margin-left:8px;">Copy Code</button>
        </div>
        <div class="ref-share-channels">
          <button class="ref-channel-btn" onclick="window._refShareLinkedIn()" title="Share on LinkedIn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            LinkedIn
          </button>
          <button class="ref-channel-btn" onclick="window._refShareEmail()" title="Share via Email">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
            Email
          </button>
          <button class="ref-channel-btn" onclick="window._refShareSMS()" title="Share via Text">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            Text
          </button>
        </div>
      </div>

      <!-- Badges -->
      <div class="card ref-badges-card">
        <div class="card-title">Milestones</div>
        <div class="ref-badges-grid">
          ${ALL_BADGES.map(b => {
            const earned = (s.badges || []).find(x => x.name === b);
            const info = BADGE_LABELS[b];
            return `
              <div class="ref-badge ${earned ? 'earned' : 'locked'}">
                <div class="ref-badge-icon">${info.icon}</div>
                <div class="ref-badge-name">${info.name}</div>
                <div class="ref-badge-desc">${info.desc}</div>
                ${earned ? '<div class="ref-badge-check">✓</div>' : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Referral History -->
      <div class="card ref-history-card">
        <div class="card-title">Referral History</div>
        ${referralHistory.length === 0 ? 
          '<div class="ref-empty">No referrals yet. Share your link to get started!</div>' :
          `<div class="ref-history-table-wrap">
            <table class="ref-history-table">
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

      <!-- Leaderboard Toggle -->
      <div class="card ref-leaderboard-card">
        <div class="card-title" style="display:flex;align-items:center;justify-content:space-between;">
          Leaderboard
          <label class="ref-toggle-label">
            <input type="checkbox" id="ref-optin-toggle" ${s.sharing_enabled ? 'checked' : ''} onchange="window._refToggleLeaderboard(this.checked)" />
            <span class="ref-toggle-text">Opt in</span>
          </label>
        </div>
        <div id="ref-leaderboard-body">
          ${s.sharing_enabled ? '<div style="padding:12px;color:var(--text-dim);font-size:13px;">Loading leaderboard...</div>' : '<div class="ref-empty">Opt in to see how you rank among top referrers.</div>'}
        </div>
      </div>
    `;

    // Load leaderboard if opted in
    if (s.sharing_enabled) loadLeaderboard();
  }

  // ---- Share Actions ----
  window._refCopyLink = function () {
    if (!referralStats) return;
    navigator.clipboard.writeText(referralStats.referral_link).then(() => {
      const btn = document.getElementById('ref-copy-link-btn');
      if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg> Copy Link'; }, 2000); }
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

  window._refShareLinkedIn = function () {
    if (!referralStats) return;
    const text = encodeURIComponent(`I've been using Brilliant Jobs to supercharge my job search — smart filters, AI resume scoring, and 350K+ curated listings. Try it free: ${referralStats.referral_link}`);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralStats.referral_link + '&utm_medium=linkedin')}`, '_blank', 'width=600,height=500');
    trackInvite('linkedin');
  };

  window._refShareEmail = function () {
    if (!referralStats) return;
    const subject = encodeURIComponent('Check out Brilliant Jobs — smarter job search');
    const body = encodeURIComponent(`Hey,\n\nI've been using Brilliant Jobs and wanted to share it with you. It aggregates 350K+ jobs from top ATS platforms with AI-powered resume scoring and smart filters.\n\nSign up with my link and we both get 7 days of Pro + 25 credits:\n${referralStats.referral_link}\n\nOr use my code: ${referralStats.referral_code}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    trackInvite('email');
  };

  window._refShareSMS = function () {
    if (!referralStats) return;
    const msg = encodeURIComponent(`I've been using Brilliant Jobs for my job search — it's great. Try it free with my link: ${referralStats.referral_link}`);
    // Mobile-friendly SMS intent
    const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = `sms:?body=${msg}`;
    } else {
      // Desktop: copy the message
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
        if (body) body.innerHTML = '<div class="ref-empty">Opt in to see how you rank among top referrers.</div>';
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
        body.innerHTML = '<div class="ref-empty">No one on the leaderboard yet. Be the first!</div>';
        return;
      }
      body.innerHTML = `
        <table class="ref-history-table">
          <thead><tr><th>#</th><th>Referrer</th><th>Referrals</th><th>Badge</th></tr></thead>
          <tbody>
            ${data.map(r => `
              <tr>
                <td>${r.rank}</td>
                <td>${r.display_name || 'Anonymous'}</td>
                <td>${r.referral_count}</td>
                <td>${r.highest_badge ? BADGE_LABELS[r.highest_badge]?.icon || '' : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      body.innerHTML = '<div class="ref-empty">Unable to load leaderboard.</div>';
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
    if (!email) return '—';
    const [local, domain] = email.split('@');
    if (!domain) return email;
    return local.charAt(0) + '***@' + domain;
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ---- Post-Win Share Modal (injected into pipeline flow) ----
  window.showReferralShareModal = function (context) {
    // context: 'interview' | 'offer' | 'general'
    const s = referralStats;
    if (!s) return;

    const messages = {
      interview: `I just landed an interview through Brilliant Jobs! Try it free:`,
      offer: `I got a job offer using Brilliant Jobs! Check it out:`,
      general: `I'm loving Brilliant Jobs for my job search. Try it free:`
    };
    const msg = messages[context] || messages.general;

    const modal = document.createElement('div');
    modal.className = 'ref-share-modal-overlay';
    modal.innerHTML = `
      <div class="ref-share-modal">
        <button class="ref-share-modal-close" onclick="this.closest('.ref-share-modal-overlay').remove()">&times;</button>
        <div class="ref-share-modal-title">Share the love!</div>
        <div class="ref-share-modal-msg">${msg}</div>
        <div class="ref-share-modal-link">${s.referral_link}</div>
        <div class="ref-share-modal-actions">
          <button class="btn-primary" onclick="window._refCopyLink();this.textContent='Copied!'">Copy Link</button>
          <button class="btn-secondary" onclick="window._refShareLinkedIn()">LinkedIn</button>
          <button class="btn-secondary" onclick="window._refShareEmail()">Email</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

})();
