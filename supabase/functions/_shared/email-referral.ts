// supabase/functions/_shared/email-referral.ts
// CS-P1-012 (TS1-6): Referral program email templates
import { whiteBaseLayout, utmLink, DASHBOARD_URL } from "./email-base.ts";

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

