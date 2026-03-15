// FB-INTPREP-001-S2: Interview Prep — Question Bank UI
// Spec: FB-INTPREP-001_InterviewPrep.docx §3.4, §5.2, §5.3, §10 Phase 2
//
// Loads interview_questions from Supabase, renders filterable/searchable cards.
// Bookmarks stored in localStorage (migrate to Supabase later per spec).

(function() {
  'use strict';

  var _questions = [];
  var _filteredQuestions = [];
  var _bookmarks = _loadBookmarks();
  var _filters = { role: '', dept: '', level: '', category: '', difficulty: '', search: '' };
  var _debounceTimer = null;
  var _clusterMeta = { roles: [], depts: [], levels: [] };
  var _loaded = false;

  // ─── Category colors ───
  var CAT_COLORS = {
    behavioral: { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6', label: 'Behavioral' },
    technical: { bg: 'rgba(139,92,246,0.12)', text: '#8b5cf6', label: 'Technical' },
    situational: { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: 'Situational' },
    case_study: { bg: 'rgba(16,185,129,0.12)', text: '#10b981', label: 'Case Study' },
  };

  var DIFF_COLORS = {
    standard: { bg: 'rgba(100,116,139,0.1)', text: '#64748b' },
    advanced: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' },
  };

  // ─── Init ───
  window.initInterviewPrep = async function() {
    _initTabs();
    _initCategoryPills();
    _initDifficultyPills();
    _initSearch();
    _initFilterDropdowns();

    if (!_loaded) {
      await _loadQuestions();
      _loaded = true;
    } else {
      _applyFilters();
    }

    if (typeof window.refreshIcons === 'function') window.refreshIcons();

    if (window.posthog) {
      posthog.capture('interview_prep_page_viewed', { tab: 'question_bank' });
    }
  };

  // ─── Tab switching ───
  function _initTabs() {
    var tabs = document.querySelectorAll('#ip-tabs .u-tab');
    tabs.forEach(function(tab) {
      tab.addEventListener('click', function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');

        var target = tab.dataset.ipTab;
        document.querySelectorAll('.ip-tab-panel').forEach(function(p) {
          p.style.display = 'none';
          p.classList.remove('active');
        });
        var panel = document.getElementById('ip-panel-' + target);
        if (panel) {
          panel.style.display = '';
          panel.classList.add('active');
        }

        if (window.posthog) {
          posthog.capture('interview_prep_page_viewed', { tab: target.replace('-', '_') });
        }
      });
    });
  }

  // ─── Category pills ───
  function _initCategoryPills() {
    var container = document.getElementById('ip-category-pills');
    if (!container) return;
    container.addEventListener('click', function(e) {
      var pill = e.target.closest('.ip-pill');
      if (!pill) return;
      container.querySelectorAll('.ip-pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      _filters.category = pill.dataset.cat || '';
      _applyFilters();
    });
  }

  // ─── Difficulty pills ───
  function _initDifficultyPills() {
    var container = document.getElementById('ip-difficulty-pills');
    if (!container) return;
    container.addEventListener('click', function(e) {
      var pill = e.target.closest('.ip-pill');
      if (!pill) return;
      container.querySelectorAll('.ip-pill').forEach(function(p) { p.classList.remove('active'); });
      pill.classList.add('active');
      _filters.difficulty = pill.dataset.diff || '';
      _applyFilters();
    });
  }

  // ─── Search ───
  function _initSearch() {
    var input = document.getElementById('ip-search');
    if (!input) return;
    input.addEventListener('input', function() {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(function() {
        _filters.search = input.value.trim().toLowerCase();
        _applyFilters();
        if (window.posthog && _filters.search.length > 2) {
          posthog.capture('question_bank_searched', {
            query: _filters.search,
            role_cluster: _filters.role,
            department: _filters.dept,
            level: _filters.level,
            category: _filters.category,
            difficulty: _filters.difficulty,
          });
        }
      }, 200);
    });
  }

  // ─── Filter dropdowns ───
  function _initFilterDropdowns() {
    var roleSelect = document.getElementById('ip-filter-role');
    var deptSelect = document.getElementById('ip-filter-dept');
    var levelSelect = document.getElementById('ip-filter-level');

    if (roleSelect) roleSelect.addEventListener('change', function() { _filters.role = this.value; _applyFilters(); });
    if (deptSelect) deptSelect.addEventListener('change', function() { _filters.dept = this.value; _applyFilters(); });
    if (levelSelect) levelSelect.addEventListener('change', function() { _filters.level = this.value; _applyFilters(); });
  }

  // ─── Load questions from Supabase ───
  async function _loadQuestions() {
    var container = document.getElementById('ip-questions-list');
    if (!container) return;

    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      if (!sb) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">Unable to connect. Please refresh.</div>';
        return;
      }

      var { data, error } = await sb
        .from('interview_questions')
        .select('id, question_text, category, difficulty, role_cluster, department, level, skill_tags, source_cluster_size')
        .order('role_cluster', { ascending: true })
        .order('category', { ascending: true })
        .limit(5000);

      if (error) {
        reportError('interview-prep:load', error);
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">Unable to load questions. Please try again.</div>';
        return;
      }

      _questions = data || [];

      // Extract distinct values for filter dropdowns
      var roles = new Set(), depts = new Set(), levels = new Set();
      _questions.forEach(function(q) {
        if (q.role_cluster) roles.add(q.role_cluster);
        if (q.department) depts.add(q.department);
        if (q.level) levels.add(q.level);
      });

      _clusterMeta.roles = Array.from(roles).sort();
      _clusterMeta.depts = Array.from(depts).sort();
      _clusterMeta.levels = Array.from(levels).sort();

      _populateDropdown('ip-filter-role', _clusterMeta.roles, 'All Roles');
      _populateDropdown('ip-filter-dept', _clusterMeta.depts, 'All Departments');
      _populateDropdown('ip-filter-level', _clusterMeta.levels, 'All Levels');

      _applyFilters();

    } catch (err) {
      reportError('interview-prep:load', err);
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">Error loading questions.</div>';
    }
  }

  function _populateDropdown(id, values, defaultLabel) {
    var select = document.getElementById(id);
    if (!select) return;
    var current = select.value;
    select.innerHTML = '<option value="">' + _esc(defaultLabel) + '</option>';
    values.forEach(function(v) {
      var opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
    if (current) select.value = current;
  }

  // ─── Apply filters + render ───
  function _applyFilters() {
    _filteredQuestions = _questions.filter(function(q) {
      if (_filters.role && q.role_cluster !== _filters.role) return false;
      if (_filters.dept && q.department !== _filters.dept) return false;
      if (_filters.level && q.level !== _filters.level) return false;
      if (_filters.category && q.category !== _filters.category) return false;
      if (_filters.difficulty && q.difficulty !== _filters.difficulty) return false;
      if (_filters.search) {
        var s = _filters.search;
        var inText = q.question_text && q.question_text.toLowerCase().indexOf(s) !== -1;
        var inSkills = q.skill_tags && q.skill_tags.some(function(t) { return t.toLowerCase().indexOf(s) !== -1; });
        var inRole = q.role_cluster && q.role_cluster.toLowerCase().indexOf(s) !== -1;
        if (!inText && !inSkills && !inRole) return false;
      }
      return true;
    });

    _renderQuestions();
    _renderBookmarks();
    _updateResultsCount();
  }

  // ─── Render question cards ───
  function _renderQuestions() {
    var container = document.getElementById('ip-questions-list');
    if (!container) return;

    if (_questions.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-dim);">No questions in the bank yet. Questions are generated from job description data — check back soon.</div>';
      return;
    }

    if (_filteredQuestions.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">No questions match your filters. Try broadening your search.</div>';
      return;
    }

    // Render up to 100 cards (performance guard)
    var toShow = _filteredQuestions.slice(0, 100);

    container.innerHTML = toShow.map(function(q) {
      var cat = CAT_COLORS[q.category] || CAT_COLORS.behavioral;
      var diff = DIFF_COLORS[q.difficulty] || DIFF_COLORS.standard;
      var isBookmarked = _bookmarks.indexOf(q.id) !== -1;

      return '<div class="card ip-question-card" style="padding:14px 16px;margin-bottom:10px;" data-qid="' + _esc(q.id) + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
          '<div style="flex:1;">' +
            '<div style="font-size:13px;line-height:1.5;color:var(--text);margin-bottom:8px;">' + _esc(q.question_text) + '</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">' +
              '<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:' + cat.bg + ';color:' + cat.text + ';">' + _esc(cat.label) + '</span>' +
              '<span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:' + diff.bg + ';color:' + diff.text + ';">' + _esc(q.difficulty) + '</span>' +
              (q.skill_tags || []).slice(0, 4).map(function(t) {
                return '<span style="padding:2px 6px;border-radius:8px;font-size:10px;background:var(--bg-input);color:var(--text-dim);">' + _esc(t) + '</span>';
              }).join('') +
              (q.role_cluster ? '<span style="font-size:10px;color:var(--text-faint);margin-left:4px;">' + _esc(q.role_cluster) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;align-items:center;">' +
            '<button class="ip-bookmark-btn" onclick="window._ipToggleBookmark(\'' + q.id + '\')" title="' + (isBookmarked ? 'Remove bookmark' : 'Bookmark') + '" style="background:none;border:none;cursor:pointer;padding:4px;color:' + (isBookmarked ? 'var(--accent)' : 'var(--text-faint)') + ';">' +
              '<i data-lucide="' + (isBookmarked ? 'bookmark-check' : 'bookmark') + '" class="icon-md icon-stroke"></i>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    if (_filteredQuestions.length > 100) {
      container.innerHTML += '<div style="text-align:center;padding:12px;font-size:12px;color:var(--text-faint);">Showing 100 of ' + _filteredQuestions.length + ' questions. Use filters to narrow results.</div>';
    }

    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }

  // ─── Render bookmarks section ───
  function _renderBookmarks() {
    var section = document.getElementById('ip-bookmarks-section');
    var list = document.getElementById('ip-bookmarks-list');
    var countEl = document.getElementById('ip-bookmark-count');

    if (!section || !list) return;

    var bookmarkedQuestions = _questions.filter(function(q) { return _bookmarks.indexOf(q.id) !== -1; });

    if (bookmarkedQuestions.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    if (countEl) countEl.textContent = bookmarkedQuestions.length;

    list.innerHTML = bookmarkedQuestions.map(function(q) {
      var cat = CAT_COLORS[q.category] || CAT_COLORS.behavioral;
      return '<div style="padding:10px 12px;margin-bottom:6px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">' +
          '<div style="font-size:12px;line-height:1.4;color:var(--text);flex:1;">' + _esc(q.question_text) + '</div>' +
          '<button onclick="window._ipToggleBookmark(\'' + q.id + '\')" style="background:none;border:none;cursor:pointer;padding:2px;color:var(--accent);flex-shrink:0;" title="Remove bookmark">' +
            '<i data-lucide="bookmark-minus" class="icon-sm icon-stroke"></i>' +
          '</button>' +
        '</div>' +
        '<span style="padding:1px 6px;border-radius:8px;font-size:9px;font-weight:600;background:' + cat.bg + ';color:' + cat.text + ';">' + _esc(cat.label) + '</span>' +
      '</div>';
    }).join('');

    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  }

  // ─── Results count ───
  function _updateResultsCount() {
    var el = document.getElementById('ip-results-count');
    if (!el) return;
    if (_questions.length === 0) {
      el.textContent = '';
    } else {
      el.textContent = _filteredQuestions.length + ' of ' + _questions.length + ' questions';
    }
  }

  // ─── Bookmark toggle ───
  window._ipToggleBookmark = function(questionId) {
    var idx = _bookmarks.indexOf(questionId);
    if (idx === -1) {
      _bookmarks.push(questionId);
      if (window.posthog) {
        var q = _questions.find(function(x) { return x.id === questionId; });
        posthog.capture('question_bookmarked', {
          question_id: questionId,
          role_cluster: q ? q.role_cluster : null,
          category: q ? q.category : null,
        });
      }
    } else {
      _bookmarks.splice(idx, 1);
    }
    _saveBookmarks();
    _renderQuestions();
    _renderBookmarks();
  };

  // ─── Bookmark persistence (localStorage) ───
  function _loadBookmarks() {
    try {
      var raw = localStorage.getItem('bj_ip_bookmarks');
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore localStorage errors */ }
    return [];
  }

  function _saveBookmarks() {
    try {
      localStorage.setItem('bj_ip_bookmarks', JSON.stringify(_bookmarks));
    } catch (e) { /* ignore localStorage errors */ }
  }

  // ─── HTML escape ───
  function _esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ═══════════════════════════════════════════════════════════════
  // FB-INTPREP-001-S4: Simulation UI — Chat Modal + Sessions List
  // ═══════════════════════════════════════════════════════════════

  var _simSessionId = null;
  var _simSending = false;

  // ─── Start mock interview ───
  window._ipStartMock = async function(jobId, pipelineEntryId, focusQuestion) {
    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      if (!sb) return;

      var session = await sb.auth.getSession();
      var token = session && session.data && session.data.session && session.data.session.access_token;
      if (!token) { if (typeof toast === 'function') toast('Please log in to start a mock interview.', { type: 'warning' }); return; }

      var feedbackToggle = document.getElementById('ip-sim-feedback-toggle');
      var feedbackMode = feedbackToggle ? feedbackToggle.checked : true;

      // Show modal
      var overlay = document.getElementById('ip-sim-overlay');
      if (overlay) overlay.style.display = '';
      var chat = document.getElementById('ip-sim-chat');
      if (chat) chat.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">Starting interview...</div>';
      var scoreArea = document.getElementById('ip-sim-scorecard');
      if (scoreArea) scoreArea.style.display = 'none';
      var inputArea = document.getElementById('ip-sim-input-area');
      if (inputArea) inputArea.style.display = 'flex';

      var resp = await fetch(window.SUPABASE_URL + '/functions/v1/api-gateway/interview-simulate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          job_id: jobId || null,
          pipeline_entry_id: pipelineEntryId || null,
          feedback_mode: feedbackMode,
          question_count: 6,
          source: focusQuestion ? 'question_bank' : (jobId ? 'pipeline' : 'standalone'),
          focus_question: focusQuestion || null,
        }),
      });

      var data = await resp.json();
      if (!resp.ok || data.error) {
        reportError('interview-prep:start', data.error || 'Start failed');
        if (chat) chat.innerHTML = '<div style="text-align:center;padding:20px;color:var(--warm);">Failed to start interview. ' + _esc(data.error || '') + '</div>';
        return;
      }

      _simSessionId = data.session_id;
      _updateSimHeader(null, null, data.question_number || 1, 6);
      if (chat) {
        chat.innerHTML = '';
        _appendMessage(chat, 'assistant', data.reply);
      }
      if (typeof window.refreshIcons === 'function') window.refreshIcons();
    } catch (err) {
      reportError('interview-prep:start', err);
    }
  };

  // ─── Send message ───
  window._ipSendMessage = async function() {
    if (_simSending || !_simSessionId) return;
    var input = document.getElementById('ip-sim-input');
    var message = input ? input.value.trim() : '';
    if (!message) return;

    _simSending = true;
    if (input) input.value = '';
    var sendBtn = document.getElementById('ip-sim-send');
    if (sendBtn) sendBtn.disabled = true;

    var chat = document.getElementById('ip-sim-chat');
    _appendMessage(chat, 'user', message);

    // Show typing indicator
    var typingEl = document.createElement('div');
    typingEl.id = 'ip-sim-typing';
    typingEl.style.cssText = 'padding:10px 14px;font-size:12px;color:var(--text-faint);font-style:italic;';
    typingEl.textContent = 'Interviewer is thinking...';
    if (chat) chat.appendChild(typingEl);
    if (chat) chat.scrollTop = chat.scrollHeight;

    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      var session = await sb.auth.getSession();
      var token = session && session.data && session.data.session && session.data.session.access_token;

      var resp = await fetch(window.SUPABASE_URL + '/functions/v1/api-gateway/interview-simulate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', session_id: _simSessionId, message: message }),
      });

      var data = await resp.json();

      // Remove typing indicator
      var typing = document.getElementById('ip-sim-typing');
      if (typing) typing.remove();

      if (!resp.ok || data.error) {
        _appendMessage(chat, 'system', 'Error: ' + (data.error || 'Failed to get response'));
        reportError('interview-prep:message', data.error);
      } else {
        _appendMessage(chat, 'assistant', data.reply);
        _updateSimHeader(null, null, data.question_number, 6);

        if (data.is_complete && data.scorecard) {
          _renderScorecard(data.scorecard);
          var inputArea = document.getElementById('ip-sim-input-area');
          if (inputArea) inputArea.style.display = 'none';
        }
      }
    } catch (err) {
      var typing = document.getElementById('ip-sim-typing');
      if (typing) typing.remove();
      _appendMessage(chat, 'system', 'Network error. Please try again.');
      reportError('interview-prep:message', err);
    }

    _simSending = false;
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.focus();
    if (chat) chat.scrollTop = chat.scrollHeight;
    if (typeof window.refreshIcons === 'function') window.refreshIcons();
  };

  // ─── Hint request ───
  window._ipRequestHint = async function() {
    if (_simSending || !_simSessionId) return;
    _simSending = true;
    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      var session = await sb.auth.getSession();
      var token = session && session.data && session.data.session && session.data.session.access_token;

      var resp = await fetch(window.SUPABASE_URL + '/functions/v1/api-gateway/interview-simulate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'message', session_id: _simSessionId, message: '[HINT REQUEST] I need a hint for this question. Give me a brief prompt to guide my answer without giving the full answer.' }),
      });
      var data = await resp.json();
      var chat = document.getElementById('ip-sim-chat');
      if (data.reply) _appendMessage(chat, 'hint', data.reply);
      if (window.posthog) posthog.capture('simulation_hint_requested', { session_id: _simSessionId });
    } catch (err) { reportError('interview-prep:hint', err); }
    _simSending = false;
  };

  // ─── End early ───
  window._ipEndEarly = async function() {
    if (!_simSessionId) return;
    if (!confirm('End this interview early? You won\'t receive a scorecard.')) return;
    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      var session = await sb.auth.getSession();
      var token = session && session.data && session.data.session && session.data.session.access_token;

      await fetch(window.SUPABASE_URL + '/functions/v1/api-gateway/interview-simulate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abandon', session_id: _simSessionId }),
      });
    } catch (err) { reportError('interview-prep:abandon', err); }
    window._ipCloseSimulation();
  };

  // ─── Close modal ───
  window._ipCloseSimulation = function() {
    var overlay = document.getElementById('ip-sim-overlay');
    if (overlay) overlay.style.display = 'none';
    _simSessionId = null;
    _simSending = false;
    // Refresh sessions list if on My Sessions tab
    _loadSessions();
  };

  // ─── Chat message rendering ───
  function _appendMessage(container, role, content) {
    if (!container) return;
    var div = document.createElement('div');
    var feedbackToggle = document.getElementById('ip-sim-feedback-toggle');
    var showCoaching = feedbackToggle ? feedbackToggle.checked : true;

    // Extract coaching notes
    var mainContent = content;
    var coachNote = '';
    if (role === 'assistant' && showCoaching) {
      var coachMatch = content.match(/\[COACH\]([\s\S]*?)\[\/COACH\]/);
      if (coachMatch) {
        coachNote = coachMatch[1].trim();
        mainContent = content.replace(/\[COACH\][\s\S]*?\[\/COACH\]/, '').trim();
      }
    } else if (role === 'assistant' && !showCoaching) {
      mainContent = content.replace(/\[COACH\][\s\S]*?\[\/COACH\]/, '').trim();
    }

    var bgColor = role === 'user' ? 'var(--accent)' : role === 'hint' ? 'rgba(245,158,11,0.15)' : role === 'system' ? 'rgba(239,68,68,0.1)' : 'var(--bg-input)';
    var textColor = role === 'user' ? '#fff' : 'var(--text)';
    var align = role === 'user' ? 'flex-end' : 'flex-start';
    var maxW = '85%';

    div.style.cssText = 'display:flex;justify-content:' + align + ';';
    div.innerHTML = '<div style="max-width:' + maxW + ';padding:10px 14px;border-radius:12px;background:' + bgColor + ';color:' + textColor + ';font-size:13px;line-height:1.5;white-space:pre-wrap;">' +
      _esc(mainContent) +
    '</div>';
    container.appendChild(div);

    // Coaching note
    if (coachNote) {
      var noteDiv = document.createElement('div');
      noteDiv.style.cssText = 'padding:4px 14px 4px 28px;font-size:11px;color:var(--accent);font-style:italic;';
      noteDiv.textContent = coachNote;
      container.appendChild(noteDiv);
    }

    container.scrollTop = container.scrollHeight;
  }

  // ─── Header update ───
  function _updateSimHeader(company, role, questionNum, totalQuestions) {
    var title = document.getElementById('ip-sim-title');
    var progress = document.getElementById('ip-sim-progress');
    if (title && (company || role)) title.textContent = (company || '') + (company && role ? ' — ' : '') + (role || 'Mock Interview');
    if (progress && questionNum) progress.textContent = 'Question ' + questionNum + ' of ' + totalQuestions;
  }

  // ─── Scorecard rendering ───
  function _renderScorecard(scorecard) {
    var area = document.getElementById('ip-sim-scorecard');
    if (!area || !scorecard) return;
    area.style.display = '';

    var scoreColor = scorecard.overall_score >= 75 ? 'var(--green,#22c55e)' : scorecard.overall_score >= 50 ? 'var(--accent)' : 'var(--warm)';

    area.innerHTML =
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;">Readiness Score</div>' +
        '<div style="font-size:36px;font-weight:800;color:' + scoreColor + ';">' + (scorecard.overall_score || 0) + '</div>' +
      '</div>' +
      (scorecard.strengths && scorecard.strengths.length ? '<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:600;color:var(--green,#22c55e);margin-bottom:4px;">Strengths</div>' + scorecard.strengths.map(function(s) { return '<div style="font-size:12px;color:var(--text-dim);padding:2px 0;">• ' + _esc(s) + '</div>'; }).join('') + '</div>' : '') +
      (scorecard.improvements && scorecard.improvements.length ? '<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:600;color:var(--warm);margin-bottom:4px;">Areas to Improve</div>' + scorecard.improvements.map(function(s) { return '<div style="font-size:12px;color:var(--text-dim);padding:2px 0;">• ' + _esc(s) + '</div>'; }).join('') + '</div>' : '') +
      (scorecard.talking_points && scorecard.talking_points.length ? '<div style="margin-bottom:12px;"><div style="font-size:12px;font-weight:600;color:var(--accent);margin-bottom:4px;">Talking Points for the Real Interview</div>' + scorecard.talking_points.map(function(s) { return '<div style="font-size:12px;color:var(--text-dim);padding:2px 0;">• ' + _esc(s) + '</div>'; }).join('') + '</div>' : '') +
      (scorecard.gap_coverage ? '<div style="font-size:11px;color:var(--text-faint);margin-top:8px;"><strong>Gap Coverage:</strong> ' + _esc(scorecard.gap_coverage) + '</div>' : '') +
      '<div style="text-align:center;margin-top:16px;"><button class="btn btn-primary btn-sm" onclick="window._ipCloseSimulation()">Save & Close</button></div>';
  }

  // ─── Load sessions list (My Sessions tab) ───
  async function _loadSessions() {
    var container = document.getElementById('ip-sessions-list');
    if (!container) return;

    try {
      var sb = window.bjSupabase || (window.supabase && window.supabase.createClient
        ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY) : null);
      if (!sb) return;

      var { data, error } = await sb
        .from('interview_sessions')
        .select('id, job_id, status, overall_score, feedback_mode, question_count, started_at, completed_at, scorecard')
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) {
        reportError('interview-prep:sessions', error);
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-dim);">Unable to load sessions.</div>';
        return;
      }

      if (!data || data.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-dim);">' +
          '<i data-lucide="message-square-quote" class="icon-xl" style="color:var(--text-faint);margin-bottom:8px;display:inline-block;"></i>' +
          '<div style="font-size:13px;">No sessions yet. Start a mock interview to practice!</div>' +
        '</div>';
        if (typeof window.refreshIcons === 'function') window.refreshIcons();
        return;
      }

      container.innerHTML = data.map(function(s) {
        var statusColor = s.status === 'completed' ? 'var(--green,#22c55e)' : s.status === 'abandoned' ? 'var(--text-faint)' : 'var(--accent)';
        var statusLabel = s.status === 'completed' ? 'Completed' : s.status === 'abandoned' ? 'Abandoned' : 'In Progress';
        var dateStr = new Date(s.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        var scoreHtml = s.overall_score != null ? '<span style="font-size:18px;font-weight:700;color:' + (s.overall_score >= 75 ? 'var(--green,#22c55e)' : s.overall_score >= 50 ? 'var(--accent)' : 'var(--warm)') + ';">' + s.overall_score + '</span>' : '';

        return '<div class="card ip-session-card" style="padding:12px 16px;margin-bottom:8px;cursor:pointer;" data-sid="' + s.id + '">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;">' +
            '<div>' +
              '<div style="font-size:13px;font-weight:600;color:var(--text);">' + (s.job_id ? 'Job #' + _esc(String(s.job_id).slice(0, 8)) : 'Standalone Practice') + '</div>' +
              '<div style="font-size:11px;color:var(--text-dim);">' + dateStr + ' · <span style="color:' + statusColor + ';">' + statusLabel + '</span></div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:12px;">' +
              scoreHtml +
              (s.status === 'in_progress' ? '<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();window._ipResumeMock(\'' + s.id + '\')">Resume</button>' : '') +
              (s.status === 'completed' ? '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();window._ipToggleSessionDetail(\'' + s.id + '\')">Review</button>' : '') +
            '</div>' +
          '</div>' +
          '<div id="ip-session-detail-' + s.id + '" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--border);"></div>' +
        '</div>';
      }).join('');

      // Attach scorecard data for expand
      data.forEach(function(s) {
        if (s.scorecard) {
          var detailEl = document.getElementById('ip-session-detail-' + s.id);
          if (detailEl) detailEl.setAttribute('data-scorecard', JSON.stringify(s.scorecard));
        }
      });

      if (typeof window.refreshIcons === 'function') window.refreshIcons();
    } catch (err) {
      reportError('interview-prep:sessions', err);
    }
  }

  // ─── Toggle session detail (inline scorecard) ───
  window._ipToggleSessionDetail = function(sessionId) {
    var detail = document.getElementById('ip-session-detail-' + sessionId);
    if (!detail) return;
    if (detail.style.display !== 'none') {
      detail.style.display = 'none';
      return;
    }
    detail.style.display = '';
    var scorecardStr = detail.getAttribute('data-scorecard');
    if (scorecardStr && !detail.dataset.rendered) {
      try {
        var sc = JSON.parse(scorecardStr);
        detail.innerHTML =
          '<div style="font-size:12px;font-weight:600;margin-bottom:6px;">Score: <span style="color:var(--accent);">' + (sc.overall_score || '—') + '/100</span></div>' +
          (sc.strengths && sc.strengths.length ? '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;"><strong style="color:var(--green,#22c55e);">Strengths:</strong> ' + sc.strengths.map(_esc).join(', ') + '</div>' : '') +
          (sc.improvements && sc.improvements.length ? '<div style="font-size:11px;color:var(--text-dim);margin-bottom:4px;"><strong style="color:var(--warm);">Improve:</strong> ' + sc.improvements.map(_esc).join(', ') + '</div>' : '') +
          (sc.gap_coverage ? '<div style="font-size:11px;color:var(--text-faint);"><strong>Gap Coverage:</strong> ' + _esc(sc.gap_coverage) + '</div>' : '');
        detail.dataset.rendered = 'true';
      } catch (e) { reportError('interview-prep:scorecard-parse', e); }
    }

    if (window.posthog) posthog.capture('scorecard_viewed', { session_id: sessionId, source: 'my_sessions' });
  };

  // ─── Resume in-progress session (stub — opens modal, loads history) ───
  window._ipResumeMock = function(sessionId) {
    // For now, show a toast — full resume requires loading message history
    if (typeof toast === 'function') toast('Resume functionality coming in a future update.', { type: 'info', duration: 3000 });
  };

  // ─── Enter key to send ───
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey && document.activeElement && document.activeElement.id === 'ip-sim-input') {
      e.preventDefault();
      window._ipSendMessage();
    }
  });

  // ─── Load sessions when My Sessions tab is shown ───
  var _sessionsTabInited = false;
  var _origInitIp = window.initInterviewPrep;
  window.initInterviewPrep = async function() {
    await _origInitIp();
    // Wire session loading to tab switch
    if (!_sessionsTabInited) {
      var tabs = document.querySelectorAll('#ip-tabs .u-tab');
      tabs.forEach(function(tab) {
        tab.addEventListener('click', function() {
          if (tab.dataset.ipTab === 'my-sessions') _loadSessions();
        });
      });
      _sessionsTabInited = true;
    }
  };

  // ─── BJ namespace exports ───
  ['initInterviewPrep', '_ipToggleBookmark', '_ipStartMock', '_ipSendMessage',
   '_ipRequestHint', '_ipEndEarly', '_ipCloseSimulation', '_ipToggleSessionDetail',
   '_ipResumeMock'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'interview-prep', registered: Date.now() };
    }
  });

})();
