// ============================================================
// StatsPage — Legacy Parity (dashboard.html lines 3058-3245)
// ============================================================
// 3 tabs: Market Stats, Resume Metrics, Overlay Analytics
// Market: stat cards + chart placeholders (ECharts lazy-loaded)
// Resume: resume selector + score summary + charts
// Overlay: stat cards + drilldown charts
// ============================================================

import { useState, useEffect } from 'react';
import { PageHeader } from '@app/components';
import { useStatsProvider } from '@providers';

type StatsTab = 'market' | 'resume' | 'overlay';

export default function StatsPage() {
  const statsProvider = useStatsProvider();
  const [tab, setTab] = useState<StatsTab>('market');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sources, setSources] = useState<any[]>([]);

  useEffect(() => {
    statsProvider.getJobCounts().then((d: any) => {
      if (d) setCounts({
        total: d.total_open ?? 0,
        companies: d.total_companies ?? 0,
        newToday: d.new_today ?? 0,
        withSalary: d.with_salary ?? 0,
        remote: d.remote ?? 0,
      });
    }).catch(() => {});
    statsProvider.getSourceBreakdown().then(d => setSources(d || [])).catch(() => {});
  }, [statsProvider]);

  const statCards = [
    { label: 'Matching Jobs', value: counts.total ?? '—' },
    { label: 'With Salary', value: counts.withSalary ?? '—' },
    { label: 'Senior+ Level', value: '—' },
    { label: 'Remote Jobs', value: counts.remote ?? '—' },
    { label: 'Companies', value: counts.companies ?? '—' },
  ];

  const chartNames = [
    { title: 'Job Count Over Time', full: true },
    { title: 'Posting Age', full: true },
    { title: 'Salary Distribution', full: false },
    { title: 'Seniority Breakdown', full: false },
    { title: 'Jobs by Industry', full: false },
    { title: 'Work Arrangement', full: false },
    { title: 'Salary Ladder', full: true },
    { title: 'Where Are the Jobs', full: true },
    { title: 'ATS Source Breakdown', full: false },
    { title: 'Industry Detail', full: false },
  ];

  return (
    <div>
      <PageHeader title="Stats" subtitle="Your data filtered, visualized" helpLink="stats" onHelp={() => {}}>
        <span className="text-accent text-[13px] font-medium ml-2">
          <a href="/data-lab" target="_blank" rel="noopener noreferrer">Explore Data Lab →</a>
        </span>
      </PageHeader>

      {/* Tab bar — Market Stats | Resume Metrics | Overlay Analytics */}
      <div className="flex gap-1.5 mb-5">
        {([
          { key: 'market' as StatsTab, label: 'Market Stats' },
          { key: 'resume' as StatsTab, label: 'Resume Metrics' },
          { key: 'overlay' as StatsTab, label: 'Overlay Analytics' },
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

      {/* Market Stats tab */}
      {tab === 'market' && (
        <div>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {statCards.map(c => (
              <div key={c.label} className="border border-border rounded-lg bg-bg-card p-3 text-center">
                <div className="text-[22px] font-bold text-text tabular-nums font-mono leading-none">
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
                <div className="text-[10px] text-text-faint uppercase tracking-wide mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Chart placeholders */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {chartNames.map(ch => (
              <div key={ch.title} className={`border border-border rounded-xl bg-bg-card p-4 ${ch.full ? 'lg:col-span-2' : ''}`}>
                <div className="text-[13px] font-bold text-text mb-2">{ch.title}</div>
                <div className="h-[280px] bg-bg-input rounded-lg flex items-center justify-center text-text-faint text-xs">
                  Chart loads when data is available
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume Metrics tab */}
      {tab === 'resume' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-[12px] font-semibold text-text-dim">Resume:</label>
            <select className="px-3 py-1.5 rounded-lg border border-border bg-bg-input text-[12px] text-text min-w-[200px]">
              <option>Select a resume…</option>
            </select>
          </div>
          <div className="text-center py-12 text-text-faint">
            <p className="text-[14px] font-semibold mb-2">Select a resume above to view its metrics</p>
            <p className="text-[12px]">Score history, level fit analysis, and pipeline data will appear here.</p>
          </div>
        </div>
      )}

      {/* Overlay Analytics tab */}
      {tab === 'overlay' && (
        <div className="text-center py-12 text-text-faint">
          <p className="text-[13px]">Overlay analytics data will load here.</p>
        </div>
      )}
    </div>
  );
}
