// extension/toolbar-overlay.js — Brilliant Jobs Job Page Toolbar
// v1.0.0 / v6.98: Overlay Pipeline S4 — Toolbar Shell
// v1.1.0 / v7.00: Overlay Pipeline S6 — Match Score Badge
// v1.2.0 / v7.01: Overlay Pipeline S7 — Fraud + AI Content Score Indicators
//
// Injected by contentScript.js on job listing pages across:
// LinkedIn (/jobs/view/*), Greenhouse, Lever, Ashby, Workable, Recruitee, Indeed
//
// Renders a persistent bottom toolbar on job pages with:
//   - Job title + company (parsed from page)
//   - Pipeline stage badge (loaded from _newPipelineCache via background message)
//   - Fraud indicator: red shield if fraud_score >= 60
//   - AI content indicator: orange label if ai_content_score >= 0.7
//   - Match score badge (async, fades in — S6)
//   - Save button (writes to pipeline table via background.js → pipeline-write EF)
//   - "Already Saved" state if job exists in pipeline
//
// Session 7 scope: Read pipeline.fraud_score + pipeline.ai_content_score from
// the entry returned by bj:toolbar:getEntry (already includes columns as of v2.21.0).
// Display cached values only — no new Edge Function call.

(function () {
  'use strict';

  const TOOLBAR_ID = 'bj-job-toolbar';
  const TOOLBAR_STYLES_ID = 'bj-job-toolbar-styles';

  // ── Prevent double-injection ──────────────────────────────────
  if (document.getElementById(TOOLBAR_ID)) return;

  // ── Parse job metadata from current page ─────────────────────
  function parseJobMeta() {
    const hostname = window.location.hostname;
    const url = window.location.href;
    let title = '', company = '', platform = 'unknown';

    try {
      // LinkedIn: /jobs/view/{id}
      if (hostname.includes('linkedin.com')) {
        platform = 'linkedin';
        title = document.querySelector('.job-details-jobs-unified-top-card__job-title, h1.t-24')?.textContent?.trim() || '';
        company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name a')?.textContent?.trim() || '';
      }
      // Greenhouse
      else if (hostname.includes('greenhouse.io')) {
        platform = 'greenhouse';
        title = document.querySelector('#app_body h1.app-title, h1.job-post-name, [class*="opening-title"]')?.textContent?.trim() || document.title.split(' - ')[0].trim();
        company = document.querySelector('.company-name, [class*="company"]')?.textContent?.trim() || document.title.split(' - ').slice(-1)[0].trim();
      }
      // Lever
      else if (hostname.includes('lever.co')) {
        platform = 'lever';
        title = document.querySelector('.posting-headline h2, h2.posting-title')?.textContent?.trim() || document.title.split('·')[0].trim();
        company = document.querySelector('.posting-headline .sort-by-team, .main-header-text .posting-category')?.textContent?.trim() || window.location.pathname.split('/')[1] || '';
      }
      // Ashby
      else if (hostname.includes('ashbyhq.com')) {
        platform = 'ashby';
        title = document.querySelector('h1[data-ui="job-title"], h1.ashby-job-posting-title')?.textContent?.trim() || document.title.split('–')[0].trim();
        company = document.querySelector('[data-ui="company-name"], .ashby-company-name')?.textContent?.trim() || window.location.pathname.split('/')[1] || '';
      }
      // Workable
      else if (hostname.includes('workable.com')) {
        platform = 'workable';
        title = document.querySelector('h1[data-ui="job-title"], .job-title h1')?.textContent?.trim() || document.title.split(' - ')[0].trim();
        company = document.querySelector('.company-name, [class*="CompanyName"]')?.textContent?.trim() || document.title.split(' - ').slice(-1)[0].trim();
      }
      // Recruitee
      else if (hostname.includes('recruitee.com')) {
        platform = 'recruitee';
        title = document.querySelector('h1.job-title, h1[class*="title"]')?.textContent?.trim() || document.title.split(' - ')[0].trim();
        company = document.querySelector('.company-name, [class*="company"]')?.textContent?.trim() || hostname.split('.')[0] || '';
      }
      // Indeed
      else if (hostname.includes('indeed.com')) {
        platform = 'indeed';
        title = document.querySelector('h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]')?.textContent?.trim() || document.title.split(' - ')[0].trim();
        company = document.querySelector('[data-testid="inlineHeader-companyName"] a, .jobsearch-CompanyInfoContainer a')?.textContent?.trim() || '';
      }
    } catch (e) {
      // Silent — best effort
    }

    // Fallback to document title
    if (!title) title = document.title.split(/[-–|·]/)[0].trim();

    return { title, company, platform, url };
  }

  // ── Inject toolbar styles ─────────────────────────────────────
  function injectStyles() {
    if (document.getElementById(TOOLBAR_STYLES_ID)) return;
    const style = document.createElement('style');
    style.id = TOOLBAR_STYLES_ID;
    style.textContent = `
      #${TOOLBAR_ID} {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 2147483640;
        background: #fff;
        border-top: 2px solid #3b82f6;
        box-shadow: 0 -4px 24px rgba(0,0,0,0.10);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        gap: 12px;
        box-sizing: border-box;
        min-height: 56px;
      }
      #${TOOLBAR_ID} .bj-tb-left {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      #${TOOLBAR_ID} .bj-tb-title {
        font-weight: 600;
        font-size: 13px;
        color: #111;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 400px;
      }
      #${TOOLBAR_ID} .bj-tb-company {
        font-size: 12px;
        color: #555;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 400px;
      }
      #${TOOLBAR_ID} .bj-tb-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .bj-tb-badge {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 20px;
        background: #f0f4ff;
        color: #3b5bdb;
        border: 1px solid #c5d0fa;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      #${TOOLBAR_ID} .bj-tb-badge.bj-stage-applied { background: #ecfdf5; color: #166534; border-color: #bbf7d0; }
      #${TOOLBAR_ID} .bj-tb-badge.bj-stage-saved { background: #f0f4ff; color: #3730a3; border-color: #c7d2fe; }
      #${TOOLBAR_ID} .bj-tb-badge.bj-stage-interview { background: #faf5ff; color: #6b21a8; border-color: #e9d5ff; }
      #${TOOLBAR_ID} .bj-tb-badge.bj-stage-offer { background: #f0fdf4; color: #14532d; border-color: #86efac; }
      #${TOOLBAR_ID} .bj-tb-badge.bj-stage-rejected { background: #fef2f2; color: #991b1b; border-color: #fecaca; }
      #${TOOLBAR_ID} .bj-tb-save-btn {
        background: #3b82f6;
        color: #fff;
        border: none;
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
        white-space: nowrap;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn:hover { background: #2563eb; }
      #${TOOLBAR_ID} .bj-tb-save-btn:disabled { opacity: 0.6; cursor: default; }
      #${TOOLBAR_ID} .bj-tb-save-btn.bj-saved {
        background: #22c55e;
        cursor: default;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn.bj-saved:hover { background: #16a34a; }
      #${TOOLBAR_ID} .bj-tb-dismiss {
        background: none;
        border: none;
        color: #aaa;
        font-size: 18px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .bj-tb-dismiss:hover { color: #555; }
      #${TOOLBAR_ID} .bj-tb-logo {
        font-size: 11px;
        font-weight: 700;
        color: #3b82f6;
        letter-spacing: 0.02em;
        flex-shrink: 0;
      }

      #${TOOLBAR_ID} .bj-tb-score {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 9px;
        border-radius: 20px;
        letter-spacing: 0.03em;
        flex-shrink: 0;
        opacity: 0;
        transition: opacity 0.3s;
      }
      #${TOOLBAR_ID} .bj-tb-score.loaded { opacity: 1; }
      #${TOOLBAR_ID} .bj-tb-score.bj-score-strong { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
      #${TOOLBAR_ID} .bj-tb-score.bj-score-good   { background: #fef9c3; color: #854d0e; border: 1px solid #fde047; }
      #${TOOLBAR_ID} .bj-tb-score.bj-score-fair   { background: #fff7ed; color: #9a3412; border: 1px solid #fdba74; }
      #${TOOLBAR_ID} .bj-tb-score.bj-score-low    { background: #fef2f2; color: #991b1b; border: 1px solid #fca5a5; }
      #${TOOLBAR_ID} .bj-tb-score.bj-score-loading { background: #f3f4f6; color: #9ca3af; border: 1px solid #e5e7eb; }

      /* S7: Fraud + AI Content indicators */
      #${TOOLBAR_ID} .bj-tb-fraud {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 9px;
        border-radius: 20px;
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fca5a5;
        flex-shrink: 0;
        cursor: default;
        title: attr(data-tooltip);
      }
      #${TOOLBAR_ID} .bj-tb-ai-content {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        padding: 4px 9px;
        border-radius: 20px;
        background: #fff7ed;
        color: #9a3412;
        border: 1px solid #fdba74;
        flex-shrink: 0;
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Build toolbar DOM ─────────────────────────────────────────
  function buildToolbar(meta, pipelineEntry) {
    let el = document.getElementById(TOOLBAR_ID);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = TOOLBAR_ID;
    el.setAttribute('data-source-url', meta.url);

    const stage = pipelineEntry?.stage || null;
    const stageClass = stage ? 'bj-stage-' + stage : '';
    const stageLabel = stage ? stage.replace('_', ' ') : null;

    // S7: Fraud indicator — show if fraud_score >= 60
    const fraudScore = pipelineEntry?.fraud_score ?? null;
    const fraudLabel = pipelineEntry?.fraud_label || null;
    const showFraud = fraudScore !== null && fraudScore >= 60;

    // S7: AI content indicator — show if ai_content_score >= 0.7
    const aiScore = pipelineEntry?.ai_content_score ?? null;
    const aiLabel = pipelineEntry?.ai_content_label || null;
    const showAI = aiScore !== null && parseFloat(aiScore) >= 0.7;

    el.innerHTML = `
      <span class="bj-tb-logo">BJ</span>
      <div class="bj-tb-left">
        <div class="bj-tb-title">${escHtml(meta.title || 'Job Listing')}</div>
        ${meta.company ? `<div class="bj-tb-company">${escHtml(meta.company)}</div>` : ''}
      </div>
      <div class="bj-tb-right">
        ${stageLabel ? `<span class="bj-tb-badge ${stageClass}">${escHtml(stageLabel)}</span>` : ''}
        ${showFraud ? `<span class="bj-tb-fraud" title="Fraud risk: ${escHtml(fraudLabel || String(fraudScore))}">🛡 Fraud Risk</span>` : ''}
        ${showAI ? `<span class="bj-tb-ai-content" title="AI-generated content detected (${escHtml(aiLabel || String(aiScore))})">⚠ AI Content</span>` : ''}
        <span class="bj-tb-score bj-score-loading" id="bj-tb-score-badge">…</span>
        <button class="bj-tb-save-btn${stage ? ' bj-saved' : ''}" id="bj-tb-save-btn">
          ${stage ? '✓ ' + escHtml(stageLabel) : 'Save Job'}
        </button>
        <button class="bj-tb-dismiss" id="bj-tb-dismiss" title="Dismiss toolbar">×</button>
      </div>
    `;

    document.body.appendChild(el);

    // Save button
    const saveBtn = document.getElementById('bj-tb-save-btn');
    if (saveBtn && !stage) {
      saveBtn.addEventListener('click', () => onSaveClick(meta, saveBtn));
    } else if (saveBtn && stage) {
      saveBtn.addEventListener('click', () => {
        // TODO S8: open stage picker
      });
    }

    // Dismiss button
    document.getElementById('bj-tb-dismiss')?.addEventListener('click', () => {
      el.remove();
    });
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Save job to pipeline via background.js relay ──────────────
  function onSaveClick(meta, btn) {
    btn.disabled = true;
    btn.textContent = 'Saving…';

    chrome.runtime.sendMessage({
      type: 'bj:toolbar:save',
      payload: {
        source_url: meta.url,
        job_title: meta.title,
        company_name: meta.company,
        source_platform: meta.platform,
        stage: 'saved',
        entry_source: 'overlay',
      }
    }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        btn.disabled = false;
        btn.textContent = 'Save Job';
        console.warn('[BJ Toolbar] Save failed:', chrome.runtime.lastError?.message || response?.error);
        return;
      }
      btn.disabled = false;
      btn.classList.add('bj-saved');
      btn.textContent = '✓ Saved';

      // Update badge
      const toolbar = document.getElementById(TOOLBAR_ID);
      const right = toolbar?.querySelector('.bj-tb-right');
      if (right) {
        const existingBadge = right.querySelector('.bj-tb-badge');
        if (!existingBadge) {
          const badge = document.createElement('span');
          badge.className = 'bj-tb-badge bj-stage-saved';
          badge.textContent = 'saved';
          right.insertBefore(badge, btn);
        }
      }

      // Log overlay_analytics
      chrome.runtime.sendMessage({
        type: 'bj:toolbar:analytics',
        payload: {
          action_type: 'save_completed',
          source_platform: meta.platform,
          url_hash: hashUrl(meta.url),
        }
      });
    });
  }

  // ── Simple URL hash for analytics (no PII) ───────────────────
  function hashUrl(url) {
    let h = 0;
    for (let i = 0; i < url.length; i++) {
      h = ((h << 5) - h) + url.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  // ── Check pipeline state for current URL ─────────────────────
  function checkPipelineState(url, cb) {
    chrome.runtime.sendMessage({
      type: 'bj:toolbar:getEntry',
      payload: { source_url: url }
    }, (response) => {
      if (chrome.runtime.lastError) { cb(null); return; }
      cb(response?.entry || null);
    });
  }

  // ── Detect if this is a job page worth showing toolbar on ─────
  function isJobPage() {
    const hostname = window.location.hostname;
    const path = window.location.pathname;

    if (hostname.includes('linkedin.com') && /\/jobs\/view\/\d+/.test(path)) return true;
    if (hostname.includes('greenhouse.io')) return true;
    if (hostname.includes('lever.co') && path.split('/').length >= 3) return true;
    if (hostname.includes('ashbyhq.com') && path.includes('/job/')) return true;
    if (hostname.includes('workable.com') && path.includes('/j/')) return true;
    if (hostname.includes('recruitee.com') && path.includes('/o/')) return true;
    if (hostname.includes('indeed.com') && /\/(viewjob|jobs)/.test(path)) return true;

    return false;
  }

  // ── Match Score Badge (S6) ───────────────────────────────────
  function loadMatchScore(url) {
    chrome.runtime.sendMessage({
      type: 'bj:toolbar:matchScore',
      payload: { source_url: url }
    }, (response) => {
      if (chrome.runtime.lastError) return;
      const badge = document.getElementById('bj-tb-score-badge');
      if (!badge) return;

      const score = response?.score;
      const label = response?.label;

      if (score === null || score === undefined || !label) {
        // No resume on file or no JD found — hide badge silently
        badge.style.display = 'none';
        return;
      }

      badge.textContent = score + ' match';
      badge.className = 'bj-tb-score bj-score-' + label + ' loaded';
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (!isJobPage()) return;

    const meta = parseJobMeta();
    if (!meta.url) return;

    injectStyles();

    // Check pipeline state, then render toolbar
    checkPipelineState(meta.url, (entry) => {
      buildToolbar(meta, entry);
      // S6: Async match score — non-blocking, updates badge when ready
      loadMatchScore(meta.url);
    });

    // Log toolbar view to overlay_analytics
    chrome.runtime.sendMessage({
      type: 'bj:toolbar:analytics',
      payload: {
        action_type: 'result_viewed',
        source_platform: meta.platform,
        url_hash: hashUrl(meta.url),
      }
    });
  }

  // ── Wait for DOM ready ────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // SPA pages (LinkedIn): wait a beat for dynamic content
    setTimeout(init, 800);
  }

  // ── SPA navigation support (LinkedIn/Indeed) ─────────────────
  // Re-init on URL changes without full page reload
  let _lastUrl = window.location.href;
  const _urlObserver = new MutationObserver(() => {
    const cur = window.location.href;
    if (cur !== _lastUrl) {
      _lastUrl = cur;
      // Remove old toolbar
      const old = document.getElementById(TOOLBAR_ID);
      if (old) old.remove();
      // Re-init after SPA transition
      setTimeout(init, 900);
    }
  });
  _urlObserver.observe(document.body, { subtree: true, childList: true });

})();
