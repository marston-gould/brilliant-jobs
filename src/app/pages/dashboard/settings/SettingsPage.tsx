// ============================================================
// SettingsPage — Legacy Parity (dashboard.html lines 3246-3583)
// ============================================================
// Sections: Appearance, Account, Applicant Profile, AI Prefs,
// Job Search Mode (Active/Passive), Privacy & Data, Danger Zone
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@app/components';
import { useUser } from '@providers';
import type { UserProfile } from '@providers/types';

export default function SettingsPage() {
  const userProvider = useUser();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [theme, setThemeState] = useState(() => {
    try { return localStorage.getItem('bj-theme') || 'auto'; } catch { return 'auto'; }
  });

  // Applicant profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [location, setLocation] = useState('');
  const [workAuth, setWorkAuth] = useState(true);
  const [sponsorship, setSponsorship] = useState(false);
  const [passiveMode, setPassiveMode] = useState(false);
  const [excludeMixed, setExcludeMixed] = useState(false);
  const [excludeAI, setExcludeAI] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    userProvider.getCurrentUser().then(u => {
      if (u) {
        setUser(u);
        setEmail(u.email);
        const prefs = u.preferences as Record<string, any> || {};
        setFirstName(prefs.firstName || '');
        setLastName(prefs.lastName || '');
        setPhone(prefs.phone || '');
        setLinkedin(prefs.linkedin || '');
        setLocation(prefs.location || '');
        setWorkAuth(prefs.workAuth !== false);
        setSponsorship(!!prefs.sponsorship);
        setPassiveMode(!!prefs.passiveMode);
      }
    });
  }, [userProvider]);

  const setTheme = useCallback((t: string) => {
    setThemeState(t);
    try { localStorage.setItem('bj-theme', t); } catch {}
    document.documentElement.setAttribute('data-theme', t);
  }, []);

  const saveProfile = useCallback(async () => {
    try {
      await userProvider.updatePreferences({
        firstName, lastName, phone, linkedin, location, workAuth, sponsorship, passiveMode,
      });
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch { setSaveStatus('Error'); }
  }, [userProvider, firstName, lastName, phone, linkedin, location, workAuth, sponsorship, passiveMode]);

  const inputCls = "w-full px-3 py-2 rounded-md border border-border bg-bg-input text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "text-[11px] font-medium text-text-dim uppercase tracking-wide block mb-1";
  const cardCls = "border border-border rounded-xl bg-bg-card p-6 mb-5";
  const toggleRow = "flex items-center justify-between py-2.5 border-t border-border";

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" subtitle="Account and preferences" helpLink="settings" onHelp={() => {}} />

      {/* Appearance */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Appearance</div>
        <div className="text-[12px] text-text-dim mb-3">Choose your theme preference</div>
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'light', label: '☀️ Light' },
            { key: 'dark', label: '🌙 Dark' },
            { key: 'auto', label: '◐ Auto' },
          ].map(t => (
            <button key={t.key} onClick={() => setTheme(t.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all
                ${theme === t.key ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'}
              `}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Account</div>
        <div className="text-[12px] text-text-dim mb-3">Manage your account</div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={async () => {
            try {
              const { supabase } = await import('@app/lib/supabase');
              await supabase.auth.resetPasswordForEmail(email || '', { redirectTo: window.location.origin + '/app/settings' });
              alert('Password reset email sent. Check your inbox.');
            } catch { alert('Failed to send reset email.'); }
          }} className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-bg-card text-text-dim hover:border-accent">Change Password</button>
          <button onClick={async () => {
            try {
              const u = await userProvider.getCurrentUser();
              if (!u) return;
              const blob = new Blob([JSON.stringify(u, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'brilliant-jobs-data.json'; a.click();
              URL.revokeObjectURL(url);
            } catch { alert('Export failed.'); }
          }} className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-bg-card text-text-dim hover:border-accent">Export Data</button>
        </div>
      </div>

      {/* Applicant Profile */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Applicant Profile</div>
        <div className="text-[12px] text-text-dim mb-4">Your details for auto-apply and headless submissions. Name and email are required.</div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelCls}>First Name *</label><input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" className={inputCls} /></div>
            <div><label className={labelCls}>Last Name *</label><input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" className={inputCls} /></div>
          </div>
          <div><label className={labelCls}>Email *</label><input type="email" value={email} readOnly className={`${inputCls} opacity-60`} /></div>
          <div><label className={labelCls}>Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 123-4567" className={inputCls} /></div>
          <div><label className={labelCls}>LinkedIn URL</label><input type="url" value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/janedoe" className={inputCls} /></div>
          <div><label className={labelCls}>Location</label><input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="San Francisco, CA" className={inputCls} /></div>

          <div className={toggleRow}>
            <div><div className="text-[13px] font-semibold text-text">Work Authorization (US)</div><div className="text-[11px] text-text-faint">Legally authorized to work in the United States</div></div>
            <button onClick={() => setWorkAuth(!workAuth)} className={`w-10 h-[22px] rounded-full relative transition-colors ${workAuth ? 'bg-accent' : 'bg-border-hover'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${workAuth ? 'left-[20px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className={toggleRow}>
            <div><div className="text-[13px] font-semibold text-text">Requires Visa Sponsorship</div><div className="text-[11px] text-text-faint">Will need employer sponsorship for work visa</div></div>
            <button onClick={() => setSponsorship(!sponsorship)} className={`w-10 h-[22px] rounded-full relative transition-colors ${sponsorship ? 'bg-accent' : 'bg-border-hover'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${sponsorship ? 'left-[20px]' : 'left-0.5'}`} />
            </button>
          </div>

          {/* EEOC Voluntary Self-Identification — legacy lines 3320-3384 */}
          <div className="pt-3 border-t border-border">
            <div className="text-[13px] font-semibold text-text mb-0.5">Voluntary Self-Identification (EEOC/OFCCP)</div>
            <div className="text-[11px] text-text-faint mb-3">Many employers collect this for federal compliance. Responses are optional and only used to auto-fill voluntary self-ID forms.</div>
            <div className="space-y-2.5">
              {[
                { id: 'gender', label: 'Gender', options: ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Decline to self-identify'] },
                { id: 'ethnicity', label: 'Race / Ethnicity', options: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or more races', 'Prefer not to say', 'Decline to self-identify'] },
                { id: 'veteran', label: 'Veteran Status', options: ['I am a protected veteran', 'I am not a protected veteran', 'Prefer not to say', 'Decline to self-identify'] },
                { id: 'disability', label: 'Disability Status', options: ['Yes, I have a disability', 'No, I do not have a disability', 'Prefer not to say', 'Decline to self-identify'] },
                { id: 'citizenship', label: 'Citizenship Status', options: ['US Citizen', 'Permanent Resident', 'Non-citizen authorized to work', 'Require sponsorship', 'Prefer not to say', 'Decline to self-identify'] },
              ].map(field => (
                <div key={field.id}>
                  <label className={labelCls}>{field.label}</label>
                  <select className={inputCls}>
                    <option value="">— Not set —</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button onClick={saveProfile} className="px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold">Save Profile</button>
            {saveStatus && <span className="text-[11px] text-green font-medium">{saveStatus}</span>}
          </div>
        </div>
      </div>

      {/* AI Content Preferences */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">AI Content Preferences</div>
        <div className="text-[12px] text-text-dim mb-3">Control how AI-generated content affects your job match scores.</div>
        {[
          { key: 'mixed' as const, label: 'Exclude Mixed Content', desc: "Jobs with partially AI-written descriptions won't affect your match scores", active: excludeMixed, toggle: () => { setExcludeMixed(!excludeMixed); userProvider.updatePreferences({ excludeMixed: !excludeMixed }).catch(() => {}); } },
          { key: 'ai' as const, label: 'Exclude AI-Generated', desc: "Jobs with fully AI-written descriptions won't affect your match scores", active: excludeAI, toggle: () => { setExcludeAI(!excludeAI); userProvider.updatePreferences({ excludeAI: !excludeAI }).catch(() => {}); } },
        ].map(pref => (
          <div key={pref.key} className={toggleRow}>
            <div><div className="text-[13px] font-semibold text-text">{pref.label}</div><div className="text-[11px] text-text-faint">{pref.desc}</div></div>
            <button onClick={pref.toggle} className={`w-10 h-[22px] rounded-full relative transition-colors ${pref.active ? 'bg-accent' : 'bg-border-hover'}`}>
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${pref.active ? 'left-[20px]' : 'left-0.5'}`} />
            </button>
          </div>
        ))}
      </div>

      {/* Job Search Mode */}
      <div className={cardCls}>
        <div className="flex items-center justify-between mb-0.5">
          <div className="text-[14px] font-bold text-text">Job Search Mode</div>
          <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${passiveMode ? 'bg-warm text-white' : 'bg-green text-white'}`}>
            {passiveMode ? 'Passive' : 'Active'}
          </span>
        </div>
        <div className="text-[12px] text-text-dim mb-3">Active mode shows all matching jobs. Passive mode only alerts on exceptional matches.</div>
        <div className={toggleRow}>
          <div><div className="text-[13px] font-semibold text-text">Passive Mode</div><div className="text-[11px] text-text-faint">Only notify me on high-bar matches</div></div>
          <button onClick={() => setPassiveMode(!passiveMode)} className={`w-10 h-[22px] rounded-full relative transition-colors ${passiveMode ? 'bg-accent' : 'bg-border-hover'}`}>
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${passiveMode ? 'left-[20px]' : 'left-0.5'}`} />
          </button>
        </div>
      </div>

      {/* Privacy & Data */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Privacy & Data</div>
        <div className="text-[12px] text-text-dim mb-3">Manage your data rights under GDPR and privacy regulations</div>
        <button onClick={async () => {
          try {
            const { callGateway } = await import('@app/lib/supabase');
            const data = await callGateway('account-lifecycle', { action: 'export' });
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'brilliant-jobs-full-export.json'; a.click();
            URL.revokeObjectURL(url);
          } catch { alert('Export failed. Try again later.'); }
        }} className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-bg-card text-text-dim hover:border-accent flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download All My Data (JSON)
        </button>
        <div className="text-[11px] text-text-faint mt-2">Exports profile, resumes, applications, notifications, and preferences.</div>
      </div>

      {/* Danger Zone */}
      <div className="border border-red rounded-xl bg-bg-card p-6 mb-5">
        <div className="text-[14px] font-bold text-red mb-0.5">Danger Zone</div>
        <div className="text-[12px] text-text-dim mb-3">Irreversible actions — proceed with caution</div>
        <p className="text-[12px] text-text-faint mb-3">Deleting your account will remove all your data after a 30-day grace period. During the grace period you can log in and cancel the deletion.</p>
        <button onClick={async () => {
          if (!confirm('Are you sure you want to delete your account? This action will take effect after 30 days.')) return;
          try {
            const { callGateway } = await import('@app/lib/supabase');
            await callGateway('account-delete', { action: 'request' });
            alert('Account deletion requested. You have 30 days to cancel by logging in.');
          } catch { alert('Failed to request deletion. Try again later.'); }
        }} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-red text-white">Delete My Account</button>
      </div>
    </div>
  );
}
