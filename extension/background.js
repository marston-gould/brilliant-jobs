// background.js — Service worker for Brilliant Jobs
// v3.0.0: Merged extension with daily reset fix, keepalive, notifications
// v3.1.0: ATS message bridge — handles ats:pageDetected, ats:fill, ats:openAndFill

importScripts('supabase.js');

// ============================================================
// STATE
// ============================================================

let atsPageState = null; // Tracks the current ATS page detected by contentScript.js

let scannerState = {
  running: false,
  paused: false,
  todayVisited: 0,
  todayLimit: 0,
  todayDate: '',
  totalVisited: 0,
  totalQueued: 0,
  sessionVisited: 0,
  sessionBreakAfter: 0,
  currentProfile: null,
  nextActionAt: null,
  nextActionType: null,   // 'visit' | 'break_end' | 'done_today' | 'navigating' | 'browsing' | 'scraping'
  scheduledResumeAt: null, // preserved resume time even after stop
  incluePastCompanies: true,
  tabId: null,
  startedAt: null,         // when scanning first started (for overall progress)
  todayStartedAt: null,    // when today's scanning started
  log: []
};

function logMsg(msg, type = 'info') {
  const entry = { msg, type, time: new Date().toISOString() };
  scannerState.log.unshift(entry);
  if (scannerState.log.length > 100) scannerState.log.pop();
  saveState();
  chrome.runtime.sendMessage({ type: 'log', ...entry }).catch(() => {});
  broadcastState();
}

function broadcastState() {
  chrome.runtime.sendMessage({ type: 'state', state: scannerState }).catch(() => {});
}

async function saveState() {
  await chrome.storage.local.set({ scannerState });
}

// Sync key scanner fields to Supabase so they survive reinstalls
async function syncStateToSupabase() {
  try {
    const data = await chrome.storage.local.get('authSession');
    const userId = data.authSession?.user_id;
    if (!userId) return;

    await supabase.update('profiles', { id: userId }, {
      scanner_today_visited: scannerState.todayVisited,
      scanner_today_limit: scannerState.todayLimit,
      scanner_today_date: scannerState.todayDate,
      scanner_next_resume_at: (scannerState.nextActionAt || scannerState.scheduledResumeAt)
        ? new Date(scannerState.nextActionAt || scannerState.scheduledResumeAt).toISOString() : null,
      scanner_running: scannerState.running,
      last_scan_at: new Date().toISOString()
    });
  } catch (e) {
    // Silent fail — local state is primary, Supabase is backup
  }
}

async function loadState() {
  const data = await chrome.storage.local.get(['scannerState', 'authSession']);
  
  // Load auth token (but don't refresh here — only refresh before DB calls)
  if (data.authSession?.access_token) {
    supabase.setAuthToken(data.authSession.access_token);
  }

  if (data.scannerState && data.scannerState.todayDate) {
    // Local state exists and has data — use it
    scannerState = { ...scannerState, ...data.scannerState };
  } else if (data.authSession?.user_id) {
    // No local state — try to restore from Supabase
    try {
      const rows = await supabase.select('profiles',
        `select=scanner_today_visited,scanner_today_limit,scanner_today_date,scanner_next_resume_at,scanner_running&id=eq.${data.authSession.user_id}`
      );
      if (rows && rows.length > 0) {
        const p = rows[0];
        if (p.scanner_today_date) {
          scannerState.todayVisited = p.scanner_today_visited || 0;
          scannerState.todayLimit = p.scanner_today_limit || 0;
          scannerState.todayDate = p.scanner_today_date;
          scannerState.running = p.scanner_running || false;
          if (p.scanner_next_resume_at) {
            const resumeTs = new Date(p.scanner_next_resume_at).getTime();
            if (scannerState.running) {
              scannerState.nextActionAt = resumeTs;
              scannerState.nextActionType = 'done_today';
            }
            // Always preserve as scheduledResumeAt so UI can show it
            scannerState.scheduledResumeAt = resumeTs;
          }
          logMsg(`Restored scanner state from cloud: ${p.scanner_today_visited}/${p.scanner_today_limit} today`, 'info');
        }
      }
    } catch (e) {
      // Silent fail — will start fresh
    }
  }

  // Always refresh totalVisited/totalQueued from Supabase if they're 0
  if (scannerState.totalVisited === 0 && scannerState.totalQueued === 0) {
    try {
      await refreshCounts();
    } catch (e) {
      // Non-fatal
    }
  }
}

// Refresh auth token if expired or about to expire
let lastRefreshAttempt = 0;
let refreshInProgress = false;
const REFRESH_COOLDOWN = 30000; // Don't try more than once per 30 seconds

async function ensureValidToken(session) {
  // Always re-read from storage to pick up tokens refreshed by popup
  const stored = await chrome.storage.local.get('authSession');
  session = stored.authSession;

  if (!session?.access_token) return false;

  const now = Date.now();
  const expiresAt = session.expires_at || 0;
  const buffer = 120000; // refresh 2 min before expiry (ms)

  if (now < expiresAt - buffer) {
    // Token still valid (possibly refreshed by popup)
    supabase.setAuthToken(session.access_token);
    return true;
  }

  // If another refresh is in flight, wait for it then re-check storage
  if (refreshInProgress) {
    await new Promise(r => setTimeout(r, 3000));
    const recheck = await chrome.storage.local.get('authSession');
    if (recheck.authSession?.expires_at && Date.now() < recheck.authSession.expires_at - buffer) {
      supabase.setAuthToken(recheck.authSession.access_token);
      return true;
    }
    return false;
  }

  // Cooldown — don't spam refresh attempts, but re-check storage first
  // (popup may have refreshed during our cooldown window)
  if (now - lastRefreshAttempt < REFRESH_COOLDOWN) {
    // Re-read storage one more time — popup might have refreshed for us
    const recheck = await chrome.storage.local.get('authSession');
    if (recheck.authSession?.expires_at && Date.now() < recheck.authSession.expires_at - buffer) {
      supabase.setAuthToken(recheck.authSession.access_token);
      return true;
    }
    return false;
  }
  lastRefreshAttempt = now;

  // Token expired or about to — refresh it
  if (!session.refresh_token) {
    logMsg('No refresh token available — please log in again', 'error');
    return false;
  }

  refreshInProgress = true;
  try {
    logMsg('Refreshing auth token...', 'info');
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });

    if (!res.ok) {
      // Refresh failed — but maybe popup already refreshed with a newer token.
      // Re-read storage before giving up.
      const recheck = await chrome.storage.local.get('authSession');
      if (recheck.authSession?.expires_at && Date.now() < recheck.authSession.expires_at - buffer) {
        supabase.setAuthToken(recheck.authSession.access_token);
        logMsg('Token refresh failed but found valid token from popup session', 'info');
        return true;
      }
      logMsg('Token refresh failed — please log in again', 'error');
      return false;
    }

    const data = await res.json();
    const newSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      user_id: session.user_id,
      email: session.email
    };

    await chrome.storage.local.set({ authSession: newSession });
    supabase.setAuthToken(data.access_token);
    logMsg('Auth token refreshed', 'info');
    return true;
  } catch (e) {
    logMsg(`Token refresh error: ${e.message}`, 'error');
    return false;
  } finally {
    refreshInProgress = false;
  }
}

// ============================================================
// RANDOMIZATION HELPERS
// ============================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// Fisher-Yates shuffle — properly randomize an array in-place
function fisherYatesShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function newDailyLimit() {
  return randInt(40, 90);
}

function newBurstSize() {
  return randInt(8, 25);
}

function visitDelaySec() {
  return randFloat(15, 45);
}

function breakDurationSec() {
  return randFloat(60, 480); // 1-8 minutes
}

function timeOnProfileSec() {
  return randFloat(4, 10);
}

// ============================================================
// BUSINESS HOURS — Only scan during human-looking hours
// ============================================================

const BUSINESS_HOURS_START = 7;  // earliest possible start (will randomize above this)
const BUSINESS_HOURS_END = 19;   // 7 PM — stop scanning after this

function isWithinBusinessHours() {
  const hour = new Date().getHours();
  return hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END;
}

function getNextBusinessStart() {
  // Random start between 7:45 AM and 10:30 AM
  const now = new Date();
  const startHour = randInt(7, 10);
  const startMin = startHour === 7 ? randInt(45, 59) : (startHour === 10 ? randInt(0, 30) : randInt(0, 59));
  
  const next = new Date(now);
  next.setHours(startHour, startMin, randInt(0, 59), 0);
  
  // If that time already passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

function scheduleBusinessHoursResume() {
  const resumeAt = getNextBusinessStart();
  scannerState.nextActionType = 'outside_hours';
  scannerState.nextActionAt = resumeAt.getTime();
  scannerState.scheduledResumeAt = resumeAt.getTime();
  scannerState.currentProfile = null;
  
  // Stop the visit loop — clear any pending visit alarms
  chrome.alarms.clear('nextVisit');
  
  const resumeStr = resumeAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dayStr = resumeAt.toDateString() === new Date().toDateString() ? '' : ' tomorrow';
  logMsg(`Outside business hours. Resuming ~${resumeStr}${dayStr}.`, 'info');
  
  chrome.alarms.create('scheduledResume', { when: resumeAt.getTime() });
  saveState();
  syncStateToSupabase();
}

// ============================================================
// LOOP RECOVERY — Single function to ensure scanner is healthy
// Called from: keepAlive, onInstalled, onStartup, service worker
// wakeup, tokenUpdated, refreshToken. Handles every stuck state.
// ============================================================

async function ensureLoopRunning(context = 'unknown') {
  if (!scannerState.running) return;

  // Case 1: Paused (usually auth failure) — try to restore token
  if (scannerState.paused) {
    const tokenOk = await ensureValidToken();
    if (tokenOk) {
      logMsg(`[${context}] Auth restored — auto-resuming scanner.`, 'info');
      scannerState.paused = false;
      await refreshCounts();
      saveState();
      broadcastState();
      scheduleNextVisit();
    }
    return;
  }

  // Case 2: Waiting for scheduled resume (done_today / outside_hours)
  if (scannerState.nextActionType === 'done_today' || scannerState.nextActionType === 'outside_hours') {
    if (scannerState.nextActionAt && Date.now() >= scannerState.nextActionAt) {
      // Scheduled time already passed — handle via checkMissedResume
      await checkMissedResume();
    } else if (scannerState.nextActionAt) {
      // Ensure the alarm exists (may have been lost on restart)
      const alarm = await chrome.alarms.get('scheduledResume');
      if (!alarm) {
        chrome.alarms.create('scheduledResume', { when: scannerState.nextActionAt });
        logMsg(`[${context}] Re-created scheduledResume alarm.`, 'info');
      }
    }
    return;
  }

  // Case 3: Should be actively scanning — ensure nextVisit alarm exists
  const alarm = await chrome.alarms.get('nextVisit');
  if (!alarm) {
    logMsg(`[${context}] No active visit alarm — restarting scan loop.`, 'info');
    await refreshCounts();
    scheduleNextVisit();
  }
}



function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title,
      message
    });
  } catch (e) {
    // Notifications may not be available in all contexts
  }
}

// ============================================================
// DAILY RESET
// ============================================================

function checkDailyReset() {
  const today = new Date().toISOString().slice(0, 10);
  if (scannerState.todayDate !== today) {
    const wasRunning = scannerState.running && scannerState.nextActionType === 'done_today';
    scannerState.todayDate = today;
    scannerState.todayVisited = 0;
    scannerState.todayLimit = newDailyLimit();
    scannerState.sessionVisited = 0;
    scannerState.sessionBreakAfter = newBurstSize();
    scannerState.todayStartedAt = null;
    logMsg(`New day! Today's limit: ${scannerState.todayLimit} profiles`, 'info');

    if (wasRunning) {
      notify('Brilliant Jobs — Resuming', `New day started. Today's limit: ${scannerState.todayLimit} profiles.`);
    }
    return true; // indicates a new day
  }
  return false;
}

// ============================================================
// KEEPALIVE — Prevent service worker & tab from sleeping
// ============================================================

async function keepAlive() {
  // Proactively refresh token if it's about to expire
  if (scannerState.running && !scannerState.paused) {
    await ensureValidToken();
  }

  // Recover from any stuck state
  await ensureLoopRunning('keepAlive');

  // Ping the LinkedIn tab to keep it active
  if (scannerState.running && !scannerState.paused && scannerState.tabId) {
    try {
      const tab = await chrome.tabs.get(scannerState.tabId);
      if (tab) {
        await chrome.scripting.executeScript({
          target: { tabId: scannerState.tabId },
          func: () => { /* keepalive ping */ }
        });
      }
    } catch (e) {
      // Tab may have been closed — that's fine, we'll find a new one on next visit
    }
  }
}

// ============================================================
// CORE SCANNING LOOP
// ============================================================

// Refresh queue/visited counts from Supabase (used on resume paths)
async function refreshCounts() {
  try {
    scannerState.totalQueued = await supabase.count('connections', 'visit_status=eq.pending');
    scannerState.totalVisited = await supabase.count('connections', 'visit_status=eq.completed');
    logMsg(`Queue: ${scannerState.totalQueued} pending, ${scannerState.totalVisited} visited`, 'info');
  } catch (e) {
    logMsg(`Could not refresh counts: ${e.message}`, 'error');
  }
}

async function startScanner(includePast = true) {
  await loadState();
  scannerState.running = true;
  scannerState.paused = false;
  scannerState.scheduledResumeAt = null;
  scannerState.incluePastCompanies = includePast;
  if (!scannerState.startedAt) {
    scannerState.startedAt = Date.now();
  }
  scannerState.todayStartedAt = Date.now();
  checkDailyReset();

  // Get queue size
  await refreshCounts();

  logMsg(`Scanner started. ${scannerState.totalQueued} profiles in queue.`, 'success');
  saveState();
  syncStateToSupabase();

  // Ensure alarms are running
  setupAlarms();

  // Visit first profile immediately, no delay
  visitNextProfile();
}

function stopScanner() {
  // If we were done for today with a scheduled resume, preserve that info
  // so the UI can still show when it will restart
  if (scannerState.nextActionType === 'done_today' && scannerState.nextActionAt) {
    scannerState.scheduledResumeAt = scannerState.nextActionAt;
  }
  scannerState.running = false;
  scannerState.paused = false;
  scannerState.nextActionAt = null;
  scannerState.nextActionType = null;
  chrome.alarms.clear('nextVisit');
  // Keep scheduledResume alarm alive so it can auto-restart tomorrow
  logMsg('Scanner stopped.', 'info');
  saveState();
  syncStateToSupabase();
}

function pauseScanner() {
  scannerState.paused = true;
  chrome.alarms.clear('nextVisit');
  logMsg('Scanner paused.', 'info');
  saveState();
}

function resumeScanner() {
  scannerState.paused = false;
  logMsg('Scanner resumed.', 'info');
  scheduleNextVisit();
}

function scheduleNextVisit() {
  if (!scannerState.running || scannerState.paused) return;

  const isNewDay = checkDailyReset();

  // Check business hours — don't scan at night
  if (!isWithinBusinessHours()) {
    scheduleBusinessHoursResume();
    return;
  }

  // Check daily limit
  if (scannerState.todayVisited >= scannerState.todayLimit) {
    scannerState.nextActionType = 'done_today';
    // Calculate tomorrow's resume time (roughly 8-10 AM tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(randInt(8, 10), randInt(0, 59), 0, 0);
    scannerState.nextActionAt = tomorrow.getTime();

    const resumeStr = tomorrow.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    logMsg(`Done for today (${scannerState.todayVisited}/${scannerState.todayLimit}). Resuming ~${resumeStr} tomorrow.`, 'info');

    notify('Brilliant Jobs — Done for Today',
      `Visited ${scannerState.todayVisited} profiles. Resuming tomorrow ~${resumeStr}.`);

    // Set a precise alarm for the resume time — survives service worker death
    chrome.alarms.create('scheduledResume', { when: tomorrow.getTime() });

    saveState();
    syncStateToSupabase();
    return;
  }

  // Check if we need a session break
  if (scannerState.sessionVisited >= scannerState.sessionBreakAfter) {
    const breakSec = breakDurationSec();
    scannerState.sessionVisited = 0;
    scannerState.sessionBreakAfter = newBurstSize();
    scannerState.nextActionType = 'break_end';
    scannerState.nextActionAt = Date.now() + breakSec * 1000;
    logMsg(`Taking a break for ${Math.round(breakSec / 60 * 10) / 10} min. Next burst: ${scannerState.sessionBreakAfter} profiles.`, 'info');
    chrome.alarms.create('nextVisit', { delayInMinutes: breakSec / 60 });
    saveState();
    return;
  }

  // Schedule next visit
  const delaySec = visitDelaySec();
  scannerState.nextActionType = 'visit';
  scannerState.nextActionAt = Date.now() + delaySec * 1000;
  chrome.alarms.create('nextVisit', { delayInMinutes: delaySec / 60 });
  saveState();
}

// ============================================================
// PROFILE VISITING
// ============================================================

async function visitNextProfile() {
  if (!scannerState.running || scannerState.paused) return;

  // Business hours safety check
  if (!isWithinBusinessHours()) {
    scheduleBusinessHoursResume();
    return;
  }

  checkDailyReset();
  if (scannerState.todayVisited >= scannerState.todayLimit) {
    scheduleNextVisit();
    return;
  }

  // Ensure auth token is valid before making DB calls
  let tokenOk = await ensureValidToken();
  
  // If first attempt failed, wait briefly and retry once
  // (popup may be refreshing the token concurrently)
  if (!tokenOk) {
    logMsg('Auth check failed, retrying in 5s...', 'info');
    await sleep(5000);
    tokenOk = await ensureValidToken();
  }
  
  if (!tokenOk) {
    logMsg('Auth token expired — pausing scanner. Please log in again.', 'error');
    scannerState.paused = true;
    broadcastState();
    saveState();
    return;
  }

  // Mark today as started if not yet
  if (!scannerState.todayStartedAt) {
    scannerState.todayStartedAt = Date.now();
  }

  try {
    // Get next pending profiles and shuffle the entire batch (Fisher-Yates)
    // This eliminates any sequential pattern LinkedIn could detect across visits
    const rows = await supabase.select('connections', 'visit_status=eq.pending&limit=20&order=id.asc');
    if (!rows || rows.length === 0) {
      logMsg('No more profiles in queue! All done!', 'success');
      notify('Brilliant Jobs — Complete!', 'All profiles have been scanned.');
      stopScanner();
      return;
    }

    // Shuffle and take the first — true randomization, not just random index
    fisherYatesShuffle(rows);
    const connection = rows[0];
    scannerState.currentProfile = connection.name || connection.profile_slug;
    logMsg(`Visiting: ${connection.name || connection.profile_slug}`, 'info');
    saveState();

    // Mark as in-progress
    await supabase.update('connections', { profile_slug: connection.profile_slug }, {
      visit_status: 'visiting'
    });

    // Find or create a LinkedIn tab
    const linkedinTab = await findOrCreateLinkedInTab();
    const tabId = linkedinTab.id;

    // Navigate to profile
    const profileUrl = `https://www.linkedin.com/in/${connection.profile_slug}/`;
    scannerState.nextActionType = 'navigating';
    broadcastState();
    await chrome.tabs.update(tabId, { url: profileUrl });

    // Simple wait for page load
    await sleep(5000);

    // === CAPTCHA / CHALLENGE DETECTION ===
    // If LinkedIn serves a challenge page instead of a profile, halt immediately.
    // Continuing to visit pages while flagged makes the situation worse.
    try {
      const challengeCheck = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const url = window.location.href.toLowerCase();
          const body = document.body?.innerText?.substring(0, 2000)?.toLowerCase() || '';
          const title = document.title?.toLowerCase() || '';

          // URL-based detection
          if (url.includes('/checkpoint/') || url.includes('/challenge/') ||
              url.includes('/authwall') || url.includes('/captcha')) {
            return { blocked: true, reason: 'challenge_url', detail: url };
          }

          // Content-based detection
          if (title.includes('security verification') || title.includes('captcha') ||
              title.includes('let\'s do a quick security check')) {
            return { blocked: true, reason: 'challenge_title', detail: title };
          }

          // Body content signals
          if (body.includes('unusual activity') || body.includes('security check') ||
              body.includes('verify you\'re a real person') || body.includes('automated behavior') ||
              body.includes('restricted your account') || body.includes('temporarily limited')) {
            return { blocked: true, reason: 'challenge_body', detail: body.substring(0, 200) };
          }

          // reCAPTCHA / hCaptcha iframe detection
          if (document.querySelector('iframe[src*="recaptcha"]') ||
              document.querySelector('iframe[src*="hcaptcha"]') ||
              document.querySelector('#captcha-challenge') ||
              document.querySelector('.challenge-dialog')) {
            return { blocked: true, reason: 'captcha_element', detail: 'CAPTCHA iframe or dialog detected' };
          }

          return { blocked: false };
        }
      });

      const challenge = challengeCheck?.[0]?.result;
      if (challenge?.blocked) {
        logMsg(`🚨 CAPTCHA/CHALLENGE DETECTED: ${challenge.reason}`, 'error');
        logMsg(`Detail: ${challenge.detail}`, 'error');
        logMsg('⛔ Scanner halted — LinkedIn is suspicious. Wait 24-48h before resuming.', 'error');
        notify('Brilliant Jobs — CAPTCHA Detected',
          'LinkedIn is showing a security challenge. Scanner stopped. Wait 24-48h before resuming.');

        // Revert the connection status back to pending
        await supabase.update('connections', { profile_slug: connection.profile_slug }, {
          visit_status: 'pending'
        });

        scannerState.paused = true;
        scannerState.currentProfile = null;
        scannerState.nextActionType = 'captcha_halt';
        scannerState.nextActionAt = null;
        chrome.alarms.clear('nextVisit');
        saveState();
        syncStateToSupabase();
        broadcastState();
        return;
      }
    } catch (e) {
      // If we can't even run the check, the tab may have navigated away — continue cautiously
    }

    // Simulate browsing: scroll down gradually
    const browseTime = timeOnProfileSec();
    const browseMs = browseTime * 1000;
    scannerState.nextActionType = 'browsing';
    scannerState.nextActionAt = Date.now() + browseMs;
    broadcastState();

    const scrollSteps = Math.floor(browseTime);
    for (let i = 1; i <= scrollSteps; i++) {
      try {
        const pct = i / scrollSteps;
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (p) => { window.scrollTo({ top: document.body.scrollHeight * 0.6 * p, behavior: 'smooth' }); },
          args: [pct]
        });
      } catch (e) {}
      await sleep(1000);
    }

    // Scroll Experience section into view (natural browsing behavior)
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const exp = document.querySelector('#experience');
          if (exp) exp.scrollIntoView({ behavior: 'instant', block: 'center' });
        }
      });
    } catch (e) {}
    await sleep(2000);

    // === PHASE 2.5: NETWORK INTERCEPTION (primary) + DOM FALLBACK ===
    scannerState.nextActionType = 'scraping';
    broadcastState();

    let hiringSignal = null;
    let experienceData = { companies: [], hasMore: false };

    // Try network interceptor first — check background cache, then ask content script
    let interceptedProfile = null;
    
    // Check background cache first (populated proactively by content script messages)
    const slugKey = 'slug:' + connection.profile_slug;
    if (interceptedProfiles[slugKey]) {
      interceptedProfile = interceptedProfiles[slugKey];
      delete interceptedProfiles[slugKey];
    } else {
      // Also check by scanning all cached URNs
      for (const urn in interceptedProfiles) {
        if (urn.startsWith('slug:')) continue;
        const cached = interceptedProfiles[urn];
        if (cached.profileSlug === connection.profile_slug) {
          interceptedProfile = cached;
          delete interceptedProfiles[urn];
          break;
        }
      }
    }

    // If not in cache, ask content script directly
    if (!interceptedProfile) {
      try {
        interceptedProfile = await chrome.tabs.sendMessage(tabId, {
          type: 'getInterceptedData',
          profileSlug: connection.profile_slug
        });
      } catch (e) {
        // Content script may not be ready or tab context invalid
      }
    }

    if (interceptedProfile && (interceptedProfile.companies?.length > 0 || interceptedProfile.hiringSignal)) {
      // === SUCCESS: Use intercepted API data ===
      logMsg(`  📡 API intercept: ${interceptedProfile.companies?.length || 0} companies, signal=${interceptedProfile.hiringSignal || 'none'}`, 'info');

      hiringSignal = interceptedProfile.hiringSignal || null;

      // Filter companies — remove empty names and apply junk filters
      const junk = /^(full-time|part-time|contract|freelance|self-employed|internship|seasonal|temporary)$/i;
      const dateLike = /^\w{3,9}\s+\d{4}/;
      const durationLike = /^\d+\s+(yr|mo|day)/;

      experienceData.companies = (interceptedProfile.companies || []).filter(c => {
        if (!c.company_id) return false;
        if (!c.company_name || c.company_name.length <= 1) return false;
        if (junk.test(c.company_name)) return false;
        if (dateLike.test(c.company_name)) return false;
        if (durationLike.test(c.company_name)) return false;
        return true;
      }).map(c => ({
        company_id: c.company_id,
        company_name: c.company_name,
        company_url: c.company_url || `https://www.linkedin.com/company/${c.company_id}/`,
        title: c.title || '',
        date_range: c.date_range || '',
        is_current: c.is_current || false
      }));

      // Clear intercepted data for this profile
      try {
        await chrome.tabs.sendMessage(tabId, { type: 'clearInterceptedData' });
      } catch (e) {}

    } else {
      // === FALLBACK: DOM scraping (original method) ===
      logMsg(`  🔍 DOM fallback (no API data intercepted)`, 'info');

      // Detect #Hiring or #OpenToWork signal on profile photo
      try {
        const signalResults = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const photoArea = document.querySelector('.pv-top-card')?.innerHTML || '';
            if (photoArea.includes('OPEN_TO_WORK') || photoArea.includes('open-to-work') ||
                photoArea.includes('openToWork') || photoArea.includes('open_to_work') ||
                document.querySelector('img[alt*="Open to work"]') ||
                document.querySelector('span.opentowork')) {
              return 'open_to_work';
            }
            if (photoArea.includes('HIRING') || photoArea.includes('hiring-frame') ||
                document.querySelector('img[alt*="Hiring"]') ||
                document.querySelector('span.hiring')) {
              return 'hiring';
            }
            const scripts = document.querySelectorAll('code[id*="bpr-guid"]');
            for (const s of scripts) {
              try {
                const str = JSON.stringify(JSON.parse(s.textContent));
                if (str.includes('OPEN_TO_WORK')) return 'open_to_work';
                if (str.includes('HIRING')) return 'hiring';
              } catch (e) {}
            }
            return null;
          }
        });
        hiringSignal = signalResults?.[0]?.result || null;
      } catch (e) {}

      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId },
          func: scrapeExperience,
          args: [scannerState.incluePastCompanies]
        });
        experienceData = results?.[0]?.result || { companies: [], hasMore: false };
      } catch (e) {
        logMsg(`  Scrape error: ${e.message}`, 'error');
      }

      // If there's a "Show all experiences" link and we want past companies, follow it
      if (experienceData.hasMore && scannerState.incluePastCompanies && experienceData.showAllUrl) {
        try {
          logMsg(`  → Following "Show all" for ${connection.name}`, 'info');
          await chrome.tabs.update(tabId, { url: experienceData.showAllUrl });
          await sleep(5000);
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: () => { window.scrollTo(0, document.body.scrollHeight); }
            });
          } catch (e) {}
          await sleep(2000);

          const moreResults = await chrome.scripting.executeScript({
            target: { tabId },
            func: scrapeExperienceDetails,
          });
          const moreData = moreResults?.[0]?.result || { companies: [] };
          const seen = new Set(experienceData.companies.map(c => `${c.company_id}|${c.title}`));
          for (const c of moreData.companies) {
            const key = `${c.company_id}|${c.title}`;
            if (!seen.has(key)) {
              experienceData.companies.push(c);
              seen.add(key);
            }
          }
        } catch (e) {
          logMsg(`  Show all error (non-fatal): ${e.message}`, 'info');
        }
      }
    }

    if (hiringSignal) {
      logMsg(`  🏷️ ${connection.name}: #${hiringSignal === 'hiring' ? 'Hiring' : 'OpenToWork'}`, 'info');
    }

    // Push companies to Supabase
    if (experienceData.companies.length > 0) {
      const { authSession } = await chrome.storage.local.get('authSession');
      const userId = authSession?.user_id;
      const companyRows = experienceData.companies.map(c => ({
        company_id: c.company_id,
        company_name: c.company_name,
        company_url: c.company_url,
        source_profile_slug: connection.profile_slug,
        is_current: c.is_current,
        title: c.title,
        date_range: c.date_range,
        user_id: userId
      }));

      await supabase.upsert('companies', companyRows, 'company_id,source_profile_slug,title');
      logMsg(`  → ${experienceData.companies.length} companies saved (${experienceData.companies.filter(c => c.is_current).length} current)`, 'success');
    } else {
      logMsg(`  → No companies found for ${connection.name}`, 'info');
    }

    // Mark as completed
    const updateData = {
      visit_status: 'completed',
      visited_at: new Date().toISOString()
    };
    if (hiringSignal) updateData.hiring_signal = hiringSignal;

    await supabase.update('connections', { profile_slug: connection.profile_slug }, updateData);

    scannerState.todayVisited++;
    scannerState.sessionVisited++;
    scannerState.totalVisited++;
    scannerState.totalQueued = Math.max(0, scannerState.totalQueued - 1);
    scannerState.currentProfile = null;

    logMsg(`  ✓ Done (${scannerState.todayVisited}/${scannerState.todayLimit} today, ${scannerState.totalVisited} total)`, 'success');
    saveState();
    syncStateToSupabase();

  } catch (e) {
    logMsg(`Error: ${e.message}`, 'error');
    if (scannerState.currentProfile) {
      await supabase.update('connections', { profile_slug: scannerState.currentProfile }, {
        visit_status: 'error'
      }).catch(() => {});
    }
    scannerState.currentProfile = null;
  }

  scheduleNextVisit();
}

// ============================================================
// TAB HELPERS
// ============================================================

async function findOrCreateLinkedInTab() {
  // Try to reuse our dedicated tab
  if (scannerState.tabId) {
    try {
      const tab = await chrome.tabs.get(scannerState.tabId);
      if (tab) return tab;
    } catch (e) {
      // Tab was closed
    }
  }

  // Find any existing LinkedIn tab
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  if (tabs.length > 0) {
    scannerState.tabId = tabs[0].id;
    return tabs[0];
  }

  // Create a new tab
  const newTab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false });
  scannerState.tabId = newTab.id;
  return newTab;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============================================================
// INJECTED FUNCTIONS (run in LinkedIn tab context)
// ============================================================

function scrapeExperience(includePast) {
  const companies = [];
  const experienceSection = document.querySelector('#experience')?.closest('section');
  if (!experienceSection) return { companies: [], hasMore: false };

  const junk = /^(full-time|part-time|contract|freelance|self-employed|internship|seasonal|temporary)$/i;
  const dateLike = /^\w{3,9}\s+\d{4}/;
  const durationLike = /^\d+\s+(yr|mo|day)/;

  experienceSection.querySelectorAll('[data-view-name="profile-component-entity"]').forEach(entity => {
    const companyLink = entity.querySelector('a[data-field="experience_company_logo"]');
    const companyUrl = companyLink?.getAttribute('href') || '';
    const companyIdMatch = companyUrl.match(/\/company\/(\d+)/);
    const company_id = companyIdMatch ? companyIdMatch[1] : '';
    if (!company_id) return;

    const titleEl = entity.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]');
    const title = titleEl?.textContent?.replace(/<!---->/g, '').trim() || '';

    const nameEls = entity.querySelectorAll('.t-14.t-normal span[aria-hidden="true"]');
    let company_name = '';
    for (const el of nameEls) {
      const text = el.textContent.replace(/<!---->/g, '').trim().replace(/\s*·\s*.+$/, '').trim();
      if (text && !junk.test(text) && !dateLike.test(text) && !durationLike.test(text) && text.length > 1) {
        company_name = text;
        break;
      }
    }

    const captionEl = entity.querySelector('.pvs-entity__caption-wrapper');
    const date_range = captionEl?.textContent?.replace(/<!---->/g, '').trim() || '';
    const is_current = date_range.toLowerCase().includes('present');
    if (!includePast && !is_current) return;

    companies.push({
      company_id,
      company_name,
      company_url: companyUrl.startsWith('http') ? companyUrl : `https://www.linkedin.com${companyUrl}`,
      title,
      date_range,
      is_current
    });
  });

  const showAllLink = experienceSection.querySelector('a[id*="see-all-experiences"], a[href*="/details/experience"]');
  const hasMore = !!showAllLink;
  const showAllUrl = showAllLink ? (showAllLink.href.startsWith('http') ? showAllLink.href : `https://www.linkedin.com${showAllLink.getAttribute('href')}`) : null;

  return { companies, hasMore, showAllUrl };
}

function scrapeExperienceDetails() {
  const companies = [];
  const junk = /^(full-time|part-time|contract|freelance|self-employed|internship|seasonal|temporary)$/i;
  const dateLike = /^\w{3,9}\s+\d{4}/;
  const durationLike = /^\d+\s+(yr|mo|day)/;

  document.querySelectorAll('[data-view-name="profile-component-entity"]').forEach(entity => {
    const companyLink = entity.querySelector('a[data-field="experience_company_logo"], a[href*="/company/"]');
    const companyUrl = companyLink?.getAttribute('href') || '';
    const companyIdMatch = companyUrl.match(/\/company\/(\d+)/);
    const company_id = companyIdMatch ? companyIdMatch[1] : '';
    if (!company_id) return;

    const titleEl = entity.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]');
    const title = titleEl?.textContent?.replace(/<!---->/g, '').trim() || '';

    const nameEls = entity.querySelectorAll('.t-14.t-normal span[aria-hidden="true"]');
    let company_name = '';
    for (const el of nameEls) {
      const text = el.textContent.replace(/<!---->/g, '').trim().replace(/\s*·\s*.+$/, '').trim();
      if (text && !junk.test(text) && !dateLike.test(text) && !durationLike.test(text) && text.length > 1) {
        company_name = text;
        break;
      }
    }

    const captionEl = entity.querySelector('.pvs-entity__caption-wrapper');
    const date_range = captionEl?.textContent?.replace(/<!---->/g, '').trim() || '';
    const is_current = date_range.toLowerCase().includes('present');

    companies.push({
      company_id,
      company_name,
      company_url: companyUrl.startsWith('http') ? companyUrl : `https://www.linkedin.com${companyUrl}`,
      title,
      date_range,
      is_current
    });
  });

  return { companies };
}

// ============================================================
// INTERCEPTED DATA CACHE (from content script API interception)
// ============================================================
const interceptedProfiles = {};

// ============================================================
// MESSAGE HANDLER
// ============================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Cache intercepted profile data from content script
  if (msg.type === 'interceptedProfileData') {
    if (msg.profileUrn && msg.data) {
      interceptedProfiles[msg.profileUrn] = msg.data;
      // Also index by profileSlug if available
      if (msg.data.profileSlug) {
        interceptedProfiles['slug:' + msg.data.profileSlug] = msg.data;
      }
    }
    return;
  }

  if (msg.type === 'getState') {
    loadState().then(() => sendResponse(scannerState));
    return true;
  }
  if (msg.type === 'refreshToken') {
    // Popup is asking us to refresh — we're the canonical token refresher
    ensureValidToken().then(async (ok) => {
      if (ok) await ensureLoopRunning('refreshToken');
      sendResponse({ ok });
    });
    return true;
  }
  if (msg.type === 'tokenUpdated') {
    // User logged in or token was refreshed externally — pick up new token
    loadState().then(async () => {
      const data = await chrome.storage.local.get('authSession');
      if (data.authSession?.access_token) {
        supabase.setAuthToken(data.authSession.access_token);
        lastRefreshAttempt = 0; // Reset cooldown
        await ensureLoopRunning('tokenUpdated');
      }
    });
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'startScanner') {
    // Phase 5 RBAC: Only admin users can start the scanner
    chrome.storage.local.get('userRole').then(data => {
      if (data.userRole !== 'admin') {
        console.warn('[BJ] Scanner start blocked — non-admin role:', data.userRole);
        sendResponse({ ok: false, error: 'admin_only' });
        return;
      }
      startScanner(msg.includePast).then(() => sendResponse({ ok: true }));
    });
    return true;
  }
  if (msg.type === 'stopScanner') {
    stopScanner();
    sendResponse({ ok: true });
  }
  if (msg.type === 'pauseScanner') {
    pauseScanner();
    sendResponse({ ok: true });
  }
  if (msg.type === 'resumeScanner') {
    resumeScanner();
    sendResponse({ ok: true });
  }

  // ============================================================
  // ATS AUTOFILL MESSAGE BRIDGE (P0 Architecture)
  // ============================================================

  // Content script detected an ATS page — cache state
  if (msg.type === 'ats:pageDetected') {
    atsPageState = {
      ats: msg.ats,
      url: msg.url,
      jd: msg.jd,
      fieldCount: msg.fieldCount,
      tabId: sender.tab?.id,
      detectedAt: new Date().toISOString()
    };
    logMsg(`ATS detected: ${msg.ats} (${msg.fieldCount} fields)`, 'info');
    chrome.runtime.sendMessage({
      type: 'ats:pageState',
      ...atsPageState
    }).catch(() => {});
    return;
  }

  // Content script detected new/changed form fields
  if (msg.type === 'ats:fieldsChanged') {
    if (atsPageState) {
      atsPageState.fieldCount = msg.fieldCount;
    }
    chrome.runtime.sendMessage({
      type: 'ats:fieldsUpdated',
      fieldCount: msg.fieldCount,
      url: msg.url
    }).catch(() => {});
    return;
  }

  // Popup or dashboard requesting current ATS page state
  if (msg.type === 'ats:getPageState') {
    sendResponse(atsPageState || null);
    return true;
  }

  // Popup requesting field scan on active ATS tab
  if (msg.type === 'ats:requestScan') {
    const tabId = atsPageState?.tabId || msg.tabId;
    if (!tabId) {
      sendResponse({ error: 'No ATS tab detected' });
      return true;
    }
    chrome.tabs.sendMessage(tabId, { type: 'ats:scanFields' })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // Dashboard or popup requesting JD extraction
  if (msg.type === 'ats:requestJD') {
    const tabId = atsPageState?.tabId || msg.tabId;
    if (!tabId) {
      sendResponse({ error: 'No ATS tab detected' });
      return true;
    }
    chrome.tabs.sendMessage(tabId, { type: 'ats:extractJD' })
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }

  // Dashboard/popup requesting autofill on ATS tab
  if (msg.type === 'ats:fill') {
    handleAtsFill(msg)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // Dashboard requesting: open ATS URL in tab and fill
  if (msg.type === 'ats:openAndFill') {
    handleAtsOpenAndFill(msg)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// ============================================================
// ATS FILL HANDLERS
// ============================================================

/**
 * Send fill command to the content script on the ATS tab.
 * The content script routes to the correct platform handler.
 */
async function handleAtsFill(msg) {
  const tabId = atsPageState?.tabId || msg.tabId;
  if (!tabId) {
    return { success: false, error: 'No ATS tab detected. Navigate to a job application page first.' };
  }

  // Get profile data from storage if not provided
  let profile = msg.profile;
  if (!profile) {
    const data = await chrome.storage.local.get(['userProfile']);
    profile = data.userProfile;
  }
  if (!profile) {
    return { success: false, error: 'No profile data. Set up your profile in the extension popup.' };
  }

  try {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: 'ats:fill',
      profile,
      resume: msg.resume || null,
      preferences: msg.preferences || {},
      userInitiated: true
    });

    // Log result
    if (result.success) {
      logMsg(`Autofill complete on ${atsPageState?.ats || 'unknown'}: ${result.filledCount || 0} fields`, 'info');
    } else {
      logMsg(`Autofill failed on ${atsPageState?.ats || 'unknown'}: ${result.error}`, 'warn');
    }

    return result;
  } catch (err) {
    return { success: false, error: `Failed to communicate with ATS tab: ${err.message}` };
  }
}

/**
 * Open a job application URL in a new tab, wait for it to load,
 * then fill the form. Used by the dashboard's apply workflow.
 */
async function handleAtsOpenAndFill(msg) {
  if (!msg.url) {
    return { success: false, error: 'No URL provided' };
  }

  // Open the tab
  const tab = await chrome.tabs.create({ url: msg.url, active: true });

  // Wait for tab to finish loading
  await new Promise((resolve) => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    // Timeout after 30s
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 30000);
  });

  // Wait a bit more for content script to initialize and detect ATS
  await new Promise(r => setTimeout(r, 1500));

  // Now send the fill command
  try {
    const result = await chrome.tabs.sendMessage(tab.id, {
      type: 'ats:fill',
      profile: msg.profile,
      resume: msg.resume || null,
      preferences: msg.preferences || {},
      userInitiated: true
    });
    return { ...result, tabId: tab.id };
  } catch (err) {
    return { success: false, error: `Tab loaded but fill failed: ${err.message}`, tabId: tab.id };
  }
}

// ============================================================
// ALARM HANDLER
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'nextVisit') {
    await loadState();
    visitNextProfile();
  }

  if (alarm.name === 'scheduledResume') {
    await loadState();
    
    // Force daily reset — this is the morning kickoff, always treat as new day
    const today = new Date().toISOString().slice(0, 10);
    if (scannerState.todayDate !== today) {
      scannerState.todayDate = today;
      scannerState.todayVisited = 0;
      scannerState.todayLimit = newDailyLimit();
      scannerState.sessionVisited = 0;
      scannerState.sessionBreakAfter = newBurstSize();
      scannerState.todayStartedAt = null;
      logMsg(`New day! Today's limit: ${scannerState.todayLimit} profiles`, 'info');
    } else if (scannerState.todayVisited >= scannerState.todayLimit && scannerState.todayLimit > 0) {
      // Same day but limit was hit — this alarm is stale, reschedule for tomorrow
      logMsg(`Scheduled resume fired but today's limit already reached (${scannerState.todayVisited}/${scannerState.todayLimit}). Rescheduling.`, 'info');
      scheduleBusinessHoursResume();
      return;
    }
    
    // Must be running to proceed — if user manually stopped, respect that
    if (!scannerState.running) {
      logMsg('Scheduled resume fired but scanner is stopped. Skipping.', 'info');
      return;
    }
    
    // Check business hours
    if (!isWithinBusinessHours()) {
      logMsg('Scheduled resume fired outside business hours. Rescheduling.', 'info');
      scheduleBusinessHoursResume();
      return;
    }
    
    logMsg(`Scheduled resume alarm fired. Starting scan. Limit: ${scannerState.todayLimit} profiles.`, 'info');
    scannerState.nextActionType = null;
    scannerState.nextActionAt = null;
    scannerState.scheduledResumeAt = null;
    scannerState.paused = false;
    await refreshCounts();
    saveState();
    syncStateToSupabase();
    scheduleNextVisit();
  }

  if (alarm.name === 'dailyCheck') {
    await loadState();
    if (scannerState.running && !scannerState.paused) {
      const isNewDay = checkDailyReset();
      if (isNewDay) {
        // Always save the reset state so scheduledResume sees fresh counters
        saveState();
        if (scannerState.nextActionType === 'done_today') {
          // It's a new day and we were waiting — resume!
          logMsg('Daily check: new day detected. Resuming scanner.', 'info');
          scannerState.nextActionType = null;
          saveState();
          scheduleNextVisit();
        }
      }
    }
    // Also check for missed scheduled resume
    checkMissedResume();
  }

  if (alarm.name === 'keepAlive') {
    await loadState();
    keepAlive();
  }
});

// ============================================================
// ALARMS SETUP
// ============================================================

function setupAlarms() {
  // dailyCheck: fires every 30 minutes to catch day rollover
  chrome.alarms.create('dailyCheck', { periodInMinutes: 30 });

  // keepAlive: fires every 4 minutes to keep service worker + tab alive
  chrome.alarms.create('keepAlive', { periodInMinutes: 4 });
}

// ============================================================
// MISSED RESUME CHECK — Catch cases where scheduled time passed
// while browser was closed or service worker was dead
// ============================================================

async function checkMissedResume() {
  if (!scannerState.running || scannerState.paused) return;
  if (scannerState.nextActionType !== 'done_today') return;
  if (!scannerState.nextActionAt) return;

  const now = Date.now();
  if (now >= scannerState.nextActionAt) {
    // Check business hours before resuming
    if (!isWithinBusinessHours()) {
      logMsg('Missed resume but outside business hours. Rescheduling.', 'info');
      scheduleBusinessHoursResume();
      return;
    }
    // We missed our scheduled resume time — go now
    logMsg('Missed scheduled resume time. Starting immediately.', 'info');
    checkDailyReset();
    scannerState.nextActionType = null;
    scannerState.nextActionAt = null;
    chrome.alarms.clear('scheduledResume');
    await refreshCounts();
    saveState();
    scheduleNextVisit();
  }
}

// ============================================================
// STARTUP
// ============================================================

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// On install or update
chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  loadState().then(async () => {
    await checkMissedResume();
    await ensureLoopRunning('onInstalled');
  });
});

// On Chrome startup
chrome.runtime.onStartup.addListener(() => {
  setupAlarms();
  loadState().then(async () => {
    checkDailyReset();
    await ensureLoopRunning('onStartup');
  });
});

// Also handle service worker wakeup — ensure alarms exist and resume if needed
setupAlarms();
loadState().then(async () => {
  await checkMissedResume();
  await ensureLoopRunning('serviceWorkerWakeup');
});

// ============================================================
// DYNAMIC ICON — Blue filled on LinkedIn, outline elsewhere
// ============================================================

function updateIcon(url) {
  const isLinkedIn = url && url.includes('linkedin.com');
  const suffix = isLinkedIn ? '' : '-outline';
  chrome.action.setIcon({
    path: {
      16: `icon16${suffix}.png`,
      48: `icon48${suffix}.png`,
      128: `icon128${suffix}.png`
    }
  });
}

// Update icon when active tab changes
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateIcon(tab.url);
  } catch (e) {}
});

// Update icon when tab URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.active) {
    updateIcon(changeInfo.url);
  }
});

// Set initial icon
chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
  if (tabs[0]) updateIcon(tabs[0].url);
});

