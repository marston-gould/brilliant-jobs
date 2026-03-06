// extension/toolbar-overlay.js — Brilliant Jobs Job Page Toolbar
// v1.0.0 / v6.98: Overlay Pipeline S4 — Toolbar Shell
// v1.1.0 / v7.00: Overlay Pipeline S6 — Match Score Badge
// v1.2.0 / v7.01: Overlay Pipeline S7 — Fraud + AI Content Score Indicators
// v1.3.0 / v7.02: Overlay Pipeline S8 — Save/Apply CTA + Stage Picker
// v1.4.0 / v7.03: Overlay Pipeline S9 — Analytics Instrumentation (picker_opened, match_score_viewed, toolbar_dismissed)
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
//   - Save/Apply button with stage picker dropdown (S8)
//   - Stage picker: saved → applied → interview → offer (no backward movement)
//
// Session 8 scope: Replace single "Save Job" button with combined Save/Stage
// picker component. On first save → writes stage="saved" via pipeline-write EF.
// On subsequent clicks → opens stage picker dropdown, writes new stage via
// pipeline-write EF. Stage rank enforcement is also in pipeline-write EF.

(function () {
  'use strict';

  const TOOLBAR_ID = 'bj-job-toolbar';
  const TOOLBAR_SHADOW_HOST_ID = 'bj-toolbar-shadow-host';

  // CS-014: CX-09 — Shadow DOM isolation for toolbar
  var _tbShadowRoot = null;
  function getToolbarShadow() {
    if (_tbShadowRoot) return _tbShadowRoot;
    var host = document.getElementById(TOOLBAR_SHADOW_HOST_ID);
    if (host) { _tbShadowRoot = host.shadowRoot; return _tbShadowRoot; }
    host = document.createElement('div');
    host.id = TOOLBAR_SHADOW_HOST_ID;
    host.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(host);
    _tbShadowRoot = host.attachShadow({ mode: 'open' });
    return _tbShadowRoot;
  }

  // Stage rank map — higher rank = more advanced stage
  const STAGE_RANK = { saved: 1, applied: 2, interview: 3, offer: 4, rejected: 0 };
  const STAGE_LABELS = {
    saved: 'Saved',
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
  };
  // Stages available in the picker (forward-only, no rejected)
  const PICKER_STAGES = ['saved', 'applied', 'interview', 'offer'];

  // ── Prevent double-injection ──────────────────────────────────
  if (document.getElementById(TOOLBAR_SHADOW_HOST_ID) &&
      document.getElementById(TOOLBAR_SHADOW_HOST_ID).shadowRoot &&
      document.getElementById(TOOLBAR_SHADOW_HOST_ID).shadowRoot.querySelector('#' + TOOLBAR_ID)) return;

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
    var shadow = getToolbarShadow();
    if (shadow.querySelector('style')) return;
    const style = document.createElement('style');
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

      /* S8: Save/Stage CTA container */
      #${TOOLBAR_ID} .bj-tb-cta-wrap {
        position: relative;
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn {
        background: #3b82f6;
        color: #fff;
        border: none;
        padding: 8px 18px;
        border-radius: 8px 0 0 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, opacity 0.15s;
        white-space: nowrap;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn.bj-no-picker {
        border-radius: 8px;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn:hover { background: #2563eb; }
      #${TOOLBAR_ID} .bj-tb-save-btn:disabled { opacity: 0.6; cursor: default; }
      #${TOOLBAR_ID} .bj-tb-save-btn.bj-saved {
        background: #22c55e;
      }
      #${TOOLBAR_ID} .bj-tb-save-btn.bj-saved:hover { background: #16a34a; }

      /* S8: Stage picker chevron button */
      #${TOOLBAR_ID} .bj-tb-picker-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        border-left: 1px solid rgba(255,255,255,0.25);
        padding: 8px 10px;
        border-radius: 0 8px 8px 0;
        font-size: 11px;
        cursor: pointer;
        transition: background 0.15s;
        line-height: 1;
        display: flex;
        align-items: center;
      }
      #${TOOLBAR_ID} .bj-tb-picker-btn:hover { background: #1d4ed8; }
      #${TOOLBAR_ID} .bj-tb-picker-btn.bj-saved-chevron {
        background: #16a34a;
        border-left-color: rgba(255,255,255,0.3);
      }
      #${TOOLBAR_ID} .bj-tb-picker-btn.bj-saved-chevron:hover { background: #15803d; }

      /* S8: Stage dropdown */
      #${TOOLBAR_ID} .bj-tb-stage-dropdown {
        position: absolute;
        bottom: calc(100% + 6px);
        right: 0;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.12);
        min-width: 160px;
        overflow: hidden;
        z-index: 2147483647;
        display: none;
      }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown.open { display: block; }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown .bj-dropdown-label {
        font-size: 10px;
        font-weight: 700;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 8px 14px 4px;
      }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown .bj-stage-option {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 500;
        color: #1e293b;
        cursor: pointer;
        transition: background 0.1s;
        border: none;
        background: none;
        width: 100%;
        text-align: left;
      }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown .bj-stage-option:hover { background: #f1f5f9; }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown .bj-stage-option.bj-current {
        background: #f8fafc;
        font-weight: 700;
        color: #3b82f6;
      }
      #${TOOLBAR_ID} .bj-tb-stage-dropdown .bj-stage-option.bj-disabled {
        opacity: 0.35;
        cursor: not-allowed;
        pointer-events: none;
      }
      #${TOOLBAR_ID} .bj-tb-stage-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      #${TOOLBAR_ID} .bj-dot-saved     { background: #6366f1; }
      #${TOOLBAR_ID} .bj-dot-applied   { background: #22c55e; }
      #${TOOLBAR_ID} .bj-dot-interview { background: #a855f7; }
      #${TOOLBAR_ID} .bj-dot-offer     { background: #f59e0b; }

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
    `;
    shadow.appendChild(style);
  }

  // ── Build toolbar DOM ─────────────────────────────────────────
  function buildToolbar(meta, pipelineEntry) {
    var shadow = getToolbarShadow();
    let el = shadow.querySelector('#' + TOOLBAR_ID);
    if (el) el.remove();

    el = document.createElement('div');
    el.id = TOOLBAR_ID;
    el.setAttribute('data-source-url', meta.url);

    const stage = pipelineEntry?.stage || null;
    const stageClass = stage ? 'bj-stage-' + stage : '';
    const stageLabel = stage ? (STAGE_LABELS[stage] || stage) : null;

    // S7: Fraud indicator — show if fraud_score >= 60
    const fraudScore = pipelineEntry?.fraud_score ?? null;
    const fraudLabel = pipelineEntry?.fraud_label || null;
    const showFraud = fraudScore !== null && fraudScore >= 60;

    // S7: AI content indicator — show if ai_content_score >= 0.7
    const aiScore = pipelineEntry?.ai_content_score ?? null;
    const aiLabel = pipelineEntry?.ai_content_label || null;
    const showAI = aiScore !== null && parseFloat(aiScore) >= 0.7;

    // S8: CTA button state
    // If no stage → single "Save Job" button (no picker)
    // If stage exists → split button: label on left, chevron on right (opens picker)
    const isSaved = !!stage;
    const ctaBtnLabel = isSaved ? ('✓ ' + escHtml(stageLabel)) : 'Save Job';

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
        <div class="bj-tb-cta-wrap" id="bj-tb-cta-wrap">
          <button class="bj-tb-save-btn${isSaved ? ' bj-saved' : ''}${!isSaved ? ' bj-no-picker' : ''}" id="bj-tb-save-btn">${ctaBtnLabel}</button>
          ${isSaved ? `<button class="bj-tb-picker-btn bj-saved-chevron" id="bj-tb-picker-btn" title="Change stage">▾</button>` : ''}
          <div class="bj-tb-stage-dropdown" id="bj-tb-stage-dropdown">
            <div class="bj-dropdown-label">Move to stage</div>
            ${PICKER_STAGES.map(s => {
              const rank = STAGE_RANK[s] || 0;
              const currentRank = STAGE_RANK[stage] || 0;
              const isCurrent = s === stage;
              const isDisabled = rank < currentRank; // no backward movement
              return `<button class="bj-stage-option${isCurrent ? ' bj-current' : ''}${isDisabled ? ' bj-disabled' : ''}"
                data-stage="${s}">
                <span class="bj-tb-stage-dot bj-dot-${s}"></span>${escHtml(STAGE_LABELS[s])}
                ${isCurrent ? ' ✓' : ''}
              </button>`;
            }).join('')}
          </div>
        </div>
        <button class="bj-tb-dismiss" id="bj-tb-dismiss" title="Dismiss toolbar">×</button>
      </div>
    `;

    shadow.appendChild(el);

    // S8: Wire up CTA
    const saveBtn = getToolbarShadow().querySelector('#bj-tb-save-btn');
    const pickerBtn = getToolbarShadow().querySelector('#bj-tb-picker-btn');
    const dropdown = getToolbarShadow().querySelector('#bj-tb-stage-dropdown');

    if (saveBtn) {
      if (!isSaved) {
        // First save — write stage=saved via pipeline-write
        saveBtn.addEventListener('click', () => onSaveClick(meta, saveBtn, pickerBtn));
      } else {
        // Already saved — clicking the main btn also opens picker
        saveBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleDropdown(dropdown);
        });
      }
    }

    if (pickerBtn && dropdown) {
      pickerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(dropdown);
      });
    }

    // Stage option clicks
    el.querySelectorAll('.bj-stage-option:not(.bj-disabled):not(.bj-current)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const newStage = btn.getAttribute('data-stage');
        if (newStage) onStageChange(meta, newStage, dropdown, saveBtn);
      });
    });

    // Click outside closes dropdown
    document.addEventListener('click', function closeDropdown(e) {
      const wrap = getToolbarShadow().querySelector('#bj-tb-cta-wrap');
      if (wrap && !wrap.contains(e.target)) {
        if (dropdown) dropdown.classList.remove('open');
      }
    });

    // Dismiss button
    getToolbarShadow().querySelector('#bj-tb-dismiss')?.addEventListener('click', () => {
      el.remove();
    });
  }

  function toggleDropdown(dropdown) {
    if (!dropdown) return;
    dropdown.classList.toggle('open');
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── First-save handler ────────────────────────────────────────
  function onSaveClick(meta, saveBtn, pickerBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

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
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Job';
        console.warn('[BJ Toolbar] Save failed:', chrome.runtime.lastError?.message || response?.error);
        return;
      }
      // Transition to split-button state
      saveBtn.disabled = false;
      saveBtn.classList.remove('bj-no-picker');
      saveBtn.classList.add('bj-saved');
      saveBtn.textContent = '✓ Saved';

      // Update stage badge
      const toolbar = getToolbarShadow().querySelector('#' + TOOLBAR_ID);
      const right = toolbar?.querySelector('.bj-tb-right');
      if (right && !right.querySelector('.bj-tb-badge')) {
        const badge = document.createElement('span');
        badge.className = 'bj-tb-badge bj-stage-saved';
        badge.textContent = 'Saved';
        right.insertBefore(badge, right.querySelector('.bj-tb-cta-wrap'));
      }

      // Inject picker chevron if not present
      const ctaWrap = getToolbarShadow().querySelector('#bj-tb-cta-wrap');
      if (ctaWrap && !ctaWrap.querySelector('.bj-tb-picker-btn')) {
        const chevron = document.createElement('button');
        chevron.className = 'bj-tb-picker-btn bj-saved-chevron';
        chevron.id = 'bj-tb-picker-btn';
        chevron.title = 'Change stage';
        chevron.textContent = '▾';
        ctaWrap.insertBefore(chevron, ctaWrap.querySelector('.bj-tb-stage-dropdown'));

        // Build dropdown stages for saved state
        const dd = getToolbarShadow().querySelector('#bj-tb-stage-dropdown');
        if (dd) {
          dd.innerHTML = `<div class="bj-dropdown-label">Move to stage</div>` +
            PICKER_STAGES.map(s => {
              const isCurrent = s === 'saved';
              const isDisabled = STAGE_RANK[s] < STAGE_RANK['saved'];
              return `<button class="bj-stage-option${isCurrent ? ' bj-current' : ''}${isDisabled ? ' bj-disabled' : ''}"
                data-stage="${s}">
                <span class="bj-tb-stage-dot bj-dot-${s}"></span>${escHtml(STAGE_LABELS[s])}
                ${isCurrent ? ' ✓' : ''}
              </button>`;
            }).join('');

          // Wire stage option clicks
          dd.querySelectorAll('.bj-stage-option:not(.bj-disabled):not(.bj-current)').forEach(btn => {
            btn.addEventListener('click', (e) => {
              e.stopPropagation();
              const newStage = btn.getAttribute('data-stage');
              if (newStage) onStageChange(meta, newStage, dd, saveBtn);
            });
          });
        }

        chevron.addEventListener('click', (e) => {
          e.stopPropagation();
          if (dd) dd.classList.toggle('open');
          // S9: instrument picker_opened
          if (dd && dd.classList.contains('open')) {
            chrome.runtime.sendMessage({
              type: 'bj:toolbar:analytics',
              payload: {
                action_type: 'picker_opened',
                source_platform: meta.platform,
                url_hash: hashUrl(meta.url),
              }
            });
          }
        });
      }

      // Also allow clicking the main btn to open picker
      saveBtn.onclick = (e) => {
        e.stopPropagation();
        const dd = getToolbarShadow().querySelector('#bj-tb-stage-dropdown');
        if (dd) dd.classList.toggle('open');
      };

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

  // ── Stage change handler (picker selection) ───────────────────
  function onStageChange(meta, newStage, dropdown, saveBtn) {
    // Close dropdown
    if (dropdown) dropdown.classList.remove('open');

    // Optimistic UI update
    const prevText = saveBtn ? saveBtn.textContent : '';
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Updating…';
    }

    chrome.runtime.sendMessage({
      type: 'bj:toolbar:save',
      payload: {
        source_url: meta.url,
        job_title: meta.title,
        company_name: meta.company,
        source_platform: meta.platform,
        stage: newStage,
        entry_source: 'overlay',
      }
    }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = prevText;
        }
        console.warn('[BJ Toolbar] Stage change failed:', chrome.runtime.lastError?.message || response?.error);
        return;
      }

      const newLabel = STAGE_LABELS[newStage] || newStage;

      // Update main button label
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '✓ ' + newLabel;
      }

      // Update stage badge
      const toolbar = getToolbarShadow().querySelector('#' + TOOLBAR_ID);
      const badge = toolbar?.querySelector('.bj-tb-badge');
      if (badge) {
        // Reset all stage classes
        PICKER_STAGES.forEach(s => badge.classList.remove('bj-stage-' + s));
        badge.classList.add('bj-stage-' + newStage);
        badge.textContent = newLabel;
      }

      // Rebuild dropdown options with new current stage
      if (dropdown) {
        dropdown.innerHTML = `<div class="bj-dropdown-label">Move to stage</div>` +
          PICKER_STAGES.map(s => {
            const isCurrent = s === newStage;
            const isDisabled = STAGE_RANK[s] < STAGE_RANK[newStage];
            return `<button class="bj-stage-option${isCurrent ? ' bj-current' : ''}${isDisabled ? ' bj-disabled' : ''}"
              data-stage="${s}">
              <span class="bj-tb-stage-dot bj-dot-${s}"></span>${escHtml(STAGE_LABELS[s])}
              ${isCurrent ? ' ✓' : ''}
            </button>`;
          }).join('');

        dropdown.querySelectorAll('.bj-stage-option:not(.bj-disabled):not(.bj-current)').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const s = btn.getAttribute('data-stage');
            if (s) onStageChange(meta, s, dropdown, saveBtn);
          });
        });
      }

      // Analytics
      chrome.runtime.sendMessage({
        type: 'bj:toolbar:analytics',
        payload: {
          action_type: 'stage_changed',
          source_platform: meta.platform,
          url_hash: hashUrl(meta.url),
          new_stage: newStage,
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
      const badge = getToolbarShadow().querySelector('#bj-tb-score-badge');
      if (!badge) return;

      const score = response?.score;
      const label = response?.label;

      if (score === null || score === undefined || !label) {
        badge.style.display = 'none';
        return;
      }

      badge.textContent = score + ' match';
      badge.className = 'bj-tb-score bj-score-' + label + ' loaded';

      // S9: instrument match_score_viewed
      chrome.runtime.sendMessage({
        type: 'bj:toolbar:analytics',
        payload: {
          action_type: 'match_score_viewed',
          source_platform: null,
          url_hash: null,
          meta: { score: score, label: label },
        }
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    if (!isJobPage()) return;

    const meta = parseJobMeta();
    if (!meta.url) return;

    injectStyles();

    checkPipelineState(meta.url, (entry) => {
      buildToolbar(meta, entry);
      loadMatchScore(meta.url);
    });

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
    setTimeout(init, 800);
  }

  // ── SPA navigation support (LinkedIn/Indeed) ─────────────────
  let _lastUrl = window.location.href;
  const _urlObserver = new MutationObserver(() => {
    const cur = window.location.href;
    if (cur !== _lastUrl) {
      _lastUrl = cur;
      const old = getToolbarShadow().querySelector('#' + TOOLBAR_ID);
      if (old) {
        // S9: instrument toolbar_dismissed on SPA nav
        chrome.runtime.sendMessage({
          type: 'bj:toolbar:analytics',
          payload: {
            action_type: 'toolbar_dismissed',
            source_platform: null,
            url_hash: null,
          }
        });
        old.remove();
      }
      setTimeout(init, 900);
    }
  });
  _urlObserver.observe(document.body, { subtree: true, childList: true });

})();
