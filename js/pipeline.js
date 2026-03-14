// ============================================================
// PIPELINE — Supabase-native stage tracker (Ghost Build Phase 1)
// Replaces localStorage bj_pipeline_meta with user_pipeline table.
// Maintains backward-compatible function signatures for other modules.
// ============================================================
const PL_STAGES = ['saved','applied','posting_closed','responded','interview','offer','hired','rejected','archived'];
const PL_STAGE_COLORS = {
  saved: 'var(--text-dim)', applied: 'var(--accent)', posting_closed: 'var(--warm)',
  responded: 'var(--green)', interview: 'var(--purple)', offer: 'var(--green)',
  hired: 'hsl(142,70%,35%)', rejected: 'var(--red)', archived: 'var(--text-faint)'
};
const PL_STAGE_LABELS = {
  saved:'Saved', applied:'Applied', posting_closed:'Posting Closed',
  responded:'Responded', interview:'Interview', offer:'Offer',
  hired:'Hired!', rejected:'Rejected/Ghosted', archived:'Archived'
};

// In-memory pipeline cache — populated from Supabase, keyed by job_id
let _pipelineCache = {};
let _pipelineLoaded = false;

// Overlay Pipeline S2: new pipeline table cache, keyed by source_url
// Dual-write: all pipeline mutations write to both user_pipeline and pipeline tables
let _newPipelineCache = {};   // { [source_url]: { id, stage, entry_source, activity_log, ... } }
window._newPipelineCache = _newPipelineCache; // PC-001: expose for Board view + SPA bridge
let _newPipelineLoaded = false;
window._newPipelineLoaded = false; // PC-001: expose for Board view + SPA bridge

// ── Pipeline Signals (Phase A) ─────────────────────────────────
// Pending signals keyed by pipeline_entry_id
let _pendingSignals = {};

async function loadPendingSignals() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('pipeline_signals')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'pending_confirmation')
      .order('created_at', { ascending: false });
    if (error) throw error;
    _pendingSignals = {};
    (data || []).forEach(s => {
      if (s.pipeline_entry_id) _pendingSignals[s.pipeline_entry_id] = s;
    });
    const sigCount = Object.keys(_pendingSignals).length;
    renderStalnessCards(); // FB-PI-001 S5: refresh staleness cards after signal load
    console.log('[BJ] Loaded', sigCount, 'pending pipeline signals');
    if (sigCount > 0 && typeof posthog !== 'undefined') {
      const sources = {};
      Object.values(_pendingSignals).forEach(s => { sources[s.signal_source] = (sources[s.signal_source] || 0) + 1; });
      posthog.capture('signal_detected', { count: sigCount, sources: sources });
    }
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Signal load error:', e); toastError('Failed to load pipeline signals');
  }
}

// ── FB-PI-001 S4: Untracked app confirmation cards ─────────────────────────
// Keyed by confirmation id
var _pendingConfirmations = [];

async function loadPendingConfirmations() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('pipeline_pending_confirmations')
      .select('id,signal_id,detected_company,detected_role,detected_stage,source_email_subject,source_email_date,source,created_at')
      .eq('user_id', currentUser.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    _pendingConfirmations = data || [];
    renderConfirmationCards();
  } catch (e) {
    reportError('pipeline:confirmations', e);
  }
}

function renderConfirmationCards() {
  var container = document.getElementById('pi-confirmation-cards');
  if (!container) return;
  if (!_pendingConfirmations.length) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'block';

  var STAGE_LABELS = { applied:'Applied', responded:'Responded', interview:'Interview', offer:'Offer', rejected:'Rejected' };

  var html = _pendingConfirmations.map(function(conf) {
    var dateStr = conf.source_email_date ? new Date(conf.source_email_date).toLocaleDateString('en-US', {month:'short',day:'numeric'}) : '';
    var sourceIcon = conf.source === 'calendar' ? '📅' : '✉️';
    var roleStr = conf.detected_role ? '<span style="color:var(--text-secondary);font-size:12px;margin-left:6px;">'+escHtml(conf.detected_role)+'</span>' : '';
    var subjectStr = conf.source_email_subject ? '<div style="font-size:11px;color:var(--text-secondary);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+escHtml(conf.source_email_subject.slice(0,80))+'</div>' : '';
    var stageLabel = STAGE_LABELS[conf.detected_stage] || conf.detected_stage;
    return '<div class="pi-conf-card" data-conf-id="'+conf.id+'" style="display:flex;align-items:flex-start;gap:12px;padding:12px 14px;background:var(--bg-card);border:1px solid #3B82F6;border-left:3px solid #3B82F6;border-radius:8px;margin-bottom:8px;">'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
      +     '<span style="font-size:13px;">'+sourceIcon+'</span>'
      +     '<strong style="font-size:13px;color:var(--text);">'+escHtml(conf.detected_company)+'</strong>'
      +     roleStr
      +     (dateStr ? '<span style="font-size:11px;color:var(--text-secondary);margin-left:auto;">'+dateStr+'</span>' : '')
      +   '</div>'
      +   subjectStr
      +   '<div style="margin-top:6px;font-size:11px;color:var(--text-secondary);">Detected stage: <strong>'+stageLabel+'</strong></div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">'
      +   '<button class="pi-conf-add" data-id="'+conf.id+'" data-company="'+escHtml(conf.detected_company)+'" data-role="'+escHtml(conf.detected_role||'')+'" data-stage="'+conf.detected_stage+'" style="font-size:11px;padding:4px 10px;background:#3B82F6;color:#fff;border:none;border-radius:5px;cursor:pointer;white-space:nowrap;">Add to Pipeline</button>'
      +   '<button class="pi-conf-dismiss" data-id="'+conf.id+'" style="font-size:11px;padding:4px 10px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:5px;cursor:pointer;">Dismiss</button>'
      + '</div>'
      + '</div>';
  }).join('');

  container.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;">Detected Applications</div>' + html;

  // Event delegation for add/dismiss buttons
  container.onclick = function(e) {
    var addBtn = e.target.closest('.pi-conf-add');
    var dismissBtn = e.target.closest('.pi-conf-dismiss');
    if (addBtn) {
      var id = addBtn.getAttribute('data-id');
      var company = addBtn.getAttribute('data-company');
      var role = addBtn.getAttribute('data-role');
      var stage = addBtn.getAttribute('data-stage');
      confirmPendingApp(id, company, role, stage);
    } else if (dismissBtn) {
      dismissPendingApp(dismissBtn.getAttribute('data-id'));
    }
  };
}

async function confirmPendingApp(confId, company, role, stage) {
  try {
    // 1. Create user_pipeline entry
    const now = new Date().toISOString();
    const stageCol = stage + '_at';
    const entry = {
      user_id: currentUser.id,
      company_name: company,
      company_slug: company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      stage: stage,
      stage_changed_at: now,
      [stageCol]: now,
    };
    if (role) entry.job_title = role;
    const { data: newApp, error: insertErr } = await sb.from('user_pipeline').insert(entry).select('id').single();
    if (insertErr) throw insertErr;

    // 2. Mark confirmation confirmed + store application id
    await sb.from('pipeline_pending_confirmations').update({
      status: 'confirmed',
      confirmed_application_id: newApp.id,
      resolved_at: now,
    }).eq('id', confId).eq('user_id', currentUser.id);

    if (typeof posthog !== 'undefined') posthog.capture('untracked_app_confirmed', { company, stage });
    toastSuccess('Added "' + company + '" to your pipeline.');
    await loadPendingConfirmations();
    renderPipeline();
  } catch (e) {
    reportError('pipeline:confirm_app', e);
    toastError('Failed to add application');
  }
}

async function dismissPendingApp(confId) {
  try {
    await sb.from('pipeline_pending_confirmations').update({
      status: 'dismissed',
      resolved_at: new Date().toISOString(),
    }).eq('id', confId).eq('user_id', currentUser.id);
    if (typeof posthog !== 'undefined') posthog.capture('untracked_app_dismissed');
    _pendingConfirmations = _pendingConfirmations.filter(c => c.id !== confId);
    renderConfirmationCards();
  } catch (e) {
    reportError('pipeline:dismiss_app', e);
    toastError('Failed to dismiss');
  }
}

// Export for BJ namespace
if (typeof window !== 'undefined') {
  window.loadPendingConfirmations = loadPendingConfirmations;
  window.confirmPendingApp = confirmPendingApp;
  window.dismissPendingApp = dismissPendingApp;
  window.renderConfirmationCards = renderConfirmationCards;
}

// ── FB-PI-001 S5: Staleness prompt cards + undo ─────────────────────────────
// Staleness signals are pipeline_signals with evidence_metadata.staleness_prompt=true
// They surface in loadPendingSignals() and are rendered here separately.

function renderStalnessCards() {
  var container = document.getElementById('pi-staleness-cards');
  if (!container) return;
  var stale = Object.values(_pendingSignals).filter(function(s) {
    return s.evidence_metadata && s.evidence_metadata.staleness_prompt;
  });
  if (!stale.length) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'block';

  var html = stale.map(function(s) {
    var days = (s.evidence_metadata && s.evidence_metadata.days_inactive) || '?';
    var preview = escHtml(s.evidence_preview || 'No updates in ' + days + ' days');
    var stageOptions = ['applied','responded','interview','offer','rejected'].map(function(st) {
      return '<option value="'+st+'">'+st.charAt(0).toUpperCase()+st.slice(1)+'</option>';
    }).join('');
    return '<div class="pi-stale-card" data-signal-id="'+s.id+'" style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--bg-card);border:1px solid #6B7280;border-left:3px solid #6B7280;border-radius:8px;margin-bottom:8px;flex-wrap:wrap;">'
      + '<span style="font-size:12px;color:var(--text);flex:1;min-width:200px;">'+preview+'</span>'
      + '<select class="pi-stale-stage" style="font-size:11px;padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);">'+stageOptions+'</select>'
      + '<button class="pi-stale-mark" data-id="'+s.id+'" style="font-size:11px;padding:3px 10px;background:var(--accent);color:#fff;border:none;border-radius:5px;cursor:pointer;">Mark Stage</button>'
      + '<button class="pi-stale-archive" data-id="'+s.id+'" data-entry-id="'+(s.pipeline_entry_id||'')+'" style="font-size:11px;padding:3px 10px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:5px;cursor:pointer;">Archive</button>'
      + '<button class="pi-stale-snooze" data-id="'+s.id+'" data-entry-id="'+(s.pipeline_entry_id||'')+'" style="font-size:11px;padding:3px 10px;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:5px;cursor:pointer;">Snooze 7d</button>'
      + '</div>';
  }).join('');

  container.innerHTML = '<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;">Follow-up Needed</div>' + html;

  container.onclick = function(e) {
    var markBtn = e.target.closest('.pi-stale-mark');
    var archBtn = e.target.closest('.pi-stale-archive');
    var snoozeBtn = e.target.closest('.pi-stale-snooze');
    var card = e.target.closest('.pi-stale-card');

    if (markBtn && card) {
      var stage = card.querySelector('.pi-stale-stage').value;
      var signalId = markBtn.getAttribute('data-id');
      dismissStaleSignal(signalId, 'confirmed', stage);
    } else if (archBtn) {
      var signalId = archBtn.getAttribute('data-id');
      var entryId = archBtn.getAttribute('data-entry-id');
      archiveFromStalePrompt(signalId, entryId);
    } else if (snoozeBtn) {
      var signalId = snoozeBtn.getAttribute('data-id');
      var entryId = snoozeBtn.getAttribute('data-entry-id');
      snoozeStalePrompt(signalId, entryId);
    }
  };
}

async function dismissStaleSignal(signalId, action, correctedStage) {
  try {
    await sb.from('pipeline_signals').update({
      status: 'confirmed', resolved_at: new Date().toISOString(),
      user_response: action, user_responded_at: new Date().toISOString(),
    }).eq('id', signalId).eq('user_id', currentUser.id);

    if (correctedStage) {
      var sig = Object.values(_pendingSignals).find(function(s) { return s.id === signalId; });
      if (sig && sig.pipeline_entry_id && correctedStage !== sig.evidence_metadata?.current_stage) {
        var now = new Date().toISOString();
        var upd = { stage: correctedStage, stage_changed_at: now };
        upd[correctedStage + '_at'] = now;
        await sb.from('user_pipeline').update(upd).eq('id', sig.pipeline_entry_id).eq('user_id', currentUser.id);
      }
    }
    if (typeof posthog !== 'undefined') posthog.capture('staleness_prompt_resolved', { action: action, stage: correctedStage });
    await loadPendingSignals();
    renderStalnessCards();
    renderPipeline();
  } catch (e) {
    reportError('pipeline:stale_dismiss', e);
    toastError('Failed to update');
  }
}

async function archiveFromStalePrompt(signalId, entryId) {
  try {
    var now = new Date().toISOString();
    if (entryId) {
      await sb.from('user_pipeline').update({
        stage: 'archived', archived_at: now, stage_changed_at: now,
      }).eq('id', entryId).eq('user_id', currentUser.id);
    }
    await sb.from('pipeline_signals').update({
      status: 'confirmed', resolved_at: now, user_response: 'confirmed',
    }).eq('id', signalId).eq('user_id', currentUser.id);
    if (typeof posthog !== 'undefined') posthog.capture('staleness_prompt_archived');
    await loadPendingSignals();
    renderStalnessCards();
    renderPipeline();
  } catch (e) {
    reportError('pipeline:stale_archive', e);
    toastError('Failed to archive');
  }
}

async function snoozeStalePrompt(signalId, entryId) {
  try {
    if (entryId) {
      await sb.from('user_pipeline').update({
        last_prompted_at: new Date().toISOString(),
      }).eq('id', entryId).eq('user_id', currentUser.id);
    }
    await sb.from('pipeline_signals').update({
      status: 'dismissed', resolved_at: new Date().toISOString(),
    }).eq('id', signalId).eq('user_id', currentUser.id);
    if (typeof posthog !== 'undefined') posthog.capture('staleness_prompt_snoozed', { days: 7 });
    await loadPendingSignals();
    renderStalnessCards();
  } catch (e) {
    reportError('pipeline:stale_snooze', e);
    toastError('Failed to snooze');
  }
}

// ── Undo auto-archive (48h window) ───────────────────────────────────────────
// Looks for pipeline_signals with auto_archive=true + undo_expires_at > now
// Renders undo toast at top of Board tab
async function loadAutoArchiveUndo() {
  if (!currentUser?.id) return;
  try {
    var cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    var { data } = await sb.from('pipeline_signals')
      .select('id, previous_stage, evidence_preview, evidence_metadata, created_at')
      .eq('user_id', currentUser.id)
      .eq('signal_type', 'MANUAL')
      .eq('action_taken', 'auto_moved')
      .gt('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(3);
    renderUndoToasts(data || []);
  } catch (e) {
    reportError('pipeline:load_undo', e);
  }
}

function renderUndoToasts(signals) {
  var container = document.getElementById('pi-undo-toasts');
  if (!container) return;
  var autoArchived = signals.filter(function(s) { return s.evidence_metadata && s.evidence_metadata.auto_archive; });
  if (!autoArchived.length) { container.innerHTML = ''; container.style.display = 'none'; return; }
  container.style.display = 'block';
  container.innerHTML = autoArchived.map(function(s) {
    var preview = escHtml(s.evidence_preview || 'Application archived');
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:#065F46;color:#fff;border-radius:6px;margin-bottom:6px;font-size:12px;">'
      + '<span style="flex:1;">'+preview+'</span>'
      + '<button data-signal-id="'+s.id+'" data-prev-stage="'+(s.previous_stage||'applied')+'" class="pi-undo-btn" style="font-size:11px;padding:3px 10px;background:rgba(255,255,255,.2);color:#fff;border:1px solid rgba(255,255,255,.4);border-radius:5px;cursor:pointer;white-space:nowrap;">Undo</button>'
      + '</div>';
  }).join('');

  container.onclick = function(e) {
    var btn = e.target.closest('.pi-undo-btn');
    if (btn) undoAutoArchive(btn.getAttribute('data-signal-id'), btn.getAttribute('data-prev-stage'));
  };
}

async function undoAutoArchive(signalId, prevStage) {
  try {
    // Find the signal to get the pipeline_entry_id
    var { data: sig } = await sb.from('pipeline_signals').select('pipeline_entry_id, evidence_metadata').eq('id', signalId).single();
    var entryId = sig?.pipeline_entry_id || (sig?.evidence_metadata?.entry_id);

    if (entryId) {
      var now = new Date().toISOString();
      var upd = { stage: prevStage || 'applied', stage_changed_at: now, archived_at: null };
      await sb.from('user_pipeline').update(upd).eq('id', entryId).eq('user_id', currentUser.id);
    }
    // Mark signal as dismissed so it won't show again
    await sb.from('pipeline_signals').update({ action_taken: 'dismissed' }).eq('id', signalId);
    if (typeof posthog !== 'undefined') posthog.capture('auto_archive_undone', { prev_stage: prevStage });
    toastSuccess('Application restored to ' + (prevStage || 'pipeline'));
    await loadAutoArchiveUndo();
    renderPipeline();
  } catch (e) {
    reportError('pipeline:undo_archive', e);
    toastError('Failed to undo');
  }
}

// ── Backward stage movement logging (spec §6.3) ───────────────────────────
// Wrap movePipelineStage to log MANUAL signal for backward transitions
var _origMovePipelineStage = typeof movePipelineStage !== 'undefined' ? movePipelineStage : null;
var _PI_STAGE_ORDER = ['saved','applied','posting_closed','responded','interview','offer','hired','rejected','archived'];

function logManualStageMove(entryId, fromStage, toStage) {
  if (!currentUser?.id || !entryId) return;
  var fromIdx = _PI_STAGE_ORDER.indexOf(fromStage);
  var toIdx = _PI_STAGE_ORDER.indexOf(toStage);
  if (fromIdx < 0 || toIdx < 0) return;  // unknown stage
  // Only log backward movements (per spec §6.3)
  if (toIdx >= fromIdx) return;
  sb.from('pipeline_signals').insert({
    user_id: currentUser.id,
    pipeline_entry_id: entryId,
    signal_source: 'user_override',
    signal_type: 'MANUAL',
    proposed_stage: toStage,
    confidence: 1.0,
    confidence_level: 'high',
    evidence_preview: 'Manual stage change: ' + fromStage + ' → ' + toStage,
    action_taken: 'confirmed',
    target_stage: toStage,
    previous_stage: fromStage,
    status: 'auto',
  }).then(function() {}).catch(function(e) { reportError('pipeline:manual_move', e); });
}

if (typeof window !== 'undefined') {
  window.renderStalnessCards = renderStalnessCards;
  window.dismissStaleSignal = dismissStaleSignal;
  window.archiveFromStalePrompt = archiveFromStalePrompt;
  window.snoozeStalePrompt = snoozeStalePrompt;
  window.loadAutoArchiveUndo = loadAutoArchiveUndo;
  window.renderUndoToasts = renderUndoToasts;
  window.undoAutoArchive = undoAutoArchive;
  window.logManualStageMove = logManualStageMove;
}

async function confirmPipelineSignal(signalId, action, correctedStage) {
  try {
    // PostHog: track signal actions
    const sig = Object.values(_pendingSignals).find(s => s.id === signalId);
    const phEvent = action === 'confirm' ? 'signal_confirmed'
      : action === 'correct' ? 'signal_confirmed'
      : action === 'dismiss' ? 'signal_dismissed'
      : action === 'snooze' ? 'prompt_snoozed' : 'signal_action';
    if (typeof posthog !== 'undefined') {
      posthog.capture(phEvent, {
        signal_id: signalId,
        signal_source: sig?.signal_source || 'unknown',
        signal_type: sig?.signal_type || 'unknown',
        proposed_stage: sig?.proposed_stage,
        corrected_stage: correctedStage || null,
        action: action,
      });
    }

    const token = (await sb.auth.getSession())?.data?.session?.access_token;
    const resp = await fetch(sb.supabaseUrl + '/functions/v1/confirm-pipeline-signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ signal_id: signalId, action: action, corrected_stage: correctedStage })
    });
    if (!resp.ok) throw new Error(await resp.text());
    // Refresh signals and pipeline
    await loadPendingSignals();
    await loadPipelineFromSupabase();
    renderPipeline();
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Signal confirm error:', e); toastError('Failed to update signal');
  }
}

// ── Supabase-backed getter (replaces getPipelineMeta) ──────────
function getPipelineMeta() {
  // Returns the in-memory cache for synchronous access (backward compat).
  // Cache is populated by loadPipelineFromSupabase() on init.
  return _pipelineCache;
}

// ── Load pipeline from Supabase into memory cache ──────────────
async function loadPipelineFromSupabase() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('user_pipeline')
      .select('*')
      .eq('user_id', currentUser.id);
    if (error) throw error;
    _pipelineCache = {};
    // Also rebuild legacy global arrays for cross-module compat
    savedJobIds.length = 0;
    appliedJobIds.length = 0;
    (data || []).forEach(row => {
      const key = row.job_id || row.id; // job_id preferred, fallback to uuid
      _pipelineCache[key] = {
        _dbId: row.id,              // Supabase row ID for updates
        stage: row.stage,
        savedAt: row.saved_at,
        appliedAt: row.applied_at,
        respondedAt: row.responded_at,
        interviewAt: row.interview_at,
        offerAt: row.offer_at,
        hiredAt: row.hired_at,
        rejectedAt: row.rejected_at,
        archivedAt: row.archived_at,
        resumeUsed: row.resume_used || '',
        filterTags: row.filter_tags || [],
        matchScore: row.match_score,
        companyName: row.company_name || '',
        company: row.company_name || '',
        title: row.job_title || '',
        salaryEstimate: row.salary_estimate,
        notes: row.notes || '',
        autoAdvanced: row.auto_advanced || false,
        autoAdvancedSource: row.auto_advanced_source || null,
        atsSource: row.ats_source || 'greenhouse',
        companySlug: row.company_slug || '',
        companyDomain: row.company_domain || '',
        jobUrl: row.job_url || '',
        tracking_mode: row.tracking_mode || 'auto',
        status_note: row.status_note || null,
        custom_reminder_at: row.custom_reminder_at || null,
        lastPromptedAt: row.last_prompted_at || null,
        promptCount: row.prompt_count || 0,
        stageChangedAt: row.stage_changed_at || null,
        jobTitle: row.job_title || '',
      };
      // Populate legacy arrays
      if (row.stage !== 'saved') appliedJobIds.push(key);
      savedJobIds.push(key);
    });
    _pipelineLoaded = true;
    console.log('[BJ] Pipeline loaded from Supabase:', data?.length || 0, 'entries');
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Pipeline load error:', e); toastError('Failed to load your pipeline');
    // Fallback: try localStorage if Supabase fails
    _pipelineCache = safeReadLS('bj_pipeline_meta', {});
  }
}


// ── Overlay Pipeline S2: Load new pipeline table into memory ──────────────
async function loadNewPipelineFromSupabase() {
  if (!currentUser?.id) return;
  try {
    const { data, error } = await sb.from('pipeline')
      .select('id, source_url, source_platform, job_title, company_name, location, stage, entry_source, activity_log, match_score, fraud_score, ai_content_score, job_id_ref, ats_source_ref, applied_at, created_at, updated_at')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    _newPipelineCache = {};
    (data || []).forEach(row => {
      _newPipelineCache[row.source_url] = row;
    });
    _newPipelineLoaded = true;
    window._newPipelineLoaded = true;
    console.log('[BJ] New pipeline table loaded:', data?.length || 0, 'entries');
  } catch (e) {
    reportError('pipeline', e);
    console.warn('[BJ] New pipeline load error (non-fatal):', e);
  }
}

// ── Overlay Pipeline S2: Write to new pipeline table ─────────────────────
// Called on every pipeline mutation — dual-write alongside user_pipeline
// entry: { source_url, job_title, company_name, stage, entry_source, activity_log_entry?, ... }
async function saveToNewPipeline(entry) {
  if (!currentUser?.id || !entry?.source_url) return;
  const now = new Date().toISOString();
  const existing = _newPipelineCache[entry.source_url];

  // Build activity log entry for this action
  const logEntry = {
    action: entry._activity_action || 'stage_updated',
    timestamp: now,
    detail: { stage: entry.stage, source: entry.entry_source || 'manual' }
  };
  const existingLog = existing?.activity_log || [];
  const newLog = [...existingLog, logEntry];

  const row = {
    user_id: currentUser.id,
    source_url: entry.source_url,
    source_platform: entry.source_platform || existing?.source_platform || 'unknown',
    job_title: entry.job_title || existing?.job_title || 'Unknown Title',
    company_name: entry.company_name || existing?.company_name || 'Unknown Company',
    location: entry.location || existing?.location || null,
    stage: entry.stage || existing?.stage || 'saved',
    stage_changed_at: now,
    entry_source: entry.entry_source || existing?.entry_source || 'manual',
    activity_log: newLog,
    job_id_ref: entry.job_id_ref || existing?.job_id_ref || null,
    ats_source_ref: entry.ats_source_ref || existing?.ats_source_ref || null,
    match_score: entry.match_score ?? existing?.match_score ?? null,
    fraud_score: entry.fraud_score ?? existing?.fraud_score ?? null,
    ai_content_score: entry.ai_content_score ?? existing?.ai_content_score ?? null,
    applied_at: entry.applied_at || existing?.applied_at || null,
    updated_at: now
  };

  try {
    const { data, error } = await sb.from('pipeline')
      .upsert(row, { onConflict: 'user_id,source_url' })
      .select('id')
      .single();
    if (error) throw error;
    // Update local cache
    _newPipelineCache[entry.source_url] = { ...row, id: data?.id || existing?.id };
    window._newPipelineCache = _newPipelineCache; // keep window ref in sync
  } catch (e) {
    reportError('pipeline', e);
    console.warn('[BJ] New pipeline write error (non-fatal):', e);
  }
}

// ── Overlay Pipeline S2: Get new pipeline row by source_url ──────────────
function getNewPipelineEntry(sourceUrl) {
  return _newPipelineCache[sourceUrl] || null;
}

// ── Save single pipeline entry to Supabase (replaces savePipelineMeta) ──
async function savePipelineEntry(jobId, meta) {
  if (!currentUser?.id) return;
  _pipelineCache[jobId] = meta;
  const row = {
    user_id: currentUser.id,
    job_id: jobId,
    ats_source: meta.atsSource || 'greenhouse',
    company_slug: meta.companySlug || meta.company || jobId,
    company_domain: meta.companyDomain || null,
    job_title: meta.title || meta.jobTitle || 'Untitled',
    job_url: meta.jobUrl || null,
    stage: meta.stage || 'saved',
    saved_at: meta.savedAt || new Date().toISOString(),
    applied_at: meta.appliedAt || null,
    responded_at: meta.respondedAt || null,
    interview_at: meta.interviewAt || null,
    offer_at: meta.offerAt || null,
    hired_at: meta.hiredAt || null,
    rejected_at: meta.rejectedAt || null,
    archived_at: meta.archivedAt || null,
    auto_advanced: meta.autoAdvanced || false,
    auto_advanced_source: meta.autoAdvancedSource || null,
    notes: meta.notes || null,
    filter_tags: meta.filterTags || [],
    resume_used: meta.resumeUsed || null,
    match_score: meta.matchScore || null,
    company_name: meta.companyName || meta.company || null,
    salary_estimate: meta.salaryEstimate || null,
  };

  try {
    const { data, error } = await sb.from('user_pipeline')
      .upsert(row, { onConflict: 'user_id, job_id, ats_source' })
      .select('id')
      .single();
    if (error) throw error;
    if (data) {
      var isNew = !meta._dbId;
      meta._dbId = data.id;
      // A14 Session 3: invalidate feed/stats caches after pipeline mutation
      if (typeof invalidateCache === 'function') { invalidateCache('feed:'); invalidateCache('stats:'); invalidateCache('pipeline:'); }
      if (isNew && typeof posthog !== 'undefined') {
        posthog.capture('pipeline_entry_created', {
          job_id: jobId,
          stage: meta.stage || 'saved',
          company: meta.companyName || meta.company || '',
          ats_source: meta.atsSource || 'greenhouse'
        });
      }
    }
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Pipeline save error:', e); toastError('Failed to save pipeline changes');
  }
}

// Legacy compat wrapper — saves entire cache (avoid using, prefer savePipelineEntry)
function savePipelineMeta(meta) {
  _pipelineCache = meta;
  // Batch save is async but we don't await here for backward compat
}

// ── One-time localStorage → Supabase migration ────────────────
async function migratePipelineToSupabase() {
  if (!currentUser?.id) return;

  // Check if already migrated — if Supabase has data, skip
  const existing = await safeQuery(() => sb.from('user_pipeline').select('id').eq('user_id', currentUser.id).limit(1), { label: 'pipeline:user_pipeline', fallback: [] });
  if (existing?.length) {
    console.log('[BJ] Pipeline already in Supabase, skipping migration');
    return false;
  }

  // Read localStorage data
  const localMeta = safeReadLS('bj_pipeline_meta', {});
  const localApplied = safeReadLS('bj_applied_jobs', []);
  const localSaved = safeReadLS('bj_saved_jobs', []);
  const localDates = safeReadLS('bj_applied_dates', {});

  const allIds = new Set([...Object.keys(localMeta), ...localApplied, ...localSaved]);
  if (allIds.size === 0) {
    console.log('[BJ] No localStorage pipeline data to migrate');
    return false;
  }

  console.log('[BJ] Migrating', allIds.size, 'pipeline entries to Supabase...');

  // Fetch job data for company info
  const idList = Array.from(allIds);
  let jobMap = {};
  for (let i = 0; i < idList.length; i += 100) {
    const batch = idList.slice(i, i + 100);
    try {
      const data = await safeQuery(() => sb.from('ats_jobs').select('greenhouse_id, title, company_name, ats_source, status')
        .in('greenhouse_id', batch), { label: 'pipeline:ats_jobs', fallback: [] });
      if (data) data.forEach(j => { jobMap[j.greenhouse_id] = j; });
    } catch (e) { reportError('pipeline', e); console.error('[BJ] Migration fetch error:', e); toastWarning('Pipeline migration data fetch failed'); }
  }

  // Build rows
  const rows = [];
  for (const jobId of allIds) {
    const m = localMeta[jobId] || {};
    const job = jobMap[jobId];
    const isApplied = localApplied.includes(jobId);
    rows.push({
      user_id: currentUser.id,
      job_id: jobId,
      ats_source: job?.ats_source || 'greenhouse',
      company_slug: m.companySlug || job?.company_name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || jobId,
      job_title: m.title || job?.title || 'Unknown',
      company_name: m.company || m.companyName || job?.company_name || null,
      stage: m.stage || (isApplied ? 'applied' : 'saved'),
      saved_at: m.savedAt || localDates[jobId] || new Date().toISOString(),
      applied_at: m.appliedAt || (isApplied ? (localDates[jobId] || new Date().toISOString()) : null),
      responded_at: m.respondedAt || null,
      interview_at: m.interviewAt || null,
      offer_at: m.offerAt || null,
      hired_at: m.hiredAt || null,
      rejected_at: m.rejectedAt || null,
      filter_tags: m.filterTags || [],
      resume_used: m.resumeUsed || null,
      match_score: typeof m.matchScore === 'number' ? m.matchScore : null,
      salary_estimate: m.salaryEstimate || null,
    });
  }

  // Batch upsert
  const { error } = await sb.from('user_pipeline')
    .upsert(rows, { onConflict: 'user_id, job_id, ats_source' });

  if (error) {
    console.error('[BJ] Pipeline migration error:', error); toastWarning('Pipeline migration encountered an issue');
    return false;
  }

  // Clean up localStorage
  localStorage.removeItem('bj_pipeline_meta');
  localStorage.removeItem('bj_applied_jobs');
  localStorage.removeItem('bj_saved_jobs');
  localStorage.removeItem('bj_applied_dates');
  console.log('[BJ] ✅ Migrated', rows.length, 'pipeline entries to Supabase');
  return true;
}

// ── Initialize pipeline (call from app.js init) ──────────────
async function initPipeline() {
  await migratePipelineToSupabase();
  await loadPipelineFromSupabase();
  await loadNewPipelineFromSupabase(); // S10: wire overlay pipeline load on init
  await loadPendingSignals();
  await loadPendingConfirmations(); // FB-PI-001 S4
  await loadAutoArchiveUndo();       // FB-PI-001 S5
  // BUGFIX: Update hero Pipeline count after data loads (was never set on init)
  var heroSaved = $('#j-saved');
  if (heroSaved) heroSaved.textContent = savedJobIds.length.toLocaleString();
}

// ── Move job to a new stage ──────────────────────────────────
function movePipelineStage(jobId, newStage) {
  const meta = _pipelineCache[jobId];
  if (!meta) {
    _pipelineCache[jobId] = { savedAt: new Date().toISOString(), filterTags: [], stage: newStage };
  } else {
    meta.stage = newStage;
  }
  const m = _pipelineCache[jobId];

  // Track stage dates
  const now = new Date().toISOString();
  if (newStage === 'applied' && !m.appliedAt) m.appliedAt = now;
  // Auto-set resume when moving to applied (if not already set)
  if (newStage === 'applied' && !m.resumeUsed && typeof resumes !== 'undefined') {
    var _filterTags = m.filterTags || [];
    var bestResume = null;
    for (var ri = 0; ri < resumes.length; ri++) {
      var _r = resumes[ri];
      if (_r.archived) continue;
      var _rFilters = _r.filterIds || [];
      var filterMatch = _filterTags.length > 0 && _filterTags.some(function(t) { return _rFilters.includes(t); });
      if (filterMatch) { bestResume = _r; break; }
      if (!bestResume) bestResume = _r; // fallback: first active resume
    }
    if (bestResume) m.resumeUsed = bestResume.name;
  }
  if (newStage === 'responded' && !m.respondedAt) m.respondedAt = now;
  if (newStage === 'interview' && !m.interviewAt) m.interviewAt = now;
  if (newStage === 'offer' && !m.offerAt) m.offerAt = now;
  if (newStage === 'hired' && !m.hiredAt) {
    m.hiredAt = now;
    if (typeof confirmHireFee === 'function') {
      var jobTitle = m.title || jobId;
      var salary = m.salaryEstimate || 80000;
      confirmHireFee(jobId, jobTitle, salary);
    }
    // Phase 16 S6: auto-pause passive mode on hired
    if (typeof autoHirePause === 'function') {
      autoHirePause(m.title || jobId);
    }
  }
  if (newStage === 'rejected' && !m.rejectedAt) m.rejectedAt = now;
  if (newStage === 'archived' && !m.archivedAt) m.archivedAt = now;

  // Save to Supabase (async, non-blocking for UI)
  savePipelineEntry(jobId, m);

  // PostHog: track stage changes
  if (typeof posthog !== 'undefined') {
    posthog.capture('pipeline_stage_changed', {
      job_id: jobId,
      new_stage: newStage,
      company: m.companyName || '',
      company_domain: m.companyDomain || ''
    });
  }

  // Keep legacy arrays in sync
  if (newStage !== 'saved' && !appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
  }
  renderPipeline();
}

// ── Mark applied from feed ───────────────────────────────────
function markApplied(jobId, btn) {
  showResumePicker(jobId, function(resumeName) {
    _completeMarkApplied(jobId, btn, resumeName);
  });
}

function _completeMarkApplied(jobId, btn, resumeName) {
  if (!appliedJobIds.includes(jobId)) {
    appliedJobIds.push(jobId);
    if (btn) {
      const row = btn.closest('tr');
      if (row) {
        const actionsCell = row.querySelector('td:last-child');
        if (actionsCell) {
          const hideBtn = actionsCell.querySelector('.hide-btn');
          const hideBtnHtml = hideBtn ? hideBtn.outerHTML : '';
          actionsCell.innerHTML = '<span class="job-action-btn applied-btn">Applied \u2713</span>' + hideBtnHtml;
        }
      }
    }
  }

  // Update pipeline
  const meta = _pipelineCache[jobId] || { savedAt: new Date().toISOString(), filterTags: [] };
  meta.stage = 'applied';
  if (!meta.appliedAt) meta.appliedAt = new Date().toISOString();
  if (resumeName) meta.resumeUsed = resumeName;

  // Detect filter tags
  const sf = safeReadLS('bj_saved_filters', []);
  const checkedFilters = Array.from($$('.sf-check:checked')).map(cb => sf[parseInt(cb.dataset.idx)]?.name).filter(Boolean);
  meta.filterTags = checkedFilters;

  _pipelineCache[jobId] = meta;
  savePipelineEntry(jobId, meta);

  // Post-application confidence micro-survey
  if (typeof showApplyConfidence === 'function') {
    showApplyConfidence(jobId, meta.companyName || '');
  }
}

function markAppliedFromPipeline(jobId, btn) {
  markApplied(jobId, btn);
  renderPipeline();
}

// ── Remove from pipeline ─────────────────────────────────────
async function unsaveFromPipeline(jobId) {
  const meta = _pipelineCache[jobId];
  delete _pipelineCache[jobId];

  // Remove from Supabase
  if (currentUser?.id) {
    try {
      var { error: delErr } = await sb.from('user_pipeline')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('job_id', jobId);
      if (delErr) { reportError('pipeline:delete', delErr); toastError('Failed to remove pipeline entry'); }
    } catch (e) { reportError('pipeline:delete', e); toastError('Failed to remove pipeline entry'); }
  }

  // A14 Session 3: invalidate feed/stats caches after pipeline removal
  if (typeof invalidateCache === 'function') { invalidateCache('feed:'); invalidateCache('stats:'); invalidateCache('pipeline:'); }

  // Update legacy arrays
  const idx = savedJobIds.indexOf(jobId);
  if (idx >= 0) savedJobIds.splice(idx, 1);
  const aidx = appliedJobIds.indexOf(jobId);
  if (aidx >= 0) appliedJobIds.splice(aidx, 1);
  const el = $('#j-saved');
  if (el) el.textContent = savedJobIds.length.toLocaleString();
  renderPipeline();
}

// ── Assign a resume to a pipeline entry ──────────────────────
function setPipelineResume(jobId, resumeName) {
  const meta = _pipelineCache[jobId];
  if (!meta) return;
  meta.resumeUsed = resumeName;
  savePipelineEntry(jobId, meta);
  renderPipeline();
}

// ── Handle resume picker change (includes upload option) ─────
window.handlePipelineResumeChange = function(jobId, selectEl) {
  var val = selectEl.value;
  if (val === '__upload__') {
    // Navigate to Resumes tab for upload
    selectEl.value = '';
    var resumeNav = document.querySelector('[data-page="resumes"]');
    if (resumeNav) resumeNav.click();
    if (typeof showToast === 'function') showToast('Upload a resume, then return to assign it.');
    return;
  }
  setPipelineResume(jobId, val);
};

// ── Collapse toggle ──────────────────────────────────────────
function togglePipelineStage(headerEl) {
  const section = headerEl.closest('.pl-stage-section');
  section.classList.toggle('collapsed');
  const states = safeReadLS('bj_pl_collapse', {});
  states[section.dataset.stage] = section.classList.contains('collapsed');
  localStorage.setItem('bj_pl_collapse', JSON.stringify(states));
}

// ── Filter by saved filter tag ───────────────────────────────
let _plActiveFilter = 'all';
function filterPipeline(tag) {
  _plActiveFilter = tag;
  renderPipeline();
}

function buildPipelineFilterTags() {
  const sf = safeReadLS('bj_saved_filters', []);
  const select = $('#pl-filter-select');
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="all">All Filters</option>';
  sf.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.name;
    opt.textContent = f.name;
    select.appendChild(opt);
  });
  select.value = currentVal || 'all';
}

// ── Main render ──────────────────────────────────────────────
async function renderPipeline() {
  const meta = _pipelineCache;
  const allIds = Object.keys(meta);
  if (allIds.length === 0) {
    PL_STAGES.forEach(stage => {
      const body = document.getElementById('pb-' + stage);
      if (body) body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      const count = document.getElementById('pc-' + stage);
      if (count) count.textContent = '0';
    });
    return;
  }

  // Fetch all pipeline jobs from Supabase (for supplementary data like status)
  const batchSize = 100;
  let allJobData = [];
  for (let i = 0; i < allIds.length; i += batchSize) {
    const batch = allIds.slice(i, i + batchSize);
    try {
      const data = await safeQuery(() => sb.from('ats_jobs').select('greenhouse_id, title, company_name, location, loc_display, status, closed_at, first_seen_at, content, salary_min, salary_max')
        .in('greenhouse_id', batch), { label: 'pipeline:ats_jobs', fallback: [] });
      if (data) allJobData = allJobData.concat(data);
    } catch (e) { reportError('pipeline', e); console.error('[BJ] Pipeline fetch error:', e); toastWarning('Some pipeline job details failed to load'); }
  }

  const jobMap = {};
  allJobData.forEach(j => { jobMap[j.greenhouse_id] = j; });

  // Auto-detect posting_closed
  allJobData.forEach(j => {
    if (j.status === 'closed' && meta[j.greenhouse_id] && meta[j.greenhouse_id].stage === 'applied') {
      meta[j.greenhouse_id].stage = 'posting_closed';
      savePipelineEntry(j.greenhouse_id, meta[j.greenhouse_id]);
    }
  });

  const now = new Date();
  const sf = safeReadLS('bj_saved_filters', []);
  const collapseStates = safeReadLS('bj_pl_collapse', {});

  // Group by stage
  const stageJobs = {};
  PL_STAGES.forEach(s => { stageJobs[s] = []; });
  let totalTracked = 0, activeCount = 0, respondedCount = 0, totalDaysToResponse = 0;

  for (const [jobId, m] of Object.entries(meta)) {
    const stage = m.stage || 'saved';
    if (!stageJobs[stage]) continue;
    if (_plActiveFilter !== 'all' && !(m.filterTags || []).includes(_plActiveFilter)) continue;
    const job = jobMap[jobId];
    stageJobs[stage].push({ id: jobId, meta: m, job: job || null });
    totalTracked++;
    if (['applied','responded','interview'].includes(stage)) activeCount++;
    if (m.respondedAt && m.appliedAt) {
      respondedCount++;
      totalDaysToResponse += Math.floor((new Date(m.respondedAt) - new Date(m.appliedAt)) / 86400000);
    }
  }

  // Render each stage
  for (const stage of PL_STAGES) {
    const jobs = stageJobs[stage];
    const body = document.getElementById('pb-' + stage);
    const countEl = document.getElementById('pc-' + stage);
    const matchEl = document.getElementById('pm-' + stage);
    const section = body?.closest('.pl-stage-section');

    if (countEl) countEl.textContent = jobs.length;
    if (section && collapseStates[stage]) section.classList.add('collapsed');

    // Signal count badge on stage header
    const pendingCount = jobs.filter(j => j.meta._dbId && _pendingSignals[j.meta._dbId]).length;
    const badgeEl = document.getElementById('psig-' + stage);
    if (badgeEl) {
      if (pendingCount > 0) {
        badgeEl.textContent = pendingCount + ' signal' + (pendingCount > 1 ? 's' : '') + ' pending';
        badgeEl.style.display = '';
      } else {
        badgeEl.style.display = 'none';
      }
    }

    const scores = jobs.map(j => j.meta.matchScore).filter(s => typeof s === 'number');
    if (matchEl) {
      if (scores.length > 0) {
        const median = scores.sort((a,b) => a - b)[Math.floor(scores.length / 2)];
        matchEl.textContent = 'Match: ' + Math.min(...scores) + '% – ' + median + '% – ' + Math.max(...scores) + '%';
      } else {
        matchEl.textContent = '';
      }
    }

    if (!body) continue;
    if (jobs.length === 0) {
      body.innerHTML = '<div class="pl-stage-empty">No jobs in this stage</div>';
      continue;
    }

    let html = '<table class="pl-table"><thead><tr>';
    html += '<th></th><th>Title</th><th>Company</th><th>Level</th><th>Discovered</th><th>Days In Stage</th>';
    html += '<th>Filter</th><th>Resume</th><th>Match</th><th></th><th>Move</th><th></th>';
    html += '</tr></thead><tbody>';

    for (const item of jobs) {
      const j = item.job;
      const m = item.meta;
      const title = m.title || (j ? (j.title || 'Untitled') : 'Unknown job');
      const company = m.companyName || m.company || (j ? (j.company_name || '') : '');
      // Persist job info in meta for hire fee and analytics
      if (j && !m.title) { m.title = title; m.company = company; }
      if (j && j.salary_max && !m.salaryEstimate) { m.salaryEstimate = j.salary_max; }
      const discovered = j?.first_seen_at ? new Date(j.first_seen_at).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : '—';

      // Job level detection
      const levelInfo = typeof getJobLevel === 'function' ? getJobLevel(title, window._activeLevelHierarchy || levelHierarchy || []) : null;
      const levelCell = levelInfo
        ? '<span class="level-badge" style="background:' + levelInfo.color + '20;color:' + levelInfo.color + ';">' + levelInfo.label + '</span>'
        : '—';

      // Auto-match resume: find a resume with matching filter + level
      let resumeName = m.resumeUsed || '';
      if (!resumeName && typeof resumes !== 'undefined') {
        var _filterTags = m.filterTags || [];
        var _levelLabel = levelInfo ? levelInfo.label : '';
        // Try filter+level match first, then filter-only, then level-only
        var bestResume = null;
        for (var ri = 0; ri < resumes.length; ri++) {
          var _r = resumes[ri];
          if (_r.archived) continue;
          var _rFilters = _r.filterIds || [];
          var _rLevels = _r.levelLabels || (_r.levelLabel ? [_r.levelLabel] : []);
          var filterMatch = _filterTags.length > 0 && _filterTags.some(function(t) { return _rFilters.includes(t); });
          var levelMatch = _levelLabel && _rLevels.includes(_levelLabel);
          if (filterMatch && levelMatch) { bestResume = _r; break; }
          if (filterMatch && !bestResume) bestResume = _r;
          if (levelMatch && !bestResume) bestResume = _r;
        }
        if (bestResume) {
          resumeName = bestResume.name;
          // Persist auto-match so it sticks
          m.resumeUsed = resumeName;
          savePipelineEntry(item.id, m);
        }
      }

      const stageDate = m.respondedAt ? new Date(m.respondedAt) :
                        m.appliedAt ? new Date(m.appliedAt) :
                        m.savedAt ? new Date(m.savedAt) : null;
      const daysInStage = stageDate ? Math.floor((now - stageDate) / 86400000) : '—';

      let staleDot = '';
      const dbId = m._dbId; // Supabase row ID for signal lookup
      const pendingSig = dbId ? _pendingSignals[dbId] : null;
      const terminalStages = ['offer', 'rejected', 'archived', 'hired'];

      if (terminalStages.includes(stage)) {
        // Gray — terminal state
        staleDot = '<span class="pl-dot pl-dot-gray" title="Complete"></span>';
      } else if (pendingSig && pendingSig.signal_source !== 'time_based') {
        // Blue pulsing — signal detected (Gmail/Calendar/ATS)
        staleDot = '<span class="pl-dot pl-dot-blue" title="Signal detected — click to confirm" data-signal-id="' + pendingSig.id + '" onclick="toggleSignalCard(this)"></span>';
      } else if (pendingSig && pendingSig.signal_source === 'time_based') {
        // Yellow — prompt due
        staleDot = '<span class="pl-dot pl-dot-yellow" title="Prompt due — click to update" data-signal-id="' + pendingSig.id + '" onclick="toggleSignalCard(this)"></span>';
      } else if (typeof daysInStage === 'number') {
        const staleRules = {
          saved:     { yellow: 5, red: 7 },
          applied:   { yellow: 7, red: 14 },
          posting_closed: { yellow: 3, red: 7 },
          responded: { yellow: 7, red: 14 },
          interview: { yellow: 7, red: 14 },
        };
        const rule = staleRules[stage];
        if (rule) {
          if (daysInStage >= rule.red) {
            staleDot = '<span class="pl-dot pl-dot-red" title="' + daysInStage + 'd — needs attention"></span>';
          } else if (daysInStage >= rule.yellow) {
            staleDot = '<span class="pl-dot pl-dot-yellow" title="' + daysInStage + 'd in stage"></span>';
          } else {
            staleDot = '<span class="pl-dot pl-dot-green" title="On track"></span>';
          }
        } else {
          staleDot = '<span class="pl-dot pl-dot-green" title="On track"></span>';
        }
      }

      const filterBadges = (m.filterTags || []).map(tag => {
        const idx = sf.findIndex(f => f.name === tag);
        const color = idx >= 0 ? filterColors[idx % filterColors.length] : 'var(--text-faint)';
        return '<span class="pl-filter-badge" style="background:' + color + '15;color:' + color + ';border:1px solid ' + color + '30;">' + tag + '</span>';
      }).join(' ');

      const matchScore = typeof m.matchScore === 'number' ? m.matchScore + '%' : '—';
      const matchColor = typeof m.matchScore === 'number' ? (m.matchScore >= 70 ? 'color:var(--green);' : m.matchScore >= 40 ? 'color:var(--warm);' : 'color:var(--red);') : '';

      let moveOpts = PL_STAGES.filter(s => s !== stage).map(s =>
        '<option value="' + s + '">' + PL_STAGE_LABELS[s] + '</option>'
      ).join('');

      html += '<tr data-jobid="' + item.id + '">';
      html += '<td style="width:16px;text-align:center;padding:4px 2px;">' + staleDot + '</td>';
      html += '<td class="pl-title" onclick="openJobModal(\'' + item.id + '\')" title="' + title.replace(/"/g, '&quot;') + '">' + (title.length > 35 ? title.slice(0,35) + '…' : title) + '</td>';
      html += '<td class="pl-company" title="' + company.replace(/"/g, '&quot;') + '">' + (company.length > 20 ? company.slice(0,20) + '…' : company) + '</td>';
      html += '<td>' + levelCell + '</td>';
      html += '<td class="pl-date">' + discovered + '</td>';
      html += '<td class="pl-days">' + daysInStage + (typeof daysInStage === 'number' ? 'd' : '') + '</td>';
      html += '<td>' + (filterBadges || '<span style="color:var(--text-faint);font-size:10px;">—</span>') + '</td>';

      // Resume cell — stage-aware rendering
      var lockedResumeStages = ['applied', 'responded', 'interview', 'posting_closed', 'offer', 'hired', 'rejected', 'archived'];
      if (lockedResumeStages.includes(stage)) {
        // Post-apply: show static resume name (locked)
        if (resumeName) {
          html += '<td><span class="pl-resume-badge" title="' + resumeName + '">' + (resumeName.length > 15 ? resumeName.slice(0,15) + '…' : resumeName) + '</span></td>';
        } else {
          html += '<td><span style="color:var(--text-faint);font-size:10px;">—</span></td>';
        }
      } else {
        // Saved: picker with auto-matched preselected + upload option
        var resumeOpts = '<option value="">— Pick —</option>';
        if (typeof resumes !== 'undefined') {
          for (var _ri2 = 0; _ri2 < resumes.length; _ri2++) {
            if (resumes[_ri2].archived) continue;
            var _sel = resumes[_ri2].name === resumeName ? ' selected' : '';
            resumeOpts += '<option value="' + resumes[_ri2].name.replace(/"/g, '&quot;') + '"' + _sel + '>' + resumes[_ri2].name + '</option>';
          }
        }
        resumeOpts += '<option value="__upload__">↑ Upload new…</option>';
        if (resumeName) {
          html += '<td><span class="pl-resume-badge" title="' + resumeName + '" style="cursor:pointer;" onclick="this.style.display=\'none\';this.nextElementSibling.style.display=\'inline-block\'">' + (resumeName.length > 15 ? resumeName.slice(0,15) + '…' : resumeName) + '</span>';
          html += '<select class="pl-move-select" style="display:none;font-size:10px;" onchange="handlePipelineResumeChange(\'' + item.id + '\',this)">' + resumeOpts + '</select></td>';
        } else {
          html += '<td><select class="pl-move-select" style="font-size:10px;" onchange="handlePipelineResumeChange(\'' + item.id + '\',this)">' + resumeOpts + '</select></td>';
        }
      }

      html += '<td class="pl-match" style="' + matchColor + '">' + matchScore + '</td>';

      // Apply CTA
      var applyUrl = m.jobUrl || (j ? (j.url && j.url.startsWith('http') ? j.url : j.url ? 'https://boards.greenhouse.io' + j.url : '') : '');
      if (applyUrl && stage === 'saved') {
        html += '<td><a href="' + applyUrl + '" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none;font-size:10px;font-weight:600;padding:4px 10px;border-radius:6px;background:var(--accent);color:#fff;white-space:nowrap;" onclick="event.stopPropagation();movePipelineStage(\'' + item.id + '\',\'applied\')">Apply →</a></td>';
      } else if (applyUrl) {
        html += '<td><a href="' + applyUrl + '" target="_blank" rel="noopener" style="font-size:10px;color:var(--accent);text-decoration:none;" onclick="event.stopPropagation()">View →</a></td>';
      } else {
        html += '<td></td>';
      }

      html += '<td><select class="pl-move-select" onchange="movePipelineStage(\'' + item.id + '\', this.value)"><option value="">Move…</option>' + moveOpts + '</select></td>';
      html += '<td style="position:relative;">';
      html += '<button class="job-action-btn hide-btn pl-menu-trigger" onclick="togglePlMenu(this,\'' + item.id + '\')" style="padding:2px 8px;font-size:12px;" title="Actions">⋮</button>';
      html += '<div class="pl-menu" id="plmenu-' + item.id + '">';
      html += '<div class="pl-menu-item" onclick="findRecruiters(\'' + item.id + '\')" data-recruiter-btn="' + item.id + '">Find Recruiters</div>';
      html += '<div class="pl-menu-item" onclick="setTrackingMode(\'' + item.id + '\',\'' + (m.tracking_mode === 'muted' ? 'auto' : 'muted') + '\')">' + (m.tracking_mode === 'muted' ? 'Unmute prompts' : 'Mute prompts') + '</div>';
      html += '<div class="pl-menu-item" onclick="showCustomReminder(\'' + item.id + '\')">Set custom reminder</div>';
      html += '<div class="pl-menu-item" onclick="showStatusNote(\'' + item.id + '\')">Add status note</div>';
      html += '<div class="pl-menu-sep"></div>';
      html += '<div class="pl-menu-item pl-menu-danger" onclick="unsaveFromPipeline(\'' + item.id + '\')">Remove from pipeline</div>';
      html += '</div>';
      if (m.status_note) html += '<div class="pl-status-note" title="' + m.status_note.replace(/"/g, '&quot;') + '">📌</div>';
      if (m.tracking_mode === 'muted') html += '<div style="font-size:8px;color:var(--text-faint);position:absolute;bottom:-2px;right:2px;">🔇</div>';
      html += '</td>';
      html += '</tr>';

      // Inline signal card (hidden by default, toggled by dot click)
      if (pendingSig) {
        const isSignal = pendingSig.signal_source !== 'time_based';
        const isCalendar = pendingSig.signal_source === 'calendar';
        const borderColor = isSignal ? 'var(--accent)' : 'var(--warm)';
        const icon = isCalendar ? '📅' : isSignal ? '✉' : '⏰';
        const headerText = isCalendar
          ? 'Interview detected for ' + title + ' at ' + company
          : isSignal
            ? 'Activity detected for ' + title + ' at ' + company
            : 'Time to check in on ' + title + ' at ' + company;
        const evidence = pendingSig.evidence_preview || '';
        // Interview round badge from calendar metadata
        const meta = pendingSig.evidence_metadata || {};
        const roundLabel = meta.interview_round
          ? { final: 'Final Round', onsite: 'On-site', panel: 'Panel', technical: 'Technical', hm: 'Hiring Manager', phone_screen: 'Phone Screen', intro: 'Intro', '1': 'Round 1', '2': 'Round 2', late: 'Late Stage' }[meta.interview_round] || meta.interview_round
          : null;

        html += '<tr class="pl-signal-row" id="signal-card-' + pendingSig.id + '" style="display:none;">';
        html += '<td colspan="12" style="padding:0;">';
        html += '<div class="pl-signal-card" style="border-left:3px solid ' + borderColor + ';">';
        html += '<div class="pl-signal-header"><span class="pl-signal-icon">' + icon + '</span> ' + headerText + '</div>';
        if (evidence) html += '<div class="pl-signal-evidence">' + evidence + '</div>';
        if (roundLabel) html += '<div class="pl-signal-round"><span class="pl-round-badge">' + roundLabel + '</span></div>';
        if (pendingSig.confidence) {
          const confPct = Math.round(pendingSig.confidence * 100);
          const confColor = confPct >= 80 ? 'var(--green)' : confPct >= 60 ? 'var(--warm)' : 'var(--red)';
          html += '<div class="pl-signal-confidence" style="color:' + confColor + ';font-size:11px;margin:2px 0;">' + confPct + '% confidence</div>';
        }

        if (isSignal && pendingSig.proposed_stage) {
          // Signal confirmation: Confirm / Different stage / Dismiss
          html += '<div class="pl-signal-proposed">Move: <strong>' + (PL_STAGE_LABELS[stage] || stage) + ' → ' + (PL_STAGE_LABELS[pendingSig.proposed_stage] || pendingSig.proposed_stage) + '</strong></div>';
          html += '<div class="pl-signal-actions">';
          html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'confirm\')">Confirm</button>';
          html += '<button class="pl-sig-btn pl-sig-correct" onclick="showStageCorrector(\'' + pendingSig.id + '\', this)">Different stage</button>';
          html += '<button class="pl-sig-btn pl-sig-dismiss" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'dismiss\')">Dismiss</button>';
          html += '</div>';
        } else {
          // Time-based prompt: quick actions
          html += '<div class="pl-signal-actions">';
          if (stage === 'saved') {
            html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'applied\')">Applied</button>';
          } else if (stage === 'applied') {
            html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'responded\')">Got a response</button>';
            html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'interview\')">Interview scheduled</button>';
            html += '<button class="pl-sig-btn pl-sig-dismiss" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'rejected\')">Rejected</button>';
          } else if (stage === 'responded') {
            html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'interview\')">Interview scheduled</button>';
          } else if (stage === 'interview') {
            html += '<button class="pl-sig-btn pl-sig-confirm" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'offer\')">Got an offer</button>';
            html += '<button class="pl-sig-btn pl-sig-dismiss" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'rejected\')">Rejected</button>';
          }
          html += '<button class="pl-sig-btn pl-sig-snooze" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'snooze\')">No update yet</button>';
          html += '<button class="pl-sig-btn pl-sig-dismiss" onclick="confirmPipelineSignal(\'' + pendingSig.id + '\', \'correct\', \'archived\')">Archive</button>';
          html += '</div>';
        }
        html += '</div></td></tr>';
      }
    }

    html += '</tbody></table>';
    body.innerHTML = html;
  }

  // Update stats
  const appliedAndBeyond = stageJobs.applied.length + stageJobs.posting_closed.length + stageJobs.responded.length + stageJobs.interview.length + stageJobs.offer.length + stageJobs.rejected.length;
  const el1 = $('#p-total'); if (el1) el1.textContent = totalTracked;
  const el2 = $('#p-active'); if (el2) el2.textContent = activeCount;
  const responseRate = appliedAndBeyond > 0 ? Math.round((respondedCount / appliedAndBeyond) * 100) + '%' : '—';
  const el3 = $('#p-response'); if (el3) el3.textContent = responseRate;
  const avgDays = respondedCount > 0 ? Math.round(totalDaysToResponse / respondedCount) + 'd' : '—';
  const el4 = $('#p-avg-days'); if (el4) el4.textContent = avgDays;

  if (typeof updatePipelineNavDot === 'function') updatePipelineNavDot();
}

// Legacy compat
async function renderPipelineSaved() { await renderPipeline(); }

function addToPipeline(jobId, row) {
  const meta = _pipelineCache[jobId] || { stage: 'applied', savedAt: new Date().toISOString(), filterTags: [] };
  meta.stage = 'applied';
  if (!meta.appliedAt) meta.appliedAt = new Date().toISOString();
  _pipelineCache[jobId] = meta;
  savePipelineEntry(jobId, meta);
}

// ── Migrated pipeline data init (replaces old migratePipelineData) ──
function migratePipelineData() {
  // No-op — migration now handled by migratePipelineToSupabase() in initPipeline()
  console.log('[BJ] Pipeline migration handled by initPipeline()');
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return diffDays + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Pipeline Signal UI (Phase A) ─────────────────────────────
// Relative time helper (e.g. "3d ago", "2h ago")
function _relTime(isoStr) {
  if (!isoStr) return '—';
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function toggleSignalCard(dotEl) {
  const signalId = dotEl.getAttribute('data-signal-id');
  const row = document.getElementById('signal-card-' + signalId);
  if (!row) return;
  row.style.display = row.style.display === 'none' ? '' : 'none';
}

function showStageCorrector(signalId, btnEl) {
  // Replace button with stage picker dropdown
  const parent = btnEl.parentElement;
  const select = document.createElement('select');
  select.className = 'pl-move-select';
  select.style.marginLeft = '4px';
  const stages = ['saved','applied','responded','interview','offer','rejected','archived'];
  const labels = PL_STAGE_LABELS;
  select.innerHTML = '<option value="">Pick stage…</option>' +
    stages.map(s => '<option value="' + s + '">' + (labels[s] || s) + '</option>').join('');
  select.onchange = function() {
    if (this.value) confirmPipelineSignal(signalId, 'correct', this.value);
  };
  btnEl.replaceWith(select);
}

// ── Per-Application Overrides (Phase D) ──────────────────────
function togglePlMenu(btn, jobId) {
  // Close any other open menus
  document.querySelectorAll('.pl-menu.open').forEach(m => m.classList.remove('open'));
  const menu = document.getElementById('plmenu-' + jobId);
  if (menu) menu.classList.toggle('open');
  // Close on outside click
  const closer = (e) => {
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.classList.remove('open');
      document.removeEventListener('click', closer);
    }
  };
  setTimeout(() => document.addEventListener('click', closer), 10);
}

async function setTrackingMode(jobId, mode) {
  const meta = _pipelineCache[jobId];
  if (!meta?._dbId) return;
  meta.tracking_mode = mode;
  try {
    var { error: trkErr } = await sb.from('user_pipeline').update({ tracking_mode: mode }).eq('id', meta._dbId);
    if (trkErr) { reportError('pipeline:tracking-mode', trkErr); toastError('Failed to change tracking mode'); return; }
    renderPipeline();
  } catch (e) { reportError('pipeline:tracking-mode', e); toastError('Failed to change tracking mode'); }
}

function showCustomReminder(jobId) {
  const meta = _pipelineCache[jobId];
  if (!meta?._dbId) return;
  const dateStr = prompt('Remind me about this on (YYYY-MM-DD):', new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]);
  if (!dateStr) return;
  const date = new Date(dateStr + 'T10:00:00');
  if (isNaN(date.getTime())) { alert('Invalid date'); return; }
  meta.custom_reminder_at = date.toISOString();
  sb.from('user_pipeline').update({ custom_reminder_at: date.toISOString() }).eq('id', meta._dbId)
    .then(() => renderPipeline())
    .catch(e => { reportError('pipeline', e); console.error('[BJ] Custom reminder error:', e); toastError('Failed to set reminder'); });
}

function showStatusNote(jobId) {
  const meta = _pipelineCache[jobId];
  if (!meta?._dbId) return;
  const note = prompt('Status note (e.g., "Waiting on background check"):', meta.status_note || '');
  if (note === null) return; // cancelled
  meta.status_note = note || null;
  sb.from('user_pipeline').update({ status_note: note || null }).eq('id', meta._dbId)
    .then(() => renderPipeline())
    .catch(e => { reportError('pipeline', e); console.error('[BJ] Status note error:', e); toastError('Failed to save note'); });
}

// ── Manual Pipeline Entry ────────────────────────────────────
function showManualPipelineAdd() {
  const form = document.getElementById('pl-manual-add');
  if (form) form.style.display = '';
  // Populate resume dropdown
  var resumeSelect = document.getElementById('pl-man-resume');
  if (resumeSelect && typeof resumes !== 'undefined') {
    var html = '<option value="">— Select resume —</option>';
    for (var i = 0; i < resumes.length; i++) {
      if (resumes[i].archived) continue;
      html += '<option value="' + resumes[i].name.replace(/"/g, '&quot;') + '">' + resumes[i].name + '</option>';
    }
    html += '<option value="__upload__">↑ Upload new…</option>';
    resumeSelect.innerHTML = html;
    resumeSelect.onchange = function() {
      if (this.value === '__upload__') {
        this.value = '';
        var resumeNav = document.querySelector('[data-page="resumes"]');
        if (resumeNav) resumeNav.click();
        if (typeof showToast === 'function') showToast('Upload a resume, then return to add your job.');
      }
    };
  }
}

function hideManualPipelineAdd() {
  const form = document.getElementById('pl-manual-add');
  if (form) form.style.display = 'none';
  ['pl-man-title', 'pl-man-company', 'pl-man-url'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  var resumeSelect = document.getElementById('pl-man-resume');
  if (resumeSelect) resumeSelect.selectedIndex = 0;
}

async function saveManualPipelineEntry() {
  if (!currentUser?.id) return;
  const title = (document.getElementById('pl-man-title')?.value || '').trim();
  const company = (document.getElementById('pl-man-company')?.value || '').trim();
  const url = (document.getElementById('pl-man-url')?.value || '').trim();
  const stage = document.getElementById('pl-man-stage')?.value || 'applied';
  const resumeUsed = (document.getElementById('pl-man-resume')?.value || '').trim();

  if (!title || !company) {
    alert('Job title and company name are required.');
    return;
  }
  // Resume required for any stage past saved
  if (stage !== 'saved' && !resumeUsed) {
    alert('Please select a resume for this application. If you don\'t have one uploaded, use "Upload new…" to add it first.');
    return;
  }

  // Generate a unique ID for this manual entry (not a real ats_jobs ID)
  const manualId = 'manual-' + crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();

  // Derive company domain from URL or name
  let companyDomain = '';
  if (url) {
    try { companyDomain = new URL(url).hostname.replace('www.', ''); } catch(e) { reportError('pipeline:pipeline', e); }
  }
  if (!companyDomain) {
    companyDomain = company.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
  }

  const row = {
    user_id: currentUser.id,
    job_id: manualId,
    ats_source: 'manual',
    stage: stage,
    saved_at: now,
    applied_at: stage !== 'saved' ? now : null,
    responded_at: ['responded', 'interview', 'offer'].includes(stage) ? now : null,
    interview_at: ['interview', 'offer'].includes(stage) ? now : null,
    offer_at: stage === 'offer' ? now : null,
    stage_changed_at: now,
    company_name: company,
    company_domain: companyDomain,
    job_title: title,
    job_url: url || null,
    resume_used: resumeUsed || null,
    tracking_mode: 'auto',
    notes: 'Manually added',
  };

  try {
    const { data, error } = await sb.from('user_pipeline')
      .insert(row)
      .select('id')
      .single();
    if (error) throw error;

    // Add to local cache
    _pipelineCache[manualId] = {
      _dbId: data.id,
      stage: stage,
      savedAt: now,
      appliedAt: row.applied_at,
      respondedAt: row.responded_at,
      interviewAt: row.interview_at,
      companyName: company,
      company: company,
      title: title,
      companyDomain: companyDomain,
      jobUrl: url,
      resumeUsed: resumeUsed || null,
      notes: 'Manually added',
      atsSource: 'manual',
      filterTags: [],
      tracking_mode: 'auto',
    };

    hideManualPipelineAdd();
    renderPipeline();
    console.log('[BJ] Manual pipeline entry added:', manualId);
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Manual add error:', e); toastError('Failed to add pipeline entry');
    alert('Failed to add: ' + (e.message || 'Unknown error'));
  }
}

// ── Recruiter Email Discovery (Item #19, v5.52) ─────────────
// Calls recruiter-lookup Edge Function to find recruiter contacts via Hunter.io

async function findRecruiters(jobId) {
  if (!currentUser?.id) return;
  const meta = _pipelineCache[jobId];
  if (!meta) return;

  const company = meta.companyName || meta.company || '';
  const domain = meta.companyDomain || '';

  if (!domain || domain === 'unknown.com') {
    toastWarning('No company domain available for recruiter lookup');
    return;
  }

  // Show loading state on the button
  const btn = document.querySelector(`[data-recruiter-btn="${jobId}"]`);
  if (btn) { btn.textContent = 'Searching…'; btn.disabled = true; }

  try {
    const session = await sb.auth.getSession();
    const token = session?.data?.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const resp = await fetch(sb.supabaseUrl + '/functions/v1/recruiter-lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'apikey': sb.supabaseKey,
      },
      body: JSON.stringify({
        company_name: company,
        domain: domain,
        company_id: null,
      }),
    });

    const result = await resp.json();

    if (!resp.ok) {
      throw new Error(result.error || `HTTP ${resp.status}`);
    }

    if (result.contacts && result.contacts.length > 0) {
      showRecruiterResults(jobId, company, result.contacts, result.source === 'cached');
      console.log('[BJ] Recruiter lookup:', result.message);
    } else {
      toastWarning('No recruiter contacts found for ' + company);
    }
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Recruiter lookup error:', e);
    toastError('Recruiter lookup failed: ' + e.message);
  } finally {
    if (btn) { btn.textContent = 'Find Recruiters'; btn.disabled = false; }
  }
}

function showRecruiterResults(jobId, company, contacts, cached) {
  // Remove any existing recruiter card for this job
  const existingCard = document.getElementById('rc-card-' + jobId);
  if (existingCard) existingCard.remove();

  const row = document.querySelector(`tr[data-jobid="${jobId}"]`);
  if (!row) return;

  const card = document.createElement('tr');
  card.id = 'rc-card-' + jobId;
  card.className = 'pl-recruiter-row';

  let contactsHtml = contacts.map(c => {
    const name = c.recruiter_name || 'Unknown';
    const email = c.recruiter_email || '';
    const title = c.recruiter_title || '';
    const confidence = c.confidence_score || 0;
    const confColor = confidence >= 80 ? 'var(--green)' : confidence >= 60 ? 'var(--warm)' : 'var(--red)';
    const linkedIn = c.linkedin_url ? `<a href="${c.linkedin_url}" target="_blank" style="font-size:10px;color:var(--accent);">LinkedIn</a>` : '';

    return `<div class="rc-contact" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--border-faint);">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:12px;">${name}</div>
        <div style="font-size:11px;color:var(--text-dim);">${title}</div>
      </div>
      <div style="font-size:11px;">
        <a href="mailto:${email}" style="color:var(--accent);">${email}</a>
      </div>
      <div style="font-size:10px;color:${confColor};white-space:nowrap;">${confidence}%</div>
      ${linkedIn ? `<div>${linkedIn}</div>` : ''}
    </div>`;
  }).join('');

  const sourceLabel = cached ? '(cached)' : '(via Hunter.io)';

  card.innerHTML = `<td colspan="12" style="padding:0;">
    <div style="background:var(--bg-card);border-left:3px solid var(--accent);padding:10px 14px;margin:2px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-weight:600;font-size:12px;">Recruiter Contacts for ${company} <span style="font-weight:400;color:var(--text-faint);font-size:10px;">${sourceLabel}</span></span>
        <button onclick="this.closest('tr').remove()" style="background:none;border:none;color:var(--text-faint);cursor:pointer;font-size:14px;" title="Close">✕</button>
      </div>
      <div class="rc-contacts">${contactsHtml}</div>
    </div>
  </td>`;

  row.after(card);
}

// Load all recruiter contacts for current user (for pipeline enrichment)
async function loadRecruiterContacts() {
  if (!currentUser?.id) return {};
  try {
    const data = await safeQuery(() => sb.from('recruiter_contacts').select('company_name, recruiter_email, recruiter_name, recruiter_title, confidence_score')
      .eq('user_id', currentUser.id)
      .order('confidence_score', { ascending: false })
      .limit(200), { label: 'pipeline:recruiter_contacts', fallback: [] });
    if (!data) return {};
    const byCompany = {};
    data.forEach(c => {
      const key = (c.company_name || '').toLowerCase();
      if (!byCompany[key]) byCompany[key] = [];
      byCompany[key].push(c);
    });
    return byCompany;
  } catch (e) {
    reportError('pipeline', e);
    console.error('[BJ] Load recruiter contacts error:', e);
    return {};
  }
}


// CS-P1-004 FE-005: Register pipeline exports with BJ namespace
(function() {
  // Cross-chunk exports: keywords.js calls these before pipeline chunk may be loaded
  window.renderPipeline = renderPipeline;
  window.loadPipelineFromSupabase = loadPipelineFromSupabase;
  window.getPipelineMeta = getPipelineMeta;
  window.savePipelineMeta = savePipelineMeta;
  ['_newPipelineCache','_newPipelineLoaded'].forEach(function(name) {
    if (typeof window[name] === 'function') {
      window.BJ[name] = window[name];
      window.BJ._registry[name] = { module: 'pipeline', registered: Date.now() };
    }
  });
})();
