// ============================================================
// NotificationsPage — Legacy Parity (dashboard.html lines 2545-3057)
// ============================================================
// 3 tabs: Preferences (notification matrix), Log, My Surveys
// Preferences: matrix table with Email/SMS toggles + frequency
// 7 sections, 25+ notification types
// Phone verification section
// Log: filterable notification history table
// Surveys: user surveys section
// ============================================================

import { useState } from 'react';
import { PageHeader } from '@app/components';

type NcTab = 'preferences' | 'log' | 'surveys';

interface NotifRow { key: string; label: string; freq?: string; }
interface NotifSection { label: string; rows: NotifRow[]; }

const MATRIX: NotifSection[] = [
  { label: 'Real-time alerts', rows: [
    { key: 'auto_apply_confirm', label: 'Auto-apply confirmations', freq: 'Real-time' },
    { key: 'apply_alert', label: 'Apply-on-notification alerts', freq: 'Real-time' },
    { key: 'pipeline_response', label: 'Pipeline changes', freq: 'Real-time' },
    { key: 'pipeline_interview', label: 'Interview / Offer alerts', freq: 'Real-time' },
    { key: 'listing_closed', label: 'Listing closed', freq: 'Real-time' },
  ]},
  { label: 'Daily digest', rows: [
    { key: 'pipeline_stale', label: 'Stale application reminders' },
    { key: 'pipeline_auto_move', label: 'Auto-move notifications', freq: 'Daily' },
    { key: 'new_jobs_daily', label: 'New job matches', freq: 'Daily' },
    { key: 'company_hiring_surge', label: 'Company hiring surge', freq: 'Daily' },
    { key: 'ghost_alert', label: 'Ghost alerts', freq: 'Daily' },
    { key: 'salary_change', label: 'Salary range changes', freq: 'Daily' },
  ]},
  { label: 'Weekly intelligence', rows: [
    { key: 'market_report', label: 'Market report digest', freq: 'Weekly' },
    { key: 'resume_insights', label: 'Resume insights', freq: 'Weekly' },
    { key: 'competitive_intel', label: 'Competitive intelligence', freq: 'Weekly' },
  ]},
  { label: 'Smart prompts', rows: [
    { key: 'follow_up_reminder', label: 'Follow-up reminders', freq: 'Daily' },
    { key: 'interview_prep', label: 'Interview prep reminders', freq: 'Real-time' },
    { key: 'offer_deadline', label: 'Offer deadline alerts', freq: 'Real-time' },
  ]},
  { label: 'System', rows: [
    { key: 'credit_low', label: 'Low credit balance', freq: 'Real-time' },
    { key: 'plan_renewal', label: 'Plan renewal / billing', freq: 'Monthly' },
    { key: 'feature_updates', label: 'New features & updates', freq: 'Monthly' },
    { key: 'security_alerts', label: 'Security alerts', freq: 'Real-time' },
  ]},
  { label: 'Extension', rows: [
    { key: 'ext_update', label: 'Extension update available', freq: 'Real-time' },
    { key: 'ext_connection', label: 'Connection changes', freq: 'Real-time' },
  ]},
  { label: 'Referral', rows: [
    { key: 'referral_signup', label: 'Referral activated', freq: 'Real-time' },
    { key: 'referral_credit', label: 'Referral credits earned', freq: 'Real-time' },
  ]},
];

function Toggle({ on = true, disabled = false }: { on?: boolean; disabled?: boolean }) {
  const [checked, setChecked] = useState(on);
  return (
    <button
      onClick={() => !disabled && setChecked(!checked)}
      className={`w-8 h-[18px] rounded-full relative transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        ${checked ? 'bg-accent' : 'bg-border-hover'}`}
      disabled={disabled}
      title={disabled ? 'Verify phone to enable SMS' : undefined}
    >
      <span className={`absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform ${checked ? 'left-[14px]' : 'left-[2px]'}`} />
    </button>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<NcTab>('preferences');
  const [phoneVerified] = useState(false);

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Notification Center" subtitle="Manage how and when you receive alerts, digests, and intelligence updates" helpLink="notifications" onHelp={() => {}} />

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5">
        {([
          { key: 'preferences' as NcTab, label: 'Preferences' },
          { key: 'log' as NcTab, label: 'Log' },
          { key: 'surveys' as NcTab, label: 'My Surveys' },
        ]).map(t => (
          <button key={t.key}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border
              ${tab === t.key ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'}
            `}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Preferences tab */}
      {tab === 'preferences' && (
        <div className="space-y-5">
          {/* Phone verification */}
          <div className="border border-border rounded-xl bg-bg-card p-4">
            <div className="text-[13px] font-bold text-text mb-1">Phone Verification</div>
            <div className="text-[11px] text-text-faint mb-3">Verify your phone number to enable SMS notifications</div>
            {!phoneVerified ? (
              <div className="flex items-center gap-2">
                <input type="tel" placeholder="+1 (555) 123-4567"
                  className="px-3 py-1.5 rounded-md border border-border bg-bg-input text-[12px] text-text w-48" />
                <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Send Code</button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-green text-[12px] font-semibold">✓ Phone verified</div>
            )}
          </div>

          {/* Notification matrix */}
          <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <div className="text-[14px] font-bold text-text">Notification Preferences</div>
              <div className="text-[11px] text-text-faint mt-0.5">Choose how and when you receive each type of alert</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-bg-input/50">
                    <th className="text-left px-4 py-2 font-medium text-text-dim min-w-[200px]">Type</th>
                    <th className="text-center px-2 py-2 font-medium text-text-dim w-16">Email</th>
                    <th className="text-center px-2 py-2 font-medium text-text-dim w-16">SMS</th>
                    <th className="text-left px-2 py-2 font-medium text-text-dim w-[120px]">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map(section => (
                    <>
                      <tr key={`s-${section.label}`} className="bg-bg-input/30">
                        <td colSpan={4} className="px-4 py-1.5 text-[10px] font-semibold text-text-dim uppercase tracking-wider">{section.label}</td>
                      </tr>
                      {section.rows.map(row => (
                        <tr key={row.key} className="border-t border-border/50 hover:bg-bg-input/20">
                          <td className="px-4 py-2 text-text">{row.label}</td>
                          <td className="text-center px-2 py-2"><Toggle on={true} /></td>
                          <td className="text-center px-2 py-2"><Toggle on={false} disabled={!phoneVerified} /></td>
                          <td className="px-2 py-2">
                            {row.freq === 'Real-time' ? (
                              <span className="text-[10px] text-text-faint">Real-time</span>
                            ) : row.freq ? (
                              <select className="px-1.5 py-0.5 rounded border border-border bg-bg-main text-[10px] text-text">
                                <option>Real-time</option>
                                <option selected={row.freq === 'Daily'}>Daily</option>
                                <option selected={row.freq === 'Weekly'}>Weekly</option>
                                <option selected={row.freq === 'Monthly'}>Monthly</option>
                              </select>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Log tab */}
      {tab === 'log' && (
        <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-[13px] font-bold text-text">Notification Log</div>
            <input type="text" placeholder="Filter…"
              className="px-2.5 py-1 rounded-md border border-border bg-bg-input text-[11px] text-text w-32" />
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-bg-input/50 border-b border-border">
                <th className="text-left px-4 py-2 font-medium text-text-dim">Type</th>
                <th className="text-left px-2 py-2 font-medium text-text-dim">Message</th>
                <th className="text-left px-2 py-2 font-medium text-text-dim w-20">Channel</th>
                <th className="text-left px-2 py-2 font-medium text-text-dim w-24">Sent</th>
                <th className="text-left px-2 py-2 font-medium text-text-dim w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colSpan={5} className="text-center py-8 text-text-faint">No notifications sent yet</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Surveys tab */}
      {tab === 'surveys' && (
        <div className="text-center py-12 text-text-faint">
          <p className="text-sm font-medium">No surveys available</p>
          <p className="text-xs mt-1">Periodic check-ins and feedback surveys will appear here</p>
        </div>
      )}
    </div>
  );
}
