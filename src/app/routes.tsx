// ============================================================
// Route Definitions (SA-013)
// ============================================================
// All authenticated routes for dashboard + admin.
//
// During migration: Every route uses LegacyPageWrapper.
// As pages are migrated (SA-014+): Replace LegacyPageWrapper
// with the real React component.
//
// Admin routes are lazy-loaded (most users never access them).
// ============================================================

import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import { AppShell } from '@shell/AppShell';
import { AuthGuard } from '@shell/AuthGuard';
import { AdminGuard } from '@shell/AdminGuard';
import { LegacyPageWrapper } from '@shell/LegacyPageWrapper';

// ── Migrated page components ──────────────────────────────
// SA-014: FeedPage, SA-015: PipelinePage + KeywordsPage
import { lazy, Suspense } from 'react';
const FeedPage = lazy(() => import('@app/pages/dashboard/feed/FeedPage'));
const PipelinePage = lazy(() => import('@app/pages/dashboard/pipeline/PipelinePage'));
const KeywordsPage = lazy(() => import('@app/pages/dashboard/keywords/KeywordsPage'));

function FeedPageRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-text-faint text-sm">Loading feed…</div>}>
      <FeedPage />
    </Suspense>
  );
}

function PipelinePageRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-text-faint text-sm">Loading pipeline…</div>}>
      <PipelinePage />
    </Suspense>
  );
}

function KeywordsPageRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-text-faint text-sm">Loading readiness…</div>}>
      <KeywordsPage />
    </Suspense>
  );
}

// ── Dashboard Legacy Routes ───────────────────────────────

function LegacyResumes() { return <LegacyPageWrapper tabId="resumes" surface="dashboard" />; }
function LegacyApplications() { return <LegacyPageWrapper tabId="applications" surface="dashboard" />; }
function LegacyStats() { return <LegacyPageWrapper tabId="stats" surface="dashboard" />; }
function LegacyTuning() { return <LegacyPageWrapper tabId="tuning" surface="dashboard" />; }
function LegacyBilling() { return <LegacyPageWrapper tabId="billing" surface="dashboard" />; }
function LegacySettings() { return <LegacyPageWrapper tabId="settings" surface="dashboard" />; }
function LegacyIntegrations() { return <LegacyPageWrapper tabId="integrations" surface="dashboard" />; }
function LegacyChat() { return <LegacyPageWrapper tabId="chat" surface="dashboard" />; }
function LegacyReferrals() { return <LegacyPageWrapper tabId="referrals" surface="dashboard" />; }

// ── Admin Legacy Routes (lazy-loaded as a group) ──────────

function LegacyAdminOverview() { return <LegacyPageWrapper tabId="overview" surface="admin" />; }
function LegacyAdminJobs() { return <LegacyPageWrapper tabId="jobs" surface="admin" />; }
function LegacyAdminCron() { return <LegacyPageWrapper tabId="cron" surface="admin" />; }
function LegacyAdminContent() { return <LegacyPageWrapper tabId="content" surface="admin" />; }
function LegacyAdminSeo() { return <LegacyPageWrapper tabId="seo" surface="admin" />; }
function LegacyAdminNotifications() { return <LegacyPageWrapper tabId="notifications" surface="admin" />; }
function LegacyAdminAgents() { return <LegacyPageWrapper tabId="agents" surface="admin" />; }
function LegacyAdminMonitoring() { return <LegacyPageWrapper tabId="monitoring" surface="admin" />; }
function LegacyAdminKillswitch() { return <LegacyPageWrapper tabId="killswitch" surface="admin" />; }
function LegacyAdminCompliance() { return <LegacyPageWrapper tabId="compliance" surface="admin" />; }

// ── Route Tree ────────────────────────────────────────────

export const routes: RouteObject[] = [
  {
    path: '/app',
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          // ── Dashboard Routes ──
          { index: true, element: <Navigate to="feed" replace /> },
          { path: 'feed', element: <FeedPageRoute /> },
          { path: 'pipeline', element: <PipelinePageRoute /> },
          { path: 'keywords', element: <KeywordsPageRoute /> },
          { path: 'resumes', element: <LegacyResumes /> },
          { path: 'applications', element: <LegacyApplications /> },
          { path: 'stats', element: <LegacyStats /> },
          { path: 'tuning', element: <LegacyTuning /> },
          { path: 'billing', element: <LegacyBilling /> },
          { path: 'settings', element: <LegacySettings /> },
          { path: 'integrations', element: <LegacyIntegrations /> },
          { path: 'chat', element: <LegacyChat /> },
          { path: 'referrals', element: <LegacyReferrals /> },

          // ── Admin Routes (role-guarded) ──
          {
            path: 'admin',
            element: <AdminGuard />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <LegacyAdminOverview /> },
              { path: 'jobs', element: <LegacyAdminJobs /> },
              { path: 'cron', element: <LegacyAdminCron /> },
              { path: 'content', element: <LegacyAdminContent /> },
              { path: 'seo', element: <LegacyAdminSeo /> },
              { path: 'notifications', element: <LegacyAdminNotifications /> },
              { path: 'agents', element: <LegacyAdminAgents /> },
              { path: 'monitoring', element: <LegacyAdminMonitoring /> },
              { path: 'killswitch', element: <LegacyAdminKillswitch /> },
              { path: 'compliance', element: <LegacyAdminCompliance /> },
            ],
          },

          // ── Catch-all → Feed ──
          { path: '*', element: <Navigate to="feed" replace /> },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(routes);
}
