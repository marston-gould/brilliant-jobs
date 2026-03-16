// ═══════════════════════════════════════════════════════════
// ATS-005: LinkedIn Keyword Alignment Nudge
// Post-apply coaching — compares resume keywords against stored
// LinkedIn profile data and surfaces keyword gaps with suggestions.
// ═══════════════════════════════════════════════════════════

var _linkedinAlignmentCheckedToday = false;

/**
 * Check if we should show a LinkedIn alignment nudge after a successful application.
 * Called from apply-workflow.js after worker_submission_complete or direct submit.
 * 
 * @param {string} jobId - The job that was just applied to
 * @param {string} jobTitle - Job title for context
 * @param {string} companyName - Company for context
 */
window.checkLinkedInAlignment = async function(jobId, jobTitle, companyName) {
  // Once-per-day cap
  if (_linkedinAlignmentCheckedToday) return;
  var lastCheck = localStorage.getItem('bj_linkedin_alignment_last');
  if (lastCheck) {
    var lastDate = new Date(lastCheck).toDateString();
    var today = new Date().toDateString();
    if (lastDate === today) { _linkedinAlignmentCheckedToday = true; return; }
  }

  // Check if user has LinkedIn profile data
  if (typeof sb === 'undefined' || typeof currentUser === 'undefined' || !currentUser) return;

  try {
    var liRes = await sb.from('linkedin_profiles').select('skills_array, experience_json, headline').eq('user_id', currentUser.id).maybeSingle();
    if (!liRes.data || !liRes.data.skills_array || liRes.data.skills_array.length === 0) return;

    var linkedInSkills = (liRes.data.skills_array || []).map(function(s) { return s.toLowerCase().trim(); });
    var linkedInHeadline = (liRes.data.headline || '').toLowerCase();
    var linkedInExperience = '';
    if (Array.isArray(liRes.data.experience_json)) {
      linkedInExperience = liRes.data.experience_json.map(function(e) {
        return [e.title || '', e.company || '', (e.bullets || []).join(' ')].join(' ');
      }).join(' ').toLowerCase();
    }
    var linkedInText = linkedInSkills.join(' ') + ' ' + linkedInHeadline + ' ' + linkedInExperience;

    // Get resume keywords from the most recent scoring
    var resumeKeywords = [];
    if (typeof readinessCache !== 'undefined' && readinessCache) {
      // Extract all matched keywords from readiness cache
      var indices = Object.keys(readinessCache);
      for (var i = 0; i < indices.length; i++) {
        var data = readinessCache[indices[i]];
        if (!data || !data.filters) continue;
        var filterNames = Object.keys(data.filters);
        for (var fi = 0; fi < filterNames.length; fi++) {
          var fs = data.filters[filterNames[fi]];
          if (fs.topMatched) {
            for (var mi = 0; mi < fs.topMatched.length; mi++) {
              var term = typeof fs.topMatched[mi] === 'object' ? fs.topMatched[mi].term : fs.topMatched[mi];
              if (term) resumeKeywords.push(term.toLowerCase().trim());
            }
          }
        }
      }
    }

    // Also pull from last score result if available
    if (typeof jobMatchScores !== 'undefined' && jobMatchScores && jobMatchScores[jobId]) {
      var scoreResult = jobMatchScores[jobId];
      var matches = scoreResult.key_matches || [];
      for (var ki = 0; ki < matches.length; ki++) {
        resumeKeywords.push(matches[ki].toLowerCase().trim());
      }
    }

    // Deduplicate
    resumeKeywords = resumeKeywords.filter(function(v, i, a) { return a.indexOf(v) === i; });

    if (resumeKeywords.length === 0) return;

    // Find keywords on resume but NOT on LinkedIn
    var gaps = [];
    for (var gi = 0; gi < resumeKeywords.length; gi++) {
      var kw = resumeKeywords[gi];
      if (kw.length < 2) continue;
      // Check if keyword appears anywhere in LinkedIn text
      if (linkedInText.indexOf(kw) === -1) {
        gaps.push(kw);
      }
    }

    // Minimum 3 gaps to show nudge
    if (gaps.length < 3) return;

    // Cap at 8 most important gaps
    gaps = gaps.slice(0, 8);

    // Mark as checked today
    localStorage.setItem('bj_linkedin_alignment_last', new Date().toISOString());
    _linkedinAlignmentCheckedToday = true;

    // Suggest where to add each gap keyword on LinkedIn
    var suggestions = gaps.map(function(gap) {
      // Heuristic: tools/technologies → Skills section, soft skills → Summary, role-specific → Experience
      var isToolish = /^[a-z0-9.+#]+$/i.test(gap) || /sql|api|aws|gcp|react|python|java|node|docker|kubernetes|jira|figma|tableau|excel|git/i.test(gap);
      var isSoftSkill = /leadership|communication|collaboration|management|strategy|planning|mentoring|coaching|problem.solving|analytical|creative/i.test(gap);
      if (isToolish) return { keyword: gap, section: 'Skills', suggestion: 'Add "' + gap + '" to your Skills section' };
      if (isSoftSkill) return { keyword: gap, section: 'Summary', suggestion: 'Mention "' + gap + '" in your LinkedIn summary' };
      return { keyword: gap, section: 'Experience', suggestion: 'Reference "' + gap + '" in a recent experience bullet' };
    });

    // Show the nudge
    _showLinkedInAlignmentNudge(jobTitle, companyName, suggestions);

    // PostHog
    if (typeof capturePostHog === 'function') {
      capturePostHog('linkedin_alignment_nudge_shown', {
        job_id: jobId,
        gap_count: gaps.length,
        keywords: gaps,
      });
    }

  } catch (e) {
    if (typeof reportError === 'function') reportError('linkedin-alignment', e);
    console.warn('[linkedin-alignment] Error:', e.message);
  }
};

/**
 * Render the LinkedIn alignment nudge notification card
 */
function _showLinkedInAlignmentNudge(jobTitle, companyName, suggestions) {
  // Remove existing
  var existing = document.getElementById('bj-linkedin-alignment-nudge');
  if (existing) existing.remove();

  var gapChips = suggestions.map(function(s) {
    var sectionColor = s.section === 'Skills' ? 'var(--accent)' : s.section === 'Summary' ? 'var(--indigo)' : 'var(--green)';
    return '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);">' +
      '<span style="font-size:11px;font-weight:600;color:var(--text);min-width:100px;">' + (typeof escapeHtml === 'function' ? escapeHtml(s.keyword) : s.keyword) + '</span>' +
      '<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:' + sectionColor + '15;color:' + sectionColor + ';font-weight:500;">' + s.section + '</span>' +
      '<span style="font-size:10px;color:var(--text-dim);flex:1;">' + (typeof escapeHtml === 'function' ? escapeHtml(s.suggestion) : s.suggestion) + '</span>' +
    '</div>';
  }).join('');

  var nudge = document.createElement('div');
  nudge.id = 'bj-linkedin-alignment-nudge';
  nudge.style.cssText = 'position:fixed;bottom:20px;right:20px;width:400px;max-width:90vw;background:var(--card);border:1px solid var(--accent);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.15);z-index:9990;overflow:hidden;animation:slideUp 0.3s ease;';
  nudge.innerHTML =
    '<div style="padding:14px 16px;background:linear-gradient(135deg,#1a3a6e,#2553a0);color:#fff;">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
        '<div style="font-size:13px;font-weight:700;"><i data-lucide="linkedin" class="icon-sm" style="display:inline-block;vertical-align:middle;margin-right:6px;"></i>LinkedIn Keyword Gap</div>' +
        '<button onclick="document.getElementById(\'bj-linkedin-alignment-nudge\').remove()" style="background:none;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0 4px;">&times;</button>' +
      '</div>' +
      '<div style="font-size:11px;opacity:0.85;margin-top:4px;">Your resume for ' + (typeof escapeHtml === 'function' ? escapeHtml(companyName) : companyName) + ' has keywords missing from your LinkedIn</div>' +
    '</div>' +
    '<div style="padding:12px 16px;max-height:300px;overflow-y:auto;">' +
      gapChips +
    '</div>' +
    '<div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">' +
      '<button onclick="_dismissLinkedInNudge(\'role_type\')" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text-dim);cursor:pointer;">Don\'t show for this role type</button>' +
      '<button onclick="_dismissLinkedInNudge(\'dismiss\')" style="font-size:11px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text-dim);cursor:pointer;">Dismiss</button>' +
      '<a href="https://www.linkedin.com/in/me/" target="_blank" rel="noopener" onclick="_trackLinkedInCta()" style="font-size:11px;padding:4px 12px;border-radius:6px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600;cursor:pointer;">Update LinkedIn</a>' +
    '</div>';

  document.body.appendChild(nudge);
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Auto-dismiss after 30 seconds
  setTimeout(function() {
    var el = document.getElementById('bj-linkedin-alignment-nudge');
    if (el) el.remove();
  }, 30000);
}

window._dismissLinkedInNudge = function(type) {
  var el = document.getElementById('bj-linkedin-alignment-nudge');
  if (el) el.remove();
  if (typeof capturePostHog === 'function') {
    capturePostHog('linkedin_alignment_nudge_dismissed', { type: type });
  }
};

window._trackLinkedInCta = function() {
  if (typeof capturePostHog === 'function') {
    capturePostHog('linkedin_alignment_cta_clicked', {});
  }
};
