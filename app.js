// app.js — Brilliant Jobs landing page
const SUPABASE_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ---- Modal ----
function openModal(tab) {
  $('#auth-modal').classList.add('active');
  if (tab === 'signup') {
    $$('.auth-tab')[1].click();
    $('#modal-title').textContent = 'Get early access';
    $('#modal-sub').textContent = 'Create your account';
  } else {
    $$('.auth-tab')[0].click();
    $('#modal-title').textContent = 'Welcome back';
    $('#modal-sub').textContent = 'Log in to your account';
  }
}
function closeModal() { $('#auth-modal').classList.remove('active'); }
$('#modal-close-btn').addEventListener('click', closeModal);
$('#auth-modal').addEventListener('click', function(e) { if (e.target === $('#auth-modal')) closeModal(); });
$('#nav-login-btn').addEventListener('click', function(e) { e.preventDefault(); openModal('login'); });
$('#hero-signup-btn').addEventListener('click', function() { openModal('signup'); });
$('#bottom-signup-btn').addEventListener('click', function() { openModal('signup'); });

// ---- Auth tabs ----
$$('.auth-tab').forEach(function(tab) {
  tab.addEventListener('click', function() {
    $$('.auth-tab').forEach(function(t) { t.classList.remove('active'); });
    $$('.auth-form').forEach(function(f) { f.classList.remove('active'); });
    tab.classList.add('active');
    $('#form-' + tab.dataset.form).classList.add('active');
    $('#modal-title').textContent = tab.dataset.form === 'signup' ? 'Get early access' : 'Welcome back';
    $('#modal-sub').textContent = tab.dataset.form === 'signup' ? 'Create your account' : 'Log in to your account';
    $$('.msg').forEach(function(m) { m.className = 'msg'; });
  });
});

function showMsg(id, text, type) { var el = $(id); el.innerHTML = text; el.className = 'msg ' + type; }
function extractSlug(url) { var m = url.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/); return m ? m[1] : null; }

// ---- Password toggles ----
$$('.pw-toggle').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var inp = $('#' + btn.dataset.target);
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
  });
});

// LinkedIn URL field - cursor to end on focus
$('#signup-linkedin').addEventListener('focus', function() {
  var len = this.value.length;
  var self = this;
  setTimeout(function() { self.setSelectionRange(len, len); }, 0);
});

// ---- Login ----
$('#login-btn').addEventListener('click', async function() {
  var email = $('#login-email').value.trim();
  var password = $('#login-password').value;
  if (!email || !password) { showMsg('#login-msg', 'Email and password required.', 'error'); return; }
  $('#login-btn').disabled = true;
  $('#login-btn').textContent = 'Logging in...';
  try {
    var result = await sb.auth.signInWithPassword({ email: email, password: password });
    if (result.error) {
      if (result.error.message && result.error.message.indexOf('Invalid login credentials') !== -1) {
        showMsg('#login-msg', 'Invalid email or password.', 'error');
      } else if (result.error.message && result.error.message.indexOf('Email not confirmed') !== -1) {
        showMsg('#login-msg', 'Check your email and click the confirmation link first.', 'error');
      } else {
        throw result.error;
      }
      return;
    }
    showLoggedIn(result.data.user);
  } catch (e) {
    showMsg('#login-msg', e.message || 'Login failed.', 'error');
  } finally {
    $('#login-btn').disabled = false;
    $('#login-btn').textContent = 'Log In';
  }
});

// ---- Signup ----
$('#signup-btn').addEventListener('click', async function() {
  var email = $('#signup-email').value.trim();
  var password = $('#signup-password').value;
  var linkedinUrl = $('#signup-linkedin').value.trim();
  var emailOptin = $('#signup-optin').checked;
  if (!email || !password || !linkedinUrl) { showMsg('#signup-msg', 'All fields are required.', 'error'); return; }
  if (password.length < 6) { showMsg('#signup-msg', 'Password must be at least 6 characters.', 'error'); return; }
  var slug = extractSlug(linkedinUrl);
  if (!slug) { showMsg('#signup-msg', 'Enter a valid LinkedIn profile URL.', 'error'); return; }
  $('#signup-btn').disabled = true;
  $('#signup-btn').textContent = 'Creating account...';
  try {
    var result = await sb.auth.signUp({ email: email, password: password });
    if (result.error) {
      if (result.error.message && (result.error.message.indexOf('already registered') !== -1 || result.error.message.indexOf('already been registered') !== -1)) {
        showMsg('#signup-msg', 'Account already exists. Log in instead.', 'error');
      } else {
        throw result.error;
      }
      return;
    }
    if (result.data.user && result.data.user.identities && result.data.user.identities.length === 0) {
      showMsg('#signup-msg', 'Account already exists.', 'error');
      return;
    }
    await sb.from('profiles').update({ linkedin_slug: slug, linkedin_url: linkedinUrl, email_optin: emailOptin }).eq('id', result.data.user.id);
    showMsg('#signup-msg', 'Account created! Check your email to confirm, then log in.', 'success');
    setTimeout(function() {
      $$('.auth-tab')[0].click();
      $('#login-email').value = email;
    }, 4000);
  } catch (e) {
    showMsg('#signup-msg', e.message || 'Signup failed.', 'error');
  } finally {
    $('#signup-btn').disabled = false;
    $('#signup-btn').textContent = 'Create Account';
  }
});

// ---- Forgot password ----
$('#forgot-trigger').addEventListener('click', function() { $('#forgot-section').classList.toggle('active'); });
$('#forgot-btn').addEventListener('click', async function() {
  var email = $('#login-email').value.trim();
  if (!email) { showMsg('#forgot-msg', 'Enter your email above first.', 'error'); return; }
  $('#forgot-btn').disabled = true;
  try {
    var result = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (result.error) throw result.error;
    showMsg('#forgot-msg', 'Reset email sent!', 'success');
  } catch (e) {
    showMsg('#forgot-msg', e.message || 'Failed.', 'error');
  } finally {
    $('#forgot-btn').disabled = false;
  }
});

// ---- Logout ----
$('#logout-btn').addEventListener('click', async function() {
  var email = $('#li-email').textContent;
  await sb.auth.signOut();
  $('#logged-in-view').classList.remove('active');
  $('#auth-forms').style.display = 'block';
  $('#login-email').value = email;
  $('#login-password').value = '';
  $$('.msg').forEach(function(m) { m.className = 'msg'; });
  $$('.auth-tab')[0].click();
  closeModal();
});

// ---- Logged in state ----
async function showLoggedIn(user) {
  $('#auth-forms').style.display = 'none';
  $('#logged-in-view').classList.add('active');
  $('#li-email').textContent = user.email;
  try {
    var result = await sb.from('profiles').select('approved').eq('id', user.id).single();
    if (result.data && result.data.approved) {
      $('#li-pending').style.display = 'none';
      $('#li-approved').style.display = 'block';
      setTimeout(function() { window.location.href = '/dashboard'; }, 1500);
    } else {
      $('#li-pending').style.display = 'block';
      $('#li-approved').style.display = 'none';
    }
  } catch (e) { reportError("app", e); }
  try {
    var sess = await sb.auth.getSession();
    if (sess.data.session) {
      window.postMessage({
        type: 'LINKEDIN_TOOL_AUTH',
        accessToken: sess.data.session.access_token,
        refreshToken: sess.data.session.refresh_token,
        userId: user.id,
        email: user.email
      }, '*');
    }
  } catch (e) { reportError("app", e); }
}

// ---- Session check on load ----
(async function() {
  var sess = await sb.auth.getSession();
  if (sess.data.session && sess.data.session.user) {
    openModal('login');
    showLoggedIn(sess.data.session.user);
  }
  if (new URLSearchParams(window.location.search).get('pending') === '1') openModal('login');
  if (window.location.hash === '#signup') openModal('signup');
})();

// ---- Scroll animations ----
var obs = new IntersectionObserver(function(entries) {
  entries.forEach(function(e) { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1 });
$$('.fade-up').forEach(function(el) { obs.observe(el); });

// ---- Smooth scroll for anchor links ----
$$('a[href^="#"]').forEach(function(link) {
  link.addEventListener('click', function(e) {
    var target = document.querySelector(link.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// ---- Nav background on scroll ----
var nav = $('.site-nav');
if (nav) {
  window.addEventListener('scroll', function() {
    if (window.scrollY > 20) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });
}
