// supabase/functions/_shared/email-credits.ts
// CS-P1-012 (TS1-6): Credit management + upgrade + resume + apply flow templates
import { baseLayout, utmLink, smsUtmLink, detailRow, DASHBOARD_URL } from "./email-base.ts";

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
    sms_text: `Brilliant Jobs: Resume rewritten for ${jobTitle} at ${company} (${beforeScore}→${afterScore}). ${smsUtmLink('resume_rewrite')}`,
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
    sms_text: `Brilliant Jobs: Bulk apply done — ${totalSubmitted} submitted, ${totalSkipped} skipped, ${totalFailed} failed. ${smsUtmLink('bulk_apply_complete')}`,
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
