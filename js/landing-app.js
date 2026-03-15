/* CS-018: Extracted from inline <script> in index.html */
document.addEventListener('DOMContentLoaded', function() {
    // ============================================================
    // SUPABASE — LAZY LOADED
    // ============================================================
    const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
    let sb = null;
    let _sbLoading = null;
    function loadSupabase() {
      if (sb) return Promise.resolve(sb);
      if (_sbLoading) return _sbLoading;
      _sbLoading = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/js/vendor/supabase.min.js';
        s.onload = () => {
          sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
          resolve(sb);
        };
        s.onerror = () => reject(new Error('Failed to load Supabase'));
        document.head.appendChild(s);
      });
      return _sbLoading;
    }

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // ============================================================
    // RETURNING USER DETECTION
    // ============================================================
    const isReturning = document.cookie.includes('bj_returning');
    if (isReturning) {
      $('#nav-login-btn').textContent = 'Log In';
      $('#hero-signup-btn').textContent = 'Go to Dashboard';
      $('#bottom-signup-btn').textContent = 'Go to Dashboard';
    } else {
      $('#nav-login-btn').textContent = 'Sign Up';
      $('#hero-signup-btn').textContent = 'Start Free';
      $('#bottom-signup-btn').textContent = 'Start Free';
    }

    // ============================================================
    // MODAL
    // ============================================================
    // CS-007: CX-04 — Track element that opened modal for focus return
    var _modalTrigger = null;
    window.openModal = function openModal(tab) {
      _modalTrigger = document.activeElement;
      var modal = $('#auth-modal');
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
      switchTab(tab || 'login');
      // CS-007: Focus first input in modal after brief delay for render
      setTimeout(function() {
        var firstInput = modal.querySelector('input:not([type="hidden"])');
        if (firstInput) firstInput.focus();
      }, 50);
    }
    window.closeModal = function closeModal() {
      var modal = $('#auth-modal');
      modal.classList.remove('active');
      modal.setAttribute('aria-hidden', 'true');
      // CS-007: Return focus to trigger element
      if (_modalTrigger && _modalTrigger.focus) {
        _modalTrigger.focus();
        _modalTrigger = null;
      }
    }
    // CS-007: CX-04 — Escape key closes modal
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && $('#auth-modal').classList.contains('active')) {
        closeModal();
      }
    });
    // CS-007: CX-04 — Focus trap in auth modal
    $('#auth-modal').addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      var focusable = this.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
      var visible = Array.prototype.filter.call(focusable, function(el) {
        return el.offsetParent !== null && !el.disabled;
      });
      if (visible.length === 0) return;
      var first = visible[0], last = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    });

    // ============================================================
    // SIGNUP TIMING
    // ============================================================
    let signupStartedAt = null;

    function switchTab(form) {
      $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.form === form));
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      if (form === 'forgot') { $$('.auth-tabs')[0].style.display = 'none'; }
      else { $$('.auth-tabs')[0].style.display = ''; }
      $(`#form-${form}`).classList.add('active');
      if (form === 'login') {
        $('#modal-title').textContent = 'Welcome back';
        $('#modal-sub').textContent = 'Log in to your account';
      } else if (form === 'forgot') {
        $('#modal-title').textContent = 'Reset your password';
        $('#modal-sub').textContent = 'We\'ll send you a reset link';
      } else {
        $('#modal-title').textContent = 'Get early access';
        $('#modal-sub').textContent = 'Create your free account';
        if (!signupStartedAt) signupStartedAt = Date.now();
      }
    }

    $$('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.form));
    });

    $('#modal-close-btn').addEventListener('click', closeModal);
    $('#auth-modal').addEventListener('click', e => { if (e.target === $('#auth-modal')) closeModal(); });
    $('#nav-login-btn').addEventListener('click', (e) => { e.preventDefault(); openModal(isReturning ? 'login' : 'signup'); });
    $('#hero-signup-btn').addEventListener('click', () => openModal(isReturning ? 'login' : 'signup'));
    $('#bottom-signup-btn').addEventListener('click', () => openModal(isReturning ? 'login' : 'signup'));

    // Returning variant CTAs
    var retSignup = document.getElementById('hero-signup-ret');
    if (retSignup) retSignup.addEventListener('click', () => openModal('signup'));
    var retPreview = document.getElementById('hero-preview-ret');
    if (retPreview) retPreview.addEventListener('click', () => {
      document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth' });
    });
    // Lapsed nav login
    var lapsedLogin = document.getElementById('nav-login-btn-lapsed');
    if (lapsedLogin) lapsedLogin.addEventListener('click', (e) => { e.preventDefault(); openModal('login'); });

    $$('.price-btn').forEach(btn => {
      btn.addEventListener('click', () => openModal('signup'));
    });

    $$('.pw-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(`#${btn.dataset.target}`);
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        btn.textContent = isPass ? 'Hide' : 'Show';
      });
    });

    // ============================================================
    // FORGOT PASSWORD
    // ============================================================
    $('#forgot-trigger').addEventListener('click', () => {
      switchTab('forgot');
    });

    $('#forgot-send-btn').addEventListener('click', async () => {
      await loadSupabase();
      const email = $('#forgot-email').value.trim();
      const msgEl = $('#forgot-send-msg');
      msgEl.className = 'msg'; msgEl.style.display = 'none';
      if (!email) {
        msgEl.className = 'msg error'; msgEl.textContent = 'Enter your email above first.'; return;
      }
      $('#forgot-send-btn').disabled = true;
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/dashboard'
      });
      $('#forgot-send-btn').disabled = false;
      if (error) { msgEl.className = 'msg error'; msgEl.textContent = error.message; }
      else { msgEl.className = 'msg success'; msgEl.textContent = 'Password reset email sent. Check your inbox.'; }
    });

    // ============================================================
    // SHOW MESSAGE
    // ============================================================
    function showMsg(id, text, type) {
      const el = $(`#${id}`);
      el.className = `msg ${type}`;
      el.style.display = '';
      el.textContent = text;
    }

    // ============================================================
    // LOGIN
    // ============================================================
    $('#login-btn').addEventListener('click', async () => {
      await loadSupabase();
      const email = $('#login-email').value.trim();
      const password = $('#login-password').value;
      const msgEl = $('#login-msg');
      msgEl.className = 'msg'; msgEl.style.display = 'none';

      if (!email || !password) { showMsg('login-msg', 'Fill in all fields.', 'error'); return; }

      $('#login-btn').disabled = true;
      $('#login-btn').textContent = 'Logging in...';

      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      $('#login-btn').disabled = false;
      $('#login-btn').textContent = 'Log In';

      if (error) { showMsg('login-msg', error.message, 'error'); return; }

      showLoggedIn(data.user);
    });

    // ============================================================
    // SIGNUP (registration locked — form empty, guard against null)
    // ============================================================
    var signupBtn = $('#signup-btn');
    if (signupBtn) signupBtn.addEventListener('click', async () => {
      await loadSupabase();
      var msgEl = $('#signup-msg');
      msgEl.className = 'msg'; msgEl.style.display = 'none';

      try {
        var fullName = $('#signup-name').value.trim();
        var email = $('#signup-email').value.trim();
        var password = $('#signup-password').value;
        var linkedin = $('#signup-linkedin').value.trim();
        var optin = $('#signup-optin').checked;

        if (!fullName) { showMsg('signup-msg', 'Please enter your full name.', 'error'); return; }
        if (!email || !password) { showMsg('signup-msg', 'Fill in all fields.', 'error'); return; }
        if (password.length < 6) { showMsg('signup-msg', 'Password must be at least 6 characters.', 'error'); return; }

        var elapsedSeconds = signupStartedAt ? Math.round((Date.now() - signupStartedAt) / 1000) : 0;

        $('#signup-btn').disabled = true;
        $('#signup-btn').textContent = 'Creating account...';

        var refCode = window.bjReferral ? window.bjReferral.getCode() : '';
        var refSource = window.bjReferral ? window.bjReferral.getSource() : '';

        var result = await sb.auth.signUp({
          email: email, password: password,
          options: {
            data: {
              full_name: fullName,
              linkedin_url: linkedin,
              marketing_optin: optin,
              signup_elapsed_seconds: elapsedSeconds,
              referral_code: refCode,
              referral_source: refSource
            }
          }
        });

        var data = result.data;
        var error = result.error;

        if (error) {
          $('#signup-btn').disabled = false;
          $('#signup-btn').textContent = 'Create Account';
          showMsg('signup-msg', error.message, 'error');
          return;
        }

        if (data.user && data.user.identities && data.user.identities.length === 0) {
          $('#signup-btn').disabled = false;
          $('#signup-btn').textContent = 'Create Account';
          showMsg('signup-msg', 'An account with this email already exists. Try logging in.', 'error');
          return;
        }

        if (data.user && data.user.id) {
          triggerValidation(data.user.id);
          // IX-DA-002: Link referral attribution after signup
          if (refCode) {
            linkReferral(data.user.id, refCode, refSource);
          }
        }

        var sessionCheck = await sb.auth.getSession();
        if (sessionCheck.data && sessionCheck.data.session) {
          showLoggedIn(data.user);
          return;
        }

        $('#signup-btn').disabled = false;
        $('#signup-btn').textContent = 'Create Account';
        showMsg('signup-msg', 'Account created! Check your email to confirm, then log in.', 'success');
        signupStartedAt = null;

      } catch (e) {
        bjError('signup_error', e);
        reportError('landing_app', e);
        console.error('[BJ] Signup error:', e);
        $('#signup-btn').disabled = false;
        $('#signup-btn').textContent = 'Create Account';
        showMsg('signup-msg', 'Something went wrong: ' + e.message, 'error');
      }
    });

    // ============================================================
    // VALIDATION
    // ============================================================
    async function triggerValidation(profileId) {
      try {
        const res = await fetch(SUPABASE_URL + '/functions/v1/validate-signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({ profile_id: profileId }),
        });
        const result = await res.json();
        console.log('[BJ] Signup validation:', result.approved ? 'approved' : 'provisional', result.reason);
      } catch (e) {
        bjError('validation_call_failed', e);
        reportError('landing_app', e);
        console.log('[BJ] Validation call failed (will default to manual review):', e.message);
      }
    }

    // IX-DA-002: Link referral after signup — fire-and-forget
    async function linkReferral(userId, code, source) {
      try {
        await fetch(SUPABASE_URL + '/functions/v1/referral-lifecycle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
          body: JSON.stringify({ type: 'referee_signup', referee_id: userId, metadata: { referral_code: code, source: source } }),
        });
        console.log('[BJ] Referral linked:', code, '→', userId);
      } catch (e) {
        bjError('referral_link_failed', e);
      }
    }

    // ============================================================
    // LOGGED IN VIEW
    // ============================================================
    async function showLoggedIn(user) {
      // CS-018: PostHog identity bridge — merge anonymous landing session with authenticated user
      if (window.posthog && user && user.id) {
        try {
          posthog.identify(user.id, {
            email: user.email,
            created_at: user.created_at,
            surface: 'landing'
          });
        } catch (e) { bjError('posthog_identify_landing', e); }
      }
      document.cookie = 'bj_returning=1; max-age=31536000; path=/; SameSite=Lax; Secure';
      await loadSupabase();
      $('#auth-forms').style.display = 'none';
      const loggedView = $('#logged-in-view');
      loggedView.classList.add('active');
      $('#li-email').textContent = user.email;

      // CS-014: FIX-15c — profile check with 10s timeout + 1 retry
      async function profileCheckWithTimeout(userId, attempt) {
        attempt = attempt || 1;
        var controller = new AbortController();
        var timeout = setTimeout(function() { controller.abort(); }, 10000);
        try {
          var profileResult = await sb.from('profiles').select('approved').eq('id', userId).single().abortSignal(controller.signal);
          clearTimeout(timeout);
          if (profileResult.data && profileResult.data.approved === true) {
            window.location.href = '/dashboard';
            return;
          }
        } catch (e) {
          clearTimeout(timeout);
          bjError('profile_check_error', e, { attempt: attempt });
          reportError('landing_app', e);
          console.error('Profile check error (attempt ' + attempt + '):', e);
          if (attempt < 2) {
            return profileCheckWithTimeout(userId, attempt + 1);
          }
        }
      }
      await profileCheckWithTimeout(user.id);

      try {
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          window.postMessage({
            type: 'LINKEDIN_TOOL_AUTH',
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            userId: user.id,
            email: user.email
          }, window.location.origin);
        }
      } catch (e) { bjError('extension_auth_post', e); }
    }

    // ============================================================
    // LOGOUT
    // ============================================================
    $('#logout-btn').addEventListener('click', async () => {
      // CS-P1-007 DS1-4: Reset PostHog identity on logout
      if (window.posthog) { try { posthog.reset(); } catch (_) { /* posthog may not be loaded */ } }
      await loadSupabase();
      await sb.auth.signOut();
      $('#logged-in-view').classList.remove('active');
      $('#auth-forms').style.display = 'block';
      switchTab('login');
    });

    // ============================================================
    // CHECK SESSION ON LOAD
    // ============================================================
    (async () => {
      await loadSupabase();
      const { data: { session } } = await sb.auth.getSession();
      if (session?.user) {
        openModal('login');
        showLoggedIn(session.user);
      }
      if (new URLSearchParams(window.location.search).get('pending') === '1') {
        openModal('login');
      }
      if (window.location.hash === '#signup') {
        openModal('signup');
      }
    })();

    // ============================================================
    // SCROLL ANIMATIONS
    // ============================================================
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('visible');
      });
    }, { threshold: 0.1 });

    $$('.fade-up').forEach(el => observer.observe(el));


        // ============================================================
    // LIVE STATS — cached in localStorage (1hr TTL)
    // ============================================================
    (async function loadLiveStats() {
      const CACHE_KEY = 'bj_lp_stats';
      const CACHE_TTL = 60 * 60 * 1000;
      function applyStats(stats) {
        if (stats.jobs != null) {
          document.getElementById('lp-active-jobs').textContent = stats.jobs.toLocaleString();
          const heroJobs = document.getElementById('lp-hero-jobs');
          if (heroJobs) heroJobs.textContent = (Math.floor(stats.jobs / 1000) * 1000).toLocaleString() + '+';
        }
        // "companies hiring now" = distinct companies with active jobs (~8.7K)
        if (stats.companies != null) {
          var hiringDisplay = stats.companies.toLocaleString() + '+';
          // Stats bar: Companies Hiring Now
          var hiringStatEl = document.getElementById('lp-companies-hiring-stat');
          if (hiringStatEl) hiringStatEl.textContent = hiringDisplay;
          // Hero sub inline span
          var hiringHeroEl = document.getElementById('lp-companies-hiring');
          if (hiringHeroEl) hiringHeroEl.textContent = hiringDisplay;
          var stepComp = document.getElementById('lp-step-companies');
          if (stepComp) stepComp.textContent = hiringDisplay;
        }
        // "career pages monitored" = total companies in ats_companies (~39K)
        // Used in stats bar, hero sub, and all data-stat="total-pages" spans
        var totalDisplay = stats.totalCompanies != null
          ? (Math.floor(stats.totalCompanies / 1000) * 1000).toLocaleString() + '+'
          : null;
        if (totalDisplay) {
          // Stats bar: Career Pages Monitored
          var lpCompEl = document.getElementById('lp-companies');
          if (lpCompEl) lpCompEl.textContent = totalDisplay;
          // Hydrate all elements with data-stat="total-pages" (hero, comparison table, FAQ, etc.)
          document.querySelectorAll('[data-stat="total-pages"]').forEach(function(el) {
            el.textContent = totalDisplay;
          });
          var miComp = document.getElementById('lp-mi-companies');
          if (miComp) miComp.textContent = totalDisplay;
        }
        // Hydrate merchandising placeholders
        document.querySelectorAll('[data-merch-stat="jobs"]').forEach(function(el) {
          el.textContent = (Math.floor(stats.jobs / 1000) * 1000).toLocaleString() + '+';
        });
        document.querySelectorAll('[data-merch-stat="companies"]').forEach(function(el) {
          el.textContent = totalDisplay || stats.companies.toLocaleString() + '+';
        });
        // Market Intelligence cards
        var miJobs = document.getElementById('lp-mi-jobs');
        if (miJobs) miJobs.textContent = (Math.floor(stats.jobs / 1000)).toLocaleString() + 'K+';
        if (stats.metros != null) {
          document.getElementById('lp-metros').textContent = stats.metros.toLocaleString();
        }
        // CS-P1-008 (LS1-10): Sync JSON-LD structured data with live counts
        // Uses totalCompanies for "career pages" references, jobs for job count references
        var tcDisplay = stats.totalCompanies != null ? (Math.floor(stats.totalCompanies / 1000) * 1000).toLocaleString() + '+' : null;
        try {
          var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
          ldScripts.forEach(function(script) {
            try {
              var ld = JSON.parse(script.textContent);
              var changed = false;
              if (ld['@graph']) {
                ld['@graph'].forEach(function(node) {
                  if (node['@type'] === 'SoftwareApplication' && stats.jobs != null) {
                    var rounded = (Math.floor(stats.jobs / 1000) * 1000).toLocaleString() + '+';
                    node.description = node.description.replace(/[\d,]+\+?\s*jobs/, rounded + ' jobs');
                    if (tcDisplay) {
                      node.description = node.description.replace(/[\d,]+\+?\s*company/, tcDisplay + ' company');
                      var featureList = node.featureList;
                      if (featureList) {
                        for (var i = 0; i < featureList.length; i++) {
                          featureList[i] = featureList[i].replace(/[\d,]+\+?\s*company/, tcDisplay + ' company');
                        }
                      }
                    }
                    changed = true;
                  }
                  if (node['@type'] === 'Organization' && tcDisplay) {
                    node.description = node.description.replace(/[\d,]+\+?\s*company/, tcDisplay + ' company');
                    changed = true;
                  }
                  if (node['@type'] === 'FAQPage' && node.mainEntity) {
                    node.mainEntity.forEach(function(q) {
                      if (q.acceptedAnswer && q.acceptedAnswer.text) {
                        if (stats.jobs != null) {
                          q.acceptedAnswer.text = q.acceptedAnswer.text.replace(/[\d,]+\+?\s*open jobs/, (Math.floor(stats.jobs / 1000) * 1000).toLocaleString() + '+ open jobs');
                        }
                        if (tcDisplay) {
                          q.acceptedAnswer.text = q.acceptedAnswer.text.replace(/[\d,]+\+?\s*company career/, tcDisplay + ' company career');
                        }
                      }
                    });
                    changed = true;
                  }
                });
              }
              if (changed) script.textContent = JSON.stringify(ld);
            } catch (e) { /* skip malformed JSON-LD blocks */ }
          });
        } catch (e) { bjError('jsonld_sync_error', e); }
        document.querySelectorAll('.stat-num').forEach(el => {
          el.classList.remove('loading'); el.classList.add('loaded');
        });
      }
      document.querySelectorAll('.stat-num').forEach(el => el.classList.add('loading'));
      var statsRetryCount = 0;
      async function fetchLandingStats() {
        try {
          const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
          if (cached && cached.jobs != null && Date.now() - cached.ts < CACHE_TTL) {
            applyStats(cached);
            // CS-014: staleness badge — show if cache is older than 1 hour
            if (Date.now() - cached.ts > 3600000) {
              var badge = document.getElementById('stats-stale-badge');
              if (badge) badge.style.display = 'inline';
            }
            return;
          }
        } catch (e) { bjError('stats_cache_parse', e); }
        try {
          await loadSupabase();
          const { data, error } = await sb.rpc('get_landing_stats');
          if (error) throw new Error('stats fetch failed');
          // Also fetch total companies tracked (all in ats_companies, not just with open jobs)
          // Uses RPC with SECURITY DEFINER to bypass RLS (anon can't query ats_companies directly)
          var totalCo = null;
          try {
            var tcResult = await sb.rpc('get_total_company_count');
            if (tcResult && !tcResult.error && tcResult.data != null) totalCo = tcResult.data;
          } catch(e) { /* fallback: totalCompanies will be null, spans keep placeholder */ }
          const stats = { jobs: data.jobs, companies: data.companies, totalCompanies: totalCo, metros: data.metros, ts: Date.now() };
          localStorage.setItem(CACHE_KEY, JSON.stringify(stats));
          applyStats(stats);
          var badge = document.getElementById('stats-stale-badge');
          if (badge) badge.style.display = 'none';
          var retryBtn = document.getElementById('stats-retry-btn');
          if (retryBtn) retryBtn.style.display = 'none';
        } catch (e) {
          bjError('stats_fetch_error', e, { attempt: statsRetryCount + 1 });
          reportError('landing_app', e);
          console.log('[BJ] Stats fetch error:', e.message);
          document.getElementById('lp-active-jobs').textContent = '400,000+';
          document.getElementById('lp-companies').textContent = '39,000+';
          var hiringFallback = document.getElementById('lp-companies-hiring-stat');
          if (hiringFallback) hiringFallback.textContent = '8,700+';
          var hiringHeroFallback = document.getElementById('lp-companies-hiring');
          if (hiringHeroFallback) hiringHeroFallback.textContent = '8,700+';
          document.getElementById('lp-metros').textContent = '199';
          document.querySelectorAll('.stat-num').forEach(el => {
            el.classList.remove('loading'); el.classList.add('loaded');
          });
          // CS-014: retry button (max 2 retries)
          if (statsRetryCount < 2) {
            var retryBtn = document.getElementById('stats-retry-btn');
            if (retryBtn) { retryBtn.style.display = 'inline-block'; retryBtn.onclick = function() { statsRetryCount++; retryBtn.style.display = 'none'; fetchLandingStats(); }; }
          }
        }
      }
      fetchLandingStats();
    })();

    // ============================================================
    // SOCIAL PROOF — Survey results (P13-11)
    // ============================================================
    (async () => {
      const MIN_RESPONSES = 20;
      try {
        await loadSupabase();
        const { data, error } = await sb.from('survey_social_proof').select('*').single();
        if (error || !data || data.total_respondents < MIN_RESPONSES) return;

        const bar = document.getElementById('social-proof-bar');
        if (!bar) return;

        const rating = parseFloat(data.avg_rating);
        if (rating > 0) {
          const full = Math.floor(rating);
          const half = rating - full >= 0.3;
          let stars = '\u2605'.repeat(full) + (half ? '\u2605' : '') + '\u2606'.repeat(5 - full - (half ? 1 : 0));
          document.getElementById('sp-stars').textContent = stars;
          document.getElementById('sp-rating').textContent = rating.toFixed(1) + ' / 5';
        }

        document.getElementById('sp-count').textContent = data.total_respondents.toLocaleString();

        const totalNps = (data.promoters || 0) + (data.passives || 0) + (data.detractors || 0);
        if (totalNps > 0) {
          const recommendPct = Math.round(((data.promoters + data.passives) / totalNps) * 100);
          document.getElementById('sp-nps-pct').textContent = recommendPct + '%';
        } else {
          document.getElementById('sp-nps-badge').style.display = 'none';
        }

        bar.classList.remove('hidden');
      } catch (e) {
        bjError('social_proof_error', e);
        reportError('landing_app', e);
        console.log('[BJ] Social proof skipped:', e.message);
      }
    })();

    // ============================================================
    // PREVIEW — Try Before You Buy
    // ============================================================
    let previewToken = null;

    const previewGoBtn = document.getElementById('preview-go');
    if (previewGoBtn) {
      previewGoBtn.addEventListener('click', async () => {
        const keyword = $('#preview-keyword').value.trim();
        const location = $('#preview-location').value.trim();
        const remote = document.getElementById('preview-remote').checked;

        if (!keyword && !location) return;

        previewGoBtn.disabled = true;
        previewGoBtn.textContent = 'Searching...';

        if (window.posthog) posthog.capture('preview_filter_submitted', {
          has_keyword: !!keyword, has_location: !!location, remote_only: remote
        });

        try {
          const res = await fetch(SUPABASE_URL + '/functions/v1/preview-jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, location, remote, session_token: previewToken })
          });
          const data = await res.json();

          if (data.error === 'rate_limited') {
            document.getElementById('preview-filters').style.display = 'none';
            document.getElementById('preview-results').style.display = 'none';
            document.getElementById('preview-locked').style.display = '';
            if (window.posthog) posthog.capture('preview_rate_limited', { queries_used: 2 });
            return;
          }

          previewToken = data.session_token;

          // Populate stat cards
          document.getElementById('pv-total').textContent = data.total.toLocaleString();
          document.getElementById('pv-salary').textContent = data.median_salary ? '$' + Math.round(data.median_salary / 1000) + 'K' : 'N/A';
          document.getElementById('pv-remote').textContent = data.remote_pct + '%';
          document.getElementById('pv-companies').textContent = data.companies.toLocaleString();

          // Populate teaser titles
          const titlesEl = document.getElementById('pv-titles');
          titlesEl.innerHTML = DOMPurify.sanitize(data.titles.map(t =>
            '<div class="preview-title-row"><span class="preview-title">' + t + '</span><span class="preview-company">Sign up to reveal</span></div>'
          ).join(''));

          document.getElementById('pv-cta-text').textContent = 'Create your free account to see all ' + data.total.toLocaleString() + ' jobs';
          document.getElementById('preview-results').style.display = '';

          if (window.posthog) posthog.capture('preview_results_shown', {
            total_jobs: data.total, has_salary_data: !!data.median_salary,
            queries_remaining: data.queries_remaining,
            content_search_enabled: !!data.content_search_enabled
          });

          if (data.queries_remaining === 0) {
            previewGoBtn.textContent = 'No queries remaining';
            previewGoBtn.disabled = true;
          } else {
            previewGoBtn.disabled = false;
            previewGoBtn.textContent = 'Search (' + data.queries_remaining + ' left)';
          }
        } catch (e) {
          bjError('preview_error', e);
          reportError('landing_app', e);
          console.error('[BJ] Preview error:', e);
          previewGoBtn.disabled = false;
          previewGoBtn.textContent = 'Retry Search';
          // Show error state
          document.getElementById('preview-results').style.display = '';
          document.getElementById('pv-total').textContent = '—';
          document.getElementById('pv-titles').innerHTML = '<div class="preview-title-row"><span class="preview-title" style="color:var(--text-faint)">Preview temporarily unavailable. Try again shortly.</span></div>';
        }
      });
    }

    // Preview signup buttons
    ['pv-signup-btn', 'pv-locked-signup'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => {
        openModal('signup');
        if (window.posthog) posthog.capture('preview_signup_clicked');
      });
    });

    // Enter key triggers search
    ['preview-keyword', 'preview-location'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') previewGoBtn.click(); });
    });

    // ============================================================
    // HERO PREVIEW BUTTON — scroll to preview
    // ============================================================
    const heroPreviewBtn = document.getElementById('hero-preview-btn');
    if (heroPreviewBtn) {
      heroPreviewBtn.addEventListener('click', () => {
        document.getElementById('preview-section').scrollIntoView({ behavior: 'smooth' });
        if (window.posthog) posthog.capture('preview_cta_clicked');
      });
    }

    // ============================================================
    // WALKTHROUGH CAROUSEL
    // ============================================================
    const track = document.querySelector('.carousel-track');
    const dotsContainer = document.getElementById('carousel-dots');
    if (track && dotsContainer) {
      const slides = track.querySelectorAll('.carousel-slide');
      slides.forEach((_, i) => {
        const dot = document.createElement('span');
        dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
        dot.addEventListener('click', () => {
          slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        });
        dotsContainer.appendChild(dot);
      });
      const carouselObs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = [...slides].indexOf(e.target);
            dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
              d.classList.toggle('active', i === idx);
            });
          }
        });
      }, { root: track, threshold: 0.5 });
      slides.forEach(s => carouselObs.observe(s));

      // PostHog: track walkthrough swipes
      let lastSwipeTime = 0;
      track.addEventListener('scroll', () => {
        if (Date.now() - lastSwipeTime > 2000) {
          lastSwipeTime = Date.now();
          if (window.posthog) posthog.capture('walkthrough_swiped');
        }
      });
    }

    // Walkthrough signup + CTA
    const wBtn = document.getElementById('walkthrough-signup-btn');
    if (wBtn) wBtn.addEventListener('click', () => {
      openModal('signup');
      if (window.posthog) posthog.capture('walkthrough_cta_clicked');
    });

    // PostHog: walkthrough viewed
    const wtSection = document.getElementById('walkthrough');
    if (wtSection) {
      const wtObs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            if (window.posthog) posthog.capture('walkthrough_viewed');
            wtObs.disconnect();
          }
        });
      }, { threshold: 0.3 });
      wtObs.observe(wtSection);
    }

    // ============================================================
    // SMOOTH SCROLL
    // ============================================================
    document.querySelectorAll('a[href^="#"]').forEach(link => {
      link.addEventListener('click', e => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });
});

// ============================================================
// LP-RESTRUCTURE-S2: Dynamic Benefit Sections Renderer
// Fetches landing_sections from PostgREST and renders into #lp-benefit-sections.
// Orientation logic: 'auto' alternates image-right/image-left by position.
// Manual 'image-left' or 'image-right' overrides position-based alternation.
// Body text sanitized via DOMPurify (purify.min.js already loaded on page).
// ============================================================
(function initLpBenefitSections() {
  'use strict';

  var SUPABASE_URL = window.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
  var SUPABASE_ANON_KEY = window.SUPABASE_KEY || window.SUPABASE_ANON_KEY || '';

  function getVisitorSegment() {
    // Re-use landing-segment.js detection if available
    if (typeof window._bjSegment === 'string') return window._bjSegment;
    try {
      var s = localStorage.getItem('bj_segment');
      return s || 'new';
    } catch(e) { return 'new'; }
  }

  function sanitizeBodyText(raw) {
    if (!raw) return '';
    // DOMPurify is loaded as purify.min.js — available as window.DOMPurify
    var purify = window.DOMPurify;
    if (!purify) return raw.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Allow bold + links only, convert **bold** markdown
    var md = raw
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    return purify.sanitize(md, { ALLOWED_TAGS: ['strong', 'em', 'a', 'br'], ALLOWED_ATTR: ['href', 'rel'] });
  }

  function getOrientationClass(section, position) {
    var o = section.orientation || 'auto';
    if (o === 'image-left') return 'section-img-left';
    if (o === 'image-right') return 'section-img-right';
    // auto: alternate — position 0 = image-right, position 1 = image-left, etc.
    return position % 2 === 0 ? 'section-img-right' : 'section-img-left';
  }

  function renderSection(section, position) {
    var orientClass = getOrientationClass(section, position);
    var hasImage = section.image_url && section.image_url.trim().length > 0;

    var imgHtml = hasImage
      ? '<div class="lp-section-img-wrap">' +
          '<div class="lp-section-browser-frame">' +
            '<div class="lp-section-browser-dots"><span></span><span></span><span></span></div>' +
            '<img src="' + escapeAttr(section.image_url) + '" ' +
                 'alt="' + escapeAttr(section.image_alt || section.title) + '" ' +
                 'loading="lazy" class="lp-section-screenshot">' +
          '</div>' +
        '</div>'
      : '<div class="lp-section-img-wrap lp-section-img-placeholder">' +
          '<div class="lp-section-browser-frame lp-section-browser-frame--empty">' +
            '<div class="lp-section-browser-dots"><span></span><span></span><span></span></div>' +
            '<div class="lp-section-placeholder-inner">Screenshot coming soon</div>' +
          '</div>' +
        '</div>';

    var ctaHtml = section.cta_text && section.cta_url
      ? '<a href="' + escapeAttr(section.cta_url) + '" class="btn btn-primary lp-section-cta">' +
          escapeHtml(section.cta_text) + '</a>'
      : '';

    var bodyParagraphs = sanitizeBodyText(section.body_text)
      .split(/\n\n+/)
      .filter(Boolean)
      .map(function(p) { return '<p>' + p + '</p>'; })
      .join('');

    var contentHtml =
      '<div class="lp-section-content">' +
        (section.subtitle ? '<div class="lp-section-subtitle">' + escapeHtml(section.subtitle) + '</div>' : '') +
        '<h2 class="lp-section-title">' + escapeHtml(section.title) + '</h2>' +
        '<div class="lp-section-body">' + bodyParagraphs + '</div>' +
        ctaHtml +
      '</div>';

    var el = document.createElement('section');
    el.className = 'lp-benefit-section section fade-up ' + orientClass;
    el.setAttribute('data-section-id', section.id);
    el.innerHTML = orientClass === 'section-img-left'
      ? imgHtml + contentHtml
      : contentHtml + imgHtml;

    return el;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function filterBySegment(sections) {
    var segment = getVisitorSegment();
    var preview = window.location.search.indexOf('preview=true') >= 0;
    if (preview) return sections; // admin preview — show all visible
    return sections.filter(function(s) {
      return s.segment === 'all' || s.segment === segment;
    });
  }

  async function loadBenefitSections() {
    var container = document.getElementById('lp-benefit-sections');
    if (!container) return;

    try {
      var url = SUPABASE_URL + '/rest/v1/landing_sections' +
        '?is_visible=eq.true&archived_at=is.null&order=sort_order.asc';

      var res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Accept': 'application/json'
        }
      });

      if (!res.ok) {
        captureEvent('lp_sections_fetch_error', { status: res.status });
        return;
      }

      var sections = await res.json();
      sections = filterBySegment(sections);

      if (!sections.length) return; // No visible sections — container stays empty

      var fragment = document.createDocumentFragment();
      sections.forEach(function(section, idx) {
        fragment.appendChild(renderSection(section, idx));
      });
      container.appendChild(fragment);

      // Trigger fade-up observer for newly added sections
      if (window._bjFadeObserver && typeof window._bjFadeObserver.observe === 'function') {
        container.querySelectorAll('.fade-up').forEach(function(el) {
          window._bjFadeObserver.observe(el);
        });
      }

      captureEvent('lp_sections_rendered', { count: sections.length, segment: getVisitorSegment() });

    } catch(e) {
      reportError('lp_benefit_sections', e);
    }
  }

  // Run after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBenefitSections);
  } else {
    loadBenefitSections();
  }

})();
