// ============================================================
// StatsPage — Legacy Parity (dashboard.html lines 3058-3245)
// ============================================================
// 3 tabs: Market Stats, Resume Metrics, Overlay Analytics
// Market: stat cards + chart placeholders (ECharts lazy-loaded)
// Resume: resume selector + score summary + charts
// Overlay: stat cards + drilldown charts
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { PageHeader } from '@app/components';
import { useStatsProvider } from '@providers';

// Lazy-loaded ECharts chart box
function ChartBox({ option, height = 220 }: { option: any; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    let chart: any;
    import('echarts').then(echarts => {
      if (!ref.current) return;
      chart = echarts.init(ref.current, undefined, { renderer: 'svg' });
      chart.setOption(option);
      const ro = new ResizeObserver(() => chart?.resize());
      ro.observe(ref.current);
      return () => { ro.disconnect(); chart?.dispose(); };
    });
    return () => { chart?.dispose(); };
  }, [option]);
  return <div ref={ref} style={{ width: '100%', height }} />;
}

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
      <div className="flex gap-1 p-[3px] rounded-lg bg-[var(--bg-hover)] w-fit mb-5">
        {([
          { key: 'market' as StatsTab, label: 'Market Stats' },
          { key: 'resume' as StatsTab, label: 'Resume Metrics' },
          { key: 'overlay' as StatsTab, label: 'Overlay Analytics' },
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

      {/* Market Stats tab */}
      {tab === 'market' && (
        <div>
          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
            {statCards.map(c => (
              <div key={c.label} className="border border-border rounded-xl bg-bg-card p-[18px_20px] text-center">
                <div className="text-[22px] font-bold text-text tabular-nums font-mono leading-none">
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
                <div className="text-[10px] text-text-faint uppercase tracking-wide mt-1">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Charts powered by ECharts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Work Arrangement — pie chart from counts */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Work Arrangement</div>
              <ChartBox option={{
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: ['40%', '70%'], data: [
                  { value: counts.remote || 0, name: 'Remote' },
                  { value: (counts.total || 0) - (counts.remote || 0), name: 'On-site / Hybrid' },
                ], label: { fontSize: 11 } }]
              }} />
            </div>

            {/* Salary Coverage — pie */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Salary Transparency</div>
              <ChartBox option={{
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: ['40%', '70%'], data: [
                  { value: counts.withSalary || 0, name: 'With Salary' },
                  { value: (counts.total || 0) - (counts.withSalary || 0), name: 'No Salary' },
                ], label: { fontSize: 11 } }]
              }} />
            </div>

            {/* ATS Source Breakdown — bar from sources */}
            <div className="border border-border rounded-xl bg-bg-card p-4 lg:col-span-2">
              <div className="text-[13px] font-bold text-text mb-2">ATS Source Breakdown</div>
              <ChartBox option={{
                tooltip: {},
                xAxis: { type: 'category', data: sources.length ? sources.map((s: any) => s.source_name || s.source || 'Unknown') : ['Greenhouse', 'Lever', 'Workday', 'Ashby', 'SmartRecruiters', 'Other'], axisLabel: { fontSize: 10 } },
                yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
                series: [{ type: 'bar', data: sources.length ? sources.map((s: any) => s.job_count || s.count || 0) : [0, 0, 0, 0, 0, 0], itemStyle: { borderRadius: [4, 4, 0, 0] } }],
                grid: { left: 50, right: 20, top: 20, bottom: 40 },
              }} />
            </div>

            {/* Stat summary — gauge for remote % */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Remote Job Rate</div>
              <ChartBox option={{
                series: [{ type: 'gauge', progress: { show: true, width: 12 }, data: [{ value: counts.total ? Math.round(((counts.remote || 0) / counts.total) * 100) : 0, name: 'Remote %' }],
                  detail: { fontSize: 20, offsetCenter: [0, '70%'] }, title: { offsetCenter: [0, '90%'], fontSize: 11 },
                  axisLine: { lineStyle: { width: 12 } }, pointer: { show: false } }]
              }} />
            </div>

            {/* Salary Rate gauge */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Salary Disclosure Rate</div>
              <ChartBox option={{
                series: [{ type: 'gauge', progress: { show: true, width: 12 }, data: [{ value: counts.total ? Math.round(((counts.withSalary || 0) / counts.total) * 100) : 0, name: 'With Salary %' }],
                  detail: { fontSize: 20, offsetCenter: [0, '70%'] }, title: { offsetCenter: [0, '90%'], fontSize: 11 },
                  axisLine: { lineStyle: { width: 12 } }, pointer: { show: false } }]
              }} />
            </div>

            {/* Placeholder for remaining charts that need time-series data */}
            {['Job Count Over Time', 'Posting Age', 'Salary Distribution', 'Salary Ladder'].map(title => (
              <div key={title} className={`border border-border rounded-xl bg-bg-card p-4 ${title.includes('Over Time') || title.includes('Ladder') ? 'lg:col-span-2' : ''}`}>
                <div className="text-[13px] font-bold text-text mb-2">{title}</div>
                <div className="h-[280px] bg-bg-input/30 rounded-lg flex items-center justify-center text-text-faint text-[11px]">
                  Requires time-series data from daily snapshots
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
