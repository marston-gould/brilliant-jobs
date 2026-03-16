// js/linkedin.js
// SPEC-LPG-001-S2: LinkedIn Profile Optimizer (F3)
// Renders score gauge, section cards, top actions on LinkedIn tab.

(function () {
  'use strict';

  var _linkedinInited = false;

  // --- Score color helper ---
  function _scoreColor(score) {
    if (score >= 75) return 'var(--green, #22c55e)';
    if (score >= 50) return 'var(--accent, #6366f1)';
    return 'var(--warm, #e24b4a)';
  }

  // --- SVG Score Gauge ---
  function _renderScoreGauge(container, score) {
    var r = 50, cx = 60, cy = 60, circumference = 2 * Math.PI * r;
    var offset = circumference - (score / 100) * circumference;
    var color = _scoreColor(score);
    container.innerHTML =
      '<svg width="120" height="120" viewBox="0 0 120 120">' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--border)" stroke-width="10"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="10" ' +
      'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" ' +
      'stroke-linecap="round" transform="rotate(-90 ' + cx + ' ' + cy + ')" style="transition:stroke-dashoffset 0.8s ease;"/>' +
      '<text x="' + cx + '" y="' + (cy + 8) + '" text-anchor="middle" fill="' + color + '" font-size="28" font-weight="800">' + score + '</text>' +
      '</svg>';
  }

  // --- Section Card ---
  function _renderSectionCard(name, data) {
    var label = name.charAt(0).toUpperCase() + name.slice(1);
    var score = data.score || 0;
    var color = _scoreColor(score);
    var recs = (data.recommendations || []).map(function (r) {
      var esc = (typeof escHtml === 'function') ? escHtml(r) : r.replace(/</g, '&lt;');
      return '<div style="font-size:11px;color:var(--text);line-height:1.6;padding:4px 0;border-bottom:1px solid var(--border);">' + esc + '</div>';
    }).join('');

    return '<div class="card" style="padding:16px 18px;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<div style="font-weight:700;font-size:13px;">' + label + '</div>' +
      '<div style="font-size:20px;font-weight:800;color:' + color + ';">' + score + '</div>' +
      '</div>' +
      '<div style="height:4px;background:var(--bg-input);border-radius:2px;margin-bottom:12px;overflow:hidden;">' +
      '<div style="height:100%;width:' + score + '%;background:' + color + ';border-radius:2px;transition:width 0.5s;"></div>' +
      '</div>' +
      recs +
      '</div>';
  }

  // --- Load + Render ---
  function _renderLinkedInResults(data) {
    var scoreSection = document.getElementById('li-score-section');
    var noProfile = document.getElementById('li-no-profile');
    var loading = document.getElementById('li-loading');

    if (loading) loading.style.display = 'none';
    if (noProfile) noProfile.style.display = 'none';
    if (scoreSection) scoreSection.style.display = 'block';

    // Overall score gauge
    var gauge = document.getElementById('li-score-gauge');
    if (gauge) _renderScoreGauge(gauge, data.overall_score || 0);

    // Label
    var label = document.getElementById('li-overall-label');
    if (label) {
      var s = data.overall_score || 0;
      var grade = s >= 75 ? 'Strong Profile' : s >= 50 ? 'Needs Improvement' : 'Weak Profile';
      label.textContent = 'Score: ' + s + '/100 — ' + grade;
    }

    // Cache info
    var cacheInfo = document.getElementById('li-cache-info');
    if (cacheInfo) {
      if (data.cached) {
        var exp = new Date(data.expires_at);
        var days = Math.max(0, Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        cacheInfo.textContent = 'Cached result — expires in ' + days + ' day' + (days !== 1 ? 's' : '') + '.';
      } else {
        cacheInfo.textContent = 'Fresh analysis — cached for 7 days.';
      }
    }

    // Top 3 actions
    var topActions = document.getElementById('li-top-actions');
    var topList = document.getElementById('li-top-actions-list');
    if (topActions && topList && data.top_3_actions && data.top_3_actions.length > 0) {
      topActions.style.display = 'block';
      topList.innerHTML = data.top_3_actions.map(function (a, i) {
        var esc = (typeof escHtml === 'function') ? escHtml(a) : a.replace(/</g, '&lt;');
        return '<div>' + (i + 1) + '. ' + esc + '</div>';
      }).join('');
    }

    // Section cards
    var sectionsEl = document.getElementById('li-sections');
    if (sectionsEl && data.sections) {
      var order = ['headline', 'summary', 'experience', 'skills', 'education'];
      sectionsEl.innerHTML = order.map(function (key) {
        return data.sections[key] ? _renderSectionCard(key, data.sections[key]) : '';
      }).join('');
    }

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  // --- Analyze API call ---
  window._bjAnalyzeLinkedIn = async function (force) {
    var loading = document.getElementById('li-loading');
    var scoreSection = document.getElementById('li-score-section');
    var noProfile = document.getElementById('li-no-profile');

    if (loading) loading.style.display = 'block';
    if (scoreSection) scoreSection.style.display = 'none';
    if (noProfile) noProfile.style.display = 'none';

    try {
      var token = (typeof sb !== 'undefined' && sb.auth) ? (await sb.auth.getSession()).data?.session?.access_token : null;
      if (!token) throw new Error('Not authenticated');

      var gwUrl = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/api-gateway/optimize-linkedin-profile';
      var resp = await fetch(gwUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', force: !!force }),
      });

      var data = await resp.json();

      if (resp.status === 404) {
        if (loading) loading.style.display = 'none';
        if (noProfile) noProfile.style.display = 'block';
        return;
      }

      if (!resp.ok) throw new Error(data.error || 'Analysis failed');

      _renderLinkedInResults(data);

      if (typeof capturePostHog === 'function') {
        capturePostHog('linkedin_optimizer_analyzed', {
          overall_score: data.overall_score,
          cached: data.cached,
          section_scores: data.sections ? Object.fromEntries(
            Object.entries(data.sections).map(function (e) { return [e[0], e[1].score]; })
          ) : {},
        });
      }
    } catch (e) {
      reportError('_bjAnalyzeLinkedIn', e);
      if (loading) loading.style.display = 'none';
      var scoreEl = document.getElementById('li-score-section');
      if (scoreEl) {
        scoreEl.style.display = 'block';
        scoreEl.innerHTML = '<div class="card" style="padding:20px;color:var(--warm);font-size:12px;">Error: ' +
          ((typeof escHtml === 'function') ? escHtml(e.message) : e.message) + '</div>';
      }
    }
  };

  // --- Init on tab switch ---
  window.initLinkedInTab = function () {
    if (typeof capturePostHog === 'function') capturePostHog('linkedin_optimizer_viewed');
    if (!_linkedinInited) {
      _linkedinInited = true;
      window._bjAnalyzeLinkedIn(false);
    }
  };

  // BJ namespace
  if (typeof window.BJ !== 'undefined') {
    window.BJ._bjAnalyzeLinkedIn = window._bjAnalyzeLinkedIn;
    window.BJ.initLinkedInTab = window.initLinkedInTab;
  }
})();
