// @ts-nocheck
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

      // EXT-LI-001: Try loading raw profile data from linkedin_profiles as fallback
      try {
        var token2 = (typeof sb !== 'undefined' && sb.auth) ? (await sb.auth.getSession()).data?.session?.access_token : null;
        if (token2 && typeof sb !== 'undefined') {
          var lpResp = await sb.from('linkedin_profiles').select('*').limit(1).maybeSingle();
          if (lpResp.data && lpResp.data.display_name) {
            var lp = lpResp.data;
            var scoreEl = document.getElementById('li-score-section');
            if (scoreEl) {
              scoreEl.style.display = 'block';
              scoreEl.innerHTML =
                '<div class="card" style="padding:12px 18px;margin-bottom:16px;border-left:3px solid var(--warm);color:var(--warm);font-size:12px;">AI analysis unavailable (credits needed). Your profile data from the extension is shown below.' +
                ' <button class="btn btn-sm btn-primary" onclick="window._bjAnalyzeLinkedIn(true)" style="margin-left:8px;">Run Analysis (2 credits)</button></div>' +

                '<div class="card" style="padding:20px;margin-bottom:16px;">' +
                '<div style="font-size:18px;font-weight:800;margin-bottom:2px;">' + ((typeof escHtml === 'function') ? escHtml(lp.display_name) : lp.display_name) + '</div>' +
                (lp.headline ? '<div style="font-size:13px;color:var(--text-dim);margin-bottom:4px;">' + ((typeof escHtml === 'function') ? escHtml(lp.headline) : lp.headline) + '</div>' : '') +
                (lp.location ? '<div style="font-size:12px;color:var(--text-faint);">' + ((typeof escHtml === 'function') ? escHtml(lp.location) : lp.location) + '</div>' : '') +
                '<div style="font-size:10px;color:var(--text-faint);margin-top:8px;">Captured ' + (lp.parsed_at ? new Date(lp.parsed_at).toLocaleDateString() : 'recently') + ' via Chrome extension</div>' +
                '</div>' +

                (lp.experience_json && lp.experience_json.length ? '<div class="card" style="padding:16px;margin-bottom:12px;"><div style="font-weight:700;font-size:13px;margin-bottom:10px;">Experience (' + lp.experience_json.length + ')</div>' +
                  lp.experience_json.slice(0, 5).map(function(exp) {
                    return '<div style="padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;"><strong>' + ((typeof escHtml === 'function') ? escHtml(exp.title || '') : (exp.title || '')) + '</strong>' +
                      (exp.company ? ' at ' + ((typeof escHtml === 'function') ? escHtml(exp.company) : exp.company) : '') +
                      (exp.dates ? '<span style="color:var(--text-faint);margin-left:8px;">' + ((typeof escHtml === 'function') ? escHtml(exp.dates) : exp.dates) + '</span>' : '') + '</div>';
                  }).join('') + '</div>' : '') +

                (lp.skills_array && lp.skills_array.length ? '<div class="card" style="padding:16px;margin-bottom:12px;"><div style="font-weight:700;font-size:13px;margin-bottom:10px;">Skills (' + lp.skills_array.length + ')</div>' +
                  '<div style="display:flex;flex-wrap:wrap;gap:6px;">' + lp.skills_array.slice(0, 20).map(function(s) {
                    return '<span style="font-size:11px;padding:3px 10px;border-radius:20px;background:var(--accent-dim);color:var(--accent);font-weight:500;">' + ((typeof escHtml === 'function') ? escHtml(s) : s) + '</span>';
                  }).join('') + '</div></div>' : '') +

                (lp.education_json && lp.education_json.length ? '<div class="card" style="padding:16px;margin-bottom:12px;"><div style="font-weight:700;font-size:13px;margin-bottom:10px;">Education</div>' +
                  lp.education_json.map(function(edu) {
                    return '<div style="padding:4px 0;font-size:12px;"><strong>' + ((typeof escHtml === 'function') ? escHtml(edu.institution || '') : (edu.institution || '')) + '</strong>' +
                      (edu.degree ? ' — ' + ((typeof escHtml === 'function') ? escHtml(edu.degree) : edu.degree) : '') + '</div>';
                  }).join('') + '</div>' : '');
            }
            return;
          }
        }
      } catch (fallbackErr) { /* silent — fall through to generic error */ }

      // No raw profile data either — show appropriate state
      var noProf = document.getElementById('li-no-profile');
      var scoreEl2 = document.getElementById('li-score-section');
      if (noProf) {
        noProf.style.display = 'block';
      } else if (scoreEl2) {
        scoreEl2.style.display = 'block';
        scoreEl2.innerHTML = '<div class="card" style="padding:20px;color:var(--warm);font-size:12px;">Analysis unavailable: ' +
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

  // --- F4: LinkedIn Summary Generator ---
  window._bjGenerateLinkedInSummary = async function () {
    var tone = (document.getElementById('li-sum-tone') || {}).value || 'professional';
    var targetRole = (document.getElementById('li-sum-target-role') || {}).value || '';
    var btn = document.getElementById('li-sum-generate-btn');
    var resultsEl = document.getElementById('li-sum-results');

    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    if (resultsEl) resultsEl.innerHTML = '<div class="skeleton" style="height:120px;border-radius:8px;margin-bottom:8px;"></div>'.repeat(2);

    try {
      var token = (typeof sb !== 'undefined' && sb.auth) ? (await sb.auth.getSession()).data?.session?.access_token : null;
      if (!token) throw new Error('Not authenticated');

      var gwUrl = (typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : '') + '/functions/v1/api-gateway/optimize-linkedin-profile';
      var targetRoles = targetRole.trim() ? [targetRole.trim()] : [];
      var resp = await fetch(gwUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'linkedin_summary', tone: tone, target_roles: targetRoles }),
      });

      var data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Generation failed');

      var summaries = data.summaries || [];
      var charCounts = data.char_counts || summaries.map(function (s) { return s.length; });

      if (typeof capturePostHog === 'function') capturePostHog('linkedin_summary_generated', {
        tone: tone, char_count: charCounts[0] || 0, has_target_role: targetRoles.length > 0,
      });

      if (resultsEl) {
        resultsEl.innerHTML = summaries.map(function (s, i) {
          var esc = (typeof escHtml === 'function') ? escHtml(s) : s.replace(/</g, '&lt;');
          var charCount = charCounts[i] || s.length;
          var overLimit = charCount > 2600;
          return '<div class="card" style="padding:14px 18px;margin-bottom:8px;">' +
            '<div style="font-size:12px;line-height:1.7;margin-bottom:10px;white-space:pre-wrap;">' + esc + '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<button class="btn btn-sm btn-secondary" onclick="window._bjCopyLinkedInSummary(' + i + ')">Copy to Clipboard</button>' +
            '<span style="font-size:10px;color:' + (overLimit ? 'var(--warm)' : 'var(--text-faint)') + ';">' +
            charCount + ' / 2,600 chars' + (overLimit ? ' (over limit)' : '') + '</span>' +
            '</div></div>';
        }).join('');
        window._bjLastLinkedInSummaries = summaries;
      }
    } catch (e) {
      reportError('_bjGenerateLinkedInSummary', e);
      if (resultsEl) resultsEl.innerHTML = '<div style="color:var(--warm);font-size:12px;padding:8px;">Error: ' +
        ((typeof escHtml === 'function') ? escHtml(e.message) : e.message) + '</div>';
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate (1 credit)'; }
    }
  };

  window._bjCopyLinkedInSummary = function (idx) {
    var summaries = window._bjLastLinkedInSummaries || [];
    if (!summaries[idx]) return;
    try {
      navigator.clipboard.writeText(summaries[idx]);
      if (typeof showToast === 'function') showToast('LinkedIn summary copied!', { type: 'success' });
      if (typeof capturePostHog === 'function') capturePostHog('linkedin_summary_copied', { index: idx });
    } catch (e) { reportError('_bjCopyLinkedInSummary', e); }
  };

  // --- Auto-suggest when summary score < 70 ---
  var _origRenderResults = _renderLinkedInResults;
  _renderLinkedInResults = function (data) {
    _origRenderResults(data);

    var summarySection = document.getElementById('li-summary-section');
    var autoSuggest = document.getElementById('li-summary-auto-suggest');

    if (summarySection) summarySection.style.display = 'block';

    if (autoSuggest && data.sections && data.sections.summary) {
      var summaryScore = data.sections.summary.score || 0;
      if (summaryScore < 70) {
        autoSuggest.style.display = 'block';
        autoSuggest.textContent = 'Your summary scored ' + summaryScore + '/100. Generate a stronger one below.';
      } else {
        autoSuggest.style.display = 'none';
      }
    }
  };

  // BJ namespace
  if (typeof window.BJ !== 'undefined') {
    window.BJ._bjAnalyzeLinkedIn = window._bjAnalyzeLinkedIn;
    window.BJ.initLinkedInTab = window.initLinkedInTab;
    window.BJ._bjGenerateLinkedInSummary = window._bjGenerateLinkedInSummary;
    window.BJ._bjCopyLinkedInSummary = window._bjCopyLinkedInSummary;
  }
})();
