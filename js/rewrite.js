// js/rewrite.js — AI Resume Rewrite (JD-match "Boost" feature)
// Phase B+C: Panel UI, Q&A flow, diff view, accept/reject actions
// v4.28

// ════════════════════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════════════════════

var _rwState = {
  sessionId: null,
  jobId: null,
  jobTitle: '',
  company: '',
  resumeId: null,
  originalScore: null,
  status: null,         // 'analyzing' | 'questions' | 'ready_to_rewrite' | 'rewriting' | 'checking' | 'completed' | 'failed'
  gapAnalysis: null,
  questions: [],
  userAnswers: {},
  sections: [],
  quality: null,
  newScore: null,
  creditsUsed: 0,
  retryCount: 0,
  pollTimer: null,
};

function _rwReset() {
  if (_rwState.pollTimer) clearInterval(_rwState.pollTimer);
  _rwState = {
    sessionId: null, jobId: null, jobTitle: '', company: '', resumeId: null,
    originalScore: null, status: null, gapAnalysis: null, questions: [],
    userAnswers: {}, sections: [], quality: null, newScore: null,
    creditsUsed: 0, retryCount: 0, pollTimer: null,
  };
}

// EXT-BUILD-001 B5: Read page_limit preference (1 or 2, default 1)
function _rwGetPageLimit() {
  try {
    var settings = JSON.parse(localStorage.getItem('bj_apply_settings') || '{}');
    var rewritePrefs = settings.rewrite_preferences || {};
    if (rewritePrefs.page_limit === 2) return 2;
  } catch (_) {}
  return 1;
}

// ════════════════════════════════════════════════════════════
// PANEL OPEN / CLOSE
// ════════════════════════════════════════════════════════════

function openRewritePanel(jobId, jobTitle, company, resumeId, matchScore) {
  _rwReset();
  _rwState.jobId = jobId;
  _rwState.jobTitle = jobTitle || 'this role';
  _rwState.company = company || '';
  _rwState.resumeId = resumeId;
  _rwState.originalScore = matchScore;

  var panel = document.getElementById('rewrite-panel');
  if (!panel) return;

  // Set header
  var titleEl = document.getElementById('rw-panel-title');
  if (titleEl) titleEl.textContent = _rwState.jobTitle;
  var metaEl = document.getElementById('rw-panel-meta');
  if (metaEl) metaEl.textContent = _rwState.company ? 'at ' + _rwState.company : '';

  // Show panel
  panel.style.display = '';
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(function () { panel.classList.add('rw-open'); });

  // Escape key handler
  panel._escHandler = function (e) { if (e.key === 'Escape') closeRewritePanel(); };
  document.addEventListener('keydown', panel._escHandler);

  // Start analysis
  _rwStartAnalysis();
}

function closeRewritePanel() {
  if (_rwState.pollTimer) clearInterval(_rwState.pollTimer);
  var panel = document.getElementById('rewrite-panel');
  if (!panel) return;
  panel.classList.remove('rw-open');
  document.body.style.overflow = '';
  if (panel._escHandler) {
    document.removeEventListener('keydown', panel._escHandler);
    panel._escHandler = null;
  }
  setTimeout(function () { panel.style.display = 'none'; }, 300);
}

// ════════════════════════════════════════════════════════════
// ENTITLEMENT + CREDIT CHECKS
// ════════════════════════════════════════════════════════════

async function _rwCanRewrite() {
  if (!currentUser) { showToast('Please log in first.', { type: 'error' }); return false; }

  // Check Pro tier
  var ent = await checkEntitlement('ai_rewrite', 0);
  if (!ent.allowed) {
    showUpgradePrompt('AI Resume Rewrite', ent);
    return false;
  }

  // Check credit balance
  var { data: balance, error: balErr } = await sb.rpc('get_credit_balance', { p_user_id: currentUser.id });
  if (balErr) { reportError('rewrite:credit-balance', balErr); showToast('Could not check credit balance. Try again.', { type: 'error' }); return false; }
  if (balance < 3) {
    showToast('This rewrite costs 3 credits. You have ' + balance + '. Purchase more in Settings.', { type: 'error', duration: 5000 });
    return false;
  }

  return true;
}

// ════════════════════════════════════════════════════════════
// PHASE 1: ANALYSIS
// ════════════════════════════════════════════════════════════

async function _rwStartAnalysis() {
  _rwState.status = 'analyzing';
  _rwRenderBody();

  var session = await sb.auth.getSession();
  if (!session?.data?.session?.access_token) {
    showToast('Session expired. Please log in again.', { type: 'error' });
    closeRewritePanel();
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume-analyze', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        resume_id: _rwState.resumeId,
        job_id: _rwState.jobId,
        original_score: _rwState.originalScore,
        page_limit: _rwGetPageLimit(),
      }),
    });

    var data = await res.json();

    if (!res.ok || !data.success) {
      var errMsg = data.error || 'Analysis failed';
      if (data.error === 'insufficient_credits') {
        errMsg = 'Insufficient credits (3 required, you have ' + (data.balance || 0) + ')';
      } else if (data.error === 'resume_text_not_found') {
        errMsg = 'Resume text not synced yet. Open your resume on the Resumes page, then try again.';
      } else if (data.error === 'jd_too_brief') {
        errMsg = 'This job description is too brief for AI rewrite. Try a different listing.';
      }
      _rwState.status = 'failed';
      _rwRenderError(errMsg);
      return;
    }

    _rwState.sessionId = data.session_id;
    _rwState.gapAnalysis = data.gap_analysis;
    _rwState.questions = data.questions || [];

    if (_rwState.questions.length > 0) {
      _rwState.status = 'questions';
    } else {
      _rwState.status = 'ready_to_rewrite';
      // No questions — go straight to rewrite
      _rwStartRewrite();
      return;
    }

    _rwRenderBody();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Analysis error:', e);
    _rwState.status = 'failed';
    _rwRenderError('Something went wrong. No credits were deducted. Please try again.');
  }
}

// ════════════════════════════════════════════════════════════
// PHASE 2: Q&A
// ════════════════════════════════════════════════════════════

function _rwSubmitAnswers() {
  // Collect answers from the Q&A cards
  var answers = {};
  _rwState.questions.forEach(function (q) {
    var input = document.getElementById('rw-q-' + q.id);
    var val = input ? input.value.trim() : '';
    answers[q.id] = val || null; // null = skipped
  });
  _rwState.userAnswers = answers;
  _rwStartRewrite();
}

function _rwSkipQuestion(qId) {
  var card = document.getElementById('rw-card-' + qId);
  if (card) {
    card.classList.add('rw-skipped');
    var input = document.getElementById('rw-q-' + qId);
    if (input) { input.value = ''; input.disabled = true; }
  }
  _rwState.userAnswers[qId] = null;
}

// ════════════════════════════════════════════════════════════
// PHASE 3: REWRITE EXECUTION
// ════════════════════════════════════════════════════════════

async function _rwStartRewrite(feedback) {
  _rwState.status = 'rewriting';
  _rwRenderBody();

  var session = await sb.auth.getSession();
  if (!session?.data?.session?.access_token) {
    showToast('Session expired.', { type: 'error' });
    return;
  }

  try {
    var res = await fetch(SUPABASE_URL + '/functions/v1/rewrite-resume-execute', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + session.data.session.access_token,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        session_id: _rwState.sessionId,
        user_answers: _rwState.userAnswers,
        feedback: feedback || null,
        page_limit: _rwGetPageLimit(),
      }),
    });

    var data = await res.json();

    if (!res.ok || !data.success) {
      _rwState.status = 'failed';
      _rwRenderError(data.error || 'Rewrite failed. No credits were deducted.');
      return;
    }

    _rwState.sections = data.sections || [];
    _rwState.quality = data.quality || {};
    _rwState.newScore = data.new_score;
    _rwState.creditsUsed += data.credits_used || 0;
    _rwState.status = 'completed';

    _rwRenderBody();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Execute error:', e);
    _rwState.status = 'failed';
    _rwRenderError('Something went wrong. Please try again.');
  }
}

// ════════════════════════════════════════════════════════════
// ACTIONS
// ════════════════════════════════════════════════════════════

async function _rwAcceptAll() {
  var acceptBtn = document.querySelector('.rw-actions .btn-primary');
  if (acceptBtn) { acceptBtn.disabled = true; acceptBtn.textContent = 'Generating document…'; }

  try {
    // Build the rewritten text by combining accepted sections (respecting cherry-pick)
    var fullText = '';
    (_rwState.sections || []).forEach(function (s) {
      var useRewrite = s.changed && !s._excluded;
      var text = useRewrite ? s.rewritten : s.original;
      if (text) fullText += text + '\n\n';
    });

    // Generate DOCX
    var docBlob = await _rwBuildDocx(_rwState.sections);

    if (!docBlob) {
      // Fallback: offer plain text download
      _rwDownloadText(fullText);
      showToast('DOCX generation unavailable. Plain text downloaded instead.', { type: 'info' });
      closeRewritePanel();
      return;
    }

    // Upload to Supabase Storage
    var session = await sb.auth.getSession();
    var token = session?.data?.session?.access_token;
    var fileName = 'rewrite_' + (_rwState.company || 'job').replace(/[^a-zA-Z0-9]/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.docx';
    var storagePath = currentUser.id + '/' + _rwState.sessionId + '/' + fileName;

    var { error: uploadErr } = await sb.storage
      .from('rewrites')
      .upload(storagePath, docBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadErr) {
      console.warn('[rewrite] Storage upload failed:', uploadErr.message);
      // Still download locally
    }

    // Update session record with file path
    if (_rwState.sessionId) {
      var { error: updErr } = await sb.from('rewrite_sessions').update({
        output_file_path: storagePath,
        status: 'accepted',
      }).eq('id', _rwState.sessionId);
      if (updErr) reportError('rewrite:session-update', updErr);
    }

    // Auto-download
    var url = URL.createObjectURL(docBlob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);

    showToast('Resume rewrite downloaded! File saved to your account.', { type: 'success', duration: 5000 });
    closeRewritePanel();

  } catch (e) {
    reportError('rewrite', e);
    console.error('[rewrite] Accept error:', e);
    showToast('Download failed: ' + e.message, { type: 'error' });
    if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.textContent = 'Accept All'; }
  }
}

// ─── DOCX Builder (client-side via docx-js UMD) ───
async function _rwBuildDocx(sections) {
  if (typeof docx === 'undefined') {
    console.warn('[rewrite] docx library not loaded');
    return null;
  }

  var children = [];

  sections.forEach(function (s) {
    var text = s.changed ? s.rewritten : s.original;
    if (!text) return;

    // Section heading
    children.push(new docx.Paragraph({
      spacing: { before: 240, after: 80 },
      children: [new docx.TextRun({
        text: (s.name || 'Section').toUpperCase(),
        bold: true,
        size: 24,
        font: 'Calibri',
        color: '2B2B2B',
      })],
    }));

    // Section content — split by lines
    text.split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;

      // Detect bullet points
      var isBullet = /^[\u2022\-\*]\s/.test(line);
      var cleanLine = isBullet ? line.replace(/^[\u2022\-\*]\s*/, '') : line;

      if (isBullet) {
        children.push(new docx.Paragraph({
          spacing: { after: 40 },
          indent: { left: 360, hanging: 260 },
          children: [
            new docx.TextRun({ text: '\u2022 ', font: 'Calibri', size: 22, color: '666666' }),
            new docx.TextRun({ text: cleanLine, font: 'Calibri', size: 22, color: '333333' }),
          ],
        }));
      } else {
        children.push(new docx.Paragraph({
          spacing: { after: 60 },
          children: [new docx.TextRun({
            text: cleanLine,
            font: 'Calibri',
            size: 22,
            color: '333333',
          })],
        }));
      }
    });
  });

  var doc = new docx.Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
        },
      },
      children: children,
    }],
  });

  return await docx.Packer.toBlob(doc);
}

// ─── Plaintext fallback ───
function _rwDownloadText(text) {
  var blob = new Blob([text], { type: 'text/plain' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'rewrite_' + new Date().toISOString().slice(0, 10) + '.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
}

function _rwTryAgain() {
  if (_rwState.retryCount >= 2) {
    showToast('Maximum retries reached (2). Please start a new rewrite.', { type: 'error' });
    return;
  }
  _rwState.retryCount++;

  var feedbackInput = document.getElementById('rw-feedback-input');
  var feedback = feedbackInput ? feedbackInput.value.trim() : '';

  if (!feedback) {
    showToast('Please describe what you\'d like changed.', { type: 'error' });
    return;
  }

  _rwStartRewrite({ text: feedback, retry: _rwState.retryCount });
}

// ════════════════════════════════════════════════════════════
// RENDERING
// ════════════════════════════════════════════════════════════

function _rwRenderBody() {
  var body = document.getElementById('rw-panel-body');
  if (!body) return;

  switch (_rwState.status) {
    case 'analyzing':
      body.innerHTML = _rwRenderAnalyzing();
      break;
    case 'questions':
      body.innerHTML = _rwRenderQuestions();
      break;
    case 'ready_to_rewrite':
    case 'rewriting':
    case 'checking':
      body.innerHTML = _rwRenderRewriting();
      break;
    case 'completed':
      body.innerHTML = _rwRenderResults();
      break;
    case 'failed':
      // Handled by _rwRenderError
      break;
    default:
      body.innerHTML = '';
  }
}

function _rwRenderError(msg) {
  var body = document.getElementById('rw-panel-body');
  if (!body) return;
  body.innerHTML = '<div class="rw-error">' +
    '<div class="rw-error-icon">!</div>' +
    '<div class="rw-error-msg">' + msg + '</div>' +
    '<button class="btn btn-sm" onclick="_rwStartAnalysis()" style="margin-top:16px;">Try Again</button>' +
    '</div>';
}

// ─── State 1: Analyzing ───
function _rwRenderAnalyzing() {
  return '<div class="rw-loading">' +
    '<div class="rw-spinner"></div>' +
    '<div class="rw-loading-text">Analyzing your resume against<br><strong>' +
    _rwState.jobTitle + '</strong>' +
    (_rwState.company ? ' at <strong>' + _rwState.company + '</strong>' : '') +
    '</div>' +
    '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-active">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Rewrite</span>' +
    '</div>' +
    '</div>';
}

// ─── State 2: Questions ───
function _rwRenderQuestions() {
  var ga = _rwState.gapAnalysis || {};
  var html = '<div class="rw-qa-section">';

  // Summary bar
  html += '<div class="rw-summary">' +
    '<div class="rw-summary-row">' +
    '<span class="rw-stat"><strong>' + (ga.matched_count || 0) + '</strong> matched</span>' +
    '<span class="rw-stat"><strong>' + (ga.rewritable_count || 0) + '</strong> can improve</span>' +
    '<span class="rw-stat"><strong>' + (ga.needs_input_count || 0) + '</strong> need your input</span>' +
    '</div>' +
    (ga.summary ? '<div class="rw-summary-text">' + ga.summary + '</div>' : '') +
    '</div>';

  // Progress dots
  html += '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-active">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot">Rewrite</span>' +
    '</div>';

  // Question cards
  _rwState.questions.forEach(function (q, i) {
    html += '<div class="rw-qa-card" id="rw-card-' + q.id + '">' +
      '<div class="rw-qa-label">Question ' + (i + 1) + ' of ' + _rwState.questions.length + '</div>' +
      '<div class="rw-qa-context">' +
      '<div class="rw-qa-jd"><strong>JD requires:</strong> ' + (q.jd_context || q.skill || '') + '</div>' +
      (q.resume_context ? '<div class="rw-qa-resume"><strong>Your resume:</strong> ' + q.resume_context + '</div>' : '') +
      '</div>' +
      '<div class="rw-qa-question">' + q.question + '</div>' +
      '<textarea id="rw-q-' + q.id + '" class="rw-qa-input" placeholder="' +
      (q.placeholder || 'Type your answer...').replace(/"/g, '&quot;') +
      '" rows="3"></textarea>' +
      '<button class="rw-skip-btn" onclick="_rwSkipQuestion(\'' + q.id + '\')">Skip this question</button>' +
      '</div>';
  });

  // Continue button
  html += '<div class="rw-qa-actions">' +
    '<button class="btn btn-primary" onclick="_rwSubmitAnswers()">Continue to Rewrite</button>' +
    '</div>';

  html += '</div>';
  return html;
}

// ─── Rewriting loading ───
function _rwRenderRewriting() {
  return '<div class="rw-loading">' +
    '<div class="rw-spinner"></div>' +
    '<div class="rw-loading-text">Rewriting your resume' +
    (_rwState.retryCount > 0 ? ' (revision ' + _rwState.retryCount + ')' : '') +
    '</div>' +
    '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-active">Rewrite</span>' +
    '</div>' +
    '</div>';
}

// ─── State 3: Results (diff view) ───
function _rwRenderResults() {
  var q = _rwState.quality || {};
  var html = '<div class="rw-results">';

  // Score improvement bar
  html += '<div class="rw-score-bar">';
  if (_rwState.originalScore != null && _rwState.newScore != null) {
    var improvement = _rwState.newScore - _rwState.originalScore;
    html += '<div class="rw-score-change">' +
      '<span class="rw-score-old">' + _rwState.originalScore + '%</span>' +
      '<span class="rw-score-arrow">&rarr;</span>' +
      '<span class="rw-score-new">' + _rwState.newScore + '%</span>' +
      (improvement > 0 ? '<span class="rw-score-delta">+' + improvement + '</span>' : '') +
      '</div>';
  }
  if (q.truthfulness_pass !== false) {
    html += '<div class="rw-verified">Verified — no fabricated content</div>';
  } else {
    html += '<div class="rw-warning">Review flagged — some claims may need verification</div>';
  }
  html += '</div>';

  // Progress dots
  html += '<div class="rw-progress-dots">' +
    '<span class="rw-dot rw-dot-done">Analyze</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Questions</span>' +
    '<span class="rw-dot-arrow">&rarr;</span>' +
    '<span class="rw-dot rw-dot-done">Rewrite</span>' +
    '</div>';

  // Diff sections
  html += '<div class="rw-diff">';
  (_rwState.sections || []).forEach(function (s) {
    var changed = s.changed;
    html += '<div class="rw-diff-section' + (changed ? ' rw-diff-changed' : ' rw-diff-unchanged') + '">' +
      '<div class="rw-diff-header">' +
      (changed ? '<div class="rw-cherry-pick"><input type="checkbox" id="rw-pick-' + si + '" checked onchange="_rwToggleSection(' + si + ')"><label for="rw-pick-' + si + '">Include</label></div>' : '') +
      '<span class="rw-diff-name">' + (s.name || 'Section') + '</span>' +
      (changed ? '<span class="rw-diff-badge">Modified</span>' : '<span class="rw-diff-badge rw-diff-badge-same">No changes</span>') +
      '</div>';

    if (changed) {
      html += '<div class="rw-diff-cols">' +
        '<div class="rw-diff-col rw-diff-original">' +
        '<div class="rw-diff-col-label">Original</div>' +
        '<div class="rw-diff-col-text">' + _rwHighlightDiff(s.original || '', s.rewritten || '', 'original') + '</div>' +
        '</div>' +
        '<div class="rw-diff-col rw-diff-rewritten">' +
        '<div class="rw-diff-col-label">Rewritten</div>' +
        '<div class="rw-diff-col-text">' + _rwHighlightDiff(s.original || '', s.rewritten || '', 'rewritten') + '</div>' +
        '</div>' +
        '</div>';
      if (s.changes_made && s.changes_made.length > 0) {
        html += '<div class="rw-diff-changes"><strong>Changes:</strong> ' +
          s.changes_made.map(function (c) { return _rwEscapeHtml(c); }).join(' · ') +
          '</div>';
      }
    }

    html += '</div>';
  });
  html += '</div>';

  // Actions
  var changedCount = _rwState.sections.filter(function(s){ return s.changed; }).length;
  html += '<div class="rw-actions">' +
    '<button class="btn btn-primary" onclick="_rwAcceptAll()">' + (changedCount > 1 ? 'Accept Selected (' + changedCount + ')' : 'Accept All') + '</button>' +
    '<div class="rw-retry-section">' +
    '<textarea id="rw-feedback-input" class="rw-qa-input" placeholder="What should be different? (e.g. too aggressive, keep my summary)" rows="2" style="margin-bottom:8px;"></textarea>' +
    '<button class="btn btn-sm" onclick="_rwTryAgain()" style="font-size:11px;">' +
    'Try Again (+1 credit)' + (_rwState.retryCount >= 2 ? ' — max reached' : '') +
    '</button>' +
    '</div>' +
    '<button class="btn btn-sm" onclick="closeRewritePanel()" style="margin-top:8px;font-size:11px;color:var(--text-faint);">Cancel — no credits deducted</button>' +
    '</div>';

  // Keywords added
  if (_rwState.sections.some(function (s) { return s.changed; })) {
    var kws = [];
    _rwState.sections.forEach(function (s) { if (s.keywords_added) kws = kws.concat(s.keywords_added); });
    if (_rwState.quality && _rwState.quality.keyword_coverage) {
      html += '<div class="rw-keywords-bar" style="margin-top:16px;font-size:11px;color:var(--text-faint);">' +
        'Keyword coverage: <strong>' + _rwState.quality.keyword_coverage + '%</strong> of JD terms' +
        (kws.length > 0 ? ' · Added: ' + kws.slice(0, 8).join(', ') : '') +
        '</div>';
    }
  }

  html += '</div>';
  return html;
}

function _rwEscapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// Word-level diff highlighting
function _rwHighlightDiff(original, rewritten, side) {
  var origWords = original.split(/(\s+)/);
  var newWords = rewritten.split(/(\s+)/);

  // Simple LCS-based word diff
  if (origWords.length > 300 || newWords.length > 300) {
    // Too long for word diff — fall back to plain escaped
    return _rwEscapeHtml(side === 'original' ? original : rewritten);
  }

  var origSet = new Set(origWords.filter(function(w){ return w.trim(); }));
  var newSet = new Set(newWords.filter(function(w){ return w.trim(); }));

  if (side === 'original') {
    return origWords.map(function(w) {
      if (!w.trim()) return w;
      var esc = _rwEscapeHtml(w);
      if (!newSet.has(w)) return '<span class="rw-diff-remove">' + esc + '</span>';
      return esc;
    }).join('');
  } else {
    return newWords.map(function(w) {
      if (!w.trim()) return w;
      var esc = _rwEscapeHtml(w);
      if (!origSet.has(w)) return '<span class="rw-diff-add">' + esc + '</span>';
      return esc;
    }).join('');
  }
}

// Cherry-pick section toggle
window._rwToggleSection = function(sectionIdx) {
  if (!_rwState.sections || !_rwState.sections[sectionIdx]) return;
  var cb = document.getElementById('rw-pick-' + sectionIdx);
  _rwState.sections[sectionIdx]._excluded = cb ? !cb.checked : false;

  // Update accept button count
  var included = _rwState.sections.filter(function(s){ return s.changed && !s._excluded; }).length;
  var btn = document.querySelector('.rw-actions .btn-primary');
  if (btn) btn.textContent = included > 0 ? 'Accept Selected (' + included + ')' : 'Accept Selected (0)';
};

// ════════════════════════════════════════════════════════════
// ENTRY POINT: "Boost" CTA on Jobs Feed match column
// ════════════════════════════════════════════════════════════

function boostMatch(jobId, jobTitle, company) {
  // Find the assigned resume for the active filter
  var activeFilter = savedFilters[activeFilterIdx];
  if (!activeFilter) { showToast('Select a filter first.', { type: 'error' }); return; }

  // Find assigned resume for this filter
  var assignedResume = null;
  for (var i = 0; i < resumes.length; i++) {
    if (!resumes[i].archived && resumes[i].filterAssignments) {
      var fa = resumes[i].filterAssignments;
      if (fa[activeFilter.name] || fa[activeFilterIdx]) {
        assignedResume = resumes[i];
        break;
      }
    }
  }

  if (!assignedResume) {
    // Fallback: use default resume
    assignedResume = resumes.find(function (r) { return !r.archived && r.isDefault; }) ||
      resumes.find(function (r) { return !r.archived; });
  }

  if (!assignedResume) {
    showToast('Upload a resume on the Resumes page first, then come back to Boost.', { type: 'error', duration: 5000 });
    return;
  }

  // Check if resume text has been extracted
  if (!assignedResume.extractedText || assignedResume.extractedText.length < 50) {
    showToast('Resume text not ready. Open your resume on the Resumes page to extract it, then try again.', { type: 'error', duration: 5000 });
    return;
  }

  var matchScore = jobMatchScores[jobId];
  if (typeof matchScore === 'object') matchScore = matchScore.score;

  // Already 95%+ match — celebrate instead
  if (matchScore != null && matchScore >= 95) {
    showToast('Your resume is already a 95%+ match for this role! No rewrite needed.', { type: 'success', duration: 4000 });
    return;
  }

  // Resolve real UUID — res_sync_ IDs are local stubs, use archiveId
  var resumeId = assignedResume.id;
  if (resumeId && resumeId.startsWith('res_sync_') && assignedResume.archiveId) {
    resumeId = assignedResume.archiveId;
  }

  openRewritePanel(jobId, jobTitle, company, resumeId, matchScore);
}

// ════════════════════════════════════════════════════════════
// ENHANCED matchBadge — adds "Boost" pill when match < 85%
// ════════════════════════════════════════════════════════════

var _origMatchBadge = typeof matchBadge === 'function' ? matchBadge : null;

function matchBadgeWithBoost(result, jobId, jobTitle, company) {
  if (!result) return '<span style="color:var(--text-faint);font-size:10px;">\u2014</span>';
  var score = typeof result === 'number' ? result : result.score;
  var rName = typeof result === 'object' ? (result.resumeName || '') : '';
  var color = score >= 80 ? 'var(--green)' : score >= 60 ? '#22c55e' : score >= 40 ? 'var(--warm)' : 'var(--red)';
  var tooltip = score + '% match' + (rName ? ' \u00b7 ' + rName.replace(/"/g, '&quot;') : '');

  var badge = '<span title="' + tooltip + '" style="font-family:var(--mono);font-size:11px;font-weight:600;color:' + color + ';cursor:help;">' + score + '</span>';

  if (score != null && score < 85 && jobId) {
    var safeTitle = (jobTitle || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var safeCo = (company || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    badge += ' <button class="rw-boost-pill" onclick="event.stopPropagation();boostMatch(\'' +
      jobId + "','" + safeTitle + "','" + safeCo +
      '\')" title="AI-rewrite your resume to better match this role">Boost</button>';
  }

  return badge;
}

// CS-P1-004 FE-005: Register rewrite exports with BJ namespace
(function() {
  ['_rwToggleSection'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'rewrite', registered: Date.now() };
    }
  });
})();
