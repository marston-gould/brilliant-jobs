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
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [fbType, setFbType] = useState('Bug Report');
  const [credits, setCredits] = useState(0);
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({});

  const isAdminSection = location.pathname.startsWith('/app/admin');
  const isAdmin = user?.role === 'admin';

  // PostHog
  useEffect(() => {
    try { const ph = (window as Record<string, any>).posthog; if (ph?.capture) ph.capture('$pageview', { $current_url: window.location.href }); } catch {}
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
    try { await userProvider.signOut(); navigate('/'); } catch {}
  }, [userProvider, navigate]);

  const ThemeIcon = themeIcons[theme];

  return (
    <ToastProvider>
    <div className="flex h-screen">
      {/* ── Sidebar ── */}
      <nav aria-label="Main navigation" className="flex flex-col h-full w-[var(--nav-w,240px)] bg-[var(--nav-bg)] flex-shrink-0 overflow-y-auto overflow-x-hidden">

        {/* Brand — matches legacy: B mark + "Brilliant Jobs" + "Dashboard v11.03" */}
        <div className="px-6 py-[22px] border-b border-white/[0.08]">
          <div className="flex items-center gap-3 max-md:justify-center nav-brand-shimmer">
            <div className="w-[30px] h-[30px] rounded-lg bg-white flex items-center justify-center text-[var(--nav-bg)] font-extrabold text-sm flex-shrink-0">B</div>
            <div className="max-md:hidden">
              <div className="font-bold text-[16px] text-white leading-tight nav-brand-title">Brilliant Jobs</div>
              <div className="text-[11px] text-[var(--nav-text)]">Dashboard <span className="text-[9px]">v11.03</span></div>
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

      {/* Floating feedback button — legacy: .feedback-btn (fixed top-right) */}
      <button onClick={() => { setFeedbackOpen(o => !o); }}
        className="fixed top-4 right-5 z-[200] h-[34px] px-3.5 rounded-lg bg-bg-card border border-border flex items-center gap-1.5 cursor-pointer text-text-faint hover:text-accent hover:border-accent shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all"
        title="Squash a bug or pitch an idea!">
        <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />
        <span className="text-[11px] font-semibold tracking-wide">Feedback</span>
      </button>

      {/* Feedback modal overlay */}
      {feedbackOpen && (
        <div className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={e => { if (e.target === e.currentTarget) setFeedbackOpen(false); }}>
          <div className="bg-bg-card border border-border rounded-xl p-7 w-[460px] max-w-[92vw] shadow-[0_16px_48px_rgba(0,0,0,0.4)] flex flex-col min-h-[500px]">
            <h3 className="text-[18px] font-bold text-text mb-1">Report a Bug</h3>
            <div className="text-[12px] text-text-dim mb-4">Found something off? Help us fix it.</div>

            {/* Type toggle */}
            <div className="flex gap-0 rounded-lg overflow-hidden border border-border mb-3.5">
              {['Bug Report', 'Feature Request'].map(t => (
                <button key={t} onClick={() => setFbType(t)}
                  className={`flex-1 py-2 px-3.5 text-[13px] font-semibold text-center transition-all ${fbType === t ? (t === 'Bug Report' ? 'bg-red text-white' : 'bg-accent text-white') : 'bg-bg-input text-text-dim'}`}>
                  {t}
                </button>
              ))}
            </div>

            <label className="block text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1">Title</label>
            <input type="text" placeholder="Short description…" className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text mb-3.5 focus:border-accent focus:outline-none" />

            <label className="block text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1">Details</label>
            <textarea rows={5} placeholder="Steps to reproduce, expected vs actual…" className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text mb-3.5 resize-y focus:border-accent focus:outline-none" />

            <label className="block text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] mb-1">Page</label>
            <select className="w-full px-3 py-2 rounded-lg border border-border bg-bg-input text-[13px] text-text mb-3.5 cursor-pointer">
              <option>Feed</option><option>Pipeline</option><option>Resumes</option><option>Applications</option><option>Stats</option><option>Settings</option><option>Billing</option><option>Other</option>
            </select>

            <div className="flex gap-2.5 justify-end mt-auto pt-2.5">
              <button onClick={() => setFeedbackOpen(false)} className="px-4 py-2 rounded-lg bg-bg-input text-text-dim border border-border text-[13px] font-semibold">Cancel</button>
              <button onClick={async () => {
                const form = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('.bg-bg-card input, .bg-bg-card textarea, .bg-bg-card select');
                const title = (form[0] as HTMLInputElement)?.value || '';
                const details = (form[1] as HTMLTextAreaElement)?.value || '';
                const page = (form[2] as HTMLSelectElement)?.value || '';
                if (!title.trim()) { (window as any).__bjToast?.('Please add a title', 'info'); return; }
                try {
                  const { callGateway } = await import('@app/lib/supabase');
                  await callGateway('submit-feedback', { type: fbType === 'Bug Report' ? 'bug' : 'feature', title, details, page });
                } catch { /* silent — toast below */ }
                setFeedbackOpen(false);
                (window as any).__bjToast?.('Feedback submitted — thank you!', 'success');
              }}
                className="px-5 py-2 rounded-lg bg-accent text-white text-[13px] font-semibold">Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </ToastProvider>
  );
}

export default AppShell;
