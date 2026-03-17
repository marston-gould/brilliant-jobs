// @ts-nocheck
// ─── REFERRALS ADMIN TAB ───
// Fraud review queue, reward clawback, ban management
// v5.10: Phase 4

async function loadReferralsAdminTab() {
  try {
    var sb = window.bjSupabase;
    if (!sb) return;

    // Stats
    var { data: allRefs } = await sb.from('referrals').select('status', { count: 'exact' });
    var total = (allRefs || []).length;
    var pending = (allRefs || []).filter(function(r) { return r.status === 'pending'; }).length;
    var rewarded = (allRefs || []).filter(function(r) { return r.status === 'rewarded'; }).length;
    var rejected = (allRefs || []).filter(function(r) { return r.status === 'rejected' || r.status === 'clawed_back'; }).length;

    setAdminText('ar-total-referrals', fmtAdminNum(total));
    setAdminText('ar-pending-review', fmtAdminNum(pending));
    setAdminText('ar-total-rewarded', fmtAdminNum(rewarded));
    setAdminText('ar-total-rejected', fmtAdminNum(rejected));

    // Fraud queue — referrals with fraud_score > 0.2 or fraud_signals not empty
    var { data: flagged } = await sb
      .from('referrals')
      .select('id, referrer_id, referred_id, referred_email, attribution_method, status, fraud_score, fraud_signals, signup_at, ip_address, browser_fingerprint')
      .or('fraud_score.gt.0.2,status.eq.pending')
      .order('fraud_score', { ascending: false })
      .limit(50);

    var queueBody = document.getElementById('ar-fraud-queue-body');
    var queueEmpty = document.getElementById('ar-fraud-empty');
    if (queueBody) {
      if (!flagged || flagged.length === 0) {
        queueBody.innerHTML = '';
        if (queueEmpty) queueEmpty.style.display = '';
      } else {
        if (queueEmpty) queueEmpty.style.display = 'none';
        // Get referrer profiles for display
        var referrerIds = [...new Set(flagged.map(function(r) { return r.referrer_id; }))];
        var { data: profiles } = await sb.from('profiles').select('id, email, full_name').in('id', referrerIds);
        var profileMap = {};
        (profiles || []).forEach(function(p) { profileMap[p.id] = p; });

        queueBody.innerHTML = flagged.map(function(r) {
          var referrer = profileMap[r.referrer_id] || {};
          var signals = r.fraud_signals || {};
          var signalTags = Object.keys(signals).map(function(k) {
            return '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:rgba(239,68,68,.12);color:#dc2626;margin-right:4px;">' + k + '</span>';
          }).join('');
          var scoreColor = r.fraud_score >= 0.8 ? '#dc2626' : r.fraud_score >= 0.4 ? '#ca8a04' : '#16a34a';
          var statusPill = '<span class="ref-status-pill ref-status-' + r.status + '">' + r.status + '</span>';

          return '<tr>' +
            '<td>' + escapeHtml(referrer.email || r.referrer_id.substring(0,8)) + '</td>' +
            '<td>' + escapeHtml(r.referred_email || '—') + '</td>' +
            '<td>' + r.attribution_method + '</td>' +
            '<td><span style="color:' + scoreColor + ';font-weight:700;">' + (r.fraud_score || 0).toFixed(2) + '</span></td>' +
            '<td>' + (signalTags || '—') + '</td>' +
            '<td>' + statusPill + '</td>' +
            '<td style="font-size:11px;">' + new Date(r.signup_at).toLocaleDateString() + '</td>' +
            '<td style="white-space:nowrap;">' +
              (r.status === 'pending' || r.status === 'activated' ? 
                '<button class="merch-btn-sm" onclick="adminRefAction(\'' + r.id + '\',\'' + r.referrer_id + '\',\'approve\')" style="font-size:10px;margin-right:4px;">Approve</button>' +
                '<button class="merch-btn-sm" onclick="adminRefAction(\'' + r.id + '\',\'' + r.referrer_id + '\',\'reject\')" style="font-size:10px;margin-right:4px;color:#dc2626;">Reject</button>' +
                '<button class="merch-btn-sm" onclick="adminRefAction(\'' + r.id + '\',\'' + r.referrer_id + '\',\'ban\')" style="font-size:10px;color:#dc2626;font-weight:700;">Ban</button>'
              : '—') +
            '</td>' +
          '</tr>';
        }).join('');
      }
    }

    // Recent rewards
    var { data: rewards } = await sb
      .from('referral_rewards')
      .select('id, user_id, reward_type, reward_value, tier_at_grant, granted_at, clawed_back_at')
      .order('granted_at', { ascending: false })
      .limit(30);

    var rewardsBody = document.getElementById('ar-rewards-body');
    if (rewardsBody && rewards) {
      var rewardUserIds = [...new Set(rewards.map(function(r) { return r.user_id; }))];
      var { data: rwProfiles } = await sb.from('profiles').select('id, email').in('id', rewardUserIds);
      var rwMap = {};
      (rwProfiles || []).forEach(function(p) { rwMap[p.id] = p; });

      rewardsBody.innerHTML = rewards.map(function(r) {
        var user = rwMap[r.user_id] || {};
        var val = r.reward_value || {};
        var valStr = val.days ? val.days + 'd Pro' : val.credits ? val.credits + ' credits' : val.filters ? '+' + val.filters + ' filter' : JSON.stringify(val);
        var clawed = r.clawed_back_at ? '<span style="color:#dc2626;font-size:10px;">CLAWED BACK</span>' : '';

        return '<tr>' +
          '<td>' + escapeHtml(user.email || r.user_id.substring(0,8)) + '</td>' +
          '<td>' + r.reward_type + '</td>' +
          '<td>' + valStr + ' ' + clawed + '</td>' +
          '<td>T' + r.tier_at_grant + '</td>' +
          '<td style="font-size:11px;">' + new Date(r.granted_at).toLocaleDateString() + '</td>' +
          '<td>' + (!r.clawed_back_at ? '<button class="merch-btn-sm" onclick="adminClawback(\'' + r.id + '\',\'' + r.user_id + '\')" style="font-size:10px;color:#dc2626;">Clawback</button>' : '—') + '</td>' +
        '</tr>';
      }).join('');
    }

    // Banned users
    var { data: banned } = await sb
      .from('profiles')
      .select('id, email, full_name, referral_count')
      .eq('referral_banned', true);

    var bannedBody = document.getElementById('ar-banned-body');
    var bannedEmpty = document.getElementById('ar-banned-empty');
    if (bannedBody) {
      if (!banned || banned.length === 0) {
        bannedBody.innerHTML = '';
        if (bannedEmpty) bannedEmpty.style.display = '';
      } else {
        if (bannedEmpty) bannedEmpty.style.display = 'none';
        bannedBody.innerHTML = banned.map(function(u) {
          return '<tr>' +
            '<td>' + escapeHtml(u.full_name || '—') + '</td>' +
            '<td>' + escapeHtml(u.email) + '</td>' +
            '<td>' + u.referral_count + '</td>' +
            '<td><button class="merch-btn-sm" onclick="adminUnban(\'' + u.id + '\')" style="font-size:10px;">Unban</button></td>' +
          '</tr>';
        }).join('');
      }
    }

  } catch (e) {
    reportError('admin_referrals', e);
    console.error('[Admin] Referrals tab error:', e); toastError('Referrals tab failed to load');
  }
}

// Admin referral actions: approve, reject, ban
window.adminRefAction = async function(referralId, referrerId, action) {
  if (!confirm('Are you sure you want to ' + action + ' this referral?')) return;
  try {
    var sb = window.bjSupabase;
    if (action === 'approve') {
      await sb.from('referrals').update({ status: 'activated', activated_at: new Date().toISOString(), fraud_score: 0 }).eq('id', referralId);
    } else if (action === 'reject') {
      await sb.from('referrals').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('id', referralId);
    } else if (action === 'ban') {
      await sb.from('referrals').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('id', referralId);
      await sb.from('profiles').update({ referral_banned: true }).eq('id', referrerId);
      // Reject all pending referrals from this referrer
      await sb.from('referrals').update({ status: 'rejected', rejected_at: new Date().toISOString() }).eq('referrer_id', referrerId).in('status', ['pending', 'activated']);
    }
    _adminTabInit['referrals'] = false;
    loadReferralsAdminTab();
  } catch (e) {
    reportError('admin_referrals', e);
    console.error('[Admin] Referral action error:', e); toastError('Referral action failed');
    alert('Error: ' + e.message);
  }
};

// Clawback a reward
window.adminClawback = async function(rewardId, userId) {
  if (!confirm('Clawback this reward? This will reverse the reward for the user.')) return;
  try {
    var sb = window.bjSupabase;
    // Mark reward as clawed back
    await sb.from('referral_rewards').update({ clawed_back_at: new Date().toISOString(), clawback_reason: 'Admin manual clawback' }).eq('id', rewardId);

    // Get the reward details to reverse
    var { data: reward } = await sb.from('referral_rewards').select('*').eq('id', rewardId).single();
    if (reward) {
      var val = reward.reward_value || {};
      // Reverse credits
      if (reward.reward_type === 'credits' && val.credits) {
        var { data: latest } = await sb.from('credit_ledger').select('balance_after').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single();
        var curBal = (latest && latest.balance_after) || 0;
        await sb.from('credit_ledger').insert({
          user_id: userId,
          type: 'referral_clawback',
          amount: -val.credits,
          balance_after: Math.max(0, curBal - val.credits),
          description: 'Referral reward clawback — ' + val.credits + ' credits',
          cost_category: 'referral'
        });
      }
      // Reverse Pro time
      if (reward.reward_type === 'pro_time' && val.days) {
        var { data: prof } = await sb.from('profiles').select('pro_bonus_until').eq('id', userId).single();
        if (prof && prof.pro_bonus_until) {
          var newEnd = new Date(prof.pro_bonus_until);
          newEnd.setDate(newEnd.getDate() - val.days);
          if (newEnd < new Date()) newEnd = null;
          await sb.from('profiles').update({ pro_bonus_until: newEnd ? newEnd.toISOString() : null }).eq('id', userId);
        }
      }
      // Reverse extra filters
      if (reward.reward_type === 'extra_filter' && val.filters) {
        await sb.rpc('exec_sql', { query: "UPDATE profiles SET extra_filters = GREATEST(0, extra_filters - " + val.filters + ") WHERE id = '" + userId + "'" });
      }
    }

    _adminTabInit['referrals'] = false;
    loadReferralsAdminTab();
  } catch (e) {
    reportError('admin_referrals', e);
    console.error('[Admin] Clawback error:', e); toastError('Clawback failed');
    alert('Error: ' + e.message);
  }
};

// Unban a referrer
window.adminUnban = async function(userId) {
  if (!confirm('Unban this referrer?')) return;
  try {
    var sb = window.bjSupabase;
    await sb.from('profiles').update({ referral_banned: false }).eq('id', userId);
    _adminTabInit['referrals'] = false;
    loadReferralsAdminTab();
  } catch (e) {
    reportError('admin_referrals', e);
    console.error('[Admin] Unban error:', e); toastError('Unban failed');
  }
};

// CS-P1-004 FE-005: Register admin-referrals exports with BJ namespace
(function() {
  ['adminClawback','adminRefAction','adminUnban'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'admin-referrals', registered: Date.now() };
    }
  });
})();
