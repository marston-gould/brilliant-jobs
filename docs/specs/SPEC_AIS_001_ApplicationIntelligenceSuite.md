# SPEC-AIS-001: Application Intelligence Suite

**Brilliant Jobs — Comprehensive Feature Specification**
12 Features — 6 Finish + 6 New

| Field | Value |
|-------|-------|
| **Document ID** | SPEC-AIS-001 |
| **Author** | Pod 1 (Marston + Claude) |
| **Date** | March 15, 2026 |
| **Handoff To** | Pod 2 (Engineering) + Pod 3 (UI/UX) |
| **Version Ref** | See VERSION_METHODOLOGY.docx |
| **Session Plan** | See AIS_SESSION_PLAN.md |

---

## 1. Executive Summary

This specification covers 12 features that comprise the Brilliant Jobs Application Intelligence Suite. Six features have existing specs or partial implementations that need to be finished; six are net-new. Together they transform Brilliant Jobs from a job discovery and tracking platform into a full-cycle application intelligence engine.

**Guiding principle:** Every feature in this suite either helps the user apply smarter (scoring, tailoring, gating) or apply faster (auto-fill, bulk apply, auto-apply modes). The suite is designed so features compound: resume scoring feeds tailoring, tailoring feeds auto-apply, auto-apply feeds the pipeline, and pipeline data feeds interview prep.

### 1.1 Feature Inventory

| # | Feature | Type | Status | Primary Pod |
|---|---------|------|--------|-------------|
| 1 | One-Click Resume Tailoring | **FINISH** | SPEC ONLY | Pod 2 (Edge Function pipeline) |
| 2 | LinkedIn Profile Import | **FINISH** | SPEC ONLY | Pod 2 (Edge Function + Storage) |
| 3 | Auto-Apply (Form Filling) | **FINISH** | BUILT (ADMIN) | Pod 3 (Consumer UI gate removal) |
| 4 | AI Application Q&A Answers | **FINISH** | BUILT (ADMIN) | Pod 3 (Consumer UI gate removal) |
| 5 | Application Mode UI (6 Modes) | **FINISH** | SPEC ONLY | Pod 3 (Extension UI) + Pod 2 (Score Gate API) |
| 6 | Review Before Submit | **FINISH** | SPEC ONLY | Pod 3 (Extension popup) |
| 7 | AI Resume Builder | **NEW** | NOT STARTED | Pod 2 (Engine) + Pod 3 (Editor UI) |
| 8 | AI Cover Letter Generator | **NEW** | PARTIAL | Pod 2 (Edge Function) + Pod 3 (UI) |
| 9 | Mass/Bulk Auto-Apply | **NEW** | NOT STARTED | Pod 2 (Queue) + Pod 3 (Selection UI) |
| 10 | LinkedIn Auto-Apply | **NEW** | PARTIAL | Pod 2 (Handler hardening) |
| 11 | AI Interview Practice | **NEW** | NOT STARTED | Pod 2 (AI engine) + Pod 3 (Chat UI) |
| 12 | Resume A/B Testing | **NEW** | NOT STARTED | Pod 2 (Analytics engine) + Pod 3 (UI) |

---

## 2. Architecture Overview

All 12 features share common infrastructure.

### 2.1 Shared Edge Functions

| Function | Exists? | Used By Features |
|----------|---------|-----------------|
| **score-resume** | YES — production, Claude Haiku | #1, #5, #6, #7, #9 |
| **rewrite-resume** | NO — spec only | #1, #5, #7 |
| **answer-form-question** | YES — production, admin-only | #3, #4, #9, #10 |
| **generate-cover-letter** | YES — production, admin-only | #8 |
| **parse-linkedin-pdf** | NO — spec only (PAYL brief) | #2, #7 |
| **interview-practice** | NO — new | #11 |
| **bulk-apply-queue** | NO — new | #9 |

### 2.2 Shared Database Tables

| Table | Exists? | Role |
|-------|---------|------|
| **resume_rewrites** | NO | Stores rewrite versions, diffs, scores. Links resume_id + job_id. |
| **cover_letters** | NO | Generated cover letters with job_id, resume_id, content, version. |
| **linkedin_profiles** | NO | Parsed LinkedIn PDF data. experience_json, skills_array. |
| **bulk_apply_jobs** | NO | Queue table for batch applications. Status: queued/in_progress/done/failed. |
| **interview_sessions** | NO | Practice session history: questions, answers, feedback, scores. |
| **resume_ab_tests** | NO | A/B test definitions: user_id, test_name, variant_a/b_resume_id, status, winner_id. |
| **resume_ab_results** | NO | Per-application outcome tracking: test_id, job_id, variant (a/b), applied_at, response_received, outcome. |
| **pending_applications** | YES | Extension auto-apply tracking. Used by #3, #4, #9, #10. |

### 2.3 Credit Economy

| Action | Credits | API Cost | Margin |
|--------|---------|---------|--------|
| Resume score (per job) | 1 | ~$0.005 | ~96% at $0.13/credit |
| Resume rewrite (full) | 3 | ~$0.026 | ~93% |
| Cover letter generation | 2 | ~$0.015 | ~94% |
| Form Q&A answer (per field) | 0.5 | ~$0.003 | ~95% |
| Interview practice (session) | 3 | ~$0.03 | ~92% |
| Bulk apply (per job) | 0 | N/A | Apply itself is free; scoring/rewriting within bulk flow costs per above |

---

## 3. Feature 1: One-Click Resume Tailoring

**Status:** Spec'd. Not implemented. `rewrite-resume` EF does not exist. `score-resume` EF is production. Interactive Q&A UI not built.

### 3.1 What Needs to Be Built

1. **rewrite-resume Edge Function:** 4-agent pipeline (Gap Analyzer → Question Generator → Resume Rewriter → Quality Checker). Each agent is a separate invocation to stay within 150s Supabase limit. Claude Haiku for gap analysis and question gen; Claude Sonnet for the actual rewrite.
2. **resume_rewrites table:** user_id, resume_id, job_id, original_text, rewritten_text, diff_json, original_score, new_score, credits_charged, status (pending/processing/complete/failed), created_at.
3. **Client-side Q&A panel:** replaces the AI analysis area when active. Progress indicator (stage 1/4 through 4/4), one question at a time, skip/back buttons, conversational tone. Must feel like a career coach, not a form.
4. **Diff preview UI:** side-by-side view with green (added), amber (restructured), red strikethrough (removed). Accept all, cherry-pick per section, or reject with feedback.
5. **DOCX output:** generate downloadable tailored resume. Text-only rewrite for V1 — no layout/formatting changes.
6. **CTA trigger points:** Jobs Feed Match % column (below 85%), Resume Readiness grade card (below A), Job Detail slide-out, Pipeline Saved stage.

### 3.2 Dependencies

- score-resume Edge Function (exists, production)
- Resume text extraction (exists — pdf.js + mammoth.js)
- JD text in ats_jobs.description (exists)
- Credit balance check + deduction system (needs implementation)

### 3.3 Acceptance Criteria

- User clicks 'Boost Match' on a job with < 85% match → Q&A flow starts within 3 seconds
- Q&A generates 1–5 targeted questions based on actual JD gaps, not generic prompts
- Completed rewrite produces a downloadable DOCX with ≥ 15-point average score improvement
- Quality checker catches and rejects any fabricated claims (>95% truthfulness pass rate)
- Total wall-clock time excluding user Q&A: < 20 seconds
- 3 credits deducted on successful completion, 0 on failure

---

## 4. Feature 2: LinkedIn Profile Import

**Status:** Spec'd inside PAYL brief (FB-PAYL-001). Not implemented. No EF, no Storage bucket, no UI. Now decoupled from PAYL — standalone onboarding value.

### 4.1 What Needs to Be Built

7. **parse-linkedin-pdf Edge Function:** accepts PDF upload, extracts structured fields (name, headline, location, experience entries with dates/titles/companies, skills array, education, connection count). Uses Claude Haiku for parsing non-standard PDF layouts.
8. **linkedin_profiles table:** user_id, display_name, headline, location, experience_json, skills_array, education_json, li_connections, pdf_hash (SHA-256 for dedup), raw_pdf_url (Supabase Storage), parsed_at.
9. **Supabase Storage bucket:** `linkedin-profiles` (private, RLS-protected, 10MB max).
10. **Upload UI on Setup page:** drag-and-drop or file picker. Shows parsed profile preview for user confirmation before saving. Clear error messaging for non-LinkedIn PDFs or parse failures.
11. **Profile auto-population:** parsed data pre-fills user profile fields, suggests filter keywords based on extracted skills, infers seniority level from experience history.

### 4.2 Fraud Signals

- PDF hash dedup: same file cannot be used by multiple accounts
- Connection count < 50: flag for manual review
- Parse failure or non-LinkedIn PDF format: reject with clear error
- Experience entries with zero dates or entirely blank sections: flag

### 4.3 Standalone Value (Decoupled from PAYL)

- Onboarding acceleration: one upload replaces 10 minutes of manual profile setup
- Resume bootstrapping: experience and skills data can seed an AI-generated resume (Feature 7)
- Filter suggestions: extracted skills map to recommended search filters
- Network intelligence: connection count feeds the extension's network matching

---

## 5. Feature 3: Auto-Apply (Form Filling)

**Status:** Built and functional in extension v2.17.0, but admin-only. 15 ATS handlers (Greenhouse legacy + React, Lever, Ashby, Workable, Recruitee, LinkedIn Easy Apply, Indeed, Workday, iCIMS, Taleo, SmartRecruiters, Avature, generic fallback). Serialized FieldFillerQueue, AI-powered question answering, real-time application tracking. Non-admin users cannot access any of this.

### 5.1 What Needs to Be Built

12. **Consumer UI gate:** remove the admin-only check on auto-fill functionality. The tier gate (tierGate.js) already enforces Free = 0/day, Starter = 5/day, Pro = unlimited. This is the access control — not the admin flag.
13. **Application Mode integration:** auto-fill behavior must respect the user's selected Application Mode (Feature 5). Manual mode = no auto-fill. Score-Gated mode = auto-fill only after score check popup. Auto Apply mode = fill immediately.
14. **Fill status dashboard panel:** surface the extension's real-time fill progress/success/error overlay data in the dashboard's Applications page. Currently this data exists only in the extension's inject-overlay.js.
15. **Error recovery UI:** when a fill fails (dropdown mismatch, file upload error, CAPTCHA), surface actionable guidance. Currently errors are logged to PostHog but not shown to the user in a recoverable way.

### 5.2 Risk: Anti-Detection

The extension already has per-user fingerprinted builds (randomized channel names, CSS classes, manifest metadata, dead-code injection). LinkedIn and Indeed have increasingly aggressive bot detection. The consumer launch must include:

- **Rate limiting:** configurable delay between applications (default 45–90 seconds, randomized)
- **Session limits:** max applications per session (default 25) with cool-down period
- **Human-sim typing:** already built, ensure it's active on all consumer paths
- **Failure circuit breaker:** after 3 consecutive failures on one platform, pause and alert user

---

## 6. Feature 4: AI Application Q&A Answers

**Status:** Built and functional. aiAnswerer.js module + answer-form-question Edge Function. 7-day answer cache (200 entries). Admin-only. Same gate removal as Feature 3.

### 6.1 What Needs to Be Built

16. **Consumer access:** same gate removal as Feature 3. Tier-gated, not admin-gated.
17. **Answer review mode:** for Score-Gated and manual modes, show the AI-generated answer to the user BEFORE submitting. User can edit, accept, or regenerate. Currently answers are auto-filled without review.
18. **Answer quality feedback:** after submission, allow user to rate answer quality (thumbs up/down). PostHog event: `ai_answer_feedback`.
19. **Answer history:** store generated answers in a new `answers` table (user_id, job_id, field_label, generated_answer, user_edited_answer, feedback, created_at). Currently answers exist only in the extension's local cache.
20. **Personal context integration:** answers should reference the user's parsed LinkedIn profile (Feature 2) and resume content for more personalized responses.

### 6.2 Credit Model

Each AI-generated answer costs 0.5 credits. Cached answers (identical field label + similar job title) are free. A typical application with 3–5 custom questions costs 1.5–2.5 credits in AI answers.

---

## 7. Feature 5: Application Mode UI (6 Modes)

**Status:** Full spec delivered. Interactive HTML prototype produced. 10-section Word handoff doc delivered. Pod 3 has not started implementation.

### 7.1 Mode Reference

| Mode | Behavior | Risk | Tier |
|------|----------|------|------|
| **Manual** | No interception. Save-to-pipeline button only. | Low | Free |
| **Score-Gated** | Intercepts apply click. Shadow DOM popup with resume score. Offers rewrite if below threshold. User decides. | Low | Pro |
| **Auto Apply** | Submits current resume as-is on apply click. No scoring. | Moderate | Pro |
| **Auto+Score Gate** | Auto-submits if score ≥ threshold. Offers rewrite review if below. | Moderate | Pro |
| **Auto Rewrite** | Auto-rewrites and submits below-threshold resumes without review. | Aggressive | Pro |
| **Full Autopilot** | Rewrites and submits every application automatically regardless of score. | Aggressive | Pro |

### 7.2 What Needs to Be Built

21. **Extension popup mode selector:** radio card UI (already prototyped in HTML). Mode persists in chrome.storage.sync for cross-device roaming.
22. **Content script:** 'Save to BJ Pipeline' button injection on job listing pages using per-site DOM selectors. job-sites.json config file with CSS selectors per ATS platform.
23. **Apply button interception:** detect native apply button clicks, route through mode logic before allowing submission.
24. **Shadow DOM score gate popup:** overlay showing match score, JD gap analysis, rewrite CTA. Must render in Shadow DOM to avoid CSS conflicts with host page.
25. **Admin/consumer toggle:** admins see both the new consumer view and the legacy admin view. Non-admins see only the consumer view.
26. **Dashboard sync:** selected mode visible on the Applications page. Mode can be changed from either the extension popup or the dashboard.

### 7.3 Dependencies

- Feature 1 (Resume Tailoring) — rewrite-resume Edge Function required for modes 4–6
- Feature 3 (Auto-Apply) — consumer gate removal required for modes 2–6
- score-resume Edge Function — required for modes 2, 4, 5, 6

---

## 8. Feature 6: Review Before Submit

**Status:** Spec'd as part of Application Modes (Feature 5). Not implemented.

### 8.1 What Needs to Be Built

27. **Pre-submit review panel:** before any application is submitted (in Score-Gated or Auto+Score Gate modes), show a confirmation screen with: job title, company, match score, resume being submitted (with version if tailored), AI-generated answers for custom questions (editable), cover letter (if generated).
28. **Edit-in-place:** user can modify AI answers, swap resume version, or regenerate cover letter from the review panel without leaving the page.
29. **Submit/Cancel/Save for Later:** three clear actions. Submit fires the auto-fill. Cancel aborts. Save for Later adds to a 'Review Queue' in the dashboard.
30. **Review Queue on Applications page:** jobs parked in review state. Accessible from dashboard for users who want to review at their desk rather than in-context on the job site.

### 8.2 UX Principle

The review panel is the trust mechanism. Users who enable auto-apply modes need confidence that nothing goes out without their awareness. The panel shows exactly what will be submitted and gives them a last-chance edit. For Full Autopilot users, the review is skipped but a post-submit notification provides retroactive visibility.

---

## 9. Feature 7: AI Resume Builder

**Status:** NOT STARTED. No spec, no code, no prior work. The resume rewrite system (Feature 1) optimizes an existing resume; this feature creates one from scratch.

### 9.1 Concept

A guided resume creation flow that produces a professional, ATS-optimized resume from raw inputs: LinkedIn profile data (Feature 2), work history responses, and target role/industry. NOT a template editor — an AI-driven generation tool that produces a complete, scored resume in one flow.

### 9.2 What Needs to Be Built

31. **Input collection wizard:** 4–6 screens collecting target role, industry, years of experience, key accomplishments (free-text), skills, education. If LinkedIn profile exists (Feature 2), pre-fill all fields from parsed data.
32. **Resume generation Edge Function:** takes collected inputs + optional LinkedIn data + target filter keywords. Produces ATS-optimized resume text. Uses Claude Sonnet for quality. Returns structured sections (summary, experience, skills, education).
33. **Template engine:** 3–5 clean ATS-friendly templates (no graphics, no columns, no headers/footers that ATS parsers choke on). Templates are CSS-driven for web preview, with DOCX export.
34. **Live score preview:** as the resume is generated, show the projected match score against the user's active filters. If score is below threshold, offer one-click optimization suggestions.
35. **Section editor:** post-generation, user can edit individual sections. Each edit triggers a re-score to show impact.
36. **DOCX + PDF export:** downloadable in both formats. PDF via headless rendering of the web preview.

### 9.3 How It Differs from Feature 1

| Dimension | Feature 1 (Tailoring) | Feature 7 (Builder) |
|-----------|----------------------|---------------------|
| **Input** | Existing resume + specific JD | LinkedIn data + work history + target role |
| **Output** | Modified version of existing resume | Net-new complete resume |
| **When** | Per-job, when match score is low | Once, during onboarding or filter creation |
| **Credits** | 3 per rewrite | 5 per generation |

### 9.4 Tier Gating

- Free: 1 resume generation (onboarding hook)
- Pro: unlimited generations
- PAYL: same as Pro

---

## 10. Feature 8: AI Cover Letter Generator

**Status:** PARTIAL. `generate-cover-letter` Edge Function exists in the extension codebase (admin-only). No standalone UI, no dashboard integration, no user-facing flow.

### 10.1 What Needs to Be Built

37. **Cover letter UI on Applications page:** slide-out panel on job apply or 'Generate Cover Letter'. User can edit, regenerate with different tone, or accept.
38. **Tone selector:** Professional, Conversational, Enthusiastic, Executive. Each produces a meaningfully different letter.
39. **Context inputs:** uses resume text + JD + company info (from ats_companies enrichment) + user's LinkedIn profile (if available).
40. **cover_letters table:** user_id, job_id, resume_id, tone, content, version, ai_score, credits_charged, created_at.
41. **Version history:** each regeneration creates a new version. User can compare and select.
42. **Auto-attach in apply flow:** when auto-apply or bulk apply runs, if a cover letter exists for that job, attach it. Paste into cover letter fields in ATS form.
43. **DOCX export:** downloadable cover letter matching the resume template style.

### 10.2 Integration with Auto-Apply

For auto-apply modes, the cover letter can be auto-generated at apply time if the user has enabled 'Auto-generate cover letters' in their Application Mode settings. Costs 2 additional credits per application. Generated letters are cached so re-applications to the same company reuse them.

---

## 11. Feature 9: Mass/Bulk Auto-Apply

**Status:** NOT STARTED. The dashboard copy references 'apply in bulk' and the extension supports sequential form-fills, but there is no batch selection UI, no queue management, and no progress tracking.

### 11.1 What Needs to Be Built

44. **Multi-select on Jobs Feed:** checkbox column on each job card. 'Select All Matching' button. Selection count badge in toolbar.
45. **Bulk action bar:** appears when ≥ 1 job is selected. Actions: 'Apply to Selected' (primary), 'Save Selected to Pipeline', 'Generate Cover Letters for Selected'. Shows selected count and estimated credit cost.
46. **bulk_apply_jobs table:** user_id, job_id, resume_id, cover_letter_id (optional), status (queued/scoring/rewriting/filling/submitted/failed), error_message, queued_at, started_at, completed_at.
47. **Queue processor EF (bulk-apply-queue):** processes jobs sequentially with configurable delay (45–90s randomized). Respects session limits (max 25/session). Handles failures with retry logic (max 2 retries per job).
48. **Progress dashboard:** real-time progress bar on Applications page. Per-job status indicators: queued (gray), in progress (blue pulse), submitted (green check), failed (red x with error). Clickable to view details.
49. **Score gate integration:** if user's Application Mode includes score-gating, each job in the batch is scored first. Jobs below threshold are flagged for review rather than auto-submitted.

### 11.2 Safety Controls

- **Daily limit:** configurable max applications per day (default 50 for Pro, 10 for Starter)
- **Platform spacing:** minimum 60 seconds between applications to the same ATS platform
- **Duplicate detection:** skip jobs where user has already applied (check pending_applications table)
- **Cool-down period:** after a bulk session, enforce a 30-minute cool-down before the next batch
- **Undo window:** 10-second 'Cancel All Remaining' option after bulk apply starts

---

## 12. Feature 10: LinkedIn Auto-Apply

**Status:** PARTIAL. LinkedIn Easy Apply is one of the 15 ATS handlers in the extension. Works for admin users. Needs hardening for consumer-scale use, anti-detection improvements, and Application Mode integration.

### 12.1 What Needs to Be Built

50. **LinkedIn Easy Apply handler hardening:** randomized interaction delays (scroll pauses, field focus delays, tab switches), viewport-aware interactions, session cookie management.
51. **Multi-step Easy Apply support:** LinkedIn Easy Apply forms can span 1–6 pages. Detect page transitions, fill each page, handle the 'Review' step before final submit.
52. **LinkedIn-specific Q&A:** Easy Apply forms frequently include custom screening questions. aiAnswerer.js integration must be tested and optimized for LinkedIn's specific question patterns.
53. **Profile data sync:** if user has imported their LinkedIn profile (Feature 2), use it to pre-fill LinkedIn-specific fields with exact matches to their LinkedIn profile, reducing detection risk.
54. **Connection awareness:** before applying, check if the user has connections at the company. If yes, surface a 'You know people here' prompt with the option to reach out before applying.

### 12.2 LinkedIn-Specific Risks

- **Account restriction:** LinkedIn actively restricts accounts that apply too frequently. Enforce max 15 Easy Apply applications per day per account.
- **CAPTCHA/verification:** LinkedIn may trigger verification challenges. Detect and pause, alerting the user to complete manually.
- **Profile visibility:** applying signals activity to LinkedIn's algorithm. Users should be aware their profile may get more views (benefit for most users).

---

## 13. Feature 11: AI Interview Practice

**Status:** NOT STARTED. No spec, no code, no prior discussion. Entirely new feature.

### 13.1 Concept

An AI-powered mock interview system that generates role-specific questions based on the JD, the user's resume, and common interview patterns for the industry/level. Simulates a real interview with follow-up questions, then provides structured feedback on answer quality, communication patterns, and content gaps.

### 13.2 What Needs to Be Built

55. **Interview session types:** three modes — (a) General behavioral (STAR method coaching), (b) Role-specific technical (based on JD requirements), (c) Company-specific (uses company data from ats_companies to ask about mission, products, culture fit).
56. **interview-practice Edge Function:** accepts session_type, job_id, resume_id. Generates 5–10 questions tailored to the role. For each user answer, generates follow-up questions and real-time feedback. Uses Claude Sonnet.
57. **Chat-based UI:** new page or slide-out panel on the Pipeline page (contextual — practice for a specific job you're interviewing for). Chat interface with AI interviewer asking questions one at a time. User types their answer. AI responds with follow-up or moves to next question.
58. **Feedback system:** after each answer, show: strength assessment (what was good), gap assessment (what was missing), suggested improvement (rewrite of a stronger answer), STAR structure check. After the full session, show aggregate scores across dimensions.
59. **interview_sessions table:** user_id, job_id, session_type, questions_json, answers_json, feedback_json, aggregate_score, duration_seconds, created_at.
60. **Session history:** users can review past practice sessions, track improvement over time, and re-practice specific questions they scored low on.
61. **Pipeline integration:** when a pipeline entry reaches the 'Interview' stage, auto-prompt the user to practice. Show a 'Practice for this interview' CTA on the Pipeline card.

### 13.3 Question Generation Logic

Questions are generated from three sources, weighted by session type:

- **JD analysis (50%):** extract required skills, experience, and responsibilities. Generate questions that probe for evidence of each.
- **Resume gap analysis (30%):** identify gaps between resume and JD. Generate questions that a real interviewer would ask to probe those gaps.
- **Industry patterns (20%):** common interview questions for the role type, level, and industry.

### 13.4 Scoring Dimensions

| Dimension | What's Evaluated | Weight |
|-----------|-----------------|--------|
| **Relevance** | Does the answer address the actual question asked? | 25% |
| **Specificity** | Does it include concrete examples, metrics, and outcomes? | 25% |
| **Structure** | STAR format for behavioral; clear problem/approach/result for technical | 20% |
| **JD Alignment** | Does the answer demonstrate skills/experience the JD requires? | 20% |
| **Communication** | Clarity, conciseness, professional tone | 10% |

---

## 14. Feature 12: Resume A/B Testing

**Status:** NOT STARTED. No spec, no code. Inspired by LoopCV's approach of sending different resume versions to similar jobs and measuring which version gets more responses.

### 14.1 Concept

Users assign two resume variants to the same filter. The system alternates which version gets submitted when auto-apply or bulk apply runs. Over time, response rates reveal which resume performs better for that job category. Turns resume optimization from guesswork into a measured experiment.

### 14.2 What Needs to Be Built

62. **Test creation UI on Resumes page:** user selects two resumes and assigns them to a filter. System creates an A/B test with a name, start date, and minimum sample size (default 20 applications per variant).
63. **resume_ab_tests table:** user_id, test_name, filter_id, variant_a_resume_id, variant_b_resume_id, status (active/paused/completed), winner_id (null until declared), min_sample_size, created_at, completed_at.
64. **resume_ab_results table:** test_id, job_id, variant (a/b), resume_id, applied_at, response_received (boolean), response_at, outcome (no_response/rejected/interview/offer), days_to_response.
65. **Alternating assignment logic:** when auto-apply, bulk apply, or manual apply fires for a job matching the test's filter, the system checks which variant is 'due' next (round-robin or weighted random). The selected resume is submitted and the assignment is logged.
66. **Results dashboard:** card on the Resumes page showing each active test. Per-variant metrics: applications sent, responses received, response rate (%), average days to response, interview rate, statistical significance indicator (chi-squared or Fisher's exact test). Visual bar chart comparing the two variants.
67. **Auto-winner declaration:** when both variants reach minimum sample size AND one variant has a statistically significant advantage (p < 0.05), the system declares a winner, notifies the user, and offers to set the winner as the default resume for that filter.
68. **Manual override:** user can pause, end, or swap variants at any time. Ending a test early flags the results as inconclusive.

### 14.3 Integration Points

- Feature 1 (Resume Tailoring): natural source of Variant B
- Feature 3/9 (Auto-Apply / Bulk Apply): assignment engine hooks into the apply flow
- Feature 5 (Application Modes): all modes that auto-select a resume must check for active A/B tests
- Pipeline tracking: response outcomes flow from Pipeline stage changes into resume_ab_results automatically

### 14.4 Statistical Rigor

- Minimum 10 applications per variant before showing any comparison metrics
- Minimum 20 per variant before statistical significance testing activates
- Clear 'Not enough data yet' messaging when sample is small
- Response rate displayed with confidence interval, not just a point estimate
- Warning when comparing variants with very different job quality (detected via company size or salary range divergence)

### 14.5 Tier Gating

- Free: no A/B testing
- Pro: 1 active test at a time
- PAYL: 1 active test at a time

---

## 15. Implementation Sequence

Features are ordered by dependency chain and value delivery. Critical path: Features 3/4 (gate removal) → Feature 1 (rewrite engine) → Feature 5 (modes) → Features 6/9 (review + bulk).

### Phase A: Foundation (Weeks 1–2)

Unlock existing functionality for consumers. Highest ROI, lowest effort.

- Feature 3: Auto-Apply consumer gate removal + tier enforcement
- Feature 4: AI Q&A consumer gate removal + answer review mode
- Feature 2: LinkedIn Profile Import (standalone, decoupled from PAYL)

### Phase B: Intelligence Engine (Weeks 3–4)

Build the AI backend that powers everything else.

- Feature 1: Resume Tailoring Edge Function pipeline (rewrite-resume)
- Feature 8: Cover Letter Generator (wrap existing Edge Function)
- Credit balance system + deduction infrastructure

### Phase C: Application Modes (Weeks 5–6)

The consumer-facing experience that ties intelligence to action.

- Feature 5: Application Mode UI (6 modes, popup, content script injection, score gate popup)
- Feature 6: Review Before Submit (interception panel)

### Phase D: Scale + New (Weeks 7–11)

Higher-complexity features that build on the complete foundation.

- Feature 9: Mass/Bulk Auto-Apply (queue, progress dashboard, safety controls)
- Feature 10: LinkedIn Auto-Apply hardening
- Feature 7: AI Resume Builder (wizard, generation, templates)
- Feature 11: AI Interview Practice (chat UI, feedback system)
- Feature 12: Resume A/B Testing (test engine, results dashboard, auto-winner declaration)

### Dependency Graph

| Feature | Hard Dependencies | Soft Dependencies |
|---------|------------------|------------------|
| #1 Tailoring | score-resume (exists) | #2 LinkedIn (richer context) |
| #2 LinkedIn Import | None | None |
| #3 Auto-Apply | None (built, needs gate removal) | #5 Application Modes |
| #4 AI Q&A | None (built, needs gate removal) | #2 LinkedIn (context) |
| #5 App Modes | #3 (gate removal), #1 (rewrite for modes 4–6) | #6 Review panel |
| #6 Review | #5 App Modes | #8 Cover Letter (attach) |
| #7 Resume Builder | None (standalone) | #2 LinkedIn (pre-fill) |
| #8 Cover Letter | None (EF exists) | #2 LinkedIn, #1 Tailoring |
| #9 Bulk Apply | #3 Auto-Apply, #5 App Modes | #1 Tailoring, #8 Cover Letter |
| #10 LinkedIn Apply | #3 Auto-Apply | #2 LinkedIn (profile sync) |
| #11 Interview Practice | None (standalone) | #2 LinkedIn (context) |
| #12 Resume A/B Testing | #3 Auto-Apply or #9 Bulk Apply | #1 Tailoring (variant source), Pipeline (outcome data) |

---

## 16. Effort Estimates

| # | Feature | Pod 2 | Pod 3 | Total | Phase |
|---|---------|-------|-------|-------|-------|
| 1 | Resume Tailoring | 8d | 5d | 13d | B (Weeks 3–4) |
| 2 | LinkedIn Import | 4d | 3d | 7d | A (Weeks 1–2) |
| 3 | Auto-Apply (gate) | 1d | 2d | 3d | A (Weeks 1–2) |
| 4 | AI Q&A (gate) | 1d | 3d | 4d | A (Weeks 1–2) |
| 5 | Application Modes | 3d | 8d | 11d | C (Weeks 5–6) |
| 6 | Review Before Submit | 1d | 4d | 5d | C (Weeks 5–6) |
| 7 | Resume Builder | 6d | 8d | 14d | D (Weeks 7–10) |
| 8 | Cover Letter Gen | 3d | 4d | 7d | B (Weeks 3–4) |
| 9 | Bulk Apply | 5d | 6d | 11d | D (Weeks 7–10) |
| 10 | LinkedIn Apply | 4d | 2d | 6d | D (Weeks 7–10) |
| 11 | Interview Practice | 5d | 6d | 11d | D (Weeks 7–11) |
| 12 | Resume A/B Testing | 4d | 5d | 9d | D (Weeks 7–11) |
| | **TOTAL** | **45d** | **56d** | **101d** | **~11 weeks** |

---

## 17. PostHog Event Catalog

All new events follow the existing snake_case verb-noun pattern.

| Event | Feature # | Properties |
|-------|-----------|------------|
| resume_rewrite_started | 1 | job_id, resume_id, original_score, mode (manual/auto) |
| resume_rewrite_completed | 1 | job_id, resume_id, original_score, new_score, credits_charged |
| resume_rewrite_qa_skipped | 1 | question_index, question_type |
| linkedin_pdf_uploaded | 2 | file_size, parse_success, fields_extracted_count |
| auto_apply_consumer_triggered | 3 | platform, job_id, mode, tier |
| ai_answer_generated | 4 | job_id, field_label, cached, credits_charged |
| ai_answer_feedback | 4 | job_id, field_label, rating (up/down) |
| application_mode_changed | 5 | old_mode, new_mode, source (extension/dashboard) |
| score_gate_shown | 5 | job_id, score, threshold, user_action (apply/rewrite/cancel) |
| review_panel_shown | 6 | job_id, resume_version, has_cover_letter, user_action |
| resume_built_from_scratch | 7 | source (linkedin/manual), template, initial_score |
| cover_letter_generated | 8 | job_id, tone, version, credits_charged |
| bulk_apply_started | 9 | job_count, mode, estimated_credits |
| bulk_apply_completed | 9 | jobs_submitted, jobs_failed, jobs_skipped, duration_seconds |
| linkedin_easy_apply_triggered | 10 | job_id, steps_count, connections_at_company |
| interview_practice_started | 11 | job_id, session_type, question_count |
| interview_practice_completed | 11 | job_id, aggregate_score, duration_seconds, questions_answered |
| resume_ab_test_created | 12 | test_name, filter_id, variant_a_id, variant_b_id, min_sample_size |
| resume_ab_variant_assigned | 12 | test_id, job_id, variant (a/b), resume_id |
| resume_ab_winner_declared | 12 | test_id, winner_variant, p_value, sample_size_a, sample_size_b |

---

## 18. Scope Boundaries

### IN Scope

- All 12 features as described above
- Credit economy infrastructure (balance tracking, deduction, top-up)
- Tier gating enforcement across all features (Free/Starter/Pro/PAYL)
- PostHog instrumentation for all new events
- RLS on all new Supabase tables
- Error handling and failure recovery for all AI operations

### OUT of Scope

- Voice-based interview practice (text-only for V1)
- Video interview practice/recording
- Resume visual design editor (drag-and-drop sections, custom fonts, margins)
- Third-party ATS submission APIs (we auto-fill the form, not call their API)
- Mobile app (extension is Chrome desktop only)
- Batch resume rewriting across all saved jobs (V1 is single-job rewrite)
- A/B testing for AI prompt variants (Feature 12 is resume A/B testing, not prompt A/B testing)
- Multi-language resume/cover letter generation

---

## 19. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Resume rewrite adoption | > 40% of Pro | rewrite_started / pro_users within 30 days |
| Score improvement | > 15 pts avg | AVG(new_score - original_score) from resume_rewrites |
| Auto-apply adoption | > 25% of Pro | Users with application_mode != 'manual' |
| Bulk apply usage | > 5 jobs/session | AVG(job_count) from bulk_apply_started events |
| Cover letter attach rate | > 30% | Applications with cover_letter_id / total applications |
| Interview practice sessions | > 2 per user | COUNT(interview_sessions) / active_users per month |
| AI Q&A accuracy | > 80% thumbs up | ai_answer_feedback rating=up / total feedback |
| LinkedIn import conversion | > 50% complete | Users completing profile preview / upload attempts |
| A/B test completion rate | > 60% | Tests reaching min_sample_size / tests created |
| A/B winner response lift | > 5% absolute | Winner response_rate - loser response_rate |
| Credit revenue | Track monthly | SUM(credits_charged) * credit_price across all AI features |
| Free → Pro conversion | > 8% lift | Upgrade rate from users who hit credit/feature gate |

---

*End of specification. All features reference VERSION_METHODOLOGY.docx for versioning discipline. Session plan: see AIS_SESSION_PLAN.md.*
