// supabase/functions/_shared/email-engagement.ts
// CS-P1-012 (TS1-6): Marketing, feedback, community, and re-engagement templates
import { whiteBaseLayout, baseLayout, utmLink, salaryDisplay, DASHBOARD_URL } from "./email-base.ts";

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



// ---- Passive High-Bar Alert ----
export function passiveHighBarAlertEmail(
  firstName: string | undefined,
  jobTitle: string,
  companyName: string,
  matchScore: number,
  salaryDisplay: string | undefined,
  ghostScore: number | undefined,
  dashboardUrl?: string
): { subject: string; html: string } {
  const name = firstName || "there";
  const base = dashboardUrl || DASHBOARD_URL;
  const scoreColor = matchScore >= 90 ? "#22c55e" : matchScore >= 80 ? "#3b82f6" : "#f59e0b";
  const ghostDisplay = typeof ghostScore === "number"
    ? `${Math.round(ghostScore * 100)}%`
    : "—";

  return {
    subject: `This one is worth your time.`,
    html: baseLayout("A Job Worth Your Time", `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;">
          <div>
            <div class="card-title" style="margin-bottom:4px;">${jobTitle}</div>
            <div style="font-size:14px;color:#64748b;">${companyName}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:800;color:${scoreColor};line-height:1;">${matchScore}%</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;">match</div>
          </div>
        </div>

        <hr class="divider">

        <div style="margin:16px 0;">
          ${salaryDisplay ? `
          <div class="detail-row">
            <span class="detail-label">Salary</span>
            <span class="detail-value salary">${salaryDisplay}</span>
          </div>` : ""}
          <div class="detail-row">
            <span class="detail-label">Company response rate</span>
            <span class="detail-value">${ghostDisplay}</span>
          </div>
        </div>

        <div style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:10px;padding:14px 16px;margin:16px 0;">
          <div style="font-size:12px;color:#94a3b8;margin-bottom:4px;">Why you're seeing this in Passive Mode</div>
          <div style="font-size:13px;color:#f0f1f3;line-height:1.5;">This job cleared every threshold you set — match score, salary floor, and quality filters. You told us to only interrupt you for the real ones.</div>
        </div>

        <div class="btn-row">
          <a href="${base}" class="btn btn-primary">View Job →</a>
        </div>
      </div>
    `, `<p><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;">Unsubscribe from passive job alerts</a></p>`)
  };
}

