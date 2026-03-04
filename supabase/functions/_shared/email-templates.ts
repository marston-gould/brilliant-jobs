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
// Pod 1 copy: PRODUCTION — Batch 1-2 delivered 2026-03-01, white theme APPROVED

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
// Pod 1 copy: PRODUCTION — Batch 1 delivered 2026-03-01
// White theme design: APPROVED — v6.02
// ═══════════════════════════════════════════════════════════

export function onboardWelcomeEmail(userName?: string): { subject: string; html: string } {
  const greeting = userName ? `${userName}, welcome aboard` : "Welcome to Brilliant Jobs";
  const name = userName || "there";
  return {
    subject: userName ? `${userName}, your job search just got an unfair advantage` : "Your job search just got an unfair advantage",
    html: whiteBaseLayout("Welcome to Brilliant Jobs", `
      <div class="card">
        <div class="card-title">${greeting}</div>
        <p class="card-sub">You just joined the only job search platform that pulls data directly from company hiring systems — not scraped listings, not crowd-sourced guesses. Real jobs, real salaries, real-time status.</p>

        <p class="text">Three steps to get the most out of your account:</p>

        <div class="step-row">
          <div class="step-num">1</div>
          <div class="step-text">
            <strong>Upload your resume</strong>
            <small>Every job in your feed gets a match score — see exactly where you're a strong fit and where there are gaps.</small>
          </div>
        </div>

        <div class="step-row">
          <div class="step-num">2</div>
          <div class="step-text">
            <strong>Create a saved filter</strong>
            <small>Set your criteria once. We monitor 7,500+ company boards and surface matches as they appear.</small>
          </div>
        </div>

        <div class="step-row">
          <div class="step-num">3</div>
          <div class="step-text">
            <strong>Connect the Chrome extension</strong>
            <small>See which of your LinkedIn connections already work at companies in your feed — referrals are still the #1 path to interviews.</small>
          </div>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-primary">Open Your Dashboard</a>
        </div>
      </div>

      <div class="highlight">
        <p class="text" style="margin:0; text-align:center;">
          <strong>320,000+</strong> jobs tracked across <strong>7,500+</strong> company boards.<br>
          Updated every 10 minutes. Ghost jobs flagged automatically.
        </p>
      </div>
    `),
  };
}

export function onboardResumeNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Quick win: upload your resume and see what matches",
    html: whiteBaseLayout("Upload Your Resume", `
      <div class="card">
        <div class="card-title">Hey ${name}, one step changes everything</div>
        <p class="card-sub">Right now, you're browsing jobs without context. Upload your resume and every listing in your feed gets a match score — so you can stop guessing and start focusing on the roles where you're genuinely competitive.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>What changes with a resume on file:</strong><br>
            ✓ Match percentage on every job listing<br>
            ✓ Skills gap analysis showing what's missing<br>
            ✓ AI-powered resume scoring against specific roles (Pro)
          </p>
        </div>

        <p class="text">It takes about 30 seconds. PDF or Word — we handle both.</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#resumes" class="btn btn-primary">Upload Resume</a>
        </div>
      </div>
    `),
  };
}

export function onboardFilterNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Stop refreshing job boards — let matches come to you",
    html: whiteBaseLayout("Create Your First Filter", `
      <div class="card">
        <div class="card-title">Hey ${name}, set it once and we do the rest</div>
        <p class="card-sub">A saved filter monitors 7,500+ company boards around the clock. When something matches your criteria — role, location, salary, remote preference — it shows up in your feed and can trigger instant alerts.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>Example:</strong> "Product Manager" + "Remote" + "$120K+" pulls <strong>47 live matches</strong> right now from companies like Stripe, Notion, and Figma — sourced directly from their ATS systems.
          </p>
        </div>

        <p class="text">Most users create their first filter in under a minute.</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#jobs" class="btn btn-primary">Create a Filter</a>
        </div>
      </div>
    `),
  };
}

export function onboardExtensionNudgeEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Your LinkedIn network is a hidden advantage — use it",
    html: whiteBaseLayout("Install the Chrome Extension", `
      <div class="card">
        <div class="card-title">Hey ${name}, see who you know at every company hiring</div>
        <p class="card-sub">Employee referrals are still the single most effective way to land interviews. Our Chrome extension maps your LinkedIn connections to companies in your job feed — so you always know when you have an inside track.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>How it works:</strong> The extension scans your LinkedIn connections locally on your device. We never store, upload, or share your network data. Your connections stay yours.
          </p>
        </div>

        <p class="text">Once installed, every company in your feed shows a connection count. Tap it to see names and roles — then reach out directly.</p>

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
// Pod 1 copy: PRODUCTION — Batch 2 delivered 2026-03-01
// ═══════════════════════════════════════════════════════════

export function adoptExtensionReminderEmail(userName?: string, context?: string): { subject: string; html: string } {
  const name = userName || "there";
  const contextCopy = context || "You've been exploring roles and building your pipeline — but without the Chrome extension, you can't see which of your LinkedIn connections work at those companies. That's a blind spot.";
  return {
    subject: "You're applying without your network — here's the fix",
    html: whiteBaseLayout("Connect Your Network", `
      <div class="card">
        <div class="card-title">Hey ${name}, you're missing connection data</div>
        <p class="card-sub">${contextCopy}</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>Why it matters:</strong> Referred candidates are 4x more likely to be hired. The extension takes 30 seconds to install and works quietly in the background.
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#extension" class="btn btn-primary">Install Extension</a>
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-gray">Not Interested</a>
        </div>
      </div>
    `),
  };
}

export function adoptGmailEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "You have active applications — let us track responses automatically",
    html: whiteBaseLayout("Connect Gmail", `
      <div class="card">
        <div class="card-title">Hey ${name}, stop checking your inbox manually</div>
        <p class="card-sub">You have applications in your pipeline. Connect Gmail and we'll automatically detect interview invites, rejection notices, and next-step emails — then update your pipeline in real time.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>Privacy by design:</strong> We only read sender domains and subject lines to detect signals. We never access email bodies, attachments, or non-hiring-related messages. You can disconnect at any time.
          </p>
        </div>

        <p class="text">No more manual pipeline updates. No more missed responses sitting in your inbox.</p>

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
  return {
    subject: "Interview coming up? Get prep reminders automatically",
    html: whiteBaseLayout("Connect Calendar", `
      <div class="card">
        <div class="card-title">Hey ${name}, never walk into an interview cold</div>
        <p class="card-sub">It looks like you may have interviews on the horizon. Connect Google Calendar and we'll send you prep reminders — 24 hours and 1 hour before each interview — loaded with company context, talking points from the job description, and your match analysis.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>What you get:</strong> Company overview, your application history, key skills from the JD to emphasize, and a confidence check on how your resume stacks up.
          </p>
        </div>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Connect Calendar</a>
          <a href="https://brilliantjobs.app/dashboard.html" class="btn btn-gray">Skip for Now</a>
        </div>
      </div>
    `),
  };
}

export function adoptDriveEmail(userName?: string): { subject: string; html: string } {
  const name = userName || "there";
  return {
    subject: "Edit your resume in Docs, apply with the latest version — automatically",
    html: whiteBaseLayout("Connect Google Drive", `
      <div class="card">
        <div class="card-title">Hey ${name}, keep your resumes in sync</div>
        <p class="card-sub">You've already uploaded a resume — nice. Connect Google Drive and any edits you make in Google Docs will automatically sync here. No more re-uploading after every tweak.</p>

        <div class="highlight">
          <p class="text" style="margin:0;">
            <strong>How it works:</strong> Link your Drive folder. When you update a resume in Docs, the latest version is available for your next application. Match scores recalculate automatically.
          </p>
        </div>

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
  const total = connected.length + missing.length;
  const pct = total > 0 ? Math.round((connected.length / total) * 100) : 0;
  return {
    subject: `Your account is ${pct}% set up — finish in 2 minutes`,
    html: whiteBaseLayout("Complete Your Setup", `
      <div class="card">
        <div class="card-title">Hey ${name}, you're ${pct}% there</div>
        <p class="card-sub">You've been on the platform for a month now. Here's a quick snapshot of what's connected and what's still available — each integration adds a layer of intelligence to your search.</p>

        ${connected.map(c => `
          <div class="step-row">
            <div class="step-num step-done">✓</div>
            <div class="step-text"><strong>${c}</strong> <small>Connected — working for you</small></div>
          </div>
        `).join("")}

        ${missing.map(m => `
          <div class="step-row">
            <div class="step-num" style="background:#fef3c7;color:#92400e;">!</div>
            <div class="step-text"><strong>${m}</strong> <small>Not connected — you're missing data here</small></div>
          </div>
        `).join("")}

        <hr class="divider">
        <p class="text">Each integration takes under a minute. The more you connect, the less manual work you have to do — and the smarter your job search becomes.</p>

        <div class="btn-row">
          <a href="https://brilliantjobs.app/dashboard.html#integrations" class="btn btn-primary">Complete Setup</a>
        </div>
      </div>
    `),
  };
}

// ================================================================
// CV SCORE NOTIFICATION TEMPLATES (Session 5, v6.05)
// Batch 3 copy — score_high_match, score_medium_match, score_low_match
// Triggered by score-sequence Edge Function after resume scoring
// ================================================================

export function scoreHighMatchEmail(
  firstName?: string,
  score?: number,
  jobTitle?: string,
  companyName?: string,
  jobId?: string,
  strengths: string[] = []
): { subject: string; html: string } {
  const name = firstName || "there";
  const s = score || 0;
  const title = jobTitle || "this role";
  const company = companyName || "the company";
  const jid = jobId || "";

  const strengthsHtml = strengths.length > 0
    ? strengths.map(st => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;">
          <span style="color:#22c55e;font-weight:700;font-size:14px;">✓</span>
          <span style="font-size:13px;color:#94a3b8;line-height:1.4;">${st}</span>
        </div>
      `).join("")
    : "";

  return {
    subject: `Strong match: ${title} at ${company} (${s}% fit)`,
    html: whiteBaseLayout("Strong Match", `
      <div class="card">
        <div class="card-title">You're a strong match, ${name}.</div>
        <p class="card-sub">Your resume scored <strong style="color:#22c55e;font-size:16px;">${s}%</strong> against ${title} at ${company}. That puts you in the top tier of candidates for this role. Here's what stood out:</p>

        ${strengthsHtml ? `<div style="margin:16px 0;padding:16px;background:rgba(34,197,94,0.08);border-radius:10px;border:1px solid rgba(34,197,94,0.15);">${strengthsHtml}</div>` : ""}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#resume-score?job=${jid}" class="btn btn-primary">View Full Analysis</a>
          <a href="${DASHBOARD_URL}#apply?job=${jid}" class="btn btn-green">Apply Now</a>
        </div>

        <hr class="divider">
        <p style="font-size:12px;color:#64748b;text-align:center;margin:0;">Pro tip: Jobs with 80%+ match scores have 3x higher callback rates.</p>
      </div>
    `),
  };
}

export function scoreMediumMatchEmail(
  firstName?: string,
  score?: number,
  jobTitle?: string,
  companyName?: string,
  jobId?: string,
  gaps: Array<{ skill: string; recommendation: string }> = []
): { subject: string; html: string } {
  const name = firstName || "there";
  const s = score || 0;
  const title = jobTitle || "this role";
  const company = companyName || "the company";
  const jid = jobId || "";

  const gapsHtml = gaps.length > 0
    ? gaps.map(g => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(245,158,11,0.1);">
          <span style="color:#f59e0b;font-weight:700;font-size:14px;">⚠</span>
          <div>
            <div style="font-size:13px;color:#f0f1f3;font-weight:600;">${g.skill}</div>
            <div style="font-size:12px;color:#94a3b8;line-height:1.4;margin-top:2px;">${g.recommendation}</div>
          </div>
        </div>
      `).join("")
    : "";

  return {
    subject: `Good potential: ${title} at ${company} (${s}% fit)`,
    html: whiteBaseLayout("Good Potential", `
      <div class="card">
        <div class="card-title">You're close, ${name}. Let's close the gap.</div>
        <p class="card-sub">Your resume scored <strong style="color:#f59e0b;font-size:16px;">${s}%</strong> against ${title} at ${company}. You have solid alignment on the fundamentals, but there are specific areas where a targeted update could move you into the top tier:</p>

        ${gapsHtml ? `<div style="margin:16px 0;padding:16px;background:rgba(245,158,11,0.06);border-radius:10px;border:1px solid rgba(245,158,11,0.12);">${gapsHtml}</div>` : ""}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#resume-score?job=${jid}" class="btn btn-primary">See Improvement Plan</a>
          <a href="${DASHBOARD_URL}#resume-rewrite?job=${jid}" class="btn btn-gray">Optimize Resume</a>
        </div>

        <hr class="divider">
        <p style="font-size:12px;color:#64748b;text-align:center;margin:0;">Users who optimize based on score recommendations see an average 18-point score increase.</p>
      </div>
    `),
  };
}

export function scoreLowMatchEmail(
  firstName?: string,
  score?: number,
  jobTitle?: string,
  companyName?: string,
  jobId?: string,
  missingSkills: string[] = [],
  betterMatchCount?: number
): { subject: string; html: string } {
  const name = firstName || "there";
  const s = score || 0;
  const title = jobTitle || "this role";
  const company = companyName || "the company";
  const jid = jobId || "";
  const bmc = betterMatchCount || 0;

  const missingHtml = missingSkills.length > 0
    ? missingSkills.map(sk => `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;">
          <span style="color:#ef4444;font-weight:700;font-size:14px;">✗</span>
          <span style="font-size:13px;color:#94a3b8;line-height:1.4;">${sk}</span>
        </div>
      `).join("")
    : "";

  const betterMatchesHtml = bmc > 0
    ? `<div style="margin:16px 0;padding:16px;background:rgba(59,130,246,0.08);border-radius:10px;border:1px solid rgba(59,130,246,0.15);text-align:center;">
        <div style="font-size:14px;color:#f0f1f3;font-weight:600;">We found <strong style="color:#3b82f6;">${bmc}</strong> jobs where you score 70%+.</div>
        <a href="${DASHBOARD_URL}#feed?minScore=70" style="color:#3b82f6;font-size:13px;text-decoration:underline;margin-top:8px;display:inline-block;">See Better Matches →</a>
      </div>`
    : "";

  return {
    subject: `Resume insights: ${title} at ${company} (${s}% fit)`,
    html: whiteBaseLayout("Resume Insights", `
      <div class="card">
        <div class="card-title">Here's the honest read, ${name}.</div>
        <p class="card-sub">Your resume scored <strong style="color:#ef4444;font-size:16px;">${s}%</strong> against ${title} at ${company}. The core requirements for this role don't closely align with your current experience. That doesn't mean you can't get there — it means focusing your effort on roles where you'll be more competitive:</p>

        ${missingHtml ? `<div style="margin:16px 0;padding:16px;background:rgba(239,68,68,0.06);border-radius:10px;border:1px solid rgba(239,68,68,0.1);">${missingHtml}</div>` : ""}

        ${betterMatchesHtml}

        <div class="btn-row">
          <a href="${DASHBOARD_URL}#feed?minScore=70" class="btn btn-primary">View Higher-Match Jobs</a>
          <a href="${DASHBOARD_URL}#resume-score?job=${jid}" class="btn btn-gray">See Full Analysis</a>
        </div>

        <hr class="divider">
        <p style="font-size:12px;color:#64748b;text-align:center;margin:0;">Brilliant Jobs found you better matches. Focus where you'll win.</p>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════════════
// SESSION 6: INTERVIEW REMINDERS + RESUME REWRITE (White Theme)
// Pod 1 copy: PRODUCTION — Batch 4 delivered 2026-03-01
// White theme design: APPROVED
// ═══════════════════════════════════════════════════════════

export function interviewScheduledWhiteEmail(
  firstName?: string,
  companyName?: string,
  jobTitle?: string,
  interviewDate?: string,
  interviewTime?: string,
  timezone?: string,
  interviewFormat?: string,
  interviewLocation?: string,
  matchScore?: number,
  dashboardUrl?: string
): { subject: string; html: string; sms_text: string } {
  const name = firstName || "there";
  const company = companyName || "the company";
  const title = jobTitle || "the role";
  const date = interviewDate || "TBD";
  const time = interviewTime || "TBD";
  const tz = timezone || "your timezone";
  const format = interviewFormat || "Not specified";
  const location = interviewLocation || "";
  const score = matchScore || 0;
  const base = dashboardUrl || "https://brilliantjobs.app/dashboard.html";

  const locationHtml = location
    ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:80px;">Location</span><span style="font-size:13px;color:#1e293b;font-weight:600;">${location}</span></div>`
    : "";

  return {
    subject: `Interview confirmed: ${company} for ${title}`,
    html: whiteBaseLayout("Interview Confirmed", `
      <div class="card">
        <div class="card-title">Great news, ${name} — you have an interview coming up.</div>

        <div style="margin:20px 0;padding:20px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px;">${company} — ${title}</div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:80px;">Date</span><span style="font-size:13px;color:#1e293b;font-weight:600;">${date} at ${time} (${tz})</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:80px;">Format</span><span style="font-size:13px;color:#1e293b;font-weight:600;">${format}</span></div>
          ${locationHtml}
        </div>

        <p class="text">Your resume match score for this role is <strong style="color:#3b82f6;">${score}%</strong>. Review your resume readiness breakdown to make sure you're prepared for the skills they're likely to ask about.</p>

        <div style="margin:16px 0;">
          <div class="text" style="font-weight:600;margin-bottom:8px;">Preparation checklist:</div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Review the job description one more time</span></div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Check your resume readiness gaps for this filter</span></div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Research the company's recent hiring activity on Brilliant Jobs</span></div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Prepare questions that reference what you've learned about their team</span></div>
        </div>

        <p class="text" style="font-style:italic;color:#64748b;">You've done the hard work to get here. Now go show them why you're the right fit.</p>

        <div class="btn-row">
          <a href="${base}#pipeline?stage=interview" class="btn btn-primary">Review Interview Details →</a>
        </div>
      </div>
    `),
    sms_text: `Interview confirmed: ${title} at ${company}, ${date} at ${time}. Details in your dashboard.`,
  };
}

export function interviewReminder24hEmail(
  firstName?: string,
  companyName?: string,
  jobTitle?: string,
  interviewDate?: string,
  interviewTime?: string,
  timezone?: string,
  interviewFormat?: string,
  matchScore?: number,
  activeListings?: number,
  dashboardUrl?: string
): { subject: string; html: string; sms_text: string } {
  const name = firstName || "there";
  const company = companyName || "the company";
  const title = jobTitle || "the role";
  const date = interviewDate || "tomorrow";
  const time = interviewTime || "TBD";
  const tz = timezone || "your timezone";
  const format = interviewFormat || "Not specified";
  const score = matchScore || 0;
  const listings = activeListings || 0;
  const base = dashboardUrl || "https://brilliantjobs.app/dashboard.html";

  const listingsHtml = listings > 0
    ? `<div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">${company} has <strong>${listings}</strong> open roles right now, which suggests active growth</span></div>`
    : "";

  return {
    subject: `Tomorrow: ${title} interview at ${company}`,
    html: whiteBaseLayout("Interview Tomorrow", `
      <div class="card">
        <div class="card-title">Your interview is tomorrow, ${name}.</div>

        <div style="margin:16px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${company} — ${title}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${date} at ${time} (${tz}) — ${format}</div>
        </div>

        <div style="margin:16px 0;">
          <div class="text" style="font-weight:600;margin-bottom:8px;">Last-minute prep:</div>
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Your resume scored <strong style="color:#3b82f6;">${score}%</strong> against this role — review any gaps flagged in your readiness report</span></div>
          ${listingsHtml}
          <div style="display:flex;align-items:flex-start;gap:8px;padding:5px 0;"><span style="color:#3b82f6;">•</span><span style="font-size:13px;color:#475569;">Check if you have any connections at ${company} through your network on Brilliant Jobs</span></div>
        </div>

        <p class="text" style="font-style:italic;color:#64748b;">You earned this interview. Tomorrow is about showing them what they already suspect from your resume — that you're the right person for this role.</p>

        <div class="btn-row">
          <a href="${base}#pipeline?stage=interview" class="btn btn-primary">View Prep Details →</a>
        </div>
      </div>
    `),
    sms_text: `Tomorrow: ${title} interview at ${company}, ${time}. You're ready.`,
  };
}

export function interviewReminder1hEmail(
  firstName?: string,
  companyName?: string,
  jobTitle?: string,
  interviewTime?: string,
  timezone?: string,
  interviewFormat?: string,
  interviewLocation?: string,
  matchScore?: number,
  topStrengths?: string,
  primaryGap?: string,
  dashboardUrl?: string
): { subject: string; html: string; sms_text: string } {
  const name = firstName || "there";
  const company = companyName || "the company";
  const title = jobTitle || "the role";
  const time = interviewTime || "soon";
  const tz = timezone || "your timezone";
  const format = interviewFormat || "Not specified";
  const location = interviewLocation || "";
  const score = matchScore || 0;
  const strengths = topStrengths || "See your readiness report";
  const gap = primaryGap || "None identified";
  const base = dashboardUrl || "https://brilliantjobs.app/dashboard.html";

  const locationHtml = location
    ? `<div style="font-size:13px;color:#64748b;margin-top:4px;">${location}</div>`
    : "";

  return {
    subject: `Starting soon: ${title} at ${company} in 1 hour`,
    html: whiteBaseLayout("Interview in 1 Hour", `
      <div class="card">
        <div class="card-title">You're on in one hour, ${name}.</div>

        <div style="margin:16px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${company} — ${title}</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">${time} (${tz}) — ${format}</div>
          ${locationHtml}
        </div>

        <div style="margin:16px 0;">
          <div class="text" style="font-weight:600;margin-bottom:8px;">Quick reference:</div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:100px;">Match score</span><span style="font-size:13px;color:#3b82f6;font-weight:700;">${score}%</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:100px;">Top strengths</span><span style="font-size:13px;color:#1e293b;">${strengths}</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;"><span style="color:#94a3b8;font-size:13px;min-width:100px;">Key gap</span><span style="font-size:13px;color:#1e293b;">${gap}</span></div>
        </div>

        <p class="text" style="font-style:italic;color:#64748b;text-align:center;margin-top:20px;">Take a breath. You're ready.</p>

        <div class="btn-row">
          <a href="${base}#pipeline?stage=interview" class="btn btn-primary">Open Dashboard →</a>
        </div>
      </div>
    `),
    sms_text: `Interview in 1hr: ${title} at ${company}. ${format}. You've got this.`,
  };
}

export function resumeRewriteReadyEmail(
  firstName?: string,
  companyName?: string,
  jobTitle?: string,
  originalResumeName?: string,
  originalScore?: number,
  newScore?: number,
  keywordsAdded?: number,
  sectionsChanged?: number,
  newResumeId?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const company = companyName || "the company";
  const title = jobTitle || "this role";
  const resumeName = originalResumeName || "your resume";
  const oldScore = originalScore || 0;
  const nScore = newScore || 0;
  const keywords = keywordsAdded || 0;
  const sections = sectionsChanged || 0;
  const rId = newResumeId || "";
  const base = dashboardUrl || "https://brilliantjobs.app/dashboard.html";
  const improvement = nScore - oldScore;

  return {
    subject: `Your optimized resume for ${title} is ready`,
    html: whiteBaseLayout("Resume Rewrite Ready", `
      <div class="card">
        <div class="card-title">Your AI-optimized resume is ready for review, ${name}.</div>

        <div style="margin:16px 0;">
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:120px;">Original resume</span><span style="font-size:13px;color:#1e293b;">${resumeName}</span></div>
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;font-size:13px;min-width:120px;">Optimized for</span><span style="font-size:13px;color:#1e293b;font-weight:600;">${title} at ${company}</span></div>
        </div>

        <div style="margin:20px 0;">
          <div class="text" style="font-weight:600;margin-bottom:12px;">What changed:</div>
          <div style="display:flex;justify-content:space-around;text-align:center;margin:16px 0;">
            <div>
              <div style="font-size:20px;font-weight:700;color:#22c55e;">+${improvement}%</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Score improvement</div>
              <div style="font-size:12px;color:#64748b;">${oldScore}% → ${nScore}%</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:#3b82f6;">${keywords}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Keywords added</div>
            </div>
            <div>
              <div style="font-size:20px;font-weight:700;color:#3b82f6;">${sections}</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Sections restructured</div>
            </div>
          </div>
        </div>

        <div style="margin:16px 0;padding:14px;background:#fefce8;border:1px solid #fef08a;border-radius:10px;">
          <p style="font-size:13px;color:#854d0e;margin:0;line-height:1.5;"><strong>Important:</strong> This is a draft. Review every change before submitting. AI rewrites are designed to improve keyword alignment and structure, but only you know if the content accurately represents your experience.</p>
        </div>

        <p class="text" style="font-size:13px;color:#64748b;">The optimized version is saved as a new file in your resume library. Your original is untouched.</p>

        <div class="btn-row">
          <a href="${base}#resumes?highlight=${rId}" class="btn btn-primary">Review Your Optimized Resume →</a>
        </div>
      </div>
    `),
  };
}

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

// ═══════════════════════════════════════════════════
// BATCH 8: REFERRAL NOTIFICATION TEMPLATES (v6.11)
// 9 templates — White theme. Pod 1 copy delivery.
// ═══════════════════════════════════════════════════

export function referralInviteEmail(
  firstName?: string,
  referralLink?: string,
  referrerReward?: string,
  refereeReward?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const link = referralLink || "#";
  const rReward = referrerReward || "50 credits";
  const eReward = refereeReward || "7-day Pro trial";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Share Brilliant Jobs, earn ${rReward}`,
    html: whiteBaseLayout("Invite a Friend", `
      <div class="card">
        <div class="card-title">Know someone in the job market, ${name}?</div>
        <p class="text">Share your personal referral link and you both win. When your friend signs up and creates their first filter, you earn <strong>${rReward}</strong> and they get a <strong>${eReward}</strong>.</p>

        <div style="margin:20px 0;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
          <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Your referral link</div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;word-break:break-all;">${link}</div>
        </div>

        <div style="display:flex;justify-content:space-around;text-align:center;margin:20px 0;">
          <div>
            <div style="font-size:14px;font-weight:700;color:#3b82f6;">You get</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">${rReward}</div>
          </div>
          <div style="color:#e2e8f0;font-size:20px;">|</div>
          <div>
            <div style="font-size:14px;font-weight:700;color:#22c55e;">They get</div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">${eReward}</div>
          </div>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">Share Your Link →</a>
        </div>
      </div>
    `),
  };
}

export function referralSentConfirmationEmail(
  firstName?: string,
  refereeName?: string,
  referralsSent?: number,
  activeReferrals?: number,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const friend = refereeName || "your friend";
  const sent = referralsSent || 1;
  const active = activeReferrals || 1;
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Referral sent to ${friend}`,
    html: whiteBaseLayout("Referral Sent", `
      <div class="card">
        <div class="card-title">Nice one, ${name}. Your invite is on its way.</div>
        <p class="text">We just sent your referral to <strong>${friend}</strong>. You'll get a notification when they sign up and again when your reward unlocks.</p>

        <div style="display:flex;justify-content:space-around;text-align:center;margin:20px 0;">
          <div>
            <div style="font-size:20px;font-weight:700;color:#3b82f6;">${sent}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Total sent</div>
          </div>
          <div>
            <div style="font-size:20px;font-weight:700;color:#f59e0b;">${active}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">Pending</div>
          </div>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">Track Your Referrals →</a>
        </div>
      </div>
    `),
  };
}

export function referralStatusUpdateEmail(
  firstName?: string,
  refereeName?: string,
  status?: string,
  statusDescription?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const friend = refereeName || "Your friend";
  const stat = status || "signed_up";
  const desc = statusDescription || "signed up for Brilliant Jobs";
  const base = dashboardUrl || DASHBOARD_URL;

  const statusBadge = stat === "signed_up"
    ? '<span class="badge badge-blue">Signed Up</span>'
    : stat === "activated"
    ? '<span class="badge badge-green">Activated</span>'
    : '<span class="badge badge-amber">Link Clicked</span>';

  return {
    subject: `${friend} ${stat === "signed_up" ? "just signed up" : stat === "activated" ? "just activated" : "clicked your link"}`,
    html: whiteBaseLayout("Referral Update", `
      <div class="card">
        <div class="card-title">Progress on your referral, ${name}.</div>
        <p class="text"><strong>${friend}</strong> ${desc}.</p>

        <div style="text-align:center;margin:16px 0;">
          ${statusBadge}
        </div>

        <div style="margin:16px 0;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
          <p style="font-size:13px;color:#166534;margin:0;line-height:1.5;">Once they create their first filter, your reward unlocks automatically.</p>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">View Referral Status →</a>
        </div>
      </div>
    `),
  };
}

export function referralNudgeRefereeEmail(
  referrerName?: string,
  refereeName?: string,
  refereeReward?: string,
  referralLink?: string
): { subject: string; html: string } {
  const referrer = referrerName || "A friend";
  const name = refereeName || "there";
  const reward = refereeReward || "7-day Pro trial";
  const link = referralLink || "https://brilliantjobs.app";

  return {
    subject: `${referrer} invited you to Brilliant Jobs — your ${reward} is waiting`,
    html: whiteBaseLayout("You're Invited", `
      <div class="card">
        <div class="card-title">${referrer} thinks you'd love this, ${name}.</div>
        <p class="text">Brilliant Jobs tracks jobs directly from employer systems — not job boards. That means you see real openings, detect ghost jobs, and apply with AI-optimized resumes.</p>
        <p class="text">Sign up now and you'll get a <strong>${reward}</strong> to unlock premium features like resume scoring and market intelligence.</p>

        <div class="btn-row">
          <a href="${link}" class="btn btn-primary">Claim Your ${reward} →</a>
        </div>

        <p class="text" style="font-size:12px;text-align:center;color:#94a3b8;">Sent because ${referrer} shared their referral link with you.</p>
      </div>
    `),
  };
}

export function referralConversionEmail(
  firstName?: string,
  refereeName?: string,
  rewardType?: string,
  rewardAmount?: string,
  totalEarned?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const friend = refereeName || "Your friend";
  const rType = rewardType || "credits";
  const amount = rewardAmount || "50 credits";
  const total = totalEarned || amount;
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `You earned ${amount} — ${friend} just activated`,
    html: whiteBaseLayout("Reward Earned", `
      <div class="card">
        <div class="card-title">Your referral paid off, ${name}.</div>
        <p class="text"><strong>${friend}</strong> activated their account and your reward has been applied automatically.</p>

        <div style="text-align:center;margin:24px 0;padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
          <div style="font-size:11px;color:#166534;text-transform:uppercase;letter-spacing:0.5px;">Reward earned</div>
          <div style="font-size:28px;font-weight:700;color:#16a34a;margin-top:4px;">${amount}</div>
          <div style="font-size:12px;color:#64748b;margin-top:4px;">Lifetime earned: ${total}</div>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">View Your Rewards →</a>
          <a href="${base}#referrals?action=invite" class="btn btn-gray">Invite More Friends</a>
        </div>
      </div>
    `),
  };
}

export function referralRewardEarnedEmail(
  firstName?: string,
  rewardDescription?: string,
  rewardExpiry?: string,
  newBalance?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const desc = rewardDescription || "50 credits added to your account";
  const expiry = rewardExpiry || "";
  const balance = newBalance || "";
  const base = dashboardUrl || DASHBOARD_URL;

  const expiryHtml = expiry ? `<p class="text" style="font-size:12px;color:#f59e0b;">Expires: ${expiry}</p>` : "";
  const balanceHtml = balance ? `<div style="font-size:13px;color:#64748b;margin-top:8px;">Updated balance: <strong style="color:#1e293b;">${balance}</strong></div>` : "";

  return {
    subject: `Your referral reward is live`,
    html: whiteBaseLayout("Reward Applied", `
      <div class="card">
        <div class="card-title">Your reward is active, ${name}.</div>
        <p class="text">${desc}.</p>
        ${balanceHtml}
        ${expiryHtml}

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Go to Dashboard →</a>
        </div>
      </div>
    `),
  };
}

export function referralExpiringRewardEmail(
  firstName?: string,
  rewardDescription?: string,
  daysLeft?: number,
  usageSummary?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const desc = rewardDescription || "Your referral credits";
  const days = daysLeft || 7;
  const usage = usageSummary || "";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `${desc} expire${days === 1 ? "s" : ""} in ${days} day${days === 1 ? "" : "s"}`,
    html: whiteBaseLayout("Reward Expiring", `
      <div class="card">
        <div class="card-title">Don't let your reward go to waste, ${name}.</div>
        <p class="text">${desc} will expire in <strong>${days} day${days === 1 ? "" : "s"}</strong>. Use them for resume rewrites, priority scoring, or any premium feature.</p>
        ${usage ? `<p class="text" style="font-size:13px;">${usage}</p>` : ""}

        <div style="margin:16px 0;padding:14px;background:#fefce8;border:1px solid #fef08a;border-radius:10px;">
          <p style="font-size:13px;color:#854d0e;margin:0;">After expiry, unused credits are forfeited and cannot be restored.</p>
        </div>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Use Your Credits Now →</a>
        </div>
      </div>
    `),
  };
}

export function referralMilestoneEmail(
  firstName?: string,
  milestone?: number,
  bonusReward?: string,
  nextMilestone?: number,
  leaderboardPosition?: number,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const ms = milestone || 5;
  const bonus = bonusReward || "bonus credits";
  const next = nextMilestone || ms + 5;
  const pos = leaderboardPosition || 0;
  const base = dashboardUrl || DASHBOARD_URL;

  const posHtml = pos > 0 ? `<div style="font-size:13px;color:#64748b;margin-top:8px;">You're #${pos} on the referral leaderboard.</div>` : "";

  return {
    subject: `Milestone reached: ${ms} referrals`,
    html: whiteBaseLayout("Referral Milestone", `
      <div class="card">
        <div class="card-title">You just hit ${ms} referrals, ${name}.</div>
        <p class="text">That's a real milestone. As a thank you, we've added <strong>${bonus}</strong> to your account.</p>
        ${posHtml}

        <div style="margin:20px 0;text-align:center;">
          <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Next milestone</div>
          <div style="font-size:24px;font-weight:700;color:#3b82f6;margin-top:4px;">${next} referrals</div>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">Keep Going →</a>
        </div>
      </div>
    `),
  };
}

export function referralPeriodicSummaryEmail(
  firstName?: string,
  totalSent?: number,
  totalClicked?: number,
  totalSignedUp?: number,
  totalActivated?: number,
  lifetimeEarnings?: string,
  referralLink?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const sent = totalSent || 0;
  const clicked = totalClicked || 0;
  const signedUp = totalSignedUp || 0;
  const activated = totalActivated || 0;
  const earnings = lifetimeEarnings || "0 credits";
  const link = referralLink || "#";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Your referral recap — ${activated} converted this month`,
    html: whiteBaseLayout("Referral Summary", `
      <div class="card">
        <div class="card-title">Monthly referral recap, ${name}.</div>

        <div style="display:flex;justify-content:space-around;text-align:center;margin:20px 0;">
          <div>
            <div style="font-size:18px;font-weight:700;color:#3b82f6;">${sent}</div>
            <div style="font-size:11px;color:#94a3b8;">Sent</div>
          </div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#8b5cf6;">${clicked}</div>
            <div style="font-size:11px;color:#94a3b8;">Clicked</div>
          </div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#f59e0b;">${signedUp}</div>
            <div style="font-size:11px;color:#94a3b8;">Signed up</div>
          </div>
          <div>
            <div style="font-size:18px;font-weight:700;color:#22c55e;">${activated}</div>
            <div style="font-size:11px;color:#94a3b8;">Activated</div>
          </div>
        </div>

        <div style="text-align:center;margin:16px 0;padding:14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
          <div style="font-size:11px;color:#166534;text-transform:uppercase;">Lifetime earnings</div>
          <div style="font-size:22px;font-weight:700;color:#16a34a;margin-top:4px;">${earnings}</div>
        </div>

        <div class="btn-row">
          <a href="${base}#referrals" class="btn btn-primary">View Details →</a>
          <a href="${base}#referrals?action=invite" class="btn btn-gray">Invite More →</a>
        </div>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════
// BATCH 9: BILLING NOTIFICATION TEMPLATES (v6.11)
// 8 templates — White theme. Required transactional.
// All ALWAYS ON — user cannot disable.
// ═══════════════════════════════════════════════════

export function subscriptionConfirmEmail(
  firstName?: string,
  planName?: string,
  amount?: string,
  billingPeriod?: string,
  nextRenewal?: string,
  paymentMethod?: string,
  receiptUrl?: string,
  isNewSubscription?: boolean,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const plan = planName || "Pro";
  const amt = amount || "$24.99";
  const period = billingPeriod || "monthly";
  const renewal = nextRenewal || "";
  const method = paymentMethod || "Card ending ****";
  const receipt = receiptUrl || "";
  const isNew = isNewSubscription !== false;
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: isNew ? `Welcome to ${plan} — subscription confirmed` : `${plan} renewal confirmed — ${amt}`,
    html: whiteBaseLayout("Subscription Confirmed", `
      <div class="card">
        <div class="card-title">${isNew ? `You're on ${plan}, ${name}.` : `Renewal confirmed, ${name}.`}</div>
        ${isNew
          ? `<p class="text">Your ${plan} subscription is active. You now have access to resume rewrites, priority scoring, market intelligence, and unlimited filters.</p>`
          : `<p class="text">Your ${plan} subscription renewed successfully.</p>`
        }

        <div style="margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Plan</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${plan} (${period})</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Amount</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${amt}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Payment</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${method}</td></tr>
            ${renewal ? `<tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;">Next renewal</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${renewal}</td></tr>` : ""}
          </table>
        </div>

        <div class="btn-row">
          ${receipt ? `<a href="${receipt}" class="btn btn-gray">View Receipt</a>` : ""}
          <a href="${base}" class="btn btn-primary">${isNew ? "Get Started →" : "Open Dashboard →"}</a>
        </div>
      </div>
    `),
  };
}

export function creditPurchaseReceiptEmail(
  firstName?: string,
  creditsAdded?: number,
  amount?: string,
  newBalance?: number,
  perCreditCost?: string,
  paymentMethod?: string,
  receiptUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const credits = creditsAdded || 0;
  const amt = amount || "$0.00";
  const balance = newBalance || credits;
  const perCredit = perCreditCost || "";
  const method = paymentMethod || "Card ending ****";
  const receipt = receiptUrl || "";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `${credits} credits added to your account`,
    html: whiteBaseLayout("Credit Purchase Receipt", `
      <div class="card">
        <div class="card-title">${credits} credits added, ${name}.</div>

        <div style="margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Credits</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${credits}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Amount</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${amt}</td></tr>
            ${perCredit ? `<tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Per credit</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${perCredit}</td></tr>` : ""}
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Payment</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${method}</td></tr>
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;">New balance</td><td style="padding:8px 0;font-size:13px;color:#22c55e;font-weight:700;text-align:right;">${balance} credits</td></tr>
          </table>
        </div>

        <div class="btn-row">
          ${receipt ? `<a href="${receipt}" class="btn btn-gray">View Receipt</a>` : ""}
          <a href="${base}" class="btn btn-primary">Open Dashboard →</a>
        </div>
      </div>
    `),
  };
}

export function paymentFailedEmail(
  firstName?: string,
  amount?: string,
  planName?: string,
  attemptNumber?: number,
  gracePeriodEnd?: string,
  updatePaymentUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const amt = amount || "";
  const plan = planName || "Pro";
  const attempt = attemptNumber || 1;
  const graceEnd = gracePeriodEnd || "";
  const updateUrl = updatePaymentUrl || "#";
  const base = dashboardUrl || DASHBOARD_URL;

  const urgency = attempt <= 1
    ? { title: "Payment didn't go through", tone: "We couldn't process your payment. This is usually a temporary issue — an expired card or insufficient funds.", bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" }
    : attempt <= 2
    ? { title: "Second payment attempt failed", tone: `We've tried twice to process your ${plan} payment. Please update your payment method to avoid losing access.`, bg: "#fefce8", border: "#fef08a", color: "#854d0e" }
    : attempt <= 3
    ? { title: "Action needed — access at risk", tone: `This is our third attempt to process your payment. Your ${plan} features will be suspended${graceEnd ? ` on ${graceEnd}` : " soon"} unless you update your payment method.`, bg: "#fff7ed", border: "#fed7aa", color: "#9a3412" }
    : { title: "Final notice — account downgraded tomorrow", tone: `We've been unable to process your payment after multiple attempts. Your account will be downgraded to Free${graceEnd ? ` on ${graceEnd}` : " tomorrow"}, and you'll lose access to ${plan} features.`, bg: "#fef2f2", border: "#fecaca", color: "#991b1b" };

  return {
    subject: attempt <= 1 ? `Payment failed for your ${plan} subscription` : attempt <= 3 ? `Action needed: update your payment method` : `Final notice: ${plan} access ends tomorrow`,
    html: whiteBaseLayout(urgency.title, `
      <div class="card">
        <div class="card-title">${urgency.title}, ${name}.</div>

        <div style="margin:16px 0;padding:14px;background:${urgency.bg};border:1px solid ${urgency.border};border-radius:10px;">
          <p style="font-size:13px;color:${urgency.color};margin:0;line-height:1.5;">${urgency.tone}</p>
        </div>

        ${amt ? `<p class="text" style="font-size:13px;">Amount due: <strong>${amt}</strong></p>` : ""}

        <div class="btn-row">
          <a href="${updateUrl}" class="btn btn-primary">Update Payment Method →</a>
        </div>

        <p class="text" style="font-size:12px;text-align:center;color:#94a3b8;">If you've already updated your payment, you can safely ignore this. We'll retry automatically.</p>
      </div>
    `),
  };
}

export function paymentRecoveredEmail(
  firstName?: string,
  amount?: string,
  planName?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const amt = amount || "";
  const plan = planName || "Pro";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Payment successful — ${plan} access restored`,
    html: whiteBaseLayout("Payment Recovered", `
      <div class="card">
        <div class="card-title">All good, ${name}. Payment went through.</div>
        <p class="text">Your ${plan} subscription is active again${amt ? ` and we've processed ${amt}` : ""}. All features are fully restored.</p>

        <div style="text-align:center;margin:20px 0;">
          <span class="badge badge-green">Account Active</span>
        </div>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Open Dashboard →</a>
        </div>
      </div>
    `),
  };
}

export function planChangeConfirmEmail(
  firstName?: string,
  oldPlan?: string,
  newPlan?: string,
  effectiveDate?: string,
  proratedCredit?: string,
  featuresGained?: string[],
  featuresLost?: string[],
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const old = oldPlan || "Free";
  const newP = newPlan || "Pro";
  const date = effectiveDate || "immediately";
  const credit = proratedCredit || "";
  const gained = featuresGained || [];
  const lost = featuresLost || [];
  const base = dashboardUrl || DASHBOARD_URL;
  const isUpgrade = newP !== "Free" && (old === "Free" || old === "Starter");

  const gainedHtml = gained.length > 0
    ? `<div style="margin:12px 0;"><div style="font-size:12px;color:#16a34a;font-weight:600;margin-bottom:6px;">What you're gaining:</div>${gained.map(f => `<div style="font-size:13px;color:#1e293b;padding:4px 0;">+ ${f}</div>`).join("")}</div>`
    : "";
  const lostHtml = lost.length > 0
    ? `<div style="margin:12px 0;"><div style="font-size:12px;color:#dc2626;font-weight:600;margin-bottom:6px;">What changes:</div>${lost.map(f => `<div style="font-size:13px;color:#64748b;padding:4px 0;">- ${f}</div>`).join("")}</div>`
    : "";

  return {
    subject: isUpgrade ? `Upgraded to ${newP} — welcome aboard` : `Plan changed: ${old} → ${newP}`,
    html: whiteBaseLayout("Plan Changed", `
      <div class="card">
        <div class="card-title">${isUpgrade ? `Welcome to ${newP}, ${name}.` : `Plan change confirmed, ${name}.`}</div>
        <p class="text">Your plan has been changed from <strong>${old}</strong> to <strong>${newP}</strong>, effective ${date}.</p>
        ${credit ? `<p class="text" style="font-size:13px;">Prorated credit applied: <strong>${credit}</strong></p>` : ""}
        ${gainedHtml}
        ${lostHtml}

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Open Dashboard →</a>
        </div>
      </div>
    `),
  };
}

export function subscriptionCancelledEmail(
  firstName?: string,
  planName?: string,
  accessUntil?: string,
  winBackDiscount?: string,
  reactivateUrl?: string,
  surveyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const plan = planName || "Pro";
  const until = accessUntil || "end of billing period";
  const discount = winBackDiscount || "";
  const reactivate = reactivateUrl || "#";
  const survey = surveyUrl || "";
  const base = dashboardUrl || DASHBOARD_URL;

  const discountHtml = discount
    ? `<div style="margin:16px 0;padding:14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
        <p style="font-size:13px;color:#1e40af;margin:0;line-height:1.5;"><strong>Changed your mind?</strong> Reactivate within 14 days and get <strong>${discount} off</strong> your next billing cycle.</p>
        <div style="text-align:center;margin-top:12px;"><a href="${reactivate}" class="btn btn-primary" style="font-size:13px;padding:10px 20px;">Reactivate with ${discount} Off →</a></div>
      </div>`
    : "";

  return {
    subject: `${plan} cancelled — access until ${until}`,
    html: whiteBaseLayout("Subscription Cancelled", `
      <div class="card">
        <div class="card-title">We've cancelled your ${plan} plan, ${name}.</div>
        <p class="text">You'll keep ${plan} access through <strong>${until}</strong>. After that, your account reverts to Free. Your data, filters, and pipeline history are all preserved — nothing gets deleted.</p>

        <div style="margin:12px 0;">
          <div style="font-size:12px;color:#64748b;font-weight:600;margin-bottom:6px;">On Free, you keep:</div>
          <div style="font-size:13px;color:#1e293b;padding:3px 0;">1 active filter</div>
          <div style="font-size:13px;color:#1e293b;padding:3px 0;">Job browsing and pipeline tracking</div>
          <div style="font-size:13px;color:#1e293b;padding:3px 0;">Basic ghost detection</div>
        </div>

        ${discountHtml}

        ${survey ? `<p class="text" style="font-size:12px;text-align:center;"><a href="${survey}" style="color:#3b82f6;">Tell us why you're leaving</a> — it takes 30 seconds and helps us improve.</p>` : ""}
      </div>
    `),
  };
}

export function invoiceGeneratedEmail(
  firstName?: string,
  invoiceNumber?: string,
  amount?: string,
  period?: string,
  lineItems?: Array<{ description: string; amount: string }>,
  pdfUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const inv = invoiceNumber || "";
  const amt = amount || "$0.00";
  const per = period || "";
  const items = lineItems || [];
  const pdf = pdfUrl || "";
  const base = dashboardUrl || DASHBOARD_URL;

  const itemsHtml = items.length > 0
    ? `<div style="margin:16px 0;">
        <table width="100%" cellpadding="0" cellspacing="0">
          ${items.map(i => `<tr><td style="padding:6px 0;font-size:13px;color:#64748b;border-bottom:1px solid #e2e8f0;">${i.description}</td><td style="padding:6px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${i.amount}</td></tr>`).join("")}
          <tr><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:700;">Total</td><td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:700;text-align:right;">${amt}</td></tr>
        </table>
      </div>`
    : "";

  return {
    subject: `Invoice ${inv ? inv + " " : ""}for ${per || "your subscription"} — ${amt}`,
    html: whiteBaseLayout("Invoice", `
      <div class="card">
        <div class="card-title">Your invoice is ready, ${name}.</div>
        ${inv ? `<p class="text" style="font-size:13px;">Invoice #${inv}${per ? ` for ${per}` : ""}</p>` : ""}
        ${itemsHtml}

        <div class="btn-row">
          ${pdf ? `<a href="${pdf}" class="btn btn-primary">Download PDF →</a>` : ""}
          <a href="${base}" class="btn btn-gray">Open Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function refundProcessedEmail(
  firstName?: string,
  refundAmount?: string,
  reason?: string,
  originalTransaction?: string,
  timelineNote?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const amt = refundAmount || "$0.00";
  const rsn = reason || "";
  const orig = originalTransaction || "";
  const timeline = timelineNote || "5–10 business days";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Refund of ${amt} processed`,
    html: whiteBaseLayout("Refund Processed", `
      <div class="card">
        <div class="card-title">Your refund has been processed, ${name}.</div>

        <div style="margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Refund amount</td><td style="padding:8px 0;font-size:13px;color:#22c55e;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${amt}</td></tr>
            ${rsn ? `<tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Reason</td><td style="padding:8px 0;font-size:13px;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${rsn}</td></tr>` : ""}
            ${orig ? `<tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Original charge</td><td style="padding:8px 0;font-size:13px;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${orig}</td></tr>` : ""}
            <tr><td style="padding:8px 0;font-size:13px;color:#94a3b8;">Timeline</td><td style="padding:8px 0;font-size:13px;color:#1e293b;text-align:right;">${timeline}</td></tr>
          </table>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;">The refund will appear on your original payment method within ${timeline}. Your account status has been adjusted accordingly.</p>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Open Dashboard →</a>
        </div>
      </div>
    `),
  };
}

// ═══════════════════════════════════════════════════════════
// SESSION 12: MARKETING / UPGRADE / PROMOTIONAL EMAILS (White Theme)
// Pod 1 copy: PRODUCTION — Batch 10a delivered 2026-03-01
// White theme design: APPROVED — v6.12
// Classification: MARKETING (requires double opt-in, unsubscribe in every email)
// ═══════════════════════════════════════════════════════════

export function usageUpgradePromptEmail(
  firstName?: string,
  currentPlan?: string,
  limitType?: string,
  currentUsage?: number,
  limitMax?: number,
  featureBlocked?: string,
  recommendedPlan?: string,
  recommendedPrice?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const plan = currentPlan || "Free";
  const limit = limitType || "filter";
  const usage = currentUsage ?? 1;
  const max = limitMax ?? 1;
  const feature = featureBlocked || "additional filters";
  const recPlan = recommendedPlan || "Starter";
  const recPrice = recommendedPrice || "$20/mo";
  const base = dashboardUrl || DASHBOARD_URL;
  const pct = max > 0 ? Math.round((usage / max) * 100) : 100;

  return {
    subject: `You've hit your ${limit} limit — unlock more with ${recPlan}`,
    html: whiteBaseLayout("Upgrade Available", `
      <div class="card">
        <div class="card-title">Hey ${name}, you've reached your ${plan} plan limit.</div>
        <p class="card-sub">You're using ${usage} of ${max} available ${limit}s (${pct}%). To access ${feature}, you'll need to upgrade.</p>

        <div class="highlight">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:8px;">What you get with ${recPlan} (${recPrice})</div>
          <div style="font-size:13px;color:#475569;line-height:1.7;">
            ${recPlan === "Starter" ? `
              &bull; Up to 5 saved filters (you have ${usage})<br>
              &bull; Boolean search operators (AND, OR, NOT)<br>
              &bull; 100 monthly AI credits for resume scoring<br>
              &bull; Priority email support
            ` : `
              &bull; Unlimited saved filters<br>
              &bull; 300 monthly AI credits<br>
              &bull; Auto-apply with smart matching<br>
              &bull; Full market intelligence reports<br>
              &bull; Priority support + early features
            `}
          </div>
        </div>

        <div class="btn-row">
          <a href="${base}#subscription" class="btn btn-primary">Upgrade to ${recPlan} →</a>
          <a href="${base}#subscription" class="btn btn-gray">Compare Plans</a>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">No long-term commitment. Cancel anytime.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from upgrade notifications</a></p>`),
  };
}

export function creditBurnRateAlertEmail(
  firstName?: string,
  creditsRemaining?: number,
  burnRatePerDay?: number,
  projectedExhaustDate?: string,
  daysUntilExhaust?: number,
  currentPlan?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const remaining = creditsRemaining ?? 0;
  const rate = burnRatePerDay ?? 0;
  const exhaustDate = projectedExhaustDate || "soon";
  const daysLeft = daysUntilExhaust ?? 0;
  const plan = currentPlan || "Starter";
  const base = dashboardUrl || DASHBOARD_URL;

  const urgencyColor = daysLeft <= 2 ? "#ef4444" : daysLeft <= 5 ? "#f59e0b" : "#3b82f6";
  const urgencyLabel = daysLeft <= 2 ? "Critical" : daysLeft <= 5 ? "Low" : "Moderate";

  return {
    subject: `Credit alert: ${remaining} credits left — ~${daysLeft} days at current pace`,
    html: whiteBaseLayout("Credit Burn Rate Alert", `
      <div class="card">
        <div class="card-title">${name}, your credits are running faster than expected.</div>

        <div style="margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Credits remaining</td>
              <td style="padding:8px 0;font-size:13px;color:${urgencyColor};font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${remaining}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Daily burn rate</td>
              <td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;border-bottom:1px solid #e2e8f0;">${rate} credits/day</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Projected empty</td>
              <td style="padding:8px 0;font-size:13px;color:#1e293b;text-align:right;border-bottom:1px solid #e2e8f0;">${exhaustDate}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;">Status</td>
              <td style="padding:8px 0;text-align:right;"><span style="display:inline-block;padding:3px 10px;border-radius:8px;font-size:11px;font-weight:600;background:${urgencyColor}22;color:${urgencyColor};">${urgencyLabel}</span></td>
            </tr>
          </table>
        </div>

        <p class="text">You're using credits faster than your plan replenishes them. Here's how to stay covered:</p>

        <div class="btn-row">
          <a href="${base}#billing" class="btn btn-primary">Buy Credits →</a>
          <a href="${base}#settings" class="btn btn-gray">Enable Auto-Refill</a>
        </div>

        ${plan === "starter" ? `<p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">Or <a href="${base}#subscription" style="color:#3b82f6;">upgrade to Pro</a> for 300 monthly credits.</p>` : ""}
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from credit alerts</a></p>`),
  };
}

export function priceLockWarningEmail(
  firstName?: string,
  variant?: "14d" | "7d" | "1d",
  currentPrice?: string,
  newPrice?: string,
  effectiveDate?: string,
  currentPlan?: string,
  savingsAmount?: string,
  savingsPercent?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const v = variant || "14d";
  const curPrice = currentPrice || "$20/mo";
  const nPrice = newPrice || "$24/mo";
  const date = effectiveDate || "soon";
  const plan = currentPlan || "Starter";
  const savings = savingsAmount || "$4/mo";
  const pct = savingsPercent || "17%";
  const base = dashboardUrl || DASHBOARD_URL;

  const subjects: Record<string, string> = {
    "14d": `Heads up: ${plan} pricing changes on ${date}`,
    "7d": `One week left to lock in ${curPrice}/mo — price going to ${nPrice}`,
    "1d": `Last day: lock in ${curPrice}/mo before tomorrow's price increase`,
  };

  const tones: Record<string, { heading: string; body: string; boxColor: string; boxBorder: string }> = {
    "14d": {
      heading: `${name}, a pricing update is coming.`,
      body: `Starting ${date}, ${plan} will move from ${curPrice} to ${nPrice}. If you subscribe (or renew) before then, you'll keep the current rate for as long as you stay subscribed.`,
      boxColor: "#eff6ff",
      boxBorder: "#bfdbfe",
    },
    "7d": {
      heading: `${name}, one week until the price change.`,
      body: `${plan} moves from ${curPrice} to ${nPrice} on ${date}. Lock in the current rate now and save ${savings}/mo (${pct} off) — permanently, as long as you stay subscribed.`,
      boxColor: "#fef9c3",
      boxBorder: "#fde68a",
    },
    "1d": {
      heading: `${name}, this is your last chance at ${curPrice}/mo.`,
      body: `Tomorrow, ${plan} goes from ${curPrice} to ${nPrice}. After that, the current rate is gone for good. Lock it in now and you'll keep ${curPrice}/mo for life.`,
      boxColor: "#fee2e2",
      boxBorder: "#fca5a5",
    },
  };

  const tone = tones[v];

  return {
    subject: subjects[v],
    html: whiteBaseLayout("Price Lock", `
      <div class="card">
        <div class="card-title">${tone.heading}</div>

        <div style="background:${tone.boxColor};border:1px solid ${tone.boxBorder};border-radius:10px;padding:16px;margin:16px 0;">
          <p style="font-size:14px;color:#1e293b;line-height:1.6;margin:0;">${tone.body}</p>
        </div>

        <div style="margin:16px 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">Current price</td>
              <td style="padding:8px 0;font-size:13px;color:#22c55e;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${curPrice}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;border-bottom:1px solid #e2e8f0;">New price (${date})</td>
              <td style="padding:8px 0;font-size:13px;color:#ef4444;font-weight:700;text-align:right;border-bottom:1px solid #e2e8f0;">${nPrice}</td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:13px;color:#94a3b8;">You save</td>
              <td style="padding:8px 0;font-size:13px;color:#1e293b;font-weight:700;text-align:right;">${savings}/mo (${pct})</td>
            </tr>
          </table>
        </div>

        <div class="btn-row">
          <a href="${base}#subscription" class="btn btn-primary">${v === "1d" ? "Lock In My Price Now →" : "Lock In Current Price →"}</a>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">This rate stays locked for as long as your subscription is active.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from pricing updates</a></p>`),
  };
}

export function promoTrialEmail(
  firstName?: string,
  trialPlan?: string,
  trialDays?: number,
  featuresIncluded?: string[],
  expiryDate?: string,
  activationUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const plan = trialPlan || "Pro";
  const days = trialDays ?? 7;
  const features = featuresIncluded || ["Unlimited filters", "300 AI credits", "Auto-apply", "Market intelligence"];
  const expiry = expiryDate || "";
  const activateUrl = activationUrl || `${dashboardUrl || DASHBOARD_URL}#subscription`;
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `${name}, try ${plan} free for ${days} days — no card required`,
    html: whiteBaseLayout("Free Trial Offer", `
      <div class="card">
        <div class="card-title">${name}, you've earned a free look at ${plan}.</div>
        <p class="card-sub">Based on your activity, we think you'd get real value from ${plan} features. Try them free for ${days} days — no credit card, no commitment.</p>

        <div class="highlight">
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-bottom:10px;">Your ${days}-day ${plan} trial includes:</div>
          ${features.map(f => `<div style="font-size:13px;color:#475569;padding:4px 0;">&bull; ${f}</div>`).join("")}
        </div>

        <div class="btn-row">
          <a href="${activateUrl}" class="btn btn-primary">Start Free Trial →</a>
        </div>

        ${expiry ? `<p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">This offer expires ${expiry}.</p>` : ""}
        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">No credit card needed. Your trial ends automatically after ${days} days unless you choose to subscribe.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from promotional emails</a></p>`),
  };
}

export function promoFeaturePreviewEmail(
  firstName?: string,
  featureName?: string,
  featureDescription?: string,
  previewDays?: number,
  previewExpiryDate?: string,
  screenshotAlt?: string,
  requiredPlan?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const feature = featureName || "a new feature";
  const desc = featureDescription || "We're giving you early access to an upcoming feature.";
  const days = previewDays ?? 3;
  const expiry = previewExpiryDate || "";
  const alt = screenshotAlt || "";
  const reqPlan = requiredPlan || "Pro";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `${name}, early access: ${feature} is yours for ${days} days`,
    html: whiteBaseLayout("Feature Preview", `
      <div class="card">
        <div class="card-title">${name}, you're getting early access.</div>
        <p class="card-sub">${desc}</p>

        <div class="highlight">
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:6px;">${feature}</div>
          <div style="font-size:13px;color:#475569;">Available for ${days} days in your dashboard. ${reqPlan} subscribers get permanent access.</div>
        </div>

        ${alt ? `<p class="text" style="font-size:12px;color:#94a3b8;font-style:italic;">${alt}</p>` : ""}

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Try ${feature} →</a>
          <a href="${base}#subscription" class="btn btn-gray">Get Permanent Access</a>
        </div>

        ${expiry ? `<p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">Preview expires ${expiry}. Upgrade to ${reqPlan} to keep it.</p>` : ""}
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from promotional emails</a></p>`),
  };
}

// ═══════════════════════════════════════════════════════════════
// v6.13 — Community & Feedback Templates (6 functions)
// Batch 10b: Canny-integrated community lifecycle notifications
// Pod 1 Session 13 | White theme | Product + Marketing classification
// ═══════════════════════════════════════════════════════════════

export function bugReportThankyouEmail(
  firstName?: string,
  bugTitle?: string,
  bugId?: string,
  severity?: string,
  rewardCredits?: number,
  rewardTrial?: string,
  cannyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const title = bugTitle || "your report";
  const id = bugId || "";
  const sev = severity || "minor";
  const credits = rewardCredits ?? 10;
  const trial = rewardTrial || "";
  const cUrl = cannyUrl || "https://brilliant-jobs.canny.io/bug-reports";
  const base = dashboardUrl || DASHBOARD_URL;

  const sevLabel = sev === "critical" ? "Critical" : sev === "major" ? "Major" : "Minor";
  const sevColor = sev === "critical" ? "#dc2626" : sev === "major" ? "#f59e0b" : "#3b82f6";

  let rewardLine = `<strong>${credits} credits</strong> added to your account`;
  if (sev === "major") rewardLine += ` + <strong>7 days Pro access</strong>`;
  if (sev === "critical") rewardLine = `<strong>1 month Pro access</strong> added to your account`;

  return {
    subject: `Bug confirmed${id ? ` (#${id})` : ""} — thank you, ${name}`,
    html: whiteBaseLayout("Bug Report Confirmed", `
      <div class="card">
        <div class="card-title">Thanks for making Brilliant Jobs better.</div>
        <p class="card-sub">We've confirmed your bug report and classified it. Here's what happens next.</p>

        <div class="highlight">
          <div style="font-size:13px;color:#64748b;margin-bottom:6px;">Your report</div>
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:8px;">${title}</div>
          <div style="display:inline-block;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700;color:#fff;background:${sevColor};">${sevLabel}</div>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
          <div style="font-size:13px;font-weight:700;color:#166534;margin-bottom:4px;">Your reward</div>
          <div style="font-size:14px;color:#15803d;">${rewardLine}</div>
        </div>

        <p class="text">Our engineering team is on it. We'll notify you when the fix ships.</p>

        <div class="btn-row">
          <a href="${cUrl}" class="btn btn-primary">Track on Canny →</a>
          <a href="${base}" class="btn btn-gray">Back to Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function bugResolvedEmail(
  firstName?: string,
  bugTitle?: string,
  bugId?: string,
  fixSummary?: string,
  releasedIn?: string,
  cannyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const title = bugTitle || "an issue you reported";
  const id = bugId || "";
  const fix = fixSummary || "The issue has been resolved.";
  const release = releasedIn || "the latest update";
  const cUrl = cannyUrl || "https://brilliant-jobs.canny.io/bug-reports";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Fixed${id ? ` (#${id})` : ""}: ${title}`,
    html: whiteBaseLayout("Bug Fixed", `
      <div class="card">
        <div class="card-title">${name}, your bug report is resolved.</div>
        <p class="card-sub">Thanks to your report, we've shipped a fix. Here's what changed.</p>

        <div class="highlight">
          <div style="font-size:13px;color:#64748b;margin-bottom:6px;">Issue</div>
          <div style="font-size:15px;font-weight:700;color:#1e293b;margin-bottom:10px;">${title}</div>
          <div style="font-size:13px;color:#64748b;margin-bottom:4px;">Resolution</div>
          <div style="font-size:14px;color:#1e293b;">${fix}</div>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;">Shipped in ${release}</p>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">See It Live →</a>
          <a href="${cUrl}" class="btn btn-gray">View on Canny</a>
        </div>
      </div>
    `),
  };
}

export function featureRequestThankyouEmail(
  firstName?: string,
  featureTitle?: string,
  featureId?: string,
  cannyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const title = featureTitle || "your suggestion";
  const id = featureId || "";
  const cUrl = cannyUrl || "https://brilliant-jobs.canny.io/feature-requests";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Feature request received${id ? ` (#${id})` : ""} — we're listening`,
    html: whiteBaseLayout("Feature Request Received", `
      <div class="card">
        <div class="card-title">Great idea, ${name}.</div>
        <p class="card-sub">Your feature request is now on our radar. Here's what happens next.</p>

        <div class="highlight">
          <div style="font-size:13px;color:#64748b;margin-bottom:6px;">Your request</div>
          <div style="font-size:15px;font-weight:700;color:#1e293b;">${title}</div>
        </div>

        <div class="step-row"><div class="step-num step-done">✓</div><div class="step-text">Submitted<small>We've logged your request</small></div></div>
        <div class="step-row"><div class="step-num">2</div><div class="step-text">Under review<small>Our product team evaluates feasibility and demand</small></div></div>
        <div class="step-row"><div class="step-num">3</div><div class="step-text">Roadmap decision<small>We'll notify you if it's accepted or if we go a different direction</small></div></div>

        <p class="text">Other users can upvote your request on Canny. The more votes, the higher priority it gets.</p>

        <div class="btn-row">
          <a href="${cUrl}" class="btn btn-primary">Share & Get Votes →</a>
          <a href="${base}" class="btn btn-gray">Back to Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function featureRequestAcceptedEmail(
  firstName?: string,
  featureTitle?: string,
  featureId?: string,
  estimatedTimeline?: string,
  cannyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const title = featureTitle || "a feature you requested";
  const id = featureId || "";
  const timeline = estimatedTimeline || "the coming weeks";
  const cUrl = cannyUrl || "https://brilliant-jobs.canny.io/feature-requests";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Your feature request is on the roadmap${id ? ` (#${id})` : ""}`,
    html: whiteBaseLayout("Feature Accepted", `
      <div class="card">
        <div class="card-title">${name}, it's happening.</div>
        <p class="card-sub">Your feature request has been accepted and added to our build roadmap.</p>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;margin:16px 0;">
          <div style="font-size:13px;color:#166534;margin-bottom:6px;">Accepted</div>
          <div style="font-size:15px;font-weight:700;color:#15803d;">${title}</div>
          ${timeline ? `<div style="font-size:13px;color:#166534;margin-top:8px;">Estimated timeline: ${timeline}</div>` : ""}
        </div>

        <p class="text">We'll send you another notification when it ships. Timeline estimates may shift as we balance priorities, but your feature is committed.</p>

        <div class="btn-row">
          <a href="${cUrl}" class="btn btn-primary">Follow on Canny →</a>
          <a href="${base}" class="btn btn-gray">Back to Dashboard</a>
        </div>
      </div>
    `),
  };
}

export function featureRequestShippedEmail(
  firstName?: string,
  featureTitle?: string,
  featureId?: string,
  featureDescription?: string,
  howToAccess?: string,
  cannyUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const title = featureTitle || "a feature you requested";
  const id = featureId || "";
  const desc = featureDescription || "The feature is now live in your dashboard.";
  const howTo = howToAccess || "";
  const cUrl = cannyUrl || "https://brilliant-jobs.canny.io/changelog";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Shipped: ${title}${id ? ` (#${id})` : ""} is live`,
    html: whiteBaseLayout("Feature Shipped", `
      <div class="card">
        <div class="card-title">${name}, you asked — we built it.</div>
        <p class="card-sub">${desc}</p>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:6px;">NOW LIVE</div>
          <div style="font-size:16px;font-weight:700;color:#1e293b;">${title}</div>
          ${howTo ? `<div style="font-size:13px;color:#475569;margin-top:8px;">${howTo}</div>` : ""}
        </div>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Try It Now →</a>
          <a href="${cUrl}" class="btn btn-gray">Full Changelog</a>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">This feature shipped because users like you spoke up. Keep the ideas coming.</p>
      </div>
    `),
  };
}

export function monthlyProductUpdateEmail(
  firstName?: string,
  monthLabel?: string,
  featuresShipped?: Array<{ title: string; description: string }>,
  bugsFixed?: number,
  comingNext?: string[],
  platformStats?: { jobsTracked?: string; applicationsProcessed?: string; avgResponseRate?: string },
  changelogUrl?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const month = monthLabel || new Date().toLocaleString("en-US", { month: "long", year: "numeric" });
  const features = featuresShipped || [];
  const bugs = bugsFixed ?? 0;
  const coming = comingNext || [];
  const stats = platformStats || {};
  const cUrl = changelogUrl || "https://brilliant-jobs.canny.io/changelog";
  const base = dashboardUrl || DASHBOARD_URL;

  const featuresHtml = features.length > 0
    ? features.map(f => `
        <div style="margin-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#1e293b;">${f.title}</div>
          <div style="font-size:13px;color:#475569;margin-top:2px;">${f.description}</div>
        </div>
      `).join("")
    : `<div style="font-size:13px;color:#94a3b8;">No major feature releases this month.</div>`;

  const statsHtml = (stats.jobsTracked || stats.applicationsProcessed || stats.avgResponseRate)
    ? `<div class="stat-row">
        ${stats.jobsTracked ? `<div class="stat-item"><div class="stat-val">${stats.jobsTracked}</div><div class="stat-label">Jobs Tracked</div></div>` : ""}
        ${stats.applicationsProcessed ? `<div class="stat-item"><div class="stat-val">${stats.applicationsProcessed}</div><div class="stat-label">Applications Sent</div></div>` : ""}
        ${stats.avgResponseRate ? `<div class="stat-item"><div class="stat-val">${stats.avgResponseRate}</div><div class="stat-label">Avg Response Rate</div></div>` : ""}
      </div>`
    : "";

  const comingHtml = coming.length > 0
    ? coming.map(c => `<div style="font-size:13px;color:#475569;padding:4px 0;">&bull; ${c}</div>`).join("")
    : "";

  return {
    subject: `${month} product update — here's what's new`,
    html: whiteBaseLayout("Monthly Product Update", `
      <div class="card">
        <div class="card-title">${month} Update</div>
        <p class="card-sub">${name}, here's what we shipped, fixed, and planned this month.</p>

        ${statsHtml}

        <hr class="divider">

        <div style="margin-bottom:20px;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:12px;">WHAT'S NEW</div>
          ${featuresHtml}
        </div>

        ${bugs > 0 ? `<div style="font-size:13px;color:#475569;margin-bottom:16px;">Plus <strong>${bugs} bug fix${bugs > 1 ? "es" : ""}</strong> shipped this month.</div>` : ""}

        ${comingHtml ? `
        <hr class="divider">
        <div style="margin-bottom:16px;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:10px;">COMING NEXT</div>
          ${comingHtml}
        </div>
        ` : ""}

        <div class="btn-row">
          <a href="${cUrl}" class="btn btn-primary">Full Changelog →</a>
          <a href="${base}" class="btn btn-gray">Open Dashboard</a>
        </div>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from product updates</a></p>`),
  };
}

// ═══════════════════════════════════════════════════════════
// SESSION 15: RE-ENGAGEMENT SEQUENCE EMAILS (White Theme)
// Pod 1 copy: PRODUCTION — Batch 11 delivered 2026-03-01
// White theme design: APPROVED — v6.14
// Marketing classification: unsubscribe required in all variants
// Escalation: 14-day → 30-day → 60-day inactivity
// Suppression: Stops immediately when user logs in (any auth event)
// ═══════════════════════════════════════════════════════════

export function reengagement14dEmail(
  firstName?: string,
  missedJobCount?: number,
  topCompanies?: string[],
  filterNames?: string[],
  lastLoginDate?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const missed = missedJobCount ?? 0;
  const companies = topCompanies || [];
  const filters = filterNames || [];
  const lastLogin = lastLoginDate || "a while ago";
  const base = dashboardUrl || DASHBOARD_URL;

  const companiesHtml = companies.length > 0
    ? companies.slice(0, 5).map(c => `<div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;margin:3px 4px;font-size:12px;font-weight:600;color:#2563eb;">${c}</div>`).join("")
    : "";

  const filtersHtml = filters.length > 0
    ? `<p class="text" style="font-size:13px;">Your saved searches: <strong>${filters.join(", ")}</strong></p>`
    : "";

  return {
    subject: missed > 0
      ? `${missed} new jobs matched while you were away, ${name}`
      : `Your job search paused — here's what you're missing, ${name}`,
    html: whiteBaseLayout("We Noticed You've Been Away", `
      <div class="card">
        <div class="card-title">${name}, your search is on pause.</div>
        <p class="card-sub">It's been about two weeks since your last visit. The job market hasn't slowed down — here's what's been happening.</p>

        ${missed > 0 ? `
        <div class="highlight">
          <div style="font-size:32px;font-weight:700;color:#2563eb;text-align:center;">${missed}</div>
          <div style="font-size:13px;color:#475569;text-align:center;">new jobs matched your filters since ${lastLogin}</div>
        </div>
        ` : ""}

        ${companiesHtml ? `
        <div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:8px;">ACTIVELY HIRING</div>
          ${companiesHtml}
        </div>
        ` : ""}

        ${filtersHtml}

        <p class="text">New roles are being posted daily. The sooner you check in, the sooner you can act on the best matches before they fill.</p>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">See What You've Missed →</a>
        </div>


        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">Taking a break? Keep your data safe for <a href="${STORAGE_FEE_URL}" style="color:#3b82f6;">$5/year</a> — even if you don't log in.</p>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">We'll keep monitoring your filters — but roles move fast.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from re-engagement emails</a></p>`),
  };
}

export function reengagement30dEmail(
  firstName?: string,
  missedJobCount?: number,
  closedJobCount?: number,
  topCompanies?: string[],
  filterNames?: string[],
  avgSalaryRange?: string,
  lastLoginDate?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const missed = missedJobCount ?? 0;
  const closed = closedJobCount ?? 0;
  const companies = topCompanies || [];
  const filters = filterNames || [];
  const salary = avgSalaryRange || "";
  const lastLogin = lastLoginDate || "over a month ago";
  const base = dashboardUrl || DASHBOARD_URL;

  const companiesHtml = companies.length > 0
    ? companies.slice(0, 5).map(c => `<div style="display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;margin:3px 4px;font-size:12px;font-weight:600;color:#2563eb;">${c}</div>`).join("")
    : "";

  return {
    subject: missed > 0
      ? `${name}, ${missed} jobs came and went — ${closed > 0 ? `${closed} already closed` : "some won't last"}`
      : `A month away is a long time in this market, ${name}`,
    html: whiteBaseLayout("Your Job Search Has Been Paused for 30 Days", `
      <div class="card">
        <div class="card-title">${name}, it's been a month.</div>
        <p class="card-sub">Your filters are still running, but you haven't checked in since ${lastLogin}. Here's what the market looked like while you were away.</p>

        <div style="display:flex;justify-content:space-around;text-align:center;margin:20px 0;">
          ${missed > 0 ? `<div><div style="font-size:28px;font-weight:700;color:#2563eb;">${missed}</div><div style="font-size:11px;color:#94a3b8;">Jobs Matched</div></div>` : ""}
          ${closed > 0 ? `<div><div style="font-size:28px;font-weight:700;color:#ef4444;">${closed}</div><div style="font-size:11px;color:#94a3b8;">Already Closed</div></div>` : ""}
          ${salary ? `<div><div style="font-size:28px;font-weight:700;color:#22c55e;">${salary}</div><div style="font-size:11px;color:#94a3b8;">Avg Salary Range</div></div>` : ""}
        </div>

        ${companiesHtml ? `
        <div style="margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:8px;">COMPANIES YOU MISSED</div>
          ${companiesHtml}
        </div>
        ` : ""}

        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:10px;padding:14px;margin:16px 0;">
          <div style="font-size:13px;color:#92400e;">The average high-match listing stays open for 18 days. At 30 days away, you've already missed at least one full cycle of opportunities.</div>
        </div>

        <p class="text">Your account, filters, and resumes are exactly where you left them. One click and you're back.</p>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Resume Your Search →</a>
        </div>


        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">Done searching for now? Pay <a href="${STORAGE_FEE_URL}" style="color:#3b82f6;">$5/year</a> to keep your filters, resumes, and pipeline safe while you're away.</p>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">If your search is on hold for a reason, no worries — we'll be here when you're ready.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from re-engagement emails</a></p>`),
  };
}

export function reengagement60dEmail(
  firstName?: string,
  missedJobCount?: number,
  closedJobCount?: number,
  newCompaniesCount?: number,
  marketTrend?: string,
  filterNames?: string[],
  lastLoginDate?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const missed = missedJobCount ?? 0;
  const closed = closedJobCount ?? 0;
  const newCompanies = newCompaniesCount ?? 0;
  const trend = marketTrend || "Hiring volume is up across most sectors.";
  const filters = filterNames || [];
  const lastLogin = lastLoginDate || "two months ago";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: missed > 0
      ? `${name}, ${missed} jobs have passed — is it time to come back?`
      : `Two months is a long pause, ${name} — the market has shifted`,
    html: whiteBaseLayout("It's Been 60 Days Since Your Last Visit", `
      <div class="card">
        <div class="card-title">${name}, we wanted to check in one last time.</div>
        <p class="card-sub">It's been about two months since you last logged in. We've been quietly tracking opportunities for you this whole time.</p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:16px 0;">
          <div style="font-size:11px;font-weight:700;color:#3b82f6;letter-spacing:0.5px;margin-bottom:14px;">YOUR 60-DAY SNAPSHOT</div>

          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <span style="font-size:13px;color:#64748b;">Jobs matched</span>
            <span style="font-size:13px;font-weight:700;color:#1e293b;">${missed > 0 ? missed : "—"}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <span style="font-size:13px;color:#64748b;">Already closed</span>
            <span style="font-size:13px;font-weight:700;color:#ef4444;">${closed > 0 ? closed : "—"}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <span style="font-size:13px;color:#64748b;">New companies hiring</span>
            <span style="font-size:13px;font-weight:700;color:#1e293b;">${newCompanies > 0 ? newCompanies : "—"}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;">
            <span style="font-size:13px;color:#64748b;">Market trend</span>
            <span style="font-size:13px;font-weight:600;color:#1e293b;">${trend}</span>
          </div>
        </div>

        ${filters.length > 0 ? `<p class="text" style="font-size:13px;">Your filters (<strong>${filters.join(", ")}</strong>) are still active and tracking.</p>` : ""}

        <p class="text">Whether you're ready to dive back in or just want to see what's out there, everything is where you left it — filters, resumes, pipeline. Nothing's been touched.</p>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Pick Up Where You Left Off →</a>
        </div>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin:12px 0;text-align:center;">
          <span style="font-size:12px;color:#1e293b;">⏰ Your account will be archived in <strong>30 days</strong> if you don't log in. Keep your data safe for <a href="${STORAGE_FEE_URL}" style="color:#3b82f6;font-weight:600;">$5/year</a>.</span>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">This is our last check-in before the archive countdown begins.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from re-engagement emails</a></p>`),
  };
}

// ─── v6.77: Archive Warning + Storage Fee Templates ───

const STORAGE_FEE_URL = "https://brilliantjobs.app/dashboard.html#storage-fee";

export function reengagement90dEmail(
  firstName?: string,
  missedJobCount?: number,
  closedJobCount?: number,
  filterNames?: string[],
  lastLoginDate?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const missed = missedJobCount ?? 0;
  const closed = closedJobCount ?? 0;
  const filters = filterNames || [];
  const lastLogin = lastLoginDate || "three months ago";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Final notice: Your Brilliant Jobs account will be archived tomorrow`,
    html: whiteBaseLayout("Your Account Will Be Archived Tomorrow", `
      <div class="card">
        <div class="card-title">⚠️ ${name}, this is your final notice.</div>
        <p class="card-sub">It's been 90 days since you last logged in. Tomorrow, your account will be moved to archive status.</p>

        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:20px;margin:16px 0;">
          <div style="font-size:13px;font-weight:700;color:#dc2626;margin-bottom:8px;">What happens when your account is archived:</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#1e293b;line-height:1.8;">
            <li>Your filters, pipeline, and resumes become <strong>read-only</strong></li>
            <li>Job matching and notifications are <strong>paused</strong></li>
            <li>Your data is preserved for <strong>90 days</strong>, then scheduled for deletion</li>
          </ul>
        </div>

        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin:16px 0;">
          <div style="font-size:13px;font-weight:700;color:#16a34a;margin-bottom:8px;">Two ways to keep your account active:</div>
          <div style="display:flex;gap:12px;margin-top:12px;">
            <div style="flex:1;text-align:center;padding:12px;background:white;border-radius:8px;border:1px solid #e2e8f0;">
              <div style="font-size:20px;font-weight:800;color:#1e293b;">Free</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Just log in</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Resets the 90-day clock</div>
            </div>
            <div style="flex:1;text-align:center;padding:12px;background:white;border-radius:8px;border:2px solid #3b82f6;">
              <div style="font-size:20px;font-weight:800;color:#3b82f6;">$5<span style="font-size:12px;font-weight:400;">/yr</span></div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Storage fee</div>
              <div style="font-size:11px;color:#94a3b8;margin-top:8px;">Keep data safe while away</div>
            </div>
          </div>
        </div>

        ${missed > 0 ? `<p class="text" style="font-size:13px;">While you were away, <strong>${missed} jobs</strong> matched your filters${closed > 0 ? ` and <strong>${closed}</strong> have already closed` : ""}.</p>` : ""}
        ${filters.length > 0 ? `<p class="text" style="font-size:13px;">Your filters (<strong>${filters.join(", ")}</strong>) are still active — for now.</p>` : ""}

        <div class="btn-row" style="gap:12px;">
          <a href="${base}" class="btn btn-primary">Log In Now →</a>
          <a href="${STORAGE_FEE_URL}" class="btn" style="display:inline-block;padding:12px 24px;background:#f1f5f9;color:#1e293b;border-radius:8px;font-weight:600;text-decoration:none;font-size:13px;">Pay $5/yr Storage Fee</a>
        </div>

        <p class="text" style="font-size:12px;color:#dc2626;text-align:center;font-weight:600;margin-top:16px;">Archive happens automatically tomorrow. No action needed to archive — just don't log in.</p>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from re-engagement emails</a></p>`),
  };
}

export function archiveConfirmationEmail(
  firstName?: string,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const base = dashboardUrl || DASHBOARD_URL;

  return {
    subject: `Your Brilliant Jobs account has been archived`,
    html: whiteBaseLayout("Account Archived", `
      <div class="card">
        <div class="card-title">${name}, your account has been archived.</div>
        <p class="card-sub">After 91 days of inactivity, your account has been moved to archive status.</p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin:16px 0;">
          <div style="font-size:13px;font-weight:700;color:#3b82f6;margin-bottom:12px;">What this means:</div>
          <ul style="margin:0;padding-left:18px;font-size:13px;color:#1e293b;line-height:1.8;">
            <li>Your data (filters, resumes, pipeline) is <strong>preserved for 90 days</strong></li>
            <li>Job matching and notifications are <strong>paused</strong></li>
            <li>Log in anytime to <strong>fully reactivate</strong> your account instantly</li>
          </ul>
        </div>

        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin:16px 0;text-align:center;">
          <div style="font-size:13px;color:#1e293b;"><strong>Not ready to come back yet?</strong></div>
          <div style="font-size:13px;color:#64748b;margin-top:4px;">Pay <strong>$5/year</strong> to keep your data safe indefinitely — even while archived.</div>
          <a href="${STORAGE_FEE_URL}" style="display:inline-block;margin-top:12px;padding:10px 20px;background:#3b82f6;color:white;border-radius:8px;font-weight:600;text-decoration:none;font-size:13px;">Pay $5/yr Storage Fee →</a>
        </div>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">Reactivate My Account →</a>
        </div>

        <p class="text" style="font-size:12px;color:#94a3b8;text-align:center;">After 90 days in archive without reactivation or storage payment, your data will be permanently deleted.</p>
      </div>
    `, ``),
  };
}
