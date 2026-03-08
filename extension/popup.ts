// popup.ts — Brilliant Jobs

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// CS-004 (EXT-SEC-002): HTML entity escaping for innerHTML injection protection
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// CS-003: PostHog event capture for extension (CX-02)
// ============================================================
const _PH_API_KEY = 'phc_RqMlQQfq0G0DOikTlgyRO43USYm1h4Jd1aBneeIR6ww';
const _PH_HOST = 'https://us.i.posthog.com';

async function phCapture(eventName, properties = {}) {
  try {
    const authSession = typeof BJ_CRYPTO !== 'undefined' ? await BJ_CRYPTO.secureGet('authSession') : (await chrome.storage.local.get('authSession')).authSession;
    const distinctId = authSession?.user_id || 'anonymous';
    fetchFireAndForget(`${_PH_HOST}/capture/`, { // CS-013 FIX-12
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: _PH_API_KEY,
        event: eventName,
        properties: {
          distinct_id: distinctId,
          $lib: 'brilliant-jobs-extension',
          $lib_version: chrome.runtime.getManifest().version,
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
    }).catch(e => { console.warn('[BJ] PostHog init capture failed:', e?.message); });  } catch { /* analytics should never break functionality */ }
}

// Track popup opened
phCapture('popup_opened');

// ============================================================
// AUTH GATE
// ============================================================

let currentUser = null;
let currentUserRole = 'user';

async function checkAuth() {
  try {
    const session = typeof BJ_CRYPTO !== 'undefined' ? await BJ_CRYPTO.secureGet('authSession') : (await chrome.storage.local.get('authSession')).authSession;

    if (!session || !session.access_token) {
      showAuthGate();
      return;
    }

    // Check if token is expired
    if (session.expires_at && Date.now() > session.expires_at) {
      // Try to refresh
      const refreshed = await refreshSession(session.refresh_token);
      if (!refreshed) {
        showAuthGate();
        return;
      }
      return; // refreshSession calls checkAuth again on success
    }

    // Set auth token for all Supabase requests
    supabase.setAuthToken(session.access_token);

    // Check approval status and fetch role
    try {
      const profiles = await supabase.select('profiles', `select=approved,role&id=eq.${session.user_id}`);
      if (!profiles || profiles.length === 0 || !profiles[0].approved) {
        showAuthGate();
        showAuthMsg('Your account is pending approval. You\'ll get access once reviewed.', 'warn');
        return;
      }
      // Store role (default to 'user' if not set)
      currentUserRole = (profiles[0].role || 'user');
      await chrome.storage.local.set({ userRole: currentUserRole });
    } catch (e) {
      // Distinguish network/timeout errors from genuinely missing profiles
      const errMsg = (e.message || '').toLowerCase();
      if (errMsg.includes('timeout') || errMsg.includes('500') || errMsg.includes('fetch') || errMsg.includes('network')) {
        // Transient error — don't lock the user out, let them through
        // Try to use cached role
        const cached = await chrome.storage.local.get('userRole');
        currentUserRole = cached.userRole || 'user';
        console.warn('Profile check failed (transient), proceeding with cached role:', currentUserRole);
      } else {
        showAuthGate();
        showAuthMsg('Account setup incomplete. Please sign up at brilliantjobs.app', 'warn');
        return;
      }
    }

    // Authenticated and approved — show the app
    currentUser = { id: session.user_id, email: session.email };
    showApp(session.email, currentUserRole);

  } catch (e) {
    showAuthGate();
  }
}

async function refreshSession(refreshToken) {
  try {
    // Ask background to refresh if possible (it's the canonical refresher)
    try {
      const bgResult = await chrome.runtime.sendMessage({ type: 'refreshToken' });
      if (bgResult?.ok) {
        checkAuth();
        return true;
      }
    } catch (e) {
      // Background may not be awake — fall back to direct refresh
    }

    const res = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    }, { timeout: 10000, retries: 2 }); // CS-013 FIX-12

    if (!res.ok) return false;

    const data = await res.json();
    if (!data.access_token) return false;

    await saveSession(data);
    supabase.setAuthToken(data.access_token);
    checkAuth();
    return true;
  } catch (e) {
    return false;
  }
}

async function loginUser(email, password) {
  const res = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({ email, password })
  }, { timeout: 10000, retries: 1 }); // CS-013 FIX-12

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.msg || 'Login failed');
  }

  return res.json();
}

async function saveSession(data) {
  const sessionObj = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    user_id: data.user?.id || data.user_id,
    email: data.user?.email || data.email
  };
  if (typeof BJ_CRYPTO !== 'undefined') {
    await BJ_CRYPTO.secureSet('authSession', sessionObj);
  } else {
    await chrome.storage.local.set({ authSession: sessionObj });
  }
}

async function clearSession() {
  await chrome.storage.local.remove('authSession');
  supabase.setAuthToken(null);
  currentUser = null;
}

function showAuthGate() {
  $('#auth-gate').style.display = 'block';
  $('#app-content').style.display = 'none';
  $('#auth-user-bar').classList.remove('active');
  // ES1-7: Also hide reset panel
  const resetPanel = $('#auth-reset-panel');
  if (resetPanel) resetPanel.style.display = 'none';
  // Always clear password
  $('#auth-password').value = '';
  // Pre-fill email from last known session or saved email
  (async () => {
    const authSession = typeof BJ_CRYPTO !== 'undefined' ? await BJ_CRYPTO.secureGet('authSession') : (await chrome.storage.local.get('authSession')).authSession;
    const lastData = await chrome.storage.local.get('lastEmail');
    const email = authSession?.email || lastData.lastEmail || '';
    if (email) {
      $('#auth-email').value = email;
    }
  })();
}

function showApp(email, role) {
  $('#auth-gate').style.display = 'none';
  $('#app-content').style.display = 'block';
  $('#auth-user-bar').classList.add('active');
  $('#auth-user-email').textContent = email;

  // Role-based tab visibility (v5.50: expanded RBAC)
  const isAdmin = (role === 'admin');
  const isPro = (role === 'pro' || isAdmin);
  applyTabGating(isAdmin, isPro);

  // Show admin badge if admin
  const adminBadge = $('#admin-badge');
  if (adminBadge) {
    adminBadge.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  // Show role tag for non-admin users (v5.50)
  const roleTag = $('#role-tag');
  if (roleTag && !isAdmin) {
    roleTag.textContent = isPro ? 'Pro' : 'Starter';
    roleTag.style.display = 'inline-flex';
  }

  // Initialize app features
  initApp();
}

/**
 * RBAC Tab Gating — Phase 5 + v5.50 Expansion (Item #14)
 * Admins see all tabs and exports.
 * Pro users see Harvest, Jobs, Data (no exports).
 * Starter users see Jobs and Data (no exports, no harvest).
 */
function applyTabGating(isAdmin, isPro) {
  const scanTab = document.querySelector('.tab[data-tab="scan"]');
  const scanContent = $('#tab-scan');
  const scannerIndicator = $('#scanner-indicator');

  // v5.50: Data export buttons — admin-only
  const exportConns = $('#d-export-connections');
  const exportComps = $('#d-export-companies');

  // v5.50: Harvest controls — pro+ only
  const harvestStart = $('#h-start');
  const harvestUpgrade = $('#h-upgrade-msg');

  if (!isAdmin) {
    // Hide Scan tab for non-admins
    if (scanTab) scanTab.style.display = 'none';
    if (scanContent) scanContent.style.display = 'none';
    if (scannerIndicator) scannerIndicator.style.display = 'none';

    // If Scan was the active tab, switch to Harvest
    if (scanTab && scanTab.classList.contains('active')) {
      scanTab.classList.remove('active');
      if (scanContent) scanContent.classList.remove('active');
      const harvestTab = document.querySelector('.tab[data-tab="harvest"]');
      const harvestContent = $('#tab-harvest');
      if (harvestTab) harvestTab.classList.add('active');
      if (harvestContent) harvestContent.classList.add('active');
    }

    // Hide export buttons for non-admins (v5.50)
    if (exportConns) exportConns.style.display = 'none';
    if (exportComps) exportComps.style.display = 'none';
  } else {
    // Admin — show everything
    if (scanTab) scanTab.style.display = '';
    if (scanContent) scanContent.style.display = '';
    if (scannerIndicator) scannerIndicator.style.display = '';
    if (exportConns) exportConns.style.display = '';
    if (exportComps) exportComps.style.display = '';
  }

  // v5.50: Harvest tab — pro+ only
  if (!isPro) {
    if (harvestStart) harvestStart.style.display = 'none';
    if (harvestUpgrade) harvestUpgrade.style.display = 'block';
  } else {
    if (harvestStart) harvestStart.style.display = '';
    if (harvestUpgrade) harvestUpgrade.style.display = 'none';
  }
}

function showAuthMsg(text, type) {
  const el = $('#auth-msg');
  el.textContent = text;
  el.className = `auth-msg ${type}`;
}

// Login button
$('#auth-login-btn').addEventListener('click', async () => {
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;

  if (!email || !password) {
    showAuthMsg('Email and password required.', 'error');
    return;
  }

  $('#auth-login-btn').disabled = true;
  $('#auth-login-btn').textContent = 'Logging in...';

  try {
    const data = await loginUser(email, password);
    await saveSession(data);
    $('#auth-msg').className = 'auth-msg'; // clear message
    // Notify background so it can pick up the new token and resume if paused
    chrome.runtime.sendMessage({ type: 'tokenUpdated' }).catch(e => phCapture('extension_catch_error', { context: 'token_updated_notify', error: e?.message || String(e) }));
    checkAuth();
  } catch (e) {
    showAuthMsg(e.message, 'error');
  }

  $('#auth-login-btn').disabled = false;
  $('#auth-login-btn').textContent = 'Log In';
});

// Password toggle
$('#auth-pw-toggle').addEventListener('click', () => {
  const input = $('#auth-password');
  if (input.type === 'password') {
    input.type = 'text';
    $('#auth-pw-toggle').textContent = 'Hide';
  } else {
    input.type = 'password';
    $('#auth-pw-toggle').textContent = 'Show';
  }
});

// Logout button
$('#auth-logout-btn').addEventListener('click', async () => {
  const email = $('#auth-user-email').textContent; // save email before clearing
  await clearSession();
  // Clear cached role
  await chrome.storage.local.remove('userRole');
  currentUserRole = 'user';
  // Store email so pre-fill works after logout
  await chrome.storage.local.set({ lastEmail: email });
  showAuthGate();
});

// Enter key on password field
$('#auth-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#auth-login-btn').click();
});

// ============================================================
// ES1-7: Password Reset Flow
// ============================================================

$('#auth-forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  // Pre-fill reset email from login email field
  const email = $('#auth-email').value.trim();
  if (email) $('#reset-email').value = email;
  $('#auth-gate').style.display = 'none';
  $('#auth-reset-panel').style.display = 'block';
  $('#reset-msg').textContent = '';
  $('#reset-email').focus();
});

$('#reset-back-link').addEventListener('click', (e) => {
  e.preventDefault();
  $('#auth-reset-panel').style.display = 'none';
  $('#auth-gate').style.display = 'block';
});

$('#reset-send-btn').addEventListener('click', async () => {
  const email = $('#reset-email').value.trim();
  if (!email) {
    showResetMsg('Please enter your email address.', 'error');
    return;
  }

  $('#reset-send-btn').disabled = true;
  $('#reset-send-btn').textContent = 'Sending...';

  try {
    const res = await fetchWithRetry(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({
        email,
        gotrue_meta_security: { captcha_token: '' }
      })
    }, { timeout: 10000, retries: 1 });

    // Supabase returns 200 regardless of whether email exists (prevents enumeration)
    showResetMsg('If an account exists for that email, a reset link has been sent. Check your inbox.', 'success');
    phCapture('password_reset_requested', { email_provided: true });
  } catch (e) {
    showResetMsg('Something went wrong. Please try again.', 'error');
  }

  $('#reset-send-btn').disabled = false;
  $('#reset-send-btn').textContent = 'Send Reset Link';
});

$('#reset-email').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#reset-send-btn').click();
});

function showResetMsg(text, type) {
  const el = $('#reset-msg');
  el.textContent = text;
  el.className = `auth-msg ${type}`;
}

// ============================================================
// APP INIT (called after auth check passes)
// ============================================================

// Help link — open in new tab from side panel
$('#help-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('help.html') });
});

let appInitialized = false;

function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  // Initialize all tab features
  initHarvestStats();
  refreshScannerState();
  refreshDataCounts();
  initCounts();
  initDailyLimitBadge(); // Item #10

  // Start scanner state refresh interval
  setInterval(refreshScannerState, 3000);
  setInterval(refreshDailyLimitBadge, 15000); // Item #10: refresh every 15s
}

// Start auth check
checkAuth();

// ============================================================
// TABS
// ============================================================

$$('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    activateTab(tab);
  });
});

// CX-05: Keyboard navigation for tabs (arrow keys, Home, End)
document.querySelector('.tabs')?.addEventListener('keydown', (e) => {
  const tabs = Array.from($$('.tab')).filter(t => t.style.display !== 'none');
  const idx = tabs.indexOf(e.target);
  if (idx === -1) return;
  let next;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    next = tabs[(idx + 1) % tabs.length];
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    next = tabs[(idx - 1 + tabs.length) % tabs.length];
  } else if (e.key === 'Home') {
    next = tabs[0];
  } else if (e.key === 'End') {
    next = tabs[tabs.length - 1];
  }
  if (next) {
    e.preventDefault();
    activateTab(next);
    next.focus();
  }
});

function activateTab(tab) {
  $$('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
    t.setAttribute('tabindex', '-1');
  });
  $$('.tab-content').forEach(tc => tc.classList.remove('active'));
  tab.classList.add('active');
  tab.setAttribute('aria-selected', 'true');
  tab.setAttribute('tabindex', '0');
  const panel = $(`#tab-${tab.dataset.tab}`);
  if (panel) panel.classList.add('active');
}

// ============================================================
// LOGGING HELPERS
// ============================================================

function addLog(logId, msg, type = '') {
  const log = $(`#${logId}`);
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = msg;
  log.insertBefore(line, log.firstChild);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}

// ============================================================
// TAB 1: HARVEST CONNECTIONS
// ============================================================

let harvestData = [];
let harvesting = false;

function parseCompanyFromHeadline(headline) {
  if (!headline) return '';
  const atMatch = headline.match(/\bat\s+(.+?)(?:\s*[|·•]|$)/i);
  if (atMatch) {
    let company = atMatch[1].trim();
    company = company.replace(/\s*[-–]\s*.*$/, '').trim();
    if (company.length > 2 && company.length < 80) return company;
  }
  return '';
}

// Load existing harvest stats from Supabase on init
async function initHarvestStats() {
  try {
    const existingCount = await supabase.count('connections');
    const withCompany = await supabase.count('connections', 'parsed_company=not.is.null');
    $('#h-count').textContent = existingCount;
    $('#h-companies').textContent = withCompany;
    if (existingCount > 0) {
      addLog('h-log', `${existingCount} connections in Supabase (${withCompany} with parsed companies).`, 'info');
    }
  } catch (e) {
    // Non-fatal
  }

  // Show last harvest date
  try {
    const data = await chrome.storage.local.get('lastHarvestAt');
    if (data.lastHarvestAt) {
      const d = new Date(data.lastHarvestAt);
      const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      $('#h-last-date').textContent = `${dateStr} at ${timeStr}`;
      $('#h-last-harvest').classList.remove('hidden');
    }
  } catch (e) { console.warn('[BJ] harvest stats error:', e.message); }
}
initHarvestStats();

// Confirm re-harvest UI
let awaitingConfirm = false;

$('#h-start').addEventListener('click', async () => {
  if (harvesting) return;

  // If awaiting confirm from a previous check, start the harvest
  if (awaitingConfirm) {
    awaitingConfirm = false;
    $('#h-confirm').classList.add('hidden');
    return startHarvest();
  }

  // Check Supabase count first
  try {
    const existingCount = await supabase.count('connections');
    if (existingCount > 0) {
      addLog('h-log', `${existingCount} connections already in Supabase. Checking for new ones...`, 'info');
    }
  } catch (e) {
    // Non-fatal, proceed with harvest
  }

  startHarvest();
});

async function startHarvest() {
  harvesting = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('linkedin.com')) {
    addLog('h-log', 'Not on the right site! Navigate there first.', 'error');
    harvesting = false;
    return;
  }

  // Get pre-harvest count from Supabase
  let preHarvestCount = 0;
  try {
    preHarvestCount = await supabase.count('connections');
  } catch (e) { console.warn('[BJ] pre-harvest count failed:', e.message); }

  $('#h-start').disabled = true;
  $('#h-start').textContent = 'Harvesting...';
  $('#h-stop').classList.remove('hidden');
  harvestData = [];
  updateHarvestStats();

  // Navigate to connections page
  addLog('h-log', 'Navigating to connections page...', 'info');
  await chrome.tabs.update(tab.id, { url: 'https://www.linkedin.com/mynetwork/invite-connect/connections/' });

  // Wait for load
  await new Promise(resolve => {
    const listener = (tabId, changeInfo) => {
      if (tabId === tab.id && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 3000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
  });

  addLog('h-log', 'Page loaded. Waiting for connection cards to render...', 'info');

  // Track what's been pushed to Supabase
  let lastPushedCount = 0;
  const PUSH_EVERY = 500;

  async function pushToSupabase(forceFinal = false) {
    const toPush = harvestData.slice(lastPushedCount);
    if (toPush.length === 0) return;
    if (!forceFinal && toPush.length < PUSH_EVERY) return;

    try {
      const chunkSize = 500;
      for (let i = 0; i < toPush.length; i += chunkSize) {
        const chunk = toPush.slice(i, i + chunkSize).map(c => ({
          profile_slug: c.profile_slug,
          name: c.name,
          headline: c.headline,
          parsed_company: c.parsed_company || null,
          source: 'connections',
          visit_status: 'pending'
        }));

        // Use ignoreDuplicates so existing rows (already visited) are NOT overwritten
        const headers = supabase.headers();
        headers['Prefer'] = 'return=representation,resolution=ignore-duplicates';
        await fetchWithRetry(`${SUPABASE_URL}/rest/v1/connections?on_conflict=profile_slug`, {
          method: 'POST',
          headers,
          body: JSON.stringify(chunk)
        }, { timeout: 15000, retries: 2 }); // CS-013 FIX-12
      }
      lastPushedCount = harvestData.length;
      addLog('h-log', `↑ Pushed ${lastPushedCount} total to Supabase (existing profiles preserved)`, 'success');
    } catch (e) {
      addLog('h-log', `Push error: ${e.message}`, 'error');
    }
  }

  // Wait for cards to appear (retry up to 15 seconds)
  let cardsReady = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    const checkResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.querySelectorAll('a[data-view-name="connections-profile"]').length,
    });
    const count = checkResult?.[0]?.result || 0;
    if (count > 0) {
      addLog('h-log', `Found ${count} cards on page. Starting scroll...`, 'success');
      cardsReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!cardsReady) {
    addLog('h-log', 'No connection cards found after 15s. Are you logged in?', 'error');
    harvesting = false;
    $('#h-start').disabled = false;
    $('#h-start').textContent = 'Harvest Connections';
    $('#h-stop').classList.add('hidden');
    return;
  }

  // Scroll and collect
  let staleRounds = 0;
  let lastCount = 0;
  let scrollRound = 0;

  while (harvesting) {
    scrollRound++;

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const cards = [];
        const seen = new Set();

        document.querySelectorAll('a[data-view-name="connections-profile"]').forEach(link => {
          const href = link.getAttribute('href') || '';
          const slugMatch = href.match(/\/in\/([a-zA-Z0-9_-]+)/);
          if (!slugMatch) return;

          const paragraphs = link.querySelectorAll('p');
          if (paragraphs.length === 0) return;

          const profile_slug = slugMatch[1];
          if (seen.has(profile_slug)) return;
          seen.add(profile_slug);

          const name = paragraphs[0]?.textContent?.trim() || '';
          let headline = '';
          if (paragraphs.length > 1) {
            headline = paragraphs[1]?.textContent?.trim() || '';
          }

          if (name) {
            cards.push({ profile_slug, name, headline });
          }
        });

        return cards;
      },
    });

    const cards = results?.[0]?.result || [];

    // Merge new cards
    const existingSlugs = new Set(harvestData.map(c => c.profile_slug));
    let newCount = 0;
    for (const card of cards) {
      if (!existingSlugs.has(card.profile_slug)) {
        card.parsed_company = parseCompanyFromHeadline(card.headline);
        harvestData.push(card);
        existingSlugs.add(card.profile_slug);
        newCount++;
      }
    }

    updateHarvestStats();

    if (harvestData.length === lastCount) {
      staleRounds++;
      if (staleRounds >= 15) {
        addLog('h-log', `No new connections after ${staleRounds} rounds. Done!`, 'success');
        break;
      }
    } else {
      staleRounds = 0;
      lastCount = harvestData.length;
    }

    if (scrollRound % 5 === 0) {
      addLog('h-log', `Scroll ${scrollRound}: ${harvestData.length} connections (+${newCount} new)`, 'info');
    }

    // Push intermittently
    await pushToSupabase();

    // Scroll down and click "Load more" / "Show more" button if present
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Try clicking Load More / Show More buttons first
        let clicked = false;
        document.querySelectorAll('button, a[role="button"]').forEach(el => {
          const text = el.textContent.trim().toLowerCase();
          if ((text.includes('load more') || text.includes('show more') || text === 'show more results')
              && !el.disabled && el.offsetParent !== null) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.click();
            clicked = true;
          }
        });

        // Always scroll down too (handles infinite scroll variant)
        const main = document.querySelector('main');
        if (main) {
          main.scrollTo(0, main.scrollHeight);
        }
        window.scrollTo(0, document.body.scrollHeight);

        return clicked;
      },
    });

    await new Promise(r => setTimeout(r, 2500));
  }

  addLog('h-log', `Harvest complete: ${harvestData.length} connections found`, 'success');
  const withCompany = harvestData.filter(c => c.parsed_company).length;
  addLog('h-log', `${withCompany} have parseable company names, ${harvestData.length - withCompany} need profile visits`, 'info');

  // Final push of any remaining
  await pushToSupabase(true);

  // Compare with pre-harvest count
  try {
    const postCount = await supabase.count('connections');
    const newAdded = postCount - preHarvestCount;
    if (newAdded > 0) {
      addLog('h-log', `✓ ${newAdded} new connections added to Supabase (${postCount} total)`, 'success');
    } else {
      addLog('h-log', `No new connections — Supabase already had all ${postCount}`, 'info');
    }
  } catch (e) { console.warn('[BJ] post-harvest count failed:', e.message); phCapture('extension_catch_error', { context: 'post_harvest_count', error: e.message }); }

  // Save last harvest timestamp
  await chrome.storage.local.set({ lastHarvestAt: new Date().toISOString() });

  // Update display with Supabase totals
  initHarvestStats();

  $('#h-start').disabled = false;
  $('#h-start').textContent = 'Harvest Connections';
  $('#h-stop').classList.add('hidden');
  harvesting = false;
}

$('#h-stop').addEventListener('click', () => {
  harvesting = false;
  addLog('h-log', 'Stopping...', 'error');
});

function updateHarvestStats() {
  // During active harvest, show session count
  if (harvesting && harvestData.length > 0) {
    $('#h-count').textContent = harvestData.length;
    $('#h-companies').textContent = harvestData.filter(c => c.parsed_company).length;
  }
}

// ============================================================
// TAB 2: SCAN PROFILES
// ============================================================

let countdownInterval = null;
let seenLogEntries = new Set();

let cachedVisited = 0;
let cachedQueued = 0;
let lastSupabaseCountFetch = 0;
const SUPABASE_COUNT_INTERVAL = 60000; // Only fetch counts from Supabase once per minute

async function refreshScannerState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'getState' });
    if (!state) return;

    // Use local state counts if scanner has been active, otherwise pull from Supabase
    let visited = state.totalVisited || 0;
    let queued = state.totalQueued || 0;

    if (visited === 0 && queued === 0) {
      const now = Date.now();
      // Only query Supabase once per minute, use cached values otherwise
      if (cachedVisited > 0 || cachedQueued > 0) {
        visited = cachedVisited;
        queued = cachedQueued;
      }
      if (now - lastSupabaseCountFetch > SUPABASE_COUNT_INTERVAL) {
        lastSupabaseCountFetch = now;
        try {
          visited = await supabase.count('connections', 'visit_status=eq.completed');
          queued = await supabase.count('connections', 'visit_status=eq.pending');
          cachedVisited = visited;
          cachedQueued = queued;
        } catch (e) { console.warn('[BJ] scan count refresh failed:', e.message); }
      }
    }

    $('#s-visited').textContent = visited;
    $('#s-queued').textContent = queued;
    
    // Today counter — show visited/limit, use todayVisited even when idle
    const todayVisited = state.todayVisited || 0;
    const todayLimit = state.todayLimit || 0;
    $('#s-today').textContent = `${todayVisited}/${todayLimit || '—'}`;

    // Progress bar (if element exists)
    const total = visited + queued;
    const pct = total > 0 ? (visited / total * 100) : 0;
    const progressEl = $('#s-progress');
    if (progressEl) progressEl.style.width = `${pct.toFixed(1)}%`;

    // Estimate
    if (queued > 0) {
      const avgDaily = 65;
      const minDays = Math.ceil(queued / 90);
      const maxDays = Math.ceil(queued / 40);
      const estDate = new Date();
      estDate.setDate(estDate.getDate() + Math.ceil(queued / avgDaily));
      const dateStr = estDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

      $('#s-est-days').textContent = `~${minDays}–${maxDays} days`;
      $('#s-est-detail').textContent = `${queued} remaining · ~${avgDaily}/day · est. done ${dateStr} · ${pct.toFixed(1)}% complete`;
    } else {
      $('#s-est-days').textContent = state.totalVisited > 0 ? 'Complete!' : '—';
      $('#s-est-detail').textContent = '';
    }

    // Global indicator dot + text — simple status light
    const dot = $('#scanner-dot');
    const indicatorText = $('#scanner-indicator-text');
    const indicatorCount = $('#scanner-indicator-count');

    // Determine effective state
    const resumeTime = state.nextActionAt || state.scheduledResumeAt || null;
    const hasResumeTime = resumeTime && resumeTime > Date.now();
    const isDoneToday = state.nextActionType === 'done_today' && hasResumeTime;
    const isOutsideHours = state.nextActionType === 'outside_hours' && hasResumeTime;
    const isEffectivelyWaiting = isDoneToday || isOutsideHours || hasResumeTime;
    const hitLimit = todayLimit > 0 && todayVisited >= todayLimit;

    // Format resume time helper
    function formatResumeTime(ts) {
      if (!ts) return '';
      const d = new Date(ts);
      const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const now = new Date();
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
      if (d.toDateString() === now.toDateString()) return timeStr;
      if (d.toDateString() === tomorrow.toDateString()) return `${timeStr} tomorrow`;
      return `${timeStr} ${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}`;
    }

    dot.className = 'scanner-dot';
    indicatorCount.textContent = '';

    if (state.running && !isDoneToday && !isOutsideHours && !state.paused && state.nextActionType !== 'break_end') {
      // Actively scanning
      dot.classList.add('running');
      if (state.currentProfile) {
        indicatorText.textContent = `Visiting ${state.currentProfile}`;
      } else if (state.nextActionType === 'visit' && state.nextActionAt) {
        const remaining = Math.max(0, Math.round((state.nextActionAt - Date.now()) / 1000));
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        indicatorText.textContent = `Scanning · next in ${min}:${sec.toString().padStart(2, '0')}`;
      } else {
        indicatorText.textContent = 'Scanning...';
      }
      indicatorCount.textContent = `${todayVisited}/${todayLimit || '—'}`;
    } else if (state.running && state.nextActionType === 'break_end') {
      // On a break between visits
      dot.classList.add('break');
      if (state.nextActionAt) {
        const remaining = Math.max(0, Math.round((state.nextActionAt - Date.now()) / 1000));
        const min = Math.floor(remaining / 60);
        const sec = remaining % 60;
        indicatorText.textContent = `On break · ${min}:${sec.toString().padStart(2, '0')}`;
      } else {
        indicatorText.textContent = 'On break';
      }
      indicatorCount.textContent = `${todayVisited}/${todayLimit || '—'}`;
    } else if (state.paused) {
      dot.classList.add('paused');
      indicatorText.textContent = 'Paused';
    } else {
      // Idle or done for today — orange dot
      dot.classList.add('idle');
      if (isEffectivelyWaiting) {
        const resumeStr = formatResumeTime(resumeTime);
        indicatorText.textContent = resumeStr ? `Resumes ~${resumeStr}` : 'Idle';
      } else {
        indicatorText.textContent = 'Idle';
      }
    }

    // Button state
    if (state.running && !isDoneToday && !isOutsideHours) {
      showScanButtons('running');
    } else if (state.paused) {
      showScanButtons('paused');
    } else {
      showScanButtons('idle');
    }

    // Populate scan log entries into unified activity log
    if (state.log && state.log.length > 0) {
      // Only add new entries we haven't seen yet
      const newEntries = state.log.filter(entry => {
        const key = entry.msg + entry.ts;
        if (seenLogEntries.has(key)) return false;
        seenLogEntries.add(key);
        return true;
      });
      newEntries.forEach(entry => {
        addLog('s-log', entry.msg, entry.type);
      });
    }
  } catch (e) {
    // Background might not be ready
  }
}

function updateCountdown(targetTime) {
  const el = $('#scanner-indicator-count');
  if (!targetTime || !el) return;
  const remaining = Math.max(0, Math.round((targetTime - Date.now()) / 1000));
  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;
  // Append countdown to the indicator count area
  const existing = el.textContent.replace(/ · \d+:\d+$/, '');
  el.textContent = `${existing} · ${min}:${sec.toString().padStart(2, '0')}`;
}

function showScanButtons(mode) {
  $('#s-start').classList.toggle('hidden', mode !== 'idle');
  $('#s-pause').classList.toggle('hidden', mode !== 'running');
  $('#s-resume').classList.toggle('hidden', mode !== 'paused');
  $('#s-stop').classList.toggle('hidden', mode === 'idle');
}

$('#s-start').addEventListener('click', async () => {
  const includePast = $('#s-include-past').checked;
  phCapture('scan_started', { include_past: includePast }); // CS-003
  await chrome.runtime.sendMessage({ type: 'startScanner', includePast });
  refreshScannerState();
});

$('#s-pause').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'pauseScanner' });
  phCapture('scan_paused'); // CS-P1-007 ES1-1
  refreshScannerState();
});

$('#s-resume').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'resumeScanner' });
  phCapture('scan_resumed'); // CS-P1-007 ES1-1
  refreshScannerState();
});

$('#s-stop').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'stopScanner' });
  phCapture('scan_stopped'); // CS-P1-007 ES1-1
  refreshScannerState();
});

// Listen for live updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'state') {
    if (msg.state) {
      // Only update counts if scanner has actual data (don't overwrite Supabase counts with 0)
      if (msg.state.totalVisited > 0 || msg.state.totalQueued > 0) {
        $('#s-visited').textContent = msg.state.totalVisited || 0;
        $('#s-queued').textContent = msg.state.totalQueued || 0;
      }
      $('#s-today').textContent = `${msg.state.todayVisited || 0}/${msg.state.todayLimit || '—'}`;
    }
  }
  if (msg.type === 'log') {
    addLog('s-log', msg.msg, msg.type);
  }
});

// Note: refreshScannerState interval is set in initApp()

// ============================================================
// TAB 3: JOB SCRAPER
// ============================================================

let allJobs = [];
let jobScraping = false;

function updateJobCount() {
  $('#j-count').textContent = allJobs.length;
}

$('#j-scrape').addEventListener('click', async () => {
  if (jobScraping) return;
  jobScraping = true;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes('linkedin.com')) {
    addLog('j-log', 'Not on a jobs page!', 'error');
    jobScraping = false;
    return;
  }

  $('#j-scrape').disabled = true;
  $('#j-scrape').textContent = 'Scraping...';
  $('#j-stop').classList.remove('hidden');
  $('#j-download').classList.add('hidden');
  allJobs = [];
  updateJobCount();

  try {
    // Navigate to page 1 if not already there
    const currentUrl = tab.url;
    if (currentUrl.includes('start=')) {
      const newUrl = currentUrl.replace(/&start=\d+/, '');
      addLog('j-log', 'Navigating to page 1...', 'info');
      await chrome.tabs.update(tab.id, { url: newUrl });
      await new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            setTimeout(resolve, 3000);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      });
    }

    let pageNum = 1;
    let keepGoing = true;

    // Get total pages
    const initResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: getPageInfo,
    });
    const initInfo = initResults?.[0]?.result || { currentPage: 1, totalPages: 1 };
    addLog('j-log', `Page 1 of ${initInfo.totalPages}`, 'info');

    while (keepGoing && jobScraping) {
      addLog('j-log', `Page ${pageNum}: Rendering all job cards...`, 'info');

      // Force render all cards by scrolling each into view
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: forceRenderAllCards,
      });
      await new Promise(r => setTimeout(r, 1500));

      // Scrape
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeCurrentPage,
      });
      const pageData = results?.[0]?.result || { jobs: [], hasNext: false };

      const seenIds = new Set(allJobs.map(j => j.jobId));
      const newJobs = pageData.jobs.filter(j => !seenIds.has(j.jobId));
      allJobs = [...allJobs, ...newJobs];
      updateJobCount();

      addLog('j-log', `Page ${pageNum}: ${pageData.jobs.length} cards, +${newJobs.length} new → ${allJobs.length} total`, 'success');

      // Click Next
      if (pageData.hasNext && jobScraping) {
        const clicked = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: clickNextPage,
        });

        if (!clicked?.[0]?.result) {
          addLog('j-log', 'Could not click Next.', 'error');
          keepGoing = false;
        } else {
          await new Promise(r => setTimeout(r, 4000));
          pageNum++;
        }
      } else {
        keepGoing = false;
        if (!pageData.hasNext) addLog('j-log', 'Last page reached.', 'info');
      }
    }

    addLog('j-log', `Done! ${allJobs.length} total jobs.`, 'success');
    if (allJobs.length > 0) {
      $('#j-download').classList.remove('hidden');
    }

  } catch (e) {
    addLog('j-log', `Error: ${e.message}`, 'error');
  }

  $('#j-scrape').disabled = false;
  $('#j-scrape').textContent = 'Scrape All Pages';
  $('#j-stop').classList.add('hidden');
  jobScraping = false;
});

$('#j-stop').addEventListener('click', () => {
  jobScraping = false;
  addLog('j-log', 'Stopping after current page...', 'error');
  if (allJobs.length > 0) $('#j-download').classList.remove('hidden');
});

$('#j-download').addEventListener('click', () => {
  if (allJobs.length === 0) return;

  const headers = ['Job ID', 'Title', 'Company', 'Location', 'Workplace Type', 'Easy Apply', 'Salary', 'Job URL'];
  const rows = [headers.join('\t')];

  allJobs.forEach(j => {
    rows.push([
      j.jobId || '',
      (j.title || '').replace(/\t/g, ' '),
      (j.company || '').replace(/\t/g, ' '),
      (j.location || '').replace(/\t/g, ' '),
      j.workplaceType || '',
      j.easyApply ? 'Yes' : 'No',
      (j.salary || '').replace(/\t/g, ' '),
      j.jobUrl || '',
    ].join('\t'));
  });

  const blob = new Blob([rows.join('\n')], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brilliant-jobs-${new Date().toISOString().slice(0, 10)}.tsv`;
  a.click();
  URL.revokeObjectURL(url);
  addLog('j-log', `Downloaded ${allJobs.length} jobs.`, 'success');
});

// ---- Job scraper injected functions ----

function getPageInfo() {
  let currentPage = 1;
  let totalPages = 1;
  const pageState = document.querySelector('.jobs-search-pagination__page-state');
  if (pageState) {
    const match = pageState.textContent.match(/Page\s+(\d+)\s+of\s+(\d+)/);
    if (match) {
      currentPage = parseInt(match[1]);
      totalPages = parseInt(match[2]);
    }
  }
  return { currentPage, totalPages };
}

function forceRenderAllCards() {
  return new Promise((resolve) => {
    const items = document.querySelectorAll('[data-occludable-job-id]');
    let index = 0;

    function scrollNext() {
      if (index >= items.length) {
        window.scrollTo(0, 0);
        setTimeout(resolve, 500);
        return;
      }
      items[index].scrollIntoView({ behavior: 'instant', block: 'center' });
      index++;
      setTimeout(scrollNext, 200);
    }
    scrollNext();
  });
}

function scrapeCurrentPage() {
  const jobs = [];
  const seen = new Set();

  document.querySelectorAll('[data-occludable-job-id]').forEach(slot => {
    const jobId = slot.getAttribute('data-occludable-job-id');
    if (!jobId || seen.has(jobId)) return;
    seen.add(jobId);

    const card = slot.querySelector('[data-job-id]') || slot;

    const titleLink = card.querySelector(
      'a.job-card-container__link, ' +
      'a.job-card-list__title--link, ' +
      'a[class*="job-card-container__link"], ' +
      'a[class*="job-card-list__title"]'
    );
    let title = '';
    if (titleLink) {
      title = titleLink.getAttribute('aria-label') || '';
      if (!title) {
        const strong = titleLink.querySelector('strong');
        title = strong?.textContent?.replace(/<!---->/g, '').trim() ||
                titleLink.textContent?.replace(/<!---->/g, '').trim() || '';
      }
    }
    title = title.replace(/<!---->/g, '').trim();

    const companyEl = card.querySelector(
      '.artdeco-entity-lockup__subtitle span[dir="ltr"], ' +
      '.artdeco-entity-lockup__subtitle span'
    );
    const company = companyEl?.textContent?.replace(/<!---->/g, '').trim() || '';

    const locationEl = card.querySelector(
      '.job-card-container__metadata-wrapper li span[dir="ltr"], ' +
      '.job-card-container__metadata-wrapper li span, ' +
      '.artdeco-entity-lockup__caption li span'
    );
    let locationText = locationEl?.textContent?.replace(/<!---->/g, '').trim() || '';
    let workplaceType = '';
    const wpMatch = locationText.match(/\((Remote|Hybrid|On-site)\)/i);
    if (wpMatch) {
      workplaceType = wpMatch[1];
      locationText = locationText.replace(wpMatch[0], '').trim();
    }

    const easyApply = card.textContent?.includes('Easy Apply') || false;

    let salary = '';
    const salaryMatch = card.textContent?.match(/\$[\d,]+K?(?:\/yr)?(?:\s*-\s*\$[\d,]+K?(?:\/yr)?)?/);
    if (salaryMatch) salary = salaryMatch[0];

    const href = titleLink?.getAttribute('href') || '';
    const jobUrl = href.startsWith('http') ? href.split('?')[0] :
                   href ? `https://www.linkedin.com${href.split('?')[0]}` :
                   `https://www.linkedin.com/jobs/view/${jobId}/`;

    if (title) {
      jobs.push({ jobId, title, company, location: locationText, workplaceType, easyApply, salary, jobUrl });
    }
  });

  // Also handle new UI cards
  document.querySelectorAll('[data-view-name="job-card"]').forEach(cardWrapper => {
    let jobId = '';
    const trackingScope = cardWrapper.getAttribute('data-view-tracking-scope') || '';
    const trackingMatch = trackingScope.match(/jobPosting(?:Urn)?[^\d]*(\d+)/);
    if (trackingMatch) jobId = trackingMatch[1];

    if (!jobId) {
      const link = cardWrapper.querySelector('a[href*="/jobs/"]');
      const hrefMatch = link?.getAttribute('href')?.match(/currentJobId=(\d+)/);
      if (hrefMatch) jobId = hrefMatch[1];
    }

    if (!jobId || seen.has(jobId)) return;
    seen.add(jobId);

    const textBlocks = [];
    const walker = document.createTreeWalker(cardWrapper, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent.trim();
      if (text && text.length > 1 && !text.startsWith('{') && !text.startsWith('[') && !text.includes('contentTrackingId')) {
        textBlocks.push(text);
      }
    }

    let title = '', company = '', locationText = '', workplaceType = '', salary = '', easyApply = false;
    const filtered = textBlocks.filter(t => t !== 'Save' && t !== '·' && t.length > 1);

    for (const t of filtered) {
      if (!title) { title = t.replace(/\s*\(Verified job\)\s*/g, '').trim(); continue; }
      if (t.replace(/\s*\(Verified job\)\s*/g, '').trim() === title) continue;
      if (title && !company && !t.match(/\((Remote|Hybrid|On-site)\)/i) && !t.match(/^\$/)) { company = t; continue; }
      if (t.match(/\((Remote|Hybrid|On-site)\)/i)) {
        const m = t.match(/\((Remote|Hybrid|On-site)\)/i);
        workplaceType = m[1]; locationText = t.replace(m[0], '').trim(); continue;
      }
      if (t === 'Remote') { workplaceType = 'Remote'; continue; }
      if (t.match(/^\$[\d,]+/)) { salary = t; continue; }
      if (t.includes('Easy Apply')) { easyApply = true; continue; }
      if (title && company && !locationText && t.match(/,/)) { locationText = t; continue; }
    }

    if (title) {
      jobs.push({ jobId, title, company, location: locationText, workplaceType, easyApply, salary, jobUrl: `https://www.linkedin.com/jobs/view/${jobId}/` });
    }
  });

  // Pagination
  let hasNext = false;
  const nextBtn = document.querySelector(
    'button[aria-label="View next page"], ' +
    '.jobs-search-pagination__button--next'
  );
  if (nextBtn && !nextBtn.disabled) {
    hasNext = true;
  }

  return { jobs, hasNext };
}

function clickNextPage() {
  const nextBtn = document.querySelector(
    'button[aria-label="View next page"], ' +
    '.jobs-search-pagination__button--next'
  );

  if (nextBtn && !nextBtn.disabled) {
    nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return new Promise((resolve) => {
      setTimeout(() => {
        nextBtn.click();
        setTimeout(() => {
          window.scrollTo(0, 0);
          resolve(true);
        }, 1000);
      }, 500);
    });
  }
  return Promise.resolve(false);
}

// ============================================================
// TAB 4: DATA
// ============================================================

async function refreshDataCounts() {
  try {
    const connCount = await supabase.count('connections');
    $('#d-connections').textContent = connCount;

    // Use count instead of pulling all rows — much faster
    const companyCount = await supabase.count('companies');
    $('#d-companies').textContent = companyCount;

    // Hiring signals
    try {
      const hiringCount = await supabase.count('connections', 'hiring_signal=eq.hiring');
      const otwCount = await supabase.count('connections', 'hiring_signal=eq.open_to_work');
      $('#d-hiring').textContent = hiringCount;
      $('#d-otw').textContent = otwCount;
    } catch (e) { console.warn('[BJ] hiring signal counts failed:', e.message); }

    // Top companies by connection count (paginated to avoid statement timeout)
    try {
      const junkPatterns = /^(full-time|part-time|contract|freelance|self-employed|internship|seasonal|temporary|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})/i;
      const datePattern = /^\w{3,9}\s+\d{4}\s*[-–]/i;
      const counts = {};
      
      // Paginate in batches of 1000 to avoid timeout
      let offset = 0;
      const batchSize = 1000;
      while (true) {
        const batch = await supabase.select('companies', 
          `select=company_name,source_profile_slug&is_current=eq.true&limit=${batchSize}&offset=${offset}`);
        
        for (const c of batch) {
          const name = (c.company_name || '').trim();
          if (!name || name.length < 2) continue;
          if (junkPatterns.test(name)) continue;
          if (datePattern.test(name)) continue;
          if (!counts[name]) counts[name] = new Set();
          counts[name].add(c.source_profile_slug);
        }
        
        if (batch.length < batchSize) break;
        offset += batchSize;
      }

      const sorted = Object.entries(counts)
        .map(([name, slugs]) => [name, slugs.size])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const listEl = document.getElementById('d-top-list');
      if (sorted.length > 0) {
        listEl.innerHTML = sorted.map(([name, count], i) =>
          `<div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #1e2035;">` +
          `<span style="color: ${i < 3 ? '#4da3ff' : '#c8ccd4'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">${escHtml(name)}</span>` +
          `<span style="color: #8892b0; font-weight: 600; margin-left: 8px;">${count}</span></div>`
        ).join('');
      } else {
        listEl.innerHTML = '<div style="color: #5a6070;">Scan profiles to discover companies</div>';
      }
    } catch (e) { console.warn('[BJ] company list render failed:', e.message); }

  } catch (e) {
    addLog('d-log', `Error: ${e.message}`, 'error');
  }
}

$('#d-refresh').addEventListener('click', () => {
  addLog('d-log', 'Refreshing...', 'info');
  refreshDataCounts();
});

$('#d-export-connections').addEventListener('click', async () => {
  try {
    addLog('d-log', 'Fetching connections...', 'info');
    let all = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const batch = await supabase.select('connections', `order=id.asc&limit=${limit}&offset=${offset}`);
      all = [...all, ...batch];
      if (batch.length < limit) break;
      offset += limit;
    }

    const headers = ['Profile Slug', 'Name', 'Headline', 'Parsed Company', 'Source', 'Visit Status', 'Collected At'];
    const rows = [headers.join('\t')];
    all.forEach(c => {
      rows.push([
        c.profile_slug || '',
        (c.name || '').replace(/\t/g, ' '),
        (c.headline || '').replace(/\t/g, ' '),
        (c.parsed_company || '').replace(/\t/g, ' '),
        c.source || '',
        c.visit_status || '',
        c.collected_at || ''
      ].join('\t'));
    });

    downloadTSV(rows.join('\n'), `connections-${new Date().toISOString().slice(0, 10)}.tsv`);
    addLog('d-log', `Exported ${all.length} connections`, 'success');
  } catch (e) {
    addLog('d-log', `Error: ${e.message}`, 'error');
  }
});

$('#d-export-companies').addEventListener('click', async () => {
  try {
    addLog('d-log', 'Fetching companies...', 'info');
    let all = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const batch = await supabase.select('companies', `order=company_id.asc&limit=${limit}&offset=${offset}`);
      all = [...all, ...batch];
      if (batch.length < limit) break;
      offset += limit;
    }

    const headers = ['Company ID', 'Company Name', 'Company URL', 'Source Profile', 'Is Current', 'Title', 'Date Range'];
    const rows = [headers.join('\t')];
    all.forEach(c => {
      rows.push([
        c.company_id || '',
        (c.company_name || '').replace(/\t/g, ' '),
        c.company_url || '',
        c.source_profile_slug || '',
        c.is_current ? 'Yes' : 'No',
        (c.title || '').replace(/\t/g, ' '),
        (c.date_range || '').replace(/\t/g, ' ')
      ].join('\t'));
    });

    downloadTSV(rows.join('\n'), `companies-${new Date().toISOString().slice(0, 10)}.tsv`);
    addLog('d-log', `Exported ${all.length} company records`, 'success');
  } catch (e) {
    addLog('d-log', `Error: ${e.message}`, 'error');
  }
});

function downloadTSV(content, filename) {
  const blob = new Blob([content], { type: 'text/tab-separated-values' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// INIT
// ============================================================

async function initCounts() {
  try {
    // Pull real counts from Supabase so they survive extension reinstalls
    const visited = await supabase.count('connections', 'visit_status=eq.completed');
    const queued = await supabase.count('connections', 'visit_status=eq.pending');
    cachedVisited = visited;
    cachedQueued = queued;
    $('#s-visited').textContent = visited;
    $('#s-queued').textContent = queued;

    // Smart harvest hint
    const hint = $('#s-harvest-hint');
    const total = visited + queued;
    if (total === 0) {
      hint.textContent = 'Harvest connections first, then start scanning.';
    } else {
      // Check last harvest date
      const lastHarvest = (await chrome.storage.local.get('lastHarvestAt')).lastHarvestAt;
      if (lastHarvest) {
        const daysSince = Math.floor((Date.now() - lastHarvest) / 86400000);
        if (daysSince > 30) {
          hint.textContent = `${total.toLocaleString()} connections in database. Last harvest was ${daysSince} days ago — consider re-harvesting to pick up new connections.`;
        } else {
          hint.textContent = `${total.toLocaleString()} connections in database. Ready to scan.`;
        }
      } else {
        hint.textContent = `${total.toLocaleString()} connections in database. Ready to scan.`;
      }
    }
  } catch (e) {
    // Non-fatal
  }
}

// Note: initApp() is called from checkAuth() after successful authentication

// ============================================================
// DAILY LIMIT BADGE (Item #10)
// Shows Starter tier users their daily application limit usage
// ============================================================

let _dailyLimitData = { used: 0, limit: 0, tier: '' };

async function initDailyLimitBadge() {
  await refreshDailyLimitBadge();
}

async function refreshDailyLimitBadge() {
  const bar = document.getElementById('daily-limit-bar');
  const countEl = document.getElementById('dl-count');
  const fillEl = document.getElementById('dl-bar-fill');
  if (!bar || !countEl || !fillEl) return;

  try {
    const session = typeof BJ_CRYPTO !== 'undefined' ? await BJ_CRYPTO.secureGet('authSession') : (await chrome.storage.local.get('authSession')).authSession;
    const tierData = await chrome.storage.local.get('bjTierCache');
    const tierCache = tierData.bjTierCache;

    // Only show for Starter tier (not Pro, not Admin)
    const tier = tierCache?.tier || '';
    if (tier !== 'starter') {
      bar.classList.remove('visible');
      return;
    }

    // Get daily limit from tier config
    const dailyLimit = tierCache?.daily_apply_limit || 5;

    // Query today's application count
    if (!session?.user_id || !session?.access_token) {
      bar.classList.remove('visible');
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
    const resp = await fetchWithRetry(
      `${SB_URL}/rest/v1/pending_applications?user_id=eq.${session.user_id}&created_at=gte.${today}T00:00:00Z&select=id`,
      {
        headers: {
          'apikey': session.access_token,
          'Authorization': `Bearer ${session.access_token}`,
        }
      },
      { timeout: 10000, retries: 1 } // CS-013 FIX-12
    );

    let used = 0;
    if (resp.ok) {
      const rows = await resp.json();
      used = Array.isArray(rows) ? rows.length : 0;
    }

    _dailyLimitData = { used, limit: dailyLimit, tier };

    // Update UI
    bar.classList.add('visible');
    countEl.textContent = `${used} / ${dailyLimit}`;
    const pct = Math.min((used / dailyLimit) * 100, 100);
    fillEl.style.width = `${pct}%`;

    // Color states
    const nearLimit = pct >= 80;
    const atLimit = pct >= 100;

    countEl.className = 'dl-count' + (atLimit ? ' at-limit' : nearLimit ? ' near-limit' : '');
    fillEl.className = 'dl-bar-fill' + (atLimit ? ' at-limit' : nearLimit ? ' near-limit' : '');

  } catch (e) {
    // Non-fatal — hide badge on error
    bar.classList.remove('visible');
  }
}

