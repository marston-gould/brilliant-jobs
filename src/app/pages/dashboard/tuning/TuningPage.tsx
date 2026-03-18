// ============================================================
// TuningPage — Legacy Parity (dashboard.html lines 1183-1332)
// ============================================================
// Hero banner, 5 collapsible tuning cards:
// 1. Location Rules (US-only, exclude hourly, staffing, locations)
// 2. Company Exclusions
// 3. Industry Exclusions
// 4. Title Rules (level hierarchy + title exclusions)
// 5. Jobs You've Dismissed (pattern suggestions)
// ============================================================

import { useState } from 'react';
import { PageHeader } from '@app/components';
import { MapPin, Building2, Globe, Hash, Unlock, ChevronDown } from 'lucide-react';

interface TuningCardProps {
  title: string;
  subtitle: string;
  icon: typeof MapPin;
  iconColor: string;
  iconBg: string;
  borderColor: string;
  children: React.ReactNode;
}

function TuningCard({ title, subtitle, icon: Icon, iconColor, iconBg, borderColor, children }: TuningCardProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl bg-bg-card mb-3 overflow-hidden" style={{ borderLeftWidth: '3px', borderLeftColor: borderColor }}>
      <button className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-bg-hover/30 transition-colors text-left"
        onClick={() => setOpen(!open)}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-text-faint transition-transform ${open ? '' : '-rotate-90'}`} strokeWidth={2} />
        <span className="text-[14px] font-bold text-text">{title}</span>
      </button>
      <div className="text-[12px] text-text-dim px-5 -mt-1 mb-2">{subtitle}</div>
      {open && <div className="px-5 pb-5 space-y-3">{children}</div>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-md border border-border bg-bg-input text-[12px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function TuningPage() {
  return (
    <div className="max-w-[760px]">
      <PageHeader title="Search Tuning" subtitle="Global rules that sharpen every search at once" helpLink="tuning" onHelp={() => {}} />

      {/* Hero */}
      <div className="rounded-[14px] p-6 mb-5 overflow-hidden"
           style={{ background: '#1b3e6f', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>
          Less noise. <span className="text-warm">Better matches.</span>
        </div>
        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.7, maxWidth: '540px' }}>
          Rules you set here apply across every saved search — block entire companies, restrict locations,
          set seniority levels, and let poor-match analysis suggest what to exclude next. Your filters get
          smarter the more you use them.
        </div>
      </div>

      {/* Location Rules */}
      <TuningCard title="Location Rules" subtitle="Restrict where jobs can be located — applied globally to every search"
        icon={MapPin} iconColor="var(--warm)" iconBg="var(--warm-dim)" borderColor="var(--warm)">
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
          <input type="checkbox" className="rounded" /> only show jobs in the united states
        </label>
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
          <input type="checkbox" className="rounded" /> exclude hourly-rate jobs
        </label>
        <label className="flex items-center gap-2 text-[12px] text-text cursor-pointer">
          <input type="checkbox" className="rounded" /> exclude staffing agency jobs
        </label>
        <div>
          <label className="text-[10px] font-semibold text-text-faint uppercase tracking-wide block mb-1">global location exclusions</label>
          <input type="text" placeholder="add locations to always exclude… e.g. india, philippines" className={inputCls} />
        </div>
      </TuningCard>

      {/* Company Exclusions */}
      <TuningCard title="Company Exclusions" subtitle="Jobs from these companies will be hidden from all filters"
        icon={Building2} iconColor="var(--pink)" iconBg="var(--pink-dim)" borderColor="var(--pink)">
        <input type="text" placeholder="add companies to always exclude… e.g. staffing corp, recruiting agency" className={inputCls} />
      </TuningCard>

      {/* Industry Exclusions */}
      <TuningCard title="Industry Exclusions" subtitle="Jobs from companies in these industries will be hidden from all filters"
        icon={Globe} iconColor="var(--indigo)" iconBg="var(--indigo-dim)" borderColor="var(--indigo)">
        <input type="text" placeholder="type to search industries… e.g. staffing, insurance, military" className={inputCls} />
      </TuningCard>

      {/* Title Rules */}
      <TuningCard title="Title Rules" subtitle="Set default seniority levels and global title exclusions — each saved search can override"
        icon={Hash} iconColor="var(--purple)" iconBg="var(--purple-dim)" borderColor="var(--purple)">
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-semibold text-text-faint uppercase tracking-wide">default level hierarchy</label>
            <span className="text-[10px] text-text-faint italic">each saved search can override</span>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-bg-input text-left">
                  <th className="px-2 py-1.5 text-text-faint font-medium w-9">#</th>
                  <th className="px-2 py-1.5 text-text-faint font-medium w-[140px]">Level</th>
                  <th className="px-2 py-1.5 text-text-faint font-medium">Match Keywords</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { rank: 1, label: 'C-Suite', keywords: 'ceo, cfo, cto, coo, cmo, chief' },
                  { rank: 2, label: 'VP', keywords: 'vice president, vp' },
                  { rank: 3, label: 'Director', keywords: 'director' },
                  { rank: 4, label: 'Manager', keywords: 'manager, sr. manager' },
                  { rank: 5, label: 'Lead', keywords: 'lead, principal' },
                  { rank: 6, label: 'Senior', keywords: 'senior, sr.' },
                  { rank: 7, label: 'Mid', keywords: 'mid-level, ii, iii' },
                  { rank: 8, label: 'Junior', keywords: 'junior, entry, associate' },
                  { rank: 9, label: 'Intern', keywords: 'intern, internship, co-op' },
                ].map(lv => (
                  <tr key={lv.rank} className="border-t border-border">
                    <td className="px-2 py-1.5 text-text-faint">{lv.rank}</td>
                    <td className="px-2 py-1.5 font-medium text-text">{lv.label}</td>
                    <td className="px-2 py-1.5 text-text-dim">{lv.keywords}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="mt-2 px-3 py-1 rounded-md text-[11px] font-medium text-accent border border-accent bg-transparent hover:bg-accent/5">+ add level</button>
        </div>
        <div className="pt-4 border-t border-border">
          <label className="text-[10px] font-semibold text-text-faint uppercase tracking-wide block mb-1">global title exclusions</label>
          <div className="text-[11px] text-text-faint mb-2">titles containing these terms will be hidden from all filters</div>
          <input type="text" placeholder="add title keywords to always exclude… e.g. intern, volunteer, part-time" className={inputCls} />
        </div>
      </TuningCard>

      {/* Jobs You've Dismissed */}
      <TuningCard title="Jobs You've Dismissed" subtitle="Every job you hide teaches your feed what you don't want. We spot patterns and suggest rules."
        icon={Unlock} iconColor="var(--green)" iconBg="var(--green-dim)" borderColor="var(--green)">
        <div className="text-center py-6 text-text-faint text-[12px]">
          <p>No dismissed jobs yet.</p>
          <p className="mt-1">When you hide jobs from your feed, patterns will be analyzed here.</p>
        </div>
      </TuningCard>
    </div>
  );
}
