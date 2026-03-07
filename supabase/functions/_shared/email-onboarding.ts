// supabase/functions/_shared/email-onboarding.ts
// CS-P1-012 (TS1-6): Onboarding drip + adoption + score + interview (white theme)
// TS1-3: whiteBaseLayout now includes @media (prefers-color-scheme: dark) via email-base.ts
import { whiteBaseLayout, utmLink, smsUtmLink, DASHBOARD_URL } from "./email-base.ts";


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
    sms_text: `Interview confirmed: ${title} at ${company}, ${date} at ${time}. ${smsUtmLink('interview_confirmed')}`,
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
    sms_text: `Tomorrow: ${title} interview at ${company}, ${time}. You're ready. ${smsUtmLink('interview_tomorrow')}`,
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
    sms_text: `Interview in 1hr: ${title} at ${company}. ${format}. You've got this. ${smsUtmLink('interview_1hr')}`,
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

