// ============================================================
// Route Definitions (SA-013, updated SA-017)
// ============================================================
// All authenticated routes for dashboard + admin.
//
// SA-017: All 22 pages migrated to React + TypeScript.
// LegacyPageWrapper no longer referenced in any route.
// Can be deleted after SA-017 validation.
//
// All pages are lazy-loaded for optimal code splitting.
// ============================================================

import {
  createBrowserRouter,
  Navigate,
  type RouteObject,
} from 'react-router-dom';
import { AppShell } from '@shell/AppShell';
import { AuthGuard } from '@shell/AuthGuard';
import { AdminGuard } from '@shell/AdminGuard';

// ── Lazy-loaded page components ─────────────────────────────
import { lazy, Suspense } from 'react';

// Dashboard pages (SA-014 → SA-017)
const FeedPage = lazy(() => import('@app/pages/dashboard/feed/FeedPage'));
const PipelinePage = lazy(() => import('@app/pages/dashboard/pipeline/PipelinePage'));
const KeywordsPage = lazy(() => import('@app/pages/dashboard/keywords/KeywordsPage'));
const ResumesPage = lazy(() => import('@app/pages/dashboard/resumes/ResumesPage'));
const ApplicationsPage = lazy(() => import('@app/pages/dashboard/applications/ApplicationsPage'));
const StatsPage = lazy(() => import('@app/pages/dashboard/stats/StatsPage'));
const TuningPage = lazy(() => import('@app/pages/dashboard/tuning/TuningPage'));
const BillingPage = lazy(() => import('@app/pages/dashboard/billing/BillingPage'));
const SettingsPage = lazy(() => import('@app/pages/dashboard/settings/SettingsPage'));
const IntegrationsPage = lazy(() => import('@app/pages/dashboard/integrations/IntegrationsPage'));
const ChatPage = lazy(() => import('@app/pages/dashboard/chat/ChatPage'));
const ReferralsPage = lazy(() => import('@app/pages/dashboard/referrals/ReferralsPage'));

// Admin pages (SA-017)
const OverviewPage = lazy(() => import('@app/pages/admin/overview/OverviewPage'));
const AdminJobsPage = lazy(() => import('@app/pages/admin/jobs/JobsPage'));
const CronPage = lazy(() => import('@app/pages/admin/cron/CronPage'));
const ContentPage = lazy(() => import('@app/pages/admin/content/ContentPage'));
const SeoPage = lazy(() => import('@app/pages/admin/seo/SeoPage'));
const NotificationsPage = lazy(() => import('@app/pages/admin/notifications/NotificationsPage'));
const AgentsPage = lazy(() => import('@app/pages/admin/agents/AgentsPage'));
const MonitoringPage = lazy(() => import('@app/pages/admin/monitoring/MonitoringPage'));
const KillswitchPage = lazy(() => import('@app/pages/admin/killswitch/KillswitchPage'));
const CompliancePage = lazy(() => import('@app/pages/admin/compliance/CompliancePage'));

// ── Suspense wrapper ────────────────────────────────────────

function Loader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="text-center">
        <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-text-faint mt-2">Loading {label}…</p>
      </div>
    </div>
  );
}

// Dashboard route wrappers
function FeedPageRoute() { return <Suspense fallback={<Loader label="feed" />}><FeedPage /></Suspense>; }
function PipelinePageRoute() { return <Suspense fallback={<Loader label="pipeline" />}><PipelinePage /></Suspense>; }
function KeywordsPageRoute() { return <Suspense fallback={<Loader label="readiness" />}><KeywordsPage /></Suspense>; }
function ResumesPageRoute() { return <Suspense fallback={<Loader label="resumes" />}><ResumesPage /></Suspense>; }
function ApplicationsPageRoute() { return <Suspense fallback={<Loader label="applications" />}><ApplicationsPage /></Suspense>; }
function StatsPageRoute() { return <Suspense fallback={<Loader label="stats" />}><StatsPage /></Suspense>; }
function TuningPageRoute() { return <Suspense fallback={<Loader label="tuning" />}><TuningPage /></Suspense>; }
function BillingPageRoute() { return <Suspense fallback={<Loader label="billing" />}><BillingPage /></Suspense>; }
function SettingsPageRoute() { return <Suspense fallback={<Loader label="settings" />}><SettingsPage /></Suspense>; }
function IntegrationsPageRoute() { return <Suspense fallback={<Loader label="integrations" />}><IntegrationsPage /></Suspense>; }
function ChatPageRoute() { return <Suspense fallback={<Loader label="chat" />}><ChatPage /></Suspense>; }
function ReferralsPageRoute() { return <Suspense fallback={<Loader label="referrals" />}><ReferralsPage /></Suspense>; }

// Admin route wrappers
function OverviewPageRoute() { return <Suspense fallback={<Loader label="overview" />}><OverviewPage /></Suspense>; }
function AdminJobsPageRoute() { return <Suspense fallback={<Loader label="jobs" />}><AdminJobsPage /></Suspense>; }
function CronPageRoute() { return <Suspense fallback={<Loader label="cron" />}><CronPage /></Suspense>; }
function ContentPageRoute() { return <Suspense fallback={<Loader label="content" />}><ContentPage /></Suspense>; }
function SeoPageRoute() { return <Suspense fallback={<Loader label="seo" />}><SeoPage /></Suspense>; }
function NotificationsPageRoute() { return <Suspense fallback={<Loader label="notifications" />}><NotificationsPage /></Suspense>; }
function AgentsPageRoute() { return <Suspense fallback={<Loader label="agents" />}><AgentsPage /></Suspense>; }
function MonitoringPageRoute() { return <Suspense fallback={<Loader label="monitoring" />}><MonitoringPage /></Suspense>; }
function KillswitchPageRoute() { return <Suspense fallback={<Loader label="killswitch" />}><KillswitchPage /></Suspense>; }
function CompliancePageRoute() { return <Suspense fallback={<Loader label="compliance" />}><CompliancePage /></Suspense>; }

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
          { path: 'resumes', element: <ResumesPageRoute /> },
          { path: 'applications', element: <ApplicationsPageRoute /> },
          { path: 'stats', element: <StatsPageRoute /> },
          { path: 'tuning', element: <TuningPageRoute /> },
          { path: 'billing', element: <BillingPageRoute /> },
          { path: 'settings', element: <SettingsPageRoute /> },
          { path: 'integrations', element: <IntegrationsPageRoute /> },
          { path: 'chat', element: <ChatPageRoute /> },
          { path: 'referrals', element: <ReferralsPageRoute /> },

          // ── Admin Routes (role-guarded) ──
          {
            path: 'admin',
            element: <AdminGuard />,
            children: [
              { index: true, element: <Navigate to="overview" replace /> },
              { path: 'overview', element: <OverviewPageRoute /> },
              { path: 'jobs', element: <AdminJobsPageRoute /> },
              { path: 'cron', element: <CronPageRoute /> },
              { path: 'content', element: <ContentPageRoute /> },
              { path: 'seo', element: <SeoPageRoute /> },
              { path: 'notifications', element: <NotificationsPageRoute /> },
              { path: 'agents', element: <AgentsPageRoute /> },
              { path: 'monitoring', element: <MonitoringPageRoute /> },
              { path: 'killswitch', element: <KillswitchPageRoute /> },
              { path: 'compliance', element: <CompliancePageRoute /> },
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
