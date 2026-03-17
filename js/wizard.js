// ============================================================
// FB-CHAT-002 — Guided Intake Wizard
// Sequenced one-question-at-a-time conversational interview
// 7 steps → prompt assembly → chat-job-search → save dialog
// ============================================================

// --- WizardState ---
var _wizardState = {
  currentStep: 1,
  answers: {},
  active: false,
  editingPromptId: null,
  startTime: null
};

var _WIZ_STEPS = [
  { id: 1, title: 'Your Situation', required: true },
  { id: 2, title: 'Role Types', required: true },
  { id: 3, title: 'Location', required: true },
  { id: 4, title: 'Compensation', required: false },
  { id: 5, title: 'Company Size', required: false },
  { id: 6, title: 'Exclusions', required: false },
  { id: 7, title: 'Must-Haves', required: false }
];

var _WIZ_TOTAL = 7;

// --- Intent mappings (Step 1 → natural language) ---
var _INTENT_MAP = {
  'new_role': 'looking for my next opportunity',
  'escaping': 'looking to move on from my current position quickly',
  'pivot': 'making a career change',
  'exploring': 'casually exploring what\'s out there',
  'reenter': 'getting back into the workforce'
};

// --- Step 1 options ---
var _STEP1_OPTIONS = [
  { value: 'new_role', label: 'Looking for a new role', icon: 'briefcase' },
  { value: 'escaping', label: 'Escaping a bad situation', icon: 'flame' },
  { value: 'pivot', label: 'Career pivot', icon: 'shuffle' },
  { value: 'exploring', label: 'Just exploring', icon: 'compass' },
  { value: 'reenter', label: 'Re-entering the workforce', icon: 'log-in' }
];

// --- Step 5 options ---
var _STEP5_OPTIONS = [
  { value: 'startup', label: 'Startup', sub: '1–50 employees', icon: 'rocket' },
  { value: 'growth', label: 'Growth-stage', sub: '51–200 employees', icon: 'trending-up' },
  { value: 'midmarket', label: 'Mid-market', sub: '201–1,000 employees', icon: 'building-2' },
  { value: 'enterprise', label: 'Enterprise', sub: '1,000+ employees', icon: 'landmark' },
  { value: 'no_pref', label: 'No preference', sub: 'Any size works', icon: 'equal' }
];

// --- Conversational headers ---
function _wizHeader(step, answers) {
  switch (step) {
    case 1:
      return {
        header: 'Great to have you here! Let\'s figure out what you\'re looking for. To start, what best describes your situation right now?',
        sub: 'This helps me tailor my suggestions to where you are in your search.'
      };
    case 2: {
      var intentLabel = answers[1] || '';
      if (intentLabel === 'pivot') return { header: 'Since you\'re making a change, what kind of roles are catching your eye?', sub: 'Add as many keywords as you like. Each one helps me find better matches.' };
      if (intentLabel === 'escaping') return { header: 'Let\'s find you something better. What kind of work gets you excited?', sub: 'Add as many keywords as you like. Each one helps me find better matches.' };
      if (intentLabel === 'reenter') return { header: 'Welcome back! What kind of roles are you looking at?', sub: 'Add as many keywords as you like. Each one helps me find better matches.' };
      return { header: 'Nice! Let\'s find you the right roles. What kind of work gets you excited?', sub: 'Add as many keywords as you like. Each one helps me find better matches.' };
    }
    case 3: {
      var loc = '';
      try { loc = (JSON.parse(localStorage.getItem('bj_applicant_profile') || '{}')).location || ''; } catch (_) { /* intentional */ }
      if (loc) return { header: 'Got it! Since you\'re in ' + _wizEsc(loc) + ', are you looking to stay local, go fully remote, or open to relocating?', sub: 'Add one or more locations. Toggle remote to include work-from-anywhere roles.' };
      return { header: 'Where do you want to work? Add locations or go fully remote.', sub: 'Add one or more locations. Toggle remote to include work-from-anywhere roles.' };
    }
    case 4:
      return { header: 'Now let\'s talk money \u2014 what salary range feels right for you? No judgment, this just helps us filter.', sub: 'Drag the handles or check "No preference" to skip.' };
    case 5:
      return { header: 'What kind of company feels like the right fit? Are you drawn to scrappy startups or do you want the stability of a bigger org?', sub: 'Pick as many as you like. "No preference" works too.' };
    case 6:
      return { header: 'Almost there. Are there any companies or industries you want us to skip? Totally optional \u2014 just helps us not waste your time.', sub: 'Add company names or industries to exclude from results.' };
    case 7:
      return { header: 'Last one! Anything else that\'s important to you? Benefits, culture, specific tech, work style \u2014 whatever matters most.', sub: 'Free text, up to 500 characters. This catches the nuance that structured inputs can\'t.' };
    default:
      return { header: '', sub: '' };
  }
}

// --- Escape helper ---
function _wizEsc(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// --- Render progress bar ---
function _wizRenderProgress(step) {
  var el = document.getElementById('wiz-progress');
  if (!el) return;
  var html = '<div class="wiz-progress-bar">';
  for (var i = 1; i <= _WIZ_TOTAL; i++) {
    var cls = 'wiz-seg';
    if (i < step) cls += ' wiz-seg-done';
    else if (i === step) cls += ' wiz-seg-active';
    html += '<div class="' + cls + '"></div>';
  }
  html += '</div>';
  el.innerHTML = html;

  var label = document.getElementById('wiz-step-label');
  if (label) {
    var s = _WIZ_STEPS[step - 1];
    label.textContent = 'Step ' + step + ' of ' + _WIZ_TOTAL + ' \u2014 ' + (s ? s.title : '');
  }
}

// --- Render individual steps ---
function _wizRenderStep(step) {
  var hd = _wizHeader(step, _wizardState.answers);
  var html = '<div class="wiz-step" data-step="' + step + '">';
  html += '<div class="wiz-ai-header">' + _wizEsc(hd.header) + '</div>';
  html += '<div class="wiz-ai-sub">' + _wizEsc(hd.sub) + '</div>';
  html += '<div class="wiz-body">';

  switch (step) {
    case 1:
      html += _wizRenderCardSelector(_STEP1_OPTIONS, _wizardState.answers[1] || '', false);
      break;
    case 2:
      html += _wizRenderPillInput('wiz-roles', _wizardState.answers[2] || [], 'e.g., Product Manager, Data Engineer, Marketing...');
      break;
    case 3:
      html += _wizRenderLocationStep();
      break;
    case 4:
      html += _wizRenderSalarySlider();
      break;
    case 5:
      html += _wizRenderCardSelector(_STEP5_OPTIONS, _wizardState.answers[5] || [], true);
      break;
    case 6:
      html += _wizRenderExclusionStep();
      break;
    case 7:
      html += _wizRenderTextarea();
      break;
  }

  html += '</div></div>';
  return html;
}

// --- Card selector (Steps 1, 5) ---
function _wizRenderCardSelector(options, selected, multi) {
  var selArr = multi ? (Array.isArray(selected) ? selected : []) : [];
  var selVal = multi ? '' : (selected || '');
  var html = '<div class="wiz-cards" data-multi="' + (multi ? '1' : '0') + '">';
  for (var i = 0; i < options.length; i++) {
    var o = options[i];
    var isSelected = multi ? selArr.indexOf(o.value) !== -1 : selVal === o.value;
    html += '<div class="wiz-card' + (isSelected ? ' wiz-card-selected' : '') + '" data-value="' + _wizEsc(o.value) + '" tabindex="0" role="button" aria-pressed="' + isSelected + '">';
    html += '<i data-lucide="' + o.icon + '" class="icon-lg icon-stroke"></i>';
    html += '<div class="wiz-card-label">' + _wizEsc(o.label) + '</div>';
    if (o.sub) html += '<div class="wiz-card-sub">' + _wizEsc(o.sub) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

// --- Pill input (Steps 2, 6) ---
function _wizRenderPillInput(id, existing, placeholder) {
  var html = '<div class="wiz-pill-wrap" id="' + id + '-wrap">';
  html += '<div class="wiz-pills" id="' + id + '-pills">';
  if (Array.isArray(existing)) {
    for (var i = 0; i < existing.length; i++) {
      html += _wizPillHtml(id, existing[i]);
    }
  }
  html += '</div>';
  html += '<input type="text" class="wiz-pill-input" id="' + id + '-input" placeholder="' + _wizEsc(placeholder) + '" autocomplete="off">';
  html += '</div>';
  return html;
}

function _wizPillHtml(id, text) {
  return '<span class="wiz-pill">' + _wizEsc(text) + '<button class="wiz-pill-x" data-group="' + id + '" data-val="' + _wizEsc(text) + '" aria-label="Remove">\u00d7</button></span>';
}

// --- Location step (Step 3) ---
function _wizRenderLocationStep() {
  var ans = _wizardState.answers[3] || { locations: [], remote: true };
  var html = '<div class="wiz-location-wrap">';
  html += _wizRenderPillInput('wiz-locations', ans.locations || [], 'e.g., Austin TX, New York, San Francisco...');
  html += '<label class="wiz-toggle-label"><input type="checkbox" id="wiz-remote-toggle"' + (ans.remote !== false ? ' checked' : '') + '> Include remote jobs</label>';
  html += '</div>';
  return html;
}

// --- Salary slider (Step 4) ---
function _wizRenderSalarySlider() {
  var ans = _wizardState.answers[4] || { min: 50000, max: 200000, skip: false };
  var html = '<div class="wiz-salary-wrap">';
  html += '<label class="wiz-toggle-label"><input type="checkbox" id="wiz-salary-skip"' + (ans.skip ? ' checked' : '') + '> No preference / rather not say</label>';
  html += '<div class="wiz-slider-container' + (ans.skip ? ' wiz-slider-disabled' : '') + '" id="wiz-slider-container">';
  html += '<div class="wiz-slider-labels"><span id="wiz-sal-min-label">$' + Math.round((ans.min || 50000) / 1000) + 'K</span><span id="wiz-sal-max-label">$' + Math.round((ans.max || 200000) / 1000) + 'K</span></div>';
  html += '<div class="wiz-slider-track">';
  html += '<input type="range" class="wiz-range wiz-range-min" id="wiz-sal-min" min="0" max="500000" step="10000" value="' + (ans.min || 50000) + '">';
  html += '<input type="range" class="wiz-range wiz-range-max" id="wiz-sal-max" min="0" max="500000" step="10000" value="' + (ans.max || 200000) + '">';
  html += '</div>';
  html += '</div>';
  html += '<input type="text" class="wiz-comp-note" id="wiz-comp-note" placeholder="Anything else about comp? (equity, bonus, etc.)" maxlength="200" value="' + _wizEsc((ans.note || '')) + '">';
  html += '</div>';
  return html;
}

// --- Exclusion step (Step 6) ---
function _wizRenderExclusionStep() {
  var ans = _wizardState.answers[6] || { companies: [], industries: [] };
  var html = '<div class="wiz-exclusion-wrap">';
  html += '<div class="wiz-excl-section"><div class="wiz-excl-label">Companies to exclude</div>';
  html += _wizRenderPillInput('wiz-excl-companies', ans.companies || [], 'e.g., Amazon, Meta...');
  html += '</div>';
  html += '<div class="wiz-excl-section"><div class="wiz-excl-label">Industries to exclude</div>';
  html += _wizRenderPillInput('wiz-excl-industries', ans.industries || [], 'e.g., Defense, Crypto...');
  html += '</div>';
  html += '</div>';
  return html;
}

// --- Textarea step (Step 7) ---
function _wizRenderTextarea() {
  var ans = _wizardState.answers[7] || '';
  var html = '<div class="wiz-textarea-wrap">';
  html += '<textarea class="wiz-textarea" id="wiz-freetext" maxlength="500" placeholder="e.g., I need visa sponsorship, I want a remote-first culture, I care about equity comp...">' + _wizEsc(ans) + '</textarea>';
  html += '<div class="wiz-char-count" id="wiz-char-count">' + (ans.length || 0) + '/500</div>';
  html += '</div>';
  return html;
}

// --- Review screen ---
function _wizRenderReview() {
  var prompt = _wizAssemblePrompt();
  var html = '<div class="wiz-step wiz-review" data-step="review">';
  html += '<div class="wiz-ai-header">Here\'s what I\'ll search for. Feel free to tweak the prompt before we run it.</div>';
  html += '<div class="wiz-ai-sub">Edit below, or go back to change individual answers.</div>';
  html += '<div class="wiz-review-body">';
  html += '<div class="wiz-review-prompt"><textarea class="wiz-review-textarea" id="wiz-review-prompt" rows="6">' + _wizEsc(prompt) + '</textarea></div>';
  html += '<div class="wiz-review-summary">' + _wizRenderAnswerSummary() + '</div>';
  html += '</div>';
  html += '<div class="wiz-review-actions">';
  html += '<button class="wiz-btn wiz-btn-back" id="wiz-review-back"><i data-lucide="arrow-left" class="icon-sm icon-stroke"></i> Back</button>';
  html += '<a class="wiz-start-over-link" id="wiz-start-over" href="#">Start Over</a>';
  html += '<button class="wiz-btn wiz-btn-search" id="wiz-search-btn"><i data-lucide="search" class="icon-sm icon-stroke"></i> Search Jobs</button>';
  html += '</div>';
  html += '</div>';
  return html;
}

function _wizRenderAnswerSummary() {
  var a = _wizardState.answers;
  var html = '<div class="wiz-summary-title">Your answers</div>';
  if (a[1]) {
    var opt = _STEP1_OPTIONS.find(function(o) { return o.value === a[1]; });
    html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Situation:</span> ' + _wizEsc(opt ? opt.label : a[1]) + '</div>';
  }
  if (a[2] && a[2].length) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Roles:</span> ' + a[2].map(_wizEsc).join(', ') + '</div>';
  if (a[3]) {
    var locParts = [];
    if (a[3].locations && a[3].locations.length) locParts.push(a[3].locations.map(_wizEsc).join(', '));
    if (a[3].remote) locParts.push('Remote');
    if (locParts.length) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Location:</span> ' + locParts.join(' + ') + '</div>';
  }
  if (a[4] && !a[4].skip) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Salary:</span> $' + Math.round(a[4].min / 1000) + 'K \u2013 $' + Math.round(a[4].max / 1000) + 'K</div>';
  if (a[5] && a[5].length && a[5].indexOf('no_pref') === -1) {
    var labels = a[5].map(function(v) { var o = _STEP5_OPTIONS.find(function(x) { return x.value === v; }); return o ? o.label : v; });
    html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Company size:</span> ' + labels.map(_wizEsc).join(', ') + '</div>';
  }
  if (a[6]) {
    if (a[6].companies && a[6].companies.length) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Exclude companies:</span> ' + a[6].companies.map(_wizEsc).join(', ') + '</div>';
    if (a[6].industries && a[6].industries.length) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Exclude industries:</span> ' + a[6].industries.map(_wizEsc).join(', ') + '</div>';
  }
  if (a[7]) html += '<div class="wiz-summary-row"><span class="wiz-summary-label">Must-haves:</span> ' + _wizEsc(a[7]) + '</div>';
  return html;
}

// --- Prompt assembly (Section 7 of spec) ---
function _wizAssemblePrompt() {
  var a = _wizardState.answers;
  var parts = [];

  // Step 1: intent
  if (a[1]) {
    var intent = _INTENT_MAP[a[1]] || 'looking for a new opportunity';
    parts.push('I\'m ' + intent + '.');
  }

  // Step 2: keywords
  if (a[2] && a[2].length) {
    parts.push('I\'m looking for roles in ' + a[2].join(', ') + '.');
  }

  // Step 3: location
  if (a[3]) {
    var locBits = [];
    if (a[3].locations && a[3].locations.length) locBits.push('located in ' + a[3].locations.join(', '));
    if (a[3].remote) locBits.push('including remote');
    if (locBits.length) parts.push(locBits.join(', ') + '.');
  }

  // Step 4: salary
  if (a[4] && !a[4].skip) {
    parts.push('My target salary range is $' + Math.round(a[4].min / 1000) + 'K\u2013$' + Math.round(a[4].max / 1000) + 'K.');
    if (a[4].note) parts.push('Comp notes: ' + a[4].note);
  }

  // Step 5: company size
  if (a[5] && a[5].length && a[5].indexOf('no_pref') === -1) {
    var sizeLabels = a[5].map(function(v) { var o = _STEP5_OPTIONS.find(function(x) { return x.value === v; }); return o ? o.label : v; });
    parts.push('I prefer ' + sizeLabels.join(', ') + ' companies.');
  }

  // Step 6: exclusions
  if (a[6]) {
    if (a[6].companies && a[6].companies.length) parts.push('Please exclude ' + a[6].companies.join(', ') + '.');
    if (a[6].industries && a[6].industries.length) parts.push('Skip these industries: ' + a[6].industries.join(', ') + '.');
  }

  // Step 7: free text
  if (a[7]) {
    parts.push('Additional priorities: ' + a[7]);
  }

  return parts.join(' ');
}

// --- Core navigation ---
function _wizShow(step) {
  _wizardState.currentStep = step;
  _wizRenderProgress(step);

  var viewport = document.getElementById('wiz-viewport');
  var slider = document.getElementById('wiz-slider');
  if (!viewport || !slider) return;

  // Render current step
  if (step === 'review') {
    slider.innerHTML = _wizRenderReview();
    _wizUpdateNav('review');
    _wizWireReviewEvents();
  } else {
    slider.innerHTML = _wizRenderStep(step);
    _wizUpdateNav(step);
    _wizWireStepEvents(step);
  }

  // Refresh Lucide icons in the new content
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  // PostHog
  if (typeof captureEvent === 'function' && step !== 'review') {
    // Don't fire for review — that's wizard_completed
  }
}

function _wizUpdateNav(step) {
  var backBtn = document.getElementById('wiz-back');
  var nextBtn = document.getElementById('wiz-next');
  var skipLink = document.getElementById('wiz-skip');
  var navEl = document.getElementById('wiz-nav');

  if (!backBtn || !nextBtn || !skipLink) return;

  if (step === 'review') {
    // Hide standard nav — review has its own actions
    if (navEl) navEl.style.display = 'none';
    return;
  }

  if (navEl) navEl.style.display = '';

  // Back visible on steps 2+
  if (step > 1) { backBtn.classList.remove('u-hidden'); } else { backBtn.classList.add('u-hidden'); }

  // Skip visible on optional steps (4, 5, 6, 7)
  var stepDef = _WIZ_STEPS[step - 1];
  if (stepDef && !stepDef.required) { skipLink.classList.remove('u-hidden'); } else { skipLink.classList.add('u-hidden'); }

  // Button label
  if (step === _WIZ_TOTAL) {
    nextBtn.textContent = 'Review & Search';
  } else {
    nextBtn.textContent = 'Next';
  }
}

// --- Wire step-specific events ---
function _wizWireStepEvents(step) {
  // Card selectors
  var cards = document.querySelectorAll('.wiz-card');
  cards.forEach(function(card) {
    card.addEventListener('click', function() { _wizHandleCardClick(card, step); });
    card.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _wizHandleCardClick(card, step); } });
  });

  // Pill inputs
  _wizWirePillInput('wiz-roles', 2);
  _wizWirePillInput('wiz-locations', 3);
  _wizWirePillInput('wiz-excl-companies', 6);
  _wizWirePillInput('wiz-excl-industries', 6);

  // Pill remove buttons
  document.querySelectorAll('.wiz-pill-x').forEach(function(btn) {
    btn.addEventListener('click', function() { _wizRemovePill(btn); });
  });

  // Remote toggle (Step 3)
  var remoteToggle = document.getElementById('wiz-remote-toggle');
  if (remoteToggle) {
    remoteToggle.addEventListener('change', function() {
      var ans = _wizardState.answers[3] || { locations: [], remote: true };
      ans.remote = remoteToggle.checked;
      _wizardState.answers[3] = ans;
    });
  }

  // Salary slider (Step 4)
  var salMin = document.getElementById('wiz-sal-min');
  var salMax = document.getElementById('wiz-sal-max');
  var salSkip = document.getElementById('wiz-salary-skip');
  if (salMin && salMax) {
    var updateSalary = function() {
      var mn = parseInt(salMin.value, 10);
      var mx = parseInt(salMax.value, 10);
      if (mn > mx) { salMin.value = mx; mn = mx; }
      document.getElementById('wiz-sal-min-label').textContent = '$' + Math.round(mn / 1000) + 'K';
      document.getElementById('wiz-sal-max-label').textContent = '$' + Math.round(mx / 1000) + 'K';
      _wizardState.answers[4] = { min: mn, max: mx, skip: !!(salSkip && salSkip.checked), note: (document.getElementById('wiz-comp-note') || {}).value || '' };
    };
    salMin.addEventListener('input', updateSalary);
    salMax.addEventListener('input', updateSalary);
  }
  if (salSkip) {
    salSkip.addEventListener('change', function() {
      var container = document.getElementById('wiz-slider-container');
      if (container) {
        if (salSkip.checked) container.classList.add('wiz-slider-disabled');
        else container.classList.remove('wiz-slider-disabled');
      }
      _wizardState.answers[4] = _wizardState.answers[4] || { min: 50000, max: 200000, skip: false, note: '' };
      _wizardState.answers[4].skip = salSkip.checked;
    });
  }

  // Textarea (Step 7)
  var ta = document.getElementById('wiz-freetext');
  if (ta) {
    ta.addEventListener('input', function() {
      _wizardState.answers[7] = ta.value;
      var cc = document.getElementById('wiz-char-count');
      if (cc) cc.textContent = ta.value.length + '/500';
    });
  }

  // Comp note (Step 4)
  var compNote = document.getElementById('wiz-comp-note');
  if (compNote) {
    compNote.addEventListener('input', function() {
      _wizardState.answers[4] = _wizardState.answers[4] || { min: 50000, max: 200000, skip: false, note: '' };
      _wizardState.answers[4].note = compNote.value;
    });
  }
}

function _wizHandleCardClick(card, step) {
  var val = card.getAttribute('data-value');
  var isMulti = card.parentElement && card.parentElement.getAttribute('data-multi') === '1';

  if (isMulti) {
    // Step 5: multi-select with "no_pref" mutual exclusion
    var arr = _wizardState.answers[step] || [];
    if (!Array.isArray(arr)) arr = [];

    if (val === 'no_pref') {
      // Deselect all others, select only no_pref
      arr = ['no_pref'];
    } else {
      // Remove no_pref if selecting a real option
      arr = arr.filter(function(v) { return v !== 'no_pref'; });
      var idx = arr.indexOf(val);
      if (idx !== -1) arr.splice(idx, 1);
      else arr.push(val);
    }
    _wizardState.answers[step] = arr;

    // Update visual
    card.parentElement.querySelectorAll('.wiz-card').forEach(function(c) {
      var cv = c.getAttribute('data-value');
      var sel = arr.indexOf(cv) !== -1;
      c.classList.toggle('wiz-card-selected', sel);
      c.setAttribute('aria-pressed', sel);
    });
  } else {
    // Step 1: single-select
    _wizardState.answers[step] = val;
    card.parentElement.querySelectorAll('.wiz-card').forEach(function(c) {
      var sel = c.getAttribute('data-value') === val;
      c.classList.toggle('wiz-card-selected', sel);
      c.setAttribute('aria-pressed', sel);
    });
  }
}

function _wizWirePillInput(id, step) {
  var input = document.getElementById(id + '-input');
  if (!input) return;

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && input.value.trim()) {
      e.preventDefault();
      _wizAddPill(id, input.value.trim(), step);
      input.value = '';
    }
  });
}

function _wizAddPill(id, text, step) {
  // Read current pills from state
  if (step === 2) {
    var arr = _wizardState.answers[2] || [];
    if (arr.indexOf(text) === -1) arr.push(text);
    _wizardState.answers[2] = arr;
  } else if (step === 3) {
    var ans = _wizardState.answers[3] || { locations: [], remote: true };
    if (!ans.locations) ans.locations = [];
    if (ans.locations.indexOf(text) === -1) ans.locations.push(text);
    _wizardState.answers[3] = ans;
  } else if (step === 6) {
    var excl = _wizardState.answers[6] || { companies: [], industries: [] };
    if (id === 'wiz-excl-companies') {
      if (!excl.companies) excl.companies = [];
      if (excl.companies.indexOf(text) === -1) excl.companies.push(text);
    } else {
      if (!excl.industries) excl.industries = [];
      if (excl.industries.indexOf(text) === -1) excl.industries.push(text);
    }
    _wizardState.answers[6] = excl;
  }

  // Re-render pills
  var pillsEl = document.getElementById(id + '-pills');
  if (pillsEl) {
    pillsEl.innerHTML += _wizPillHtml(id, text);
    // Wire new pill remove
    pillsEl.querySelectorAll('.wiz-pill-x').forEach(function(btn) {
      btn.onclick = function() { _wizRemovePill(btn); };
    });
  }
}

function _wizRemovePill(btn) {
  var group = btn.getAttribute('data-group');
  var val = btn.getAttribute('data-val');

  if (group === 'wiz-roles') {
    var arr = _wizardState.answers[2] || [];
    _wizardState.answers[2] = arr.filter(function(v) { return v !== val; });
  } else if (group === 'wiz-locations') {
    var ans = _wizardState.answers[3] || { locations: [], remote: true };
    ans.locations = (ans.locations || []).filter(function(v) { return v !== val; });
    _wizardState.answers[3] = ans;
  } else if (group === 'wiz-excl-companies') {
    var excl = _wizardState.answers[6] || { companies: [], industries: [] };
    excl.companies = (excl.companies || []).filter(function(v) { return v !== val; });
    _wizardState.answers[6] = excl;
  } else if (group === 'wiz-excl-industries') {
    var excl2 = _wizardState.answers[6] || { companies: [], industries: [] };
    excl2.industries = (excl2.industries || []).filter(function(v) { return v !== val; });
    _wizardState.answers[6] = excl2;
  }

  // Remove pill element
  var pill = btn.parentElement;
  if (pill) pill.remove();
}

// --- Wire review screen events ---
function _wizWireReviewEvents() {
  var backBtn = document.getElementById('wiz-review-back');
  if (backBtn) backBtn.addEventListener('click', function() { _wizShow(_WIZ_TOTAL); });

  var startOver = document.getElementById('wiz-start-over');
  if (startOver) startOver.addEventListener('click', function(e) {
    e.preventDefault();
    _wizardState.answers = {};
    _wizardState.currentStep = 1;
    _wizShow(1);
  });

  var searchBtn = document.getElementById('wiz-search-btn');
  if (searchBtn) searchBtn.addEventListener('click', function() {
    _wizExecuteSearch();
  });
}

// --- Execute search (Session B will wire to EF) ---
function _wizExecuteSearch() {
  var promptEl = document.getElementById('wiz-review-prompt');
  var prompt = promptEl ? promptEl.value : _wizAssemblePrompt();

  // PostHog
  if (typeof captureEvent === 'function') {
    try { captureEvent('wizard_search_executed', { prompt_length: prompt.length }); } catch (_) { /* intentional: PostHog non-fatal */ }
  }

  // Session B: wire to chat-job-search + prompt-to-filter + save dialog
  // For now, send through existing chat infrastructure
  if (typeof window._wizardSearchCallback === 'function') {
    window._wizardSearchCallback(prompt, _wizardState.answers);
  } else if (typeof window.sendChatMessage === 'function') {
    // Fallback: use existing chat pipeline
    _wizClose();
    // Switch to chat mode and send
    var toggleBtns = document.querySelectorAll('#search-mode-toggle .smt-btn');
    toggleBtns.forEach(function(b) { b.classList.remove('active'); });
    var chatBtn = document.querySelector('#search-mode-toggle [data-mode="chat"]');
    if (chatBtn) chatBtn.classList.add('active');
    var chatPanel = document.getElementById('chat-panel');
    var filterWrap = document.getElementById('filter-panel-wrap');
    var wizPanel = document.getElementById('wizard-panel');
    if (chatPanel) { chatPanel.style.display = ''; chatPanel.style.opacity = '1'; }
    if (filterWrap) filterWrap.style.display = 'none';
    if (wizPanel) wizPanel.style.display = 'none';
    window.sendChatMessage(prompt);
  }
}

// --- Open / Close wizard ---
function _wizOpen(entryPoint, existingAnswers) {
  _wizardState.active = true;
  _wizardState.startTime = Date.now();
  _wizardState.currentStep = 1;
  if (existingAnswers) {
    _wizardState.answers = JSON.parse(JSON.stringify(existingAnswers));
  } else {
    _wizardState.answers = {};
  }

  var wizPanel = document.getElementById('wizard-panel');
  var chatPanel = document.getElementById('chat-panel');
  var filterWrap = document.getElementById('filter-panel-wrap');
  if (wizPanel) wizPanel.style.display = '';
  if (chatPanel) { chatPanel.style.display = 'none'; chatPanel.style.opacity = '0'; }
  if (filterWrap) filterWrap.style.display = 'none';

  _wizShow(1);

  // PostHog
  if (typeof captureEvent === 'function') {
    try { captureEvent('wizard_started', { entry_point: entryPoint || 'toggle' }); } catch (_) { /* intentional: PostHog non-fatal */ }
  }
}

function _wizClose() {
  _wizardState.active = false;
  var wizPanel = document.getElementById('wizard-panel');
  if (wizPanel) wizPanel.style.display = 'none';
}

// --- Validate current step before advancing ---
function _wizValidateStep(step) {
  switch (step) {
    case 1: return !!_wizardState.answers[1];
    case 2: return Array.isArray(_wizardState.answers[2]) && _wizardState.answers[2].length > 0;
    case 3: {
      var a3 = _wizardState.answers[3] || {};
      return (a3.locations && a3.locations.length > 0) || a3.remote;
    }
    default: return true; // Steps 4-7 are optional
  }
}

// --- Global navigation handlers ---
function _wizNext() {
  var step = _wizardState.currentStep;

  if (!_wizValidateStep(step)) {
    // Show inline validation message
    var body = document.querySelector('.wiz-step[data-step="' + step + '"] .wiz-body');
    if (body && !body.querySelector('.wiz-validation-msg')) {
      var msg = document.createElement('div');
      msg.className = 'wiz-validation-msg';
      msg.textContent = step === 1 ? 'Pick one to get started.' : step === 2 ? 'Add at least one role or keyword.' : 'Add a location or enable remote.';
      body.prepend(msg);
    }
    return;
  }

  // PostHog
  if (typeof captureEvent === 'function') {
    try { captureEvent('wizard_step_completed', { step: step, skipped: false }); } catch (_) { /* intentional */ }
  }

  if (step >= _WIZ_TOTAL) {
    // Go to review
    _wizardState.currentStep = 'review';
    // PostHog wizard_completed
    if (typeof captureEvent === 'function') {
      var skipped = [];
      for (var i = 1; i <= _WIZ_TOTAL; i++) { if (!_wizardState.answers[i] || (Array.isArray(_wizardState.answers[i]) && _wizardState.answers[i].length === 0)) skipped.push(i); }
      try { captureEvent('wizard_completed', { steps_skipped: skipped, total_time_ms: Date.now() - (_wizardState.startTime || Date.now()) }); } catch (_) { /* intentional */ }
    }
    _wizShow('review');
  } else {
    _wizShow(step + 1);
  }
}

function _wizBack() {
  var step = _wizardState.currentStep;
  if (step === 'review') {
    _wizShow(_WIZ_TOTAL);
  } else if (step > 1) {
    if (typeof captureEvent === 'function') {
      try { captureEvent('wizard_step_back', { from_step: step, to_step: step - 1 }); } catch (_) { /* intentional */ }
    }
    _wizShow(step - 1);
  }
}

function _wizSkip() {
  var step = _wizardState.currentStep;
  if (typeof captureEvent === 'function') {
    try { captureEvent('wizard_step_completed', { step: step, skipped: true }); } catch (_) { /* intentional */ }
  }
  if (step >= _WIZ_TOTAL) {
    _wizardState.currentStep = 'review';
    _wizShow('review');
  } else {
    _wizShow(step + 1);
  }
}

// --- Initialize (called from app.js) ---
function initWizard() {
  // Wire Next/Back/Skip buttons
  var nextBtn = document.getElementById('wiz-next');
  var backBtn = document.getElementById('wiz-back');
  var skipLink = document.getElementById('wiz-skip');

  if (nextBtn) nextBtn.addEventListener('click', _wizNext);
  if (backBtn) backBtn.addEventListener('click', _wizBack);
  if (skipLink) skipLink.addEventListener('click', function(e) { e.preventDefault(); _wizSkip(); });

  // Keyboard: Enter = next, Escape = back
  var wizPanel = document.getElementById('wizard-panel');
  if (wizPanel) {
    wizPanel.addEventListener('keydown', function(e) {
      // Don't intercept when typing in inputs/textareas
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'textarea') return;
      if (tag === 'input' && e.key !== 'Escape') return;
      if (e.key === 'Enter') { e.preventDefault(); _wizNext(); }
      if (e.key === 'Escape') { e.preventDefault(); _wizBack(); }
    });
  }

  // Wire mode toggle — listen for "guided" clicks
  document.querySelectorAll('#search-mode-toggle .smt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (btn.getAttribute('data-mode') === 'guided') {
        _wizOpen('toggle');
      }
    });
  });
}

// --- Auto-init ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWizard);
} else {
  initWizard();
}

// --- New user default: zero filters + zero prompts → wizard ---
function _wizCheckNewUserDefault() {
  try {
    // Check if user has any saved filters or prompts
    var sf = safeReadLS('bj_saved_filters', []);
    var sp = safeReadLS('bj_saved_prompts', []);
    if ((!sf || sf.length === 0) && (!sp || sp.length === 0)) {
      // Default to wizard for new users
      if (typeof setSearchMode === 'function') {
        setTimeout(function() { setSearchMode('guided'); }, 500);
      }
    }
  } catch (_) { /* intentional: non-fatal new user check */ }
}
// Run after a short delay to let other init complete
setTimeout(_wizCheckNewUserDefault, 2000);

// --- Window exports ---
window.initWizard = initWizard;
window._wizOpen = _wizOpen;
window._wizClose = _wizClose;
window._wizAssemblePrompt = _wizAssemblePrompt;
window._wizardState = _wizardState;

// BJ namespace
if (typeof window.BJ === 'object') {
  window.BJ.initWizard = initWizard;
  window.BJ._wizOpen = _wizOpen;
  window.BJ._wizClose = _wizClose;
  window.BJ._wizAssemblePrompt = _wizAssemblePrompt;
}
