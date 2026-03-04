// ============================================================
// CHAT MODE — Conversational Job Search (Session 2)
// Toggle between Filters and Chat on Jobs Feed
// Wires to chat-job-search Edge Function from Session 1
// ============================================================

// --- State ---
var _chatMode = false;
var _chatMessages = []; // { role: 'user'|'assistant', content: string, filters?: object }
var _chatSending = false;
var _chatRateLimit = { remaining: null, resetAt: null };
var _chatMessageCap = 20;

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
    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }
  if (chatSendBtn) {
    chatSendBtn.addEventListener('click', sendChatMessage);
  }

  // Clear chat button
  var clearBtn = document.getElementById('chat-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      _chatSession.clear();
      _chatMessages = [];
      renderChatMessages();
      updateChatCounter();
    });
  }
}

function setSearchMode(mode) {
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
    }
  }

  // PostHog event
  if (window.posthog) {
    try { posthog.capture('search_mode_toggled', { mode: mode }); } catch(e) {}
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

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';

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

// --- Initialize on page load ---
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initChatMode);
} else {
  initChatMode();
}
