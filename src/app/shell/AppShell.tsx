// ============================================================
// AppShell — Unified Navigation Shell (SA-013)
// ============================================================
// Renders the sidebar nav + main content area for both
// dashboard and admin surfaces. The nav items are defined
// in routes.tsx and filtered by user role.
//
// During dual-mode migration: Legacy pages render inside
// LegacyPageWrapper. Migrated pages render as React components.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useUser } from '@providers';
import type { UserProfile } from '@providers';

interface NavItem {
  path: string;
  label: string;
  icon: string;  // SVG path data or emoji for now; icon system in SA-014
  admin?: boolean;
  badge?: string;
}

// Dashboard navigation items
const dashboardNav: NavItem[] = [
  { path: '/app/feed', label: 'Feed', icon: '📋' },
  { path: '/app/pipeline', label: 'Pipeline', icon: '🔀' },
  { path: '/app/keywords', label: 'Keywords', icon: '🔑' },
  { path: '/app/resumes', label: 'Resumes', icon: '📄' },
  { path: '/app/applications', label: 'Applications', icon: '📬' },
  { path: '/app/stats', label: 'Stats', icon: '📊' },
  { path: '/app/tuning', label: 'Tuning', icon: '⚙️' },
  { path: '/app/billing', label: 'Billing', icon: '💳' },
  { path: '/app/settings', label: 'Settings', icon: '🛠' },
  { path: '/app/integrations', label: 'Integrations', icon: '🔌' },
  { path: '/app/chat', label: 'Chat', icon: '💬' },
  { path: '/app/referrals', label: 'Referrals', icon: '🤝' },
];

// Admin navigation items (only visible to admin role)
const adminNav: NavItem[] = [
  { path: '/app/admin/overview', label: 'Overview', icon: '🏠', admin: true },
  { path: '/app/admin/jobs', label: 'Jobs', icon: '💼', admin: true },
  { path: '/app/admin/cron', label: 'Cron', icon: '⏰', admin: true },
  { path: '/app/admin/content', label: 'Content', icon: '📝', admin: true },
  { path: '/app/admin/seo', label: 'SEO', icon: '🔍', admin: true },
  { path: '/app/admin/notifications', label: 'Notifications', icon: '🔔', admin: true },
  { path: '/app/admin/agents', label: 'Agents', icon: '🤖', admin: true },
  { path: '/app/admin/monitoring', label: 'Monitoring', icon: '📈', admin: true },
  { path: '/app/admin/killswitch', label: 'Kill Switch', icon: '🛑', admin: true },
  { path: '/app/admin/compliance', label: 'Compliance', icon: '🔒', admin: true },
];

export function AppShell() {
  const userProvider = useUser();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const location = useLocation();

  // Detect if we're in admin section
  const isAdminSection = location.pathname.startsWith('/app/admin');

  useEffect(() => {
    userProvider.getCurrentUser().then(setUser).catch(() => setUser(null));
    const unsub = userProvider.onAuthChange(setUser);
    return unsub;
  }, [userProvider]);

  // Show admin nav toggle only for admin users
  const isAdmin = user?.role === 'admin';

  const toggleCollapse = useCallback(() => setCollapsed(prev => !prev), []);
  const toggleAdminView = useCallback(() => setShowAdmin(prev => !prev), []);

  const navItems = isAdminSection || showAdmin
    ? adminNav
    : dashboardNav;

  return (
    <div className="flex h-screen bg-bg-main">
      {/* Sidebar Navigation */}
      <nav
        className={`
          flex flex-col h-full bg-[#1a1f36] text-white
          transition-all duration-200
          ${collapsed ? 'w-[60px]' : 'w-[240px]'}
        `}
        aria-label="Main navigation"
      >
        {/* Logo / Brand */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          {!collapsed && (
            <span className="font-semibold text-base tracking-tight">
              Brilliant Jobs
            </span>
          )}
          <button
            onClick={toggleCollapse}
            className="ml-auto p-1 rounded hover:bg-white/10 transition-colors text-sm"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            {collapsed ? '→' : '←'}
          </button>
        </div>

        {/* Nav Links */}
        <div className="flex-1 overflow-y-auto py-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md
                text-sm font-medium transition-all
                ${isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white/65 hover:text-white hover:bg-white/8'
                }
              `}
            >
              <span className="flex-shrink-0 text-base">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && item.badge && (
                <span className="ml-auto text-[10px] bg-accent px-1.5 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {/* Admin Toggle (bottom of sidebar) */}
        {isAdmin && (
          <div className="border-t border-white/10 p-2">
            <button
              onClick={toggleAdminView}
              className={`
                flex items-center gap-3 w-full px-4 py-2.5 rounded-md
                text-sm font-medium transition-all
                ${showAdmin || isAdminSection
                  ? 'bg-red/20 text-red'
                  : 'text-white/65 hover:text-white hover:bg-white/8'
                }
              `}
            >
              <span className="text-base">⚡</span>
              {!collapsed && (
                <span>{showAdmin || isAdminSection ? 'Dashboard' : 'Admin'}</span>
              )}
            </button>
          </div>
        )}

        {/* User Info */}
        {user && (
          <div className="border-t border-white/10 px-4 py-3">
            {!collapsed ? (
              <div>
                <p className="text-xs text-white/80 truncate">{user.email}</p>
                <p className="text-[10px] text-white/40 mt-0.5 uppercase tracking-wider">
                  {user.tier} • {user.role}
                </p>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-accent/30 mx-auto" />
            )}
          </div>
        )}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

export default AppShell;
