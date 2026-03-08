// CS-P1-002 SE-005: Dashboard inline scripts extracted for CSP compliance
// Consolidates: pdfjs-config, preload-chunks, feedback-tabs, market-intel, a11y

// --- PDF.js worker config (was inline at line 20) ---
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// --- CS-016: Preload keywords+location chunk after initial render (was inline at line 28) ---
window.addEventListener('load', function() {
  if (typeof bjPreloadChunks === 'function') bjPreloadChunks(['keywords']);
});

// --- Feedback tab switching (was inline at line 3513) ---
function switchFeedbackTab(tab) {
  document.querySelectorAll('.feedback-panel').forEach(function(p) { p.style.display = 'none'; p.classList.remove('active'); });
  document.querySelectorAll('#page-feedback .admin-tab').forEach(function(b) { b.classList.remove('active'); });
  var panel = document.getElementById('fb-panel-' + tab);
  if (panel) { panel.style.display = ''; panel.classList.add('active'); }
  var btn = document.getElementById('fb-tab-' + tab);
  if (btn) btn.classList.add('active');
  // Load Canny when switching to features/bugs
  if ((tab === 'features' || tab === 'bugs') && typeof switchCannyBoard === 'function') {
    switchCannyBoard(tab);
  }
  // Load surveys when switching to surveys tab
  if (tab === 'surveys' && typeof loadSurveyData === 'function') {
    loadSurveyData();
  }
}

// Cohort select-all checkbox
document.addEventListener('DOMContentLoaded', function() {
  var selectAll = document.getElementById('cohort-select-all');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      var checked = this.checked;
      document.querySelectorAll('.cohort-row-cb').forEach(function(cb) { cb.checked = checked; });
      if (typeof updateCohortCharts === 'function') updateCohortCharts();
    });
  }
});

// --- Market Intelligence Cards (was inline at line 3658) ---
(function(){
  var SUPABASE_URL = window.SUPABASE_URL || 'https://qojhagupdnbtomfoxnsf.supabase.co';
  var dismissed = localStorage.getItem('bj_insights_dismissed');
  if (dismissed && (Date.now() - parseInt(dismissed)) < 86400000) return; // dismissed today

  var section = document.getElementById('insight-section');
  var grid = document.getElementById('insight-grid');
  if (!section || !grid) return;

  var dismissedIds = JSON.parse(localStorage.getItem('bj_insights_dismissed_ids') || '[]');
  var catColors = {salary:'#22c55e',location:'#3b82f6',remote:'#8b5cf6',company:'#f97316',trend:'#14b8a6',milestone:'#eab308'};
  var pillBg = {salary:'#dcfce7',location:'#dbeafe',remote:'#f3e8ff',company:'#ffedd5',trend:'#ccfbf1',milestone:'#fef9c3'};
  var pillFg = {salary:'#166534',location:'#1e40af',remote:'#6b21a8',company:'#9a3412',trend:'#115e59',milestone:'#854d0e'};

  fetch('/content-api/merch-dashboard')
    .then(function(r){ return r.json(); })
    .then(function(cards){
      cards = cards.filter(function(c){ return dismissedIds.indexOf(c.id) === -1; });
      if (!cards.length) return;
      section.style.display = 'block';
      grid.innerHTML = cards.map(function(c){
        var bg = pillBg[c.category] || '#f3f4f6';
        var fg = pillFg[c.category] || '#374151';
        return '<div class="insight-card-widget" style="position:relative;padding:12px;background:var(--bg-page);border:1px solid var(--border);border-radius:6px" data-id="'+c.id+'">'
          + '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;background:'+bg+';color:'+fg+'">'+c.category+'</span>'
          + '<button class="insight-card-dismiss" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px" title="Dismiss">&times;</button>'
          + '<div style="margin:8px 0 4px;font-size:13px;font-weight:600;line-height:1.3;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+c.headline+'</div>'
          + (c.key_stat ? '<div style="font-size:15px;font-weight:700;color:var(--accent);margin-bottom:6px">'+c.key_stat+'</div>' : '')
          + '<a href="/blog/'+c.slug+'" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none">Read more &rarr;</a>'
          + '</div>';
      }).join('');

      // Dismiss all
      document.getElementById('insight-dismiss-all').onclick = function(){
        section.style.display = 'none';
        localStorage.setItem('bj_insights_dismissed', String(Date.now()));
      };
      // Dismiss individual
      grid.addEventListener('click', function(e){
        var btn = e.target.closest('.insight-card-dismiss');
        if (!btn) return;
        var card = btn.closest('.insight-card-widget');
        var id = parseInt(card.dataset.id);
        dismissedIds.push(id);
        localStorage.setItem('bj_insights_dismissed_ids', JSON.stringify(dismissedIds));
        card.remove();
        if (!grid.children.length) section.style.display = 'none';
      });
    })
    .catch(function(e){ console.log('[Insights] Load error:', e); });
})();

// --- CS-007: CX-03 — Dashboard Accessibility (was inline at line 3713) ---
(function() {
  // 1. Add role="button" and tabindex="0" to all div.nav-item elements
  document.querySelectorAll('.nav-item:not(a)').forEach(function(item) {
    if (item.tagName === 'DIV') {
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      var label = item.querySelector('span');
      if (label) item.setAttribute('aria-label', label.textContent.trim());
    }
  });

  // 2. Keyboard Enter/Space activates nav items
  document.querySelectorAll('.nav-item[role="button"]').forEach(function(item) {
    item.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        item.click();
      }
    });
  });

  // 3. Add aria-label to buttons missing them
  var logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn && !logoutBtn.getAttribute('aria-label')) logoutBtn.setAttribute('aria-label', 'Log out');

  // 3b. Logout handler — must live in shell/inline, not deferred chunk
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      if (window.posthog) {
        try { posthog.reset(); } catch (_) { /* reset must never block logout */ }
      }
      if (typeof sb !== 'undefined') await sb.auth.signOut();
      window.location.href = '/';
    });
  }

  // 4. Focus trap utility
  function trapFocus(container) {
    container.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      var focusable = container.querySelectorAll('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
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
  }

  // 5. Focus trap on job modal
  var jobModal = document.getElementById('job-modal-overlay');
  if (jobModal) trapFocus(jobModal);

  // 6. Focus trap on feedback modal
  var fbModal = document.getElementById('feedback-modal');
  if (fbModal) trapFocus(fbModal);

  // 7. Escape key closes any open modal
  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (jobModal && jobModal.style.display !== 'none') {
      if (typeof closeJobModal === 'function') closeJobModal();
    }
    if (fbModal && fbModal.classList.contains('open')) {
      if (typeof closeFeedback === 'function') closeFeedback();
    }
  });

  // 8. Patch openJobModal/closeJobModal for focus return
  var _jobModalTrigger = null;
  var _origOpenJobModal = window.openJobModal;
  if (typeof _origOpenJobModal === 'function') {
    window.openJobModal = function() {
      _jobModalTrigger = document.activeElement;
      _origOpenJobModal.apply(this, arguments);
      jobModal.setAttribute('aria-hidden', 'false');
      setTimeout(function() {
        var closeBtn = jobModal.querySelector('.job-modal-close');
        if (closeBtn) closeBtn.focus();
      }, 50);
    };
  }
  var _origCloseJobModal = window.closeJobModal;
  if (typeof _origCloseJobModal === 'function') {
    window.closeJobModal = function(e) {
      _origCloseJobModal.apply(this, arguments);
      jobModal.setAttribute('aria-hidden', 'true');
      if (_jobModalTrigger && _jobModalTrigger.focus) {
        _jobModalTrigger.focus();
        _jobModalTrigger = null;
      }
    };
  }

  // 9. Add skip-to-content link
  var skip = document.createElement('a');
  skip.href = '#main-content';
  skip.className = 'sr-only';
  skip.textContent = 'Skip to main content';
  skip.style.cssText = 'position:absolute;top:-40px;left:0;background:#fff;color:#000;padding:8px;z-index:100;font-size:14px;';
  skip.addEventListener('focus', function() { skip.style.top = '0'; });
  skip.addEventListener('blur', function() { skip.style.top = '-40px'; });
  document.body.insertBefore(skip, document.body.firstChild);

  // 10. Mark the main content area
  var content = document.querySelector('.main');
  if (content) content.setAttribute('id', 'main-content');
})();
