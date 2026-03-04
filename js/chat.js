// ============================================================
// CHAT MODE — Conversational Job Search (Session 4)
// Toggle between Filters and Chat on Jobs Feed + Bidirectional Sync + Saved Prompts
// Wires to chat-job-search, filter-to-prompt, prompt-to-filter Edge Functions
// Saved prompts: Save/Load with Supabase persistence + derived_filters auto-update
// ============================================================

// --- State ---
var _chatMode = false;
var _chatMessages = []; // { role: 'user'|'assistant', content: string, filters?: object }
var _chatSending = false;
var _chatRateLimit = { remaining: null, resetAt: null };
var _chatMessageCap = 20;
var _chatSyncInProgress = false;
var _chatLastSyncedFilterHash = null;

// Off-topic blocklist (Layer 1 client-side protection)
var _chatBlockedPatterns = [
  /write\s+(me\s+)?(a\s+)?(poem|story|essay|song|code|script)/i,
  /ignore\s+(previous|all|above)\s+(instructions|prompts)/i,
  /you\s+are\s+(now|a)\s/i,
  /pretend\s+(to\s+be|you)/i,
  /act\s+as\s+(a|an)\s/i,
  /what\s+is\s+the\s+meaning\s+of\s+life/i,
  /tell\s+me\s+(a\s+)?joke/i,
  /translate\s+.+\s+to\s/i,
  /system\s*prompt/i,
  /<\/?[a-z]+>/i,  // HTML injection
];

// --- Rate limit tiers ---
var _chatLimits = {
  free:    { perConvo: 10, perDay: 30 },
  starter: { perConvo: 30, perDay: 100 },
  pro:     { perConvo: 100, perDay: 500 }
};

// --- ChatSession class ---
function ChatSession() {
  this.messages = [];
  this.messageCount = 0;
}

ChatSession.prototype.addMessage = function(role, content, filters) {
  this.messages.push({ role: role, content: content, filters: filters || null, ts: Date.now() });
  if (role === 'user') this.messageCount++;
  // Cap at 20 messages (10 user + 10 assistant) for context window
  if (this.messages.length > _chatMessageCap) {
    this.messages = this.messages.slice(-_chatMessageCap);
  }
};

ChatSession.prototype.getHistory = function() {
  return this.messages.map(function(m) {
    return { role: m.role, content: m.content };
  });
};

ChatSession.prototype.clear = function() {
  this.messages = [];
  this.messageCount = 0;
};

var _chatSession = new ChatSession();

// --- Mode Toggle ---
function initChatMode() {
  var toggle = document.getElementById('search-mode-toggle');
  if (!toggle) return;

  var filtersBtn = toggle.querySelector('[data-mode="filters"]');
  var chatBtn = toggle.querySelector('[data-mode="chat"]');

  if (filtersBtn) filtersBtn.addEventListener('click', function() { setSearchMode('filters'); });
  if (chatBtn) chatBtn.addEventListener('click', function() { setSearchMode('chat'); });

  // Init chat input handlers
  var chatInput = document.getElementById('chat-input');
  var chatSendBtn = document.getElementById('chat-send-btn');

  if (chatInput) {
    chatInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
    // Auto-resize textarea + track user edits to auto-generated prompts
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      // Track if user modified an auto-generated prompt
      if (this.getAttribute('data-auto-generated') === 'true') {
        this.setAttribute('data-auto-generated', 'modified');
        if (window.posthog) {
          try { posthog.capture('chat_prompt_modified'); } catch(e) {}
        }
      }
    });
  }
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }

  // Init saved prompts (Session 4)
  initSavedPrompts();

  // Clear chat button
  var clearBtn = document.getElementById('chat-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      // Track if user scrapped an auto-generated prompt
      var chatInput = document.getElementById('chat-input');
      if (chatInput && chatInput.getAttribute('data-auto-generated')) {
        chatInput.removeAttribute('data-auto-generated');
        if (window.posthog) {
          try { posthog.capture('chat_prompt_scrapped'); } catch(e) {}
        }
      }
      _chatSession.clear();
      _chatMessages = [];
      _chatLastSyncedFilterHash = null;
      _currentPromptId = null;
      renderChatMessages();
      updateChatCounter();
      updateLoadedPromptIndicator();
      // Hide sync banner if visible
      var syncBanner = document.getElementById('chat-sync-banner');
      if (syncBanner) syncBanner.style.display = 'none';
    });
  }
}

function setSearchMode(mode) {
  var prevMode = _chatMode ? 'chat' : 'filters';
  _chatMode = (mode === 'chat');

  var toggle = document.getElementById('search-mode-toggle');
  if (!toggle) return;

  var filtersBtn = toggle.querySelector('[data-mode="filters"]');
  var chatBtn = toggle.querySelector('[data-mode="chat"]');

  // Update toggle state
  if (filtersBtn) filtersBtn.classList.toggle('active', !_chatMode);
  if (chatBtn) chatBtn.classList.toggle('active', _chatMode);

  // Crossfade panels
  var filterPanel = document.getElementById('filter-panel-wrap');
  var chatPanel = document.getElementById('chat-panel');

  if (filterPanel && chatPanel) {
    if (_chatMode) {
      filterPanel.style.opacity = '0';
      filterPanel.style.pointerEvents = 'none';
      setTimeout(function() {
        filterPanel.style.display = 'none';
        chatPanel.style.display = 'flex';
        requestAnimationFrame(function() {
          chatPanel.style.opacity = '1';
          chatPanel.style.pointerEvents = 'auto';
        });
        var chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.focus();
      }, 200);

      // --- Filter→Chat sync: pre-fill chat input from active filters ---
      if (prevMode === 'filters') {
        syncFilterToChat();
      }
    } else {
      chatPanel.style.opacity = '0';
      chatPanel.style.pointerEvents = 'none';
      setTimeout(function() {
        chatPanel.style.display = 'none';
        filterPanel.style.display = 'block';
        requestAnimationFrame(function() {
          filterPanel.style.opacity = '1';
          filterPanel.style.pointerEvents = 'auto';
        });
      }, 200);

      // --- Chat→Filter sync: extract filters from conversation ---
      if (prevMode === 'chat') {
        syncChatToFilter();
      }
    }
  }

  // PostHog event
  if (window.posthog) {
    try { posthog.capture('search_mode_toggled', { mode: mode }); } catch(e) {}
  }
}


// --- Bidirectional Sync (Session 3) ---

// Collect current builder pill state into a filter object for the Edge Function
function _collectBuilderFilters() {
  var filters = {};
  // Read pill arrays from global scope (query-builder.js exports these)
  if (typeof whatPills !== 'undefined' && whatPills.length) {
    filters.what_pills = [];
    whatPills.forEach(function(p) { filters.what_pills = filters.what_pills.concat(p.values); });
  }
  if (typeof wherePills !== 'undefined' && wherePills.length) {
    filters.where_pills = [];
    wherePills.forEach(function(p) { filters.where_pills = filters.where_pills.concat(p.values); });
  }
  if (typeof whoPills !== 'undefined' && whoPills.length) {
    filters.who_pills = [];
    whoPills.forEach(function(p) { filters.who_pills = filters.who_pills.concat(p.values); });
  }
  if (typeof whatNotPills !== 'undefined' && whatNotPills.length) {
    filters.not_pills = [];
    whatNotPills.forEach(function(p) { filters.not_pills = filters.not_pills.concat(p.values); });
  }
  // Type pills from whenPills that are workplace types
  if (typeof whenPills !== 'undefined' && whenPills.length) {
    filters.type_pills = [];
    whenPills.forEach(function(p) { filters.type_pills = filters.type_pills.concat(p.values); });
  }
  // Salary from payPills
  if (typeof payPills !== 'undefined' && payPills.length) {
    payPills.forEach(function(p) {
      p.values.forEach(function(v) {
        var clean = v.replace(/[^0-9kK+\-]/g, '').toLowerCase();
        var num = parseInt(clean.replace('k', '000'));
        if (!isNaN(num)) {
          if (v.indexOf('+') >= 0 || v.indexOf('min') >= 0) {
            filters.salary_min = num;
          } else {
            // If we already have a min, this is likely max
            if (filters.salary_min) {
              filters.salary_max = num;
            } else {
              filters.salary_min = num;
            }
          }
        }
      });
    });
  }
  return filters;
}

// Hash filter object to detect changes (avoid redundant syncs)
function _hashFilters(filters) {
  try { return JSON.stringify(filters); } catch(e) { return ''; }
}

// Filter→Chat: On toggle to Chat with active filters, call filter-to-prompt and pre-fill input
async function syncFilterToChat() {
  if (_chatSyncInProgress) return;
  if (_chatSession.messages.length > 0) return; // Don't overwrite active conversation

  var filters = _collectBuilderFilters();
  var hash = _hashFilters(filters);
  if (!filters || Object.keys(filters).length === 0) return; // No active filters
  if (hash === _chatLastSyncedFilterHash) return; // Already synced these exact filters

  _chatSyncInProgress = true;
  var chatInput = document.getElementById('chat-input');

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { _chatSyncInProgress = false; return; }

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/filter-to-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ filters: filters })
    });

    if (!resp.ok) {
      console.warn('[BJ] filter-to-prompt failed:', resp.status);
      _chatSyncInProgress = false;
      return;
    }

    var data = await resp.json();
    var prompt = (data.prompt || '').trim();

    if (prompt && chatInput) {
      chatInput.value = prompt;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
      chatInput.setAttribute('data-auto-generated', 'true');
      _chatLastSyncedFilterHash = hash;

      // Show subtle hint that this was auto-generated
      var banner = document.getElementById('chat-filter-banner');
      if (banner) {
        banner.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg>' +
          '<span>Pre-filled from your active filters — edit or send as-is</span>';
        banner.style.display = 'flex';
        // Auto-hide after 6s
        setTimeout(function() { banner.style.display = 'none'; }, 6000);
      }

      // PostHog event
      if (window.posthog) {
        try { posthog.capture('chat_prompt_auto_generated', { filter_count: Object.keys(filters).length, fallback: !!data.fallback }); } catch(e) {}
      }
    }
  } catch (err) {
    console.error('[BJ] Filter→Chat sync error:', err);
  }

  _chatSyncInProgress = false;
}

// Chat→Filter: On toggle to Filters with conversation, call prompt-to-filter and populate pills
async function syncChatToFilter() {
  if (_chatSyncInProgress) return;
  if (_chatSession.messages.length === 0) return; // No conversation to extract from

  _chatSyncInProgress = true;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) { _chatSyncInProgress = false; return; }

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/prompt-to-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ conversation: _chatSession.getHistory() })
    });

    if (!resp.ok) {
      console.warn('[BJ] prompt-to-filter failed:', resp.status);
      _chatSyncInProgress = false;
      return;
    }

    var data = await resp.json();
    var filters = data.filters;

    if (!filters || typeof filters !== 'object' || Object.keys(filters).length === 0) {
      // Partial extraction or empty — no pills to populate
      if (data.parse_error) {
        console.warn('[BJ] prompt-to-filter parse error');
      }
      _chatSyncInProgress = false;
      return;
    }

    // Show confirmation banner before populating pills
    _showSyncConfirmation(filters);

  } catch (err) {
    console.error('[BJ] Chat→Filter sync error:', err);
  }

  _chatSyncInProgress = false;
}

// Show a confirmation banner with extracted filters, user can Accept or Dismiss
function _showSyncConfirmation(filters) {
  var banner = document.getElementById('chat-sync-banner');
  if (!banner) return;

  // Build summary of what was extracted
  var parts = [];
  if (filters.what_pills && filters.what_pills.length) parts.push(filters.what_pills.length + ' role' + (filters.what_pills.length > 1 ? 's' : ''));
  if (filters.where_pills && filters.where_pills.length) parts.push(filters.where_pills.length + ' location' + (filters.where_pills.length > 1 ? 's' : ''));
  if (filters.who_pills && filters.who_pills.length) parts.push(filters.who_pills.length + ' compan' + (filters.who_pills.length > 1 ? 'ies' : 'y'));
  if (filters.not_pills && filters.not_pills.length) parts.push(filters.not_pills.length + ' exclusion' + (filters.not_pills.length > 1 ? 's' : ''));
  if (filters.type_pills && filters.type_pills.length) parts.push(filters.type_pills.join(', '));
  if (filters.salary_min || filters.salary_max) parts.push('salary range');
  if (filters.additional_context) parts.push('preferences');

  if (parts.length === 0) { banner.style.display = 'none'; return; }

  var summary = parts.join(', ');

  banner.innerHTML = '<div class="chat-sync-msg">' +
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    '<span>Extracted from chat: ' + escapeHtml(summary) + '</span>' +
    '</div>' +
    '<div class="chat-sync-actions">' +
    '<button class="chat-sync-accept" id="chat-sync-accept">Apply to filters</button>' +
    '<button class="chat-sync-dismiss" id="chat-sync-dismiss">Dismiss</button>' +
    '</div>';
  banner.style.display = 'flex';

  // Bind accept
  document.getElementById('chat-sync-accept').addEventListener('click', function() {
    _applySyncedFilters(filters);
    banner.style.display = 'none';
    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_to_filter_sync', { action: 'accepted', filter_count: Object.keys(filters).length }); } catch(e) {}
    }
  });

  // Bind dismiss
  document.getElementById('chat-sync-dismiss').addEventListener('click', function() {
    banner.style.display = 'none';
    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_to_filter_sync', { action: 'dismissed' }); } catch(e) {}
    }
  });
}

// Apply extracted filters from chat to the pill system
function _applySyncedFilters(filters) {
  // Clear existing builder pills before applying new ones
  // We use the global pill arrays + renderAllPills from query-builder.js

  if (filters.what_pills && filters.what_pills.length) {
    if (typeof whatPills !== 'undefined') {
      // Reset what pills, add new ones
      whatPills.length = 0;
      filters.what_pills.forEach(function(v) {
        whatPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.where_pills && filters.where_pills.length) {
    if (typeof wherePills !== 'undefined') {
      wherePills.length = 0;
      filters.where_pills.forEach(function(v) {
        wherePills.push({ values: [v], type: 'location' });
      });
    }
  }

  if (filters.who_pills && filters.who_pills.length) {
    if (typeof whoPills !== 'undefined') {
      whoPills.length = 0;
      filters.who_pills.forEach(function(v) {
        whoPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.not_pills && filters.not_pills.length) {
    if (typeof whatNotPills !== 'undefined') {
      whatNotPills.length = 0;
      filters.not_pills.forEach(function(v) {
        whatNotPills.push({ values: [v], type: 'keyword' });
      });
    }
  }

  if (filters.salary_min || filters.salary_max) {
    if (typeof payPills !== 'undefined') {
      payPills.length = 0;
      if (filters.salary_min && filters.salary_max) {
        var minK = Math.round(filters.salary_min / 1000);
        var maxK = Math.round(filters.salary_max / 1000);
        payPills.push({ values: ['$' + minK + 'k-$' + maxK + 'k'], type: 'salary' });
      } else if (filters.salary_min) {
        var minK = Math.round(filters.salary_min / 1000);
        payPills.push({ values: ['$' + minK + 'k+'], type: 'salary' });
      } else if (filters.salary_max) {
        var maxK = Math.round(filters.salary_max / 1000);
        payPills.push({ values: ['<$' + maxK + 'k'], type: 'salary' });
      }
    }
  }

  // Render all pills visually
  if (typeof renderAllPills === 'function') {
    renderAllPills();
  }

  // Trigger job feed refresh
  if (typeof debouncedSearchJobs === 'function') {
    debouncedSearchJobs();
  }

  // Show toast confirmation
  if (typeof showToast === 'function') {
    showToast('Chat filters applied to search', 'success');
  }
}

// --- Send message ---
async function sendChatMessage() {
  if (_chatSending) return;

  var chatInput = document.getElementById('chat-input');
  if (!chatInput) return;

  var text = chatInput.value.trim();
  if (!text) return;

  // Client-side off-topic check (Layer 1)
  for (var i = 0; i < _chatBlockedPatterns.length; i++) {
    if (_chatBlockedPatterns[i].test(text)) {
      appendChatBubble('assistant', 'I can only help with job search queries. Try describing the kind of role, location, company, or salary range you\'re looking for.');
      chatInput.value = '';
      chatInput.style.height = 'auto';
      return;
    }
  }

  // Check message cap
  if (_chatSession.messageCount >= _chatMessageCap / 2) {
    appendChatBubble('assistant', 'You\'ve reached the conversation limit (' + (_chatMessageCap / 2) + ' messages). Clear the conversation to start fresh.');
    return;
  }

  // Clear input and auto-generated flag
  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatInput.removeAttribute('data-auto-generated');

  // Add user message
  _chatSession.addMessage('user', text);
  appendChatBubble('user', text);
  updateChatCounter();

  // Show typing indicator
  showTypingIndicator(true);
  _chatSending = true;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) {
      showTypingIndicator(false);
      appendChatBubble('assistant', 'Please sign in to use chat search.');
      _chatSending = false;
      return;
    }

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/functions/v1/chat-job-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        messages: _chatSession.getHistory(),
        tier: getUserTier()
      })
    });

    showTypingIndicator(false);

    if (resp.status === 429) {
      var rateLimitData = null;
      try { rateLimitData = await resp.json(); } catch(e) {}
      showChatRateLimit(rateLimitData);
      _chatSending = false;
      return;
    }

    if (!resp.ok) {
      var errText = '';
      try { var errJ = await resp.json(); errText = errJ.error || errJ.message || ''; } catch(e) {}
      appendChatBubble('assistant', 'Something went wrong. ' + (errText || 'Please try again.'));
      _chatSending = false;
      return;
    }

    var data = await resp.json();

    // Extract response text and filters
    var assistantText = data.response || data.text || '';
    var extractedFilters = data.filters || null;

    // Add assistant message
    _chatSession.addMessage('assistant', assistantText, extractedFilters);
    appendChatBubble('assistant', assistantText);

    // Update rate limit display
    if (data.remaining !== undefined) {
      _chatRateLimit.remaining = data.remaining;
      updateChatRateLimitDisplay();
    }

    // If filters were extracted, update the job feed
    if (extractedFilters && Object.keys(extractedFilters).length > 0) {
      applyChatFilters(extractedFilters);
    }

    // Session 4: Update derived_filters in saved prompt on every conversation update
    if (_currentPromptId) {
      updateDerivedFilters();
    }

  } catch (err) {
    showTypingIndicator(false);
    console.error('[BJ] Chat error:', err);
    appendChatBubble('assistant', 'Connection error. Please check your network and try again.');
  }

  _chatSending = false;
}

// --- Apply extracted filters to job feed ---
function applyChatFilters(filters) {
  // The Edge Function extracts structured filters like:
  // { keywords: [...], locations: [...], salary_min: N, salary_max: N, level: '...', remote: bool }
  // We trigger a fresh job feed query with these params
  console.log('[BJ] Chat extracted filters:', JSON.stringify(filters));

  // Show a subtle banner that filters were applied
  var banner = document.getElementById('chat-filter-banner');
  if (banner) {
    var count = 0;
    if (filters.keywords) count += filters.keywords.length;
    if (filters.locations) count += filters.locations.length;
    if (filters.level) count++;
    if (filters.remote) count++;
    if (filters.salary_min || filters.salary_max) count++;

    banner.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></svg> ' +
      '<span>' + count + ' filter' + (count !== 1 ? 's' : '') + ' extracted from conversation</span>';
    banner.style.display = 'flex';

    // Auto-hide after 5s
    setTimeout(function() { banner.style.display = 'none'; }, 5000);
  }

  // Build a temporary search config and trigger job feed refresh
  // This integrates with the existing searchJobs() pipeline
  if (typeof window._chatFilterOverride === 'undefined') {
    window._chatFilterOverride = null;
  }
  window._chatFilterOverride = filters;

  // Trigger refresh
  if (typeof debouncedSearchJobs === 'function') {
    debouncedSearchJobs();
  }
}

// --- UI Rendering ---
function appendChatBubble(role, text) {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  var bubble = document.createElement('div');
  bubble.className = 'chat-bubble chat-bubble-' + role;

  if (role === 'assistant') {
    // Parse basic markdown-like formatting
    var html = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    bubble.innerHTML = html;
  } else {
    bubble.textContent = text;
  }

  container.appendChild(bubble);

  // Scroll to bottom
  container.scrollTop = container.scrollHeight;
}

function renderChatMessages() {
  var container = document.getElementById('chat-messages');
  if (!container) return;

  container.innerHTML = '';

  if (_chatSession.messages.length === 0) {
    container.innerHTML = '<div class="chat-empty">' +
      '<div class="chat-empty-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>' +
      '<div class="chat-empty-title">Describe your ideal role</div>' +
      '<div class="chat-empty-sub">Try: "Senior product manager roles in Austin, TX paying over $150K" or "Remote React developer positions at mid-size companies"</div>' +
      '</div>';
    return;
  }

  _chatSession.messages.forEach(function(msg) {
    appendChatBubble(msg.role, msg.content);
  });
}

function showTypingIndicator(show) {
  var indicator = document.getElementById('chat-typing');
  if (indicator) {
    indicator.style.display = show ? 'flex' : 'none';
  }
  // Disable send button while typing
  var sendBtn = document.getElementById('chat-send-btn');
  if (sendBtn) sendBtn.disabled = show;
}

function updateChatCounter() {
  var counter = document.getElementById('chat-msg-counter');
  if (!counter) return;

  var used = _chatSession.messageCount;
  var tier = getUserTier();
  var limit = _chatLimits[tier] ? _chatLimits[tier].perConvo : _chatLimits.free.perConvo;

  counter.textContent = used + '/' + limit;
  counter.style.color = (used >= limit * 0.8) ? 'var(--warm)' : 'var(--text-faint)';
}

function updateChatRateLimitDisplay() {
  var el = document.getElementById('chat-remaining');
  if (!el) return;

  if (_chatRateLimit.remaining !== null) {
    el.textContent = _chatRateLimit.remaining + ' remaining today';
    el.style.display = 'inline';
    el.style.color = _chatRateLimit.remaining <= 5 ? 'var(--warm)' : 'var(--text-faint)';
  }
}

function showChatRateLimit(data) {
  var banner = document.getElementById('chat-rate-banner');
  if (!banner) return;

  var tier = getUserTier();
  var limit = _chatLimits[tier] ? _chatLimits[tier] : _chatLimits.free;
  var resetText = '';
  if (data && data.reset_at) {
    var resetDate = new Date(data.reset_at);
    var now = new Date();
    var diffMin = Math.ceil((resetDate - now) / 60000);
    if (diffMin > 0) {
      resetText = ' Resets in ' + (diffMin > 60 ? Math.ceil(diffMin / 60) + 'h' : diffMin + 'min') + '.';
    }
  }

  var isConvoLimit = data && data.limit_type === 'conversation';
  var msg = isConvoLimit
    ? 'Conversation limit reached (' + limit.perConvo + ' messages). Clear the chat to continue.'
    : 'Daily chat limit reached (' + limit.perDay + '/day).' + resetText;

  banner.innerHTML = '<div class="chat-rate-msg">' +
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
    '<span>' + msg + '</span></div>';

  if (tier !== 'pro') {
    banner.innerHTML += '<a href="#" class="chat-rate-upgrade" onclick="event.preventDefault();document.querySelector(\'[data-page=billing]\')?.click();">Upgrade for more →</a>';
  }

  banner.style.display = 'block';
}


// ============================================================
// SESSION 4: Saved Prompts + Persistence
// Save/load chat prompts to Supabase, derived_filters update on every send
// ============================================================

// --- Saved Prompts State ---
var _savedPrompts = []; // { id, name, color_index, conversation, derived_filters, is_active, created_at }
var _saveDialogOpen = false;
var _loadDropdownOpen = false;
var _currentPromptId = null; // ID of the currently loaded prompt (null = unsaved)

// 10-color palette for prompts
var PROMPT_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'
];

// --- Init Save/Load buttons ---
function initSavedPrompts() {
  // Save button in header
  var saveBtn = document.getElementById('chat-save-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openSaveDialog();
    });
  }

  // Load button in header
  var loadBtn = document.getElementById('chat-load-btn');
  if (loadBtn) {
    loadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleLoadDropdown();
    });
  }

  // Close load dropdown on outside click
  document.addEventListener('click', function(e) {
    if (_loadDropdownOpen) {
      var dropdown = document.getElementById('chat-load-dropdown');
      var loadBtn = document.getElementById('chat-load-btn');
      if (dropdown && !dropdown.contains(e.target) && loadBtn && !loadBtn.contains(e.target)) {
        closeLoadDropdown();
      }
    }
  });

  // Load saved prompts from Supabase
  loadSavedPromptsFromDB();
}

// --- Save Dialog ---
function openSaveDialog() {
  if (_chatSession.messages.length === 0) {
    if (typeof showToast === 'function') showToast('Start a conversation first', 'info');
    return;
  }

  var dialog = document.getElementById('chat-save-dialog');
  if (!dialog) return;

  // Pre-fill name if editing existing
  var nameInput = dialog.querySelector('#save-prompt-name');
  if (nameInput) {
    if (_currentPromptId) {
      var existing = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
      if (existing) nameInput.value = existing.name;
    } else {
      nameInput.value = '';
    }
  }

  // Render color palette
  var paletteEl = dialog.querySelector('#save-prompt-palette');
  if (paletteEl) {
    paletteEl.innerHTML = '';
    var selectedIdx = 0;
    if (_currentPromptId) {
      var existing = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
      if (existing) selectedIdx = existing.color_index || 0;
    }
    PROMPT_COLORS.forEach(function(color, idx) {
      var swatch = document.createElement('button');
      swatch.className = 'save-color-swatch' + (idx === selectedIdx ? ' active' : '');
      swatch.style.background = color;
      swatch.setAttribute('data-color-idx', idx);
      swatch.addEventListener('click', function() {
        paletteEl.querySelectorAll('.save-color-swatch').forEach(function(s) { s.classList.remove('active'); });
        swatch.classList.add('active');
      });
      paletteEl.appendChild(swatch);
    });
  }

  // Show derived filters preview
  renderDerivedFiltersPreview(dialog);

  dialog.style.display = 'flex';
  _saveDialogOpen = true;
  if (nameInput) nameInput.focus();

  // Bind save action
  var confirmBtn = dialog.querySelector('#save-prompt-confirm');
  var cancelBtn = dialog.querySelector('#save-prompt-cancel');

  // Clone and replace to remove old listeners
  if (confirmBtn) {
    var newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', executeSavePrompt);
  }
  if (cancelBtn) {
    var newCancel = cancelBtn.cloneNode(true);
    cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
    newCancel.addEventListener('click', closeSaveDialog);
  }
}

function closeSaveDialog() {
  var dialog = document.getElementById('chat-save-dialog');
  if (dialog) dialog.style.display = 'none';
  _saveDialogOpen = false;
}

function renderDerivedFiltersPreview(dialog) {
  var previewEl = dialog.querySelector('#save-prompt-filters-preview');
  if (!previewEl) return;

  // Get last extracted filters from conversation
  var lastFilters = null;
  for (var i = _chatSession.messages.length - 1; i >= 0; i--) {
    if (_chatSession.messages[i].filters) {
      lastFilters = _chatSession.messages[i].filters;
      break;
    }
  }

  if (!lastFilters || Object.keys(lastFilters).length === 0) {
    previewEl.innerHTML = '<span class="save-filters-empty">No filters extracted yet — send a message to generate filters</span>';
    return;
  }

  var parts = [];
  if (lastFilters.keywords && lastFilters.keywords.length) parts.push('<span class="sfp-tag">' + lastFilters.keywords.map(escapeHtml).join('</span><span class="sfp-tag">') + '</span>');
  if (lastFilters.locations && lastFilters.locations.length) parts.push('<span class="sfp-tag sfp-loc">' + lastFilters.locations.map(escapeHtml).join('</span><span class="sfp-tag sfp-loc">') + '</span>');
  if (lastFilters.level) parts.push('<span class="sfp-tag sfp-level">' + escapeHtml(lastFilters.level) + '</span>');
  if (lastFilters.salary_min || lastFilters.salary_max) {
    var sal = '';
    if (lastFilters.salary_min) sal += '$' + Math.round(lastFilters.salary_min/1000) + 'k';
    if (lastFilters.salary_min && lastFilters.salary_max) sal += '-';
    if (lastFilters.salary_max) sal += '$' + Math.round(lastFilters.salary_max/1000) + 'k';
    if (lastFilters.salary_min && !lastFilters.salary_max) sal += '+';
    parts.push('<span class="sfp-tag sfp-sal">' + sal + '</span>');
  }
  if (lastFilters.remote) parts.push('<span class="sfp-tag sfp-type">Remote</span>');

  previewEl.innerHTML = parts.length > 0 ? parts.join('') : '<span class="save-filters-empty">No structured filters detected</span>';
}

async function executeSavePrompt() {
  var dialog = document.getElementById('chat-save-dialog');
  if (!dialog) return;

  var nameInput = dialog.querySelector('#save-prompt-name');
  var name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    nameInput.style.borderColor = 'var(--red)';
    nameInput.focus();
    return;
  }
  if (name.length > 60) {
    if (typeof showToast === 'function') showToast('Name too long (max 60 characters)', 'error');
    return;
  }

  // Get selected color
  var activeSwatch = dialog.querySelector('.save-color-swatch.active');
  var colorIndex = activeSwatch ? parseInt(activeSwatch.getAttribute('data-color-idx')) : 0;

  // Get derived filters from last assistant message
  var derivedFilters = {};
  for (var i = _chatSession.messages.length - 1; i >= 0; i--) {
    if (_chatSession.messages[i].filters) {
      derivedFilters = _chatSession.messages[i].filters;
      break;
    }
  }

  var conversation = _chatSession.getHistory();

  // Disable button
  var confirmBtn = dialog.querySelector('#save-prompt-confirm');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Saving...'; }

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) {
      if (typeof showToast === 'function') showToast('Please sign in', 'error');
      return;
    }

    var token = session.data.session.access_token;
    var userId = session.data.session.user.id;
    var body = {
      user_id: userId,
      name: name,
      color_index: colorIndex,
      conversation: conversation,
      derived_filters: derivedFilters,
      is_active: true
    };

    var method = 'POST';
    var url = SUPABASE_URL + '/rest/v1/saved_prompts';
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      'apikey': SUPABASE_KEY,
      'Prefer': 'return=representation'
    };

    // If updating existing prompt
    if (_currentPromptId) {
      url += '?id=eq.' + _currentPromptId;
      method = 'PATCH';
      delete body.user_id; // Don't update user_id
    }

    var resp = await fetch(url, {
      method: method,
      headers: headers,
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      var errData = null;
      try { errData = await resp.json(); } catch(e) {}
      console.error('[BJ] Save prompt error:', errData);
      if (typeof showToast === 'function') showToast('Failed to save prompt', 'error');
      return;
    }

    var saved = await resp.json();
    if (Array.isArray(saved) && saved.length > 0) {
      _currentPromptId = saved[0].id;
    }

    // Refresh saved prompts list
    await loadSavedPromptsFromDB();

    closeSaveDialog();
    if (typeof showToast === 'function') showToast('Prompt saved: ' + name, 'success');

    // Update header to show loaded prompt name
    updateLoadedPromptIndicator();

    // PostHog
    if (window.posthog) {
      try { posthog.capture('chat_prompt_saved', { name: name, color_index: colorIndex, filter_count: Object.keys(derivedFilters).length, is_update: !!_currentPromptId }); } catch(e) {}
    }

  } catch (err) {
    console.error('[BJ] Save prompt error:', err);
    if (typeof showToast === 'function') showToast('Save failed', 'error');
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Save'; }
  }
}

// --- Load Dropdown ---
function toggleLoadDropdown() {
  if (_loadDropdownOpen) {
    closeLoadDropdown();
  } else {
    openLoadDropdown();
  }
}

function openLoadDropdown() {
  var dropdown = document.getElementById('chat-load-dropdown');
  if (!dropdown) return;

  // Render prompt list
  renderLoadDropdownItems(dropdown);

  dropdown.style.display = 'block';
  _loadDropdownOpen = true;
}

function closeLoadDropdown() {
  var dropdown = document.getElementById('chat-load-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  _loadDropdownOpen = false;
}

function renderLoadDropdownItems(dropdown) {
  if (!dropdown) return;

  if (_savedPrompts.length === 0) {
    dropdown.innerHTML = '<div class="cld-empty">No saved prompts yet</div>';
    return;
  }

  var html = '';
  _savedPrompts.forEach(function(prompt) {
    var color = PROMPT_COLORS[prompt.color_index || 0];
    var isLoaded = prompt.id === _currentPromptId;
    var filterCount = prompt.derived_filters ? Object.keys(prompt.derived_filters).length : 0;
    var timeAgo = _timeAgo(prompt.updated_at || prompt.created_at);

    html += '<div class="cld-item' + (isLoaded ? ' cld-item-active' : '') + '" data-prompt-id="' + prompt.id + '">' +
      '<div class="cld-item-color" style="background:' + color + ';"></div>' +
      '<div class="cld-item-info">' +
        '<div class="cld-item-name">' + escapeHtml(prompt.name) + '</div>' +
        '<div class="cld-item-meta">' + filterCount + ' filter' + (filterCount !== 1 ? 's' : '') + ' · ' + timeAgo + '</div>' +
      '</div>' +
      '<div class="cld-item-actions">' +
        '<button class="cld-delete-btn" data-prompt-id="' + prompt.id + '" title="Delete">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>';
  });

  dropdown.innerHTML = html;

  // Bind click handlers
  dropdown.querySelectorAll('.cld-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
      if (e.target.closest('.cld-delete-btn')) return;
      var promptId = item.getAttribute('data-prompt-id');
      loadPrompt(promptId);
      closeLoadDropdown();
    });
  });

  dropdown.querySelectorAll('.cld-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var promptId = btn.getAttribute('data-prompt-id');
      deletePrompt(promptId);
    });
  });
}

function _timeAgo(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  var now = new Date();
  var diffMs = now - d;
  var diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return diffMin + 'm ago';
  var diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return diffHr + 'h ago';
  var diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return diffDay + 'd ago';
  return d.toLocaleDateString();
}

// --- Load prompt into chat session ---
async function loadPrompt(promptId) {
  var prompt = _savedPrompts.find(function(p) { return p.id === promptId; });
  if (!prompt) return;

  // Clear current session
  _chatSession.clear();
  _chatMessages = [];
  _chatLastSyncedFilterHash = null;

  // Restore conversation
  if (prompt.conversation && Array.isArray(prompt.conversation)) {
    prompt.conversation.forEach(function(msg) {
      _chatSession.addMessage(msg.role, msg.content, null);
    });
  }

  _currentPromptId = promptId;
  renderChatMessages();
  updateChatCounter();
  updateLoadedPromptIndicator();

  // If derived_filters exist, apply to job feed
  if (prompt.derived_filters && Object.keys(prompt.derived_filters).length > 0) {
    applyChatFilters(prompt.derived_filters);
  }

  if (typeof showToast === 'function') showToast('Loaded: ' + prompt.name, 'success');

  // PostHog
  if (window.posthog) {
    try { posthog.capture('chat_prompt_loaded', { prompt_id: promptId, name: prompt.name }); } catch(e) {}
  }
}

// --- Delete prompt ---
async function deletePrompt(promptId) {
  if (!confirm('Delete this saved prompt?')) return;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?id=eq.' + promptId, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      }
    });

    if (resp.ok) {
      // If we deleted the currently loaded prompt, clear reference
      if (_currentPromptId === promptId) {
        _currentPromptId = null;
        updateLoadedPromptIndicator();
      }

      await loadSavedPromptsFromDB();
      renderLoadDropdownItems(document.getElementById('chat-load-dropdown'));

      if (typeof showToast === 'function') showToast('Prompt deleted', 'success');

      // Also remove from filter selector
      renderSavedPromptsInFilterSelector();

      // PostHog
      if (window.posthog) {
        try { posthog.capture('chat_prompt_deleted', { prompt_id: promptId }); } catch(e) {}
      }
    }
  } catch (err) {
    console.error('[BJ] Delete prompt error:', err);
  }
}

// --- Load saved prompts from DB ---
async function loadSavedPromptsFromDB() {
  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;
    var resp = await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?select=id,name,color_index,conversation,derived_filters,is_active,created_at,updated_at&order=updated_at.desc&limit=50', {
      headers: {
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      }
    });

    if (resp.ok) {
      _savedPrompts = await resp.json();
      // Update filter selector
      renderSavedPromptsInFilterSelector();
    }
  } catch (err) {
    console.error('[BJ] Load saved prompts error:', err);
  }
}

// --- Update derived_filters on every conversation message ---
async function updateDerivedFilters() {
  if (!_currentPromptId) return; // Only update if we have a saved prompt loaded
  if (_chatSession.messages.length === 0) return;

  try {
    var session = await sb.auth.getSession();
    if (!session.data.session) return;

    var token = session.data.session.access_token;

    // Call prompt-to-filter to re-extract
    var resp = await fetch(SUPABASE_URL + '/functions/v1/prompt-to-filter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ conversation: _chatSession.getHistory() })
    });

    if (!resp.ok) return;

    var data = await resp.json();
    var filters = data.filters;
    if (!filters || typeof filters !== 'object') return;

    // Update the saved prompt in DB
    await fetch(SUPABASE_URL + '/rest/v1/saved_prompts?id=eq.' + _currentPromptId, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({
        derived_filters: filters,
        conversation: _chatSession.getHistory()
      })
    });

    // Update local cache
    var cached = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
    if (cached) {
      cached.derived_filters = filters;
      cached.conversation = _chatSession.getHistory();
    }

  } catch (err) {
    console.error('[BJ] Update derived_filters error:', err);
  }
}

// --- Show loaded prompt name in header ---
function updateLoadedPromptIndicator() {
  var indicator = document.getElementById('chat-loaded-prompt');
  if (!indicator) return;

  if (_currentPromptId) {
    var prompt = _savedPrompts.find(function(p) { return p.id === _currentPromptId; });
    if (prompt) {
      var color = PROMPT_COLORS[prompt.color_index || 0];
      indicator.innerHTML = '<span class="clp-dot" style="background:' + color + ';"></span>' +
        '<span class="clp-name">' + escapeHtml(prompt.name) + '</span>';
      indicator.style.display = 'flex';
      return;
    }
  }
  indicator.style.display = 'none';
}

// --- Add saved prompts to filter selector ---
function renderSavedPromptsInFilterSelector() {
  var container = document.getElementById('sf-list');
  if (!container) return;

  // Remove existing chat prompt items
  container.querySelectorAll('.sf-item-prompt').forEach(function(el) { el.remove(); });

  if (_savedPrompts.length === 0) return;

  // Add a separator before chat prompts
  var sep = document.createElement('div');
  sep.className = 'sf-item-prompt sf-prompt-separator';
  sep.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;opacity:0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    '<span style="font-size:10px;font-weight:600;color:var(--text-faint);text-transform:uppercase;letter-spacing:0.5px;">Chat Prompts</span>';
  container.appendChild(sep);

  // Add each saved prompt as a filter selector item
  _savedPrompts.forEach(function(prompt) {
    var color = PROMPT_COLORS[prompt.color_index || 0];
    var filterCount = prompt.derived_filters ? Object.keys(prompt.derived_filters).length : 0;

    var item = document.createElement('div');
    item.className = 'sf-item sf-item-prompt';
    item.setAttribute('data-prompt-id', prompt.id);

    item.innerHTML =
      '<div class="sf-item-left">' +
        '<div class="sf-color-dot" style="background:' + color + ';"></div>' +
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="' + color + '" stroke-width="2" style="flex-shrink:0;margin-right:4px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
        '<span class="sf-name">' + escapeHtml(prompt.name) + '</span>' +
        '<span class="sf-count">' + filterCount + '</span>' +
      '</div>';

    item.addEventListener('click', function() {
      // Switch to chat mode and load this prompt
      setSearchMode('chat');
      setTimeout(function() { loadPrompt(prompt.id); }, 300);
    });

    container.appendChild(item);
  });
}

// --- Initialize on page load ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatMode);
} else {
  initChatMode();
}
