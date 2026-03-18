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

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@app/components';
import { useProviders } from '@providers';

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

function Toggle({ on = true, disabled = false, onClick }: { on?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={() => !disabled && onClick?.()}
      className={`w-10 h-[22px] rounded-full relative transition-colors ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
        ${on ? 'bg-accent' : 'bg-border-hover'}`}
      disabled={disabled}
      title={disabled ? 'Verify phone to enable SMS' : undefined}
    >
      <span className={`absolute top-[2px] w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${on ? 'left-[20px]' : 'left-[2px]'}`} />
    </button>
  );
}

export default function NotificationsPage() {
  const [tab, setTab] = useState<NcTab>('preferences');
  const [phoneVerified] = useState(false);
  const { applications: notifProvider } = useProviders();
  const [prefs, setPrefs] = useState<Record<string, { email: boolean; sms: boolean; freq: string }>>({});
  const [log, setLog] = useState<any[]>([]);

  useEffect(() => {
    notifProvider.getNotifPrefs().then((data: any[]) => {
      const map: Record<string, { email: boolean; sms: boolean; freq: string }> = {};
      (data || []).forEach((r: any) => {
        map[r.notification_type] = { email: !!r.email_enabled, sms: !!r.sms_enabled, freq: r.frequency || 'daily' };
      });
      setPrefs(map);
    }).catch(() => {});
    notifProvider.getNotifLog().then((data: any[]) => setLog(data || [])).catch(() => {});
  }, [notifProvider]);

  const togglePref = useCallback((notifType: string, field: 'email' | 'sms') => {
    const current = prefs[notifType] || { email: true, sms: false, freq: 'daily' };
    const newVal = field === 'email' ? !current.email : !current.sms;
    setPrefs(prev => ({ ...prev, [notifType]: { ...current, [field]: newVal } }));
    const dbField = field === 'email' ? 'email_enabled' : 'sms_enabled';
    (notifProvider as any).saveNotifPref?.(notifType, dbField, newVal);
  }, [prefs, notifProvider]);

  return (
    <div className="max-w-[860px]">
      <PageHeader title="Notification Center" subtitle="Manage how and when you receive alerts, digests, and intelligence updates" helpLink="notifications" onHelp={() => {}} />

      {/* Tabs */}
      <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit mb-5">
        {([
          { key: 'preferences' as NcTab, label: 'Preferences' },
          { key: 'log' as NcTab, label: 'Log' },
          { key: 'surveys' as NcTab, label: 'My Surveys' },
        ]).map(t => (
          <button key={t.key}
            className={`px-3.5 py-1 rounded-md text-[11px] font-semibold transition-all border
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
                <button onClick={async () => { const phone = (document.querySelector("input[type=tel]") as HTMLInputElement)?.value; if (!phone) { alert("Enter a phone number first"); return; } try { const { callGateway } = await import("@app/lib/supabase"); await callGateway("send-verification-code", { phone }); alert("Verification code sent to " + phone); } catch { alert("Failed to send code"); } }} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white">Send Code</button>
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
                    <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] border-b-2 border-border min-w-[200px]">Type</th>
                    <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] border-b-2 border-border w-16">Email</th>
                    <th className="text-center px-2 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] border-b-2 border-border w-16">SMS</th>
                    <th className="text-left px-2 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] border-b-2 border-border w-[120px]">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.map(section => (
                    <>
                      <tr key={`s-${section.label}`} className="">
                        <td colSpan={4} className="px-2 pt-4 pb-1.5 text-[11px] font-bold text-text-faint uppercase tracking-[0.5px] border-b border-border">{section.label}</td>
                      </tr>
                      {section.rows.map(row => {
                        const p = prefs[row.key] || { email: true, sms: false, freq: row.freq || 'daily' };
                        return (
                        <tr key={row.key} className="border-t border-border/50 hover:bg-bg-input/20">
                          <td className="px-2 py-2.5 text-[13px] text-text-dim border-b border-border align-middle">{row.label}</td>
                          <td className="text-center px-2 py-2.5 border-b border-border align-middle"><Toggle on={p.email} onClick={() => togglePref(row.key, 'email')} /></td>
                          <td className="text-center px-2 py-2.5 border-b border-border align-middle"><Toggle on={p.sms} disabled={!phoneVerified} onClick={() => phoneVerified && togglePref(row.key, 'sms')} /></td>
                          <td className="px-2 py-2">
                            {row.freq === 'Real-time' ? (
                              <span className="text-[10px] text-text-faint">Real-time</span>
                            ) : row.freq ? (
                              <select className="px-1.5 py-0.5 rounded border border-border bg-bg-main text-[10px] text-text" defaultValue={p.freq}>
                                <option value="realtime">Real-time</option>
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            ) : null}
                          </td>
                        </tr>
                        );
                      })}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Escalation Rules — legacy lines 2831-2900 */}
          <div className="border border-border rounded-xl bg-bg-card p-6">
            <div className="text-[14px] font-bold text-text mb-1">Escalation Rules</div>
            <div className="text-[12px] text-text-dim mb-4">Controls how apply-on-notification alerts escalate when you don't respond</div>

            {/* Timeline visualization */}
            <div className="flex items-center py-4 overflow-x-auto">
              {[
                { icon: '✉', label: 'Email sent', color: 'bg-accent/10 text-accent' },
                null,
                { icon: '⏱', label: 'Wait 4h', color: 'bg-bg-input text-text-faint' },
                null,
                { icon: '💬', label: 'SMS reminder', color: 'bg-green/10 text-green' },
                null,
                { icon: '⏱', label: 'Wait 2h', color: 'bg-bg-input text-text-faint' },
                null,
                { icon: '✕', label: 'Marked missed', color: 'bg-red/10 text-red' },
              ].map((node, i) => node === null ? (
                <div key={i} className="flex-1 min-w-6 h-0.5 bg-border" />
              ) : (
                <div key={i} className="flex flex-col items-center gap-1.5 min-w-[80px] text-center">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[14px] ${node.color}`}>{node.icon}</div>
                  <div className="text-[11px] text-text-faint leading-tight">{node.label}</div>
                </div>
              ))}
            </div>

            {/* Config rows */}
            <div className="bg-bg-card border border-border rounded-xl p-5 mt-2">
              <div className="flex items-center gap-3 py-2.5 border-b border-border text-[13px]">
                <span className="text-text-dim flex-1">Email-to-SMS escalation timeout</span>
                <input type="range" min={1} max={12} defaultValue={4} className="w-40 accent-accent"
                  onChange={e => {
                    const s = e.target.nextElementSibling;
                    if (s) s.textContent = e.target.value + ' hours';
                  }}
                  onMouseUp={e => {
                    const val = (e.target as HTMLInputElement).value;
                    (notifProvider as any).saveNotifPref?.("__escalation", "escalation_timeout_hours", parseInt(val)).catch(() => {});
                    (window as any).__bjToast?.(`Escalation timeout set to ${val} hours`, 'success');
                  }} />
                <span className="text-[14px] font-semibold text-accent min-w-[56px]">4 hours</span>
              </div>
              <div className="flex items-center gap-3 py-2.5 border-b border-border text-[13px]">
                <span className="text-text-dim flex-1">Quiet hours</span>
                <div className="flex items-center gap-2">
                  <input type="time" defaultValue="22:00" className="px-2 py-1 rounded-lg border border-border bg-bg-input text-[13px] text-text"
                    onBlur={e => { (notifProvider as any).saveNotifPref?.("__quiet", "quiet_start", e.target.value).catch(() => {}); }} />
                  <span className="text-[12px] text-text-faint">to</span>
                  <input type="time" defaultValue="07:00" className="px-2 py-1 rounded-lg border border-border bg-bg-input text-[13px] text-text"
                    onBlur={e => { (notifProvider as any).saveNotifPref?.("__quiet", "quiet_end", e.target.value).catch(() => {}); }} />
                </div>
              </div>
              <div className="text-[11px] text-text-faint mt-2">Notifications held until quiet hours end. Escalation timers pause.</div>
            </div>
          </div>
        </div>
      )}
      {tab === 'log' && (
        <div className="border border-border rounded-xl bg-bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-[13px] font-bold text-text">Notification Log</div>
            <div className="flex items-center gap-2">
              <button onClick={() => {
                const csv = ['Type,Message,Channel,Sent,Status', ...log.map((e: any) => `"${e.notification_type || ''}","${(e.message || '').replace(/"/g, '""')}","${e.channel || ''}","${e.sent_at || ''}","${e.status || ''}"`
                )].join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'notification-log.csv'; a.click();
                (window as any).__bjToast?.('CSV exported', 'success');
              }} className="px-2.5 py-1 rounded-md border border-border bg-bg-input text-[11px] font-semibold text-text-dim hover:border-accent">Export CSV</button>
            </div>
          </div>
          {/* Log filters — legacy .notif-log-filters */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border flex-wrap">
            <select className="px-2 py-1 rounded-md border border-border bg-bg-input text-[11px] text-text">
              <option value="">All types</option>
              <option value="auto_apply_confirm">Auto-apply confirm</option>
              <option value="apply_alert">Apply alert</option>
              <option value="pipeline_response">Pipeline change</option>
              <option value="new_jobs_daily">New job matches</option>
              <option value="weekly_summary">Weekly summary</option>
              <option value="credit_low">Credit balance low</option>
            </select>
            <select className="px-2 py-1 rounded-md border border-border bg-bg-input text-[11px] text-text">
              <option value="">All statuses</option>
              <option value="delivered">Delivered</option>
              <option value="opened">Opened</option>
              <option value="failed">Failed</option>
              <option value="expired">Expired</option>
            </select>
            <input type="text" placeholder="Search…"
              className="px-2.5 py-1 rounded-md border border-border bg-bg-input text-[11px] text-text w-32 ml-auto" />
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-bg-input/50 border-b border-border">
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px]">Type</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px]">Message</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] w-20">Channel</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] w-24">Sent</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-text-faint uppercase tracking-[0.5px] w-16">Status</th>
              </tr>
            </thead>
            <tbody>
              {log.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-text-faint">No notifications sent yet</td></tr>
              ) : log.map((entry: any, i: number) => (
                <tr key={entry.id || i} className="border-t border-border/50 hover:bg-bg-input/20">
                  <td className="px-2 py-2.5 text-[13px] text-text-dim border-b border-border align-middle">{entry.notification_type || entry.type || '—'}</td>
                  <td className="px-2 py-2 text-text-dim truncate max-w-[200px]">{entry.message || entry.subject || '—'}</td>
                  <td className="px-2 py-2 text-text-faint">{entry.channel || 'email'}</td>
                  <td className="px-2 py-2 text-text-faint">{entry.created_at ? new Date(entry.created_at).toLocaleDateString() : '—'}</td>
                  <td className="px-2 py-2"><span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${entry.status === 'sent' ? 'bg-green/10 text-green' : entry.status === 'failed' ? 'bg-red/10 text-red' : 'bg-bg-input text-text-faint'}`}>{entry.status || '—'}</span></td>
                </tr>
              ))}
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
