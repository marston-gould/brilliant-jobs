// ============================================================
// SettingsPage — Legacy Parity (dashboard.html lines 3246-3583)
// ============================================================
// Sections: Appearance, Account, Applicant Profile, AI Prefs,
// Job Search Mode (Active/Passive), Privacy & Data, Danger Zone
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
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
  const [eeocData, setEeocData] = useState<Record<string, string>>({});
  // SUB-05: username state + availability check
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle');
  const [usernameTimer, setUsernameTimer] = useState<ReturnType<typeof setTimeout>|null>(null);

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
        const ud = (u as any).user_data || {};
        setEeocData(ud.eeoc || {});
        // SUB-05: load username from profiles table
        (async () => {
          try {
            const { supabase } = await import('@app/lib/supabase');
            const { data } = await supabase.from('profiles').select('username').eq('id', u.id).single();
            if (data?.username) setUsername(data.username);
          } catch { /* non-critical */ }
        })();
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
      // SUB-05: save username separately via supabase direct
      if (username.trim() && usernameStatus !== 'taken' && usernameStatus !== 'invalid') {
        const { supabase } = await import('@app/lib/supabase');
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          await supabase.from('profiles').update({ username: username.trim().toLowerCase() }).eq('id', authUser.id);
        }
      }
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch { setSaveStatus('Error'); }
  }, [userProvider, firstName, lastName, phone, linkedin, location, workAuth, sponsorship, passiveMode]);

  // SUB-05: username availability check (debounced 300ms)
  const RESERVED = new Set(['admin','app','api','billing','benefits','compare','dashboard',
    'data-lab','feed','ghost-report','help','hiring-trends','index','install','jobs',
    'login','market','notifications','pipeline','pricing','privacy','referral',
    'referrals','roadmap','salary','settings','signup','stats','subscription',
    'survey','terms','tuning','uninstall','r']);

  const checkUsername = (val: string) => {
    if (usernameTimer) clearTimeout(usernameTimer);
    const clean = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (clean !== val.toLowerCase()) { setUsernameStatus('invalid'); return; }
    if (val.length < 3 || val.length > 30) { setUsernameStatus('invalid'); return; }
    if (RESERVED.has(val.toLowerCase())) { setUsernameStatus('taken'); return; }
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(val.toLowerCase()) && val.length > 1) {
      setUsernameStatus('invalid'); return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const { supabase } = await import('@app/lib/supabase');
        const { data } = await supabase.from('profiles').select('username').eq('username', val.toLowerCase()).maybeSingle();
        setUsernameStatus(data ? 'taken' : 'available');
      } catch { setUsernameStatus('idle'); }
    }, 300);
    setUsernameTimer(t);
  };

  const inputCls = "w-full px-3 py-2 rounded-md border border-border bg-bg-input text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40";
  const labelCls = "text-[11px] font-medium text-text-dim uppercase tracking-wide block mb-1";
  const cardCls = "border border-border rounded-xl bg-bg-card p-6 mb-5";
  const toggleRow = "flex items-center justify-between gap-3 py-2.5 border-b border-border text-[13px]";

  return (
    <div className="max-w-[760px]">
      <PageHeader title="Settings" subtitle="Account and preferences" helpLink="settings" onHelp={() => {}} />

      {/* Appearance */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Appearance</div>
        <div className="text-[12px] text-text-dim mb-4">Choose your theme preference</div>
        <div className="flex gap-2 flex-wrap">
          {([
            { key: 'light', label: 'Light',  Icon: Sun },
            { key: 'dark',  label: 'Dark',   Icon: Moon },
            { key: 'auto',  label: 'Auto',   Icon: Monitor },
          ] as { key: string; label: string; Icon: React.ElementType }[]).map(t => (
            <button key={t.key} onClick={() => setTheme(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all
                ${theme === t.key ? 'bg-accent text-white border-accent' : 'bg-bg-card text-text-dim border-border hover:border-accent'}`}>
              <t.Icon className="w-3.5 h-3.5" strokeWidth={1.75} />{t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Account</div>
        <div className="text-[12px] text-text-dim mb-4">Manage your account</div>
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

          {/* SUB-05: Username / Referral URL */}
          <div>
            <label className={labelCls}>Referral Username</label>
            <div className="text-[11px] text-text-faint mb-1.5">Your personal share link: <span className="font-mono text-accent">brilliantjobs.app/{username || 'yourusername'}</span></div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={username}
                onChange={e => { setUsername(e.target.value); checkUsername(e.target.value); }}
                placeholder="yourusername"
                maxLength={30}
                className={`${inputCls} ${usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'border-red' : usernameStatus === 'available' ? 'border-green' : ''}`}
              />
              {usernameStatus === 'checking' && <span className="text-[11px] text-text-faint">Checking…</span>}
              {usernameStatus === 'available' && <span className="text-[11px] text-green font-semibold">Available</span>}
              {usernameStatus === 'taken' && <span className="text-[11px] text-red font-semibold">Taken</span>}
              {usernameStatus === 'invalid' && <span className="text-[11px] text-red font-semibold">3–30 chars, letters/numbers/hyphens</span>}
            </div>
          </div>

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
                  <select className={inputCls}
                    defaultValue={eeocData[field.id] || ''}
                    onChange={e => {
                      const val = e.target.value;
                      setEeocData(prev => ({ ...prev, [field.id]: val }));
                      // Persist EEOC via user preferences
                      userProvider.updatePreferences({ eeoc: { ...eeocData, [field.id]: val } } as any).catch(() => {});
                    }}>
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

      {/* Apply Settings Sync — legacy line 3393 */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">Apply Settings Sync</div>
        <div className="text-[12px] text-text-dim mb-3">Your application mode and threshold are synced to the server for headless worker and extension access.</div>
        <div className="flex gap-3 items-center text-[12px] text-text-dim">
          <span>Mode: <strong className="text-text">{passiveMode ? 'Passive' : 'Active'}</strong></span>
          <span>Threshold: <strong className="text-text">70</strong></span>
          <span>Daily Limit: <strong className="text-text">—</strong></span>
        </div>
        <button onClick={async () => {
          try { await userProvider.updatePreferences({ syncedAt: new Date().toISOString() }); alert('Settings synced.'); } catch { alert('Sync failed.'); }
        }} className="mt-3 px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-bg-card text-text-dim hover:border-accent">Sync Now</button>
      </div>

      {/* AI Content Preferences */}
      <div className={cardCls}>
        <div className="text-[14px] font-bold text-text mb-0.5">AI Content Preferences</div>
        <div className="text-[12px] text-text-dim mb-4">Control how AI-generated content affects your job match scores.</div>
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
        <div className="text-[12px] text-text-dim mb-4">Active mode shows all matching jobs. Passive mode only alerts on exceptional matches.</div>
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
        <div className="text-[12px] text-text-dim mb-4">Manage your data rights under GDPR and privacy regulations</div>
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
        <div className="text-[12px] text-text-dim mb-4">Irreversible actions — proceed with caution</div>
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
