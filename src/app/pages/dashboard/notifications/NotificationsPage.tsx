// ============================================================
// NotificationsPage — User-Facing Notification Center
// ============================================================
// Phase C: Missing page — legacy had ~200 lines in app.ts
// Dashboard-level notification center (distinct from admin
// notifications page). Shows user's notification history,
// read/unread state, and notification preferences.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { useDashboardNotificationsProvider } from '@providers';
import type { UserNotification, NotificationPref } from '@providers/types';
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Mail,
  MessageSquare,
  Phone,
  Settings,
  Loader2,
  ExternalLink,
} from 'lucide-react';

type Tab = 'inbox' | 'preferences';

export default function NotificationsPage() {
  const provider = useDashboardNotificationsProvider();
  const [tab, setTab] = useState<Tab>('inbox');
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPref | null>(null);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // ── Load notifications ──
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [notifs, count] = await Promise.all([
          provider.getNotifications(50),
          provider.getUnreadCount(),
        ]);
        setNotifications(notifs);
        setUnreadCount(count);
      } catch (err) {
        console.error('Failed to load notifications:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [provider]);

  // ── Load prefs when switching to that tab ──
  useEffect(() => {
    if (tab === 'preferences') {
      provider.getPreferences().then(setPrefs).catch(() => setPrefs(null));
    }
  }, [provider, tab]);

  // ── Mark read ──
  const markRead = useCallback(async (id: string) => {
    await provider.markRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, [provider]);

  const markAllRead = useCallback(async () => {
    await provider.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, [provider]);

  // ── Update prefs ──
  const toggleChannel = useCallback(async (channel: string) => {
    if (!prefs) return;
    const channels = prefs.channels.includes(channel)
      ? prefs.channels.filter(c => c !== channel)
      : [...prefs.channels, channel];
    const updated = { ...prefs, channels };
    setPrefs(updated);
    await provider.updatePreferences({ channels });
  }, [prefs, provider]);

  const toggleEnabled = useCallback(async () => {
    if (!prefs) return;
    const updated = { ...prefs, enabled: !prefs.enabled };
    setPrefs(updated);
    await provider.updatePreferences({ enabled: updated.enabled });
  }, [prefs, provider]);

  // ── Type icons ──
  function typeIcon(type: string) {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'sms': return <Phone className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Bell className="w-6 h-6" />
            Notifications
            {unreadCount > 0 && (
              <span className="text-sm bg-accent text-white px-2 py-0.5 rounded-full font-semibold">
                {unreadCount}
              </span>
            )}
          </h1>
        </div>
        {tab === 'inbox' && unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-surface transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border-subtle" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'inbox'}
          onClick={() => setTab('inbox')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${tab === 'inbox' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}
          `}
        >
          <Bell className="w-4 h-4" />
          Inbox
        </button>
        <button
          role="tab"
          aria-selected={tab === 'preferences'}
          onClick={() => setTab('preferences')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px
            ${tab === 'preferences' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'}
          `}
        >
          <Settings className="w-4 h-4" />
          Preferences
        </button>
      </div>

      {/* ── Inbox Tab ── */}
      {tab === 'inbox' && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-text-faint" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-16 text-text-faint">
              <BellOff className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>No notifications yet</p>
              <p className="text-xs mt-1">You&apos;ll see updates about your applications, jobs, and account here</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map(n => (
                <div
                  key={n.id}
                  className={`flex items-start gap-3 p-4 rounded-lg transition-colors cursor-pointer
                    ${n.read
                      ? 'bg-transparent hover:bg-bg-surface'
                      : 'bg-accent/5 hover:bg-accent/10 border-l-2 border-accent'
                    }
                  `}
                  onClick={() => !n.read && markRead(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && !n.read && markRead(n.id)}
                >
                  <div className={`mt-0.5 flex-shrink-0 ${n.read ? 'text-text-faint' : 'text-accent'}`}>
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium truncate ${n.read ? 'text-text-secondary' : 'text-text-primary'}`}>
                        {n.title}
                      </p>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-text-faint mt-0.5 line-clamp-2">{n.body}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[11px] text-text-faint">
                        {formatRelativeTime(n.created_at)}
                      </span>
                      {n.action_url && (
                        <a
                          href={n.action_url}
                          className="text-[11px] text-accent hover:underline flex items-center gap-0.5"
                          onClick={e => e.stopPropagation()}
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  {!n.read && (
                    <button
                      onClick={e => { e.stopPropagation(); markRead(n.id); }}
                      className="p-1 rounded hover:bg-bg-surface text-text-faint hover:text-text-secondary flex-shrink-0"
                      aria-label="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Preferences Tab ── */}
      {tab === 'preferences' && (
        <div className="max-w-lg space-y-6">
          {/* Master toggle */}
          <div className="flex items-center justify-between p-4 bg-bg-surface rounded-lg border border-border-subtle">
            <div>
              <p className="text-sm font-medium text-text-primary">Notifications</p>
              <p className="text-xs text-text-faint mt-0.5">
                {prefs?.enabled ? 'You\'re receiving notifications' : 'Notifications are paused'}
              </p>
            </div>
            <button
              onClick={toggleEnabled}
              className={`relative w-11 h-6 rounded-full transition-colors
                ${prefs?.enabled ? 'bg-accent' : 'bg-border-subtle'}
              `}
              aria-label="Toggle notifications"
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform
                ${prefs?.enabled ? 'left-[22px]' : 'left-0.5'}
              `} />
            </button>
          </div>

          {/* Channel toggles */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Channels</h3>
            <div className="space-y-2">
              {[
                { key: 'email', label: 'Email', desc: 'Get notified via email', Icon: Mail },
                { key: 'sms', label: 'SMS', desc: 'Text message alerts', Icon: Phone },
                { key: 'in_app', label: 'In-App', desc: 'Dashboard notifications', Icon: MessageSquare },
              ].map(ch => (
                <div key={ch.key} className="flex items-center justify-between p-3 bg-bg-surface rounded-lg border border-border-subtle">
                  <div className="flex items-center gap-3">
                    <ch.Icon className="w-4 h-4 text-text-faint" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{ch.label}</p>
                      <p className="text-xs text-text-faint">{ch.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleChannel(ch.key)}
                    disabled={!prefs?.enabled}
                    className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40
                      ${prefs?.channels.includes(ch.key) ? 'bg-accent' : 'bg-border-subtle'}
                    `}
                    aria-label={`Toggle ${ch.label}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
                      ${prefs?.channels.includes(ch.key) ? 'left-[18px]' : 'left-0.5'}
                    `} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {prefs?.timezone && (
            <p className="text-xs text-text-faint">Timezone: {prefs.timezone}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoDate).toLocaleDateString();
}
