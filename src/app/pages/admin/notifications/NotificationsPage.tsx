// ============================================================
// NotificationsPage — Main Admin Notifications Page Container (SA-017)
// ============================================================

import { NotificationsHero } from './components';
import { useNotifications } from './hooks/useNotifications';

export function NotificationsPage() {
  const [state, _actions] = useNotifications();

  if (state.loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="inline-block w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-text-faint mt-2">Loading notifications…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <p className="text-sm text-red-500 font-semibold">Failed to load notifications</p>
          <p className="text-xs text-text-faint mt-1">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <NotificationsHero totalSent={state.totalSent} deliveryRate={state.deliveryRate} templateCount={state.templateCount} failedCount={state.failedCount} />

      <div id="admin-notifications-panel" />
      <div id="admin-templates-panel" />
      <div id="admin-notif-analytics" />

    </div>
  );
}

export default NotificationsPage;
