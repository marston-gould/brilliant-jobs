// ============================================================
// admin-bug-review.js — Admin Bug Report Review Panel (FB-13)
// POD2_HANDOFF_FeedbackSystem Section B.3 + FB-13
// Injects a Bug Review section into the admin feedback panel.
// Loads bug_reports from Supabase. Admin marks confirmed,
// sets credits_awarded, and sets status.
// ============================================================
// @ts-nocheck
'use strict';

(function () {

  var _reports = [];
  var _filter  = 'submitted'; // default: show pending

  // ── Entry: called after loadFeedbackTab initialises the panel ──
  function initBugReview() {
    var panel = document.getElementById('admin-panel-feedback');
    if (!panel || document.getElementById('abr-section')) return;

    // Inject Bug Review section after existing feedback UI
    var section = document.createElement('div');
    section.id = 'abr-section';
    section.style.cssText = 'margin-top:32px;border-top:1.5px solid var(--border);padding-top:24px;';
    section.innerHTML = [
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">',
        '<div>',
          '<h3 style="margin:0 0 4px;font-size:17px;font-weight:700;">Bug Reports</h3>',
          '<p style="margin:0;font-size:12px;color:var(--text-faint);">Review and confirm bug reports submitted by users. Confirmed reports award credits.</p>',
        '</div>',
        '<button onclick="window._abrLoad()" style="padding:6px 14px;border:1px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text-dim);font-size:12px;cursor:pointer;">&#8635; Refresh</button>',
      '</div>',

      // Filter pills
      '<div style="display:flex;gap:6px;margin-bottom:16px;" id="abr-pills">',
        _pill('submitted', 'Pending', true),
        _pill('confirmed', 'Confirmed', false),
        _pill('wont_fix',  "Won't Fix", false),
        _pill('duplicate', 'Duplicate', false),
        _pill('all',       'All', false),
      '</div>',

      // Stats row
      '<div id="abr-stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;"></div>',

      // Table
      '<div class="admin-card" style="overflow-x:auto;padding:0;">',
        '<table style="width:100%;border-collapse:collapse;font-size:13px;">',
          '<thead><tr style="background:var(--bg-alt,var(--bg-main));border-bottom:2px solid var(--border);">',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">User</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Submitted</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Page</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Severity</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">What happened</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Status</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Credits</th>',
            '<th style="padding:8px 10px;text-align:left;font-size:11px;font-weight:600;color:var(--text-faint);">Actions</th>',
          '</tr></thead>',
          '<tbody id="abr-tbody"><tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint);">Loading…</td></tr></tbody>',
        '</table>',
      '</div>',
    ].join('');

    panel.appendChild(section);

    // Wire filter pills
    section.querySelectorAll('.abr-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _filter = btn.getAttribute('data-status');
        section.querySelectorAll('.abr-pill').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _renderTable();
      });
    });

    _load();
  }

  function _pill(status, label, active) {
    return '<button class="abr-pill admin-period-btn' + (active ? ' active' : '') + '" data-status="' + status + '">' + label + '</button>';
  }

  // ── Load bug_reports from Supabase ─────────────────────────
  async function _load() {
    var tbody = document.getElementById('abr-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint);">Loading…</td></tr>';
    try {
      var res = await sb.from('bug_reports')
        .select('id,created_at,user_id,what_happened,what_expected,page_name,severity,status,credits_awarded,screenshot_url,admin_notes')
        .order('created_at', { ascending: false })
        .limit(200);
      if (res.error) throw res.error;
      _reports = res.data || [];
      _renderStats();
      _renderTable();
    } catch (e) {
      if (typeof reportError === 'function') reportError('admin_bug_review', e);
      var tbody = document.getElementById('abr-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint);">Error loading reports: ' + escapeHtml(e.message) + '</td></tr>';
    }
  }

  function _renderStats() {
    var statsEl = document.getElementById('abr-stats');
    if (!statsEl) return;
    var counts = { submitted: 0, confirmed: 0, wont_fix: 0, duplicate: 0 };
    var totalCredits = 0;
    _reports.forEach(function(r) {
      if (counts[r.status] !== undefined) counts[r.status]++;
      totalCredits += (r.credits_awarded || 0);
    });
    statsEl.innerHTML = [
      _statCard('Pending', counts.submitted, 'Awaiting review', 'var(--warm)'),
      _statCard('Confirmed', counts.confirmed, 'Valid bugs', 'var(--green)'),
      _statCard('Won\'t Fix / Dup', (counts.wont_fix + counts.duplicate), 'Closed', 'var(--text-faint)'),
      _statCard('Credits Awarded', totalCredits, 'Total across all bugs', 'var(--accent)'),
    ].join('');
  }

  function _statCard(label, value, sub, color) {
    return '<div class="admin-card" style="padding:12px 14px;">' +
      '<div style="font-size:20px;font-weight:700;color:' + color + ';">' + value + '</div>' +
      '<div style="font-size:11px;font-weight:600;color:var(--text-dim);margin-top:1px;">' + label + '</div>' +
      '<div style="font-size:10px;color:var(--text-faint);">' + sub + '</div>' +
      '</div>';
  }

  function _renderTable() {
    var tbody = document.getElementById('abr-tbody');
    if (!tbody) return;
    var rows = _filter === 'all' ? _reports : _reports.filter(function(r) { return r.status === _filter; });
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-faint);">No ' + (_filter === 'all' ? '' : _filter + ' ') + 'bug reports.</td></tr>';
      return;
    }

    var severityColors = { minor: 'var(--text-dim)', blocking: 'var(--warm)', critical: 'var(--red)' };
    var statusColors   = { submitted: 'var(--accent)', confirmed: 'var(--green)', wont_fix: 'var(--text-faint)', duplicate: 'var(--text-faint)' };

    tbody.innerHTML = rows.map(function(r) {
      var sColor = severityColors[r.severity] || 'var(--text-dim)';
      var stColor = statusColors[r.status] || 'var(--text-dim)';
      var date = new Date(r.created_at).toLocaleDateString();
      var snippet = (r.what_happened || '').substring(0, 60) + (r.what_happened && r.what_happened.length > 60 ? '…' : '');
      var screenshotLink = r.screenshot_url
        ? ' <a href="' + escapeHtml('https://qojhagupdnbtomfoxnsf.supabase.co/storage/v1/object/public/user-uploads/' + r.screenshot_url) + '" target="_blank" style="font-size:10px;color:var(--accent);">Screenshot ↗</a>'
        : '';

      var actionsHtml = r.status === 'submitted' ? [
        '<button onclick="window._abrConfirm(\'' + r.id + '\')" style="padding:3px 8px;background:var(--green);color:#fff;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-right:4px;">Confirm</button>',
        '<button onclick="window._abrClose(\'' + r.id + '\',\'wont_fix\')" style="padding:3px 8px;background:var(--bg-input);color:var(--text-dim);border:1px solid var(--border);border-radius:4px;font-size:11px;cursor:pointer;margin-right:4px;">Won\'t Fix</button>',
        '<button onclick="window._abrClose(\'' + r.id + '\',\'duplicate\')" style="padding:3px 8px;background:var(--bg-input);color:var(--text-dim);border:1px solid var(--border);border-radius:4px;font-size:11px;cursor:pointer;">Duplicate</button>',
      ].join('') : '<span style="font-size:11px;color:' + stColor + ';font-weight:500;">' + r.status.replace('_',' ') + '</span>';

      return '<tr style="border-bottom:1px solid var(--border-light,var(--border));">' +
        '<td style="padding:8px 10px;font-size:12px;color:var(--text-faint);">' + escapeHtml((r.user_id || '').substring(0, 8) + '…') + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;color:var(--text-faint);">' + date + '</td>' +
        '<td style="padding:8px 10px;font-size:12px;">' + escapeHtml(r.page_name || '—') + '</td>' +
        '<td style="padding:8px 10px;"><span style="font-size:11px;font-weight:600;color:' + sColor + ';">' + (r.severity || '—') + '</span></td>' +
        '<td style="padding:8px 10px;max-width:260px;">' +
          '<div style="font-size:12px;color:var(--text);">' + escapeHtml(snippet) + screenshotLink + '</div>' +
          (r.what_expected ? '<div style="font-size:11px;color:var(--text-faint);margin-top:1px;">Expected: ' + escapeHtml(r.what_expected.substring(0, 50)) + '</div>' : '') +
        '</td>' +
        '<td style="padding:8px 10px;"><span style="font-size:11px;color:' + stColor + ';">' + (r.status || '—').replace('_',' ') + '</span></td>' +
        '<td style="padding:8px 10px;font-family:var(--mono);font-size:13px;color:' + (r.credits_awarded > 0 ? 'var(--green)' : 'var(--text-faint)') + ';">' + (r.credits_awarded || 0) + '</td>' +
        '<td style="padding:8px 10px;">' + actionsHtml + '</td>' +
        '</tr>';
    }).join('');
  }

  // ── Actions ────────────────────────────────────────────────
  async function _confirm(id) {
    // Read bug_reward config from app_settings cache
    var report = _reports.find(function(r) { return r.id === id; });
    if (!report) return;

    // Determine reward amount
    var standardReward  = 5;
    var criticalReward  = 15;
    try {
      var cached = localStorage.getItem('bj_app_settings');
      if (cached) {
        var s = JSON.parse(cached);
        if (s.bug_reward_standard) standardReward = parseInt(s.bug_reward_standard, 10);
        if (s.bug_reward_critical)  criticalReward  = parseInt(s.bug_reward_critical,  10);
      }
    } catch (e) {}

    var credits = report.severity === 'critical' ? criticalReward : standardReward;
    var confirmMsg = 'Confirm this bug report and award ' + credits + ' credits to the user?\n\nSeverity: ' + report.severity + '\nDefault: ' + (report.severity === 'critical' ? criticalReward : standardReward) + ' credits';
    var customCredits = window.prompt(confirmMsg + '\n\nEnter credit amount (or press OK for default):', String(credits));
    if (customCredits === null) return; // cancelled
    credits = parseInt(customCredits, 10) || credits;

    try {
      var res = await sb.from('bug_reports')
        .update({ status: 'confirmed', credits_awarded: credits })
        .eq('id', id);
      if (res.error) throw res.error;

      // Award credits to user via credit ledger if possible
      if (report.user_id && credits > 0) {
        try {
          await sb.from('credit_transactions').insert({
            user_id:     report.user_id,
            amount:      credits,
            type:        'bug_reward',
            description: 'Bug report confirmed — reward',
            reference_id: id
          });
        } catch (e) {
          // credit_transactions may use different schema — log but don't fail
          console.warn('[BugReview] Credit award failed (non-critical):', e.message);
        }
      }

      if (typeof toastSuccess === 'function') toastSuccess('Bug confirmed, ' + credits + ' credits awarded');
      await _load();
    } catch (e) {
      if (typeof reportError === 'function') reportError('admin_bug_confirm', e);
      if (typeof toastWarning === 'function') toastWarning('Failed to confirm bug: ' + e.message);
    }
  }

  async function _close(id, status) {
    try {
      var res = await sb.from('bug_reports').update({ status: status }).eq('id', id);
      if (res.error) throw res.error;
      if (typeof toastSuccess === 'function') toastSuccess('Bug marked as ' + status.replace('_',' '));
      await _load();
    } catch (e) {
      if (typeof reportError === 'function') reportError('admin_bug_close', e);
      if (typeof toastWarning === 'function') toastWarning('Failed to update bug: ' + e.message);
    }
  }

  // ── Expose globals ─────────────────────────────────────────
  window._abrLoad    = _load;
  window._abrConfirm = _confirm;
  window._abrClose   = _close;

  // ── Auto-init when feedback tab loads ─────────────────────
  // Patch loadFeedbackTab to also init bug review
  var _origLoadFeedbackTab = window.loadFeedbackTab;
  window.loadFeedbackTab = async function() {
    if (typeof _origLoadFeedbackTab === 'function') {
      await _origLoadFeedbackTab();
    }
    // Small delay to let original render complete
    setTimeout(initBugReview, 150);
  };

  // Also expose direct init for manual trigger
  window.initBugReview = initBugReview;

})();
