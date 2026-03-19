// ============================================================
// GetStartedPage — Onboarding & Setup (Legacy: page-brilliant)
// ============================================================
// Faithful recreation of legacy/dashboard.html lines 358-808.
// 5-step onboarding: Extension, Accounts, Filters, Tuning, Feed.
// Resume-first CTA, connection status bar, data advantage section.
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Upload, CirclePlus, Link, Filter, SlidersHorizontal,
  LayoutGrid, TrendingUp, Check, ExternalLink, ChevronDown, User,
} from 'lucide-react';
import { useStatsProvider, useResumesProvider } from '@providers';
import { PageHeader } from '@app/components/PageHeader';

// ── Connection status types ──
type DotStatus = 'connected' | 'disconnected' | 'pending';

function StatusDot({ status }: { status: DotStatus }) {
  const colors: Record<DotStatus, string> = {
    connected: 'bg-green',
    disconnected: 'bg-red',
    pending: 'bg-warm',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

// ── Step component ──
function Step({ num, title, icon: Icon, iconBg, iconColor, children, badge, id }: {
  num: string; title: string; icon: typeof Filter;
  iconBg: string; iconColor: string; children: React.ReactNode;
  badge?: React.ReactNode; id?: string;
}) {
  return (
    <div id={id} className="border border-border rounded-[14px] bg-bg-card p-7 space-y-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] mb-3.5 hover:border-border-hover hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-5 h-5" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-faint mb-0.5">{num}</div>
          <div className="text-[17px] font-bold text-text leading-tight">{title}</div>
        </div>
        {badge}
      </div>
      <div className="text-[14px] text-text-dim" style={{ lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export default function GetStartedPage() {
  const navigate = useNavigate();
  const statsProvider = useStatsProvider();
  const resumeProvider = useResumesProvider();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState({ jobs: 0, pages: 0, companies: 0 });
  const [linkedinProfile, setLinkedinProfile] = useState<{ firstName: string; lastName: string; headline: string; summary: string; industry: string; location: string; importedAt?: string } | null>(null);
  const [extStatus, setExtStatus] = useState<DotStatus>('disconnected');
  const [gmailStatus, setGmailStatus] = useState<DotStatus>('disconnected');
  const [gcalStatus, setGcalStatus] = useState<DotStatus>('disconnected');
  const [gdriveStatus, setGdriveStatus] = useState<DotStatus>('disconnected');

  // Check Google connection status + LinkedIn profile from Supabase
  useEffect(() => {
    (async () => {
      try {
        const { supabase: sb, getUser } = await import('@app/lib/supabase');
        const user = await getUser();
        if (!user) return;
        const { data } = await sb.from('gmail_connections')
          .select('gmail_address, sync_status')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data && data.gmail_address && data.gmail_address !== 'pending') {
          setGmailStatus('connected');
          setGcalStatus('connected');
        }
        // Load LinkedIn profile
        const { data: profile } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
        const li = (profile?.user_data as Record<string, unknown>)?.linkedin_profile as Record<string, string> | undefined;
        if (li?.firstName) setLinkedinProfile(li as any);
        // Check URL params for just-completed OAuth
        const params = new URLSearchParams(window.location.search);
        const gmailParam = params.get('gmail');
        if (gmailParam === 'connected') {
          setGmailStatus('connected');
          setGcalStatus('connected');
          // If drive scope was requested, mark drive too
          if (window.location.hash === '#connect-accounts' || params.get('scope') === 'drive') {
            setGdriveStatus('connected');
          }
          (window as any).__bjToast?.('Google account connected successfully!', 'success');
        } else if (gmailParam === 'denied') {
          (window as any).__bjToast?.('Google connection was denied', 'error');
        } else if (gmailParam === 'error') {
          (window as any).__bjToast?.('Google connection failed — please try again', 'error');
        }
        // Scroll to connect section if returning from OAuth
        if (gmailParam) {
          setTimeout(() => {
            document.getElementById('connect-accounts')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      } catch {}
    })();
  }, []);

  // Check extension — looks for recent scan activity in profiles table (same as legacy)
  useEffect(() => {
    (async () => {
      try {
        const { supabase: sb, getUser } = await import('@app/lib/supabase');
        const user = await getUser();
        if (!user) return;
        const { data: profile } = await sb.from('profiles')
          .select('last_scan_at, scanner_running, extension_version')
          .eq('id', user.id)
          .single();
        if (profile?.last_scan_at) {
          const hoursSince = (Date.now() - new Date(profile.last_scan_at).getTime()) / 3600000;
          if (profile.scanner_running || hoursSince < 12) {
            setExtStatus('connected');
          }
        }
      } catch {}
    })();
  }, []);

  // Load stats
  useEffect(() => {
    statsProvider.getJobCounts().then(async data => {
      // Get total career pages tracked (ats_companies) — not just ones with active jobs
      let totalPages = 39000; // fallback
      try {
        const { supabase: sb } = await import('@app/lib/supabase');
        const { count } = await sb.from('ats_companies').select('*', { count: 'exact', head: true });
        if (count && count > 0) totalPages = count;
      } catch { /* fallback */ }
      if (data) setStats({
        jobs: data.total_open ?? 0,
        pages: totalPages,
        companies: data.total_companies ?? 0,
      });
    }).catch(() => {});
  }, [statsProvider]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const toast = (msg: string, type: string) => (window as any).__bjToast?.(msg, type);
    toast('Step 1/4: Reading your resume…', 'info');

    try {
      const { supabase: sb, getUser, callGateway } = await import('@app/lib/supabase');
      const user = await getUser();
      if (!user) { toast('Please sign in first', 'error'); return; }

      const session = await sb.auth.getSession();
      const token = session?.data?.session?.access_token;
      if (!token) { toast('Auth session expired — please refresh', 'error'); return; }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'docx';
      const displayName = file.name.replace(/\.[^.]+$/, '');

      // ── STEP 1: Extract text client-side ──
      let extractedText = '';
      try {
        const arrayBuf = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        if (fileExt === 'docx') {
          const { unzipSync } = await import('fflate');
          const unzipped = unzipSync(bytes);
          const docXml = unzipped['word/document.xml'];
          if (docXml) {
            const xmlStr = new TextDecoder('utf-8').decode(docXml);
            const bodyMatch = xmlStr.match(/<w:body>([\s\S]*)<\/w:body>/);
            if (bodyMatch) {
              const paragraphs: string[] = [];
              const pRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
              let m;
              while ((m = pRegex.exec(bodyMatch[1])) !== null) {
                const pText: string[] = [];
                const tRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
                let tm;
                while ((tm = tRegex.exec(m[0])) !== null) { if (tm[1]) pText.push(tm[1]); }
                if (pText.length) paragraphs.push(pText.join(''));
              }
              extractedText = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
            }
          }
        }
      } catch (err) {
        toast('Failed to read DOCX file: ' + (err instanceof Error ? err.message : String(err)), 'error');
        return;
      }

      if (!extractedText || extractedText.length < 100) {
        toast('Could not extract text from resume (' + extractedText.length + ' chars). Try a .docx with standard formatting.', 'error');
        return;
      }
      toast('Step 2/4: Storing resume…', 'info');

      // ── STEP 2: Upload file to storage + insert into resume_archive directly ──
      // Skip resume-parse (times out on 11K+ char resumes). We already have the text.
      const storagePath = user.id + '/' + Date.now() + '_' + file.name;
      try {
        const { error: uploadErr } = await sb.storage.from('resumes').upload(storagePath, file);
        if (uploadErr) toast('File storage warning: ' + uploadErr.message, 'info');
      } catch (err) {
        toast('File storage failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
        // Continue — text extraction succeeded, storage is secondary
      }

      let archiveResumeId: string | null = null;
      let resumesTableId: string | null = null;
      try {
        // Insert into resume_archive (where Resumes page reads from)
        const { data: archiveRow, error: archiveErr } = await sb.from('resume_archive').insert({
          user_id: user.id,
          display_name: displayName,
          version_number: 1,
          file_hash: Date.now() + '_' + file.size,
          file_size_bytes: file.size,
          file_type: fileExt,
          storage_path: storagePath,
          is_active: true,
          is_archived: false,
          metadata_snapshot: { source: 'upload' },
          extracted_text: extractedText,
        }).select('resume_id').single();
        if (archiveErr) {
          toast('Resume archive save failed: ' + archiveErr.message, 'error');
        } else {
          archiveResumeId = archiveRow?.resume_id || null;
        }

        // Also insert into resumes table (resume_filter_assignments FK references this)
        const { data: resumeRow, error: resumeErr } = await sb.from('resumes').insert({
          user_id: user.id,
          name: displayName,
          file_name: file.name,
          file_path: storagePath,
          file_size: String(file.size),
          source: 'upload',
        }).select('id').single();
        if (resumeErr) {
          toast('Resume record save failed: ' + resumeErr.message, 'error');
        } else {
          resumesTableId = resumeRow?.id || null;
        }
      } catch (err) {
        toast('Resume save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
      }
      toast('Step 3/4: Generating search filter from your experience…', 'info');

      // ── STEP 3: Generate filter from resume text (direct call, bypass gateway) ──
      let filterResult: any = null;
      try {
        const filterRes = await fetch(
          'https://qojhagupdnbtomfoxnsf.supabase.co/functions/v1/generate-filter',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json',
              'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFvamhhZ3VwZG5idG9tZm94bnNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjkwNjYsImV4cCI6MjA4NjE0NTA2Nn0.0AFgnrN7omBC4Jg8G0kxZACn5mXLWPazIodI6JOx1rg',
            },
            body: JSON.stringify({ resume_text: extractedText }),
          }
        );
        const filterData = await filterRes.json();
        if (!filterRes.ok) {
          toast('Filter generation failed: ' + (filterData?.error || filterRes.status), 'error');
        } else {
          filterResult = filterData;
        }
        if (!filterResult?.filter_name) {
          toast('AI filter generation returned empty result', 'info');
        }
      } catch (err) {
        toast('Filter generation failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
        // Don't return — resume is saved, navigate to feed anyway
      }

      // ── STEP 5: Save filter + link to resume ──
      if (filterResult?.filter_name) {
        toast('Step 4/4: Saving "' + filterResult.filter_name + '" filter…', 'info');
        try {
          const filterData = {
            name: filterResult.filter_name,
            whatPills: (filterResult.what || []).map((v: string) => ({ type: 'keyword', values: [v] })),
            whatNotPills: (filterResult.what_not || []).map((v: string) => ({ type: 'not', values: [v] })),
            wherePills: (filterResult.where || []).map((v: string) => ({ type: 'where', values: [v] })),
            whoNotPills: (filterResult.who_not || []).map((v: string) => ({ type: 'who_not', values: [v] })),
            payPills: filterResult.salary_min ? [{ type: 'pay', min: String(filterResult.salary_min), max: '', values: ['$' + Math.round(filterResult.salary_min / 1000) + 'k+'] }] : [],
            levelPills: filterResult.level ? [{ type: 'level', values: [filterResult.level] }] : [],
            includeRemote: filterResult.include_remote || false,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            useCount: 0,
          };
          const { error: filterErr } = await sb.from('user_filters').insert({
            user_id: user.id,
            name: filterResult.filter_name,
            filter_data: filterData,
            sort_order: 0,
          });
          if (filterErr) toast('Filter save failed: ' + filterErr.message, 'error');
        } catch (err) {
          toast('Filter save error: ' + (err instanceof Error ? err.message : String(err)), 'error');
        }

        if (resumesTableId) {
          try {
            const { error: linkErr } = await sb.from('resume_filter_assignments').insert({
              user_id: user.id,
              resume_id: resumesTableId,
              filter_name: filterResult.filter_name,
            });
            if (linkErr) toast('Resume-filter link failed: ' + linkErr.message, 'error');
          } catch (err) {
            toast('Resume-filter link error: ' + (err instanceof Error ? err.message : String(err)), 'error');
          }
        }
      }

      // ── Done — navigate ──
      toast(
        filterResult?.filter_name
          ? 'Done! Resume saved + "' + filterResult.filter_name + '" filter created'
          : 'Resume saved — navigate to Feed to set up your search',
        'success'
      );
      navigate('/app/feed');
    } catch (err) {
      toast('Resume upload failed: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  };

  return (
    <div className="max-w-[760px] space-y-5">
      <PageHeader title="Get Started" subtitle="Your setup guide — five steps, three minutes. Then your search runs itself." helpLink="get-started" onHelp={() => {}} />

      {/* Hero — legacy: .gs-hero */}
      <div className="rounded-[14px] px-9 py-9 mb-6 hero-gradient"
           style={{ background: '#1b3e6f', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="text-[22px] font-extrabold leading-tight mb-2">
          This is not another job board.<br />
          <span className="text-warm">This is how you take control.</span>
        </div>
        <div className="text-[14px] leading-relaxed max-w-[560px]" style={{ color: 'rgba(255,255,255,0.88)' }}>
          Brilliant Jobs scans <strong>{stats.pages > 1000 ? (Math.floor(stats.pages / 1000) * 1000).toLocaleString() + '+' : '39,000+'}</strong> company
          career pages directly — bypassing the noise, the recycled posts, and the ghost listings.
          Build your search once, and we surface exactly what matches. Same-day. Every day.
        </div>
      </div>

      {/* Connections status bar — legacy: .setup-status-bar { radius 14px, padding 16px 24px, gap 20px } */}
      <div className="flex items-center gap-5 flex-wrap py-4 px-6 rounded-[14px] border border-border bg-bg-card mb-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="text-[13px] font-semibold text-text">Connections</div>
        <div className="flex gap-4 flex-wrap text-[12px] text-text-dim">
          <span className="flex items-center gap-1.5"><StatusDot status={extStatus} /> Extension</span>
          <span className="flex items-center gap-1.5"><StatusDot status={gmailStatus} /> Gmail</span>
          <span className="flex items-center gap-1.5"><StatusDot status={gcalStatus} /> Calendar</span>
          <span className="flex items-center gap-1.5"><StatusDot status={gdriveStatus} /> Drive</span>
        </div>
      </div>

      {/* Resume-first CTA — legacy .gs-resume-drop (line 368) */}
      <div className="border-2 border-dashed rounded-[14px] p-8 text-center mb-6 bg-bg-card cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.03)] hover:border-green/50 hover:bg-green/[0.02] hover:shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-all"
        style={{ borderColor: 'hsla(var(--green-hsl), 0.3)' }}
        onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,.doc,.docx'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleResumeUpload({ target: { files: [f] } } as any); }; i.click(); }}>
        <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mx-auto mb-3.5" style={{ background: 'var(--green-dim)' }}>
          <FileText className="w-6 h-6 text-green" strokeWidth={1.75} />
        </div>
        <div className="text-[17px] font-bold text-text mb-1">Want to skip the manual setup?</div>
        <div className="text-[13px] text-text-dim mb-4 max-w-[420px] mx-auto">Drop your resume and we'll extract titles, locations, and seniority to build your first search automatically.</div>
        <button className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-accent text-white text-[13px] font-semibold"
          onClick={e => { e.stopPropagation(); const i = document.createElement('input'); i.type = 'file'; i.accept = '.pdf,.doc,.docx'; i.onchange = (ev) => { const f = (ev.target as HTMLInputElement).files?.[0]; if (f) handleResumeUpload({ target: { files: [f] } } as any); }; i.click(); }}>
          <Upload className="w-4 h-4" strokeWidth={2} /> Upload Resume
        </button>
        <div className="text-[11px] text-text-faint mt-2.5">PDF or DOCX · Or keep scrolling to set up manually</div>
      </div>

      {/* Step 1: Chrome Extension — legacy lines 438-537 */}
      <Step num="Step 1" title="Install the Chrome Extension" icon={CirclePlus}
        iconBg="var(--indigo-dim)" iconColor="var(--indigo)"
        badge={extStatus === 'connected' ? <span className="text-[10px] font-semibold text-green bg-green/10 px-2 py-0.5 rounded-full">✓ Connected</span> : undefined}>
        <div className="mb-3">
          Your extension works quietly in the background, identifying opportunities at companies where you
          already have professional connections. It maps your network to active hiring — so when a company
          you're connected to posts a role, you'll know before most applicants do.
        </div>
        {extStatus !== 'connected' && (
          <>
            <button onClick={() => { window.open("/api/extension/download", "_blank"); }} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white mb-3">Download Extension</button>
            <div className="border border-border rounded-lg bg-bg-card p-4 space-y-3">
              <div className="text-[12px] font-bold text-text mb-0.5">Installation Guide</div>
              <div className="text-[11px] text-text-faint mb-2">Follow these 4 steps to get the extension running</div>
              {[
                { n: 1, title: 'Unzip the download', desc: 'Extract the .zip to a permanent folder. Don\'t delete it — Chrome needs the folder.' },
                { n: 2, title: 'Open Chrome Extensions', desc: 'Go to chrome://extensions and turn on Developer mode (top right toggle).' },
                { n: 3, title: 'Load the extension', desc: 'Click Load unpacked and select the unzipped folder from step 1.' },
                { n: 4, title: 'Pin and open', desc: 'Click the puzzle icon in Chrome\'s toolbar and pin the Brilliant Jobs extension.' },
              ].map((s, i, arr) => (
                <div key={s.n} className={`flex gap-4 items-start py-4 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="w-7 h-7 rounded-full bg-accent/10 text-accent flex items-center justify-center text-[12px] font-bold flex-shrink-0">{s.n}</div>
                  <div>
                    <div className="text-[12px] font-semibold text-text">{s.title}</div>
                    <div className="text-[11px] text-text-faint">{s.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Step>

      {/* Step 2: Connect Accounts */}
      <Step num="Step 2" title="Connect Your Accounts" icon={Link}
        iconBg="var(--green-dim)" iconColor="var(--green)"
        id="connect-accounts">
        <div className="mb-3">
          Authorize read-only access so Brilliant Jobs can help track your application pipeline —
          detecting responses, scheduling interviews, and flagging companies that go silent.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {[
            { name: 'Gmail', desc: 'Tracks your job applications automatically — detecting responses, interview requests, and rejections so your pipeline stays current.', color: '#EA4335', scope: 'gmail', sub: 'Your application pipeline, mostly on autopilot', status: gmailStatus },
            { name: 'Google Calendar', desc: 'Picks up interview schedules and follow-up timelines. Paired with Gmail, gives you a complete picture of every application.', color: '#4285F4', scope: 'calendar', sub: 'Never miss an interview or follow-up window', status: gcalStatus },
            { name: 'Google Drive', desc: 'Syncs your resumes to Drive so your latest version is always accessible when auto-applying or during interviews.', color: '#0066DA', scope: 'drive', sub: 'Resume sync and document storage', status: gdriveStatus },
          ].map(svc => (
            <div key={svc.name} className="bg-bg-card border border-border rounded-[14px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.02)] hover:border-border-hover hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
              <div className="flex items-center gap-3 px-[22px] py-5 border-b border-border">
                <div className="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ background: `${svc.color}12` }}>
                  <span className="text-[16px] font-bold" style={{ color: svc.color }}>{svc.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-bold text-text">{svc.name}</div>
                  <div className="text-[11px] text-text-faint">{svc.sub}</div>
                </div>
                <StatusDot status={svc.status} />
              </div>
              <div className="px-[22px] py-5">
                <div className="text-[13px] text-text-dim leading-relaxed mb-3">{svc.desc}</div>
                {svc.status === 'connected' ? (
                  <span className="text-[12px] font-semibold text-green">✓ Connected</span>
                ) : (
                <button onClick={async () => {
                  try {
                    const { supabase: sb } = await import('@app/lib/supabase');
                    const session = await sb.auth.getSession();
                    const token = session?.data?.session?.access_token;
                    if (!token) { (window as any).__bjToast?.('Please sign in first', 'error'); return; }
                    // Use Vercel rewrites (same path as legacy) — direct Supabase calls have CORS issues
                    const scope = svc.scope === 'gmail' ? 'gmail' : svc.scope === 'calendar' ? 'calendar' : 'drive';
                    const apiPath = scope === 'gmail' ? '/api/auth/gmail/callback'
                      : scope === 'calendar' ? '/api/auth/calendar/callback'
                      : '/api/auth/drive/callback';
                    const res = await fetch(
                      `${apiPath}?action=connect`,
                      { headers: { 'Authorization': `Bearer ${token}` } }
                    );
                    if (!res.ok) {
                      const errText = await res.text().catch(() => '');
                      (window as any).__bjToast?.(`Connection failed (${res.status}): ${errText.slice(0, 100)}`, 'error');
                      return;
                    }
                    const data = await res.json();
                    if (data?.url) window.location.href = data.url;
                    else (window as any).__bjToast?.('Connection failed: ' + JSON.stringify(data).slice(0, 100), 'error');
                  } catch (err) {
                    console.error('OAuth connect failed:', err);
                    (window as any).__bjToast?.('Connection failed — please try again', 'error');
                  }
                }} className="px-3.5 py-[7px] rounded-lg bg-accent text-white text-[12px] font-semibold">
                  Connect {svc.name.split(' ')[0]}
                </button>
                )}
                {svc.status !== 'connected' && <span className="text-[10px] text-text-faint ml-2">Read-only access</span>}
              </div>
            </div>
          ))}
        </div>
        {/* gs-tip — legacy line 652 */}
        <div className="flex items-start gap-2.5 mt-3.5 px-4 py-3.5 rounded-lg text-[13px] text-text-dim leading-relaxed"
          style={{ background: 'hsla(var(--warm-hsl), 0.04)', border: '1px solid hsla(var(--warm-hsl), 0.12)' }}>
          <span className="text-[10px] font-bold text-warm uppercase tracking-[0.5px] whitespace-nowrap pt-0.5">Why?</span>
          <span>Gmail and Calendar are the backbone of your application pipeline — they detect confirmations, rejections, interview invites, and ghosting patterns so your dashboard stays current without you updating it manually.</span>
        </div>
      </Step>
      <Step num="Optional" title="Import LinkedIn Profile" icon={User}
        iconBg="hsla(210,85%,56%,0.10)" iconColor="#0A66C2"
        badge={linkedinProfile ? <span className="text-[10px] font-semibold text-green bg-green/10 px-2 py-0.5 rounded-full">✓ Imported</span> : undefined}>
        <div className="mb-3">
          Upload your LinkedIn CSV export to auto-fill your profile, get personalized filter
          suggestions, and give AI form answering better context. One upload, no re-entry.
        </div>
        {linkedinProfile ? (
          <div className="border border-green/30 bg-green/5 rounded-[10px] p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green text-[14px]">✓</span>
              <span className="text-[13px] font-semibold text-text">LinkedIn Profile Imported</span>
              {linkedinProfile.importedAt && (
                <span className="text-[10px] text-text-faint ml-auto">
                  {new Date(linkedinProfile.importedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {linkedinProfile.firstName && (
                <div><span className="text-[10px] text-text-faint uppercase tracking-wide">Name</span><div className="text-[13px] text-text font-medium">{linkedinProfile.firstName} {linkedinProfile.lastName}</div></div>
              )}
              {linkedinProfile.location && (
                <div><span className="text-[10px] text-text-faint uppercase tracking-wide">Location</span><div className="text-[13px] text-text font-medium">{linkedinProfile.location}</div></div>
              )}
              {linkedinProfile.industry && (
                <div><span className="text-[10px] text-text-faint uppercase tracking-wide">Industry</span><div className="text-[13px] text-text font-medium">{linkedinProfile.industry}</div></div>
              )}
            </div>
            {linkedinProfile.headline && (
              <div><span className="text-[10px] text-text-faint uppercase tracking-wide">Headline</span><div className="text-[13px] text-text-dim leading-relaxed">{linkedinProfile.headline}</div></div>
            )}
            {linkedinProfile.summary && (
              <div><span className="text-[10px] text-text-faint uppercase tracking-wide">Summary</span><div className="text-[12px] text-text-faint leading-relaxed line-clamp-3">{linkedinProfile.summary}</div></div>
            )}
            <button onClick={() => {
              setLinkedinProfile(null);
            }} className="text-[11px] text-text-faint hover:text-accent transition-colors mt-1">
              Re-upload CSV
            </button>
          </div>
        ) : (
        <div className="border-2 border-dashed border-border rounded-[10px] p-6 text-center cursor-pointer hover:border-accent transition-colors"
          onClick={() => {
            const i = document.createElement('input');
            i.type = 'file';
            i.accept = '.csv';
            i.onchange = async (ev) => {
              const file = (ev.target as HTMLInputElement).files?.[0];
              if (!file) return;
              const toast = (msg: string, type: string) => (window as any).__bjToast?.(msg, type);
              toast('Reading LinkedIn profile…', 'info');
              try {
                const text = await file.text();
                const lines = text.split('\n');
                if (lines.length < 2) { toast('CSV appears empty', 'error'); return; }
                const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
                // Parse CSV row (handle quoted values with commas)
                const values: string[] = [];
                let current = '';
                let inQuotes = false;
                for (const char of lines[1]) {
                  if (char === '"') { inQuotes = !inQuotes; }
                  else if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                  else { current += char; }
                }
                values.push(current.trim());

                const row: Record<string, string> = {};
                headers.forEach((h, idx) => { if (values[idx]) row[h] = values[idx]; });

                const profile = {
                  firstName: row['First Name'] || '',
                  lastName: (row['Last Name'] || '').replace(/,.*$/, '').trim(),
                  headline: row['Headline'] || '',
                  summary: row['Summary'] || '',
                  industry: row['Industry'] || '',
                  location: row['Geo Location'] || '',
                  zipCode: row['Zip Code'] || '',
                  address: row['Address'] || '',
                };

                // Save to Supabase profiles.user_data.linkedin_profile
                const { supabase: sb, getUser } = await import('@app/lib/supabase');
                const user = await getUser();
                if (!user) { toast('Please sign in first', 'error'); return; }
                const { data: existing } = await sb.from('profiles').select('user_data').eq('id', user.id).single();
                const userData = (existing?.user_data as Record<string, unknown>) || {};
                const { error } = await sb.from('profiles').update({
                  user_data: { ...userData, linkedin_profile: { ...profile, importedAt: new Date().toISOString() } },
                }).eq('id', user.id);
                if (error) { toast('Failed to save: ' + error.message, 'error'); return; }

                setLinkedinProfile({ ...profile, importedAt: new Date().toISOString() });
                toast(`LinkedIn profile imported — ${profile.firstName} ${profile.lastName}`, 'success');
              } catch (err) {
                toast('Failed to parse CSV: ' + (err instanceof Error ? err.message : String(err)), 'error');
              }
            };
            i.click();
          }}>
          <div className="text-[13px] font-semibold text-text">Drop your LinkedIn CSV here</div>
          <div className="text-[11px] text-text-faint mt-1">or click to browse — Profile.csv from LinkedIn export</div>
          <div className="text-[10px] text-text-faint mt-2">Export from LinkedIn: Settings & Privacy → Data Privacy → Download your data → select Profile</div>
        </div>
        )}
        {/* gs-tip */}
        <div className="flex items-start gap-2.5 mt-3.5 px-4 py-3.5 rounded-lg text-[13px] text-text-dim leading-relaxed"
          style={{ background: 'hsla(var(--warm-hsl), 0.04)', border: '1px solid hsla(var(--warm-hsl), 0.12)' }}>
          <span className="text-[10px] font-bold text-warm uppercase tracking-[0.5px] whitespace-nowrap pt-0.5">Why?</span>
          <span>Your LinkedIn data lets us pre-fill application forms, generate a tailored resume summary, and suggest filters based on your actual experience — not guesswork.</span>
        </div>
      </Step>

      {/* Step 3: Build Filters */}
      <Step num="Step 3" title="Build Your Search Filters" icon={Filter}
        iconBg="var(--accent-dim)" iconColor="var(--accent)">
        <div className="mb-3">
          Build a search that no job board can match — combine keywords, locations, salary ranges,
          seniority levels, and company targets into a single filter. Create as many as you want.
          Each one runs in parallel, scanning thousands of career pages daily.
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'What', desc: 'Job titles and keywords', hint: '"director of marketing", "SEO"', color: 'var(--accent)' },
            { label: 'Not', desc: 'Terms to exclude', hint: '"intern", "part-time"', color: 'var(--text-faint)' },
            { label: 'Where', desc: 'Locations and arrangements', hint: '"Remote", "Seattle"', color: 'var(--warm)' },
            { label: 'Who', desc: 'Target or exclude companies', hint: '"Stripe", "Not: Amazon"', color: 'var(--pink)' },
          ].map(f => (
            <div key={f.label} className="rounded-[10px] px-5 py-[18px] border border-border" style={{ background: `color-mix(in srgb, ${f.color} 5%, transparent)` }}>
              <div className="text-[13px] font-bold flex items-center gap-1.5 mb-1" style={{ color: f.color }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: f.color }} />
                {f.label}
              </div>
              <div className="text-[11px] text-text-dim">{f.desc}</div>
              <div className="text-[10px] text-text-faint italic mt-0.5">{f.hint}</div>
            </div>
          ))}
        </div>
      </Step>

      {/* Step 4: Tune Results */}
      <Step num="Step 4" title="Fine-Tune Your Results" icon={SlidersHorizontal}
        iconBg="var(--purple-dim)" iconColor="var(--purple)">
        Getting noise? <strong>Search Tuning</strong> gives you global rules that apply across every filter —
        restrict to US-only, block specific titles or companies permanently, set seniority-level matching,
        and let our poor-match analysis suggest exclusions based on the jobs you hide.
      </Step>

      {/* Step 5: Work Your Feed */}
      <Step num="Step 5" title="Work Your Feed Daily" icon={LayoutGrid}
        iconBg="var(--warm-dim)" iconColor="var(--warm)">
        <div className="mb-3">
          Every job in your feed is scored against your resume so you can see your match strength before you invest time.
          <strong> Save</strong> jobs to your Pipeline, then <strong>apply in bulk</strong> from there.
          Or use <strong>Apply</strong> to go directly to the company's website.
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded bg-accent-dim text-accent">Pipeline</span>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded bg-accent text-white">Apply →</span>
          <span className="text-[10px] px-2 py-1 rounded bg-bg-input border border-border text-text-faint">✕ Hide</span>
        </div>
      </Step>

      {/* Data advantage — legacy: .gs-advantage { radius:14px; padding:28px; shadow; mt:24px } */}
      <div className="border border-border rounded-[14px] bg-bg-card p-7 mt-6 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div className="text-[15px] font-bold flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-green" strokeWidth={1.75} />
          Your data advantage
        </div>
        <div className="text-[14px] text-text-dim leading-relaxed">
          While job boards recycle stale postings, Brilliant Jobs pulls directly from the source. When a company
          posts a new role, it lands in your feed the same day — filtered, scored, and matched to your criteria.
        </div>
        <div className="text-[14px] text-text-dim leading-relaxed mt-3">
          Your <strong>Stats dashboard</strong> shows data about <em>your</em> job market — salary ranges, hiring
          velocity, top companies, and competition levels based only on roles that match your filters.
        </div>
        <div className="flex gap-8 flex-wrap mt-4 pt-4 border-t border-border">
          <div>
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.jobs > 0 ? (Math.round(stats.jobs / 1000) * 1000).toLocaleString() + '+' : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">open positions</div>
          </div>
          <div>
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.pages > 0 ? (Math.ceil(stats.pages / 1000) * 1000).toLocaleString() + '+' : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">career pages tracked</div>
          </div>
          <div>
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.companies > 0 ? '380+' : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">metros covered</div>
          </div>
        </div>
      </div>
    </div>
  );
}
