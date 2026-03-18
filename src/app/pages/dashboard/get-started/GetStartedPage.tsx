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
  LayoutGrid, TrendingUp, Check, ExternalLink, ChevronDown,
} from 'lucide-react';
import { useStatsProvider, useResumesProvider } from '@providers';

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
function Step({ num, title, icon: Icon, iconBg, iconColor, children, badge }: {
  num: string; title: string; icon: typeof Filter;
  iconBg: string; iconColor: string; children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-[14px] bg-bg-card p-7 space-y-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] mb-3.5 hover:border-border-hover hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
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
  const [extStatus, setExtStatus] = useState<DotStatus>('disconnected');
  const [gmailStatus] = useState<DotStatus>('disconnected');
  const [gcalStatus] = useState<DotStatus>('disconnected');
  const [gdriveStatus] = useState<DotStatus>('disconnected');

  // Check extension
  useEffect(() => {
    const check = () => {
      const w = window as Record<string, unknown>;
      if (w._bjExtReady || w.BJ_EXT_VERSION) {
        setExtStatus('connected');
      }
    };
    check();
    window.addEventListener('bj:ext-ready', check);
    return () => window.removeEventListener('bj:ext-ready', check);
  }, []);

  // Load stats
  useEffect(() => {
    statsProvider.getJobCounts().then(data => {
      if (data) setStats({
        jobs: data.total_open ?? 0,
        pages: data.total_companies ?? 39000,
        companies: data.total_companies ?? 0,
      });
    }).catch(() => {});
  }, [statsProvider]);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await resumeProvider.upload(file);
      navigate('/app/resumes');
    } catch (err) {
      console.error('Resume upload failed:', err);
    }
  };

  return (
    <div className="max-w-[760px] space-y-5">
      {/* Page header — matches legacy .page-header */}
      <div className="border-b border-border pb-3 mb-2">
        <h2 className="text-[var(--fs-page-title)] font-bold text-text">Get Started</h2>
        <p className="text-[13px] text-text-faint mt-0.5">
          Your setup guide — five steps, three minutes. Then your search runs itself.
        </p>
      </div>

      {/* Resume-first onboarding CTA — legacy: #onboard-resume-first */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent transition-colors"
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
      >
        <FileText className="w-10 h-10 mx-auto mb-3 text-green" strokeWidth={1.5} />
        <div className="text-[17px] font-bold text-text mb-1">Want to skip the manual setup?</div>
        <div className="text-[13px] text-text-dim mb-4 max-w-[420px] mx-auto">
          Drop your resume and we'll extract titles, locations, and seniority to build your first search automatically.
        </div>
        <button
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          <Upload className="w-4 h-4" strokeWidth={2} />
          Upload Resume
        </button>
        <div className="text-[11px] text-text-faint mt-2.5">PDF or DOCX · Or keep scrolling to set up manually</div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          onChange={handleResumeUpload}
        />
      </div>

      {/* Hero — legacy: .gs-hero */}
      <div className="rounded-[14px] px-9 py-9 overflow-hidden mb-6"
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
        iconBg="var(--green-dim)" iconColor="var(--green)">
        <div className="mb-3">
          Authorize read-only access so Brilliant Jobs can help track your application pipeline —
          detecting responses, scheduling interviews, and flagging companies that go silent.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { name: 'Gmail', desc: 'Track application responses', color: '#EA4335', scope: 'gmail' },
            { name: 'Google Calendar', desc: 'Interview scheduling', color: '#4285F4', scope: 'calendar' },
            { name: 'Google Drive', desc: 'Resume sync', color: '#0066DA', scope: 'drive' },
          ].map(svc => (
            <div key={svc.name} className="bg-bg-main border border-border rounded-[10px] px-3.5 py-[18px] text-center hover:border-border-hover hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all">
              <div className="text-[13px] font-semibold text-text mb-0.5">{svc.name}</div>
              <div className="text-[10px] text-text-faint mb-2">{svc.desc}</div>
              <button onClick={() => {
                window.location.href = `https://brilliantjobs.app/api/auth/gmail/callback?scope=${svc.scope}`;
              }} className="text-[11px] font-semibold px-3 py-1 rounded-md bg-accent text-white">
                Connect
              </button>
            </div>
          ))}
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
            <div key={f.label} className="rounded-lg p-3 border border-border" style={{ background: `color-mix(in srgb, ${f.color} 5%, transparent)` }}>
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
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.jobs > 0 ? stats.jobs.toLocaleString() : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">open positions</div>
          </div>
          <div>
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.pages > 0 ? (Math.floor(stats.pages / 1000) * 1000).toLocaleString() + '+' : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">career pages tracked</div>
          </div>
          <div>
            <div className="text-[20px] font-bold text-text tabular-nums">{stats.companies > 0 ? stats.companies.toLocaleString() : '—'}</div>
            <div className="text-[11px] text-text-faint uppercase tracking-wide">companies hiring now</div>
          </div>
        </div>
      </div>
    </div>
  );
}
