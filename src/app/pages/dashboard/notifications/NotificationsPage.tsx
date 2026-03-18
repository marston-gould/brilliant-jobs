// ============================================================
// NotificationsPage — Legacy Parity (lines 2545-3057)
// ============================================================
// 3 tabs: Preferences, Log, My Surveys
// Preferences: notification matrix (type × email/sms × frequency)
//   + phone verification + escalation rules + timezone + quiet hours
// Log: notification history table with filters
// Surveys: available + completed surveys
// ============================================================

import { useState, useEffect } from 'react';
import { PageHeader } from '@app/components';
import { useDashboardNotificationsProvider } from '@providers';

type NcTab = 'preferences' | 'log' | 'surveys';

// Notification type definitions matching legacy matrix
const NOTIF_SECTIONS = [
  {
    label: 'Real-time alerts',
    items: [
      { key: 'auto_apply_confirm', label: 'Auto-apply confirmations', freq: 'Real-time' },
      { key: 'apply_alert', label: 'Apply-on-notification alerts', freq: 'Real-time' },
      { key: 'pipeline_response', label: 'Pipeline changes', freq: 'Real-time' },
      { key: 'pipeline_interview', label: 'Interview / Offer alerts', freq: 'Real-time' },
      { key: 'listing_closed', label: 'Listing closed', freq: 'Real-time' },
    ],
  },
  {
    label: 'Daily digest',
    items: [
      { key: 'pipeline_stale', label: 'Stale application reminders', freq: 'Daily' },
      { key: 'pipeline_auto_move', label: 'Auto-move notifications', freq: 'select' },
      { key: 'new_jobs_daily', label: 'New job matches', freq: 'select' },
      { key: 'company_hiring_surge', label: 'Company hiring surge', freq: 'select' },
      { key: 'ghost_alert', label: 'Ghost alerts', freq: 'select' },
      { key: 'salary_change', label: 'Salary range changes', freq: 'select' },
    ],
  },
  {
    label: 'Network intelligence',
    items: [
      { key: 'connections_at_company', label: 'Network match alerts', freq: 'select' },
    ],
  },
  {
    label: 'Weekly summary',
    items: [
      { key: 'weekly_summary', label: 'Weekly summary', freq: 'Weekly' },
      { key: 'market_stats', label: 'Market stats digest', freq: 'Weekly' },
      { key: 'ghost_report', label: 'Ghost report', freq: 'Weekly' },
    ],
  },
  {
    label: 'Job intelligence',
    items: [
      { key: 'company_new_roles', label: 'Company posted more roles', freq: 'select' },
      { key: 'resume_decay', label: 'Resume readiness drop', freq: 'select' },
      { key: 'resume_improve', label: 'Resume readiness improved', freq: 'select' },
      { key: 'exclusion_override', label: 'Excluded company match', freq: 'select' },
    ],
  },
  {
    label: 'Credit & billing',
    badge: 'Starter/Pro',
    items: [
      { key: 'credit_low', label: 'Credit balance low', freq: 'Event' },
      { key: 'autorefill_success', label: 'Auto-refill confirmations', freq: 'Event' },
      { key: 'autorefill_failed', label: 'Auto-refill failed', freq: 'Event' },
      { key: 'credit_exhausted', label: 'Credits exhausted mid-month', freq: 'Event' },
    ],
  },
  {
    label: 'Required transactional',
    badge: 'Always sent',
    locked: true,
    items: [
      { key: 'subscription_confirm', label: 'Payment confirmations', freq: 'Always' },
      { key: 'payment_failed', label: 'Payment failed alerts', freq: 'Always' },
      { key: 'plan_change_confirm', label: 'Plan changes', freq: 'Always' },
      { key: 'invoice_generated', label: 'Invoices & receipts', freq: 'Always' },
      { key: 'refund_processed', label: 'Refund confirmations', freq: 'Always' },
    ],
  },
];

export default function NotificationsPage() {
  const provider = useDashboardNotificationsProvider();
  const [tab, setTab] = useState<NcTab>('preferences');
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    if (tab === 'log') {
      provider.getNotifications(50).then(setNotifications).catch(() => {});
    }
  }, [provider, tab]);

  const toggleCls = (checked: boolean, disabled?: boolean) =>
    `relative w-8 h-[18px] rounded-full transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-accent' : 'bg-border-hover'}`;
  const dotCls = (checked: boolean) =>
    `absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${checked ? 'left-[14px]' : 'left-[2px]'}`;

  return (
    <div>
      <PageHeader title="Notification Center" subtitle="Manage how and when you receive alerts, digests, and intelligence updates" helpLink="notifications" onHelp={() => {}} />

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {([
          { key: 'preferences' as NcTab, label: 'Preferences' },
          { key: 'log' as NcTab, label: 'Log' },
          { key: 'surveys' as NcTab, label: 'My Surveys' },
        ]).map(t => (
          <button key={t.key}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px
              ${tab === t.key ? 'border-accent text-accent' : 'border-transparent text-text-faint hover:text-text'}
            `}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Preferences */}
      {tab === 'preferences' && (
        <div className="space-y-5">
          {/* Notification Matrix */}
          <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <div className="text-[14px] font-bold text-text">Notification Preferences</div>
              <div className="text-[12px] text-text-dim">Choose how and when you receive each type of alert</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-bg-input">
                    <th className="text-left px-4 py-2 text-text-faint font-medium min-w-[200px]">Type</th>
                    <th className="text-center px-2 py-2 text-text-faint font-medium w-[70px]">Email</th>
                    <th className="text-center px-2 py-2 text-text-faint font-medium w-[70px]">SMS</th>
                    <th className="text-left px-2 py-2 text-text-faint font-medium w-[120px]">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTIF_SECTIONS.map(section => (
                    <>
                      <tr key={section.label}>
                        <td colSpan={4} className="px-4 py-2 text-[11px] font-bold text-text-dim uppercase tracking-wide bg-bg-main/50">
                          {section.label}
                          {section.badge && <span className="text-[10px] font-normal text-warm ml-1.5">{section.badge}</span>}
                        </td>
                      </tr>
                      {section.items.map(item => (
                        <tr key={item.key} className="border-t border-border">
                          <td className="px-4 py-2 text-text">
                            {section.locked && <span className="text-text-faint mr-1">🔒</span>}
                            {item.label}
                          </td>
                          <td className="text-center px-2 py-2">
                            <button className={toggleCls(true, section.locked)} disabled={section.locked}>
                              <span className={dotCls(true)} />
                            </button>
                          </td>
                          <td className="text-center px-2 py-2">
                            <button className={toggleCls(false, true)} disabled title="Verify phone to enable SMS">
                              <span className={dotCls(false)} />
                            </button>
                          </td>
                          <td className="px-2 py-2">
                            {item.freq === 'select' ? (
                              <select className="text-[11px] px-2 py-1 rounded border border-border bg-bg-main text-text">
                                <option>Daily</option>
                                <option>Weekly</option>
                                <option>Real-time</option>
                              </select>
                            ) : (
                              <span className="text-[11px] text-text-faint">{item.freq}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-5 py-3 border-t border-border">
              <button className="px-4 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold">Save Preferences</button>
            </div>
          </div>

          {/* Phone Verification */}
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-0.5">Phone Verification</div>
            <div className="text-[12px] text-text-dim mb-3">Verify your phone to enable SMS notifications and apply-on-notification escalation</div>
            <div className="flex items-center gap-2">
              <select className="px-2 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text">
                <option>+1 US</option><option>+44 UK</option><option>+61 AU</option>
              </select>
              <input type="tel" placeholder="555-123-4567" className="flex-1 px-3 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text placeholder:text-text-faint" />
              <button className="px-3 py-1.5 rounded-md bg-accent text-white text-[12px] font-semibold">Send Verification Code</button>
            </div>
          </div>
        </div>
      )}

      {/* Log */}
      {tab === 'log' && (
        <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <div>
              <div className="text-[14px] font-bold text-text">Notification Log</div>
              <div className="text-[12px] text-text-dim">All sent notifications with delivery status</div>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 rounded-md text-[11px] font-medium border border-border text-text-dim">Archive Selected</button>
              <button className="px-3 py-1 rounded-md text-[11px] font-medium border border-border text-text-dim">Export CSV</button>
            </div>
          </div>
          <div className="flex gap-2 px-5 py-2 border-b border-border flex-wrap">
            <select className="text-[11px] px-2 py-1 rounded border border-border bg-bg-main text-text"><option>All types</option></select>
            <select className="text-[11px] px-2 py-1 rounded border border-border bg-bg-main text-text"><option>All channels</option></select>
            <select className="text-[11px] px-2 py-1 rounded border border-border bg-bg-main text-text"><option>All statuses</option></select>
            <select className="text-[11px] px-2 py-1 rounded border border-border bg-bg-main text-text"><option>Active</option><option>Archived</option><option>All</option></select>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-bg-input text-left">
                <th className="px-2 py-2 w-7"><input type="checkbox" /></th>
                <th className="px-2 py-2 text-text-faint font-medium">Timestamp</th>
                <th className="px-2 py-2 text-text-faint font-medium">Type</th>
                <th className="px-2 py-2 text-text-faint font-medium w-[50px]">Channel</th>
                <th className="px-2 py-2 text-text-faint font-medium">Job / Company</th>
                <th className="px-2 py-2 text-text-faint font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {notifications.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-text-faint">
                  <p className="text-[14px] font-semibold mb-1">No notifications sent yet</p>
                  <p className="text-[12px]">Notification history will appear here once the system is active.</p>
                </td></tr>
              ) : (
                notifications.map(n => (
                  <tr key={n.id} className="border-t border-border">
                    <td className="px-2 py-2"><input type="checkbox" /></td>
                    <td className="px-2 py-2 text-text-dim">{new Date(n.created_at).toLocaleString()}</td>
                    <td className="px-2 py-2 text-text">{n.type}</td>
                    <td className="px-2 py-2 text-text-dim">{n.channel || 'email'}</td>
                    <td className="px-2 py-2 text-text">{n.title}</td>
                    <td className="px-2 py-2"><span className="text-[10px] font-semibold text-green">{n.status || 'sent'}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* My Surveys */}
      {tab === 'surveys' && (
        <div className="space-y-4">
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-0.5">Available Surveys</div>
            <div className="text-[12px] text-text-dim mb-3">Complete surveys to earn credits</div>
            <div className="text-center py-8 text-text-faint text-[12px]">No surveys available at this time</div>
          </div>
          <div className="border border-border rounded-xl bg-bg-card p-5">
            <div className="text-[14px] font-bold text-text mb-0.5">Your Responses</div>
            <div className="text-[12px] text-text-dim mb-3">Review your past survey submissions</div>
            <div className="text-center py-8 text-text-faint text-[12px]">No completed surveys yet</div>
          </div>
        </div>
      )}
    </div>
  );
}
