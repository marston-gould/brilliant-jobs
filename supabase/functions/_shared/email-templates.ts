// _shared/email-templates.ts
// Shared email templates for all Brilliant Jobs notifications.
// Dark theme matching the dashboard design system.

const DASHBOARD_URL = "https://brilliantjobs.app/dashboard.html";
const LOGO_TEXT = "Brilliant Jobs";

// ---- Base Layout ----
function baseLayout(title: string, bodyHtml: string, footerExtra?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#0f1117; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#f0f1f3; }
  .wrapper { max-width:560px; margin:0 auto; padding:32px 20px; }
  .header { text-align:center; padding-bottom:24px; border-bottom:1px solid #2a2d35; margin-bottom:24px; }
  .brand { font-size:20px; font-weight:700; color:#f0f1f3; text-decoration:none; letter-spacing:-0.3px; }
  .brand span { color:#3b82f6; }
  .card { background:#181a20; border:1px solid #2a2d35; border-radius:14px; padding:28px; margin-bottom:20px; }
  .card-title { font-size:18px; font-weight:700; margin:0 0 8px; color:#f0f1f3; }
  .card-sub { font-size:14px; color:#94a3b8; line-height:1.5; margin:0 0 20px; }
  .text { font-size:14px; color:#94a3b8; line-height:1.6; margin:0 0 16px; }
  .btn { display:inline-block; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; text-align:center; }
  .btn-primary { background:#3b82f6; color:#ffffff !important; }
  .btn-green { background:#22c55e; color:#ffffff !important; }
  .btn-gray { background:#2a2d35; color:#94a3b8 !important; }
  .btn-red { background:#ef4444; color:#ffffff !important; }
  .btn-row { text-align:center; margin:24px 0; }
  .btn-row .btn { margin:0 6px 8px; }
  .divider { border:none; border-top:1px solid #2a2d35; margin:20px 0; }
  .detail-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #2a2d35; font-size:13px; }
  .detail-label { color:#64748b; }
  .detail-value { color:#f0f1f3; font-weight:600; }
  .badge { display:inline-block; padding:3px 10px; border-radius:8px; font-size:11px; font-weight:600; }
  .badge-blue { background:rgba(59,130,246,0.15); color:#3b82f6; }
  .badge-green { background:rgba(34,197,94,0.15); color:#22c55e; }
  .badge-amber { background:rgba(245,158,11,0.15); color:#f59e0b; }
  .badge-red { background:rgba(239,68,68,0.15); color:#ef4444; }
  .footer { text-align:center; padding-top:24px; border-top:1px solid #2a2d35; margin-top:24px; }
  .footer p { font-size:11px; color:#64748b; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
  .mono { font-family:'Courier New',monospace; }
  .salary { color:#22c55e; font-weight:700; }
  @media (prefers-color-scheme: light) {
    body { background:#f8fafc; color:#1e293b; }
    .card { background:#ffffff; border-color:#e2e8f0; }
    .card-title { color:#1e293b; }
    .text, .card-sub { color:#64748b; }
    .detail-label { color:#94a3b8; }
    .detail-value { color:#1e293b; }
    .footer p { color:#94a3b8; }
    .divider, .detail-row { border-color:#e2e8f0; }
    .header { border-color:#e2e8f0; }
    .footer { border-color:#e2e8f0; }
    .btn-gray { background:#e2e8f0; color:#64748b !important; }
  }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <a href="https://brilliantjobs.app" class="brand"><span>Brilliant</span> Jobs</a>
  </div>
  ${bodyHtml}
  <div class="footer">
    ${footerExtra || ""}
    <p><a href="${DASHBOARD_URL}">Open Dashboard</a> &middot; <a href="https://brilliantjobs.app">brilliantjobs.app</a></p>
    <p>You're receiving this because you have an account on Brilliant Jobs.</p>
    <p>&copy; ${new Date().getFullYear()} Brilliant Jobs. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}

// ---- Helpers ----
function detailRow(label: string, value: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #2a2d35;"><tr><td style="padding:8px 0;font-size:13px;color:#64748b;">${label}</td><td style="padding:8px 0;font-size:13px;color:#f0f1f3;font-weight:600;text-align:right;">${value}</td></tr></table>`;
}

function salaryDisplay(min?: number, max?: number, currency?: string): string {
  if (!min && !max) return "Not listed";
  const cur = currency || "USD";
  const fmt = (n: number) => {
    if (cur === "USD") return "$" + (n >= 1000 ? Math.round(n / 1000) + "K" : n);
    return n.toLocaleString() + " " + cur;
  };
  if (min && max) return `<span class="salary">${fmt(min)} – ${fmt(max)}</span>`;
  if (min) return `<span class="salary">${fmt(min)}+</span>`;
  return `<span class="salary">Up to ${fmt(max!)}</span>`;
}

// ================================================================
// ACCOUNT LIFECYCLE TEMPLATES
// ================================================================

export function welcomeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Welcome to Brilliant Jobs",
    html: baseLayout("Welcome to Brilliant Jobs", `
      <div class="card">
        <div class="card-title">Welcome, ${name}!</div>
        <p class="text">You're in. Brilliant Jobs scans company hiring pages directly — no job boards, no middlemen — so you see roles the moment they're posted.</p>
        <p class="text">Here's how to get started:</p>
        <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
          <tr><td style="padding:6px 12px 6px 0;color:#3b82f6;font-weight:700;font-size:14px;vertical-align:top;">1.</td><td style="padding:6px 0;font-size:14px;color:#94a3b8;line-height:1.5;"><strong style="color:#f0f1f3;">Install the Chrome extension</strong> — scan your LinkedIn network to find companies where you have inside contacts.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#3b82f6;font-weight:700;font-size:14px;vertical-align:top;">2.</td><td style="padding:6px 0;font-size:14px;color:#94a3b8;line-height:1.5;"><strong style="color:#f0f1f3;">Create your first saved filter</strong> — combine keywords, locations, and companies to define what you're looking for.</td></tr>
          <tr><td style="padding:6px 12px 6px 0;color:#3b82f6;font-weight:700;font-size:14px;vertical-align:top;">3.</td><td style="padding:6px 0;font-size:14px;color:#94a3b8;line-height:1.5;"><strong style="color:#f0f1f3;">Upload your resume</strong> — we'll match it against job descriptions and auto-select the right version when you apply.</td></tr>
        </table>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">Open Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function accountApprovedEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Your Brilliant Jobs account is approved",
    html: baseLayout("Account Approved", `
      <div class="card">
        <div class="card-title">You're approved, ${name}!</div>
        <p class="text">Your account has been verified and you now have full access to Brilliant Jobs.</p>
        <p class="text">Start by setting up your search filters and uploading your resume. We're currently tracking over 116,000 jobs across 1,900+ companies.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">Get Started</a>
        </div>
      </div>
    `),
  };
}

export function passwordResetEmail(resetLink: string): { subject: string; html: string } {
  return {
    subject: "Reset your Brilliant Jobs password",
    html: baseLayout("Password Reset", `
      <div class="card">
        <div class="card-title">Password Reset</div>
        <p class="text">We received a request to reset your password. Click the button below to choose a new one.</p>
        <div class="btn-row">
          <a href="${resetLink}" class="btn btn-primary">Reset Password</a>
        </div>
        <p class="text" style="font-size:12px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `),
  };
}

export function subscriptionConfirmEmail(plan: string, amount: string): { subject: string; html: string } {
  return {
    subject: "Brilliant Jobs — Payment confirmed",
    html: baseLayout("Payment Confirmed", `
      <div class="card">
        <div class="card-title">Payment Confirmed</div>
        <p class="text">Your ${plan} subscription is active. Here's your receipt:</p>
        ${detailRow("Plan", plan)}
        ${detailRow("Amount", amount)}
        ${detailRow("Date", new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#subscription" class="btn btn-primary">Manage Subscription</a>
        </div>
      </div>
    `),
  };
}

export function subscriptionExpiringEmail(daysLeft: number, plan: string): { subject: string; html: string } {
  return {
    subject: `Your Brilliant Jobs subscription expires in ${daysLeft} days`,
    html: baseLayout("Subscription Expiring", `
      <div class="card">
        <div class="card-title">Subscription Expiring Soon</div>
        <p class="text">Your ${plan} plan expires in <strong style="color:#f59e0b;">${daysLeft} days</strong>. Renew to keep full access to job intelligence, auto-apply, and notification alerts.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#subscription" class="btn btn-primary">Renew Now</a>
        </div>
      </div>
    `),
  };
}

export function inactivityWarningEmail(daysSince: number): { subject: string; html: string } {
  return {
    subject: "We miss you — your job search dashboard is waiting",
    html: baseLayout("Come Back", `
      <div class="card">
        <div class="card-title">Your dashboard is waiting</div>
        <p class="text">It's been ${daysSince} days since your last visit. New jobs are being posted daily — your saved filters may have new matches.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">Check New Jobs</a>
        </div>
        <p class="text" style="font-size:12px;">If you'd like to stop receiving these reminders, update your notification preferences in Settings.</p>
      </div>
    `),
  };
}

// ================================================================
// REAL-TIME NOTIFICATION TEMPLATES
// ================================================================

interface JobDetails {
  title: string;
  company: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  match_score?: number;
  job_id?: string;
  filter_name?: string;
}

export function autoApplyConfirmEmail(job: JobDetails): { subject: string; html: string } {
  return {
    subject: `Applied: ${job.title} at ${job.company}`,
    html: baseLayout("Auto-Apply Confirmation", `
      <div class="card">
        <div class="card-title">Resume Submitted</div>
        <p class="text">We automatically submitted your resume for:</p>
        ${detailRow("Role", job.title)}
        ${detailRow("Company", job.company)}
        ${job.location ? detailRow("Location", job.location) : ""}
        ${job.salary_min || job.salary_max ? detailRow("Salary", salaryDisplay(job.salary_min, job.salary_max, job.salary_currency)) : ""}
        ${job.filter_name ? detailRow("Matched filter", job.filter_name) : ""}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View in Pipeline</a>
        </div>
      </div>
    `),
  };
}

export function applyAlertEmail(
  job: JobDetails,
  actionUrl: string,
  passUrl: string,
  viewUrl: string
): { subject: string; html: string; sms_text: string } {
  const scoreHtml = job.match_score
    ? `<div style="text-align:center;margin:16px 0;"><span class="badge badge-green" style="font-size:14px;padding:6px 14px;">Match: ${job.match_score}%</span></div>`
    : "";
  return {
    subject: `New match: ${job.title} at ${job.company}`,
    html: baseLayout("New Job Match", `
      <div class="card">
        <div class="card-title">New Match Found</div>
        <p class="text">A job matching your criteria was just posted:</p>
        ${scoreHtml}
        ${detailRow("Role", job.title)}
        ${detailRow("Company", job.company)}
        ${job.location ? detailRow("Location", job.location) : ""}
        ${job.salary_min || job.salary_max ? detailRow("Salary", salaryDisplay(job.salary_min, job.salary_max, job.salary_currency)) : ""}
        ${job.filter_name ? detailRow("Matched filter", job.filter_name) : ""}
        <div class="btn-row" style="margin-top:24px;">
          <a href="${actionUrl}" class="btn btn-green">Apply Now</a>
          <a href="${passUrl}" class="btn btn-gray">Pass</a>
          <a href="${viewUrl}" class="btn btn-primary">View Details</a>
        </div>
        <p class="text" style="font-size:11px;text-align:center;margin-top:12px;">If you don't respond, we'll send an SMS reminder based on your escalation settings.</p>
      </div>
    `),
    sms_text: `Brilliant Jobs: New match — ${job.title} at ${job.company}. Reply Y to apply, N to pass.`,
  };
}

export function pipelineResponseEmail(company: string, jobTitle: string): { subject: string; html: string } {
  return {
    subject: `Response from ${company}`,
    html: baseLayout("Response Received", `
      <div class="card">
        <div class="card-title">You got a response!</div>
        <p class="text"><strong style="color:#f0f1f3;">${company}</strong> responded to your application for <strong style="color:#f0f1f3;">${jobTitle}</strong>.</p>
        <p class="text">Check your email inbox for details, then update your pipeline to track next steps.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View Pipeline</a>
        </div>
      </div>
    `),
  };
}

export function interviewScheduledEmail(company: string, jobTitle: string): { subject: string; html: string; sms_text: string } {
  return {
    subject: `Interview: ${jobTitle} at ${company}`,
    html: baseLayout("Interview Scheduled", `
      <div class="card">
        <div style="text-align:center;margin-bottom:16px;"><span class="badge badge-green" style="font-size:14px;padding:6px 14px;">Interview</span></div>
        <div class="card-title" style="text-align:center;">Interview Stage</div>
        <p class="text" style="text-align:center;">Your application at <strong style="color:#f0f1f3;">${company}</strong> for <strong style="color:#f0f1f3;">${jobTitle}</strong> has advanced to the interview stage.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View Pipeline</a>
        </div>
      </div>
    `),
    sms_text: `Brilliant Jobs: Interview stage! ${jobTitle} at ${company}. Check your dashboard.`,
  };
}

export function offerReceivedEmail(company: string, jobTitle: string): { subject: string; html: string; sms_text: string } {
  return {
    subject: `Offer: ${jobTitle} at ${company}`,
    html: baseLayout("Offer Received", `
      <div class="card">
        <div style="text-align:center;margin-bottom:16px;"><span class="badge badge-green" style="font-size:16px;padding:8px 18px;">Offer!</span></div>
        <div class="card-title" style="text-align:center;">Congratulations!</div>
        <p class="text" style="text-align:center;">Your application at <strong style="color:#f0f1f3;">${company}</strong> for <strong style="color:#f0f1f3;">${jobTitle}</strong> has advanced to the offer stage.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-green">View Pipeline</a>
        </div>
      </div>
    `),
    sms_text: `Brilliant Jobs: OFFER received! ${jobTitle} at ${company}. Check your dashboard!`,
  };
}

export function listingClosedEmail(company: string, jobTitle: string): { subject: string; html: string } {
  return {
    subject: `Listing closed: ${jobTitle} at ${company}`,
    html: baseLayout("Listing Closed", `
      <div class="card">
        <div class="card-title">Listing Closed</div>
        <p class="text"><strong style="color:#f0f1f3;">${company}</strong> closed the listing for <strong style="color:#f0f1f3;">${jobTitle}</strong>.</p>
        <p class="text">If you applied, this may mean they're reviewing candidates. We'll notify you if we detect any updates.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View Pipeline</a>
        </div>
      </div>
    `),
  };
}

// ================================================================
// JOB INTELLIGENCE TEMPLATES
// ================================================================

export function ghostAlertEmail(company: string, jobTitle: string, daysSince: number, avgDays: number): { subject: string; html: string } {
  return {
    subject: `No response from ${company} — ${daysSince} days`,
    html: baseLayout("Ghost Alert", `
      <div class="card">
        <div class="card-title">Ghost Alert</div>
        <p class="text">It's been <strong style="color:#ef4444;">${daysSince} days</strong> since you applied to <strong style="color:#f0f1f3;">${jobTitle}</strong> at <strong style="color:#f0f1f3;">${company}</strong> with no response.</p>
        ${detailRow("Average response time", avgDays + " days")}
        ${detailRow("Your wait time", daysSince + " days")}
        <p class="text" style="margin-top:16px;">Consider following up directly or moving on to other opportunities.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}#ghost" class="btn btn-primary">View Ghost Monitor</a>
        </div>
      </div>
    `),
  };
}

export function companyNewRolesEmail(company: string, roleCount: number, roles: string[]): { subject: string; html: string } {
  const roleList = roles.slice(0, 5).map(r => `<li style="padding:4px 0;font-size:13px;color:#94a3b8;">${r}</li>`).join("");
  return {
    subject: `${company} just posted ${roleCount} new roles`,
    html: baseLayout("Hiring Surge", `
      <div class="card">
        <div class="card-title">${company} is hiring aggressively</div>
        <p class="text">A company you applied to just posted <strong style="color:#22c55e;">${roleCount} new roles</strong>:</p>
        <ul style="margin:12px 0;padding-left:20px;">${roleList}</ul>
        ${roles.length > 5 ? `<p class="text" style="font-size:12px;">+ ${roles.length - 5} more</p>` : ""}
        <div class="btn-row">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">Browse Jobs</a>
        </div>
      </div>
    `),
  };
}

export function networkMatchEmail(company: string, jobTitle: string, connectionNames: string[]): { subject: string; html: string; sms_text: string } {
  const names = connectionNames.slice(0, 3).join(", ");
  const extra = connectionNames.length > 3 ? ` + ${connectionNames.length - 3} more` : "";
  return {
    subject: `${connectionNames.length} connections at ${company} — new role posted`,
    html: baseLayout("Network Match", `
      <div class="card">
        <div class="card-title">Network Match</div>
        <p class="text"><strong style="color:#f0f1f3;">${company}</strong> just posted <strong style="color:#f0f1f3;">${jobTitle}</strong>, and you have connections there:</p>
        <p style="font-size:14px;color:#3b82f6;font-weight:600;margin:12px 0;">${names}${extra}</p>
        <p class="text">Consider reaching out for a referral before applying.</p>
        <div class="btn-row">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">View Job</a>
        </div>
      </div>
    `),
    sms_text: `Brilliant Jobs: ${connectionNames.length} connections at ${company} which just posted ${jobTitle}. Check your dashboard for details.`,
  };
}

// ================================================================
// DIGEST TEMPLATES
// ================================================================

interface DigestSection {
  title: string;
  count: number;
  items: string[]; // pre-formatted HTML strings
}

export function dailyDigestEmail(sections: DigestSection[], date: string): { subject: string; html: string } {
  const totalCount = sections.reduce((sum, s) => sum + s.count, 0);
  const sectionHtml = sections.filter(s => s.count > 0).map(s => `
    <div style="margin-bottom:20px;">
      <div style="font-size:14px;font-weight:700;color:#f0f1f3;margin-bottom:8px;">${s.title} <span class="badge badge-blue">${s.count}</span></div>
      ${s.items.slice(0, 5).join("")}
      ${s.items.length > 5 ? `<p class="text" style="font-size:12px;">+ ${s.items.length - 5} more in your dashboard</p>` : ""}
    </div>
  `).join('<hr class="divider">');

  return {
    subject: `Daily digest: ${totalCount} updates — ${date}`,
    html: baseLayout("Daily Digest", `
      <div class="card">
        <div class="card-title">Daily Digest</div>
        <p class="card-sub">${date} &middot; ${totalCount} updates</p>
        ${sectionHtml}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}" class="btn btn-primary">Open Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function weeklySummaryEmail(stats: {
  applied: number;
  autoApplied: number;
  notificationApplied: number;
  passed: number;
  missed: number;
  responses: number;
  interviews: number;
  offers: number;
  ghosted: number;
  newJobs: number;
  weekLabel: string;
  stories?: Array<{ headline: string; lede: string; category: string; slug: string }>;
}): { subject: string; html: string } {
  const catColors: Record<string, string> = {
    salary: "#22c55e", location: "#3b82f6", remote: "#8b5cf6",
    company: "#f97316", trend: "#14b8a6", milestone: "#eab308",
  };

  const storiesHtml = stats.stories && stats.stories.length > 0 ? `
        <div style="margin-top:24px;padding-top:20px;border-top:1px solid #2a2d35;">
          <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">This Week's Market Insights</div>
          ${stats.stories.map(s => {
            const color = catColors[s.category] || "#6366f1";
            return `<div style="margin-bottom:16px;padding:12px;background:#1a1d27;border:1px solid #2a2d35;border-radius:8px;">
              <span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;background:${color};color:#fff;">${s.category}</span>
              <div style="font-size:14px;font-weight:600;color:#f0f1f3;margin:6px 0 4px;line-height:1.35;">${s.headline}</div>
              <div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-bottom:8px;">${s.lede ? s.lede.substring(0, 120) + (s.lede.length > 120 ? '…' : '') : ''}</div>
              <a href="https://brilliantjobs.app/blog/${s.slug}" style="font-size:12px;color:#818cf8;text-decoration:none;font-weight:600;">Read more →</a>
            </div>`;
          }).join("")}
          <div style="text-align:center;margin-top:8px;">
            <a href="https://brilliantjobs.app/blog" style="font-size:13px;color:#818cf8;text-decoration:none;">Browse all insights →</a>
          </div>
        </div>` : "";

  return {
    subject: `Weekly summary: ${stats.applied} applications — ${stats.weekLabel}`,
    html: baseLayout("Weekly Summary", `
      <div class="card">
        <div class="card-title">Weekly Summary</div>
        <p class="card-sub">${stats.weekLabel}</p>
        
        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Applications</div>
          ${detailRow("Total applied", String(stats.applied))}
          ${detailRow("Auto-applied", String(stats.autoApplied))}
          ${detailRow("Via notification", String(stats.notificationApplied))}
          ${detailRow("Passed", String(stats.passed))}
          ${detailRow("Missed", String(stats.missed))}
        </div>

        <div style="margin-bottom:16px;">
          <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Pipeline</div>
          ${detailRow("Responses received", String(stats.responses))}
          ${detailRow("Interviews", String(stats.interviews))}
          ${detailRow("Offers", String(stats.offers))}
          ${detailRow("Ghosted", String(stats.ghosted))}
        </div>

        <div>
          <div style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">Market</div>
          ${detailRow("New jobs this week", String(stats.newJobs))}
        </div>

        ${storiesHtml}

        <div class="btn-row" style="margin-top:24px;">
          <a href="${DASHBOARD_URL}#stats" class="btn btn-primary">View Full Stats</a>
        </div>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════
// v2 TEMPLATES — Credit/Billing
// ═══════════════════════════════════════════════════

export function creditLowEmail(
  creditsRemaining: number,
  totalCredits: number,
  plan: string
): { subject: string; html: string } {
  return {
    subject: `You have ${creditsRemaining} credits remaining this month`,
    html: baseLayout("Credits Running Low", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Credits running low</div>
      <p style="color:#94a3b8;line-height:1.6;">You've used ${totalCredits - creditsRemaining} of your ${totalCredits} monthly credits. At your current pace, you'll run out before the end of the month.</p>
      <p style="color:#94a3b8;line-height:1.6;">Enable auto-refill to keep AI scoring, boolean search, and other credit-based features running without interruption.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#settings" class="btn btn-primary">Enable Auto-Refill</a>
        ${plan === "starter" ? `<a href="${DASHBOARD_URL}#billing" class="btn btn-secondary">Upgrade to Pro</a>` : ""}
      </div>
    `),
  };
}

export function autoRefillSuccessEmail(
  amount: string,
  creditsAdded: number,
  newBalance: number
): { subject: string; html: string } {
  return {
    subject: `Auto-refill: ${creditsAdded} credits added to your account`,
    html: baseLayout("Auto-Refill Triggered", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Credits replenished</div>
      <p style="color:#94a3b8;line-height:1.6;">Your auto-refill triggered: ${amount} charged for ${creditsAdded} credits. Your new balance is ${newBalance} credits.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#settings" class="btn btn-primary">Manage Auto-Refill</a>
      </div>
    `),
  };
}

export function autoRefillFailedEmail(reason: string): { subject: string; html: string } {
  return {
    subject: "Auto-refill failed — update your payment method",
    html: baseLayout("Auto-Refill Failed", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Auto-refill couldn't process</div>
      <p style="color:#94a3b8;line-height:1.6;">Your auto-refill failed: ${reason}. Update your payment method to keep credit-based features running.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#billing" class="btn btn-primary">Update Payment Method</a>
      </div>
    `),
  };
}

export function creditExhaustedEmail(
  plan: string,
  totalCredits: number
): { subject: string; html: string } {
  const upgradeTarget = plan === "starter" ? "Pro ($40/mo, 300 credits)" : null;
  return {
    subject: `You've used all ${totalCredits} credits this month`,
    html: baseLayout("Credits Exhausted", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Credits used up</div>
      <p style="color:#94a3b8;line-height:1.6;">You've used all ${totalCredits} monthly credits. AI scoring, boolean search, and other credit-based features are paused until your credits reset next billing cycle.</p>
      <p style="color:#94a3b8;line-height:1.6;">Buy a one-time top-up or enable auto-refill to resume immediately.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#billing" class="btn btn-primary">Buy Credits</a>
        ${upgradeTarget ? `<a href="${DASHBOARD_URL}#billing" class="btn btn-secondary">Upgrade to ${upgradeTarget}</a>` : ""}
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════
// v2 TEMPLATES — Upgrade Triggers
// ═══════════════════════════════════════════════════

export function upgradeStarterEmail(
  trigger: string,
  featureBlocked: string
): { subject: string; html: string } {
  return {
    subject: `Unlock ${featureBlocked} with Starter — $20/mo`,
    html: baseLayout("Upgrade to Starter", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">You need more than one search.</div>
      <p style="color:#94a3b8;line-height:1.6;">${trigger}</p>
      <p style="color:#94a3b8;line-height:1.6;">Starter includes: up to 5 saved filters, boolean search operators, 100 monthly credits for AI scoring, and priority email support.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#billing" class="btn btn-primary">Upgrade to Starter — $20/mo</a>
        <a href="${DASHBOARD_URL}#billing" class="btn btn-secondary">Compare All Plans</a>
      </div>
    `),
  };
}

export function upgradeProEmail(
  trigger: string
): { subject: string; html: string } {
  return {
    subject: "Move faster with Pro — SMS alerts, 300 credits",
    html: baseLayout("Upgrade to Pro", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Your search deserves Pro.</div>
      <p style="color:#94a3b8;line-height:1.6;">${trigger}</p>
      <p style="color:#94a3b8;line-height:1.6;">Pro includes: unlimited filters, SMS escalation alerts, 300 monthly credits, AI-powered insights in digests, and apply-on-notification with direct-apply links.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#billing" class="btn btn-primary">Upgrade to Pro — $40/mo</a>
        <a href="${DASHBOARD_URL}#billing" class="btn btn-secondary">Compare Plans</a>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════
// v2 TEMPLATES — Resume Intelligence
// ═══════════════════════════════════════════════════

export function resumeDecayEmail(
  filterName: string,
  oldGrade: string,
  newGrade: string,
  missingTerms: string[]
): { subject: string; html: string } {
  return {
    subject: `Resume readiness dropped: ${filterName} (${oldGrade} → ${newGrade})`,
    html: baseLayout("Resume Readiness Drop", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Your resume score dropped</div>
      <p style="color:#94a3b8;line-height:1.6;">Your resume's readiness grade for "${filterName}" dropped from ${oldGrade} to ${newGrade}. New jobs in this filter are looking for keywords your resume doesn't cover well.</p>
      ${missingTerms.length > 0 ? `<p style="color:#94a3b8;line-height:1.6;">Missing terms: ${missingTerms.slice(0, 8).join(", ")}</p>` : ""}
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#resumes" class="btn btn-primary">Update Resume</a>
        <a href="${DASHBOARD_URL}#resumes" class="btn btn-secondary">View Full Analysis</a>
      </div>
    `),
  };
}

export function resumeImproveEmail(
  filterName: string,
  oldGrade: string,
  newGrade: string
): { subject: string; html: string } {
  return {
    subject: `Resume readiness improved: ${filterName} (${oldGrade} → ${newGrade})`,
    html: baseLayout("Resume Readiness Improved", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">Your resume score improved</div>
      <p style="color:#94a3b8;line-height:1.6;">Your resume's readiness grade for "${filterName}" improved from ${oldGrade} to ${newGrade}. You're a stronger match for jobs in this filter now.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#jobs" class="btn btn-primary">View Matching Jobs</a>
      </div>
    `),
  };
}

export function exclusionOverrideEmail(
  company: string,
  jobTitle: string,
  filterName: string
): { subject: string; html: string } {
  return {
    subject: `Excluded company match: ${jobTitle} at ${company}`,
    html: baseLayout("Excluded Company Match", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">An excluded company posted a match</div>
      <p style="color:#94a3b8;line-height:1.6;">${company} posted "${jobTitle}" which matches your "${filterName}" filter, but ${company} is on your exclusion list. We're flagging it in case you want to reconsider.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#jobs" class="btn btn-primary">View Job</a>
        <a href="${DASHBOARD_URL}#tuning" class="btn btn-secondary">Edit Exclusions</a>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════
// v2 TEMPLATES — Re-engagement & SEO
// ═══════════════════════════════════════════════════

export function reengagementEmail(
  daysSince: number,
  matchedCount: number,
  expiredCount: number
): { subject: string; html: string } {
  return {
    subject: `${expiredCount} jobs matched and expired while you were away`,
    html: baseLayout("We've been busy. Have you?", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">We've been busy. Have you?</div>
      <p style="color:#94a3b8;line-height:1.6;">In the ${daysSince} days since your last visit:</p>
      <p style="color:#94a3b8;line-height:1.6;">• ${matchedCount} jobs matched your filters<br>• ${expiredCount} of those closed before you saw them</p>
      <p style="color:#94a3b8;line-height:1.6;">Your filters are still running. Don't let the next wave pass.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}" class="btn btn-primary">Open Dashboard</a>
        <a href="${DASHBOARD_URL}#settings" class="btn btn-secondary">Pause Notifications</a>
      </div>
    `),
  };
}

export function seoNurtureEmail(
  dataType: string,
  roleCategory: string
): { subject: string; html: string } {
  return {
    subject: `The ${dataType} you were looking at — there's more inside`,
    html: baseLayout("You looked at the data. Now use it.", `
      <div style="font-size:15px;font-weight:700;margin-bottom:8px;">You looked at the data. Now use it.</div>
      <p style="color:#94a3b8;line-height:1.6;">You were browsing ${dataType} for ${roleCategory} roles. Here's what a free Brilliant Jobs account unlocks:</p>
      <p style="color:#94a3b8;line-height:1.6;">• Full salary ranges with seniority breakdown<br>• Real-time job matching across 10,000+ company hiring pages<br>• Resume readiness scoring against live job descriptions<br>• Pipeline tracking with ghost detection</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}" class="btn btn-primary">Create Free Account</a>
        <a href="https://brilliantjobs.app/salary-data" class="btn btn-secondary">See More Data</a>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════════════
// APPLY WORKFLOW NOTIFICATION TEMPLATES (D6 — v4.85)
// 7 types from Pod 2 handoff spec (Section 9)
// autoApplyConfirmEmail already exists above as apply_auto_submitted
// applyAlertEmail already exists above
// ═══════════════════════════════════════════════════════════

export function applyAutoSkippedEmail(
  jobTitle: string, company: string, score: number, threshold: number
): { subject: string; html: string } {
  return {
    subject: `Skipped: ${jobTitle} at ${company} (score ${score})`,
    html: baseLayout("Auto-Apply Skipped", `
      <div class="card">
        <div class="card-title">Auto-Apply Skipped</div>
        <p class="text">A job was skipped because it scored below your threshold:</p>
        ${detailRow("Role", jobTitle)}
        ${detailRow("Company", company)}
        ${detailRow("Match Score", `<span class="badge badge-amber">${score}/100</span>`)}
        ${detailRow("Your Threshold", `${threshold}/100`)}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#jobs" class="btn btn-primary">View Job</a>
          <a href="${DASHBOARD_URL}#applications" class="btn btn-gray">Adjust Settings</a>
        </div>
      </div>
    `),
  };
}

export function applyRewritePendingEmail(
  jobTitle: string, company: string, beforeScore: number, afterScore: number, changeSummary: string
): { subject: string; html: string; sms_text: string } {
  const improvement = afterScore - beforeScore;
  return {
    subject: `Rewrite ready: ${jobTitle} at ${company} (+${improvement} pts)`,
    html: baseLayout("Rewrite Pending Approval", `
      <div class="card">
        <div class="card-title">Resume Rewrite Ready</div>
        <p class="text">Your AI-rewritten resume is ready for review:</p>
        ${detailRow("Role", jobTitle)}
        ${detailRow("Company", company)}
        ${detailRow("Score Before", `${beforeScore}`)}
        ${detailRow("Score After", `<span class="badge badge-green">${afterScore} (+${improvement})</span>`)}
        <hr class="divider">
        <p class="text" style="font-size:12px;"><strong>Changes:</strong> ${changeSummary}</p>
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#applications" class="btn btn-green">Review & Submit</a>
          <a href="${DASHBOARD_URL}#applications" class="btn btn-gray">Submit Original</a>
        </div>
      </div>
    `),
    sms_text: `Brilliant Jobs: Resume rewritten for ${jobTitle} at ${company} (${beforeScore}→${afterScore}). Review in app.`,
  };
}

export function applyRewriteSubmittedEmail(
  jobTitle: string, company: string, score: number
): { subject: string; html: string } {
  return {
    subject: `Applied (rewritten): ${jobTitle} at ${company}`,
    html: baseLayout("Rewritten Resume Submitted", `
      <div class="card">
        <div class="card-title">Rewritten Resume Submitted</div>
        <p class="text">Your AI-optimized resume was automatically submitted:</p>
        ${detailRow("Role", jobTitle)}
        ${detailRow("Company", company)}
        ${detailRow("Match Score", `<span class="badge badge-green">${score}/100</span>`)}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View in Pipeline</a>
        </div>
      </div>
    `),
  };
}

export function applyFailedNoResumeEmail(
  jobTitle: string, company: string
): { subject: string; html: string } {
  return {
    subject: `Action needed: No resume for ${jobTitle} at ${company}`,
    html: baseLayout("Apply Failed — No Resume", `
      <div class="card">
        <div class="card-title" style="color:#ef4444;">Application Failed</div>
        <p class="text">We couldn't submit your application because no resume was found:</p>
        ${detailRow("Role", jobTitle)}
        ${detailRow("Company", company)}
        ${detailRow("Reason", `<span class="badge badge-red">No resume uploaded</span>`)}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#resumes" class="btn btn-primary">Upload Resume</a>
          <a href="${DASHBOARD_URL}#applications" class="btn btn-gray">View Queue</a>
        </div>
      </div>
    `),
  };
}

export function applyBulkCompleteEmail(
  totalSubmitted: number, totalSkipped: number, totalFailed: number
): { subject: string; html: string; sms_text: string } {
  const total = totalSubmitted + totalSkipped + totalFailed;
  return {
    subject: `Bulk apply complete: ${totalSubmitted}/${total} submitted`,
    html: baseLayout("Bulk Apply Complete", `
      <div class="card">
        <div class="card-title">Bulk Apply Complete</div>
        <p class="text">Your auto-apply batch has finished processing:</p>
        ${detailRow("Submitted", `<span class="badge badge-green">${totalSubmitted}</span>`)}
        ${totalSkipped > 0 ? detailRow("Skipped (below threshold)", `<span class="badge badge-amber">${totalSkipped}</span>`) : ""}
        ${totalFailed > 0 ? detailRow("Failed", `<span class="badge badge-red">${totalFailed}</span>`) : ""}
        ${detailRow("Total Processed", `${total}`)}
        <div class="btn-row" style="margin-top:20px;">
          <a href="${DASHBOARD_URL}#pipeline" class="btn btn-primary">View Pipeline</a>
          ${totalFailed > 0 ? `<a href="${DASHBOARD_URL}#applications" class="btn btn-red">Retry Failed</a>` : ""}
        </div>
      </div>
    `),
    sms_text: `Brilliant Jobs: Bulk apply done — ${totalSubmitted} submitted, ${totalSkipped} skipped, ${totalFailed} failed.`,
  };
}

// ---- Leaderboard Reward Notification (Phase 2) ----
interface LeaderboardRewardEmailParams {
  displayName: string;
  rank: number;
  credits: number;
  proDays: number;
  periodType: string;
  periodLabel: string;
}

export function leaderboardRewardEmail(params: LeaderboardRewardEmailParams): string {
  const { displayName, rank, credits, proDays, periodType, periodLabel } = params;
  const rankLabel = rank === 1 ? "#1" : rank <= 3 ? `#${rank}` : rank <= 10 ? `#${rank}` : `Top ${periodType === "weekly" ? "10" : "25"}%`;
  const rewardParts: string[] = [];
  if (credits > 0) rewardParts.push(`<span class="badge badge-blue">${credits} credits</span>`);
  if (proDays > 0) rewardParts.push(`<span class="badge badge-green">${proDays} days Pro</span>`);

  return baseLayout("Leaderboard Reward", `
    <div class="card">
      <div class="card-title">You earned leaderboard rewards</div>
      <p class="card-sub">Hey ${displayName}, you ranked <strong>${rankLabel}</strong> on the ${periodType} referral leaderboard ${periodLabel}.</p>
      ${detailRow("Rank", `<strong>${rankLabel}</strong>`)}
      ${detailRow("Referral period", periodLabel)}
      ${credits > 0 ? detailRow("Credits earned", `<span class="mono">${credits}</span>`) : ""}
      ${proDays > 0 ? detailRow("Pro time earned", `<span class="mono">${proDays} days</span>`) : ""}
      <hr class="divider" />
      <p class="text">Your rewards are already applied to your account. Keep referring to climb the leaderboard next ${periodType === "weekly" ? "week" : "month"}.</p>
      <div class="btn-row">
        <a href="${DASHBOARD_URL}#referrals" class="btn btn-primary">View Leaderboard</a>
      </div>
    </div>
  `);
}
// White theme email templates — Session 3+ (onboarding, integration adoption)
// Appended to _shared/email-templates.ts
// Pod 1 copy injection pending — placeholder content marked with [POD1_COPY]

// ---- White Theme Base Layout ----
function whiteBaseLayout(title: string, bodyHtml: string, footerExtra?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { margin:0; padding:0; background:#f8fafc; font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color:#1e293b; }
  .wrapper { max-width:560px; margin:0 auto; padding:32px 20px; }
  .header { text-align:center; padding-bottom:24px; border-bottom:1px solid #e2e8f0; margin-bottom:24px; }
  .brand { font-size:20px; font-weight:700; color:#1e293b; text-decoration:none; letter-spacing:-0.3px; }
  .brand span { color:#3b82f6; }
  .card { background:#ffffff; border:1px solid #e2e8f0; border-radius:14px; padding:28px; margin-bottom:20px; box-shadow:0 1px 3px rgba(0,0,0,0.06); }
  .card-title { font-size:18px; font-weight:700; margin:0 0 8px; color:#1e293b; }
  .card-sub { font-size:14px; color:#64748b; line-height:1.5; margin:0 0 20px; }
  .text { font-size:14px; color:#475569; line-height:1.6; margin:0 0 16px; }
  .btn { display:inline-block; padding:12px 28px; border-radius:10px; font-size:14px; font-weight:600; text-decoration:none; text-align:center; }
  .btn-primary { background:#3b82f6; color:#ffffff !important; }
  .btn-green { background:#22c55e; color:#ffffff !important; }
  .btn-gray { background:#f1f5f9; color:#475569 !important; border:1px solid #e2e8f0; }
  .btn-row { text-align:center; margin:24px 0; }
  .btn-row .btn { margin:0 6px 8px; }
  .divider { border:none; border-top:1px solid #e2e8f0; margin:20px 0; }
  .step-row { display:flex; align-items:flex-start; margin-bottom:16px; }
  .step-num { width:28px; height:28px; border-radius:50%; background:#3b82f6; color:#fff; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-right:12px; margin-top:2px; }
  .step-done { background:#22c55e; }
  .step-text { font-size:14px; color:#1e293b; line-height:1.5; }
  .step-text small { display:block; color:#64748b; font-size:12px; margin-top:2px; }
  .stat-row { display:flex; justify-content:space-around; text-align:center; margin:20px 0; }
  .stat-item .stat-val { font-size:24px; font-weight:700; color:#3b82f6; }
  .stat-item .stat-label { font-size:11px; color:#94a3b8; margin-top:2px; }
  .highlight { background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:16px; margin:16px 0; }
  .footer { text-align:center; padding-top:24px; border-top:1px solid #e2e8f0; margin-top:24px; }
  .footer p { font-size:11px; color:#94a3b8; margin:4px 0; }
  .footer a { color:#3b82f6; text-decoration:none; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <a href="https://brilliantjobs.app" class="brand"><span>Brilliant</span> Jobs</a>
  </div>
  ${bodyHtml}
  <div class="footer">
    ${footerExtra || ""}
    <p><a href="https://brilliantjobs.app/dashboard.html#notifications">Notification preferences</a></p>
    <p>&copy; ${new Date().getFullYear()} Brilliant Jobs. All rights reserved.</p>
  </div>
</div>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════
// SESSION 3: ONBOARDING SEQUENCE EMAILS (White Theme)
// [POD1_COPY] markers indicate where Pod 1 copy will be injected
// ═══════════════════════════════════════════════════════════

export function onboardWelcomeEmail(userName?: string): { subject: string; html: string } {
  const greeting = userName ? `Welcome, ${userName}!` : "Welcome to Brilliant Jobs!";
  // [POD1_COPY] — Subject line, hero copy, value prop, 3-step quickstart, social proof stat
  return {
    subject: `${greeting} Your job search just got smarter`,
    html: whiteBaseLayout("Welcome to Brilliant Jobs", `
      <div class="card">
        <div class="card-title">${greeting}</div>
        <p class="card-sub">You now have access to the most transparent job search platform on the market. Here's how to get the most out of it.</p>

        <div class="step-row">
          <div class="step-num">1</div>
          <div class="step-text">
            <strong>Upload your resume</strong>
            <small>Get match scores for every job and unlock AI-powered suggestions.</small>
          </div>
        </div>

        <div class="step-row">
          <div class="step-num">2</div>
          <div class="step-text">
            <strong>Create your first filter</strong>
            <small>Tell us what you're looking for — role, location, salary, remote preference.</small>
          </div>
        </div>

        <div class="step-row">
          <div class="step-num">3</div>
          <div class="step-text">
            <strong>Install the Chrome extension</strong>
            <small>See which connections work at companies in your feed.</small>
          </div>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-primary">Get Started</a>
        </div>
      </div>

      <div class="highlight">
        <p class="text" style="margin:0; text-align:center;">
          <strong>320,000+</strong> jobs tracked across <strong>7,500+</strong> company boards — updated daily.
        </p>
      </div>
    `),
  };
}

export function onboardResumeNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Subject line, benefit copy, sample match comparison, CTA
  return {
    subject: "Your resume unlocks match scores for every job",
    html: whiteBaseLayout("Upload Your Resume", `
      <div class="card">
        <div class="card-title">Hey ${name}, one quick step</div>
        <p class="card-sub">Upload your resume and every job in your feed gets a match score — so you know exactly where to focus.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>With a resume:</strong> See match percentages, skills gaps, and AI scoring (Pro).<br>
            <strong>Without:</strong> You're browsing blind.
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#resumes" class="btn btn-primary">Upload Resume</a>
        </div>
      </div>
    `),
  };
}

export function onboardFilterNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Subject line, filter power explanation, example filter with results count, CTA
  return {
    subject: "Create a filter — jobs come to you",
    html: whiteBaseLayout("Create Your First Filter", `
      <div class="card">
        <div class="card-title">Hey ${name}, stop scrolling — let jobs find you</div>
        <p class="card-sub">Set up a filter with your criteria and we'll deliver matching jobs straight to your feed and inbox. No more manual searching.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>Example:</strong> "Product Manager" + "Remote" + "$120K+" = <strong>47 live matches right now</strong>
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#jobs" class="btn btn-primary">Create Your Filter</a>
        </div>
      </div>
    `),
  };
}

export function onboardExtensionNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Subject line, network intelligence pitch, connections example, privacy, CTA
  return {
    subject: "See who you know at every company hiring",
    html: whiteBaseLayout("Install the Chrome Extension", `
      <div class="card">
        <div class="card-title">Hey ${name}, unlock your network advantage</div>
        <p class="card-sub">Our Chrome extension shows which of your LinkedIn connections work at companies in your job feed. Referrals are the #1 way to get hired.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            Your connections data stays on your device. We never store or share your LinkedIn network.
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#extension" class="btn btn-primary">Install Extension</a>
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-gray">Maybe Later</a>
        </div>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════════════
// SESSION 4: INTEGRATION ADOPTION EMAILS (White Theme)
// [POD1_COPY] markers indicate where Pod 1 copy will be injected
// ═══════════════════════════════════════════════════════════

export function adoptExtensionReminderEmail(userName?: string, context?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Context-specific copy based on milestone trigger
  return {
    subject: "You're missing connections at companies in your feed",
    html: whiteBaseLayout("Connect Your Network", `
      <div class="card">
        <div class="card-title">Hey ${name}, you're searching without your network</div>
        <p class="card-sub">${context || "You've been active on the platform — but without the Chrome extension, you can't see which connections work at companies you're interested in."}</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#extension" class="btn btn-primary">Install Extension</a>
        </div>
      </div>
    `),
  };
}

export function adoptGmailEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Pipeline-triggered, privacy-first
  return {
    subject: "Auto-detect interview invites and responses",
    html: whiteBaseLayout("Connect Gmail", `
      <div class="card">
        <div class="card-title">Hey ${name}, let us track responses for you</div>
        <p class="card-sub">You have applications in your pipeline. Connect Gmail and we'll automatically detect when companies respond — no more manual status updates.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>Privacy first:</strong> We only scan sender domains and subject lines. We never read email bodies.
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Connect Gmail</a>
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-gray">Not Now</a>
        </div>
      </div>
    `),
  };
}

export function adoptCalendarEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Interview-triggered
  return {
    subject: "Never miss an interview — connect your calendar",
    html: whiteBaseLayout("Connect Calendar", `
      <div class="card">
        <div class="card-title">Hey ${name}, interviews ahead?</div>
        <p class="card-sub">Connect Google Calendar and we'll send you interview prep reminders with company insights, talking points from the job description, and countdown alerts.</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Connect Calendar</a>
        </div>
      </div>
    `),
  };
}

export function adoptDriveEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  // [POD1_COPY] — Resume-triggered
  return {
    subject: "Keep your resumes synced with Google Drive",
    html: whiteBaseLayout("Connect Google Drive", `
      <div class="card">
        <div class="card-title">Hey ${name}, auto-sync your resumes</div>
        <p class="card-sub">You've uploaded a resume. Connect Google Drive to keep your latest versions automatically synced — edit in Docs, apply with the latest version.</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Connect Drive</a>
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-gray">Skip</a>
        </div>
      </div>
    `),
  };
}

export function adoptIntegrationComboEmail(
  userName?: string,
  connected: string[] = [],
  missing: string[] = []
): { subject: string; html: string } {
  const name = userName || "there";
  const pct = Math.round((connected.length / (connected.length + missing.length)) * 100);
  // [POD1_COPY] — 30-day comprehensive setup recap
  return {
    subject: `You're ${pct}% set up — here's what you're missing`,
    html: whiteBaseLayout("Complete Your Setup", `
      <div class="card">
        <div class="card-title">Hey ${name}, your setup is ${pct}% complete</div>
        <p class="card-sub">Here's a quick look at what's connected and what's still available.</p>

        ${connected.map(c => `
          <div class="step-row">
            <div class="step-num step-done">✓</div>
            <div class="step-text"><strong>${c}</strong> <small>Connected</small></div>
          </div>
        `).join("")}

        ${missing.map(m => `
          <div class="step-row">
            <div class="step-num" style="background:#e2e8f0;color:#64748b;">—</div>
            <div class="step-text"><strong>${m}</strong> <small>Not connected</small></div>
          </div>
        `).join("")}

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Complete Setup</a>
        </div>
      </div>
    `),
  };
}
