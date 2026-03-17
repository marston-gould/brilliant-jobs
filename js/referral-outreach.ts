/**
 * Brilliant Jobs — Referral Outreach v7.09
 * Part 1: Referral Request Templates (LinkedIn DM + Email)
 * Spec: pod1-referral-feature-brief.docx (March 2026)
 * PostHog events: referral_template_opened, referral_template_sent
 */

// ═══════════════════════════════════════════════════════════
// TEMPLATES
// ═══════════════════════════════════════════════════════════

var REFERRAL_TEMPLATES = {
  linkedin: {
    label: 'LinkedIn DM',
    subject: null,
    body: function(vars) {
      return [
        'Hey [THEIR_NAME],',
        '',
        'Hope things are going well on your end.' + (vars.customContext ? ' ' + vars.customContext : ''),
        '',
        'I came across an opening at [COMPANY] — [JOB_TITLE] — and it looks like a strong fit for where I am in my career right now. I noticed you work there and thought I\'d reach out before applying cold.',
        '',
        'Would you be open to sharing any perspective on the team or the role? And if it feels right to you, I\'d genuinely appreciate a referral. No pressure either way — just wanted to connect first.',
        '',
        'Thanks so much,',
        '[YOUR_NAME]'
      ].join('\n')
       .replace(/\[THEIR_NAME\]/g, vars.theirName || '[Their Name]')
       .replace(/\[YOUR_NAME\]/g, vars.yourName || '[Your Name]')
       .replace(/\[COMPANY\]/g, vars.company || '[Company]')
       .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]');
    }
  },
  email: {
    label: 'Email',
    subject: function(vars) {
      return 'Quick note — [JOB_TITLE] role at [COMPANY]'
        .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]')
        .replace(/\[COMPANY\]/g, vars.company || '[Company]');
    },
    body: function(vars) {
      return [
        'Hi [THEIR_NAME],',
        '',
        'I hope you\'re doing well.' + (vars.customContext ? ' ' + vars.customContext : ''),
        '',
        'I\'m currently exploring new opportunities and came across the [JOB_TITLE] position at [COMPANY]. Given your experience there, I wanted to reach out directly rather than apply cold.',
        '',
        'If you\'re open to it, I\'d love to hear your take on the team and the role — and if it seems like a good fit from your end, a referral would mean a lot. Totally understand if that\'s not something you\'re comfortable with.',
        '',
        'Either way, happy to catch up soon.',
        '',
        'Best,',
        '[YOUR_NAME]'
      ].join('\n')
       .replace(/\[THEIR_NAME\]/g, vars.theirName || '[Their Name]')
       .replace(/\[YOUR_NAME\]/g, vars.yourName || '[Your Name]')
       .replace(/\[COMPANY\]/g, vars.company || '[Company]')
       .replace(/\[JOB_TITLE\]/g, vars.jobTitle || '[Job Title]');
    }
  }
};

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

var _referralOutreachJob = null;
var _referralOutreachChannel = 'linkedin';

// ═══════════════════════════════════════════════════════════
// OPEN MODAL
// ═══════════════════════════════════════════════════════════

function openReferralOutreachModal(jobId) {
  // Resolve job from cache
  var job = (window.allJobs || []).find(function(j) { return j.greenhouse_id === jobId; });
  _referralOutreachJob = job || { greenhouse_id: jobId, title: '', company_name: '' };
  _referralOutreachChannel = 'linkedin';

  // Pre-fill user name from auth
  var userName = '';
  try {
    var session = window.bjSupabase && window.bjSupabase.auth && window.bjSupabase.auth.getSession
      ? null : null;
    if (window._bjUserEmail) userName = window._bjUserEmail.split('@')[0];
  } catch(e) { reportError('referral-outreach:referral-outreach', e); }

  // Render modal
  var modal = document.getElementById('referral-outreach-modal');
  if (!modal) return;

  document.getElementById('ro-job-label').textContent =
    (_referralOutreachJob.title || 'this role') + ' at ' + (_referralOutreachJob.company_name || 'this company');

  document.getElementById('ro-your-name').value = userName;
  document.getElementById('ro-their-name').value = '';
  document.getElementById('ro-custom-context').value = '';

  // Set channel tabs
  document.querySelectorAll('.ro-channel-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.channel === 'linkedin');
  });

  renderReferralTemplate();

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // PostHog
  if (window.posthog) {
    posthog.capture('referral_template_opened', {
      job_id: jobId,
      company: _referralOutreachJob.company_name,
      job_title: _referralOutreachJob.title
    });
  }
}

function closeReferralOutreachModal(e) {
  if (e && e.target !== document.getElementById('referral-outreach-modal')) return;
  _closeReferralModal();
}

function _closeReferralModal() {
  var modal = document.getElementById('referral-outreach-modal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════
// TEMPLATE RENDERING
// ═══════════════════════════════════════════════════════════

function renderReferralTemplate() {
  var job = _referralOutreachJob || {};
  var vars = {
    theirName:     (document.getElementById('ro-their-name') || {}).value || '[Their Name]',
    yourName:      (document.getElementById('ro-your-name') || {}).value || '[Your Name]',
    company:       job.company_name || '[Company]',
    jobTitle:      job.title || '[Job Title]',
    customContext: ((document.getElementById('ro-custom-context') || {}).value || '').trim()
  };

  var tpl = REFERRAL_TEMPLATES[_referralOutreachChannel];
  if (!tpl) return;

  var bodyEl = document.getElementById('ro-template-body');
  if (bodyEl) bodyEl.value = tpl.body(vars);

  var subjectRow = document.getElementById('ro-subject-row');
  var subjectEl = document.getElementById('ro-template-subject');
  if (tpl.subject) {
    if (subjectRow) subjectRow.style.display = '';
    if (subjectEl) subjectEl.value = tpl.subject(vars);
  } else {
    if (subjectRow) subjectRow.style.display = 'none';
  }

  // Update send button label
  var sendBtn = document.getElementById('ro-send-btn');
  if (sendBtn) {
    sendBtn.textContent = _referralOutreachChannel === 'linkedin'
      ? 'Copy + Open LinkedIn'
      : 'Copy + Open Mail';
  }
}

function switchReferralChannel(channel) {
  _referralOutreachChannel = channel;
  document.querySelectorAll('.ro-channel-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.channel === channel);
  });
  renderReferralTemplate();
}

// ═══════════════════════════════════════════════════════════
// SEND ACTION
// ═══════════════════════════════════════════════════════════

function sendReferralTemplate() {
  var body = (document.getElementById('ro-template-body') || {}).value || '';
  var subject = (document.getElementById('ro-template-subject') || {}).value || '';
  var theirName = (document.getElementById('ro-their-name') || {}).value || '';
  var job = _referralOutreachJob || {};

  // Copy to clipboard
  var textToCopy = _referralOutreachChannel === 'email' && subject
    ? 'Subject: ' + subject + '\n\n' + body
    : body;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy);
  } else {
    // Fallback for older browsers
    var ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch(e) { reportError('referral-outreach:referral-outreach', e); }
    document.body.removeChild(ta);
  }

  // Persist outreach record (fire-and-forget)
  (async function() {
    try {
      var sb = window.bjSupabase;
      if (!sb) return;
      var { error: rpcErr } = await sb.rpc('upsert_referral_outreach', {
        p_job_id: String(job.greenhouse_id || ''),
        p_company: job.company_name || '',
        p_job_title: job.title || '',
        p_channel: _referralOutreachChannel,
        p_their_name: theirName || null,
        p_status: 'sent'
      });
      if (rpcErr) reportError('referral-outreach:upsert', rpcErr);
      if (window.posthog) {
        posthog.capture('referral_saved', {
          job_id: job.greenhouse_id,
          channel: _referralOutreachChannel,
          status: 'sent'
        });
      }
    } catch(e) { reportError('referral-outreach:silent --- do not break send flow', e); }
  })();

  // Open destination
  if (_referralOutreachChannel === 'linkedin') {
    window.open('https://www.linkedin.com/messaging/', '_blank', 'noopener');
  } else {
    var mailtoSubject = encodeURIComponent(subject);
    var mailtoBody = encodeURIComponent(body);
    window.open('mailto:?subject=' + mailtoSubject + '&body=' + mailtoBody, '_blank');
  }

  // Show confirmation
  var sendBtn = document.getElementById('ro-send-btn');
  if (sendBtn) {
    var orig = sendBtn.textContent;
    sendBtn.textContent = 'Copied ✓';
    sendBtn.disabled = true;
    setTimeout(function() {
      sendBtn.textContent = orig;
      sendBtn.disabled = false;
    }, 2000);
  }

  // PostHog
  if (window.posthog) {
    posthog.capture('referral_template_sent', {
      job_id: job.greenhouse_id,
      company: job.company_name,
      job_title: job.title,
      channel: _referralOutreachChannel,
      has_their_name: !!theirName,
      has_custom_context: !!((document.getElementById('ro-custom-context') || {}).value || '').trim()
    });
  }
}
