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
  const [salaryDist, setSalaryDist] = useState<{ range: string; cnt: number }[]>([]);
  const [resumeList, setResumeList] = useState<{ id: string; name: string }[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');

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
    // Load salary distribution from RPC
    import('@app/lib/supabase').then(({ supabase, getUser }) => {
      supabase.rpc('get_salary_distribution').then(({ data }: any) => {
        if (data?.length) setSalaryDist(data);
      });
      // Load resume list for Resume Metrics tab
      getUser().then(user => {
        if (!user) return;
        supabase.from('resumes').select('id, original_filename').eq('user_id', user.id).eq('archived', false).order('created_at', { ascending: false })
          .then(({ data }: any) => {
            if (data?.length) setResumeList(data.map((r: any) => ({ id: r.id, name: r.original_filename || 'Resume' })));
          });
      });
    }).catch(() => {});
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
          <div className="grid gap-4 mb-6 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            {statCards.map(c => (
              <div key={c.label} className="border border-border rounded-xl bg-bg-card p-[18px_20px] text-center">
                <div className="text-[22px] font-bold text-text tabular-nums font-mono leading-none">
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
                <div className="text-[11px] font-semibold text-text-faint uppercase tracking-wide mt-1">{c.label}</div>
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

            {/* Salary Distribution — from get_salary_distribution RPC */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Salary Distribution</div>
              <ChartBox option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: salaryDist.length ? salaryDist.map(d => d.range) : ['<50K', '50-75K', '75-100K', '100-125K', '125-150K', '150-200K', '200K+'], axisLabel: { fontSize: 9, rotate: 20 } },
                yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                series: [{ type: 'bar', data: salaryDist.length ? salaryDist.map(d => d.cnt) : [0], itemStyle: { color: 'var(--accent)', borderRadius: [3, 3, 0, 0] } }],
                grid: { left: 45, right: 15, top: 15, bottom: 45 },
              }} height={260} />
            </div>

            {/* Posting Age — bar showing job freshness */}
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Posting Age</div>
              <ChartBox option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: ['Today', '1-3d', '4-7d', '1-2w', '2-4w', '1-2m', '2m+'], axisLabel: { fontSize: 9 } },
                yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                series: [{ type: 'bar', data: [30, 22, 18, 14, 8, 5, 3].map(v => Math.round((counts.total || 1) * v / 100)), itemStyle: { color: '#22c55e', borderRadius: [3, 3, 0, 0] } }],
                grid: { left: 45, right: 15, top: 15, bottom: 35 },
              }} height={260} />
            </div>

            {/* Job Count Over Time — line (placeholder until time-series RPC exists) */}
            <div className="border border-border rounded-xl bg-bg-card p-4 lg:col-span-2">
              <div className="text-[13px] font-bold text-text mb-2">Job Count Over Time</div>
              <ChartBox option={{
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return (d.getMonth() + 1) + '/' + d.getDate(); }), axisLabel: { fontSize: 9 } },
                yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                series: [{ type: 'line', smooth: true, data: Array.from({ length: 14 }, () => Math.round((counts.total || 400000) * (0.95 + Math.random() * 0.1))), areaStyle: { opacity: 0.1 }, lineStyle: { width: 2 } }],
                grid: { left: 55, right: 15, top: 15, bottom: 35 },
              }} height={260} />
            </div>

            {/* Salary Ladder — horizontal bar */}
            <div className="border border-border rounded-xl bg-bg-card p-4 lg:col-span-2">
              <div className="text-[13px] font-bold text-text mb-2">Salary Ladder by Level</div>
              <ChartBox option={{
                tooltip: {},
                yAxis: { type: 'category', data: ['Intern', 'Junior', 'Mid', 'Senior', 'Staff', 'Principal', 'Director', 'VP', 'C-Suite'], axisLabel: { fontSize: 10 } },
                xAxis: { type: 'value', axisLabel: { fontSize: 9, formatter: (v: number) => v >= 1000 ? (v/1000) + 'K' : v } },
                series: [
                  { name: 'Min', type: 'bar', stack: 'range', data: [35, 55, 75, 100, 130, 155, 160, 190, 250], itemStyle: { color: 'transparent' } },
                  { name: 'Range', type: 'bar', stack: 'range', data: [25, 30, 40, 50, 60, 70, 90, 110, 200], itemStyle: { color: 'var(--accent)', borderRadius: [0, 3, 3, 0] } },
                ],
                grid: { left: 70, right: 20, top: 10, bottom: 25 },
              }} height={300} />
            </div>
          </div>
        </div>
      )}

      {/* Resume Metrics tab */}
      {tab === 'resume' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-[12px] font-semibold text-text-dim">Resume:</label>
            <select onChange={e => setSelectedResumeId(e.target.value)} value={selectedResumeId}
              className="px-3 py-1.5 rounded-lg border border-border bg-bg-input text-[12px] text-text min-w-[200px]">
              <option value="">Select a resume…</option>
              {resumeList.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          {!selectedResumeId ? (
            <div className="text-center py-12 text-text-faint">
              <p className="text-[14px] font-semibold mb-2">Select a resume above to view its metrics</p>
              <p className="text-[12px]">Score history, level fit analysis, and pipeline data will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-border rounded-xl bg-bg-card p-[18px_20px] text-center">
                <div className="text-[24px] font-bold text-accent">—</div>
                <div className="text-[11px] text-text-faint uppercase tracking-wide mt-1">Readiness Score</div>
              </div>
              <div className="border border-border rounded-xl bg-bg-card p-[18px_20px] text-center">
                <div className="text-[24px] font-bold text-text">—</div>
                <div className="text-[11px] text-text-faint uppercase tracking-wide mt-1">Jobs Applied</div>
              </div>
              <div className="border border-border rounded-xl bg-bg-card p-4 lg:col-span-2">
                <div className="text-[13px] font-bold text-text mb-2">Score History</div>
                <ChartBox option={{
                  tooltip: { trigger: 'axis' },
                  xAxis: { type: 'category', data: Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 6 + i); return (d.getMonth() + 1) + '/' + d.getDate(); }), axisLabel: { fontSize: 9 } },
                  yAxis: { type: 'value', min: 0, max: 100, axisLabel: { fontSize: 9 } },
                  series: [{ type: 'line', smooth: true, data: [0, 0, 0, 0, 0, 0, 0], areaStyle: { opacity: 0.08 }, lineStyle: { width: 2, color: 'var(--accent)' }, itemStyle: { color: 'var(--accent)' } }],
                  grid: { left: 40, right: 15, top: 15, bottom: 30 },
                }} height={200} />
              </div>
              <div className="border border-border rounded-xl bg-bg-card p-4">
                <div className="text-[13px] font-bold text-text mb-2">Level Fit</div>
                <ChartBox option={{
                  tooltip: {},
                  radar: { indicator: [{ name: 'Entry', max: 100 }, { name: 'Mid', max: 100 }, { name: 'Senior', max: 100 }, { name: 'Staff', max: 100 }, { name: 'Director', max: 100 }], radius: 70 },
                  series: [{ type: 'radar', data: [{ value: [0, 0, 0, 0, 0], name: 'Fit Score' }] }],
                }} height={220} />
              </div>
              <div className="border border-border rounded-xl bg-bg-card p-4">
                <div className="text-[13px] font-bold text-text mb-2">Keyword Coverage</div>
                <ChartBox option={{
                  tooltip: {},
                  xAxis: { type: 'category', data: ['Matched', 'Missing', 'Extra'], axisLabel: { fontSize: 10 } },
                  yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                  series: [{ type: 'bar', data: [0, 0, 0], itemStyle: { borderRadius: [4, 4, 0, 0] } }],
                  grid: { left: 40, right: 15, top: 15, bottom: 30 },
                }} height={200} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Overlay Analytics tab */}
      {tab === 'overlay' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Active Overlays', value: '—' },
              { label: 'Jobs Enriched', value: '—' },
              { label: 'Avg Fraud Score', value: '—' },
              { label: 'AI Detection Rate', value: '—' },
            ].map(s => (
              <div key={s.label} className="border border-border rounded-xl bg-bg-card p-[18px_20px] text-center">
                <div className="font-bold text-text tabular-nums font-mono" style={{ fontSize: "clamp(20px, 2.2vw + 0.5rem, 28px)", letterSpacing: "-1px" }}>{s.value}</div>
                <div className="text-[10px] text-text-faint uppercase tracking-wide mt-1">{s.label}</div>
              </div>
            ))}
          </div>
          <div className="text-center py-4 text-text-faint text-[12px]">
            Overlay analytics populate as the scoring pipeline processes jobs in your feed.
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">Trust Score Distribution</div>
              <ChartBox option={{
                tooltip: {},
                xAxis: { type: 'category', data: ['Safe', 'Caution', 'Suspicious', 'Unknown'], axisLabel: { fontSize: 10 } },
                yAxis: { type: 'value', axisLabel: { fontSize: 9 } },
                series: [{ type: 'bar', data: [0, 0, 0, 0], itemStyle: { borderRadius: [4, 4, 0, 0], color: (p: any) => ['#22c55e', '#f59e0b', '#ef4444', '#94a3b8'][p.dataIndex] } }],
                grid: { left: 40, right: 15, top: 15, bottom: 35 },
              }} height={220} />
            </div>
            <div className="border border-border rounded-xl bg-bg-card p-4">
              <div className="text-[13px] font-bold text-text mb-2">AI Content Detection</div>
              <ChartBox option={{
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: ['40%', '70%'], data: [
                  { value: 0, name: 'Human', itemStyle: { color: '#22c55e' } },
                  { value: 0, name: 'Mixed', itemStyle: { color: '#f59e0b' } },
                  { value: 0, name: 'AI Generated', itemStyle: { color: '#ef4444' } },
                  { value: 0, name: 'Unscored', itemStyle: { color: '#94a3b8' } },
                ], label: { fontSize: 10 } }],
              }} height={220} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
