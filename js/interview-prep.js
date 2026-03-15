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

  // ─── BJ namespace exports ───
  ['initInterviewPrep', '_ipToggleBookmark'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'interview-prep', registered: Date.now() };
    }
  });

})();
