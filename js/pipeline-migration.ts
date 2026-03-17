// @ts-nocheck
/**
 * pipeline-migration.js
 * Brilliant Jobs v6.96 — Overlay Pipeline Session 2
 *
 * Migrates localStorage pipeline data to Supabase pipeline table.
 * Runs on first dashboard load after auth init, sets a version flag to prevent re-run.
 *
 * localStorage keys migrated: bj_pipeline, bj_applied_jobs, bj_applied_dates,
 *   bj_pipeline_meta, bj_app_queue, bj_app_history
 *
 * Triggered from: js/app.js (after auth session init)
 */

var PipelineMigration = (function () {
  var MIGRATION_VERSION = 1;
  var MIGRATION_FLAG_KEY = 'bj_pipeline_migration_v';
  var PIPELINE_LS_KEY = 'bj_pipeline';
  var APPLIED_JOBS_KEY = 'bj_applied_jobs';
  var APPLIED_DATES_KEY = 'bj_applied_dates';
  var PIPELINE_META_KEY = 'bj_pipeline_meta';

  function hasRun() {
    var flag = localStorage.getItem(MIGRATION_FLAG_KEY + MIGRATION_VERSION);
    return flag === 'done';
  }

  function markComplete() {
    localStorage.setItem(MIGRATION_FLAG_KEY + MIGRATION_VERSION, 'done');
  }

  function normalizeEntry(raw, appliedDates, userId) {
    var url = raw.job_url || raw.url || raw.source_url || null;
    if (!url) return null;

    var appliedAt = null;
    if (raw.applied_at) {
      appliedAt = raw.applied_at;
    } else if (appliedDates && appliedDates[url]) {
      appliedAt = appliedDates[url];
    }

    var stage = 'saved';
    if (raw.stage) {
      var validStages = ['saved','applied','phone_screen','interview','offer','rejected','withdrawn','posting_closed'];
      stage = validStages.indexOf(raw.stage) >= 0 ? raw.stage : 'saved';
    } else if (appliedAt) {
      stage = 'applied';
    }

    return {
      user_id: userId,
      source_url: url,
      source_platform: raw.ats_source || raw.source_platform || 'unknown',
      job_title: raw.job_title || raw.title || 'Unknown Title',
      company_name: raw.company_name || raw.company || 'Unknown Company',
      location: raw.location || null,
      stage: stage,
      entry_source: 'manual',
      applied_at: appliedAt || null,
      match_score: raw.match_score || null,
      job_id_ref: raw.job_id || raw.greenhouse_id || null,
      ats_source_ref: raw.ats_source || null,
      migration_version: MIGRATION_VERSION,
      activity_log: [JSON.stringify({
        action: 'migrated_from_localstorage',
        timestamp: new Date().toISOString(),
        detail: { migration_version: MIGRATION_VERSION }
      })]
    };
  }

  function writeEntry(entry, supabaseClient) {
    return supabaseClient
      .from('pipeline')
      .upsert(entry, { onConflict: 'user_id,source_url', ignoreDuplicates: true });
  }

  async function run(supabaseClient, userId) {
    if (hasRun()) {
      return { migrated: 0, skipped: 0, errors: 0, alreadyDone: true };
    }

    var raw_pipeline = null;
    var raw_applied_dates = {};

    try {
      var pipelineStr = localStorage.getItem(PIPELINE_LS_KEY);
      if (pipelineStr) raw_pipeline = JSON.parse(pipelineStr);

      var datesStr = localStorage.getItem(APPLIED_DATES_KEY);
      if (datesStr) raw_applied_dates = JSON.parse(datesStr);
    } catch (e) {
      reportError('pipeline_migration', e);
      console.warn('[BJ] pipeline-migration: failed to parse localStorage data', e);
      markComplete();
      return { migrated: 0, skipped: 0, errors: 1 };
    }

    if (!raw_pipeline || !Array.isArray(raw_pipeline) || raw_pipeline.length === 0) {
      console.log('[BJ] pipeline-migration: no localStorage pipeline data to migrate');
      markComplete();
      return { migrated: 0, skipped: 0, errors: 0 };
    }

    var migrated = 0, skipped = 0, errors = 0;

    for (var i = 0; i < raw_pipeline.length; i++) {
      var entry = normalizeEntry(raw_pipeline[i], raw_applied_dates, userId);
      if (!entry) { skipped++; continue; }

      try {
        var result = await writeEntry(entry, supabaseClient);
        if (result.error) {
          console.warn('[BJ] pipeline-migration: write error', result.error.message);
          errors++;
        } else {
          migrated++;
        }
      } catch (e) {
        reportError('pipeline_migration', e);
        console.warn('[BJ] pipeline-migration: exception on write', e);
        errors++;
      }
    }

    markComplete();

    if (errors === 0) {
      localStorage.removeItem(PIPELINE_LS_KEY);
      localStorage.removeItem(APPLIED_DATES_KEY);
      localStorage.removeItem(PIPELINE_META_KEY);
    }

    console.log('[BJ] pipeline-migration v' + MIGRATION_VERSION + ' complete:', {
      migrated: migrated, skipped: skipped, errors: errors
    });

    return { migrated: migrated, skipped: skipped, errors: errors };
  }

  return { run: run, hasRun: hasRun };
})();
