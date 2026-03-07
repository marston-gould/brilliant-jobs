// supabase/functions/_shared/email-core.ts
// CS-P1-012 (TS1-6): Core transactional + pipeline + ghost + digest templates
import { baseLayout, utmLink, smsUtmLink, detailRow, salaryDisplay, DASHBOARD_URL, LOGO_TEXT } from "./email-base.ts";

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

export function subscriptionConfirmEmailLegacy(plan: string, amount: string): { subject: string; html: string } {
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
    sms_text: `Brilliant Jobs: New match — ${job.title} at ${job.company}. Reply Y to apply, N to pass. ${smsUtmLink('match_alert')}`,
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
    sms_text: `Brilliant Jobs: Interview stage! ${jobTitle} at ${company}. ${smsUtmLink('interview_scheduled')}`,
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
    sms_text: `Brilliant Jobs: OFFER received! ${jobTitle} at ${company}. ${smsUtmLink('offer_received')}`,
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
    sms_text: `Brilliant Jobs: ${connectionNames.length} connections at ${company} which just posted ${jobTitle}. ${smsUtmLink('network_match')}`,
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

