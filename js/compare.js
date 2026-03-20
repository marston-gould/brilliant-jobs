// ============================================================
// compare.js — Multi-competitor grid v2 (LP-09 through LP-11)
// Version: v11.47
// BJ always pinned left. Up to 6 competitors. Hash deep-linking.
// ============================================================
(function () {
  'use strict';

  var BJ_COLOR = '#1D9E75';

  var COMPETITORS = [
    { id: 'linkedin',     name: 'LinkedIn',      short: 'LI', color: '#0077B5' },
    { id: 'indeed',       name: 'Indeed',        short: 'IN', color: '#2164F3' },
    { id: 'ziprecruiter', name: 'ZipRecruiter',  short: 'ZR', color: '#5BA840' },
    { id: 'careerflow',   name: 'Careerflow',    short: 'CF', color: '#845EF7' },
    { id: 'teal',         name: 'Teal',          short: 'TL', color: '#00B4D8' },
    { id: 'huntr',        name: 'Huntr',         short: 'HN', color: '#FF6B6B' },
    { id: 'simplify',     name: 'Simplify',      short: 'SM', color: '#FD7E14' },
    { id: 'jobscan',      name: 'Jobscan',       short: 'JS', color: '#6C5CE7' },
    { id: 'sonara',       name: 'Sonara',        short: 'SN', color: '#E8590C' },
    { id: 'lazyapply',    name: 'LazyApply',     short: 'LA', color: '#F08C00' },
    { id: 'jobcopilot',   name: 'JobCopilot',    short: 'JC', color: '#4263EB' },
    { id: 'loopcv',       name: 'LoopCV',        short: 'LC', color: '#12B886' },
    { id: 'resumeworded', name: 'Resume Worded', short: 'RW', color: '#AE3EC9' },
    { id: 'rezi',         name: 'Rezi',          short: 'RZ', color: '#D6336C' },
    { id: 'kickresume',   name: 'Kickresume',    short: 'KR', color: '#E64980' },
    { id: 'jackandjill',  name: 'Jack & Jill',   short: 'JJ', color: '#F76707' },
  ];

  var CATEGORIES = [
    {
      id: 'ghost',
      name: 'Find real jobs, not ghost jobs',
      icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
      items: [
        { label: 'Sources jobs directly from employer systems', bj: true, c: {} },
        { label: 'Detects ghost jobs before you waste time',    bj: true, c: {} },
        { label: 'Shows companies flagged for ghost behavior',  bj: true, c: {} },
        { label: 'Automatically removes dead listings',         bj: true, c: {} },
        { label: 'Flags scam and fraud postings',               bj: true, c: {} },
      ]
    },
    {
      id: 'filters',
      name: 'Filters that actually help',
      icon: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z',
      items: [
        { label: 'Salary filter using real posted salaries',    bj: true, c: { linkedin: true, indeed: true, ziprecruiter: true } },
        { label: 'Block specific companies or industries',       bj: true, c: {} },
        { label: 'Search inside job descriptions',               bj: true, c: { indeed: true } },
        { label: 'Flags staffing agencies vs. direct employers', bj: true, c: {} },
        { label: 'Daily new job alerts matching saved filters',  bj: true, c: { linkedin: true, indeed: true, ziprecruiter: true, simplify: true, sonara: true, loopcv: true } },
        { label: 'NOT filters for title, location, company',     bj: true, c: {} },
        { label: 'Seniority level classification on every job',  bj: true, c: {} },
      ]
    },
    {
      id: 'apply',
      name: 'Apply smarter, not harder',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      items: [
        { label: 'AI resume score for every job you view',       bj: true, c: { careerflow: true, teal: true, huntr: true, simplify: true, jobscan: true, jobcopilot: true, resumeworded: true, rezi: true, jackandjill: true } },
        { label: 'One-click resume tailoring per job',           bj: true, c: { careerflow: true, teal: true, huntr: true, simplify: true, jobscan: true, jobcopilot: true, rezi: true } },
        { label: 'Auto-apply across multiple ATS platforms',     bj: true, c: { simplify: true, sonara: true, lazyapply: true, jobcopilot: true, loopcv: true } },
        { label: 'AI cover letter matched to each role',         bj: true, c: { careerflow: true, teal: true, huntr: true, simplify: true, jobscan: true, jobcopilot: true, loopcv: true, rezi: true, kickresume: true, jackandjill: true } },
        { label: 'AI interview practice for your specific job',  bj: true, c: { careerflow: true, teal: true, huntr: true, jobscan: true, jackandjill: true } },
        { label: 'Score gate pauses low-match applications',     bj: true, c: {} },
        { label: 'Resume readiness scoring per saved filter',    bj: true, c: {} },
      ]
    },
    {
      id: 'market',
      name: 'Actually understand the market',
      icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
      items: [
        { label: 'Real salary data from actual postings',                        bj: true, c: { linkedin: true, indeed: true, ziprecruiter: true } },
        { label: 'See which companies are really hiring vs. just posting',       bj: true, c: {} },
        { label: 'Hiring trends by industry and location',                       bj: true, c: { linkedin: true, indeed: true, ziprecruiter: true } },
        { label: 'Track application performance over time',                      bj: true, c: { careerflow: true, teal: true, huntr: true, loopcv: true } },
        { label: 'See who in your network works at a company',                   bj: true, c: { linkedin: true, careerflow: true } },
        { label: '7M+ company dataset with size, industry, and HQ',             bj: true, c: {} },
      ]
    },
  ];

  // Fill missing competitor entries
  CATEGORIES.forEach(function(cat) {
    cat.items.forEach(function(item) {
      COMPETITORS.forEach(function(comp) {
        if (!(comp.id in item.c)) item.c[comp.id] = false;
      });
    });
  });

  var DEFAULT_SHOWN = ['linkedin', 'indeed', 'ziprecruiter', 'simplify', 'jobscan'];
  var shown = new Set(DEFAULT_SHOWN);
  var focusCat = null;
  var pickerOpen = false;
  var catRefs = {};

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function checkIcon(color) {
    return '<span class="chk" style="color:' + color + '">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
      + '<polyline points="20 6 9 20 4 14"/>'
      + '</svg></span>';
  }

  function missIcon() {
    return '<span class="miss">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<line x1="5" y1="12" x2="19" y2="12"/>'
      + '</svg></span>';
  }

  function activeComps() {
    return COMPETITORS.filter(function(c) { return shown.has(c.id); });
  }

  function renderCompUI() {
    var comps = activeComps();
    var html = '';

    // Header row
    html += '<div class="comp-header">'
          + '<span>Comparing against ' + comps.length + ' competitor' + (comps.length !== 1 ? 's' : '') + '</span>'
          + '<button class="edit-btn" id="edit-btn">' + (pickerOpen ? 'Done' : 'Edit competitors') + '</button>'
          + '</div>';

    // Picker
    html += '<div class="picker' + (pickerOpen ? ' open' : '') + '" id="picker">';
    COMPETITORS.forEach(function(c) {
      var active = shown.has(c.id);
      html += '<button class="picker-pill' + (active ? ' active' : '') + '" data-id="' + c.id + '" '
            + 'style="' + (active ? 'border-color:' + c.color + ';color:' + c.color + ';background:' + c.color + '18;' : '') + '">'
            + '<span style="width:7px;height:7px;border-radius:50%;background:' + (active ? c.color : 'var(--faint)') + ';display:inline-block"></span>'
            + esc(c.name)
            + '</button>';
    });
    html += '<span class="picker-count">' + shown.size + '/6 max</span>';
    html += '</div>';

    // Active comp chips
    html += '<div class="comp-pills">';
    comps.forEach(function(c) {
      html += '<span class="comp-chip" style="background:' + c.color + '15;color:' + c.color + '">'
            + '<span style="width:6px;height:6px;border-radius:50%;background:' + c.color + ';display:inline-block"></span>'
            + esc(c.name)
            + '</span>';
    });
    html += '</div>';

    document.getElementById('comp-ui').innerHTML = html;

    document.getElementById('edit-btn').addEventListener('click', function() {
      pickerOpen = !pickerOpen;
      renderCompUI();
    });
    document.querySelectorAll('.picker-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-id');
        if (shown.has(id)) {
          if (shown.size > 1) shown.delete(id);
        } else if (shown.size < 6) {
          shown.add(id);
        }
        renderCompUI();
        renderGrid();
      });
    });
  }

  function renderCatFilter() {
    var html = '<button class="cat-pill' + (!focusCat ? ' active' : '') + '" data-cat="">All categories</button>';
    CATEGORIES.forEach(function(cat) {
      html += '<button class="cat-pill' + (focusCat === cat.id ? ' active' : '') + '" data-cat="' + cat.id + '">'
            + cat.name.split(',')[0]
            + '</button>';
    });
    document.getElementById('cat-filter').innerHTML = html;
    document.querySelectorAll('.cat-pill').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.getAttribute('data-cat');
        focusCat = id || null;
        renderCatFilter();
        renderGrid();
        if (focusCat && catRefs[focusCat]) {
          catRefs[focusCat].scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function renderGrid() {
    var comps = activeComps();
    var cols = 2 + comps.length; // label + BJ + N competitors
    var colW = Math.max(48, Math.min(72, 360 / comps.length));
    var gridCols = 'minmax(0,1fr) 44px ' + comps.map(function() { return colW + 'px'; }).join(' ');
    var html = '';

    var catsToShow = focusCat
      ? CATEGORIES.filter(function(c) { return c.id === focusCat; })
      : CATEGORIES;

    catsToShow.forEach(function(cat) {
      var bjCount = cat.items.filter(function(i) { return i.bj; }).length;
      html += '<div class="cat-block" id="cat-' + cat.id + '">';
      html += '<div class="cat-block-inner">';

      // Category header
      html += '<div class="cat-head">'
            + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="' + esc(cat.icon) + '"/></svg>'
            + '<span class="cat-name">' + esc(cat.name) + '</span>'
            + '<span class="cat-score-badge">' + bjCount + '/' + cat.items.length + '</span>'
            + '</div>';

      // Feature table
      html += '<div class="feat-table" style="display:grid;grid-template-columns:' + gridCols + '">';

      // Column headers
      html += '<div class="col-header" style="justify-content:flex-start">Feature</div>';
      html += '<div class="col-header bj-col" style="justify-content:center">BJ</div>';
      comps.forEach(function(comp) {
        html += '<div class="col-header" style="color:' + comp.color + ';text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + comp.short + '</div>';
      });

      // Feature rows
      cat.items.forEach(function(item) {
        var bjOnly = item.bj && comps.every(function(c) { return !item.c[c.id]; });
        var rowBg = bjOnly ? 'background:var(--green-dim)' : '';

        html += '<div style="padding:9px 8px 9px 16px;border-top:1px solid var(--border-light);font-size:13px;display:flex;align-items:center;' + rowBg + ';color:' + (bjOnly ? 'var(--text)' : 'var(--dim)') + ';font-weight:' + (bjOnly ? '500' : '400') + '">'
              + esc(item.label)
              + '</div>';

        html += '<div style="padding:9px 4px;border-top:1px solid var(--border-light);display:flex;align-items:center;justify-content:center;' + rowBg + '">'
              + (item.bj ? checkIcon(BJ_COLOR) : missIcon())
              + '</div>';

        comps.forEach(function(comp) {
          html += '<div style="padding:9px 4px;border-top:1px solid var(--border-light);display:flex;align-items:center;justify-content:center;' + rowBg + '">'
                + (item.c[comp.id] ? checkIcon(comp.color) : missIcon())
                + '</div>';
        });
      });

      // Score row
      html += '<div style="padding:8px 8px 8px 16px;border-top:1.5px solid var(--border);font-size:12px;font-weight:600;color:var(--faint);background:#fafbfd;display:flex;align-items:center">Score</div>';
      html += '<div style="padding:8px 4px;border-top:1.5px solid var(--border);font-size:13px;font-weight:700;color:' + BJ_COLOR + ';display:flex;align-items:center;justify-content:center;background:#fafbfd">'
            + cat.items.filter(function(i) { return i.bj; }).length
            + '</div>';
      comps.forEach(function(comp) {
        var score = cat.items.filter(function(i) { return i.c[comp.id]; }).length;
        html += '<div style="padding:8px 4px;border-top:1.5px solid var(--border);font-size:13px;font-weight:600;color:' + (score > 0 ? comp.color : 'var(--faint)') + ';display:flex;align-items:center;justify-content:center;background:#fafbfd">'
              + score
              + '</div>';
      });

      html += '</div>'; // end feat-table
      html += '</div>'; // end cat-block-inner
      html += '</div>'; // end cat-block
    });

    document.getElementById('grid').innerHTML = html;

    // Store refs for scrolling
    CATEGORIES.forEach(function(cat) {
      catRefs[cat.id] = document.getElementById('cat-' + cat.id);
    });

    // Highlight targeted category
    if (focusCat && catRefs[focusCat]) {
      catRefs[focusCat].classList.add('highlighted');
    }
  }

  function init() {
    // Hash-based deep linking (LP-10)
    var hash = (window.location.hash || '').replace('#', '');
    if (hash && CATEGORIES.find(function(c) { return c.id === hash; })) {
      focusCat = hash;
    }

    renderCompUI();
    renderCatFilter();
    renderGrid();

    // Scroll to category if hash was set
    if (focusCat && catRefs[focusCat]) {
      setTimeout(function() {
        catRefs[focusCat].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
