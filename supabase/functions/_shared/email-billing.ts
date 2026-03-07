// supabase/functions/_shared/email-billing.ts
// CS-P1-012 (TS1-6): Billing, subscription, and payment email templates
import { whiteBaseLayout, utmLink, DASHBOARD_URL } from "./email-base.ts";

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

