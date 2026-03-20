// ============================================================
// AppShell — Unified Navigation Shell (Legacy Parity)
// ============================================================
// Matches legacy/dashboard.html nav per archived screenshots.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useUser, useProviders } from '@providers';
import type { UserProfile } from '@providers';
import { ToastProvider } from '@app/components/Toast';
import {
  Star,
  Briefcase,
  SlidersHorizontal,
  FileText,
  Activity,
  BarChart3,
  BookMarked,
  GraduationCap,
  Settings as SettingsIcon,
  CreditCard,
  Bell,
  Lock,
  LayoutDashboard,
  Clock,
  PenLine,
  Search,
  Bot,
  TrendingUp,
  OctagonX,
  ShieldCheck,
  Sun,
  Moon,
  Monitor,
  LogOut,
  ExternalLink,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────

interface NavItem {
  path: string;
  label: string;
  Icon: LucideIcon;
  indent?: boolean;
  dot?: boolean;
  dotColor?: string;  // green/yellow/red per legacy ext-status-dot
  badge?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// ── Nav structure — matches legacy dashboard.html lines 146-216 exactly ──

const SECTIONS: NavSection[] = [
  {
    label: '',
    items: [
      { path: '/app/get-started', label: 'Get Started', Icon: Star, dot: true, dotColor: 'var(--green)' },
    ],
  },
  {
    label: 'SEARCH',
    items: [
      { path: '/app/feed', label: 'Jobs Feed', Icon: Briefcase, dot: true, dotColor: 'var(--green)', badge: true },
      { path: '/app/tuning', label: 'Search Tuning', Icon: SlidersHorizontal, indent: true, dot: true, dotColor: 'var(--warm)' },
      { path: '/app/resumes', label: 'Resumes', Icon: FileText, dot: true, dotColor: '#ef4444', badge: true },
    ],
  },
  {
    label: 'APPLICATIONS',
    items: [
      { path: '/app/applications', label: 'My Applications', Icon: Activity, dot: true, dotColor: '#ef4444', badge: true },
      { path: '/app/interview-prep', label: 'Interview Prep', Icon: GraduationCap },
    ],
  },
  {
    label: 'INTELLIGENCE',
    items: [
      { path: '/app/stats', label: 'Stats', Icon: BarChart3 },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { path: '/app/feedback', label: 'Feedback', Icon: MessageSquare },
      { path: '/app/settings', label: 'Settings', Icon: SettingsIcon },
      { path: '/app/billing', label: 'Subscription', Icon: CreditCard },
      { path: '/app/notifications', label: 'Notifications', Icon: Bell },
    ],
  },
];

const ADMIN_ITEMS: NavItem[] = [
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

// ── Theme ────────────────────────────────────────────────

type Theme = 'light' | 'dark' | 'auto';
const THEME_KEY = 'bj-theme';
const themeLabels: Record<Theme, string> = { light: 'Light', dark: 'Dark', auto: 'Auto' };
const themeIcons: Record<Theme, LucideIcon> = { light: Sun, dark: Moon, auto: Monitor };
const themeOrder: Theme[] = ['light', 'dark', 'auto'];

function getStoredTheme(): Theme {
  try { const v = localStorage.getItem(THEME_KEY); if (v === 'light' || v === 'dark' || v === 'auto') return v; } catch {}
  return 'auto';
}
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}

// ── Avatar ───────────────────────────────────────────────

const AVATAR_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316','#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6'];
function avatarColor(email: string): string {
  const hash = Array.from(email).reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? '#6366f1';
}
function avatarInitial(email: string, name: string | null): string {
  return (name || email).charAt(0).toUpperCase();
}

// ── Component ────────────────────────────────────────────

export function AppShell() {
  const userProvider = useUser();
  const providers = useProviders();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [theme, setTheme] = useState<Theme>(getStoredTheme);
  const [credits, setCredits] = useState(0);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  const isAdminSection = location.pathname.startsWith('/app/admin');
  const isAdmin = user?.role === 'admin';

  // PostHog + page breadcrumb for feedback pre-fill (FB-16)
  useEffect(() => {
    try { const ph = (window as Record<string, any>).posthog; if (ph?.capture) ph.capture('$pageview', { $current_url: window.location.href }); } catch {}
    // Store last page name for bug report pre-fill
    const pathMap: Record<string, string> = {
      '/app/feed': 'Jobs Feed', '/app/pipeline': 'Pipeline', '/app/resumes': 'Resumes',
      '/app/applications': 'My Applications', '/app/interview-prep': 'Interview Prep',
      '/app/stats': 'Stats', '/app/settings': 'Settings', '/app/billing': 'Subscription',
      '/app/notifications': 'Notifications', '/app/tuning': 'Search Tuning',
    };
    const pageName = pathMap[location.pathname] || null;
    if (pageName) sessionStorage.setItem('bj_last_page', pageName);
  }, [location.pathname]);

  // User
  useEffect(() => {
    userProvider.getCurrentUser().then(setUser).catch(() => setUser(null));
    const unsub = userProvider.onAuthChange(setUser);
    return unsub;
  }, [userProvider]);

  // Credits
  useEffect(() => { providers.billing.getBalance().then(setCredits).catch(() => setCredits(0)); }, [providers]);

  // Badge counts — legacy: nav-jobs-count, nav-resume-count, nav-app-count
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const counts: Record<string, number> = {};
        const stats = await providers.stats.getJobCounts();
        if (stats) counts['/app/feed'] = stats.total_open ?? 0;
        const resumes = await providers.resumes.getAll();
        counts['/app/resumes'] = Array.isArray(resumes) ? resumes.length : 0;
        // Sync to localStorage for Keywords page bridge
        if (Array.isArray(resumes) && resumes.length > 0) {
          try { localStorage.setItem('bj_resumes', JSON.stringify(resumes)); } catch {}
        }
        const queue = await providers.applications.getQueue();
        counts['/app/applications'] = Array.isArray(queue) ? queue.length : 0;
        setBadgeCounts(counts);
      } catch {}
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [user, providers]);

  // Theme
  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const h = () => { if (theme === 'auto') applyTheme('auto'); };
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [theme]);

  const cycleTheme = useCallback(() => {
    setTheme(prev => themeOrder[(themeOrder.indexOf(prev) + 1) % themeOrder.length] ?? 'auto');
  }, []);

  const handleLogout = useCallback(async () => {
    try { await userProvider.signOut(); } catch {}
    window.location.href = '/';
  }, [userProvider]);

  const ThemeIcon = themeIcons[theme];

  return (
    <ToastProvider>
    <div className="flex h-screen">
      {/* ── Sidebar ── */}
      <nav aria-label="Main navigation" className="flex flex-col h-full w-[var(--nav-w,240px)] bg-[var(--nav-bg)] flex-shrink-0 overflow-y-auto overflow-x-hidden">

        {/* Brand — matches legacy: B mark + "Brilliant Jobs" + "Dashboard v11.45" */}
        <div className="px-6 py-[22px] border-b border-white/[0.08]">
          <div className="flex items-center gap-3 max-md:justify-center nav-brand-shimmer">
            <div className="w-[30px] h-[30px] rounded-lg bg-white flex items-center justify-center text-[var(--nav-bg)] font-extrabold text-sm flex-shrink-0">B</div>
            <div className="max-md:hidden">
              <div className="font-bold text-[16px] text-white leading-tight nav-brand-title">Brilliant Jobs</div>
              <div className="text-[11px] text-[var(--nav-text)]">Dashboard <span className="text-[9px]">v11.45</span></div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {(isAdminSection ? [{ label: 'ADMIN', items: ADMIN_ITEMS }] : SECTIONS).map((section, si) => (
            <div key={section.label || si}>
              {section.label && (
                <div className="px-3.5 pt-3 pb-1.5 mt-2 text-[10px] font-bold tracking-[1.5px] text-white/30 uppercase select-none max-md:hidden">
                  {section.label}
                </div>
              )}
              {section.items.map(item => (
                <NavLink
                  key={item.path + item.label}
                  to={item.path}
                  className={({ isActive }) => `
                    flex items-center gap-3 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium mb-0.5 max-md:justify-center max-md:px-2.5
                    ${isActive ? 'bg-[var(--nav-bg-active)] text-white font-semibold' : 'text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)]'}
                    ${item.indent ? 'pl-[34px] pr-3.5 text-[12px] max-md:pl-2.5' : 'px-3.5'}
                  `}
                >
                  <item.Icon className="w-[18px] h-[18px] flex-shrink-0 opacity-80" strokeWidth={1.75} />
                  <span className="flex-1 max-md:hidden">{item.label}</span>
                  {/* Badge count */}
                  {item.badge && (badgeCounts[item.path] ?? 0) > 0 && (
                    <span className="text-[11px] font-semibold bg-white/15 text-white px-2 py-0.5 rounded-lg tabular-nums leading-none ml-auto max-md:hidden">
                      {(badgeCounts[item.path] ?? 0) > 999 ? '999+' : badgeCounts[item.path]}
                    </span>
                  )}
                  {item.dot && (
                    <span className="w-2 h-2 rounded-full flex-shrink-0 ml-auto"
                      style={{ background:
                        item.badge && badgeCounts[item.path] !== undefined
                          ? (badgeCounts[item.path] ?? 0) > 0 ? 'var(--green, #22c55e)' : '#ef4444'
                          : item.dotColor || 'var(--green, #22c55e)'
                      }} />
                  )}
                </NavLink>
              ))}
              {/* Insights external link — inside Intelligence section per legacy line 191 */}
              {section.label === 'INTELLIGENCE' && !isAdminSection && (
                <a href="/blog" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)] mb-0.5">
                  <BookMarked className="w-[18px] h-[18px] flex-shrink-0 opacity-80" strokeWidth={1.75} />
                  <span>Insights</span>
                  <ExternalLink className="w-[10px] h-[10px] opacity-40 ml-0.5" strokeWidth={1.75} />
                </a>
              )}
            </div>
          ))}

          {/* Admin link (admin only — per legacy: hidden unless role=admin) */}
          {isAdmin && !isAdminSection && (
            <NavLink to="/app/admin" className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg transition-colors text-[13.5px] font-medium text-[var(--nav-text)] hover:bg-[var(--nav-bg-active)] mb-0.5">
              <Lock className="w-[18px] h-[18px] flex-shrink-0 opacity-80" strokeWidth={1.75} />
              <span>Admin</span>
            </NavLink>
          )}
        </div>

        {/* ── Footer — legacy: .nav-footer { padding:16px; border-top:1px solid hsla(0,0%,100%,0.08) } ── */}
        <div className="p-4 mt-auto border-t border-white/[0.08] space-y-2.5">
          {/* User row */}
          {user && (
            <div className="flex items-center gap-2.5 py-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0"
                style={{ backgroundColor: avatarColor(user.email) }}>
                {avatarInitial(user.email, user.display_name)}
              </div>
              <div className="min-w-0 max-md:hidden">
                <div className="text-[12px] text-white/70 truncate">{user.email}</div>
                <div className="text-[10px] font-semibold tracking-wide uppercase"
                  style={{ color: user.role === 'admin' ? '#f97316' : 'rgba(255,255,255,0.4)' }}>
                  {user.role === 'admin' ? 'ADMIN' : user.tier.toUpperCase()}
                </div>
              </div>
            </div>
          )}

          {/* Credits — legacy: .credit-balance { padding:6px 10px; margin:8px 12px; bg:bg-input; border:1px; radius:8px } */}
          <div className="flex items-center gap-1.5 mx-3 my-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] cursor-pointer hover:bg-[var(--bg-hover)] hover:border-[var(--border-hover)] transition-colors"
            onClick={() => navigate('/app/billing')} title="Credits">
            <span className="text-[9px] font-bold text-white/40 bg-white/10 px-1 py-0.5 rounded tracking-wide leading-none">CR</span>
              <span className={`text-[13px] font-semibold tabular-nums ${credits > 0 ? 'text-[var(--green)]' : 'text-white/70'}`}>{credits}</span>
              <span className="text-[10px] text-white/40">credits</span>
          </div>
          <div className="flex items-center gap-2 mx-3">
            <button onClick={cycleTheme} className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label={`Theme: ${theme}`} title={`Theme: ${themeLabels[theme]}`}>
              <ThemeIcon className="w-3.5 h-3.5 text-white/50" strokeWidth={1.75} />
              <span className="text-[10px] text-white/50">{themeLabels[theme]}</span>
            </button>
          </div>

          {/* Logout */}
          <button onClick={handleLogout}
            className="w-full mt-2.5 py-[7px] rounded-lg text-[11px] font-medium text-white/50 hover:text-white/80 hover:border-white/30 transition-colors border border-white/[0.12]">
            Log Out
          </button>

          {/* Copyright */}
          <div className="text-[10px] text-white/30 text-center">&copy; {new Date().getFullYear()} Brilliant Jobs</div>
        </div>
      </nav>

      {/* ── Main content ── */}
      <main id="main-content" role="main" className="flex-1 overflow-y-auto bg-[var(--bg-main)] px-10 pb-7 pt-0">
        <Outlet />
      </main>


      {/* ── In-session satisfaction prompt (Part C) — floating card bottom-right ── */}
      <div id="sat-prompt-card" className="sat-prompt-card" role="complementary" aria-label="Satisfaction check-in">
        <div id="sat-prompt-main">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] text-text-faint font-medium">Quick check-in</span>
            <button id="sat-prompt-dismiss" className="text-text-faint hover:text-text-dim p-0.5" aria-label="Dismiss">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <p className="text-[14px] font-semibold text-text mb-3">How satisfied are you with Brilliant Jobs?</p>
          <div className="flex gap-1.5 mb-2">
            {[1,2,3,4,5].map(n => (
              <button key={n} className="sat-score-btn w-9 h-9 rounded-full border-2 border-border bg-bg-input text-text-dim text-[13px] font-semibold hover:border-accent hover:text-accent transition-all" data-score={n} aria-label={`Score ${n}`}>{n}</button>
            ))}
          </div>
          <div id="sat-prompt-follow-wrap" style={{display:'none'}} className="mt-2">
            <textarea id="sat-prompt-text" rows={2} placeholder="What's not working?" className="w-full px-2.5 py-2 rounded-lg border border-border bg-bg-input text-[12px] text-text resize-none focus:border-accent focus:outline-none" />
            <div className="flex gap-2 mt-1.5">
              <button id="sat-prompt-send" className="px-3.5 py-1.5 rounded-lg bg-accent text-white text-[12px] font-semibold">Send</button>
              <button id="sat-prompt-skip" className="text-[12px] text-text-faint hover:text-text-dim">Skip</button>
            </div>
          </div>
        </div>
        <div id="sat-prompt-thanks" style={{display:'none'}} className="text-[13px] font-semibold text-green text-center py-1">Thanks! ✓</div>
      </div>
    </div>
    </ToastProvider>
  );
}

export default AppShell;
