/**
 * EXT-AS-7 — Dashboard → Worker Routing
 * Validates that apply-workflow.js routes submissions through the
 * headless worker for non-Recruitee ATS, keeping Recruitee on direct API.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

const applyWorkflow = readFileSync('js/apply-workflow.js', 'utf8');
const applications = readFileSync('js/applications.js', 'utf8');
const podManifest = readFileSync('docs/scaling/pod-team-manifest.md', 'utf8');
const dashboardHtml = readFileSync('dashboard.html', 'utf8');

describe('EXT-AS-7: Worker Routing Infrastructure', () => {

  it('APPLY_STATUS includes PROCESSING constant', () => {
    expect(applyWorkflow).toContain("PROCESSING: 'processing'");
  });

  it('_isRecruiteeJob helper function exists', () => {
    expect(applyWorkflow).toContain('function _isRecruiteeJob(url)');
  });

  it('_isRecruiteeJob checks for recruitee in URL', () => {
    expect(applyWorkflow).toContain("url.indexOf('recruitee') >= 0");
  });

  it('_activePollers tracking object initialized', () => {
    expect(applyWorkflow).toContain('var _activePollers = {}');
  });

  it('_routeToWorker function exists', () => {
    expect(applyWorkflow).toContain('async function _routeToWorker(app)');
  });

  it('_pollApplicationStatus function exists', () => {
    expect(applyWorkflow).toContain('function _pollApplicationStatus(appId)');
  });

  it('_stopPolling function exists', () => {
    expect(applyWorkflow).toContain('function _stopPolling(appId)');
  });

  it('_renderLiveStatus function exists', () => {
    expect(applyWorkflow).toContain('function _renderLiveStatus(appId, status, message)');
  });

  it('processApplyQueue function exists', () => {
    expect(applyWorkflow).toContain('async function processApplyQueue()');
  });
});

describe('EXT-AS-7: Polling Configuration', () => {

  it('Poll interval is 3 seconds', () => {
    expect(applyWorkflow).toContain('var POLL_INTERVAL = 3000');
  });

  it('Poll timeout is 5 minutes', () => {
    expect(applyWorkflow).toContain('var POLL_TIMEOUT = 300000');
  });

  it('Polls pending_applications table for status changes', () => {
    expect(applyWorkflow).toContain(".from('pending_applications')");
    expect(applyWorkflow).toContain(".eq('id', appId)");
  });

  it('Handles processing status during poll', () => {
    expect(applyWorkflow).toContain("data.status === 'processing'");
  });

  it('Handles submitted status during poll', () => {
    expect(applyWorkflow).toContain("data.status === 'submitted'");
  });

  it('Handles failed status during poll', () => {
    expect(applyWorkflow).toContain("data.status === 'failed'");
  });

  it('Stops polling on timeout', () => {
    expect(applyWorkflow).toContain('_stopPolling(appId)');
    expect(applyWorkflow).toContain("'timeout'");
  });
});

describe('EXT-AS-7: Recruitee Direct API Routing', () => {

  it('proceedToApply routes Recruitee through direct API', () => {
    const proceedSection = applyWorkflow.substring(
      applyWorkflow.indexOf('var savedApp = await savePendingApplication(pendingRow)'),
      applyWorkflow.indexOf('function _updatePipelineApplied')
    );
    expect(proceedSection).toContain('_isRecruiteeJob(jobUrl)');
    expect(proceedSection).toContain('callSubmitApplication(savedApp');
  });

  it('proceedToApply routes non-Recruitee through worker', () => {
    const proceedSection = applyWorkflow.substring(
      applyWorkflow.indexOf('var savedApp = await savePendingApplication(pendingRow)'),
      applyWorkflow.indexOf('function _updatePipelineApplied')
    );
    expect(proceedSection).toContain('_routeToWorker(savedApp)');
  });

  it('approvePendingApp routes Recruitee through direct API', () => {
    const approveSection = applyWorkflow.substring(
      applyWorkflow.indexOf('async function approvePendingApp(appId)'),
      applyWorkflow.indexOf('async function approveRewrittenApp(appId)')
    );
    expect(approveSection).toContain('_isRecruiteeJob(app.job_url)');
    expect(approveSection).toContain('callSubmitApplication(app');
  });

  it('approvePendingApp routes non-Recruitee through worker', () => {
    const approveSection = applyWorkflow.substring(
      applyWorkflow.indexOf('async function approvePendingApp(appId)'),
      applyWorkflow.indexOf('async function approveRewrittenApp(appId)')
    );
    expect(approveSection).toContain('_routeToWorker(app)');
  });

  it('approveRewrittenApp routes through worker for non-Recruitee', () => {
    const section = applyWorkflow.substring(
      applyWorkflow.indexOf('async function approveRewrittenApp(appId)'),
      applyWorkflow.indexOf('async function approveOriginalApp(appId)')
    );
    expect(section).toContain('_isRecruiteeJob(app.job_url)');
    expect(section).toContain('_routeToWorker(app)');
  });

  it('approveOriginalApp routes through worker for non-Recruitee', () => {
    const section = applyWorkflow.substring(
      applyWorkflow.indexOf('async function approveOriginalApp(appId)'),
      applyWorkflow.indexOf('async function skipPendingApp(appId)')
    );
    expect(section).toContain('_isRecruiteeJob(app.job_url)');
    expect(section).toContain('_routeToWorker(app)');
  });
});

describe('EXT-AS-7: Bulk Queue Processing', () => {

  it('processApplyQueue filters for PENDING status', () => {
    expect(applyWorkflow).toContain('APPLY_STATUS.PENDING');
    const section = applyWorkflow.substring(
      applyWorkflow.indexOf('async function processApplyQueue()'),
      applyWorkflow.indexOf('window.processApplyQueue')
    );
    expect(section).toContain('APPLY_STATUS.PENDING');
  });

  it('processApplyQueue routes Recruitee direct, others to worker', () => {
    const section = applyWorkflow.substring(
      applyWorkflow.indexOf('async function processApplyQueue()'),
      applyWorkflow.indexOf('window.processApplyQueue')
    );
    expect(section).toContain('_isRecruiteeJob(app.job_url)');
    expect(section).toContain('callSubmitApplication(app');
    expect(section).toContain('_routeToWorker(app)');
  });

  it('processApplyQueue tracks direct vs worker counts', () => {
    const section = applyWorkflow.substring(
      applyWorkflow.indexOf('async function processApplyQueue()'),
      applyWorkflow.indexOf('window.processApplyQueue')
    );
    expect(section).toContain('directCount');
    expect(section).toContain('workerCount');
  });

  it('applications.js Process Queue button delegates to processApplyQueue', () => {
    expect(applications).toContain('processApplyQueue()');
  });
});

describe('EXT-AS-7: Live Status Rendering', () => {

  it('_renderLiveStatus uses data-app-id selector', () => {
    expect(applyWorkflow).toContain("data-app-id=\"' + appId + '\"");
  });

  it('Uses Lucide loader-2 for queued/processing spinner', () => {
    expect(applyWorkflow).toContain('data-lucide="loader-2"');
  });

  it('Uses Lucide circle-check for submitted state', () => {
    expect(applyWorkflow).toContain('data-lucide="circle-check"');
  });

  it('Uses Lucide circle-x for failed/timeout state', () => {
    expect(applyWorkflow).toContain('data-lucide="circle-x"');
  });

  it('Calls lucide.createIcons after render', () => {
    expect(applyWorkflow).toContain("lucide.createIcons()");
  });
});

describe('EXT-AS-7: Status Loading', () => {

  it('loadPendingApplications includes processing status in query', () => {
    expect(applyWorkflow).toContain("'pending', 'approved', 'processing', 'failed'");
  });

  it('renderPendingApplications shows approved/processing cards', () => {
    expect(applyWorkflow).toContain('APPLY_STATUS.APPROVED || a.status === APPLY_STATUS.PROCESSING');
  });

  it('Approved status gets Queued for Worker badge', () => {
    expect(applyWorkflow).toContain('Queued for Worker');
  });

  it('Processing status gets Worker Submitting badge', () => {
    expect(applyWorkflow).toContain('Worker Submitting...');
  });
});

describe('EXT-AS-7: PostHog Events', () => {

  it('Captures worker_submission_queued event', () => {
    expect(applyWorkflow).toContain("'worker_submission_queued'");
  });

  it('Captures worker_submission_complete event for success', () => {
    expect(applyWorkflow).toContain("'worker_submission_complete'");
    expect(applyWorkflow).toContain("status: 'submitted'");
  });

  it('Captures worker_submission_complete event for failure', () => {
    const matches = applyWorkflow.match(/worker_submission_complete/g);
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('Captures bulk_queue_processed event', () => {
    expect(applyWorkflow).toContain("'bulk_queue_processed'");
  });

  it('Includes duration_ms in completion events', () => {
    expect(applyWorkflow).toContain('duration_ms:');
  });
});

describe('EXT-AS-7: Window Exports', () => {

  it('processApplyQueue exported to window', () => {
    expect(applyWorkflow).toContain('window.processApplyQueue = processApplyQueue');
  });

  it('_isRecruiteeJob exported to window', () => {
    expect(applyWorkflow).toContain('window._isRecruiteeJob = _isRecruiteeJob');
  });
});

describe('EXT-AS-7: Pod Team Manifest', () => {

  it('EXT-AS-7 pairing assigned', () => {
    expect(podManifest).toContain('EXT-AS-7');
  });

  it('All 5 hook-and-scar roles present', () => {
    expect(podManifest).toContain('Chief Architect');
    expect(podManifest).toContain('Lead Platform Engineer');
    expect(podManifest).toContain('System Architect — Scalability');
    expect(podManifest).toContain('Forward-Looking Developer(s)');
    expect(podManifest).toContain('Evolvability Strategist');
  });
});

describe('EXT-AS-7: Worker Infrastructure Compatibility', () => {

  it('Worker index.js polls for approved status', () => {
    if (existsSync('worker/index.js')) {
      const workerIndex = readFileSync('worker/index.js', 'utf8');
      expect(workerIndex).toContain("'approved'");
      expect(workerIndex).toContain("'processing'");
    }
  });

  it('Worker ats-router.js has null handler for Recruitee', () => {
    if (existsSync('worker/ats-router.js')) {
      const router = readFileSync('worker/ats-router.js', 'utf8');
      expect(router).toContain('recruitee');
      expect(router).toContain('handler: null');
    }
  });

  it('pending-apps-panel exists in dashboard HTML', () => {
    expect(dashboardHtml).toContain('pending-apps-panel');
  });

  it('pending-apps-body exists in dashboard HTML', () => {
    expect(dashboardHtml).toContain('pending-apps-body');
  });

  it('Process Queue button exists in dashboard HTML', () => {
    expect(dashboardHtml).toContain('a-process-queue');
  });
});

describe('EXT-AS-7: Build & Version', () => {

  it('Product version is v8.69', () => {
    const version = readFileSync('js/version.js', 'utf8');
    expect(version).toContain('8.69');
  });

  it('Dashboard bundle exists', () => {
    expect(existsSync('dist/dashboard.min.js')).toBe(true);
  });

  it('Dashboard deferred bundle exists', () => {
    expect(existsSync('dist/dashboard-deferred.min.js')).toBe(true);
  });

  it('styles.css exists (Tailwind rebuild)', () => {
    expect(existsSync('styles.css')).toBe(true);
  });
});
