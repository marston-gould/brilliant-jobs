// ============================================================
// TuningPage — Legacy Parity (dashboard.html lines 1183-1332)
// ============================================================
// Hero banner + 5 collapsible tuning cards with colored left borders:
// 1. Location Rules (warm/orange)
// 2. Company Exclusions (pink)
// 3. Industry Exclusions (indigo)
// 4. Title Rules (purple) — level hierarchy table + exclusions
// 5. Jobs You've Dismissed (green)
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@app/components';
import { MapPin, Building2, Globe, Hash, KeyRound, ChevronDown } from 'lucide-react';
import { useProviders } from '@providers';
import type { LucideIcon } from 'lucide-react';

interface TuningCardProps {
  icon: LucideIcon; iconColor: string; iconBg: string; borderColor: string;
  title: string; subtitle: string; badge?: string; children: React.ReactNode;
}

function TuningCard({ icon: Icon, iconColor, iconBg, borderColor, title, subtitle, badge, children }: TuningCardProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border rounded-xl bg-bg-card overflow-hidden mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.02)]" style={{ borderLeft: `3px solid ${borderColor}` }}>
      <button className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-bg-input/30 transition-colors select-none" onClick={() => setOpen(!open)}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: iconBg }}>
          <Icon className="w-[18px] h-[18px]" style={{ color: iconColor }} strokeWidth={1.75} />
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-text-faint transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} strokeWidth={2} />
        <span className="text-[14px] font-bold text-text flex-1">{title}</span>
        {badge && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-input text-text-faint">{badge}</span>}
      </button>
      <div className="text-[12px] text-text-dim leading-relaxed" style={{ padding: '0 20px 4px 62px', marginTop: '-4px' }}>{subtitle}</div>
      {open && <div className="px-5 pb-5 pt-3.5 space-y-3">{children}</div>}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-md border border-border bg-bg-input text-[12px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40";

export default function TuningPage() {
  const { tuning: tuningProvider } = useProviders();
  const [usOnly, setUsOnly] = useState(false);
  const [excludeHourly, setExcludeHourly] = useState(false);
  const [excludeStaffing, setExcludeStaffing] = useState(false);
  const [locationExcl, setLocationExcl] = useState('');
  const [companyExcl, setCompanyExcl] = useState('');
  const [industryExcl, setIndustryExcl] = useState('');
  const [titleExcl, setTitleExcl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    tuningProvider.getTuning().then((data: any) => {
      if (!data) return;
      setUsOnly(!!data.usOnly);
      setExcludeHourly(!!data.excludeHourly);
      setExcludeStaffing(!!data.excludeStaffing);
      setLocationExcl(data.locationExclusions || '');
      setCompanyExcl(data.companyExclusions || '');
      setIndustryExcl(data.industryExclusions || '');
      setTitleExcl(data.titleExclusions || '');
    }).catch(() => {});
  }, [tuningProvider]);

  const save = useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      const current = await tuningProvider.getTuning() || {};
      await tuningProvider.saveTuning({ ...current, ...patch } as any);
      (window as any).__bjToast?.('Tuning saved', 'success');
    } catch (e) {
      console.error('[BJ:Tuning] save error:', e);
      (window as any).__bjToast?.('Failed to save tuning', 'error');
    }
    setSaving(false);
  }, [tuningProvider]);

  const toggleAndSave = (setter: (v: boolean) => void, key: string, current: boolean) => {
    setter(!current);
    save({ [key]: !current });
  };
  return (
    <div className="max-w-[760px] space-y-4">
      <PageHeader title="Search Tuning" subtitle="Global rules that sharpen every search at once" helpLink="tuning" onHelp={() => {}} />

      {/* Hero — legacy .tuning-hero */}
      <div className="rounded-[14px] px-9 py-8 mb-5 hero-gradient" style={{ background: '#1b3e6f', color: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div className="text-[18px] font-extrabold mb-1.5">Less noise. <span className="text-warm">Better matches.</span></div>
        <div className="text-[13px] leading-relaxed max-w-[540px]" style={{ color: 'rgba(255,255,255,0.88)' }}>
          Rules you set here apply across every saved search — block entire companies, restrict locations, set seniority levels, and let poor-match analysis suggest what to exclude next.
        </div>
      </div>

      {/* 1. Location Rules */}
      <TuningCard icon={MapPin} iconColor="var(--warm)" iconBg="var(--warm-dim)" borderColor="var(--warm)"
        title="Location Rules" subtitle="Restrict where jobs can be located — applied globally to every search">
        <label className="flex items-center gap-2 text-[12px] text-text-dim cursor-pointer"><input type="checkbox" className="accent-accent" checked={usOnly} onChange={() => toggleAndSave(setUsOnly, 'usOnly', usOnly)} /> only show jobs in the United States</label>
        <label className="flex items-center gap-2 text-[12px] text-text-dim cursor-pointer"><input type="checkbox" className="accent-accent" checked={excludeHourly} onChange={() => toggleAndSave(setExcludeHourly, 'excludeHourly', excludeHourly)} /> exclude hourly-rate jobs</label>
        <label className="flex items-center gap-2 text-[12px] text-text-dim cursor-pointer"><input type="checkbox" className="accent-accent" checked={excludeStaffing} onChange={() => toggleAndSave(setExcludeStaffing, 'excludeStaffing', excludeStaffing)} /> exclude staffing agency jobs</label>
        <div>
          <div className="text-[10px] font-semibold text-text-dim uppercase tracking-wide mb-1">Global location exclusions</div>
          <input type="text" placeholder="add locations to always exclude… e.g. india, philippines" className={inputCls} value={locationExcl} onChange={e => setLocationExcl(e.target.value)} onBlur={() => save({ locationExclusions: locationExcl })} />
        </div>
      </TuningCard>

      {/* 2. Company Exclusions */}
      <TuningCard icon={Building2} iconColor="var(--pink)" iconBg="var(--pink-dim)" borderColor="var(--pink)"
        title="Company Exclusions" subtitle="Jobs from these companies will be hidden from all filters">
        <input type="text" placeholder="add companies to always exclude… e.g. staffing corp, recruiting agency" className={inputCls} value={companyExcl} onChange={e => setCompanyExcl(e.target.value)} onBlur={() => save({ companyExclusions: companyExcl })} />
      </TuningCard>

      {/* 3. Industry Exclusions */}
      <TuningCard icon={Globe} iconColor="var(--indigo)" iconBg="var(--indigo-dim)" borderColor="var(--indigo)"
        title="Industry Exclusions" subtitle="Jobs from companies in these industries will be hidden from all filters">
        <input type="text" placeholder="type to search industries… e.g. staffing, insurance, military" className={inputCls} value={industryExcl} onChange={e => setIndustryExcl(e.target.value)} onBlur={() => save({ industryExclusions: industryExcl })} />
      </TuningCard>

      {/* 4. Title Rules */}
      <TuningCard icon={Hash} iconColor="var(--purple)" iconBg="var(--purple-dim)" borderColor="var(--purple)"
        title="Title Rules" subtitle="Set default seniority levels and global title exclusions">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-text-dim uppercase tracking-wide">Default level hierarchy</div>
            <span className="text-[10px] text-text-faint italic">each saved search can override this</span>
          </div>
          <table className="w-full text-[12px] border border-border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-bg-input text-left">
                <th className="px-2 py-1.5 text-[10px] font-semibold text-text-faint uppercase tracking-[0.5px] w-9">#</th>
                <th className="px-2 py-1.5 text-[10px] font-semibold text-text-faint uppercase tracking-[0.5px] w-[140px]">Level</th>
                <th className="px-2 py-1.5 text-[10px] font-semibold text-text-faint uppercase tracking-[0.5px]">Match Keywords</th>
                <th className="px-2 py-1.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {[
                { n: 1, level: 'C-Suite', keywords: 'ceo, cto, cfo, coo, cmo, chief' },
                { n: 2, level: 'VP', keywords: 'vp, vice president' },
                { n: 3, level: 'Director', keywords: 'director, head of' },
                { n: 4, level: 'Manager', keywords: 'manager, lead' },
                { n: 5, level: 'Senior', keywords: 'senior, sr, staff, principal' },
                { n: 6, level: 'Mid', keywords: '' },
                { n: 7, level: 'Junior', keywords: 'junior, jr, entry, associate' },
              ].map(row => (
                <tr key={row.n} className="border-t border-border">
                  <td className="px-2 py-1.5 text-text-faint">{row.n}</td>
                  <td className="px-2 py-1.5 font-medium text-text">{row.level}</td>
                  <td className="px-2 py-1.5 text-text-dim font-mono text-[11px]">{row.keywords}</td>
                  <td className="px-2 py-1.5 text-center"><button onClick={() => alert('Level "' + row.level + '" removed from ranking')} className="text-text-faint hover:text-red text-xs">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => { const name = prompt('Level name:'); if (name) alert('Level "' + name + '" added'); }} className="mt-2 px-3 py-1 rounded-md text-xs font-medium text-accent border border-accent hover:bg-accent/5">+ add level</button>
        </div>
        <div className="pt-4 border-t border-border">
          <div className="text-[10px] font-semibold text-text-dim uppercase tracking-wide mb-1">Global title exclusions</div>
          <div className="text-[11px] text-text-faint mb-2">titles containing these terms will be hidden from all filters</div>
          <input type="text" placeholder="add title keywords to always exclude… e.g. intern, volunteer, part-time" className={inputCls} value={titleExcl} onChange={e => setTitleExcl(e.target.value)} onBlur={() => save({ titleExclusions: titleExcl })} />
        </div>
      </TuningCard>

      {/* 5. Jobs You've Dismissed */}
      <TuningCard icon={KeyRound} iconColor="var(--green)" iconBg="var(--green-dim)" borderColor="var(--green)"
        title="Jobs You've Dismissed" subtitle="Every job you hide teaches your feed what you don't want. We spot patterns and suggest rules.">
        <div className="text-center py-6 text-text-faint text-[12px]">
          Dismissed jobs and pattern suggestions will appear here as you use the feed.
        </div>
      </TuningCard>
    </div>
  );
}
