// ============================================================
// AppShell — Unified Navigation Shell (SA-013 → Phase B Nav Parity)
// ============================================================
// Full nav parity with legacy dashboard.html:
// - Lucide React SVG icons (replacing emoji)
// - Section dividers (Search, Applications, Intelligence, Account)
// - Live badge counters (jobs, resumes, applications)
// - Theme toggle (light/dark/auto) in footer
// - Logout button
// - Blog/Insights external link
// - Notifications dashboard link
// - Colored avatar circle with initial letter
// ============================================================

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useProviders } from '@providers';
import type { UserProfile } from '@providers';
import {
  Rss,
  GitBranch,
  Key,
  FileText,
  Send,
  BarChart3,
  SlidersHorizontal,
  CreditCard,
  Settings,
  Plug,
  MessageSquare,
  Users,
  Bell,
  LayoutDashboard,
  Briefcase,
  Clock,
  PenLine,
  Search,
  Bot,
  TrendingUp,
  OctagonX,
  ShieldCheck,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  LogOut,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
  badgeKey?: 'jobs' | 'resumes' | 'applications';
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// ── Dashboard navigation (grouped by legacy section dividers) ──

const dashboardSections: NavSection[] = [
  {
    label: 'Search',
    items: [
      { path: '/app/feed', label: 'Feed', Icon: Rss, badgeKey: 'jobs' },
      { path: '/app/keywords', label: 'Keywords', Icon: Key },
      { path: '/app/chat', label: 'Chat', Icon: MessageSquare },
    ],
  },
  {
    label: 'Applications',
    items: [
      { path: '/app/pipeline', label: 'Pipeline', Icon: GitBranch },
      { path: '/app/applications', label: 'Applications', Icon: Send, badgeKey: 'applications' },
      { path: '/app/resumes', label: 'Resumes', Icon: FileText, badgeKey: 'resumes' },
      { path: '/app/interview-prep', label: 'Interview Prep', Icon: BookOpen },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { path: '/app/stats', label: 'Stats', Icon: BarChart3 },
      { path: '/app/tuning', label: 'Tuning', Icon: SlidersHorizontal },
      { path: '/app/integrations', label: 'Integrations', Icon: Plug },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/app/notifications', label: 'Notifications', Icon: Bell },
      { path: '/app/billing', label: 'Billing', Icon: CreditCard },
      { path: '/app/settings', label: 'Settings', Icon: Settings },
      { path: '/app/referrals', label: 'Referrals', Icon: Users },
    ],
  },
];

// Flat list for non-grouped rendering (admin)
const adminItems: NavItem[] = [
  { path: '/app/admin/overview', label: 'Overview', Icon: LayoutDashboard },
  { path: '/app/admin/jobs', label: 'Jobs', Icon: Briefcase },
  { path: '/app/admin/cron', label: 'Cron', Icon: Clock },
  { path: '/app/admin/content', label: 'Content', Icon: PenLine },
  { path: '/app/admin/seo', label: 'SEO', Icon: Search },
  { path: '/app/admin/notifications', label: 'Notifications', Icon: Bell },
  { path: '/app/admin/agents', label: 'Agents', Icon: Bot },
  { path: '/app/admin/monitoring', label: 'Monitoring', Icon: TrendingUp },
  { path: '/app/admin/killswitch', label: 'Kill Switch', Icon: OctagonX },
  { path: '/app/admin/compliance', label: 'Compliance', Icon: ShieldCheck },
];

// ── Theme management ─────────────────────────────────────

type Theme = 'light' | 'dark' | 'auto';
const THEME_KEY = 'bj_theme';

function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark' || v === 'auto') return v;
  } catch {}
  return 'auto';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

const themeIcons: Record<Theme, LucideIcon> = { light: Sun, dark: Moon, auto: Monitor };
const themeOrder: Theme[] = ['light', 'dark', 'auto'];

// ── Avatar color generator (deterministic from email) ────

const AVATAR_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
];

function avatarColor(email: string): string {
  const hash = Array.from(email).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#6366f1';
}

function avatarInitial(email: string, displayName: string | null): string {
  if (displayName) return displayName.charAt(0).toUpperCase();
  return email.charAt(0).toUpperCase();
}

// ── AppShell Component ───────────────────────────────────

export function AppShell() {
  const userProvider = useUser();
  const providers = useProviders();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const location = useLocation();

  const isAdminSection = location.pathname.startsWith('/app/admin');

  // PostHog $pageview on route transitions
  useEffect(() => {
    try {
      const ph = (window as Record<string, any>).posthog;
      if (ph?.capture) {
        ph.capture('$pageview', { $current_url: window.location.href });
      }
    } catch { /* non-fatal */ }
  }, [location.pathname]);

  // Load user
  useEffect(() => {
    userProvider.getCurrentUser().then(setUser).catch(() => setUser(null));
    const unsub = userProvider.onAuthChange(setUser);
    return unsub;
  }, [userProvider]);

  // Load live badge counts
  useEffect(() => {
    async function loadBadges() {
      try {
        const [statsResult, resumesList, appQueue] = await Promise.allSettled([
          providers.stats.getJobCounts(),
          providers.resumes.getAll(),
          providers.applications.getQueue(),
        ]);
        setBadges({
          jobs: statsResult.status === 'fulfilled' && statsResult.value?.total_open ? statsResult.value.total_open : 0,
          resumes: resumesList.status === 'fulfilled' ? resumesList.value.length : 0,
          applications: appQueue.status === 'fulfilled' ? appQueue.value.length : 0,
        });
      } catch { /* non-fatal — badges just won't show */ }
    }
    loadBadges();
    // Refresh badges every 60s
    const interval = setInterval(loadBadges, 60000);
    return () => clearInterval(interval);
  }, [providers]);

  // Apply theme on mount and change
  useEffect(() => {
    applyTheme(theme);
    // Listen for OS theme changes when in auto mode
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (theme === 'auto') applyTheme('auto'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const isAdmin = user?.role === 'admin';
  const toggleCollapse = useCallback(() => setCollapsed(prev => !prev), []);
  const toggleAdminView = useCallback(() => setShowAdmin(prev => !prev), []);

  const cycleTheme = useCallback(() => {
    setTheme(prev => {
      const idx = themeOrder.indexOf(prev);
      return themeOrder[(idx + 1) % themeOrder.length] ?? 'auto';
    });
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await userProvider.signOut();
      navigate('/');
    } catch { /* non-fatal */ }
  }, [userProvider, navigate]);

  // ── Render helpers ──

  function renderNavLink(item: NavItem) {
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        className={({ isActive }) => `
          flex items-center gap-3 px-3 py-2 mx-2 rounded-md
          text-sm font-medium transition-all
          ${isActive
            ? 'bg-white/15 text-white'
            : 'text-white/65 hover:text-white hover:bg-white/[0.08]'
          }
        `}
      >
        <item.Icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && badgeCount != null && badgeCount > 0 && (
          <span className="ml-auto text-[10px] font-semibold bg-white/20 text-white px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
            {badgeCount > 999 ? '999+' : badgeCount}
          </span>
        )}
      </NavLink>
    );
  }

  function renderSectionLabel(label: string) {
    if (collapsed) return <div className="my-2 mx-4 border-t border-white/10" />;
    return (
      <p className="px-5 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
        {label}
      </p>
    );
  }

  const ThemeIcon = themeIcons[theme];

  return (
    <div className="flex h-screen bg-bg-main">
      {/* Sidebar Navigation */}
      <nav
        aria-label="Main navigation"
        className={`
          flex flex-col h-full bg-[#1a1f36] text-white
          transition-all duration-200 flex-shrink-0
          ${collapsed ? 'w-[60px]' : 'w-[240px]'}
        `}
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          {!collapsed && (
            <span className="font-semibold text-base tracking-tight select-none">
              Brilliant Jobs
            </span>
          )}
          <button
            onClick={toggleCollapse}
            className="ml-auto p-1.5 rounded-md hover:bg-white/10 transition-colors"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed
              ? <PanelLeftOpen className="w-4 h-4" strokeWidth={1.75} />
              : <PanelLeftClose className="w-4 h-4" strokeWidth={1.75} />
            }
          </button>
        </div>

        {/* Nav Links (sectioned for dashboard, flat for admin) */}
        <div className="flex-1 overflow-y-auto py-1" role="list">
          {isAdminSection || showAdmin ? (
            <>
              {!collapsed && (
                <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-white/35">
                  Admin
                </p>
              )}
              {adminItems.map(renderNavLink)}
            </>
          ) : (
            dashboardSections.map((section) => (
              <div key={section.label} role="group" aria-label={section.label}>
                {renderSectionLabel(section.label)}
                {section.items.map(renderNavLink)}
              </div>
            ))
          )}
        </div>

        {/* Footer: Blog link, Admin toggle, Theme, Logout, User */}
        <div className="border-t border-white/10">
          {/* Blog / Insights link */}
          <a
            href="https://brilliantjobs.app/blog"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2 mx-2 mt-2 rounded-md text-sm text-white/50 hover:text-white hover:bg-white/[0.08] transition-all"
          >
            <BookOpen className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
            {!collapsed && <span>Blog & Insights</span>}
          </a>

          {/* Admin Toggle */}
          {isAdmin && (
            <button
              onClick={toggleAdminView}
              className={`
                flex items-center gap-3 w-[calc(100%-16px)] mx-2 px-3 py-2 rounded-md
                text-sm font-medium transition-all
                ${showAdmin || isAdminSection
                  ? 'bg-red-500/20 text-red-400'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.08]'
                }
              `}
              aria-label="Toggle admin view"
            >
              <Zap className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={1.75} />
              {!collapsed && (
                <span>{showAdmin || isAdminSection ? 'Dashboard' : 'Admin'}</span>
              )}
            </button>
          )}

          {/* Theme toggle + Logout row */}
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1 py-2' : 'gap-1 px-3 py-2'}`}>
            <button
              onClick={cycleTheme}
              className="p-2 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              aria-label={`Theme: ${theme}. Click to cycle.`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon className="w-4 h-4" strokeWidth={1.75} />
            </button>
            <button
              onClick={handleLogout}
              className="p-2 rounded-md text-white/50 hover:text-red-400 hover:bg-white/10 transition-colors"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" strokeWidth={1.75} />
            </button>
          </div>

          {/* User Info with colored avatar */}
          {user && (
            <div className="border-t border-white/10 px-3 py-3">
              <div className="flex items-center gap-3">
                {/* Colored avatar circle with initial */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: avatarColor(user.email) }}
                  aria-hidden="true"
                >
                  {avatarInitial(user.email, user.display_name)}
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="text-xs text-white/80 truncate">{user.email}</p>
                    <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider">
                      {user.tier} • {user.role}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <main id="main-content" role="main" className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
