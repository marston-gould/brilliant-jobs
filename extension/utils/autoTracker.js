// utils/autoTracker.js — Auto-Application Tracking to Supabase
// v3.8.0: Phase 10 (P9)
// v3.9.0: v5.41 — Confirmation tracking columns, job_id fix — On successful form submission detected
// by ApplicationTracker, automatically create/update pending_applications
// row in Supabase with status and timestamp.
//
// v3.10.0: v6.97 — Overlay Pipeline S3: Dual-write to new `pipeline` table
// on every autoTracker write. entry_source='auto_apply'. Dedup by source_url.
// pending_applications write preserved unchanged — zero regression risk.
//
// Runs in background.js service worker context.
// Receives ats:submitDetected and ats:confirmationDetected messages
// from contentScript.js (relayed through ApplicationTracker).

var BJ_AUTO_TRACKER = (function () {
  'use strict';

  // ── Pending submissions awaiting confirmation ──
  const _pendingSubmissions = {};
  const CONFIRMATION_TIMEOUT = 60000; // 60s to detect confirmation

  const SB_URL = 'https://qojhagupdnbtomfoxnsf.supabase.co';

  // ── Parse ATS source from URL ──
  function guessAtsSource(url) {
    if (!url) return 'unknown';
    try {
      const hostname = new URL(url).hostname;
      if (hostname.includes('greenhouse.io')) return 'greenhouse';
      if (hostname.includes('lever.co')) return 'lever';
      if (hostname.includes('ashbyhq.com')) return 'ashby';
      if (hostname.includes('workable.com')) return 'workable';
      if (hostname.includes('recruitee.com')) return 'recruitee';
      if (hostname.includes('linkedin.com')) return 'linkedin';
      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  // ── Extract job identifiers from URL ──
  function extractJobMeta(url) {
    if (!url) return {};
    try {
      const u = new URL(url);
      const path = u.pathname;
      const hostname = u.hostname;

      // Greenhouse: /jobs/{id} or /{company}/jobs/{id}
      if (hostname.includes('greenhouse.io')) {
        const match = path.match(/\/jobs\/(\d+)/);
        return match ? { externalJobId: match[1], atsSource: 'greenhouse' } : { atsSource: 'greenhouse' };
      }
      // Lever: /{company}/{jobId}
      if (hostname.includes('lever.co')) {
        const parts = path.split('/').filter(Boolean);
        return parts.length >= 2
          ? { externalJobId: parts[1], companySlug: parts[0], atsSource: 'lever' }
          : { atsSource: 'lever' };
      }
      // Ashby: /{company}/job/{slug}
      if (hostname.includes('ashbyhq.com')) {
        const match = path.match(/\/([^/]+)\/job\/([^/]+)/);
        return match
          ? { companySlug: match[1], externalJobId: match[2], atsSource: 'ashby' }
          : { atsSource: 'ashby' };
      }
      // Workable: /j/{id}
      if (hostname.includes('workable.com')) {
        const match = path.match(/\/j\/([A-Za-z0-9]+)/);
        return match ? { externalJobId: match[1], atsSource: 'workable' } : { atsSource: 'workable' };
      }
      // Recruitee: /o/{slug}
      if (hostname.includes('recruitee.com')) {
        const match = path.match(/\/o\/([^/]+)/);
        return match ? { externalJobId: match[1], atsSource: 'recruitee' } : { atsSource: 'recruitee' };
      }
      // LinkedIn: /jobs/view/{id}
      if (hostname.includes('linkedin.com')) {
        const match = path.match(/\/jobs\/view\/(\d+)/);
        return match ? { externalJobId: match[1], atsSource: 'linkedin' } : { atsSource: 'linkedin' };
      }

      return { atsSource: guessAtsSource(url) };
    } catch (e) {
      return { atsSource: 'unknown' };
    }
  }

  // ── Overlay Pipeline S3: Dual-write to new pipeline table ──────────────
  // Non-blocking — errors are warnings only, never affect pending_applications write
  async function _writeToNewPipeline(url, info, status, token, userId) {
    try {
      if (!url || !userId || !token) return;

      const now = new Date().toISOString();
      const jobMeta = extractJobMeta(url);
      const isConfirmed = status === 'submitted_confirmed';
      const stage = isConfirmed ? 'applied' : 'saved';

      const logEntry = {
        action: isConfirmed ? 'applied' : 'submit_detected',
        timestamp: now,
        detail: {
          status: status,
          source: 'auto_apply',
          confirmation_pattern: info.pattern || null,
        }
      };

      // Check for existing row by source_url
      const checkResp = await fetch(
        `${SB_URL}/rest/v1/pipeline?user_id=eq.${userId}&source_url=eq.${encodeURIComponent(url)}&select=id,stage,activity_log&limit=1`,
        {
          headers: {
            'apikey': token,
            'Authorization': 'Bearer ' + token,
          },
        }
      );

      if (checkResp.ok) {
        const existing = await checkResp.json();
        if (existing && existing.length > 0) {
          // Existing row: advance stage if confirmed, always append log
          const existingLog = existing[0].activity_log || [];
          const newLog = [...existingLog, logEntry];
          const updateBody = {
            activity_log: newLog,
            updated_at: now,
          };
          // Only advance stage if confirmed and current stage is 'saved'
          if (isConfirmed && existing[0].stage === 'saved') {
            updateBody.stage = 'applied';
            updateBody.stage_changed_at = now;
            updateBody.applied_at = now;
          }
          const updateResp = await fetch(
            `${SB_URL}/rest/v1/pipeline?id=eq.${existing[0].id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': token,
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify(updateBody),
            }
          );
          if (updateResp.ok) {
            console.log('[BJ_AUTO_TRACKER] pipeline table updated (stage advance):', existing[0].id);
          }
          return;
        }
      }

      // No existing row — insert new
      const insertBody = {
        user_id: userId,
        source_url: url,
        source_platform: jobMeta.atsSource || 'unknown',
        job_id_ref: jobMeta.externalJobId || null,
        ats_source_ref: jobMeta.atsSource || null,
        stage: stage,
        entry_source: 'auto_apply',
        stage_changed_at: now,
        applied_at: isConfirmed ? now : null,
        activity_log: [logEntry],
        migration_version: 1,
      };

      const insertResp = await fetch(
        `${SB_URL}/rest/v1/pipeline`,
        {
          method: 'POST',
          headers: {
            'apikey': token,
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(insertBody),
        }
      );

      if (insertResp.ok) {
        console.log('[BJ_AUTO_TRACKER] pipeline table row created for:', url.substring(0, 80));
      } else {
        const errText = await insertResp.text();
        console.warn('[BJ_AUTO_TRACKER] pipeline insert failed (non-fatal):', insertResp.status, errText);
      }
    } catch (e) {
      // Non-fatal — never let pipeline write errors affect pending_applications
      console.warn('[BJ_AUTO_TRACKER] pipeline dual-write error (non-fatal):', e.message);
    }
  }

  // ── Record a submit detection ──
  function onSubmitDetected(info) {
    const url = info.url || '';
    const tabId = info.tabId || 'unknown';
    const key = tabId + ':' + url;

    _pendingSubmissions[key] = {
      ...info,
      detectedAt: new Date().toISOString(),
      confirmed: false,
    };

    // Auto-expire after timeout
    setTimeout(() => {
      if (_pendingSubmissions[key] && !_pendingSubmissions[key].confirmed) {
        // No confirmation found — still record as "submitted" (best effort)
        _recordToSupabase(url, info, 'submitted_unconfirmed');
        delete _pendingSubmissions[key];
      }
    }, CONFIRMATION_TIMEOUT);

    return { tracked: true, key };
  }

  // ── Record a confirmation detection ──
  function onConfirmationDetected(info) {
    const url = info.submitInfo?.url || info.url || '';
    const tabId = info.tabId || info.submitInfo?.tabId || 'unknown';
    const key = tabId + ':' + url;

    // Mark as confirmed
    if (_pendingSubmissions[key]) {
      _pendingSubmissions[key].confirmed = true;
      _recordToSupabase(url, { ..._pendingSubmissions[key], ...info }, 'submitted_confirmed');
      delete _pendingSubmissions[key];
    } else {
      // Confirmation without prior submit detection — still record
      _recordToSupabase(url, info, 'submitted_confirmed');
    }

    return { tracked: true, confirmed: true };
  }

  // ── Write to Supabase pending_applications + pipeline (dual-write) ──
  async function _recordToSupabase(url, info, status) {
    try {
      // Get auth session
      const data = await chrome.storage.local.get('authSession');
      const session = data.authSession;
      if (!session?.user_id || !session?.access_token) {
        console.warn('[BJ_AUTO_TRACKER] No auth session — cannot record to Supabase');
        return { success: false, error: 'no_auth' };
      }

      const jobMeta = extractJobMeta(url);

      // ── Overlay Pipeline S3: Dual-write to new pipeline table (non-blocking) ──
      _writeToNewPipeline(url, info, status, session.access_token, session.user_id)
        .catch(e => console.warn('[BJ_AUTO_TRACKER] pipeline write failed silently:', e.message));

      // ── Primary write: pending_applications (unchanged) ──

      // Check if pending_applications row already exists for this URL + user
      const checkResp = await fetch(
        `${SB_URL}/rest/v1/pending_applications?user_id=eq.${session.user_id}&job_url=eq.${encodeURIComponent(url)}&select=id,status&limit=1`,
        {
          headers: {
            'apikey': session.access_token,
            'Authorization': 'Bearer ' + session.access_token,
          },
        }
      );

      if (checkResp.ok) {
        const existing = await checkResp.json();
        if (existing && existing.length > 0) {
          // Update existing row with new status + timestamp
          const updateResp = await fetch(
            `${SB_URL}/rest/v1/pending_applications?id=eq.${existing[0].id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': session.access_token,
                'Authorization': 'Bearer ' + session.access_token,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation',
              },
              body: JSON.stringify({
                status: status === 'submitted_confirmed' ? 'submitted' : 'pending_confirmation',
                submitted_at: new Date().toISOString(),
                submission_method: 'extension_autofill',
                extension_tracked: true,
                confirmation_detected_at: status === 'submitted_confirmed' ? new Date().toISOString() : null,
                confirmation_pattern: info.pattern || null,
              }),
            }
          );

          if (updateResp.ok) {
            console.log('[BJ_AUTO_TRACKER] Updated existing application:', existing[0].id);
            return { success: true, action: 'updated', id: existing[0].id };
          }
        }
      }

      // No existing row — create new one
      const insertResp = await fetch(
        `${SB_URL}/rest/v1/pending_applications`,
        {
          method: 'POST',
          headers: {
            'apikey': session.access_token,
            'Authorization': 'Bearer ' + session.access_token,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            user_id: session.user_id,
            job_id: (jobMeta.externalJobId || url).substring(0, 255),
            job_url: url,
            status: status === 'submitted_confirmed' ? 'submitted' : 'pending_confirmation',
            approval_mode: 'auto_no_approval',
            submitted_at: new Date().toISOString(),
            submission_method: 'extension_autofill',
            extension_tracked: true,
            ats_source: jobMeta.atsSource || null,
            external_job_id: jobMeta.externalJobId || null,
            confirmation_detected_at: status === 'submitted_confirmed' ? new Date().toISOString() : null,
            confirmation_pattern: info.pattern || null,
            idempotency_key: crypto.randomUUID(),
          }),
        }
      );

      if (insertResp.ok) {
        const inserted = await insertResp.json();
        const newId = Array.isArray(inserted) ? inserted[0]?.id : inserted?.id;
        console.log('[BJ_AUTO_TRACKER] Created new application record:', newId);
        return { success: true, action: 'created', id: newId };
      } else {
        const errText = await insertResp.text();
        console.warn('[BJ_AUTO_TRACKER] Insert failed:', insertResp.status, errText);
        return { success: false, error: errText };
      }

    } catch (e) {
      console.warn('[BJ_AUTO_TRACKER] Supabase write error:', e.message);
      return { success: false, error: e.message };
    }
  }

  // ── Manual record (called from fill success path) ──
  async function recordFillSuccess(url, atsId, fillResult) {
    return _recordToSupabase(url, {
      type: 'fill_success',
      ats: atsId,
      filledFields: fillResult?.filledFields || 0,
      totalFields: fillResult?.totalFields || 0,
    }, 'submitted_unconfirmed');
  }

  return {
    onSubmitDetected,
    onConfirmationDetected,
    recordFillSuccess,
    extractJobMeta,
    guessAtsSource,
  };
})();
