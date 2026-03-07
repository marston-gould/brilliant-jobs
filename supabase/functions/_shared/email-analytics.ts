// supabase/functions/_shared/email-analytics.ts
// CS-P1-012 (TS1-6): Analytics data reports (dark theme)
import { baseLayout, utmLink, detailRow, DASHBOARD_URL } from "./email-base.ts";

// ═══════════════════════════════════════════════════
// BATCH 6: DARK THEME DATA EMAIL TEMPLATES (v6.10)
// 9 new templates + weeklySummaryEmail is already above
// All use dark baseLayout. Data-first presentation.
// ═══════════════════════════════════════════════════

// ---- Dark Theme Data Helpers ----
function statCard(label: string, value: string, delta?: string, deltaDir?: 'up' | 'down' | 'flat'): string {
  const deltaColor = deltaDir === 'up' ? '#22c55e' : deltaDir === 'down' ? '#ef4444' : '#64748b';
  const deltaArrow = deltaDir === 'up' ? '▲' : deltaDir === 'down' ? '▼' : '—';
  const deltaHtml = delta ? `<div style="font-size:11px;color:${deltaColor};margin-top:2px;">${deltaArrow} ${delta}</div>` : '';
  return `<td style="padding:0 4px;vertical-align:top;">
    <div style="background:#181a20;border:1px solid #2a2d35;border-radius:8px;padding:12px 8px;text-align:center;">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${label}</div>
      <div style="font-size:22px;font-weight:700;color:#f0f1f3;line-height:1.2;margin-top:4px;">${value}</div>
      ${deltaHtml}
    </div>
  </td>`;
}

function statCardsRow(cards: Array<{ label: string; value: string; delta?: string; dir?: 'up' | 'down' | 'flat' }>): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr>${cards.map(c => statCard(c.label, c.value, c.delta, c.dir)).join('')}</tr></table>`;
}

function dataTableRow(cells: string[], isHeader = false, altRow = false): string {
  const bg = isHeader ? '#1e2028' : altRow ? '#1a1d27' : '#181a20';
  const color = isHeader ? '#94a3b8' : '#f0f1f3';
  const weight = isHeader ? '600' : '400';
  const size = isHeader ? '11' : '12';
  return `<tr style="background:${bg};">${cells.map(c =>
    `<td style="padding:7px 10px;font-size:${size}px;color:${color};font-weight:${weight};border-bottom:1px solid #2a2d35;">${c}</td>`
  ).join('')}</tr>`;
}

function dataTable(headers: string[], rows: string[][]): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #2a2d35;border-radius:6px;overflow:hidden;margin:12px 0;">
    ${dataTableRow(headers, true)}
    ${rows.map((r, i) => dataTableRow(r, false, i % 2 === 1)).join('')}
  </table>`;
}

function deltaSpan(value: string, dir: 'up' | 'down' | 'flat'): string {
  const color = dir === 'up' ? '#22c55e' : dir === 'down' ? '#ef4444' : '#64748b';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '—';
  return `<span style="color:${color};font-weight:600;">${arrow} ${value}</span>`;
}

function urgencyBadge(level: 'high' | 'medium' | 'low'): string {
  const bg = level === 'high' ? '#ef4444' : level === 'medium' ? '#f59e0b' : '#3b82f6';
  const textColor = level === 'medium' ? '#0f1117' : '#ffffff';
  return `<span style="background:${bg};color:${textColor};padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">${level}</span>`;
}

function proBadge(): string {
  return `<span style="background:#3b82f6;color:#fff;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:0.5px;">PRO</span>`;
}

function sectionHeading(text: string): string {
  return `<div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 10px;">${text}</div>`;
}

// ---- 1. Monthly Pipeline Report ----

export function monthlyPipelineReportEmail(stats: {
  monthName: string;
  totalApplied: number;
  totalResponses: number;
  responseRate: number;
  avgDaysToResponse: number;
  interviewConversion: number;
  ghostRate: number;
  lastMonth: {
    applied: number;
    responseRate: number;
    avgDays: number;
    interviewPct: number;
    ghostRate: number;
  };
  topResponders: Array<{ company: string; days: number }>;
  funnelImageUrl?: string;
  userName?: string;
}): { subject: string; html: string } {
  const appliedDelta = stats.totalApplied - stats.lastMonth.applied;
  const appliedDir = appliedDelta > 0 ? 'up' : appliedDelta < 0 ? 'down' : 'flat';
  const rrDelta = stats.responseRate - stats.lastMonth.responseRate;
  const rrDir = rrDelta > 0 ? 'up' : rrDelta < 0 ? 'down' : 'flat';

  return {
    subject: `Your ${stats.monthName} pipeline report is ready`,
    html: baseLayout(`${stats.monthName} Pipeline Report`, `
      <div class="card">
        <div class="card-title">${stats.monthName} Pipeline Report</div>
        <p class="card-sub">Your complete application performance review</p>

        ${statCardsRow([
          { label: 'Applied', value: String(stats.totalApplied), delta: `${Math.abs(appliedDelta)} vs last mo`, dir: appliedDir as any },
          { label: 'Response Rate', value: `${stats.responseRate}%`, delta: `${Math.abs(rrDelta).toFixed(1)}pp`, dir: rrDir as any },
          { label: 'Avg Response', value: `${stats.avgDaysToResponse}d` },
          { label: 'Ghost Rate', value: `${stats.ghostRate}%` },
        ])}

        ${stats.funnelImageUrl ? `<img src="${stats.funnelImageUrl}" alt="Pipeline funnel" width="100%" style="border-radius:8px;margin:16px 0;">` : ''}

        ${sectionHeading('Month-over-Month Comparison')}
        ${dataTable(
          ['Metric', 'This Month', 'Last Month', 'Change'],
          [
            ['Applications sent', String(stats.totalApplied), String(stats.lastMonth.applied), deltaSpan(`${Math.abs(appliedDelta)}`, appliedDir as any)],
            ['Response rate', `${stats.responseRate}%`, `${stats.lastMonth.responseRate}%`, deltaSpan(`${Math.abs(rrDelta).toFixed(1)}pp`, rrDir as any)],
            ['Avg days to response', String(stats.avgDaysToResponse), String(stats.lastMonth.avgDays), deltaSpan(`${Math.abs(stats.avgDaysToResponse - stats.lastMonth.avgDays)}d`, stats.avgDaysToResponse < stats.lastMonth.avgDays ? 'up' : 'down')],
            ['Interview conversion', `${stats.interviewConversion}%`, `${stats.lastMonth.interviewPct}%`, deltaSpan(`${Math.abs(stats.interviewConversion - stats.lastMonth.interviewPct).toFixed(1)}pp`, stats.interviewConversion > stats.lastMonth.interviewPct ? 'up' : 'down')],
            ['Ghost rate', `${stats.ghostRate}%`, `${stats.lastMonth.ghostRate}%`, deltaSpan(`${Math.abs(stats.ghostRate - stats.lastMonth.ghostRate).toFixed(1)}pp`, stats.ghostRate < stats.lastMonth.ghostRate ? 'up' : 'down')],
          ]
        )}

        ${stats.topResponders.length > 0 ? `
          ${sectionHeading('Fastest Responding Companies')}
          ${stats.topResponders.map((c, i) => detailRow(`${i + 1}. ${c.company}`, `${c.days} days`)).join('')}
        ` : ''}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View Pipeline</a>
        </div>
      </div>
    `),
  };
}

// ---- 2. Pipeline Benchmark ----

export function pipelineBenchmarkEmail(stats: {
  monthName: string;
  responseRate: number;
  responsePercentile: number;
  avgDays: number;
  speedPercentile: number;
  interviewRate: number;
  interviewPercentile: number;
  communityResponseAvg: number;
  communityDaysAvg: number;
  communityInterviewAvg: number;
  totalCommunityUsers: number;
  insight: string;
}): { subject: string; html: string } {
  return {
    subject: `How your pipeline compares — ${stats.monthName} benchmarks`,
    html: baseLayout('Pipeline Benchmark', `
      <div class="card">
        <div class="card-title">Your Pipeline vs the Market</div>
        <p class="card-sub">Based on ${stats.totalCommunityUsers.toLocaleString()} active Brilliant Jobs members</p>

        <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          <tr>
            <td style="padding:0 4px;vertical-align:top;width:33%;">
              <div style="background:#181a20;border:1px solid #2a2d35;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Response Rate</div>
                <div style="font-size:24px;font-weight:700;color:#f0f1f3;margin:4px 0;">${stats.responseRate}%</div>
                <div style="font-size:11px;color:#22c55e;font-weight:600;">Top ${stats.responsePercentile}%</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">Avg: ${stats.communityResponseAvg}%</div>
              </div>
            </td>
            <td style="padding:0 4px;vertical-align:top;width:33%;">
              <div style="background:#181a20;border:1px solid #2a2d35;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Time to Response</div>
                <div style="font-size:24px;font-weight:700;color:#f0f1f3;margin:4px 0;">${stats.avgDays}d</div>
                <div style="font-size:11px;color:#22c55e;font-weight:600;">Top ${stats.speedPercentile}%</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">Avg: ${stats.communityDaysAvg}d</div>
              </div>
            </td>
            <td style="padding:0 4px;vertical-align:top;width:33%;">
              <div style="background:#181a20;border:1px solid #2a2d35;border-radius:8px;padding:14px 10px;text-align:center;">
                <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Interview Rate</div>
                <div style="font-size:24px;font-weight:700;color:#f0f1f3;margin:4px 0;">${stats.interviewRate}%</div>
                <div style="font-size:11px;color:#22c55e;font-weight:600;">Top ${stats.interviewPercentile}%</div>
                <div style="font-size:10px;color:#64748b;margin-top:4px;">Avg: ${stats.communityInterviewAvg}%</div>
              </div>
            </td>
          </tr>
        </table>

        ${stats.insight ? `<div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
          <div style="font-size:13px;color:#f0f1f3;line-height:1.5;">${stats.insight}</div>
        </div>` : ''}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#stats" class="btn btn-primary">View Your Stats</a>
        </div>
      </div>
    `),
  };
}

// ---- 3. Market Pulse ----

export function marketPulseEmail(stats: {
  weekLabel: string;
  totalNewJobs: number;
  totalBoards: number;
  trendRows: Array<{ label: string; value: string; trend: 'up' | 'down' | 'flat'; sparklineUrl?: string }>;
  topHiringCompanies: Array<{ company: string; count: number }>;
  isFreeTier: boolean;
}): { subject: string; html: string } {
  const headline = stats.totalNewJobs > 100 ? `${stats.totalNewJobs} new jobs this week` : `Market update for ${stats.weekLabel}`;

  return {
    subject: `Market pulse: ${headline}`,
    html: baseLayout('Market Pulse', `
      <div class="card">
        <div class="card-title">Market Pulse — ${stats.weekLabel}</div>
        <p class="card-sub">Job market intelligence from ${stats.totalBoards.toLocaleString()} company career pages</p>

        ${stats.trendRows.map(r => `
          <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #2a2d35;">
            <tr>
              <td style="padding:10px 0;font-size:13px;color:#94a3b8;">${r.label}</td>
              <td style="padding:10px 0;font-size:14px;color:#f0f1f3;font-weight:600;text-align:right;">
                ${r.value} ${deltaSpan('', r.trend)}
              </td>
            </tr>
          </table>
        `).join('')}

        ${stats.topHiringCompanies.length > 0 ? `
          ${sectionHeading('Companies Hiring Aggressively')}
          ${stats.topHiringCompanies.slice(0, 5).map((c, i) => detailRow(`${i + 1}. ${c.company}`, `${c.count} new roles`)).join('')}
        ` : ''}

        ${stats.isFreeTier ? `
          <div style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:14px;margin:16px 0;text-align:center;">
            <div style="font-size:12px;color:#3b82f6;font-weight:600;margin-bottom:4px;">${proBadge()} Unlock full market intelligence</div>
            <div style="font-size:11px;color:#94a3b8;">Salary trends, remote % tracking, and company-level insights</div>
          </div>
        ` : ''}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#jobs" class="btn btn-primary">Explore Job Feed</a>
          ${stats.isFreeTier ? `<a href="${DASHBOARD_URL}#subscription" class="btn btn-gray">Upgrade to Pro</a>` : ''}
        </div>
      </div>
    `),
  };
}

// ---- 4. Trend Anomaly ----

export function trendAnomalyEmail(stats: {
  filterName: string;
  anomalyType: string;
  description: string;
  metricName: string;
  currentValue: string;
  avgValue: string;
  deviationPct: number;
  urgency: 'high' | 'medium' | 'low';
  filterId?: string;
}): { subject: string; html: string } {
  return {
    subject: `Unusual activity: ${stats.anomalyType} in ${stats.filterName}`,
    html: baseLayout('Trend Anomaly', `
      <div class="card">
        <div style="margin-bottom:12px;">${urgencyBadge(stats.urgency)}</div>
        <div class="card-title">Trend Anomaly Detected</div>
        <p class="card-sub">Filter: ${stats.filterName}</p>

        <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:12px 0;">
          <div style="font-size:13px;color:#f0f1f3;line-height:1.6;">${stats.description}</div>
        </div>

        ${sectionHeading('Comparison')}
        ${dataTable(
          ['Metric', 'Current', '4-Week Avg', 'Deviation'],
          [[stats.metricName, stats.currentValue, stats.avgValue, deltaSpan(`${Math.abs(stats.deviationPct)}%`, stats.deviationPct > 0 ? 'up' : 'down')]]
        )}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#stats${stats.filterId ? '?filter=' + stats.filterId : ''}" class="btn btn-primary">View in Dashboard</a>
          <a href="${DASHBOARD_URL}#tuning${stats.filterId ? '?filter=' + stats.filterId : ''}" class="btn btn-gray">Adjust Filter</a>
        </div>
      </div>
    `),
  };
}

// ---- 5. Filter Trend ----

export function filterTrendEmail(stats: {
  weekLabel: string;
  filters: Array<{
    name: string;
    newJobs: number;
    jobsDelta: string;
    jobsDir: 'up' | 'down' | 'flat';
    medianSalary: string;
    salaryDelta: string;
    salaryDir: 'up' | 'down' | 'flat';
    commentary?: string;
  }>;
  bestFilter?: string;
}): { subject: string; html: string } {
  const topFilter = stats.filters[0];
  const subjectLine = topFilter ? `Filter trends: ${topFilter.name} ${topFilter.jobsDir === 'up' ? '↑' : topFilter.jobsDir === 'down' ? '↓' : '—'} this week` : 'Your saved filters — weekly performance update';

  return {
    subject: subjectLine,
    html: baseLayout('Filter Trends', `
      <div class="card">
        <div class="card-title">Filter Performance — ${stats.weekLabel}</div>
        <p class="card-sub">How each of your saved filters is performing</p>

        ${dataTable(
          ['Filter', 'New Jobs', 'Δ', 'Med. Salary', 'Sal Δ'],
          stats.filters.map(f => [
            f.name,
            String(f.newJobs),
            deltaSpan(f.jobsDelta, f.jobsDir),
            f.medianSalary,
            deltaSpan(f.salaryDelta, f.salaryDir),
          ])
        )}

        ${stats.filters.filter(f => f.commentary).map(f => `
          <div style="background:#1a1d27;border-left:3px solid #3b82f6;padding:10px 14px;margin:8px 0;border-radius:0 6px 6px 0;">
            <div style="font-size:12px;color:#f0f1f3;line-height:1.5;"><strong>${f.name}</strong> — ${f.commentary}</div>
          </div>
        `).join('')}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#stats" class="btn btn-primary">View Stats Page</a>
        </div>
      </div>
    `),
  };
}

// ---- 6. Ghost Report Weekly ----

export function ghostReportWeeklyEmail(stats: {
  weekLabel: string;
  ghostCount: number;
  worstDays: number;
  resolvedCount: number;
  ghostedApps: Array<{
    company: string;
    role: string;
    appliedDate: string;
    daysWaiting: number;
    expectedDays: number;
  }>;
  ghostPct: number;
  marketGhostPct: number;
  contextSentence?: string;
}): { subject: string; html: string } {
  const worstCompany = stats.ghostedApps[0]?.company || 'Unknown';

  return {
    subject: `${stats.ghostCount} applications past expected response time`,
    html: baseLayout('Ghost Report', `
      <div class="card">
        <div class="card-title">Ghost Report — ${stats.weekLabel}</div>
        <p class="card-sub">Applications without responses past expected timelines</p>

        ${statCardsRow([
          { label: 'Ghosted', value: String(stats.ghostCount) },
          { label: 'Longest Wait', value: `${stats.worstDays}d` },
          { label: 'Resolved', value: String(stats.resolvedCount), delta: 'this week', dir: 'up' },
        ])}

        ${stats.ghostedApps.length > 0 ? `
          ${sectionHeading('Ghost Watch')}
          ${dataTable(
            ['Company', 'Role', 'Applied', 'Waiting', 'Expected'],
            stats.ghostedApps.slice(0, 5).map(a => [
              a.company,
              a.role.length > 25 ? a.role.slice(0, 22) + '...' : a.role,
              a.appliedDate,
              `<span style="color:${a.daysWaiting > a.expectedDays * 1.5 ? '#ef4444' : '#f59e0b'};font-weight:600;">${a.daysWaiting}d</span>`,
              `${a.expectedDays}d`,
            ])
          )}
        ` : ''}

        <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
          <div style="font-size:13px;color:#94a3b8;line-height:1.5;">
            ${stats.ghostPct}% of your pipeline is past expected response time. Market average: ${stats.marketGhostPct}%.
            ${stats.contextSentence || ''}
          </div>
        </div>

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#ghost" class="btn btn-primary">View Ghost Monitor</a>
        </div>
      </div>
    `),
  };
}

// ---- 7. Upgrade ROI Summary ----

export function upgradeRoiSummaryEmail(stats: {
  monthName: string;
  isFreeTier: boolean;
  // Free tier fields
  jobsTracked?: number;
  matchesFound?: number;
  missedCount?: number;
  projectedAuto?: number;
  projectedHours?: number;
  // Pro tier fields
  autoApplies?: number;
  hoursSaved?: number;
  responseRate?: number;
  costPerApp?: string;
  planPrice?: string;
  manualCostPerApp?: string;
}): { subject: string; html: string } {
  const headline = stats.isFreeTier
    ? `${stats.missedCount || 0} opportunities you missed this month`
    : `Brilliant Jobs saved you ${stats.hoursSaved || 0} hours this month`;

  const body = stats.isFreeTier ? `
    ${statCardsRow([
      { label: 'Jobs Tracked', value: String(stats.jobsTracked || 0) },
      { label: 'Matches Found', value: String(stats.matchesFound || 0) },
      { label: 'Missed', value: String(stats.missedCount || 0) },
    ])}
    <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
      <div style="font-size:13px;color:#f0f1f3;line-height:1.6;">
        This month, <strong>${stats.missedCount}</strong> jobs matching your filters were posted and filled before your next login.
        With Pro, you would have auto-applied to <strong>${stats.projectedAuto}</strong> of them, saving an estimated <strong>${stats.projectedHours} hours</strong> of manual searching.
      </div>
    </div>
    <div class="btn-row">
      <a href="${DASHBOARD_URL}#subscription" class="btn btn-primary">Upgrade to Pro</a>
    </div>
  ` : `
    ${statCardsRow([
      { label: 'Auto-Applied', value: String(stats.autoApplies || 0) },
      { label: 'Hours Saved', value: String(stats.hoursSaved || 0) },
      { label: 'Response Rate', value: `${stats.responseRate || 0}%` },
      { label: 'Cost/App', value: `$${stats.costPerApp || '0'}` },
    ])}
    <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
      <div style="font-size:13px;color:#f0f1f3;line-height:1.6;">
        At ${stats.planPrice}/month, each auto-application cost you <strong>$${stats.costPerApp}</strong>.
        Manual job boards average <strong>$${stats.manualCostPerApp}</strong> per application in time value.
      </div>
    </div>
    <div class="btn-row">
      <a href="${DASHBOARD_URL}" class="btn btn-primary">View Dashboard</a>
    </div>
  `;

  return {
    subject: stats.isFreeTier
      ? `Your ROI report: ${headline}`
      : `This month, Brilliant Jobs saved you ${stats.hoursSaved} hours`,
    html: baseLayout('Value Report', `
      <div class="card">
        <div class="card-title">Your ${stats.monthName} Value Report</div>
        <p class="card-sub">What Brilliant Jobs did for your job search</p>
        ${body}
      </div>
    `),
  };
}

// ---- 8. Credit Cost Comparison ----

export function creditCostComparisonEmail(stats: {
  monthName: string;
  creditsUsed: number;
  creditsRemaining: number;
  nextRefillDate: string;
  usageRows: Array<{ feature: string; uses: number; credits: number; unitCost: string }>;
  starterCredits: number;
  proCredits: number;
  starterPerCredit: string;
  proPerCredit: string;
  savingsPct: number;
  projectedCredits: number;
  projectionContext: string;
}): { subject: string; html: string } {
  return {
    subject: `Your AI credit usage this month — ${stats.creditsUsed} credits`,
    html: baseLayout('AI Credit Report', `
      <div class="card">
        <div class="card-title">AI Credit Report — ${stats.monthName}</div>
        <p class="card-sub">Resume scoring, rewrites, and AI-powered features</p>

        ${statCardsRow([
          { label: 'Used', value: String(stats.creditsUsed) },
          { label: 'Remaining', value: String(stats.creditsRemaining) },
          { label: 'Next Refill', value: stats.nextRefillDate },
        ])}

        ${sectionHeading('Usage Breakdown')}
        ${dataTable(
          ['Feature', 'Uses', 'Credits', '$/Unit'],
          stats.usageRows.map(r => [r.feature, String(r.uses), String(r.credits), `$${r.unitCost}`])
        )}

        ${sectionHeading('Plan Comparison')}
        ${dataTable(
          ['', 'Starter', 'Pro (You)', 'Savings'],
          [
            ['Monthly credits', String(stats.starterCredits), String(stats.proCredits), ''],
            ['Cost per credit', `$${stats.starterPerCredit}`, `$${stats.proPerCredit}`, `${stats.savingsPct}% less`],
          ]
        )}

        <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
          <div style="font-size:13px;color:#94a3b8;line-height:1.5;">
            At your current rate, you'll use ~${stats.projectedCredits} credits next month. ${stats.projectionContext}
          </div>
        </div>

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#subscription" class="btn btn-primary">Manage Credits</a>
        </div>
      </div>
    `),
  };
}

// ---- 9. Rewrite Batch Summary ----

export function rewriteBatchSummaryEmail(stats: {
  totalCount: number;
  improvedCount: number;
  avgImprovement: number;
  creditsUsed: number;
  filterName: string;
  batchId: string;
  resumes: Array<{
    name: string;
    before: string;
    after: string;
    delta: string;
    status: 'improved' | 'unchanged' | 'failed';
  }>;
}): { subject: string; html: string } {
  const statusColor = (s: string) => s === 'improved' ? '#22c55e' : s === 'failed' ? '#ef4444' : '#64748b';
  const statusLabel = (s: string) => s === 'improved' ? 'Improved' : s === 'failed' ? 'Failed' : 'Unchanged';

  return {
    subject: `Rewrite batch complete: ${stats.improvedCount}/${stats.totalCount} resumes improved`,
    html: baseLayout('Rewrite Batch Complete', `
      <div class="card">
        <div class="card-title">Rewrite Batch Complete</div>
        <p class="card-sub">${stats.totalCount} resumes processed for ${stats.filterName}</p>

        ${statCardsRow([
          { label: 'Processed', value: String(stats.totalCount) },
          { label: 'Improved', value: String(stats.improvedCount) },
          { label: 'Avg Δ', value: `+${stats.avgImprovement}` },
          { label: 'Credits', value: String(stats.creditsUsed) },
        ])}

        ${sectionHeading('Score Results')}
        ${dataTable(
          ['Resume', 'Before', 'After', 'Δ', 'Status'],
          stats.resumes.map(r => [
            r.name.length > 20 ? r.name.slice(0, 17) + '...' : r.name,
            r.before,
            r.after,
            `<span style="color:#22c55e;font-weight:600;">${r.delta}</span>`,
            `<span style="color:${statusColor(r.status)};font-weight:600;">${statusLabel(r.status)}</span>`,
          ])
        )}

        <div style="background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;padding:14px;margin:16px 0;">
          <div style="font-size:13px;color:#94a3b8;line-height:1.5;">
            Review each rewrite to accept or reject changes. Accepted rewrites replace the original for future applications to this filter.
          </div>
        </div>

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#resumes?batch=${stats.batchId}" class="btn btn-primary">Review Rewrites</a>
        </div>
      </div>
    `),
  };
}

